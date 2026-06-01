import React, { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  Search, TrendingUp, Zap, RefreshCw, Star,
  ExternalLink, Boxes, AlertCircle, X, PlusCircle, Check, BookmarkPlus,
  ArrowRight, Package, ShieldCheck, ShieldAlert, Clock, Megaphone, ChevronRight, Bot,
} from "lucide-react";
import { addToPipeline, loadPipeline } from "@/lib/pipeline";
import { loadTokenStats, estimateCostUSD, type TokenStats } from "@/lib/tokenUsage";
import { getAnthropicKey, getEbayKeys, getEtsyKey, getUserLocation } from "@/lib/apiKeys";
import { ResellLayout } from "@/components/resell/ResellLayout";
import { QuickCreateOfferModal } from "@/components/resell/QuickCreateOfferModal";
import { LocationPicker } from "@/components/resell/LocationPicker";

type Opportunity = {
  id: number; name: string; buy: number; sell: number; profit: number;
  netProfit?: number; margin: number; market: string; category: string; score: number;
  trend: string; flag: string; tip?: string;
  risk?: "low" | "medium" | "high";
  demandLevel?: "high" | "medium" | "low";
  buyHint?: string; sellHint?: string;
  sourceUrl?: string; sellUrl?: string; imageUrl?: string;
  priceGapPct?: number; confidence?: "live" | "estimated";
  daysToSell?: number;
  stockCount?: number | null;
  sellerRating?: number | null;
  sellerFeedback?: number;
  additionalImages?: string[];
  itemCondition?: string;
  dataQuality?: "verified" | "matched" | "estimated";
  keywordMatch?: number;
  shippingFeasible?: boolean;
  realBuyPrice?: number;
  realBuyTitle?: string;
  markets?: string[];
  sellUrls?: Record<string, string>;
  sellMarketOptions?: { market: string; sell: number; netProfit: number; sample: number }[];
  _enriching?: boolean;
};

const CATEGORIES = ["All", "Clothing", "Jewelry", "Electronics", "Collectibles", "Sneakers", "Spirits", "Antiques", "Watches"];

const SCAN_STEPS = [
  "Łączenie z eBay…",
  "Skanowanie Etsy…",
  "Sprawdzanie Amazon EU/UK…",
  "Analiza różnic cenowych…",
  "AI model zysku…",
  "Ranking okazji…",
];

const SCAN_TS_KEY = "resell_last_scan_ts";
const SCAN_DATA_KEY = "resell_scan_data";
const SCAN_REAL_KEY = "resell_scan_is_real";

function loadCachedOpportunities(): { opps: Opportunity[]; isReal: boolean } | null {
  try {
    const raw = localStorage.getItem(SCAN_DATA_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.length) return null;
    const isReal = localStorage.getItem(SCAN_REAL_KEY) === "1";
    return { opps: parsed as Opportunity[], isReal };
  } catch { return null; }
}

// ── Category emoji map ────────────────────────────────────────────────────────
const CAT_EMOJI: Record<string, string> = {
  Clothing: "👗", Jewelry: "💎", Electronics: "📱", Collectibles: "🏺",
  Sneakers: "👟", Spirits: "🥃", Antiques: "🏛", Watches: "⌚", General: "📦",
};

// ── Platform color map ────────────────────────────────────────────────────────
const PLATFORM_COLOR: Record<string, { bg: string; border: string; text: string }> = {
  "eBay":    { bg: "rgba(245,200,66,0.13)",  border: "rgba(245,200,66,0.3)",  text: "#f5c842" },
  "Etsy":    { bg: "rgba(248,113,113,0.13)", border: "rgba(248,113,113,0.3)", text: "#f87171" },
  "Amazon":  { bg: "rgba(96,165,250,0.13)",  border: "rgba(96,165,250,0.3)",  text: "#60a5fa" },
  "StockX":  { bg: "rgba(74,222,128,0.13)",  border: "rgba(74,222,128,0.3)",  text: "#4ade80" },
  "Vinted":  { bg: "rgba(52,211,153,0.13)",  border: "rgba(52,211,153,0.3)",  text: "#34d399" },
  "Depop":   { bg: "rgba(244,114,182,0.13)", border: "rgba(244,114,182,0.3)", text: "#f472b6" },
  "default": { bg: "rgba(139,92,246,0.13)",  border: "rgba(139,92,246,0.3)",  text: "#a78bfa" },
};

function platformStyle(name: string) {
  const key = Object.keys(PLATFORM_COLOR).find(k => name.includes(k)) ?? "default";
  return PLATFORM_COLOR[key];
}

const QUICK_MARKETS = [
  { label: "🇵🇱 Polska", value: "Poland" },
  { label: "🇩🇪 Niemcy", value: "Germany" },
  { label: "🇺🇸 USA", value: "USA" },
  { label: "🇬🇧 UK", value: "UK" },
  { label: "🌍 Europa", value: "Europe", type: "continent" as const },
  { label: "🌐 Świat", value: "Worldwide", type: "world" as const },
];

