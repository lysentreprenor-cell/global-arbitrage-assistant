import React, { useState, useEffect } from "react";
import { useLocation, useRoute } from "wouter";
import { ArrowLeft, Calculator, Target, TrendingUp, AlertTriangle } from "lucide-react";
import { ResellLayout } from "@/components/resell/ResellLayout";

const PLATFORM_PRESETS: { label: string; fee: number; color: string; ship: number }[] = [
  { label: "eBay USA",   fee: 13.25, ship: 15, color: "#f5c842" },
  { label: "Etsy USA",   fee: 9.5,  ship: 18, color: "#f97316" },
  { label: "Amazon UK",  fee: 15,   ship: 22, color: "#34d399" },
  { label: "eBay DE",    fee: 12,   ship: 14, color: "#60a5fa" },
  { label: "StockX",     fee: 9.5,  ship: 25, color: "#a78bfa" },
  { label: "Vinted",     fee: 0,    ship: 8,  color: "#c084fc" },
  { label: "Amazon DE",  fee: 15,   ship: 20, color: "#86efac" },
  { label: "Depop",      fee: 10,   ship: 12, color: "#f87171" },
];

export default function ProfitPage() {
  const [, params] = useRoute("/resell/profit/:id");
  const [, setLocation] = useLocation();

  const [buyPrice, setBuyPrice] = useState("45");
  const [sellPrice, setSellPrice] = useState("145");
  const [shipping, setShipping] = useState("18");
  const [duty, setDuty] = useState("0");
  const [platformFee, setPlatformFee] = useState("9.5");
  const [activePreset, setActivePreset] = useState("Etsy USA");
  const [targetProfit, setTargetProfit] = useState("50");
  const [mode, setMode] = useState<"calc" | "reverse">("calc");

  // Load from sessionStorage on mount
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("resell_opportunity");
      if (stored) {
        const p = JSON.parse(stored);
        if (p.buy) setBuyPrice(String(p.buy));
        if (p.sell) setSellPrice(String(p.sell));
        if (p.market) {
          const preset = PLATFORM_PRESETS.find(pr => p.market.includes(pr.label.split(" ")[0]));
          if (preset) {
            setPlatformFee(String(preset.fee));
            setShipping(String(preset.ship));
            setActivePreset(preset.label);
          }
        }
      }
    } catch {}
  }, []);

  const buy  = Math.max(0, parseFloat(buyPrice)  || 0);
  const sell = Math.max(0, parseFloat(sellPrice)  || 0);
  const ship = Math.max(0, parseFloat(shipping)   || 0);
  const dutyPct  = Math.max(0, parseFloat(duty)   || 0);
  const feePct   = Math.max(0, parseFloat(platformFee) || 0);

  // Duty applied to (buy + shipping) — CIF-based approximation
  const dutyAmt   = (buy + ship) * (dutyPct / 100);
  const feeAmt    = sell * (feePct / 100);
  const totalCost = buy + ship + dutyAmt + feeAmt;
  const profit    = sell - totalCost;
  const margin    = sell > 0 ? (profit / sell) * 100 : 0;
  const roi       = buy > 0 ? (profit / buy) * 100 : 0;

  // Breakeven sell price: sell*(1 - fee%) = buy + ship + duty_on_(buy+ship)
  // => sell = (buy + ship + dutyAmt) / (1 - fee%)
  const breakeven = feePct < 100 ? (buy + ship + dutyAmt) / (1 - feePct / 100) : 0;

  // Reverse: target sell for desired profit
  // profit = sell - sell*fee% - buy - ship - duty = sell*(1-fee%) - (buy+ship+duty)
  // sell = (targetProfit + buy + ship + duty) / (1-fee%)
  const tgt = parseFloat(targetProfit) || 0;
  const targetSell = feePct < 100 ? (tgt + buy + ship + dutyAmt) / (1 - feePct / 100) : 0;

  const profitColor = profit > 0 ? "#4ade80" : profit < 0 ? "#f87171" : "#f5c842";
  const inputStyle: React.CSSProperties = {
    width: "100%", background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(139,92,246,0.25)", borderRadius: 10,
    padding: "10px 14px", color: "#fff", fontSize: 14,
    outline: "none", boxSizing: "border-box", fontFamily: "inherit",
  };
  const labelStyle: React.CSSProperties = {
    color: "rgba(255,255,255,0.45)", fontSize: 10, fontWeight: 700,
    letterSpacing: 0.5, marginBottom: 5, display: "block",
  };

  return (
    <ResellLayout>
      <div style={{ padding: "28px 28px 60px", maxWidth: 680 }}>
        <button onClick={() => setLocation(`/resell/product/${params?.id ?? "1"}`)}
          style={{ display: "flex", alignItems: "center", gap: 6, color: "rgba(255,255,255,0.45)", background: "none", border: "none", cursor: "pointer", fontSize: 13, marginBottom: 24 }}>
          <ArrowLeft size={15} /> Back
        </button>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "linear-gradient(135deg, #34d399, #059669)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Calculator size={20} color="#fff" />
          </div>
          <div>
            <h1 style={{ color: "#fff", fontSize: 22, fontWeight: 900, margin: 0 }}>Profit Calculator</h1>
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, margin: 0 }}>Net profit after all fees, duty &amp; shipping</p>
          </div>
        </div>

        {/* Mode toggle */}
        <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
          {([
            { key: "calc",    label: "📊 Calculate profit",    icon: Calculator },
            { key: "reverse", label: "🎯 Target profit → Price", icon: Target },
          ] as const).map(m => (
            <button key={m.key} onClick={() => setMode(m.key)}
              style={{
                flex: 1, padding: "9px 0", borderRadius: 10, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 12,
                background: mode === m.key ? "linear-gradient(135deg, #8b5cf6, #7c3aed)" : "rgba(255,255,255,0.06)",
                color: mode === m.key ? "#fff" : "rgba(255,255,255,0.4)",
              }}>
              {m.label}
            </button>
          ))}
        </div>

        {/* Platform presets */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, fontWeight: 700, letterSpacing: 0.8, marginBottom: 8 }}>PLATFORM PRESETS</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {PLATFORM_PRESETS.map(pr => (
              <button key={pr.label}
                onClick={() => { setPlatformFee(String(pr.fee)); setShipping(String(pr.ship)); setActivePreset(pr.label); }}
                style={{
                  padding: "5px 12px", borderRadius: 99, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700,
                  background: activePreset === pr.label ? `${pr.color}25` : "rgba(255,255,255,0.06)",
                  color: activePreset === pr.label ? pr.color : "rgba(255,255,255,0.4)",
                  outline: activePreset === pr.label ? `1px solid ${pr.color}40` : "none",
                }}>
                {pr.label} <span style={{ opacity: 0.65, fontSize: 10 }}>{pr.fee}%</span>
              </button>
            ))}
          </div>
        </div>

        {/* Inputs */}
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 18, padding: 22, marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>BUY PRICE ($)</label>
              <input style={inputStyle} type="number" min="0" value={buyPrice} onChange={e => setBuyPrice(e.target.value)} />
            </div>
            {mode === "calc" ? (
              <div>
                <label style={labelStyle}>SELL PRICE ($)</label>
                <input style={inputStyle} type="number" min="0" value={sellPrice} onChange={e => setSellPrice(e.target.value)} />
              </div>
            ) : (
              <div>
                <label style={labelStyle}>TARGET NET PROFIT ($)</label>
                <input style={inputStyle} type="number" min="0" value={targetProfit} onChange={e => setTargetProfit(e.target.value)} />
              </div>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>SHIPPING ($)</label>
              <input style={inputStyle} type="number" min="0" value={shipping} onChange={e => setShipping(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>CUSTOMS DUTY (%)</label>
              <input style={inputStyle} type="number" min="0" max="100" value={duty} onChange={e => setDuty(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>PLATFORM FEE (%)</label>
              <input style={inputStyle} type="number" min="0" max="100" value={platformFee} onChange={e => setPlatformFee(e.target.value)} />
            </div>
          </div>
        </div>

        {/* Results */}
        {mode === "calc" && (
          <>
            {profit < 0 && (
              <div style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.25)", borderRadius: 10, padding: "9px 14px", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                <AlertTriangle size={14} color="#f87171" />
                <span style={{ color: "#fca5a5", fontSize: 12, fontWeight: 700 }}>Loss deal — sell price is below total cost</span>
              </div>
            )}
            <div style={{ background: `rgba(${profit > 0 ? "74,222,128" : "248,113,113"},0.07)`, border: `1px solid rgba(${profit > 0 ? "74,222,128" : "248,113,113"},0.2)`, borderRadius: 16, padding: 22 }}>
              <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, fontWeight: 700, letterSpacing: 1, marginBottom: 14 }}>BREAKDOWN</div>
              {[
                { label: "Revenue",       val: `$${sell.toFixed(2)}`,     c: "#86efac" },
                { label: "Buy cost",      val: `-$${buy.toFixed(2)}`,     c: "#f87171" },
                { label: "Shipping out",  val: `-$${ship.toFixed(2)}`,    c: "#f87171" },
                { label: `Duty (${dutyPct}% of buy+ship)`, val: `-$${dutyAmt.toFixed(2)}`, c: dutyAmt > 0 ? "#f87171" : "rgba(255,255,255,0.25)" },
                { label: `Platform fee (${feePct}%)`, val: `-$${feeAmt.toFixed(2)}`,  c: "#f87171" },
              ].map(row => (
                <div key={row.label} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                  <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>{row.label}</span>
                  <span style={{ color: row.c, fontWeight: 600, fontSize: 13 }}>{row.val}</span>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
                <span style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>NET PROFIT</span>
                <span style={{ color: profitColor, fontWeight: 900, fontSize: 26 }}>{profit > 0 ? "+" : ""}${profit.toFixed(2)}</span>
              </div>

              {/* KPI row */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 16 }}>
                {[
                  { label: "Margin",    val: `${margin.toFixed(1)}%`,  color: margin > 25 ? "#4ade80" : margin > 10 ? "#f5c842" : "#f87171" },
                  { label: "ROI",       val: `${roi.toFixed(1)}%`,     color: roi > 50 ? "#4ade80" : roi > 20 ? "#f5c842" : "#f87171" },
                  { label: "Breakeven", val: `$${breakeven.toFixed(0)}`, color: "rgba(255,255,255,0.55)" },
                ].map(k => (
                  <div key={k.label} style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: "10px 12px", textAlign: "center" }}>
                    <div style={{ color: k.color, fontWeight: 900, fontSize: 18 }}>{k.val}</div>
                    <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, marginTop: 2 }}>{k.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {mode === "reverse" && (
          <div style={{ background: "rgba(139,92,246,0.07)", border: "1px solid rgba(139,92,246,0.2)", borderRadius: 16, padding: 22 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <Target size={16} color="#a78bfa" />
              <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, fontWeight: 700, letterSpacing: 1 }}>TO ACHIEVE ${tgt} NET PROFIT</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div style={{ background: "rgba(0,0,0,0.25)", borderRadius: 12, padding: "16px 18px" }}>
                <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, marginBottom: 6 }}>LIST AT MINIMUM</div>
                <div style={{ color: "#4ade80", fontWeight: 900, fontSize: 32 }}>${targetSell.toFixed(0)}</div>
                <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, marginTop: 4 }}>on {activePreset} ({feePct}% fee)</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: "10px 14px" }}>
                  <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 10 }}>Total costs</div>
                  <div style={{ color: "#f87171", fontWeight: 700, fontSize: 16 }}>-${(buy + ship + dutyAmt + (targetSell * feePct / 100)).toFixed(2)}</div>
                </div>
                <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: "10px 14px" }}>
                  <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 10 }}>Breakeven price</div>
                  <div style={{ color: "#f5c842", fontWeight: 700, fontSize: 16 }}>${breakeven.toFixed(0)}</div>
                </div>
              </div>
            </div>
            <div style={{ background: "rgba(74,222,128,0.07)", border: "1px solid rgba(74,222,128,0.15)", borderRadius: 10, padding: "10px 14px", marginTop: 14 }}>
              <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>
                Margin at target: <strong style={{ color: "#4ade80" }}>{(tgt / targetSell * 100).toFixed(1)}%</strong>
                &nbsp;·&nbsp; ROI: <strong style={{ color: "#4ade80" }}>{buy > 0 ? (tgt / buy * 100).toFixed(1) : "∞"}%</strong>
              </div>
            </div>
          </div>
        )}

        {/* Tips */}
        <div style={{ background: "rgba(96,165,250,0.06)", border: "1px solid rgba(96,165,250,0.15)", borderRadius: 12, padding: "12px 16px", marginTop: 16 }}>
          <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, fontWeight: 700, letterSpacing: 0.8, marginBottom: 6 }}>💡 TIPS</div>
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, lineHeight: 1.6 }}>
            Duty is calculated on buy + shipping (CIF basis). eBay USA charges 13.25% on total transaction including shipping.
            Etsy charges 6.5% listing fee + 3% payment processing = 9.5% effective. Vinted charges 0% to sellers.
          </div>
        </div>
      </div>
    </ResellLayout>
  );
}
