import React from "react";
import { useLocation, useRoute } from "wouter";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { ResellLayout } from "@/components/resell/ResellLayout";

const PRODUCTS: Record<string, { name: string; score: number; buyPrice: string; avgSell: string; profit: string; market: string; risks: string[]; opportunities: string[] }> = {
  "1": { name: "Levi's 501 Jeans W32", score: 72, buyPrice: "120 PLN (~$30)", avgSell: "$78", profit: "$48", market: "eBay USA", risks: ["Size conversion PL→US may confuse buyers", "Return rate ~12% on clothing"], opportunities: ["Strong demand for European vintage denim", "Low competition in W32 slim"] },
  "2": { name: "Nokia 3310 (2017)", score: 41, buyPrice: "85 PLN (~$21)", avgSell: "$33", profit: "$12", market: "Amazon DE", risks: ["Saturated market", "Low margin after fees"], opportunities: ["Nostalgia buyers still active"] },
  "3": { name: "Baltic Amber Pendant", score: 88, buyPrice: "200 PLN (~$50)", avgSell: "$260", profit: "$210", market: "Etsy USA", risks: ["Authenticity certification needed", "Fragile — shipping risk"], opportunities: ["Premium niche with high margin", "Polish origin adds authenticity value"] },
};

export default function ProductDetail() {
  const [, params] = useRoute("/resell/product/:id");
  const [, setLocation] = useLocation();
  const id = params?.id ?? "1";
  const p = PRODUCTS[id] ?? PRODUCTS["1"];
  const scoreColor = p.score >= 70 ? "#4ade80" : p.score >= 50 ? "#f5c842" : "#f87171";

  return (
    <ResellLayout>
      <div style={{ padding: "36px 32px", maxWidth: 820 }}>
        <button onClick={() => setLocation("/resell/products")} style={{ display: "flex", alignItems: "center", gap: 6, color: "rgba(255,255,255,0.75)", background: "none", border: "none", cursor: "pointer", fontSize: 13, marginBottom: 28 }}>
          <ArrowLeft size={15} /> Product History
        </button>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 24, alignItems: "start" }}>
          {/* Left */}
          <div>
            <div style={{ background: `${scoreColor}10`, border: `1px solid ${scoreColor}25`, borderRadius: 18, padding: 24, marginBottom: 20 }}>
              <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 11, fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>PROFITABILITY SCORE</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ color: scoreColor, fontSize: 22, fontWeight: 900 }}>{p.score >= 70 ? "Profitable" : p.score >= 50 ? "Moderate" : "Low Return"}</div>
                  <div style={{ color: "rgba(255,255,255,0.85)", fontSize: 13, marginTop: 4 }}>{p.name}</div>
                </div>
                <div style={{ width: 72, height: 72, borderRadius: "50%", border: `3px solid ${scoreColor}50`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: `${scoreColor}10` }}>
                  <div style={{ color: scoreColor, fontSize: 24, fontWeight: 900 }}>{p.score}</div>
                  <div style={{ color: "rgba(255,255,255,0.65)", fontSize: 9 }}>/100</div>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 20 }}>
                {[{ label: "Buy price", val: p.buyPrice, c: "#fff" }, { label: "Avg sell", val: p.avgSell, c: "#4ade80" }, { label: "Est. profit", val: p.profit, c: "#4ade80" }].map(x => (
                  <div key={x.label} style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: "10px 12px" }}>
                    <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 10, marginBottom: 4 }}>{x.label}</div>
                    <div style={{ color: x.c, fontWeight: 700, fontSize: 14 }}>{x.val}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 10, fontWeight: 700, letterSpacing: 1, marginBottom: 10 }}>RISKS</div>
              {p.risks.map((r, i) => (
                <div key={i} style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 8, padding: "8px 12px", color: "#fca5a5", fontSize: 12, marginBottom: 6 }}>⚠ {r}</div>
              ))}
            </div>
            <div>
              <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 10, fontWeight: 700, letterSpacing: 1, marginBottom: 10 }}>OPPORTUNITIES</div>
              {p.opportunities.map((o, i) => (
                <div key={i} style={{ background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.3)", borderRadius: 8, padding: "8px 12px", color: "#86efac", fontSize: 12, marginBottom: 6 }}>✓ {o}</div>
              ))}
            </div>
          </div>

          {/* Right */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[{ label: "Profit Calculator", href: `/resell/profit/${id}`, color: "#34d399" }, { label: "Compliance Check", href: `/resell/compliance/${id}`, color: "#60a5fa" }, { label: "Generate Offer", href: `/resell/offer/${id}`, color: "#a78bfa" }].map(btn => (
              <button key={btn.label} onClick={() => setLocation(btn.href)} style={{
                padding: "13px 16px", borderRadius: 12, cursor: "pointer",
                background: `${btn.color}15`, border: `1px solid ${btn.color}25`,
                color: btn.color, fontWeight: 700, fontSize: 13,
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                {btn.label} <ChevronRight size={15} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </ResellLayout>
  );
}
