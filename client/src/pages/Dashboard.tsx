import { useLocation } from "wouter";
import { StorageKeys } from "@/lib/localStore";
import {
  ArrowLeftRight, Eye, EyeOff, Plus, Clock, Target, BarChart2, ChevronRight,
  Bell, Sparkles,
} from "lucide-react";
import {
  useAppStore, CurrencyCode, CURRENCY_SYMBOLS, WALLET_FLAGS, formatMoney,
  getCurrencyName, CORE_WALLET_CURRENCIES,
} from "@/lib/store";
import { useTheme } from "@/context/ThemeContext";
import { useLang } from "@/context/LanguageContext";
import { useFeatures } from "@/hooks/useFeatures";
import { type FeatureKey } from "@/lib/features";
import React, { useState, useEffect, useMemo } from "react";
import { FloatingTopPanel } from "@/components/FloatingTopPanel";
import {
  Amount, Badge, Button, Card, Chip, Delta, Divider, Eyebrow, IconButton,
  ListRow, Meter, Row, Section, Sheet, Stack, Text, asStyle,
} from "@/design/primitives";
import { GUTTER, control, radius, space, type as typeScale } from "@/design/tokens";

/**
 * ── Home ──────────────────────────────────────────────────────────────────
 *
 * Reading order, top to bottom, is the whole design:
 *
 *   1. WHO you are          — header, one line, then it gets out of the way
 *   2. HOW MUCH you have    — one number, the largest thing on the screen
 *   3. WHAT you can do      — exactly two actions, one of them primary
 *   4. WHAT HAPPENED        — this month, in and out, with one comparison
 *   5. WHAT NEEDS YOU       — goals, deadlines: only when they exist
 *
 * Everything below the balance is progressive disclosure. A finance home
 * screen that opens with eight equally-loud tiles makes the user do the
 * triage the product should have done for them.
 */

const CATEGORY_EMOJI: Record<string, string> = {
  food: "🍕", jedzenie: "🍕", restauracja: "🍕", restaurant: "🍕",
  transport: "🚗", uber: "🚗", taxi: "🚗",
  shopping: "🛍️", zakupy: "🛍️",
  contract: "📋", umowa: "📋",
  exchange: "💱", wymiana: "💱",
  health: "💊", zdrowie: "💊", apteka: "💊",
  entertainment: "🎬", rozrywka: "🎬",
  travel: "✈️", podróż: "✈️",
  salary: "💰", wynagrodzenie: "💰", przelew: "💸",
  housing: "🏠", mieszkanie: "🏠", czynsz: "🏠",
  sport: "🏋️", fitness: "🏋️",
  education: "📚", edukacja: "📚",
};

