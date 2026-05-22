import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Plus, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppStore } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/context/ThemeContext";
import { useLang } from "@/context/LanguageContext";
import { motion, AnimatePresence } from "framer-motion";

interface SavingsGoal {
  id: string;
  emoji: string;
  name: string;
  target: number;
  saved: number;
  currency: string;
  createdAt: string;
}

const STORAGE_KEY = "finlys_goals";
const EMOJIS = ["🏖️", "🏠", "🚗", "✈️", "💍", "🎓", "💻", "🎯"];

function load(): SavingsGoal[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; }
}
function save(goals: SavingsGoal[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(goals));
}

export default function SavingsGoals() {
  const [, setLocation] = useLocation();
  const { user, sendMoney } = useAppStore();
  const { toast } = useToast();
  const { th } = useTheme();
  const { lang } = useLang();
  const pl = lang === "pl";

  const [goals, setGoals] = useState<SavingsGoal[]>(load);
  const [showForm, setShowForm] = useState(false);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [addAmount, setAddAmount] = useState("");

  // Form state
  const [formEmoji, setFormEmoji] = useState("🎯");
  const [formName, setFormName] = useState("");
  const [formTarget, setFormTarget] = useState("");
  const [formInitial, setFormInitial] = useState("");
  const [formCurrency, setFormCurrency] = useState("PLN");

  const handleCreate = () => {
    if (!formName || !formTarget) {
      toast({ title: pl ? "Uzupełnij pola" : "Fill in all fields" });
      return;
    }
    const initialDeposit = parseFloat(formInitial) || 0;
    const newGoal: SavingsGoal = {
      id: Date.now().toString(),
      emoji: formEmoji,
      name: formName,
      target: parseFloat(formTarget),
      saved: initialDeposit,
      currency: formCurrency,
      createdAt: new Date().toISOString(),
    };
    const updated = [...goals, newGoal];
    setGoals(updated);
    save(updated);
    setShowForm(false);
    setFormName("");
    setFormTarget("");
    setFormInitial("");
    setFormEmoji("🎯");
    toast({ title: pl ? "Cel utworzony!" : "Goal created!", description: `${formEmoji} ${formName}` });
  };

  const handleAddFunds = (goalId: string) => {
    const amount = parseFloat(addAmount);
    if (!amount || amount <= 0) {
      toast({ title: pl ? "Podaj kwotę" : "Enter amount" });
      return;
    }
    const updated = goals.map(g =>
      g.id === goalId ? { ...g, saved: Math.min(g.saved + amount, g.target) } : g
    );
    setGoals(updated);
    save(updated);
    setAddingTo(null);
    setAddAmount("");
    const goal = goals.find(g => g.id === goalId);
    toast({
      title: pl ? "Środki dodane" : "Funds added",
      description: `+${amount.toFixed(2)} ${goal?.currency || "PLN"} → ${goal?.name}`,
    });
  };

  const progressColor = (pct: number) => {
    if (pct >= 100) return "#22c55e";
    if (pct >= 75) return "#3b82f6";
    if (pct >= 50) return "var(--color-primary)";
    return "#a855f7";
  };

  return (
    <div className="min-h-screen bg-background pb-28 relative overflow-hidden">
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
            {pl ? "Cele oszczędnościowe" : "Savings Goals"}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {pl ? "Oszczędzaj na to, co ważne" : "Save for what matters"}
          </p>
        </div>
      </header>

      <main className="px-5 py-6 space-y-5 relative z-10">
        <Button
          onClick={() => setShowForm(s => !s)}
          className="w-full rounded-xl bg-primary text-primary-foreground font-semibold h-12 flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          {pl ? "Nowy cel" : "New Goal"}
        </Button>

        {/* Create Form */}
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
                  {pl ? "Nowy cel oszczędnościowy" : "New Savings Goal"}
                </h2>

                {/* Emoji picker */}
                <div>
                  <label className="text-xs text-muted-foreground mb-2 block">
                    {pl ? "Ikona celu" : "Goal icon"}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {EMOJIS.map(e => (
                      <button
                        key={e}
                        onClick={() => setFormEmoji(e)}
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-xl transition-all"
                        style={{
                          background: formEmoji === e ? "var(--color-primary)" : "rgba(255,255,255,0.06)",
                          border: `1px solid ${formEmoji === e ? "var(--color-primary)" : "rgba(255,255,255,0.1)"}`,
                          transform: formEmoji === e ? "scale(1.15)" : "scale(1)",
                        }}
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">
                    {pl ? "Nazwa celu" : "Goal name"}
                  </label>
                  <Input
                    placeholder={pl ? "np. Wakacje na Malediwach" : "e.g. Maldives vacation"}
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                    className="bg-secondary border-border/30 text-foreground"
                  />
                </div>

                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-xs text-muted-foreground mb-1.5 block">
                      {pl ? "Kwota docelowa" : "Target amount"}
                    </label>
                    <Input
                      type="number"
                      placeholder="0.00"
                      value={formTarget}
                      onChange={e => setFormTarget(e.target.value)}
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
                    {pl ? "Wpłata początkowa (opcjonalnie)" : "Initial deposit (optional)"}
                  </label>
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={formInitial}
                    onChange={e => setFormInitial(e.target.value)}
                    className="bg-secondary border-border/30 text-foreground"
                  />
                </div>

                <div className="flex gap-3">
                  <Button
                    onClick={handleCreate}
                    className="flex-1 rounded-xl bg-primary text-primary-foreground font-semibold h-11"
                  >
                    {pl ? "Utwórz cel" : "Create Goal"}
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

        {/* Empty state */}
        {goals.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-16 space-y-3"
          >
            <div className="w-16 h-16 mx-auto rounded-2xl bg-secondary/50 flex items-center justify-center text-3xl">
              🎯
            </div>
            <p className="text-foreground/60 font-semibold">
              {pl ? "Brak celów oszczędnościowych" : "No savings goals yet"}
            </p>
            <p className="text-xs text-muted-foreground max-w-xs mx-auto">
              {pl
                ? "Zacznij oszczędzać na marzenia — urlopów, mieszkanie, auto lub cokolwiek innego."
                : "Start saving for your dreams — vacation, home, car, or anything else."}
            </p>
          </motion.div>
        )}

        {/* Goals grid */}
        {goals.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            {goals.map((goal, i) => {
              const pct = goal.target > 0 ? Math.min((goal.saved / goal.target) * 100, 100) : 0;
              const color = progressColor(pct);
              return (
                <motion.div
                  key={goal.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.06 }}
                  className="bg-card border border-white/5 rounded-2xl p-4 space-y-3 flex flex-col"
                >
                  <div className="text-3xl">{goal.emoji}</div>
                  <div>
                    <p className="font-semibold text-sm text-foreground leading-tight">{goal.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{goal.currency}</p>
                  </div>

                  {/* Progress bar */}
                  <div>
                    <div className="w-full h-1.5 bg-secondary/60 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${pct}%`, background: color }}
                      />
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="text-[10px] text-muted-foreground">{goal.saved.toFixed(0)}</span>
                      <span className="text-[10px] font-bold" style={{ color }}>{pct.toFixed(0)}%</span>
                      <span className="text-[10px] text-muted-foreground">{goal.target.toFixed(0)}</span>
                    </div>
                  </div>

                  {/* Add funds */}
                  {addingTo === goal.id ? (
                    <div className="space-y-2">
                      <Input
                        type="number"
                        placeholder="0.00"
                        value={addAmount}
                        onChange={e => setAddAmount(e.target.value)}
                        className="bg-secondary border-border/30 text-foreground h-9 text-sm"
                        autoFocus
                      />
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => handleAddFunds(goal.id)}
                          className="flex-1 text-xs font-bold h-8 rounded-lg"
                          style={{ background: "var(--color-primary)", color: "#000" }}
                        >
                          {pl ? "Dodaj" : "Add"}
                        </button>
                        <button
                          onClick={() => { setAddingTo(null); setAddAmount(""); }}
                          className="flex-1 text-xs font-bold h-8 rounded-lg bg-secondary text-muted-foreground"
                        >
                          {pl ? "Anuluj" : "Cancel"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setAddingTo(goal.id); setAddAmount(""); }}
                      className="w-full text-xs font-bold h-8 rounded-lg transition-colors hover:opacity-80"
                      style={{ background: "rgba(var(--color-primary-rgb, 201,168,76), 0.12)", color: "var(--color-primary)", border: "1px solid rgba(var(--color-primary-rgb, 201,168,76), 0.25)" }}
                      disabled={pct >= 100}
                    >
                      {pct >= 100 ? (pl ? "Osiągnięto! 🎉" : "Reached! 🎉") : (pl ? "Dodaj środki" : "Add Funds")}
                    </button>
                  )}
                </motion.div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
