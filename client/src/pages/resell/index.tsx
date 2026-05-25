import React, { useState, useMemo } from "react";
import { useLocation } from "wouter";
import {
  LayoutDashboard, Plus, History, Calculator,
  TrendingUp, Package, CheckCircle, Star,
  DollarSign, Menu, X, ChevronRight,
  BarChart2, Zap, Globe, AlertTriangle,
  FileText, Shield, ArrowUpRight,
} from "lucide-react";
import { MOCK_PRODUCTS, MOCK_MARKET_PRICES, MOCK_ANALYSES } from "@/lib/resell/mockData";
import { formatCurrency } from "@/lib/resell/calculations";
import { RiskBadge } from "@/components/resell/RiskBadge";

const STATUS_CONFIG = {
  profitable:  { label: "Opłacalne",    color: "#4ade80", bg: "rgba(74,222,128,0.12)"  },
  draft_ready: { label: "Gotowe",        color: "#a78bfa", bg: "rgba(167,139,250,0.12)" },
  analyzing:   { label: "Analiza...",    color: "#60a5fa", bg: "rgba(96,165,250,0.12)"  },
  rejected:    { label: "Odrzucone",     color: "#f87171", bg: "rgba(248,113,113,0.12)" },
  new:         { label: "Nowe",          color: "#fbbf24", bg: "rgba(251,191,36,0.12)"  },
} as const;

const NAV = [
  { icon: <LayoutDashboard size={18} />, label: "Dashboard",       href: "/resell"            },
  { icon: <Plus size={18} />,            label: "Dodaj produkt",   href: "/resell/add"        },
  { icon: <History size={18} />,         label: "Historia",         href: "/resell/history"    },
  { icon: <Calculator size={18} />,      label: "Kalkulator",      href: "/resell/calculator" },
  { icon: <FileText size={18} />,        label: "Generator ofert", href: "/resell/generator"  },
];

