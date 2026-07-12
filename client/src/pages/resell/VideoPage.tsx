/**
 * 🎬 FILMIKI — twórca filmów.
 *
 * Wpisujesz pomysł („bajka do nauki angielskiego", „animacja o odważnym kotku",
 * „reklama moich rowerów") → AI pisze SCENORYS → ta strona go OŻYWIA:
 *  - animuje sceny na canvasie (tła-gradienty, bohater-emoji w ruchu, nagłówek,
 *    napisy na dole),
 *  - w podglądzie czyta narrację lektorem (głos z przeglądarki),
 *  - „NAGRAJ PLIK" przechwytuje canvas do prawdziwego pliku wideo (.webm)
 *    z wypalonymi napisami — do pobrania i wysłania gdziekolwiek.
 * Uwaga: plik wideo jest bez dźwięku (przeglądarka nie umie nagrać swojego
 * lektora) — napisy niosą całą treść, a podgląd w zakładce ma pełny głos.
 */
import { useRef, useState } from "react";
import { ResellLayout } from "@/components/resell/ResellLayout";
import { getAnthropicKey } from "@/lib/apiKeys";
import { installPinFetch } from "@/lib/botPin";

installPinFetch();

type Scena = { tlo: string[]; emoji: string; ruch: string; naglowek: string; tekst: string; narracja: string; czas: number };
type Scenorys = { tytul: string; sceny: Scena[] };

const W = 1280, H = 720;

const PRESETS: { icon: string; name: string; prompt: string }[] = [
  { icon: "📚", name: "Bajka do nauki języka", prompt: "Bajka dla dzieci ucząca podstawowych słów po angielsku (zwierzęta): " },
  { icon: "🐱", name: "Animacja / bajka",      prompt: "Krótka animowana bajka z morałem o: " },
  { icon: "📢", name: "Filmik reklamowy",      prompt: "Filmik reklamowy, który sprzedaje: " },
  { icon: "🧠", name: "Filmik edukacyjny",     prompt: "Filmik edukacyjny tłumaczący prosto: " },
  { icon: "🎂", name: "Życzenia wideo",        prompt: "Filmik z życzeniami z okazji: " },
  { icon: "🎵", name: "Piosenka z napisami",   prompt: "Filmik z tekstem prostej piosenki (napisy jak karaoke) o: " },
];

function wrapText(ctx: CanvasRenderingContext2D, text: string, font: string, maxW: number): string[] {
  ctx.font = font;
  const words = (text ?? "").split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const probe = cur ? cur + " " + w : w;
    if (ctx.measureText(probe).width > maxW && cur) { lines.push(cur); cur = w; }
    else cur = probe;
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3);
}

// Jedna klatka sceny: t = postęp 0..1. Czysta funkcja rysująca — serce filmiku.
function drawScene(ctx: CanvasRenderingContext2D, sc: Scena, t: number) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, sc.tlo?.[0] ?? "#1e293b");
  g.addColorStop(1, sc.tlo?.[1] ?? "#0f172a");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // bohater-emoji w ruchu
  const wave = Math.sin(t * Math.PI * 4);
  let ex = W / 2, ey = H / 2 + 30, scale = 1;
  if (sc.ruch === "bounce") ey -= Math.abs(wave) * 70;
  else if (sc.ruch === "slide") ex = -220 + (W + 440) * t;
  else if (sc.ruch === "zoom") scale = 0.45 + 0.75 * Math.min(1, t * 1.6);
  else ey += wave * 26; // float
  ctx.save();
  ctx.translate(ex, ey);
  ctx.scale(scale, scale);
  ctx.font = "240px serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(sc.emoji || "🎬", 0, 0);
  ctx.restore();

  // nagłówek (wjeżdża z góry na starcie sceny)
  const slideIn = Math.min(1, t * 4);
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = "900 68px system-ui, sans-serif";
  ctx.fillStyle = "#fff";
  ctx.shadowColor = "rgba(0,0,0,0.65)";
  ctx.shadowBlur = 14;
  ctx.fillText(sc.naglowek ?? "", W / 2, -80 + 200 * slideIn);
  ctx.shadowBlur = 0;

  // pasek napisów na dole
  const lines = wrapText(ctx, sc.tekst ?? "", "600 42px system-ui, sans-serif", W * 0.9);
  if (lines.length) {
    const barH = lines.length * 56 + 34;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, H - barH, W, barH);
    ctx.fillStyle = "#fff";
    ctx.font = "600 42px system-ui, sans-serif";
    lines.forEach((l, i) => ctx.fillText(l, W / 2, H - barH + 60 + i * 56));
  }
}

