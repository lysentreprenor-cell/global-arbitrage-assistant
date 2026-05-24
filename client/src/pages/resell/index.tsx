import React, { useState } from "react";
import { useLocation } from "wouter";
import {
  Search, BarChart2, Calculator, FileText, TrendingUp,
  AlertTriangle, Sparkles, Globe, Shield,
  Plus, ChevronRight, Link as LinkIcon, Package,
  ArrowRight, Zap,
} from "lucide-react";
import { DashboardCard } from "@/components/resell/DashboardCard";
import { RiskBadge } from "@/components/resell/RiskBadge";
import { MOCK_PRODUCTS, CATEGORIES, COUNTRIES } from "@/lib/resell/mockData";
import { formatCurrency, getProfitabilityLabel } from "@/lib/resell/calculations";

function FindOpportunityCard({ totalProducts }: { totalProducts: number }) {
  const [, setLocation] = useLocation();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [buyCountry, setBuyCountry] = useState("Poland");
  const [sellCountry, setSellCountry] = useState("USA");
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"quick" | "url">("quick");

  const handleAnalyze = () => {
    if (!name && !url) return;
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setLocation("/resell/analysis/prod-001");
    }, 1800);
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", background: "rgba(0,0,0,0.30)",
    border: "1px solid rgba(139,92,246,0.25)",
    borderRadius: 12, padding: "11px 14px",
    color: "#fff", fontSize: 14, outline: "none",
    boxSizing: "border-box", fontFamily: "inherit",
  };

  return (
    <div style={{
      background: "linear-gradient(135deg, rgba(88,28,135,0.55) 0%, rgba(55,15,90,0.80) 45%, rgba(30,5,55,0.95) 100%)",
      border: "1px solid rgba(139,92,246,0.40)",
      borderRadius: 24, padding: "28px 28px 24px",
      marginBottom: 24, position: "relative", overflow: "hidden",
      boxShadow: "0 12px 48px rgba(0,0,0,0.50), inset 0 1px 0 rgba(255,255,255,0.08)",
    }}>
      {/* glint top */}
      <div style={{
        position: "absolute", top: 0, left: "8%", right: "8%", height: 1,
        background: "linear-gradient(90deg, transparent, rgba(167,139,250,0.60), rgba(245,200,66,0.40), transparent)",
      }} />
      {/* glow blob */}
      <div style={{
        position: "absolute", top: -60, right: -60, width: 200, height: 200,
        borderRadius: "50%", background: "rgba(139,92,246,0.12)",
        filter: "blur(40px)", pointerEvents: "none",
      }} />

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 16, flexShrink: 0,
            background: "linear-gradient(135deg, #8b5cf6, #7c3aed)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 6px 20px rgba(139,92,246,0.50)",
          }}>
            <Search size={22} color="#fff" />
          </div>
          <div>
            <div style={{ color: "#fff", fontSize: 20, fontWeight: 900, letterSpacing: -0.3 }}>
              Znajdź okazję
            </div>
            <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 12, marginTop: 1 }}>
              {totalProducts} produktów przeanalizowanych · AI oceni w 2 sekundy
            </div>
          </div>
        </div>
        <div style={{
          background: "rgba(245,200,66,0.12)", border: "1px solid rgba(245,200,66,0.25)",
          borderRadius: 99, padding: "4px 12px",
          color: "#f5c842", fontSize: 11, fontWeight: 800,
          display: "flex", alignItems: "center", gap: 5,
        }}>
          <Zap size={10} /> AI ANALIZA
        </div>
      </div>

      {/* Mode toggle */}
      <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
        {[
          { key: "quick" as const, label: "Ręcznie", icon: <Package size={13} /> },
          { key: "url" as const, label: "Z linku", icon: <LinkIcon size={13} /> },
        ].map(m => (
          <button key={m.key} onClick={() => setMode(m.key)} style={{
            padding: "7px 16px", borderRadius: 99, border: "none", cursor: "pointer",
            background: mode === m.key
              ? "linear-gradient(135deg, #8b5cf6, #7c3aed)"
              : "rgba(255,255,255,0.07)",
            color: mode === m.key ? "#fff" : "rgba(255,255,255,0.45)",
            fontSize: 12, fontWeight: 700,
            display: "flex", alignItems: "center", gap: 5,
            boxShadow: mode === m.key ? "0 4px 12px rgba(139,92,246,0.35)" : "none",
            transition: "all 0.15s",
          }}>
            {m.icon} {m.label}
          </button>
        ))}
      </div>

      {mode === "url" ? (
        /* URL mode */
        <div style={{ marginBottom: 16 }}>
          <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, marginBottom: 6 }}>
            LINK DO OGŁOSZENIA (tylko analiza ceny)
          </div>
          <input
            style={inputStyle}
            placeholder="https://allegro.pl/... lub olx.pl/..."
            value={url}
            onChange={e => setUrl(e.target.value)}
          />
          <div style={{ color: "rgba(139,92,246,0.75)", fontSize: 10, marginTop: 5 }}>
            ⚠ Nie kopiujemy zdjęć ani opisów — tylko analizujemy cenę
          </div>
        </div>
      ) : (
        /* Quick form */
        <div style={{ display: "grid", gap: 12, marginBottom: 16 }}>
          <div>
            <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, marginBottom: 6 }}>
              NAZWA PRODUKTU
            </div>
            <input
              style={inputStyle}
              placeholder="np. Levi's 501 jeans W32, Bursztyn bałtycki, Nokia 3310..."
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleAnalyze()}
            />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <div>
              <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, marginBottom: 6 }}>CENA ZAKUPU</div>
              <input
                type="number" style={inputStyle} placeholder="0.00"
                value={price} onChange={e => setPrice(e.target.value)}
              />
            </div>
            <div>
              <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, marginBottom: 6 }}>KUPUJESZ W</div>
              <select
                style={{ ...inputStyle, cursor: "pointer" } as React.CSSProperties}
                value={buyCountry} onChange={e => setBuyCountry(e.target.value)}
              >
                {COUNTRIES.slice(0, 8).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, marginBottom: 6 }}>SPRZEDAJESZ W</div>
              <select
                style={{ ...inputStyle, cursor: "pointer" } as React.CSSProperties}
                value={sellCountry} onChange={e => setSellCountry(e.target.value)}
              >
                {COUNTRIES.slice(0, 8).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Route preview */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8, marginBottom: 18,
        background: "rgba(0,0,0,0.20)", borderRadius: 10, padding: "8px 14px",
      }}>
        <span style={{ color: "rgba(255,255,255,0.40)", fontSize: 11 }}>Ścieżka:</span>
        {[buyCountry, "Analiza AI", "Kalkulator", "Oferta"].map((step, i) => (
          <React.Fragment key={step}>
            {i > 0 && <ArrowRight size={10} style={{ color: "rgba(139,92,246,0.50)" }} />}
            <span style={{ color: i === 0 ? "#f5c842" : i === 3 ? "#4ade80" : "rgba(255,255,255,0.55)", fontSize: 11, fontWeight: i === 0 || i === 3 ? 700 : 400 }}>
              {step}
            </span>
          </React.Fragment>
        ))}
        <ArrowRight size={10} style={{ color: "rgba(139,92,246,0.50)" }} />
        <span style={{ color: "#60a5fa", fontSize: 11, fontWeight: 700 }}>{sellCountry}</span>
      </div>

      {/* CTA */}
      <div style={{ display: "flex", gap: 10 }}>
        <button
          onClick={handleAnalyze}
          disabled={loading || (!name && !url)}
          style={{
            flex: 1, padding: "14px 0", borderRadius: 14, border: "none",
            cursor: (loading || (!name && !url)) ? "not-allowed" : "pointer",
            background: (loading || (!name && !url))
              ? "rgba(139,92,246,0.25)"
              : "linear-gradient(135deg, #8b5cf6 0%, #7c3aed 60%, #6d28d9 100%)",
            color: "#fff", fontWeight: 800, fontSize: 15,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            boxShadow: (loading || (!name && !url)) ? "none" : "0 8px 24px rgba(139,92,246,0.45)",
            transition: "all 0.2s",
          }}
        >
          {loading ? (
            <>
              <div style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", animation: "spin 0.8s linear infinite" }} />
              Analizuję rynek...
            </>
          ) : (
            <><Sparkles size={16} /> Analizuj okazję</>
          )}
        </button>
        <button
          onClick={() => setLocation("/resell/add")}
          style={{
            padding: "14px 18px", borderRadius: 14, border: "1px solid rgba(139,92,246,0.30)",
            cursor: "pointer", background: "rgba(139,92,246,0.10)",
            color: "#a78bfa", fontSize: 13, fontWeight: 700,
            display: "flex", alignItems: "center", gap: 6,
          }}
        >
          <Plus size={14} /> Pełny formularz
        </button>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function StatCard({ label, value, sub, color, icon }: {
  label: string; value: string; sub?: string; color: string; icon?: React.ReactNode;
}) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 16, padding: "16px 18px", flex: 1,
      display: "flex", flexDirection: "column", gap: 4,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        {icon && <span style={{ opacity: 0.6 }}>{icon}</span>}
        <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 10, fontWeight: 700, letterSpacing: 0.6 }}>{label}</span>
      </div>
      <div style={{ color, fontSize: 22, fontWeight: 900, letterSpacing: -0.5 }}>{value}</div>
      {sub && <div style={{ color: "rgba(255,255,255,0.30)", fontSize: 11 }}>{sub}</div>}
    </div>
  );
}

