import { useMemo } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, TrendingUp, TrendingDown, Target, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { Area, AreaChart, ResponsiveContainer, Tooltip, LineChart, Line, XAxis, YAxis, ReferenceLine } from "recharts";
import { useAppStore } from "@/lib/store";
import { useLang } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";

export default function BudgetForecast() {
  const [, setLocation] = useLocation();
  const { transactions, wallets, primaryCurrency } = useAppStore();
  const { lang } = useLang();
  const { theme } = useTheme();
  const isLight = (theme as string) === "arctic-platinum";
  const textPrimary = isLight ? "text-gray-900" : "text-foreground/90";
  const pl = lang === "pl";

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayDay = now.getDate();

  const { chartData, totalSpent, projectedEOM, dailyAvg } = useMemo(() => {
    const currentMonthExpenses = transactions.filter(tx => {
      const d = new Date(tx.date);
      return d.getFullYear() === year && d.getMonth() === month && tx.amount < 0;
    });

    const byDay: { [day: number]: number } = {};
    currentMonthExpenses.forEach(tx => {
      const day = new Date(tx.date).getDate();
      byDay[day] = (byDay[day] || 0) + Math.abs(tx.amount);
    });

    let cumulative = 0;
    const actualPoints: { day: string; actual: number | null; forecast: number | null }[] = [];
    for (let d = 1; d <= todayDay; d++) {
      cumulative += byDay[d] || 0;
      if (d === 1 || d % 3 === 0 || d === todayDay) {
        actualPoints.push({ day: String(d).padStart(2, "0"), actual: Math.round(cumulative), forecast: null });
      }
    }

    const spent = cumulative;
    const avg = todayDay > 0 ? spent / todayDay : 0;
    const projected = Math.round(avg * daysInMonth);

    const forecastPoints: { day: string; actual: number | null; forecast: number | null }[] = [];
    const step = Math.max(1, Math.floor((daysInMonth - todayDay) / 4));
    for (let d = todayDay + 1; d <= daysInMonth; d += step) {
      forecastPoints.push({ day: String(d).padStart(2, "0"), actual: null, forecast: Math.round(spent + avg * (d - todayDay)) });
    }
    if (forecastPoints.length > 0 || todayDay < daysInMonth) {
      forecastPoints.push({ day: String(daysInMonth).padStart(2, "0"), actual: null, forecast: projected });
    }

    const combined = [...actualPoints, ...forecastPoints];
    if (combined.length === 0) {
      combined.push({ day: "01", actual: 0, forecast: 0 });
    }

    return { chartData: combined, totalSpent: spent, projectedEOM: projected, dailyAvg: avg };
  }, [transactions, year, month, todayDay, daysInMonth]);

  const pctChange = totalSpent > 0 ? Math.round(((projectedEOM - totalSpent) / totalSpent) * 100) : 0;

  const currentBalance = wallets[primaryCurrency] ?? 0;

  const forecastData = useMemo(() => {
    const now = new Date();
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
    const recentTxs = transactions.filter(tx => new Date(tx.date) >= cutoff);
    const dailyAvgOut = recentTxs.filter(tx => tx.amount < 0).reduce((s, tx) => s + Math.abs(tx.amount), 0) / 30;
    const dailyAvgIn = recentTxs.filter(tx => tx.amount > 0).reduce((s, tx) => s + tx.amount, 0) / 30;
    const netDaily = dailyAvgIn - dailyAvgOut;

    return Array.from({ length: 30 }, (_, i) => {
      const date = new Date(now); date.setDate(date.getDate() + i);
      const projected = currentBalance + netDaily * i;
      return {
        day: i === 0 ? (pl ? "Dziś" : "Today") : `+${i}d`,
        balance: Math.max(0, Math.round(projected)),
      };
    }).filter((_, i) => i % 5 === 0 || i === 0 || i === 29);
  }, [transactions, currentBalance, pl]);

  const fmt = (n: number) =>
    n.toLocaleString(pl ? "pl-PL" : "en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  return (
    <div className="min-h-screen bg-background pb-24 relative overflow-hidden flex flex-col transition-colors duration-500">
      <div className="absolute top-0 left-0 w-[400px] h-[400px] bg-primary/5 rounded-full blur-[100px] pointer-events-none transition-colors duration-500"></div>

      <header className="px-6 pt-14 pb-6 flex items-center sticky top-0 bg-background/90 backdrop-blur-xl z-10 border-b border-border/50 transition-colors duration-500">
        <Button variant="ghost" size="icon" className="rounded-full bg-secondary border border-black/5 dark:border-white/5 mr-4 hover:bg-secondary/80" onClick={() => setLocation("/")}>
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </Button>
        <h1 className={`text-2xl font-heading ${textPrimary}`}>
          {pl ? "Prognoza Budżetu" : "Budget Forecast"}
        </h1>
      </header>

      <main className="px-6 py-8 space-y-8 relative z-10 flex-1">
        {/* Insight Card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-primary/20 via-primary/5 to-transparent border border-primary/20 rounded-3xl p-6 relative overflow-hidden"
        >
          <div className="flex items-center gap-3 mb-4 text-primary">
            <Sparkles className="w-5 h-5" />
            <h2 className="font-semibold tracking-widest uppercase text-[13px]">
              {pl ? "Analiza AI" : "AI Insight"}
            </h2>
          </div>

          {totalSpent === 0 ? (
            <p className={`font-medium leading-relaxed mb-4 ${textPrimary}`}>
              {pl
                ? "Brak wydatków w bieżącym miesiącu. Wykonaj pierwsze transakcje, aby zobaczyć prognozę."
                : "No expenses recorded this month yet. Make your first transactions to see the forecast."}
            </p>
          ) : (
            <p className={`font-medium leading-relaxed mb-4 ${textPrimary}`}>
              {pl
                ? <>Na podstawie Twoich zwyczajów, prognozowane wydatki w tym miesiącu wyniosą <span className="text-primary font-bold">{fmt(projectedEOM)}</span>. Dzienna średnia to <span className="text-primary font-bold">{fmt(dailyAvg)}</span>.</>
                : <>Based on your spending habits, projected spend this month is <span className="text-primary font-bold">{fmt(projectedEOM)}</span>. Your daily average is <span className="text-primary font-bold">{fmt(dailyAvg)}</span>.</>
              }
            </p>
          )}

          <div className="flex items-center gap-2 text-[13px] font-medium text-muted-foreground bg-background/50 px-3 py-2 rounded-xl w-max border border-primary/10">
            <Target className="w-4 h-4 text-primary" />
            {pl ? "Wydano w tym miesiącu:" : "Spent this month:"} <span className="text-primary font-bold ml-1">{fmt(totalSpent)}</span>
          </div>
        </motion.div>

        {/* Chart */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-card border border-black/5 dark:border-white/5 rounded-3xl p-6 shadow-premium relative overflow-hidden transition-colors duration-500"
        >
          <h3 className="text-[13px] font-bold uppercase tracking-[0.15em] text-primary/80 mb-6">
            {pl ? "Trajektoria wydatków" : "Spend Trajectory"}
          </h3>

          <div className="h-[200px] w-full relative -ml-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="actualColor" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--foreground))" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="hsl(var(--foreground))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="forecastColor" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(43 74% 49%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(43 74% 49%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "12px",
                    color: "hsl(var(--foreground))",
                  }}
                  cursor={{ stroke: "rgba(255,255,255,0.1)", strokeWidth: 1, strokeDasharray: "4 4" }}
                  formatter={(value: any) => value != null ? [fmt(value), ""] : ["—", ""]}
                />
                <Area
                  type="monotone"
                  dataKey="actual"
                  stroke="hsl(var(--foreground))"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#actualColor)"
                  connectNulls={false}
                />
                <Area
                  type="monotone"
                  dataKey="forecast"
                  stroke="hsl(43 74% 49%)"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  fillOpacity={1}
                  fill="url(#forecastColor)"
                  connectNulls={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="flex justify-between mt-4 text-[13px] font-semibold text-muted-foreground">
            <span>{pl ? "Początek" : "Start"}</span>
            <span className="text-primary">{pl ? "Dziś" : "Today"}</span>
            <span>{pl ? "Koniec miesiąca" : "End of Month"}</span>
          </div>

          <div className="flex items-center gap-6 mt-4 pt-4 border-t border-white/5">
            <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <div className="w-3 h-0.5 bg-foreground/60 rounded"></div>
              {pl ? "Rzeczywiste" : "Actual"}
            </div>
            <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <div className="w-3 h-0.5 border-t-2 border-dashed border-primary rounded"></div>
              {pl ? "Prognoza" : "Forecast"}
            </div>
          </div>
        </motion.div>

        {/* Summary Cards */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="grid grid-cols-2 gap-3"
        >
          <div className="bg-card border border-black/5 dark:border-white/5 rounded-2xl p-4 shadow-sm">
            <p className="text-[12px] uppercase tracking-widest text-muted-foreground font-semibold">
              {pl ? "Wydano" : "Spent"}
            </p>
            <p className={`text-xl font-heading mt-1 ${textPrimary}`}>{fmt(totalSpent)}</p>
            <p className="text-[12px] text-muted-foreground mt-1">
              {pl ? `Dzień ${todayDay} z ${daysInMonth}` : `Day ${todayDay} of ${daysInMonth}`}
            </p>
          </div>
          <div className="bg-card border border-black/5 dark:border-white/5 rounded-2xl p-4 shadow-sm">
            <p className="text-[12px] uppercase tracking-widest text-muted-foreground font-semibold">
              {pl ? "Prognoza EOM" : "Projected EOM"}
            </p>
            <p className={`text-xl font-heading mt-1 ${textPrimary}`}>{fmt(projectedEOM)}</p>
            <p className={`text-[12px] mt-1 font-semibold ${pctChange <= 0 ? "text-green-500" : "text-red-400"}`}>
              {pctChange >= 0 ? "+" : ""}{pctChange}%{" "}
              {pctChange <= 0 ? (pl ? "tendencja spadkowa" : "trending down") : (pl ? "tendencja wzrostowa" : "trending up")}
            </p>
          </div>
        </motion.div>

        {/* Categories Analysis */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="space-y-4"
        >
          <h3 className="text-[13px] font-bold uppercase tracking-[0.15em] text-primary/80 px-2">
            {pl ? "Prognoza kategorii" : "Category Forecast"}
          </h3>

          {transactions.filter(tx => tx.amount < 0 && new Date(tx.date).getMonth() === month).length === 0 ? (
            <div className="bg-card border border-black/5 dark:border-white/5 rounded-2xl p-6 text-center text-muted-foreground text-sm">
              {pl ? "Brak danych do analizy kategorii." : "No transaction data available for category analysis."}
            </div>
          ) : (
            (() => {
              const cats: { [key: string]: number } = {};
              transactions
                .filter(tx => tx.amount < 0 && new Date(tx.date).getMonth() === month)
                .forEach(tx => {
                  const key = tx.subtitle || tx.title || (pl ? "Inne" : "Other");
                  cats[key] = (cats[key] || 0) + Math.abs(tx.amount);
                });
              const sorted = Object.entries(cats).sort((a, b) => b[1] - a[1]).slice(0, 4);
              const maxVal = sorted[0]?.[1] || 1;
              return (
                <div className="space-y-3">
                  {sorted.map(([name, current], i) => {
                    const projected = Math.round((current / todayDay) * daysInMonth);
                    const over = projected > current * 1.1;
                    return (
                      <div key={i} className="bg-card border border-black/5 dark:border-white/5 rounded-2xl p-4 shadow-sm">
                        <div className="flex items-center justify-between mb-2">
                          <div className="font-semibold text-[14px] text-foreground/90 truncate max-w-[60%]">{name}</div>
                          <div className={`px-2 py-1 rounded-md text-[12px] uppercase tracking-widest font-bold flex items-center ${over ? "bg-red-500/10 text-red-500" : "bg-green-500/10 text-green-500"}`}>
                            {over ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                            {pl ? "prognoza" : "forecast"} {fmt(projected)}
                          </div>
                        </div>
                        <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full transition-all duration-500"
                            style={{ width: `${Math.min(100, (current / maxVal) * 100)}%` }}
                          />
                        </div>
                        <div className="flex justify-between mt-1 text-[12px] text-muted-foreground">
                          <span>{pl ? "Dotychczas:" : "So far:"} {fmt(current)}</span>
                          <span>{Math.round((current / totalSpent) * 100)}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()
          )}
        </motion.div>

        {/* Balance Forecast */}
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20, padding: "20px 16px", marginTop: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1.2, color: "rgba(255,255,255,0.45)", marginBottom: 4 }}>
            {pl ? "PROGNOZA SALDA — 30 DNI" : "BALANCE FORECAST — 30 DAYS"}
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginBottom: 16 }}>
            {pl ? "Na podstawie średnich wydatków z ostatniego miesiąca" : "Based on average spending from last month"}
          </div>
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={forecastData}>
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.40)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.40)" }} axisLine={false} tickLine={false} hide />
              <Tooltip contentStyle={{ background: "rgba(20,20,30,0.95)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, color: "#fff", fontSize: 12 }} formatter={(v: any) => [`${v} ${primaryCurrency}`, pl ? "Prognoza" : "Forecast"]} />
              <ReferenceLine y={0} stroke="rgba(248,113,113,0.4)" strokeDasharray="3 3" />
              <Line type="monotone" dataKey="balance" stroke="var(--color-primary)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>{pl ? "Teraz" : "Now"}: <b style={{ color: "var(--color-primary)" }}>{currentBalance.toFixed(0)} {primaryCurrency}</b></div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>+30d: <b style={{ color: forecastData[forecastData.length - 1]?.balance >= currentBalance ? "#4ade80" : "#f87171" }}>{forecastData[forecastData.length - 1]?.balance ?? 0} {primaryCurrency}</b></div>
          </div>
        </div>
      </main>
    </div>
  );
}
