import { useLocation } from "wouter";
import {
  Sparkles, ArrowDownLeft, MoreHorizontal,
  ArrowUpRight, Eye, EyeOff, ArrowLeftRight, Loader2,
  Send, FileText, Plus, ChevronRight, Clock, Target, BarChart2, TrendingDown, TrendingUp,
} from "lucide-react";
import { useAppStore, CurrencyCode, CURRENCY_SYMBOLS, WALLET_FLAGS, formatMoney, formatMoneyCompact, getCurrencyName, CORE_WALLET_CURRENCIES } from "@/lib/store";
import { luxuryTheme, luxuryGradients } from "@/theme/luxuryTheme";
import { useTheme } from "@/context/ThemeContext";
import { useLang } from "@/context/LanguageContext";
import { useFeatures } from "@/hooks/useFeatures";
import { type FeatureKey } from "@/lib/features";
import React, { useState, useEffect, useMemo } from "react";
import { FloatingTopPanel } from "@/components/FloatingTopPanel";

const c = luxuryTheme.colors;
const r = luxuryTheme.radius;


function CardSheen({ radius = 28, color = "rgba(255,255,255,0.06)" }: { radius?: number; color?: string }) {
  return (
    <>
      <div style={{
        position: "absolute", inset: 0, borderRadius: radius, pointerEvents: "none",
        background: "linear-gradient(128deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.01) 40%, rgba(0,0,0,0.06) 100%)",
      }} />
      <div style={{
        position: "absolute", top: 0, left: "12%", right: "12%", height: 1,
        background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
        pointerEvents: "none",
      }} />
    </>
  );
}

type TileKey = "FORECAST" | "REQUEST" | "INVEST" | "CARDS" | "HISTORY" | "GOALS" | "BUDGET" | "EXCHANGE";

const TILE: Record<TileKey, { bg: string; iconColor: string; shadow: string; border: string }> = {
  FORECAST: {
    bg:        "linear-gradient(160deg, rgba(140,10,55,0.72) 0%, rgba(70,4,26,0.90) 100%)",
    iconColor: "#ff5fa0", border: "rgba(220,30,110,0.22)",
    shadow:    "0 6px 18px rgba(180,10,80,0.22), inset 0 1.5px 0 rgba(255,150,200,0.14), inset 0 -1.5px 0 rgba(0,0,0,0.40)",
  },
  REQUEST: {
    bg:        "linear-gradient(160deg, rgba(140,10,55,0.72) 0%, rgba(70,4,26,0.90) 100%)",
    iconColor: "#ff5fa0", border: "rgba(220,30,110,0.22)",
    shadow:    "0 6px 18px rgba(180,10,80,0.22), inset 0 1.5px 0 rgba(255,150,200,0.14), inset 0 -1.5px 0 rgba(0,0,0,0.40)",
  },
  INVEST: {
    bg:        "linear-gradient(160deg, rgba(10,80,44,0.80) 0%, rgba(4,34,18,0.95) 100%)",
    iconColor: "#24d487", border: "rgba(36,212,135,0.22)",
    shadow:    "0 6px 18px rgba(20,180,90,0.18), inset 0 1.5px 0 rgba(100,255,180,0.12), inset 0 -1.5px 0 rgba(0,0,0,0.40)",
  },
  CARDS: {
    bg:        "linear-gradient(160deg, rgba(18,42,100,0.72) 0%, rgba(8,20,52,0.90) 100%)",
    iconColor: "#a0bcff", border: "rgba(100,150,255,0.20)",
    shadow:    "0 6px 18px rgba(60,100,255,0.15), inset 0 1.5px 0 rgba(160,200,255,0.10), inset 0 -1.5px 0 rgba(0,0,0,0.40)",
  },
  HISTORY: {
    bg:        "linear-gradient(160deg, rgba(80,30,120,0.72) 0%, rgba(40,10,70,0.90) 100%)",
    iconColor: "#c084fc", border: "rgba(147,51,234,0.28)",
    shadow:    "0 6px 18px rgba(120,40,200,0.22), inset 0 1.5px 0 rgba(200,150,255,0.14), inset 0 -1.5px 0 rgba(0,0,0,0.40)",
  },
  GOALS: {
    bg:        "linear-gradient(160deg, rgba(120,80,0,0.72) 0%, rgba(60,36,0,0.90) 100%)",
    iconColor: "#fbbf24", border: "rgba(212,160,32,0.30)",
    shadow:    "0 6px 18px rgba(180,130,0,0.22), inset 0 1.5px 0 rgba(255,210,80,0.14), inset 0 -1.5px 0 rgba(0,0,0,0.40)",
  },
  BUDGET: {
    bg:        "linear-gradient(160deg, rgba(10,80,44,0.80) 0%, rgba(4,34,18,0.95) 100%)",
    iconColor: "#34d399", border: "rgba(36,212,135,0.22)",
    shadow:    "0 6px 18px rgba(20,180,90,0.18), inset 0 1.5px 0 rgba(100,255,180,0.12), inset 0 -1.5px 0 rgba(0,0,0,0.40)",
  },
  EXCHANGE: {
    bg:        "linear-gradient(160deg, rgba(18,42,100,0.72) 0%, rgba(8,20,52,0.90) 100%)",
    iconColor: "#60a5fa", border: "rgba(96,165,250,0.25)",
    shadow:    "0 6px 18px rgba(60,120,255,0.18), inset 0 1.5px 0 rgba(150,200,255,0.12), inset 0 -1.5px 0 rgba(0,0,0,0.40)",
  },
};