function getCatEmoji(category?: string): string {
  if (!category) return "💳";
  return CATEGORY_EMOJI[category.toLowerCase().trim()] ?? "💳";
}

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const {
    user, transactions, wallets, exchangeCurrency, fxRates, ratesUpdatedAt,
    ratesUnavailable, enabledCurrencies, primaryCurrency, saveCurrencySettings,
    addNotification,
  } = useAppStore();
  const { th } = useTheme();
  const { t, lang } = useLang();
  const { isEnabled } = useFeatures();

  const [balanceVisible, setBalanceVisible] = useState(true);
  const [activeWallet, setActiveWallet] = useState<CurrencyCode>(primaryCurrency);
  const [showExchange, setShowExchange] = useState(false);
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const [showAddCurrency, setShowAddCurrency] = useState(false);
  const [exFrom, setExFrom] = useState<CurrencyCode>(primaryCurrency);
  const [exTo, setExTo] = useState<CurrencyCode>("EUR");
  const [exAmount, setExAmount] = useState("");
  const [exResult, setExResult] = useState<{ received: number; currency: CurrencyCode; from: CurrencyCode; fromAmount: number } | null>(null);
  const [exError, setExError] = useState<string | null>(null);
  const [exLoading, setExLoading] = useState(false);

  const [showAlertModal, setShowAlertModal] = useState(false);
  const [alertFrom, setAlertFrom] = useState("EUR");
  const [alertTo] = useState("PLN");
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
      const stored = localStorage.getItem(StorageKeys.CURRENCY_ALERTS);
      if (!stored || !fxRates) return;
      const alerts: CurrencyAlert[] = JSON.parse(stored);
      alerts.forEach(alert => {
        if (alert.triggered) return;
        const rates = fxRates as Record<string, number>;
        const rate = rates[`${alert.from}_${alert.to}`] || (rates[alert.from] && rates[alert.to] ? rates[alert.to] / rates[alert.from] : null);
        if (!rate) return;
        const triggered = alert.condition === "above" ? rate > alert.threshold : rate < alert.threshold;
        if (triggered) {
          addNotification({
            title: `${alert.from}/${alert.to}`,
            message: `Kurs ${alert.from}/${alert.to} ${alert.condition === "above" ? "przekroczył" : "spadł poniżej"} ${alert.threshold}. Aktualnie: ${rate.toFixed(4)}`,
            type: "alert",
            category: "payment",
            priority: "high",
          });
          const updated = alerts.map(a => (a.id === alert.id ? { ...a, triggered: true } : a));
          localStorage.setItem(StorageKeys.CURRENCY_ALERTS, JSON.stringify(updated));
        }
      });
    } catch {}
  }, [fxRates]); // eslint-disable-line react-hooks/exhaustive-deps

  const [contractCount, setContractCount] = useState<{ active: number; total: number; needsAction: number; overdue: number }>({ active: 0, total: 0, needsAction: 0, overdue: 0 });
  const [upcomingDeadlines, setUpcomingDeadlines] = useState<Array<{ id: string; title: string; deadline: string; daysLeft: number }>>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(StorageKeys.CONTRACTS);
      if (!stored) return;
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const in7 = new Date(today); in7.setDate(in7.getDate() + 7);
      const ags = JSON.parse(stored) as Array<{ id?: string; phase?: string; data?: { deadlineSingle?: string; deadlineTo?: string; loanReturnDate?: string; category?: string; subcategory?: string; customTitle?: string } }>;

      setContractCount({
        total: ags.length,
        active: ags.filter(a => a.phase && a.phase !== "completed").length,
        needsAction: ags.filter(a => a.phase === "awaiting_release").length,
        overdue: ags.filter(a => {
          if (a.phase === "completed") return false;
          const d = a.data?.category === "wypozyczenie" ? a.data?.loanReturnDate : a.data?.deadlineSingle;
          return d ? new Date(d) < today : false;
        }).length,
      });

      setUpcomingDeadlines(
        ags
          .filter(a => {
            if (a.phase === "completed") return false;
            const d = a.data?.deadlineSingle || a.data?.deadlineTo || a.data?.loanReturnDate;
            if (!d) return false;
            const dt = new Date(d); dt.setHours(0, 0, 0, 0);
            return dt >= today && dt <= in7;
          })
          .slice(0, 3)
          .map(a => {
            const d = a.data?.deadlineSingle || a.data?.deadlineTo || a.data?.loanReturnDate || "";
            const dt = new Date(d); dt.setHours(0, 0, 0, 0);
            return {
              id: a.id || "",
              title: a.data?.customTitle || a.data?.subcategory || a.data?.category || "Umowa",
              deadline: d,
              daysLeft: Math.round((dt.getTime() - today.getTime()) / 86400000),
            };
          }),
      );
    } catch {}
  }, []);

  const activeBalance = wallets[activeWallet] ?? 0;

  useEffect(() => { setActiveWallet(primaryCurrency); }, [primaryCurrency]);

  useEffect(() => {
    const best = CORE_WALLET_CURRENCIES
      .filter(c => (wallets[c] ?? 0) > 0)
      .sort((a, b) => (wallets[b] ?? 0) - (wallets[a] ?? 0))[0] ?? primaryCurrency;
    setExFrom(best);
    setExTo(prev => (prev === best ? (CORE_WALLET_CURRENCIES.find(c => c !== best) ?? "EUR") : prev));
  }, [wallets, primaryCurrency]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalUSD = useMemo(
    () =>
      (Object.keys(wallets) as CurrencyCode[]).reduce((sum, cur) => {
        const rate = fxRates[cur];
        if (!rate || rate <= 0) return sum;
        return sum + (wallets[cur] ?? 0) / rate;
      }, 0),
    [wallets, fxRates],
  );

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
    } catch {
      return null;
    }
  }, [ratesUpdatedAt]);

  const recentInflow = transactions.filter(tx => tx.amount > 0).slice(0, 8).reduce((sum, tx) => sum + tx.amount, 0);

  const { trendPct, barMax, monthIn, monthOut, monthBalance } = useMemo(() => {
    const now = Date.now();
    const d30 = now - 30 * 86400000;
    const d60 = now - 60 * 86400000;
    const thisMonthIn = transactions.filter(tx => tx.amount > 0 && new Date(tx.date).getTime() >= d30).reduce((s, tx) => s + tx.amount, 0);
    const lastMonthIn = transactions.filter(tx => tx.amount > 0 && new Date(tx.date).getTime() >= d60 && new Date(tx.date).getTime() < d30).reduce((s, tx) => s + tx.amount, 0);
    const thisMonthOut = transactions.filter(tx => tx.amount < 0 && new Date(tx.date).getTime() >= d30).reduce((s, tx) => s + Math.abs(tx.amount), 0);
    const pct = lastMonthIn > 0 ? ((thisMonthIn - lastMonthIn) / lastMonthIn) * 100 : thisMonthIn > 0 ? 100 : 0;
    return {
      trendPct: pct,
      barMax: Math.max(thisMonthIn, thisMonthOut, 1),
      monthIn: thisMonthIn,
      monthOut: thisMonthOut,
      monthBalance: thisMonthIn - thisMonthOut,
    };
  }, [transactions, recentInflow]);

  type QuickAction = { icon: React.ReactNode; text: string; feature: FeatureKey; onClick: () => void; testId: string };
  const quickActions: QuickAction[] = ([
    { icon: <Clock size={control.iconMd} />, text: lang === "pl" ? "Historia" : "History", feature: "transfer" as FeatureKey, onClick: () => setLocation("/history"), testId: "action-history" },
    { icon: <Target size={control.iconMd} />, text: lang === "pl" ? "Cele" : "Goals", feature: "transfer" as FeatureKey, onClick: () => setLocation("/savings"), testId: "action-goals" },
    { icon: <BarChart2 size={control.iconMd} />, text: lang === "pl" ? "Budżet" : "Budget", feature: "budget-forecast" as FeatureKey, onClick: () => setLocation("/budget"), testId: "action-budget" },
    { icon: <ArrowLeftRight size={control.iconMd} />, text: lang === "pl" ? "Wymiana" : "Exchange", feature: "transfer" as FeatureKey, onClick: () => { setShowExchange(s => !s); setExResult(null); setExError(null); }, testId: "action-exchange" },
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
      const goals = JSON.parse(localStorage.getItem(StorageKeys.GOALS) || "[]");
      const active = goals.filter((g: any) => g.saved < g.target);
      if (active.length > 0) setTopGoal(active.sort((a: any, b: any) => b.saved / b.target - a.saved / a.target)[0]);
    } catch {}
  }, []);

  const hour = new Date().getHours();
  const greeting = lang === "pl"
    ? hour < 18 ? "Dzień dobry" : "Dobry wieczór"
    : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
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
        setExError(res.error || (lang === "pl" ? "Błąd wymiany" : "Exchange failed"));
      }
    } finally {
      setExLoading(false);
    }
  };

  const fieldStyle: React.CSSProperties = {
    width: "100%",
    height: 44,
    padding: `0 ${space.md}px`,
    borderRadius: radius.xs,
    background: th.surfaceSunken,
    border: `1px solid ${th.line}`,
    color: th.textPrimary,
    ...asStyle(typeScale.secondary),
    outline: "none",
  };

  return (
    <div
      style={{
        minHeight: "100%",
        background: th.pageBg,
        paddingLeft: GUTTER,
        paddingRight: GUTTER,
        paddingBottom: "var(--bottom-safe-space)",
        position: "relative",
      }}
    >
      {/* A single hue wash behind the balance. 5% opacity: felt, not seen. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: 0, left: 0, right: 0, height: 340,
          background: `radial-gradient(120% 70% at 50% 0%, ${th.tint} 0%, transparent 70%)`,
          pointerEvents: "none",
        }}
      />

      <div style={{ position: "relative" }}>
        <FloatingTopPanel />

        {/* ═══ 1 · BALANCE ═══════════════════════════════════════════════ */}
        <Card padding={space.xl} style={{ marginTop: space.lg, borderRadius: radius.xl }}>
          <Row justify="space-between" align="flex-start">
            <div>
              <Eyebrow>{t.totalWealth}</Eyebrow>
              {firstName && (
                <Text variant="caption" tone="tertiary" as="div" style={{ marginTop: 6 }}>
                  {greeting}, {firstName}
                </Text>
              )}
            </div>
            <Row gap={space.sm}>
              <Chip
                testId="btn-currency-pill"
                selected
                onClick={() => { setShowCurrencyPicker(true); setShowAddCurrency(false); }}
              >
                {WALLET_FLAGS[activeWallet]} {activeWallet}
              </Chip>
              <IconButton
                testId="btn-toggle-balance"
                label={balanceVisible ? (lang === "pl" ? "Ukryj saldo" : "Hide balance") : (lang === "pl" ? "Pokaż saldo" : "Show balance")}
                icon={balanceVisible ? <EyeOff size={control.iconSm} /> : <Eye size={control.iconSm} />}
                onClick={() => setBalanceVisible(v => !v)}
                size={34}
              />
            </Row>
          </Row>

          {/* The one number. Solid, tabular, unblurred — legibility is trust. */}
          <div style={{ marginTop: space.lg }}>
            <Amount
              testId="balance-amount"
              value={totalPortfolioInActive}
              currency={activeWallet}
              masked={!balanceVisible}
              size="hero"
            />
          </div>

          {/* Data provenance: when a number came from a rate, say when. */}
          <Row gap={space.sm} style={{ marginTop: space.md, minHeight: 22 }}>
            {ratesUnavailable ? (
              <Badge tone="warning">{lang === "pl" ? "Kursy niedostępne" : "Rates unavailable"}</Badge>
            ) : ratesUpdatedLabel ? (
              <>
                <Text variant="micro" tone="tertiary">
                  {lang === "pl" ? "Kursy z" : "Rates from"} {ratesUpdatedLabel}
                </Text>
                <button
                  onClick={() => setShowAlertModal(true)}
                  aria-label={lang === "pl" ? "Ustaw alert kursowy" : "Set rate alert"}
                  style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", color: th.textTertiary, padding: 0 }}
                >
                  <Bell size={13} />
                  <span style={{ ...asStyle(typeScale.micro) }}>{lang === "pl" ? "Alert" : "Alert"}</span>
                </button>
              </>
            ) : null}
          </Row>

          <Divider style={{ marginTop: space.lg, marginBottom: space.lg }} />

          {/* ═══ 2 · ACTIONS · one primary, one secondary. Never two primaries. */}
          <Row gap={space.sm}>
            <Button
              testId="btn-add-funds"
              variant="primary"
              size="md"
              full
              icon={<Plus size={control.iconSm} />}
              onClick={() => setLocation("/wallet/top-up")}
            >
              {lang === "pl" ? "Doładuj" : "Add funds"}
            </Button>
            <Button
              testId="btn-new-agreement-pill"
              variant="secondary"
              size="md"
              full
              onClick={() => setLocation("/agreements/new?new=1")}
            >
              {lang === "pl" ? "Nowa umowa" : "New contract"}
            </Button>
          </Row>
        </Card>

        {/* ═══ 3 · QUICK ACTIONS ═════════════════════════════════════════ */}
        {quickActions.length > 0 && (
          <Section title={lang === "pl" ? "Skróty" : "Shortcuts"}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: space.sm }}>
              {quickActions.map(action => (
                <button
                  key={action.testId}
                  data-testid={action.testId}
                  onClick={action.onClick}
                  style={{
                    display: "grid",
                    justifyItems: "center",
                    gap: 6,
                    padding: `${space.md}px ${space.xs}px`,
                    minHeight: 74,
                    borderRadius: radius.md,
                    background: th.surface,
                    border: `1px solid ${th.line}`,
                    color: th.textSecondary,
                    cursor: "pointer",
                  }}
                >
                  {action.icon}
                  <span style={{ ...asStyle(typeScale.micro), fontWeight: 600, color: th.textSecondary }}>{action.text}</span>
                </button>
              ))}
            </div>
          </Section>
        )}

        {/* ═══ CURRENCY EXCHANGE — disclosed, never resident ═════════════ */}
        {showExchange && (
          <Card tone="raised" style={{ marginTop: space.md }} className="md-enter">
            <Eyebrow>{t.currencyExchange}</Eyebrow>

            <Row gap={space.sm} align="flex-end" style={{ marginTop: space.md }}>
              <div style={{ flex: 1 }}>
                <Text variant="micro" tone="tertiary" as="div" style={{ marginBottom: 6 }}>
                  {lang === "pl" ? "Z waluty" : "From"}
                </Text>
                <select
                  data-testid="exchange-from"
                  value={exFrom}
                  onChange={e => { setExFrom(e.target.value as CurrencyCode); setExResult(null); setExError(null); }}
                  style={{ ...fieldStyle, cursor: "pointer" }}
                >
                  {CORE_WALLET_CURRENCIES.map(c => (
                    <option key={c} value={c}>{WALLET_FLAGS[c]} {c} — {formatMoney(wallets[c] ?? 0, c)}</option>
                  ))}
                </select>
              </div>
              <div style={{ paddingBottom: 13, color: th.textTertiary }}>
                <ArrowLeftRight size={control.iconSm} />
              </div>
              <div style={{ flex: 1 }}>
                <Text variant="micro" tone="tertiary" as="div" style={{ marginBottom: 6 }}>
                  {lang === "pl" ? "Na walutę" : "To"}
                </Text>
                <select
                  data-testid="exchange-to"
                  value={exTo}
                  onChange={e => { setExTo(e.target.value as CurrencyCode); setExResult(null); setExError(null); }}
                  style={{ ...fieldStyle, cursor: "pointer" }}
                >
                  {CORE_WALLET_CURRENCIES.map(c => (
                    <option key={c} value={c}>{WALLET_FLAGS[c]} {c}</option>
                  ))}
                </select>
              </div>
            </Row>

            {/* State the cost before the commit, not after. */}
            <Row justify="space-between" style={{ marginTop: space.md }}>
              <Text variant="micro" tone="tertiary">
                {ratesUnavailable
                  ? lang === "pl" ? "Kursy walut tymczasowo niedostępne" : "Exchange rates temporarily unavailable"
                  : `1 ${exFrom} = ${(fxRates[exTo] / fxRates[exFrom]).toFixed(4)} ${exTo}`}
              </Text>
              <Text variant="micro" tone={(wallets[exFrom] ?? 0) === 0 ? "negative" : "tertiary"}>
                {(wallets[exFrom] ?? 0) === 0
                  ? lang === "pl" ? `Brak środków w ${exFrom}` : `No funds in ${exFrom}`
                  : `${lang === "pl" ? "Dostępne" : "Available"} ${formatMoney(wallets[exFrom] ?? 0, exFrom)}`}
              </Text>
            </Row>

            <Row gap={space.sm} style={{ marginTop: space.md }}>
              <input
                data-testid="exchange-amount"
                type="number"
                min="0"
                inputMode="decimal"
                placeholder={t.amount}
                value={exAmount}
                onChange={e => { setExAmount(e.target.value); setExResult(null); setExError(null); }}
                style={{ ...fieldStyle, flex: 1, fontVariantNumeric: "tabular-nums" }}
              />
              <Button
                testId="btn-exchange-confirm"
                size="sm"
                loading={exLoading}
                disabled={!exAmount || parseFloat(exAmount) <= 0 || (wallets[exFrom] ?? 0) === 0}
                onClick={handleExchange}
                style={{ height: 44 }}
              >
                {t.convert}
              </Button>
            </Row>

            {exResult && (
              <Card tone="outline" padding={space.md} style={{ marginTop: space.md, borderColor: th.positive, background: th.positiveSubtle }}>
                <Text variant="caption" tone="positive">
                  {lang === "pl" ? "Wymiana zakończona" : "Exchange complete"} · {formatMoney(exResult.fromAmount, exResult.from)} → {formatMoney(exResult.received, exResult.currency)}
                </Text>
              </Card>
            )}

            {exError && (
              <Card tone="outline" padding={space.md} style={{ marginTop: space.md, borderColor: th.danger, background: th.dangerSubtle }}>
                <Text variant="caption" style={{ color: th.danger }}>{exError}</Text>
                {exError === "Brak wystarczających środków" && exAmount && parseFloat(exAmount) > 0 && (
                  <Text variant="micro" tone="tertiary" as="div" style={{ marginTop: 4 }}>
                    {lang === "pl" ? "Brakuje" : "Shortfall"}: {formatMoney(Math.max(0, parseFloat(exAmount) - (wallets[exFrom] ?? 0)), exFrom)}
                  </Text>
                )}
              </Card>
            )}
          </Card>
        )}

        {/* ═══ 4 · THIS MONTH ════════════════════════════════════════════ */}
        <Section
          title={t.cashFlow}
          action={
            <button
              onClick={() => setLocation("/history")}
              style={{ display: "inline-flex", alignItems: "center", gap: 2, background: "none", border: "none", cursor: "pointer", color: th.accent, ...asStyle(typeScale.micro), fontWeight: 600 }}
            >
              {lang === "pl" ? "Historia" : "History"}
              <ChevronRight size={14} />
            </button>
          }
        >
          <Card>
            <Row justify="space-between" align="flex-end">
              <div>
                <Text variant="micro" tone="tertiary" as="div">
                  {lang === "pl" ? "Bilans 30 dni" : "30-day balance"}
                </Text>
                <div style={{ marginTop: 4 }}>
                  <Amount value={monthBalance} currency={activeWallet} signed size="lg" />
                </div>
              </div>
              {trendPct !== 0 && <Delta value={trendPct} label={lang === "pl" ? "vs. poprz." : "vs. prev."} />}
            </Row>

            <Stack gap={space.md} style={{ marginTop: space.xl }}>
              <FlowLine
                label={lang === "pl" ? "Wpływy" : "Income"}
                value={monthIn}
                max={barMax}
                currency={activeWallet}
                tone="positive"
              />
              <FlowLine
                label={lang === "pl" ? "Wydatki" : "Expenses"}
                value={monthOut}
                max={barMax}
                currency={activeWallet}
                tone="negative"
              />
            </Stack>
          </Card>
        </Section>

        {/* ═══ 5 · WHERE THE MONEY WENT ══════════════════════════════════ */}
        {topCategories.length > 0 && (
          <Section title={lang === "pl" ? "Wydatki tego miesiąca" : "This month's spending"}>
            <Card>
              <Stack gap={space.lg}>
                {topCategories.map(([cat, amount], i) => {
                  const maxAmt = topCategories[0][1];
                  return (
                    <div key={cat}>
                      <Row justify="space-between" style={{ marginBottom: 6 }}>
                        <Row gap={space.sm}>
                          <span aria-hidden style={{ fontSize: 15 }}>{getCatEmoji(cat)}</span>
                          <Text variant="caption" style={{ textTransform: "capitalize" }}>{cat}</Text>
                        </Row>
                        <Amount value={amount} currency={activeWallet} size="sm" />
                      </Row>
                      <Meter value={amount} max={maxAmt} height={4} tone={i === 0 ? "accent" : "accent"} label={cat} />
                    </div>
                  );
                })}
              </Stack>
            </Card>
          </Section>
        )}

        {/* ═══ 6 · WHAT NEEDS YOU ════════════════════════════════════════ */}
        {topGoal && (
          <Section title={lang === "pl" ? "Cel oszczędnościowy" : "Savings goal"}>
            <Card onClick={() => setLocation("/savings")}>
              <Row justify="space-between" align="flex-start">
                <Row gap={space.sm}>
                  <span aria-hidden style={{ fontSize: 20 }}>{topGoal.emoji}</span>
                  <div>
                    <Text variant="bodyStrong" as="div">{topGoal.name}</Text>
                    <Text variant="micro" tone="tertiary" as="div" style={{ marginTop: 2 }}>
                      {topGoal.saved.toFixed(0)} / {topGoal.target.toFixed(0)} {topGoal.currency}
                    </Text>
                  </div>
                </Row>
                <Badge tone="accent">{((topGoal.saved / topGoal.target) * 100).toFixed(0)}%</Badge>
              </Row>
              <div style={{ marginTop: space.lg }}>
                <Meter value={topGoal.saved} max={topGoal.target} label={topGoal.name} />
              </div>
            </Card>
          </Section>
        )}

        {upcomingDeadlines.length > 0 && (
          <Section title={lang === "pl" ? "Nadchodzące terminy" : "Upcoming deadlines"}>
            <Card padding={space.lg}>
              {upcomingDeadlines.map((d, i) => (
                <ListRow
                  key={d.id || d.title}
                  divider={i < upcomingDeadlines.length - 1}
                  onClick={() => d.id && setLocation(`/agreements/${d.id}`)}
                  title={d.title}
                  subtitle={new Date(d.deadline).toLocaleDateString(lang === "pl" ? "pl-PL" : "en-US")}
                  trailing={
                    <Badge tone={d.daysLeft <= 2 ? "warning" : "neutral"}>
                      {d.daysLeft === 0
                        ? lang === "pl" ? "dziś" : "today"
                        : `${d.daysLeft} ${lang === "pl" ? "dni" : "days"}`}
                    </Badge>
                  }
                />
              ))}
            </Card>
          </Section>
        )}

        {contractCount.needsAction > 0 && (
          <Section title={lang === "pl" ? "Wymaga działania" : "Needs action"}>
            <Card tone="accent" onClick={() => setLocation("/agreements")}>
              <Row justify="space-between">
                <Row gap={space.md}>
                  <Sparkles size={control.iconLg} color={th.accent} />
                  <div>
                    <Text variant="bodyStrong" as="div">
                      {contractCount.needsAction}{" "}
                      {lang === "pl" ? "umowy czekają na zwolnienie środków" : "contracts awaiting release"}
                    </Text>
                    <Text variant="micro" tone="tertiary" as="div" style={{ marginTop: 2 }}>
                      {lang === "pl" ? "Otwórz, aby przejrzeć" : "Open to review"}
                    </Text>
                  </div>
                </Row>
                <ChevronRight size={18} color={th.textTertiary} />
              </Row>
            </Card>
          </Section>
        )}
      </div>

      {/* ═══ SHEET · currency picker ═════════════════════════════════════ */}
      <Sheet
        open={showCurrencyPicker}
        onClose={() => { setShowCurrencyPicker(false); setShowAddCurrency(false); }}
        title={showAddCurrency ? t.addCurrency : t.selectCurrency}
        testId="modal-currency-picker"
      >
        {showAddCurrency && (
          <Button variant="ghost" size="sm" onClick={() => setShowAddCurrency(false)} style={{ paddingLeft: 0, marginBottom: space.sm }}>
            ← {lang === "pl" ? "Wróć" : "Back"}
          </Button>
        )}

        {!showAddCurrency ? (
          <Stack gap={space.xs}>
            {enabledCurrencies.map(cur => {
              const isPrimary = cur === primaryCurrency;
              return (
                <Row key={cur} gap={space.sm}>
                  <div
                    data-testid={`currency-pick-${cur}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => { saveCurrencySettings(enabledCurrencies, cur); setActiveWallet(cur); setShowCurrencyPicker(false); setShowAddCurrency(false); }}
                    onKeyDown={e => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        saveCurrencySettings(enabledCurrencies, cur);
                        setActiveWallet(cur);
                        setShowCurrencyPicker(false);
                        setShowAddCurrency(false);
                      }
                    }}
                    style={{
                      flex: 1,
                      display: "flex",
                      alignItems: "center",
                      gap: space.md,
                      padding: space.md,
                      borderRadius: radius.md,
                      cursor: "pointer",
                      background: isPrimary ? th.accentSubtle : th.surface,
                      border: `1px solid ${isPrimary ? th.lineAccent : th.line}`,
                    }}
                  >
                    <span aria-hidden style={{ fontSize: 22 }}>{WALLET_FLAGS[cur]}</span>
                    <div style={{ flex: 1 }}>
                      <Text variant="bodyStrong" as="div" tone={isPrimary ? "accent" : "primary"}>{cur}</Text>
                      <Text variant="micro" tone="tertiary" as="div">{getCurrencyName(cur, lang)}</Text>
                    </div>
                    <Amount value={wallets[cur] ?? 0} size="sm" />
                    {isPrimary && <Badge tone="accent">{t.primaryBadge}</Badge>}
                  </div>
                  {enabledCurrencies.length > 1 && !isPrimary && (
                    <IconButton
                      testId={`btn-remove-currency-${cur}`}
                      label={`${t.removeCurrency} ${cur}`}
                      icon={<span style={{ fontSize: 18, lineHeight: 1 }}>×</span>}
                      size={40}
                      onClick={() => {
                        const next = enabledCurrencies.filter(c => c !== cur);
                        saveCurrencySettings(next, primaryCurrency);
                        if (activeWallet === cur) setActiveWallet(primaryCurrency);
                      }}
                    />
                  )}
                </Row>
              );
            })}
            <Button
              testId="btn-add-currency"
              variant="secondary"
              size="md"
              full
              icon={<Plus size={control.iconSm} />}
              onClick={() => setShowAddCurrency(true)}
              style={{ marginTop: space.sm }}
            >
              {t.addCurrency}
            </Button>
          </Stack>
        ) : (
          (() => {
            const allCurrencies: CurrencyCode[] = ["NOK", "USD", "EUR", "GBP", "CHF", "PLN", "SEK", "DKK", "CAD", "AUD", "JPY"];
            const available = allCurrencies.filter(c => !enabledCurrencies.includes(c));
            if (available.length === 0) {
              return (
                <Text variant="secondary" tone="tertiary" as="div" style={{ textAlign: "center", padding: space.xxl }}>
                  {lang === "pl" ? "Wszystkie waluty są już dodane." : "All currencies already added."}
                </Text>
              );
            }
            return (
              <Stack gap={space.xs}>
                {available.map(cur => (
                  <div
                    key={cur}
                    data-testid={`currency-add-${cur}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => { saveCurrencySettings([...enabledCurrencies, cur], primaryCurrency); setShowAddCurrency(false); }}
                    onKeyDown={e => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        saveCurrencySettings([...enabledCurrencies, cur], primaryCurrency);
                        setShowAddCurrency(false);
                      }
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: space.md,
                      padding: space.md,
                      borderRadius: radius.md,
                      cursor: "pointer",
                      background: th.surface,
                      border: `1px solid ${th.line}`,
                    }}
                  >
                    <span aria-hidden style={{ fontSize: 22 }}>{WALLET_FLAGS[cur]}</span>
                    <div style={{ flex: 1 }}>
                      <Text variant="bodyStrong" as="div">{cur}</Text>
                      <Text variant="micro" tone="tertiary" as="div">{getCurrencyName(cur, lang)}</Text>
                    </div>
                    <Text variant="caption" tone="tertiary">{CURRENCY_SYMBOLS[cur]}</Text>
                    <Plus size={control.iconSm} color={th.textTertiary} />
                  </div>
                ))}
              </Stack>
            );
          })()
        )}
      </Sheet>

      {/* ═══ SHEET · rate alert ══════════════════════════════════════════ */}
      <Sheet
        open={showAlertModal}
        onClose={() => setShowAlertModal(false)}
        title={lang === "pl" ? "Alert kursowy" : "Rate alert"}
      >
        <Stack gap={space.lg}>
          <div>
            <Text variant="micro" tone="tertiary" as="div" style={{ marginBottom: space.sm }}>
              {lang === "pl" ? "Waluta" : "Currency"}
            </Text>
            <Row gap={space.xs} wrap>
              {(["EUR", "USD", "GBP", "CHF", "NOK"] as const).map(c => (
                <Chip key={c} selected={alertFrom === c} onClick={() => setAlertFrom(c)}>{c}</Chip>
              ))}
            </Row>
          </div>

          <div>
            <Text variant="micro" tone="tertiary" as="div" style={{ marginBottom: space.sm }}>
              {lang === "pl" ? "Powiadom gdy kurs jest" : "Alert when rate is"}
            </Text>
            <Row gap={space.sm}>
              {[
                { v: "above" as const, l: lang === "pl" ? "Powyżej" : "Above" },
                { v: "below" as const, l: lang === "pl" ? "Poniżej" : "Below" },
              ].map(opt => (
                <Chip key={opt.v} selected={alertCondition === opt.v} onClick={() => setAlertCondition(opt.v)}>
                  {opt.l}
                </Chip>
              ))}
            </Row>
          </div>

          <div>
            <Text variant="micro" tone="tertiary" as="div" style={{ marginBottom: space.sm }}>
              {lang === "pl" ? `Próg ${alertFrom}/${alertTo}` : `${alertFrom}/${alertTo} threshold`}
            </Text>
            <input
              type="number"
              inputMode="decimal"
              step="0.0001"
              placeholder={
                (fxRates as any)[alertFrom]
                  ? ((fxRates as any)[alertTo] / (fxRates as any)[alertFrom]).toFixed(4)
                  : "4.2500"
              }
              value={alertThreshold}
              onChange={e => setAlertThreshold(e.target.value)}
              style={{ ...fieldStyle, height: 52, fontVariantNumeric: "tabular-nums" }}
            />
          </div>

          <Button
            full
            disabled={!alertThreshold}
            onClick={() => {
              if (!alertThreshold) return;
              const alerts = JSON.parse(localStorage.getItem(StorageKeys.FX_ALERTS) || "[]");
              alerts.push({ from: alertFrom, to: alertTo, threshold: parseFloat(alertThreshold), condition: alertCondition, createdAt: Date.now() });
              localStorage.setItem(StorageKeys.FX_ALERTS, JSON.stringify(alerts));
              addNotification({
                type: "info",
                title: lang === "pl" ? "Alert ustawiony" : "Alert set",
                message: `${alertFrom}/${alertTo} ${alertCondition === "above" ? ">" : "<"} ${alertThreshold}`,
              });
              setAlertThreshold("");
              setShowAlertModal(false);
            }}
          >
            {lang === "pl" ? "Zapisz alert" : "Save alert"}
          </Button>
        </Stack>
      </Sheet>
    </div>
  );
}

/**
 * One line of the cash-flow breakdown: label, bar, amount.
 * The bars share a scale, so "in vs out" is readable at a glance without
 * anyone having to compare two numbers digit by digit.
 */
function FlowLine({
  label,
  value,
  max,
  currency,
  tone,
}: {
  label: string;
  value: number;
  max: number;
  currency: string;
  tone: "positive" | "negative";
}) {
  return (
    <div>
      <Row justify="space-between" style={{ marginBottom: 6 }}>
        <Text variant="caption" tone="secondary">{label}</Text>
        <Amount value={value} currency={currency} size="sm" tone={tone} />
      </Row>
      <Meter value={value} max={max} height={4} tone={tone} label={label} />
    </div>
  );
}
