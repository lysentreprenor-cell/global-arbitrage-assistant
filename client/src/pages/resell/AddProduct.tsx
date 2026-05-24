import React, { useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Info, TrendingUp } from "lucide-react";
import { ProductForm } from "@/components/resell/ProductForm";
import type { Product } from "@/lib/resell/types";

function ResellNav() {
  const [, setLocation] = useLocation();
  return (
    <div style={{
      background: "rgba(0,0,0,0.45)", backdropFilter: "blur(20px)",
      borderBottom: "1px solid rgba(139,92,246,0.15)",
      padding: "0 24px", position: "sticky", top: 0, zIndex: 50,
    }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", alignItems: "center", height: 60, gap: 14 }}>
        <button
          onClick={() => setLocation("/resell")}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            background: "none", border: "none", cursor: "pointer",
            color: "rgba(255,255,255,0.55)", fontSize: 13, fontWeight: 600,
          }}
        >
          <ArrowLeft size={15} /> Powrót
        </button>
        <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.10)" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 9,
            background: "linear-gradient(135deg, #8b5cf6, #7c3aed)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <TrendingUp size={14} color="#fff" />
          </div>
          <span style={{ color: "#fff", fontWeight: 800, fontSize: 15 }}>Dodaj produkt</span>
        </div>
      </div>
    </div>
  );
}

export default function AddProduct() {
  const [, setLocation] = useLocation();
  const [loading, setLoading] = useState(false);

  const handleSubmit = (_data: Partial<Product>) => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setLocation("/resell/analysis/prod-001");
    }, 2000);
  };

  return (
    <div style={{ minHeight: "100dvh", background: "linear-gradient(160deg, #0d0010 0%, #080014 40%, #0a0a14 100%)", fontFamily: "'Outfit','Inter',sans-serif" }}>
      <ResellNav />
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "40px 24px 100px" }}>
        <h1 style={{ color: "#fff", fontSize: 26, fontWeight: 900, marginBottom: 6 }}>Dodaj produkt do analizy</h1>
        <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 14, marginBottom: 32 }}>
          Wprowadź dane ręcznie. Aplikacja przeanalizuje rynek i oceni opłacalność.
        </p>

        <div style={{
          background: "rgba(139,92,246,0.07)", border: "1px solid rgba(139,92,246,0.20)",
          borderRadius: 14, padding: "14px 18px", marginBottom: 24,
          display: "flex", gap: 10,
        }}>
          <Info size={15} style={{ color: "#8b5cf6", flexShrink: 0, marginTop: 1 }} />
          <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 12, lineHeight: 1.6, margin: 0 }}>
            Jeśli wklejasz link — używamy go tylko do analizy ceny. <strong style={{ color: "#a78bfa" }}>Nie kopiujemy zdjęć ani opisów</strong> z cudzych ogłoszeń. Musisz dodać własne zdjęcia i stworzyć własny opis oferty.
          </p>
        </div>

        <div style={{
          background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 20, padding: "28px",
        }}>
          <ProductForm onSubmit={handleSubmit} loading={loading} />
        </div>

        <p style={{ color: "rgba(255,255,255,0.20)", fontSize: 11, lineHeight: 1.7, textAlign: "center", marginTop: 20 }}>
          Aplikacja nie publikuje ofert automatycznie. Każda oferta jest szkicem wymagającym ręcznej akceptacji.
          Przestrzegaj regulaminów Allegro, OLX, eBay, Amazon i innych platform.
        </p>
      </div>
    </div>
  );
}
