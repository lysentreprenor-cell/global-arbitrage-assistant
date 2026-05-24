import React from "react";
import { useLocation } from "wouter";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { ProfitCalculator } from "@/components/resell/ProfitCalculator";

export default function CalculatorPage() {
  const [, setLocation] = useLocation();

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
        <div>
          <div style={{ color: "#fff", fontSize: 17, fontWeight: 800 }}>Kalkulator zysku</div>
          <div style={{ color: "rgba(255,255,255,0.40)", fontSize: 11 }}>Automatyczne obliczanie marży</div>
        </div>
      </div>

      <div style={{ padding: "0 20px" }}>
        <div style={{
          background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 20, padding: "20px", marginBottom: 16,
        }}>
          <ProfitCalculator initialBuyPrice={280} initialBuyCurrency="PLN" initialSellPrice={320} />
        </div>

        <button
          onClick={() => setLocation("/resell/compliance")}
          style={{
            width: "100%", padding: "13px 0", borderRadius: 14, border: "none", cursor: "pointer",
            background: "linear-gradient(135deg, #8b5cf6 0%, #7c3aed 50%, #f5c842 100%)",
            color: "#fff", fontWeight: 800, fontSize: 14,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            boxShadow: "0 6px 20px rgba(139,92,246,0.35)",
          }}
        >
          Dalej: Sprawdź zgodność <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