const CATEGORY_EMOJI: Record<string, string> = {
  food:"🍕", jedzenie:"🍕", restauracja:"🍕", restaurant:"🍕",
  transport:"🚗", uber:"🚗", taxi:"🚗",
  shopping:"🛍️", zakupy:"🛍️",
  contract:"📋", umowa:"📋",
  exchange:"💱", wymiana:"💱",
  health:"💊", zdrowie:"💊", apteka:"💊",
  entertainment:"🎬", rozrywka:"🎬",
  travel:"✈️", podróż:"✈️",
  salary:"💰", wynagrodzenie:"💰", przelew:"💸",
  housing:"🏠", mieszkanie:"🏠", czynsz:"🏠",
  sport:"🏋️", fitness:"🏋️",
  education:"📚", edukacja:"📚",
};
function getCatEmoji(category?: string): string {
  if (!category) return "💳";
  const key = category.toLowerCase().trim();
  return CATEGORY_EMOJI[key] ?? "💳";
}



export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { user, transactions, notifications, conversations, wallets, exchangeCurrency, fxRates, ratesUpdatedAt, ratesUnavailable, enabledCurrencies, primaryCurrency, saveCurrencySettings, addNotification } = useAppStore();
  const { th } = useTheme();
  const { t, lang } = useLang();
  const { isEnabled } = useFeatures();
  const [balanceVisible, setBalanceVisible]     = useState(true);
  const [activeWallet, setActiveWallet]         = useState<CurrencyCode>(primaryCurrency);
  const [showExchange, setShowExchange]         = useState(false);
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const [showAddCurrency, setShowAddCurrency]   = useState(false);
  const [exFrom, setExFrom]                     = useState<CurrencyCode>(primaryCurrency);
  const [exTo, setExTo]                         = useState<CurrencyCode>("EUR");
  const [exAmount, setExAmount]             = useState("");
  const [exResult, setExResult]             = useState<{ received: number; currency: CurrencyCode; from: CurrencyCode; fromAmount: number } | null>(null);
  const [exError, setExError]               = useState<string | null>(null);
  const [exLoading, setExLoading]           = useState(false);

  const [showAlertModal, setShowAlertModal] = useState(false);
  const [alertFrom, setAlertFrom] = useState("EUR");
  const [alertTo, setAlertTo] = useState("PLN");
  const [alertThreshold, setAlertThreshold] = useState("");
  const [alertCondition, setAlertCondition] = useState<"above" | "below">("below");

  interface CurrencyAlert {
    id: string;
    from: string;
    to: string;
    threshold: number;
    condition: "above" | "below";
    triggered: boolean;
  }

  useEffect(() => {
    try {
      const stored = localStorage.getItem("finlys_currency_alerts");
      if (!stored || !fxRates) return;
      const alerts: CurrencyAlert[] = JSON.parse(stored);
      alerts.forEach(alert => {
        if (alert.triggered) return;
        const rates = fxRates as Record<string, number>;
        const rate = rates[`${alert.from}_${alert.to}`] || (rates[alert.from] && rates[alert.to] ? rates[alert.to] / rates[alert.from] : null);
        if (!rate) return;
        const triggered = alert.condition === "above" ? rate > alert.threshold : rate < alert.threshold;
        if (triggered) {
          addNotification({ title: `Kurs ${alert.from}/${alert.to}`, message: `Kurs ${alert.from}/${alert.to} ${alert.condition === "above" ? "przekroczył" : "spadł poniżej"} ${alert.threshold}. Aktualnie: ${rate.toFixed(4)}`, type: "alert", category: "payment", priority: "high" });
          const updated = alerts.map(a => a.id === alert.id ? { ...a, triggered: true } : a);
          localStorage.setItem("finlys_currency_alerts", JSON.stringify(updated));
        }
      });
    } catch {}
  }, [fxRates]); // eslint-disable-line react-hooks/exhaustive-deps


  const [contractCount, setContractCount] = useState<{ active: number; total: number; needsAction: number; overdue: number }>({ active: 0, total: 0, needsAction: 0, overdue: 0 });
  const [upcomingDeadlines, setUpcomingDeadlines] = useState<Array<{ id: string; title: string; deadline: string; daysLeft: number }>>([]);
  useEffect(() => {
    try {
      const stored = localStorage.getItem("itemprise_contracts");
      if (stored) {
        const today = new Date(); today.setHours(0,0,0,0);
        const in7 = new Date(today); in7.setDate(in7.getDate() + 7);
        const ags = JSON.parse(stored) as Array<{ id?: string; phase?: string; data?: { deadlineSingle?: string; deadlineTo?: string; loanReturnDate?: string; category?: string; subcategory?: string; customTitle?: string } }>;
        const total = ags.length;
        const active = ags.filter(a => a.phase && a.phase !== "completed").length;
        const needsAction = ags.filter(a => a.phase === "awaiting_release").length;
        const overdue = ags.filter(a => {
          if (a.phase === "completed") return false;
          const d = a.data?.category === "wypozyczenie" ? a.data?.loanReturnDate : a.data?.deadlineSingle;
          if (!d) return false;
          return new Date(d) < today;
        }).length;
        setContractCount({ active, total, needsAction, overdue });

        const upcoming = ags
          .filter(a => {
            if (a.phase === "completed") return false;
            const d = a.data?.deadlineSingle || a.data?.deadlineTo || a.data?.loanReturnDate;
            if (!d) return false;
            const dt = new Date(d); dt.setHours(0,0,0,0);
            return dt >= today && dt <= in7;
          })
          .slice(0, 3)
          .map(a => {
            const d = a.data?.deadlineSingle || a.data?.deadlineTo || a.data?.loanReturnDate || "";
            const dt = new Date(d); dt.setHours(0,0,0,0);
            const daysLeft = Math.round((dt.getTime() - today.getTime()) / 86400000);
            return {
              id: a.id || "",
              title: a.data?.customTitle || a.data?.subcategory || a.data?.category || "Umowa",
              deadline: d,
              daysLeft,
            };
          });
        setUpcomingDeadlines(upcoming);
      }
    } catch {}
  }, []);

  const activeBalance = wallets[activeWallet] ?? 0;

  useEffect(() => {
    setActiveWallet(primaryCurrency);
  }, [primaryCurrency]);

  useEffect(() => {
    const best = CORE_WALLET_CURRENCIES
      .filter(c => (wallets[c] ?? 0) > 0)
      .sort((a, b) => (wallets[b] ?? 0) - (wallets[a] ?? 0))[0]
      ?? primaryCurrency;
    setExFrom(best);
    setExTo(prev => prev === best ? (CORE_WALLET_CURRENCIES.find(c => c !== best) ?? "EUR") : prev);
  }, [wallets, primaryCurrency]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalUSD = useMemo(() => {
    return (Object.keys(wallets) as CurrencyCode[]).reduce((sum, cur) => {
      const rate = fxRates[cur];
      if (!rate || rate <= 0) return sum;
      return sum + (wallets[cur] ?? 0) / rate;
    }, 0);
  }, [wallets, fxRates]);

  const totalPortfolioInActive = useMemo(() => {
    const toRate = fxRates[activeWallet];
    if (!toRate || toRate <= 0) return activeBalance;
    return parseFloat((totalUSD * toRate).toFixed(2));
  }, [totalUSD, fxRates, activeWallet, activeBalance]);

  const ratesUpdatedLabel = useMemo(() => {
    if (!ratesUpdatedAt) return null;
    try {
      const d = new Date(ratesUpdatedAt);
      return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    } catch { return null; }
  }, [ratesUpdatedAt]);

  const formattedBalance = formatMoney(totalPortfolioInActive, activeWallet);
  const maskedBalance    = "••• ••• •••";
  const recentInflow     = transactions.filter(tx => tx.amount > 0).slice(0, 8)
    .reduce((sum, tx) => sum + tx.amount, 0);

  const { trendLabel, trendColor, barWidth, monthIn, monthOut, monthBalance } = useMemo(() => {
    const now = Date.now();
    const d30 = now - 30 * 86400000;
    const d60 = now - 60 * 86400000;
    const thisMonthIn  = transactions.filter(tx => tx.amount > 0 && new Date(tx.date).getTime() >= d30).reduce((s, tx) => s + tx.amount, 0);
    const lastMonthIn  = transactions.filter(tx => tx.amount > 0 && new Date(tx.date).getTime() >= d60 && new Date(tx.date).getTime() < d30).reduce((s, tx) => s + tx.amount, 0);
    const thisMonthOut = transactions.filter(tx => tx.amount < 0 && new Date(tx.date).getTime() >= d30).reduce((s, tx) => s + Math.abs(tx.amount), 0);
    const totalOut     = transactions.filter(tx => tx.amount < 0).reduce((s, tx) => s + Math.abs(tx.amount), 0);
    const pct = lastMonthIn > 0 ? ((thisMonthIn - lastMonthIn) / lastMonthIn * 100) : (thisMonthIn > 0 ? 100 : 0);
    return {
      trendLabel: pct >= 0 ? `↑ ${pct.toFixed(1)}%` : `↓ ${Math.abs(pct).toFixed(1)}%`,
      trendColor: pct >= 0 ? "positive" : "negative",
      barWidth: recentInflow > 0 ? `${Math.min(totalOut / recentInflow * 100, 100).toFixed(0)}%` : "0%",
      monthIn: thisMonthIn,
      monthOut: thisMonthOut,
      monthBalance: thisMonthIn - thisMonthOut,
    };
  }, [transactions, recentInflow]);

  const tileConfig = TILE;

  type QuickAction = { icon: React.ReactNode; label: TileKey; text: string; feature: FeatureKey; onClick: () => void; testId: string };
  const quickActions: QuickAction[] = ([
    { icon: <Clock size={22} />,          label: "HISTORY"  as TileKey, text: lang === "pl" ? "HISTORIA" : "HISTORY",  feature: "transfer"        as FeatureKey, onClick: () => setLocation("/history"),                                            testId: "action-history"  },
    { icon: <Target size={22} />,         label: "GOALS"    as TileKey, text: lang === "pl" ? "CELE"    : "GOALS",    feature: "transfer"        as FeatureKey, onClick: () => setLocation("/savings"),                                            testId: "action-goals"    },
    { icon: <BarChart2 size={22} />,      label: "BUDGET"   as TileKey, text: lang === "pl" ? "BUDŻET"  : "BUDGET",   feature: "budget-forecast" as FeatureKey, onClick: () => setLocation("/budget"),                                             testId: "action-budget"   },
    { icon: <ArrowLeftRight size={22} />, label: "EXCHANGE" as TileKey, text: lang === "pl" ? "WYMIANA" : "EXCHANGE", feature: "transfer"        as FeatureKey, onClick: () => { setShowExchange(s => !s); setExResult(null); setExError(null); }, testId: "action-exchange" },
  ] as QuickAction[]).filter(a => isEnabled(a.feature));

  const topCategories = useMemo(() => {
    const now = new Date();
    const byCategory: Record<string, number> = {};
    transactions
      .filter(tx => tx.amount < 0 && new Date(tx.date).getMonth() === now.getMonth() && new Date(tx.date).getFullYear() === now.getFullYear())
      .forEach(tx => {
        const cat = tx.category || "Inne";
        byCategory[cat] = (byCategory[cat] || 0) + Math.abs(tx.amount);
      });
    return Object.entries(byCategory).sort((a, b) => b[1] - a[1]).slice(0, 4);
  }, [transactions]);

  const [topGoal, setTopGoal] = useState<{ emoji: string; name: string; target: number; saved: number; currency: string } | null>(null);
  useEffect(() => {
    try {
      const goals = JSON.parse(localStorage.getItem("finlys_goals") || "[]");
      const active = goals.filter((g: any) => g.saved < g.target);
      if (active.length > 0) {
        setTopGoal(active.sort((a: any, b: any) => (b.saved / b.target) - (a.saved / a.target))[0]);
      }
    } catch {}
  }, []);

  const goldStyle: React.CSSProperties = {
    background: th.primaryGradient,
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    backgroundClip: "text",
  };

  const hour = new Date().getHours();
  const greeting = lang === "pl"
    ? (hour < 12 ? "Dzień dobry" : hour < 18 ? "Dzień dobry" : "Dobry wieczór")
    : (hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening");
  const firstName = user?.name?.split(" ")[0] || "";

  const handleExchange = async () => {
    const amt = parseFloat(exAmount);
    setExResult(null);
    setExError(null);
    setExLoading(true);
    try {
      const res = await exchangeCurrency(exFrom, exTo, amt);
      if (res.success && res.received !== undefined) {
        setExResult({ received: res.received, currency: exTo, from: exFrom, fromAmount: amt });
        setExAmount("");
        if (activeWallet === exFrom) setActiveWallet(exTo);
      } else {
        setExError(res.error || "Błąd wymiany");
      }
    } finally {
      setExLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: th.pageBg,
      position: "relative", paddingBottom: "calc(180px + env(safe-area-inset-bottom))", overflowX: "hidden",
      transition: "background 0.5s ease",
    }}>

      {/* ── Ambient glows ── */}
      <div style={{ position: "absolute", top: -100, left: -80, width: 380, height: 380, borderRadius: "50%",
        background: `radial-gradient(circle, ${th.ambient1} 0%, transparent 70%)`,
        filter: "blur(6px)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", top: -60, right: -60, width: 240, height: 240, borderRadius: "50%",
        background: `radial-gradient(circle, ${th.ambient2} 0%, transparent 70%)`,
        filter: "blur(10px)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: 60, right: -80, width: 300, height: 300, borderRadius: "50%",
        background: `radial-gradient(circle, ${th.ambient3} 0%, transparent 70%)`,
        filter: "blur(14px)", pointerEvents: "none" }} />

      <FloatingTopPanel />

      <div style={{ padding: "0 22px", position: "relative", zIndex: 1, paddingTop: "calc(76px + env(safe-area-inset-top))" }}>

        {/* ── Hero Balance Card ── */}
        <div style={{ position: "relative", marginTop: 22 }}>
          <div style={{
            borderRadius: r.xl, padding: "22px 22px 24px",
            background: th.cardBg,
            border: `1px solid ${th.border}`,
            boxShadow: ["0 2px 0 rgba(255,255,255,0.06)", "inset 0 1px 0 rgba(255,255,255,0.06)", "0 32px 64px rgba(0,0,0,0.55)", "0 8px 20px rgba(0,0,0,0.40)", "0 0 60px rgba(30,70,160,0.16)"].join(", "),
            position: "relative", overflow: "hidden",
            transition: "background 0.5s ease, border-color 0.5s ease",
          }}>
            <CardSheen radius={r.xl} color={th.sheenTop} />

            {firstName && (
              <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.42)", letterSpacing: 0.6, marginBottom: 10, position: "relative" }}>
                {greeting}, {firstName} 👋
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, position: "relative" }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: th.textMuted, position: "relative" }}>
                {t.totalWealth}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  data-testid="btn-currency-pill"
                  onClick={() => { setShowCurrencyPicker(true); setShowAddCurrency(false); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 4,
                    borderRadius: 999, padding: "5px 10px",
                    fontSize: 13, fontWeight: 800, letterSpacing: 1.4,
                    color: c.chipPinkText,
                    background: luxuryGradients.pinkBadge,
                    boxShadow: "0 0 0 1px rgba(220,30,110,0.30), 0 8px 24px rgba(220,30,110,0.40), inset 0 1px 0 rgba(255,180,220,0.20)",
                    border: "none", cursor: "pointer",
                  }}
                >
                  {WALLET_FLAGS[activeWallet]} {activeWallet}
                </button>
                <button
                  data-testid="btn-toggle-balance"
                  onClick={() => setBalanceVisible(v => !v)}
                  style={{
                    width: 30, height: 30, borderRadius: "50%", border: "none",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: "pointer",
                    background: "rgba(255,255,255,0.08)",
                    color: "rgba(255,255,255,0.50)",
                  }}
                >
                  {balanceVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            <div style={{ marginTop: 20, position: "relative" }}>
              <div
                data-testid="balance-amount"
                style={{
                  fontSize: 34, lineHeight: 1.05, fontWeight: 800, letterSpacing: -0.5,
                  ...(balanceVisible ? goldStyle : {}),
                  color: balanceVisible ? undefined : "rgba(255,255,255,0.25)",
                  filter: th.balanceGlow && balanceVisible ? `drop-shadow(0 0 18px ${th.glowStrong})` : "none",
                  transition: "opacity 0.3s",
                }}
              >
                {balanceVisible ? formattedBalance : maskedBalance}
              </div>
              {ratesUpdatedLabel && !ratesUnavailable && (
                <div style={{ marginTop: 5, display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.28)", letterSpacing: 0.8 }}>
                    Kursy: {ratesUpdatedLabel}
                  </span>
                  <button
                    onClick={() => setShowAlertModal(true)}
                    title={lang === "pl" ? "Ustaw alert kursowy" : "Set rate alert"}
                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, padding: "0 2px", lineHeight: 1, color: "rgba(255,255,255,0.35)" }}
                  >🔔</button>
                </div>
              )}
              <div style={{ position: "absolute", bottom: -10, left: 0, width: "55%", height: 1,
                background: `linear-gradient(90deg, ${th.glow}, transparent)` }} />
            </div>

            <div style={{ marginTop: 28, display: "flex", flexDirection: "row", gap: 10 }}>
              {/* Żółty — Dodaj Środki */}
              <button
                data-testid="btn-add-funds"
                onClick={() => setLocation("/wallet/top-up")}
                onMouseDown={e => { e.currentTarget.style.transform = "scale(0.96)"; }}
                onMouseUp={e => { e.currentTarget.style.transform = "scale(1)"; }}
                onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}
                onTouchStart={e => { e.currentTarget.style.transform = "scale(0.96)"; }}
                onTouchEnd={e => { e.currentTarget.style.transform = "scale(1)"; }}
                style={{
                  flex: "0 0 55%", height: 52, borderRadius: 999, border: "none", cursor: "pointer",
                  fontSize: 13, fontWeight: 800, color: th.primaryBtnColor, letterSpacing: 0.3,
                  background: th.primaryGradient,
                  boxShadow: th.primaryBtnShadow,
                  position: "relative", overflow: "hidden",
                  transition: "transform 0.15s ease",
                }}
              >
                <div style={{ position: "absolute", top: 0, left: "18%", right: "18%", height: "44%",
                  background: "linear-gradient(180deg, rgba(255,255,255,0.24) 0%, transparent 100%)",
                  borderRadius: "0 0 50% 50%", pointerEvents: "none" }} />
                {t.addFunds}
              </button>

              {/* Ciemny z złotą ramką — Nowa umowa */}
              <button
                data-testid="btn-new-agreement-pill"
                onClick={() => setLocation("/agreements/new?new=1")}
                onMouseDown={e => { e.currentTarget.style.transform = "scale(0.96)"; }}
                onMouseUp={e => { e.currentTarget.style.transform = "scale(1)"; }}
                onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}
                onTouchStart={e => { e.currentTarget.style.transform = "scale(0.96)"; }}
                onTouchEnd={e => { e.currentTarget.style.transform = "scale(1)"; }}
                style={{
                  flex: 1, height: 52, borderRadius: 999,
                  border: `1.5px solid ${th.primary}`,
                  cursor: "pointer",
                  fontSize: 13, fontWeight: 800, color: "rgba(255,255,255,0.92)", letterSpacing: 0.3,
                  background: "rgba(10,18,40,0.85)",
                  boxShadow: `0 0 0 1px rgba(212,160,32,0.15), inset 0 1px 0 rgba(255,255,255,0.06)`,
                  position: "relative", overflow: "hidden",
                  transition: "transform 0.15s ease",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                }}
              >
                <ArrowUpRight size={15} style={{ color: th.primary }} />
                {lang === "pl" ? "Nowa umowa" : "New Contract"}
              </button>
            </div>
          </div>
        </div>


        {/* ── Currency Tile placeholder (removed) ── */}
        <div style={{ marginTop: 14 }}>

          {showExchange && (
            <div style={{
              marginTop: 12, borderRadius: r.md, padding: "16px",
              background: "rgba(255,255,255,0.04)",
              border: `1px solid ${th.borderMuted}`,
              boxShadow: "0 8px 28px rgba(0,0,0,0.38)",
            }}>
              <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: 3, color: th.textMuted, marginBottom: 12 }}>
                {t.currencyExchange}
              </div>

              <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: 1.5, color: th.textMuted, marginBottom: 3, textTransform: "uppercase" }}>{lang === "pl" ? "Z waluty" : "From"}</div>
                  <select
                    data-testid="exchange-from"
                    value={exFrom}
                    onChange={e => { setExFrom(e.target.value as CurrencyCode); setExResult(null); setExError(null); }}
                    style={{
                      width: "100%", borderRadius: 10, padding: "8px 10px",
                      fontSize: 13, fontWeight: 700,
                      background: "rgba(255,255,255,0.06)",
                      border: `1px solid ${th.borderMuted}`,
                      color: th.textPrimary, cursor: "pointer",
                    }}
                  >
                    {CORE_WALLET_CURRENCIES.map(c => (
                      <option key={c} value={c}>{WALLET_FLAGS[c]} {c} — {formatMoney(wallets[c] ?? 0, c)}</option>
                    ))}
                  </select>
                  <div style={{ fontSize: 14, color: (wallets[exFrom] ?? 0) === 0 ? "#ff6060" : th.textMuted, marginTop: 3, fontWeight: 600 }}>
                    {(wallets[exFrom] ?? 0) === 0
                      ? (lang === "pl" ? `Brak środków w ${exFrom}` : `No funds in ${exFrom}`)
                      : `${lang === "pl" ? "Dostępne" : "Available"}: ${formatMoney(wallets[exFrom] ?? 0, exFrom)}`
                    }
                  </div>
                </div>
                <div style={{ paddingTop: 26, flexShrink: 0 }}>
                  <ArrowLeftRight size={16} color={th.textMuted} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: 1.5, color: th.textMuted, marginBottom: 3, textTransform: "uppercase" }}>{lang === "pl" ? "Na walutę" : "To"}</div>
                  <select
                    data-testid="exchange-to"
                    value={exTo}
                    onChange={e => { setExTo(e.target.value as CurrencyCode); setExResult(null); setExError(null); }}
                    style={{
                      width: "100%", borderRadius: 10, padding: "8px 10px",
                      fontSize: 13, fontWeight: 700,
                      background: "rgba(255,255,255,0.06)",
                      border: `1px solid ${th.borderMuted}`,
                      color: th.textPrimary, cursor: "pointer",
                    }}
                  >
                    {CORE_WALLET_CURRENCIES.map(c => (
                      <option key={c} value={c}>{WALLET_FLAGS[c]} {c}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontSize: 14, color: th.textMuted, letterSpacing: 0.5 }}>
                  {ratesUnavailable
                    ? (lang === "pl" ? "Kursy walut tymczasowo niedostępne" : "Exchange rates temporarily unavailable")
                    : `1 ${exFrom} = ${(fxRates[exTo] / fxRates[exFrom]).toFixed(4)} ${exTo}`
                  }
                </div>
                {ratesUpdatedLabel && !ratesUnavailable && (
                  <div style={{ fontSize: 14, color: th.textMuted, letterSpacing: 0.3 }}>
                    {lang === "pl" ? "Kursy" : "Rates"}: {ratesUpdatedLabel}
                  </div>
                )}
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <input
                  data-testid="exchange-amount"
                  type="number"
                  min="0"
                  placeholder={t.amount}
                  value={exAmount}
                  onChange={e => { setExAmount(e.target.value); setExResult(null); setExError(null); }}
                  style={{
                    flex: 1, borderRadius: 10, padding: "10px 12px",
                    fontSize: 14, fontWeight: 700,
                    background: "rgba(255,255,255,0.06)",
                    border: `1px solid ${th.borderMuted}`,
                    color: th.textPrimary, outline: "none",
                  }}
                />
                <button
                  data-testid="btn-exchange-confirm"
                  onClick={handleExchange}
                  disabled={exLoading || !exAmount || parseFloat(exAmount) <= 0 || (wallets[exFrom] ?? 0) === 0}
                  aria-busy={exLoading}
                  style={{
                    borderRadius: 10, padding: "0 18px",
                    fontSize: 14, fontWeight: 800, letterSpacing: 0.8,
                    cursor: exLoading ? "wait" : "pointer", border: "none", whiteSpace: "nowrap",
                    color: th.primaryBtnColor,
                    background: th.primaryGradient,
                    boxShadow: th.primaryBtnShadow,
                    opacity: (exLoading || !exAmount || parseFloat(exAmount) <= 0 || (wallets[exFrom] ?? 0) === 0) ? 0.5 : 1,
                    transition: "opacity 0.2s",
                  }}
                >
                  {exLoading ? <Loader2 size={14} className="animate-spin" /> : t.convert}
                </button>
              </div>

              {exResult && (
                <div style={{
                  marginTop: 10, borderRadius: 10, padding: "10px 14px",
                  background: "rgba(36,212,135,0.10)",
                  border: "1px solid rgba(36,212,135,0.25)",
                  fontSize: 14, fontWeight: 700, color: "#70f0aa",
                }}>
                  ✓ {lang === "pl" ? "Wymiana zakończona" : "Exchange complete"} — {formatMoney(exResult.fromAmount, exResult.from)} → {formatMoney(exResult.received, exResult.currency)}
                </div>
              )}
              {exError && (
                <div style={{
                  marginTop: 10, borderRadius: 10, padding: "10px 14px",
                  background: "rgba(255,80,80,0.10)",
                  border: "1px solid rgba(255,80,80,0.25)",
                  fontSize: 14, fontWeight: 700, color: "#ff8080",
                }}>
                  <div>{exError}</div>
                  {exError === "Brak wystarczających środków" && exAmount && parseFloat(exAmount) > 0 && (
                    <>
                      <div style={{ marginTop: 4, fontWeight: 600, opacity: 0.85 }}>
                        {lang === "pl" ? "Dostępne" : "Available"}: {formatMoney(wallets[exFrom] ?? 0, exFrom)}
                      </div>
                      <div style={{ fontWeight: 600, opacity: 0.85 }}>
                        {lang === "pl" ? "Brakuje" : "Shortfall"}: {formatMoney(Math.max(0, parseFloat(exAmount) - (wallets[exFrom] ?? 0)), exFrom)}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Cash Flow Card ── */}
        <div style={{
          marginTop: 14, borderRadius: r.lg, padding: "18px 20px",
          background: th.cardAltBg, border: `1px solid ${th.border}`,
          boxShadow: ["0 2px 0 rgba(255,255,255,0.05)", "inset 0 1px 0 rgba(255,255,255,0.06)", "0 16px 48px rgba(0,0,0,0.45)"].join(", "),
          position: "relative", overflow: "hidden",
          transition: "background 0.5s ease",
        }}>
          <CardSheen radius={r.lg} color={th.sheenTop} />
          <div style={{ fontSize: 15, letterSpacing: 3.4, fontWeight: 700, color: th.textMuted, position: "relative" }}>
            {t.cashFlow}
          </div>
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10, position: "relative" }}>
            {[
              { label: lang === "pl" ? "Wpływy" : "Income",  value: monthIn,     color: "#24d487", sign: "+" },
              { label: lang === "pl" ? "Wydatki" : "Expenses", value: monthOut,  color: "#ff8080", sign: "−" },
              { label: lang === "pl" ? "Bilans miesiąca" : "Monthly balance", value: monthBalance, color: monthBalance >= 0 ? "#24d487" : "#ff8080", sign: monthBalance >= 0 ? "+" : "" },
            ].map(({ label, value, color, sign }) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 13, color: th.textMuted, fontWeight: 600 }}>{label}</div>
                <div style={{ fontSize: 14, fontWeight: 800, color }}>
                  {sign}{Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12, height: 1, background: "rgba(255,255,255,0.06)" }} />
          <div style={{ marginTop: 10, display: "flex", alignItems: "center", justifyContent: "space-between", position: "relative" }}>
            <div style={{
              padding: "3px 9px", borderRadius: 999, fontSize: 12, fontWeight: 700,
              color: trendColor === "positive" ? "#7df0ba" : "#ff8080",
              background: trendColor === "positive" ? "rgba(35,183,118,0.16)" : "rgba(200,30,80,0.18)",
              border: `1px solid ${trendColor === "positive" ? "rgba(80,225,155,0.24)" : "rgba(200,30,80,0.30)"}`,
            }}>
              {lang === "pl" ? "vs. poprzedni miesiąc" : "vs. prev. month"} {trendLabel}
            </div>
            <button onClick={() => setLocation("/history")} style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1.5, color: th.primary, background: "none", border: "none", cursor: "pointer", textTransform: "uppercase", padding: 0 }}>
              {lang === "pl" ? "HISTORIA" : "HISTORY"} →
            </button>
          </div>
          <div style={{ marginTop: 10, height: 3, borderRadius: 99, background: "rgba(255,255,255,0.05)" }}>
            <div style={{ height: "100%", width: barWidth, borderRadius: 99, background: "linear-gradient(90deg, rgba(36,212,135,0.5), rgba(36,212,135,0.9))", boxShadow: "0 0 8px rgba(36,212,135,0.50)", transition: "width 0.6s ease" }} />
          </div>
        </div>

        {/* ── Top Spending Categories ── */}
        {topCategories.length > 0 && (
          <div style={{
            marginTop: 14, borderRadius: r.lg, padding: "16px 18px",
            background: th.cardAltBg, border: `1px solid ${th.border}`,
            boxShadow: "0 4px 18px rgba(0,0,0,0.32)",
          }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 3, color: th.textMuted, textTransform: "uppercase", marginBottom: 12 }}>
              {lang === "pl" ? "Wydatki tego miesiąca" : "This month's spending"}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {topCategories.map(([cat, amount], i) => {
                const maxAmt = topCategories[0][1];
                const pct = maxAmt > 0 ? (amount / maxAmt) * 100 : 0;
                const catColors = ["#a78bfa", "#60a5fa", "#34d399", "#f472b6"];
                const color = catColors[i] || "#a78bfa";
                return (
                  <div key={cat}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 600, color: th.textPrimary }}>
                        <span style={{ fontSize: 15 }}>{getCatEmoji(cat)}</span>
                        <span style={{ textTransform: "capitalize" }}>{cat}</span>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color }}>{amount.toLocaleString(lang === "pl" ? "pl-PL" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {activeWallet}</span>
                    </div>
                    <div style={{ height: 4, borderRadius: 99, background: "rgba(255,255,255,0.07)" }}>
                      <div style={{ height: "100%", width: `${pct}%`, borderRadius: 99, background: color, transition: "width 0.6s ease" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Top Savings Goal ── */}
        {topGoal && (
          <div
            style={{
              marginTop: 14, borderRadius: r.lg, padding: "16px 18px",
              background: th.cardAltBg, border: `1px solid ${th.border}`,
              boxShadow: "0 4px 18px rgba(0,0,0,0.32)",
              cursor: "pointer",
            }}
            onClick={() => setLocation("/savings")}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 3, color: th.textMuted, textTransform: "uppercase", marginBottom: 4 }}>
                  {lang === "pl" ? "Cel oszczędnościowy" : "Savings goal"}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <span style={{ fontSize: 20 }}>{topGoal.emoji}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: th.textPrimary }}>{topGoal.name}</span>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#a78bfa" }}>
                  {((topGoal.saved / topGoal.target) * 100).toFixed(0)}%
                </div>
                <div style={{ fontSize: 11, color: th.textMuted, marginTop: 1 }}>
                  {topGoal.saved.toFixed(0)} / {topGoal.target.toFixed(0)} {topGoal.currency}
                </div>
              </div>
            </div>
            <div style={{ height: 6, borderRadius: 99, background: "rgba(255,255,255,0.07)" }}>
              <div style={{
                height: "100%",
                width: `${Math.min((topGoal.saved / topGoal.target) * 100, 100)}%`,
                borderRadius: 99,
                background: "linear-gradient(90deg, #7c3aed, #a78bfa)",
                boxShadow: "0 0 10px rgba(167,139,250,0.45)",
                transition: "width 0.6s ease",
              }} />
            </div>
          </div>
        )}



      </div>

      {/* ── Currency Picker Modal ── */}
      {showCurrencyPicker && (
        <div
          data-testid="modal-currency-picker"
          onClick={() => { setShowCurrencyPicker(false); setShowAddCurrency(false); }}
          style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-end" }}
        >
          <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxHeight: "85vh", overflowY: "auto", borderRadius: "24px 24px 0 0", background: "#0f1528", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 -8px 40px rgba(0,0,0,0.40)", padding: "0 0 40px" }}>
            <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 0" }}>
              <div style={{ width: 40, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.15)" }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px 8px" }}>
              <div>
                {showAddCurrency && (
                  <button onClick={() => setShowAddCurrency(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700, color: "#a0bcff", padding: 0 }}>← Back</button>
                )}
                <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: 3, color: "rgba(255,255,255,0.70)", marginTop: 4 }}>
                  {showAddCurrency ? t.addCurrency.toUpperCase() : t.selectCurrency}
                </div>
              </div>
              <button data-testid="btn-close-currency-picker" onClick={() => { setShowCurrencyPicker(false); setShowAddCurrency(false); }} style={{ width: 30, height: 30, borderRadius: "50%", border: "none", cursor: "pointer", background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.50)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>×</button>
            </div>
            <div style={{ padding: "4px 16px 8px" }}>
              {!showAddCurrency ? (
                <>
                  {enabledCurrencies.map(cur => {
                    const isPrimary = cur === primaryCurrency;
                    return (
                      <div key={cur} style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 6 }}>
                        <div data-testid={`currency-pick-${cur}`} role="button" tabIndex={0}
                          onClick={() => { saveCurrencySettings(enabledCurrencies, cur); setActiveWallet(cur); setShowCurrencyPicker(false); setShowAddCurrency(false); }}
                          onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); saveCurrencySettings(enabledCurrencies, cur); setActiveWallet(cur); setShowCurrencyPicker(false); setShowAddCurrency(false); } }}
                          style={{ flex: 1, display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", borderRadius: 16, background: isPrimary ? "rgba(247,210,72,0.08)" : "rgba(255,255,255,0.04)", border: `1.5px solid ${isPrimary ? "rgba(247,210,72,0.35)" : "rgba(255,255,255,0.07)"}`, cursor: "pointer", textAlign: "left" }}
                        >
                          <span style={{ fontSize: 26 }}>{WALLET_FLAGS[cur]}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: isPrimary ? "#f7d248" : th.textPrimary }}>{cur}</div>
                            <div style={{ fontSize: 14, color: th.textMuted, marginTop: 1 }}>{getCurrencyName(cur, lang)}</div>
                          </div>
                          {isPrimary && <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 1.2, color: "#f7d248", background: "rgba(247,210,72,0.15)", padding: "3px 8px", borderRadius: 99 }}>{t.primaryBadge}</div>}
                        </div>
                        {enabledCurrencies.length > 1 && !isPrimary && (
                          <button data-testid={`btn-remove-currency-${cur}`}
                            onClick={() => { const next = enabledCurrencies.filter(c => c !== cur); saveCurrencySettings(next, primaryCurrency); if (activeWallet === cur) setActiveWallet(primaryCurrency); }}
                            style={{ width: 32, height: 32, borderRadius: "50%", border: "none", cursor: "pointer", background: "rgba(255,80,80,0.15)", color: "#ff8080", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}
                          >×</button>
                        )}
                      </div>
                    );
                  })}
                  <button data-testid="btn-add-currency" onClick={() => setShowAddCurrency(true)} style={{ width: "100%", padding: "14px 16px", borderRadius: 16, marginTop: 4, border: "1.5px dashed rgba(255,255,255,0.12)", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, color: "rgba(255,255,255,0.65)", fontSize: 14, fontWeight: 700 }}>
                    <span style={{ fontSize: 20 }}>+</span> {t.addCurrency}
                  </button>
                </>
              ) : (
                (() => {
                  const allCurrencies: CurrencyCode[] = ["NOK","USD","EUR","GBP","CHF","PLN","SEK","DKK","CAD","AUD","JPY"];
                  const available = allCurrencies.filter(c => !enabledCurrencies.includes(c));
                  return available.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "30px 0", color: th.textMuted, fontSize: 14 }}>All currencies already added.</div>
                  ) : available.map(cur => (
                    <button key={cur} data-testid={`currency-add-${cur}`}
                      onClick={() => { const next = [...enabledCurrencies, cur]; saveCurrencySettings(next, primaryCurrency); setShowAddCurrency(false); }}
                      style={{ width: "100%", display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", borderRadius: 16, marginBottom: 6, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", cursor: "pointer", textAlign: "left" }}
                    >
                      <span style={{ fontSize: 26 }}>{WALLET_FLAGS[cur]}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: th.textPrimary }}>{cur}</div>
                        <div style={{ fontSize: 14, color: th.textMuted, marginTop: 1 }}>{getCurrencyName(cur, lang)}</div>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: th.textMuted, background: "rgba(255,255,255,0.07)", padding: "3px 8px", borderRadius: 99 }}>{CURRENCY_SYMBOLS[cur]}</div>
                      <div style={{ width: 28, height: 28, borderRadius: "50%", flexShrink: 0, background: "rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, color: "rgba(255,255,255,0.50)" }}>+</div>
                    </button>
                  ));
                })()
              )}
            </div>
          </div>
        </div>
      )}

      {/* ——— Modal: Alert kursowy ——— */}
      {showAlertModal && (
        <div
          onClick={() => setShowAlertModal(false)}
          style={{ position: "fixed", inset: 0, zIndex: 9998, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "flex-end" }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ width: "100%", background: "var(--background,#0d0d0f)", borderRadius: "24px 24px 0 0", padding: "24px 20px 44px", boxShadow: "0 -8px 40px rgba(0,0,0,0.5)" }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <h3 style={{ fontWeight: 900, fontSize: 18, color: "white", margin: 0 }}>🔔 {lang === "pl" ? "Alert kursowy" : "Rate Alert"}</h3>
              <button onClick={() => setShowAlertModal(false)} style={{ background: "rgba(255,255,255,0.08)", border: "none", borderRadius: "50%", width: 30, height: 30, cursor: "pointer", color: "rgba(255,255,255,0.5)", fontSize: 16 }}>×</button>
            </div>

            <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
              {(["EUR","USD","GBP","CHF","NOK"] as const).map(c => (
                <button key={c} onClick={() => setAlertFrom(c)} style={{ flex: 1, padding: "8px 0", borderRadius: 10, border: `1.5px solid ${alertFrom === c ? "rgba(212,160,32,0.5)" : "rgba(255,255,255,0.08)"}`, background: alertFrom === c ? "rgba(212,160,32,0.12)" : "rgba(255,255,255,0.04)", color: alertFrom === c ? "var(--primary,#D4A020)" : "rgba(255,255,255,0.55)", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>{c}</button>
              ))}
            </div>

            <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>{lang === "pl" ? "Powiadom gdy kurs" : "Alert when rate is"}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
              {[{ v: "above" as const, l: lang === "pl" ? "Powyżej" : "Above" }, { v: "below" as const, l: lang === "pl" ? "Poniżej" : "Below" }].map(opt => (
                <button key={opt.v} onClick={() => setAlertCondition(opt.v)} style={{ padding: "10px 0", borderRadius: 12, border: `1.5px solid ${alertCondition === opt.v ? "rgba(212,160,32,0.5)" : "rgba(255,255,255,0.08)"}`, background: alertCondition === opt.v ? "rgba(212,160,32,0.12)" : "rgba(255,255,255,0.04)", color: alertCondition === opt.v ? "var(--primary,#D4A020)" : "rgba(255,255,255,0.55)", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>{opt.l}</button>
              ))}
            </div>

            <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>{lang === "pl" ? `Próg kursu ${alertFrom}/${alertTo}` : `${alertFrom}/${alertTo} threshold`}</div>
            <input
              type="number" inputMode="decimal" step="0.0001"
              placeholder={`np. ${(fxRates as any)[alertFrom] ? ((fxRates as any)[alertTo] / (fxRates as any)[alertFrom]).toFixed(4) : "4.2500"}`}
              value={alertThreshold}
              onChange={e => setAlertThreshold(e.target.value)}
              style={{ width: "100%", padding: "13px 16px", borderRadius: 14, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)", color: "white", fontSize: 16, fontWeight: 700, outline: "none", boxSizing: "border-box", marginBottom: 16 }}
            />

            <button
              onClick={() => {
                if (!alertThreshold) return;
                const alerts = JSON.parse(localStorage.getItem("itemprise_fx_alerts") || "[]");
                alerts.push({ from: alertFrom, to: alertTo, threshold: parseFloat(alertThreshold), condition: alertCondition, createdAt: Date.now() });
                localStorage.setItem("itemprise_fx_alerts", JSON.stringify(alerts));
                addNotification({ type: "info", title: "🔔 Alert ustawiony", message: `${alertFrom}/${alertTo} ${alertCondition === "above" ? ">" : "<"} ${alertThreshold}` });
                setAlertThreshold("");
                setShowAlertModal(false);
              }}
              style={{ width: "100%", padding: "14px", borderRadius: 14, background: "linear-gradient(180deg,#fff4b8 0%,#f9d95e 22%,#d4a020 62%,#b8880a 100%)", color: "#1a1400", border: "none", fontSize: 15, fontWeight: 900, cursor: "pointer" }}
            >
              {lang === "pl" ? "Zapisz alert" : "Save alert"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
