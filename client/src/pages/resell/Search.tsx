import React, { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  Search, Zap, ArrowRight, X, AlertCircle, Bookmark,
  BookmarkCheck, SlidersHorizontal, TrendingUp, DollarSign,
  ExternalLink, Boxes, FileText, ChevronDown, ChevronUp,
} from "lucide-react";
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
  sourceUrl?: string; sellUrl?: string;
  category?: string;
};

const SUGGESTIONS = [
  "vintage cameras Poland", "amber jewelry Baltic",
  "Levi's 501 vintage", "Soviet cameras Zorki Zenit",
  "mechanical watches Omega Seiko", "Meissen porcelain",
  "Adidas Samba EU exclusive", "Polish folk art handmade",
  "vintage denim European", "sneakers limited edition",
  "hunting military surplus", "vintage electronics retro",
];

const CATEGORIES = ["All", "Clothing", "Jewelry", "Electronics", "Collectibles", "Sneakers", "Spirits", "Antiques", "Watches"];
const RISK_OPTS = ["All risks", "Low only", "Low + Medium"];
const SORT_OPTS = [
  { label: "Net Profit ↓", key: "netProfit" },
  { label: "Score ↓", key: "score" },
  { label: "Margin ↓", key: "margin" },
  { label: "Risk asc", key: "risk" },
];

const STAGES = [
  "Scanning eBay cheap listings...",
  "Scanning Etsy high-demand listings...",
  "Calculating net profit after fees & shipping...",
  "AI ranking arbitrage opportunities...",
];

const RISK_ORDER = { low: 0, medium: 1, high: 2 };

function savedKey() { return "resell_saved_opportunities"; }
function loadSaved(): number[] {
  try { return JSON.parse(sessionStorage.getItem(savedKey()) || "[]"); } catch { return []; }
}
function toggleSave(id: number): number[] {
  const cur = loadSaved();
  const next = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id];
  sessionStorage.setItem(savedKey(), JSON.stringify(next));
  return next;
}

