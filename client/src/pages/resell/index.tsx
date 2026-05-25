import React, { useState, useMemo } from "react";
import { useLocation } from "wouter";
import {
  LayoutDashboard, Plus, History, Calculator,
  TrendingUp, Package, CheckCircle, Star,
  DollarSign, Menu, X, ChevronRight,
  BarChart2, Zap, Globe, AlertTriangle,
  FileText, Shield,
} from "lucide-react";
import { MOCK_PRODUCTS, MOCK_MARKET_PRICES } from "@/lib/resell/mockData";
import { formatCurrency } from "@/lib/resell/calculations";
import { RiskBadge } from "@/components/resell/RiskBadge";

const STATUS_CONFIG = {
  profitable:  { label: "Opłacalne",  color: "#4ade80", bg: "rgba(74,222,128,0.12)"  },
  draft_ready: { label: "Gotowe",      color: "#a78bfa", bg: "rgba(167,139,250,0.12)" },
  analyzing:   { label: "Analiza...",  color: "#60a5fa", bg: "rgba(96,165,250,0.12)"  },
  rejected:    { label: "Odrzucone",   color: "#f87171", bg: "rgba(248,113,113,0.12)" },
  new:         { label: "Nowe",        color: "#fbbf24", bg: "rgba(251,191,36,0.12)"  },
} as const;

const NAV = [
  { icon: <LayoutDashboard size={18} />, label: "Dashboard",       href: "/resell"            },
  { icon: <Plus size={18} />,            label: "Dodaj produkt",   href: "/resell/add"        },
  { icon: <History size={18} />,         label: "Historia",        href: "/resell/history"    },
  { icon: <Calculator size={18} />,      label: "Kalkulator",      href: "/resell/calculator" },
  { icon: <FileText size={18} />,        label: "Generator ofert", href: "/resell/generator"  },
];

