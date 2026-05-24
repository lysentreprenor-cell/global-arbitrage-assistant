import React, { useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Info } from "lucide-react";
import { ProductForm } from "@/components/resell/ProductForm";
import type { Product } from "@/lib/resell/types";

export default function AddProduct() {
  const [, setLocation] = useLocation();
  const [loading, setLoading] = useState(false);

  const handleSubmit = (data: Partial<Product>) => {
    setLoading(true);
    // Simulate analysis — in production, call API
    setTimeout(() => {
      setLoading(false);
      // Navigate to the analysis of the first mock product as a demo
      setLocation("/resell/analysis/prod-001");
    }, 2000);
  };

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
          <div style={{ color: "#fff", fontSize: 17, fontWeight: 800 }}>Dodaj produkt</div>
          <div style={{ color: "rgba(255,255,255,0.40)", fontSize: 11 }}>Ręczne wprowadzenie danych</div>
        </div>
      </div>

      {/* Info box */}
      <div style={{ padding: "0 20px 20px" }}>
        <div style={{
          background: "rgba(139,92,246,0.07)", border: "1px solid rgba(139,92,246,0.20)",
          borderRadius: 12, padding: "12px 16px",
          display: "flex", gap: 10,
        }}>
          <Info size={14} style={{ color: "#8b5cf6", flexShrink: 0, marginTop: 1 }} />
          <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 11, lineHeight: 1.5 }}>
            Wprowadź dane produktu ręcznie lub wklej link do ogłoszenia (tylko do analizy ceny — nie kopiujemy zdjęć ani opisu). AI przeanalizuje rynek i oceni opłacalność.
          </div>
        </div>
      </div>

      {/* Form */}
      <div style={{ padding: "0 20px" }}>
        <div style={{
          background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 20, padding: "20px",
        }}>
          <ProductForm onSubmit={handleSubmit} loading={loading} />
        </div>
      </div>

      {/* Disclaimer */}
      <div style={{ padding: "16px 20px 0" }}>
        <p style={{ color: "rgba(255,255,255,0.25)", fontSize: 10, lineHeight: 1.6, textAlign: "center" }}>
          Aplikacja nie publikuje ofert automatycznie. Każda oferta wymaga ręcznego zatwierdzenia przez użytkownika. Nie naruszaj regulaminów Allegro, OLX, eBay, Amazon ani innych platform.
        </p>
      </div>
    </div>
  );
}
