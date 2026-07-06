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
  try { return JSON.parse(fs.readFileSync(MEMORY_FILE, "utf8")); } catch { return []; }
}
function saveMemory(list: string[]) {
  try { fs.mkdirSync(path.dirname(MEMORY_FILE), { recursive: true }); fs.writeFileSync(MEMORY_FILE, JSON.stringify(list.slice(-200))); } catch { /* ignore */ }
}

// ── Learning journal — Gadacz records every interaction (command → action →
// outcome) so patterns of what confuses it surface. You (and the master) can
// review it to improve how Gadacz helps. Kept last 300.
const LEARN_FILE = path.resolve(process.cwd(), "data", "gadacz_learn.json");
function loadLearn(): any[] { try { return JSON.parse(fs.readFileSync(LEARN_FILE, "utf8")); } catch { return []; } }
function saveLearn(l: any[]) { try { fs.mkdirSync(path.dirname(LEARN_FILE), { recursive: true }); fs.writeFileSync(LEARN_FILE, JSON.stringify(l.slice(-300))); } catch {} }
router.get("/log", (_req, res) => res.json({ log: loadLearn().slice(-100) }));
router.post("/log", (req, res) => {
  const { question, action, ok, note } = req.body ?? {};
  const l = loadLearn();
  l.push({ t: new Date().toISOString(), q: String(question ?? "").slice(0, 300), action: String(action ?? "none"), ok: ok !== false, note: String(note ?? "").slice(0, 300) });
  saveLearn(l);
  res.json({ ok: true });
});
router.post("/log/clear", (_req, res) => { saveLearn([]); res.json({ ok: true }); });

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
- "none":         {} — zwykła rozmowa, pytanie, opis obrazu; całą odpowiedź daj w "say"

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
Przykłady: „otwórz trading bota" → navigate bot. „pokaż zyski" → navigate pnl. „przejdź do ustawień" → navigate api. „wróć do pulpitu" → navigate dashboard.
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

