import { useState, useEffect } from "react";
import { ShieldCheck, X, Eye, EyeOff } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export type PinMode = "verify" | "setup";

interface PinEntryModalProps {
  mode: PinMode;
  onSuccess: (pinToken?: string) => void;
  onCancel: () => void;
  title?: string;
  subtitle?: string;
}

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000;
const LOCKOUT_KEY = "finlys_pin_lockout";
const ATTEMPTS_KEY = "finlys_pin_attempts";

function getLockoutRemaining(): number {
  try {
    const until = Number(localStorage.getItem(LOCKOUT_KEY) || "0");
    if (!until) return 0;
    const remaining = until - Date.now();
    if (remaining <= 0) {
      // Lockout expired — clear both keys so attempts start fresh on next open
      localStorage.removeItem(LOCKOUT_KEY);
      localStorage.removeItem(ATTEMPTS_KEY);
      return 0;
    }
    return remaining;
  } catch { return 0; }
}

function getAttempts(): number {
  try { return Number(localStorage.getItem(ATTEMPTS_KEY) || "0"); } catch { return 0; }
}

function recordFailedAttempt() {
  const attempts = getAttempts() + 1;
  try { localStorage.setItem(ATTEMPTS_KEY, String(attempts)); } catch {}
  if (attempts >= MAX_ATTEMPTS) {
    try { localStorage.setItem(LOCKOUT_KEY, String(Date.now() + LOCKOUT_MS)); } catch {}
  }
  return attempts;
}

function clearAttempts() {
  try {
    localStorage.removeItem(ATTEMPTS_KEY);
    localStorage.removeItem(LOCKOUT_KEY);
  } catch {}
}

async function apiPost<T>(url: string, body: object): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string })?.error || `Błąd ${res.status}`);
  return data as T;
}

