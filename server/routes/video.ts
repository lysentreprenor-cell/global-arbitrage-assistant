/**
 * 🎬 FILMIKI — twórca filmów Gadacza.
 *
 * Użytkownik wpisuje pomysł („bajka do nauki angielskiego dla dzieci",
 * „animacja o odważnym kotku"), a AI pisze pełny SCENORYS: sceny z tłem,
 * bohaterem (emoji), nagłówkiem, napisami i narracją dla lektora.
 * PRZEGLĄDARKA potem animuje te sceny na canvasie, czyta narrację na głos
 * i potrafi nagrać całość do pliku wideo (webm) — serwer tylko myśli.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const router = Router();

// ── Ten sam PIN co bot/Gadacz/memy.
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

// POST /api/video/script {anthropicKey, pomysl} → scenorys gotowy do animacji
router.post("/script", async (req: Request, res: Response) => {
  try {
    const key = String(req.body?.anthropicKey ?? "").trim() || process.env.ANTHROPIC_API_KEY || "";
    if (!key) return res.status(400).json({ error: "Brak klucza Anthropic" });
    const pomysl = String(req.body?.pomysl ?? "").trim().slice(0, 600);
    if (!pomysl) return res.status(400).json({ error: "Napisz, o czym ma być filmik" });

    const prompt = `Jesteś scenarzystą krótkich filmów animowanych (motion graphics). Napisz scenorys filmiku na temat: ${pomysl}

Film budowany jest ze SCEN: każda ma tło (2 kolory gradientu), jednego bohatera (emoji), duży nagłówek, napis na dole i narrację czytaną przez lektora.
Jeśli temat to NAUKA JĘZYKA — każda scena uczy jednego słowa/zwrotu: w nagłówku „SŁOWO — TŁUMACZENIE", w narracji zdanie po polsku i wyraźne powtórzenie obcego słowa DWA razy.
Jeśli to bajka/animacja — poprowadź prostą historię z początkiem, przygodą i morałem.
Jeśli to reklama — hak na początku, korzyści, wezwanie do działania na końcu.

Zwróć WYŁĄCZNIE ścisły JSON, bez żadnego tekstu wokół:
{"tytul":"tytuł filmiku","sceny":[
 {"tlo":["#1e3a8a","#0ea5e9"],"emoji":"🐱","ruch":"bounce","naglowek":"KOT — CAT","tekst":"napis na dole, krótki, max 12 słów","narracja":"pełne zdania dla lektora, 1-3 zdania","czas":6},
 ...
]}
Zasady: 6-10 scen. "ruch" to jedno z: "bounce","slide","zoom","float". "emoji" to JEDEN znak emoji (bohater sceny). Kolory tła dobrze skontrastowane z białym tekstem, różne w kolejnych scenach. "czas" w sekundach 4-10, dopasowany do długości narracji. Wszystko po polsku (poza słowami uczonego języka).`;

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 3500,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(90_000),
    });
    const d = await r.json() as any;
    if (d.error) return res.status(502).json({ error: d.error.message ?? "Błąd AI" });
    const raw = (d.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join(" ").trim();
    const s = raw.indexOf("{"); const e = raw.lastIndexOf("}");
    if (s < 0 || e <= s) return res.status(502).json({ error: "AI nie zwróciło scenariusza" });
    const out = JSON.parse(raw.slice(s, e + 1));
    const sceny = (Array.isArray(out.sceny) ? out.sceny : []).slice(0, 14).map((sc: any) => ({
      tlo: Array.isArray(sc.tlo) ? sc.tlo.slice(0, 2).map((c: any) => String(c).slice(0, 20)) : ["#1e293b", "#0f172a"],
      emoji: String(sc.emoji ?? "🎬").slice(0, 8),
      ruch: ["bounce", "slide", "zoom", "float"].includes(sc.ruch) ? sc.ruch : "float",
      naglowek: String(sc.naglowek ?? "").slice(0, 80),
      tekst: String(sc.tekst ?? "").slice(0, 160),
      narracja: String(sc.narracja ?? "").slice(0, 500),
      czas: Math.max(3, Math.min(12, Number(sc.czas) || 6)),
    }));
    if (!sceny.length) return res.status(502).json({ error: "Scenariusz wyszedł pusty — spróbuj jeszcze raz" });
    res.json({ tytul: String(out.tytul ?? "Filmik").slice(0, 120), sceny });
  } catch (e: any) {
    res.status(502).json({ error: e?.message ?? "Nie udało się napisać scenariusza" });
  }
});

export default router;
