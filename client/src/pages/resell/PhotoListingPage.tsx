import React, { useState, useRef } from "react";
import { useLocation } from "wouter";
import { Camera, Upload, Zap, ChevronRight, CheckCircle, AlertCircle, Loader2, ShoppingBag, ExternalLink, Clock } from "lucide-react";
import { ResellLayout } from "@/components/resell/ResellLayout";
import { getAnthropicKey } from "@/lib/apiKeys";

const PLATFORM_FLAGS: Record<string, string> = {
  "Allegro PL": "🇵🇱", "OLX PL": "🇵🇱", "Vinted PL": "🇵🇱",
  "eBay USA": "🇺🇸", "Etsy USA": "🇺🇸", "Amazon USA": "🇺🇸", "StockX USA": "🇺🇸",
  "eBay UK": "🇬🇧", "Amazon UK": "🇬🇧", "Depop": "🇬🇧",
  "eBay DE": "🇩🇪", "Amazon DE": "🇩🇪",
  "Vinted EU": "🇪🇺", "eBay FR": "🇫🇷", "eBay IT": "🇮🇹", "eBay ES": "🇪🇸",
};
const PLATFORM_FEES: Record<string, number> = {
  "Allegro PL": 7, "OLX PL": 0, "Vinted PL": 0,
  "eBay USA": 13.25, "Etsy USA": 9.5, "Amazon USA": 15, "StockX USA": 9.5,
  "eBay UK": 12.8, "Amazon UK": 15, "Depop": 10,
  "eBay DE": 12, "Amazon DE": 15,
  "Vinted EU": 0, "eBay FR": 12, "eBay IT": 12, "eBay ES": 12,
};
const PLATFORM_CURRENCY_SYMBOL: Record<string, string> = {
  "Allegro PL": "zł", "OLX PL": "zł", "Vinted PL": "zł",
};
const PLATFORM_LINKS: Record<string, string> = {
  "Allegro PL": "https://allegro.pl/wystaw-przedmiot",
  "OLX PL": "https://www.olx.pl/d/dodaj-ogloszenie/",
  "Vinted PL": "https://www.vinted.pl/items/new",
  "eBay USA": "https://www.ebay.com/sell",
  "eBay DE": "https://www.ebay.de/sell",
  "eBay UK": "https://www.ebay.co.uk/sell",
  "Etsy USA": "https://www.etsy.com/sell",
  "StockX USA": "https://stockx.com/sell",
  "Depop": "https://www.depop.com/",
  "Vinted EU": "https://www.vinted.com/",
};
const CONFIDENCE_COLORS: Record<string, string> = { high: "#4ade80", medium: "#f5c842", low: "#f87171" };
const CONFIDENCE_LABELS: Record<string, string> = { high: "Wysoka", medium: "Średnia", low: "Niska" };
const CONFIDENCE_BARS: Record<string, number> = { high: 100, medium: 60, low: 30 };

interface Market {
  platform: string;
  country: string;
  currency: string;
  recommendedPrice: number;
  sourcePriceUSD: number;
  estimatedProfit: number;
  margin: number;
  confidence: "high" | "medium" | "low";
}
interface ListingContent { title: string; description: string; tags: string[] }
interface Recommendation {
  topPlatform: string;
  reason: string;
  expectedSaleTime: string;
  rankingTop3: string[];
  avoidPlatforms?: string[];
  avoidReason?: string;
}
interface AnalysisResult {
  product: { name: string; category: string; specs: string[]; sourcePriceMin: number; sourcePriceMax: number; sourcePriceNote: string };
  recommendation?: Recommendation;
  markets: Market[];
  listings: Record<string, ListingContent>;
  sellingTip: string;
}

