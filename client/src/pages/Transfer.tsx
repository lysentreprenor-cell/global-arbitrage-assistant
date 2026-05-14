import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, ArrowRight, User, Sparkles, AlertTriangle, ShieldAlert, ShieldCheck } from "lucide-react";
import PinEntryModal from "@/components/PinEntryModal";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

const POLISH_ERRORS: Record<string, string> = {
  "Authentication required":                  "Wymagane zalogowanie.",
  "Invalid amount":                           "Nieprawidłowa kwota.",
  "Insufficient balance":                     "Niewystarczające środki.",
  "You cannot transfer money to yourself":    "Nie możesz przelać środków do siebie.",
  "Cannot send to yourself":                  "Nie możesz przelać środków do siebie.",
  "Network error. Please try again.":         "Błąd sieci. Spróbuj ponownie.",
  "Transfer failed":                          "Przelew nie powiódł się.",
  "Recipient not found":                      "Nie znaleziono odbiorcy.",
  "Nieprawidłowy lub wygasły token PIN.":     "Nieprawidłowy lub wygasły token PIN.",
  "Forbidden":                                "Brak uprawnień.",
  "Unauthorized":                             "Wymagane zalogowanie.",
  "Too many requests":                        "Zbyt wiele prób. Odczekaj chwilę i spróbuj ponownie.",
  "Too Many Requests":                        "Zbyt wiele prób. Odczekaj chwilę i spróbuj ponownie.",
  "Rate limit exceeded":                      "Zbyt wiele prób. Odczekaj chwilę i spróbuj ponownie.",
};

function polishError(msg?: string): string {
  if (!msg) return "Przelew nie powiódł się.";
  if (POLISH_ERRORS[msg]) return POLISH_ERRORS[msg];
  // Backend: "Insufficient {CURRENCY} balance" — e.g. "Insufficient USD balance"
  if (/^Insufficient \w+ balance$/.test(msg)) return "Niewystarczające środki na koncie.";
  // Catch raw technical / JS error strings — never show them
  if (msg.length > 100 || /Error:|undefined|null|stack|TypeError/i.test(msg)) return "Przelew nie powiódł się.";
  return msg;
}

interface RiskModalProps {
  riskLevel: string;
  riskReasons: string[];
  onConfirm: () => void;
  onCancel: () => void;
}

