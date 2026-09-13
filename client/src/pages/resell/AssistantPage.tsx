/**
 * 🗣️ Gadacz — voice phone control for blind and low-vision users (Etap 1: web).
 *
 * Speak a command → AI turns it into {say, action, args} → Gadacz reads "say"
 * aloud and EXECUTES the action by launching the right system app:
 *   call → dialer, sms → messages, maps → Google Maps, youtube/search/open → browser.
 * Contacts live in a local voice-built address book (localStorage) — "zapisz
 * kontakt mama numer pięćset..." → "zadzwoń do mamy" just works.
 *
 * Full control INSIDE other apps (tapping their buttons, reading their screens)
 * is impossible from a web page — that's Etap 2: native Android AccessibilityService.
 */
import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { ResellLayout } from "@/components/resell/ResellLayout";
import { getAnthropicKey } from "@/lib/apiKeys";
import { installPinFetch } from "@/lib/botPin";
import { PinUnlock } from "@/components/resell/PinUnlock";
import * as palette from "@/design/palette";
import * as assistant from "@/design/assistant";

installPinFetch(); // Gadacz endpoints require the app PIN — attach it to every call

// Gadacz's map of our own app — voice command → route. This is how Gadacz first
// learns to operate ResellAssist itself before it ever touches other apps.
const APP_TABS: Record<string, { path: string; name: string }> = {
  dashboard:   { path: "/resell",              name: "Pulpit" },
  agent:       { path: "/resell/agent",        name: "Agent AI" },
  marketing:   { path: "/resell/marketing",    name: "Marketing" },
  search:      { path: "/resell/search",       name: "Szukaj" },
  pipeline:    { path: "/resell/saved",        name: "Pipeline" },
  pnl:         { path: "/resell/pnl",          name: "Zyski i straty" },
  alerts:      { path: "/resell/alerts",       name: "Alerty" },
  trends:      { path: "/resell/trends",       name: "Trendy" },
  competitors: { path: "/resell/competitors",  name: "Rywale" },
  compare:     { path: "/resell/compare",      name: "Porównaj" },
  markets:     { path: "/resell/market-scan",  name: "Rynki" },
  dropship:    { path: "/resell/dropship",     name: "Dropshipping" },
  suppliers:   { path: "/resell/suppliers",    name: "Dostawcy" },
  photo:       { path: "/resell/photo",        name: "Ze zdjęcia" },
  copy:        { path: "/resell/quick-list",   name: "Kopiuj" },
  autopilot:   { path: "/resell/autopilot",    name: "Autopilot" },
  bot:         { path: "/resell/trading-bot",  name: "Trading Bot" },
  api:         { path: "/resell/settings",     name: "Ustawienia API" },
  gadacz:      { path: "/resell/assistant",    name: "Gadacz" },
  reklama:     { path: "/resell/ads",          name: "Reklama" },
  filmiki:     { path: "/resell/video",        name: "Filmiki" },
  aktualizacja: { path: "/resell/update",      name: "Aktualizacja" },
};

type Msg = { role: "user" | "assistant"; content: string };

const SpeechRec: any =
  typeof window !== "undefined" ? ((window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition) : null;

function vibrate(pattern: number | number[]) {
  try { navigator.vibrate?.(pattern); } catch { /* ignore */ }
}

// ── Voice-built local address book ─────────────────────────────────────────────
const CONTACTS_KEY = "gadacz_contacts_v1";
function loadContacts(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(CONTACTS_KEY) ?? "{}"); } catch { return {}; }
}
function saveContact(name: string, number: string) {
  const c = loadContacts();
  c[name.trim().toLowerCase()] = number.replace(/[^\d+]/g, "");
  try { localStorage.setItem(CONTACTS_KEY, JSON.stringify(c)); } catch { /* ignore */ }
}
// Gadacz's learning memory now lives on the SERVER (in the app), see /api/assistant/memory.

// "who" may be a saved name (fuzzy) or a spoken number
function resolveContact(who: string): string | null {
  const w = (who ?? "").trim().toLowerCase();
  if (!w) return null;
  const asNumber = w.replace(/[^\d+]/g, "");
  if (asNumber.length >= 7) return asNumber;
  const contacts = loadContacts();
  if (contacts[w]) return contacts[w];
  const hit = Object.keys(contacts).find(n => n.includes(w) || w.includes(n));
  return hit ? contacts[hit] : null;
}

