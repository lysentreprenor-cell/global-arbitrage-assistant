import { Link, useLocation } from "wouter";
import { Home, CreditCard, MessageSquare, FileText } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useTheme } from "@/context/ThemeContext";
import { useLang } from "@/context/LanguageContext";
import { useFeatures } from "@/hooks/useFeatures";
import { useMessageBadge } from "@/context/MessageBadgeContext";

export function BottomNav() {
  const [location] = useLocation();
  const { user } = useAppStore();
  const { th } = useTheme();
  const { t } = useLang();
  const { isEnabled } = useFeatures();
  const { unreadCount } = useMessageBadge();

  if (!user || location === "/auth" || location === "/transfer" || location === "/transfer/new" || location === "/wallet/top-up" || location === "/agreements/new" || location.startsWith("/messages/") || location === "/split" || location === "/recurring" || location === "/savings" || location === "/kyc" || location === "/referral") return null;

  const isHome  = location === "/";
  const isCards = location === "/cards";
  const isMsgs  = location === "/messages";
  const isAgree = location === "/agreements" || location.startsWith("/agreements/");

  const homeActiveColor  = th.primary;
  const cardsActiveColor = th.tabCards;
  const msgsActiveColor  = th.tabMessages;
  const agreeActiveColor = th.tabAgreements;

  return (
    <div style={{
      position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
      width: "100%", maxWidth: 448,
      padding: "0 20px 26px",
      background: `linear-gradient(to top, ${th.navFade} 52%, rgba(0,0,0,0) 100%)`,
      zIndex: 50, pointerEvents: "none",
      transition: "background 0.5s ease",
    }}>
      <nav style={{
        width: "100%", borderRadius: 999, padding: "12px 20px",
        background: th.navBg,
        border: `1px solid ${th.navBorder}`,
        display: "grid", gridTemplateColumns: "1fr 1fr auto 1fr 1fr",
        alignItems: "center", pointerEvents: "auto",
        boxShadow: [
          "0 2px 0 rgba(255,255,255,0.06)",
          "inset 0 1px 0 rgba(255,255,255,0.07)",
          "0 12px 48px rgba(0,0,0,0.65)",
          "0 4px 16px rgba(0,0,0,0.45)",
        ].join(", "),
        position: "relative", overflow: "hidden",
        transition: "background 0.5s ease, border-color 0.5s ease",
      }}>
        {/* top glint */}
        <div style={{
          position: "absolute", top: 0, left: "20%", right: "20%", height: 1,
          background: `linear-gradient(90deg, transparent, ${th.navGlint}, transparent)`,
          pointerEvents: "none",
        }} />

        {/* HOME */}
        {isEnabled("dashboard") ? (
          <Link href="/">
            <a
              data-testid="nav-home"
              style={{
                display: "grid", justifyItems: "center", gap: 4,
                cursor: "pointer", textDecoration: "none",
                fontSize: 15, fontWeight: 800, letterSpacing: 1.2,
              }}
            >
              <div style={{
                width: 36, height: 36, borderRadius: 12,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: isHome ? th.navActiveBg : "transparent",
                boxShadow: isHome ? th.navActiveGlow : "none",
                transition: "all 0.2s",
              }}>
                <Home size={19} style={{ color: isHome ? homeActiveColor : th.textMuted }} />
              </div>
              <span style={{ color: isHome ? homeActiveColor : th.textMuted, fontSize: 11, letterSpacing: 1.0 }}>
                {t.home}
              </span>
            </a>
          </Link>
        ) : <div />}

        {/* CARDS */}
        {isEnabled("cards") ? (
          <Link href="/cards">
            <a
              data-testid="nav-cards"
              style={{
                display: "grid", justifyItems: "center", gap: 4,
                cursor: "pointer", textDecoration: "none",
                fontSize: 15, fontWeight: 800, letterSpacing: 1.2,
              }}
            >
              <div style={{
                width: 36, height: 36, borderRadius: 12,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: isCards ? `${th.tabCards}1e` : "transparent",
                boxShadow: isCards
                  ? `0 0 14px ${th.tabCards}38, inset 0 1px 0 rgba(255,255,255,0.07)`
                  : "none",
                transition: "all 0.2s",
              }}>
                <CreditCard size={19} style={{ color: isCards ? cardsActiveColor : th.textMuted }} />
              </div>
              <span style={{ color: isCards ? cardsActiveColor : th.textMuted, fontSize: 11, letterSpacing: 1.0 }}>
                {t.cards}
              </span>
            </a>
          </Link>
        ) : <div />}

        {/* Transfer — themed orb (center) */}
        {isEnabled("transfer") ? (
          <Link href="/transfer">
            <a
              data-testid="nav-transfer"
              style={{
                width: 68, height: 68, borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: th.orbColor,
                background: th.orbBg,
                boxShadow: th.orbShadow,
                textDecoration: "none", position: "relative", overflow: "hidden",
                transition: "background 0.5s ease, box-shadow 0.5s ease",
              }}
            >
              <div style={{
                position: "absolute", top: 0, left: "20%", right: "20%", height: "42%",
                background: "linear-gradient(180deg, rgba(255,255,255,0.28) 0%, transparent 100%)",
                borderRadius: "0 0 50% 50%", pointerEvents: "none",
              }} />
              <span style={{ fontSize: 13, fontWeight: 900, letterSpacing: 0.5, color: th.orbColor }}>
                Wyślij
              </span>
            </a>
          </Link>
        ) : <div style={{ width: 68 }} />}

        {/* MESSAGES */}
        {isEnabled("messages") ? (
          <Link href="/messages">
            <a
              data-testid="nav-messages"
              style={{
                display: "grid", justifyItems: "center", gap: 4,
                cursor: "pointer", textDecoration: "none",
                fontSize: 15, fontWeight: 800, letterSpacing: 1.2,
              }}
            >
              <div style={{ position: "relative" }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 12,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: isMsgs ? `${th.tabMessages}1e` : "transparent",
                  boxShadow: isMsgs
                    ? `0 0 14px ${th.tabMessages}38, inset 0 1px 0 rgba(255,255,255,0.07)`
                    : "none",
                  transition: "all 0.2s",
                }}>
                  <MessageSquare size={19} style={{ color: isMsgs ? msgsActiveColor : th.textMuted }} />
                </div>
                {unreadCount > 0 && !isMsgs && (
                  <div
                    data-testid="badge-unread-messages"
                    style={{
                      position: "absolute", top: -4, right: -4,
                      minWidth: 18, height: 18, borderRadius: 999,
                      background: "#e84040",
                      color: "white", fontSize: 13, fontWeight: 800,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      padding: "0 3px",
                      boxShadow: "0 0 0 2px rgba(2,8,20,1)",
                      lineHeight: 1,
                    }}
                  >
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </div>
                )}
              </div>
              <span style={{ color: isMsgs ? msgsActiveColor : th.textMuted, fontSize: 11, letterSpacing: 1.0 }}>
                {t.messages}
              </span>
            </a>
          </Link>
        ) : <div />}

        {/* UMOWA */}
        {isEnabled("agreements") ? (
          <Link href="/agreements">
            <a
              data-testid="nav-agreements"
              style={{
                display: "grid", justifyItems: "center", gap: 4,
                cursor: "pointer", textDecoration: "none",
                fontSize: 15, fontWeight: 800, letterSpacing: 1.2,
              }}
            >
              <div style={{
                width: 36, height: 36, borderRadius: 12,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: isAgree ? `${th.tabAgreements}1e` : "transparent",
                boxShadow: isAgree
                  ? `0 0 14px ${th.tabAgreements}38, inset 0 1px 0 rgba(255,255,255,0.07)`
                  : "none",
                transition: "all 0.2s",
              }}>
                <FileText size={19} style={{ color: isAgree ? agreeActiveColor : th.textMuted }} />
              </div>
              <span style={{ color: isAgree ? agreeActiveColor : th.textMuted, fontSize: 11, letterSpacing: 1.0 }}>
                {t.agreements}
              </span>
            </a>
          </Link>
        ) : <div />}

      </nav>
    </div>
  );
}
