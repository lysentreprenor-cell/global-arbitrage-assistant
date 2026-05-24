import React from "react";
import { useLocation, useRoute } from "wouter";
import { ArrowLeft, ChevronRight, TrendingUp } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";
import { MOCK_PRODUCTS, MOCK_ANALYSES, MOCK_MARKET_PRICES } from "@/lib/resell/mockData";
import { RiskBadge } from "@/components/resell/RiskBadge";
import { MarketComparisonTable } from "@/components/resell/MarketComparisonTable";
import { getProfitabilityLabel, formatCurrency, getAverageSellPrice, convertCurrency } from "@/lib/resell/calculations";

const CONDITION_LABELS: Record<string, string> = {
  new: "Nowy", like_new: "Jak nowy", good: "Dobry", fair: "Przeciętny", poor: "Zły",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, fontWeight: 700, letterSpacing: 1, marginBottom: 14 }}>{title}</div>
      {children}
    </div>
  );
}

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#1e1e2a", border: "1px solid rgba(139,92,246,0.30)", borderRadius: 8, padding: "8px 12px" }}>
      <div style={{ color: "#a78bfa", fontSize: 12, fontWeight: 700 }}>{payload[0]?.name}</div>
      <div style={{ color: "#fff", fontSize: 14, fontWeight: 800 }}>${payload[0]?.value}</div>
    </div>
  );
};