function MarketingLauncher({ opportunities, onNavigate }: { opportunities: Opportunity[]; onNavigate: (p: string) => void }) {
  const [mkProduct, setMkProduct] = useState("");
  const [mkMarket, setMkMarket] = useState("Poland");
  const [mkType, setMkType] = useState<"country" | "continent" | "world">("country");

  const launch = () => {
    const params = new URLSearchParams({ product: mkProduct, market: mkMarket, type: mkType });
    onNavigate(`/resell/marketing?${params.toString()}`);
  };

  const topProduct = opportunities.length > 0 ? opportunities[0].name : "";

  return (
    <div style={{
      background: "linear-gradient(135deg, rgba(236,72,153,0.08), rgba(168,85,247,0.06), rgba(99,102,241,0.04))",
      border: "1px solid rgba(168,85,247,0.25)",
      borderRadius: 16, padding: "18px 20px", marginBottom: 20,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg,#ec4899,#a855f7)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 4px 14px rgba(168,85,247,0.35)" }}>
          <Megaphone size={17} color="#fff" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ color: "#fff", fontWeight: 800, fontSize: 14 }}>Marketing AI</div>
          <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11 }}>Kampania dla dowolnego produktu — kraj, kontynent lub cały świat</div>
        </div>
        <button onClick={() => onNavigate("/resell/marketing")} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(168,85,247,0.3)", background: "transparent", color: "#c4b5fd", fontSize: 11, cursor: "pointer", whiteSpace: "nowrap" }}>
          Pełne narzędzie <ChevronRight size={12} />
        </button>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input
          value={mkProduct}
          onChange={e => setMkProduct(e.target.value)}
          onKeyDown={e => e.key === "Enter" && mkProduct.trim() && launch()}
          placeholder={topProduct ? `np. ${topProduct.split(" ").slice(0, 3).join(" ")}` : "Nazwa produktu…"}
          style={{ flex: "1 1 200px", minWidth: 160, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 9, color: "#fff", fontSize: 13, padding: "9px 12px", outline: "none" }}
        />
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {QUICK_MARKETS.map(m => (
            <button key={m.value} onClick={() => { setMkMarket(m.value); setMkType(m.type ?? "country"); }} style={{
              padding: "7px 11px", borderRadius: 8, fontSize: 11,
              border: `1px solid ${mkMarket === m.value ? "rgba(236,72,153,0.5)" : "rgba(255,255,255,0.09)"}`,
              background: mkMarket === m.value ? "rgba(236,72,153,0.15)" : "rgba(255,255,255,0.03)",
              color: mkMarket === m.value ? "#f9a8d4" : "rgba(255,255,255,0.45)",
              cursor: "pointer", fontWeight: mkMarket === m.value ? 700 : 400,
            }}>{m.label}</button>
          ))}
        </div>
        <button
          onClick={launch}
          disabled={!mkProduct.trim()}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "9px 18px", borderRadius: 9, border: "none",
            background: mkProduct.trim() ? "linear-gradient(135deg,#ec4899,#a855f7)" : "rgba(168,85,247,0.15)",
            color: mkProduct.trim() ? "#fff" : "rgba(255,255,255,0.3)",
            fontWeight: 800, fontSize: 13, cursor: mkProduct.trim() ? "pointer" : "not-allowed",
            whiteSpace: "nowrap",
          }}
        >
          <Megaphone size={14} /> Generuj <ChevronRight size={13} />
        </button>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [sortKey, setSortKey] = useState<"score" | "profit" | "sell_desc" | "buy_asc">("score");
  const [scanning, setScanning] = useState(false);
  const [scanStep, setScanStep] = useState("");
  const [opportunities, setOpportunities] = useState<Opportunity[]>(() => {
    const cached = loadCachedOpportunities();
    return cached ? cached.opps : [];
  });
  const [isRealData, setIsRealData] = useState<boolean>(() => {
    const cached = loadCachedOpportunities();
    return cached?.isReal ?? false;
  });
  const [scannedAt, setScannedAt] = useState<string | null>(null);
  const [scanSource, setScanSource] = useState<"ai" | "live" | "example" | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [offerOpp, setOfferOpp] = useState<Opportunity | null>(null);
  const [enrichedData, setEnrichedData] = useState<Record<number, {
    imageUrl: string; sourceUrl: string;
    stockCount?: number | null; sellerRating?: number | null; additionalImages?: string[];
  }>>({});
  const [savedIds, setSavedIds] = useState<Set<string>>(() => {
    const p = loadPipeline();
    return new Set(p.map(i => `${i.id}:${i.name}`));
  });
  const [toast, setToast] = useState<string | null>(null);
  const [previewImg, setPreviewImg] = useState<{ src: string; name: string; rect: DOMRect } | null>(null);
  const [tokenStats, setTokenStats] = useState<TokenStats>(() => loadTokenStats());

  useEffect(() => {
    const refresh = () => setTokenStats(loadTokenStats());
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);

  const filtered = opportunities
    .filter(o =>
      (activeCategory === "All" || o.category === activeCategory) &&
      (query === "" || o.name.toLowerCase().includes(query.toLowerCase()))
    )
    .sort((a, b) => {
      if (sortKey === "profit") return (b.netProfit ?? b.profit) - (a.netProfit ?? a.profit);
      if (sortKey === "sell_desc") return b.sell - a.sell;
      if (sortKey === "buy_asc") return a.buy - b.buy;
      return b.score - a.score;
    });

  const totalNetProfit = opportunities.reduce((s, o) => s + (o.netProfit ?? o.profit), 0);
  const avgMargin = opportunities.length
    ? Math.round(opportunities.reduce((s, o) => s + o.margin, 0) / opportunities.length)
    : 0;
  const topDeal = opportunities.length
    ? opportunities.reduce((a, b) => (a.netProfit ?? a.profit) > (b.netProfit ?? b.profit) ? a : b)
    : null;
  const highRiskCount = opportunities.filter(o => o.risk === "high").length;

  // Lazy-load images + direct URLs for opportunities missing imageUrl
  useEffect(() => {
    const ebay = getEbayKeys();
    if (!ebay.appId || !ebay.certId) return;
    const toEnrich = opportunities.filter(o => !o.imageUrl && !enrichedData[o.id]);
    if (!toEnrich.length) return;
    toEnrich.forEach((opp, idx) => {
      setTimeout(async () => {
        try {
          const r = await fetch("/api/resell/enrich-opportunity", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: opp.name, flag: opp.flag, ebayAppId: ebay.appId, ebayCertId: ebay.certId }),
          });
          const data = await r.json();
          if (data.imageUrl || data.sourceUrl) {
            setEnrichedData(prev => ({ ...prev, [opp.id]: {
              imageUrl: data.imageUrl, sourceUrl: data.sourceUrl,
              stockCount: data.stockCount, sellerRating: data.sellerRating,
              additionalImages: data.additionalImages,
            }}));
          }
        } catch { /* silent */ }
      }, idx * 350);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opportunities]);

  // Auto-scan on mount only if no real data cached
  useEffect(() => {
    const hasKeys = !!getAnthropicKey();
    const hasRealData = localStorage.getItem(SCAN_REAL_KEY) === "1";
    if (!hasRealData && hasKeys) triggerScan();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const triggerScan = async () => {
    if (scanning) return;
    setScanning(true);
    setScanError(null);
    setScanStep("Łączenie z rynkami…");
    setOpportunities([]); // clear so animation shows while waiting for first result

    const oppsBuffer: Opportunity[] = [];
    let source = "ai";

    try {
      const ebay = getEbayKeys();
      const res = await fetch("/api/resell/scan-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          anthropicKey: getAnthropicKey(),
          ebayAppId: ebay.appId,
          ebayCertId: ebay.certId,
          etsyApiKey: getEtsyKey(),
          userLocation: getUserLocation(),
        }),
      });

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";

        for (const part of parts) {
          if (!part.trim()) continue;
          let ev = "message", d = "";
          for (const ln of part.split("\n")) {
            if (ln.startsWith("event: ")) ev = ln.slice(7).trim();
            else if (ln.startsWith("data: ")) d = ln.slice(6).trim();
          }
          try {
            if (ev === "status") {
              setScanStep(JSON.parse(d).step ?? "");
            } else if (ev === "ai-opportunity") {
              const opp: Opportunity = { ...JSON.parse(d), _enriching: true };
              oppsBuffer.push(opp);
              setOpportunities(prev => {
                const without = prev.filter(p => p.id !== opp.id);
                return [...without, opp].sort((a, b) => b.score - a.score);
              });
            } else if (ev === "opportunity") {
              const opp: Opportunity = { ...JSON.parse(d), _enriching: false };
              const idx = oppsBuffer.findIndex(p => p.id === opp.id);
              if (idx !== -1) oppsBuffer[idx] = opp; else oppsBuffer.push(opp);
              setOpportunities(prev => {
                const without = prev.filter(p => p.id !== opp.id);
                return [...without, opp].sort((a, b) => b.score - a.score);
              });
            } else if (ev === "done") {
              source = JSON.parse(d).source ?? "ai";
            }
          } catch { /* malformed SSE data — skip */ }
        }
      }

      const isReal = source !== "example" && source !== "no-keys" && source !== "error";
      setIsRealData(isReal);
      setScanSource(source as any);
      setScannedAt(new Date().toLocaleTimeString());
      const alreadyReal = localStorage.getItem(SCAN_REAL_KEY) === "1";
      if (isReal) {
        localStorage.setItem(SCAN_DATA_KEY, JSON.stringify(oppsBuffer));
        localStorage.setItem(SCAN_TS_KEY, String(Date.now()));
        localStorage.setItem(SCAN_REAL_KEY, "1");
      } else if (!alreadyReal) {
        localStorage.setItem(SCAN_DATA_KEY, JSON.stringify(oppsBuffer));
        localStorage.setItem(SCAN_TS_KEY, String(Date.now()));
      }
      if (!oppsBuffer.length) {
        setScanError("Brak wyników — sprawdź klucze API w Ustawieniach.");
      }
    } catch {
      setScanError("Błąd połączenia — skanowanie nieudane. Wyświetlam zapisane dane.");
    }

    setScanStep("");
    setScanning(false);
  };

  return (
    <ResellLayout>
      <div style={{ padding: "24px 24px 80px", maxWidth: 1100, margin: "0 auto" }}>

        {/* ── Header ── */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <h1 style={{ color: "#fff", fontSize: 24, fontWeight: 900, margin: 0, letterSpacing: -0.5 }}>
                AI Market Scanner
              </h1>
              <div style={{
                display: "flex", alignItems: "center", gap: 5,
                background: scanning ? "rgba(245,200,66,0.12)" : "rgba(74,222,128,0.10)",
                border: `1px solid ${scanning ? "rgba(245,200,66,0.3)" : "rgba(74,222,128,0.25)"}`,
                borderRadius: 99, padding: "3px 10px",
              }}>
                <div style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: scanning ? "#f5c842" : "#4ade80",
                  animation: "pulse 1.5s infinite",
                }} />
                <span style={{ color: scanning ? "#fde68a" : "#86efac", fontSize: 11, fontWeight: 700 }}>
                  {scanning ? "Skanuje..." : "Live"}
                </span>
              </div>
            </div>
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, margin: 0 }}>
              {scanStep
                ? <span style={{ color: "#f5c842" }}>{scanStep}</span>
                : scannedAt
                  ? <>Ostatni skan: <span style={{ color: "#86efac" }}>{scannedAt}</span>
                      {scanSource === "live" && <span style={{ color: "#4ade80", marginLeft: 6 }}>· 🟢 Dane live</span>}
                      {scanSource === "ai" && <span style={{ color: "#a78bfa", marginLeft: 6 }}>· 🤖 AI</span>}
                      {scanSource === "example" && <span style={{ color: "#f87171", marginLeft: 6 }}>· 📋 Przykładowe</span>}
                    </>
                  : "Arbitraż cross-border w czasie rzeczywistym"
              }
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <LocationPicker onChange={() => {
              // Location drives which markets are scanned — refresh on change
              if (!scanning) triggerScan();
            }} />
            <button
              onClick={triggerScan}
              disabled={scanning}
              style={{
                display: "flex", alignItems: "center", gap: 7,
                padding: "10px 18px", borderRadius: 10, cursor: scanning ? "not-allowed" : "pointer",
                background: scanning ? "rgba(245,200,66,0.15)" : "linear-gradient(135deg,rgba(139,92,246,0.25),rgba(124,58,237,0.15))",
                border: `1px solid ${scanning ? "rgba(245,200,66,0.3)" : "rgba(139,92,246,0.4)"}`,
                color: scanning ? "#fde68a" : "#c4b5fd", fontWeight: 700, fontSize: 13,
                opacity: scanning ? 0.8 : 1,
              }}
            >
              <RefreshCw size={14} style={{ animation: scanning ? "spin 1s linear infinite" : "none" }} />
              {scanning ? scanStep || "Skanuje..." : "Skanuj ponownie"}
            </button>
          </div>
        </div>

        {/* ── AI token usage strip ── */}
        {(() => {
          const s = tokenStats;
          const cost = estimateCostUSD(s);
          const monthLabel = s.month ? new Date(s.month + "-01").toLocaleString("pl-PL", { month: "long", year: "numeric" }) : "";
          if (!s.calls) return null;
          return (
            <div style={{
              display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
              background: "rgba(168,85,247,0.06)", border: "1px solid rgba(168,85,247,0.18)",
              borderRadius: 10, padding: "8px 14px", marginBottom: 16,
            }}>
              <span style={{ color: "#a78bfa", fontSize: 11, fontWeight: 700 }}>🤖 Tokeny AI</span>
              <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 11 }}>·</span>
              <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 11 }}>{monthLabel}</span>
              <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 11 }}>·</span>
              <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 11 }}>
                <span style={{ color: "#c4b5fd" }}>{s.outputTotal.toLocaleString()}</span> out
              </span>
              <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 11 }}>·</span>
              <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 11 }}>
                {s.inputTotal.toLocaleString()} in
              </span>
              <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 11 }}>·</span>
              <span style={{ color: "#fbbf24", fontSize: 11, fontWeight: 700 }}>~${cost.toFixed(3)}</span>
              <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 11 }}>·</span>
              <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>{s.calls} {s.calls === 1 ? "zapytanie" : "zapytań"}</span>
              {s.haikuCalls > 0 && <span style={{ color: "#4ade80", fontSize: 10 }}>⚡{s.haikuCalls}×H</span>}
              {s.sonnetCalls > 0 && <span style={{ color: "#fbbf24", fontSize: 10 }}>✦{s.sonnetCalls}×S</span>}
            </div>
          );
        })()}

        {/* ── Error banner ── */}
        {scanError && (
          <div style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)", borderRadius: 10, padding: "10px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
            <AlertCircle size={14} color="#f87171" style={{ flexShrink: 0 }} />
            <span style={{ color: "#fca5a5", fontSize: 12, flex: 1 }}>{scanError}</span>
            <button onClick={() => setScanError(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.3)", padding: 2 }}>
              <X size={13} />
            </button>
          </div>
        )}

        {/* ── Stale data banner ── */}
        {(opportunities.length === 0 || !isRealData) && !scanning && (
          <div style={{ background: "rgba(139,92,246,0.07)", border: "1px solid rgba(139,92,246,0.25)", borderRadius: 10, padding: "12px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <Zap size={15} color="#a78bfa" style={{ flexShrink: 0 }} />
            <span style={{ color: "#c4b5fd", fontSize: 13, flex: 1, minWidth: 180 }}>
              {opportunities.length === 0
                ? <>Brak danych — naciśnij <strong>Skanuj ponownie</strong>.</>
                : <>Dane przykładowe — naciśnij <strong>Skanuj ponownie</strong> żeby pobrać aktualne okazje.</>}
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              {opportunities.length > 0 && !isRealData && (
                <button
                  onClick={() => {
                    localStorage.removeItem(SCAN_DATA_KEY);
                    localStorage.removeItem(SCAN_REAL_KEY);
                    localStorage.removeItem(SCAN_TS_KEY);
                    setOpportunities([]);
                    setIsRealData(false);
                  }}
                  style={{ background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 7, padding: "6px 12px", cursor: "pointer", color: "#fca5a5", fontSize: 11, fontWeight: 700 }}
                >
                  Wyczyść cache
                </button>
              )}
              <button
                onClick={triggerScan}
                style={{ background: "rgba(139,92,246,0.18)", border: "1px solid rgba(139,92,246,0.35)", borderRadius: 7, padding: "6px 14px", cursor: "pointer", color: "#a78bfa", fontSize: 12, fontWeight: 700 }}
              >
                Skanuj teraz
              </button>
            </div>
          </div>
        )}

        {/* ── Agent AI launcher ── */}
        <div
          onClick={() => setLocation("/resell/agent")}
          style={{
            background: "linear-gradient(135deg,rgba(34,197,94,0.1),rgba(74,222,128,0.06))",
            border: "1px solid rgba(34,197,94,0.3)", borderRadius: 14,
            padding: "14px 18px", marginBottom: 16, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 12,
          }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: "linear-gradient(135deg,#16a34a,#22c55e)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 4px 14px rgba(34,197,94,0.35)" }}>
            <Bot size={18} color="#fff" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ color: "#fff", fontWeight: 800, fontSize: 14 }}>ARIA — Agent AI</div>
            <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11 }}>Analizuje rynek i tworzy plan zarobku — kliknij żeby uruchomić</div>
          </div>
          <ChevronRight size={16} color="rgba(34,197,94,0.6)" />
        </div>

        {/* ── Marketing AI launcher ── */}
        <MarketingLauncher opportunities={opportunities} onNavigate={setLocation} />

        {/* ── Stats row ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 22 }}>
          {[
            {
              label: "OKAZJI", value: String(opportunities.length),
              sub: filtered.length !== opportunities.length ? `${filtered.length} widocznych` : "wszystkie kategorie",
              color: "#f5c842", icon: <Zap size={14} color="#f5c842" />,
            },
            {
              label: "ŚR. MARŻA", value: `${avgMargin}%`,
              sub: "po opłatach i wysyłce",
              color: "#4ade80", icon: <TrendingUp size={14} color="#4ade80" />,
            },
            {
              label: "NAJLEPSZY ZYSK", value: topDeal ? `$${topDeal.netProfit ?? topDeal.profit}` : "—",
              sub: topDeal ? topDeal.name.split(" ").slice(0, 3).join(" ") : "brak danych",
              color: "#a78bfa", icon: <Star size={14} color="#a78bfa" />,
            },
            {
              label: "RYZYKO WYSOKIE", value: String(highRiskCount),
              sub: `z ${opportunities.length} okazji`,
              color: highRiskCount > 0 ? "#f87171" : "#4ade80",
              icon: highRiskCount > 0 ? <ShieldAlert size={14} color="#f87171" /> : <ShieldCheck size={14} color="#4ade80" />,
            },
          ].map(s => (
            <div key={s.label} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "14px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                {s.icon}
                <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 9, fontWeight: 700, letterSpacing: 0.8 }}>{s.label}</span>
              </div>
              <div style={{ color: s.color, fontSize: 22, fontWeight: 900, letterSpacing: -0.5, lineHeight: 1 }}>{s.value}</div>
              <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 10, marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.sub}</div>
            </div>
          ))}
        </div>

        {/* ── Search + categories ── */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            {/* Search */}
            <div style={{ position: "relative", flex: "1 1 220px", minWidth: 180 }}>
              <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.3)", pointerEvents: "none" }} />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Szukaj okazji..."
                style={{
                  width: "100%", background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(139,92,246,0.2)", borderRadius: 9,
                  padding: "9px 12px 9px 36px", color: "#fff", fontSize: 13,
                  outline: "none", boxSizing: "border-box", fontFamily: "inherit",
                }}
              />
            </div>
            {/* Sort */}
            <select
              value={sortKey}
              onChange={e => setSortKey(e.target.value as typeof sortKey)}
              style={{
                background: "rgba(255,255,255,0.05)", border: "1px solid rgba(139,92,246,0.2)",
                borderRadius: 9, padding: "9px 12px", color: "rgba(255,255,255,0.7)",
                fontSize: 12, cursor: "pointer", fontFamily: "inherit", outline: "none",
              }}
            >
              <option value="score">⭐ AI Score</option>
              <option value="profit">💰 Najwyższy zysk</option>
              <option value="sell_desc">↑ Najwyższa cena</option>
              <option value="buy_asc">🏷 Najtańszy zakup</option>
            </select>
          </div>
          {/* Category pills */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                style={{
                  padding: "6px 13px", borderRadius: 99, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600,
                  background: activeCategory === cat ? "linear-gradient(135deg,#8b5cf6,#7c3aed)" : "rgba(255,255,255,0.06)",
                  color: activeCategory === cat ? "#fff" : "rgba(255,255,255,0.45)",
                  boxShadow: activeCategory === cat ? "0 2px 10px rgba(139,92,246,0.3)" : "none",
                  transition: "all 0.15s",
                }}
              >
                {cat !== "All" ? `${CAT_EMOJI[cat] ?? ""} ` : ""}{cat}
              </button>
            ))}
          </div>
        </div>

        {/* ── Scanning animation (only when no cards yet) ── */}
        {scanning && filtered.length === 0 && (
          <div style={{ padding: "48px 24px", textAlign: "center" }}>
            <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 16 }}>
              {[0,1,2,3,4].map(i => (
                <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: "#8b5cf6", animation: `bounce 1s ${i * 0.15}s infinite` }} />
              ))}
            </div>
            <div style={{ color: "#f5c842", fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{scanStep}</div>
            <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 12 }}>Trwa analiza rynków…</div>
          </div>
        )}

        {/* ── Enrichment progress bar (cards already visible, prices updating) ── */}
        {scanning && filtered.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, padding: "8px 14px", background: "rgba(245,200,66,0.07)", border: "1px solid rgba(245,200,66,0.2)", borderRadius: 8 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#f5c842", animation: "pulse 1s infinite", flexShrink: 0 }} />
            <span style={{ color: "#fde68a", fontSize: 12, fontWeight: 700, flex: 1 }}>{scanStep || "Weryfikacja cen na eBay…"}</span>
            <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>Karty aktualizują się automatycznie</span>
          </div>
        )}

        {/* ── Empty state ── */}
        {!scanning && filtered.length === 0 && (
          <div style={{ padding: "48px 24px", textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
            <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 14, marginBottom: 16 }}>
              {query || activeCategory !== "All" ? "Brak okazji pasujących do filtrów" : "Brak danych — uruchom skanowanie"}
            </div>
            <button
              onClick={triggerScan}
              style={{ background: "linear-gradient(135deg,#8b5cf6,#7c3aed)", border: "none", borderRadius: 10, padding: "10px 22px", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
            >
              Skanuj teraz
            </button>
          </div>
        )}

        {/* ── Opportunity cards grid ── */}
        {filtered.length > 0 && (
          <>
            <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 11, marginBottom: 10 }}>
              {filtered.length} okazj{filtered.length === 1 ? "a" : filtered.length < 5 ? "e" : "i"}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(480px,1fr))", gap: 12 }}>
              {filtered.map(o => {
                const netP = o.netProfit ?? o.profit;
                const scoreColor = o.score >= 85 ? "#4ade80" : o.score >= 65 ? "#f5c842" : "#f87171";
                const riskColor = o.risk === "low" ? "#4ade80" : o.risk === "medium" ? "#f5c842" : "#f87171";
                const riskLabel = o.risk === "low" ? "Niskie" : o.risk === "medium" ? "Średnie" : o.risk === "high" ? "Wysokie" : "—";
                const imgUrl = enrichedData[o.id]?.imageUrl || o.imageUrl;
                const srcUrl = enrichedData[o.id]?.sourceUrl || o.sourceUrl;
                const stockCount = enrichedData[o.id]?.stockCount ?? o.stockCount;
                const sellerRating = enrichedData[o.id]?.sellerRating ?? o.sellerRating;
                const isSaved = savedIds.has(`${o.id}:${o.name}`);
                const platforms = o.markets?.length ? o.markets : [o.market];
                const catEmoji = CAT_EMOJI[o.category] ?? "📦";

                return (
                  <div
                    key={o.id}
                    onClick={() => {
                      sessionStorage.setItem("resell_opportunity", JSON.stringify(o));
                      sessionStorage.setItem("compare_product", JSON.stringify({ name: o.name, buyPrice: o.buy, category: o.category }));
                      setLocation(`/resell/product/${o.id}`);
                    }}
                    style={{
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: 16,
                      padding: 16,
                      cursor: "pointer",
                      transition: "all 0.15s",
                      display: "flex",
                      flexDirection: "column",
                      gap: 12,
                      position: "relative",
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.055)";
                      (e.currentTarget as HTMLElement).style.border = "1px solid rgba(139,92,246,0.3)";
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)";
                      (e.currentTarget as HTMLElement).style.border = "1px solid rgba(255,255,255,0.08)";
                    }}
                  >
                    {/* Enriching pulse — disappears once real eBay data arrives */}
                    {o._enriching && (
                      <div style={{ position: "absolute", top: 9, right: 9, width: 7, height: 7, borderRadius: "50%", background: "#f5c842", animation: "pulse 1s infinite", zIndex: 2 }} />
                    )}

                    {/* ── Top row: image + name + score ── */}
                    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                      {/* Image */}
                      <div style={{ flexShrink: 0 }}>
                        {imgUrl ? (
                          <a
                            href={srcUrl || "#"}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            style={{ display: "block", lineHeight: 0 }}
                          >
                            <img
                              src={imgUrl}
                              alt={o.name}
                              style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", display: "block" }}
                              onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                              onMouseEnter={e => setPreviewImg({ src: imgUrl, name: o.name, rect: e.currentTarget.getBoundingClientRect() })}
                              onMouseLeave={() => setPreviewImg(null)}
                            />
                          </a>
                        ) : (
                          <div style={{ width: 72, height: 72, borderRadius: 10, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>
                            {catEmoji}
                          </div>
                        )}
                      </div>

                      {/* Name + meta */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                          <div style={{ color: "#fff", fontSize: 14, fontWeight: 700, lineHeight: 1.3, flex: 1 }}>{o.name}</div>
                          {/* Score badge */}
                          <div style={{
                            flexShrink: 0, width: 36, height: 36, borderRadius: 10,
                            background: `${scoreColor}18`, border: `1.5px solid ${scoreColor}40`,
                            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                          }}>
                            <span style={{ color: scoreColor, fontSize: 13, fontWeight: 900, lineHeight: 1 }}>{o.score}</span>
                            <span style={{ color: scoreColor, fontSize: 8, fontWeight: 600, opacity: 0.7 }}>AI</span>
                          </div>
                        </div>
                        {/* Meta chips */}
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5, flexWrap: "wrap" }}>
                          <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>{o.flag} {o.category}</span>
                          {o.daysToSell && (
                            <span style={{ display: "flex", alignItems: "center", gap: 3, color: "rgba(255,255,255,0.3)", fontSize: 10 }}>
                              <Clock size={9} /> ~{o.daysToSell}d
                            </span>
                          )}
                          {o.dataQuality && (
                            <span style={{
                              fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 4,
                              background: o.dataQuality === "verified" ? "rgba(74,222,128,0.12)" : o.dataQuality === "matched" ? "rgba(96,165,250,0.12)" : "rgba(245,200,66,0.10)",
                              color: o.dataQuality === "verified" ? "#4ade80" : o.dataQuality === "matched" ? "#60a5fa" : "#f5c842",
                              border: `1px solid ${o.dataQuality === "verified" ? "rgba(74,222,128,0.25)" : o.dataQuality === "matched" ? "rgba(96,165,250,0.25)" : "rgba(245,200,66,0.2)"}`,
                            }}>
                              {o.dataQuality === "verified" ? "✓ weryfikowane" : o.dataQuality === "matched" ? "≈ dopasowane" : "~ szacowane"}
                            </span>
                          )}
                          {srcUrl && (
                            <a
                              href={srcUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              style={{ color: "rgba(139,92,246,0.5)", fontSize: 10, display: "flex", alignItems: "center", gap: 2, textDecoration: "none" }}
                            >
                              <ExternalLink size={9} /> źródło
                            </a>
                          )}
                        </div>
                        {/* Stock + seller rating */}
                        {(stockCount != null || (sellerRating != null && sellerRating > 0)) && (
                          <div style={{ display: "flex", gap: 6, marginTop: 5, flexWrap: "wrap" }}>
                            {stockCount != null && (
                              <span style={{
                                display: "flex", alignItems: "center", gap: 3,
                                background: stockCount <= 2 ? "rgba(248,113,113,0.12)" : stockCount <= 5 ? "rgba(245,200,66,0.12)" : "rgba(74,222,128,0.10)",
                                border: `1px solid ${stockCount <= 2 ? "rgba(248,113,113,0.3)" : stockCount <= 5 ? "rgba(245,200,66,0.3)" : "rgba(74,222,128,0.25)"}`,
                                borderRadius: 5, padding: "2px 7px",
                                color: stockCount <= 2 ? "#f87171" : stockCount <= 5 ? "#f5c842" : "#4ade80",
                                fontSize: 10, fontWeight: 700,
                              }}>
                                <Package size={9} />
                                {stockCount <= 2 ? `Ostatnie ${stockCount} szt.!` : stockCount <= 5 ? `${stockCount} szt.` : `${stockCount}+ szt.`}
                              </span>
                            )}
                            {sellerRating != null && sellerRating > 0 && (
                              <span style={{
                                fontSize: 10, fontWeight: 700,
                                color: sellerRating >= 99 ? "#4ade80" : sellerRating >= 95 ? "#f5c842" : "#f87171",
                              }}>
                                ⭐ {sellerRating.toFixed(1)}%
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* ── Price flow: BUY → SELL → PROFIT ── */}
                    <div style={{
                      display: "flex", alignItems: "center", gap: 0,
                      background: "rgba(0,0,0,0.2)", borderRadius: 12, overflow: "hidden",
                      border: "1px solid rgba(255,255,255,0.07)",
                    }}>
                      {/* BUY */}
                      <div style={{ flex: 1, padding: "10px 14px", borderRight: "1px solid rgba(255,255,255,0.07)" }}>
                        <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 9, fontWeight: 700, letterSpacing: 0.8, marginBottom: 3 }}>KUP ZA</div>
                        <div style={{ color: "#f87171", fontSize: 20, fontWeight: 900 }}>${o.buy}</div>
                        {o.buyHint && <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, marginTop: 2 }}>{o.buyHint}</div>}
                      </div>
                      {/* Arrow */}
                      <div style={{ padding: "0 10px", color: "rgba(255,255,255,0.2)" }}>
                        <ArrowRight size={16} />
                      </div>
                      {/* SELL */}
                      <div style={{ flex: 1, padding: "10px 14px", borderRight: "1px solid rgba(255,255,255,0.07)" }}>
                        <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 9, fontWeight: 700, letterSpacing: 0.8, marginBottom: 3 }}>SPRZEDAJ ZA</div>
                        <div style={{ color: "#60a5fa", fontSize: 20, fontWeight: 900 }}>${o.sell}</div>
                        {o.sellHint && <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, marginTop: 2 }}>{o.sellHint}</div>}
                      </div>
                      {/* Arrow */}
                      <div style={{ padding: "0 10px", color: "rgba(255,255,255,0.2)" }}>
                        <ArrowRight size={16} />
                      </div>
                      {/* NET PROFIT */}
                      <div style={{ flex: 1.2, padding: "10px 14px", background: "rgba(74,222,128,0.07)" }}>
                        <div style={{ color: "rgba(74,222,128,0.6)", fontSize: 9, fontWeight: 700, letterSpacing: 0.8, marginBottom: 3 }}>ZYSK NETTO</div>
                        <div style={{ color: "#4ade80", fontSize: 22, fontWeight: 900 }}>+${netP}</div>
                        <div style={{ color: "rgba(74,222,128,0.6)", fontSize: 10, fontWeight: 700 }}>
                          {o.priceGapPct && o.priceGapPct > 0 ? `+${o.priceGapPct}% gap` : `${o.margin}% marża`}
                        </div>
                      </div>
                    </div>

                    {/* ── Where to sell (data-driven comparison) ── */}
                    {o.sellMarketOptions && o.sellMarketOptions.length > 1 && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, fontWeight: 700 }}>GDZIE SPRZEDAĆ:</span>
                        {o.sellMarketOptions.slice(0, 3).map((opt, i) => (
                          <span
                            key={opt.market}
                            title={`Mediana ${opt.sell}$ · ${opt.sample} ofert porównanych`}
                            style={{
                              display: "inline-flex", alignItems: "center", gap: 4,
                              background: i === 0 ? "rgba(74,222,128,0.12)" : "rgba(255,255,255,0.05)",
                              border: `1px solid ${i === 0 ? "rgba(74,222,128,0.3)" : "rgba(255,255,255,0.1)"}`,
                              borderRadius: 7, padding: "2px 8px",
                              color: i === 0 ? "#4ade80" : "rgba(255,255,255,0.45)",
                              fontSize: 10, fontWeight: 700,
                            }}
                          >
                            {i === 0 && "🏆 "}{opt.market} <span style={{ opacity: 0.7 }}>+${opt.netProfit}</span>
                          </span>
                        ))}
                      </div>
                    )}

                    {/* ── Bottom row: risk + platforms + actions ── */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      {/* Risk badge */}
                      <div style={{
                        display: "flex", alignItems: "center", gap: 4,
                        background: `${riskColor}14`, border: `1px solid ${riskColor}35`,
                        borderRadius: 8, padding: "4px 10px",
                        color: riskColor, fontSize: 11, fontWeight: 700,
                      }}>
                        {o.risk === "low" ? <ShieldCheck size={11} /> : <ShieldAlert size={11} />}
                        {riskLabel}
                      </div>

                      {/* Platform badges */}
                      <div style={{ display: "flex", gap: 4, flex: 1, flexWrap: "wrap" }}>
                        {platforms.map(platform => {
                          const ps = platformStyle(platform);
                          const url = o.sellUrls?.[platform] || o.sellUrl || "";
                          const short = platform.replace("USA","US").replace("Amazon ","AMZ ").trim();
                          return (
                            <a
                              key={platform}
                              href={url || undefined}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              title={platform}
                              style={{
                                display: "inline-flex", alignItems: "center", gap: 3,
                                background: ps.bg, border: `1px solid ${ps.border}`,
                                borderRadius: 7, padding: "3px 9px",
                                color: ps.text, fontSize: 11, fontWeight: 700,
                                textDecoration: "none", cursor: url ? "pointer" : "default",
                              }}
                            >
                              {short}
                              {url && <ExternalLink size={8} />}
                            </a>
                          );
                        })}
                      </div>

                      {/* Action buttons */}
                      <div style={{ display: "flex", gap: 5, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                        <button
                          title={isSaved ? "Zapisano w pipeline" : "Zapisz do pipeline"}
                          onClick={() => {
                            if (!isSaved) {
                              addToPipeline({ ...o, category: o.category ?? "General", market: o.market ?? "" });
                              setSavedIds(prev => new Set([...prev, `${o.id}:${o.name}`]));
                              setToast(o.name);
                              setTimeout(() => setToast(null), 2500);
                            }
                          }}
                          style={{
                            display: "flex", alignItems: "center", gap: 4,
                            background: isSaved ? "rgba(74,222,128,0.15)" : "rgba(255,255,255,0.06)",
                            border: `1px solid ${isSaved ? "rgba(74,222,128,0.4)" : "rgba(255,255,255,0.12)"}`,
                            borderRadius: 8, padding: "6px 11px", cursor: isSaved ? "default" : "pointer",
                            color: isSaved ? "#4ade80" : "rgba(255,255,255,0.5)",
                            fontSize: 11, fontWeight: 700,
                          }}
                        >
                          {isSaved ? <Check size={12} /> : <BookmarkPlus size={12} />}
                          {isSaved ? "Zapisane" : "Zapisz"}
                        </button>
                        <button
                          title="Utwórz ogłoszenie"
                          onClick={() => setOfferOpp(o)}
                          style={{
                            display: "flex", alignItems: "center", gap: 4,
                            background: "rgba(96,165,250,0.12)", border: "1px solid rgba(96,165,250,0.28)",
                            borderRadius: 8, padding: "6px 11px", cursor: "pointer",
                            color: "#60a5fa", fontSize: 11, fontWeight: 700,
                          }}
                        >
                          <PlusCircle size={12} /> Wystaw
                        </button>
                        <button
                          title="Dropship Manager"
                          onClick={() => {
                            sessionStorage.setItem("dropship_import", JSON.stringify(o));
                            setLocation("/resell/dropship");
                          }}
                          style={{
                            display: "flex", alignItems: "center",
                            background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.25)",
                            borderRadius: 8, padding: "6px 8px", cursor: "pointer", color: "#a78bfa",
                          }}
                        >
                          <Boxes size={12} />
                        </button>
                      </div>
                    </div>

                    {/* ── Tip (if available) ── */}
                    {o.tip && (
                      <div style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.15)", borderRadius: 8, padding: "7px 11px", color: "#c4b5fd", fontSize: 11, lineHeight: 1.4 }}>
                        💡 {o.tip}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ── CTA bottom ── */}
        <div style={{ marginTop: 24, textAlign: "center" }}>
          <button
            onClick={() => setLocation("/resell/search")}
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "12px 28px", borderRadius: 10, border: "none", cursor: "pointer",
              background: "linear-gradient(135deg,#8b5cf6,#7c3aed)",
              color: "#fff", fontWeight: 700, fontSize: 13,
              boxShadow: "0 4px 18px rgba(139,92,246,0.35)",
            }}
          >
            <Search size={15} /> AI Search — znajdź nowe okazje
          </button>
        </div>
      </div>

      {/* ── Hover image preview ── */}
      {previewImg && (
        <div
          style={{
            position: "fixed",
            left: Math.min(previewImg.rect.right + 14, window.innerWidth - 250),
            top: Math.max(8, Math.min(previewImg.rect.top - 40, window.innerHeight - 280)),
            zIndex: 9999,
            background: "#0d0d1f",
            border: "1px solid rgba(139,92,246,0.45)",
            borderRadius: 14,
            padding: 12,
            boxShadow: "0 16px 48px rgba(0,0,0,0.85)",
            pointerEvents: "none",
            width: 230,
          }}
        >
          <img
            src={previewImg.src}
            alt={previewImg.name}
            style={{ width: 206, height: 180, objectFit: "contain", display: "block", borderRadius: 8, background: "rgba(255,255,255,0.04)" }}
          />
          <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 11, marginTop: 8, lineHeight: 1.4 }}>{previewImg.name}</div>
        </div>
      )}

      {offerOpp && (
        <QuickCreateOfferModal
          opportunity={offerOpp}
          onClose={() => setOfferOpp(null)}
          onCreated={() => {}}
        />
      )}

      {toast && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 9999,
          background: "rgba(74,222,128,0.95)", borderRadius: 12, padding: "10px 18px",
          color: "#0d1a0d", fontWeight: 700, fontSize: 13,
          boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
          display: "flex", alignItems: "center", gap: 8,
          animation: "slideIn 0.2s ease",
        }}>
          ✓ Zapisano: {toast.slice(0, 40)}{toast.length > 40 ? "…" : ""}
        </div>
      )}

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
        @keyframes slideIn { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        select option { background: #1a1a2e; color: #fff; }
      `}</style>
    </ResellLayout>
  );
}
