import { useLocation } from "wouter";
import {
  Sparkles, ArrowDownLeft, MoreHorizontal,
  ArrowUpRight, Eye, EyeOff, ArrowLeftRight, Loader2,
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

type TileKey = "FORECAST" | "REQUEST" | "INVEST" | "CARDS";

const TILE: Record<TileKey, { bg: string; iconColor: string; shadow: string; border: string }> = {
  FORECAST: {
    bg:        "linear-gradient(160deg, rgba(140,10,55,0.72) 0%, rgba(70,4,26,0.90) 100%)",
    iconColor: "#ff5fa0",
    border:    "rgba(220,30,110,0.22)",
    shadow:    "0 6px 18px rgba(180,10,80,0.22), inset 0 1.5px 0 rgba(255,150,200,0.14), inset 0 -1.5px 0 rgba(0,0,0,0.40)",
  },
  REQUEST: {
    bg:        "linear-gradient(160deg, rgba(140,10,55,0.72) 0%, rgba(70,4,26,0.90) 100%)",
    iconColor: "#ff5fa0",
    border:    "rgba(220,30,110,0.22)",
    shadow:    "0 6px 18px rgba(180,10,80,0.22), inset 0 1.5px 0 rgba(255,150,200,0.14), inset 0 -1.5px 0 rgba(0,0,0,0.40)",
  },
  INVEST: {
    bg:        "linear-gradient(160deg, rgba(10,80,44,0.80) 0%, rgba(4,34,18,0.95) 100%)",
    iconColor: "#24d487",
    border:    "rgba(36,212,135,0.22)",
    shadow:    "0 6px 18px rgba(20,180,90,0.18), inset 0 1.5px 0 rgba(100,255,180,0.12), inset 0 -1.5px 0 rgba(0,0,0,0.40)",
  },
  CARDS: {
    bg:        "linear-gradient(160deg, rgba(18,42,100,0.72) 0%, rgba(8,20,52,0.90) 100%)",
    iconColor: "#a0bcff",
    border:    "rgba(100,150,255,0.20)",
    shadow:    "0 6px 18px rgba(60,100,255,0.15), inset 0 1.5px 0 rgba(160,200,255,0.10), inset 0 -1.5px 0 rgba(0,0,0,0.40)",
  },
};



export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { user, transactions, notifications, conversations, wallets, exchangeCurrency, fxRates, ratesUpdatedAt, ratesUnavailable, enabledCurrencies, primaryCurrency, saveCurrencySettings } = useAppStore();
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

  const [cardStats, setCardStats] = useState<{ total: number; active: number } | null>(null);
  useEffect(() => {
    fetch("/api/cards")
      .then(r => r.ok ? r.json() : [])
      .then((cards: { status: string }[]) => {
        const active = cards.filter(c => c.status === "active").length;
        setCardStats({ total: cards.length, active });
      })
      .catch(() => {});
  }, []);

  const activeBalance = wallets[activeWallet] ?? 0;

  // Sync activeWallet when primaryCurrency loads from Firebase after login
  useEffect(() => {
    setActiveWallet(primaryCurrency);
  }, [primaryCurrency]);

  // Smart default: set exFrom to the currency with the highest non-zero balance
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

  type QuickAction = { icon: React.ReactNode; label: TileKey; labelKey: "forecast"|"request"|"invest"|"exchange"|"cards"; feature: FeatureKey; onClick: () => void; testId: string };
  const quickActions: QuickAction[] = ([
    { icon: <Sparkles size={22} />,       label: "FORECAST" as TileKey, labelKey: "forecast", feature: "budget-forecast" as FeatureKey, onClick: () => setLocation("/budget"),                                                   testId: "action-forecast" },
    { icon: <ArrowDownLeft size={22} />,  label: "REQUEST"  as TileKey, labelKey: "request",  feature: "transfer"        as FeatureKey, onClick: () => setLocation("/transfer?mode=request"),                                    testId: "action-request"  },
    { icon: <ArrowLeftRight size={22} />, label: "INVEST"   as TileKey, labelKey: "exchange", feature: "transfer"        as FeatureKey, onClick: () => { setShowExchange(s => !s); setExResult(null); setExError(null); },       testId: "action-exchange" },
    { icon: <MoreHorizontal size={22} />, label: "CARDS"    as TileKey, labelKey: "cards",    feature: "cards"           as FeatureKey, onClick: () => setLocation("/cards"),                                                    testId: "action-cards"    },
  ] as QuickAction[]).filter(a => isEnabled(a.feature));

  const goldStyle: React.CSSProperties = {
    background: th.primaryGradient,
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    backgroundClip: "text",
  };

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
      position: "relative", paddingBottom: "calc(120px + env(safe-area-inset-bottom))", overflowX: "hidden",
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

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, position: "relative" }}>
              <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: 3.6, ...goldStyle }}>
                {t.totalWealth}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {/* Active wallet badge — clickable to open currency picker */}
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
                {/* Eye toggle */}
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
                <div style={{ marginTop: 5, fontSize: 11, color: "rgba(255,255,255,0.28)", letterSpacing: 0.8 }}>
                  Kursy: {ratesUpdatedLabel}
                </div>
              )}
              <div style={{ position: "absolute", bottom: -10, left: 0, width: "55%", height: 1,
                background: `linear-gradient(90deg, ${th.glow}, transparent)` }} />
            </div>

            <div style={{ marginTop: 28, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <button
                data-testid="btn-add-funds"
                onClick={() => setLocation("/wallet/top-up")}
                onMouseDown={e => { e.currentTarget.style.transform = "scale(0.96)"; }}
                onMouseUp={e => { e.currentTarget.style.transform = "scale(1)"; }}
                onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}
                onTouchStart={e => { e.currentTarget.style.transform = "scale(0.96)"; }}
                onTouchEnd={e => { e.currentTarget.style.transform = "scale(1)"; }}
                style={{
                  height: 56, borderRadius: 999, border: "none", cursor: "pointer",
                  fontSize: 14, fontWeight: 800, color: th.primaryBtnColor, letterSpacing: 0.3,
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

              <button
                data-testid="btn-transfer"
                onClick={() => setLocation("/transfer")}
                onMouseDown={e => { e.currentTarget.style.transform = "scale(0.96)"; }}
                onMouseUp={e => { e.currentTarget.style.transform = "scale(1)"; }}
                onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}
                onTouchStart={e => { e.currentTarget.style.transform = "scale(0.96)"; }}
                onTouchEnd={e => { e.currentTarget.style.transform = "scale(1)"; }}
                style={{
                  height: 56, borderRadius: 999, cursor: "pointer",
                  fontSize: 14, fontWeight: 700,
                  color: th.secondaryBtnColor,
                  letterSpacing: 0.3,
                  background: th.secondaryBtnBg,
                  border: `1px solid ${th.secondaryBtnBorder}`,
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06), 0 4px 14px rgba(0,0,0,0.20)",
                  transition: "transform 0.15s ease",
                }}
              >
                {t.transfer}
              </button>
            </div>
          </div>
        </div>

        {/* ── Currency Accounts ── */}
        <div style={{ marginTop: 14 }}>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10,
          }}>
            <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: 3, color: th.textMuted }}>
              {t.currencies}
            </div>
          </div>

          {/* Wallet scroll with right fade */}
          <div style={{ position: "relative" }}>
            <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4, scrollbarWidth: "none" }}>
              {enabledCurrencies.map(cur => {
                const active = activeWallet === cur;
                const curRate = fxRates[cur];
                const tileValue = curRate && curRate > 0 ? parseFloat((totalUSD * curRate).toFixed(2)) : 0;
                return (
                  <button
                    key={cur}
                    data-testid={`wallet-card-${cur}`}
                    onClick={() => setActiveWallet(cur)}
                    style={{
                      flexShrink: 0, width: 148, borderRadius: r.md, padding: "14px 16px",
                      display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6,
                      textAlign: "left", cursor: "pointer",
                      border: `1.5px solid ${active ? th.activeTileBorder : "rgba(255,255,255,0.08)"}`,
                      background: active ? th.activeTileBg : "rgba(255,255,255,0.03)",
                      boxShadow: active ? th.activeTileGlow : "0 4px 12px rgba(0,0,0,0.28)",
                      transition: "all 0.22s ease",
                    }}
                  >
                    <span style={{ fontSize: 28, lineHeight: 1 }}>{WALLET_FLAGS[cur]}</span>
                    <span style={{
                      fontSize: 18, fontWeight: 800, letterSpacing: -0.5, lineHeight: 1.1,
                      color: active ? th.activeTileColor : th.textPrimary,
                      whiteSpace: "nowrap",
                    }}>
                      {balanceVisible ? formatMoneyCompact(tileValue, cur) : "•••"}
                    </span>
                    <span style={{
                      fontSize: 11, letterSpacing: 0.3, lineHeight: 1.2,
                      color: th.textMuted, whiteSpace: "nowrap",
                      overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%",
                    }}>
                      {getCurrencyName(cur, lang)}
                    </span>
                  </button>
                );
              })}
            </div>
            {/* Right fade overlay to hint at more cards */}
            <div style={{
              position: "absolute", top: 0, right: 0, bottom: 4, width: 56,
              background: `linear-gradient(90deg, transparent, ${th.pageBg})`,
              pointerEvents: "none",
            }} />
          </div>

          {/* Exchange panel */}
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

              {/* From / To row */}
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: 1.5, color: th.textMuted, marginBottom: 3, textTransform: "uppercase" }}>Z waluty</div>
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
                      ? `Brak środków w ${exFrom}. Wybierz walutę, w której masz saldo.`
                      : `Dostępne: ${formatMoney(wallets[exFrom] ?? 0, exFrom)}`
                    }
                  </div>
                </div>
                <div style={{ paddingTop: 26, flexShrink: 0 }}>
                  <ArrowLeftRight size={16} color={th.textMuted} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: 1.5, color: th.textMuted, marginBottom: 3, textTransform: "uppercase" }}>Na walutę</div>
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

              {/* Rate info + updated label */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontSize: 14, color: th.textMuted, letterSpacing: 0.5 }}>
                  {ratesUnavailable
                    ? "Kursy walut tymczasowo niedostępne"
                    : `1 ${exFrom} = ${(fxRates[exTo] / fxRates[exFrom]).toFixed(4)} ${exTo}`
                  }
                </div>
                {ratesUpdatedLabel && !ratesUnavailable && (
                  <div style={{ fontSize: 14, color: th.textMuted, letterSpacing: 0.3 }}>
                    Kursy: {ratesUpdatedLabel}
                  </div>
                )}
              </div>

              {/* Amount input + button */}
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
                  {exLoading
                    ? <Loader2 size={14} className="animate-spin" />
                    : t.convert
                  }
                </button>
              </div>

              {/* Result or error */}
              {exResult && (
                <div style={{
                  marginTop: 10, borderRadius: 10, padding: "10px 14px",
                  background: "rgba(36,212,135,0.10)",
                  border: "1px solid rgba(36,212,135,0.25)",
                  fontSize: 14, fontWeight: 700,
                  color: "#70f0aa",
                }}>
                  ✓ Wymiana zakończona — {formatMoney(exResult.fromAmount, exResult.from)} → {formatMoney(exResult.received, exResult.currency)}
                </div>
              )}
              {exError && (
                <div style={{
                  marginTop: 10, borderRadius: 10, padding: "10px 14px",
                  background: "rgba(255,80,80,0.10)",
                  border: "1px solid rgba(255,80,80,0.25)",
                  fontSize: 14, fontWeight: 700,
                  color: "#ff8080",
                }}>
                  <div>{exError}</div>
                  {exError === "Brak wystarczających środków" && exAmount && parseFloat(exAmount) > 0 && (
                    <>
                      <div style={{ marginTop: 4, fontWeight: 600, opacity: 0.85 }}>
                        Dostępne: {formatMoney(wallets[exFrom] ?? 0, exFrom)}
                      </div>
                      <div style={{ fontWeight: 600, opacity: 0.85 }}>
                        Brakuje: {formatMoney(Math.max(0, parseFloat(exAmount) - (wallets[exFrom] ?? 0)), exFrom)}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Quick Actions ── */}
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 3.5, color: th.textMuted, marginBottom: 10, textTransform: "uppercase" }}>
            Szybkie akcje
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
            {quickActions.map(action => {
              const tile = tileConfig[action.label];
              return (
                <div
                  key={action.label}
                  data-testid={action.testId}
                  onClick={action.onClick}
                  onMouseDown={e => { e.currentTarget.style.transform = "scale(0.93)"; }}
                  onMouseUp={e => { e.currentTarget.style.transform = "scale(1)"; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}
                  onTouchStart={e => { e.currentTarget.style.transform = "scale(0.93)"; }}
                  onTouchEnd={e => { e.currentTarget.style.transform = "scale(1)"; }}
                  style={{
                    aspectRatio: "1 / 1", borderRadius: r.md, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: tile.bg, border: `1px solid ${tile.border}`,
                    boxShadow: tile.shadow, color: tile.iconColor,
                    position: "relative", overflow: "hidden",
                    transition: "transform 0.15s ease, background 0.4s ease",
                  }}
                >
                  {/* sheen overlays */}
                  <div style={{ position: "absolute", top: 0, left: "10%", right: "10%", height: 1,
                    background: "rgba(255,255,255,0.20)", pointerEvents: "none" }} />
                  <div style={{ position: "absolute", top: 0, left: "10%", right: "10%", height: "42%",
                    background: "linear-gradient(180deg, rgba(255,255,255,0.08) 0%, transparent 100%)",
                    borderRadius: "0 0 50% 50%", pointerEvents: "none" }} />
                  {/* icon — stays centered */}
                  <div style={{ display: "flex", filter: `drop-shadow(0 2px 5px rgba(0,0,0,0.50)) drop-shadow(0 0 4px ${tile.iconColor}44)` }}>
                    {action.icon}
                  </div>
                  {/* label pinned to bottom of tile */}
                  <div style={{
                    position: "absolute", bottom: 8, left: 2, right: 2,
                    fontSize: 10, letterSpacing: 1.5, fontWeight: 800,
                    color: "rgba(255,255,255,0.85)", textAlign: "center",
                    textShadow: "0 1px 2px rgba(0,0,0,0.70)",
                    lineHeight: 1.1,
                  }}>
                    {t[action.labelKey]}
                  </div>
                </div>
              );
            })}
          </div>
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

          {/* Three-row breakdown: Wpływy / Wydatki / Bilans */}
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10, position: "relative" }}>
            {[
              { label: "Wpływy", value: monthIn, color: "#24d487", sign: "+" },
              { label: "Wydatki", value: monthOut, color: "#ff8080", sign: "−" },
              { label: "Bilans miesiąca", value: monthBalance, color: monthBalance >= 0 ? "#24d487" : "#ff8080", sign: monthBalance >= 0 ? "+" : "" },
            ].map(({ label, value, color, sign }) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 13, color: th.textMuted, fontWeight: 600 }}>{label}</div>
                <div style={{ fontSize: 14, fontWeight: 800, color }}>
                  {sign}{Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
            ))}
          </div>

          {/* Separator */}
          <div style={{ marginTop: 12, height: 1, background: "rgba(255,255,255,0.06)" }} />

          {/* Trend badge + history link */}
          <div style={{ marginTop: 10, display: "flex", alignItems: "center", justifyContent: "space-between", position: "relative" }}>
            <div style={{
              padding: "3px 9px", borderRadius: 999,
              fontSize: 12, fontWeight: 700,
              color: trendColor === "positive" ? "#7df0ba" : "#ff8080",
              background: trendColor === "positive" ? "rgba(35,183,118,0.16)" : "rgba(200,30,80,0.18)",
              border: `1px solid ${trendColor === "positive" ? "rgba(80,225,155,0.24)" : "rgba(200,30,80,0.30)"}`,
            }}>
              vs. poprzedni miesiąc {trendLabel}
            </div>
            <button
              onClick={() => setLocation("/history")}
              style={{
                fontSize: 12, fontWeight: 800, letterSpacing: 1.5,
                color: th.primary, background: "none", border: "none",
                cursor: "pointer", textTransform: "uppercase", padding: 0,
              }}
            >
              HISTORIA →
            </button>
          </div>

          {/* Progress bar */}
          <div style={{ marginTop: 10, height: 3, borderRadius: 99, background: "rgba(255,255,255,0.05)" }}>
            <div style={{
              height: "100%", width: barWidth, borderRadius: 99,
              background: "linear-gradient(90deg, rgba(36,212,135,0.5), rgba(36,212,135,0.9))",
              boxShadow: "0 0 8px rgba(36,212,135,0.50)",
              transition: "width 0.6s ease",
            }} />
          </div>
        </div>

        {/* ── Cards Summary ── */}
        {cardStats !== null && (
          <div
            data-testid="dashboard-cards-summary"
            style={{
              marginTop: 14, borderRadius: r.md, padding: "14px 18px",
              background: th.cardAltBg, border: `1px solid ${th.border}`,
              boxShadow: "0 4px 18px rgba(0,0,0,0.32)",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              cursor: "pointer",
            }}
            onClick={() => setLocation("/cards")}
          >
            <div style={{ fontSize: 15, letterSpacing: 2.4, fontWeight: 700, color: th.textMuted }}>
              {t.yourCards}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: th.textPrimary }}>
                <span style={{ color: "#24d487" }}>{cardStats.active}</span>
                <span style={{ color: th.textMuted }}> / {cardStats.total} {t.activeCards}</span>
              </div>
              <div style={{
                padding: "3px 9px", borderRadius: 999,
                fontSize: 13, fontWeight: 800, letterSpacing: 1,
                color: "#7df0ba",
                background: "rgba(35,183,118,0.16)",
                border: "1px solid rgba(80,225,155,0.24)",
              }}>
                {cardStats.active > 0 ? t.activeStatus : t.noCards}
              </div>
            </div>
          </div>
        )}

        {/* ── Recent Operations ── */}
        <div style={{ marginTop: 20 }}>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            marginBottom: 12, borderBottom: `1px solid ${th.sectionBorder}`, paddingBottom: 10,
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: th.textPrimary, letterSpacing: 0.2 }}>
              {t.recentOperations}
            </div>
            <button
              data-testid="btn-see-all"
              onClick={() => setLocation("/history")}
              style={{ fontSize: 13, fontWeight: 800, letterSpacing: 2, color: th.primary,
                background: "none", border: "none", cursor: "pointer", textTransform: "uppercase", padding: 0 }}
            >
              {t.seeAll}
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {transactions.slice(0, 5).map(tx => {
              const isIn = tx.amount > 0;
              return (
                <div
                  key={tx.id}
                  data-testid={`tx-row-${tx.id}`}
                  onClick={() => setLocation(`/transaction/${tx.id}`)}
                  style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "12px 14px", borderRadius: r.md, cursor: "pointer",
                    background: th.txRowBg, border: `1px solid ${th.borderMuted}`,
                    boxShadow: "0 4px 16px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.05)",
                    position: "relative", overflow: "hidden",
                    transition: "background 0.4s ease",
                  }}
                >
                  <div style={{ position: "absolute", top: 0, left: "10%", right: "10%", height: 1,
                    background: `linear-gradient(90deg, transparent, ${th.sheenTop}, transparent)`, pointerEvents: "none" }} />

                  <div style={{
                    width: 42, height: 42, borderRadius: 13, flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: isIn
                      ? "radial-gradient(circle at 35% 30%, rgba(60,220,140,0.38) 0%, rgba(10,60,32,0.90) 60%, rgba(3,20,10,1) 100%)"
                      : "radial-gradient(circle at 35% 30%, rgba(255,100,150,0.32) 0%, rgba(80,10,36,0.90) 60%, rgba(20,3,10,1) 100%)",
                    color: isIn ? c.green : c.pink,
                    border: `1px solid ${isIn ? "rgba(36,212,135,0.24)" : "rgba(255,95,151,0.24)"}`,
                    boxShadow: `0 6px 18px rgba(0,0,0,0.45), inset 0 1.5px 0 ${isIn ? "rgba(100,255,180,0.20)" : "rgba(255,130,170,0.18)"}`,
                  }}>
                    {isIn ? <ArrowDownLeft size={17} /> : <ArrowUpRight size={17} />}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: th.textPrimary,
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {tx.title}
                    </div>
                    <div style={{ fontSize: 13, color: th.subLabelColor, marginTop: 2 }}>
                      {tx.subtitle}
                    </div>
                  </div>

                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{
                      fontSize: 13, fontWeight: 700,
                      color: isIn ? "#24d487" : th.textPrimary,
                    }}>
                      {isIn ? "+" : ""}{tx.amount.toLocaleString("en-US", { style: "currency", currency: "USD" })}
                    </div>
                    <div style={{ fontSize: 13, color: th.textMuted, marginTop: 2, textTransform: "uppercase", letterSpacing: 1 }}>
                      {new Date(tx.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* ── Currency Picker Modal ── */}
      {showCurrencyPicker && (
        <div
          data-testid="modal-currency-picker"
          onClick={() => { setShowCurrencyPicker(false); setShowAddCurrency(false); }}
          style={{
            position: "fixed", inset: 0, zIndex: 1000,
            background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)",
            display: "flex", alignItems: "flex-end",
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: "100%", maxHeight: "85vh", overflowY: "auto",
              borderRadius: "24px 24px 0 0",
              background: "#0f1528",
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow: "0 -8px 40px rgba(0,0,0,0.40)",
              padding: "0 0 40px",
            }}
          >
            {/* Drag handle */}
            <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 0" }}>
              <div style={{ width: 40, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.15)" }} />
            </div>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px 8px" }}>
              <div>
                {showAddCurrency ? (
                  <button
                    onClick={() => setShowAddCurrency(false)}
                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700, color: "#a0bcff", padding: 0 }}
                  >
                    ← Back
                  </button>
                ) : null}
                <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: 3, color: "rgba(255,255,255,0.70)", marginTop: 4 }}>
                  {showAddCurrency ? t.addCurrency.toUpperCase() : t.selectCurrency}
                </div>
              </div>
              <button
                data-testid="btn-close-currency-picker"
                onClick={() => { setShowCurrencyPicker(false); setShowAddCurrency(false); }}
                style={{
                  width: 30, height: 30, borderRadius: "50%", border: "none", cursor: "pointer",
                  background: "rgba(255,255,255,0.08)",
                  color: "rgba(255,255,255,0.50)",
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
                }}
              >
                ×
              </button>
            </div>

            {/* Currency list */}
            <div style={{ padding: "4px 16px 8px" }}>
              {!showAddCurrency ? (
                <>
                  {enabledCurrencies.map(cur => {
                    const isPrimary = cur === primaryCurrency;
                    return (
                      <div
                        key={cur}
                        style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 6 }}
                      >
                        <div
                          data-testid={`currency-pick-${cur}`}
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            saveCurrencySettings(enabledCurrencies, cur);
                            setActiveWallet(cur);
                            setShowCurrencyPicker(false);
                            setShowAddCurrency(false);
                          }}
                          onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); saveCurrencySettings(enabledCurrencies, cur); setActiveWallet(cur); setShowCurrencyPicker(false); setShowAddCurrency(false); } }}
                          style={{
                            flex: 1, display: "flex", alignItems: "center", gap: 14,
                            padding: "14px 16px", borderRadius: 16,
                            background: isPrimary ? "rgba(247,210,72,0.08)" : "rgba(255,255,255,0.04)",
                            border: `1.5px solid ${isPrimary ? "rgba(247,210,72,0.35)" : "rgba(255,255,255,0.07)"}`,
                            cursor: "pointer", textAlign: "left",
                          }}
                        >
                          <span style={{ fontSize: 26 }}>{WALLET_FLAGS[cur]}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: isPrimary ? "#f7d248" : th.textPrimary }}>{cur}</div>
                            <div style={{ fontSize: 14, color: th.textMuted, marginTop: 1 }}>{getCurrencyName(cur, lang)}</div>
                          </div>
                          {isPrimary && (
                            <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 1.2, color: "#f7d248", background: "rgba(247,210,72,0.15)", padding: "3px 8px", borderRadius: 99 }}>
                              {t.primaryBadge}
                            </div>
                          )}
                        </div>
                        {enabledCurrencies.length > 1 && !isPrimary && (
                          <button
                            data-testid={`btn-remove-currency-${cur}`}
                            onClick={() => {
                              const next = enabledCurrencies.filter(c => c !== cur);
                              saveCurrencySettings(next, primaryCurrency);
                              if (activeWallet === cur) setActiveWallet(primaryCurrency);
                            }}
                            style={{
                              width: 32, height: 32, borderRadius: "50%", border: "none", cursor: "pointer",
                              background: "rgba(255,80,80,0.15)",
                              color: "#ff8080",
                              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0,
                            }}
                          >
                            ×
                          </button>
                        )}
                      </div>
                    );
                  })}

                  {/* Add currency button */}
                  <button
                    data-testid="btn-add-currency"
                    onClick={() => setShowAddCurrency(true)}
                    style={{
                      width: "100%", padding: "14px 16px", borderRadius: 16, marginTop: 4,
                      border: "1.5px dashed rgba(255,255,255,0.12)",
                      background: "transparent", cursor: "pointer",
                      display: "flex", alignItems: "center", gap: 10,
                      color: "rgba(255,255,255,0.65)",
                      fontSize: 14, fontWeight: 700,
                    }}
                  >
                    <span style={{ fontSize: 20 }}>+</span> {t.addCurrency}
                  </button>
                </>
              ) : (
                /* Add currency view */
                (() => {
                  const allCurrencies: CurrencyCode[] = ["NOK","USD","EUR","GBP","CHF","PLN","SEK","DKK","CAD","AUD","JPY"];
                  const available = allCurrencies.filter(c => !enabledCurrencies.includes(c));
                  return available.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "30px 0", color: th.textMuted, fontSize: 14 }}>
                      All currencies are already added.
                    </div>
                  ) : available.map(cur => (
                    <button
                      key={cur}
                      data-testid={`currency-add-${cur}`}
                      onClick={() => {
                        const next = [...enabledCurrencies, cur];
                        saveCurrencySettings(next, primaryCurrency);
                        setShowAddCurrency(false);
                      }}
                      style={{
                        width: "100%", display: "flex", alignItems: "center", gap: 14,
                        padding: "14px 16px", borderRadius: 16, marginBottom: 6,
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.07)",
                        cursor: "pointer", textAlign: "left",
                      }}
                    >
                      <span style={{ fontSize: 26 }}>{WALLET_FLAGS[cur]}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: th.textPrimary }}>{cur}</div>
                        <div style={{ fontSize: 14, color: th.textMuted, marginTop: 1 }}>{getCurrencyName(cur, lang)}</div>
                      </div>
                      <div style={{
                        fontSize: 13, fontWeight: 700, color: th.textMuted,
                        background: "rgba(255,255,255,0.07)",
                        padding: "3px 8px", borderRadius: 99,
                      }}>
                        {CURRENCY_SYMBOLS[cur]}
                      </div>
                      <div style={{
                        width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                        background: "rgba(255,255,255,0.08)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 16, color: "rgba(255,255,255,0.50)",
                      }}>
                        +
                      </div>
                    </button>
                  ));
                })()
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
