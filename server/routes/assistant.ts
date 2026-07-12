/**
 * 🗣️ Gadacz — voice phone-control assistant for blind users (Etap 1: web).
 *
 * POST /api/assistant/ask
 *   { anthropicKey?, question, history?, imageBase64?, mediaType?, clientTime? }
 * → { say, action, args }
 *
 * The model ALWAYS answers with strict JSON: something to SAY (read aloud by TTS)
 * plus an optional phone ACTION the client executes (call / sms / maps / youtube /
 * search / open / save_contact). Full in-app screen control (clicking inside other
 * apps) needs the native Android AccessibilityService — that is Etap 2; here we
 * launch the system apps the web is allowed to: dialer, SMS, maps, browser.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const router = Router();

// ── PIN lock — same 0905 PIN as the bot, same pin.json. Once a PIN is set, every
// Gadacz route requires the x-bot-pin header, so nobody with the URL can read or
// wipe your memory or run the assistant on your Anthropic key.
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
  if (!cur) return next(); // no PIN configured — open, as before
  if (pinOk(req.headers["x-bot-pin"], cur)) return next();
  res.status(401).json({ error: "Wymagany PIN aplikacji" });
});

// ── Gadacz's memory — lives IN THE APP (on the server), not just the phone.
// Survives browser clears, shared across devices. Plain JSON list of facts.
const MEMORY_FILE = path.resolve(process.cwd(), "data", "gadacz_memory.json");
function loadMemory(): string[] {
  // Główny plik, a gdy zniknął/uszkodzony/nie-tablica — kopia .bak (ostatni dobry stan).
  try { const d = JSON.parse(fs.readFileSync(MEMORY_FILE, "utf8")); if (Array.isArray(d)) return d; } catch { /* spróbuj .bak */ }
  try { const d = JSON.parse(fs.readFileSync(MEMORY_FILE + ".bak", "utf8")); if (Array.isArray(d)) return d; } catch { /* pusto */ }
  return [];
}
function saveMemory(list: string[]) {
  try {
    fs.mkdirSync(path.dirname(MEMORY_FILE), { recursive: true });
    // Przed nadpisaniem odłóż ostatni NIEPUSTY stan do .bak — polisa na uszkodzenie pliku.
    try {
      const cur = JSON.parse(fs.readFileSync(MEMORY_FILE, "utf8"));
      if (Array.isArray(cur) && cur.length > 0) fs.writeFileSync(MEMORY_FILE + ".bak", JSON.stringify(cur));
    } catch { /* brak/zepsuty — nie ma czego odkładać */ }
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(list.slice(-1000)));
  } catch { /* ignore */ }
}

// ── Learning journal — Gadacz records every interaction (command → action →
// outcome) so patterns of what confuses it surface. You (and the master) can
// review it to improve how Gadacz helps. Kept last 300.
const LEARN_FILE = path.resolve(process.cwd(), "data", "gadacz_learn.json");
function loadLearn(): any[] { try { return JSON.parse(fs.readFileSync(LEARN_FILE, "utf8")); } catch { return []; } }
function saveLearn(l: any[]) { try { fs.mkdirSync(path.dirname(LEARN_FILE), { recursive: true }); fs.writeFileSync(LEARN_FILE, JSON.stringify(l.slice(-800))); } catch {} }
router.get("/log", (_req, res) => res.json({ log: loadLearn().slice(-100) }));
router.post("/log", (req, res) => {
  const { question, action, ok, note } = req.body ?? {};
  const l = loadLearn();
  l.push({ t: new Date().toISOString(), q: String(question ?? "").slice(0, 300), action: String(action ?? "none"), ok: ok !== false, note: String(note ?? "").slice(0, 300) });
  saveLearn(l);
  res.json({ ok: true });
});
router.post("/log/clear", (_req, res) => { saveLearn([]); res.json({ ok: true }); });
// POST /api/assistant/log/last-outcome {ok} — the PHONE reports whether the last
// action actually succeeded on the real screen (tap found the button? field accepted
// text? app launched?). This turns the guess-based journal into ground-truth learning:
// a command that FAILED on the device is marked [nieudane], so next time the AI tries
// a different approach or asks. This is what makes Gadacz learn from reality all the time.
router.post("/log/last-outcome", (req, res) => {
  const ok = req.body?.ok !== false;
  try {
    const l = loadLearn();
    if (l.length) { l[l.length - 1].ok = ok; saveLearn(l); }
  } catch { /* ignore */ }
  res.json({ ok: true });
});

