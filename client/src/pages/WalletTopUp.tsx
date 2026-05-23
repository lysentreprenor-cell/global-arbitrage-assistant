import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, CreditCard, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore, CurrencyCode, CURRENCY_SYMBOLS } from "@/lib/store";
import { useTheme } from "@/context/ThemeContext";
import { useLang } from "@/context/LanguageContext";

type TopupCurrency = "NOK" | "USD" | "EUR" | "GBP" | "CHF" | "PLN";

const CURRENCY_FLAGS: Record<TopupCurrency, string> = {
  NOK: "🇳🇴", USD: "🇺🇸", EUR: "🇪🇺", GBP: "🇬🇧", CHF: "🇨🇭", PLN: "🇵🇱",
};

const CURRENCY_ORDER: TopupCurrency[] = ["NOK", "USD", "EUR", "GBP", "CHF", "PLN"];

const PRESETS: Record<TopupCurrency, number[]> = {
  NOK: [100, 250, 500, 1000],
  USD: [50, 100, 200, 500],
  EUR: [50, 100, 200, 500],
  GBP: [50, 100, 200, 500],
  CHF: [50, 100, 200, 500],
  PLN: [100, 250, 500, 1000],
};

const goldText: React.CSSProperties = {
  background: "linear-gradient(135deg, #f7d248 0%, #e8a820 50%, #f7d248 100%)",
  WebkitBackgroundClip: "text",
  WebkitTextFillColor: "transparent",
  backgroundClip: "text",
};

type VerifyState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "credited"; amount: number; currency: string }
  | { status: "already_credited"; amount: number; currency: string }
  | { status: "fallback" }
  | { status: "error"; message: string };

