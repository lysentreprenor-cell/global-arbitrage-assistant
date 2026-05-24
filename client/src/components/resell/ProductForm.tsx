import React, { useState } from "react";
import { Upload, Link, Plus } from "lucide-react";
import type { Product, Currency, ProductCondition } from "@/lib/resell/types";
import { CATEGORIES, COUNTRIES } from "@/lib/resell/mockData";

const CURRENCIES: Currency[] = ["PLN", "USD", "EUR", "NOK", "GBP"];
const CONDITIONS: { value: ProductCondition; label: string }[] = [
  { value: "new", label: "Nowy" },
  { value: "like_new", label: "Jak nowy" },
  { value: "good", label: "Dobry" },
  { value: "fair", label: "Przeciętny" },
  { value: "poor", label: "Zły" },
];

const INPUT_STYLE: React.CSSProperties = {
  width: "100%", background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: 12, padding: "10px 14px",
  color: "#fff", fontSize: 14, outline: "none",
  boxSizing: "border-box",
};

const LABEL_STYLE: React.CSSProperties = {
  color: "rgba(255,255,255,0.55)", fontSize: 11,
  fontWeight: 600, letterSpacing: 0.5, marginBottom: 5, display: "block",
};

interface Props {
  onSubmit: (data: Partial<Product>) => void;
  loading?: boolean;
}

export function ProductForm({ onSubmit, loading }: Props) {
  const [form, setForm] = useState<Partial<Product>>({
    name: "", category: CATEGORIES[0], buyCountry: "Poland", sellCountry: "USA",
    buyPrice: 0, buyCurrency: "PLN", condition: "good", quantity: 1,
    sourceUrl: "", images: [],
  });

  const set = (key: keyof Product, val: unknown) =>
    setForm(prev => ({ ...prev, [key]: val }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Product Name */}
      <div>
        <label style={LABEL_STYLE}>NAZWA PRODUKTU *</label>
        <input
          style={INPUT_STYLE} required
          placeholder="np. Levi's 501 Jeans W32 L32"
          value={form.name ?? ""}
          onChange={e => set("name", e.target.value)}
        />
      </div>

      {/* Source URL */}
      <div>
        <label style={LABEL_STYLE}>LINK ŹRÓDŁOWY (opcjonalnie)</label>
        <div style={{ position: "relative" }}>
          <Link size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.35)" }} />
          <input
            style={{ ...INPUT_STYLE, paddingLeft: 34 }}
            placeholder="https://allegro.pl/..."
            value={form.sourceUrl ?? ""}
            onChange={e => set("sourceUrl", e.target.value)}
          />
        </div>
        <div style={{ color: "rgba(139,92,246,0.8)", fontSize: 10, marginTop: 4 }}>
          ⚠ Nie kopiujemy zdjęć ani opisów — tylko analizujemy dane
        </div>
      </div>

      {/* Category */}
      <div>
        <label style={LABEL_STYLE}>KATEGORIA *</label>
        <select
          style={INPUT_STYLE as React.CSSProperties}
          value={form.category ?? ""}
          onChange={e => set("category", e.target.value)}
        >
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Buy / Sell Country */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <label style={LABEL_STYLE}>KRAJ ZAKUPU *</label>
          <select style={INPUT_STYLE as React.CSSProperties} value={form.buyCountry ?? ""} onChange={e => set("buyCountry", e.target.value)}>
            {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label style={LABEL_STYLE}>KRAJ SPRZEDAŻY *</label>
          <select style={INPUT_STYLE as React.CSSProperties} value={form.sellCountry ?? ""} onChange={e => set("sellCountry", e.target.value)}>
            {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* Price + Currency */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10 }}>
        <div>
          <label style={LABEL_STYLE}>CENA ZAKUPU *</label>
          <input
            type="number" min={0} step="0.01" style={INPUT_STYLE} required
            placeholder="0.00"
            value={form.buyPrice ?? ""}
            onChange={e => set("buyPrice", parseFloat(e.target.value) || 0)}
          />
        </div>
        <div>
          <label style={LABEL_STYLE}>WALUTA</label>
          <select style={{ ...INPUT_STYLE, width: 90 } as React.CSSProperties} value={form.buyCurrency ?? "PLN"} onChange={e => set("buyCurrency", e.target.value as Currency)}>
            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* Condition + Quantity */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <label style={LABEL_STYLE}>STAN PRODUKTU</label>
          <select style={INPUT_STYLE as React.CSSProperties} value={form.condition ?? "good"} onChange={e => set("condition", e.target.value as ProductCondition)}>
            {CONDITIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <div>
          <label style={LABEL_STYLE}>DOSTĘPNA ILOŚĆ</label>
          <input
            type="number" min={1} style={INPUT_STYLE}
            value={form.quantity ?? 1}
            onChange={e => set("quantity", parseInt(e.target.value) || 1)}
          />
        </div>
      </div>

      {/* Image upload note */}
      <div style={{
        background: "rgba(139,92,246,0.08)", border: "1px dashed rgba(139,92,246,0.30)",
        borderRadius: 12, padding: "14px 16px",
        display: "flex", alignItems: "center", gap: 12,
      }}>
        <Upload size={18} style={{ color: "#8b5cf6", flexShrink: 0 }} />
        <div>
          <div style={{ color: "#a78bfa", fontSize: 13, fontWeight: 600 }}>Dodaj własne zdjęcia</div>
          <div style={{ color: "rgba(255,255,255,0.40)", fontSize: 11, marginTop: 2 }}>
            Wymagane własne zdjęcia — nie kopiuj zdjęć z ogłoszeń
          </div>
        </div>
      </div>

      {/* Submit */}
      <button
        type="submit" disabled={loading}
        style={{
          padding: "13px 0", borderRadius: 14, border: "none", cursor: loading ? "not-allowed" : "pointer",
          background: loading
            ? "rgba(139,92,246,0.3)"
            : "linear-gradient(135deg, #8b5cf6 0%, #7c3aed 50%, #f5c842 100%)",
          color: "#fff", fontWeight: 800, fontSize: 14, letterSpacing: 0.5,
          boxShadow: loading ? "none" : "0 6px 20px rgba(139,92,246,0.40)",
          transition: "opacity 0.15s",
        }}
      >
        {loading ? "Analizowanie..." : "Analizuj produkt →"}
      </button>
    </form>
  );
}
