import { motion } from "framer-motion";
import { Plus, Eye, Lock, Settings, Sparkles, ArrowLeft, Landmark } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAppStore, CurrencyCode } from "@/lib/store";
import { useTheme } from "@/context/ThemeContext";
import { useLang } from "@/context/LanguageContext";
import { luxuryTheme } from "@/theme/luxuryTheme";

const r = luxuryTheme.radius;

type SimCard = {
  id: string;
  cardNumber: string;
  cardholderName: string;
  expiry: string;
  cardType: "visa" | "mastercard" | "amex";
  currency: CurrencyCode;
  status: "active" | "frozen";
  balance: number;
};

export default function Cards() {
  const { user } = useAppStore();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { th, theme } = useTheme();
  const { lang } = useLang();
  const isLight = (theme as string) === "arctic-platinum";

  const [isFrozen, setIsFrozen]       = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [simCard, setSimCard]         = useState<SimCard | null>(null);
  const [cardStats, setCardStats]     = useState<{ total: number; active: number } | null>(null);

  useEffect(() => {
    fetch("/api/cards")
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then((cards: SimCard[]) => {
        const active = cards.filter(c => c.status === "active").length;
        setCardStats({ total: cards.length, active });
        if (cards.length > 0) {
          const c = cards[0];
          setSimCard(c);
          setIsFrozen(c.status === "frozen");
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: th.pageBg, paddingBottom: "calc(120px + env(safe-area-inset-bottom))", position: "relative", overflowX: "hidden", transition: "background 0.5s ease" }}>

      {/* Ambient glow */}
      <div style={{ position: "absolute", top: -60, left: -80, width: 360, height: 360, borderRadius: "50%",
        background: `radial-gradient(circle, ${th.ambient1} 0%, transparent 70%)`, filter: "blur(8px)", pointerEvents: "none" }} />

      {/* Header */}
      <div style={{ padding: "54px 22px 0", display: "flex", alignItems: "center", justifyContent: "space-between", position: "relative", zIndex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button
            onClick={() => setLocation("/")}
            style={{
              width: 40, height: 40, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
              background: isLight ? "rgba(10,20,60,0.06)" : "rgba(255,255,255,0.07)",
              border: `1px solid ${isLight ? "rgba(10,30,90,0.12)" : "rgba(255,255,255,0.10)"}`,
              color: th.textPrimary, cursor: "pointer",
            }}
          >
            <ArrowLeft size={18} />
          </button>
          <div style={{ fontSize: 22, fontWeight: 800, color: th.textPrimary, letterSpacing: -0.3 }}>
            {lang === "pl" ? "Portfel kart" : "Portfolio"}
          </div>
        </div>
        <button
          data-testid="btn-request-card"
          onClick={() => toast({ title: lang === "pl" ? "Zamówiono!" : "Requested!", description: lang === "pl" ? "Twoja karta zostanie wysłana w ciągu 3–5 dni" : "Your card will arrive in 3–5 days" })}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            borderRadius: 999, padding: "8px 14px",
            fontSize: 11, fontWeight: 800, letterSpacing: 1.2,
            color: isLight ? "#9a7010" : "#e8d080",
            background: isLight ? "rgba(200,160,30,0.08)" : "rgba(247,220,100,0.06)",
            border: `1px solid ${isLight ? "rgba(180,140,20,0.40)" : "rgba(238,203,100,0.50)"}`,
            cursor: "pointer",
          }}
        >
          <Plus size={13} />
          {lang === "pl" ? "Zamów kartę" : "Request Card"}
        </button>
      </div>

      <div style={{ padding: "22px 22px 0", position: "relative", zIndex: 1 }}>

        {/* ── Cards Summary ── */}
        {cardStats !== null && (
          <div style={{
            marginBottom: 18, borderRadius: r.md, padding: "14px 18px",
            background: isLight ? "rgba(255,255,255,0.70)" : "rgba(255,255,255,0.04)",
            border: `1px solid ${isLight ? "rgba(10,30,90,0.10)" : "rgba(255,255,255,0.09)"}`,
            boxShadow: "0 4px 18px rgba(0,0,0,0.22)",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <div style={{ fontSize: 13, letterSpacing: 2.4, fontWeight: 700, color: th.textMuted, textTransform: "uppercase" }}>
              {lang === "pl" ? "Twoje karty" : "Your cards"}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: th.textPrimary }}>
                <span style={{ color: "#24d487" }}>{cardStats.active}</span>
                <span style={{ color: th.textMuted }}> / {cardStats.total} {lang === "pl" ? "aktywne" : "active"}</span>
              </div>
              <div style={{
                padding: "3px 9px", borderRadius: 999,
                fontSize: 12, fontWeight: 800, letterSpacing: 1,
                color: cardStats.active > 0 ? "#7df0ba" : th.textMuted,
                background: cardStats.active > 0 ? "rgba(35,183,118,0.16)" : "rgba(255,255,255,0.07)",
                border: `1px solid ${cardStats.active > 0 ? "rgba(80,225,155,0.24)" : "rgba(255,255,255,0.10)"}`,
              }}>
                {cardStats.active > 0 ? (lang === "pl" ? "AKTYWNE" : "ACTIVE") : (lang === "pl" ? "BRAK" : "NONE")}
              </div>
            </div>
          </div>
        )}

        {/* ── Main Card ── */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          style={{
            borderRadius: 24, overflow: "hidden",
            aspectRatio: "1.586 / 1",
            background: isFrozen
              ? "linear-gradient(135deg, #2a2a2a 0%, #111111 100%)"
              : "linear-gradient(135deg, #2d2a26 0%, #1a1a1a 55%, #0a0a0a 100%)",
            border: `1px solid ${isFrozen ? "rgba(255,255,255,0.08)" : "rgba(212,175,55,0.30)"}`,
            boxShadow: "0 24px 80px rgba(0,0,0,0.70), 0 0 0 1px rgba(255,255,255,0.04)",
            padding: "28px 28px",
            display: "flex", flexDirection: "column", justifyContent: "space-between",
            position: "relative",
          }}
        >
          <div style={{ position: "absolute", top: -40, right: -40, width: 180, height: 180, borderRadius: "50%",
            background: isFrozen ? "rgba(255,255,255,0.04)" : "rgba(212,175,55,0.18)", filter: "blur(30px)", pointerEvents: "none" }} />

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Sparkles size={14} color={isFrozen ? "#888" : "#D4AF37"} />
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2.8, color: isFrozen ? "#888" : "#D4AF37" }}>
                {isFrozen ? (lang === "pl" ? "ZABLOKOWANA" : "SECURED") : "WORLD ELITE"}
              </div>
            </div>
            <div style={{ width: 38, height: 28, borderRadius: 6, border: `1px solid ${isFrozen ? "rgba(255,255,255,0.12)" : "rgba(212,175,55,0.50)"}`, background: isFrozen ? "rgba(255,255,255,0.05)" : "rgba(212,175,55,0.16)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ width: "85%", height: 1, background: "rgba(255,255,255,0.22)" }} />
            </div>
          </div>

          <div>
            <div style={{ fontSize: 18, letterSpacing: "0.22em", fontFamily: "monospace", fontWeight: 300, color: isFrozen ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.90)", marginBottom: 20 }}>
              {simCard
                ? `••••  ••••  ••••  ${simCard.cardNumber.replace(/\D/g, "").slice(-4)}`
                : "••••  ••••  ••••  ••••"}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
              <div>
                <div style={{ fontSize: 8, letterSpacing: 2, color: "rgba(255,255,255,0.40)", marginBottom: 4 }}>
                  {lang === "pl" ? "POSIADACZ" : "CARDHOLDER NAME"}
                </div>
                <div style={{ fontSize: 13, letterSpacing: 1.5, fontWeight: 600, color: isFrozen ? "rgba(255,255,255,0.40)" : "rgba(255,255,255,0.85)" }}>
                  {(simCard?.cardholderName || user?.name || "FINLYS CLIENT").toUpperCase()}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 8, letterSpacing: 2, color: "rgba(255,255,255,0.40)", marginBottom: 4 }}>
                  {lang === "pl" ? "WAŻNA DO" : "VALID THRU"}
                </div>
                <div style={{ fontSize: 13, letterSpacing: 1.5, fontWeight: 600, color: isFrozen ? "rgba(255,255,255,0.40)" : "rgba(255,255,255,0.85)" }}>
                  {simCard?.expiry ?? "––/––"}
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* ── Action Grid ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginTop: 20 }}>
          {[
            { icon: Eye, label: lang === "pl" ? "SZCZEGÓŁY" : "DETAILS", active: showDetails, onClick: () => setShowDetails(d => !d) },
            {
              icon: Lock, label: lang === "pl" ? "ZABLOKUJ" : "FREEZE", active: isFrozen,
              onClick: async () => {
                const next = !isFrozen;
                setIsFrozen(next);
                toast({ title: next ? (lang === "pl" ? "Karta zablokowana" : "Card frozen") : (lang === "pl" ? "Karta aktywna" : "Card active") });
                if (simCard) {
                  try {
                    const res = await fetch(`/api/cards/${simCard.id}/freeze`, {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ frozen: next }),
                    });
                    if (res.ok) {
                      const data = await res.json();
                      setSimCard(prev => prev ? { ...prev, status: data.status } : prev);
                    }
                  } catch {}
                }
              },
            },
            { icon: Settings, label: lang === "pl" ? "USTAWIENIA" : "SETTINGS", active: false, onClick: () => setLocation("/profile/security") },
            { icon: Plus, label: lang === "pl" ? "LIMITY" : "LIMITS", active: false, onClick: () => setLocation("/cards/limits") },
          ].map((a, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, cursor: "pointer" }} onClick={a.onClick}>
              <div style={{
                width: 52, height: 52, borderRadius: 16,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: a.active
                  ? "linear-gradient(180deg, #fff4b8 0%, #f9d95e 22%, #d4a020 62%, #b8880a 100%)"
                  : (isLight ? "rgba(255,255,255,0.80)" : "rgba(255,255,255,0.05)"),
                border: `1px solid ${a.active ? "rgba(212,175,55,0.60)" : (isLight ? "rgba(10,30,90,0.10)" : "rgba(255,255,255,0.08)")}`,
                color: a.active ? "#1a1400" : th.textPrimary,
                boxShadow: a.active
                  ? "0 4px 16px rgba(212,175,55,0.40), inset 0 1px 0 rgba(255,255,255,0.60)"
                  : (isLight ? "0 2px 8px rgba(80,110,180,0.10), inset 0 1px 0 rgba(255,255,255,0.80)" : "0 4px 12px rgba(0,0,0,0.28)"),
                transition: "all 0.22s ease",
              }}>
                <a.icon size={18} />
              </div>
              <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1.4, color: a.active ? (isLight ? "#7a5200" : "#f7d248") : th.textMuted }}>
                {a.label}
              </div>
            </div>
          ))}
        </div>

        {/* ── Linked External Cards — not yet available ── */}
        <div style={{ marginTop: 28 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: th.textPrimary, letterSpacing: -0.2 }}>
              {lang === "pl" ? "Karty zewnętrzne" : "Linked Cards"}
            </div>
            <button
              data-testid="btn-add-external-card"
              onClick={() => toast({
                title: lang === "pl" ? "Wkrótce dostępne" : "Coming soon",
                description: lang === "pl"
                  ? "Łączenie kart zewnętrznych będzie dostępne w kolejnej wersji."
                  : "External card linking will be available in the next release.",
              })}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                borderRadius: 999, padding: "6px 14px",
                fontSize: 10, fontWeight: 800, letterSpacing: 1.4,
                color: isLight ? "#7a7a7a" : "#888",
                background: isLight ? "rgba(10,20,60,0.05)" : "rgba(255,255,255,0.05)",
                border: `1px solid ${isLight ? "rgba(10,30,90,0.12)" : "rgba(255,255,255,0.10)"}`,
                cursor: "pointer",
              }}
            >
              <Plus size={11} />
              {lang === "pl" ? "DODAJ KARTĘ" : "ADD CARD"}
            </button>
          </div>

          <div
            data-testid="linked-cards-empty"
            style={{
              borderRadius: r.lg, padding: "28px 20px", textAlign: "center",
              background: isLight ? "rgba(255,255,255,0.60)" : "rgba(255,255,255,0.03)",
              border: `1.5px dashed ${isLight ? "rgba(10,30,90,0.14)" : "rgba(255,255,255,0.12)"}`,
            }}
          >
            <Landmark size={28} color={th.textMuted} style={{ margin: "0 auto 10px" }} />
            <div style={{ fontSize: 13, fontWeight: 700, color: th.textPrimary, marginBottom: 6 }}>
              {lang === "pl" ? "Łączenie kart zewnętrznych" : "External card linking"}
            </div>
            <div style={{ fontSize: 11, color: th.textMuted, lineHeight: 1.5 }}>
              {lang === "pl"
                ? "Ta funkcja zostanie uruchomiona w następnej wersji Finlys."
                : "This feature will be available in the next release of Finlys."}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
