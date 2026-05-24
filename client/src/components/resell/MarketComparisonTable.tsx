import React from "react";
import type { MarketPrice } from "@/lib/resell/types";

const MARKETPLACE_LABELS: Record<string, string> = {
  ebay: "eBay", amazon: "Amazon", etsy: "Etsy", shopify: "Shopify", manual: "Manual",
};

const MARKETPLACE_COLORS: Record<string, string> = {
  ebay: "#e43137", amazon: "#ff9900", etsy: "#f56400", shopify: "#96bf48", manual: "#8b5cf6",
};

const BADGE_COLORS = {
  low: { bg: "rgba(74,222,128,0.12)", color: "#4ade80", label: "Niska" },
  medium: { bg: "rgba(251,191,36,0.12)", color: "#fbbf24", label: "Średnia" },
  high: { bg: "rgba(248,113,113,0.12)", color: "#f87171", label: "Wysoka" },
};

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.08)", overflow: "hidden", marginTop: 4, width: 60 }}>
      <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 2 }} />
    </div>
  );
}

interface Props {
  prices: MarketPrice[];
}

export function MarketComparisonTable({ prices }: Props) {
  if (!prices.length) {
    return (
      <div style={{ textAlign: "center", color: "rgba(255,255,255,0.35)", padding: "32px 0", fontSize: 13 }}>
        Brak danych rynkowych
      </div>
    );
  }

  const maxPrice = Math.max(...prices.map(p => p.maxPrice));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {prices.map(mp => {
        const color = MARKETPLACE_COLORS[mp.marketplace] ?? "#8b5cf6";
        const label = MARKETPLACE_LABELS[mp.marketplace] ?? mp.marketplace;
        const comp = BADGE_COLORS[mp.competition];
        const pop = BADGE_COLORS[mp.popularity];

        return (
          <div key={mp.marketplace} style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 14, padding: "14px 16px",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{
                  width: 8, height: 8, borderRadius: "50%", background: color,
                  boxShadow: `0 0 8px ${color}`,
                }} />
                <span style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{label}</span>
                <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 11 }}>
                  {mp.listingsCount.toLocaleString()} ofert
                </span>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <span style={{
                  background: pop.bg, color: pop.color,
                  padding: "2px 7px", borderRadius: 99, fontSize: 10, fontWeight: 700,
                }}>↑ {pop.label}</span>
                <span style={{
                  background: comp.bg, color: comp.color,
                  padding: "2px 7px", borderRadius: 99, fontSize: 10, fontWeight: 700,
                }}>⚡ {comp.label}</span>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              {[
                { label: "Najniższa", value: mp.minPrice, accent: "#4ade80" },
                { label: "Średnia", value: mp.avgPrice, accent: color },
                { label: "Najwyższa", value: mp.maxPrice, accent: "#f87171" },
              ].map(item => (
                <div key={item.label}>
                  <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 10, marginBottom: 2 }}>{item.label}</div>
                  <div style={{ color: item.accent, fontWeight: 800, fontSize: 15 }}>
                    ${item.value}
                  </div>
                  <MiniBar value={item.value} max={maxPrice} color={item.accent} />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
