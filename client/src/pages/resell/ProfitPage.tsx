import React, { useState } from "react";
import { useLocation, useRoute } from "wouter";
import { ArrowLeft, Calculator } from "lucide-react";
import { ResellLayout } from "@/components/resell/ResellLayout";

export default function ProfitPage() {
  const [, params] = useRoute("/resell/profit/:id");
  const [, setLocation] = useLocation();
  const [buyPrice, setBuyPrice] = useState("120");
  const [sellPrice, setSellPrice] = useState("78");
  const [shipping, setShipping] = useState("15");
  const [duty, setDuty] = useState("12");
  const [platformFee, setPlatformFee] = useState("10");

  const buy = parseFloat(buyPrice) || 0;
  const sell = parseFloat(sellPrice) || 0;
  const ship = parseFloat(shipping) || 0;
  const d = (buy * (parseFloat(duty) / 100));
  const fee = (sell * (parseFloat(platformFee) / 100));
  const profit = sell - buy - ship - d - fee;

  const inputStyle: React.CSSProperties = { width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(139,92,246,0.25)", borderRadius: 10, padding: "11px 14px", color: "#fff", fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit" };
  const labelStyle: React.CSSProperties = { color: "rgba(255,255,255,0.45)", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, marginBottom: 6, display: "block" };

  return (
    <ResellLayout>
      <div style={{ padding: "36px 32px", maxWidth: 600 }}>
        <button onClick={() => setLocation(`/resell/product/${params?.id ?? "1"}`)} style={{ display: "flex", alignItems: "center", gap: 6, color: "rgba(255,255,255,0.45)", background: "none", border: "none", cursor: "pointer", fontSize: 13, marginBottom: 28 }}>
          <ArrowLeft size={15} /> Back
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "linear-gradient(135deg, #34d399, #059669)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Calculator size={20} color="#fff" />
          </div>
          <div>
            <h1 style={{ color: "#fff", fontSize: 22, fontWeight: 900, margin: 0 }}>Profit Calculator</h1>
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, margin: 0 }}>Calculate net profit after all costs</p>
          </div>
        </div>

        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 18, padding: 24, display: "flex", flexDirection: "column", gap: 16, marginBottom: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div><label style={labelStyle}>BUY PRICE ($)</label><input style={inputStyle} type="number" value={buyPrice} onChange={e => setBuyPrice(e.target.value)} /></div>
            <div><label style={labelStyle}>SELL PRICE ($)</label><input style={inputStyle} type="number" value={sellPrice} onChange={e => setSellPrice(e.target.value)} /></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div><label style={labelStyle}>SHIPPING ($)</label><input style={inputStyle} type="number" value={shipping} onChange={e => setShipping(e.target.value)} /></div>
            <div><label style={labelStyle}>DUTY (%)</label><input style={inputStyle} type="number" value={duty} onChange={e => setDuty(e.target.value)} /></div>
            <div><label style={labelStyle}>PLATFORM FEE (%)</label><input style={inputStyle} type="number" value={platformFee} onChange={e => setPlatformFee(e.target.value)} /></div>
          </div>
        </div>

        <div style={{ background: profit > 0 ? "rgba(74,222,128,0.08)" : "rgba(248,113,113,0.08)", border: `1px solid ${profit > 0 ? "rgba(74,222,128,0.25)" : "rgba(248,113,113,0.25)"}`, borderRadius: 16, padding: 24 }}>
          <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 11, fontWeight: 700, letterSpacing: 1, marginBottom: 12 }}>ESTIMATED NET PROFIT</div>
          {[{ label: "Revenue", val: `$${sell.toFixed(2)}`, color: "#4ade80" }, { label: "Buy cost", val: `-$${buy.toFixed(2)}`, color: "#f87171" }, { label: "Shipping", val: `-$${ship.toFixed(2)}`, color: "#f87171" }, { label: "Duty", val: `-$${d.toFixed(2)}`, color: "#f87171" }, { label: "Platform fee", val: `-$${fee.toFixed(2)}`, color: "#f87171" }].map(row => (
            <div key={row.label} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
              <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>{row.label}</span>
              <span style={{ color: row.color, fontWeight: 600, fontSize: 13 }}>{row.val}</span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, paddingTop: 12 }}>
            <span style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>NET PROFIT</span>
            <span style={{ color: profit > 0 ? "#4ade80" : "#f87171", fontWeight: 900, fontSize: 22 }}>${profit.toFixed(2)}</span>
          </div>
        </div>
      </div>
    </ResellLayout>
  );
}
