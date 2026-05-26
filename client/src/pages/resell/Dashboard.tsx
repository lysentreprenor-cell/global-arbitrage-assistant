import React from "react";
import { useLocation } from "wouter";
import { Package, Star, DollarSign, TrendingUp, BarChart2, Plus } from "lucide-react";
import { ResellLayout } from "@/components/resell/ResellLayout";

const MOCK_STATS = [
  { label: "Total Products", value: "5", sub: "0 analyzed today", icon: Package, color: "#60a5fa" },
  { label: "Average Score", value: "55.8/10", sub: "across portfolio", icon: Star, color: "#f5c842" },
  { label: "Potential Profit", value: "$895", sub: "estimated total", icon: DollarSign, color: "#4ade80" },
];

const MOCK_PRODUCTS = [
  { id: 1, name: "Levi's 501 Jeans W32", score: 72, profit: "$48", status: "profitable", market: "eBay USA" },
  { id: 2, name: "Nokia 3310 (2017)", score: 41, profit: "$12", status: "low", market: "Amazon DE" },
  { id: 3, name: "Baltic Amber Pendant", score: 88, profit: "$210", status: "profitable", market: "Etsy USA" },
  { id: 4, name: "Adidas Gazelle PL", score: 61, profit: "$35", status: "moderate", market: "eBay UK" },
  { id: 5, name: "Porcelain Figurine set", score: 34, profit: "$18", status: "low", market: "eBay USA" },
];

export default function Dashboard() {
  const [, setLocation] = useLocation();

  return (
    <ResellLayout>
      <div style={{ padding: "36px 32px", maxWidth: 900 }}>
        {/* Header */}
        <div style={{ marginBottom: 32, display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ color: "#fff", fontSize: 28, fontWeight: 900, margin: 0, letterSpacing: -0.5 }}>
              Intelligent Dashboard
            </h1>
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 14, marginTop: 6 }}>
              Real-time cross-border arbitrage metrics.
            </p>
          </div>
          <button
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

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 36 }}>
          {MOCK_STATS.map(s => (
            <div key={s.label} style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 16, padding: "20px 22px",
            }}>
              <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, marginBottom: 8 }}>
                {s.label.toUpperCase()}
              </div>
              <div style={{ color: s.color, fontSize: 28, fontWeight: 900, letterSpacing: -0.5 }}>{s.value}</div>
              <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 11, marginTop: 4 }}>{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Recent products */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>
              RECENT PRODUCTS
            </div>
            <button
              onClick={() => setLocation("/resell/products")}
              style={{ color: "#8b5cf6", fontSize: 12, fontWeight: 700, background: "none", border: "none", cursor: "pointer" }}
            >
              View all →
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {MOCK_PRODUCTS.map(p => {
              const scoreColor = p.score >= 70 ? "#4ade80" : p.score >= 50 ? "#f5c842" : "#f87171";
              return (
                <div
                  key={p.id}
                  onClick={() => setLocation(`/resell/product/${p.id}`)}
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.07)",
                    borderRadius: 12, padding: "14px 18px",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    cursor: "pointer", transition: "all 0.15s",
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)"; }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                      background: `${scoreColor}15`, border: `1px solid ${scoreColor}30`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 12, fontWeight: 800, color: scoreColor,
                    }}>
                      {p.score}
                    </div>
                    <div>
                      <div style={{ color: "#fff", fontWeight: 600, fontSize: 13 }}>{p.name}</div>
                      <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, marginTop: 2 }}>{p.market}</div>
                    </div>
                  </div>
                  <div style={{ color: "#4ade80", fontWeight: 700, fontSize: 14 }}>{p.profit}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </ResellLayout>
  );
}
