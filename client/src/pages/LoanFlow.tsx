import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Banknote, CalendarDays, Repeat, CheckCircle2, User, Send } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore, CORE_WALLET_CURRENCIES, WALLET_FLAGS } from "@/lib/store";
import { useLang } from "@/context/LanguageContext";
import { useToast } from "@/hooks/use-toast";

const ORB_BG = "radial-gradient(circle at 35% 28%, #fff6c0 0%, #f7d84a 28%, #c48a06 65%, #8a5e00 100%)";
const ORB_SHADOW = "inset 0 2px 4px rgba(255,255,220,0.60), inset 0 -3px 6px rgba(0,0,0,0.28), 0 3px 0 rgba(120,80,0,0.90), 0 10px 28px rgba(200,148,20,0.55), 0 0 0 1px rgba(255,220,80,0.24)";

export default function LoanFlow() {
  const [, setLocation] = useLocation();
  const { lang } = useLang();
  const { toast } = useToast();
  const pl = lang === "pl";

  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("PLN");
  const [dueDate, setDueDate] = useState("");
  const [installments, setInstallments] = useState(false);
  const [installmentCount, setInstallmentCount] = useState("3");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!recipient) {
      toast({ title: pl ? "Wpisz odbiorcę" : "Enter recipient", variant: "destructive" });
      return;
    }
    if (!amount || !dueDate) {
      toast({ title: pl ? "Uzupełnij kwotę i termin spłaty" : "Fill in amount and due date", variant: "destructive" });
      return;
    }
    if (recipient.startsWith("@")) {
      setSending(true);
      try {
        const res = await fetch(`/api/users/by-handle?handle=${encodeURIComponent(recipient)}`);
        if (!res.ok) {
          toast({ title: pl ? "Nie znaleziono użytkownika" : "User not found", description: recipient, variant: "destructive" });
          return;
        }
      } catch {
        toast({ title: pl ? "Błąd połączenia" : "Connection error", variant: "destructive" });
        return;
      } finally {
        setSending(false);
      }
    }
    setSent(true);
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--background)", overflowX: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "60px 24px 24px", display: "flex", alignItems: "center", gap: 14 }}>
        <button
          onClick={() => setLocation("/transfer")}
          style={{ width: 40, height: 40, borderRadius: "50%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}
        >
          <ArrowLeft size={18} style={{ color: "rgba(255,255,255,0.7)" }} />
        </button>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: "var(--primary,#D4A020)", textTransform: "uppercase", letterSpacing: "0.12em" }}>Finlys</div>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: "white", margin: 0 }}>{pl ? "Pożyczka znajomemu" : "P2P Loan"}</h1>
        </div>
      </div>

      <div style={{ padding: "0 24px 140px" }}>
        {sent ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            style={{ textAlign: "center", paddingTop: 60 }}
          >
            <CheckCircle2 size={64} style={{ color: "var(--primary,#D4A020)", marginBottom: 20 }} />
            <div style={{ fontSize: 24, fontWeight: 900, color: "white", marginBottom: 8 }}>{pl ? "Umowa wysłana!" : "Loan sent!"}</div>
            <div style={{ fontSize: 15, color: "rgba(255,255,255,0.55)", marginBottom: 4 }}>{recipient}</div>
            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.45)", marginBottom: 8 }}>
              {amount} {currency}
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", marginBottom: 32 }}>
              {pl ? "Termin spłaty:" : "Due date:"} {dueDate} · {installments ? `${installmentCount}x ${pl ? "raty" : "installments"}` : pl ? "jednorazowo" : "one-time"}
            </div>
            <button
              onClick={() => setLocation("/")}
              style={{ background: "var(--primary,#D4A020)", color: "#000", border: "none", borderRadius: 14, padding: "14px 40px", fontSize: 15, fontWeight: 900, cursor: "pointer" }}
            >
              {pl ? "Wróć do głównej" : "Back to home"}
            </button>
          </motion.div>
        ) : (
          <>
            {/* Odbiorca */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 1, display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <User size={13} /> {pl ? "Dla kogo" : "Recipient"}
              </label>
              <div style={{ position: "relative" }}>
                <User size={16} style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.30)", pointerEvents: "none" }} />
                <input
                  type="text"
                  placeholder={pl ? "@nick, numer tel. lub BLIK" : "@nick, phone or BLIK"}
                  value={recipient}
                  onChange={e => setRecipient(e.target.value)}
                  style={{ width: "100%", padding: "14px 16px 14px 44px", borderRadius: 16, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)", color: "white", fontSize: 15, fontWeight: 600, outline: "none", boxSizing: "border-box" }}
                />
              </div>
            </div>

            {/* Kwota + waluta */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 8 }}>
                {pl ? "Kwota pożyczki" : "Loan amount"}
              </label>
              <div style={{ position: "relative", marginBottom: 10 }}>
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  style={{ width: "100%", padding: "16px 72px 16px 18px", borderRadius: 16, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)", color: "white", fontSize: 24, fontWeight: 800, outline: "none", boxSizing: "border-box" }}
                />
                <span style={{ position: "absolute", right: 18, top: "50%", transform: "translateY(-50%)", fontSize: 14, fontWeight: 800, color: "var(--primary,#D4A020)" }}>{currency}</span>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {CORE_WALLET_CURRENCIES.map(cur => (
                  <button
                    key={cur}
                    onClick={() => setCurrency(cur)}
                    style={{
                      padding: "6px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer",
                      background: currency === cur ? "rgba(212,160,32,0.18)" : "rgba(255,255,255,0.06)",
                      border: `1px solid ${currency === cur ? "rgba(212,160,32,0.45)" : "rgba(255,255,255,0.09)"}`,
                      color: currency === cur ? "var(--primary,#D4A020)" : "rgba(255,255,255,0.50)",
                    }}
                  >
                    {WALLET_FLAGS[cur as keyof typeof WALLET_FLAGS] || ""} {cur}
                  </button>
                ))}
              </div>
            </div>

            {/* Termin spłaty */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 1, display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <CalendarDays size={13} /> {pl ? "Termin spłaty" : "Repayment date"}
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                min={new Date().toISOString().split("T")[0]}
                style={{ width: "100%", padding: "14px 16px", borderRadius: 16, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)", color: dueDate ? "white" : "rgba(255,255,255,0.3)", fontSize: 15, fontWeight: 600, outline: "none", boxSizing: "border-box", colorScheme: "dark" }}
              />
            </div>

            {/* Sposób spłaty */}
            <div style={{ marginBottom: 36 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 1, display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                <Repeat size={13} /> {pl ? "Sposób spłaty" : "Repayment method"}
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                {[
                  { key: false, label: pl ? "Jednorazowo" : "One-time", sub: pl ? "Całość na raz" : "Full amount" },
                  { key: true,  label: pl ? "Na raty" : "Installments", sub: pl ? "Kilka spłat" : "Multiple payments" },
                ].map(opt => (
                  <button
                    key={String(opt.key)}
                    onClick={() => setInstallments(opt.key)}
                    style={{
                      borderRadius: 16, padding: "14px 12px", cursor: "pointer", textAlign: "left",
                      background: installments === opt.key ? "rgba(212,160,32,0.12)" : "rgba(255,255,255,0.04)",
                      border: `1.5px solid ${installments === opt.key ? "rgba(212,160,32,0.50)" : "rgba(255,255,255,0.08)"}`,
                    }}
                  >
                    <div style={{ fontSize: 14, fontWeight: 800, color: installments === opt.key ? "var(--primary,#D4A020)" : "rgba(255,255,255,0.75)", marginBottom: 3 }}>{opt.label}</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{opt.sub}</div>
                  </button>
                ))}
              </div>

              <AnimatePresence>
                {installments && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    style={{ overflow: "hidden" }}
                  >
                    <label style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.40)", display: "block", marginBottom: 8 }}>
                      {pl ? "Liczba rat" : "Number of installments"}
                    </label>
                    <div style={{ display: "flex", gap: 8 }}>
                      {["2", "3", "4", "6", "12"].map(n => (
                        <button
                          key={n}
                          onClick={() => setInstallmentCount(n)}
                          style={{
                            flex: 1, padding: "10px 0", borderRadius: 12, cursor: "pointer",
                            border: `1.5px solid ${installmentCount === n ? "rgba(212,160,32,0.5)" : "rgba(255,255,255,0.08)"}`,
                            background: installmentCount === n ? "rgba(212,160,32,0.12)" : "rgba(255,255,255,0.03)",
                            color: installmentCount === n ? "var(--primary,#D4A020)" : "rgba(255,255,255,0.50)",
                            fontSize: 14, fontWeight: 800,
                          }}
                        >
                          {n}x
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Wyślij — złota kula */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              <button
                onClick={handleSend}
                disabled={sending}
                style={{
                  width: 76, height: 76, borderRadius: "50%",
                  background: ORB_BG,
                  boxShadow: ORB_SHADOW,
                  border: "none", cursor: sending ? "not-allowed" : "pointer",
                  opacity: sending ? 0.6 : 1,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  position: "relative", overflow: "hidden",
                }}
              >
                {/* połysk */}
                <div style={{ position: "absolute", top: 0, left: "20%", right: "20%", height: "42%", background: "linear-gradient(180deg, rgba(255,255,255,0.28) 0%, transparent 100%)", borderRadius: "0 0 50% 50%", pointerEvents: "none" }} />
                <Send size={26} style={{ color: "#1a1400" }} />
              </button>
              <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.50)", letterSpacing: 1, textTransform: "uppercase" }}>
                {amount ? `${pl ? "Wyślij" : "Send"} ${amount} ${currency}` : pl ? "Wyślij" : "Send"}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
