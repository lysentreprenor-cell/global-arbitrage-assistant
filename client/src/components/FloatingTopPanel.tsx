import { useLocation } from "wouter";
import { MessageSquare, Bell } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useAppStore } from "@/lib/store";
import { useLang } from "@/context/LanguageContext";
import { useFeatures } from "@/hooks/useFeatures";
import { useNotificationBadge } from "@/context/NotificationBadgeContext";
import { useHomeOverview } from "@/hooks/useHomeOverview";
import { type FeatureKey } from "@/lib/features";
import { Avatar, IconButton, Row, Text } from "@/design/primitives";
import { chrome, control, layer, space, transition } from "@/design/tokens";

/**
 * ── App header ────────────────────────────────────────────────────────────
 *
 * Identity on the left, unread state on the right, nothing in between.
 *
 * It sits ON the canvas rather than in a floating pill: a header that hovers
 * over content adds a second visual plane the eye has to resolve on every
 * scroll. Here the canvas simply continues, with a hairline once the content
 * passes underneath.
 */
export function FloatingTopPanel() {
  const [, setLocation] = useLocation();
  const { th } = useTheme();
  const { user } = useAppStore();
  const { t } = useLang();
  const { isEnabled } = useFeatures();
  const { unreadCount: notifBadgeCount } = useNotificationBadge();
  const homeOverview = useHomeOverview();
  const unreadMessages = homeOverview.inbox.unreadMessages;

  const buttons = (
    [
      {
        icon: <MessageSquare size={control.iconMd} />,
        label: t.messages,
        onClick: () => setLocation("/messages"),
        badge: unreadMessages,
        testId: "btn-messages",
        feature: "messages" as FeatureKey,
      },
      {
        icon: <Bell size={control.iconMd} />,
        label: t.notifications,
        onClick: () => setLocation("/notifications"),
        badge: notifBadgeCount,
        testId: "btn-notifications",
        feature: "notifications" as FeatureKey,
      },
    ] as const
  ).filter(btn => isEnabled(btn.feature));

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: layer.header,
        height: chrome.headerHeight,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: space.md,
        // Matches the canvas exactly, so sticky chrome reads as "the page",
        // not as a floating slab.
        background: th.canvas,
        borderBottom: `1px solid transparent`,
        transition: transition.theme,
      }}
    >
      <div
        data-testid="header-profile"
        role="button"
        tabIndex={0}
        onClick={() => setLocation("/profile")}
        onKeyDown={e => { if (e.key === "Enter") setLocation("/profile"); }}
        style={{ display: "flex", alignItems: "center", gap: space.md, minWidth: 0, flex: 1, cursor: "pointer" }}
      >
        <Avatar name={user?.name} size={38} />
        <div style={{ minWidth: 0 }}>
          <Text variant="micro" tone="tertiary" as="div" style={{ textTransform: "uppercase", letterSpacing: 0.8, fontSize: 10, fontWeight: 700 }}>
            {t.privateClient}
          </Text>
          <Text
            variant="bodyStrong"
            as="div"
            style={{ marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
          >
            {user?.name || "—"}
          </Text>
        </div>
      </div>

      <Row gap={space.sm}>
        {buttons.map(btn => (
          <IconButton
            key={btn.testId}
            testId={btn.testId}
            icon={btn.icon}
            label={btn.label}
            onClick={btn.onClick}
            badge={btn.badge}
            size={40}
          />
        ))}
      </Row>
    </header>
  );
}