Akcje EKRANOWE (działają tylko w aplikacji Android "Gadacz" z włączoną usługą dostępności; w wersji przeglądarkowej odpowiedz w "say", że potrzebna jest aplikacja Gadacz):
- "read_screen":  {} — użytkownik pyta co jest na ekranie / prosi o przeczytanie ekranu
- "tap":          {"text":"napis na przycisku lub elemencie"} — kliknij element o tym tekście
- "type":         {"text":"co wpisać"} — wpisz tekst w aktywne pole
- "open_app":     {"name":"nazwa aplikacji"} — otwórz zainstalowaną aplikację (np. Messenger, WhatsApp)
- "back":         {} — cofnij / "home": {} — ekran główny / "recents": {} — ostatnie aplikacje
- "flashlight":    {"on":"true"|"false"} — latarka włącz/wyłącz ("włącz latarkę", "zgaś latarkę")
- "volume":        {"dir":"up"|"down"|"mute"|"max"} — głośność ("głośniej", "ciszej", "wycisz", "na maksa")
- "quick_settings":{} — otwórz szybkie ustawienia (kafelki WiFi/Bluetooth itd.) ("szybkie ustawienia", "kafelki")
- "notifications": {} — otwórz powiadomienia ("pokaż powiadomienia")
- "settings":      {"what":"wifi"|"bluetooth"|"dane"|"lokalizacja"|"dźwięk"|"ekran"|"bateria"|"samolot"} — otwórz dany ekran ustawień. UWAGA: Android nie pozwala samemu przełączyć WiFi/Bluetooth — otwórz panel akcją settings, a potem użytkownik/Ty użyj "tap" na przełączniku ("włącz WiFi" → settings wifi, potem powiedz że można kliknąć przełącznik). Do włączenia WiFi/Bluetooth: settings {what:...} a następnie tap na nazwie.
KONTEKST EKRANU: gdy treść zawiera "EKRAN: ..." a potem "Polecenie: X", to część EKRAN jest tym, co Gadacz widzi TERAZ na ekranie (lista elementów z pozycją góra/środek/dół). Użyj jej, żeby wykonać polecenie X:
- jeśli X to pytanie o ekran („co widzę", „przeczytaj ekran", „gdzie jest przycisk wyślij") — odpowiedz z EKRANU (action "none").
- jeśli X to działanie („kliknij wyślij", „zaznacz zgadzam się", „wpisz cześć") — wskaż właściwy element z EKRANU i użyj akcji tap/type (dopasuj dokładny napis z ekranu).
- jeśli X nie dotyczy ekranu (np. „zadzwoń do mamy") — zignoruj EKRAN i wykonaj X normalnie.
NIE streszczaj ekranu, jeśli użytkownik o to wprost nie prosi.

Zasady "say":
- Krótki, płynny język mówiony (będzie czytany syntezatorem) — bez emotikonów, gwiazdek, nagłówków.
- Przy akcji potwierdzaj krótko, np. "Dzwonię do mamy." albo "Włączam YouTube z disco polo."
- Numery telefonów wymawiaj cyframi z przerwami, np. "pięćset, sześćset, siedemset".
- Przy opisie obrazu (action "none"): najpierw zagrożenia jeśli są, potem jedno zdanie co to jest, najważniejsze szczegóły, na końcu przeczytaj CAŁY widoczny tekst (nazwy, ceny, godziny, numery).
- Gdy polecenie jest niejasne — dopytaj w "say" (action "none").

Akcja PISANIA (redaguje tekst na dyktando — działa zawsze):
- "write": {"text":"gotowy, dopracowany tekst"} — gdy użytkownik mówi „napisz email do...", „napisz wiadomość...", „zredaguj notatkę...", „napisz listę zakupów...". Ułóż CAŁY, poprawny, gotowy tekst po polsku (z uprzejmym powitaniem/zakończeniem jeśli to email). W "say" powiedz krótko „Napisałem, czytam:" i przeczytaj cały ten tekst. Tekst zostanie skopiowany do schowka, żeby użytkownik mógł go wkleić gdziekolwiek.
Do CZYTANIA na głos nie potrzeba osobnej akcji — czytasz wiernie w "say" (opis zdjęcia, treść, streszczenie).

Akcje PAMIĘCI (Gadacz uczy się użytkownika — działa zawsze):
- "remember": {"fact":"rzecz do zapamiętania"} — gdy użytkownik mówi „zapamiętaj że...", „na przyszłość...", dyktuje fakt o sobie, kontakcie, zwyczaju, albo poprawia jak coś rozumieć.
- "recall": {} — gdy pyta „co o mnie wiesz", „co pamiętasz".
- "forget_all": {} — gdy prosi „zapomnij wszystko o mnie".

Poniżej PAMIĘĆ o użytkowniku (co Gadacz już zapamiętał). Korzystaj z niej, żeby lepiej rozumieć polecenia i odpowiadać osobiście:
{USER_MEMORY}

Aktualny czas lokalny użytkownika: {CLIENT_TIME}. Korzystaj z niego przy pytaniach o godzinę i datę.`;

router.post("/ask", async (req: Request, res: Response) => {
  try {
    const { anthropicKey, question, history = [], imageBase64, mediaType = "image/jpeg", clientTime = "" } = req.body ?? {};
    // Memory lives on the server — read it here so it's the single source of truth.
    const memory = loadMemory();
    const memText = memory.length
      ? memory.slice(-40).map((m, i) => `${i + 1}. ${String(m).slice(0, 200)}`).join("\n")
      : "(pamięć pusta — nic jeszcze nie zapamiętano)";
    const key: string = anthropicKey || process.env.ANTHROPIC_API_KEY || "";
    if (!key) return res.status(400).json({ error: "Brak klucza Anthropic — dodaj go w zakładce API (Ustawienia)" });

    const content: any[] = [];
    if (imageBase64) {
      content.push({ type: "image", source: { type: "base64", media_type: mediaType, data: String(imageBase64) } });
    }
    const q = String(question ?? "").trim() || (imageBase64 ? "Opisz dokładnie, co widzisz na tym obrazie, i przeczytaj cały widoczny tekst." : "");
    if (!q) return res.status(400).json({ error: "Puste polecenie" });
    content.push({ type: "text", text: q.slice(0, 4000) });

    const messages = [
      ...(Array.isArray(history) ? history : []).slice(-8).map((m: any) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content ?? "").slice(0, 2000),
      })),
      { role: "user", content },
    ];

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 700,
        system: SYSTEM
          .replace("{CLIENT_TIME}", String(clientTime).slice(0, 100) || "nieznany")
          .replace("{USER_MEMORY}", memText),
        messages,
      }),
      signal: AbortSignal.timeout(60_000),
    });
    const d = await r.json() as any;
    if (d.error) return res.status(502).json({ error: d.error.message ?? "Błąd AI" });
    const raw = (d.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join(" ").trim();

    // Parse the strict-JSON contract; if the model slipped, degrade to plain speech
    let say = raw, action = "none", args: any = {};
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
        }
      }
    } catch { /* keep raw as say */ }

    // 🧠 Learning journal — record every spoken command, what Gadacz did, and whether
    // it seemed handled (action taken or a real answer). Text/voice only, not images.
    if (!imageBase64) {
      try {
        const handled = action !== "none" || (say && say.length > 3 && !/nie zrozumia|nie rozumiem|przepraszam/i.test(say));
        const l = loadLearn();
        l.push({ t: new Date().toISOString(), q: String(question).slice(0, 300), action, ok: !!handled, note: say.slice(0, 200) });
        saveLearn(l);
      } catch { /* ignore */ }
    }

    res.json({ say: say || "Przepraszam, nie zrozumiałem.", action, args });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
