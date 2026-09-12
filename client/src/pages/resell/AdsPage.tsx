/**
 * 📢 REKLAMA — memiarnia i twórca reklam Gadacza.
 *
 * Co tu się dzieje:
 *  - wgraj/zrób zdjęcie mema → AI patrzy, rozumie żart i proponuje NOWE teksty
 *    (memy na podstawie memów) → tekst maluje się na obrazku (canvas, klasyka:
 *    biały tekst z czarną obwódką, góra/dół) → zapis do biblioteki lub pobranie,
 *  - biblioteka memów mieszka NA SERWERZE (data/gadacz_memy.json) — telefon
 *    dorzuca tu zrzuty ekranu komendą „zapisz tego mema",
 *  - sekcja REKLAMA: podajesz co reklamujesz → AI pisze slogany, post i ogłoszenie,
 *    a slogan jednym dotknięciem ląduje na obrazku jako mem reklamowy.
 */
import { useEffect, useRef, useState } from "react";
import { ResellLayout } from "@/components/resell/ResellLayout";
import { getAnthropicKey } from "@/lib/apiKeys";
import { installPinFetch } from "@/lib/botPin";
import * as palette from "@/design/palette";

installPinFetch(); // biblioteka memów za PIN-em aplikacji — dokładamy go do każdego strzału

type Meme = { id: string; name: string; caption: string; img: string; mediaType: string; source: string; t: string };
type Propozycja = { gora: string; dol: string };

// Klasyczny memowy napis: DUŻE litery, biały środek, gruba czarna obwódka, łamanie wierszy.
function drawMemeText(ctx: CanvasRenderingContext2D, W: number, H: number, top: string, bottom: string) {
  const draw = (text: string, atTop: boolean) => {
    const t = text.trim().toUpperCase();
    if (!t) return;
    const fontPx = Math.max(22, Math.round(W / 11));
    ctx.font = `900 ${fontPx}px Impact, "Arial Black", sans-serif`;
    ctx.textAlign = "center";
    ctx.fillStyle = palette.ink.white;
    ctx.strokeStyle = palette.ink.black;
    ctx.lineWidth = Math.max(3, Math.round(fontPx / 9));
    ctx.lineJoin = "round";
    // łamanie na linie, żeby mieściło się w 92% szerokości
    const words = t.split(/\s+/);
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const probe = cur ? cur + " " + w : w;
      if (ctx.measureText(probe).width > W * 0.92 && cur) { lines.push(cur); cur = w; }
      else cur = probe;
    }
    if (cur) lines.push(cur);
    const lh = fontPx * 1.12;
    lines.forEach((line, i) => {
      const y = atTop ? fontPx + 8 + i * lh : H - 14 - (lines.length - 1 - i) * lh;
      ctx.strokeText(line, W / 2, y);
      ctx.fillText(line, W / 2, y);
    });
  };
  draw(top, true);
  draw(bottom, false);
}

