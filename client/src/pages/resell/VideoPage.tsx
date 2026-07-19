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
import { useEffect, useRef, useState } from "react";
import { ResellLayout } from "@/components/resell/ResellLayout";
import { getAnthropicKey } from "@/lib/apiKeys";
import { installPinFetch } from "@/lib/botPin";
import { PinUnlock } from "@/components/resell/PinUnlock";

installPinFetch();

type Scena = { tlo: string[]; emoji: string; ruch: string; naglowek: string; tekst: string; narracja: string; czas: number };
type Scenorys = { tytul: string; sceny: Scena[] };

const W = 1280, H = 720;

const PRESETS: { icon: string; name: string; prompt: string }[] = [
  { icon: "🎵", name: "TikTok / Shorts",       prompt: "Pionowy krótki filmik TikTok/YouTube Shorts, format 9 na 16, 15-30 sekund, MOCNY hak w pierwszej sekundzie, dynamiczne 4-6 scen, wciągająco i szybko, na końcu wezwanie obserwuj lub kup — temat: " },
  { icon: "📢", name: "Short reklamowy",       prompt: "Krótki pionowy short REKLAMOWY (TikTok/Shorts), 15-25 sekund: hak z problemem, produkt jako rozwiązanie, korzyść, cena/oferta i wezwanie do zakupu na końcu — reklamujemy: " },
  { icon: "📸", name: "Short ze zdjęcia/opisu", prompt: "Krótki pionowy short pokazujący i zachwalający konkretny przedmiot na sprzedaż, 4-6 dynamicznych scen (wygląd, stan, zalety, cena, jak kupić) — przedmiot: " },
  { icon: "📚", name: "Bajka do nauki języka", prompt: "Bajka dla dzieci ucząca podstawowych słów po angielsku (zwierzęta): " },
  { icon: "🐱", name: "Animacja / bajka",      prompt: "Krótka animowana bajka z morałem o: " },
  { icon: "🧠", name: "Filmik edukacyjny",     prompt: "Filmik edukacyjny tłumaczący prosto: " },
  { icon: "🎂", name: "Życzenia wideo",        prompt: "Filmik z życzeniami z okazji: " },
  { icon: "🎤", name: "Piosenka z napisami",   prompt: "Filmik z tekstem prostej piosenki (napisy jak karaoke) o: " },
];

// ── 🎥 KAMERA → ANIMACJA: filtry klatek na żywo ────────────────────────────────
// Działają na surowych pikselach (ImageData) — każda klatka z aparatu zamienia
// się w „rysunek", ZANIM trafi do nagrania. Rozdzielczość robocza jest niższa
// (640 w poziomie), żeby telefon wyrabiał ~24 klatki na sekundę.
type CamFilter = "cartoon" | "pixel" | "sketch" | "neon";
const CAM_FILTERS: { key: CamFilter; icon: string; name: string }[] = [
  { key: "cartoon", icon: "🎨", name: "Kreskówka" },
  { key: "sketch",  icon: "✏️", name: "Szkic" },
  { key: "neon",    icon: "🌈", name: "Neon" },
  { key: "pixel",   icon: "🕹️", name: "Piksele" },
];

