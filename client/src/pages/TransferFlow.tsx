import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft, Sparkles, AlertCircle, Share2, Download, Home, CreditCard,
  SendHorizontal, CheckCircle2, XCircle, Loader2, ShieldCheck, Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppStore, CurrencyCode, CURRENCY_SYMBOLS, WALLET_FLAGS, User } from "@/lib/store";
import { AlertTriangle } from "lucide-react";

// ── Shared Polish error translation ───────────────────────────────────────────
const TF_POLISH_ERRORS: Record<string, string> = {
  "Authentication required":               "Wymagane zalogowanie.",
  "Invalid amount":                        "Nieprawidłowa kwota.",
  "Insufficient balance":                  "Niewystarczające środki.",
  "You cannot transfer money to yourself": "Nie możesz przelać środków do siebie.",
  "Cannot send to yourself":               "Nie możesz przelać środków do siebie.",
  "Network error. Please try again.":      "Błąd sieci. Spróbuj ponownie.",
  "Transfer failed":                       "Przelew nie powiódł się.",
  "Recipient not found":                   "Nie znaleziono odbiorcy.",
  "Nieprawidłowy lub wygasły token PIN.":  "Nieprawidłowy lub wygasły token PIN.",
  "Too many requests":                     "Zbyt wiele prób. Odczekaj chwilę i spróbuj ponownie.",
  "Too Many Requests":                     "Zbyt wiele prób. Odczekaj chwilę i spróbuj ponownie.",
  "Rate limit exceeded":                   "Zbyt wiele prób. Odczekaj chwilę i spróbuj ponownie.",
};

function polishTransferError(msg?: string): string {
  if (!msg) return "Przelew nie powiódł się.";
  if (TF_POLISH_ERRORS[msg]) return TF_POLISH_ERRORS[msg];
  if (/^Insufficient \w+ balance$/.test(msg)) return "Niewystarczające środki na koncie.";
  if (msg.length > 100 || /Error:|undefined|null|stack|TypeError/i.test(msg)) return "Przelew nie powiódł się.";
  return msg;
}

// ── Inline risk-acknowledgment modal (peer flow only) ─────────────────────────
function PeerRiskModal({ riskLevel, riskReasons, onConfirm, onCancel }: { riskLevel: string; riskReasons: string[]; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center", background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}>
      <div style={{ width: "100%", maxWidth: 440, background: "var(--card)", border: "1px solid rgba(212,160,32,0.3)", borderRadius: "24px 24px 0 0", padding: "24px 24px 32px", boxShadow: "0 -8px 48px rgba(0,0,0,0.5)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <AlertTriangle size={20} style={{ color: "#d4a020", flexShrink: 0 }} />
          <p style={{ fontWeight: 700, fontSize: 15, color: "white" }}>Ostrzeżenie bezpieczeństwa</p>
        </div>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginBottom: 8 }}>
          {riskLevel === "medium"
            ? "To wygląda na nietypową operację. Sprawdź dane przed potwierdzeniem."
            : <>Poziom ryzyka: <span style={{ fontWeight: 600, color: "#f87171" }}>WYSOKI</span></>
          }
        </p>
        {riskReasons.length > 0 && (
          <ul style={{ paddingLeft: 18, marginBottom: 20 }}>
            {riskReasons.map((r, i) => <li key={i} style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginBottom: 4 }}>{r}</li>)}
          </ul>
        )}
        <div style={{ display: "flex", gap: 12 }}>
          <button onClick={onCancel} style={{ flex: 1, height: 44, borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "rgba(255,255,255,0.7)", cursor: "pointer", fontSize: 14 }}>
            Anuluj
          </button>
          <button onClick={onConfirm} style={{ flex: 1, height: 44, borderRadius: 12, border: "none", background: "linear-gradient(135deg,#d4a020,#b8880a)", color: "#0d0d0f", fontWeight: 700, cursor: "pointer", fontSize: 14 }}>
            Rozumiem, kontynuuj
          </button>
        </div>
      </div>
    </div>
  );
}
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";
import { useLang } from "@/context/LanguageContext";
import { paymentProvider, maskIban, maskCard, maskPhone } from "@/lib/paymentProvider";
import PinEntryModal from "@/components/PinEntryModal";

const CURRENCY_ORDER: CurrencyCode[] = ["NOK", "USD", "EUR", "GBP", "CHF", "PLN"];

const EU_COUNTRIES = [
  "Polska", "Niemcy", "Francja", "Włochy", "Hiszpania", "Holandia", "Belgia",
  "Austria", "Szwecja", "Dania", "Finlandia", "Czechy", "Portugalia", "Grecja",
  "Węgry", "Szwajcaria", "Norwegia", "Wielka Brytania", "USA", "Kanada", "Australia",
];

const inputStyle: React.CSSProperties = {
  width: "100%", height: 52, padding: "0 14px",
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: 12, fontSize: 15, color: "rgba(255,255,255,0.90)",
  outline: "none", transition: "border-color 0.15s",
};

const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, letterSpacing: 1.2,
  color: "rgba(255,255,255,0.45)", textTransform: "uppercase" as const,
  marginBottom: 6, display: "block",
};

const errStyle: React.CSSProperties = {
  fontSize: 11, color: "#f87171", marginTop: 4,
};

function FieldErr({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <div style={errStyle}>{msg}</div>;
}

function SandboxBadge() {
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "5px 12px", borderRadius: 99,
      background: "rgba(245,197,24,0.12)", border: "1px solid rgba(245,197,24,0.30)",
      fontSize: 11, fontWeight: 700, letterSpacing: 1,
      color: "rgba(245,197,24,0.90)",
    }}>
      <Sparkles size={11} />
      SANDBOX — Tryb testowy
    </div>
  );
}

