import { useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft, Sparkles, CheckCircle2, XCircle, Loader2,
  FileText, Info, AlertCircle, Calendar,
} from "lucide-react";
import { motion } from "framer-motion";
import { useAppStore, CURRENCY_SYMBOLS, WALLET_FLAGS, type CurrencyCode } from "@/lib/store";
import { paymentProvider } from "@/lib/paymentProvider";

const CURRENCY_ORDER: CurrencyCode[] = ["NOK", "USD", "EUR", "GBP", "CHF", "PLN"];

const CONTRACT_TYPES = [
  { value: "SERVICE",    label: "Usługa" },
  { value: "SALE",       label: "Sprzedaż" },
  { value: "DEPOSIT",    label: "Zabezpieczenie" },
  { value: "RENOVATION", label: "Remont" },
  { value: "CUSTOM",     label: "Niestandardowy" },
] as const;

type ContractType = typeof CONTRACT_TYPES[number]["value"];

const inp: React.CSSProperties = {
  width: "100%", height: 52, padding: "0 14px",
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: 12, fontSize: 15, color: "rgba(255,255,255,0.90)",
  outline: "none", transition: "border-color 0.15s", boxSizing: "border-box" as const,
};

const lbl: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, letterSpacing: 1.2,
  color: "rgba(255,255,255,0.45)", textTransform: "uppercase" as const,
  marginBottom: 6, display: "block",
};

const errStyle: React.CSSProperties = { fontSize: 11, color: "#f87171", marginTop: 4 };

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
      fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "rgba(245,197,24,0.90)",
    }}>
      <Sparkles size={11} />
      SANDBOX — Tryb testowy
    </div>
  );
}

// ── CONFIRM SCREEN ─────────────────────────────────────────────────────────────
function ConfirmScreen({
  rows, amount, currency, onConfirm, onBack, isProcessing,
}: {
  rows: { label: string; value: string }[];
  amount: number;
  currency: string;
  onConfirm: () => void;
  onBack: () => void;
  isProcessing?: boolean;
}) {
  const sym = CURRENCY_SYMBOLS[currency as CurrencyCode] || currency;
  return (
    <div style={{ padding: "0 0 24px", display: "flex", flexDirection: "column", minHeight: "100vh", background: "var(--background)" }}>
      <div style={{ padding: "60px 24px 20px" }}>
        <button data-testid="invite-confirm-back" onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.6)", marginBottom: 20, display: "flex", alignItems: "center", gap: 6 }}>
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
            Sprawdź dane zaproszenia przed potwierdzeniem. Zaproszenie zostanie wysłane do odbiorcy.
          </span>
        </div>

        <div style={{ background: "rgba(245,197,24,0.07)", border: "1px solid rgba(245,197,24,0.18)", borderRadius: 14, padding: "12px 16px", display: "flex", gap: 10, marginBottom: 28 }}>
          <Info size={16} style={{ color: "rgba(245,197,24,0.80)", flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 12, color: "rgba(245,197,24,0.80)", lineHeight: 1.5 }}>
            Tryb testowy — zaproszenie jest symulowane i nie wysyła prawdziwych powiadomień.
          </span>
        </div>

        <button
          data-testid="invite-btn-confirm"
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
          WYŚLIJ ZAPROSZENIE
        </button>
      </div>
    </div>
  );
}

// ── SUCCESS SCREEN ─────────────────────────────────────────────────────────────
function SuccessScreen({ recipient, onDone }: { recipient: string; onDone: () => void }) {
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
      <h2 style={{ fontSize: 26, fontWeight: 800, color: "white", marginBottom: 8, textAlign: "center" }}>Zaproszenie wysłane</h2>
      <p style={{ fontSize: 14, color: "rgba(255,255,255,0.50)", marginBottom: 12, textAlign: "center" }}>
        Wysłano zaproszenie do umowy do:
      </p>
      <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: "12px 24px", marginBottom: 40 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: "#d4a020" }}>{recipient}</span>
      </div>
      <SandboxBadge />
      <button
        data-testid="invite-btn-done"
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

// ── ERROR SCREEN ──────────────────────────────────────────────────────────────
function ErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: "0 28px", background: "var(--background)" }}>
      <div style={{ width: 88, height: 88, borderRadius: "50%", background: "rgba(248,113,113,0.12)", border: "2px solid rgba(248,113,113,0.30)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 28 }}>
        <XCircle size={44} style={{ color: "#f87171" }} />
      </div>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: "white", marginBottom: 8 }}>Błąd zaproszenia</h2>
      <p style={{ fontSize: 13, color: "rgba(255,255,255,0.50)", marginBottom: 32, textAlign: "center" }}>{message}</p>
      <button data-testid="invite-btn-retry" onClick={onRetry} style={{ height: 52, borderRadius: 16, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)", fontSize: 14, fontWeight: 700, color: "white", cursor: "pointer", padding: "0 36px" }}>
        Spróbuj ponownie
      </button>
    </div>
  );
}

