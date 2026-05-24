import React from "react";
import { useLocation, useRoute } from "wouter";
import { ArrowLeft, ChevronRight } from "lucide-react";
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
    <div style={{ marginBottom: 20 }}>
      <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 10, fontWeight: 700, letterSpacing: 0.8, marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  );
}

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#1e1e2a", border: "1px solid rgba(139,92,246,0.30)", borderRadius: 8, padding: "8px 12px" }}>
      <div style={{ color: "#a78bfa", fontSize: 12, fontWeight: 700 }}>{payload[0].name}</div>
      <div style={{ color: "#fff", fontSize: 14, fontWeight: 800 }}>${payload[0].value}</div>
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
  const profitUSD = avgSellUSD - buyInUSD - 20; // rough estimate with $20 shipping
  const { label, color, bgColor } = getProfitabilityLabel(product.score);

  const chartData = marketPrices.flatMap(mp => [
    { name: `${mp.marketplace} min`, value: mp.minPrice, fill: "#4ade80" },
    { name: `${mp.marketplace} avg`, value: mp.avgPrice, fill: "#8b5cf6" },
    { name: `${mp.marketplace} max`, value: mp.maxPrice, fill: "#f87171" },
  ]);

  return (
    <div style={{
      minHeight: "100dvh",
      background: "linear-gradient(160deg, #0d0010 0%, #080014 40%, #0a0a14 100%)",
      paddingBottom: 100,
    }}>
      {/* Header */}
      <div style={{ padding: "20px 20px 0", display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button
          onClick={() => setLocation("/resell")}
          style={{
            width: 36, height: 36, borderRadius: 12, border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(255,255,255,0.05)", cursor: "pointer", color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}
        >
          <ArrowLeft size={16} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: "#fff", fontSize: 16, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {product.name}
          </div>
          <div style={{ color: "rgba(255,255,255,0.40)", fontSize: 11 }}>{product.category}</div>
        </div>
      </div>

      <div style={{ padding: "0 20px" }}>
        {/* Score card */}
        <div style={{
          background: bgColor, border: `1px solid ${color}30`,
          borderRadius: 20, padding: "20px", marginBottom: 20,
          position: "relative", overflow: "hidden",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ color: "rgba(255,255,255,0.50)", fontSize: 11, marginBottom: 6 }}>OCENA OPŁACALNOŚCI</div>
              <div style={{ color, fontSize: 22, fontWeight: 800, marginBottom: 8 }}>{label}</div>
              <RiskBadge score={product.score} size="md" />
            </div>
            <div style={{
              width: 72, height: 72, borderRadius: "50%",
              border: `3px solid ${color}50`,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              background: `${color}10`,
            }}>
              <div style={{ color, fontSize: 24, fontWeight: 900 }}>{product.score}</div>
              <div style={{ color: "rgba(255,255,255,0.40)", fontSize: 9 }}>/ 100</div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginTop: 18 }}>
            {[
              { label: "Cena zakupu", value: formatCurrency(product.buyPrice, product.buyCurrency), color: "#fff" },
              { label: "Śr. sprzedaży", value: `$${avgSellUSD.toFixed(0)}`, color: "#4ade80" },
              { label: "Potenc. zysk", value: `$${profitUSD.toFixed(0)}`, color: profitUSD > 0 ? "#4ade80" : "#f87171" },
            ].map(item => (
              <div key={item.label}>
                <div style={{ color: "rgba(255,255,255,0.40)", fontSize: 9, letterSpacing: 0.4, marginBottom: 4 }}>{item.label}</div>
                <div style={{ color: item.color, fontWeight: 800, fontSize: 14 }}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Product details */}
        <Section title="SZCZEGÓŁY PRODUKTU">
          <div style={{
            background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 14, overflow: "hidden",
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

        {/* AI insight */}
        <Section title="OCENA AI">
          <div style={{
            background: "linear-gradient(135deg, rgba(139,92,246,0.10) 0%, rgba(245,200,66,0.05) 100%)",
            border: "1px solid rgba(139,92,246,0.20)", borderRadius: 14, padding: "14px 16px",
          }}>
            <div style={{ color: "rgba(255,255,255,0.70)", fontSize: 12, lineHeight: 1.7 }}>
              {analysis.aiSuggestion}
            </div>
            <div style={{ marginTop: 12, color: "#a78bfa", fontSize: 11, fontWeight: 700 }}>
              Kategoria AI: {analysis.aiCategory}
            </div>
          </div>
        </Section>

        {/* Price chart */}
        {chartData.length > 0 && (
          <Section title="PRZEDZIAŁY CEN NA RYNKACH">
            <div style={{
              background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 14, padding: "16px",
            }}>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="name" tick={{ fill: "rgba(255,255,255,0.30)", fontSize: 9 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "rgba(255,255,255,0.30)", fontSize: 9 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Section>
        )}

        {/* Market comparison */}
        <Section title="PORÓWNANIE RYNKÓW">
          <MarketComparisonTable prices={marketPrices} />
        </Section>

        {/* Risks & Opportunities */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
          <div>
            <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 10, fontWeight: 700, letterSpacing: 0.8, marginBottom: 10 }}>RYZYKA</div>
            {analysis.risks.map((r, i) => (
              <div key={i} style={{
                background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.15)",
                borderRadius: 8, padding: "7px 10px", marginBottom: 6,
                color: "#fca5a5", fontSize: 10, lineHeight: 1.4,
              }}>
                ⚠ {r}
              </div>
            ))}
          </div>
          <div>
            <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 10, fontWeight: 700, letterSpacing: 0.8, marginBottom: 10 }}>SZANSE</div>
            {analysis.opportunities.map((o, i) => (
              <div key={i} style={{
                background: "rgba(74,222,128,0.06)", border: "1px solid rgba(74,222,128,0.15)",
                borderRadius: 8, padding: "7px 10px", marginBottom: 6,
                color: "#86efac", fontSize: 10, lineHeight: 1.4,
              }}>
                ✓ {o}
              </div>
            ))}
            {analysis.opportunities.length === 0 && (
              <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 10 }}>Brak</div>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button
            onClick={() => setLocation("/resell/calculator")}
            style={{
              padding: "13px 0", borderRadius: 14, border: "none", cursor: "pointer",
              background: "linear-gradient(135deg, #34d399 0%, #059669 100%)",
              color: "#fff", fontWeight: 800, fontSize: 14,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              boxShadow: "0 6px 20px rgba(52,211,153,0.30)",
            }}
          >
            Przejdź do kalkulatora zysku <ChevronRight size={16} />
          </button>
          <button
            onClick={() => setLocation("/resell/compliance")}
            style={{
              padding: "13px 0", borderRadius: 14, border: "1px solid rgba(255,255,255,0.10)",
              cursor: "pointer", background: "rgba(255,255,255,0.04)",
              color: "rgba(255,255,255,0.70)", fontWeight: 700, fontSize: 14,
            }}
          >
            Sprawdź zgodność prawną →
          </button>
        </div>
      </div>
    </div>
  );
}
