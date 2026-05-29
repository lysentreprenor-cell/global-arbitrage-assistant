import { useState, useRef } from "react";
import { Upload, Copy, ExternalLink, Rocket, CheckCircle, AlertCircle, Loader2, Check, RefreshCw } from "lucide-react";
import { ResellLayout } from "@/components/resell/ResellLayout";
import { getAnthropicKey } from "@/lib/apiKeys";

const PLATFORM_FLAGS: Record<string, string> = {
  "Allegro PL": "🇵🇱", "OLX PL": "🇵🇱", "Vinted PL": "🇵🇱",
  "eBay USA": "🇺🇸", "Etsy USA": "🇺🇸", "Amazon USA": "🇺🇸", "StockX USA": "🇺🇸",
  "eBay UK": "🇬🇧", "Amazon UK": "🇬🇧", "Depop": "🇬🇧",
  "eBay DE": "🇩🇪", "Amazon DE": "🇩🇪",
  "Vinted EU": "🇪🇺",
};

const PLATFORM_LINKS: Record<string, string> = {
  "Allegro PL": "https://allegro.pl/wystaw-przedmiot",
  "OLX PL": "https://www.olx.pl/d/dodaj-ogloszenie/",
  "Vinted PL": "https://www.vinted.pl/items/new",
  "eBay USA": "https://www.ebay.com/sell",
  "eBay DE": "https://www.ebay.de/sell",
  "eBay UK": "https://www.ebay.co.uk/sell",
  "Etsy USA": "https://www.etsy.com/sell",
  "Amazon USA": "https://sell.amazon.com",
  "Amazon DE": "https://sellercentral.amazon.de/",
  "Amazon UK": "https://sellercentral.amazon.co.uk/",
  "StockX USA": "https://stockx.com/sell",
  "Depop": "https://www.depop.com/",
  "Vinted EU": "https://www.vinted.com/",
};

const CURRENCY_SYMBOL: Record<string, string> = {
  PLN: "zł", EUR: "€", GBP: "£", USD: "$",
};

interface PlatformResult {
  platform: string;
  currency: string;
  recommendedPrice: number;
  estimatedProfitUSD: number;
  margin: number;
  confidence: "high" | "medium" | "low";
  listing: {
    title: string;
    description: string;
    tags: string[];
    shippingNote?: string;
  };
}

interface CopyResult {
  product: {
    name: string;
    sourcePrice: number;
    sourceCurrency: string;
    sourcePriceUSD: number;
    condition: string;
    category: string;
    description: string;
    sourcePlatform: string;
    arbitrageNote: string;
  };
  platforms: PlatformResult[];
}

const CONF_COLOR: Record<string, string> = { high: "#4ade80", medium: "#f5c842", low: "#f87171" };

