import React, { useState, useEffect } from "react";
import { useLocation, useRoute } from "wouter";
import { ArrowLeft, Calculator, Target, TrendingUp, AlertTriangle, Save, RotateCcw } from "lucide-react";
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

const CURRENCIES = [
  { key: "USD", symbol: "$",  rate: 1 },
  { key: "EUR", symbol: "€",  rate: 0.92 },
  { key: "GBP", symbol: "£",  rate: 0.79 },
  { key: "PLN", symbol: "zł", rate: 3.98 },
];

type Scenario = {
  id: number;
  label: string;
  buyPrice: string; sellPrice: string;
  shipping: string; duty: string; platformFee: string;
  platform: string; currency: string;
  profit: number; margin: number;
  savedAt: string;
};

const SCENARIO_KEY = "profit_scenarios";

function loadScenarios(): Scenario[] {
  try { return JSON.parse(localStorage.getItem(SCENARIO_KEY) || "[]"); } catch { return []; }
}
function saveScenario(s: Scenario) {
  const all = loadScenarios().filter(x => x.id !== s.id);
  localStorage.setItem(SCENARIO_KEY, JSON.stringify([s, ...all].slice(0, 5)));
}

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

  const [currency, setCurrency] = useState("USD");
  const [vatEnabled, setVatEnabled] = useState(false);
  const [vatPct, setVatPct] = useState("20");

  const [scenarios, setScenarios] = useState<Scenario[]>(loadScenarios);
  const [showScenarios, setShowScenarios] = useState(false);

  const curr = CURRENCIES.find(c => c.key === currency) ?? CURRENCIES[0];

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
  const vatRate  = vatEnabled ? Math.max(0, parseFloat(vatPct) || 0) : 0;

  // Duty on buy + shipping (CIF), VAT on sell price
  const dutyAmt   = (buy + ship) * (dutyPct / 100);
  const feeAmt    = sell * (feePct / 100);
  const vatAmt    = sell * (vatRate / 100);
  const totalCost = buy + ship + dutyAmt + feeAmt + vatAmt;
  const profit    = sell - totalCost;
  const margin    = sell > 0 ? (profit / sell) * 100 : 0;
  const roi       = buy > 0 ? (profit / buy) * 100 : 0;

  const breakeven = feePct < 100 ? (buy + ship + dutyAmt) / (1 - (feePct + vatRate) / 100) : 0;

  const tgt = parseFloat(targetProfit) || 0;
  const targetSell = (feePct + vatRate) < 100 ? (tgt + buy + ship + dutyAmt) / (1 - (feePct + vatRate) / 100) : 0;

  const profitColor = profit > 0 ? "#4ade80" : profit < 0 ? "#f87171" : "#f5c842";

  // Currency-converted display
  const fmt = (val: number) => `${curr.symbol}${(val * curr.rate).toFixed(2)}`;
  const fmtInt = (val: number) => `${curr.symbol}${Math.round(val * curr.rate)}`;

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

  const handleSaveScenario = () => {
    const s: Scenario = {
      id: Date.now(),
      label: `${activePreset} · ${fmtInt(profit)} profit`,
      buyPrice, sellPrice, shipping, duty, platformFee,
      platform: activePreset, currency,
      profit: parseFloat(profit.toFixed(2)),
      margin: parseFloat(margin.toFixed(1)),
      savedAt: new Date().toLocaleTimeString(),
    };
    saveScenario(s);
    setScenarios(loadScenarios());
    setShowScenarios(true);
  };

  const handleRecallScenario = (s: Scenario) => {
    setBuyPrice(s.buyPrice);
    setSellPrice(s.sellPrice);
    setShipping(s.shipping);
    setDuty(s.duty);
    setPlatformFee(s.platformFee);
    setActivePreset(s.platform);
    setCurrency(s.currency);
    setShowScenarios(false);
  };

  return (
    <ResellLayout>
      <div style={{ padding: "28px 28px 60px", maxWidth: 700 }}>
        <button onClick={() => setLocation(`/resell/product/${params?.id ?? "1"}`)}
          style={{ display: "flex", alignItems: "center", gap: 6, color: "rgba(255,255,255,0.45)", background: "none", border: "none", cursor: "pointer", fontSize: 13, marginBottom: 24 }}>
          <ArrowLeft size={15} /> Back
        </button>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: "linear-gradient(135deg, #34d399, #059669)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Calculator size={20} color="#fff" />
            </div>
            <div>
              <h1 style={{ color: "#fff", fontSize: 22, fontWeight: 900, margin: 0 }}>Profit Calculator</h1>
              <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, margin: 0 }}>Net profit after all fees, duty, VAT &amp; shipping</p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handleSaveScenario}
              title="Save this scenario"
              style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 14px", borderRadius: 9, background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.25)", color: "#4ade80", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
            >
              <Save size={13} /> Save
            </button>
            {scenarios.length > 0 && (
              <button
                onClick={() => setShowScenarios(s => !s)}
                style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 14px", borderRadius: 9, background: showScenarios ? "rgba(139,92,246,0.2)" : "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.25)", color: "#a78bfa", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
              >
                <RotateCcw size={13} /> History ({scenarios.length})
              </button>
            )}
          </div>
        </div>

        {/* Scenario history panel */}
        {showScenarios && scenarios.length > 0 && (
          <div style={{ background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.18)", borderRadius: 14, padding: 16, marginBottom: 20 }}>
            <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, fontWeight: 700, letterSpacing: 0.8, marginBottom: 12 }}>SAVED SCENARIOS — click to recall</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {scenarios.map(s => (
                <button
                  key={s.id}
                  onClick={() => handleRecallScenario(s)}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "10px 14px", cursor: "pointer", textAlign: "left", width: "100%" }}
                >
                  <div>
                    <div style={{ color: "#c4b5fd", fontWeight: 700, fontSize: 13 }}>{s.label}</div>
                    <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, marginTop: 2 }}>Buy ${s.buyPrice} · Sell ${s.sellPrice} · {s.platform} · {s.savedAt}</div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 12 }}>
                    <div style={{ color: s.profit > 0 ? "#4ade80" : "#f87171", fontWeight: 800, fontSize: 15 }}>{s.profit > 0 ? "+" : ""}${s.profit}</div>
                    <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10 }}>{s.margin}% margin</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Mode toggle */}
        <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
          {([
            { key: "calc",    label: "📊 Calculate profit" },
            { key: "reverse", label: "🎯 Target profit → Price" },
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

        {/* Currency selector */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, fontWeight: 700, letterSpacing: 0.8, marginBottom: 8 }}>DISPLAY CURRENCY</div>
          <div style={{ display: "flex", gap: 6 }}>
            {CURRENCIES.map(c => (
              <button key={c.key}
                onClick={() => setCurrency(c.key)}
                style={{
                  padding: "5px 14px", borderRadius: 99, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700,
                  background: currency === c.key ? "rgba(245,200,66,0.2)" : "rgba(255,255,255,0.06)",
                  color: currency === c.key ? "#f5c842" : "rgba(255,255,255,0.4)",
                  outline: currency === c.key ? "1px solid rgba(245,200,66,0.4)" : "none",
                }}>
                {c.symbol} {c.key}
              </button>
            ))}
            {currency !== "USD" && (
              <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 11, alignSelf: "center", marginLeft: 4 }}>
                1 USD = {curr.rate} {currency}
              </span>
            )}
          </div>
        </div>

        {/* Platform presets */}
        <div style={{ marginBottom: 16 }}>
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
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
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
          {/* VAT toggle */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, paddingTop: 4 }}>
            <button
              onClick={() => setVatEnabled(v => !v)}
              style={{
                display: "flex", alignItems: "center", gap: 8, padding: "7px 14px", borderRadius: 9, cursor: "pointer",
                background: vatEnabled ? "rgba(248,113,113,0.15)" : "rgba(255,255,255,0.05)",
                border: `1px solid ${vatEnabled ? "rgba(248,113,113,0.35)" : "rgba(255,255,255,0.1)"}`,
                color: vatEnabled ? "#f87171" : "rgba(255,255,255,0.35)", fontSize: 12, fontWeight: 700,
              }}
            >
              <div style={{ width: 14, height: 14, borderRadius: 3, background: vatEnabled ? "#f87171" : "rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {vatEnabled && <span style={{ color: "#fff", fontSize: 10, fontWeight: 900 }}>✓</span>}
              </div>
              VAT / Sales Tax
            </button>
            {vatEnabled && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="number" min="0" max="100" value={vatPct}
                  onChange={e => setVatPct(e.target.value)}
                  style={{ width: 70, background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 8, padding: "7px 10px", color: "#fca5a5", fontSize: 13, outline: "none", fontFamily: "inherit" }}
                />
                <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 12 }}>% on sell price</span>
                <div style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 8, padding: "4px 10px" }}>
                  <span style={{ color: "#f87171", fontWeight: 700, fontSize: 13 }}>-{fmt(vatAmt)}</span>
                </div>
              </div>
            )}
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
              <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, fontWeight: 700, letterSpacing: 1, marginBottom: 14 }}>BREAKDOWN {currency !== "USD" ? `(in ${currency}, 1 USD = ${curr.rate} ${currency})` : ""}</div>
              {[
                { label: "Revenue",       val: fmt(sell),     c: "#86efac" },
                { label: "Buy cost",      val: `-${fmt(buy)}`,     c: "#f87171" },
                { label: "Shipping out",  val: `-${fmt(ship)}`,    c: "#f87171" },
                { label: `Duty (${dutyPct}% of buy+ship)`, val: `-${fmt(dutyAmt)}`, c: dutyAmt > 0 ? "#f87171" : "rgba(255,255,255,0.25)" },
                { label: `Platform fee (${feePct}%)`, val: `-${fmt(feeAmt)}`,  c: "#f87171" },
                ...(vatEnabled ? [{ label: `VAT / Tax (${vatPct}%)`, val: `-${fmt(vatAmt)}`, c: "#f87171" }] : []),
              ].map(row => (
                <div key={row.label} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                  <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>{row.label}</span>
                  <span style={{ color: row.c, fontWeight: 600, fontSize: 13 }}>{row.val}</span>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
                <span style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>NET PROFIT</span>
                <span style={{ color: profitColor, fontWeight: 900, fontSize: 26 }}>{profit > 0 ? "+" : ""}{fmt(profit)}</span>
              </div>

              {/* KPI row */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 16 }}>
                {[
                  { label: "Margin",    val: `${margin.toFixed(1)}%`,  color: margin > 25 ? "#4ade80" : margin > 10 ? "#f5c842" : "#f87171" },
                  { label: "ROI",       val: `${roi.toFixed(1)}%`,     color: roi > 50 ? "#4ade80" : roi > 20 ? "#f5c842" : "#f87171" },
                  { label: "Breakeven", val: fmtInt(breakeven), color: "rgba(255,255,255,0.55)" },
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
                <div style={{ color: "#4ade80", fontWeight: 900, fontSize: 32 }}>{fmtInt(targetSell)}</div>
                <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, marginTop: 4 }}>on {activePreset} ({feePct}% fee{vatEnabled ? ` +${vatPct}% VAT` : ""})</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: "10px 14px" }}>
                  <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 10 }}>Total costs</div>
                  <div style={{ color: "#f87171", fontWeight: 700, fontSize: 16 }}>-{fmt(buy + ship + dutyAmt + (targetSell * feePct / 100) + (targetSell * vatRate / 100))}</div>
                </div>
                <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: "10px 14px" }}>
                  <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 10 }}>Breakeven price</div>
                  <div style={{ color: "#f5c842", fontWeight: 700, fontSize: 16 }}>{fmtInt(breakeven)}</div>
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
            EU VAT (20% UK, 19% DE, 23% PL) applies when selling to EU/UK buyers as a business.
            Currency rates are approximate — check live rates before committing.
          </div>
        </div>
      </div>

      <style>{`
        input::placeholder { color: rgba(255,255,255,0.2); }
        input:focus { border-color: rgba(139,92,246,0.6) !important; }
      `}</style>
    </ResellLayout>
  );
}