export default function PhotoListingPage() {
  const [, setLocation] = useLocation();
  const [phase, setPhase] = useState<"upload" | "analyzing" | "result" | "creating">("upload");
  const [imagePreview, setImagePreview] = useState<string>("");
  const [imageData, setImageData] = useState<string>("");
  const [mimeType, setMimeType] = useState("image/jpeg");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createdCount, setCreatedCount] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) { setError("Wybierz plik graficzny (JPG, PNG, WEBP)"); return; }
    setError(null);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      setImagePreview(dataUrl);
      const b64 = dataUrl.split(",")[1];
      setImageData(b64);
      setMimeType(file.type);
      await analyze(b64, file.type);
    };
    reader.readAsDataURL(file);
  };

  const analyze = async (b64: string, mime: string) => {
    const key = getAnthropicKey();
    if (!key) { setError("Dodaj klucz Anthropic API w ustawieniach (⚙ API)"); return; }
    setPhase("analyzing");
    try {
      const res = await fetch("/api/dropship/photo-to-listings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imageData: b64, mimeType: mime, anthropicKey: key }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd analizy");
      setResult(data);
      setSelected(new Set(data.markets.filter((m: Market) => m.confidence === "high").map((m: Market) => m.platform)));
      setPhase("result");
    } catch (e: any) {
      setError(e.message);
      setPhase("upload");
    }
  };

  const createListings = async () => {
    if (!result || selected.size === 0) return;
    setCreating(true);
    const key = getAnthropicKey();
    let count = 0;
    for (const platform of Array.from(selected)) {
      const market = result.markets.find(m => m.platform === platform);
      const listing = result.listings[platform];
      if (!market) continue;
      try {
        await fetch("/api/dropship/listings", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            productName: listing?.title || result.product.name,
            sourceUrl: "",
            sourcePriceUSD: market.sourcePriceUSD,
            sellPrice: market.recommendedPrice,
            platform,
            category: result.product.category,
            description: listing?.description || "",
            buyHint: result.product.sourcePriceNote,
            sellHint: result.product.specs.slice(0, 3).join(", "),
            anthropicKey: key,
          }),
        });
        count++;
      } catch {}
    }
    setCreatedCount(count);
    setCreating(false);
    setPhase("result");
  };

  const inp: React.CSSProperties = {
    background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 9, color: "#fff", fontSize: 13, padding: "8px 12px",
  };

  return (
    <ResellLayout>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "linear-gradient(135deg, #8b5cf6, #7c3aed)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Camera size={20} color="#fff" />
          </div>
          <div>
            <h1 style={{ color: "#fff", fontWeight: 900, fontSize: 20, margin: 0 }}>Zdjęcie → Ogłoszenia</h1>
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, margin: 0 }}>Wgraj zdjęcie produktu — AI rozpoznaje, wycenia i tworzy gotowe ogłoszenia na każdą platformę</p>
          </div>
        </div>

        {error && (
          <div style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 10, padding: "12px 16px", marginBottom: 20, display: "flex", alignItems: "center", gap: 10, color: "#f87171", fontSize: 13 }}>
            <AlertCircle size={16} /> {error}
          </div>
        )}

        {/* ── UPLOAD phase ── */}
        {(phase === "upload") && (
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
            style={{
              border: `2px dashed ${dragOver ? "#a78bfa" : "rgba(139,92,246,0.35)"}`,
              borderRadius: 20, padding: "60px 24px", textAlign: "center", cursor: "pointer",
              background: dragOver ? "rgba(139,92,246,0.08)" : "rgba(139,92,246,0.03)",
              transition: "all 0.2s",
            }}
          >
            <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
            <div style={{ width: 72, height: 72, borderRadius: 18, background: "rgba(139,92,246,0.15)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
              <Upload size={30} color="#a78bfa" />
            </div>
            <div style={{ color: "#a78bfa", fontWeight: 800, fontSize: 18, marginBottom: 8 }}>Przeciągnij zdjęcie produktu</div>
            <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 13, marginBottom: 20 }}>lub kliknij żeby wybrać plik · JPG, PNG, WEBP</div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              {["📱 Elektronika", "👗 Odzież", "💎 Biżuteria", "📷 Aparaty", "🎮 Gry", "🏺 Antyki"].map(t => (
                <span key={t} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 99, padding: "4px 12px", color: "rgba(255,255,255,0.3)", fontSize: 11 }}>{t}</span>
              ))}
            </div>
          </div>
        )}

        {/* ── ANALYZING phase ── */}
        {phase === "analyzing" && (
          <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
            {imagePreview && (
              <div style={{ flexShrink: 0, width: 200, height: 200, borderRadius: 16, overflow: "hidden", border: "1px solid rgba(139,92,246,0.3)" }}>
                <img src={imagePreview} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="product" />
              </div>
            )}
            <div style={{ flex: 1, minWidth: 240 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
                <Loader2 size={22} color="#a78bfa" style={{ animation: "spin 1s linear infinite" }} />
                <span style={{ color: "#a78bfa", fontWeight: 700, fontSize: 16 }}>AI analizuje produkt…</span>
              </div>
              {["🔍 Rozpoznawanie produktu", "💰 Wycena na 8 platformach", "📝 Generowanie treści ogłoszeń", "📊 Kalkulacja zysku"].map((step, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: "rgba(139,92,246,0.4)", animation: `pulse 1.5s ease ${i * 0.3}s infinite` }} />
                  <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 13 }}>{step}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── RESULT phase ── */}
        {phase === "result" && result && (
          <div>
            {/* Product + image row */}
            <div style={{ display: "flex", gap: 20, marginBottom: 28, flexWrap: "wrap" }}>
              {imagePreview && (
                <div style={{ flexShrink: 0, width: 160, height: 160, borderRadius: 14, overflow: "hidden", border: "1px solid rgba(139,92,246,0.3)" }}>
                  <img src={imagePreview} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="product" />
                </div>
              )}
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ color: "#a78bfa", fontSize: 10, fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>ZIDENTYFIKOWANY PRODUKT</div>
                <div style={{ color: "#fff", fontWeight: 800, fontSize: 17, marginBottom: 8, lineHeight: 1.3 }}>{result.product.name}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                  {result.product.specs.map(s => (
                    <span key={s} style={{ background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.2)", borderRadius: 99, padding: "3px 10px", color: "#c4b5fd", fontSize: 11 }}>{s}</span>
                  ))}
                </div>
                <div style={{ background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.2)", borderRadius: 10, padding: "10px 14px" }}>
                  <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, fontWeight: 700, marginBottom: 4 }}>SZACOWANA CENA ZAKUPU (hurtowo/AliExpress)</div>
                  <div style={{ color: "#60a5fa", fontWeight: 800, fontSize: 16 }}>${result.product.sourcePriceMin}–${result.product.sourcePriceMax}</div>
                  <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, marginTop: 2 }}>{result.product.sourcePriceNote}</div>
                </div>
                {result.sellingTip && (
                  <div style={{ marginTop: 10, color: "rgba(255,255,255,0.4)", fontSize: 12, lineHeight: 1.5, fontStyle: "italic" }}>💡 {result.sellingTip}</div>
                )}
              </div>
            </div>

            {/* Success banner if created */}
            {createdCount > 0 && (
              <div style={{ background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.25)", borderRadius: 12, padding: "14px 18px", marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <CheckCircle size={18} color="#4ade80" />
                  <span style={{ color: "#4ade80", fontWeight: 700, fontSize: 14 }}>Utworzono {createdCount} ogłoszeń jako draft!</span>
                </div>
                <button onClick={() => setLocation("/resell/dropship")}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 9, border: "none", background: "linear-gradient(135deg, #4ade80, #22c55e)", color: "#000", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
                  <ShoppingBag size={14} /> Przejdź do Dropship <ChevronRight size={13} />
                </button>
              </div>
            )}

            {/* ── AI Recommendation banner ── */}
            {result.recommendation && (
              <div style={{ marginBottom: 24 }}>
                {/* Top pick */}
                <div style={{
                  background: "linear-gradient(135deg, rgba(245,200,66,0.12), rgba(139,92,246,0.10))",
                  border: "1px solid rgba(245,200,66,0.35)",
                  borderRadius: 16, padding: "18px 20px", marginBottom: 10,
                }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 32, lineHeight: 1 }}>🏆</div>
                    <div style={{ flex: 1, minWidth: 220 }}>
                      <div style={{ color: "rgba(245,200,66,0.7)", fontSize: 10, fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>REKOMENDACJA AI</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
                        <span style={{ color: "#f5c842", fontSize: 20, fontWeight: 900 }}>
                          {PLATFORM_FLAGS[result.recommendation.topPlatform] ?? "🌐"} {result.recommendation.topPlatform}
                        </span>
                        {result.recommendation.expectedSaleTime && (
                          <span style={{ background: "rgba(74,222,128,0.12)", border: "1px solid rgba(74,222,128,0.25)", borderRadius: 8, padding: "3px 10px", color: "#4ade80", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>
                            <Clock size={10} /> {result.recommendation.expectedSaleTime}
                          </span>
                        )}
                      </div>
                      <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, lineHeight: 1.5, marginBottom: 10 }}>
                        {result.recommendation.reason}
                      </div>
                      {/* Top 3 ranking */}
                      {result.recommendation.rankingTop3?.length > 0 && (
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, fontWeight: 700 }}>TOP 3:</span>
                          {result.recommendation.rankingTop3.map((p, i) => (
                            <span key={p} style={{
                              background: i === 0 ? "rgba(245,200,66,0.15)" : "rgba(255,255,255,0.06)",
                              border: `1px solid ${i === 0 ? "rgba(245,200,66,0.3)" : "rgba(255,255,255,0.1)"}`,
                              borderRadius: 7, padding: "3px 10px",
                              color: i === 0 ? "#f5c842" : "rgba(255,255,255,0.5)",
                              fontSize: 11, fontWeight: 700,
                            }}>
                              {i + 1}. {PLATFORM_FLAGS[p] ?? "🌐"} {p}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    {/* Quick list button */}
                    {PLATFORM_LINKS[result.recommendation.topPlatform] && (
                      <a
                        href={PLATFORM_LINKS[result.recommendation.topPlatform]}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 7,
                          background: "linear-gradient(135deg,#f5c842,#f59e0b)",
                          borderRadius: 10, padding: "10px 18px",
                          color: "#000", fontWeight: 800, fontSize: 13,
                          textDecoration: "none", whiteSpace: "nowrap", flexShrink: 0,
                        }}
                      >
                        <ExternalLink size={14} /> Wystaw teraz
                      </a>
                    )}
                  </div>
                </div>

                {/* Avoid warning */}
                {result.recommendation.avoidPlatforms?.length && result.recommendation.avoidReason && (
                  <div style={{
                    background: "rgba(248,113,113,0.07)", border: "1px solid rgba(248,113,113,0.2)",
                    borderRadius: 10, padding: "10px 14px",
                    display: "flex", alignItems: "flex-start", gap: 8,
                  }}>
                    <AlertCircle size={14} color="#f87171" style={{ flexShrink: 0, marginTop: 1 }} />
                    <div>
                      <span style={{ color: "#f87171", fontSize: 11, fontWeight: 700 }}>Unikaj: </span>
                      <span style={{ color: "rgba(248,113,113,0.8)", fontSize: 11 }}>
                        {result.recommendation.avoidPlatforms.join(", ")} — {result.recommendation.avoidReason}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Markets table */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, fontWeight: 700, letterSpacing: 0.8, marginBottom: 12 }}>MOŻLIWOŚCI SPRZEDAŻY — {result.markets.length} PLATFORM</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {result.markets.map(m => {
                  const isSel = selected.has(m.platform);
                  const isTop = result.recommendation?.topPlatform === m.platform;
                  const fee = PLATFORM_FEES[m.platform] ?? 12;
                  const feeAmt = +(m.recommendedPrice * fee / 100).toFixed(2);
                  const listLink = PLATFORM_LINKS[m.platform];
                  return (
                    <div key={m.platform}
                      onClick={() => setSelected(prev => { const n = new Set(prev); isSel ? n.delete(m.platform) : n.add(m.platform); return n; })}
                      style={{
                        display: "flex", alignItems: "center", gap: 12,
                        background: isTop ? "rgba(245,200,66,0.07)" : isSel ? "rgba(139,92,246,0.12)" : "rgba(255,255,255,0.03)",
                        border: `1px solid ${isTop ? "rgba(245,200,66,0.3)" : isSel ? "rgba(139,92,246,0.35)" : "rgba(255,255,255,0.07)"}`,
                        borderRadius: 12, padding: "12px 16px", cursor: "pointer",
                        transition: "all 0.15s", flexWrap: "wrap",
                        position: "relative",
                      }}>
                      {/* Checkbox */}
                      <div style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${isSel ? "#8b5cf6" : "rgba(255,255,255,0.2)"}`, background: isSel ? "#8b5cf6" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        {isSel && <span style={{ color: "#fff", fontSize: 10, fontWeight: 900 }}>✓</span>}
                      </div>
                      {/* Flag + platform */}
                      <div style={{ minWidth: 130 }}>
                        <div style={{ color: "#fff", fontWeight: 700, fontSize: 13 }}>{PLATFORM_FLAGS[m.platform] ?? "🌐"} {m.platform}</div>
                        <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10 }}>{fee}% prowizja</div>
                      </div>
                      {/* Price */}
                      <div style={{ minWidth: 70 }}>
                        <div style={{ color: "#a78bfa", fontWeight: 800, fontSize: 15 }}>
                          {PLATFORM_CURRENCY_SYMBOL[m.platform] ?? (m.currency === "USD" ? "$" : m.currency === "GBP" ? "£" : m.currency === "EUR" ? "€" : "")}{m.recommendedPrice}
                        </div>
                        <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 10 }}>cena sprzedaży</div>
                      </div>
                      {/* Profit */}
                      <div style={{ minWidth: 70 }}>
                        <div style={{ color: m.estimatedProfit > 0 ? "#4ade80" : "#f87171", fontWeight: 800, fontSize: 15 }}>+${m.estimatedProfit}</div>
                        <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 10 }}>zysk (~{m.margin}%)</div>
                      </div>
                      {/* Breakdown */}
                      <div style={{ display: "flex", gap: 8, color: "rgba(255,255,255,0.2)", fontSize: 10, flexWrap: "wrap" }}>
                        <span>zakup ~${m.sourcePriceUSD}</span>
                        <span>·</span>
                        <span>fee ${feeAmt}</span>
                      </div>
                      {/* Confidence + top badge + list link */}
                      <div style={{ marginLeft: "auto", textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, minWidth: 90 }}>
                        {isTop && (
                          <span style={{ background: "rgba(245,200,66,0.2)", border: "1px solid rgba(245,200,66,0.4)", borderRadius: 6, padding: "2px 8px", color: "#f5c842", fontSize: 9, fontWeight: 800 }}>
                            🏆 TOP
                          </span>
                        )}
                        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                          <div style={{ width: 48, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                            <div style={{ width: `${CONFIDENCE_BARS[m.confidence]}%`, height: "100%", background: CONFIDENCE_COLORS[m.confidence], borderRadius: 2 }} />
                          </div>
                          <span style={{ color: CONFIDENCE_COLORS[m.confidence], fontSize: 10, fontWeight: 700 }}>{CONFIDENCE_LABELS[m.confidence]}</span>
                        </div>
                        {listLink && (
                          <a
                            href={listLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, padding: "3px 8px", color: "rgba(255,255,255,0.5)", fontSize: 10, textDecoration: "none", fontWeight: 600 }}
                          >
                            <ExternalLink size={9} /> Wystaw
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Listing previews (collapsed, show for selected) */}
            {selected.size > 0 && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, fontWeight: 700, letterSpacing: 0.8, marginBottom: 12 }}>PODGLĄD TREŚCI OGŁOSZEŃ</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {Array.from(selected).map(platform => {
                    const lc = result.listings[platform];
                    if (!lc) return null;
                    return (
                      <div key={platform} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "14px 16px" }}>
                        <div style={{ color: "#a78bfa", fontWeight: 700, fontSize: 12, marginBottom: 6 }}>{PLATFORM_FLAGS[platform] ?? "🌐"} {platform}</div>
                        <div style={{ color: "#fff", fontWeight: 700, fontSize: 13, marginBottom: 6 }}>{lc.title}</div>
                        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, lineHeight: 1.55, marginBottom: 8 }}>{lc.description}</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                          {lc.tags.map(t => <span key={t} style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.2)", borderRadius: 99, padding: "2px 8px", color: "#c4b5fd", fontSize: 10 }}>#{t}</span>)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button
                onClick={createListings}
                disabled={creating || selected.size === 0}
                style={{ flex: 1, minWidth: 200, padding: "14px 20px", borderRadius: 12, border: "none", cursor: creating || selected.size === 0 ? "not-allowed" : "pointer", background: selected.size === 0 ? "rgba(139,92,246,0.2)" : "linear-gradient(135deg, #8b5cf6, #7c3aed)", color: "#fff", fontWeight: 800, fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, opacity: selected.size === 0 ? 0.5 : 1 }}>
                {creating ? <><Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> Tworzę…</> : <><Zap size={16} /> Utwórz {selected.size} ogłoszeń ({selected.size === 0 ? "zaznacz platformy" : Array.from(selected).map(p => PLATFORM_FLAGS[p] ?? "🌐").join("")})</>}
              </button>
              <button onClick={() => { setPhase("upload"); setResult(null); setImagePreview(""); setCreatedCount(0); }}
                style={{ padding: "14px 20px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.12)", background: "transparent", color: "rgba(255,255,255,0.5)", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                🔄 Nowe zdjęcie
              </button>
            </div>
          </div>
        )}
      </div>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity: 0.4; } 50% { opacity: 1; } }
      `}</style>
    </ResellLayout>
  );
}
