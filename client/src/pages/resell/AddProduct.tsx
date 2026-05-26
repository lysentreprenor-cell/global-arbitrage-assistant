import React, { useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Package } from "lucide-react";
import { ResellLayout } from "@/components/resell/ResellLayout";

const COUNTRIES = ["Poland", "USA", "Germany", "UK", "France", "Japan", "China", "Netherlands"];
const CATEGORIES = ["Electronics", "Clothing", "Jewelry", "Collectibles", "Sports", "Home & Garden", "Books", "Other"];

export default function AddProduct() {
  const [, setLocation] = useLocation();
  const [form, setForm] = useState({
    name: "", price: "", currency: "PLN",
    buyCountry: "Poland", sellCountry: "USA",
    category: "Electronics", condition: "new", quantity: "1", url: "",
  });

  const inputStyle: React.CSSProperties = {
    width: "100%", background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(139,92,246,0.25)", borderRadius: 10,
    padding: "11px 14px", color: "#fff", fontSize: 14,
    outline: "none", boxSizing: "border-box", fontFamily: "inherit",
  };

  const labelStyle: React.CSSProperties = {
    color: "rgba(255,255,255,0.45)", fontSize: 11,
    fontWeight: 700, letterSpacing: 0.5, marginBottom: 6, display: "block",
  };

  return (
    <ResellLayout>
      <div style={{ padding: "36px 32px", maxWidth: 680 }}>
        <button
          onClick={() => setLocation("/resell")}
          style={{ display: "flex", alignItems: "center", gap: 6, color: "rgba(255,255,255,0.45)", background: "none", border: "none", cursor: "pointer", fontSize: 13, marginBottom: 28 }}
        >
          <ArrowLeft size={15} /> Back to Dashboard
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 32 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: "linear-gradient(135deg, #8b5cf6, #7c3aed)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Package size={20} color="#fff" />
          </div>
          <div>
            <h1 style={{ color: "#fff", fontSize: 22, fontWeight: 900, margin: 0 }}>Add Product</h1>
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, margin: 0 }}>Analyze cross-border arbitrage potential</p>
          </div>
        </div>

        <div style={{
          background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 18, padding: 28, display: "flex", flexDirection: "column", gap: 20,
        }}>
          <div>
            <label style={labelStyle}>PRODUCT NAME</label>
            <input style={inputStyle} placeholder="e.g. Levi's 501 Jeans W32, Baltic Amber..." value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 12 }}>
            <div>
              <label style={labelStyle}>PURCHASE PRICE</label>
              <input type="number" style={inputStyle} placeholder="0.00" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>CURRENCY</label>
              <select style={{ ...inputStyle, cursor: "pointer" } as React.CSSProperties} value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}>
                {["PLN", "EUR", "USD", "GBP"].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>BUY IN</label>
              <select style={{ ...inputStyle, cursor: "pointer" } as React.CSSProperties} value={form.buyCountry} onChange={e => setForm(f => ({ ...f, buyCountry: e.target.value }))}>
                {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>SELL IN</label>
              <select style={{ ...inputStyle, cursor: "pointer" } as React.CSSProperties} value={form.sellCountry} onChange={e => setForm(f => ({ ...f, sellCountry: e.target.value }))}>
                {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 80px", gap: 12 }}>
            <div>
              <label style={labelStyle}>CATEGORY</label>
              <select style={{ ...inputStyle, cursor: "pointer" } as React.CSSProperties} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>CONDITION</label>
              <select style={{ ...inputStyle, cursor: "pointer" } as React.CSSProperties} value={form.condition} onChange={e => setForm(f => ({ ...f, condition: e.target.value }))}>
                {["new", "like_new", "good", "fair", "poor"].map(c => <option key={c} value={c}>{c.replace("_", " ")}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>QTY</label>
              <input type="number" style={inputStyle} value={form.quantity} min="1" onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} />
            </div>
          </div>

          <div>
            <label style={labelStyle}>LISTING URL (optional — price analysis only)</label>
            <input style={inputStyle} placeholder="https://allegro.pl/... or olx.pl/..." value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} />
            <div style={{ color: "rgba(139,92,246,0.6)", fontSize: 10, marginTop: 4 }}>
              ⚠ We only analyze price — no images or descriptions are copied
            </div>
          </div>

          <button
            onClick={() => setLocation("/resell/product/1")}
            disabled={!form.name}
            style={{
              padding: "13px 0", borderRadius: 12, border: "none", cursor: form.name ? "pointer" : "not-allowed",
              background: form.name ? "linear-gradient(135deg, #8b5cf6, #7c3aed)" : "rgba(255,255,255,0.08)",
              color: form.name ? "#fff" : "rgba(255,255,255,0.3)",
              fontWeight: 800, fontSize: 15, width: "100%",
              boxShadow: form.name ? "0 6px 20px rgba(139,92,246,0.35)" : "none",
              transition: "all 0.2s",
            }}
          >
            Analyze with AI
          </button>
        </div>
      </div>
    </ResellLayout>
  );
}