// ── 🧭 Silnik przepisów — Gadacz uczy się OBSŁUGI TELEFONU przez powtarzanie.
// Gdy zadanie wielokrokowe SIĘ UDA, telefon przysyła całą drogę (kroki, które
// zadziałały). Przy podobnym zadaniu wstrzykujemy przepis do promptu jako mapę —
// AI nie odkrywa drogi od zera, tylko idzie sprawdzonym śladem, patrząc na ekran.
const RECIPES_FILE = path.resolve(process.cwd(), "data", "gadacz_recipes.json");
type Recipe = { goal: string; steps: string[]; uses: number; t: string };
function loadRecipes(): Recipe[] { try { return JSON.parse(fs.readFileSync(RECIPES_FILE, "utf8")); } catch { return []; } }
function saveRecipes(r: Recipe[]) { try { fs.mkdirSync(path.dirname(RECIPES_FILE), { recursive: true }); fs.writeFileSync(RECIPES_FILE, JSON.stringify(r.slice(-120))); } catch {} }
function goalWords(s: string): Set<string> {
  const map: Record<string, string> = { ą: "a", ć: "c", ę: "e", ł: "l", ń: "n", ó: "o", ś: "s", ź: "z", ż: "z" };
  const n = s.toLowerCase().replace(/[ąćęłńóśźż]/g, ch => map[ch] ?? ch);
  return new Set(n.split(/[^a-z0-9]+/).filter(w => w.length > 2));
}
function goalSimilarity(a: string, b: string): number {
  const A = goalWords(a), B = goalWords(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0; for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter); // Jaccard
}
// POST /api/assistant/recipe {goal, steps[]} — telefon melduje UDANĄ drogę
router.post("/recipe", (req, res) => {
  const goal = String(req.body?.goal ?? "").trim().slice(0, 200);
  const steps = Array.isArray(req.body?.steps) ? req.body.steps.map((s: any) => String(s).slice(0, 120)).slice(0, 24) : [];
  if (!goal || steps.length < 2) return res.status(400).json({ error: "Za mało danych" });
  const all = loadRecipes();
  const twin = all.find(r => goalSimilarity(r.goal, goal) >= 0.7);
  if (twin) { twin.steps = steps; twin.uses++; twin.t = new Date().toISOString(); } // świeższa droga wygrywa
  else all.push({ goal, steps, uses: 1, t: new Date().toISOString() });
  saveRecipes(all);
  res.json({ ok: true, recipes: all.length });
});
router.get("/recipes", (_req, res) => res.json({ recipes: loadRecipes() }));
// 🔧 PIĘTRO 19 — SAMONAPRAWA: Gadacz analizuje własne porażki z dziennika i wskazuje,
// które przepisy/komendy najczęściej zawodzą — żeby wiedzieć, co poprawić.
router.get("/selfcheck", (_req, res) => {
  const jr = loadLearn();
  const bad = new Map<string, number>();
  for (const e of jr) if (e.ok === false) { const k = String(e.q ?? "").toLowerCase().trim(); if (k) bad.set(k, (bad.get(k) ?? 0) + 1); }
  const worst = [...bad.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 10);
  // przepisy używane rzadko / stare — kandydaci do odświeżenia
  const recipes = loadRecipes();
  const say = worst.length
    ? `Najczęściej mylę się przy: ${worst.map(([q, n]) => `„${q}" (${n} razy)`).join(", ")}. Warto mnie tu doszkolić — powtórz te polecenia albo popraw mnie słowem „źle".`
    : "Nie widzę powtarzających się błędów. Radzę sobie dobrze.";
  res.json({ say, worst: worst.map(([q, n]) => ({ q, n })), recipes: recipes.length });
});
// GET /api/assistant/recipe/match?goal=... — 🧭 AUTOPILOT: telefon pyta, czy zna już
// drogę dla tego celu. Zwracamy najlepszy przepis Z WYNIKIEM podobieństwa — telefon
// wykona go BEZ pytania AI, jeśli podobieństwo jest wysokie, a kroki bezpieczne.
router.get("/recipe/match", (req, res) => {
  const goal = String(req.query.goal ?? "").trim();
  if (!goal) return res.json({ found: false });
  let best: Recipe | null = null; let bestScore = 0;
  for (const r of loadRecipes()) {
    const s = goalSimilarity(r.goal, goal);
    if (s > bestScore) { bestScore = s; best = r; }
  }
  // Próg 0.72 dla ŚLEPEGO wykonania (telefon robi bez AI): „do mamy" vs „do taty"
  // dają ~0.5 — za mało pewności, żeby ryzykować wiadomość do złej osoby. Audyt 10.07.
  if (!best || bestScore < 0.72) return res.json({ found: false });
  res.json({ found: true, score: bestScore, goal: best.goal, steps: best.steps, uses: best.uses });
});
router.post("/recipes/clear", (_req, res) => { saveRecipes([]); res.json({ ok: true }); });
// Najlepszy przepis dla celu (podobieństwo słów; przy remisie częściej używany).
function bestRecipe(goal: string): Recipe | null {
  // Podpowiedź dla AI (nie ślepe wykonanie) — sam bonus za użycia NIE może przepchnąć
  // nietrafnego przepisu: wymagamy realnego podobieństwa bazowego ≥0.35. Audyt 10.07.
  let best: Recipe | null = null; let bestScore = 0;
  for (const r of loadRecipes()) {
    const base = goalSimilarity(r.goal, goal);
    const s = base + Math.min(0.1, r.uses * 0.01);
    if (base >= 0.35 && s > bestScore) { bestScore = s; best = r; }
  }
  return best;
}

// ── 🏢 PIĘTRA GADACZA — włącznik każdej zdolności. Właściciel decyduje, co Gadacz
// robi. Zapis na serwerze; telefon czyta i respektuje. Domyślnie wszystko WŁĄCZONE.
const FLOORS_FILE = path.resolve(process.cwd(), "data", "gadacz_floors.json");
const FLOOR_KEYS = [
  "odruchy", "nawyki", "zdarzenia", "straznik", "mowa_niedbala",
  "przewidywanie", "opiekun", "oczy", "poranny_raport", "osobowosc",
  "nauczyciel", "samonaprawa", "numerki", "autopilot", "otwieranie_apek",
  "czytanie_powiadomien", "budziki", "dzwonienie", "latarka_glosnosc", "sos",
];
function loadFloors(): Record<string, boolean> {
  let saved: Record<string, boolean> = {};
  try { const d = JSON.parse(fs.readFileSync(FLOORS_FILE, "utf8")); if (d && typeof d === "object") saved = d; } catch {}
  const out: Record<string, boolean> = {};
  for (const k of FLOOR_KEYS) out[k] = saved[k] !== false; // domyślnie true
  return out;
}
function saveFloors(f: Record<string, boolean>) {
  try { fs.mkdirSync(path.dirname(FLOORS_FILE), { recursive: true }); fs.writeFileSync(FLOORS_FILE, JSON.stringify(f)); } catch {}
}
router.get("/floors", (_req, res) => res.json({ floors: loadFloors() }));
router.post("/floors", (req, res) => {
  const cur = loadFloors();
  const body = req.body ?? {};
  if (typeof body.key === "string" && FLOOR_KEYS.includes(body.key)) cur[body.key] = body.on !== false;
  else if (body.floors && typeof body.floors === "object") for (const k of FLOOR_KEYS) if (k in body.floors) cur[k] = body.floors[k] !== false;
  saveFloors(cur);
  res.json({ ok: true, floors: cur });
});

// 🚫 ZABLOKOWANE APLIKACJE — Gadacz NIE wykona żadnej akcji ekranowej (klik/wpisanie)
// w tych apkach. „match" = fragment nazwy pakietu lub apki (np. „bank", „revolut").
const BLOCKED_FILE = path.resolve(process.cwd(), "data", "gadacz_blocked.json");
type BlockedApp = { match: string; name: string };
function loadBlocked(): BlockedApp[] {
  try { const d = JSON.parse(fs.readFileSync(BLOCKED_FILE, "utf8")); return Array.isArray(d) ? d : []; } catch { return []; }
}
function saveBlocked(b: BlockedApp[]) {
  try { fs.mkdirSync(path.dirname(BLOCKED_FILE), { recursive: true }); fs.writeFileSync(BLOCKED_FILE, JSON.stringify(b.slice(-100))); } catch {}
}
router.get("/blockedapps", (_req, res) => res.json({ blocked: loadBlocked() }));
router.post("/blockedapps", (req, res) => {
  const match = String(req.body?.match ?? "").trim().toLowerCase().slice(0, 80);
  const name = String(req.body?.name ?? "").trim().slice(0, 60) || match;
  if (!match) return res.status(400).json({ error: "Podaj aplikację" });
  const all = loadBlocked().filter(b => b.match !== match);
  all.push({ match, name });
  saveBlocked(all);
  res.json({ ok: true, blocked: all });
});
router.post("/blockedapps/delete", (req, res) => {
  const match = String(req.body?.match ?? "").trim().toLowerCase();
  saveBlocked(loadBlocked().filter(b => b.match !== match));
  res.json({ ok: true, blocked: loadBlocked() });
});

// GET  /api/assistant/memory        → { memory: string[] }
router.get("/memory", (_req, res) => res.json({ memory: loadMemory() }));
// POST /api/assistant/memory {fact} → append
router.post("/memory", (req, res) => {
  const fact = String(req.body?.fact ?? "").trim();
  if (!fact) return res.status(400).json({ error: "Pusty fakt" });
  const m = loadMemory();
  if (!m.some(x => x.toLowerCase() === fact.toLowerCase())) m.push(fact);
  saveMemory(m);
  res.json({ ok: true, memory: m });
});
// POST /api/assistant/memory/bulk {text} — ➕ WKLEJONA WIEDZA: użytkownik wkleja cały
// blok tekstu (notatki, instrukcje, fakty), my tniemy go na osobne fakty (linie/zdania),
// pomijamy duplikaty i dopisujemy do pamięci. Szybka nauka zamiast dyktowania po jednym.
router.post("/memory/bulk", (req, res) => {
  const text = String(req.body?.text ?? "").trim();
  if (!text) return res.status(400).json({ error: "Pusty tekst" });
  const m = loadMemory();
  let added = 0;
  const parts = text
    .split(/\r?\n|(?<=[.!?])\s+(?=[A-ZĄĆĘŁŃÓŚŹŻ0-9])/)
    .map(s => s.trim().replace(/^[-•*\d.)\s]+/, "").trim())
    .filter(s => s.length >= 3);
  for (const p of parts) {
    const fact = p.slice(0, 200);
    if (!m.some(x => x.toLowerCase() === fact.toLowerCase())) { m.push(fact); added++; }
  }
  saveMemory(m);
  res.json({ ok: true, added, total: Math.min(m.length, 1000) });
});
// POST /api/assistant/memory/delete {index} → remove one
router.post("/memory/delete", (req, res) => {
  const i = Number(req.body?.index);
  const m = loadMemory();
  if (Number.isInteger(i) && i >= 0 && i < m.length) m.splice(i, 1);
  saveMemory(m);
  res.json({ ok: true, memory: m });
});
// POST /api/assistant/memory/clear → wipe
router.post("/memory/clear", (_req, res) => { saveMemory([]); res.json({ ok: true, memory: [] }); });

// 🔮 PIĘTRO 8 — PRZEWIDYWANIE: podpowiedź z rytmu dnia użytkownika. Z dziennika nauki
// liczymy, o co użytkownik najczęściej prosi o tej porze (±1 h) i podpowiadamy.
const ACTION_PL: Record<string, string> = {
  flashlight: "latarkę", weather: "pogodę", btc: "kurs bitcoina", call: "telefonowanie",
  open_app: "otwieranie aplikacji", youtube: "muzykę z YouTube", alarm: "budzik",
  timer: "minutnik", read_screen: "czytanie ekranu", navigate: "zakładki aplikacji",
  app_action: "sprawy bota", sms: "wiadomości", volume: "głośność", search: "szukanie w internecie",
};
router.get("/suggest", (req, res) => {
  const hq = Number(req.query.hour);
  const h = Number.isInteger(hq) && hq >= 0 && hq < 24 ? hq : new Date().getHours();
  const counts: Record<string, number> = {};
  for (const e of loadLearn()) {
    if (!e.ok || !e.action || e.action === "none") continue;
    const eh = new Date(e.t).getHours();
    const diff = Math.abs(eh - h);
    if (diff <= 1 || diff >= 23) counts[e.action] = (counts[e.action] ?? 0) + 1;
  }
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([a]) => ACTION_PL[a] ?? a);
  res.json({
    say: top.length
      ? `O tej porze zwykle prosisz o: ${top.join(", ")}. Powiedz, co zrobić.`
      : "Jeszcze się uczę Twojego rytmu dnia. Używaj mnie, a zacznę podpowiadać.",
  });
});

// GET /api/assistant/info?do=btc | weather&city=... → spoken-ready { say }
// Live facts Gadacz can read aloud: BTC price (Kraken public) and weather (open-meteo, no key).
router.get("/info", async (req: Request, res: Response) => {
  const doWhat = String(req.query.do ?? "");
  try {
    if (doWhat === "btc") {
      const r = await fetch("https://api.kraken.com/0/public/Ticker?pair=XBTUSD", { signal: AbortSignal.timeout(8000) });
      const d = await r.json() as any;
      const k = Object.keys(d.result ?? {})[0];
      const last = parseFloat(d.result?.[k]?.c?.[0] ?? "0");
      const open = parseFloat(d.result?.[k]?.o ?? "0");
      const chg = open > 0 ? (last - open) / open * 100 : 0;
      const dir = chg >= 0 ? "w górę" : "w dół";
      return res.json({ say: `Bitcoin kosztuje ${Math.round(last)} dolarów, ${dir} ${Math.abs(chg).toFixed(1)} procent od północy.` });
    }
    if (doWhat === "weather") {
      const city = String(req.query.city ?? "").trim() || "Warszawa";
      const g = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=pl`, { signal: AbortSignal.timeout(8000) })).json() as any;
      const loc = g.results?.[0];
      if (!loc) return res.json({ say: `Nie znalazłem miasta ${city}.` });
      const w = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`, { signal: AbortSignal.timeout(8000) })).json() as any;
      const t = Math.round(w.current?.temperature_2m ?? 0);
      const wind = Math.round(w.current?.wind_speed_10m ?? 0);
      const tmax = Math.round(w.daily?.temperature_2m_max?.[0] ?? 0);
      const tmin = Math.round(w.daily?.temperature_2m_min?.[0] ?? 0);
      const code = w.current?.weather_code ?? 0;
      const sky = code === 0 ? "bezchmurnie" : code < 4 ? "częściowe zachmurzenie" : code < 50 ? "pochmurno" : code < 70 ? "deszcz" : code < 80 ? "śnieg" : "przelotne opady";
      return res.json({ say: `W ${loc.name}: ${t} stopni, ${sky}, wiatr ${wind} kilometrów na godzinę. Dziś od ${tmin} do ${tmax} stopni.` });
    }
    res.status(400).json({ error: "Nieznane zapytanie" });
  } catch (e: any) {
    res.json({ say: "Nie udało mi się sprawdzić tej informacji." });
  }
});

// 📱 ŚCIĄGI O APLIKACJACH — wiedza "od środka" o aplikacjach użytkownika. Gdy Gadacz
// pracuje na ekranie znanej aplikacji (poznajemy po nazwie pakietu w zrzucie EKRAN),
// doklejamy mu krótką mapę: jak ta aplikacja jest zbudowana, jak się nazywają kluczowe
// przyciski, jaki jest typowy przepływ. AI przestaje zgadywać — zna teren.
// 📱➕ WŁASNE ŚCIĄGI — użytkownik uczy Gadacza dowolnej aplikacji. Zapis na serwerze,
// scalane z wbudowanymi. „match" to fragment nazwy pakietu ALBO nazwy apki (np. „olx",
// „poczta", „com.olx"). Telefon może dodać ściągę z wnętrza apki (zna pakiet).
const APPGUIDES_FILE = path.resolve(process.cwd(), "data", "gadacz_appguides.json");
type AppGuide = { match: string; name: string; guide: string };
function loadAppGuides(): AppGuide[] {
  try { const d = JSON.parse(fs.readFileSync(APPGUIDES_FILE, "utf8")); return Array.isArray(d) ? d : []; } catch { return []; }
}
function saveAppGuides(g: AppGuide[]) {
  try { fs.mkdirSync(path.dirname(APPGUIDES_FILE), { recursive: true }); fs.writeFileSync(APPGUIDES_FILE, JSON.stringify(g.slice(-100))); } catch {}
}
router.get("/appguides", (_req, res) => res.json({ guides: loadAppGuides(), builtin: BUILTIN_TILES }));
router.post("/appguides", (req, res) => {
  const match = String(req.body?.match ?? "").trim().toLowerCase().slice(0, 80);
  const name = String(req.body?.name ?? "").trim().slice(0, 60) || match;
  const guide = String(req.body?.guide ?? "").trim().slice(0, 600);
  // Instrukcja OPCJONALNA — samo zaznaczenie aplikacji robi z niej „ekspercką".
  if (!match) return res.status(400).json({ error: "Podaj aplikację" });
  const all = loadAppGuides().filter(g => g.match !== match); // nadpisz istniejącą
  all.push({ match, name, guide });
  saveAppGuides(all);
  res.json({ ok: true, guides: all });
});
router.post("/appguides/delete", (req, res) => {
  const match = String(req.body?.match ?? "").trim().toLowerCase();
  saveAppGuides(loadAppGuides().filter(g => g.match !== match));
  res.json({ ok: true, guides: loadAppGuides() });
});
// 🤖📱 SAMONAUKA APLIKACJI — telefon przysyła pakiet + ZRZUT/EKRAN otwartej apki, AI
// pisze z tego krótką ściągę „jak ją obsługiwać" i ZAPISUJE jako ekspercką. Gadacz uczy
// się aplikacji sam, bez pisania instrukcji przez użytkownika.
router.post("/learn-app", async (req: Request, res: Response) => {
  try {
    const { anthropicKey, pkg, name, screen, imageBase64, mediaType = "image/jpeg", deep } = req.body ?? {};
    const match = String(pkg ?? "").trim().toLowerCase();
    if (!match) return res.status(400).json({ error: "Brak aplikacji" });
    const key: string = anthropicKey || process.env.ANTHROPIC_API_KEY || "";
    if (!key) return res.status(400).json({ error: "Brak klucza Anthropic" });
    const content: any[] = [];
    if (imageBase64) content.push({ type: "image", source: { type: "base64", media_type: mediaType, data: String(imageBase64) } });
    content.push({ type: "text", text: deep
      ? `To zapis WIELU sekcji/zakładek aplikacji „${name || match}" (osoba niewidoma), odczytanych po kolei:\n${String(screen ?? "").slice(0, 6000)}\n\n` +
        `Napisz zwięzłą ściągę (max 7 zdań, po polsku): CO ta aplikacja POTRAFI — wymień jej główne sekcje/zakładki — i JAK w każdej działać (gdzie pole tekstu, gdzie główna akcja, jak szukać, jak nawigować). Sam konkret. Nie zmyślaj tego, czego nie widać.`
      : `To ekran aplikacji „${name || match}" na telefonie osoby niewidomej. Oto elementy odczytane z ekranu:\n${String(screen ?? "").slice(0, 3000)}\n\n` +
        `Napisz KRÓTKĄ, praktyczną ściągę (max 4 zdania, po polsku) — JAK OBSŁUGIWAĆ tę aplikację: gdzie jest pole tekstowe, gdzie przycisk „wyślij"/główna akcja, jak nawigować (zakładki na dole?), jak szukać, jak się przewija. Sam konkret, bez wstępu. Jeśli czegoś nie widać, nie zmyślaj.` });
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: deep ? 600 : 400, messages: [{ role: "user", content }] }),
      signal: AbortSignal.timeout(40_000),
    });
    const d = await r.json() as any;
    if (d.error) return res.status(502).json({ error: d.error.message ?? "Błąd AI" });
    const guide = (d.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join(" ").trim().slice(0, 600);
    if (!guide) return res.json({ say: "Nie udało mi się poznać tej aplikacji, spróbuj jeszcze raz." });
    const all = loadAppGuides().filter(g => g.match !== match);
    all.push({ match, name: String(name ?? match).slice(0, 60), guide });
    saveAppGuides(all);
    res.json({ ok: true, guide, say: `Poznałem tę aplikację. Zapamiętałem, jak ją obsługiwać, i będę w niej działał jak ekspert.` });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

const APP_GUIDES: Record<string, string> = {
  "com.facebook.orca": "Messenger — lista rozmów: dotknij nazwę osoby. W rozmowie pole tekstowe na dole (podpowiedź „Aa”), wyślij = strzałka po prawej od pola. Szukanie osób: lupa na górze.",
  "com.whatsapp": "WhatsApp — zakładka Czaty: dotknij rozmowę. Pole tekstowe na dole, wyślij = zielona strzałka po prawej. Nowy czat: zielony przycisk na dole po prawej.",
  "com.facebook.katana": "Facebook — ściana przewija się w dół (scroll down). Pod każdym postem: Lubię to, Komentarz, Udostępnij. Powiadomienia: dzwonek na górze. Szukanie: lupa.",
  "com.google.android.youtube": "YouTube — szukanie: lupa na górze, wpisz i zatwierdź (enter). Film otwierasz dotknięciem miniatury. Pauza: dotknij środka ekranu, potem tap_at w symbol pauzy. Shorts przewija się jak TikTok (scroll down).",
  "com.zhiliaoapp.musically": "TikTok — następny film: scroll down; poprzedni: scroll up. Ikony po prawej (od góry): profil, serce=polub, dymek=komentarze, strzałka=udostępnij. Mało napisów — celuj tap_at ze zrzutu ekranu.",
  "com.instagram.android": "Instagram — ściana: scroll down. Stories to kółka na górze; następna story: scroll left. Serce pod postem = polub. Wiadomości: ikona samolotu na górze.",
  "com.google.android.gm": "Gmail — lista maili: dotknij, aby otworzyć. Nowy mail: przycisk „Utwórz” na dole po prawej. Wypełniaj po kolei: tap w Do → type, tap w Temat → type, tap w treść → type. Wyślij: strzałka na górze po prawej.",
  "com.google.android.apps.messaging": "Wiadomości SMS — rozmowy na liście. Nowa: „Rozpocznij czat”. Pole tekstowe na dole, wyślij = strzałka po prawej.",
  "com.spotify.music": "Spotify — zakładka Szukaj na dole → wpisz i zatwierdź. Dotknięcie utworu odtwarza. Pauza/wznowienie: dolna belka odtwarzania.",
  "com.sec.android.gallery3d": "Galeria Samsung — zdjęcia siatką: dotknij, aby otworzyć; następne zdjęcie: scroll left. Po otwarciu na dole: Udostępnij, Usuń. Usunięcie potwierdź tylko na wyraźne polecenie.",
  "com.samsung.android.dialer": "Telefon Samsung — zakładki na dole: Klawiatura, Ostatnie, Kontakty. Numer wybierasz na klawiaturze, zielona słuchawka dzwoni.",
  "com.samsung.android.messaging": "Wiadomości Samsung — rozmowy na liście, pole tekstowe na dole, wyślij = strzałka.",
  "com.einnovation.temu": "Temu — sklep. Szukanie na górze. UWAGA: NIE dotykaj „Kup teraz/Zamów/Zapłać” bez wyraźnego polecenia; przed finalizacją zawsze przeczytaj cenę i poproś o potwierdzenie.",
  "com.lemon.lvoverseas": "CapCut — edytor wideo. „Nowy projekt” na górze, oś czasu na dole. Rób małe kroki i opisuj efekt po każdym.",
  "com.android.chrome": "Chrome — pasek adresu na górze: tap → type → enter. Karty: kwadrat z liczbą. Wstecz: gest back.",
};
// 🎓 Miniaturki do panelu „TRYB EKSPERT" na stronie: przyjazna nazwa + ikonka dla
// każdej WBUDOWANEJ ściągi powyżej — użytkownik widzi kafelki „nauczone".
const BUILTIN_TILES: { match: string; name: string; icon: string }[] = [
  { match: "com.facebook.orca",                name: "Messenger",   icon: "💬" },
  { match: "com.whatsapp",                     name: "WhatsApp",    icon: "🟢" },
  { match: "com.facebook.katana",              name: "Facebook",    icon: "📘" },
  { match: "com.google.android.youtube",       name: "YouTube",     icon: "▶️" },
  { match: "com.zhiliaoapp.musically",         name: "TikTok",      icon: "🎵" },
  { match: "com.instagram.android",            name: "Instagram",   icon: "📸" },
  { match: "com.google.android.gm",            name: "Gmail",       icon: "✉️" },
  { match: "com.google.android.apps.messaging", name: "Wiadomości", icon: "📩" },
  { match: "com.spotify.music",                name: "Spotify",     icon: "🎧" },
  { match: "com.sec.android.gallery3d",        name: "Galeria",     icon: "🖼️" },
  { match: "com.samsung.android.dialer",       name: "Telefon",     icon: "📞" },
  { match: "com.samsung.android.messaging",    name: "SMS Samsung", icon: "📨" },
  { match: "com.einnovation.temu",             name: "Temu",        icon: "🛍️" },
  { match: "com.lemon.lvoverseas",             name: "CapCut",      icon: "✂️" },
  { match: "com.android.chrome",               name: "Chrome",      icon: "🌐" },
];

// 🏦 Aplikacje bankowe/płatnicze — tu obowiązuje ŻELAZNA ostrożność.
// Dopasowanie po CZŁONACH pakietu (kropki), nie po podłańcuchu — inaczej „ing" łapało
// „messag-ing" i zwykłe SMS-y stawały się „bankowe". Audyt 10.07.
const BANK_HINTS = ["revolut", "vipps", "bankid", "santander", "mbank", "pekao", "paypal", "ingbank", "pkobp", "pko", "millennium", "aliorbank", "getin"];
function looksBankApp(pkg: string): boolean {
  const segs = pkg.toLowerCase().split(/[.\-_]/);
  return BANK_HINTS.some(b => segs.includes(b)) || segs.includes("bank");
}

const SYSTEM = `Jesteś "Gadacz" — głosowy asystent sterujący telefonem, zbudowany dla osób niewidomych i słabowidzących. Mówisz po polsku.

ZAWSZE odpowiadasz WYŁĄCZNIE poprawnym JSON, bez żadnego tekstu przed ani po, bez markdown:
{"say":"tekst do przeczytania na głos","action":"none","args":{}}

Dostępne akcje i ich args:
- "call":         {"who":"nazwa kontaktu albo numer"} — użytkownik chce zadzwonić
- "sms":          {"who":"nazwa kontaktu albo numer","text":"treść"} — ułóż naturalną, krótką treść SMS z polecenia
- "save_contact": {"name":"nazwa","number":"numer"} — użytkownik dyktuje kontakt do zapisania
- "maps":         {"query":"miejsce lub adres"} — nawigacja / pokaż na mapie / "jak dojść do..."
- "youtube":      {"query":"czego szukać"} — włącz / znajdź muzykę lub film na YouTube
- "search":       {"query":"zapytanie"} — wyszukaj w internecie
- "open":         {"url":"https://pełny.adres"} — otwórz konkretną stronę
- "none":         {} — zwykła rozmowa, pytanie, opis obrazu; całą odpowiedź daj w "say". Użytkownik może z Tobą po prostu POGADAĆ — o dniu, samopoczuciu, nowinkach, czymkolwiek. Bądź wtedy ciepłym, uważnym towarzyszem: odpowiadaj naturalnie, dopytuj, żartuj delikatnie. Rozmowa jest tak samo ważna jak wykonywanie poleceń.

Akcja NAWIGACJI PO NASZEJ APLIKACJI ResellAssist (działa zawsze, także w przeglądarce):
- "navigate": {"tab":"klucz zakładki"} — przełącz na wskazaną zakładkę naszej aplikacji.
Dostępne zakładki (klucz → co robi):
  dashboard — pulpit, skaner rynku
  agent — Agent AI (ARIA), analizuje rynek i tworzy plan zarobku
  marketing — Marketing AI, kampanie dla produktów
  search — Szukaj okazji
  pipeline — Pipeline, zapisane okazje
  pnl — P&L, zyski i straty
  alerts — Alerty cenowe
  trends — Trendy
  competitors — Rywale, śledzenie konkurencji
  compare — Porównaj platformy
  markets — Rynki, skan międzynarodowy
  dropship — Dropshipping
  suppliers — Dostawcy
  photo — Wystawianie ze zdjęcia
  copy — Szybkie kopiowanie ofert
  autopilot — Autopilot
  bot — Trading Bot: bot handlujący krypto na Krakenie, jego pozycje, symulacja, portfel
  api — Ustawienia API i kluczy
  gadacz — ten asystent głosowy
  reklama — Reklama i memy: biblioteka memów, przerabianie memów (nowe teksty na starym obrazku), tworzenie tekstów reklamowych
Przykłady: „otwórz trading bota" → navigate bot. „otwórz reklamę"/„pokaż memy" → navigate reklama. „pokaż zyski" → navigate pnl. „przejdź do ustawień" → navigate api. „wróć do pulpitu" → navigate dashboard.
Gdy użytkownik pyta CO potrafi ta aplikacja albo jak coś zrobić — wyjaśnij w "say" po ludzku, wymieniając odpowiednie zakładki.

Akcja STEROWANIA FUNKCJAMI aplikacji (działa zawsze, także w przeglądarce):
- "app_action": {"do":"nazwa"} — wykonaj funkcję. Dostępne "do":
  bot_status — ile bot zarobił/stracił, ile pozycji, wygrane/przegrane ("ile bot zarobił", "jak stoi bot", "ile pozycji")
  sim_status — wynik symulacji ("jak symulacja", "ile symulacja zarobiła")
  wallet — stan portfela Kraken: gotówka i monety ("ile mam pieniędzy", "co jest w portfelu", "stan konta")
  market — obraz rynku: BTC, przegrzanie, trend, straż BTC ("jak rynek", "co z bitcoinem", "obraz rynku")
  shadow — wynik prawie-kupionych i ocena filtrów ("jak filtry", "prawie kupione")
  bot_stop — WYŁĄCZ bota ("wyłącz bota", "zatrzymaj bota", "stop bot")
  sweep_dust — wymieć kurz z portfela ("wymieć kurz", "sprzedaj resztki")
  btc — aktualna cena bitcoina ("ile kosztuje bitcoin", "jaki kurs btc", "ile bitcoin")
  weather — pogoda ("jaka pogoda", "pogoda w Krakowie", "ile stopni") — jeśli użytkownik poda miasto, dodaj je: {"do":"weather","city":"Kraków"}; bez miasta domyślnie Warszawa
Uwaga: WŁĄCZENIE bota wymaga ustawień z ekranu — na „włącz bota" odpowiedz w "say", że otwierasz zakładkę bota (użyj navigate bot) i użytkownik ma dotknąć dużego przycisku. Nie próbuj włączać bota przez app_action.

URUCHAMIANIE APLIKACJI (działa w aplikacji Gadacz na telefonie, NIE wymaga usługi dostępności — więc możesz z tego korzystać zawsze na telefonie):
- "open_app": {"name":"nazwa aplikacji"} — otwórz / włącz / uruchom / odpal DOWOLNĄ zainstalowaną aplikację.
  Używaj tego ZAWSZE, gdy użytkownik mówi „włącz", „otwórz", „uruchom", „odpal", „wejdź w" i nazwę aplikacji. Przykłady:
  „włącz Facebooka" → open_app {"name":"Facebook"}
  „otwórz Messenger" / „wejdź w Messengera" → open_app {"name":"Messenger"}
  „uruchom aparat" / „włącz aparat" → open_app {"name":"aparat"}
  „odpal WhatsApp" → open_app {"name":"WhatsApp"}
  „włącz Spotify" → open_app {"name":"Spotify"}
  „otwórz galerię / zdjęcia" → open_app {"name":"Galeria"}
  „otwórz ustawienia telefonu" → open_app {"name":"Ustawienia"}
  Podaj nazwę tak, jak brzmi w telefonie (Gadacz sam dopasuje najbliższą zainstalowaną aplikację).
  WYJĄTKI — to NIE aplikacje, użyj innej akcji: „włącz muzykę/film na YouTube" → youtube; „pokaż na mapie / nawiguj" → maps; „włącz latarkę" → flashlight; „włącz WiFi / Bluetooth" → settings.

Akcje EKRANOWE (działają tylko w aplikacji Android "Gadacz" z włączoną usługą dostępności; w wersji przeglądarkowej odpowiedz w "say", że potrzebna jest aplikacja Gadacz):
- "look":         {} — OCZY NA ŚWIAT: aparat opisze OTOCZENIE. Gdy użytkownik pyta „co przede mną", „co widzisz", „opisz otoczenie", „co to jest" (o rzeczy w świecie, nie na ekranie).
- "read_world":   {} — aparat PRZECZYTA tekst z kartki/ulotki/etykiety w świecie („przeczytaj to", „co tu pisze na kartce").
- "check_framing": {} — PRZEDNI aparat sprawdza kadr osoby (na rozmowie wideo): „czy dobrze mnie widać", „jak wyglądam", „czy jestem w kadrze". Mówi, czy twarz w kadrze i światło dobre.
- "read_screen":  {} — użytkownik pyta co jest na EKRANIE telefonu / prosi o przeczytanie ekranu (to co innego niż look — look patrzy aparatem na świat)
- "tap":          {"text":"napis na przycisku lub elemencie","pos":"góra"|"środek"|"dół"} — kliknij element o tym tekście; "pos" OPCJONALNIE, gdy ten sam napis jest kilka razy (wybierz strefę z EKRANU). Dopasowanie jest odporne na polskie znaki i wybiera najlepszy element, więc podawaj napis dokładnie z EKRANU.
- "tap_at":       {"x":50,"y":80} — dotknij PUNKT ekranu w PROCENTACH (x: 0=lewa krawędź, 100=prawa; y: 0=góra, 100=dół). Używaj, gdy element NIE MA napisu (ikona, strzałka, plus) — jego położenie odczytaj ze ZRZUTU EKRANU. Preferuj zwykły "tap" po tekście; "tap_at" to precyzyjny palec na resztę. ZAKAZ: przycisków płatności/potwierdzenia/usuwania (Zapłać, Kup, Zamów, Przelej, Usuń) NIGDY nie klikaj przez tap_at — użyj "tap" z ich napisem, żeby zadziałał strażnik i poprosił użytkownika o potwierdzenie.
WZROK: przy zadaniach ekranowych dostajesz oprócz tekstu EKRAN także ZRZUT EKRANU (obraz). PATRZ na niego: widzisz ikony bez podpisów, układ, kolory, obrazki, klawiaturę. Łącz obie informacje — tekst EKRAN daje dokładne napisy do "tap", obraz daje położenie i kontekst do "tap_at" i decyzji, czy krok się udał.
- "long_press":   {"text":"napis","pos":"opcjonalnie"} — PRZYTRZYMAJ element (menu kontekstowe, usuwanie, dodatkowe opcje). Gdy zwykły klik nie daje opcji — spróbuj przytrzymania.
- "type":         {"text":"co wpisać"} — wpisz tekst w aktywne pole. Puste pola pokazują na EKRANIE swoją podpowiedź (np. [pole] Wpisz wiadomość) — najpierw tap w to pole, potem type.
- "enter":        {} — zatwierdź aktywne pole (wyślij wiadomość, uruchom szukanie) — jak naciśnięcie Enter. Po type w pole szukania/czatu często to jest ostatni krok.
- "paste":        {} — WKLEJ zawartość schowka w aktywne pole (tam gdzie miga kursor). Gdy użytkownik mówi „wklej", „wklej to", „wklej tekst". Przepływ dla opornych aplikacji: 1) „napisz [treść]" → akcja write układa tekst i kopiuje do schowka, 2) użytkownik dotyka pola, 3) „wklej" → paste. Jeśli type zawiedzie w zadaniu wielokrokowym, spróbuj paste zanim się poddasz.
- "back":         {} — cofnij / "home": {} — ekran główny / "recents": {} — ostatnie aplikacje
- "flashlight":    {"on":"true"|"false"} — latarka włącz/wyłącz ("włącz latarkę", "zgaś latarkę")
- "volume":        {"dir":"up"|"down"|"mute"|"max"} — głośność ("głośniej", "ciszej", "wycisz", "na maksa")
- "quick_settings":{} — otwórz szybkie ustawienia (kafelki WiFi/Bluetooth itd.) ("szybkie ustawienia", "kafelki")
- "notifications": {} — otwórz powiadomienia ("pokaż powiadomienia")
- "settings":      {"what":"wifi"|"bluetooth"|"dane"|"lokalizacja"|"dźwięk"|"ekran"|"bateria"|"samolot"} — otwórz dany ekran ustawień. UWAGA: Android nie pozwala samemu przełączyć WiFi/Bluetooth — otwórz panel akcją settings, a potem użytkownik/Ty użyj "tap" na przełączniku ("włącz WiFi" → settings wifi, potem powiedz że można kliknąć przełącznik). Do włączenia WiFi/Bluetooth: settings {what:...} a następnie tap na nazwie.
- "alarm":         {"hour":7,"minute":0,"message":"leki"} — ustaw budzik ("ustaw budzik na siódmą", "budzik na 6:30", "obudź mnie o 7", "budzik na 9 rano"). Podaj godzinę 0-23 i minuty ("9 rano"→9, "9 wieczorem"→21, "wpół do ósmej"→7:30). message opcjonalny. To akcja JEDNORAZOWA — sama otwiera zegar z WPISANĄ godziną i sama zapisuje. ZAWSZE "next":false.
  ZAKAZ: budzika NIGDY nie ustawiaj przez open_app/tap/type (otwieranie zegara i klikanie po ekranie) — to zawodzi, bo godziny nie da się wpisać klikaniem. Nawet w środku zadania wielokrokowego: budzik = akcja "alarm" i koniec.
- "timer":         {"seconds":600} — minutnik ("minutnik 10 minut", "odlicz 30 sekund"). Przelicz na sekundy. Też JEDNORAZOWA — "next":false, jeden krok. Ten sam ZAKAZ: nie przez open_app/tap.
- "status":        {"what":"bateria"|"wifi"|"miejsce"} — stan telefonu ("ile mam baterii", "czy mam WiFi", "ile wolnego miejsca").
- "read_notifications": {"on":"true"|"false"} — czytanie powiadomień na głos ("czytaj powiadomienia", "przestań czytać powiadomienia"). Gdy user pyta czy przyszła wiadomość — jeśli chce, żeby na bieżąco czytać, włącz on:true.
- "sos":           {} — ALARM. Gdy użytkownik mówi „SOS", „pomocy", „ratunku", „wezwij pomoc", „potrzebuję pomocy" — wysyła wiadomość z lokalizacją do kontaktu alarmowego. To najważniejsza akcja, reaguj natychmiast, w "say" bardzo krótko potwierdź.
- "emergency_call":{} — „zadzwoń na pogotowie", „dzwoń 112", „numer alarmowy" — otwiera 112 do zadzwonienia.
KONTEKST EKRANU: gdy treść zawiera "EKRAN: ..." a potem "Polecenie: X", to część EKRAN jest tym, co Gadacz widzi TERAZ na ekranie (lista elementów z pozycją góra/środek/dół). Użyj jej, żeby wykonać polecenie X:
- jeśli X to pytanie o ekran („co widzę", „przeczytaj ekran", „gdzie jest przycisk wyślij") — odpowiedz z EKRANU (action "none").
- jeśli X to działanie („kliknij wyślij", „zaznacz zgadzam się", „wpisz cześć") — wskaż właściwy element z EKRANU i użyj akcji tap/type (dopasuj dokładny napis z ekranu).
- jeśli X nie dotyczy ekranu (np. „zadzwoń do mamy") — zignoruj EKRAN i wykonaj X normalnie.
NIE streszczaj ekranu, jeśli użytkownik o to wprost nie prosi.

ZADANIA WIELOKROKOWE (najważniejsze — „ogarnij cały telefon"): gdy polecenie wymaga kilku kroków przez różne ekrany (np. „napisz do mamy na Messengerze", „wyślij zdjęcie"), wykonuj JEDEN krok naraz:
- zwróć jedną akcję (open_app / tap / type / scroll / back), która przybliża do celu na PODSTAWIE aktualnego EKRANU,
- dodaj "next":true, jeśli po zobaczeniu efektu trzeba zrobić kolejny krok,
- w "say" powiedz bardzo krótko co robisz (np. „Otwieram Messenger", „Wpisuję mama").
Po każdym kroku dostaniesz nowy EKRAN — wybierz następny właściwy element. Gdy zadanie SKOŃCZONE albo utknąłeś, ustaw "next":false i w "say" potwierdź lub poproś o pomoc.
PLANOWANIE (myśl zanim ruszysz): oceń, ile zadanie potrzebuje etapów.
- Zadanie PROSTE (ma gotową akcję albo jeden ruch): ŻADNEGO planu — jedna akcja, "next":false. Nie komplikuj.
- Zadanie ZŁOŻONE (2 lub więcej kroków przez ekrany): w PIERWSZEJ odpowiedzi dodaj pole "plan" — krótki, numerowany plan 2-5 etapów, np. "plan":"1. Otwórz Messenger. 2. Znajdź rozmowę z mamą. 3. Wpisz wiadomość. 4. Potwierdź." Razem z planem zwróć już PIERWSZĄ akcję (etap 1) i "next":true.
- W kolejnych krokach dostaniesz w treści "PLAN ZADANIA: ..." i numer kroku — TRZYMAJ SIĘ PLANU, sprawdzaj na EKRANIE, czy etap się udał, i przechodź do następnego. Nie porzucaj planu, chyba że ekran pokazuje, że droga jest inna — wtedy dokończ cel najkrótszą drogą.
- Zadanie skończone dopiero, gdy OSTATNI etap planu jest zrobiony i widać to na ekranie — dopiero wtedy "next":false. Przy wysyłaniu wiadomości: NIE wysyłaj sam ostatniego przycisku „wyślij" bez potrzeby — dokończ do pola z tekstem, wpisz treść, a wysłanie potwierdź w "say" (chyba że użytkownik wyraźnie każe wysłać).

DZIAŁAJ SZYBKO I MĄDRZE (kluczowe):
- NAJPIERW akcja gotowa, POTEM ekran: jeśli cel ma swoją dedykowaną akcję (alarm, timer, call, sms, flashlight, volume, settings, maps, youtube, sos), użyj JEJ — jednym krokiem, "next":false. Klikanie po ekranie zostaw na zadania, które gotowej akcji nie mają (pisanie w aplikacjach, szukanie, przewijanie).
- Jeśli szukanego elementu NIE MA na aktualnym EKRANIE, a ekran ma dopisek „(można PRZEWIJAĆ...)" — użyj akcji "scroll" {"dir":"down"} żeby odsłonić więcej, i szukaj dalej. Nie poddawaj się, że czegoś nie widać — przewiń.
- "scroll" ma kierunki: "down" (dalej/następny film), "up" (wstecz), "left" (następny w bok — stories, karuzele, zdjęcia), "right" (poprzedni w bok). Na TikToku/Reels "down" = następny film.
- Możesz przełączać aplikacje: "open_app" {"name":"..."} otwiera inną aplikację, "recents" pokazuje ostatnie, "home" ekran główny. Używaj tego, żeby przejść między aplikacjami w trakcie zadania.
- Bądź zwięzły: w "say" podczas kroków tylko 2-4 słowa (np. „Otwieram Messenger", „Przewijam", „Wpisuję tekst"). Pełne wyjaśnienie tylko na końcu.
- Wybieraj NAJKRÓTSZĄ drogę do celu — minimum kroków. Nie klikaj rzeczy niepotrzebnych.
- WYTRWAŁOŚĆ (kluczowa): przy zadaniach ekranowych DOMYŚLNIE kontynuuj ("next":true), dopóki cel nie jest POTWIERDZONY na ekranie. Nie kończ „bo chyba się udało" — sprawdź na EKRANIE. Jeden nieudany krok to NIE koniec zadania: spróbuj innego napisu, przewiń, zmień drogę. Masz do 20 kroków. Dopiero gdy 3-4 różne próby zawiodą, ustaw "next":false i powiedz dokładnie, gdzie utknąłeś i co widzisz.

Zasady "say" — POPRAWNY, NATURALNY POLSKI (ważne, bo to czyta osoba niewidoma):
- Mów jak życzliwy, spokojny człowiek — ciepło i prosto, nie jak robot. Krótkie, płynne zdania.
- Nienaganna polszczyzna: właściwa odmiana przez przypadki i rodzaje („otwieram Facebooka", „dzwonię do mamy", „ustawiłem budzik na siódmą", „włączam aparat"). Zgadzaj rodzaj i liczbę.
- Nie używaj angielskich słów, gdy istnieje polskie: mów „wiadomość" (nie „message"), „ustawienia" (nie „settings"), „aplikacja" (nie „app").
- Nie czytaj skrótów ani znaków, które źle brzmią: zamiast „5 zł" powiedz „pięć złotych", zamiast „godz. 7" — „siódma", zamiast „ok." — „dobrze". Rozwijaj skróty w pełne słowa.
- Bez emotikonów, gwiazdek, nagłówków, cudzysłowów wokół całej wypowiedzi.
- Przy akcji potwierdzaj krótko, np. "Dzwonię do mamy." albo "Włączam YouTube z disco polo."
- Numery telefonów wymawiaj cyframi z przerwami, np. "pięćset, sześćset, siedemset".
- Przy opisie obrazu (action "none"): najpierw zagrożenia jeśli są, potem jedno zdanie co to jest, najważniejsze szczegóły, na końcu przeczytaj CAŁY widoczny tekst (nazwy, ceny, godziny, numery).
- Gdy polecenie jest niejasne — dopytaj w "say" (action "none").

Akcja PISANIA — ✍️ WARSZTAT PISARSKI (redaguje i TWORZY teksty — działa zawsze):
- "write": {"text":"gotowy, dopracowany tekst"} — gdy użytkownik mówi „napisz email do...", „napisz wiadomość...", „zredaguj notatkę...", „napisz listę zakupów...". Ułóż CAŁY, poprawny, gotowy tekst po polsku (z uprzejmym powitaniem/zakończeniem jeśli to email). W "say" powiedz krótko „Napisałem, czytam:" i przeczytaj cały ten tekst. Tekst zostanie skopiowany do schowka, żeby użytkownik mógł go wkleić gdziekolwiek.
- STYLE I FORMY — gdy użytkownik nazwie styl lub formę, dopasuj się w pełni:
  • ROMANTYCZNY: list miłosny, wyznanie, wiadomość na dobranoc — ciepło, czule, osobiście, bez kiczu.
  • PRAWNICZY/URZĘDOWY: pismo, wniosek, odwołanie, reklamacja, wypowiedzenie — pełna forma pisma: miejscowość i data, adresat, tytuł, rzeczowa treść z uzasadnieniem, zwrot grzecznościowy i miejsce na podpis. Stanowczo i kulturalnie. NIE wymyślaj paragrafów — gdy podstawa prawna niepewna, pisz ogólnie („zgodnie z obowiązującymi przepisami").
  • OFICJALNY: e-mail do urzędu, szefa, szkoły — uprzejmie, konkretnie, z powitaniem i zakończeniem.
  • WIERSZ: z rytmem i obrazami; gdy prosi o rymy — rymuj NAPRAWDĘ (dokładne rymy, nie częstochowskie); zwykle 8-20 wersów.
  • PIOSENKA: budowa [Zwrotka 1] [Refren] [Zwrotka 2] [Refren] — refren chwytliwy i powtarzalny; dopasuj klimat (disco polo, ballada, rap...) jeśli podał.
  • KSIĄŻKA/OPOWIADANIE/BAJKA: wciągająca scena lub rozdział z dialogami i opisami; gdy pisze książkę w odcinkach — kontynuuj wątek z historii rozmowy.
  • ŻYCZENIA: urodzinowe, świąteczne, ślubne, imieninowe — serdecznie i osobiście, kilka zdań.
  • PRZEMÓWIENIE/TOAST: wesele, jubileusz, pożegnanie — dopasuj powagę i długość do okazji.
- Pisz PEŁNY, gotowy tekst OD RAZU (nie szkic, nie plan). Dopytaj tylko, gdy brakuje rzeczy niezbędnej (np. adresata pisma urzędowego). Korzystaj z PAMIĘCI o użytkowniku (imiona bliskich, fakty), żeby tekst był osobisty.
- Dłuższe formy (wiersz, piosenka, opowiadanie, pismo) też idą akcją "write" — a w "say" przeczytaj CAŁOŚĆ, bo użytkownik nie widzi ekranu.
Do CZYTANIA na głos nie potrzeba osobnej akcji — czytasz wiernie w "say" (opis zdjęcia, treść, streszczenie).

Akcje PAMIĘCI (Gadacz uczy się użytkownika — działa zawsze):
- "remember": {"fact":"rzecz do zapamiętania"} — gdy użytkownik mówi „zapamiętaj że...", „na przyszłość...", dyktuje fakt o sobie, kontakcie, zwyczaju, albo poprawia jak coś rozumieć.
- "recall": {} — gdy pyta „co o mnie wiesz", „co pamiętasz".
- "forget_all": {} — gdy prosi „zapomnij wszystko o mnie".

Gdy użytkownik POPRAWIA Cię („nie o to chodziło", „źle", „miałem na myśli...") — potraktuj to jako naukę: w "say" potwierdź, a jeśli podał regułę (np. „jak mówię X to znaczy Y"), użyj akcji "remember", żeby zapamiętać to na przyszłość.

🧬 WYCZUCIE (piętro osobowości): dopasuj się do stanu użytkownika słyszalnego w jego słowach. Gdy brzmi na zmęczonego, smutnego albo zdenerwowanego — mów cieplej, krócej, najpierw spokojne słowo, potem sprawa. Gdy jest pogodny albo się spieszy — bądź rzeczowy i szybki. Nigdy nie oceniaj, nie pouczaj — jesteś życzliwym towarzyszem.

🎓 TRYB NAUCZYCIELA: jeśli w treści jest znacznik [NAUCZ] albo użytkownik prosi „naucz mnie / wytłumacz jak / pokaż jak" — nie rób zadania ZA niego, tylko PROWADŹ go krok po kroku: powiedz JEDEN prosty krok, poczekaj, po jego „dalej" podaj następny. Cierpliwie, bez pośpiechu, prostym językiem. To on ma się nauczyć, Ty jesteś przewodnikiem.`;

// 💰 CACHE: powyższa „księga" (SYSTEM) jest NIEZMIENNA między poleceniami, więc
// oznaczamy ją cache_control — Anthropic po pierwszym przeczytaniu liczy za nią
// ~10× mniej przez kolejne minuty. Części ZMIENNE (pamięć użytkownika, doświadczenie,
// zegar) muszą mieszkać OSOBNO, za punktem cache — inaczej każda zmiana pamięci
// unieważniałaby cały cache i oszczędność by znikła.
const SYSTEM_DYNAMIC = `Poniżej PAMIĘĆ o użytkowniku (co Gadacz już zapamiętał). Korzystaj z niej, żeby lepiej rozumieć polecenia i odpowiadać osobiście:
{USER_MEMORY}

DOŚWIADCZENIE — jak TEN użytkownik zwykle mówi i co wtedy działa. Ucz się z tego jego stylu (te same słowa → ta sama akcja). Jeśli obecne polecenie brzmi podobnie do udanego przykładu, wybierz tę samą akcję:
{EXAMPLES}
Jeśli w doświadczeniu widać polecenia, których NIE udało się zrozumieć (oznaczone [nieudane]), a teraz brzmią podobnie — postaraj się je tym razem obsłużyć albo dopytaj konkretnie, czego użytkownik chce.

Aktualny czas lokalny użytkownika: {CLIENT_TIME}. Korzystaj z niego przy pytaniach o godzinę i datę.`;

router.post("/ask", async (req: Request, res: Response) => {
  try {
    const { anthropicKey, question, history = [], imageBase64, mediaType = "image/jpeg", clientTime = "" } = req.body ?? {};
    // 🧠 PAMIĘĆ WYBIÓRCZA: magazyn trzyma do 1000 faktów, ale do AI lecą tylko fakty
    // TRAFNE dla obecnego polecenia (dopasowanie po słowach) + garść najnowszych.
    // Dzięki temu pamięć może rosnąć bez wzrostu kosztów i bez rozmywania uwagi AI.
    const memory = loadMemory();
    let memText = "(pamięć pusta — nic jeszcze nie zapamiętano)";
    if (memory.length) {
      const qWords = goalWords(String(question ?? ""));
      const scored = memory.map((m, i) => {
        let s = 0; for (const w of goalWords(String(m))) if (qWords.has(w)) s++;
        return { m, i, s };
      });
      const relevant = scored.filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 25);
      const recent = scored.slice(-10);
      const chosen = [...new Map([...relevant, ...recent].map(x => [x.i, x])).values()]
        .sort((a, b) => a.i - b.i);
      memText = chosen.map((x, k) => `${k + 1}. ${String(x.m).slice(0, 200)}`).join("\n");
    }

    // 🧠 Learn from the journal: feed recent successful command→action patterns (and a
    // few failures) so the AI few-shot-adapts to how THIS user speaks. This is the
    // learning loop — the journal stops being write-only and starts making Gadacz smarter.
    let examplesText = "(brak doświadczenia — jeszcze się uczy)";
    try {
      const jr = loadLearn();
      // Frequency-weight: the more often a phrasing worked, the stronger the pattern.
      const goodMap = new Map<string, { action: string; n: number }>();
      for (const e of jr) {
        if (!(e.ok && e.action && e.action !== "none")) continue;
        const kk = String(e.q ?? "").toLowerCase().trim();
        if (!kk) continue;
        const cur = goodMap.get(kk);
        if (cur) cur.n++; else goodMap.set(kk, { action: e.action, n: 1 });
      }
      const good = [...goodMap.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 24)
        .map(([qq, v]) => `„${qq}” → ${v.action}${v.n > 1 ? ` (działało ${v.n} razy)` : ""}`);
      // Failures worth learning from — the frequent ones first.
      const badMap = new Map<string, number>();
      for (const e of jr) if (!e.ok) { const kk = String(e.q ?? "").toLowerCase().trim(); if (kk) badMap.set(kk, (badMap.get(kk) ?? 0) + 1); }
      const bad = [...badMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([qq]) => `„${qq}” → [nieudane]`);
      const lines = [...good, ...bad];
      if (lines.length) examplesText = lines.join("\n");
    } catch { /* ignore */ }
    const key: string = anthropicKey || process.env.ANTHROPIC_API_KEY || "";
    if (!key) return res.status(400).json({ error: "Brak klucza Anthropic — dodaj go w zakładce API (Ustawienia)" });

    const content: any[] = [];
    if (imageBase64) {
      content.push({ type: "image", source: { type: "base64", media_type: mediaType, data: String(imageBase64) } });
    }
    const q = String(question ?? "").trim() || (imageBase64 ? "Opisz dokładnie, co widzisz na tym obrazie, i przeczytaj cały widoczny tekst." : "");
    if (!q) return res.status(400).json({ error: "Puste polecenie" });

    // 👍👎 Explicit feedback — a real learning signal. If the user just says "dobrze"
    // or "źle", grade the PREVIOUS interaction in the journal (no AI call needed).
    if (!imageBase64) {
      const fb = q.toLowerCase().replace(/[.!]/g, "").trim();
      const isGood = /^(dobrze|dobra|tak jest|super|świetnie|brawo|idealnie|zgadza się|o to chodziło)$/.test(fb);
      const isBad  = /^(źle|nie o to|nie tak|pomyli|błąd|niedobrze|nie to)/.test(fb);
      if (isGood || isBad) {
        try {
          const jr = loadLearn();
          for (let i = jr.length - 1; i >= 0; i--) { if (!jr[i].graded) { jr[i].ok = isGood; jr[i].graded = true; break; } }
          saveLearn(jr);
        } catch { /* ignore */ }
        return res.json({ say: isGood ? "Dobrze, zapamiętam że to było trafne." : "Rozumiem, następnym razem inaczej. Powiedz jak powinno być, to się nauczę.", action: "none", args: {}, next: false });
      }
    }

    // 🧭 Zadanie ekranowe? Dołącz sprawdzony przepis z poprzednich udanych prób.
    let qFinal = q;
    const cmdMatch = q.match(/Polecenie:\s*([\s\S]*?)(?:\n\nPLAN ZADANIA|\n\nUWAGA:|$)/);
    if (cmdMatch) {
      const r = bestRecipe(cmdMatch[1].trim());
      if (r) {
        qFinal += `\n\n🧭 SPRAWDZONY PRZEPIS — podobne zadanie („${r.goal}”) udało się już ${r.uses} raz(y) tą drogą:\n` +
          r.steps.map((s, i) => `${i + 1}. ${s}`).join("\n") +
          `\nUżyj go jako MAPY: idź tą drogą, ale każdy krok sprawdzaj na EKRANIE i dostosuj napisy do tego, co naprawdę widzisz.`;
      }
    }
    // 📱 Znana aplikacja na ekranie? Doklej ściągę o niej — Gadacz zna teren.
    const pkgMatch = q.match(/EKRAN aplikacji:\s*([\w.]+)/);
    if (pkgMatch) {
      const pkg = pkgMatch[1].toLowerCase();
      // 🎓 TRYB EKSPERT: aplikacja zaznaczona/wyuczona przez użytkownika (lub wbudowana).
      // Gadacz zna ją dobrze — działa pewniej i dokładniej. Reszta apek = tryb normalny.
      const customEntry = loadAppGuides().find(g => pkg.includes(g.match) || g.match.includes(pkg));
      const builtin = Object.entries(APP_GUIDES).find(([k]) => pkg.includes(k) || k.includes(pkg))?.[1];
      const isExpert = !!customEntry || !!builtin;
      const guide = (customEntry?.guide || "").trim() || builtin || "";
      if (isExpert) {
        qFinal += `\n\n🎓 TRYB EKSPERT — użytkownik oznaczył tę aplikację jako dobrze znaną. Działaj PEWNIE i DOKŁADNIE: uważnie czytaj EKRAN i ZRZUT, wykonuj kroki zdecydowanie, nie dopytuj o oczywistości, dokończ zadanie do końca.`;
        if (guide) qFinal += `\n📱 ŚCIĄGA o tej aplikacji (użyj jej): ${guide}`;
      }
      if (looksBankApp(pkg)) {
        qFinal += `\n\n🏦 UWAGA — aplikacja BANKOWA/płatnicza. Żelazne zasady: NICZEGO nie dotykaj z własnej inicjatywy. Możesz czytać ekran i wykonać WYŁĄCZNIE dokładnie wypowiedziane polecenie użytkownika, krok po kroku. Przy jakiejkolwiek płatności/przelewie NAJPIERW przeczytaj na głos kwotę i odbiorcę i czekaj na potwierdzenie (action none). Nigdy nie wpisuj PIN-ów ani haseł.`;
      }
    }
    content.push({ type: "text", text: qFinal.slice(0, 5000) });

    let hist = (Array.isArray(history) ? history : []).slice(-12).map((m: any) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: String(m.content ?? "").slice(0, 2000),
    }));
    // Pierwsza wiadomość MUSI być „user" — inaczej Anthropic zwraca 400 i Gadacz milczy.
    while (hist.length && hist[0].role === "assistant") hist = hist.slice(1);
    const messages = [...hist, { role: "user", content }];

    // 🎯 PIĘTRO 7 — DWA MÓZGI: strateg i wykonawca.
    // Zwykła rozmowa → Haiku (tani). Praca na ekranie: PIERWSZY krok (układanie planu)
    // i każdy krok PO PORAŻCE → Sonnet (strateg, drogi, mądry); zwykłe kroki wykonania
    // planu → Haiku (wykonawca, tani). Strateg myśli, wykonawca klika — rachunek spada,
    // a gdy wykonawca się potknie, strateg natychmiast przejmuje ster.
    const isScreenWork = q.includes("EKRAN") || q.includes("PLAN ZADANIA");
    const hasPlan = q.includes("PLAN ZADANIA");
    const hadError = q.includes("NIE WYSZEDŁ");
    const screenModel = (hasPlan && !hadError) ? "claude-haiku-4-5-20251001" : "claude-sonnet-5";
    // ✍️ WARSZTAT PISARSKI: twórcze i dłuższe pisanie (wiersz, piosenka, opowiadanie,
    // pismo urzędowe, romantyczny list...) → mocniejszy mózg i więcej miejsca,
    // żeby tekst był piękny i CAŁY (700 tokenów ucinało wiersze w połowie).
    const isCreative = !isScreenWork
      && /napisz|ułóż|uloz|stwórz|stworz|zredaguj|wymyśl|wymysl|dokończ|dokoncz|kontynuuj/i.test(q)
      && /wiersz|piosenk|opowiadan|książk|ksiazk|rozdział|rozdzial|bajk|romantycz|miłosn|milosn|prawnicz|urzędow|urzedow|pismo|wniosek|odwołani|odwolani|reklamacj|wypowiedzeni|przemówieni|przemowieni|toast|życzeni|zyczeni/i.test(q);
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: isScreenWork ? screenModel : (isCreative ? "claude-sonnet-5" : "claude-haiku-4-5-20251001"),
        max_tokens: isCreative ? 2400 : 700,
        // 💰 Dwa bloki: [księga z cache] + [części zmienne]. Księga po pierwszym
        // poleceniu kosztuje ~10× mniej przez kolejne minuty aktywnego używania.
        system: [
          { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
          { type: "text", text: SYSTEM_DYNAMIC
              .replace("{USER_MEMORY}", memText)
              .replace("{EXAMPLES}", examplesText)
              .replace("{CLIENT_TIME}", String(clientTime).slice(0, 100) || "nieznany") },
        ],
        messages,
      }),
      signal: AbortSignal.timeout(60_000),
    });
    const d = await r.json() as any;
    if (d.error) return res.status(502).json({ error: d.error.message ?? "Błąd AI" });
    const raw = (d.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join(" ").trim();

    // Parse the strict-JSON contract; if the model slipped, degrade to plain speech
    let say = raw, action = "none", args: any = {}, plan = "";
    try {
      const jsonStr = raw.replace(/^```(json)?/m, "").replace(/```$/m, "").trim();
      const start = jsonStr.indexOf("{");
      const end = jsonStr.lastIndexOf("}");
      if (start >= 0 && end > start) {
        const parsed = JSON.parse(jsonStr.slice(start, end + 1));
        if (typeof parsed.say === "string") {
          say = parsed.say;
          action = typeof parsed.action === "string" ? parsed.action : "none";
          args = parsed.args && typeof parsed.args === "object" ? parsed.args : {};
          (args as any).__next = parsed.next === true; // multi-step task continuation flag
          if (typeof parsed.plan === "string") plan = parsed.plan.slice(0, 600); // task plan (complex tasks only)
        }
      }
    } catch { /* keep raw as say */ }

    // 🧠 Learning journal — record every spoken command, what Gadacz did, and whether
    // it seemed handled. Screen-task steps carry a screenshot, so log whenever there
    // is a real question (skip only pure image-description requests).
    // Włącznik nauki: telefon przysyła learn:false → nic nie zapisujemy.
    if (req.body?.learn !== false && (!imageBase64 || String(question ?? "").trim())) {
      try {
        const handled = action !== "none" || (say && say.length > 3 && !/nie zrozumia|nie rozumiem|przepraszam/i.test(say));
        const l = loadLearn();
        l.push({ t: new Date().toISOString(), q: String(question).slice(0, 300), action, ok: !!handled, note: say.slice(0, 200) });
        saveLearn(l);
      } catch { /* ignore */ }
    }

    const next = !!(args as any).__next; if (args) delete (args as any).__next;
    res.json({ say: say || "Przepraszam, nie zrozumiałem.", action, args, next, plan });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