// ── MAIN COMPONENT ─────────────────────────────────────────────────────────────
export default function ContractInviteFlow() {
  const [, setLocation] = useLocation();
  const { user } = useAppStore();

  const [step, setStep] = useState<"form" | "confirm" | "success" | "error">("form");
  const [currency, setCurrency] = useState<CurrencyCode>("PLN");
  const [contractType, setContractType] = useState<ContractType>("SERVICE");
  const [errorMsg, setErrorMsg] = useState("");
  const [processing, setProcessing] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const defaultDeadline = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);

  const [f, setF] = useState({
    recipient: "",
    title: "",
    amount: "",
    deadline: defaultDeadline,
    description: "",
  });
  const [errs, setErrs] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    const r = f.recipient.trim();
    if (!r) e.recipient = "Podaj adres e-mail, numer telefonu lub @nick";
    else if (!r.includes("@") && !r.startsWith("+") && !/^\d/.test(r) && !r.startsWith("@")) {
      e.recipient = "Podaj adres e-mail, numer telefonu lub @nick";
    }
    if (!f.title.trim()) e.title = "Pole wymagane";
    if (!f.amount || isNaN(Number(f.amount)) || Number(f.amount) < 0) e.amount = "Kwota musi być ≥ 0";
    if (!f.deadline) e.deadline = "Podaj termin realizacji";
    else if (f.deadline < today) e.deadline = "Termin nie może być w przeszłości";
    if (!f.description.trim()) e.description = "Pole wymagane";
    setErrs(e);
    return Object.keys(e).length === 0;
  };

  const typeLabelPl = CONTRACT_TYPES.find(t => t.value === contractType)?.label ?? contractType;
  const sym = CURRENCY_SYMBOLS[currency] || currency;

  const confirmRows = [
    { label: "Odbiorca", value: f.recipient.trim() },
    { label: "Tytuł", value: f.title.trim() },
    { label: "Typ umowy", value: typeLabelPl },
    { label: "Kwota", value: `${sym}${Number(f.amount).toLocaleString("pl-PL", { minimumFractionDigits: 2 })}` },
    { label: "Waluta", value: currency },
    { label: "Termin", value: f.deadline },
    { label: "Opis", value: f.description.trim().slice(0, 60) + (f.description.length > 60 ? "…" : "") },
  ];

  const handleConfirm = async () => {
    setProcessing(true);
    const result = await paymentProvider.createContractInvite({
      senderId: user?.id || "",
      recipientIdentifier: f.recipient.trim(),
      title: f.title.trim(),
      contractType,
      amount: Number(f.amount),
      currency,
      deadline: f.deadline,
      description: f.description.trim(),
    });
    setProcessing(false);
    if (result.success) {
      setStep("success");
    } else {
      setErrorMsg(result.error || "Wystąpił błąd podczas wysyłania zaproszenia.");
      setStep("error");
    }
  };

  if (step === "confirm") return (
    <ConfirmScreen rows={confirmRows} amount={Number(f.amount)} currency={currency} isProcessing={processing} onConfirm={handleConfirm} onBack={() => setStep("form")} />
  );
  if (step === "success") return <SuccessScreen recipient={f.recipient.trim()} onDone={() => setLocation("/")} />;
  if (step === "error") return <ErrorScreen message={errorMsg} onRetry={() => { setStep("form"); setErrorMsg(""); }} />;

  return (
    <div style={{ minHeight: "100vh", background: "var(--background)", paddingBottom: 120 }}>

      {/* Header */}
      <div style={{
        position: "sticky", top: 0, zIndex: 50, background: "var(--background)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        padding: "14px 20px", display: "flex", alignItems: "center", gap: 12,
      }}>
        <button
          data-testid="invite-back"
          onClick={() => window.history.back()}
          style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.6)", display: "flex", alignItems: "center", gap: 6, padding: 0 }}
        >
          <ArrowLeft size={18} />
          <span style={{ fontSize: 14 }}>Wróć</span>
        </button>
      </div>

      <div style={{ padding: "24px 20px 0" }}>

        {/* Title area */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 6 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 16,
            background: "rgba(212,160,32,0.12)", border: "1px solid rgba(212,160,32,0.28)",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <FileText size={24} style={{ color: "#d4a020" }} />
          </div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "white", margin: 0 }}>Zaproś do umowy</h1>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.40)", margin: "3px 0 0" }}>Wyślij zaproszenie do podpisania umowy</p>
          </div>
        </div>
        <div style={{ marginBottom: 28, marginTop: 10 }}><SandboxBadge /></div>

        {/* Form */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

          {/* Recipient */}
          <div>
            <label style={lbl}>Odbiorca (e-mail, telefon lub @nick)</label>
            <input
              data-testid="invite-recipient"
              style={inp}
              placeholder="np. jan@email.com, +48 600 123, @jankowalski"
              value={f.recipient}
              onChange={e => setF(p => ({ ...p, recipient: e.target.value }))}
              autoComplete="off"
            />
            <FieldErr msg={errs.recipient} />
          </div>

          {/* Title */}
          <div>
            <label style={lbl}>Tytuł umowy</label>
            <input
              data-testid="invite-title"
              style={inp}
              placeholder="np. Umowa o dzieło — projekt strony"
              value={f.title}
              onChange={e => setF(p => ({ ...p, title: e.target.value }))}
            />
            <FieldErr msg={errs.title} />
          </div>

          {/* Contract type */}
          <div>
            <label style={lbl}>Typ umowy</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {CONTRACT_TYPES.map(ct => (
                <button
                  key={ct.value}
                  data-testid={`invite-type-${ct.value.toLowerCase()}`}
                  onClick={() => setContractType(ct.value)}
                  style={{
                    padding: "7px 14px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer",
                    border: contractType === ct.value ? "1.5px solid rgba(212,160,32,0.85)" : "1px solid rgba(255,255,255,0.10)",
                    background: contractType === ct.value ? "rgba(212,160,32,0.12)" : "rgba(255,255,255,0.03)",
                    color: contractType === ct.value ? "#d4a020" : "rgba(255,255,255,0.55)",
                  }}
                >
                  {ct.label}
                </button>
              ))}
            </div>
          </div>

          {/* Currency */}
          <div>
            <label style={lbl}>Waluta</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {CURRENCY_ORDER.map(cur => (
                <button
                  key={cur}
                  data-testid={`invite-currency-${cur}`}
                  onClick={() => setCurrency(cur)}
                  style={{
                    padding: "6px 14px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer",
                    border: currency === cur ? "1.5px solid rgba(212,160,32,0.85)" : "1px solid rgba(255,255,255,0.10)",
                    background: currency === cur ? "rgba(212,160,32,0.12)" : "rgba(255,255,255,0.03)",
                    color: currency === cur ? "#d4a020" : "rgba(255,255,255,0.55)",
                  }}
                >
                  {WALLET_FLAGS[cur]} {cur}
                </button>
              ))}
            </div>
          </div>

          {/* Amount */}
          <div>
            <label style={lbl}>Wartość umowy</label>
            <input
              data-testid="invite-amount"
              type="number"
              min="0"
              style={inp}
              placeholder="0.00"
              value={f.amount}
              onChange={e => setF(p => ({ ...p, amount: e.target.value }))}
            />
            <FieldErr msg={errs.amount} />
          </div>

          {/* Deadline */}
          <div>
            <label style={lbl}>Termin realizacji</label>
            <div style={{ position: "relative" }}>
              <input
                data-testid="invite-deadline"
                type="date"
                min={today}
                style={{ ...inp, colorScheme: "dark" }}
                value={f.deadline}
                onChange={e => setF(p => ({ ...p, deadline: e.target.value }))}
              />
              <Calendar size={16} style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.30)", pointerEvents: "none" }} />
            </div>
            <FieldErr msg={errs.deadline} />
          </div>

          {/* Description */}
          <div>
            <label style={lbl}>Opis / warunki</label>
            <textarea
              data-testid="invite-description"
              rows={4}
              style={{
                ...inp, height: "auto", padding: "12px 14px",
                resize: "vertical", fontFamily: "inherit", lineHeight: 1.5,
              }}
              placeholder="Opisz zakres usług, warunki płatności i inne ustalenia..."
              value={f.description}
              onChange={e => setF(p => ({ ...p, description: e.target.value }))}
            />
            <FieldErr msg={errs.description} />
          </div>

        </div>

        {/* Info note */}
        <div style={{ background: "rgba(212,160,32,0.07)", border: "1px solid rgba(212,160,32,0.18)", borderRadius: 14, padding: "12px 16px", display: "flex", gap: 10, marginTop: 24 }}>
          <Info size={16} style={{ color: "rgba(212,160,32,0.80)", flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 12, color: "rgba(212,160,32,0.80)", lineHeight: 1.5 }}>
            Odbiorca otrzyma zaproszenie do umowy. Po jej zaakceptowaniu środki zostaną zabezpieczone na koncie Finlys.
          </span>
        </div>

        {/* Submit */}
        <button
          data-testid="invite-next"
          onClick={() => { if (validate()) setStep("confirm"); }}
          style={{
            marginTop: 28, width: "100%", height: 56, borderRadius: 18, border: "none", cursor: "pointer",
            background: "linear-gradient(180deg, #fff4b8 0%, #f9d95e 22%, #d4a020 62%, #b8880a 100%)",
            fontSize: 14, fontWeight: 900, color: "#1a1400", letterSpacing: 1.2,
            boxShadow: "0 3px 0 rgba(140,90,4,0.90), 0 8px 20px rgba(210,158,20,0.45)",
          }}
        >
          DALEJ
        </button>

      </div>
    </div>
  );
}
