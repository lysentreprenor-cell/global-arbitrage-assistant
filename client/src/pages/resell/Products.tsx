import React from "react";
import { useLocation } from "wouter";
import { Plus, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { ResellLayout } from "@/components/resell/ResellLayout";

const MOCK_PRODUCTS = [
  { id: 1, name: "Levi's 501 Jeans W32", score: 72, profit: 48, buyPrice: "120 PLN", buyCountry: "Poland", sellCountry: "USA", market: "eBay USA", status: "profitable", date: "2026-05-24" },
  { id: 2, name: "Nokia 3310 (2017)", score: 41, profit: 12, buyPrice: "85 PLN", buyCountry: "Poland", sellCountry: "Germany", market: "Amazon DE", status: "low", date: "2026-05-23" },
  { id: 3, name: "Baltic Amber Pendant", score: 88, profit: 210, buyPrice: "200 PLN", buyCountry: "Poland", sellCountry: "USA", market: "Etsy USA", status: "profitable", date: "2026-05-22" },
  { id: 4, name: "Adidas Gazelle PL", score: 61, profit: 35, buyPrice: "320 PLN", buyCountry: "Poland", sellCountry: "UK", market: "eBay UK", status: "moderate", date: "2026-05-21" },
  { id: 5, name: "Porcelain Figurine Set", score: 34, profit: 18, buyPrice: "150 PLN", buyCountry: "Poland", sellCountry: "USA", market: "eBay USA", status: "low", date: "2026-05-20" },
];

export default function Products() {
  const [, setLocation] = useLocation();

  return (
    <ResellLayout>
      <div style={{ padding: "36px 32px", maxWidth: 900 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 32 }}>
          <div>
            <h1 style={{ color: "#fff", fontSize: 28, fontWeight: 900, margin: 0, letterSpacing: -0.5 }}>Product History</h1>
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 14, marginTop: 6 }}>Track and analyze all your potential deals.</p>
          </div>
          <button
            data-testid="button-add-product"
            onClick={() => setLocation("/resell/add")}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "10px 20px", borderRadius: 10, border: "none", cursor: "pointer",
              background: "linear-gradient(135deg, #8b5cf6, #7c3aed)",
              color: "#fff", fontWeight: 700, fontSize: 13,
              boxShadow: "0 4px 14px rgba(139,92,246,0.35)",
            }}
          >
            <Plus size={15} /> Add Product
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {MOCK_PRODUCTS.map(p => {
            const scoreColor = p.score >= 70 ? "#4ade80" : p.score >= 50 ? "#f5c842" : "#f87171";
            const Icon = p.score >= 70 ? TrendingUp : p.score >= 50 ? Minus : TrendingDown;
            return (
              <div
                key={p.id}
                onClick={() => setLocation(`/resell/product/${p.id}`)}
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 14, padding: "16px 20px",
                  display: "flex", alignItems: "center", gap: 16,
                  cursor: "pointer", transition: "all 0.15s",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(139,92,246,0.25)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.07)"; }}
              >
                {/* Score badge */}
                <div style={{
                  width: 48, height: 48, borderRadius: 12, flexShrink: 0,
                  background: `${scoreColor}12`, border: `1px solid ${scoreColor}30`,
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                }}>
                  <Icon size={14} color={scoreColor} />
                  <div style={{ color: scoreColor, fontSize: 12, fontWeight: 800 }}>{p.score}</div>
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: "#fff", fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                  <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, marginTop: 3 }}>
                    {p.buyCountry} → {p.sellCountry} · {p.market} · {p.date}
                  </div>
                </div>

                {/* Buy price */}
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>Bought</div>
                  <div style={{ color: "#fff", fontWeight: 600, fontSize: 13 }}>{p.buyPrice}</div>
                </div>

                {/* Profit */}
                <div style={{ textAlign: "right", flexShrink: 0, minWidth: 64 }}>
                  <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>Est. profit</div>
                  <div style={{ color: "#4ade80", fontWeight: 800, fontSize: 15 }}>${p.profit}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </ResellLayout>
  );
}