export default function ResellDashboard() {
  const [, setLocation] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const stats = useMemo(() => {
    const total      = MOCK_PRODUCTS.length;
    const profitable = MOCK_PRODUCTS.filter(p =>
      p.status === "profitable" || p.status === "draft_ready"
    ).length;
    const avgScore = Math.round(
      MOCK_PRODUCTS.reduce((s, p) => s + p.score, 0) / total
    );
    const totalProfit = MOCK_PRODUCTS.reduce((sum, p) => {
      const prices = MOCK_MARKET_PRICES[p.id];
      if (!prices || prices.length === 0) return sum;
      const bestAvg    = Math.max(...prices.map(m => m.avgPrice));
      const buyCostUSD = p.buyCurrency === "PLN" ? p.buyPrice * 0.255 : p.buyPrice;
      const margin     = bestAvg - buyCostUSD - 15;
      return sum + (margin > 0 ? margin * p.quantity : 0);
    }, 0);
    const best = [...MOCK_PRODUCTS].sort((a, b) => b.score - a.score)[0];
    return { total, profitable, avgScore, totalProfit, best };
  }, []);

  const scoreDistribution = useMemo(() => [
    { label: "0–25",   range: [0,   25], color: "#f87171" },
    { label: "26–50",  range: [26,  50], color: "#fbbf24" },
    { label: "51–75",  range: [51,  75], color: "#60a5fa" },
    { label: "76–100", range: [76, 100], color: "#4ade80" },
  ].map(b => ({
    ...b,
    count: MOCK_PRODUCTS.filter(p => p.score >= b.range[0] && p.score <= b.range[1]).length,
  })), []);
  const maxBucket = Math.max(...scoreDistribution.map(b => b.count), 1);

  const sortedProducts = useMemo(
    () => [...MOCK_PRODUCTS].sort((a, b) => b.score - a.score),
    []
  );

  const SidebarContent = () => (
    <>
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "0 20px 24px",
        borderBottom: "1px solid rgba(139,92,246,0.12)",
        marginBottom: 12,
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: 11, flexShrink: 0,
          background: "linear-gradient(135deg, #8b5cf6 0%, #7c3aed 50%, #f5c842 100%)",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 4px 14px rgba(139,92,246,0.45)",
        }}>
          <TrendingUp size={18} color="#fff" />
        </div>
        <div>
          <div style={{ color: "#fff", fontWeight: 900, fontSize: 15, letterSpacing: -0.3 }}>
            Global<span style={{ color: "#a78bfa" }}>Resell</span>
          </div>
          <div style={{ color: "rgba(255,255,255,0.30)", fontSize: 9, letterSpacing: 0.8 }}>ASSISTANT</div>
        </div>
      </div>
      <nav style={{ flex: 1 }}>
        <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 9, fontWeight: 700, letterSpacing: 1.5, padding: "8px 20px 6px" }}>MENU</div>
        {NAV.map(item => (
          <button
            key={item.href}
            onClick={() => { setLocation(item.href); setSidebarOpen(false); }}
            style={{
              display: "flex", alignItems: "center", gap: 10,
              width: "100%", padding: "10px 20px",
              background: "transparent",
              borderLeft: "3px solid transparent",
              border: "none", cursor: "pointer",
              color: "rgba(255,255,255,0.50)",
              fontSize: 13, fontWeight: 500,
              textAlign: "left",
              transition: "all 0.15s",
            }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLElement;
              el.style.background = "rgba(255,255,255,0.05)";
              el.style.color = "#c4b5fd";
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLElement;
              el.style.background = "transparent";
              el.style.color = "rgba(255,255,255,0.50)";
            }}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </nav>
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
    <>
      <style>{`
        .resell-wrap {
          display: flex;
          min-height: 100dvh;
          background: linear-gradient(160deg, #0d0010 0%, #08000f 40%, #0a0a14 100%);
          font-family: 'Outfit','Inter',sans-serif;
          color: #fff;
          overflow-x: hidden;
        }
        .resell-sidebar {
          display: flex;
          flex-direction: column;
          width: 220px;
          flex-shrink: 0;
          background: rgba(10,0,20,0.85);
          border-right: 1px solid rgba(139,92,246,0.15);
          padding: 24px 0;
          position: sticky;
          top: 0;
          height: 100dvh;
          overflow-y: auto;
          z-index: 40;
        }
        .resell-main {
          flex: 1;
          min-width: 0;
          overflow-x: hidden;
          display: flex;
          flex-direction: column;
        }
        .resell-topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          background: rgba(0,0,0,0.25);
          position: sticky;
          top: 0;
          z-index: 30;
          gap: 12px;
        }
        .resell-content {
          padding: 24px 20px;
          max-width: 960px;
          margin: 0 auto;
          width: 100%;
          box-sizing: border-box;
        }
        .resell-kpi-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 12px;
          margin-bottom: 24px;
        }
        .resell-mid-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          gap: 14px;
          margin-bottom: 24px;
        }
        .resell-actions-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap: 10px;
          margin-bottom: 24px;
        }
        .resell-product-row {
          display: flex;
          align-items: center;
          padding: 13px 18px;
          gap: 12px;
          cursor: pointer;
          transition: background 0.12s;
        }
        .resell-product-row:hover {
          background: rgba(255,255,255,0.03);
        }
        .hamburger-btn {
          display: none;
        }
        @media (max-width: 768px) {
          .resell-sidebar { display: none; }
          .hamburger-btn  { display: flex !important; }
          .resell-content { padding: 16px 14px; }
          .resell-topbar  { padding: 12px 14px; }
          .resell-product-name { white-space: normal !important; }
        }
      `}</style>

      <div className="resell-wrap">
        {/* Desktop sidebar */}
        <div className="resell-sidebar">
          <SidebarContent />
        </div>

        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <div style={{ position: "fixed", inset: 0, zIndex: 200 }}>
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
                style={{
                  position: "absolute", top: 14, right: 14,
                  background: "rgba(255,255,255,0.08)", border: "none", borderRadius: "50%",
                  width: 30, height: 30, cursor: "pointer",
                  color: "rgba(255,255,255,0.60)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <X size={14} />
              </button>
              <SidebarContent />
            </div>
          </div>
        )}

        {/* Main */}
        <div className="resell-main">
          {/* Topbar */}
          <div className="resell-topbar">
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <button
                className="hamburger-btn"
                onClick={() => setSidebarOpen(true)}
                style={{
                  background: "rgba(255,255,255,0.07)", border: "none", borderRadius: 10,
                  width: 36, height: 36, cursor: "pointer", color: "rgba(255,255,255,0.60)",
                  alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}
              >
                <Menu size={18} />
              </button>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: "#fff", fontWeight: 800, fontSize: 17, letterSpacing: -0.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  Intelligent Dashboard
                </div>
                <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, marginTop: 1 }}>
                  Real-time cross-border arbitrage metrics
                </div>
              </div>
            </div>
            <button
              onClick={() => setLocation("/resell/add")}
              style={{
                display: "flex", alignItems: "center", gap: 6, flexShrink: 0,
                padding: "9px 16px", borderRadius: 10, border: "none", cursor: "pointer",
                background: "linear-gradient(135deg, #8b5cf6, #7c3aed)",
                color: "#fff", fontSize: 13, fontWeight: 700,
                boxShadow: "0 4px 14px rgba(139,92,246,0.40)",
                whiteSpace: "nowrap",
              }}
            >
              <Plus size={14} /> Nowy
            </button>
          </div>

          {/* Scrollable content */}
          <div className="resell-content">

            {/* KPI cards */}
            <div className="resell-kpi-grid">
              {[
                { icon: <Package size={16} color="#a78bfa" />, label: "Total Products", value: String(stats.total),              sub: `${stats.profitable} opłacalnych`,                              color: "#a78bfa", border: "rgba(167,139,250,0.22)" },
                { icon: <CheckCircle size={16} color="#4ade80" />, label: "Opłacalne",    value: String(stats.profitable),        sub: `${Math.round(stats.profitable/stats.total*100)}% portfolio`,  color: "#4ade80", border: "rgba(74,222,128,0.22)"  },
                { icon: <Star size={16} color="#f5c842" />,        label: "Avg Score",    value: `${stats.avgScore}/100`,         sub: "bieżące portfolio",                                          color: "#f5c842", border: "rgba(245,200,66,0.22)"  },
                { icon: <DollarSign size={16} color="#34d399" />,  label: "Profit est.", value: `$${Math.round(stats.totalProfit)}`, sub: "łączny szacunek",                                        color: "#34d399", border: "rgba(52,211,153,0.22)"  },
              ].map(card => (
                <div key={card.label} style={{
                  background: "rgba(255,255,255,0.03)",
                  border: `1px solid ${card.border}`,
                  borderRadius: 14, padding: "16px 18px",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                    {card.icon}
                    <span style={{ color: "rgba(255,255,255,0.38)", fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }}>{card.label}</span>
                  </div>
                  <div style={{ color: card.color, fontSize: 24, fontWeight: 900, letterSpacing: -0.5, lineHeight: 1 }}>{card.value}</div>
                  <div style={{ color: "rgba(255,255,255,0.26)", fontSize: 11, marginTop: 4 }}>{card.sub}</div>
                </div>
              ))}
            </div>

            {/* Score chart + Best opportunity */}
            <div className="resell-mid-grid">
              {/* Chart */}
              <div style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 14, padding: "18px 20px",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 16 }}>
                  <BarChart2 size={14} color="rgba(255,255,255,0.35)" />
                  <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>Rozkład wyników</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {scoreDistribution.map(b => (
                    <div key={b.label}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ color: "rgba(255,255,255,0.42)", fontSize: 11 }}>{b.label}</span>
                        <span style={{ color: b.color, fontSize: 11, fontWeight: 700 }}>{b.count} prod.</span>
                      </div>
                      <div style={{ height: 7, borderRadius: 99, background: "rgba(255,255,255,0.05)" }}>
                        <div style={{
                          height: "100%",
                          width: `${(b.count / maxBucket) * 100}%`,
                          borderRadius: 99, background: b.color, opacity: 0.75,
                          minWidth: b.count > 0 ? 4 : 0,
                          transition: "width 0.5s ease",
                        }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.05)", display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "flex-end" }}>
                  {["eBay", "Etsy", "Amazon"].map(m => (
                    <span key={m} style={{ background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.22)", borderRadius: 99, padding: "2px 8px", color: "#c4b5fd", fontSize: 10, fontWeight: 700 }}>{m}</span>
                  ))}
                </div>
              </div>

              {/* Best opportunity */}
              {stats.best && (
                <div
                  onClick={() => setLocation(`/resell/analysis/${stats.best.id}`)}
                  style={{
                    background: "linear-gradient(135deg, rgba(139,92,246,0.14) 0%, rgba(245,200,66,0.06) 100%)",
                    border: "1px solid rgba(139,92,246,0.28)",
                    borderRadius: 14, padding: "18px 20px",
                    cursor: "pointer", position: "relative", overflow: "hidden",
                  }}
                >
                  <div style={{ position: "absolute", top: 0, left: "10%", right: "10%", height: 1, background: "linear-gradient(90deg, transparent, rgba(245,200,66,0.35), transparent)" }} />
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
                    <Zap size={12} color="#f5c842" />
                    <span style={{ color: "#fde68a", fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>Najlepsza okazja</span>
                  </div>
                  <div style={{ color: "#fff", fontWeight: 800, fontSize: 15, marginBottom: 3 }}>{stats.best.name}</div>
                  <div style={{ color: "rgba(255,255,255,0.38)", fontSize: 12, marginBottom: 14 }}>
                    {stats.best.category} · {stats.best.buyCountry} → {stats.best.sellCountry}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                    <div>
                      <div style={{ color: "rgba(255,255,255,0.32)", fontSize: 10, marginBottom: 2 }}>Cena zakupu</div>
                      <div style={{ color: "#f5c842", fontWeight: 900, fontSize: 20 }}>{formatCurrency(stats.best.buyPrice, stats.best.buyCurrency)}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <RiskBadge score={stats.best.score} size="md" />
                      <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 8, justifyContent: "flex-end" }}>
                        <span style={{ color: "#a78bfa", fontSize: 12, fontWeight: 700 }}>Szczegóły</span>
                        <ChevronRight size={13} color="#a78bfa" />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Products list */}
            <div style={{
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 14, overflow: "hidden", marginBottom: 24,
            }}>
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "14px 18px",
                borderBottom: "1px solid rgba(255,255,255,0.05)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Globe size={13} color="rgba(255,255,255,0.30)" />
                  <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>Ostatnie analizy</span>
                </div>
                <button
                  onClick={() => setLocation("/resell/history")}
                  style={{ color: "#8b5cf6", fontSize: 12, fontWeight: 700, background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 3 }}
                >
                  Wszystkie <ChevronRight size={12} />
                </button>
              </div>

              {sortedProducts.map((p, i) => {
                const sc = STATUS_CONFIG[p.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.new;
                const prices   = MOCK_MARKET_PRICES[p.id];
                const bestPrice = prices ? Math.max(...prices.map(m => m.avgPrice)) : null;
                return (
                  <div
                    key={p.id}
                    className="resell-product-row"
                    onClick={() => setLocation(`/resell/analysis/${p.id}`)}
                    style={{ borderBottom: i < sortedProducts.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}
                  >
                    <div style={{ width: 20, textAlign: "center", color: "rgba(255,255,255,0.18)", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{i + 1}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="resell-product-name" style={{ color: "#fff", fontSize: 13, fontWeight: 700, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                      <div style={{ color: "rgba(255,255,255,0.32)", fontSize: 11 }}>{p.category} · {p.buyCountry} → {p.sellCountry}</div>
                    </div>
                    <div style={{ background: sc.bg, color: sc.color, borderRadius: 99, padding: "3px 9px", fontSize: 10, fontWeight: 700, flexShrink: 0, border: `1px solid ${sc.color}28` }}>{sc.label}</div>
                    {bestPrice ? (
                      <div style={{ textAlign: "right", flexShrink: 0, minWidth: 60 }}>
                        <div style={{ color: "#4ade80", fontWeight: 800, fontSize: 13 }}>${bestPrice}</div>
                        <div style={{ color: "rgba(255,255,255,0.22)", fontSize: 10 }}>avg USA</div>
                      </div>
                    ) : <div style={{ minWidth: 60 }} />}
                    <RiskBadge score={p.score} size="sm" />
                    <ChevronRight size={13} color="rgba(255,255,255,0.18)" style={{ flexShrink: 0 }} />
                  </div>
                );
              })}
            </div>

            {/* Quick actions */}
            <div className="resell-actions-grid">
              {[
                { icon: <Plus size={17} color="#a78bfa" />,       label: "Dodaj produkt",    href: "/resell/add",        color: "#a78bfa", border: "rgba(167,139,250,0.22)" },
                { icon: <Calculator size={17} color="#34d399" />,  label: "Kalkulator zysku", href: "/resell/calculator",  color: "#34d399", border: "rgba(52,211,153,0.22)" },
                { icon: <FileText size={17} color="#60a5fa" />,    label: "Generator ofert",  href: "/resell/generator",  color: "#60a5fa", border: "rgba(96,165,250,0.22)" },
                { icon: <History size={17} color="#f5c842" />,     label: "Historia",          href: "/resell/history",    color: "#f5c842", border: "rgba(245,200,66,0.22)" },
              ].map(a => (
                <button
                  key={a.href}
                  onClick={() => setLocation(a.href)}
                  style={{
                    display: "flex", flexDirection: "column", alignItems: "center",
                    gap: 7, padding: "16px 10px",
                    background: "rgba(255,255,255,0.03)",
                    border: `1px solid ${a.border}`,
                    borderRadius: 12, cursor: "pointer",
                    color: a.color, fontSize: 12, fontWeight: 700,
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)"; }}
                >
                  {a.icon}{a.label}
                </button>
              ))}
            </div>

            {/* Legal notice */}
            <div style={{
              background: "rgba(245,200,66,0.04)", border: "1px solid rgba(245,200,66,0.11)",
              borderRadius: 12, padding: "12px 16px",
              display: "flex", alignItems: "flex-start", gap: 10,
            }}>
              <AlertTriangle size={13} color="#f5c842" style={{ flexShrink: 0, marginTop: 2 }} />
              <p style={{ color: "rgba(255,255,255,0.32)", fontSize: 11, margin: 0, lineHeight: 1.6 }}>
                <strong style={{ color: "#fde68a" }}>Ważne:</strong> Narzędzie do legalnego arbitrażu cenowego. Nie kopiuje zdjęć ani opisów. Każda oferta wymaga zatwierdzenia. Policz cło i podatek przed transakcją.
              </p>
            </div>

          </div>{/* end content */}
        </div>{/* end main */}
      </div>{/* end wrap */}
    </>
  );
}