// ── PIN SCREEN ─────────────────────────────────────────────────────────────────
function PinScreen({ onConfirm, onBack }: { onConfirm: () => void; onBack: () => void }) {
  const [digits, setDigits] = useState<string[]>([]);
  const [processing, setProcessing] = useState(false);

  const handleKey = (k: string) => {
    if (processing) return;
    if (k === "del") { setDigits(d => d.slice(0, -1)); return; }
    if (digits.length >= 6) return;
    const next = [...digits, k];
    setDigits(next);
    if (next.length === 6) {
      setProcessing(true);
      setTimeout(() => onConfirm(), 800);
    }
  };

  const numPadKeys = ["1","2","3","4","5","6","7","8","9","","0","del"];

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "32px 24px", minHeight: "100vh", background: "var(--background)" }}>
      <button data-testid="pin-back" onClick={onBack} style={{ alignSelf: "flex-start", background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.6)", marginBottom: 40 }}>
        <ArrowLeft size={20} />
      </button>
      <ShieldCheck size={48} style={{ color: "#d4a020", marginBottom: 20 }} />
      <h2 style={{ fontSize: 22, fontWeight: 800, color: "white", marginBottom: 8 }}>Podaj PIN bezpieczeństwa</h2>
      <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginBottom: 40 }}>6-cyfrowy PIN (sandbox — dowolne cyfry)</p>

      <div style={{ display: "flex", gap: 12, marginBottom: 48 }}>
        {[0,1,2,3,4,5].map(i => (
          <div key={i} style={{
            width: 14, height: 14, borderRadius: "50%",
            background: digits[i] ? "#d4a020" : "rgba(255,255,255,0.15)",
            border: "2px solid rgba(255,255,255,0.20)",
            transition: "background 0.15s",
          }} />
        ))}
      </div>

      {processing ? (
        <Loader2 size={36} style={{ color: "#d4a020", animation: "spin 0.8s linear infinite" }} />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 72px)", gap: "12px 20px" }}>
          {numPadKeys.map((k, i) => k === "" ? <div key={i} /> : (
            <button
              key={k}
              data-testid={`pin-key-${k}`}
              onClick={() => handleKey(k)}
              style={{
                height: 64, borderRadius: 16, fontSize: k === "del" ? 12 : 24,
                fontWeight: 600, cursor: "pointer",
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "rgba(255,255,255,0.85)",
              }}
            >
              {k === "del" ? "⌫" : k}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── CONFIRM SCREEN ─────────────────────────────────────────────────────────────
function ConfirmScreen({
  rows, amount, currency, onConfirm, onBack, warning, isProcessing,
}: {
  rows: { label: string; value: string }[];
  amount: number;
  currency: string;
  onConfirm: () => void;
  onBack: () => void;
  isProcessing?: boolean;
  warning?: string;
}) {
  const sym = CURRENCY_SYMBOLS[currency as CurrencyCode] || currency;
  return (
    <div style={{ padding: "0 0 24px", display: "flex", flexDirection: "column", minHeight: "100vh", background: "var(--background)" }}>
      <div style={{ padding: "60px 24px 20px" }}>
        <button data-testid="confirm-back" onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.6)", marginBottom: 20, display: "flex", alignItems: "center", gap: 6 }}>
          <ArrowLeft size={18} /> <span style={{ fontSize: 14 }}>Wróć</span>
        </button>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <SandboxBadge />
          <div style={{ fontSize: 40, fontWeight: 800, color: "white", marginTop: 20, marginBottom: 4 }}>
            {sym}{amount.toLocaleString("pl-PL", { minimumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.40)" }}>{currency}</div>
        </div>

        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 20, overflow: "hidden", marginBottom: 16 }}>
          {rows.map((row, i) => (
            <div key={i} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "14px 18px",
              borderBottom: i < rows.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
            }}>
              <span style={{ fontSize: 13, color: "rgba(255,255,255,0.45)" }}>{row.label}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.85)", textAlign: "right", maxWidth: "60%" }}>{row.value}</span>
            </div>
          ))}
        </div>

        <div style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.20)", borderRadius: 14, padding: "12px 16px", display: "flex", gap: 10, marginBottom: 12 }}>
          <AlertCircle size={16} style={{ color: "#f87171", flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 12, color: "rgba(248,113,113,0.90)", lineHeight: 1.5 }}>
            {warning || "Sprawdź dane odbiorcy przed potwierdzeniem. Przelewu może nie dać się cofnąć."}
          </span>
        </div>

        <div style={{ background: "rgba(245,197,24,0.07)", border: "1px solid rgba(245,197,24,0.18)", borderRadius: 14, padding: "12px 16px", display: "flex", gap: 10, marginBottom: 28 }}>
          <Info size={16} style={{ color: "rgba(245,197,24,0.80)", flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 12, color: "rgba(245,197,24,0.80)", lineHeight: 1.5 }}>
            Tryb testowy — środki nie są prawdziwe. Opłata: 0,00 {sym}.
          </span>
        </div>

        <button
          data-testid="btn-confirm-transfer"
          onClick={onConfirm}
          disabled={!!isProcessing}
          style={{
            width: "100%", height: 56, borderRadius: 18, border: "none",
            cursor: isProcessing ? "not-allowed" : "pointer",
            background: "linear-gradient(180deg, #fff4b8 0%, #f9d95e 22%, #d4a020 62%, #b8880a 100%)",
            fontSize: 14, fontWeight: 900, color: "#1a1400", letterSpacing: 1.2,
            boxShadow: isProcessing ? "none" : "0 3px 0 rgba(140,90,4,0.90), 0 8px 20px rgba(210,158,20,0.45)",
            opacity: isProcessing ? 0.6 : 1,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}
        >
          {isProcessing && <Loader2 size={16} style={{ animation: "spin 0.8s linear infinite" }} />}
          POTWIERDŹ PRZELEW
        </button>
      </div>
    </div>
  );
}

// ── SUCCESS SCREEN ─────────────────────────────────────────────────────────────
function SuccessScreen({ reference, onDone }: { reference: string; onDone: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: "0 28px", background: "var(--background)" }}
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", damping: 12, delay: 0.1 }}
        style={{ width: 88, height: 88, borderRadius: "50%", background: "rgba(74,222,128,0.12)", border: "2px solid rgba(74,222,128,0.35)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 28 }}
      >
        <CheckCircle2 size={44} style={{ color: "#4ade80" }} />
      </motion.div>
      <h2 style={{ fontSize: 26, fontWeight: 800, color: "white", marginBottom: 8, textAlign: "center" }}>Przelew wysłany</h2>
      <p style={{ fontSize: 14, color: "rgba(255,255,255,0.50)", marginBottom: 32, textAlign: "center" }}>Tryb testowy — transakcja zarejestrowana</p>
      <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: "12px 24px", marginBottom: 40 }}>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.40)", letterSpacing: 1 }}>NUMER REFERENCYJNY</span>
        <div style={{ fontSize: 16, fontWeight: 800, color: "#d4a020", letterSpacing: 2, marginTop: 4 }}>{reference}</div>
      </div>
      <SandboxBadge />
      <button
        data-testid="btn-success-done"
        onClick={onDone}
        style={{
          marginTop: 40, width: "100%", height: 56, borderRadius: 18, border: "none", cursor: "pointer",
          background: "linear-gradient(180deg, #fff4b8 0%, #f9d95e 22%, #d4a020 62%, #b8880a 100%)",
          fontSize: 14, fontWeight: 900, color: "#1a1400", letterSpacing: 1.2,
          boxShadow: "0 3px 0 rgba(140,90,4,0.90), 0 8px 20px rgba(210,158,20,0.45)",
        }}
      >
        GOTOWE
      </button>
    </motion.div>
  );
}

// ── ERROR SCREEN ───────────────────────────────────────────────────────────────
function ErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: "0 28px", background: "var(--background)" }}>
      <div style={{ width: 88, height: 88, borderRadius: "50%", background: "rgba(248,113,113,0.12)", border: "2px solid rgba(248,113,113,0.30)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 28 }}>
        <XCircle size={44} style={{ color: "#f87171" }} />
      </div>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: "white", marginBottom: 8 }}>Błąd przelewu</h2>
      <p style={{ fontSize: 13, color: "rgba(255,255,255,0.50)", marginBottom: 32, textAlign: "center" }}>{message}</p>
      <button data-testid="btn-error-retry" onClick={onRetry} style={{ height: 52, borderRadius: 16, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)", fontSize: 14, fontWeight: 700, color: "white", cursor: "pointer", padding: "0 36px" }}>
        Spróbuj ponownie
      </button>
    </div>
  );
}

