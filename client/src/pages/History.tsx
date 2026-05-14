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

  const pl = lang === "pl";

  const filteredTransactions = transactions.filter(tx =>
    tx.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    tx.subtitle.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
          <Button variant="outline" size="icon" className="h-12 w-12 rounded-xl bg-card border-white/10 shrink-0 text-muted-foreground hover:text-foreground">
            <Filter className="w-5 h-5" />
          </Button>
        </div>
      </header>

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
