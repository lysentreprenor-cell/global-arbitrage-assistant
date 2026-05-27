import React, { useState } from "react";
import { useLocation } from "wouter";
import {
  Bookmark, Trash2, ArrowRight, ExternalLink, FileText, Boxes,
  BookmarkX, TrendingUp, AlertCircle,
} from "lucide-react";
import { ResellLayout } from "@/components/resell/ResellLayout";

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
  priceGapPct?: number;
  confidence?: "live" | "estimated";
};

const SAVED_KEY = "resell_saved_opps";

function loadSaved(): SearchResult[] {
  try { return JSON.parse(localStorage.getItem(SAVED_KEY) || "[]"); } catch { return []; }
}
function removeSaved(id: number): SearchResult[] {
  const next = loadSaved().filter(x => x.id !== id);
  localStorage.setItem(SAVED_KEY, JSON.stringify(next));
  return next;
}
function clearAllSaved(): void {
  localStorage.removeItem(SAVED_KEY);
}

export default function SavedPage() {
  const [, setLocation] = useLocation();
  const [items, setItems] = useState<SearchResult[]>(loadSaved);

  const handleRemove = (id: number) => {
    setItems(removeSaved(id));
  };

  const handleClearAll = () => {
    if (!confirm("Remove all saved opportunities?")) return;
    clearAllSaved();
    setItems([]);
  };

  const totalPotential = items.reduce((s, r) => s + (r.netProfit ?? r.profit), 0);

  return (
    <ResellLayout>
      <div style={{ padding: "32px 28px 60px", maxWidth: 920 }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, #8b5cf6, #7c3aed)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Bookmark size={18} color="#fff" />
              </div>
              <h1 style={{ color: "#fff", fontSize: 22, fontWeight: 900, margin: 0 }}>Saved Opportunities</h1>
            </div>
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, margin: 0 }}>
              {items.length > 0
                ? `${items.length} saved · Total potential: +$${totalPotential} net`
                : "Bookmark search results to review them here"}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setLocation("/resell/search")}
              style={{ padding: "9px 16px", borderRadius: 10, border: "1px solid rgba(139,92,246,0.3)", background: "rgba(139,92,246,0.12)", color: "#a78bfa", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              + Search More
            </button>
            {items.length > 0 && (
              <button onClick={handleClearAll}
                style={{ padding: "9px 16px", borderRadius: 10, border: "1px solid rgba(248,113,113,0.2)", background: "rgba(248,113,113,0.06)", color: "#f87171", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                Clear All
              </button>
            )}
          </div>
        </div>

        {/* Summary strip */}
        {items.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 24 }}>
            {[
              { label: "SAVED", val: items.length, color: "#a78bfa" },
              { label: "BEST PROFIT", val: `+$${Math.max(...items.map(r => r.netProfit ?? r.profit))}`, color: "#4ade80" },
              { label: "AVG SCORE", val: Math.round(items.reduce((s, r) => s + r.score, 0) / items.length), color: "#f5c842" },
            ].map(s => (
              <div key={s.label} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "12px 16px" }}>
                <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 9, fontWeight: 700, letterSpacing: 0.8, marginBottom: 4 }}>{s.label}</div>
                <div style={{ color: s.color, fontSize: 20, fontWeight: 900 }}>{s.val}</div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {items.length === 0 && (
          <div style={{ textAlign: "center", padding: "80px 0", color: "rgba(255,255,255,0.25)" }}>
            <BookmarkX size={48} style={{ margin: "0 auto 16px", opacity: 0.2, display: "block" }} />
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No saved opportunities</div>
            <div style={{ fontSize: 13, marginBottom: 24 }}>Search for products and click the Bookmark button to save them here</div>
            <button onClick={() => setLocation("/resell/search")}
              style={{ padding: "10px 24px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #8b5cf6, #7c3aed)", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              Go to AI Search →
            </button>
          </div>
        )}

        {/* Items */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {items.map((r) => {
            const scoreColor = r.score >= 85 ? "#4ade80" : r.score >= 65 ? "#f5c842" : "#f87171";
            const riskColor = r.risk === "low" ? "#4ade80" : r.risk === "medium" ? "#f5c842" : "#f87171";
            const riskBg = r.risk === "low" ? "rgba(74,222,128,0.1)" : r.risk === "medium" ? "rgba(245,200,66,0.1)" : "rgba(248,113,113,0.1)";
            const demandColor = r.demandLevel === "high" ? "#4ade80" : r.demandLevel === "medium" ? "#60a5fa" : "rgba(255,255,255,0.3)";
            const netP = r.netProfit ?? r.profit;

            return (
              <div key={r.id}
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(139,92,246,0.15)", borderRadius: 14, overflow: "hidden" }}
              >
                {/* Main row */}
                <div
                  style={{ padding: "16px 18px", cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 14 }}
                  onClick={() => {
                    const opp = { ...r, market: r.sellMarket, category: r.category ?? "General" };
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
                      <div style={{ color: "rgba(139,92,246,0.7)", fontSize: 11, fontStyle: "italic" }}>
                        💡 {r.buyHint}
                      </div>
                    )}
                    {r.tip && (
                      <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, marginTop: 2 }}>{r.tip}</div>
                    )}
                  </div>

                  {/* Profit */}
                  <div style={{ textAlign: "right", flexShrink: 0, minWidth: 80 }}>
                    <div style={{ color: "#4ade80", fontWeight: 900, fontSize: 22, lineHeight: 1 }}>+${netP}</div>
                    <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, marginBottom: 4 }}>net profit</div>
                    <div style={{ background: `${scoreColor}15`, borderRadius: 99, padding: "1px 8px", color: scoreColor, fontSize: 11, fontWeight: 700, textAlign: "center" }}>{r.margin}% margin</div>
                    {r.priceGapPct && r.priceGapPct > 0 ? (
                      <div style={{ color: r.priceGapPct > 200 ? "#4ade80" : r.priceGapPct > 80 ? "#f5c842" : "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: 800, marginTop: 3 }}>
                        +{r.priceGapPct}% gap
                      </div>
                    ) : null}
                  </div>
                </div>

                {/* Action bar */}
                <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", padding: "8px 14px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  {r.sourceUrl && (
                    <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer"
                      style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 11px", borderRadius: 7, background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.2)", color: "#4ade80", fontSize: 11, fontWeight: 600, textDecoration: "none" }}>
                      <ExternalLink size={11} /> Search source
                    </a>
                  )}
                  {r.sellUrl && (
                    <a href={r.sellUrl} target="_blank" rel="noopener noreferrer"
                      style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 11px", borderRadius: 7, background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.2)", color: "#a78bfa", fontSize: 11, fontWeight: 600, textDecoration: "none" }}>
                      <ExternalLink size={11} /> Sell on {r.sellMarket}
                    </a>
                  )}
                  <button
                    onClick={() => {
                      const opp = { ...r, market: r.sellMarket, category: r.category ?? "General" };
                      sessionStorage.setItem("resell_opportunity", JSON.stringify(opp));
                      setLocation("/resell/offer");
                    }}
                    style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 11px", borderRadius: 7, background: "rgba(245,200,66,0.1)", border: "1px solid rgba(245,200,66,0.25)", color: "#f5c842", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                    <FileText size={11} /> Make Offer
                  </button>
                  <button
                    onClick={() => {
                      const imp = { name: r.name, buy: r.buy, sell: r.sell, market: r.sellMarket, category: r.category ?? "General", sourceUrl: r.sourceUrl ?? "", buyHint: r.buyHint ?? "", sellHint: r.sellHint ?? "" };
                      sessionStorage.setItem("dropship_import", JSON.stringify(imp));
                      setLocation("/resell/dropship");
                    }}
                    style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 11px", borderRadius: 7, background: "rgba(96,165,250,0.1)", border: "1px solid rgba(96,165,250,0.25)", color: "#60a5fa", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                    <Boxes size={11} /> Dropship
                  </button>
                  <button
                    onClick={() => handleRemove(r.id)}
                    style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 11px", borderRadius: 7, background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.15)", color: "#f87171", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                    <Trash2 size={11} /> Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <style>{`input::placeholder { color: rgba(255,255,255,0.2); }`}</style>
    </ResellLayout>
  );
}