export default function ResellDashboard() {
  const [, setLocation] = useLocation();

  const totalProducts = MOCK_PRODUCTS.length;
  const profitable = MOCK_PRODUCTS.filter(p => p.status === "profitable" || p.status === "draft_ready");
  const bestProduct = MOCK_PRODUCTS.reduce((a, b) => a.score > b.score ? a : b);
  const avgScore = Math.round(MOCK_PRODUCTS.reduce((s, p) => s + p.score, 0) / MOCK_PRODUCTS.length);

  return (
    <div style={{
      minHeight: "100dvh",
      background: "linear-gradient(160deg, #0d0010 0%, #080014 40%, #0a0a14 100%)",
      fontFamily: "'Outfit', 'Inter', sans-serif",
    }}>
      {/* ── Topbar ── */}
      <div style={{
        background: "rgba(0,0,0,0.45)",
        backdropFilter: "blur(20px)",
        borderBottom: "1px solid rgba(139,92,246,0.15)",
        padding: "0 24px",
        position: "sticky", top: 0, zIndex: 50,
      }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 60 }}>
          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 11,
              background: "linear-gradient(135deg, #8b5cf6 0%, #7c3aed 50%, #f5c842 100%)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 4px 14px rgba(139,92,246,0.45)",
            }}>
              <TrendingUp size={18} color="#fff" />
            </div>
            <div>
              <span style={{ color: "#fff", fontWeight: 900, fontSize: 16, letterSpacing: -0.3 }}>
                Global<span style={{ color: "#a78bfa" }}>Resell</span>
              </span>
              <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 9, letterSpacing: 0.8 }}>ASSISTANT</div>
            </div>
          </div>

          {/* Nav links */}
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            {[
              { label: "Dashboard", href: "/resell" },
              { label: "Dodaj produkt", href: "/resell/add" },
              { label: "Kalkulator", href: "/resell/calculator" },
              { label: "Historia", href: "/resell/history" },
            ].map(item => (
              <button
                key={item.href}
                onClick={() => setLocation(item.href)}
                style={{
                  padding: "6px 14px", borderRadius: 99, border: "none", cursor: "pointer",
                  background: "transparent",
                  color: "rgba(255,255,255,0.55)", fontSize: 13, fontWeight: 600,
                  transition: "all 0.15s",
                  display: window.innerWidth < 600 ? "none" : "block",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#fff"; (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.55)"; (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                {item.label}
              </button>
            ))}
            <button
              onClick={() => setLocation("/resell/add")}
              style={{
                padding: "8px 18px", borderRadius: 99, border: "none", cursor: "pointer",
                background: "linear-gradient(135deg, #8b5cf6, #7c3aed)",
                color: "#fff", fontSize: 13, fontWeight: 700,
                display: "flex", alignItems: "center", gap: 6,
                boxShadow: "0 4px 14px rgba(139,92,246,0.35)",
                marginLeft: 8,
              }}
            >
              <Plus size={14} /> Nowy produkt
            </button>
          </div>
        </div>
      </div>

      {/* ── Hero ── */}
      <div style={{
        maxWidth: 1100, margin: "0 auto", padding: "48px 24px 32px",
      }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          {/* Legal badge */}
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.20)",
            borderRadius: 99, padding: "5px 14px", marginBottom: 20,
          }}>
            <Shield size={11} style={{ color: "#4ade80" }} />
            <span style={{ color: "#86efac", fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>
              Legalny asystent · Nie kopiuje ogłoszeń · Wymaga zatwierdzenia
            </span>
          </div>

          <h1 style={{
            fontSize: "clamp(28px, 6vw, 52px)", fontWeight: 900,
            color: "#fff", margin: "0 0 14px", lineHeight: 1.1, letterSpacing: -1,
          }}>
            Znajdź okazje{" "}
            <span style={{
              background: "linear-gradient(90deg, #8b5cf6, #a78bfa, #f5c842)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            }}>
              arbitrażu cenowego
            </span>
          </h1>
          <p style={{
            color: "rgba(255,255,255,0.50)", fontSize: "clamp(14px, 2vw, 17px)",
            maxWidth: 580, margin: "0 auto 32px", lineHeight: 1.6,
          }}>
            Polska → USA · Europa → Świat · Oblicz zysk, sprawdź zgodność prawną i stwórz własną ofertę
          </p>

          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <button
              onClick={() => setLocation("/resell/add")}
              style={{
                padding: "14px 28px", borderRadius: 14, border: "none", cursor: "pointer",
                background: "linear-gradient(135deg, #8b5cf6 0%, #7c3aed 60%, #6d28d9 100%)",
                color: "#fff", fontWeight: 800, fontSize: 15,
                boxShadow: "0 8px 24px rgba(139,92,246,0.45)",
                display: "flex", alignItems: "center", gap: 8,
              }}
            >
              <Search size={16} /> Znajdź okazję
            </button>
            <button
              onClick={() => setLocation("/resell/calculator")}
              style={{
                padding: "14px 28px", borderRadius: 14, cursor: "pointer",
                border: "1px solid rgba(139,92,246,0.30)",
                background: "rgba(139,92,246,0.10)",
                color: "#a78bfa", fontWeight: 700, fontSize: 15,
                display: "flex", alignItems: "center", gap: 8,
              }}
            >
              <Calculator size={16} /> Oblicz zysk
            </button>
          </div>
        </div>

        {/* ── Stats ── */}
        <div style={{ display: "flex", gap: 12, marginBottom: 40, flexWrap: "wrap" }}>
          <StatCard label="ANALIZOWANE" value={String(totalProducts)} sub="produkty w bazie" color="#a78bfa" icon={<BarChart2 size={12} color="#a78bfa" />} />
          <StatCard label="OPŁACALNE" value={String(profitable.length)} sub="gotowe do sprzedaży" color="#4ade80" icon={<TrendingUp size={12} color="#4ade80" />} />
          <StatCard label="ŚREDNI WYNIK" value={`${avgScore}/100`} sub="bieżące portfolio" color="#f5c842" icon={<Sparkles size={12} color="#f5c842" />} />
          <StatCard label="RYNKI" value="4" sub="eBay, Amazon, Etsy+" color="#60a5fa" icon={<Globe size={12} color="#60a5fa" />} />
        </div>

        {/* ── Best opportunity ── */}
        {bestProduct && (
          <div
            onClick={() => setLocation(`/resell/analysis/${bestProduct.id}`)}
            style={{
              background: "linear-gradient(135deg, rgba(139,92,246,0.18) 0%, rgba(245,200,66,0.08) 100%)",
              border: "1px solid rgba(139,92,246,0.35)", borderRadius: 20,
              padding: "20px 24px", marginBottom: 40, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              gap: 16, flexWrap: "wrap",
              boxShadow: "0 8px 32px rgba(0,0,0,0.30)",
              position: "relative", overflow: "hidden",
            }}
          >
            <div style={{
              position: "absolute", top: 0, left: "10%", right: "10%", height: 1,
              background: "linear-gradient(90deg, transparent, rgba(245,200,66,0.45), transparent)",
            }} />
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{
                background: "rgba(245,200,66,0.12)", border: "1px solid rgba(245,200,66,0.25)",
                borderRadius: 12, padding: "8px 12px", display: "flex", alignItems: "center", gap: 6,
              }}>
                <Sparkles size={14} style={{ color: "#f5c842" }} />
                <span style={{ color: "#fde68a", fontSize: 11, fontWeight: 800, letterSpacing: 0.5 }}>NAJLEPSZA OKAZJA</span>
              </div>
              <div>
                <div style={{ color: "#fff", fontWeight: 800, fontSize: 16 }}>{bestProduct.name}</div>
                <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 12, marginTop: 2 }}>
                  {bestProduct.category} · {bestProduct.buyCountry} → {bestProduct.sellCountry}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <RiskBadge score={bestProduct.score} size="md" />
              <div style={{ textAlign: "right" }}>
                <div style={{ color: "#f5c842", fontWeight: 900, fontSize: 18 }}>
                  {formatCurrency(bestProduct.buyPrice, bestProduct.buyCurrency)}
                </div>
                <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11 }}>cena zakupu</div>
              </div>
              <ChevronRight size={20} style={{ color: "rgba(255,255,255,0.30)" }} />
            </div>
          </div>
        )}

        {/* ── CARD 1: Znajdź okazję — full-width hero ── */}
        <FindOpportunityCard totalProducts={totalProducts} />

        {/* ── Cards 2-4 ── */}
        <div style={{ marginBottom: 40 }}>
          <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, fontWeight: 700, letterSpacing: 1, marginBottom: 16 }}>
            WIĘCEJ NARZĘDZI
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
            <DashboardCard
              title="Porównaj rynek"
              description="Ceny eBay, Amazon, Etsy. Min/śr/max + popularność i konkurencja."
              icon={<BarChart2 size={22} color="#f5c842" />}
              href="/resell/history"
              gradient="linear-gradient(160deg, rgba(120,80,0,0.72) 0%, rgba(60,36,0,0.90) 100%)"
              accentColor="#f5c842"
              stats={[{ label: "rynki", value: "4" }]}
            />
            <DashboardCard
              title="Oblicz zysk"
              description="Kalkulator z cłem, podatkiem, prowizją, kursem walut i ryzykiem zwrotu."
              icon={<Calculator size={22} color="#34d399" />}
              href="/resell/calculator"
              gradient="linear-gradient(160deg, rgba(10,80,44,0.80) 0%, rgba(4,34,18,0.95) 100%)"
              accentColor="#34d399"
              stats={[{ label: "waluty", value: "PLN/USD/EUR/NOK" }]}
            />
            <DashboardCard
              title="Stwórz ofertę"
              description="AI generuje własny tytuł i opis. Tłumaczenie EN/PL/NO. Wymaga zatwierdzenia."
              icon={<FileText size={22} color="#60a5fa" />}
              href="/resell/generator"
              gradient="linear-gradient(160deg, rgba(18,42,100,0.72) 0%, rgba(8,20,52,0.90) 100%)"
              accentColor="#60a5fa"
              stats={[{ label: "szkice", value: "1" }]}
            />
          </div>
        </div>

        {/* ── Recent products ── */}
        <div style={{ marginTop: 40 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>
              OSTATNIE ANALIZY
            </div>
            <button
              onClick={() => setLocation("/resell/history")}
              style={{ color: "#8b5cf6", fontSize: 12, fontWeight: 700, background: "none", border: "none", cursor: "pointer" }}
            >
              Zobacz wszystkie →
            </button>
          </div>

          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
            gap: 12,
          }}>
            {MOCK_PRODUCTS.map(p => {
              const { label, color, bgColor } = getProfitabilityLabel(p.score);
              return (
                <button
                  key={p.id}
                  onClick={() => setLocation(`/resell/analysis/${p.id}`)}
                  style={{
                    background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 16, padding: "16px 18px", cursor: "pointer", textAlign: "left",
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(139,92,246,0.25)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.08)"; }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                    <div style={{ flex: 1, paddingRight: 10 }}>
                      <div style={{ color: "#fff", fontSize: 14, fontWeight: 700, marginBottom: 4, lineHeight: 1.3 }}>
                        {p.name}
                      </div>
                      <div style={{ color: "rgba(255,255,255,0.40)", fontSize: 11 }}>
                        {p.category}
                      </div>
                    </div>
                    <div style={{
                      background: bgColor, color, borderRadius: 99,
                      padding: "3px 10px", fontSize: 10, fontWeight: 800,
                      border: `1px solid ${color}25`, flexShrink: 0,
                    }}>
                      {p.score}
                    </div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 11 }}>{p.buyCountry}</span>
                      <span style={{ color: "#8b5cf6" }}>→</span>
                      <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 11 }}>{p.sellCountry}</span>
                    </div>
                    <span style={{ color: "#f5c842", fontWeight: 800, fontSize: 14 }}>
                      {formatCurrency(p.buyPrice, p.buyCurrency)}
                    </span>
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <RiskBadge score={p.score} size="sm" showScore={false} />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── How it works ── */}
        <div style={{ marginTop: 60, marginBottom: 40 }}>
          <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, fontWeight: 700, letterSpacing: 1, marginBottom: 24, textAlign: "center" }}>
            JAK TO DZIAŁA
          </div>
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 14,
          }}>
            {[
              { step: "1", icon: <Plus size={20} color="#8b5cf6" />, title: "Dodaj produkt", desc: "Wpisz dane ręcznie lub wklej link (tylko analiza ceny — nie kopiujemy opisów)", color: "#8b5cf6" },
              { step: "2", icon: <BarChart2 size={20} color="#f5c842" />, title: "Analiza rynku", desc: "AI sprawdza ceny na eBay, Amazon, Etsy i ocenia szanse sprzedaży", color: "#f5c842" },
              { step: "3", icon: <Calculator size={20} color="#34d399" />, title: "Kalkulacja zysku", desc: "Liczysz marżę z cłem, podatkiem, prowizją i ryzykiem zwrotu", color: "#34d399" },
              { step: "4", icon: <Shield size={20} color="#60a5fa" />, title: "Zgodność prawna", desc: "Checklista 7 punktów przed eksportem — własne zdjęcia, opis, legalność", color: "#60a5fa" },
              { step: "5", icon: <FileText size={20} color="#a78bfa" />, title: "Własna oferta", desc: "AI tworzy oryginalny opis EN/PL/NO. Ty zatwierdzasz — dopiero wtedy eksport", color: "#a78bfa" },
            ].map(item => (
              <div key={item.step} style={{
                background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 16, padding: "20px 18px", textAlign: "center",
              }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 14, margin: "0 auto 12px",
                  background: `${item.color}15`, border: `1px solid ${item.color}30`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {item.icon}
                </div>
                <div style={{ color: "#fff", fontWeight: 700, fontSize: 14, marginBottom: 6 }}>{item.title}</div>
                <div style={{ color: "rgba(255,255,255,0.40)", fontSize: 12, lineHeight: 1.6 }}>{item.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Warning footer ── */}
        <div style={{
          background: "rgba(245,200,66,0.05)", border: "1px solid rgba(245,200,66,0.15)",
          borderRadius: 14, padding: "16px 20px", marginBottom: 40,
          display: "flex", alignItems: "flex-start", gap: 12,
        }}>
          <AlertTriangle size={16} style={{ color: "#f5c842", flexShrink: 0, marginTop: 1 }} />
          <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 12, margin: 0, lineHeight: 1.7 }}>
            <strong style={{ color: "#fde68a" }}>Ważne:</strong> Aplikacja jest narzędziem do legalnego arbitrażu cenowego. Nie kopiuje automatycznie zdjęć, opisów ani ogłoszeń. Każda oferta jest szkicem wymagającym ręcznego zatwierdzenia. Przestrzegaj regulaminów Allegro, OLX, eBay, Amazon i innych platform. Policz cło i podatek przed każdą transakcją. Użytkownik ponosi pełną odpowiedzialność za swoje działania handlowe.
          </p>
        </div>
      </div>
    </div>
  );
}
