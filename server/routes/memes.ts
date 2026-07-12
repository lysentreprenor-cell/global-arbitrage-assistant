/**
 * 📢 REKLAMA — biblioteka memów i twórca reklam Gadacza.
 *
 * Co umie:
 *  - przechowywać memy (obrazek + podpis) — także zrzuty z ekranu TELEFONU
 *    („zapisz tego mema" w aplikacji Gadacz),
 *  - PRZERABIAĆ memy: AI patrzy na obrazek, rozumie żart i proponuje nowe
 *    teksty w tym samym stylu (memy na podstawie memów),
 *  - pisać REKLAMY: slogany, post na Facebooka, ogłoszenie sprzedażowe.
 *
 * Składanie obrazka (tekst na zdjęciu) robi PRZEGLĄDARKA na canvasie w zakładce
 * Reklama — serwer trzyma dane i myśli, nie maluje.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const router = Router();

// ── Ten sam PIN co bot i Gadacz (pin.json) — biblioteka memów to prywatne dane.
const PIN_FILE = path.resolve(process.cwd(), "data", "pin.json");
function pinHash(pin: string): string {
  return crypto.createHash("sha256").update("bot-pin-v1:" + pin).digest("hex");
}
function loadPinHash(): string | null {
  try { return JSON.parse(fs.readFileSync(PIN_FILE, "utf8")).hash ?? null; } catch { return null; }
}
function pinOk(given: unknown, storedHash: string): boolean {
  try {
    const a = Buffer.from(pinHash(String(given ?? "")), "hex");
    const b = Buffer.from(storedHash, "hex");
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch { return false; }
}
router.use((req: Request, res: Response, next: NextFunction) => {
  const cur = loadPinHash();
  if (!cur) return next();
  if (pinOk(req.headers["x-bot-pin"], cur)) return next();
  res.status(401).json({ error: "Wymagany PIN aplikacji" });
});

// ── Magazyn memów — JSON na dysku, jak pamięć Gadacza. Obrazki jako base64 JPEG,
// zmniejszone PRZED wysłaniem (przeglądarka/telefon), więc ~60 sztuk to wciąż mało.
const MEMES_FILE = path.resolve(process.cwd(), "data", "gadacz_memy.json");
type Meme = { id: string; name: string; caption: string; img: string; mediaType: string; source: string; t: string };
function loadMemes(): Meme[] {
  try { return JSON.parse(fs.readFileSync(MEMES_FILE, "utf8")); } catch { return []; }
}
function saveMemes(m: Meme[]) {
  try {
    fs.mkdirSync(path.dirname(MEMES_FILE), { recursive: true });
    fs.writeFileSync(MEMES_FILE, JSON.stringify(m.slice(-60)));
  } catch { /* ignore */ }
}

// GET /api/memes — cała biblioteka; ?meta=1 → bez obrazków (lekka lista dla telefonu)
router.get("/", (req: Request, res: Response) => {
  const all = loadMemes();
  if (req.query.meta) return res.json({ memes: all.map(({ img: _img, ...rest }) => rest) });
  res.json({ memes: all });
});

// POST /api/memes {imageBase64, name?, caption?, mediaType?, source?} — zapisz mema
router.post("/", (req: Request, res: Response) => {
  const img = String(req.body?.imageBase64 ?? "");
  if (img.length < 100) return res.status(400).json({ error: "Brak obrazka" });
  if (img.length > 2_500_000) return res.status(400).json({ error: "Obrazek za duży — zmniejsz przed wysłaniem" });
  const m: Meme = {
    id: crypto.randomUUID().slice(0, 8),
    name: String(req.body?.name ?? "mem").slice(0, 80),
    caption: String(req.body?.caption ?? "").slice(0, 500),
    img,
    mediaType: String(req.body?.mediaType ?? "image/jpeg").slice(0, 40),
    source: String(req.body?.source ?? "www").slice(0, 30),
    t: new Date().toISOString(),
  };
  const all = loadMemes();
  all.push(m);
  saveMemes(all);
  res.json({ ok: true, id: m.id, count: all.length });
});

router.post("/delete", (req: Request, res: Response) => {
  const id = String(req.body?.id ?? "");
  const all = loadMemes();
  const left = all.filter(m => m.id !== id);
  if (left.length === all.length) return res.status(404).json({ error: "Nie ma takiego mema" });
  saveMemes(left);
  res.json({ ok: true, count: left.length });
});