function SandboxPinScreen({ onConfirm, onBack }: { onConfirm: () => void; onBack: () => void }) {
  const [digits, setDigits] = useState<string[]>([]);
  const [processing, setProcessing] = useState(false);
  const numPadKeys = ["1","2","3","4","5","6","7","8","9","","0","del"];

  const handleKey = (k: string) => {
    if (processing) return;
    if (k === "del") { setDigits(d => d.slice(0, -1)); return; }
    if (digits.length >= 6) return;
    const next = [...digits, k];
    setDigits(next);
    if (next.length >= 4) {
      setProcessing(true);
      setTimeout(() => onConfirm(), 800);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--background)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 24px" }}>
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={{ width: 64, height: 64, borderRadius: 20, background: "rgba(212,160,32,0.12)", border: "1px solid rgba(212,160,32,0.25)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
          <ShieldCheck size={28} style={{ color: "#d4a020" }} />
        </div>
        <SandboxBadge />
        <p style={{ marginTop: 12, fontSize: 13, color: "rgba(255,255,255,0.40)" }}>Sandbox — dowolne cyfry</p>
      </div>
      <div style={{ display: "flex", gap: 12, marginBottom: 32 }}>
        {[0,1,2,3,4,5].map(i => (
          <div key={i} style={{
            width: 14, height: 14, borderRadius: 99, transition: "all 0.15s",
            background: digits[i] !== undefined ? "#d4a020" : "transparent",
            border: `2px solid ${digits[i] !== undefined ? "#d4a020" : "rgba(255,255,255,0.20)"}`,
          }} />
        ))}
      </div>
      {processing ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 160 }}>
          <div style={{ width: 32, height: 32, border: "3px solid rgba(255,255,255,0.10)", borderTopColor: "#d4a020", borderRadius: 99, animation: "spin 0.8s linear infinite" }} />
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, width: "100%", maxWidth: 240 }}>
          {numPadKeys.map((k, i) => {
            if (k === "") return <div key={i} />;
            return (
              <button key={k} data-testid={`pin-key-${k}`} onClick={() => handleKey(k)}
                style={{ height: 56, borderRadius: 18, border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.85)", fontSize: 20, fontWeight: 600, cursor: "pointer" }}>
                {k === "del" ? "⌫" : k}
              </button>
            );
          })}
        </div>
      )}
      <button onClick={onBack} style={{ marginTop: 24, background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.35)", fontSize: 13 }}>
        Wróć
      </button>
    </div>
  );
}

