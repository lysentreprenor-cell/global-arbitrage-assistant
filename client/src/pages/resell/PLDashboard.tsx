import React, { useState, useMemo } from "react";
import { LineChart } from "lucide-react";
import { ResellLayout } from "@/components/resell/ResellLayout";
import { loadPipeline, type PipelineItem } from "@/lib/pipeline";

// ── Period options ────────────────────────────────────────────────────────────
type Period = "7" | "30" | "90" | "all";

const PERIOD_OPTIONS: { label: string; value: Period }[] = [
  { label: "7 dni",   value: "7"   },
  { label: "30 dni",  value: "30"  },
  { label: "90 dni",  value: "90"  },
  { label: "Wszystko", value: "all" },
];

// ── ISO week helper ───────────────────────────────────────────────────────────
function getISOWeekKey(ts: number): string {
  const d = new Date(ts);
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const startOfWeek1 = new Date(jan4);
  startOfWeek1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  const weekNum = Math.floor((d.getTime() - startOfWeek1.getTime()) / (7 * 24 * 3600 * 1000)) + 1;
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

function weekLabel(key: string): string {
  // e.g. "2025-W03" → "W03"
  return key.split("-")[1] ?? key;
}

// ── Summary card component ────────────────────────────────────────────────────
function SummaryCard({
  label, value, sub, color, dimmed,
}: {
  label: string;
  value: string;
  sub?: string;
  color: string;
  dimmed?: boolean;
}) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 14, padding: "16px 18px", flex: "1 1 0", minWidth: 0,
    }}>
      <div style={{
        color: "rgba(255,255,255,0.3)", fontSize: 9, fontWeight: 700,
        letterSpacing: 0.8, marginBottom: 8, textTransform: "uppercase",
      }}>
        {label}
      </div>
      <div style={{
        color: dimmed ? "rgba(255,255,255,0.55)" : color,
        fontSize: 24, fontWeight: 900, letterSpacing: -0.5, lineHeight: 1,
      }}>
        {value}
      </div>
      {sub && (
        <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 10, marginTop: 5 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

// ── Progress bar row helper ───────────────────────────────────────────────────
function ProgressRow({
  label, count, revenue, profit, pct, accentColor,
}: {
  label: string;
  count: number;
  revenue: number;
  profit: number;
  pct: number;
  accentColor: string;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: "#fff", fontSize: 13, fontWeight: 700 }}>{label}</span>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 5,
            background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)",
          }}>
            {count} szt.
          </span>
        </div>
        <div style={{ textAlign: "right" }}>
          <span style={{ color: "#22c55e", fontSize: 12, fontWeight: 800, marginRight: 8 }}>
            +${profit.toFixed(0)}
          </span>
          <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>
            ${revenue.toFixed(0)}
          </span>
        </div>
      </div>
      <div style={{
        height: 5, background: "rgba(255,255,255,0.07)", borderRadius: 99, overflow: "hidden",
      }}>
        <div style={{
          height: "100%", width: `${Math.min(100, pct)}%`,
          background: accentColor, borderRadius: 99,
          transition: "width 0.4s ease",
        }} />
      </div>
      <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 10, marginTop: 3 }}>
        {pct.toFixed(1)}% przychodu
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function PLDashboard() {
  const [period, setPeriod] = useState<Period>("30");

  const allItems = useMemo(() => loadPipeline(), []);

  const soldItems = useMemo<PipelineItem[]>(() => {
    const now = Date.now();
    const cutoff = period === "all" ? 0 : now - parseInt(period) * 24 * 3600 * 1000;
    return allItems.filter(item => {
      if (item.status !== "sold") return false;
      if (period === "all") return true;
      const soldAt = item.soldAt ?? item.savedAt;
      return soldAt >= cutoff;
    });
  }, [allItems, period]);

  // ── Summary metrics ────────────────────────────────────────────────────────
  const { revenue, cost, netProfit, margin } = useMemo(() => {
    const rev = soldItems.reduce((s, i) => s + (i.soldPrice ?? i.sell), 0);
    const cst = soldItems.reduce((s, i) => s + (i.realBuyPrice ?? i.buy), 0);
    const fees = rev * 0.1;
    const net = rev - cst - fees;
    const mgn = rev > 0 ? (net / rev) * 100 : 0;
    return { revenue: rev, cost: cst, netProfit: net, margin: mgn };
  }, [soldItems]);

  // ── Weekly bars (last 8 weeks) ─────────────────────────────────────────────
  const weeklyData = useMemo(() => {
    const map: Record<string, { profit: number; revenue: number }> = {};
    for (const item of soldItems) {
      const ts = item.soldAt ?? item.savedAt;
      const key = getISOWeekKey(ts);
      if (!map[key]) map[key] = { profit: 0, revenue: 0 };
      const rev = item.soldPrice ?? item.sell;
      const cst = item.realBuyPrice ?? item.buy;
      map[key].profit += rev - cst - rev * 0.1;
      map[key].revenue += rev;
    }

    // Build last-8-weeks skeleton anchored to today
    const result: { key: string; label: string; profit: number; revenue: number }[] = [];
    const now = Date.now();
    for (let w = 7; w >= 0; w--) {
      const ts = now - w * 7 * 24 * 3600 * 1000;
      const key = getISOWeekKey(ts);
      result.push({
        key,
        label: weekLabel(key),
        profit: map[key]?.profit ?? 0,
        revenue: map[key]?.revenue ?? 0,
      });
    }
    return result;
  }, [soldItems]);

  const maxWeeklyProfit = useMemo(
    () => Math.max(...weeklyData.map(w => Math.abs(w.profit)), 1),
    [weeklyData],
  );

  // ── Platform breakdown ─────────────────────────────────────────────────────
  const platformData = useMemo(() => {
    const map: Record<string, { count: number; revenue: number; profit: number }> = {};
    for (const item of soldItems) {
      const platform = item.soldOn || "Nieznana";
      if (!map[platform]) map[platform] = { count: 0, revenue: 0, profit: 0 };
      const rev = item.soldPrice ?? item.sell;
      const cst = item.realBuyPrice ?? item.buy;
      map[platform].count += 1;
      map[platform].revenue += rev;
      map[platform].profit += rev - cst - rev * 0.1;
    }
    return Object.entries(map)
      .map(([platform, data]) => ({ platform, ...data }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [soldItems]);

  // ── Category breakdown ─────────────────────────────────────────────────────
  const categoryData = useMemo(() => {
    const map: Record<string, { count: number; revenue: number; profit: number }> = {};
    for (const item of soldItems) {
      const cat = item.category || "Inne";
      if (!map[cat]) map[cat] = { count: 0, revenue: 0, profit: 0 };
      const rev = item.soldPrice ?? item.sell;
      const cst = item.realBuyPrice ?? item.buy;
      map[cat].count += 1;
      map[cat].revenue += rev;
      map[cat].profit += rev - cst - rev * 0.1;
    }
    return Object.entries(map)
      .map(([category, data]) => ({ category, ...data }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [soldItems]);

  // ── Top 5 by profit ────────────────────────────────────────────────────────
  const top5 = useMemo(() => {
    return [...soldItems]
      .map(item => {
        const rev = item.soldPrice ?? item.sell;
        const cst = item.realBuyPrice ?? item.buy;
        const prf = rev - cst - rev * 0.1;
        const mgn = rev > 0 ? (prf / rev) * 100 : 0;
        return { ...item, calcProfit: prf, calcMargin: mgn, calcBuy: cst, calcSell: rev };
      })
      .sort((a, b) => b.calcProfit - a.calcProfit)
      .slice(0, 5);
  }, [soldItems]);

  const profitCardColor = netProfit >= 0 ? "#22c55e" : "#f87171";

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <ResellLayout>
      <div style={{ padding: "28px 24px 80px", maxWidth: 1100, margin: "0 auto" }}>

        {/* ── Header ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 28 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14, flexShrink: 0,
            background: "linear-gradient(135deg, #22c55e, #16a34a)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 16px rgba(34,197,94,0.3)",
          }}>
            <LineChart size={22} color="#fff" />
          </div>
          <div>
            <h1 style={{ color: "#fff", fontSize: 24, fontWeight: 900, margin: 0, letterSpacing: -0.5 }}>
              Dashboard P&amp;L
            </h1>
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, margin: 0, marginTop: 2 }}>
              Analiza zysków z pipeline'u
            </p>
          </div>
        </div>

        {/* ── Period selector ── */}
        <div style={{ display: "flex", gap: 6, marginBottom: 24 }}>
          {PERIOD_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setPeriod(opt.value)}
              style={{
                padding: "7px 16px", borderRadius: 99, border: "none", cursor: "pointer",
                fontSize: 12, fontWeight: 700,
                background: period === opt.value
                  ? "linear-gradient(135deg, rgba(34,197,94,0.3), rgba(22,163,74,0.2))"
                  : "rgba(255,255,255,0.05)",
                color: period === opt.value ? "#22c55e" : "rgba(255,255,255,0.4)",
                outline: period === opt.value ? "1px solid rgba(34,197,94,0.4)" : "none",
                transition: "all 0.15s",
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* ── Empty state ── */}
        {soldItems.length === 0 && (
          <div style={{
            background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 16, padding: "48px 24px", textAlign: "center",
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
            <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 14, fontWeight: 700, marginBottom: 8 }}>
              Brak sprzedanych produktów w tym okresie.
            </div>
            <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, lineHeight: 1.6, maxWidth: 400, margin: "0 auto" }}>
              Zmień status w Pipeline → Sprzedane żeby zobaczyć statystyki.
            </div>
          </div>
        )}

        {soldItems.length > 0 && (
          <>
            {/* ── Summary cards ── */}
            <div style={{ display: "flex", gap: 12, marginBottom: 28, flexWrap: "wrap" }}>
              <SummaryCard
                label="Przychód"
                value={`$${revenue.toFixed(0)}`}
                sub={`${soldItems.length} sprzedanych`}
                color="#60a5fa"
              />
              <SummaryCard
                label="Koszt"
                value={`$${cost.toFixed(0)}`}
                sub="zakup + szac. koszty"
                color="#f87171"
              />
              <SummaryCard
                label="Zysk netto"
                value={`${netProfit >= 0 ? "+" : ""}$${netProfit.toFixed(0)}`}
                sub="po 10% opłacie platformy"
                color={profitCardColor}
              />
              <SummaryCard
                label="Marża"
                value={`${margin.toFixed(1)}%`}
                sub="zysk / przychód"
                color={margin >= 20 ? "#22c55e" : margin >= 10 ? "#f5c842" : "#f87171"}
              />
            </div>

            {/* ── Weekly profit chart ── */}
            <div style={{
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 16, padding: 22, marginBottom: 24,
            }}>
              <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, fontWeight: 700, letterSpacing: 0.8, marginBottom: 20 }}>
                ZYSK TYGODNIOWY (ostatnie 8 tygodni)
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 120 }}>
                {weeklyData.map(week => {
                  const isPositive = week.profit >= 0;
                  const barH = week.profit === 0
                    ? 2
                    : Math.max(4, Math.round((Math.abs(week.profit) / maxWeeklyProfit) * 100));
                  return (
                    <div
                      key={week.key}
                      style={{
                        flex: 1, display: "flex", flexDirection: "column",
                        alignItems: "center", justifyContent: "flex-end", height: "100%",
                      }}
                    >
                      {/* Value label above bar */}
                      {week.profit !== 0 && (
                        <div style={{
                          color: isPositive ? "#22c55e" : "#f87171",
                          fontSize: 9, fontWeight: 700, marginBottom: 3,
                          whiteSpace: "nowrap",
                        }}>
                          {isPositive ? "+" : ""}${Math.round(week.profit)}
                        </div>
                      )}
                      {/* Bar */}
                      <div
                        title={`${week.key}: $${week.profit.toFixed(2)}`}
                        style={{
                          width: "100%", height: barH,
                          background: week.profit === 0
                            ? "rgba(255,255,255,0.1)"
                            : isPositive
                              ? "linear-gradient(180deg, #22c55e, #16a34a)"
                              : "linear-gradient(180deg, #f87171, #dc2626)",
                          borderRadius: "4px 4px 2px 2px",
                          transition: "height 0.3s ease",
                          minHeight: 2,
                        }}
                      />
                      {/* Week label */}
                      <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 9, marginTop: 5, fontWeight: 600 }}>
                        {week.label}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Platform + Category breakdown ── */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
              {/* Platform breakdown */}
              <div style={{
                background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 16, padding: 20,
              }}>
                <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, fontWeight: 700, letterSpacing: 0.8, marginBottom: 18 }}>
                  PLATFORMY SPRZEDAŻY
                </div>
                {platformData.length === 0 && (
                  <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 12 }}>Brak danych</div>
                )}
                {platformData.map(row => (
                  <ProgressRow
                    key={row.platform}
                    label={row.platform}
                    count={row.count}
                    revenue={row.revenue}
                    profit={row.profit}
                    pct={revenue > 0 ? (row.revenue / revenue) * 100 : 0}
                    accentColor="#22c55e"
                  />
                ))}
              </div>

              {/* Category breakdown */}
              <div style={{
                background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 16, padding: 20,
              }}>
                <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, fontWeight: 700, letterSpacing: 0.8, marginBottom: 18 }}>
                  KATEGORIE
                </div>
                {categoryData.length === 0 && (
                  <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 12 }}>Brak danych</div>
                )}
                {categoryData.map(row => (
                  <ProgressRow
                    key={row.category}
                    label={row.category}
                    count={row.count}
                    revenue={row.revenue}
                    profit={row.profit}
                    pct={revenue > 0 ? (row.revenue / revenue) * 100 : 0}
                    accentColor="#22c55e"
                  />
                ))}
              </div>
            </div>

            {/* ── Top 5 products ── */}
            {top5.length > 0 && (
              <div style={{
                background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 16, padding: 20,
              }}>
                <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, fontWeight: 700, letterSpacing: 0.8, marginBottom: 18 }}>
                  TOP 5 PRODUKTÓW (po zysku)
                </div>

                {/* Table header */}
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 90px 90px 90px 70px",
                  gap: 8, paddingBottom: 8,
                  borderBottom: "1px solid rgba(255,255,255,0.07)",
                  marginBottom: 6,
                }}>
                  {["Produkt", "Zakup", "Sprzedaż", "Zysk", "Marża"].map(h => (
                    <div key={h} style={{ color: "rgba(255,255,255,0.25)", fontSize: 9, fontWeight: 700, letterSpacing: 0.6 }}>
                      {h.toUpperCase()}
                    </div>
                  ))}
                </div>

                {/* Rows */}
                {top5.map((item, idx) => (
                  <div
                    key={`${item.id}-${item.name}-${idx}`}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 90px 90px 90px 70px",
                      gap: 8, padding: "9px 0",
                      borderBottom: idx < top5.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
                      alignItems: "center",
                    }}
                  >
                    <div style={{
                      color: "#fff", fontSize: 12, fontWeight: 600,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {idx === 0 && <span style={{ marginRight: 4 }}>🏆</span>}
                      {item.name}
                    </div>
                    <div style={{ color: "#f87171", fontSize: 12, fontWeight: 700 }}>
                      ${item.calcBuy.toFixed(0)}
                    </div>
                    <div style={{ color: "#60a5fa", fontSize: 12, fontWeight: 700 }}>
                      ${item.calcSell.toFixed(0)}
                    </div>
                    <div style={{
                      color: item.calcProfit >= 0 ? "#22c55e" : "#f87171",
                      fontSize: 13, fontWeight: 900,
                    }}>
                      {item.calcProfit >= 0 ? "+" : ""}${item.calcProfit.toFixed(0)}
                    </div>
                    <div style={{
                      color: item.calcMargin >= 20 ? "#22c55e" : item.calcMargin >= 10 ? "#f5c842" : "#f87171",
                      fontSize: 11, fontWeight: 700,
                    }}>
                      {item.calcMargin.toFixed(1)}%
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </ResellLayout>
  );
}
