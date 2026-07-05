/**
 * 🦯 Asystent — voice assistant for blind and low-vision users (Etap 1: web).
 *
 * Design rules (accessibility first):
 *  - ONE giant tap-to-talk button that fills most of the screen — impossible to miss
 *  - every state change is spoken aloud (TTS pl-PL) and signalled with vibration
 *  - high contrast (black background, yellow/white text), very large font
 *  - camera photo → AI describes the scene and reads out any visible text
 *
 * Etap 2 (native Android + AccessibilityService) will reuse this conversation core.
 */
import { useEffect, useRef, useState } from "react";
import { ResellLayout } from "@/components/resell/ResellLayout";
import { getAnthropicKey } from "@/lib/apiKeys";

type Msg = { role: "user" | "assistant"; content: string };

const SpeechRec: any =
  typeof window !== "undefined" ? ((window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition) : null;

function vibrate(pattern: number | number[]) {
  try { navigator.vibrate?.(pattern); } catch { /* ignore */ }
}

export default function AssistantPage() {
  const [status, setStatus] = useState<"idle" | "listening" | "thinking" | "speaking">("idle");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [lastAnswer, setLastAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
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
      u.onend = () => { setStatus("idle"); onDone?.(); };
      setStatus("speaking");
      window.speechSynthesis.speak(u);
    } catch { setStatus("idle"); onDone?.(); }
  };
  const stopSpeaking = () => { try { window.speechSynthesis.cancel(); } catch {} setStatus("idle"); };

  useEffect(() => () => { try { window.speechSynthesis.cancel(); recRef.current?.abort?.(); } catch {} }, []);

  // ── Ask the AI (text and/or image) ──────────────────────────────────────────
  const ask = async (question: string, imageBase64?: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setError(null);
    setStatus("thinking");
    vibrate(30);
    const key = getAnthropicKey();
    if (!key) {
      const msg = "Brak klucza A I. Otwórz zakładkę A P I i dodaj klucz Anthropic.";
      setError("Brak klucza Anthropic — dodaj go w zakładce API");
      speak(msg);
      busyRef.current = false;
      return;
    }
    const userMsg: Msg = { role: "user", content: question || "(zdjęcie)" };
    setMessages(m => [...m, userMsg]);
    try {
      const r = await fetch("/api/assistant/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          anthropicKey: key,
          question,
          history: messagesRef.current.slice(-8),
          imageBase64,
        }),
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      const answer: string = d.text ?? "Nie mam odpowiedzi.";
      setMessages(m => [...m, { role: "assistant", content: answer }]);
      setLastAnswer(answer);
      vibrate([40, 60, 40]);
      speak(answer);
    } catch (e: any) {
      const msg = "Wystąpił błąd. " + (e.message ?? "");
      setError(e.message ?? "Błąd");
      speak(msg);
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
        } else if (e.error !== "aborted" && e.error !== "no-speech") {
          setError("Błąd mikrofonu: " + e.error);
        } else if (e.error === "no-speech") {
          speak("Nic nie usłyszałem. Dotknij i powiedz jeszcze raz.");
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

  const statusLabel =
    status === "listening" ? "🎤 SŁUCHAM… mów teraz" :
    status === "thinking"  ? "🧠 Myślę…" :
    status === "speaking"  ? "🔊 Mówię… (dotknij, żeby przerwać)" :
    "DOTKNIJ I MÓW";

  return (
    <ResellLayout>
      <div style={{ background: "#000", minHeight: "calc(100vh - 60px)", padding: 12, display: "flex", flexDirection: "column", gap: 12 }}>

        {/* giant tap-to-talk button */}
        <button
          onClick={startListening}
          aria-label="Dotknij i mów"
          style={{
            minHeight: "38vh", borderRadius: 24, border: "4px solid #facc15",
            background: status === "listening" ? "#713f12" : status === "thinking" ? "#1e3a5f" : status === "speaking" ? "#14532d" : "#111",
            color: "#facc15", fontSize: 34, fontWeight: 900, letterSpacing: 1,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12,
          }}
        >
          <span style={{ fontSize: 72 }}>{status === "listening" ? "🎤" : status === "thinking" ? "🧠" : status === "speaking" ? "🔊" : "🦯"}</span>
          {statusLabel}
        </button>

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
              <span style={{ fontWeight: 800 }}>{m.role === "assistant" ? "🦯 " : "🗣️ "}</span>{m.content}
            </div>
          ))}
          {!messages.length && (
            <div style={{ color: "#a8a29e", fontSize: 18, lineHeight: 1.5, padding: 8 }}>
              Dotknij wielkiego żółtego przycisku i zadaj pytanie głosem — na przykład: „która jest godzina?",
              „przeczytaj mi to" (po zrobieniu zdjęcia), „co widzisz przede mną?".
              Odpowiedź zostanie przeczytana na głos.
            </div>
          )}
        </div>
      </div>
    </ResellLayout>
  );
}