export default function AssistantPage() {
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<"idle" | "listening" | "thinking" | "speaking">("idle");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [lastAnswer, setLastAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pinNeeded, setPinNeeded] = useState(false);
  const [memory, setMemory] = useState<string[]>([]);
  const refreshMemory = () => fetch("/api/assistant/memory").then(r => r.json()).then(d => setMemory(d.memory ?? [])).catch(() => {});
  useEffect(() => { refreshMemory(); }, []);

  // 🎭 SYSTEMY GADACZA — wybieralne osobowości (niewidomi/prawnik/lekarz/żartowniś/
  // bajerant/sprzedawca). Wybór trzymany NA SERWERZE — telefon i www widzą to samo.
  type PersonaInfo = { key: string; name: string; icon: string; desc: string };
  const [personas, setPersonas] = useState<PersonaInfo[]>([]);
  const [persona, setPersona] = useState("niewidomi");
  const [typed, setTyped] = useState("");   // ⌨️ pisanie z twarzą jak w czacie
  const [personaOpen, setPersonaOpen] = useState(false);  // twarze zwinięte domyślnie
  useEffect(() => {
    fetch("/api/assistant/persona").then(r => r.json())
      .then(d => { setPersonas(d.list ?? []); if (d.persona) setPersona(d.persona); }).catch(() => {});
  }, []);
  const pickPersona = (key: string) => {
    setPersona(key);
    fetch("/api/assistant/persona", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ persona: key }) })
      .catch(() => {});
  };

  // 🏢 PIĘTRA GADACZA — 20 zdolności z włącznikiem. Zapis na serwerze, telefon respektuje.
  const [floors, setFloors] = useState<Record<string, boolean>>({});
  const [floorsOpen, setFloorsOpen] = useState(false);
  useEffect(() => { fetch("/api/assistant/floors").then(r => r.json()).then(d => setFloors(d.floors ?? {})).catch(() => {}); }, []);
  const toggleFloor = (key: string) => {
    const on = floors[key] === false; // odwracamy
    setFloors(p => ({ ...p, [key]: on }));
    fetch("/api/assistant/floors", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key, on }) }).catch(() => {});
  };
  const FLOOR_LIST: { key: string; nr: number; name: string; desc: string }[] = [
    { key: "latarka_glosnosc", nr: 1, name: "Latarka i głośność", desc: "„włącz latarkę”, „głośniej”, „ciszej”" },
    { key: "budziki", nr: 1, name: "Budziki i minutniki", desc: "„ustaw budzik na 9”, „minutnik 5 minut”" },
    { key: "dzwonienie", nr: 1, name: "Dzwonienie", desc: "„zadzwoń na 112”, po numerze" },
    { key: "otwieranie_apek", nr: 1, name: "Otwieranie aplikacji", desc: "„otwórz Facebooka”, „włącz aparat”" },
    { key: "sos", nr: 1, name: "SOS / alarm", desc: "„ratunku” → wiadomość do opiekuna" },
    { key: "nawyki", nr: 2, name: "Nawyki (przepisy dróg)", desc: "znane zadania z pamięci, bez AI" },
    { key: "autopilot", nr: 2, name: "Autopilot", desc: "sprawdzoną drogę robi bez AI" },
    { key: "zdarzenia", nr: 4, name: "Przypomnienia i czujniki", desc: "„przypominaj o lekach o 8”, słaba bateria" },
    { key: "straznik", nr: 5, name: "Strażnik płatności", desc: "„Zapłać/Usuń” tylko po „potwierdzam”" },
    { key: "mowa_niedbala", nr: 6, name: "Rozumienie mowy niedbałej", desc: "„no włącz no tę latarkę”" },
    { key: "przewidywanie", nr: 8, name: "Przewidywanie", desc: "„co teraz?” — z Twojego rytmu dnia" },
    { key: "opiekun", nr: 9, name: "Opiekun", desc: "po dobie ciszy pyta „wszystko dobrze?”" },
    { key: "oczy", nr: 11, name: "Oczy na świat (aparat)", desc: "„co przede mną?”, „przeczytaj to”" },
    { key: "numerki", nr: 3, name: "Tryb numerków", desc: "numeruje przyciski, mówisz numer" },
    { key: "poranny_raport", nr: 16, name: "Poranny raport", desc: "„poranny raport” — dzień jednym ciągiem" },
    { key: "osobowosc", nr: 17, name: "Wyczucie nastroju", desc: "dopasowuje ton do Twojego stanu" },
    { key: "nauczyciel", nr: 18, name: "Nauczyciel", desc: "„naucz mnie jak…” — krok po kroku" },
    { key: "samonaprawa", nr: 19, name: "Samonaprawa", desc: "„gdzie się mylisz?”" },
    { key: "czytanie_powiadomien", nr: 4, name: "Czytanie powiadomień", desc: "czyta wiadomości na głos" },
    { key: "odruchy", nr: 1, name: "Odruchy (godzina, bateria…)", desc: "„która godzina”, „ile baterii” — bez AI" },
  ];
  // 📱➕ WŁASNE APLIKACJE — użytkownik uczy Gadacza obsługi dowolnej apki.
  const [appGuides, setAppGuides] = useState<{ match: string; name: string; guide: string }[]>([]);
  // 🎓 Miniaturki: wbudowane „nauczone" aplikacje z serwera (nazwa + ikonka).
  const [builtinTiles, setBuiltinTiles] = useState<{ match: string; name: string; icon: string }[]>([]);
  const [agOpen, setAgOpen] = useState(true); // panel widoczny od razu — kafelki na ekranie
  const [agMatch, setAgMatch] = useState(""); const [agName, setAgName] = useState(""); const [agGuide, setAgGuide] = useState("");
  const refreshAppGuides = () => fetch("/api/assistant/appguides").then(r => r.json())
    .then(d => { setAppGuides(d.guides ?? []); setBuiltinTiles(d.builtin ?? []); }).catch(() => {});
  // ikonka dla własnej apki: jeśli pakiet pasuje do wbudowanej — bierzemy jej ikonkę
  const iconFor = (g: { match: string; name: string }) =>
    builtinTiles.find(b => g.match.toLowerCase().includes(b.match) || b.match.includes(g.match.toLowerCase())
      || b.name.toLowerCase() === g.name.toLowerCase())?.icon ?? "📱";
  useEffect(() => { refreshAppGuides(); }, []);
  const addAppGuide = () => {
    if (!agMatch.trim()) return; // instrukcja opcjonalna — sam match wystarcza (tryb ekspert)
    fetch("/api/assistant/appguides", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ match: agMatch, name: agName || agMatch, guide: agGuide }) })
      .then(r => r.json()).then(() => { setAgMatch(""); setAgName(""); setAgGuide(""); refreshAppGuides(); }).catch(() => {});
  };
  const delAppGuide = (match: string) => {
    fetch("/api/assistant/appguides/delete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ match }) })
      .then(() => refreshAppGuides()).catch(() => {});
  };

  // ✍️ WARSZTAT PISARSKI — Gadacz pisze: wiersze, piosenki, opowiadania, pisma, listy.
  const [wsOpen, setWsOpen] = useState(false);
  const [wsTopic, setWsTopic] = useState("");
  const WS_STYLES: { icon: string; name: string; prompt: string }[] = [
    { icon: "🌹", name: "Wiersz",           prompt: "Napisz piękny wiersz o:" },
    { icon: "🎵", name: "Piosenka",         prompt: "Napisz tekst piosenki, ze zwrotkami i refrenem, o:" },
    { icon: "📖", name: "Opowiadanie",      prompt: "Napisz wciągające opowiadanie o:" },
    { icon: "💌", name: "List romantyczny", prompt: "Napisz romantyczny list. Do kogo i o czym:" },
    { icon: "⚖️", name: "Pismo urzędowe",   prompt: "Napisz oficjalne pismo urzędowe w sprawie:" },
    { icon: "📧", name: "E-mail oficjalny", prompt: "Napisz oficjalny e-mail w sprawie:" },
    { icon: "🎂", name: "Życzenia",         prompt: "Napisz serdeczne życzenia z okazji:" },
    { icon: "🗣️", name: "Przemówienie",     prompt: "Napisz krótkie przemówienie na okazję:" },
  ];
  const writeStyled = (prompt: string) => {
    const t = wsTopic.trim();
    if (!t) { speak("Najpierw wpisz temat — o czym mam napisać."); return; }
    ask(`${prompt} ${t}`);
  };

  // Hands-free continuous mode: after each answer, auto-listen again (while tab is open).
  const [continuous, setContinuous] = useState<boolean>(() => { try { return localStorage.getItem("gadacz_continuous") === "1"; } catch { return false; } });
  const continuousRef = useRef(continuous);
  continuousRef.current = continuous;
  const toggleContinuous = () => {
    const next = !continuous;
    setContinuous(next);
    try { localStorage.setItem("gadacz_continuous", next ? "1" : "0"); } catch {}
    if (next) { speak("Tryb ciągły włączony. Mów, a ja słucham."); }
    else { speak("Tryb ciągły wyłączony."); }
  };
  const recRef = useRef<any>(null);
  const busyRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const messagesRef = useRef<Msg[]>([]);
  messagesRef.current = messages;

  // ── Speech output ───────────────────────────────────────────────────────────
  const speak = (text: string, onDone?: () => void) => {
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "pl-PL";
      u.rate = 1.0;
      const plVoice = window.speechSynthesis.getVoices().find(v => v.lang?.startsWith("pl"));
      if (plVoice) u.voice = plVoice;
      u.onend = () => {
        setStatus("idle");
        onDone?.();
        // Hands-free: after speaking, listen again automatically (tab must stay open)
        if (continuousRef.current && !busyRef.current) {
          setTimeout(() => { if (continuousRef.current) startListenRef.current?.(); }, 600);
        }
      };
      setStatus("speaking");
      window.speechSynthesis.speak(u);
    } catch { setStatus("idle"); onDone?.(); }
  };
  const startListenRef = useRef<(() => void) | null>(null);
  const stopSpeaking = () => { try { window.speechSynthesis.cancel(); } catch {} setStatus("idle"); };

  useEffect(() => () => { try { window.speechSynthesis.cancel(); recRef.current?.abort?.(); } catch {} }, []);

  // ── Execute a phone action by launching the right system app ────────────────
  const launch = (url: string) => { setTimeout(() => { window.location.href = url; }, 400); };
  // Voice-drive the app's own functions: report status / wallet / market, or control
  // the bot. All reads speak a spoken summary; controls confirm out loud.
  const appAction = async (doWhat: string, say: string, args: any = {}) => {
    const fmt$ = (n: number) => `${n >= 0 ? "plus " : "minus "}${Math.abs(n).toFixed(2)} dolara`;
    try {
      if (doWhat === "bot_status" || doWhat === "sim_status" || doWhat === "market" || doWhat === "shadow") {
        const r = await fetch("/api/bot/status"); const s = await r.json();
        if (doWhat === "bot_status") {
          const p = s.positions?.length ?? 0;
          speak(`Bot: ${fmt$(s.sessionPnl ?? 0)}. ${s.sessionStats?.wins ?? 0} wygranych, ${s.sessionStats?.losses ?? 0} przegranych. ${p} otwartych pozycji.`);
        } else if (doWhat === "sim_status") {
          const sp = s.paper;
          speak(sp?.running ? `Symulacja: ${fmt$(sp.pnl ?? 0)}. ${sp.wins} wygranych, ${sp.losses} przegranych.` : "Symulacja jest wyłączona.");
        } else if (doWhat === "market") {
          const bt = s.btcGuard, oh = s.overheat, tg = s.trendGate;
          let m = "";
          if (bt?.chg1h != null) m += `Bitcoin ${bt.chg1h >= 0 ? "rośnie" : "spada"} ${Math.abs(bt.chg1h)} procent na godzinę. `;
          if (oh) m += oh.hot ? "Rynek przegrzany, longi wstrzymane. " : `Termometr ${oh.score} na sto. `;
          if (tg?.bearish) m += "Trend spadkowy, nie kupuję. ";
          if (bt?.active) m += "Straż Bitcoina aktywna, zakupy wstrzymane. ";
          speak(m || "Rynek w normie.");
        } else {
          const sh = s.shadow;
          speak(sh ? `Prawie kupione: ${fmt$(sh.pnl ?? 0)}. ${sh.wins} wygranych, ${sh.losses} przegranych. Ujemny wynik znaczy, że filtry słusznie odrzucały.` : "Brak danych.");
        }
        return;
      }
      if (doWhat === "wallet") {
        const r = await fetch("/api/bot/wallet"); const w = await r.json();
        if (w.error) { speak("Nie mam dostępu do portfela. " + w.error); return; }
        const cash = (w.fiat ?? []).map((f: any) => `${f.amount.toFixed(2)} ${f.cur}`).join(", ");
        const top = (w.coins ?? []).slice(0, 4).map((c: any) => `${c.name} ${c.value.toFixed(2)}`).join(", ");
        speak(`Portfel: gotówka ${cash || "zero"}. Krypto razem około ${w.totalCrypto} ${w.valuedIn}. Największe: ${top || "brak"}.`);
        return;
      }
      if (doWhat === "btc" || doWhat === "weather") {
        const city = (args?.city ? `&city=${encodeURIComponent(args.city)}` : "");
        const r = await fetch(`/api/assistant/info?do=${doWhat}${city}`); const d = await r.json();
        speak(d.say ?? "Nie mam tej informacji.");
        return;
      }
      if (doWhat === "bot_stop") {
        await fetch("/api/bot/stop", { method: "POST" });
        speak("Bot zatrzymany.");
        return;
      }
      if (doWhat === "sweep_dust") {
        speak(say || "Wymiatam kurz z portfela.");
        const r = await fetch("/api/bot/sweep-dust", { method: "POST" }); const d = await r.json();
        if (d.error) speak("Nie udało się: " + d.error);
        else speak(d.swept?.length ? `Uwolniono około ${d.freed} ${d.fiat} z ${d.swept.length} monet.` : "Portfel czysty, nie było kurzu.");
        return;
      }
      speak(say || "Nie znam tej funkcji.");
    } catch (e: any) {
      speak("Wystąpił błąd przy odczycie. " + (e.message ?? ""));
    }
  };

  const executeAction = (action: string, args: any, say: string) => {
    switch (action) {
      case "navigate": {
        const tab = APP_TABS[String(args?.tab ?? "").toLowerCase()];
        if (!tab) { speak(say || "Nie znam takiej zakładki."); return; }
        speak(say || `Otwieram: ${tab.name}.`);
        setTimeout(() => setLocation(tab.path), 300);
        return;
      }
      case "app_action": {
        appAction(String(args?.do ?? ""), say, args);
        return;
      }
      case "write": {
        const text = String(args?.text ?? "").trim();
        if (!text) { speak("Nie zrozumiałem, co mam napisać."); return; }
        setMessages(m => [...m, { role: "assistant", content: "✍️ " + text }]);
        navigator.clipboard?.writeText(text).catch(() => {});
        speak(say || `Napisałem, czytam: ${text}`);
        return;
      }
      case "remember": {
        const fact = String(args?.fact ?? "").trim();
        if (!fact) { speak("Nie zrozumiałem, co mam zapamiętać."); return; }
        fetch("/api/assistant/memory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fact }) })
          .then(() => { refreshMemory(); speak(say || `Zapamiętałem: ${fact}.`); })
          .catch(() => speak("Nie udało się zapisać."));
        return;
      }
      case "recall": {
        fetch("/api/assistant/memory").then(r => r.json()).then(d => {
          const m: string[] = d.memory ?? [];
          setMemory(m);
          speak(m.length ? `Pamiętam ${m.length} rzeczy. ${m.join(". ")}.` : "Jeszcze nic o Tobie nie pamiętam. Powiedz: zapamiętaj, że...");
        }).catch(() => speak("Nie udało się odczytać pamięci."));
        return;
      }
      case "forget_all": {
        fetch("/api/assistant/memory/clear", { method: "POST" })
          .then(() => { refreshMemory(); speak("Wyczyściłem całą pamięć o Tobie."); })
          .catch(() => speak("Nie udało się wyczyścić."));
        return;
      }
      case "call": {
        const num = resolveContact(args?.who ?? "");
        if (!num) { speak(`Nie znam numeru do: ${args?.who ?? "tej osoby"}. Powiedz: zapisz kontakt ${args?.who ?? ""}, numer, i podyktuj cyfry.`); return; }
        speak(say || `Dzwonię.`);
        launch(`tel:${num}`);
        return;
      }
      case "sms": {
        const num = resolveContact(args?.who ?? "");
        if (!num) { speak(`Nie znam numeru do: ${args?.who ?? "tej osoby"}. Najpierw zapisz kontakt.`); return; }
        speak(say || "Otwieram wiadomość.");
        launch(`sms:${num}?body=${encodeURIComponent(args?.text ?? "")}`);
        return;
      }
      case "save_contact": {
        const name = String(args?.name ?? "").trim();
        const number = String(args?.number ?? "").replace(/[^\d+]/g, "");
        if (!name || number.length < 7) { speak("Nie zrozumiałem nazwy albo numeru. Powiedz na przykład: zapisz kontakt mama, numer pięćset sześćset siedemset osiemset dziewięćset."); return; }
        saveContact(name, number);
        speak(say || `Zapisałem kontakt ${name}.`);
        return;
      }
      case "maps": {
        speak(say || "Otwieram mapę.");
        launch(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(args?.query ?? "")}`);
        return;
      }
      case "youtube": {
        speak(say || "Włączam YouTube.");
        launch(`https://www.youtube.com/results?search_query=${encodeURIComponent(args?.query ?? "")}`);
        return;
      }
      case "search": {
        speak(say || "Szukam.");
        launch(`https://www.google.com/search?q=${encodeURIComponent(args?.query ?? "")}`);
        return;
      }
      case "open": {
        const url = String(args?.url ?? "");
        if (!/^https?:\/\//.test(url)) { speak("Nie mam poprawnego adresu strony."); return; }
        speak(say || "Otwieram stronę.");
        launch(url);
        return;
      }
      default:
        speak(say);
    }
  };

  // ── Ask the AI (command, question and/or image) ─────────────────────────────
  const ask = async (question: string, imageBase64?: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setError(null);
    setStatus("thinking");
    vibrate(30);
    const key = getAnthropicKey();
    if (!key) {
      setError("Brak klucza Anthropic — dodaj go w zakładce API");
      speak("Brak klucza A I. Otwórz zakładkę A P I i dodaj klucz Anthropic.");
      busyRef.current = false;
      return;
    }
    setMessages(m => [...m, { role: "user", content: question || "(zdjęcie)" }]);
    try {
      const r = await fetch("/api/assistant/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          anthropicKey: key,
          question,
          history: messagesRef.current.slice(-8),
          imageBase64,
          clientTime: new Date().toLocaleString("pl-PL", { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }),
        }),
      });
      // If the server returns HTML (not JSON), the assistant route isn't running yet
      // → the server needs a rebuild + restart. Turn the cryptic JSON error into help.
      const ct = r.headers.get("content-type") ?? "";
      if (!ct.includes("application/json")) {
        throw new Error("Serwer nieaktualny — w Shell zrób: git pull, npm run build, a potem Stop i Run.");
      }
      const d = await r.json();
      // 401 = serwer chce PIN aplikacji — pokaż pole do wpisania zamiast suchego błędu
      if (r.status === 401) { setPinNeeded(true); throw new Error("Wpisz PIN aplikacji w polu poniżej — potem zapytaj jeszcze raz."); }
      if (d.error) throw new Error(d.error);
      setPinNeeded(false);
      const say: string = d.say ?? "Nie mam odpowiedzi.";
      setMessages(m => [...m, { role: "assistant", content: say }]);
      setLastAnswer(say);
      vibrate([40, 60, 40]);
      executeAction(d.action ?? "none", d.args ?? {}, say);
      // 🗂 Auto-zapis rozmowy z twarzą na serwerze (to samo, co robi telefon) —
      // po cichu; brak internetu/starego serwera niczego nie psuje.
      fetch("/api/assistant/conversation/append", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ persona, user: question, assistant: say }),
      }).catch(() => {});
    } catch (e: any) {
      setError(e.message ?? "Błąd");
      speak("Wystąpił błąd. " + (e.message ?? ""));
    } finally {
      busyRef.current = false;
    }
  };

  // ── Speech input (tap-to-talk) ──────────────────────────────────────────────
  const startListening = () => {
    if (status === "speaking") { stopSpeaking(); return; }
    if (status === "listening") { try { recRef.current?.stop(); } catch {} return; }
    if (!SpeechRec) {
      speak("Ta przeglądarka nie obsługuje rozpoznawania mowy. Użyj przeglądarki Chrome.");
      setError("Brak rozpoznawania mowy — użyj Chrome");
      return;
    }
    try {
      const rec = new SpeechRec();
      recRef.current = rec;
      rec.lang = "pl-PL";
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.onstart = () => { setStatus("listening"); vibrate(60); };
      rec.onerror = (e: any) => {
        setStatus("idle");
        if (e.error === "not-allowed") {
          setError("Brak zgody na mikrofon — zezwól w ustawieniach przeglądarki");
          speak("Nie mam dostępu do mikrofonu. Zezwól na mikrofon w przeglądarce.");
        } else if (e.error === "no-speech") {
          speak("Nic nie usłyszałem. Dotknij i powiedz jeszcze raz.");
        } else if (e.error !== "aborted") {
          setError("Błąd mikrofonu: " + e.error);
        }
      };
      rec.onresult = (ev: any) => {
        const text = ev.results?.[0]?.[0]?.transcript ?? "";
        setStatus("idle");
        if (text.trim()) ask(text.trim());
      };
      rec.onend = () => { setStatus(s => (s === "listening" ? "idle" : s)); };
      rec.start();
    } catch (e: any) {
      setStatus("idle");
      setError("Nie udało się uruchomić mikrofonu: " + e.message);
    }
  };
  startListenRef.current = startListening;

  // ── Camera → downscale → describe ───────────────────────────────────────────
  const onPhoto = (f: File | null) => {
    if (!f) return;
    speak("Chwileczkę, oglądam zdjęcie.");
    const img = new Image();
    const url = URL.createObjectURL(f);
    img.onload = () => {
      try {
        const MAX = 1280;
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
        const b64 = canvas.toDataURL("image/jpeg", 0.8).split(",")[1];
        URL.revokeObjectURL(url);
        ask("Opisz dokładnie, co widzisz na tym zdjęciu, i przeczytaj cały widoczny tekst.", b64);
      } catch (e: any) {
        setError("Nie udało się przetworzyć zdjęcia: " + e.message);
        speak("Nie udało się przetworzyć zdjęcia.");
      }
    };
    img.src = url;
  };

  const contactCount = Object.keys(loadContacts()).length;
  const statusLabel =
    status === "listening" ? "🎤 SŁUCHAM… mów teraz" :
    status === "thinking"  ? "🧠 Myślę…" :
    status === "speaking"  ? "🔊 Mówię… (dotknij, żeby przerwać)" :
    "DOTKNIJ I POWIEDZ CO ZROBIĆ";

  return (
    <ResellLayout>
      <div style={{ background: palette.ink.black, minHeight: "calc(100vh - 60px)", padding: 12, display: "flex", flexDirection: "column", gap: 12 }}>

        {/* giant tap-to-talk button */}
        <button
          onClick={startListening}
          aria-label="Dotknij i wydaj polecenie głosem"
          style={{
            minHeight: "38vh", borderRadius: 24, border: `4px solid ${assistant.amber.edge}`,
            background: status === "listening" ? assistant.amber.panelDeep : status === "thinking" ? palette.sectionAccent.blue.panel : status === "speaking" ? assistant.green.panelDeep : assistant.zinc.inkDeep,
            color: assistant.amber.edge, fontSize: 30, fontWeight: 900, letterSpacing: 1,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12,
          }}
        >
          <span style={{ fontSize: 72 }}>{status === "listening" ? "🎤" : status === "thinking" ? "🧠" : status === "speaking" ? "🔊" : "🗣️"}</span>
          {statusLabel}
        </button>

        {/* continuous hands-free toggle — on/off like the bot; TRUE background only in APP */}
        <button onClick={toggleContinuous} aria-label="Tryb ciągły — słuchaj bez dotykania"
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 64, borderRadius: 16,
            border: `3px solid ${continuous ? palette.profit.base : assistant.zinc.edge}`, background: continuous ? assistant.green.panel : assistant.zinc.panel,
            color: continuous ? assistant.green.textSoft : assistant.zinc.soft, fontSize: 18, fontWeight: 800, padding: "0 18px" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 8, textAlign: "left" }}>
            {continuous ? "🟢 TRYB CIĄGŁY: WŁĄCZONY" : "⚪ TRYB CIĄGŁY: wyłączony"}
          </span>
          <span style={{ width: 52, height: 28, borderRadius: 14, background: continuous ? palette.profit.strong : assistant.zinc.panelHigh, position: "relative", flexShrink: 0 }}>
            <span style={{ position: "absolute", top: 3, left: continuous ? 27 : 3, width: 22, height: 22, borderRadius: 11, background: palette.ink.white, transition: "left .15s" }} />
          </span>
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: palette.violetInk.high, border: `2px solid ${assistant.indigo.edge}`, borderRadius: 12, padding: "10px 14px", marginTop: -4 }}>
          <span style={{ background: assistant.indigo.edge, color: palette.ink.white, fontSize: 12, fontWeight: 900, borderRadius: 8, padding: "3px 8px", flexShrink: 0 }}>📱 APP</span>
          <span style={{ color: palette.info.indigoSoft, fontSize: 13 }}>
            Tu (w przeglądarce) tryb ciągły działa <b>tylko gdy ta karta jest otwarta</b>.
            Działanie <b>w tle nad każdą aplikacją</b> — jak bot — ma tylko aplikacja Gadacz z pliku APK.
          </span>
        </div>

        {/* 🎭 TWARZE GADACZA — ZWINIĘTE pod nagłówek (koniec siatki kafelków) */}
        {personas.length > 0 && (
          <div style={{ border: `3px solid ${palette.brand.amberDeep}`, borderRadius: 16, background: assistant.amber.panelInk, overflow: "hidden" }}>
            <button onClick={() => setPersonaOpen(o => !o)}
              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 58,
                background: "transparent", border: "none", color: palette.brand.goldSoft, fontSize: 17, fontWeight: 800, padding: "0 16px", cursor: "pointer" }}>
              <span>🎭 TWARZ: {personas.find(p => p.key === persona)?.icon} {personas.find(p => p.key === persona)?.name}</span>
              <span style={{ fontSize: 20 }}>{personaOpen ? "▲" : "▼"}</span>
            </button>
            {personaOpen && (
              <div style={{ padding: "0 12px 12px" }}>
                <div style={{ color: assistant.amber.tan, fontSize: 13, marginBottom: 10 }}>
                  Ogólny i Dla niewidomych działają też bez internetu (lokalny mózg). Pozostałe twarze wymagają internetu.
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {personas.map(p => {
                    const offline = p.key === "niewidomi" || p.key === "ogolny";
                    return (
                      <button key={p.key} onClick={() => { pickPersona(p.key); setPersonaOpen(false); }}
                        style={{ textAlign: "left", borderRadius: 12, padding: "10px 12px", cursor: "pointer",
                          border: persona === p.key ? `2px solid ${palette.brand.goldStrong}` : `2px solid ${palette.steel.stone}`,
                          background: persona === p.key ? assistant.amber.panel : assistant.stone.panel }}>
                        <div style={{ color: assistant.amber.text, fontSize: 15, fontWeight: 800 }}>{p.icon} {p.name}{persona === p.key ? " ✓" : ""}</div>
                        <div style={{ color: offline ? palette.profit.soft : palette.loss.soft, fontSize: 11, marginTop: 2 }}>{offline ? "🆓 działa też offline" : "🌐 wymaga internetu"}</div>
                        <div style={{ color: assistant.stone.soft, fontSize: 12, marginTop: 2 }}>{p.desc}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 🏢 PIĘTRA GADACZA — 20 zdolności z włącznikiem */}
        <div style={{ border: `3px solid ${palette.ai.deep}`, borderRadius: 16, background: assistant.indigo.panel, overflow: "hidden" }}>
          <button onClick={() => setFloorsOpen(o => !o)}
            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 58,
              background: "transparent", border: "none", color: assistant.indigo.text, fontSize: 18, fontWeight: 800, padding: "0 18px" }}>
            <span>🏢 PIĘTRA GADACZA ({FLOOR_LIST.filter(f => floors[f.key] !== false).length}/{FLOOR_LIST.length} włączone)</span>
            <span style={{ fontSize: 22 }}>{floorsOpen ? "▲" : "▼"}</span>
          </button>
          {floorsOpen && (
            <div style={{ padding: "4px 12px 12px" }}>
              <div style={{ color: palette.ai.base, fontSize: 13, padding: "0 4px 10px" }}>
                Każda zdolność Gadacza z osobnym włącznikiem. Wyłączona = Gadacz jej nie użyje. Zmiana działa też w aplikacji na telefonie.
              </div>
              {FLOOR_LIST.map(f => {
                const on = floors[f.key] !== false;
                return (
                  <button key={f.key} onClick={() => toggleFloor(f.key)}
                    style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                      minHeight: 62, borderRadius: 12, marginBottom: 8, padding: "8px 14px", textAlign: "left",
                      border: `2px solid ${on ? palette.ai.deep : assistant.zinc.panelHigh}`, background: on ? palette.violetInk.panel : assistant.zinc.panel,
                      color: on ? palette.ai.wash : assistant.zinc.mid }}>
                    <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <span style={{ fontSize: 16, fontWeight: 800 }}>{f.name}</span>
                      <span style={{ fontSize: 12, color: on ? palette.ai.soft : assistant.zinc.edge }}>{f.desc}</span>
                    </span>
                    <span style={{ width: 52, height: 28, borderRadius: 14, background: on ? palette.ai.strong : assistant.zinc.panelHigh, position: "relative", flexShrink: 0 }}>
                      <span style={{ position: "absolute", top: 3, left: on ? 27 : 3, width: 22, height: 22, borderRadius: 11, background: palette.ink.white, transition: "left .15s" }} />
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 📱➕ APLIKACJE KTÓRE GADACZ UMIE OBSŁUGIWAĆ — dodawaj własne */}
        <div style={{ border: `3px solid ${palette.sectionAccent.cyan.deep}`, borderRadius: 16, background: assistant.teal.panelDeep, overflow: "hidden" }}>
          <button onClick={() => setAgOpen(o => !o)}
            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 58,
              background: "transparent", border: "none", color: assistant.teal.textSoft, fontSize: 18, fontWeight: 800, padding: "0 18px" }}>
            <span>🎓 APLIKACJE — TRYB EKSPERT ({builtinTiles.length + appGuides.length})</span>
            <span style={{ fontSize: 22 }}>{agOpen ? "▲" : "▼"}</span>
          </button>
          {agOpen && (
            <div style={{ padding: "4px 12px 14px" }}>
              {/* 🎓 MINIATURKI: każda nauczona aplikacja jako kafelek z ikonką i statusem */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(104px, 1fr))", gap: 8, marginBottom: 12 }}>
                {appGuides.map(g => (
                  <div key={"c" + g.match} title={g.guide || "tryb ekspert"}
                    style={{ position: "relative", border: `2px solid ${palette.sectionAccent.cyan.light}`, borderRadius: 12, background: assistant.teal.panel, padding: "10px 6px 8px", textAlign: "center" }}>
                    <button onClick={() => delAppGuide(g.match)} aria-label={`Usuń ${g.name}`}
                      style={{ position: "absolute", top: 0, right: 4, background: "transparent", border: "none", color: palette.sectionAccent.cyan.soft, fontSize: 16, fontWeight: 800, padding: 4 }}>×</button>
                    <div style={{ fontSize: 30, lineHeight: 1.2 }}>{iconFor(g)}</div>
                    <div style={{ color: assistant.teal.text, fontSize: 13, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.name}</div>
                    <div style={{ color: palette.profit.base, fontSize: 11, fontWeight: 800, marginTop: 2 }}>🎓 nauczone</div>
                  </div>
                ))}
                {builtinTiles.map(b => (
                  <div key={"b" + b.match}
                    style={{ border: `2px solid ${assistant.teal.edge}`, borderRadius: 12, background: assistant.teal.panel, padding: "10px 6px 8px", textAlign: "center" }}>
                    <div style={{ fontSize: 30, lineHeight: 1.2 }}>{b.icon}</div>
                    <div style={{ color: assistant.teal.text, fontSize: 13, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.name}</div>
                    <div style={{ color: palette.profit.base, fontSize: 11, fontWeight: 800, marginTop: 2 }}>🎓 nauczone</div>
                  </div>
                ))}
              </div>
              <div style={{ color: palette.sectionAccent.cyan.soft, fontSize: 13, padding: "0 4px 10px" }}>
                Kafelki powyżej to aplikacje, które Gadacz obsługuje <b>jak ekspert</b> (Twoje mają ×, żeby usunąć). Resztę obsługuje normalnie.
                Nową dodasz poniżej — albo z telefonu: otwórz apkę i powiedz <b>„poznaj tę aplikację"</b> (Gadacz sam obejrzy jej ekran),
                <b> „poznaj całą aplikację"</b> (przejdzie po zakładkach) lub <b>„naucz się tej aplikacji: …"</b> (własna instrukcja).
              </div>
              <input value={agName} onChange={e => setAgName(e.target.value)} placeholder="Nazwa aplikacji (np. OLX)"
                style={{ width: "100%", boxSizing: "border-box", marginBottom: 8, padding: "12px 14px", borderRadius: 10, border: `2px solid ${assistant.teal.edge}`, background: assistant.teal.panel, color: assistant.teal.text, fontSize: 16 }} />
              <input value={agMatch} onChange={e => setAgMatch(e.target.value)} placeholder="Fragment nazwy pakietu lub apki (np. olx, com.olx)"
                style={{ width: "100%", boxSizing: "border-box", marginBottom: 8, padding: "12px 14px", borderRadius: 10, border: `2px solid ${assistant.teal.edge}`, background: assistant.teal.panel, color: assistant.teal.text, fontSize: 16 }} />
              <textarea value={agGuide} onChange={e => setAgGuide(e.target.value)} rows={3}
                placeholder="(OPCJONALNIE) Jak obsługiwać: np. „Lista ogłoszeń przewija się w dół. Szukanie: lupa na górze. Wiadomość: przycisk Napisz, pole na dole i Wyślij.” — puste = i tak tryb ekspert."
                style={{ width: "100%", boxSizing: "border-box", marginBottom: 8, padding: "12px 14px", borderRadius: 10, border: `2px solid ${assistant.teal.edge}`, background: assistant.teal.panel, color: assistant.teal.text, fontSize: 15 }} />
              <button onClick={addAppGuide}
                style={{ width: "100%", minHeight: 54, borderRadius: 12, border: "none", background: palette.sectionAccent.cyan.deep, color: palette.ink.white, fontSize: 17, fontWeight: 800 }}>
                🎓 Oznacz jako ekspercką
              </button>
            </div>
          )}
        </div>

        {/* ✍️ WARSZTAT PISARSKI — wiersze, piosenki, opowiadania, pisma, listy */}
        <div style={{ border: `3px solid ${assistant.pink.edge}`, borderRadius: 16, background: assistant.pink.panelInkDeep, overflow: "hidden" }}>
          <button onClick={() => setWsOpen(o => !o)}
            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 58,
              background: "transparent", border: "none", color: assistant.pink.textSoft, fontSize: 18, fontWeight: 800, padding: "0 18px" }}>
            <span>✍️ WARSZTAT PISARSKI</span>
            <span style={{ fontSize: 22 }}>{wsOpen ? "▲" : "▼"}</span>
          </button>
          {wsOpen && (
            <div style={{ padding: "4px 12px 14px" }}>
              <div style={{ color: palette.sectionAccent.pink.soft, fontSize: 13, padding: "0 4px 10px" }}>
                Gadacz pisze za Ciebie w wybranym stylu: wpisz temat, dotknij styl — <b>przeczyta całość na głos i skopiuje do schowka</b>.
                Głosem działa wszędzie: „napisz wiersz o mamie", „napisz pismo do urzędu o umorzenie opłaty", „napisz romantyczną wiadomość na dobranoc".
              </div>
              <input value={wsTopic} onChange={e => setWsTopic(e.target.value)}
                placeholder="O czym napisać? (np. o mamie na urodziny)"
                style={{ width: "100%", boxSizing: "border-box", marginBottom: 10, padding: "12px 14px", borderRadius: 10, border: `2px solid ${assistant.pink.panel}`, background: assistant.pink.panelInk, color: assistant.pink.text, fontSize: 16 }} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {WS_STYLES.map(s => (
                  <button key={s.name} onClick={() => writeStyled(s.prompt)}
                    style={{ minHeight: 64, borderRadius: 12, border: `2px solid ${assistant.pink.edgeDeep}`, background: assistant.pink.panelDeep,
                      color: assistant.pink.text, fontSize: 16, fontWeight: 800, display: "flex", flexDirection: "column",
                      alignItems: "center", justifyContent: "center", gap: 4 }}>
                    <span style={{ fontSize: 24 }}>{s.icon}</span>
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ⌨️ pisanie z twarzą — jak w zwykłym czacie (obok mówienia) */}
        <form
          onSubmit={e => { e.preventDefault(); const t = typed.trim(); if (t) { ask(t); setTyped(""); } }}
          style={{ display: "flex", gap: 8 }}
        >
          <input
            value={typed}
            onChange={e => setTyped(e.target.value)}
            placeholder={`Napisz do twarzy: ${personas.find(p => p.key === persona)?.name ?? "Gadacz"}…`}
            aria-label="Napisz wiadomość do Gadacza"
            style={{ flex: 1, minHeight: 60, borderRadius: 14, border: `2px solid ${palette.steel.stone}`,
              background: assistant.stone.panel, color: assistant.stone.text, fontSize: 18, padding: "0 14px" }}
          />
          <button type="submit" aria-label="Wyślij wiadomość"
            style={{ minWidth: 96, borderRadius: 14, border: `2px solid ${palette.alpha(palette.brand.goldStrong, 0.5)}`,
              background: palette.alpha(assistant.amber.panel, 0.35), color: assistant.amber.text, fontSize: 18, fontWeight: 800 }}>
            ✉️ Wyślij
          </button>
        </form>

        {/* action row — big, high-contrast */}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => fileRef.current?.click()} aria-label="Zrób zdjęcie i opisz"
            style={{ flex: 1, minHeight: 84, borderRadius: 16, border: `3px solid ${palette.sectionAccent.blue.bright}`, background: assistant.blue.panel, color: palette.sectionAccent.cyan.wash, fontSize: 20, fontWeight: 800 }}>
            📷 OPISZ<br />ZDJĘCIE
          </button>
          <button onClick={() => lastAnswer ? speak(lastAnswer) : speak("Nie mam jeszcze żadnej odpowiedzi.")} aria-label="Powtórz ostatnią odpowiedź"
            style={{ flex: 1, minHeight: 84, borderRadius: 16, border: `3px solid ${palette.profit.base}`, background: assistant.green.panel, color: assistant.green.text, fontSize: 20, fontWeight: 800 }}>
            🔁 POWTÓRZ
          </button>
          <button onClick={stopSpeaking} aria-label="Przestań mówić"
            style={{ flex: 1, minHeight: 84, borderRadius: 16, border: `3px solid ${palette.loss.base}`, background: palette.loss.ink, color: assistant.red.wash, fontSize: 20, fontWeight: 800 }}>
            ⏹ CISZA
          </button>
        </div>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }}
          onChange={e => { onPhoto(e.target.files?.[0] ?? null); e.target.value = ""; }} />

        {error && (
          <div role="alert" style={{ background: palette.loss.ink, border: `2px solid ${palette.loss.base}`, color: palette.loss.wash, borderRadius: 12, padding: 12, fontSize: 18, fontWeight: 700 }}>
            ⚠️ {error}
          </div>
        )}
        {pinNeeded && <PinUnlock onUnlocked={() => { setPinNeeded(false); setError(null); refreshMemory(); speak("Odblokowane. Zapytaj jeszcze raz."); }} />}

        {/* transcript — large type, newest on top */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {messages.slice().reverse().map((m, i) => (
            <div key={i} style={{
              background: m.role === "assistant" ? assistant.green.panel : assistant.stone.panel,
              border: m.role === "assistant" ? `2px solid ${assistant.green.edge}` : `2px solid ${assistant.stone.edge}`,
              color: m.role === "assistant" ? assistant.green.text : assistant.stone.text,
              borderRadius: 14, padding: "10px 14px", fontSize: 19, lineHeight: 1.45,
            }}>
              <span style={{ fontWeight: 800 }}>{m.role === "assistant" ? "🗣️ " : "👤 "}</span>{m.content}
            </div>
          ))}
          {!messages.length && (
            <div style={{ color: assistant.stone.soft, fontSize: 18, lineHeight: 1.6, padding: 8 }}>
              <b style={{ color: assistant.amber.edge }}>Gadacz steruje aplikacją i telefonem głosem.</b> Dotknij żółtego przycisku i powiedz na przykład:<br /><br />
              🧭 „Otwórz trading bota" · „pokaż zyski" · „wróć do pulpitu"<br />
              🤖 „Ile bot zarobił?" · „co w portfelu?" · „jak rynek?" · „jak filtry?"<br />
              🎛️ „Wyłącz bota" · „wymieć kurz"<br />
              🧠 „Zapamiętaj, że..." · „co o mnie wiesz?" (Gadacz uczy się Ciebie)<br />
              ❓ „Co potrafi ta aplikacja?"<br />
              📞 „Zadzwoń do mamy"<br />
              💬 „Napisz SMS do Anki, że będę za dziesięć minut"<br />
              🗺️ „Nawiguj do najbliższej apteki"<br />
              ▶️ „Włącz YouTube z disco polo"<br />
              🔍 „Wyszukaj pogodę na jutro"<br />
              📇 „Zapisz kontakt mama, numer pięćset sześćset..."<br />
              ✍️ „Napisz email do szefa, że jestem chory" · „napisz wiersz o wiośnie" · „napisz piosenkę disco polo o Kasi" · „napisz pismo do urzędu" (redaguję, czytam i kopiuję do schowka)<br />
              📖 „Przeczytaj mi to" (po zdjęciu) — czytam cały tekst<br />
              📷 albo zrób zdjęcie — opiszę je i przeczytam tekst<br /><br />
              <span style={{ color: palette.info.indigo }}>📱 Tylko w aplikacji APK: sterowanie ekranem innych aplikacji, „co jest na ekranie", oraz działanie w tle nad wszystkim. W przeglądarce Gadacz robi to, co powyżej.</span><br /><br />
              {contactCount > 0 ? `Zapisane kontakty: ${contactCount}.` : "Książka kontaktów jest pusta — zacznij od: „zapisz kontakt...”"}
            </div>
          )}
        </div>

        {/* 🧠 Gadacz's memory — what it has learned about you (lives in the app) */}
        <div style={{ background: assistant.zinc.ink, border: `2px solid ${assistant.zinc.panelHigh}`, borderRadius: 14, padding: 12, marginTop: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ color: assistant.amber.edge, fontSize: 16, fontWeight: 800 }}>🧠 Pamięć Gadacza ({memory.length})</span>
            {memory.length > 0 && (
              <button onClick={() => { if (confirm("Wyczyścić całą pamięć Gadacza?")) fetch("/api/assistant/memory/clear", { method: "POST" }).then(() => refreshMemory()); }}
                style={{ fontSize: 13, color: palette.loss.base, background: "transparent", border: `1px solid ${palette.loss.deepest}`, borderRadius: 8, padding: "4px 10px" }}>
                Wyczyść
              </button>
            )}
          </div>
          {memory.length === 0
            ? <div style={{ color: assistant.zinc.mid, fontSize: 15 }}>Powiedz „zapamiętaj, że..." — Gadacz zapisze to tutaj na trwałe.</div>
            : <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {memory.map((m, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, background: assistant.zinc.panel, borderRadius: 10, padding: "8px 12px" }}>
                    <span style={{ color: assistant.zinc.text, fontSize: 15 }}>{m}</span>
                    <button aria-label="Zapomnij to"
                      onClick={() => fetch("/api/assistant/memory/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ index: i }) }).then(() => refreshMemory())}
                      style={{ color: assistant.zinc.soft, background: "transparent", border: "none", fontSize: 18, fontWeight: 800, flexShrink: 0 }}>×</button>
                  </div>
                ))}
              </div>
          }
        </div>
      </div>
    </ResellLayout>
  );
}
