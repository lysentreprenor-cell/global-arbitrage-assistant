import React, { useState } from "react";
import { useLocation } from "wouter";
import { Search, Zap, ArrowRight, X, TrendingUp, Globe, Star } from "lucide-react";
import { ResellLayout } from "@/components/resell/ResellLayout";

const SUGGESTIONS = [
  "vintage cameras Poland", "amber jewelry Baltic", "Polish folk art",
  "sneakers limited edition", "retro electronics", "Soviet collectibles",
  "handmade ceramics", "vintage denim European",
];

const MOCK_RESULTS: Record<string, Array<{
  name: string; buyMarket: string; sellMarket: string;
  buyPrice: number; sellPrice: number; profit: number; margin: number;
  score: number; flag: string; demand: string;
}>> = {
  default: [
    { name: "Levi's 501 W32 — Polish vintage", buyMarket: "OLX Poland", sellMarket: "eBay USA", buyPrice: 28, sellPrice: 78, profit: 50, margin: 64, score: 92, flag: "🇵🇱→🇺🇸", demand: "High" },
    { name: "Levi's 505 W34 — Used", buyMarket: "Vinted PL", sellMarket: "eBay USA", buyPrice: 18, sellPrice: 55, profit: 37, margin: 67, score: 86, flag: "🇵🇱→🇺🇸", demand: "High" },
    { name: "Lee Cooper W32 — Slim", buyMarket: "Allegro PL", sellMarket: "Etsy USA", buyPrice: 22, sellPrice: 48, profit: 26, margin: 54, score: 71, flag: "🇵🇱→🇺🇸", demand: "Medium" },
    { name: "Wrangler W33 — Regular", buyMarket: "OLX Poland", sellMarket: "eBay DE", buyPrice: 15, sellPrice: 32, profit: 17, margin: 53, score: 58, flag: "🇵🇱→🇩🇪", demand: "Low" },
  ],
};

const COMPARE_MARKETS = [
  { market: "eBay USA", avgPrice: 78, fees: "12.9%", shipping: "$15", demand: "★★★★★" },
  { market: "Etsy USA", avgPrice: 65, fees: "6.5%", shipping: "$15", demand: "★★★★☆" },
  { market: "Amazon USA", avgPrice: 71, fees: "15%", shipping: "$0 FBA", demand: "★★★☆☆" },
  { market: "eBay DE", avgPrice: 52, fees: "12.9%", shipping: "$10", demand: "★★★☆☆" },
  { market: "Vinted EU", avgPrice: 40, fees: "0%", shipping: "$8", demand: "★★☆☆☆" },
];

