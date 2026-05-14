import { useState } from "react";
import { ArrowLeft, UserPlus, Link2, Copy, Mail, Smartphone, CheckCircle2, AlertCircle, Share2, Wallet, FileCheck, UserCheck, Users } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "@/lib/store";

const DEFAULT_MESSAGE =
  "Cześć! Zapraszam Cię do aplikacji. Możemy tam bezpiecznie wysyłać pieniądze, tworzyć umowy i potwierdzać transakcje.";

const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, letterSpacing: 1.2,
  color: "rgba(255,255,255,0.40)", textTransform: "uppercase" as const,
  marginBottom: 7, display: "block",
};

const inputStyle: React.CSSProperties = {
  width: "100%", height: 50, padding: "0 14px",
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: 12, fontSize: 15, color: "rgba(255,255,255,0.90)",
  outline: "none", transition: "border-color 0.18s",
};

const textareaStyle: React.CSSProperties = {
  width: "100%", minHeight: 84, padding: "12px 14px",
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: 12, fontSize: 14, color: "rgba(255,255,255,0.85)",
  outline: "none", resize: "vertical" as const, lineHeight: 1.5,
};

const errStyle: React.CSSProperties = {
  fontSize: 11, color: "#f87171", marginTop: 5, display: "flex", alignItems: "center", gap: 5,
};

const goldBtn: React.CSSProperties = {
  width: "100%", height: 54, borderRadius: 16, border: "none", cursor: "pointer",
  background: "linear-gradient(180deg, #fff4b8 0%, #f9d95e 22%, #d4a020 62%, #b8880a 100%)",
  fontSize: 13, fontWeight: 900, color: "#1a1400", letterSpacing: 1.3,
  boxShadow: "0 3px 0 rgba(140,90,4,0.90), 0 8px 20px rgba(210,158,20,0.45)",
  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
};

type StatusMsg = { text: string; type: "success" | "error" } | null;

const FEATURES: { icon: React.ReactNode; title: string; desc: string }[] = [
  { icon: <UserCheck size={20} style={{ color: "#d4a020" }} />, title: "Założyć konto", desc: "Rejestracja w kilka sekund" },
  { icon: <Users size={20} style={{ color: "#a78bfa" }} />, title: "Połączyć się z Tobą", desc: "Znajomi w jednym miejscu" },
  { icon: <Wallet size={20} style={{ color: "#4ade80" }} />, title: "Otrzymać pieniądze", desc: "Bezpieczne przelewy" },
  { icon: <FileCheck size={20} style={{ color: "#60a5fa" }} />, title: "Tworzyć umowy", desc: "Akceptuj i rozliczaj" },
];

