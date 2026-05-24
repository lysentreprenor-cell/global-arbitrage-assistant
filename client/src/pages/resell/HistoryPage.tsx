import React from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Plus, History } from "lucide-react";
import { ProductHistory } from "@/components/resell/ProductHistory";
import { MOCK_PRODUCTS } from "@/lib/resell/mockData";

export default function HistoryPage() {
  const [, setLocation] = useLocation();

  return (
    <div style={{ minHeight: "100dvh", background: "linear-gradient(160deg, #0d0010 0%, #080014 40%, #0a0a14 100%)", fontFamily: "'Outfit','Inter',sans-serif" }}>
      {/* Nav */}
      <div style={{
        background: "rgba(0,0,0,0.45)", backdropFilter: "blur(20px)",
        borderBottom: "1px solid rgba(139,92,246,0.15)",
        padding: "0 24px", position: "sticky", top: 0, zIndex: 50,
      }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 60 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <button onClick={() => setLocation("/resell")} style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.55)", fontSize: 13, fontWeight: 600 }}>
              <ArrowLeft size={15} /> Powrót
            </button>
            <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.10)" }} />
            <History size={15} style={{ color: "#f5c842" }} />
            <span style={{ color: "#fff", fontWeight: 800, fontSize: 15 }}>Historia analiz</span>
          </div>
          <button
            onClick={() => setLocation("/resell/add")}
            style={{
              padding: "8px 18px", borderRadius: 99, border: "none", cursor: "pointer",
              background: "linear-gradient(135deg, #8b5cf6, #7c3aed)",
              color: "#fff", fontSize: 13, fontWeight: 700,
              display: "flex", alignItems: "center", gap: 6,
              boxShadow: "0 4px 12px rgba(139,92,246,0.35)",
            }}
          >
            <Plus size={14} /> Dodaj
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "40px 24px 80px" }}>
        <h1 style={{ color: "#fff", fontSize: 26, fontWeight: 900, marginBottom: 6 }}>Historia analiz</h1>
        <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 14, marginBottom: 32 }}>
          {MOCK_PRODUCTS.length} produktów · filtruj i sortuj według statusu, wyniku lub ceny
        </p>
        <ProductHistory products={MOCK_PRODUCTS} />
      </div>
    </div>
  );
}
