import { useLocation } from "wouter";
import { ArrowLeft, ArrowDownLeft, ArrowUpRight, Search, Calendar, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppStore, Transaction } from "@/lib/store";
import { motion } from "framer-motion";
import { useState, useMemo } from "react";
import { useLang } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";

export default function History() {
  const [, setLocation] = useLocation();
  const { transactions } = useAppStore();
  const { lang } = useLang();
  const { theme } = useTheme();
  const isLight = theme === "arctic-platinum";
  const [searchTerm, setSearchTerm] = useState("");
  const [showFilter, setShowFilter] = useState(false);
  const [filterType, setFilterType] = useState<"all" | "send" | "receive" | "exchange" | "contract">("all");
  const [filterPeriod, setFilterPeriod] = useState<"all" | "7d" | "30d" | "90d">("all");

  const pl = lang === "pl";
  const filterActive = filterType !== "all" || filterPeriod !== "all";

  const filteredTransactions = transactions.filter(tx => {
    const matchesSearch =
      tx.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tx.subtitle.toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;

    if (filterType !== "all") {
      if (filterType === "send" && tx.type !== "send") return false;
      if (filterType === "receive" && tx.type !== "receive") return false;
      if (filterType === "exchange" && tx.type !== "exchange") return false;
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
    <div className="min-h-screen bg-background pb-24 relative overflow-hidden">
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

      <main className="px-6 py-6 relative z-10 space-y-8">
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