function RiskAcknowledgmentModal({ riskLevel, riskReasons, onConfirm, onCancel }: RiskModalProps) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center"
        style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(8px)" }}
      >
        <motion.div
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 60, opacity: 0 }}
          transition={{ type: "spring", damping: 22, stiffness: 300 }}
          className="w-full max-w-sm bg-card border border-amber-400/30 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden"
        >
          <div className="px-6 pt-6 pb-4 flex items-center gap-3 border-b border-amber-400/15">
            <div className="w-10 h-10 rounded-2xl bg-amber-400/10 border border-amber-400/20 flex items-center justify-center shrink-0">
              <ShieldAlert className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <p className="font-bold text-sm text-white">Przelew wymaga potwierdzenia</p>
              <p className="text-[12px] text-amber-400/70">
                Poziom ryzyka: <span className="font-semibold uppercase">{riskLevel === "high" ? "WYSOKI" : riskLevel}</span>
              </p>
            </div>
          </div>

          <div className="px-6 py-5">
            <p className="text-sm text-muted-foreground mb-4">
              {riskLevel === "medium"
                ? "To wygląda na nietypową operację. Sprawdź dane przed potwierdzeniem."
                : "System wykrył czynniki ryzyka dla tej operacji:"}
            </p>
            <ul className="space-y-2 mb-6">
              {riskReasons.map((r, i) => (
                <li key={i} className="flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
                  <span className="text-[13px] text-white/80">{r}</span>
                </li>
              ))}
            </ul>
            <p className="text-[12px] text-muted-foreground mb-5">
              Potwierdzając, akceptujesz odpowiedzialność za tę transakcję.
            </p>
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1 rounded-2xl border-white/10 text-muted-foreground"
                onClick={onCancel}
                data-testid="risk-modal-cancel"
              >
                Anuluj
              </Button>
              <Button
                className="flex-1 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-bold"
                onClick={onConfirm}
                data-testid="risk-modal-confirm"
              >
                Rozumiem, kontynuuj
              </Button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export default function Transfer() {
  const [, setLocation] = useLocation();
  const { user, sendMoney, addMoney, wallets, sessionConfirmed } = useAppStore();
  const { toast } = useToast();
  const { theme, th } = useTheme();
  const isLight = theme === "arctic-platinum";

  const [amount, setAmount] = useState("0");
  const [recipient, setRecipient] = useState("");
  const [mode, setMode] = useState<"send" | "add">("send");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [riskPending, setRiskPending] = useState<{
    riskLevel: string;
    riskReasons: string[];
  } | null>(null);

  const [showPinGate, setShowPinGate] = useState(false);
  const [pinEnabled, setPinEnabled] = useState(false);
  const pendingPinToken = useRef<string | undefined>(undefined);
  const pendingRiskAcknowledged = useRef(false);

  useEffect(() => {
    if (!user) return;
    fetch("/api/security-center", { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(d => { setPinEnabled(d?.settings?.pinEnabled ?? false); })
      .catch(() => { setPinEnabled(true); });
  }, [user]);

  if (!user || !sessionConfirmed) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-5 px-6">
        <ShieldCheck className="w-12 h-12 text-primary/60" />
        <p className="text-[15px] text-muted-foreground text-center" data-testid="transfer-auth-guard">
          Zaloguj się, aby kontynuować
        </p>
        <Button variant="outline" className="rounded-2xl border-white/10" onClick={() => setLocation("/login")}>
          Przejdź do logowania
        </Button>
      </div>
    );
  }

  const handleNumberClick = (num: string) => {
    if (amount === "0" && num !== ".") {
      setAmount(num);
    } else {
      if (num === "." && amount.includes(".")) return;
      setAmount(amount + num);
    }
  };

  const handleDelete = () => {
    if (amount.length <= 1) {
      setAmount("0");
    } else {
      setAmount(amount.slice(0, -1));
    }
  };

  const executeTransfer = async (riskAcknowledged = false, pinToken?: string) => {
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) return;

    if (mode === "send") {
      if (!recipient.trim()) {
        toast({ title: "Błąd", description: "Podaj odbiorcę przelewu.", variant: "destructive" });
        return;
      }
      setIsSubmitting(true);
      const result = await sendMoney(numAmount, recipient, undefined, undefined, riskAcknowledged, pinToken);
      setIsSubmitting(false);

      if (!result.success) {
        if (result.requiresPin) {
          pendingRiskAcknowledged.current = riskAcknowledged;
          setShowPinGate(true);
          return;
        }
        if (result.requiresAcknowledgment && result.riskLevel && result.riskReasons) {
          setRiskPending({ riskLevel: result.riskLevel, riskReasons: result.riskReasons });
          return;
        }
        toast({ title: "Błąd przelewu", description: polishError(result.error), variant: "destructive" });
        return;
      }
      if (result.riskLevel === "medium") {
        toast({ title: "Przelew wysłany — Uwaga", description: "To wygląda na nietypową operację. Sprawdź dane przed potwierdzeniem.", variant: "destructive" });
      } else {
        toast({ title: "Przelew wysłany", description: `Przelano ${numAmount.toFixed(2)} USD do ${recipient}` });
      }
      setLocation("/");
    } else {
      addMoney(numAmount);
      toast({ title: "Środki dodane", description: `Dodano ${numAmount.toFixed(2)} USD do portfela` });
      setLocation("/");
    }
  };

  const handleSubmit = () => {
    if (isSubmitting) return;
    const numAmount = parseFloat(amount);
    if (numAmount >= 100 && pinEnabled && mode === "send") {
      pendingRiskAcknowledged.current = false;
      setShowPinGate(true);
      return;
    }
    executeTransfer(false);
  };

  const handlePinGateSuccess = (token?: string) => {
    setShowPinGate(false);
    pendingPinToken.current = token;
    executeTransfer(pendingRiskAcknowledged.current, token);
  };

  const handleRiskConfirm = () => {
    setRiskPending(null);
    const numAmount = parseFloat(amount);
    if (numAmount >= 100 && pinEnabled && mode === "send" && !pendingPinToken.current) {
      pendingRiskAcknowledged.current = true;
      setShowPinGate(true);
      return;
    }
    executeTransfer(true, pendingPinToken.current);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col relative overflow-hidden">
      {showPinGate && (
        <PinEntryModal
          mode="verify"
          onSuccess={handlePinGateSuccess}
          onCancel={() => setShowPinGate(false)}
          title="Weryfikacja PIN"
          subtitle="Wymagany dla przelewów powyżej 100"
        />
      )}
      {riskPending && (
        <RiskAcknowledgmentModal
          riskLevel={riskPending.riskLevel}
          riskReasons={riskPending.riskReasons}
          onConfirm={handleRiskConfirm}
          onCancel={() => setRiskPending(null)}
        />
      )}

      <div className="absolute top-20 right-0 w-[300px] h-[300px] bg-primary/10 rounded-full blur-[100px] translate-x-1/2 pointer-events-none"></div>

      <header className="px-6 py-6 flex items-center justify-between relative z-10">
        <Button variant="ghost" size="icon" className="rounded-full bg-secondary shadow-sm border border-white/5" onClick={() => setLocation("/")} data-testid="btn-back">
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </Button>
        <div className="flex bg-card border border-white/10 rounded-full p-1 shadow-inner-glow">
          <button
            data-testid="tab-send"
            className={`px-5 py-2 rounded-full text-[13px] font-semibold uppercase tracking-widest transition-all ${mode === "send" ? "bg-primary text-primary-foreground shadow-md" : "text-muted-foreground hover:text-foreground"}`}
            onClick={() => setMode("send")}
          >
            Przelew
          </button>
          <button
            data-testid="tab-add"
            className={`px-5 py-2 rounded-full text-[13px] font-semibold uppercase tracking-widest transition-all ${mode === "add" ? "bg-primary text-primary-foreground shadow-md" : "text-muted-foreground hover:text-foreground"}`}
            onClick={() => setMode("add")}
          >
            Depozyt
          </button>
        </div>
        <div className="w-10"></div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-6 mt-[-5vh] relative z-10">

        {mode === "send" && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-[320px] mb-8"
          >
            <div className="flex items-center gap-4 p-3 bg-card border border-white/10 rounded-2xl shadow-sm focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/50 transition-all">
              <div className="w-10 h-10 bg-secondary text-primary rounded-xl flex items-center justify-center border border-white/5">
                <User className="w-5 h-5" />
              </div>
              <input
                type="text"
                placeholder="Imię, @handle lub IBAN"
                className="bg-transparent border-none outline-none flex-1 text-sm font-medium placeholder:text-muted-foreground"
                style={{ color: th.textPrimary }}
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                data-testid="input-recipient"
              />
            </div>
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <div className="text-primary font-semibold text-[13px] uppercase tracking-[0.15em] mb-4 flex items-center justify-center gap-1.5">
            <Sparkles className="w-3 h-3" />
            Kwota
          </div>
          <div className="text-7xl font-light font-mono tracking-tight flex items-center justify-center" style={{ color: th.textPrimary }}>
            <span className="text-4xl mr-2 font-sans" style={{ color: isLight ? "rgba(10,20,60,0.30)" : "rgba(255,255,255,0.30)" }}>$</span>
            {amount}
          </div>
          {mode === "send" && (
            <div className="text-[13px] font-medium text-muted-foreground mt-6 px-4 py-2 bg-secondary/50 rounded-full inline-flex border border-white/5">
              Dostępne: ${(wallets.USD ?? 0).toLocaleString('pl-PL', { minimumFractionDigits: 2 })}
            </div>
          )}
        </motion.div>

        {/* Numpad */}
        <div className="w-full max-w-[320px] grid grid-cols-3 gap-y-4 gap-x-6 mb-10">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, ".", 0].map((num) => (
            <button
              key={num}
              data-testid={`numpad-${num}`}
              onClick={() => handleNumberClick(num.toString())}
              className="text-2xl font-light font-mono h-16 flex items-center justify-center rounded-2xl active:scale-95 transition-all shadow-sm"
              style={{
                background: isLight ? "rgba(255,255,255,0.85)" : "var(--color-card, rgba(255,255,255,0.04))",
                border: `1px solid ${isLight ? "rgba(10,30,90,0.12)" : "rgba(255,255,255,0.07)"}`,
                color: isLight ? "#0a1428" : "rgba(255,255,255,0.90)",
                boxShadow: isLight
                  ? "0 2px 8px rgba(80,110,180,0.10), inset 0 1px 0 rgba(255,255,255,0.90)"
                  : "0 4px 12px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.06)",
              }}
            >
              {num}
            </button>
          ))}
          <button
            data-testid="numpad-delete"
            onClick={handleDelete}
            className="text-2xl font-light h-16 flex items-center justify-center rounded-2xl active:scale-95 transition-all shadow-sm"
            style={{
              background: isLight ? "rgba(255,255,255,0.85)" : "var(--color-card, rgba(255,255,255,0.04))",
              border: `1px solid ${isLight ? "rgba(10,30,90,0.12)" : "rgba(255,255,255,0.07)"}`,
              color: isLight ? "#0a1428" : "rgba(255,255,255,0.90)",
              boxShadow: isLight
                ? "0 2px 8px rgba(80,110,180,0.10), inset 0 1px 0 rgba(255,255,255,0.90)"
                : "0 4px 12px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.06)",
            }}
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
        </div>

        <Button
          size="lg"
          data-testid="btn-submit-transfer"
          className="w-full max-w-[320px] h-16 rounded-2xl text-[15px] font-semibold tracking-wide uppercase shadow-premium"
          onClick={handleSubmit}
          disabled={isSubmitting || parseFloat(amount) <= 0}
        >
          {isSubmitting ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Przetwarzanie…
            </span>
          ) : mode === "send" ? (
            <>Autoryzuj przelew <ArrowRight className="w-5 h-5 ml-2" /></>
          ) : (
            "Potwierdź depozyt"
          )}
        </Button>
      </main>
    </div>
  );
}