export default function AdsPage() {
  const [memes, setMemes] = useState<Meme[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // co się właśnie liczy (opis dla użytkownika)

  // ── edytor mema ──
  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null);
  const [topText, setTopText] = useState("");
  const [bottomText, setBottomText] = useState("");
  const [propozycje, setPropozycje] = useState<Propozycja[]>([]);
  const [opis, setOpis] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── reklama ──
  const [adTemat, setAdTemat] = useState("");
  const [adTon, setAdTon] = useState("zabawny");
  const [ad, setAd] = useState<{ slogany: string[]; post: string; ogloszenie: string; mem: Propozycja } | null>(null);

  const refresh = () => fetch("/api/memes").then(r => r.json()).then(d => setMemes(d.memes ?? [])).catch(() => {});
  useEffect(() => { refresh(); }, []);

  // przerysuj mem przy każdej zmianie obrazka/tekstów
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !imgEl) return;
    const MAX = 1080;
    const scale = Math.min(1, MAX / Math.max(imgEl.width, imgEl.height));
    c.width = Math.round(imgEl.width * scale);
    c.height = Math.round(imgEl.height * scale);
    const ctx = c.getContext("2d")!;
    ctx.drawImage(imgEl, 0, 0, c.width, c.height);
    drawMemeText(ctx, c.width, c.height, topText, bottomText);
  }, [imgEl, topText, bottomText]);

  const loadFile = (f: File | null) => {
    if (!f) return;
    const img = new Image();
    const url = URL.createObjectURL(f);
    img.onload = () => { setImgEl(img); setPropozycje([]); setOpis(""); URL.revokeObjectURL(url); };
    img.src = url;
  };
  const loadFromLibrary = (m: Meme) => {
    const img = new Image();
    img.onload = () => { setImgEl(img); setTopText(""); setBottomText(""); setPropozycje([]); setOpis(""); window.scrollTo({ top: 0, behavior: "smooth" }); };
    img.src = `data:${m.mediaType};base64,${m.img}`;
  };

  // aktualny obrazek edytora BEZ napisów (do wysłania AI) — z osobnego canvasa
  const rawBase64 = (): string | null => {
    if (!imgEl) return null;
    const MAX = 1024;
    const scale = Math.min(1, MAX / Math.max(imgEl.width, imgEl.height));
    const c = document.createElement("canvas");
    c.width = Math.round(imgEl.width * scale);
    c.height = Math.round(imgEl.height * scale);
    c.getContext("2d")!.drawImage(imgEl, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.8).split(",")[1];
  };

  const remix = async (hint?: string) => {
    const b64 = rawBase64();
    if (!b64) { setError("Najpierw wgraj obrazek mema."); return; }
    const key = getAnthropicKey();
    if (!key) { setError("Brak klucza Anthropic — dodaj go w zakładce API."); return; }
    setBusy("AI ogląda mema i wymyśla teksty…");
    setError(null);
    try {
      const r = await fetch("/api/memes/remix", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ anthropicKey: key, imageBase64: b64, mediaType: "image/jpeg", hint: hint ?? "" }),
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setOpis(d.opis ?? "");
      setPropozycje(d.teksty ?? []);
      if (!(d.teksty ?? []).length) setError("AI nie podało propozycji — spróbuj jeszcze raz.");
    } catch (e: any) { setError(e.message ?? "Błąd przerabiania"); }
    finally { setBusy(null); }
  };

  const saveToLibrary = async (name: string) => {
    const c = canvasRef.current;
    if (!c || !imgEl) { setError("Najpierw wgraj obrazek."); return; }
    setBusy("Zapisuję do biblioteki…");
    try {
      const b64 = c.toDataURL("image/jpeg", 0.85).split(",")[1];
      const r = await fetch("/api/memes", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ imageBase64: b64, mediaType: "image/jpeg", name, caption: [topText, bottomText].filter(Boolean).join(" / "), source: "www" }),
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      refresh();
    } catch (e: any) { setError(e.message ?? "Błąd zapisu"); }
    finally { setBusy(null); }
  };

  const download = (dataUrl: string, name: string) => {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${name.replace(/[^\wąćęłńóśźż-]+/gi, "_") || "mem"}.jpg`;
    a.click();
  };

  const makeAd = async () => {
    const temat = adTemat.trim();
    if (!temat) { setError("Wpisz, co mam zareklamować."); return; }
    const key = getAnthropicKey();
    if (!key) { setError("Brak klucza Anthropic — dodaj go w zakładce API."); return; }
    setBusy("AI pisze reklamę…");
    setError(null);
    try {
      const r = await fetch("/api/memes/ad", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ anthropicKey: key, temat, ton: adTon }),
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setAd(d);
    } catch (e: any) { setError(e.message ?? "Błąd pisania reklamy"); }
    finally { setBusy(null); }
  };

  const copy = (t: string) => { navigator.clipboard?.writeText(t).catch(() => {}); };

  const box: React.CSSProperties = { border: `3px solid ${palette.sectionAccent.orange.deep}`, borderRadius: 16, background: palette.sectionAccent.orange.inkDeeper, padding: 14 };
  const h: React.CSSProperties = { color: palette.sectionAccent.orange.tan, fontSize: 18, fontWeight: 900, marginBottom: 8 };
  const input: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 10, border: `2px solid ${palette.sectionAccent.orange.ink}`, background: palette.sectionAccent.orange.inkDeep, color: palette.sectionAccent.orange.wash, fontSize: 16 };
  const btn = (bg: string): React.CSSProperties => ({ minHeight: 52, borderRadius: 12, border: "none", background: bg, color: palette.ink.white, fontSize: 16, fontWeight: 800, padding: "0 16px" });

  return (
    <ResellLayout>
      <div style={{ background: palette.ink.black, minHeight: "calc(100vh - 60px)", padding: 12, display: "flex", flexDirection: "column", gap: 12 }}>

        <div style={{ color: palette.sectionAccent.orange.tan, fontSize: 14, lineHeight: 1.5, background: palette.sectionAccent.orange.inkDeeper, border: `2px solid ${palette.sectionAccent.orange.ink}`, borderRadius: 12, padding: "10px 14px" }}>
          <b>📢 Reklama i memy.</b> Wgraj mema → AI wymyśli nowe teksty (mem z mema) → zapisz albo pobierz.
          W aplikacji Gadacz na telefonie powiedz <b>„zapisz tego mema"</b> (zrzut ekranu trafia tutaj)
          albo <b>„przerób tego mema"</b> — Gadacz sam go przerobi i odłoży do biblioteki.
        </div>

        {busy && <div style={{ background: palette.sectionAccent.blue.panel, border: `2px solid ${palette.sectionAccent.blue.bright}`, color: palette.sectionAccent.cyan.wash, borderRadius: 12, padding: 12, fontSize: 16, fontWeight: 700 }}>⏳ {busy}</div>}
        {error && <div role="alert" style={{ background: palette.loss.ink, border: `2px solid ${palette.loss.base}`, color: palette.loss.wash, borderRadius: 12, padding: 12, fontSize: 16, fontWeight: 700 }}>⚠️ {error}</div>}

        {/* ── EDYTOR MEMA ── */}
        <div style={box}>
          <div style={h}>🖼️ PRZERÓB MEMA</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <button onClick={() => fileRef.current?.click()} style={{ ...btn(palette.sectionAccent.orange.deep), flex: 1 }}>📤 WGRAJ / ZRÓB ZDJĘCIE</button>
            <button onClick={() => remix()} style={{ ...btn(palette.ai.deep), flex: 1 }} disabled={!imgEl}>🧠 WYMYŚL TEKSTY (AI)</button>
          </div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
            onChange={e => { loadFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />

          {imgEl ? (
            <>
              <canvas ref={canvasRef} style={{ width: "100%", borderRadius: 12, border: `2px solid ${palette.sectionAccent.orange.ink}` }} />
              {opis && <div style={{ color: palette.sectionAccent.orange.soft, fontSize: 13, margin: "8px 0" }}>🧠 AI widzi: {opis}</div>}
              {propozycje.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: "8px 0" }}>
                  {propozycje.map((p, i) => (
                    <button key={i} onClick={() => { setTopText(p.gora); setBottomText(p.dol); }}
                      style={{ textAlign: "left", borderRadius: 10, border: `2px solid ${palette.ai.deep}`, background: palette.violetInk.panel, color: palette.ai.wash, fontSize: 15, fontWeight: 700, padding: "10px 12px" }}>
                      💬 {p.gora}{p.dol ? ` … ${p.dol}` : ""}
                    </button>
                  ))}
                </div>
              )}
              <input value={topText} onChange={e => setTopText(e.target.value)} placeholder="Tekst na górze" style={{ ...input, margin: "8px 0" }} />
              <input value={bottomText} onChange={e => setBottomText(e.target.value)} placeholder="Tekst na dole" style={{ ...input, marginBottom: 10 }} />
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => saveToLibrary(topText || "mem")} style={{ ...btn(palette.profit.deep), flex: 1 }}>💾 ZAPISZ DO BIBLIOTEKI</button>
                <button onClick={() => canvasRef.current && download(canvasRef.current.toDataURL("image/jpeg", 0.9), topText || "mem")} style={{ ...btn(palette.sectionAccent.cyan.deep), flex: 1 }}>⬇️ POBIERZ</button>
              </div>
            </>
          ) : (
            <div style={{ color: palette.sectionAccent.orange.mute, fontSize: 15, padding: "18px 6px", textAlign: "center" }}>
              Wgraj obrazek mema (albo dowolne zdjęcie) — dodasz teksty i zrobisz z niego mema.
            </div>
          )}
        </div>

        {/* ── TWÓRCA REKLAM ── */}
        <div style={box}>
          <div style={h}>📣 STWÓRZ REKLAMĘ</div>
          <input value={adTemat} onChange={e => setAdTemat(e.target.value)} placeholder="Co reklamujemy? (np. rowery elektryczne z dowozem)" style={{ ...input, marginBottom: 8 }} />
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            {["zabawny", "poważny", "promocyjny"].map(t => (
              <button key={t} onClick={() => setAdTon(t)}
                style={{ flex: 1, minHeight: 46, borderRadius: 10, fontSize: 15, fontWeight: 800,
                  border: `2px solid ${adTon === t ? palette.sectionAccent.orange.deep : palette.sectionAccent.orange.ink}`,
                  background: adTon === t ? palette.sectionAccent.orange.ink : palette.sectionAccent.orange.inkDeep, color: adTon === t ? palette.sectionAccent.orange.wash : palette.sectionAccent.orange.muteGold }}>
                {t}
              </button>
            ))}
          </div>
          <button onClick={makeAd} style={{ ...btn(palette.sectionAccent.orange.deep), width: "100%" }}>📣 NAPISZ REKLAMĘ (AI)</button>
          {ad && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
              {ad.slogany.map((s, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", background: palette.sectionAccent.orange.inkDeep, border: `2px solid ${palette.sectionAccent.orange.ink}`, borderRadius: 10, padding: "10px 12px" }}>
                  <span style={{ color: palette.sectionAccent.orange.wash, fontSize: 16, fontWeight: 800, flex: 1 }}>🔸 {s}</span>
                  <button onClick={() => copy(s)} style={{ ...btn(palette.steel.stone), minHeight: 40, fontSize: 13 }}>📋</button>
                  {imgEl && <button onClick={() => { setTopText(s); setBottomText(""); window.scrollTo({ top: 0, behavior: "smooth" }); }} style={{ ...btn(palette.ai.deep), minHeight: 40, fontSize: 13 }}>na mema</button>}
                </div>
              ))}
              {[["Post na Facebooka/Instagram", ad.post], ["Ogłoszenie sprzedażowe", ad.ogloszenie]].map(([tit, txt]) => txt && (
                <div key={tit} style={{ background: palette.sectionAccent.orange.inkDeep, border: `2px solid ${palette.sectionAccent.orange.ink}`, borderRadius: 10, padding: "10px 12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <span style={{ color: palette.sectionAccent.orange.tan, fontSize: 14, fontWeight: 900 }}>{tit}</span>
                    <button onClick={() => copy(txt)} style={{ ...btn(palette.steel.stone), minHeight: 36, fontSize: 13 }}>📋 kopiuj</button>
                  </div>
                  <div style={{ color: palette.sectionAccent.orange.wash, fontSize: 15, whiteSpace: "pre-wrap" }}>{txt}</div>
                </div>
              ))}
              {imgEl && (ad.mem.gora || ad.mem.dol) && (
                <button onClick={() => { setTopText(ad.mem.gora); setBottomText(ad.mem.dol); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                  style={{ ...btn(palette.ai.deep), width: "100%" }}>🖼️ ZRÓB Z TEGO MEMA REKLAMOWEGO</button>
              )}
            </div>
          )}
        </div>

        {/* ── BIBLIOTEKA ── */}
        <div style={box}>
          <div style={h}>🗂️ BIBLIOTEKA MEMÓW ({memes.length})</div>
          {memes.length === 0 && (
            <div style={{ color: palette.sectionAccent.orange.mute, fontSize: 15 }}>
              Pusto. Zapisz coś z edytora powyżej albo powiedz na telefonie „zapisz tego mema".
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
            {memes.slice().reverse().map(m => (
              <div key={m.id} style={{ border: `2px solid ${palette.sectionAccent.orange.ink}`, borderRadius: 12, background: palette.sectionAccent.orange.inkDeep, overflow: "hidden" }}>
                <img src={`data:${m.mediaType};base64,${m.img}`} alt={m.name} style={{ width: "100%", display: "block" }} />
                <div style={{ padding: "6px 8px" }}>
                  <div style={{ color: palette.sectionAccent.orange.wash, fontSize: 13, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</div>
                  <div style={{ color: palette.sectionAccent.orange.muteGold, fontSize: 11 }}>{m.source === "telefon" ? "📱 z telefonu" : "🌐 ze strony"} · {new Date(m.t).toLocaleDateString("pl-PL")}</div>
                  <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                    <button onClick={() => loadFromLibrary(m)} title="Przerób" style={{ ...btn(palette.ai.deep), flex: 1, minHeight: 36, fontSize: 13, padding: 0 }}>♻️</button>
                    <button onClick={() => download(`data:${m.mediaType};base64,${m.img}`, m.name)} title="Pobierz" style={{ ...btn(palette.sectionAccent.cyan.deep), flex: 1, minHeight: 36, fontSize: 13, padding: 0 }}>⬇️</button>
                    <button onClick={() => { if (confirm("Usunąć tego mema?")) fetch("/api/memes/delete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: m.id }) }).then(() => refresh()); }}
                      title="Usuń" style={{ ...btn(palette.loss.deepest), flex: 1, minHeight: 36, fontSize: 13, padding: 0 }}>🗑️</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </ResellLayout>
  );
}