export default function ResellDashboard() {
  const [, setLocation] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const stats = useMemo(() => {
    const total     = MOCK_PRODUCTS.length;
    const profitable = MOCK_PRODUCTS.filter(p =>
      p.status === "profitable" || p.status === "draft_ready"
    ).length;
    const avgScore = Math.round(
      MOCK_PRODUCTS.reduce((s, p) => s + p.score, 0) / total
    );

    // estimate total profit potential in USD (buy in PLN @ ~0.255)
    const totalProfit = MOCK_PRODUCTS.reduce((sum, p) => {
      const prices = MOCK_MARKET_PRICES[p.id];
      if (!prices || prices.length === 0) return sum;
      const bestAvg = Math.max(...prices.map(m => m.avgPrice));
      const buyCostUSD = p.buyCurrency === "PLN" ? p.buyPrice * 0.255 : p.buyPrice;
      const margin = bestAvg - buyCostUSD - 15; // ~$15 shipping
      return sum + (margin > 0 ? margin * p.quantity : 0);
    }, 0);

    const best = [...MOCK_PRODUCTS].sort((a, b) => b.score - a.score)[0];
    return { total, profitable, avgScore, totalProfit, best };
  }, []);

  const scoreDistribution = useMemo(() => {
    const buckets = [
      { label: "0–25",  range: [0,   25],  color: "#f87171" },
      { label: "26–50", range: [26,  50],  color: "#fbbf24" },
      { label: "51–75", range: [51,  75],  color: "#60a5fa" },
      { label: "76–100",range: [76, 100], color: "#4ade80" },
    ];
    return buckets.map(b => ({
      ...b,
      count: MOCK_PRODUCTS.filter(p => p.score >= b.range[0] && p.score <= b.range[1]).length,
    }));
  }, []);
  const maxBucket = Math.max(...scoreDistribution.map(b => b.count), 1);

  const sortedProducts = useMemo(
    () => [...MOCK_PRODUCTS].sort((a, b) => b.score - a.score),
    []
  );

  const S: Record<string, React.CSSProperties> = {
    page: {
      display: "flex", minHeight: "100dvh",
      background: "linear-gradient(160deg, #0d0010 0%, #08000f 40%, #0a0a14 100%)",
      fontFamily: "'Outfit','Inter',sans-serif",
      color: "#fff",
    },
    sidebar: {
      width: 220, flexShrink: 0,
      background: "rgba(10,0,20,0.80)",
      borderRight: "1px solid rgba(139,92,246,0.15)",
      backdropFilter: "blur(20px)",
      display: "flex", flexDirection: "column",
      padding: "24px 0",
      position: "sticky" as const, top: 0, height: "100dvh",
      overflowY: "auto",
      zIndex: 40,
    },
    sidebarMobile: {
      position: "fixed" as const, inset: 0, zIndex: 200,
    },
    logo: {
      display: "flex", alignItems: "center", gap: 10,
      padding: "0 20px 24px",
      borderBottom: "1px solid rgba(139,92,246,0.12)",
      marginBottom: 12,
    },
    logoIcon: {
      width: 36, height: 36, borderRadius: 11, flexShrink: 0,
      background: "linear-gradient(135deg, #8b5cf6 0%, #7c3aed 50%, #f5c842 100%)",
      display: "flex", alignItems: "center", justifyContent: "center",
      boxShadow: "0 4px 14px rgba(139,92,246,0.45)",
    },
    main: {
      flex: 1, overflowY: "auto" as const, minWidth: 0,
    },
    topbar: {
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "18px 28px",
      borderBottom: "1px solid rgba(255,255,255,0.06)",
      background: "rgba(0,0,0,0.25)",
      backdropFilter: "blur(12px)",
      position: "sticky" as const, top: 0, zIndex: 30,
    },
    content: {
      padding: "28px", maxWidth: 1000, margin: "0 auto",
    },
  };

  const NavItem = ({ item }: { item: typeof NAV[0] }) => {
    const active = item.href === "/resell" && location.pathname === "/resell"
      || (item.href !== "/resell" && location.pathname?.startsWith(item.href));
    return (
      <button
        onClick={() => { setLocation(item.href); setSidebarOpen(false); }}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          width: "100%", padding: "10px 20px",
          background: active ? "rgba(139,92,246,0.18)" : "transparent",
          borderLeft: active ? "3px solid #8b5cf6" : "3px solid transparent",
          border: "none", cursor: "pointer",
          color: active ? "#c4b5fd" : "rgba(255,255,255,0.45)",
          fontSize: 13, fontWeight: active ? 700 : 500,
          textAlign: "left" as const,
          transition: "all 0.15s",
        }}
        onMouseEnter={e => {
          if (!active) {
            (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)";
            (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.75)";
          }
        }}
        onMouseLeave={e => {
          if (!active) {
            (e.currentTarget as HTMLElement).style.background = "transparent";
            (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.45)";
          }
        }}
      >
        {item.icon}
        {item.label}
      </button>
    );
  };

  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div style={S.logo}>
        <div style={S.logoIcon}>
          <TrendingUp size={18} color="#fff" />
        </div>
        <div>
          <div style={{ color: "#fff", fontWeight: 900, fontSize: 15, letterSpacing: -0.3 }}>
            Global<span style={{ color: "#a78bfa" }}>Resell</span>
          </div>
          <div style={{ color: "rgba(255,255,255,0.30)", fontSize: 9, letterSpacing: 0.8 }}>ASSISTANT</div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1 }}>
        <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 9, fontWeight: 700, letterSpacing: 1.5, padding: "8px 20px 6px" }}>MENU</div>
        {NAV.map(item => <NavItem key={item.href} item={item} />)}
      </nav>

      {/* Legal badge */}
      <div style={{
        margin: "16px 12px 0",
        background: "rgba(74,222,128,0.06)", border: "1px solid rgba(74,222,128,0.15)",
        borderRadius: 10, padding: "10px 12px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
          <Shield size={11} color="#4ade80" />
          <span style={{ color: "#86efac", fontSize: 10, fontWeight: 700 }}>Legalny asystent</span>
        </div>
        <div style={{ color: "rgba(255,255,255,0.30)", fontSize: 10, lineHeight: 1.5 }}>
          Nie kopiuje ogłoszeń. Wymaga zatwierdzenia.
        </div>
      </div>
    </>
  );

  return (
    <div style={S.page}>
      {/* Desktop sidebar */}
      <div style={{ ...S.sidebar, display: window.innerWidth < 768 ? "none" : "flex" } as React.CSSProperties}>
        <SidebarContent />
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div style={S.sidebarMobile}>
          <div
            onClick={() => setSidebarOpen(false)}
            style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}
          />
          <div style={{
            position: "absolute", top: 0, left: 0, bottom: 0, width: 240,
            background: "#0a0014", borderRight: "1px solid rgba(139,92,246,0.20)",
            display: "flex", flexDirection: "column", padding: "24px 0",
          }}>
            <button
              onClick={() => setSidebarOpen(false)}
              style={{ position: "absolute", top: 14, right: 14, background: "rgba(255,255,255,0.08)", border: "none", borderRadius: "50%", width: 30, height: 30, cursor: "pointer", color: "rgba(255,255,255,0.60)", display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <X size={14} />
            </button>
            <SidebarContent />
          </div>
        </div>
      )}

      {/* Main */}
      <div style={S.main}>
        {/* Topbar */}
        <div style={S.topbar}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              onClick={() => setSidebarOpen(true)}
              style={{
                background: "rgba(255,255,255,0.07)", border: "none", borderRadius: 10,
                width: 36, height: 36, cursor: "pointer", color: "rgba(255,255,255,0.60)",
                display: window.innerWidth >= 768 ? "none" : "flex",
                alignItems: "center", justifyContent: "center",
              }}
            >
              <Menu size={18} />
            </button>
            <div>
              <div style={{ color: "#fff", fontWeight: 800, fontSize: 18, letterSpacing: -0.3 }}>Intelligent Dashboard</div>
              <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, marginTop: 1 }}>Real-time cross-border arbitrage metrics</div>
            </div>
          </div>
          <button
            onClick={() => setLocation("/resell/add")}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "9px 18px", borderRadius: 10, border: "none", cursor: "pointer",
              background: "linear-gradient(135deg, #8b5cf6, #7c3aed)",
              color: "#fff", fontSize: 13, fontWeight: 700,
              boxShadow: "0 4px 14px rgba(139,92,246,0.40)",
            }}
          >
            <Plus size={14} /> Nowy produkt
          </button>
        </div>

        {/* Content */}
        <div style={S.content}>

          {/* ── KPI Cards ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 28 }}>
            {[
              {
                icon: <Package size={18} color="#a78bfa" />,
                label: "Total Products",
                value: String(stats.total),
                sub: `${stats.profitable} opłacalnych`,
                color: "#a78bfa",
                border: "rgba(167,139,250,0.25)",
              },
              {
                icon: <CheckCircle size={18} color="#4ade80" />,
                label: "Opłacalne",
                value: String(stats.profitable),
                sub: `${Math.round(stats.profitable / stats.total * 100)}% portfolio`,
                color: "#4ade80",
                border: "rgba(74,222,128,0.25)",
              },
              {
                icon: <Star size={18} color="#f5c842" />,
                label: "Average Score",
                value: `${stats.avgScore}/100`,
                sub: "bieżące portfolio",
                color: "#f5c842",
                border: "rgba(245,200,66,0.25)",
              },
              {
                icon: <DollarSign size={18} color="#34d399" />,
                label: "Potential Profit",
                value: `$${Math.round(stats.totalProfit)}`,
                sub: "szacowany łączny",
                color: "#34d399",
                border: "rgba(52,211,153,0.25)",
              },
            ].map(card => (
              <div key={card.label} style={{
                background: "rgba(255,255,255,0.03)",
                border: `1px solid ${card.border}`,
                borderRadius: 16, padding: "18px 20px",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
                  {card.icon}
                  <span style={{ color: "rgba(255,255,255,0.40)", fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase" }}>
                    {card.label}
                  </span>
                </div>
                <div style={{ color: card.color, fontSize: 26, fontWeight: 900, letterSpacing: -0.5, lineHeight: 1 }}>
                  {card.value}
                </div>
                <div style={{ color: "rgba(255,255,255,0.28)", fontSize: 11, marginTop: 5 }}>{card.sub}</div>
              </div>
            ))}
          </div>

          {/* ── Row: Chart + Best Opportunity ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 28 }}>

            {/* Score distribution chart */}
            <div style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 16, padding: "20px 22px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 18 }}>
                <BarChart2 size={15} color="rgba(255,255,255,0.40)" />
                <span style={{ color: "rgba(255,255,255,0.40)", fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>Rozkład wyników</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {scoreDistribution.map(b => (
                  <div key={b.label}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 11 }}>{b.label}</span>
                      <span style={{ color: b.color, fontSize: 11, fontWeight: 700 }}>{b.count} prod.</span>
                    </div>
                    <div style={{ height: 8, borderRadius: 99, background: "rgba(255,255,255,0.06)" }}>
                      <div style={{
                        height: "100%",
                        width: `${(b.count / maxBucket) * 100}%`,
                        borderRadius: 99,
                        background: b.color,
                        opacity: 0.8,
                        transition: "width 0.6s ease",
                        minWidth: b.count > 0 ? 4 : 0,
                      }} />
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "rgba(255,255,255,0.30)", fontSize: 11 }}>Rynki docelowe</span>
                <div style={{ display: "flex", gap: 6 }}>
                  {["eBay", "Etsy", "Amazon"].map(m => (
                    <span key={m} style={{ background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.25)", borderRadius: 99, padding: "2px 8px", color: "#c4b5fd", fontSize: 10, fontWeight: 700 }}>{m}</span>
                  ))}
                </div>
              </div>
            </div>

            {/* Best opportunity */}
            {stats.best && (
              <div
                onClick={() => setLocation(`/resell/analysis/${stats.best.id}`)}
                style={{
                  background: "linear-gradient(135deg, rgba(139,92,246,0.15) 0%, rgba(245,200,66,0.06) 100%)",
                  border: "1px solid rgba(139,92,246,0.30)",
                  borderRadius: 16, padding: "20px 22px",
                  cursor: "pointer", position: "relative", overflow: "hidden",
                }}
              >
                <div style={{
                  position: "absolute", top: 0, left: "10%", right: "10%", height: 1,
                  background: "linear-gradient(90deg, transparent, rgba(245,200,66,0.40), transparent)",
                }} />
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 14 }}>
                  <Zap size={13} color="#f5c842" />
                  <span style={{ color: "#fde68a", fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>Najlepsza okazja</span>
                </div>
                <div style={{ color: "#fff", fontWeight: 800, fontSize: 16, marginBottom: 4 }}>{stats.best.name}</div>
                <div style={{ color: "rgba(255,255,255,0.40)", fontSize: 12, marginBottom: 16 }}>
                  {stats.best.category} · {stats.best.buyCountry} → {stats.best.sellCountry}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                  <div>
                    <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, marginBottom: 3 }}>Cena zakupu</div>
                    <div style={{ color: "#f5c842", fontWeight: 900, fontSize: 20 }}>
                      {formatCurrency(stats.best.buyPrice, stats.best.buyCurrency)}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <RiskBadge score={stats.best.score} size="md" />
                    <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 8, justifyContent: "flex-end" }}>
                      <span style={{ color: "#a78bfa", fontSize: 12, fontWeight: 700 }}>Szczegóły</span>
                      <ChevronRight size={14} color="#a78bfa" />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Products table ── */}
          <div style={{
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 16, overflow: "hidden",
            marginBottom: 28,
          }}>
            {/* Header */}
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "16px 22px",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <Globe size={14} color="rgba(255,255,255,0.35)" />
                <span style={{ color: "rgba(255,255,255,0.40)", fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>Ostatnie analizy</span>
              </div>
              <button
                onClick={() => setLocation("/resell/history")}
                style={{ color: "#8b5cf6", fontSize: 12, fontWeight: 700, background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
              >
                Wszystkie <ChevronRight size={13} />
              </button>
            </div>

            {/* Table rows */}
            {sortedProducts.map((p, i) => {
              const sc = STATUS_CONFIG[p.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.new;
              const prices = MOCK_MARKET_PRICES[p.id];
              const bestPrice = prices ? Math.max(...prices.map(m => m.avgPrice)) : null;
              return (
                <div
                  key={p.id}
                  onClick={() => setLocation(`/resell/analysis/${p.id}`)}
                  style={{
                    display: "flex", alignItems: "center",
                    padding: "14px 22px", gap: 14,
                    borderBottom: i < sortedProducts.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                    cursor: "pointer",
                    transition: "background 0.12s",
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  {/* Rank */}
                  <div style={{ width: 22, textAlign: "center", color: "rgba(255,255,255,0.20)", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                    {i + 1}
                  </div>

                  {/* Name + category */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: "#fff", fontSize: 13, fontWeight: 700, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.name}
                    </div>
                    <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11 }}>
                      {p.category} · {p.buyCountry} → {p.sellCountry}
                    </div>
                  </div>

                  {/* Status */}
                  <div style={{
                    background: sc.bg, color: sc.color,
                    borderRadius: 99, padding: "3px 10px",
                    fontSize: 10, fontWeight: 700, flexShrink: 0,
                    border: `1px solid ${sc.color}30`,
                  }}>
                    {sc.label}
                  </div>

                  {/* Best market price */}
                  {bestPrice ? (
                    <div style={{ textAlign: "right", flexShrink: 0, minWidth: 70 }}>
                      <div style={{ color: "#4ade80", fontWeight: 800, fontSize: 13 }}>${bestPrice}</div>
                      <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 10 }}>avg USA</div>
                    </div>
                  ) : (
                    <div style={{ minWidth: 70 }} />
                  )}

                  {/* Score */}
                  <RiskBadge score={p.score} size="sm" />

                  {/* Arrow */}
                  <ChevronRight size={14} color="rgba(255,255,255,0.20)" style={{ flexShrink: 0 }} />
                </div>
              );
            })}
          </div>

          {/* ── Quick actions row ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 28 }}>
            {[
              { icon: <Plus size={18} color="#a78bfa" />,      label: "Dodaj produkt",   href: "/resell/add",        color: "#a78bfa", border: "rgba(167,139,250,0.25)" },
              { icon: <Calculator size={18} color="#34d399" />, label: "Kalkulator zysku", href: "/resell/calculator", color: "#34d399", border: "rgba(52,211,153,0.25)" },
              { icon: <FileText size={18} color="#60a5fa" />,   label: "Generator ofert", href: "/resell/generator",  color: "#60a5fa", border: "rgba(96,165,250,0.25)" },
              { icon: <Shield size={18} color="#f5c842" />,     label: "Compliance",       href: "/resell/compliance", color: "#f5c842", border: "rgba(245,200,66,0.25)" },
            ].map(action => (
              <button
                key={action.href}
                onClick={() => setLocation(action.href)}
                style={{
                  display: "flex", flexDirection: "column" as const, alignItems: "center",
                  gap: 8, padding: "18px 12px",
                  background: "rgba(255,255,255,0.03)",
                  border: `1px solid ${action.border}`,
                  borderRadius: 14, cursor: "pointer",
                  color: action.color, fontSize: 12, fontWeight: 700,
                  transition: "background 0.15s",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)"; }}
              >
                {action.icon}
                {action.label}
              </button>
            ))}
          </div>

          {/* ── Legal notice ── */}
          <div style={{
            background: "rgba(245,200,66,0.04)",
            border: "1px solid rgba(245,200,66,0.12)",
            borderRadius: 12, padding: "13px 18px",
            display: "flex", alignItems: "flex-start", gap: 10,
          }}>
            <AlertTriangle size={14} color="#f5c842" style={{ flexShrink: 0, marginTop: 1 }} />
            <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, margin: 0, lineHeight: 1.6 }}>
              <strong style={{ color: "#fde68a" }}>Ważne:</strong> Narzędzie do legalnego arbitrażu cenowego. Nie kopiuje automatycznie zdjęć ani opisów. Każda oferta wymaga ręcznego zatwierdzenia. Policz cło i podatek przed każdą transakcją.
            </p>
          </div>

        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .desktop-sidebar { display: none !important; }
        }
      `}</style>
    </div>
  );
}