export default function WalletTopUp() {
  const [, setLocation] = useLocation();
  const { user, refreshWallets } = useAppStore();
  const { th, theme } = useTheme();
  const { t } = useLang();
  const isLight = (theme as string) === "arctic-platinum";

  const searchParams = new URLSearchParams(window.location.search);
  const isSuccess = searchParams.get("success") === "true";
  const sessionId = searchParams.get("session_id") ?? "";
  const isCanceled = searchParams.get("canceled") === "true" || window.location.search.includes("canceled");

  const [currency, setCurrency] = useState<TopupCurrency>("NOK");
  const [amountStr, setAmountStr] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifyState, setVerifyState] = useState<VerifyState>({ status: "idle" });

  useEffect(() => {
    if (!isSuccess) return;
    if (!sessionId) {
      setVerifyState({ status: "fallback" });
      return;
    }
    setVerifyState({ status: "loading" });

    fetch(`/api/stripe/verify-session?session_id=${encodeURIComponent(sessionId)}`)
      .then(async r => {
        const data = await r.json() as {
          credited?: boolean;
          alreadyCredited?: boolean;
          amount?: number;
          currency?: string;
          error?: string;
        };
        if (!r.ok) throw new Error(data.error ?? "Server error");
        if (data.credited) {
          setVerifyState({ status: "credited", amount: data.amount!, currency: data.currency! });
          refreshWallets().catch(() => {});
        } else if (data.alreadyCredited) {
          setVerifyState({ status: "already_credited", amount: data.amount!, currency: data.currency! });
          refreshWallets().catch(() => {});
        } else {
          setVerifyState({ status: "fallback" });
        }
      })
      .catch((err: unknown) => {
        console.error("[WalletTopUp] verify-session error:", err);
        setVerifyState({ status: "fallback" });
      });
  }, [isSuccess, sessionId]);

  const sym = CURRENCY_SYMBOLS[currency];
  const parsedAmount = parseFloat(amountStr.replace(",", ".")) || 0;
  const TOPUP_MIN = 10;
  const TOPUP_MAX = 5000;
  const isValidAmount = parsedAmount >= TOPUP_MIN && parsedAmount <= TOPUP_MAX;

  const handlePreset = (val: number) => {
    setAmountStr(String(val));
    setError(null);
  };

  const handleCurrencyChange = (c: TopupCurrency) => {
    setCurrency(c);
    setAmountStr("");
    setError(null);
  };

  const handleTopUp = async () => {
    if (isLoading) return;
    if (!user?.id) {
      setError(t.topupLoginAgain);
      return;
    }
    if (!isValidAmount) {
      setError(t.topupEnterValidAmount);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/stripe/create-topup-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: parsedAmount, currency }),
      });

      const data = await res.json() as { url?: string; error?: string };

      if (!res.ok || !data.url) {
        throw new Error(data.error || t.topupStripeError);
      }

      window.location.href = data.url;
    } catch (err) {
      setIsLoading(false);
      setError(err instanceof Error ? err.message : t.unknownError);
    }
  };

  const btnStyle = (active: boolean): React.CSSProperties => ({
    height: 44,
    borderRadius: 12,
    cursor: "pointer",
    fontSize: 15,
    fontWeight: 800,
    border: active
      ? "1.5px solid rgba(247,210,72,0.90)"
      : `1px solid ${isLight ? "rgba(0,0,80,0.10)" : "rgba(255,255,255,0.10)"}`,
    background: active
      ? (isLight ? "rgba(247,210,72,0.18)" : "rgba(247,210,72,0.12)")
      : (isLight ? "rgba(0,0,50,0.04)" : "rgba(255,255,255,0.04)"),
    color: active
      ? (isLight ? "#7a5200" : "#f7d248")
      : (isLight ? "#0a1428" : "rgba(255,255,255,0.70)"),
    transition: "all 0.15s ease",
  });

  // ── Success screen ────────────────────────────────────────────────────────
  if (isSuccess) {
    const isVerifying = verifyState.status === "loading" || verifyState.status === "idle";
    const isCredited =
      verifyState.status === "credited" || verifyState.status === "already_credited";
    const creditedAmount =
      isCredited ? (verifyState as { amount: number; currency: string }).amount : null;
    const creditedCurrency =
      isCredited ? (verifyState as { amount: number; currency: string }).currency : null;
    const creditedSym = creditedCurrency ? (CURRENCY_SYMBOLS[creditedCurrency as CurrencyCode] ?? creditedCurrency) : null;

    return (
      <div style={{
        minHeight: "100vh",
        background: isLight ? "#f0f4ff" : "linear-gradient(160deg, #0c1020 0%, #111827 100%)",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        padding: "0 24px",
      }}>
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 18 }}
          style={{ textAlign: "center", maxWidth: 320 }}
        >
          {isVerifying ? (
            <>
              <div style={{
                width: 80, height: 80, borderRadius: "50%", margin: "0 auto 24px",
                background: "rgba(247,210,72,0.12)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Loader2 size={40} color="#f7d248" style={{ animation: "spin 1s linear infinite" }} />
              </div>
              <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 10, color: isLight ? "#0a1428" : "#fff" }}>
                {t.topupVerifying}
              </h2>
              <p style={{ fontSize: 14, color: isLight ? "#64748b" : "rgba(255,255,255,0.55)", marginBottom: 32, lineHeight: 1.6 }}>
                {t.topupPleaseWait}
              </p>
            </>
          ) : (
            <>
              <div style={{
                width: 80, height: 80, borderRadius: "50%", margin: "0 auto 24px",
                background: "rgba(36,212,135,0.14)",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 0 40px rgba(36,212,135,0.25)",
              }}>
                <CheckCircle size={40} color="#24d487" />
              </div>
              <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 10, color: isLight ? "#0a1428" : "#fff" }}>
                {t.topupPaymentConfirmed}
              </h2>

              {isCredited && creditedAmount && creditedCurrency ? (
                <div style={{ marginBottom: 32 }}>
                  <div style={{
                    fontSize: 36, fontWeight: 900, letterSpacing: -1,
                    ...(isLight ? { color: "#7a5200" } : goldText),
                    marginBottom: 6,
                  }}>
                    +{creditedSym}{creditedAmount.toLocaleString("nb-NO")} {creditedCurrency}
                  </div>
                  <p style={{ fontSize: 14, color: isLight ? "#64748b" : "rgba(255,255,255,0.55)", lineHeight: 1.6 }}>
                    {t.topupAddedToWallet.replace("{cur}", creditedCurrency)}
                  </p>
                </div>
              ) : (
                <p style={{ fontSize: 14, color: isLight ? "#64748b" : "rgba(255,255,255,0.55)", marginBottom: 32, lineHeight: 1.6 }}>
                  {t.topupBalancePending}
                </p>
              )}
            </>
          )}

          <button
            data-testid="btn-topup-go-home"
            onClick={() => setLocation("/")}
            disabled={isVerifying}
            style={{
              width: "100%", height: 52, borderRadius: 999, border: "none",
              cursor: isVerifying ? "not-allowed" : "pointer",
              opacity: isVerifying ? 0.5 : 1,
              fontSize: 15, fontWeight: 800, color: "#1a1400",
              background: "linear-gradient(180deg, #fff4b8 0%, #f9d95e 22%, #d4a020 62%, #b8880a 100%)",
              boxShadow: isVerifying ? "none" : "0 3px 0 rgba(140,90,4,0.90), 0 8px 20px rgba(210,158,20,0.45)",
            }}
          >
            {t.topupBackToWallet}
          </button>
        </motion.div>
      </div>
    );
  }

  // ── Canceled screen ───────────────────────────────────────────────────────
  if (isCanceled) {
    return (
      <div style={{
        minHeight: "100vh",
        background: isLight ? "#f0f4ff" : "linear-gradient(160deg, #0c1020 0%, #111827 100%)",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        padding: "0 24px",
      }}>
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 18 }}
          style={{ textAlign: "center", maxWidth: 320 }}
        >
          <div style={{
            width: 80, height: 80, borderRadius: "50%", margin: "0 auto 24px",
            background: "rgba(239,68,68,0.12)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <XCircle size={40} color="#ef4444" />
          </div>
          <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 10, color: isLight ? "#0a1428" : "#fff" }}>
            {t.topupPaymentCanceled}
          </h2>
          <p style={{ fontSize: 14, color: isLight ? "#64748b" : "rgba(255,255,255,0.55)", marginBottom: 32 }}>
            {t.topupNothingCharged}
          </p>
          <button
            data-testid="btn-topup-try-again"
            onClick={() => setLocation("/wallet/top-up")}
            style={{
              width: "100%", height: 52, borderRadius: 999, border: "none", cursor: "pointer",
              fontSize: 15, fontWeight: 800, color: "#1a1400",
              background: "linear-gradient(180deg, #fff4b8 0%, #f9d95e 22%, #d4a020 62%, #b8880a 100%)",
              boxShadow: "0 3px 0 rgba(140,90,4,0.90), 0 8px 20px rgba(210,158,20,0.45)",
            }}
          >
            {t.topupTryAgain}
          </button>
          <button
            data-testid="btn-topup-cancel-back"
            onClick={() => setLocation("/")}
            style={{
              width: "100%", height: 48, borderRadius: 999, cursor: "pointer", marginTop: 12,
              fontSize: 14, fontWeight: 700, border: "1px solid rgba(238,203,100,0.30)",
              background: "transparent", color: isLight ? "#9a7010" : "#e8d080",
            }}
          >
            {t.topupBackToHome}
          </button>
        </motion.div>
      </div>
    );
  }

  // ── Main top-up form ──────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: "100vh",
      background: isLight ? "#f0f4ff" : "linear-gradient(160deg, #0c1020 0%, #111827 100%)",
      display: "flex", flexDirection: "column",
    }}>
      {/* Header */}
      <div style={{
        padding: "16px 20px 12px",
        display: "flex", alignItems: "center", gap: 12,
        borderBottom: `1px solid ${isLight ? "rgba(0,0,50,0.08)" : "rgba(255,255,255,0.06)"}`,
      }}>
        <button
          data-testid="btn-topup-back"
          onClick={() => setLocation("/")}
          style={{
            width: 36, height: 36, borderRadius: "50%", border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            background: isLight ? "rgba(0,0,50,0.06)" : "rgba(255,255,255,0.08)",
            color: isLight ? "#0a1428" : "#fff",
          }}
        >
          <ArrowLeft size={18} />
        </button>
        <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: 0.2, color: isLight ? "#0a1428" : "#fff" }}>
          {t.topupTitle}
        </span>
      </div>

      {/* Body */}
      <div style={{ flex: 1, padding: "24px 20px 32px", display: "flex", flexDirection: "column", gap: 24 }}>

        {/* Currency selector */}
        <div>
          <div style={{
            fontSize: 11, fontWeight: 800, letterSpacing: 3,
            color: isLight ? "#64748b" : "rgba(255,255,255,0.4)", marginBottom: 12,
          }}>
            {t.topupSelectCurrency}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            {CURRENCY_ORDER.map(c => {
              const active = currency === c;
              return (
                <button
                  key={c}
                  data-testid={`btn-topup-currency-${c}`}
                  onClick={() => handleCurrencyChange(c)}
                  style={{
                    height: 52, borderRadius: 14, cursor: "pointer",
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2,
                    border: active
                      ? "1.5px solid rgba(247,210,72,0.90)"
                      : `1px solid ${isLight ? "rgba(0,0,80,0.10)" : "rgba(255,255,255,0.10)"}`,
                    background: active
                      ? (isLight ? "rgba(247,210,72,0.18)" : "rgba(247,210,72,0.12)")
                      : (isLight ? "rgba(0,0,50,0.04)" : "rgba(255,255,255,0.04)"),
                    transition: "all 0.15s ease",
                    boxShadow: active ? "0 0 0 1px rgba(247,210,72,0.25)" : "none",
                  }}
                >
                  <span style={{ fontSize: 20, lineHeight: 1 }}>{CURRENCY_FLAGS[c]}</span>
                  <span style={{
                    fontSize: 12, fontWeight: 800, letterSpacing: 0.5,
                    color: active
                      ? (isLight ? "#7a5200" : "#f7d248")
                      : (isLight ? "#0a1428" : "rgba(255,255,255,0.65)"),
                  }}>
                    {c}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Amount input */}
        <div>
          <div style={{
            fontSize: 11, fontWeight: 800, letterSpacing: 3,
            color: isLight ? "#64748b" : "rgba(255,255,255,0.4)", marginBottom: 12,
          }}>
            {t.topupEnterAmountLabel} ({currency})
          </div>

          {/* Big amount input */}
          <div style={{ position: "relative" }}>
            <span style={{
              position: "absolute", left: 18, top: "50%", transform: "translateY(-50%)",
              fontSize: 22, fontWeight: 900,
              color: isLight ? "#64748b" : "rgba(255,255,255,0.40)",
              pointerEvents: "none", userSelect: "none",
            }}>
              {sym}
            </span>
            <input
              data-testid="input-topup-amount"
              type="number"
              inputMode="decimal"
              min={1}
              max={1000000}
              placeholder="0"
              value={amountStr}
              onChange={e => { setAmountStr(e.target.value); setError(null); }}
              style={{
                width: "100%", height: 64, borderRadius: 16,
                paddingLeft: sym.length > 1 ? 50 : 44,
                paddingRight: 18,
                fontSize: 28, fontWeight: 900, letterSpacing: -0.5,
                background: isLight ? "rgba(0,0,50,0.04)" : "rgba(255,255,255,0.05)",
                border: `2px solid ${isLight ? "rgba(0,0,80,0.15)" : "rgba(247,210,72,0.35)"}`,
                color: isLight ? "#0a1428" : "#fff",
                outline: "none", boxSizing: "border-box",
              }}
            />
          </div>

          {/* Quick-fill presets */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginTop: 10 }}>
            {PRESETS[currency].map(val => {
              const active = parseFloat(amountStr) === val;
              return (
                <button
                  key={val}
                  data-testid={`btn-topup-preset-${val}`}
                  onClick={() => handlePreset(val)}
                  style={btnStyle(active)}
                >
                  {val}
                </button>
              );
            })}
          </div>
        </div>

        {/* Summary card */}
        <AnimatePresence>
          {parsedAmount > 0 && isValidAmount && (
            <motion.div
              key="summary"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              style={{
                borderRadius: 16, padding: "16px 20px",
                background: isLight ? "rgba(247,210,72,0.08)" : "rgba(247,210,72,0.06)",
                border: `1px solid ${isLight ? "rgba(247,210,72,0.30)" : "rgba(247,210,72,0.18)"}`,
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}
            >
              <div>
                <div style={{
                  fontSize: 11, fontWeight: 700, letterSpacing: 2,
                  color: isLight ? "#7a5200" : "rgba(247,210,72,0.60)",
                }}>
                  {t.topupYoullAdd}
                </div>
                <div style={{ fontSize: 26, fontWeight: 900, marginTop: 2, ...(isLight ? { color: "#7a5200" } : goldText) }}>
                  {sym}{parsedAmount.toLocaleString("nb-NO")} {currency}
                </div>
              </div>
              <div style={{ fontSize: 28 }}>{CURRENCY_FLAGS[currency]}</div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error */}
        {error && (
          <div style={{
            borderRadius: 12, padding: "12px 16px", fontSize: 13, fontWeight: 600,
            background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.25)",
            color: "#ef4444",
          }}>
            {error}
          </div>
        )}

        {/* CTA */}
        <div style={{ marginTop: "auto" }}>
          <button
            data-testid="btn-topup-pay"
            onClick={handleTopUp}
            disabled={isLoading || !isValidAmount}
            style={{
              width: "100%", height: 56, borderRadius: 999, border: "none",
              cursor: isLoading || !isValidAmount ? "not-allowed" : "pointer",
              fontSize: 15, fontWeight: 800, letterSpacing: 0.3,
              opacity: isLoading || !isValidAmount ? 0.55 : 1,
              color: "#1a1400",
              background: "linear-gradient(180deg, #fff4b8 0%, #f9d95e 22%, #d4a020 62%, #b8880a 100%)",
              boxShadow: isLoading || !isValidAmount
                ? "none"
                : "inset 0 1.5px 0 rgba(255,255,240,0.80), 0 3px 0 rgba(140,90,4,0.90), 0 8px 20px rgba(210,158,20,0.45)",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
              transition: "all 0.15s ease",
            }}
          >
            {isLoading ? (
              <><Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} />
                {t.topupRedirecting}</>
            ) : (
              <><CreditCard size={18} />
                {isValidAmount
                  ? `${t.topupAddViaCard} — ${sym}${parsedAmount.toLocaleString("nb-NO")} ${currency}`
                  : t.topupAddViaCard
                }</>
            )}
          </button>

          <p style={{
            textAlign: "center", marginTop: 14, fontSize: 11,
            color: isLight ? "#94a3b8" : "rgba(255,255,255,0.30)",
            lineHeight: 1.5,
          }}>
            {t.topupStripeNote}
          </p>
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        input[type=number]::-webkit-outer-spin-button,
        input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        input[type=number] { -moz-appearance: textfield; }
      `}</style>
    </div>
  );
}