export default function QuickListPage() {
  const [phase, setPhase] = useState<"upload" | "analyzing" | "result">("upload");
  const [imagePreview, setImagePreview] = useState("");
  const [result, setResult] = useState<CopyResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [copied, setCopied] = useState<Record<string, boolean>>({});
  const [launchDone, setLaunchDone] = useState(false);
  const [expandedDesc, setExpandedDesc] = useState<Record<string, boolean>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) { setError("Wybierz plik graficzny (JPG, PNG, WEBP)"); return; }
    setError(null);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      setImagePreview(dataUrl);
      const b64 = dataUrl.split(",")[1];
      await analyze(b64, file.type);
    };
    reader.readAsDataURL(file);
  };

  const analyze = async (b64: string, mime: string) => {
    const key = getAnthropicKey();
    if (!key) { setError("Dodaj klucz Anthropic API w ustawieniach (⚙ API)"); return; }
    setPhase("analyzing");
    try {
      const res = await fetch("/api/dropship/listing-copy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imageData: b64, mimeType: mime, anthropicKey: key }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd analizy");
      setResult(data);
      setSelected(new Set(
        (data.platforms as PlatformResult[])
          .filter(p => p.confidence === "high")
          .map(p => p.platform)
      ));
      setLaunchDone(false);
      setPhase("result");
    } catch (e: any) {
      setError(e.message);
      setPhase("upload");
    }
  };

  const buildClipText = (p: PlatformResult) =>
    `${p.listing.title}\n\n${p.listing.description}\n\nTagi: ${p.listing.tags.join(", ")}${p.listing.shippingNote ? `\n\nWysyłka: ${p.listing.shippingNote}` : ""}`;

  const copyAndOpen = async (p: PlatformResult) => {
    try { await navigator.clipboard.writeText(buildClipText(p)); } catch {}
    setCopied(prev => ({ ...prev, [p.platform]: true }));
    setTimeout(() => setCopied(prev => ({ ...prev, [p.platform]: false })), 2500);
    const url = PLATFORM_LINKS[p.platform];
    if (url) window.open(url, "_blank");
  };

  const launchAll = async () => {
    if (!result) return;
    const targets = result.platforms.filter(p => selected.has(p.platform));
    for (const p of targets) {
      try { await navigator.clipboard.writeText(buildClipText(p)); } catch {}
      const url = PLATFORM_LINKS[p.platform];
      if (url) window.open(url, "_blank");
      await new Promise(r => setTimeout(r, 350));
    }
    setLaunchDone(true);
  };

  const toggleSelect = (platform: string) =>
    setSelected(prev => { const n = new Set(prev); n.has(platform) ? n.delete(platform) : n.add(platform); return n; });

  const sym = (c: string) => CURRENCY_SYMBOL[c] || c + " ";

  return (
    <ResellLayout>
      <div style={{ maxWidth: 940, margin: "0 auto", padding: "24px 16px" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "linear-gradient(135deg, #f59e0b, #d97706)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Copy size={20} color="#fff" />
          </div>
          <div>
            <h1 style={{ color: "#fff", fontWeight: 900, fontSize: 20, margin: 0 }}>Kopiuj Ogłoszenie</h1>
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, margin: 0 }}>
              Wgraj screenshot istniejącego ogłoszenia → AI wyciąga dane i generuje gotowe treści na każdą platformę jednym kliknięciem
            </p>
          </div>
        </div>

        {error && (
          <div style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 10, padding: "12px 16px", marginBottom: 20, display: "flex", alignItems: "center", gap: 10, color: "#f87171", fontSize: 13 }}>
            <AlertCircle size={16} /> {error}
          </div>
        )}

        {/* ── UPLOAD ── */}
        {phase === "upload" && (
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
            style={{
              border: `2px dashed ${dragOver ? "#f59e0b" : "rgba(245,158,11,0.35)"}`,
              borderRadius: 20, padding: "60px 24px", textAlign: "center", cursor: "pointer",
              background: dragOver ? "rgba(245,158,11,0.08)" : "rgba(245,158,11,0.03)",
              transition: "all 0.2s",
            }}
          >
            <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
            <div style={{ width: 72, height: 72, borderRadius: 18, background: "rgba(245,158,11,0.15)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
              <Upload size={30} color="#f59e0b" />
            </div>
            <div style={{ color: "#f59e0b", fontWeight: 800, fontSize: 18, marginBottom: 8 }}>Przeciągnij screenshot ogłoszenia</div>
            <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 13, marginBottom: 6 }}>lub kliknij żeby wybrać plik · JPG, PNG, WEBP</div>
            <div style={{ color: "rgba(255,255,255,0.22)", fontSize: 12, marginBottom: 20 }}>
              Zrób screenshot z Allegro, OLX, eBay, Vinted, Kleinanzeigen i innych platform
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
              {["🛒 Allegro", "🏷 OLX", "👗 Vinted", "🇩🇪 Kleinanzeigen", "🇺🇸 eBay USA", "🛍 Jiji"].map(t => (
                <span key={t} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 99, padding: "4px 12px", color: "rgba(255,255,255,0.3)", fontSize: 11 }}>{t}</span>
              ))}
            </div>
          </div>
        )}

        {/* ── ANALYZING ── */}
        {phase === "analyzing" && (
          <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
            {imagePreview && (
              <div style={{ flexShrink: 0, width: 200, height: 200, borderRadius: 16, overflow: "hidden", border: "1px solid rgba(245,158,11,0.3)" }}>
                <img src={imagePreview} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="listing" />
              </div>
            )}
            <div style={{ flex: 1, minWidth: 240 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
                <Loader2 size={22} color="#f59e0b" style={{ animation: "spin 1s linear infinite" }} />
                <span style={{ color: "#f59e0b", fontWeight: 700, fontSize: 16 }}>AI analizuje ogłoszenie…</span>
              </div>
              {["🔍 Rozpoznawanie produktu i ceny zakupu", "💰 Kalkulacja marży na każdej platformie", "✍️ Generowanie tytułów i opisów", "🚀 Przygotowanie do jednokliku"].map((step, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: "rgba(245,158,11,0.5)", animation: `pulse 1.5s ease ${i * 0.3}s infinite` }} />
                  <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 13 }}>{step}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── RESULT ── */}
        {phase === "result" && result && (
          <div>

            {/* Source product info */}
            <div style={{ display: "flex", gap: 18, marginBottom: 22, flexWrap: "wrap", alignItems: "flex-start" }}>
              {imagePreview && (
                <div style={{ flexShrink: 0, width: 120, height: 120, borderRadius: 12, overflow: "hidden", border: "1px solid rgba(245,158,11,0.3)" }}>
                  <img src={imagePreview} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="source listing" />
                </div>
              )}
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ color: "#f59e0b", fontSize: 10, fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>
                  ŹRÓDŁO · {result.product.sourcePlatform}
                </div>
                <div style={{ color: "#fff", fontWeight: 800, fontSize: 16, marginBottom: 8, lineHeight: 1.3 }}>
                  {result.product.name}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                  <span style={{ background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 8, padding: "3px 10px", color: "#f59e0b", fontSize: 12, fontWeight: 700 }}>
                    {result.product.sourcePrice} {result.product.sourceCurrency} ≈ ${result.product.sourcePriceUSD.toFixed(0)}
                  </span>
                  <span style={{ background: "rgba(255,255,255,0.06)", borderRadius: 8, padding: "3px 10px", color: "rgba(255,255,255,0.45)", fontSize: 12 }}>
                    {result.product.condition} · {result.product.category}
                  </span>
                </div>
                {result.product.arbitrageNote && (
                  <div style={{ color: "#4ade80", fontSize: 12, fontStyle: "italic" }}>💡 {result.product.arbitrageNote}</div>
                )}
              </div>
            </div>

            {/* Launch all bar */}
            <div style={{
              background: "linear-gradient(135deg, rgba(245,158,11,0.12), rgba(234,179,8,0.06))",
              border: "1px solid rgba(245,158,11,0.35)",
              borderRadius: 14, padding: "14px 18px", marginBottom: 20,
              display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12,
            }}>
              <div>
                <div style={{ color: "#f5c842", fontWeight: 700, fontSize: 14, marginBottom: 2 }}>
                  {selected.size} {selected.size === 1 ? "platforma wybrana" : "platformy wybrane"}
                </div>
                <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 12 }}>
                  Zaznacz karty poniżej, a potem kliknij przycisk — każda platforma otworzy się z treścią w schowku
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  onClick={() => setSelected(new Set(result.platforms.map(p => p.platform)))}
                  style={{ padding: "8px 14px", borderRadius: 9, border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "rgba(255,255,255,0.45)", fontSize: 12, cursor: "pointer" }}
                >
                  Zaznacz wszystkie
                </button>
                <button
                  onClick={launchAll}
                  disabled={selected.size === 0}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "10px 20px", borderRadius: 10, border: "none",
                    background: selected.size > 0 ? "linear-gradient(135deg, #f59e0b, #d97706)" : "rgba(255,255,255,0.08)",
                    color: selected.size > 0 ? "#000" : "rgba(255,255,255,0.25)",
                    fontWeight: 800, fontSize: 14, cursor: selected.size > 0 ? "pointer" : "not-allowed",
                    transition: "all 0.15s",
                  }}
                >
                  <Rocket size={15} />
                  Uruchom wszystkie ({selected.size})
                </button>
              </div>
            </div>

            {launchDone && (
              <div style={{ background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.25)", borderRadius: 10, padding: "10px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10, color: "#4ade80", fontSize: 13 }}>
                <CheckCircle size={16} />
                Otwarto {selected.size} platform! Każda treść ogłoszenia była skopiowana do schowka tuż przed otwarciem.
              </div>
            )}

            {/* Platform cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(285px, 1fr))", gap: 14 }}>
              {result.platforms.map(p => {
                const flag = PLATFORM_FLAGS[p.platform] || "🌍";
                const currSym = sym(p.currency);
                const isSelected = selected.has(p.platform);
                const isCopied = copied[p.platform];
                const isExpanded = expandedDesc[p.platform];
                const profitColor = p.estimatedProfitUSD >= 10 ? "#4ade80" : p.estimatedProfitUSD >= 0 ? "#f5c842" : "#f87171";

                return (
                  <div
                    key={p.platform}
                    onClick={() => toggleSelect(p.platform)}
                    style={{
                      background: isSelected ? "rgba(245,158,11,0.07)" : "rgba(255,255,255,0.03)",
                      border: `1px solid ${isSelected ? "rgba(245,158,11,0.45)" : "rgba(255,255,255,0.08)"}`,
                      borderRadius: 14, padding: "16px",
                      cursor: "pointer", transition: "all 0.15s",
                    }}
                  >
                    {/* Header row */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 11 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 20 }}>{flag}</span>
                        <div>
                          <div style={{ color: "#fff", fontWeight: 700, fontSize: 13 }}>{p.platform}</div>
                          <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, display: "flex", alignItems: "center", gap: 4 }}>
                            <div style={{ width: 7, height: 7, borderRadius: "50%", background: CONF_COLOR[p.confidence] }} />
                            {p.confidence === "high" ? "Wysoka pewność" : p.confidence === "medium" ? "Średnia" : "Niska"}
                          </div>
                        </div>
                      </div>
                      <div style={{
                        width: 22, height: 22, borderRadius: 6,
                        border: `2px solid ${isSelected ? "#f59e0b" : "rgba(255,255,255,0.18)"}`,
                        background: isSelected ? "#f59e0b" : "transparent",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        flexShrink: 0,
                      }}>
                        {isSelected && <Check size={12} color="#000" strokeWidth={3} />}
                      </div>
                    </div>

                    {/* Price + profit */}
                    <div style={{ display: "flex", gap: 8, marginBottom: 11 }}>
                      <div style={{ flex: 1, background: "rgba(255,255,255,0.05)", borderRadius: 8, padding: "8px 10px" }}>
                        <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 9, fontWeight: 700, letterSpacing: 0.5, marginBottom: 2 }}>SPRZEDAJ ZA</div>
                        <div style={{ color: "#fff", fontWeight: 800, fontSize: 16 }}>{currSym}{p.recommendedPrice}</div>
                      </div>
                      <div style={{ flex: 1, background: "rgba(255,255,255,0.05)", borderRadius: 8, padding: "8px 10px" }}>
                        <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 9, fontWeight: 700, letterSpacing: 0.5, marginBottom: 2 }}>ZYSK EST.</div>
                        <div style={{ color: profitColor, fontWeight: 800, fontSize: 16 }}>
                          {p.estimatedProfitUSD >= 0 ? "+" : ""}${p.estimatedProfitUSD.toFixed(0)}
                        </div>
                      </div>
                    </div>

                    {/* Title */}
                    <div style={{ marginBottom: 9 }}>
                      <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 9, fontWeight: 700, letterSpacing: 0.5, marginBottom: 3 }}>TYTUŁ</div>
                      <div style={{ color: "rgba(255,255,255,0.8)", fontSize: 12, lineHeight: 1.4, fontWeight: 500 }}>{p.listing.title}</div>
                    </div>

                    {/* Description (collapsible) */}
                    <div style={{ marginBottom: 10 }}>
                      <button
                        onClick={e => { e.stopPropagation(); setExpandedDesc(prev => ({ ...prev, [p.platform]: !prev[p.platform] })); }}
                        style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", fontSize: 10, cursor: "pointer", padding: 0, marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}
                      >
                        {isExpanded ? "▲" : "▼"} {isExpanded ? "Zwiń opis" : "Pokaż opis"}
                      </button>
                      {isExpanded && (
                        <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, lineHeight: 1.5, background: "rgba(0,0,0,0.2)", borderRadius: 6, padding: "8px 10px" }}>
                          {p.listing.description}
                        </div>
                      )}
                    </div>

                    {/* Tags */}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 12 }}>
                      {p.listing.tags.slice(0, 5).map(tag => (
                        <span key={tag} style={{ background: "rgba(255,255,255,0.06)", borderRadius: 99, padding: "2px 8px", color: "rgba(255,255,255,0.35)", fontSize: 10 }}>{tag}</span>
                      ))}
                    </div>

                    {/* Copy + Open button */}
                    <button
                      onClick={e => { e.stopPropagation(); copyAndOpen(p); }}
                      style={{
                        width: "100%", padding: "9px 12px", borderRadius: 9, border: "none",
                        background: isCopied ? "rgba(74,222,128,0.18)" : "rgba(245,158,11,0.18)",
                        color: isCopied ? "#4ade80" : "#f59e0b",
                        fontWeight: 700, fontSize: 12, cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                        transition: "all 0.2s",
                      }}
                    >
                      {isCopied
                        ? <><CheckCircle size={13} /> Skopiowano! Platforma otwarta</>
                        : <><Copy size={12} /> Kopiuj treść i otwórz platformę <ExternalLink size={11} /></>
                      }
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Reset */}
            <div style={{ textAlign: "center", marginTop: 36 }}>
              <button
                onClick={() => { setPhase("upload"); setResult(null); setImagePreview(""); setSelected(new Set()); setLaunchDone(false); setExpandedDesc({}); }}
                style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 auto", padding: "10px 22px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "transparent", color: "rgba(255,255,255,0.4)", fontSize: 13, cursor: "pointer" }}
              >
                <RefreshCw size={14} /> Nowe ogłoszenie
              </button>
            </div>

          </div>
        )}

      </div>
    </ResellLayout>
  );
}
