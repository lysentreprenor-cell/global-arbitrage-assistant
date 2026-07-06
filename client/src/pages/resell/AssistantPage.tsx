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
  const [memory, setMemory] = useState<string[]>([]);
  const refreshMemory = () => fetch("/api/assistant/memory").then(r => r.json()).then(d => setMemory(d.memory ?? [])).catch(() => {});
  useEffect(() => { refreshMemory(); }, []);
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
  const appAction = async (doWhat: string, say: string) => {
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
        appAction(String(args?.do ?? ""), say);
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
      if (d.error) throw new Error(d.error);
      const say: string = d.say ?? "Nie mam odpowiedzi.";
      setMessages(m => [...m, { role: "assistant", content: say }]);
      setLastAnswer(say);
      vibrate([40, 60, 40]);
      executeAction(d.action ?? "none", d.args ?? {}, say);
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
      <div style={{ background: "#000", minHeight: "calc(100vh - 60px)", padding: 12, display: "flex", flexDirection: "column", gap: 12 }}>

        {/* giant tap-to-talk button */}
        <button
          onClick={startListening}
          aria-label="Dotknij i wydaj polecenie głosem"
          style={{
            minHeight: "38vh", borderRadius: 24, border: "4px solid #facc15",
            background: status === "listening" ? "#713f12" : status === "thinking" ? "#1e3a5f" : status === "speaking" ? "#14532d" : "#111",
            color: "#facc15", fontSize: 30, fontWeight: 900, letterSpacing: 1,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12,
          }}
        >
          <span style={{ fontSize: 72 }}>{status === "listening" ? "🎤" : status === "thinking" ? "🧠" : status === "speaking" ? "🔊" : "🗣️"}</span>
          {statusLabel}
        </button>

        {/* continuous hands-free toggle — on/off like the bot; TRUE background only in APP */}
        <button onClick={toggleContinuous} aria-label="Tryb ciągły — słuchaj bez dotykania"
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 64, borderRadius: 16,
            border: `3px solid ${continuous ? "#4ade80" : "#52525b"}`, background: continuous ? "#052e16" : "#18181b",
            color: continuous ? "#bbf7d0" : "#a1a1aa", fontSize: 18, fontWeight: 800, padding: "0 18px" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 8, textAlign: "left" }}>
            {continuous ? "🟢 TRYB CIĄGŁY: WŁĄCZONY" : "⚪ TRYB CIĄGŁY: wyłączony"}
          </span>
          <span style={{ width: 52, height: 28, borderRadius: 14, background: continuous ? "#22c55e" : "#3f3f46", position: "relative", flexShrink: 0 }}>
            <span style={{ position: "absolute", top: 3, left: continuous ? 27 : 3, width: 22, height: 22, borderRadius: 11, background: "#fff", transition: "left .15s" }} />
          </span>
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#1e1b4b", border: "2px solid #4338ca", borderRadius: 12, padding: "10px 14px", marginTop: -4 }}>
          <span style={{ background: "#4338ca", color: "#fff", fontSize: 12, fontWeight: 900, borderRadius: 8, padding: "3px 8px", flexShrink: 0 }}>📱 APP</span>
          <span style={{ color: "#c7d2fe", fontSize: 13 }}>
            Tu (w przeglądarce) tryb ciągły działa <b>tylko gdy ta karta jest otwarta</b>.
            Działanie <b>w tle nad każdą aplikacją</b> — jak bot — ma tylko aplikacja Gadacz z pliku APK.
          </span>
        </div>

        {/* action row — big, high-contrast */}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => fileRef.current?.click()} aria-label="Zrób zdjęcie i opisz"
            style={{ flex: 1, minHeight: 84, borderRadius: 16, border: "3px solid #38bdf8", background: "#082f49", color: "#e0f2fe", fontSize: 20, fontWeight: 800 }}>
            📷 OPISZ<br />ZDJĘCIE
          </button>
          <button onClick={() => lastAnswer ? speak(lastAnswer) : speak("Nie mam jeszcze żadnej odpowiedzi.")} aria-label="Powtórz ostatnią odpowiedź"
            style={{ flex: 1, minHeight: 84, borderRadius: 16, border: "3px solid #4ade80", background: "#052e16", color: "#dcfce7", fontSize: 20, fontWeight: 800 }}>
            🔁 POWTÓRZ
          </button>
          <button onClick={stopSpeaking} aria-label="Przestań mówić"
            style={{ flex: 1, minHeight: 84, borderRadius: 16, border: "3px solid #f87171", background: "#450a0a", color: "#fee2e2", fontSize: 20, fontWeight: 800 }}>
            ⏹ CISZA
          </button>
        </div>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }}
          onChange={e => { onPhoto(e.target.files?.[0] ?? null); e.target.value = ""; }} />

        {error && (
          <div role="alert" style={{ background: "#450a0a", border: "2px solid #f87171", color: "#fecaca", borderRadius: 12, padding: 12, fontSize: 18, fontWeight: 700 }}>
            ⚠️ {error}
          </div>
        )}

        {/* transcript — large type, newest on top */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {messages.slice().reverse().map((m, i) => (
            <div key={i} style={{
              background: m.role === "assistant" ? "#052e16" : "#1c1917",
              border: m.role === "assistant" ? "2px solid #166534" : "2px solid #44403c",
              color: m.role === "assistant" ? "#dcfce7" : "#e7e5e4",
              borderRadius: 14, padding: "10px 14px", fontSize: 19, lineHeight: 1.45,
            }}>
              <span style={{ fontWeight: 800 }}>{m.role === "assistant" ? "🗣️ " : "👤 "}</span>{m.content}
            </div>
          ))}
          {!messages.length && (
            <div style={{ color: "#a8a29e", fontSize: 18, lineHeight: 1.6, padding: 8 }}>
              <b style={{ color: "#facc15" }}>Gadacz steruje aplikacją i telefonem głosem.</b> Dotknij żółtego przycisku i powiedz na przykład:<br /><br />
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
              ✍️ „Napisz email do szefa, że jestem chory" · „napisz listę zakupów: chleb, mleko" (redaguję i kopiuję do schowka)<br />
              📖 „Przeczytaj mi to" (po zdjęciu) — czytam cały tekst<br />
              📷 albo zrób zdjęcie — opiszę je i przeczytam tekst<br /><br />
              <span style={{ color: "#818cf8" }}>📱 Tylko w aplikacji APK: sterowanie ekranem innych aplikacji, „co jest na ekranie", oraz działanie w tle nad wszystkim. W przeglądarce Gadacz robi to, co powyżej.</span><br /><br />
              {contactCount > 0 ? `Zapisane kontakty: ${contactCount}.` : "Książka kontaktów jest pusta — zacznij od: „zapisz kontakt...”"}
            </div>
          )}
        </div>

        {/* 🧠 Gadacz's memory — what it has learned about you (lives in the app) */}
        <div style={{ background: "#0a0a0a", border: "2px solid #3f3f46", borderRadius: 14, padding: 12, marginTop: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ color: "#facc15", fontSize: 16, fontWeight: 800 }}>🧠 Pamięć Gadacza ({memory.length})</span>
            {memory.length > 0 && (
              <button onClick={() => { if (confirm("Wyczyścić całą pamięć Gadacza?")) fetch("/api/assistant/memory/clear", { method: "POST" }).then(() => refreshMemory()); }}
                style={{ fontSize: 13, color: "#f87171", background: "transparent", border: "1px solid #7f1d1d", borderRadius: 8, padding: "4px 10px" }}>
                Wyczyść
              </button>
            )}
          </div>
          {memory.length === 0
            ? <div style={{ color: "#71717a", fontSize: 15 }}>Powiedz „zapamiętaj, że..." — Gadacz zapisze to tutaj na trwałe.</div>
            : <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {memory.map((m, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, background: "#18181b", borderRadius: 10, padding: "8px 12px" }}>
                    <span style={{ color: "#e4e4e7", fontSize: 15 }}>{m}</span>
                    <button aria-label="Zapomnij to"
                      onClick={() => fetch("/api/assistant/memory/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ index: i }) }).then(() => refreshMemory())}
                      style={{ color: "#a1a1aa", background: "transparent", border: "none", fontSize: 18, fontWeight: 800, flexShrink: 0 }}>×</button>
                  </div>
                ))}
              </div>
          }
        </div>
      </div>
    </ResellLayout>
  );
}
