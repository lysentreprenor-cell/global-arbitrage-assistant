import React, { useState } from "react";
import { useLocation } from "wouter";
import { Search, Zap, ArrowRight, X, TrendingUp, AlertCircle } from "lucide-react";
import { ResellLayout } from "@/components/resell/ResellLayout";
import { getAnthropicKey, getEbayKeys, getEtsyKey } from "@/lib/apiKeys";

type SearchResult = {
  id: number; name: string;
  buyMarket: string; sellMarket: string;
  buy: number; sell: number;
  profit: number; netProfit?: number; margin: number;
  score: number; flag: string;
  risk?: "low" | "medium" | "high";
  demandLevel?: "high" | "medium" | "low";
  buyHint?: string; sellHint?: string; tip?: string;
  sourceUrl?: string;
};

const SUGGESTIONS = [
  "vintage cameras Poland", "amber jewelry Baltic", "Polish folk art",
  "sneakers limited edition", "Soviet collectibles",
  "vintage denim European", "mechanical watches", "Meissen porcelain",
];

const STAGES = [
  "Scanning eBay marketplace...",
  "Scanning Etsy listings...",
  "Calculating profit after fees & shipping...",
  "AI scoring arbitrage opportunities...",
];

export default function SearchPage() {
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (q = query) => {
    if (!q.trim() || loading) return;
    setQuery(q);
    setResults(null);
    setError(null);
    setLoading(true);
    setStage(0);

    // Animate stages while waiting for API
    const stageTimer = setInterval(() => {
      setStage(s => s < STAGES.length - 1 ? s + 1 : s);
    }, 700);

    try {
      const ebay = getEbayKeys();
      const res = await fetch("/api/resell/product-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: q,
          anthropicKey: getAnthropicKey(),
          ebayAppId: ebay.appId,
          ebayCertId: ebay.certId,
          etsyApiKey: getEtsyKey(),
        }),
      });
      const data = await res.json();
      if (data.results?.length > 0) {
        setResults(data.results);
        setSource(data.source ?? null);
      } else if (data.message) {
        setError(data.message);
      } else {
        setError("No opportunities found. Try a different search term.");
      }
    } catch {
      setError("Connection error — check your internet connection.");
    } finally {
      clearInterval(stageTimer);
      setStage(STAGES.length);
      setLoading(false);
    }
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
            Enter a product or category — AI scans markets and ranks arbitrage opportunities by net profit.
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
            <button onClick={() => { setQuery(""); setResults(null); setError(null); }}
              style={{ position: "absolute", right: 120, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.3)", padding: 4 }}>
              <X size={15} />
            </button>
          )}
          <button
            onClick={() => handleSearch()}
            disabled={!query.trim() || loading}
            style={{
              position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
              padding: "9px 20px", borderRadius: 10, border: "none",
              cursor: query.trim() && !loading ? "pointer" : "not-allowed",
              background: query.trim() && !loading ? "linear-gradient(135deg, #8b5cf6, #7c3aed)" : "rgba(255,255,255,0.08)",
              color: query.trim() && !loading ? "#fff" : "rgba(255,255,255,0.3)",
              fontWeight: 700, fontSize: 13,
            }}
          >
            {loading ? "Scanning..." : "Search"}
          </button>
        </div>

        {/* Suggestions */}
        {!results && !loading && !error && (
          <div style={{ marginBottom: 32 }}>
            <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, fontWeight: 700, letterSpacing: 0.6, marginBottom: 10 }}>POPULAR SEARCHES</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {SUGGESTIONS.map(s => (
                <button key={s} onClick={() => handleSearch(s)}
                  style={{ padding: "6px 14px", borderRadius: 99, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.5)", fontSize: 12, cursor: "pointer" }}
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
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, opacity: i <= stage ? 1 : 0.25, transition: "opacity 0.4s" }}>
                <div style={{ width: 18, height: 18, borderRadius: "50%", background: i < stage ? "rgba(74,222,128,0.2)" : "rgba(255,255,255,0.06)", border: `1px solid ${i < stage ? "rgba(74,222,128,0.4)" : "rgba(255,255,255,0.1)"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {i < stage && <span style={{ color: "#4ade80", fontSize: 10 }}>✓</span>}
                </div>
                <span style={{ color: i < stage ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.35)", fontSize: 13 }}>{s}</span>
              </div>
            ))}
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div style={{ background: "rgba(245,200,66,0.08)", border: "1px solid rgba(245,200,66,0.25)", borderRadius: 12, padding: "16px 18px", display: "flex", alignItems: "flex-start", gap: 10 }}>
            <AlertCircle size={16} color="#f5c842" style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <div style={{ color: "#fde68a", fontWeight: 700, fontSize: 13 }}>{error}</div>
              {error.includes("API key") && (
                <button onClick={() => setLocation("/resell/settings")}
                  style={{ marginTop: 8, padding: "6px 14px", borderRadius: 8, background: "rgba(139,92,246,0.2)", border: "1px solid rgba(139,92,246,0.3)", color: "#a78bfa", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  Go to Settings →
                </button>
              )}
            </div>
          </div>
        )}

        {/* Results */}
        {results && !loading && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>
                <span style={{ color: "#4ade80", fontWeight: 700 }}>{results.length} opportunities</span> found for "{query}"
                {source === "live" && <span style={{ color: "#4ade80", marginLeft: 8 }}>· 🟢 Live data</span>}
                {source === "ai" && <span style={{ color: "#a78bfa", marginLeft: 8 }}>· 🤖 AI analysis</span>}
              </div>
              <button onClick={() => handleSearch()}
                style={{ padding: "6px 14px", borderRadius: 8, background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.25)", color: "#a78bfa", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                Rescan
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {results.map((r) => {
                const scoreColor = r.score >= 85 ? "#4ade80" : r.score >= 65 ? "#f5c842" : "#f87171";
                const riskColor = r.risk === "low" ? "#4ade80" : r.risk === "medium" ? "#f5c842" : "#f87171";
                const demandColor = r.demandLevel === "high" ? "#4ade80" : r.demandLevel === "medium" ? "#60a5fa" : "rgba(255,255,255,0.3)";
                const netP = r.netProfit ?? r.profit;
                return (
                  <div
                    key={r.id}
                    onClick={() => {
                      sessionStorage.setItem("resell_opportunity", JSON.stringify({
                        ...r, buy: r.buy, sell: r.sell, profit: r.profit,
                        market: r.sellMarket, category: r.flag?.includes("Jewelry") ? "Jewelry" : "General",
                      }));
                      setLocation(`/resell/product/${r.id}`);
                    }}
                    style={{
                      background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
                      borderRadius: 14, padding: "16px 18px", cursor: "pointer", transition: "all 0.15s",
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(139,92,246,0.2)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.07)"; }}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                      {/* Score badge */}
                      <div style={{ width: 50, height: 50, borderRadius: 12, background: `${scoreColor}12`, border: `1px solid ${scoreColor}25`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <div style={{ color: scoreColor, fontSize: 15, fontWeight: 900 }}>{r.score}</div>
                        <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 9 }}>score</div>
                      </div>

                      {/* Main info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                          <span style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{r.name}</span>
                          {r.risk && (
                            <span style={{ background: `${riskColor}18`, border: `1px solid ${riskColor}30`, borderRadius: 99, padding: "1px 7px", color: riskColor, fontSize: 10, fontWeight: 800 }}>
                              {r.risk.toUpperCase()}
                            </span>
                          )}
                          {r.demandLevel && (
                            <span style={{ color: demandColor, fontSize: 11, fontWeight: 700 }}>
                              {r.demandLevel === "high" ? "▲" : r.demandLevel === "medium" ? "◆" : "▼"} {r.demandLevel.toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: r.buyHint ? 6 : 0 }}>
                          <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>Buy: <span style={{ color: "rgba(255,255,255,0.7)" }}>${r.buy} · {r.buyMarket}</span></span>
                          <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>Sell: <span style={{ color: "rgba(255,255,255,0.7)" }}>${r.sell} · {r.sellMarket}</span></span>
                          <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>{r.flag}</span>
                        </div>
                        {r.buyHint && (
                          <div style={{ color: "rgba(139,92,246,0.6)", fontSize: 11, fontStyle: "italic" }}>💡 {r.buyHint}</div>
                        )}
                        {r.tip && (
                          <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, marginTop: 2 }}>{r.tip}</div>
                        )}
                      </div>

                      {/* Profit + arrow */}
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ color: "#4ade80", fontWeight: 900, fontSize: 20 }}>+${netP}</div>
                        <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10 }}>net profit</div>
                        <div style={{ background: `${scoreColor}15`, borderRadius: 99, padding: "1px 8px", color: scoreColor, fontSize: 11, fontWeight: 700, marginTop: 3 }}>{r.margin}%</div>
                      </div>
                      <ArrowRight size={16} color="rgba(255,255,255,0.2)" style={{ flexShrink: 0, marginTop: 4 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <style>{`
        input::placeholder { color: rgba(255,255,255,0.2); }
        input:focus { border-color: rgba(139,92,246,0.6) !important; }
      `}</style>
    </ResellLayout>
  );
}