export default function SearchPage() {
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [showFilters, setShowFilters] = useState(false);
  const [maxBudget, setMaxBudget] = useState("");
  const [catFilter, setCatFilter] = useState("All");
  const [riskFilter, setRiskFilter] = useState("All risks");
  const [sortKey, setSortKey] = useState("netProfit");
  const [savedIds, setSavedIds] = useState<number[]>(loadSaved);

  const handleSearch = async (q = query) => {
    if (!q.trim() || loading) return;
    setQuery(q);
    setResults(null);
    setError(null);
    setLoading(true);
    setStage(0);

    const stageTimer = setInterval(() => {
      setStage(s => s < STAGES.length - 1 ? s + 1 : s);
    }, 600);

    try {
      const ebay = getEbayKeys();
      const res = await fetch("/api/resell/product-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: q,
          maxBudget: maxBudget ? parseFloat(maxBudget) : undefined,
          category: catFilter !== "All" ? catFilter : undefined,
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
        setError("No opportunities found. Try a different search term or category.");
      }
    } catch {
      setError("Connection error — check your internet connection.");
    } finally {
      clearInterval(stageTimer);
      setStage(STAGES.length);
      setLoading(false);
    }
  };

  const filtered = (() => {
    if (!results) return [];
    let r = [...results];
    if (catFilter !== "All") r = r.filter(x => x.category === catFilter);
    if (maxBudget) r = r.filter(x => x.buy <= parseFloat(maxBudget));
    if (riskFilter === "Low only") r = r.filter(x => x.risk === "low");
    if (riskFilter === "Low + Medium") r = r.filter(x => x.risk !== "high");
    r.sort((a, b) => {
      if (sortKey === "netProfit") return (b.netProfit ?? b.profit) - (a.netProfit ?? a.profit);
      if (sortKey === "score") return b.score - a.score;
      if (sortKey === "margin") return b.margin - a.margin;
      if (sortKey === "risk") return (RISK_ORDER[a.risk ?? "high"] ?? 2) - (RISK_ORDER[b.risk ?? "high"] ?? 2);
      return 0;
    });
    return r;
  })();

  const bestDeal = filtered.length > 0 ? filtered.reduce((a, b) => (a.netProfit ?? a.profit) > (b.netProfit ?? b.profit) ? a : b) : null;

  return (
    <ResellLayout>
      <div style={{ padding: "32px 28px 60px", maxWidth: 920 }}>

        {/* ── Header ── */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, #8b5cf6, #7c3aed)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Zap size={18} color="#fff" />
            </div>
            <h1 style={{ color: "#fff", fontSize: 22, fontWeight: 900, margin: 0 }}>AI Opportunity Search</h1>
          </div>
          <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, margin: 0 }}>
            Enter a product, category, or keyword — AI finds where to buy cheap and where to sell for profit.
          </p>
        </div>

        {/* ── Search box ── */}
        <div style={{ position: "relative", marginBottom: 10 }}>
          <Search size={18} style={{ position: "absolute", left: 18, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.35)", pointerEvents: "none" }} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSearch()}
            placeholder="e.g. vintage jeans, amber jewelry, Soviet cameras, Omega watch..."
            style={{
              width: "100%", background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(139,92,246,0.35)", borderRadius: 14,
              padding: "16px 180px 16px 50px", color: "#fff", fontSize: 15,
              outline: "none", boxSizing: "border-box", fontFamily: "inherit",
            }}
          />
          {query && (
            <button onClick={() => { setQuery(""); setResults(null); setError(null); }}
              style={{ position: "absolute", right: 156, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.3)", padding: 4 }}>
              <X size={15} />
            </button>
          )}
          <button
            onClick={() => setShowFilters(f => !f)}
            style={{
              position: "absolute", right: 110, top: "50%", transform: "translateY(-50%)",
              padding: "8px 10px", borderRadius: 9, border: "1px solid rgba(255,255,255,0.1)",
              background: showFilters ? "rgba(139,92,246,0.2)" : "rgba(255,255,255,0.05)",
              color: showFilters ? "#a78bfa" : "rgba(255,255,255,0.4)", cursor: "pointer",
              display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600,
            }}
          >
            <SlidersHorizontal size={13} /> Filters
          </button>
          <button
            onClick={() => handleSearch()}
            disabled={!query.trim() || loading}
            style={{
              position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
              padding: "9px 22px", borderRadius: 10, border: "none",
              cursor: query.trim() && !loading ? "pointer" : "not-allowed",
              background: query.trim() && !loading ? "linear-gradient(135deg, #8b5cf6, #7c3aed)" : "rgba(255,255,255,0.08)",
              color: query.trim() && !loading ? "#fff" : "rgba(255,255,255,0.3)",
              fontWeight: 700, fontSize: 13,
            }}
          >
            {loading ? "Scanning..." : "Search"}
          </button>
        </div>

        {/* ── Filters panel ── */}
        {showFilters && (
          <div style={{ background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.18)", borderRadius: 12, padding: "14px 18px", marginBottom: 14, display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-end" }}>
            <div>
              <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, fontWeight: 700, letterSpacing: 0.6, marginBottom: 6 }}>MAX BUY BUDGET ($)</div>
              <input
                value={maxBudget}
                onChange={e => setMaxBudget(e.target.value)}
                placeholder="no limit"
                type="number"
                style={{ width: 100, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "7px 10px", color: "#fff", fontSize: 13, outline: "none", fontFamily: "inherit" }}
              />
            </div>
            <div>
              <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, fontWeight: 700, letterSpacing: 0.6, marginBottom: 6 }}>CATEGORY</div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {CATEGORIES.map(c => (
                  <button key={c} onClick={() => setCatFilter(c)}
                    style={{ padding: "5px 11px", borderRadius: 99, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600,
                      background: catFilter === c ? "rgba(139,92,246,0.3)" : "rgba(255,255,255,0.06)",
                      color: catFilter === c ? "#c4b5fd" : "rgba(255,255,255,0.4)" }}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, fontWeight: 700, letterSpacing: 0.6, marginBottom: 6 }}>RISK</div>
              <div style={{ display: "flex", gap: 5 }}>
                {RISK_OPTS.map(r => (
                  <button key={r} onClick={() => setRiskFilter(r)}
                    style={{ padding: "5px 11px", borderRadius: 99, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600,
                      background: riskFilter === r ? "rgba(74,222,128,0.2)" : "rgba(255,255,255,0.06)",
                      color: riskFilter === r ? "#4ade80" : "rgba(255,255,255,0.4)" }}>
                    {r}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, fontWeight: 700, letterSpacing: 0.6, marginBottom: 6 }}>SORT BY</div>
              <div style={{ display: "flex", gap: 5 }}>
                {SORT_OPTS.map(s => (
                  <button key={s.key} onClick={() => setSortKey(s.key)}
                    style={{ padding: "5px 11px", borderRadius: 99, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600,
                      background: sortKey === s.key ? "rgba(245,200,66,0.2)" : "rgba(255,255,255,0.06)",
                      color: sortKey === s.key ? "#f5c842" : "rgba(255,255,255,0.4)" }}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Suggestions ── */}
        {!results && !loading && !error && (
          <div style={{ marginBottom: 32, marginTop: 10 }}>
            <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 10, fontWeight: 700, letterSpacing: 0.6, marginBottom: 10 }}>POPULAR SEARCHES</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
              {SUGGESTIONS.map(s => (
                <button key={s} onClick={() => handleSearch(s)}
                  style={{ padding: "6px 14px", borderRadius: 99, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.5)", fontSize: 12, cursor: "pointer", transition: "all 0.12s" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(139,92,246,0.4)"; (e.currentTarget as HTMLElement).style.color = "#a78bfa"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.1)"; (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.5)"; }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Loading ── */}
        {loading && (
          <div style={{ background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.2)", borderRadius: 16, padding: "28px 24px", marginTop: 12 }}>
            <div style={{ color: "#a78bfa", fontWeight: 700, fontSize: 14, marginBottom: 20 }}>
              Analyzing: <span style={{ color: "#fff" }}>"{query}"</span>
            </div>
            {STAGES.map((s, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, opacity: i <= stage ? 1 : 0.25, transition: "opacity 0.4s" }}>
                <div style={{ width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
                  background: i < stage ? "rgba(74,222,128,0.2)" : i === stage ? "rgba(139,92,246,0.2)" : "rgba(255,255,255,0.05)",
                  border: `1px solid ${i < stage ? "rgba(74,222,128,0.4)" : i === stage ? "rgba(139,92,246,0.4)" : "rgba(255,255,255,0.1)"}`,
                  display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {i < stage && <span style={{ color: "#4ade80", fontSize: 10 }}>✓</span>}
                  {i === stage && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#8b5cf6", animation: "pulse 1s infinite" }} />}
                </div>
                <span style={{ color: i < stage ? "rgba(255,255,255,0.7)" : i === stage ? "#c4b5fd" : "rgba(255,255,255,0.3)", fontSize: 13 }}>{s}</span>
              </div>
            ))}
          </div>
        )}

        {/* ── Error ── */}
        {error && !loading && (
          <div style={{ background: "rgba(245,200,66,0.08)", border: "1px solid rgba(245,200,66,0.25)", borderRadius: 12, padding: "16px 18px", display: "flex", alignItems: "flex-start", gap: 10, marginTop: 12 }}>
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

        {/* ── Results ── */}
        {results && !loading && (
          <div style={{ marginTop: 12 }}>
            {/* Stats bar */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
              <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>
                  <span style={{ color: "#4ade80", fontWeight: 700 }}>{filtered.length}</span> opportunities
                  {filtered.length !== results.length && <span style={{ color: "rgba(255,255,255,0.3)" }}> (filtered from {results.length})</span>}
                </div>
                {source === "live" && <span style={{ color: "#4ade80", fontSize: 11 }}>🟢 Live market data</span>}
                {source === "ai" && <span style={{ color: "#a78bfa", fontSize: 11 }}>🤖 AI analysis</span>}
                {bestDeal && (
                  <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>
                    Best: <span style={{ color: "#4ade80", fontWeight: 700 }}>+${bestDeal.netProfit ?? bestDeal.profit}</span> net on {bestDeal.name.split(" ").slice(0, 3).join(" ")}
                  </div>
                )}
              </div>
              <button onClick={() => handleSearch()}
                style={{ padding: "6px 14px", borderRadius: 8, background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.25)", color: "#a78bfa", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                Rescan
              </button>
            </div>

            {filtered.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
                No results match current filters. Try relaxing the filters.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {filtered.map((r) => {
                  const scoreColor = r.score >= 85 ? "#4ade80" : r.score >= 65 ? "#f5c842" : "#f87171";
                  const riskColor = r.risk === "low" ? "#4ade80" : r.risk === "medium" ? "#f5c842" : "#f87171";
                  const riskBg = r.risk === "low" ? "rgba(74,222,128,0.1)" : r.risk === "medium" ? "rgba(245,200,66,0.1)" : "rgba(248,113,113,0.1)";
                  const demandColor = r.demandLevel === "high" ? "#4ade80" : r.demandLevel === "medium" ? "#60a5fa" : "rgba(255,255,255,0.3)";
                  const netP = r.netProfit ?? r.profit;
                  const isSaved = savedIds.includes(r.id);

                  return (
                    <div key={r.id}
                      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, overflow: "hidden", transition: "all 0.15s" }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(139,92,246,0.2)"; (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.07)"; (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)"; }}
                    >
                      {/* Top row — main info + profit */}
                      <div
                        style={{ padding: "16px 18px", cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 14 }}
                        onClick={() => {
                          const opp = { ...r, market: r.sellMarket, profit: r.profit, category: r.category ?? "General" };
                          sessionStorage.setItem("resell_opportunity", JSON.stringify(opp));
                          sessionStorage.setItem("compare_product", JSON.stringify({ name: r.name, buyPrice: r.buy, category: r.category ?? "General" }));
                          setLocation(`/resell/product/${r.id}`);
                        }}
                      >
                        {/* Score */}
                        <div style={{ width: 48, height: 48, borderRadius: 12, background: `${scoreColor}12`, border: `1px solid ${scoreColor}25`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <div style={{ color: scoreColor, fontSize: 16, fontWeight: 900, lineHeight: 1 }}>{r.score}</div>
                          <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 9 }}>score</div>
                        </div>

                        {/* Name + meta */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 5 }}>
                            <span style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{r.name}</span>
                            {r.risk && (
                              <span style={{ background: riskBg, border: `1px solid ${riskColor}30`, borderRadius: 99, padding: "1px 8px", color: riskColor, fontSize: 10, fontWeight: 800 }}>
                                {r.risk.toUpperCase()}
                              </span>
                            )}
                            {r.demandLevel && (
                              <span style={{ color: demandColor, fontSize: 11, fontWeight: 700 }}>
                                {r.demandLevel === "high" ? "▲" : r.demandLevel === "medium" ? "◆" : "▼"} {r.demandLevel.toUpperCase()} DEMAND
                              </span>
                            )}
                            {r.category && <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 10 }}>{r.category}</span>}
                          </div>

                          {/* BUY → SELL flow */}
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: r.buyHint ? 6 : 0, flexWrap: "wrap" }}>
                            <div style={{ background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.2)", borderRadius: 8, padding: "4px 10px", display: "flex", alignItems: "center", gap: 5 }}>
                              <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 10 }}>BUY</span>
                              <span style={{ color: "#4ade80", fontWeight: 800, fontSize: 13 }}>${r.buy}</span>
                              <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 11 }}>{r.buyMarket}</span>
                            </div>
                            <ArrowRight size={12} color="rgba(255,255,255,0.25)" />
                            <div style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.2)", borderRadius: 8, padding: "4px 10px", display: "flex", alignItems: "center", gap: 5 }}>
                              <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 10 }}>SELL</span>
                              <span style={{ color: "#a78bfa", fontWeight: 800, fontSize: 13 }}>${r.sell}</span>
                              <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 11 }}>{r.sellMarket}</span>
                            </div>
                            <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 11 }}>{r.flag}</span>
                          </div>

                          {r.buyHint && (
                            <div style={{ color: "rgba(139,92,246,0.7)", fontSize: 11, fontStyle: "italic", marginBottom: r.tip ? 2 : 0 }}>
                              💡 {r.buyHint}
                            </div>
                          )}
                          {r.tip && (
                            <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>{r.tip}</div>
                          )}
                        </div>

                        {/* Profit display */}
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div style={{ color: "#4ade80", fontWeight: 900, fontSize: 22, lineHeight: 1 }}>+${netP}</div>
                          <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, marginBottom: 3 }}>net profit</div>
                          <div style={{ background: `${scoreColor}15`, borderRadius: 99, padding: "1px 8px", color: scoreColor, fontSize: 11, fontWeight: 700, textAlign: "center" }}>{r.margin}%</div>
                        </div>
                      </div>

                      {/* Action bar */}
                      <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", padding: "8px 14px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        {/* Source link */}
                        {r.sourceUrl && (
                          <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer"
                            style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 11px", borderRadius: 7, background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.2)", color: "#4ade80", fontSize: 11, fontWeight: 600, textDecoration: "none" }}>
                            <ExternalLink size={11} /> Search source
                          </a>
                        )}
                        {/* Sell link */}
                        {r.sellUrl && (
                          <a href={r.sellUrl} target="_blank" rel="noopener noreferrer"
                            style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 11px", borderRadius: 7, background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.2)", color: "#a78bfa", fontSize: 11, fontWeight: 600, textDecoration: "none" }}>
                            <ExternalLink size={11} /> Sell on {r.sellMarket}
                          </a>
                        )}
                        {/* Make Offer */}
                        <button
                          onClick={() => {
                            const opp = { ...r, market: r.sellMarket, category: r.category ?? "General" };
                            sessionStorage.setItem("resell_opportunity", JSON.stringify(opp));
                            setLocation("/resell/offer");
                          }}
                          style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 11px", borderRadius: 7, background: "rgba(245,200,66,0.1)", border: "1px solid rgba(245,200,66,0.25)", color: "#f5c842", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                          <FileText size={11} /> Make Offer
                        </button>
                        {/* Dropship */}
                        <button
                          onClick={() => {
                            const imp = { name: r.name, buy: r.buy, sell: r.sell, market: r.sellMarket, category: r.category ?? "General", sourceUrl: r.sourceUrl ?? "", buyHint: r.buyHint ?? "", sellHint: r.sellHint ?? "" };
                            sessionStorage.setItem("dropship_import", JSON.stringify(imp));
                            setLocation("/resell/dropship");
                          }}
                          style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 11px", borderRadius: 7, background: "rgba(96,165,250,0.1)", border: "1px solid rgba(96,165,250,0.25)", color: "#60a5fa", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                          <Boxes size={11} /> Dropship
                        </button>
                        {/* Save */}
                        <button
                          onClick={() => setSavedIds(toggleSave(r.id))}
                          style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 11px", borderRadius: 7, background: isSaved ? "rgba(139,92,246,0.15)" : "rgba(255,255,255,0.04)", border: `1px solid ${isSaved ? "rgba(139,92,246,0.3)" : "rgba(255,255,255,0.08)"}`, color: isSaved ? "#c4b5fd" : "rgba(255,255,255,0.35)", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                          {isSaved ? <BookmarkCheck size={11} /> : <Bookmark size={11} />}
                          {isSaved ? "Saved" : "Save"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        input::placeholder { color: rgba(255,255,255,0.2); }
        input:focus { border-color: rgba(139,92,246,0.6) !important; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
      `}</style>
    </ResellLayout>
  );
}