export default function VideoPage() {
  const [pomysl, setPomysl] = useState("");
  const [script, setScript] = useState<Scenorys | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [recording, setRecording] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [sceneIdx, setSceneIdx] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cancelRef = useRef(false);

  const speakAsync = (text: string) => new Promise<void>(resolve => {
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "pl-PL";
      const v = window.speechSynthesis.getVoices().find(v => v.lang?.startsWith("pl"));
      if (v) u.voice = v;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      window.speechSynthesis.speak(u);
    } catch { resolve(); }
  });

  const makeScript = async () => {
    const idea = pomysl.trim();
    if (!idea) { setError("Napisz najpierw, o czym ma być filmik."); return; }
    const key = getAnthropicKey();
    if (!key) { setError("Brak klucza Anthropic — dodaj go w zakładce API."); return; }
    setBusy("AI pisze scenariusz filmiku…");
    setError(null);
    setVideoUrl(null);
    try {
      const r = await fetch("/api/video/script", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ anthropicKey: key, pomysl: idea }),
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setScript(d);
      setSceneIdx(0);
      // od razu narysuj pierwszą klatkę, żeby było co oglądać
      setTimeout(() => {
        const ctx = canvasRef.current?.getContext("2d");
        if (ctx && d.sceny?.[0]) drawScene(ctx, d.sceny[0], 0.3);
      }, 50);
    } catch (e: any) { setError(e.message ?? "Błąd scenariusza"); }
    finally { setBusy(null); }
  };

  /** Odtwórz wszystkie sceny; record=true → przechwyć canvas do pliku .webm. */
  const playAll = async (record: boolean) => {
    if (!script || playing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    cancelRef.current = false;
    setPlaying(true);
    setVideoUrl(null);
    let recorder: MediaRecorder | null = null;
    const chunks: Blob[] = [];
    if (record) {
      try {
        const stream = (canvas as any).captureStream(30);
        const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm";
        recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_000_000 });
        recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
        recorder.start(500);
        setRecording(true);
      } catch (e: any) {
        setError("Ta przeglądarka nie umie nagrywać wideo: " + (e.message ?? ""));
        setPlaying(false);
        return;
      }
    }
    try {
      for (let i = 0; i < script.sceny.length; i++) {
        if (cancelRef.current) break;
        const sc = script.sceny[i];
        setSceneIdx(i);
        const durMs = Math.max(3, Math.min(15, sc.czas || 6)) * 1000;
        let tts: Promise<void> = Promise.resolve();
        if (!record && sc.narracja) tts = speakAsync(sc.narracja);
        const t0 = performance.now();
        await new Promise<void>(resolve => {
          const frame = (now: number) => {
            if (cancelRef.current) return resolve();
            const t = Math.min(1, (now - t0) / durMs);
            drawScene(ctx, sc, t);
            if (t >= 1) resolve();
            else requestAnimationFrame(frame);
          };
          requestAnimationFrame(frame);
        });
        if (!record) await tts; // niech lektor dokończy zdanie
      }
    } finally {
      if (recorder && recorder.state !== "inactive") {
        await new Promise<void>(res => { recorder!.onstop = () => res(); recorder!.stop(); });
        if (!cancelRef.current && chunks.length) {
          setVideoUrl(URL.createObjectURL(new Blob(chunks, { type: "video/webm" })));
        }
      }
      setRecording(false);
      try { window.speechSynthesis.cancel(); } catch {}
      setPlaying(false);
    }
  };

  const stopAll = () => { cancelRef.current = true; try { window.speechSynthesis.cancel(); } catch {} };

  const downloadVideo = () => {
    if (!videoUrl || !script) return;
    const a = document.createElement("a");
    a.href = videoUrl;
    a.download = `${script.tytul.replace(/[^\wąćęłńóśźż-]+/gi, "_") || "filmik"}.webm`;
    a.click();
  };

  const copyScript = () => {
    if (!script) return;
    const txt = `${script.tytul}\n\n` + script.sceny.map((s, i) =>
      `SCENA ${i + 1} (${s.emoji} ${s.naglowek})\nNapis: ${s.tekst}\nLektor: ${s.narracja}`).join("\n\n");
    navigator.clipboard?.writeText(txt).catch(() => {});
  };

  const box: React.CSSProperties = { border: "3px solid #7c3aed", borderRadius: 16, background: "#1c1233", padding: 14 };
  const btn = (bg: string): React.CSSProperties => ({ minHeight: 54, borderRadius: 12, border: "none", background: bg, color: "#fff", fontSize: 16, fontWeight: 800, padding: "0 16px" });

  return (
    <ResellLayout>
      <div style={{ background: "#000", minHeight: "calc(100vh - 60px)", padding: 12, display: "flex", flexDirection: "column", gap: 12 }}>

        <div style={{ color: "#c4b5fd", fontSize: 14, lineHeight: 1.5, background: "#1c1233", border: "2px solid #4c1d95", borderRadius: 12, padding: "10px 14px" }}>
          <b>🎬 Tworzenie filmików.</b> Napisz, co ma powstać — AI ułoży scenariusz, a ta strona
          go <b>zanimuje</b> (tła, bohater, napisy), <b>przeczyta lektorem</b> i <b>nagra do pliku wideo</b> do pobrania.
          Plik ma wypalone napisy (bez dźwięku — głos słychać w podglądzie tutaj).
        </div>

        {busy && <div style={{ background: "#1e3a5f", border: "2px solid #38bdf8", color: "#e0f2fe", borderRadius: 12, padding: 12, fontSize: 16, fontWeight: 700 }}>⏳ {busy}</div>}
        {error && <div role="alert" style={{ background: "#450a0a", border: "2px solid #f87171", color: "#fecaca", borderRadius: 12, padding: 12, fontSize: 16, fontWeight: 700 }}>⚠️ {error}</div>}

        {/* pomysł + gotowe szablony */}
        <div style={box}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
            {PRESETS.map(p => (
              <button key={p.name} onClick={() => setPomysl(p.prompt)}
                style={{ minHeight: 58, borderRadius: 12, border: "2px solid #6d28d9", background: "#2e1065",
                  color: "#ede9fe", fontSize: 14, fontWeight: 800, display: "flex", alignItems: "center", gap: 8, padding: "0 12px", textAlign: "left" }}>
                <span style={{ fontSize: 22 }}>{p.icon}</span>{p.name}
              </button>
            ))}
          </div>
          <textarea value={pomysl} onChange={e => setPomysl(e.target.value)} rows={3}
            placeholder="Co ma być w filmiku? Np. „Bajka ucząca dzieci angielskich nazw zwierząt: kot, pies, krowa” albo „Animacja o kotku, który bał się ciemności”"
            style={{ width: "100%", boxSizing: "border-box", marginBottom: 8, padding: "12px 14px", borderRadius: 10, border: "2px solid #4c1d95", background: "#241245", color: "#ede9fe", fontSize: 16 }} />
          <button onClick={makeScript} disabled={!!busy} style={{ ...btn("#7c3aed"), width: "100%" }}>
            🎬 NAPISZ SCENARIUSZ (AI)
          </button>
        </div>

        {/* odtwarzacz / nagrywarka */}
        {script && (
          <div style={box}>
            <div style={{ color: "#ede9fe", fontSize: 18, fontWeight: 900, marginBottom: 8 }}>
              „{script.tytul}" — {script.sceny.length} scen
              {playing && <span style={{ color: "#a78bfa", fontWeight: 700 }}> · scena {sceneIdx + 1}/{script.sceny.length}{recording ? " · ⏺️ NAGRYWAM" : ""}</span>}
            </div>
            <canvas ref={canvasRef} width={W} height={H}
              style={{ width: "100%", borderRadius: 12, border: "2px solid #4c1d95", background: "#0f172a" }} />
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <button onClick={() => playAll(false)} disabled={playing} style={{ ...btn("#16a34a"), flex: 1 }}>▶️ ODTWÓRZ Z LEKTOREM</button>
              <button onClick={() => playAll(true)} disabled={playing} style={{ ...btn("#dc2626"), flex: 1 }}>⏺️ NAGRAJ PLIK WIDEO</button>
              {playing && <button onClick={stopAll} style={{ ...btn("#57534e"), flex: 1 }}>⏹ STOP</button>}
            </div>
            {videoUrl && (
              <button onClick={downloadVideo} style={{ ...btn("#0891b2"), width: "100%", marginTop: 8 }}>
                ⬇️ POBIERZ FILM (.webm)
              </button>
            )}
            <button onClick={copyScript} style={{ ...btn("#4c1d95"), width: "100%", marginTop: 8 }}>
              📋 KOPIUJ SCENARIUSZ (np. do nagrania własnego lektora)
            </button>
            {/* lista scen — podgląd treści */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
              {script.sceny.map((s, i) => (
                <div key={i} style={{ background: "#241245", border: `2px solid ${playing && i === sceneIdx ? "#a78bfa" : "#4c1d95"}`, borderRadius: 10, padding: "8px 12px" }}>
                  <span style={{ color: "#ede9fe", fontSize: 14, fontWeight: 800 }}>{i + 1}. {s.emoji} {s.naglowek}</span>
                  <div style={{ color: "#c4b5fd", fontSize: 13, marginTop: 2 }}>{s.narracja}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </ResellLayout>
  );
}