export default function SearchPage() {
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<typeof MOCK_RESULTS["default"] | null>(null);
  const [stage, setStage] = useState(0);

  const STAGES = [
    "Scanning eBay, Etsy, Amazon...",
    "Comparing prices across markets...",
    "Calculating profit after duties & fees...",
    "AI scoring opportunities...",
  ];

  const handleSearch = (q = query) => {
    if (!q.trim()) return;
    setQuery(q);
    setResults(null);
    setLoading(true);
    setStage(0);
    const advance = (n: number) => {
      if (n < STAGES.length) {
        setTimeout(() => { setStage(n); advance(n + 1); }, 600);
      } else {
        setTimeout(() => { setLoading(false); setResults(MOCK_RESULTS["default"]); }, 400);
      }
    };
    advance(1);
  };

  return (
    <ResellLayout>
      <div style={{ padding: "36px 28px 60px", maxWidth: 900 }}>
        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, #8b5cf6, #7c3aed)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Zap size={18} color="#fff" />
            </div>
            <h1 style={{ color: "#fff", fontSize: 22, fontWeight: 900, margin: 0 }}>AI Opportunity Search</h1>
          </div>
          <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, margin: 0 }}>
            Enter a product or category — AI scans 4 markets and ranks arbitrage opportunities by profit potential.
          </p>
        </div>

        {/* Search box */}
        <div style={{ position: "relative", marginBottom: 16 }}>
          <Search size={18} style={{ position: "absolute", left: 18, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.35)", pointerEvents: "none" }} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSearch()}
            placeholder="e.g. vintage jeans, amber jewelry, Soviet cameras..."
            style={{
              width: "100%", background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(139,92,246,0.35)", borderRadius: 14,
              padding: "16px 140px 16px 50px", color: "#fff", fontSize: 15,
              outline: "none", boxSizing: "border-box", fontFamily: "inherit",
            }}
          />
          {query && (
            <button onClick={() => { setQuery(""); setResults(null); }} style={{ position: "absolute", right: 120, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.3)", padding: 4 }}>
              <X size={15} />
            </button>
          )}
          <button
            onClick={() => handleSearch()}
            disabled={!query.trim() || loading}
            style={{
              position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
              padding: "9px 20px", borderRadius: 10, border: "none", cursor: query.trim() && !loading ? "pointer" : "not-allowed",
              background: query.trim() && !loading ? "linear-gradient(135deg, #8b5cf6, #7c3aed)" : "rgba(255,255,255,0.08)",
              color: query.trim() && !loading ? "#fff" : "rgba(255,255,255,0.3)",
              fontWeight: 700, fontSize: 13,
            }}
          >
            {loading ? "Scanning..." : "Search"}
          </button>
        </div>

        {/* Suggestions */}
        {!results && !loading && (
          <div style={{ marginBottom: 32 }}>
            <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, fontWeight: 700, letterSpacing: 0.6, marginBottom: 10 }}>POPULAR SEARCHES</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {SUGGESTIONS.map(s => (
                <button key={s} onClick={() => handleSearch(s)} style={{ padding: "6px 14px", borderRadius: 99, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.5)", fontSize: 12, cursor: "pointer", transition: "all 0.15s" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(139,92,246,0.4)"; (e.currentTarget as HTMLElement).style.color = "#a78bfa"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.1)"; (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.5)"; }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div style={{ background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.2)", borderRadius: 16, padding: "28px 24px", marginBottom: 24 }}>
            <div style={{ color: "#a78bfa", fontWeight: 700, fontSize: 14, marginBottom: 20 }}>
              🤖 AI analyzing: <span style={{ color: "#fff" }}>"{query}"</span>
            </div>
            {STAGES.map((s, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, opacity: i < stage ? 1 : 0.25, transition: "opacity 0.4s" }}>
                <div style={{ width: 18, height: 18, borderRadius: "50%", background: i < stage ? "rgba(74,222,128,0.2)" : "rgba(255,255,255,0.06)", border: `1px solid ${i < stage ? "rgba(74,222,128,0.4)" : "rgba(255,255,255,0.1)"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {i < stage && <span style={{ color: "#4ade80", fontSize: 10 }}>✓</span>}
                </div>
                <span style={{ color: i < stage ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.25)", fontSize: 13 }}>{s}</span>
              </div>
            ))}
          </div>
        )}

        {/* Results */}
        {results && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>
                <span style={{ color: "#4ade80", fontWeight: 700 }}>{results.length} opportunities</span> found for "{query}"
              </div>
            </div>

            {/* Results list */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 28 }}>
              {results.map((r, i) => {
                const scoreColor = r.score >= 85 ? "#4ade80" : r.score >= 65 ? "#f5c842" : "#f87171";
                return (
                  <div
                    key={i}
                    onClick={() => setLocation(`/resell/product/${i + 1}`)}
                    style={{
                      background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
                      borderRadius: 14, padding: "16px 18px", cursor: "pointer", transition: "all 0.15s",
                      display: "flex", alignItems: "center", gap: 16,
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(139,92,246,0.2)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.07)"; }}
                  >
                    <div style={{ width: 48, height: 48, borderRadius: 12, background: `${scoreColor}12`, border: `1px solid ${scoreColor}25`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <div style={{ color: scoreColor, fontSize: 14, fontWeight: 900 }}>{r.score}</div>
                      <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 9 }}>AI</div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: "#fff", fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{r.name}</div>
                      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                        <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>Buy: <span style={{ color: "rgba(255,255,255,0.7)" }}>${r.buyPrice} · {r.buyMarket}</span></span>
                        <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>Sell: <span style={{ color: "rgba(255,255,255,0.7)" }}>${r.sellPrice} · {r.sellMarket}</span></span>
                        <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>Demand: <span style={{ color: r.demand === "High" ? "#4ade80" : r.demand === "Medium" ? "#f5c842" : "#f87171" }}>{r.demand}</span></span>
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ color: "#4ade80", fontWeight: 900, fontSize: 18 }}>+${r.profit}</div>
                      <div style={{ background: `${scoreColor}15`, borderRadius: 99, padding: "1px 8px", color: scoreColor, fontSize: 11, fontWeight: 700 }}>{r.margin}% margin</div>
                    </div>
                    <ArrowRight size={16} color="rgba(255,255,255,0.2)" />
                  </div>
                );
              })}
            </div>

            {/* Market comparison table */}
            <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, overflow: "hidden" }}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, fontWeight: 700, letterSpacing: 1 }}>MARKET COMPARISON FOR "{query.toUpperCase()}"</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px 100px 120px", padding: "10px 20px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                {["MARKET", "AVG PRICE", "FEES", "SHIPPING", "DEMAND"].map(h => (
                  <div key={h} style={{ color: "rgba(255,255,255,0.25)", fontSize: 10, fontWeight: 700, letterSpacing: 0.5 }}>{h}</div>
                ))}
              </div>
              {COMPARE_MARKETS.map((m, i) => (
                <div key={m.market} style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px 100px 120px", padding: "12px 20px", borderBottom: i < COMPARE_MARKETS.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none", alignItems: "center" }}>
                  <div style={{ color: "#fff", fontWeight: 600, fontSize: 13 }}>{m.market}</div>
                  <div style={{ color: "#4ade80", fontWeight: 700, fontSize: 13 }}>${m.avgPrice}</div>
                  <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>{m.fees}</div>
                  <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>{m.shipping}</div>
                  <div style={{ color: "#f5c842", fontSize: 12 }}>{m.demand}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </ResellLayout>
  );
}