export default function PinEntryModal({ mode, onSuccess, onCancel, title, subtitle }: PinEntryModalProps) {
  const [phase, setPhase] = useState<"enter" | "confirm">("enter");
  const [digits, setDigits] = useState<string[]>([]);
  const [firstPin, setFirstPin] = useState<string>("");
  const [processing, setProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [attemptsLeft, setAttemptsLeft] = useState(MAX_ATTEMPTS - getAttempts());
  const [lockoutRemaining, setLockoutRemaining] = useState(getLockoutRemaining());
  const [showDigits, setShowDigits] = useState(false);

  useEffect(() => {
    if (lockoutRemaining <= 0) return;
    const interval = setInterval(() => {
      const rem = getLockoutRemaining();
      setLockoutRemaining(rem);
      if (rem <= 0) {
        // Lockout expired — reset attempts display so the next try starts fresh
        setAttemptsLeft(MAX_ATTEMPTS);
        clearInterval(interval);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [lockoutRemaining]);

  const numPadKeys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];

  const handleKey = (k: string) => {
    if (processing || lockoutRemaining > 0) return;
    if (k === "del") { setDigits(d => d.slice(0, -1)); setErrorMsg(""); return; }
    if (digits.length >= 6) return;
    const next = [...digits, k];
    setDigits(next);
    if (next.length === 6) {
      setTimeout(() => handleSubmit(next.join("")), 150);
    }
  };

  const handleManualSubmit = () => {
    if (digits.length >= 4 && digits.length < 6 && !processing) {
      handleSubmit(digits.join(""));
    }
  };

  const handleSubmit = async (pin: string) => {
    setProcessing(true);
    setErrorMsg("");

    try {
      if (mode === "setup") {
        if (phase === "enter") {
          setFirstPin(pin);
          setDigits([]);
          setPhase("confirm");
          setProcessing(false);
          return;
        }
        // confirm phase
        if (pin !== firstPin) {
          setErrorMsg("PINy się nie zgadzają. Spróbuj ponownie.");
          setDigits([]);
          setPhase("enter");
          setFirstPin("");
          setProcessing(false);
          return;
        }
        await apiPost("/api/security/set-pin", { pin });
        clearAttempts();
        onSuccess();
      } else {
        // verify mode
        const data = await apiPost<{ ok: boolean; pinToken: string }>("/api/security/verify-pin", { pin });
        clearAttempts();
        onSuccess(data.pinToken);
      }
    } catch (err) {
      const errMsg = (err instanceof Error ? err.message : String(err)).toLowerCase();
      // Only count against the lockout for actual invalid-PIN rejections in verify mode.
      // Network errors, 5xx responses, and setup-mode mismatches must NOT consume attempts.
      const isInvalidPin = mode === "verify"
        && !/network error|failed to fetch|5\d\d|503|timeout/i.test(errMsg);
      const attempts = isInvalidPin ? recordFailedAttempt() : getAttempts();
      const remaining = MAX_ATTEMPTS - attempts;
      const lockRem = isInvalidPin ? getLockoutRemaining() : 0;

      if (lockRem > 0) {
        const mins = Math.ceil(lockRem / 60000);
        setLockoutRemaining(lockRem);
        setErrorMsg(`Zbyt wiele prób. Zablokowano na ${mins} min.`);
        setAttemptsLeft(0);
      } else {
        setAttemptsLeft(Math.max(0, remaining));
        setErrorMsg(
          remaining > 0
            ? `Nieprawidłowy PIN. Pozostało prób: ${remaining}.`
            : (err instanceof Error ? err.message : null) || "Błąd weryfikacji PIN."
        );
      }
      setDigits([]);
      if (mode === "setup" && phase === "confirm") { setPhase("enter"); setFirstPin(""); }
    } finally {
      setProcessing(false);
    }
  };

  const lockMins = Math.ceil(lockoutRemaining / 60000);
  const lockSecs = Math.ceil((lockoutRemaining % 60000) / 1000);

  const defaultTitle = mode === "setup"
    ? (phase === "enter" ? "Ustaw PIN bezpieczeństwa" : "Potwierdź nowy PIN")
    : "Podaj PIN bezpieczeństwa";

  const defaultSubtitle = mode === "setup"
    ? (phase === "enter" ? "Wybierz 4–6-cyfrowy PIN do autoryzacji operacji" : "Wpisz PIN jeszcze raz, aby potwierdzić")
    : "Wymagany do autoryzacji tej operacji";

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center"
        style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}
        onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
      >
        <motion.div
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 60, opacity: 0 }}
          transition={{ type: "spring", damping: 22, stiffness: 300 }}
          className="w-full max-w-sm bg-card border border-white/10 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-6 pt-6 pb-4 flex items-center justify-between border-b border-white/5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="font-bold text-sm text-white">{title || defaultTitle}</p>
                <p className="text-[12px] text-muted-foreground">{subtitle || defaultSubtitle}</p>
              </div>
            </div>
            <button onClick={onCancel} className="w-8 h-8 rounded-full bg-secondary/50 flex items-center justify-center text-muted-foreground hover:text-foreground" data-testid="pin-modal-close">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="px-6 py-6 flex flex-col items-center">
            {/* Step indicator for setup */}
            {mode === "setup" && (
              <div className="flex gap-2 mb-4">
                <div className={`h-1 w-8 rounded-full transition-colors ${phase === "enter" ? "bg-primary" : "bg-primary/40"}`} />
                <div className={`h-1 w-8 rounded-full transition-colors ${phase === "confirm" ? "bg-primary" : "bg-white/10"}`} />
              </div>
            )}

            {/* Lockout state */}
            {lockoutRemaining > 0 ? (
              <div className="text-center py-4">
                <div className="text-4xl font-mono font-bold text-red-400 mb-2">
                  {lockMins}:{String(lockSecs).padStart(2, "0")}
                </div>
                <p className="text-sm text-red-400/80">Konto PIN tymczasowo zablokowane</p>
                <p className="text-[12px] text-muted-foreground mt-1">Odblokowanie za {lockMins} min {lockSecs} s</p>
              </div>
            ) : (
              <>
                {/* PIN dots — 4 to 6 supported */}
                <div className="flex gap-3 mb-2 mt-2">
                  {[0, 1, 2, 3, 4, 5].map(i => (
                    <div
                      key={i}
                      className={`rounded-full border-2 transition-all duration-150 ${
                        digits[i] !== undefined
                          ? "w-3.5 h-3.5 bg-primary border-primary scale-110"
                          : i < 4
                          ? "w-3.5 h-3.5 bg-transparent border-white/25"
                          : "w-3.5 h-3.5 bg-transparent border-white/10"
                      }`}
                    />
                  ))}
                </div>

                {/* Show/hide digits toggle */}
                <button onClick={() => setShowDigits(v => !v)} className="mb-1 text-[11px] text-muted-foreground flex items-center gap-1 hover:text-primary transition-colors">
                  {showDigits ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  {showDigits ? "Ukryj" : "Pokaż"}
                </button>

                {/* Error message */}
                <AnimatePresence>
                  {errorMsg && (
                    <motion.p
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="text-[12px] text-red-400 text-center mb-3 px-2"
                      data-testid="pin-modal-error"
                    >
                      {errorMsg}
                    </motion.p>
                  )}
                </AnimatePresence>

                {/* Attempts warning */}
                {attemptsLeft < MAX_ATTEMPTS && attemptsLeft > 0 && !errorMsg && (
                  <p className="text-[11px] text-amber-400/70 mb-3">Pozostało prób: {attemptsLeft}</p>
                )}

                {/* Manual submit button for 4–5 digit PINs */}
                {digits.length >= 4 && digits.length < 6 && !processing && (
                  <button
                    data-testid="pin-submit"
                    onClick={handleManualSubmit}
                    className="mb-2 px-6 py-2 rounded-xl bg-primary/20 border border-primary/40 text-primary text-[13px] font-semibold hover:bg-primary/30 transition-colors"
                  >
                    Zatwierdź
                  </button>
                )}

                {/* Numpad */}
                {processing ? (
                  <div className="flex items-center justify-center h-40">
                    <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-3 w-full max-w-[240px] mt-2">
                    {numPadKeys.map((k, i) => {
                      if (k === "") return <div key={i} />;
                      return (
                        <button
                          key={k}
                          data-testid={`pin-key-${k}`}
                          onClick={() => handleKey(k)}
                          className="h-14 rounded-2xl text-xl font-semibold text-white/85 bg-secondary/60 border border-white/6 active:scale-95 transition-all hover:bg-secondary/90"
                        >
                          {k === "del" ? "⌫" : (showDigits && digits[numPadKeys.slice(0, i).filter(n => n !== "" && n !== "del").length] ? digits[numPadKeys.slice(0, i).filter(n => n !== "" && n !== "del").length] : k)}
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