export default function InvitePersonFlow() {
  const { user } = useAppStore();

  const refParam = user?.handle?.replace(/^@/, "") || user?.id || "demo-user";
  const inviteLink = `https://finlys.app/invite?ref=${encodeURIComponent(refParam)}`;

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [status, setStatus] = useState<StatusMsg>(null);
  const [phoneErr, setPhoneErr] = useState("");
  const [emailErr, setEmailErr] = useState("");
  const [copying, setCopying] = useState(false);

  const fullSmsText = `${message}\n\nDołącz tutaj: ${inviteLink}`;
  const emailSubject = "Zaproszenie do aplikacji Finlys";
  const emailBody = `${name ? `Cześć ${name},\n\n` : "Cześć!\n\n"}${message}\n\nKliknij tutaj, żeby dołączyć:\n${inviteLink}\n\nDo zobaczenia!`;

  const showStatus = (text: string, type: "success" | "error") => {
    setStatus({ text, type });
    setTimeout(() => setStatus(null), 3500);
  };

  const handleSms = () => {
    setPhoneErr("");
    if (!phone.trim()) { setPhoneErr("Wpisz numer telefonu, aby wysłać SMS"); return; }
    if (phone.replace(/\D/g, "").length < 6) { setPhoneErr("Numer telefonu jest za krótki"); return; }
    window.open(`sms:${phone}?body=${encodeURIComponent(fullSmsText)}`, "_self");
    showStatus("SMS gotowy do wysłania", "success");
  };

  const handleEmail = () => {
    setEmailErr("");
    if (!email.trim()) { setEmailErr("Wpisz adres email, aby wysłać zaproszenie"); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setEmailErr("Podaj prawidłowy adres email"); return; }
    const href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
    window.open(href, "_self");
    showStatus("Email gotowy do wysłania", "success");
  };

  const copyToClipboard = async (): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      return true;
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = inviteLink;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        return ok;
      } catch {
        return false;
      }
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: "Zaproszenie do Finlys", text: message, url: inviteLink });
        showStatus("Zaproszenie udostępnione", "success");
        return;
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") return;
      }
    }
    const ok = await copyToClipboard();
    showStatus(ok ? "Link skopiowany" : "Nie udało się przygotować zaproszenia", ok ? "success" : "error");
  };

  const handleCopyLink = async () => {
    setCopying(true);
    const ok = await copyToClipboard();
    showStatus(ok ? "Link skopiowany" : "Nie udało się przygotować zaproszenia", ok ? "success" : "error");
    setCopying(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--background)", paddingBottom: 120 }}>
      {/* ── Header ── */}
      <div style={{
        padding: "56px 24px 20px", position: "sticky", top: 0,
        background: "var(--background)", zIndex: 20,
        borderBottom: "1px solid rgba(255,255,255,0.05)",
      }}>
        <button
          data-testid="invite-person-back"
          onClick={() => window.history.back()}
          style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.6)", display: "flex", alignItems: "center", gap: 6, marginBottom: 18 }}
        >
          <ArrowLeft size={18} />
          <span style={{ fontSize: 14 }}>Wróć</span>
        </button>

        <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 16, background: "rgba(212,160,32,0.12)", border: "1px solid rgba(212,160,32,0.25)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>
            <UserPlus size={24} style={{ color: "#d4a020" }} />
          </div>
          <div>
            <h1 style={{ fontSize: 21, fontWeight: 800, color: "white", lineHeight: 1.2 }}>Zaproś osobę do aplikacji</h1>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.40)", lineHeight: 1.5, marginTop: 6 }}>
              Wyślij zaproszenie SMS-em, emailem albo udostępnij link. Po dołączeniu będziecie mogli wysyłać pieniądze, tworzyć umowy i bezpiecznie rozliczać transakcje.
            </p>
          </div>
        </div>
      </div>

      <div style={{ padding: "24px 24px 0" }}>
        {/* ── Status toast ── */}
        <AnimatePresence>
          {status && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "12px 16px",
                borderRadius: 14, marginBottom: 20,
                background: status.type === "success" ? "rgba(74,222,128,0.10)" : "rgba(248,113,113,0.10)",
                border: `1px solid ${status.type === "success" ? "rgba(74,222,128,0.30)" : "rgba(248,113,113,0.30)"}`,
              }}
            >
              {status.type === "success"
                ? <CheckCircle2 size={16} style={{ color: "#4ade80", flexShrink: 0 }} />
                : <AlertCircle size={16} style={{ color: "#f87171", flexShrink: 0 }} />}
              <span style={{ fontSize: 13, fontWeight: 600, color: status.type === "success" ? "rgba(74,222,128,0.90)" : "rgba(248,113,113,0.90)" }}>
                {status.text}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Form fields ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={labelStyle}>Imię odbiorcy (opcjonalnie)</label>
            <input
              data-testid="invite-person-name"
              style={inputStyle}
              placeholder="Np. Jan Kowalski"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>

          <div>
            <label style={labelStyle}>Numer telefonu (opcjonalnie)</label>
            <input
              data-testid="invite-person-phone"
              style={{ ...inputStyle, borderColor: phoneErr ? "rgba(248,113,113,0.50)" : "rgba(255,255,255,0.10)" }}
              placeholder="+48 123 456 789"
              type="tel"
              value={phone}
              onChange={e => { setPhone(e.target.value); setPhoneErr(""); }}
            />
            {phoneErr && <div style={errStyle}><AlertCircle size={11} />{phoneErr}</div>}
          </div>

          <div>
            <label style={labelStyle}>Adres email (opcjonalnie)</label>
            <input
              data-testid="invite-person-email"
              style={{ ...inputStyle, borderColor: emailErr ? "rgba(248,113,113,0.50)" : "rgba(255,255,255,0.10)" }}
              placeholder="jan@email.com"
              type="email"
              value={email}
              onChange={e => { setEmail(e.target.value); setEmailErr(""); }}
            />
            {emailErr && <div style={errStyle}><AlertCircle size={11} />{emailErr}</div>}
          </div>

          <div>
            <label style={labelStyle}>Krótka wiadomość</label>
            <textarea
              data-testid="invite-person-message"
              style={textareaStyle}
              value={message}
              onChange={e => setMessage(e.target.value)}
            />
          </div>
        </div>

        {/* ── Link preview ── */}
        <div style={{ marginTop: 20, marginBottom: 24, background: "rgba(212,160,32,0.06)", border: "1px solid rgba(212,160,32,0.20)", borderRadius: 12, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, overflow: "hidden" }}>
          <Link2 size={14} style={{ color: "#d4a020", flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
            {inviteLink}
          </span>
        </div>

        {/* ── Sposób wysłania ── */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.8, color: "rgba(255,255,255,0.55)", marginBottom: 14, textTransform: "uppercase" as const }}>
            Sposób wysłania
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <button
              data-testid="invite-btn-sms"
              onClick={handleSms}
              style={{ height: 52, borderRadius: 14, border: "1px solid rgba(74,222,128,0.25)", background: "rgba(74,222,128,0.06)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 13, fontWeight: 700, color: "rgba(74,222,128,0.85)" }}
            >
              <Smartphone size={16} />
              Wyślij SMS
            </button>

            <button
              data-testid="invite-btn-email"
              onClick={handleEmail}
              style={{ height: 52, borderRadius: 14, border: "1px solid rgba(96,165,250,0.25)", background: "rgba(96,165,250,0.06)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 13, fontWeight: 700, color: "rgba(96,165,250,0.85)" }}
            >
              <Mail size={16} />
              Wyślij email
            </button>

            <button
              data-testid="invite-btn-share"
              onClick={handleShare}
              style={{ height: 52, borderRadius: 14, border: "1px solid rgba(167,139,250,0.25)", background: "rgba(167,139,250,0.06)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 13, fontWeight: 700, color: "rgba(167,139,250,0.85)" }}
            >
              <Share2 size={16} />
              Udostępnij
            </button>

            <button
              data-testid="invite-btn-copy"
              onClick={handleCopyLink}
              disabled={copying}
              style={{ height: 52, borderRadius: 14, border: "1px solid rgba(212,160,32,0.30)", background: "rgba(212,160,32,0.07)", cursor: copying ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 13, fontWeight: 700, color: copying ? "rgba(212,160,32,0.45)" : "rgba(212,160,32,0.90)" }}
            >
              <Copy size={16} />
              {copying ? "Kopiuję…" : "Kopiuj link"}
            </button>
          </div>
        </div>

        {/* ── Features grid ── */}
        <div style={{ marginTop: 36, marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.8, color: "rgba(255,255,255,0.55)", marginBottom: 16, textTransform: "uppercase" as const }}>
            Co odbiorca będzie mógł zrobić po dołączeniu?
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {FEATURES.map((f, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: "16px 14px" }}
              >
                <div style={{ marginBottom: 8 }}>{f.icon}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.85)", marginBottom: 3 }}>{f.title}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.38)", lineHeight: 1.4 }}>{f.desc}</div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* ── Primary CTA ── */}
        <div style={{ marginTop: 28, paddingBottom: 40 }}>
          <button
            data-testid="invite-cta-copy"
            onClick={handleCopyLink}
            disabled={copying}
            style={{ ...goldBtn, opacity: copying ? 0.7 : 1 }}
          >
            <Link2 size={16} />
            {copying ? "Kopiuję link…" : "Skopiuj link zaproszenia"}
          </button>
        </div>
      </div>
    </div>
  );
}
