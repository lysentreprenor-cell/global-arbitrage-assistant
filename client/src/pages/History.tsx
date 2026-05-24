import { useLocation } from "wouter";
import { ArrowLeft, ArrowDownLeft, ArrowUpRight, Search, Calendar, Filter, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppStore, Transaction } from "@/lib/store";
import { motion } from "framer-motion";
import { useState, useMemo } from "react";
import { useLang } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

export default function History() {
  const [, setLocation] = useLocation();
  const { transactions } = useAppStore();
  const { lang } = useLang();
  const { theme } = useTheme();
  const isLight = (theme as string) === "arctic-platinum";
  const [searchTerm, setSearchTerm] = useState("");
  const [showFilter, setShowFilter] = useState(false);
  const [filterType, setFilterType] = useState<"all" | "send" | "receive" | "exchange" | "contract">("all");
  const [filterPeriod, setFilterPeriod] = useState<"all" | "7d" | "30d" | "90d">("all");

  const pl = lang === "pl";
  const filterActive = filterType !== "all" || filterPeriod !== "all";
  const [showReport, setShowReport] = useState(false);

  const handlePdfExport = () => {
    const w = window.open("", "_blank");
    if (!w) return;
    const rows = filteredTransactions.map(tx =>
      `<tr><td>${new Date(tx.date).toLocaleDateString("pl-PL")}</td><td>${tx.title}</td><td style="text-align:right;color:${tx.amount > 0 ? "#16a34a" : "#dc2626"}">${tx.amount > 0 ? "+" : ""}${tx.amount.toFixed(2)} ${(tx as any).currency || "PLN"}</td></tr>`
    ).join("");
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Historia transakcji</title>
      <style>body{font-family:system-ui,sans-serif;padding:32px;color:#111}h2{margin-bottom:4px}p{color:#666;margin-bottom:20px;font-size:14px}table{width:100%;border-collapse:collapse;font-size:14px}th{background:#f5f5f5;padding:10px 12px;text-align:left;border-bottom:2px solid #ddd}td{padding:9px 12px;border-bottom:1px solid #eee}tr:last-child td{border-bottom:none}@media print{button{display:none}}</style>
      </head><body>
      <h2>Historia transakcji</h2>
      <p>Wygenerowano: ${new Date().toLocaleDateString("pl-PL", { day: "2-digit", month: "long", year: "numeric" })} · ${filteredTransactions.length} transakcji</p>
      <table><thead><tr><th>Data</th><th>Opis</th><th style="text-align:right">Kwota</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <script>window.onload=()=>window.print();</script>
      </body></html>`);
    w.document.close();
    setShowReport(false);
  };

  const chartData = useMemo(() => {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
    const byCategory: Record<string, number> = {};
    transactions
      .filter(tx => tx.amount < 0 && new Date(tx.date) >= cutoff)
      .forEach(tx => {
        const cat = tx.category || (pl ? "Inne" : "Other");
        byCategory[cat] = (byCategory[cat] || 0) + Math.abs(tx.amount);
      });
    return Object.entries(byCategory)
      .map(([name, value]) => ({ name, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [transactions, pl]);

  const monthlyStats = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthTxs = transactions.filter(tx => new Date(tx.date) >= monthStart);
    const received = monthTxs.filter(tx => tx.amount > 0).reduce((s, tx) => s + tx.amount, 0);
    const sent = monthTxs.filter(tx => tx.amount < 0).reduce((s, tx) => s + Math.abs(tx.amount), 0);
    return { received, sent, net: received - sent, count: monthTxs.length };
  }, [transactions]);

  const filteredTransactions = transactions.filter(tx => {
    const matchesSearch =
      tx.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tx.subtitle.toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;

    if (filterType !== "all") {
      if (filterType === "send" && tx.type !== "send") return false;
      if (filterType === "receive" && tx.type !== "receive") return false;
      if (filterType === "exchange" && (tx as any).type !== "exchange") return false;
      if (filterType === "contract" && (tx as any).category !== "contract") return false;
    }

    if (filterPeriod !== "all") {
      const days = { "7d": 7, "30d": 30, "90d": 90 }[filterPeriod];
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      if (new Date(tx.date) < cutoff) return false;
    }

    return true;
  });

  const groupedTransactions = useMemo(() => {
    const groups: { [key: string]: Transaction[] } = {};
    filteredTransactions.forEach(tx => {
      const date = new Date(tx.date);
      const monthYear = date.toLocaleString(pl ? "pl-PL" : "en-US", { month: "long", year: "numeric" });
      if (!groups[monthYear]) groups[monthYear] = [];
      groups[monthYear].push(tx);
    });
    return Object.entries(groups).map(([month, txs]) => ({ month, transactions: txs }));
  }, [filteredTransactions, pl]);

  const textPrimary = isLight ? "text-gray-900" : "text-white/90";

  return (
    <div className="min-h-screen bg-background pb-24 relative overflow-x-hidden">
      <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-primary/5 rounded-full blur-[100px] pointer-events-none"></div>

      <header className="px-6 pt-14 pb-4 sticky top-0 bg-background/90 backdrop-blur-xl z-20 border-b border-border/50">
        <div className="flex items-center mb-6">
          <Button variant="ghost" size="icon" className="rounded-full bg-secondary border border-white/5 mr-4 hover:bg-secondary/80" onClick={() => setLocation("/")}>
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </Button>
          <h1 className={`text-2xl font-heading ${textPrimary}`}>
            {pl ? "Historia Transakcji" : "Transaction History"}
          </h1>
        </div>

        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={pl ? "Szukaj transakcji..." : "Search transactions..."}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-12 pl-11 rounded-xl bg-card border-white/10 focus:border-primary/50 text-[15px]"
              data-testid="input-history-search"
            />
          </div>
          <Button variant="outline" size="icon" onClick={() => setShowReport(true)} className="h-12 w-12 rounded-xl bg-card border-white/10 shrink-0 text-muted-foreground hover:text-foreground">
            <FileText className="w-5 h-5" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setShowFilter(true)}
            className="h-12 w-12 rounded-xl bg-card border-white/10 shrink-0 hover:text-foreground relative"
            style={{ color: filterActive ? "var(--color-primary)" : undefined, borderColor: filterActive ? "var(--color-primary)" : undefined }}
          >
            <Filter className="w-5 h-5" />
            {filterActive && (
              <span style={{ position: "absolute", top: 7, right: 7, width: 7, height: 7, borderRadius: "50%", background: "var(--color-primary)", border: "1.5px solid var(--color-card)" }} />
            )}
          </Button>
        </div>
      </header>

      {/* Filter bottom sheet */}
      {showFilter && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 50 }}
          onClick={() => setShowFilter(false)}
        >
          <div
            style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "var(--color-card)", borderRadius: "20px 20px 0 0", padding: "20px 20px 48px" }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ width: 40, height: 4, background: "rgba(255,255,255,0.15)", borderRadius: 2, margin: "0 auto 20px" }} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--color-foreground)" }}>
                {pl ? "Filtruj transakcje" : "Filter transactions"}
              </div>
              {filterActive && (
                <div
                  onClick={() => { setFilterType("all"); setFilterPeriod("all"); }}
                  style={{ fontSize: 13, fontWeight: 600, color: "var(--color-primary)", cursor: "pointer" }}
                >
                  {pl ? "Wyczyść" : "Clear"}
                </div>
              )}
            </div>

            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, color: "var(--color-muted-foreground)", marginBottom: 10 }}>
              {pl ? "TYP" : "TYPE"}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 22 }}>
              {[
                { val: "all", label: pl ? "Wszystkie" : "All" },
                { val: "send", label: pl ? "Wysłane" : "Sent" },
                { val: "receive", label: pl ? "Otrzymane" : "Received" },
                { val: "exchange", label: pl ? "Przewaluta" : "Exchange" },
                { val: "contract", label: pl ? "Umowy" : "Contracts" },
              ].map(o => (
                <div
                  key={o.val}
                  onClick={() => setFilterType(o.val as any)}
                  style={{
                    padding: "8px 16px", borderRadius: 20, cursor: "pointer", fontSize: 13, fontWeight: 600,
                    background: filterType === o.val ? "var(--color-primary)" : "rgba(255,255,255,0.05)",
                    color: filterType === o.val ? "var(--color-primary-foreground)" : "rgba(255,255,255,0.60)",
                    border: `1.5px solid ${filterType === o.val ? "transparent" : "rgba(255,255,255,0.10)"}`,
                  }}
                >
                  {o.label}
                </div>
              ))}
            </div>

            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, color: "var(--color-muted-foreground)", marginBottom: 10 }}>
              {pl ? "OKRES" : "PERIOD"}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[
                { val: "all", label: pl ? "Cały czas" : "All time" },
                { val: "7d", label: pl ? "7 dni" : "7 days" },
                { val: "30d", label: pl ? "30 dni" : "30 days" },
                { val: "90d", label: pl ? "90 dni" : "90 days" },
              ].map(o => (
                <div
                  key={o.val}
                  onClick={() => setFilterPeriod(o.val as any)}
                  style={{
                    padding: "8px 16px", borderRadius: 20, cursor: "pointer", fontSize: 13, fontWeight: 600,
                    background: filterPeriod === o.val ? "var(--color-primary)" : "rgba(255,255,255,0.05)",
                    color: filterPeriod === o.val ? "var(--color-primary-foreground)" : "rgba(255,255,255,0.60)",
                    border: `1.5px solid ${filterPeriod === o.val ? "transparent" : "rgba(255,255,255,0.10)"}`,
                  }}
                >
                  {o.label}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Monthly report bottom sheet */}
      {showReport && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 50 }} onClick={() => setShowReport(false)}>
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "var(--color-card)", borderRadius: "20px 20px 0 0", padding: "20px 20px 48px" }} onClick={e => e.stopPropagation()}>
            <div style={{ width: 40, height: 4, background: "rgba(255,255,255,0.15)", borderRadius: 2, margin: "0 auto 20px" }} />
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20, color: "var(--color-foreground)" }}>
              {pl ? "Raport miesięczny" : "Monthly Report"}
            </div>
            {[
              { label: pl ? "Wpłynęło" : "Received", value: `+${monthlyStats.received.toFixed(0)} PLN`, color: "var(--color-primary)" },
              { label: pl ? "Wysłano" : "Sent", value: `-${monthlyStats.sent.toFixed(0)} PLN`, color: "#f87171" },
              { label: pl ? "Saldo netto" : "Net balance", value: `${monthlyStats.net >= 0 ? "+" : ""}${monthlyStats.net.toFixed(0)} PLN`, color: monthlyStats.net >= 0 ? "#4ade80" : "#f87171" },
              { label: pl ? "Liczba transakcji" : "Transactions", value: String(monthlyStats.count), color: "rgba(255,255,255,0.70)" },
            ].map(row => (
              <div key={row.label} style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ fontSize: 14, color: "rgba(255,255,255,0.60)" }}>{row.label}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: row.color }}>{row.value}</div>
              </div>
            ))}
            <button
              onClick={handlePdfExport}
              style={{ width: "100%", height: 48, borderRadius: 14, marginTop: 20, background: "var(--color-primary)", color: "var(--color-primary-foreground)", fontWeight: 700, fontSize: 15, border: "none", cursor: "pointer" }}
            >
              {pl ? "Pobierz PDF" : "Download PDF"}
            </button>
          </div>
        </div>
      )}

      <main className="px-6 py-6 relative z-10 space-y-8">
        {chartData.length > 0 && searchTerm === "" && !filterActive && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20, padding: "20px 16px 12px", marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1.2, color: "rgba(255,255,255,0.45)", marginBottom: 16 }}>
              {pl ? "WYDATKI — OSTATNIE 30 DNI" : "SPENDING — LAST 30 DAYS"}
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.45)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.45)" }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: "rgba(20,20,30,0.95)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, color: "#fff", fontSize: 12 }}
                  formatter={(v: any) => [`${v} PLN`, pl ? "Wydatki" : "Spending"]}
                />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={i === 0 ? "var(--color-primary)" : `rgba(212,160,32,${0.6 - i * 0.08})`} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </motion.div>
        )}

        {filteredTransactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 bg-secondary rounded-full flex items-center justify-center mb-6 shadow-inner-glow border border-white/5">
              <Search className="w-8 h-8 text-muted-foreground/50" />
            </div>
            <h3 className={`text-xl font-heading mb-2 ${textPrimary}`}>
              {pl ? "Brak transakcji" : "No transactions found"}
            </h3>
            <p className="text-muted-foreground max-w-[200px] text-sm">
              {pl
                ? "Dostosuj kryteria wyszukiwania lub wykonaj pierwszą operację."
                : "Try adjusting your search terms or make your first transaction."}
            </p>
            {filterActive && (
              <div
                onClick={() => { setFilterType("all"); setFilterPeriod("all"); }}
                style={{ marginTop: 16, padding: "10px 20px", borderRadius: 20, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "var(--color-primary)" }}
              >
                {pl ? "Wyczyść filtry" : "Clear filters"}
              </div>
            )}
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-8"
          >
            {groupedTransactions.map((group) => (
              <div key={group.month} className="space-y-4">
                <div className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-widest text-muted-foreground">
                  <Calendar className="w-3.5 h-3.5" />
                  <span className="capitalize">{group.month}</span>
                </div>

                <div className="bg-card rounded-3xl border border-white/5 shadow-premium overflow-hidden">
                  {group.transactions.map((tx, i, arr) => (
                    <div
                      key={tx.id}
                      data-testid={`row-transaction-${tx.id}`}
                      className={`flex items-center gap-4 p-5 hover:bg-secondary/50 transition-colors cursor-pointer group ${i !== arr.length - 1 ? "border-b border-white/5" : ""}`}
                      onClick={() => setLocation(`/transaction/${tx.id}`)}
                    >
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-inner-glow transition-colors ${tx.amount > 0 ? "bg-primary/10 text-primary border border-primary/20" : "bg-secondary text-foreground"}`}>
                        {tx.amount > 0 ? <ArrowDownLeft className="w-5 h-5" /> : <ArrowUpRight className="w-5 h-5" />}
                      </div>

                      <div className="flex-1 min-w-0">
                        <h4 className={`font-semibold text-[15px] truncate ${textPrimary}`}>{tx.title}</h4>
                        <p className="text-[13px] text-muted-foreground truncate font-medium mt-1">{tx.subtitle}</p>
                      </div>

                      <div className="text-right shrink-0">
                        <div className={`font-semibold tracking-wide ${tx.amount > 0 ? "text-primary" : textPrimary}`}>
                          {tx.amount > 0 ? "+" : ""}
                          {tx.amount.toLocaleString(pl ? "pl-PL" : "en-US", { style: "currency", currency: "USD" })}
                        </div>
                        <div className="text-[12px] text-muted-foreground mt-1 font-medium uppercase tracking-wider">
                          {new Date(tx.date).toLocaleDateString(pl ? "pl-PL" : "en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </motion.div>
        )}
      </main>
    </div>
  );
}