export default function AnalysisPage() {
  const [, params] = useRoute("/resell/analysis/:id");
  const [, setLocation] = useLocation();
  const productId = params?.id ?? "prod-001";

  const product = MOCK_PRODUCTS.find(p => p.id === productId) ?? MOCK_PRODUCTS[0];
  const analysis = MOCK_ANALYSES.find(a => a.productId === product.id) ?? MOCK_ANALYSES[0];
  const marketPrices = MOCK_MARKET_PRICES[product.id] ?? [];

  const avgSellUSD = getAverageSellPrice(marketPrices);
  const buyInUSD = convertCurrency(product.buyPrice, product.buyCurrency, "USD");
  const profitUSD = avgSellUSD - buyInUSD - 20;
  const { label, color, bgColor } = getProfitabilityLabel(product.score);

  const chartData = marketPrices.flatMap(mp => [
    { name: `${mp.marketplace} min`, value: mp.minPrice, fill: "#4ade80" },
    { name: `${mp.marketplace} avg`, value: mp.avgPrice, fill: "#8b5cf6" },
    { name: `${mp.marketplace} max`, value: mp.maxPrice, fill: "#f87171" },
  ]);

  return (
    <div style={{ minHeight: "100dvh", background: "linear-gradient(160deg, #0d0010 0%, #080014 40%, #0a0a14 100%)", fontFamily: "'Outfit','Inter',sans-serif" }}>
      {/* Nav */}
      <div style={{
        background: "rgba(0,0,0,0.45)", backdropFilter: "blur(20px)",
        borderBottom: "1px solid rgba(139,92,246,0.15)",
        padding: "0 24px", position: "sticky", top: 0, zIndex: 50,
      }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", alignItems: "center", height: 60, gap: 14 }}>
          <button
            onClick={() => setLocation("/resell")}
            style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.55)", fontSize: 13, fontWeight: 600 }}
          >
            <ArrowLeft size={15} /> Powrót
          </button>
          <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.10)" }} />
          <div style={{ color: "#fff", fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {product.name}
          </div>
          <RiskBadge score={product.score} size="sm" showScore={false} />
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px 80px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 24, alignItems: "start" }}>
          {/* LEFT: main content */}
          <div>
            {/* Score card */}
            <div style={{
              background: bgColor, border: `1px solid ${color}30`,
              borderRadius: 20, padding: "24px", marginBottom: 28,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
                <div>
                  <div style={{ color: "rgba(255,255,255,0.50)", fontSize: 11, marginBottom: 6 }}>OCENA OPŁACALNOŚCI</div>
                  <div style={{ color, fontSize: 24, fontWeight: 900, marginBottom: 10 }}>{label}</div>
                  <RiskBadge score={product.score} size="md" />
                </div>
                <div style={{
                  width: 80, height: 80, borderRadius: "50%",
                  border: `3px solid ${color}50`,
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  background: `${color}10`,
                }}>
                  <div style={{ color, fontSize: 26, fontWeight: 900 }}>{product.score}</div>
                  <div style={{ color: "rgba(255,255,255,0.40)", fontSize: 9 }}>/ 100</div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
                {[
                  { label: "Cena zakupu", value: formatCurrency(product.buyPrice, product.buyCurrency), c: "#fff" },
                  { label: "Śr. sprzedaży", value: `$${avgSellUSD.toFixed(0)}`, c: "#4ade80" },
                  { label: "Potencjalny zysk", value: `$${profitUSD.toFixed(0)}`, c: profitUSD > 0 ? "#4ade80" : "#f87171" },
                ].map(item => (
                  <div key={item.label} style={{ background: "rgba(0,0,0,0.15)", borderRadius: 12, padding: "12px 14px" }}>
                    <div style={{ color: "rgba(255,255,255,0.40)", fontSize: 10, letterSpacing: 0.4, marginBottom: 4 }}>{item.label}</div>
                    <div style={{ color: item.c, fontWeight: 900, fontSize: 18 }}>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* AI insight */}
            <Section title="OCENA AI">
              <div style={{
                background: "linear-gradient(135deg, rgba(139,92,246,0.10), rgba(245,200,66,0.05))",
                border: "1px solid rgba(139,92,246,0.20)", borderRadius: 16, padding: "18px 20px",
              }}>
                <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 14, lineHeight: 1.8 }}>
                  {analysis.aiSuggestion}
                </div>
                <div style={{ marginTop: 12, color: "#a78bfa", fontSize: 12, fontWeight: 700 }}>
                  Kategoria AI: {analysis.aiCategory}
                </div>
              </div>
            </Section>

            {/* Price chart */}
            {chartData.length > 0 && (
              <Section title="PRZEDZIAŁY CEN NA RYNKACH">
                <div style={{
                  background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 16, padding: "20px",
                }}>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="name" tick={{ fill: "rgba(255,255,255,0.30)", fontSize: 9 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "rgba(255,255,255,0.30)", fontSize: 10 }} axisLine={false} tickLine={false} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="value" radius={[5, 5, 0, 0]}>
                        {chartData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 8 }}>
                    {[{ c: "#4ade80", l: "Min" }, { c: "#8b5cf6", l: "Śr" }, { c: "#f87171", l: "Max" }].map(item => (
                      <div key={item.l} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <div style={{ width: 8, height: 8, borderRadius: 2, background: item.c }} />
                        <span style={{ color: "rgba(255,255,255,0.40)", fontSize: 11 }}>{item.l}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Section>
            )}

            {/* Market comparison */}
            <Section title="PORÓWNANIE RYNKÓW">
              <MarketComparisonTable prices={marketPrices} />
            </Section>
          </div>

          {/* RIGHT: sidebar */}
          <div>
            {/* Product details */}
            <Section title="SZCZEGÓŁY PRODUKTU">
              <div style={{
                background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 16, overflow: "hidden",
              }}>
                {[
                  { label: "Kraj zakupu", value: product.buyCountry },
                  { label: "Kraj sprzedaży", value: product.sellCountry },
                  { label: "Stan", value: CONDITION_LABELS[product.condition] ?? product.condition },
                  { label: "Ilość", value: String(product.quantity) },
                  { label: "Kategoria", value: product.category },
                ].map((row, i) => (
                  <div key={row.label} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "10px 16px",
                    borderBottom: i < 4 ? "1px solid rgba(255,255,255,0.05)" : "none",
                  }}>
                    <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 12 }}>{row.label}</span>
                    <span style={{ color: "#fff", fontSize: 12, fontWeight: 600 }}>{row.value}</span>
                  </div>
                ))}
              </div>
            </Section>

            {/* Risks & Opportunities */}
            <Section title="RYZYKA">
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {analysis.risks.map((r, i) => (
                  <div key={i} style={{
                    background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.15)",
                    borderRadius: 10, padding: "8px 12px",
                    color: "#fca5a5", fontSize: 12, lineHeight: 1.4,
                  }}>⚠ {r}</div>
                ))}
              </div>
            </Section>

            {analysis.opportunities.length > 0 && (
              <Section title="SZANSE">
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {analysis.opportunities.map((o, i) => (
                    <div key={i} style={{
                      background: "rgba(74,222,128,0.06)", border: "1px solid rgba(74,222,128,0.15)",
                      borderRadius: 10, padding: "8px 12px",
                      color: "#86efac", fontSize: 12, lineHeight: 1.4,
                    }}>✓ {o}</div>
                  ))}
                </div>
              </Section>
            )}

            {/* CTA */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button
                onClick={() => setLocation("/resell/calculator")}
                style={{
                  padding: "13px 0", borderRadius: 14, border: "none", cursor: "pointer",
                  background: "linear-gradient(135deg, #34d399, #059669)",
                  color: "#fff", fontWeight: 800, fontSize: 14,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  boxShadow: "0 6px 20px rgba(52,211,153,0.30)",
                }}
              >
                Kalkulator zysku <ChevronRight size={16} />
              </button>
              <button
                onClick={() => setLocation("/resell/compliance")}
                style={{
                  padding: "13px 0", borderRadius: 14, border: "1px solid rgba(255,255,255,0.10)",
                  cursor: "pointer", background: "rgba(255,255,255,0.04)",
                  color: "rgba(255,255,255,0.70)", fontWeight: 700, fontSize: 14,
                }}
              >
                Sprawdź zgodność →
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
