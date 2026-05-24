import React from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Plus } from "lucide-react";
import { ProductHistory } from "@/components/resell/ProductHistory";
import { MOCK_PRODUCTS } from "@/lib/resell/mockData";

export default function HistoryPage() {
  const [, setLocation] = useLocation();

  return (
    <div style={{
      minHeight: "100dvh",
      background: "linear-gradient(160deg, #0d0010 0%, #080014 40%, #0a0a14 100%)",
      paddingBottom: 100,
    }}>
      {/* Header */}
      <div style={{ padding: "20px 20px 0", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
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
            <div style={{ color: "#fff", fontSize: 17, fontWeight: 800 }}>Historia analiz</div>
            <div style={{ color: "rgba(255,255,255,0.40)", fontSize: 11 }}>{MOCK_PRODUCTS.length} produktów</div>
          </div>
        </div>
        <button
          onClick={() => setLocation("/resell/add")}
          style={{
            width: 36, height: 36, borderRadius: 12, border: "none",
            background: "linear-gradient(135deg, #8b5cf6, #7c3aed)",
            cursor: "pointer", color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 12px rgba(139,92,246,0.40)",
          }}
        >
          <Plus size={16} />
        </button>
      </div>

      <div style={{ padding: "0 20px" }}>
        <ProductHistory products={MOCK_PRODUCTS} />
      </div>
    </div>
  );
}