function applyCamFilter(data: Uint8ClampedArray, w: number, h: number, filter: CamFilter) {
  if (filter === "pixel") {
    const B = 10; // rozmiar klocka
    for (let y = 0; y < h; y++) {
      const ay = y - (y % B);
      for (let x = 0; x < w; x++) {
        const ai = (ay * w + (x - (x % B))) * 4;
        const i = (y * w + x) * 4;
        data[i] = Math.round(data[ai] / 51) * 51;
        data[i + 1] = Math.round(data[ai + 1] / 51) * 51;
        data[i + 2] = Math.round(data[ai + 2] / 51) * 51;
      }
    }
    return;
  }
  // kopia oryginału do liczenia krawędzi (posteryzacja by je zamazała)
  const orig = new Uint8ClampedArray(data);
  const lum = (i: number) => 0.299 * orig[i] + 0.587 * orig[i + 1] + 0.114 * orig[i + 2];
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      const l = lum(i);
      const edge = Math.abs(l - lum(i + 4)) + Math.abs(l - lum(i + w * 4)); // gradient w prawo i w dół
      if (filter === "cartoon") {
        // spłaszczone kolory (5 poziomów) + czarna kreska na krawędzi
        data[i] = Math.round(orig[i] / 51) * 51;
        data[i + 1] = Math.round(orig[i + 1] / 51) * 51;
        data[i + 2] = Math.round(orig[i + 2] / 51) * 51;
        if (edge > 42) { data[i] = data[i + 1] = data[i + 2] = 20; }
      } else if (filter === "sketch") {
        // biała kartka, ciemna kreska — jak rysunek ołówkiem
        const v = edge > 18 ? Math.max(0, 235 - edge * 3) : 250;
        data[i] = data[i + 1] = data[i + 2] = v;
      } else { // neon
        // ciemne tło, świecące kolorowe kontury
        if (edge > 24) {
          data[i] = Math.min(255, orig[i] * 1.6 + 60);
          data[i + 1] = Math.min(255, orig[i + 1] * 1.6 + 60);
          data[i + 2] = Math.min(255, orig[i + 2] * 1.6 + 60);
        } else {
          data[i] = orig[i] * 0.12; data[i + 1] = orig[i + 1] * 0.12; data[i + 2] = orig[i + 2] * 0.12;
        }
      }
    }
  }
}

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
  const [pinNeeded, setPinNeeded] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [recording, setRecording] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [sceneIdx, setSceneIdx] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cancelRef = useRef(false);

  // ── 🎥 KAMERA → ANIMACJA ──
  const [camOn, setCamOn] = useState(false);
  const [camFilter, setCamFilter] = useState<CamFilter>("cartoon");
  const camFilterRef = useRef<CamFilter>(camFilter);
  camFilterRef.current = camFilter;
  const [camRecording, setCamRecording] = useState(false);
  const [camUrl, setCamUrl] = useState<string | null>(null);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const camVideoRef = useRef<HTMLVideoElement>(null);
  const camCanvasRef = useRef<HTMLCanvasElement>(null);
  const camStreamRef = useRef<MediaStream | null>(null);
  const camRafRef = useRef(0);
  const camRecRef = useRef<MediaRecorder | null>(null);

  const stopCam = () => {
    try { cancelAnimationFrame(camRafRef.current); } catch {}
    try { if (camRecRef.current && camRecRef.current.state !== "inactive") camRecRef.current.stop(); } catch {}
    camRecRef.current = null;
    try { camStreamRef.current?.getTracks().forEach(t => t.stop()); } catch {}
    camStreamRef.current = null;
    setCamOn(false);
    setCamRecording(false);
  };
  useEffect(() => () => stopCam(), []); // sprzątanie przy wyjściu z zakładki

  const startCam = async (face: "environment" | "user") => {
    stopCam();
    setError(null);
    try {
      // dźwięk też — nagranie z kamery MA głos (inaczej niż filmiki ze scenariusza)
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: face, width: { ideal: 1280 } }, audio: true,
      });
      camStreamRef.current = stream;
      setFacing(face);
      const v = camVideoRef.current!;
      v.srcObject = stream;
      v.muted = true;
      await v.play();
      const c = camCanvasRef.current!;
      c.width = 640;
      c.height = Math.round(640 * (v.videoHeight || 480) / (v.videoWidth || 640)) || 480;
      setCamOn(true);
      const ctx = c.getContext("2d", { willReadFrequently: true })!;
      const loop = () => {
        if (!camStreamRef.current) return;
        try {
          ctx.drawImage(v, 0, 0, c.width, c.height);
          const img = ctx.getImageData(0, 0, c.width, c.height);
          applyCamFilter(img.data, c.width, c.height, camFilterRef.current);
          ctx.putImageData(img, 0, 0);
        } catch { /* klatka mogła nie być gotowa */ }
        camRafRef.current = requestAnimationFrame(loop);
      };
      camRafRef.current = requestAnimationFrame(loop);
    } catch (e: any) {
      setError("Nie mogę włączyć kamery: " + (e.message ?? "sprawdź zgodę na aparat i mikrofon"));
    }
  };

  const startCamRec = () => {
    const c = camCanvasRef.current;
    if (!c || !camStreamRef.current) return;
    try {
      const stream: MediaStream = (c as any).captureStream(24);
      camStreamRef.current.getAudioTracks().forEach(t => stream.addTrack(t)); // głos z mikrofonu
      const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus") ? "video/webm;codecs=vp9,opus" : "video/webm";
      const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 3_500_000 });
      const chunks: Blob[] = [];
      rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      rec.onstop = () => {
        if (chunks.length) setCamUrl(URL.createObjectURL(new Blob(chunks, { type: "video/webm" })));
        setCamRecording(false);
      };
      rec.start(500);
      camRecRef.current = rec;
      setCamUrl(null);
      setCamRecording(true);
    } catch (e: any) {
      setError("Nagrywanie nie działa w tej przeglądarce: " + (e.message ?? ""));
    }
  };
  const stopCamRec = () => { try { camRecRef.current?.stop(); } catch {} };

  const downloadCam = () => {
    if (!camUrl) return;
    const a = document.createElement("a");
    a.href = camUrl;
    a.download = "animacja_z_kamery.webm";
    a.click();
  };

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
      // 401 = serwer chce PIN aplikacji — pokaż pole do wpisania zamiast suchego błędu
      if (r.status === 401) { setPinNeeded(true); throw new Error("Wpisz PIN aplikacji poniżej — po odblokowaniu scenariusz ruszy sam."); }
      if (d.error) throw new Error(d.error);
      setPinNeeded(false);
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
        {pinNeeded && <PinUnlock onUnlocked={() => { setPinNeeded(false); setError(null); makeScript(); }} />}

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
        {/* 🎥 KAMERA → ANIMACJA: żywy obraz z aparatu przerabiany na rysunek i nagrywany */}
        <div style={{ border: "3px solid #059669", borderRadius: 16, background: "#052e22", padding: 14 }}>
          <div style={{ color: "#a7f3d0", fontSize: 18, fontWeight: 900, marginBottom: 6 }}>🎥 KAMERA → ANIMACJA (na żywo)</div>
          <div style={{ color: "#6ee7b7", fontSize: 13, marginBottom: 10 }}>
            Nagrywasz aparatem, a obraz na żywo zamienia się w animację: kreskówkę, szkic ołówkiem, neon albo piksele.
            Nagranie ma <b>dźwięk z mikrofonu</b> — możesz opowiadać podczas filmowania. Plik .webm do pobrania.
          </div>
          {!camOn ? (
            <button onClick={() => startCam(facing)} style={{ ...btn("#059669"), width: "100%" }}>🎥 WŁĄCZ KAMERĘ</button>
          ) : (
            <>
              <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
                {CAM_FILTERS.map(f => (
                  <button key={f.key} onClick={() => setCamFilter(f.key)}
                    style={{ flex: 1, minHeight: 46, borderRadius: 10, fontSize: 14, fontWeight: 800,
                      border: `2px solid ${camFilter === f.key ? "#34d399" : "#065f46"}`,
                      background: camFilter === f.key ? "#065f46" : "#04291e", color: "#d1fae5" }}>
                    {f.icon} {f.name}
                  </button>
                ))}
              </div>
              <canvas ref={camCanvasRef}
                style={{ width: "100%", borderRadius: 12, border: `3px solid ${camRecording ? "#ef4444" : "#065f46"}`, background: "#000" }} />
              <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                {!camRecording
                  ? <button onClick={startCamRec} style={{ ...btn("#dc2626"), flex: 1 }}>⏺️ NAGRYWAJ</button>
                  : <button onClick={stopCamRec} style={{ ...btn("#7f1d1d"), flex: 1 }}>⏹ ZAKOŃCZ NAGRANIE</button>}
                <button onClick={() => startCam(facing === "environment" ? "user" : "environment")} style={{ ...btn("#0891b2"), flex: 1 }}>🔄 PRZEDNIA/TYLNA</button>
                <button onClick={stopCam} style={{ ...btn("#57534e"), flex: 1 }}>❌ WYŁĄCZ</button>
              </div>
            </>
          )}
          {camUrl && (
            <button onClick={downloadCam} style={{ ...btn("#0891b2"), width: "100%", marginTop: 8 }}>
              ⬇️ POBIERZ ANIMACJĘ (.webm, z dźwiękiem)
            </button>
          )}
          {/* ukryty odtwarzacz surowego obrazu z kamery — źródło klatek dla filtra */}
          <video ref={camVideoRef} playsInline style={{ display: "none" }} />
        </div>
      </div>
    </ResellLayout>
  );
}