// ── BANK TRANSFER FORM ─────────────────────────────────────────────────────────
function BankTransferFlow({ user, onBack, pinEnabled, pinSettingsLoaded }: { user: User | null; onBack: () => void; pinEnabled: boolean; pinSettingsLoaded: boolean }) {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<"form"|"confirm"|"success"|"error">("form");
  const [currency, setCurrency] = useState<CurrencyCode>("NOK");
  const [reference, setReference] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [processing, setProcessing] = useState(false);
  const [showPinGate, setShowPinGate] = useState(false);
  const pinTokenRef = useRef<string | undefined>(undefined);

  const [f, setF] = useState<{ recipientName: string; iban: string; country: string; amount: string; title: string; date: string; message: string; _countryOpen?: boolean }>({ recipientName: "", iban: "", country: "", amount: "", title: "", date: "now", message: "" });
  const [errs, setErrs] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string,string> = {};
    if (!f.recipientName.trim()) e.recipientName = "Pole wymagane";
    if (!f.iban.trim()) e.iban = "Podaj numer konta";
    else if (f.iban.replace(/\s/g,"").length < 10) e.iban = "Numer konta za krótki";
    if (!f.country) e.country = "Wybierz kraj banku";
    if (!f.amount || isNaN(Number(f.amount)) || Number(f.amount) <= 0) e.amount = "Kwota musi być większa niż 0";
    if (!f.title.trim()) e.title = "Pole wymagane";
    setErrs(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = () => { if (validate()) setStep("confirm"); };

  const handleConfirm = async (pinToken?: string) => {
    if (Number(f.amount) >= 100 && pinEnabled && !pinToken) {
      setShowPinGate(true);
      return;
    }
    setProcessing(true);
    const res = await paymentProvider.createBankTransfer({
      senderId: user?.id || "",
      recipientName: f.recipientName,
      recipientIdentifier: f.iban.replace(/\s/g,""),
      destinationType: "BANK_ACCOUNT",
      amount: Number(f.amount),
      currency,
      title: f.title,
      message: f.message || undefined,
      maskedDestination: maskIban(f.iban),
      pinToken,
    });
    setProcessing(false);
    if (res.success && res.reference) { setReference(res.reference); setStep("success"); }
    else if (res.requiresPin) { setShowPinGate(true); }
    else { setErrorMsg(res.error || "Wystąpił błąd"); setStep("error"); }
  };

  const rows = [
    { label: "Odbiorca", value: f.recipientName },
    { label: "Numer konta", value: maskIban(f.iban) },
    { label: "Kraj banku", value: f.country },
    { label: "Waluta", value: currency },
    { label: "Tytuł", value: f.title },
    { label: "Realizacja", value: f.date === "now" ? "Natychmiast (Sandbox)" : "Planowa (Sandbox)" },
    { label: "Opłata", value: "0,00" },
  ];

  if (step === "confirm") return (
    <ConfirmScreen rows={rows} amount={Number(f.amount)} currency={currency} isProcessing={processing || (!pinSettingsLoaded && Number(f.amount) >= 100)} onConfirm={() => handleConfirm()} onBack={() => setStep("form")} />
  );
  if (step === "success") return <SuccessScreen reference={reference} onDone={() => setLocation("/")} />;
  if (step === "error") return <ErrorScreen message={errorMsg} onRetry={() => setStep("form")} />;

  return (<>
    <div style={{ minHeight: "100vh", background: "var(--background)", paddingBottom: 120 }}>
      <div style={{ padding: "60px 24px 24px" }}>
        <button data-testid="bank-back" onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.6)", display: "flex", alignItems: "center", gap: 6, marginBottom: 24 }}>
          <ArrowLeft size={18} /> <span style={{ fontSize: 14 }}>Wróć</span>
        </button>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "white", marginBottom: 4 }}>Przelew bankowy</h1>
        <div style={{ marginBottom: 28 }}><SandboxBadge /></div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div>
            <label style={labelStyle}>Odbiorca / właściciel konta</label>
            <input data-testid="bank-recipient-name" style={inputStyle} placeholder="Jan Kowalski" value={f.recipientName} onChange={e => setF(p => ({...p, recipientName: e.target.value}))} />
            <FieldErr msg={errs.recipientName} />
          </div>
          <div>
            <label style={labelStyle}>IBAN / Numer konta</label>
            <input data-testid="bank-iban" style={inputStyle} placeholder="NO93 8601 1117 947" value={f.iban} onChange={e => setF(p => ({...p, iban: e.target.value}))} />
            <FieldErr msg={errs.iban} />
          </div>
          <div style={{ position: "relative" }}>
            <label style={labelStyle}>Kraj banku</label>
            <button
              data-testid="bank-country-toggle"
              type="button"
              onClick={() => setF(p => ({ ...p, _countryOpen: !p._countryOpen } as any))}
              style={{ ...inputStyle, textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}
            >
              <span style={{ color: f.country ? "rgba(255,255,255,0.90)" : "rgba(255,255,255,0.30)" }}>
                {f.country || "— wybierz —"}
              </span>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>▼</span>
            </button>
            {(f as any)._countryOpen && (
              <div style={{
                position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 100,
                background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 12, overflow: "hidden", maxHeight: 220, overflowY: "auto",
                boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
              }}>
                {EU_COUNTRIES.map(c => (
                  <button
                    key={c}
                    data-testid={`bank-country-${c.toLowerCase().replace(/\s/g,"-")}`}
                    type="button"
                    onClick={() => setF(p => ({ ...p, country: c, _countryOpen: false } as any))}
                    style={{
                      width: "100%", textAlign: "left", padding: "11px 14px",
                      background: f.country === c ? "rgba(212,160,32,0.15)" : "transparent",
                      border: "none", borderBottom: "1px solid rgba(255,255,255,0.05)",
                      color: f.country === c ? "#d4a020" : "rgba(255,255,255,0.80)",
                      fontSize: 14, cursor: "pointer",
                    }}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
            <input type="hidden" data-testid="bank-country" value={f.country} readOnly />
            <FieldErr msg={errs.country} />
          </div>
          <div>
            <label style={labelStyle}>Waluta</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {CURRENCY_ORDER.map(cur => (
                <button key={cur} data-testid={`bank-currency-${cur}`} onClick={() => setCurrency(cur)} style={{ padding: "6px 14px", borderRadius: 10, border: currency === cur ? "1.5px solid rgba(212,160,32,0.85)" : "1px solid rgba(255,255,255,0.10)", background: currency === cur ? "rgba(212,160,32,0.12)" : "rgba(255,255,255,0.03)", color: currency === cur ? "#d4a020" : "rgba(255,255,255,0.55)", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  {WALLET_FLAGS[cur]} {cur}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label style={labelStyle}>Kwota</label>
            <input data-testid="bank-amount" type="number" min="0" style={inputStyle} placeholder="0.00" value={f.amount} onChange={e => setF(p => ({...p, amount: e.target.value}))} />
            <FieldErr msg={errs.amount} />
          </div>
          <div>
            <label style={labelStyle}>Tytuł przelewu</label>
            <input data-testid="bank-title" style={inputStyle} placeholder="Np. Wynagrodzenie, Faktura #123" value={f.title} onChange={e => setF(p => ({...p, title: e.target.value}))} />
            <FieldErr msg={errs.title} />
          </div>
          <div>
            <label style={labelStyle}>Data wykonania</label>
            <div style={{ display: "flex", gap: 10 }}>
              {(["now","later"] as const).map(v => (
                <button key={v} data-testid={`bank-date-${v}`} onClick={() => setF(p => ({...p, date: v}))} style={{ flex: 1, height: 44, borderRadius: 12, border: f.date === v ? "1.5px solid rgba(212,160,32,0.85)" : "1px solid rgba(255,255,255,0.10)", background: f.date === v ? "rgba(212,160,32,0.10)" : "rgba(255,255,255,0.03)", color: f.date === v ? "#d4a020" : "rgba(255,255,255,0.55)", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  {v === "now" ? "Teraz" : "Później"}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label style={labelStyle}>Wiadomość dla odbiorcy (opcjonalnie)</label>
            <input data-testid="bank-message" style={inputStyle} placeholder="Dodaj notatkę..." value={f.message} onChange={e => setF(p => ({...p, message: e.target.value}))} />
          </div>
        </div>

        <button
          data-testid="bank-next"
          onClick={handleSubmit}
          style={{ marginTop: 32, width: "100%", height: 56, borderRadius: 18, border: "none", cursor: "pointer", background: "linear-gradient(180deg, #fff4b8 0%, #f9d95e 22%, #d4a020 62%, #b8880a 100%)", fontSize: 14, fontWeight: 900, color: "#1a1400", letterSpacing: 1.2, boxShadow: "0 3px 0 rgba(140,90,4,0.90), 0 8px 20px rgba(210,158,20,0.45)" }}
        >
          DALEJ
        </button>
      </div>
    </div>
    {showPinGate && (
      <PinEntryModal
        mode="verify"
        onSuccess={(token) => { setShowPinGate(false); pinTokenRef.current = token; handleConfirm(token); }}
        onCancel={() => setShowPinGate(false)}
      />
    )}
  </>);
}

// ── CARD PAYOUT FORM ───────────────────────────────────────────────────────────
function CardPayoutFlow({ user, onBack, pinEnabled, pinSettingsLoaded }: { user: User | null; onBack: () => void; pinEnabled: boolean; pinSettingsLoaded: boolean }) {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<"form"|"confirm"|"success"|"error">("form");
  const [currency, setCurrency] = useState<CurrencyCode>("NOK");
  const [reference, setReference] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [processing, setProcessing] = useState(false);
  const [showPinGate, setShowPinGate] = useState(false);
  const pinTokenRef = useRef<string | undefined>(undefined);

  const [f, setF] = useState({ cardHolder: "", cardNumber: "", amount: "", title: "" });
  const [errs, setErrs] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string,string> = {};
    if (!f.cardHolder.trim()) e.cardHolder = "Pole wymagane";
    if (!f.cardNumber.replace(/\D/g,"") || f.cardNumber.replace(/\D/g,"").length < 4) e.cardNumber = "Podaj numer karty (min. 4 cyfry)";
    if (!f.amount || isNaN(Number(f.amount)) || Number(f.amount) <= 0) e.amount = "Kwota musi być większa niż 0";
    if (!f.title.trim()) e.title = "Pole wymagane";
    setErrs(e);
    return Object.keys(e).length === 0;
  };

  const handleConfirm = async (pinToken?: string) => {
    if (Number(f.amount) >= 100 && pinEnabled && !pinToken) {
      setShowPinGate(true);
      return;
    }
    setProcessing(true);
    const res = await paymentProvider.createCardPayout({
      senderId: user?.id || "",
      recipientName: f.cardHolder,
      recipientIdentifier: f.cardNumber.replace(/\D/g,"").slice(-4),
      destinationType: "CARD",
      amount: Number(f.amount),
      currency,
      title: f.title,
      maskedDestination: maskCard(f.cardNumber),
      pinToken,
    });
    setProcessing(false);
    if (res.success && res.reference) { setReference(res.reference); setStep("success"); }
    else if (res.requiresPin) { setShowPinGate(true); }
    else { setErrorMsg(res.error || "Wystąpił błąd"); setStep("error"); }
  };

  const rows = [
    { label: "Właściciel karty", value: f.cardHolder },
    { label: "Numer karty", value: maskCard(f.cardNumber) },
    { label: "Waluta", value: currency },
    { label: "Tytuł", value: f.title },
    { label: "Realizacja", value: "Zależy od banku (Sandbox)" },
    { label: "Opłata", value: "0,00" },
  ];

  if (step === "confirm") return (
    <ConfirmScreen rows={rows} amount={Number(f.amount)} currency={currency} isProcessing={processing || (!pinSettingsLoaded && Number(f.amount) >= 100)} onConfirm={() => handleConfirm()} onBack={() => setStep("form")} />
  );
  if (step === "success") return <SuccessScreen reference={reference} onDone={() => setLocation("/")} />;
  if (step === "error") return <ErrorScreen message={errorMsg} onRetry={() => setStep("form")} />;

  return (<>
    <div style={{ minHeight: "100vh", background: "var(--background)", paddingBottom: 120 }}>
      <div style={{ padding: "60px 24px 24px" }}>
        <button data-testid="card-back" onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.6)", display: "flex", alignItems: "center", gap: 6, marginBottom: 24 }}>
          <ArrowLeft size={18} /> <span style={{ fontSize: 14 }}>Wróć</span>
        </button>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "white", marginBottom: 4 }}>Przelew na kartę</h1>
        <div style={{ marginBottom: 16 }}><SandboxBadge /></div>

        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: "12px 16px", display: "flex", gap: 10, marginBottom: 24 }}>
          <Info size={15} style={{ color: "rgba(255,255,255,0.40)", flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", lineHeight: 1.5 }}>
            Przelew na kartę wymaga operatora płatności obsługującego Visa Direct / Mastercard Send / Instant Payouts. Czas realizacji zależy od banku i kraju.
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div>
            <label style={labelStyle}>Imię i nazwisko właściciela karty</label>
            <input data-testid="card-holder" style={inputStyle} placeholder="Jan Kowalski" value={f.cardHolder} onChange={e => setF(p => ({...p, cardHolder: e.target.value}))} />
            <FieldErr msg={errs.cardHolder} />
          </div>
          <div>
            <label style={labelStyle}>Numer karty (tylko testowy / sandbox)</label>
            <input data-testid="card-number" style={inputStyle} placeholder="4111 1111 1111 1111" maxLength={19} value={f.cardNumber} onChange={e => setF(p => ({...p, cardNumber: e.target.value}))} />
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.30)", marginTop: 4 }}>Zapisujemy tylko ostatnie 4 cyfry. Dane nie są przesyłane do żadnego operatora.</div>
            <FieldErr msg={errs.cardNumber} />
          </div>
          <div>
            <label style={labelStyle}>Waluta</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {CURRENCY_ORDER.map(cur => (
                <button key={cur} data-testid={`card-currency-${cur}`} onClick={() => setCurrency(cur)} style={{ padding: "6px 14px", borderRadius: 10, border: currency === cur ? "1.5px solid rgba(212,160,32,0.85)" : "1px solid rgba(255,255,255,0.10)", background: currency === cur ? "rgba(212,160,32,0.12)" : "rgba(255,255,255,0.03)", color: currency === cur ? "#d4a020" : "rgba(255,255,255,0.55)", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  {WALLET_FLAGS[cur]} {cur}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label style={labelStyle}>Kwota</label>
            <input data-testid="card-amount" type="number" min="0" style={inputStyle} placeholder="0.00" value={f.amount} onChange={e => setF(p => ({...p, amount: e.target.value}))} />
            <FieldErr msg={errs.amount} />
          </div>
          <div>
            <label style={labelStyle}>Tytuł przelewu</label>
            <input data-testid="card-title" style={inputStyle} placeholder="Np. Zwrot, Wypłata" value={f.title} onChange={e => setF(p => ({...p, title: e.target.value}))} />
            <FieldErr msg={errs.title} />
          </div>
        </div>

        <button
          data-testid="card-next"
          onClick={() => { if (validate()) setStep("confirm"); }}
          style={{ marginTop: 32, width: "100%", height: 56, borderRadius: 18, border: "none", cursor: "pointer", background: "linear-gradient(180deg, #fff4b8 0%, #f9d95e 22%, #d4a020 62%, #b8880a 100%)", fontSize: 14, fontWeight: 900, color: "#1a1400", letterSpacing: 1.2, boxShadow: "0 3px 0 rgba(140,90,4,0.90), 0 8px 20px rgba(210,158,20,0.45)" }}
        >
          DALEJ
        </button>
      </div>
    </div>
    {showPinGate && (
      <PinEntryModal
        mode="verify"
        onSuccess={(token) => { setShowPinGate(false); pinTokenRef.current = token; handleConfirm(token); }}
        onCancel={() => setShowPinGate(false)}
      />
    )}
  </>);
}

// ── PHONE TRANSFER FORM ────────────────────────────────────────────────────────
function PhoneTransferFlow({ user, onBack, pinEnabled, pinSettingsLoaded }: { user: User | null; onBack: () => void; pinEnabled: boolean; pinSettingsLoaded: boolean }) {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<"form"|"confirm"|"success"|"error">("form");
  const [currency, setCurrency] = useState<CurrencyCode>("NOK");
  const [reference, setReference] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [processing, setProcessing] = useState(false);
  const [showPinGate, setShowPinGate] = useState(false);
  const pinTokenRef = useRef<string | undefined>(undefined);
  const [foundUser, setFoundUser] = useState<{ name: string; handle: string } | null>(null);
  const [searching, setSearching] = useState(false);

  const [f, setF] = useState({ phone: "", amount: "", title: "", message: "" });
  const [errs, setErrs] = useState<Record<string, string>>({});

  const searchByPhone = async (phone: string) => {
    if (phone.length < 6) { setFoundUser(null); return; }
    setSearching(true);
    try {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(phone)}&limit=1`);
      if (res.ok) {
        const data = await res.json();
        const arr = Array.isArray(data) ? data : (data.users || []);
        if (arr.length > 0) setFoundUser({ name: arr[0].name || arr[0].display_name, handle: arr[0].handle || `@${arr[0].host}` });
        else setFoundUser(null);
      }
    } catch { setFoundUser(null); }
    setSearching(false);
  };

  useEffect(() => {
    const t = setTimeout(() => searchByPhone(f.phone), 600);
    return () => clearTimeout(t);
  }, [f.phone]);

  const validate = () => {
    const e: Record<string,string> = {};
    if (!f.phone.trim() || f.phone.replace(/\D/g,"").length < 6) e.phone = "Podaj prawidłowy numer telefonu";
    if (!f.amount || isNaN(Number(f.amount)) || Number(f.amount) <= 0) e.amount = "Kwota musi być większa niż 0";
    if (!f.title.trim()) e.title = "Pole wymagane";
    setErrs(e);
    return Object.keys(e).length === 0;
  };

  const handleConfirm = async (pinToken?: string) => {
    if (Number(f.amount) >= 100 && pinEnabled && !pinToken) {
      setShowPinGate(true);
      return;
    }
    setProcessing(true);
    const recipientName = foundUser ? foundUser.name : f.phone;
    const recipientIdentifier = foundUser ? foundUser.handle : f.phone;
    const res = await paymentProvider.createPhoneTransfer({
      senderId: user?.id || "",
      recipientName,
      recipientIdentifier,
      destinationType: "PHONE",
      amount: Number(f.amount),
      currency,
      title: f.title,
      message: f.message || undefined,
      maskedDestination: maskPhone(f.phone),
      pinToken,
    });
    setProcessing(false);
    if (res.success && res.reference) { setReference(res.reference); setStep("success"); }
    else if (res.requiresPin) { setShowPinGate(true); }
    else { setErrorMsg(res.error || "Wystąpił błąd"); setStep("error"); }
  };

  const recipientDisplay = foundUser ? foundUser.name : f.phone;
  const rows = [
    { label: "Odbiorca", value: recipientDisplay },
    { label: "Numer telefonu", value: maskPhone(f.phone) },
    { label: "Waluta", value: currency },
    { label: "Tytuł", value: f.title },
    { label: "Realizacja", value: "Natychmiast (Sandbox)" },
    { label: "Opłata", value: "0,00" },
  ];

  if (step === "confirm") return (
    <ConfirmScreen rows={rows} amount={Number(f.amount)} currency={currency} isProcessing={processing || (!pinSettingsLoaded && Number(f.amount) >= 100)} onConfirm={() => handleConfirm()} onBack={() => setStep("form")} />
  );
  if (step === "success") return <SuccessScreen reference={reference} onDone={() => setLocation("/")} />;
  if (step === "error") return <ErrorScreen message={errorMsg} onRetry={() => setStep("form")} />;

  return (<>
    <div style={{ minHeight: "100vh", background: "var(--background)", paddingBottom: 120 }}>
      <div style={{ padding: "60px 24px 24px" }}>
        <button data-testid="phone-back" onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.6)", display: "flex", alignItems: "center", gap: 6, marginBottom: 24 }}>
          <ArrowLeft size={18} /> <span style={{ fontSize: 14 }}>Wróć</span>
        </button>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "white", marginBottom: 4 }}>Przelew na telefon</h1>
        <div style={{ marginBottom: 28 }}><SandboxBadge /></div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div>
            <label style={labelStyle}>Numer telefonu odbiorcy</label>
            <div style={{ position: "relative" }}>
              <input
                data-testid="phone-number"
                style={inputStyle}
                placeholder="+47 123 456 789"
                value={f.phone}
                onChange={e => setF(p => ({...p, phone: e.target.value}))}
              />
              {searching && <Loader2 size={16} style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.40)", animation: "spin 0.8s linear infinite" }} />}
            </div>
            <FieldErr msg={errs.phone} />
            {foundUser && (
              <div style={{ marginTop: 10, background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.20)", borderRadius: 12, padding: "10px 14px", display: "flex", gap: 10, alignItems: "center" }}>
                <CheckCircle2 size={16} style={{ color: "#4ade80" }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>{foundUser.name}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.40)" }}>{foundUser.handle}</div>
                </div>
              </div>
            )}
            {!foundUser && f.phone.length >= 6 && !searching && (
              <div style={{ marginTop: 10, background: "rgba(245,197,24,0.07)", border: "1px solid rgba(245,197,24,0.20)", borderRadius: 12, padding: "10px 14px", fontSize: 12, color: "rgba(245,197,24,0.75)" }}>
                Nie znaleziono użytkownika — zostanie wysłane zaproszenie do odebrania pieniędzy.
              </div>
            )}
          </div>

          <div>
            <label style={labelStyle}>Waluta</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {CURRENCY_ORDER.map(cur => (
                <button key={cur} data-testid={`phone-currency-${cur}`} onClick={() => setCurrency(cur)} style={{ padding: "6px 14px", borderRadius: 10, border: currency === cur ? "1.5px solid rgba(212,160,32,0.85)" : "1px solid rgba(255,255,255,0.10)", background: currency === cur ? "rgba(212,160,32,0.12)" : "rgba(255,255,255,0.03)", color: currency === cur ? "#d4a020" : "rgba(255,255,255,0.55)", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  {WALLET_FLAGS[cur]} {cur}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={labelStyle}>Kwota</label>
            <input data-testid="phone-amount" type="number" min="0" style={inputStyle} placeholder="0.00" value={f.amount} onChange={e => setF(p => ({...p, amount: e.target.value}))} />
            <FieldErr msg={errs.amount} />
          </div>
          <div>
            <label style={labelStyle}>Tytuł</label>
            <input data-testid="phone-title" style={inputStyle} placeholder="Np. Zwrot, Kolacja" value={f.title} onChange={e => setF(p => ({...p, title: e.target.value}))} />
            <FieldErr msg={errs.title} />
          </div>
          <div>
            <label style={labelStyle}>Wiadomość (opcjonalnie)</label>
            <input data-testid="phone-message" style={inputStyle} placeholder="Dodaj notatkę..." value={f.message} onChange={e => setF(p => ({...p, message: e.target.value}))} />
          </div>
        </div>

        <button
          data-testid="phone-next"
          onClick={() => { if (validate()) setStep("confirm"); }}
          style={{ marginTop: 32, width: "100%", height: 56, borderRadius: 18, border: "none", cursor: "pointer", background: "linear-gradient(180deg, #fff4b8 0%, #f9d95e 22%, #d4a020 62%, #b8880a 100%)", fontSize: 14, fontWeight: 900, color: "#1a1400", letterSpacing: 1.2, boxShadow: "0 3px 0 rgba(140,90,4,0.90), 0 8px 20px rgba(210,158,20,0.45)" }}
        >
          DALEJ
        </button>
      </div>
    </div>
    {showPinGate && (
      <PinEntryModal
        mode="verify"
        onSuccess={(token) => { setShowPinGate(false); pinTokenRef.current = token; handleConfirm(token); }}
        onCancel={() => setShowPinGate(false)}
      />
    )}
  </>);
}

// ── MAIN ENTRY POINT ───────────────────────────────────────────────────────────
export default function TransferFlow() {
  const [, setLocation] = useLocation();
  const { user, sendMoney, wallets, sessionConfirmed } = useAppStore();
  const { toast } = useToast();
  const { th } = useTheme();
  const { t } = useLang();

  const [amount, setAmount] = useState("0");
  const [step, setStep] = useState<"amount" | "confirm" | "success">("amount");
  const [isProcessing, setIsProcessing] = useState(false);
  const [reference, setReference] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>("NOK");
  const [peerRiskPending, setPeerRiskPending] = useState<{ riskLevel: string; riskReasons: string[] } | null>(null);
  const [peerShowPinGate, setPeerShowPinGate] = useState(false);
  const [pinEnabled, setPinEnabled] = useState(false);
  const [pinSettingsLoaded, setPinSettingsLoaded] = useState(false);
  const peerPinToken = useRef<string | undefined>(undefined);
  const peerRiskAcknowledged = useRef(false);

  useEffect(() => {
    if (!user) return;
    fetch("/api/security-center", { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(d => { setPinEnabled(d?.settings?.pinEnabled ?? false); setPinSettingsLoaded(true); })
      .catch(() => { setPinEnabled(true); setPinSettingsLoaded(true); });
  }, [user]);

  const searchParams = new URLSearchParams(window.location.search);
  const toParam = searchParams.get("to") || "@johndoe";
  const isLight = false;

  const flowType = toParam === "bank" ? "bank" : toParam === "card" ? "card" : toParam === "phone" ? "phone" : "peer";

  const goBack = () => window.history.back();

  // Fail-closed auth guard — requires server-confirmed session (not just stale cache)
  if (!user || !sessionConfirmed) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--background)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: "0 24px" }}>
        <ShieldCheck size={40} style={{ color: "rgba(212,160,32,0.6)" }} />
        <p style={{ fontSize: 15, color: "rgba(255,255,255,0.55)", textAlign: "center" }} data-testid="transfer-auth-guard">
          Zaloguj się, aby kontynuować
        </p>
      </div>
    );
  }

  if (flowType === "bank") return <BankTransferFlow user={user} onBack={goBack} pinEnabled={pinEnabled} pinSettingsLoaded={pinSettingsLoaded} />;
  if (flowType === "card") return <CardPayoutFlow user={user} onBack={goBack} pinEnabled={pinEnabled} pinSettingsLoaded={pinSettingsLoaded} />;
  if (flowType === "phone") return <PhoneTransferFlow user={user} onBack={goBack} pinEnabled={pinEnabled} pinSettingsLoaded={pinSettingsLoaded} />;

  // ── Peer-to-peer (existing numpad flow) ────────────────────────────────────
  const initialRecipient = (flowType === "peer" && toParam && !toParam.startsWith("@"))
    ? `@${toParam}`
    : toParam;

  const handleNumberClick = (num: string) => {
    if (amount === "0" && num !== ".") { setAmount(num); return; }
    if (num === "." && amount.includes(".")) return;
    if (amount.includes(".") && amount.split(".")[1].length >= 2) return;
    setAmount(amount + num);
  };

  const handleDelete = () => {
    if (amount.length <= 1) { setAmount("0"); return; }
    setAmount(amount.slice(0, -1));
  };

  const getRecipientDisplay = () => {
    if (initialRecipient.startsWith("@")) {
      const n = initialRecipient.substring(1);
      return n.charAt(0).toUpperCase() + n.slice(1);
    }
    return initialRecipient;
  };

  const handleNext = () => {
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) return;
    if (numAmount > (wallets[currency] ?? 0)) {
      toast({ title: "Niewystarczające środki", description: `Nie możesz przelać więcej niż dostępne saldo ${currency}.`, variant: "destructive" });
      return;
    }
    setStep("confirm");
  };

  const handleConfirm = async (riskAck = false, pinToken?: string) => {
    const numAmount = parseFloat(amount);
    if (numAmount >= 100 && pinEnabled && !pinToken) {
      peerRiskAcknowledged.current = riskAck;
      setPeerShowPinGate(true);
      return;
    }
    setIsProcessing(true);
    if (initialRecipient.toLowerCase() === user?.handle?.toLowerCase()) {
      toast({ title: "Błąd", description: "Nie możesz przelać środków do siebie.", variant: "destructive" });
      setIsProcessing(false);
      return;
    }
    const result = await sendMoney(numAmount, initialRecipient, "Wysłano przez aplikację", currency, riskAck, pinToken);
    setIsProcessing(false);
    if (result.success) {
      setReference(`TRX-${Math.random().toString(36).slice(2, 10).toUpperCase()}`);
      if (result.riskLevel === "medium") {
        toast({ title: "Przelew wysłany — Uwaga", description: "To wygląda na nietypową operację. Sprawdź dane przed potwierdzeniem.", variant: "destructive" });
      }
      setStep("success");
    } else if (result.requiresPin) {
      peerRiskAcknowledged.current = riskAck;
      setPeerShowPinGate(true);
    } else if (result.requiresAcknowledgment && result.riskLevel && result.riskReasons) {
      setPeerRiskPending({ riskLevel: result.riskLevel, riskReasons: result.riskReasons });
    } else {
      toast({ title: "Błąd przelewu", description: polishTransferError(result.error), variant: "destructive" });
      setStep("amount");
    }
  };

  if (step === "success") {
    return (
      <div className="min-h-screen bg-background flex flex-col p-6 relative overflow-hidden">
        <header className="py-4 flex justify-between items-center relative z-10">
          <Button variant="ghost" size="icon" className="rounded-full bg-secondary/50 border border-white/5" onClick={() => setLocation("/")}>
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" size="icon" className="rounded-full bg-secondary/50 border border-white/5"><Share2 className="w-4 h-4 text-foreground" /></Button>
            <Button variant="ghost" size="icon" className="rounded-full bg-secondary/50 border border-white/5"><Download className="w-4 h-4 text-foreground" /></Button>
          </div>
        </header>
        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="relative z-10 flex flex-col flex-1 mt-4">
          <div className="flex flex-col items-center text-center mb-8">
            <div className="w-20 h-20 bg-green-500/10 border border-green-500/30 rounded-full flex items-center justify-center mb-6">
              <CheckCircle2 className="h-8 w-8 text-green-400" />
            </div>
            <h2 className="text-3xl font-heading text-white mb-2">Wysłano pomyślnie</h2>
            <p className="text-muted-foreground text-[15px]">Przelew do {getRecipientDisplay()} zakończony.</p>
          </div>
          <div className="w-full bg-card border border-white/5 rounded-3xl p-6 mb-auto shadow-premium">
            <div className="text-center mb-8">
              <div className="text-sm text-muted-foreground uppercase tracking-widest font-semibold mb-1">Kwota</div>
              <div className="text-4xl font-light font-mono text-white">{CURRENCY_SYMBOLS[currency]}{parseFloat(amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}</div>
            </div>
            <div className="space-y-4">
              <div className="flex justify-between items-center text-sm border-b border-white/5 pb-4">
                <span className="text-muted-foreground">Odbiorca</span>
                <span className="font-medium text-white text-right">{getRecipientDisplay()}</span>
              </div>
              <div className="flex justify-between items-center text-sm border-b border-white/5 pb-4">
                <span className="text-muted-foreground">Waluta</span>
                <span className="font-medium text-white text-right">{WALLET_FLAGS[currency]} {currency}</span>
              </div>
              <div className="flex justify-between items-center text-sm border-b border-white/5 pb-4">
                <span className="text-muted-foreground">Referencja</span>
                <span className="font-mono text-xs text-white bg-secondary px-2 py-1 rounded-md tracking-wider">{reference}</span>
              </div>
              <div className="flex justify-between items-center text-sm pt-2">
                <span className="text-muted-foreground">Opłata</span>
                <span className="font-medium text-green-400">{CURRENCY_SYMBOLS[currency]}0.00</span>
              </div>
            </div>
          </div>
          <div className="pt-6">
            <Button className="w-full h-14 rounded-2xl bg-primary text-primary-foreground text-[15px] font-bold shadow-premium" onClick={() => { if (initialRecipient.startsWith("@")) setLocation("/messages"); else setLocation("/"); }}>
              Gotowe
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col relative overflow-hidden">
      {peerRiskPending && (
        <PeerRiskModal
          riskLevel={peerRiskPending.riskLevel}
          riskReasons={peerRiskPending.riskReasons}
          onConfirm={() => { setPeerRiskPending(null); handleConfirm(true, peerPinToken.current); }}
          onCancel={() => setPeerRiskPending(null)}
        />
      )}
      {peerShowPinGate && (
        <PinEntryModal
          mode="verify"
          title="Weryfikacja PIN"
          subtitle="Wymagany dla przelewów powyżej 100"
          onSuccess={(token) => { setPeerShowPinGate(false); peerPinToken.current = token; handleConfirm(peerRiskAcknowledged.current, token); }}
          onCancel={() => setPeerShowPinGate(false)}
        />
      )}
      <div className="absolute top-20 right-0 w-[300px] h-[300px] bg-primary/10 rounded-full blur-[100px] translate-x-1/2 pointer-events-none"></div>
      <header className="px-6 py-6 flex items-center justify-between relative z-10 sticky top-0 bg-background/80 backdrop-blur-md">
        <Button variant="ghost" size="icon" className="rounded-full bg-secondary shadow-sm border border-white/5" onClick={() => step === "amount" ? window.history.back() : setStep("amount")}>
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </Button>
        <div className="flex items-center gap-2 bg-secondary/80 px-4 py-2 rounded-full border border-white/5 shadow-inner-glow">
          <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-[12px] font-bold text-primary">{getRecipientDisplay().charAt(0).toUpperCase()}</div>
          <span className="text-xs font-semibold text-white/90">{getRecipientDisplay()}</span>
        </div>
        <div className="w-10" />
      </header>

      <main className="flex-1 flex flex-col p-6 relative z-10">
        <AnimatePresence mode="wait">
          {step === "amount" ? (
            <motion.div key="amount" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex-1 flex flex-col justify-center items-center h-full w-full">
              <div className="text-center mb-auto mt-auto w-full">
                <div className="text-primary font-semibold text-[13px] uppercase tracking-[0.15em] mb-4 flex items-center justify-center gap-1.5">
                  <Sparkles className="w-3 h-3" /> Kwota do wysłania
                </div>
                <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 20, flexWrap: "nowrap", overflowX: "auto", padding: "0 4px", scrollbarWidth: "none" }}>
                  {CURRENCY_ORDER.map(cur => {
                    const isActive = cur === currency;
                    return (
                      <button key={cur} data-testid={`currency-selector-${cur}`} onClick={() => { setCurrency(cur); setAmount("0"); }} style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "6px 10px", borderRadius: 12, border: isActive ? "1.5px solid rgba(212,160,32,0.85)" : "1px solid rgba(255,255,255,0.07)", background: isActive ? "rgba(212,160,32,0.10)" : "rgba(255,255,255,0.03)", cursor: "pointer", transition: "all 0.15s", minWidth: 60 }}>
                        <span style={{ fontSize: 16, lineHeight: 1 }}>{WALLET_FLAGS[cur]}</span>
                        <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1.2, color: isActive ? "#f9d95e" : "rgba(255,255,255,0.45)" }}>{cur}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="text-6xl font-light font-mono tracking-tight flex items-center justify-center h-20" style={{ color: th.textPrimary }}>
                  <span className="text-3xl mr-2 font-sans" style={{ color: "rgba(255,255,255,0.30)" }}>{CURRENCY_SYMBOLS[currency]}</span>
                  {amount}
                </div>
                <div className="text-xs font-medium text-muted-foreground mt-8 px-4 py-2 bg-secondary/50 rounded-full inline-flex border border-white/5 shadow-sm">
                  Dostępne: {CURRENCY_SYMBOLS[currency]}{(wallets[currency] ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </div>
              </div>

              <div className="w-full max-w-[320px] grid grid-cols-3 gap-y-4 gap-x-6 mb-8 mt-auto">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, ".", 0].map((num) => (
                  <button key={num} data-testid={`numpad-${num}`} onClick={() => handleNumberClick(num.toString())} className="text-2xl font-light font-mono h-16 flex items-center justify-center rounded-2xl active:scale-95 transition-all" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.90)", boxShadow: "0 4px 12px rgba(0,0,0,0.28)" }}>
                    {num}
                  </button>
                ))}
                <button data-testid="numpad-delete" onClick={handleDelete} className="text-2xl font-light h-16 flex items-center justify-center rounded-2xl active:scale-95 transition-all" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.90)" }}>
                  <ArrowLeft className="w-6 h-6" />
                </button>
              </div>
              <div style={{ height: 110 }} />
            </motion.div>
          ) : (
            <motion.div key="confirm" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="flex-1 flex flex-col justify-between w-full h-full">
              <div className="space-y-6 mt-4">
                <div className="bg-card border border-white/5 rounded-3xl p-8 shadow-premium text-center">
                  <p className="text-sm text-muted-foreground uppercase tracking-widest font-semibold mb-2">Wysyłasz</p>
                  <div className="text-5xl font-heading text-white mb-6">{CURRENCY_SYMBOLS[currency]}{parseFloat(amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}</div>
                  <div className="flex flex-col gap-4 border-t border-white/5 pt-6">
                    <div className="flex justify-between items-center text-sm"><span className="text-muted-foreground">Do</span><span className="font-semibold text-white/90">{getRecipientDisplay()}</span></div>
                    <div className="flex justify-between items-center text-sm"><span className="text-muted-foreground">Waluta</span><span className="font-semibold text-white/90">{WALLET_FLAGS[currency]} {currency}</span></div>
                    <div className="flex justify-between items-center text-sm"><span className="text-muted-foreground">Opłata</span><span className="font-semibold text-green-400">Bezpłatnie</span></div>
                    <div className="flex justify-between items-center text-sm"><span className="text-muted-foreground">Czas realizacji</span><span className="font-semibold text-white/90">Natychmiast</span></div>
                  </div>
                </div>
                <div className="bg-primary/10 border border-primary/20 rounded-2xl p-4 flex gap-3">
                  <AlertCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <p className="text-xs text-primary/80 leading-relaxed">Sprawdź dane odbiorcy przed potwierdzeniem. Przelewu może nie dać się cofnąć.</p>
                </div>
              </div>
              <div className="mt-auto pt-8 pb-4">
                <Button size="lg" className="w-full h-16 rounded-2xl text-[15px] font-semibold tracking-wide uppercase shadow-premium" onClick={() => handleConfirm()} disabled={isProcessing}>
                  {isProcessing ? "Autoryzacja..." : "Potwierdź przelew"}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {step === "amount" && (
        <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 448, padding: "0 20px 26px", background: "linear-gradient(to top, rgba(2,8,20,1) 52%, rgba(2,8,20,0) 100%)", zIndex: 50, pointerEvents: "none" }}>
          <nav style={{ width: "100%", borderRadius: 999, padding: "12px 24px", background: th.navBg, border: `1px solid ${th.navBorder}`, display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", pointerEvents: "auto", boxShadow: "0 2px 0 rgba(255,255,255,0.06), inset 0 1px 0 rgba(255,255,255,0.07), 0 12px 48px rgba(0,0,0,0.65)" }}>
            <button data-testid="transfer-nav-home" onClick={() => setLocation("/")} style={{ display: "grid", justifyItems: "center", gap: 4, cursor: "pointer", background: "none", border: "none", fontSize: 9, fontWeight: 800, letterSpacing: 1.8 }}>
              <div style={{ width: 36, height: 36, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center" }}><Home size={19} style={{ color: th.textMuted }} /></div>
              <span style={{ color: th.textMuted }}>{t.home}</span>
            </button>
            <button data-testid="transfer-nav-send" onClick={handleNext} disabled={amount === "0" || amount === "0."} style={{ height: 56, borderRadius: 999, border: "none", cursor: "pointer", padding: "0 28px", fontSize: 12, fontWeight: 900, color: "#1a1400", letterSpacing: 1.2, whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 8, background: (amount === "0" || amount === "0.") ? "rgba(200,158,30,0.30)" : "linear-gradient(180deg, #fff4b8 0%, #f9d95e 22%, #d4a020 62%, #b8880a 100%)", opacity: (amount === "0" || amount === "0.") ? 0.5 : 1 }}>
              <SendHorizontal size={16} />
              <span>{t.send}</span>
            </button>
            <button data-testid="transfer-nav-cards" onClick={() => setLocation("/cards")} style={{ display: "grid", justifyItems: "center", gap: 4, cursor: "pointer", background: "none", border: "none", fontSize: 9, fontWeight: 800, letterSpacing: 1.8 }}>
              <div style={{ width: 36, height: 36, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center" }}><CreditCard size={19} style={{ color: th.textMuted }} /></div>
              <span style={{ color: th.textMuted }}>{t.cards}</span>
            </button>
          </nav>
        </div>
      )}
    </div>
  );
}