// ── Wspólny strzał do AI ze ścisłym JSON-em w odpowiedzi.
async function askAI(key: string, content: any[], maxTokens: number): Promise<any> {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: maxTokens,
      messages: [{ role: "user", content }],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const d = await r.json() as any;
  if (d.error) throw new Error(d.error.message ?? "Błąd AI");
  const raw = (d.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join(" ").trim();
  const s = raw.indexOf("{"); const e = raw.lastIndexOf("}");
  if (s < 0 || e <= s) throw new Error("AI nie zwróciło poprawnej odpowiedzi");
  return JSON.parse(raw.slice(s, e + 1));
}

// POST /api/memes/remix {anthropicKey, imageBase64?|id, mediaType?, hint?}
// AI patrzy na mema, rozumie żart i proponuje 3 nowe teksty w tym samym duchu.
router.post("/remix", async (req: Request, res: Response) => {
  try {
    const key = String(req.body?.anthropicKey ?? "").trim() || process.env.ANTHROPIC_API_KEY || "";
    if (!key) return res.status(400).json({ error: "Brak klucza Anthropic" });
    let img = String(req.body?.imageBase64 ?? "");
    let mediaType = String(req.body?.mediaType ?? "image/jpeg");
    const id = String(req.body?.id ?? "");
    if (!img && id) {
      const m = loadMemes().find(x => x.id === id);
      if (!m) return res.status(404).json({ error: "Nie ma takiego mema" });
      img = m.img; mediaType = m.mediaType;
    }
    if (img.length < 100) return res.status(400).json({ error: "Brak obrazka" });
    // Anthropic przyjmuje tylko jpeg/png/gif/webp — inny nagłówek wywróciłby cały strzał.
    if (!["image/jpeg", "image/png", "image/gif", "image/webp"].includes(mediaType)) mediaType = "image/jpeg";
    const hint = String(req.body?.hint ?? "").slice(0, 300);
    const prompt = `Jesteś polskim mistrzem memów. Obejrzyj ten mem/obrazek: zrozum, co na nim jest i na czym polega żart (jeśli jest tekst — przeczytaj go).
${hint ? `Wskazówka użytkownika, o czym mają być nowe wersje: ${hint}` : "Wymyśl nowe wersje w tym samym duchu, po polsku, śmieszne ale kulturalne."}
Zwróć WYŁĄCZNIE ścisły JSON, bez żadnego tekstu wokół:
{"opis":"jedno zdanie co jest na obrazku i na czym polega żart","teksty":[{"gora":"TEKST NA GÓRZE","dol":"TEKST NA DOLE"},{"gora":"...","dol":"..."},{"gora":"...","dol":"..."}]}
Teksty krótkie (góra do 8 słów, dół do 10), uderzające, po polsku. Pole "dol" może być puste, jeśli cały żart mieści się na górze.`;
    const out = await askAI(key, [
      { type: "image", source: { type: "base64", media_type: mediaType, data: img } },
      { type: "text", text: prompt },
    ], 700);
    res.json({ opis: String(out.opis ?? ""), teksty: Array.isArray(out.teksty) ? out.teksty.slice(0, 5) : [] });
  } catch (e: any) {
    res.status(502).json({ error: e?.message ?? "Nie udało się przerobić mema" });
  }
});

// POST /api/memes/ad {anthropicKey, temat, ton?} — gotowa reklama: slogany, post, ogłoszenie
router.post("/ad", async (req: Request, res: Response) => {
  try {
    const key = String(req.body?.anthropicKey ?? "").trim() || process.env.ANTHROPIC_API_KEY || "";
    if (!key) return res.status(400).json({ error: "Brak klucza Anthropic" });
    const temat = String(req.body?.temat ?? "").trim().slice(0, 300);
    if (!temat) return res.status(400).json({ error: "Podaj, co reklamujemy" });
    const ton = String(req.body?.ton ?? "zabawny").slice(0, 30);
    const prompt = `Jesteś polskim copywriterem. Napisz reklamę. Produkt/temat: ${temat}. Ton: ${ton}.
Zwróć WYŁĄCZNIE ścisły JSON, bez tekstu wokół:
{"slogany":["krótki slogan 1","slogan 2","slogan 3"],"post":"gotowy post na Facebooka/Instagram, 2-4 zdania, z emoji, bez hashtagów na siłę (max 3)","ogloszenie":"rzeczowe ogłoszenie sprzedażowe 3-5 zdań (co, dlaczego warto, wezwanie do kontaktu)","mem":{"gora":"TEKST NA GÓRZE MEMA","dol":"TEKST NA DOLE"}}
Wszystko po polsku, poprawną polszczyzną, konkretnie i bez lania wody.`;
    const out = await askAI(key, [{ type: "text", text: prompt }], 900);
    res.json({
      slogany: Array.isArray(out.slogany) ? out.slogany.slice(0, 5) : [],
      post: String(out.post ?? ""),
      ogloszenie: String(out.ogloszenie ?? ""),
      mem: out.mem && typeof out.mem === "object" ? { gora: String(out.mem.gora ?? ""), dol: String(out.mem.dol ?? "") } : { gora: "", dol: "" },
    });
  } catch (e: any) {
    res.status(502).json({ error: e?.message ?? "Nie udało się napisać reklamy" });
  }
});

export default router;
