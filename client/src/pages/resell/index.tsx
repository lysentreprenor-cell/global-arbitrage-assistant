import React from "react";
import { useLocation } from "wouter";
import { Search, BarChart2, Calculator, FileText, TrendingUp, AlertTriangle, Clock, Sparkles } from "lucide-react";
import { DashboardCard } from "@/components/resell/DashboardCard";
import { RiskBadge } from "@/components/resell/RiskBadge";
import { MOCK_PRODUCTS, MOCK_ANALYSES } from "@/lib/resell/mockData";
import { formatCurrency } from "@/lib/resell/calculations";

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 14, padding: "14px 16px", flex: 1,
    }}>
      <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 10, fontWeight: 700, letterSpacing: 0.5, marginBottom: 6 }}>{label}</div>
      <div style={{ color, fontSize: 20, fontWeight: 800 }}>{value}</div>
      {sub && <div style={{ color: "rgba(255,255,255,0.30)", fontSize: 10, marginTop: 3 }}>{sub}</div>}
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
      paddingBottom: 100,
    }}>
      {/* Header */}
      <div style={{ padding: "24px 20px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 13,
            background: "linear-gradient(135deg, #8b5cf6 0%, #7c3aed 50%, #f5c842 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 16px rgba(139,92,246,0.45)",
          }}>
            <TrendingUp size={20} color="#fff" />
          </div>
          <div>
            <div style={{ color: "#fff", fontSize: 18, fontWeight: 800 }}>Global Resell</div>
            <div style={{ color: "rgba(255,255,255,0.40)", fontSize: 11 }}>Asystent arbitrażu cenowego</div>
          </div>
        </div>

        {/* Warning bar */}
        <div style={{
          background: "rgba(245,200,66,0.07)", border: "1px solid rgba(245,200,66,0.18)",
          borderRadius: 10, padding: "8px 12px", marginTop: 14, marginBottom: 20,
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <AlertTriangle size={12} style={{ color: "#f5c842", flexShrink: 0 }} />
          <span style={{ color: "#fde68a", fontSize: 10, lineHeight: 1.4 }}>
            Aplikacja wspiera legalne działania — nie kopiuje ogłoszeń. Każda oferta wymaga zatwierdzenia.
          </span>
        </div>

        {/* Quick stats */}
        <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
          <StatCard label="PRODUKTY" value={String(totalProducts)} sub="analizowanych" color="#a78bfa" />
          <StatCard label="OPŁACALNE" value={String(profitable.length)} sub="w bazie" color="#4ade80" />
          <StatCard label="ŚR. WYNIK" value={String(avgScore)} sub="/ 100" color="#f5c842" />
        </div>

        {/* Best opportunity today */}
        {bestProduct && (
          <button
            onClick={() => setLocation(`/resell/analysis/${bestProduct.id}`)}
            style={{
              width: "100%", background: "linear-gradient(135deg, rgba(139,92,246,0.15) 0%, rgba(245,200,66,0.08) 100%)",
              border: "1px solid rgba(139,92,246,0.30)", borderRadius: 16,
              padding: "16px", cursor: "pointer", textAlign: "left", marginBottom: 24,
              position: "relative", overflow: "hidden",
            }}
          >
            <div style={{
              position: "absolute", top: 0, left: "15%", right: "15%", height: 1,
              background: "linear-gradient(90deg, transparent, rgba(245,200,66,0.4), transparent)",
            }} />
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <Sparkles size={12} style={{ color: "#f5c842" }} />
              <span style={{ color: "#fde68a", fontSize: 10, fontWeight: 700, letterSpacing: 0.5 }}>
                NAJLEPSZA OKAZJA DZISIAJ
              </span>
            </div>
            <div style={{ color: "#fff", fontSize: 14, fontWeight: 700, marginBottom: 6 }}>{bestProduct.name}</div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <RiskBadge score={bestProduct.score} size="sm" />
              <span style={{ color: "#f5c842", fontSize: 13, fontWeight: 800 }}>
                {formatCurrency(bestProduct.buyPrice, bestProduct.buyCurrency)}
              </span>
            </div>
          </button>
        )}
      </div>

      {/* Main action tiles */}
      <div style={{ padding: "0 20px" }}>
        <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 10, fontWeight: 700, letterSpacing: 0.8, marginBottom: 14 }}>
          AKCJE
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
          <DashboardCard
            title="Znajdź okazję"
            description="Dodaj produkt i przeanalizuj go"
            icon={<Search size={20} color="#8b5cf6" />}
            href="/resell/add"
            gradient="linear-gradient(160deg, rgba(80,30,120,0.72) 0%, rgba(40,10,70,0.90) 100%)"
            accentColor="#8b5cf6"
          />
          <DashboardCard
            title="Porównaj rynek"
            description="Ceny eBay, Amazon, Etsy"
            icon={<BarChart2 size={20} color="#f5c842" />}
            href="/resell/history"
            gradient="linear-gradient(160deg, rgba(120,80,0,0.72) 0%, rgba(60,36,0,0.90) 100%)"
            accentColor="#f5c842"
          />
          <DashboardCard
            title="Oblicz zysk"
            description="Kalkulator marży z kosztami"
            icon={<Calculator size={20} color="#34d399" />}
            href="/resell/calculator"
            gradient="linear-gradient(160deg, rgba(10,80,44,0.80) 0%, rgba(4,34,18,0.95) 100%)"
            accentColor="#34d399"
          />
          <DashboardCard
            title="Stwórz ofertę"
            description="AI generuje własny opis"
            icon={<FileText size={20} color="#60a5fa" />}
            href="/resell/generator"
            gradient="linear-gradient(160deg, rgba(18,42,100,0.72) 0%, rgba(8,20,52,0.90) 100%)"
            accentColor="#60a5fa"
          />
        </div>

        {/* Recent */}
        <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 10, fontWeight: 700, letterSpacing: 0.8, marginBottom: 14 }}>
          OSTATNIE ANALIZY
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
          {MOCK_PRODUCTS.slice(0, 3).map(p => (
            <button
              key={p.id}
              onClick={() => setLocation(`/resell/analysis/${p.id}`)}
              style={{
                background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 12, padding: "12px 14px", cursor: "pointer", textAlign: "left",
                display: "flex", justifyContent: "space-between", alignItems: "center",
                transition: "background 0.15s",
              }}
            >
              <div>
                <div style={{ color: "#fff", fontSize: 12, fontWeight: 600, marginBottom: 3 }}>{p.name}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Clock size={9} style={{ color: "rgba(255,255,255,0.30)" }} />
                  <span style={{ color: "rgba(255,255,255,0.30)", fontSize: 10 }}>
                    {new Date(p.createdAt).toLocaleDateString("pl-PL")}
                  </span>
                </div>
              </div>
              <RiskBadge score={p.score} size="sm" showScore={false} />
            </button>
          ))}
        </div>

        <button
          onClick={() => setLocation("/resell/history")}
          style={{
            width: "100%", padding: "12px", borderRadius: 12,
            border: "1px solid rgba(139,92,246,0.20)",
            background: "rgba(139,92,246,0.06)",
            color: "#a78bfa", fontSize: 12, fontWeight: 700, cursor: "pointer",
          }}
        >
          Zobacz wszystkie analizy →
        </button>
      </div>
    </div>
  );
}
