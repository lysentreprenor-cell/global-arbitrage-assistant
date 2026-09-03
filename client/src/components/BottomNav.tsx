import { Link, useLocation } from "wouter";
import { Home, CreditCard, MessageSquare, FileText, ArrowUpRight } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useTheme } from "@/context/ThemeContext";
import { useLang } from "@/context/LanguageContext";
import { useFeatures } from "@/hooks/useFeatures";
import { useMessageBadge } from "@/context/MessageBadgeContext";
import { chrome, control, elevation, radius, space, transition } from "@/design/tokens";

/**
 * ── Primary navigation ────────────────────────────────────────────────────
 *
 * Four destinations plus one action. Four is deliberate: five-plus tab bars
 * push people into a "where was that again?" loop, and every extra tab makes
 * the send action — the thing they actually opened the app for — smaller.
 *
 * The send control is raised and accent-filled because it is the only
 * irreversible action in the bar; everything else is navigation and stays
 * quiet. Active state is carried by BOTH colour and a top marker, so it does
 * not depend on colour vision.
 */

const HIDDEN_ON = new Set([
  "/auth", "/transfer", "/transfer/new", "/wallet/top-up", "/agreements/new",
  "/split", "/recurring", "/savings", "/kyc", "/referral",
]);

export function BottomNav() {
  const [location] = useLocation();
  const { user } = useAppStore();
  const { th } = useTheme();
  const { t } = useLang();
  const { isEnabled } = useFeatures();
  const { unreadCount } = useMessageBadge();

  if (!user || HIDDEN_ON.has(location) || location.startsWith("/messages/")) return null;

  const items = [
    { id: "home", href: "/", icon: Home, label: t.home, feature: "dashboard", testId: "nav-home", active: location === "/" },
    { id: "cards", href: "/cards", icon: CreditCard, label: t.cards, feature: "cards", testId: "nav-cards", active: location === "/cards" },
    { id: "messages", href: "/messages", icon: MessageSquare, label: t.messages, feature: "messages", testId: "nav-messages", active: location === "/messages", badge: unreadCount },
    { id: "agreements", href: "/agreements", icon: FileText, label: t.agreements, feature: "agreements", testId: "nav-agreements", active: location.startsWith("/agreements") },
  ] as const;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: "50%",
        transform: "translateX(-50%)",
        width: "100%",
        maxWidth: 448,
        padding: `0 ${space.lg}px calc(${chrome.navInset}px + env(safe-area-inset-bottom))`,
        // A fade, not a bar: content scrolls out of legibility before it
        // reaches the nav, so the nav never needs a hard edge.
        background: `linear-gradient(to top, ${th.canvas} 62%, transparent 100%)`,
        zIndex: 50,
        pointerEvents: "none",
      }}
    >
      <nav
        aria-label="Primary"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr auto 1fr 1fr",
          alignItems: "center",
          gap: space.xs,
          height: chrome.navHeight,
          padding: `0 ${space.sm}px`,
          borderRadius: radius.xl,
          background: th.overlay,
          border: `1px solid ${th.line}`,
          boxShadow: elevation.high,
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          pointerEvents: "auto",
          transition: transition.theme,
        }}
      >
        {items.slice(0, 2).map(item => (
          <NavItem key={item.id} {...item} />
        ))}

        {/* The one action in the bar. */}
        {isEnabled("transfer") ? (
          <Link href="/transfer">
            <a
              data-testid="nav-transfer"
              aria-label={t.send ?? "Send"}
              style={{
                width: 52,
                height: 52,
                borderRadius: radius.pill,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: th.accent,
                color: th.textOnAccent,
                boxShadow: elevation.medium,
                textDecoration: "none",
                transition: `${transition.color}, ${transition.press}`,
              }}
              onPointerDown={e => { e.currentTarget.style.transform = "scale(0.94)"; }}
              onPointerUp={e => { e.currentTarget.style.transform = "scale(1)"; }}
              onPointerLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}
            >
              <ArrowUpRight size={22} strokeWidth={2.4} />
            </a>
          </Link>
        ) : (
          <div style={{ width: 52 }} />
        )}

        {items.slice(2).map(item => (
          <NavItem key={item.id} {...item} />
        ))}
      </nav>
    </div>
  );
}

function NavItem({
  href,
  icon: Icon,
  label,
  feature,
  testId,
  active,
  badge,
}: {
  href: string;
  icon: typeof Home;
  label: string;
  feature: string;
  testId: string;
  active: boolean;
  badge?: number;
}) {
  const { th } = useTheme();
  const { isEnabled } = useFeatures();

  if (!isEnabled(feature as never)) return <div />;

  return (
    <Link href={href}>
      <a
        data-testid={testId}
        aria-current={active ? "page" : undefined}
        style={{
          display: "grid",
          justifyItems: "center",
          gap: 3,
          minHeight: control.minTouch,
          alignContent: "center",
          textDecoration: "none",
          position: "relative",
          color: active ? th.accent : th.textTertiary,
          transition: transition.color,
        }}
      >
        {/* Redundant, non-colour active marker. */}
        <span
          style={{
            position: "absolute",
            top: -1,
            width: 16,
            height: 2,
            borderRadius: 2,
            background: active ? th.accent : "transparent",
            transition: transition.color,
          }}
        />
        <span style={{ position: "relative", display: "flex" }}>
          <Icon size={20} strokeWidth={active ? 2.2 : 1.8} />
          {badge !== undefined && badge > 0 && !active && (
            <span
              data-testid="badge-unread-messages"
              style={{
                position: "absolute",
                top: -5,
                right: -7,
                minWidth: 16,
                height: 16,
                padding: "0 4px",
                borderRadius: radius.pill,
                background: th.danger,
                color: "#fff",
                fontSize: 10,
                fontWeight: 700,
                lineHeight: "16px",
                textAlign: "center",
                border: `2px solid ${th.overlay}`,
              }}
            >
              {badge > 99 ? "99+" : badge}
            </span>
          )}
        </span>
        <span style={{ fontSize: 11, fontWeight: active ? 600 : 500, letterSpacing: 0.1 }}>{label}</span>
      </a>
    </Link>
  );
}
