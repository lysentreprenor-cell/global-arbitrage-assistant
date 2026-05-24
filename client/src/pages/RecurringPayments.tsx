import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Plus, Trash2, RefreshCw, PauseCircle, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/context/ThemeContext";
import { useLang } from "@/context/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";

interface RecurringPayment {
  id: string;
  recipient: string;
  amount: number;
  currency: string;
  frequency: "daily" | "weekly" | "monthly";
  startDate: string;
  nextDate: string;
  title: string;
  active: boolean;
  createdAt: string;
}

function computeNextDate(startDate: string, frequency: "daily" | "weekly" | "monthly"): string {
  const d = new Date(startDate);
  const now = new Date();
  while (d <= now) {
    if (frequency === "daily") d.setDate(d.getDate() + 1);
    else if (frequency === "weekly") d.setDate(d.getDate() + 7);
    else d.setMonth(d.getMonth() + 1);
  }
  return d.toISOString().split("T")[0];
}

export default function RecurringPayments() {
  const [, setLocation] = useLocation();
  const { th } = useTheme();
  const { lang } = useLang();
  const pl = lang === "pl";
  const { toast } = useToast();

  const [items, setItems] = useState<RecurringPayment[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    fetch("/api/recurring", { credentials: "include" })
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setItems(data); })
      .catch(() => {})
      .finally(() => setLoadingItems(false));
  }, []);

  const [formRecipient, setFormRecipient] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formCurrency, setFormCurrency] = useState("PLN");
  const [formFrequency, setFormFrequency] = useState<"daily" | "weekly" | "monthly">("monthly");
  const [formStartDate, setFormStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [formTitle, setFormTitle] = useState("");

  const FREQ_LABELS = {
    daily: pl ? "Codziennie" : "Daily",
    weekly: pl ? "Co tydzień" : "Weekly",
    monthly: pl ? "Co miesiąc" : "Monthly",
  };

  const handleSave = async () => {
    if (!formRecipient || !formAmount || !formTitle) {
      toast({ title: pl ? "Uzupełnij pola" : "Fill in all fields" });
      return;
    }
    const nextDate = computeNextDate(formStartDate, formFrequency);
    try {
      const res = await fetch("/api/recurring", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: formTitle, recipient: formRecipient, amount: parseFloat(formAmount), currency: formCurrency, frequency: formFrequency, nextDate }),
      });
      const { id } = await res.json();
      const newItem: RecurringPayment = { id, recipient: formRecipient, amount: parseFloat(formAmount), currency: formCurrency, frequency: formFrequency, startDate: formStartDate, nextDate, title: formTitle, active: true, createdAt: new Date().toISOString() };
      setItems(prev => [newItem, ...prev]);
      setShowForm(false);
      setFormRecipient(""); setFormAmount(""); setFormTitle("");
      toast({ title: pl ? "Zlecenie zapisane" : "Payment Saved", description: `${formTitle} — ${parseFloat(formAmount).toFixed(2)} ${formCurrency}` });
    } catch {
      toast({ title: pl ? "Błąd zapisu" : "Save error", variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
    await fetch(`/api/recurring/${id}`, { method: "DELETE", credentials: "include" }).catch(() => {});
    toast({ title: pl ? "Usunięto zlecenie" : "Payment deleted" });
  };

  const handleToggle = async (id: string) => {
    const item = items.find(i => i.id === id);
    if (!item) return;
    setItems(prev => prev.map(i => i.id === id ? { ...i, active: !i.active } : i));
    await fetch(`/api/recurring/${id}`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !item.active }) }).catch(() => {});
  };

  return (
    <div className="min-h-screen bg-background pb-28 relative overflow-x-hidden">
      <div className="absolute top-0 right-0 w-full h-[300px] bg-primary/5 blur-[100px] pointer-events-none" />

      <header className="px-6 pt-14 pb-6 flex items-center sticky top-0 bg-background/90 backdrop-blur-xl z-10 border-b border-border/40">
        <Button
          variant="ghost" size="icon"
          className="rounded-full bg-secondary border border-border/30 mr-4 hover:bg-secondary/80"
          onClick={() => setLocation("/")}
        >
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </Button>
        <div>
          <h1 className="text-2xl font-heading text-foreground/90">
            {pl ? "Zlecenia stałe" : "Recurring Payments"}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {pl ? "Automatyczne płatności cykliczne" : "Automatic recurring payments"}
          </p>
        </div>
      </header>

      <main className="px-5 py-6 space-y-5 relative z-10">
        <Button
          onClick={() => setShowForm(s => !s)}
          className="w-full rounded-xl bg-primary text-primary-foreground font-semibold h-12 flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          {pl ? "Nowe zlecenie" : "New Recurring Payment"}
        </Button>

        {/* Form */}
        <AnimatePresence>
          {showForm && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="bg-card border border-white/5 rounded-3xl p-5 space-y-4">
                <h2 className="text-[13px] font-black uppercase tracking-[0.20em] text-primary/80">
                  {pl ? "Nowe zlecenie stałe" : "New Recurring Payment"}
                </h2>

                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">
                    {pl ? "Odbiorca (@handle lub imię)" : "Recipient (@handle or name)"}
                  </label>
                  <Input
                    placeholder="@handle"
                    value={formRecipient}
                    onChange={e => setFormRecipient(e.target.value)}
                    className="bg-secondary border-border/30 text-foreground"
                  />
                </div>

                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">
                    {pl ? "Tytuł" : "Title"}
                  </label>
                  <Input
                    placeholder={pl ? "np. Czynsz, Netflix..." : "e.g. Rent, Netflix..."}
                    value={formTitle}
                    onChange={e => setFormTitle(e.target.value)}
                    className="bg-secondary border-border/30 text-foreground"
                  />
                </div>

                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-xs text-muted-foreground mb-1.5 block">
                      {pl ? "Kwota" : "Amount"}
                    </label>
                    <Input
                      type="number"
                      placeholder="0.00"
                      value={formAmount}
                      onChange={e => setFormAmount(e.target.value)}
                      className="bg-secondary border-border/30 text-foreground"
                    />
                  </div>
                  <div className="w-24">
                    <label className="text-xs text-muted-foreground mb-1.5 block">
                      {pl ? "Waluta" : "Currency"}
                    </label>
                    <select
                      value={formCurrency}
                      onChange={e => setFormCurrency(e.target.value)}
                      className="w-full h-10 bg-secondary border border-border/30 rounded-md px-3 text-foreground text-sm"
                    >
                      {["PLN", "EUR", "USD", "GBP", "NOK"].map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">
                    {pl ? "Częstotliwość" : "Frequency"}
                  </label>
                  <div className="flex gap-2">
                    {(["daily", "weekly", "monthly"] as const).map(freq => (
                      <button
                        key={freq}
                        onClick={() => setFormFrequency(freq)}
                        className="flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all"
                        style={{
                          background: formFrequency === freq ? "var(--color-primary)" : "rgba(255,255,255,0.06)",
                          color: formFrequency === freq ? "#000" : "rgba(255,255,255,0.6)",
                          border: `1px solid ${formFrequency === freq ? "var(--color-primary)" : "rgba(255,255,255,0.1)"}`,
                        }}
                      >
                        {FREQ_LABELS[freq]}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">
                    {pl ? "Data rozpoczęcia" : "Start Date"}
                  </label>
                  <Input
                    type="date"
                    value={formStartDate}
                    onChange={e => setFormStartDate(e.target.value)}
                    className="bg-secondary border-border/30 text-foreground"
                  />
                </div>

                <div className="flex gap-3">
                  <Button
                    onClick={handleSave}
                    className="flex-1 rounded-xl bg-primary text-primary-foreground font-semibold h-11"
                  >
                    {pl ? "Zapisz zlecenie" : "Save Payment"}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => setShowForm(false)}
                    className="flex-1 rounded-xl border border-border/30 h-11"
                  >
                    {pl ? "Anuluj" : "Cancel"}
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* List */}
        {items.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-16 space-y-3"
          >
            <div className="w-16 h-16 mx-auto rounded-2xl bg-secondary/50 flex items-center justify-center">
              <RefreshCw className="w-8 h-8 text-muted-foreground/40" />
            </div>
            <p className="text-foreground/60 font-semibold">
              {pl ? "Brak zleceń stałych" : "No recurring payments"}
            </p>
            <p className="text-xs text-muted-foreground">
              {pl ? "Dodaj pierwsze zlecenie powyżej" : "Add your first recurring payment above"}
            </p>
          </motion.div>
        ) : (
          <div className="space-y-3">
            {items.map((item, i) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="bg-card border border-white/5 rounded-2xl p-4"
                style={{ opacity: item.active ? 1 : 0.6 }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-semibold text-foreground text-sm">{item.title}</p>
                      <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                        style={{
                          background: item.active ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.06)",
                          color: item.active ? "#22c55e" : "rgba(255,255,255,0.4)",
                        }}
                      >
                        {item.active ? (pl ? "Aktywne" : "Active") : (pl ? "Wstrzymane" : "Paused")}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">{item.recipient}</p>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-base font-bold" style={{ color: "var(--color-primary)" }}>
                        {item.amount.toFixed(2)} {item.currency}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        · {FREQ_LABELS[item.frequency]}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {pl ? "Następna:" : "Next:"} {new Date(item.nextDate).toLocaleDateString(pl ? "pl-PL" : "en-US")}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggle(item.id)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
                      style={{ background: "rgba(255,255,255,0.06)" }}
                    >
                      {item.active
                        ? <PauseCircle className="w-4 h-4 text-yellow-400" />
                        : <PlayCircle className="w-4 h-4 text-green-400" />
                      }
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-destructive/10"
                      style={{ background: "rgba(255,255,255,0.06)" }}
                    >
                      <Trash2 className="w-4 h-4 text-destructive/70" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
