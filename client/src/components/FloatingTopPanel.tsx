import { useLocation } from "wouter";
import { MessageSquare, Bell } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useAppStore } from "@/lib/store";
import { useLang } from "@/context/LanguageContext";
import { useFeatures } from "@/hooks/useFeatures";
import { useNotificationBadge } from "@/context/NotificationBadgeContext";
import { useHomeOverview } from "@/hooks/useHomeOverview";
import { type FeatureKey } from "@/lib/features";

export function FloatingTopPanel() {
  const [, setLocation] = useLocation();
  const { th } = useTheme();
  const { user } = useAppStore();
  const { t } = useLang();
  const { isEnabled } = useFeatures();
  const { unreadCount: notifBadgeCount } = useNotificationBadge();
  const homeOverview = useHomeOverview();
  const unreadMessages = homeOverview.inbox.unreadMessages;

  return (
    <div style={{
      position: "fixed",
      top: 0,
      left: "50%",
      transform: "translateX(-50%)",
      width: "calc(100% - 40px)",
      maxWidth: 408,
      paddingTop: "max(12px, env(safe-area-inset-top))",
      zIndex: 60,
      pointerEvents: "none",
    }}>
      <nav style={{
        width: "100%",
        borderRadius: 999,
        padding: "10px 14px 10px 12px",
        background: th.topPanelBg,
        border: `1px solid ${th.topPanelBorder}`,
        boxShadow: th.topPanelGlow,
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        pointerEvents: "auto",
        position: "relative",
        overflow: "hidden",
        transition: "background 0.5s ease, border-color 0.5s ease",
      }}>
        {/* top glint line */}
        <div style={{
          position: "absolute", top: 0, left: "15%", right: "15%", height: 1,
          background: `linear-gradient(90deg, transparent, ${th.navGlint}, transparent)`,
          pointerEvents: "none",
        }} />

        {/* Left: avatar + name */}
        <div
          data-testid="header-profile"
          style={{
            display: "flex", alignItems: "center", gap: 10,
            minWidth: 0, cursor: "pointer", flex: 1,
          }}
          onClick={() => setLocation("/profile")}
        >
          {/* Avatar */}
          <div style={{ position: "relative", flexShrink: 0 }}>
            <div style={{
              position: "absolute", inset: -4, borderRadius: "50%",
              boxShadow: `0 0 0 1px ${th.topPanelBorder}, 0 0 16px ${th.glow}`,
              pointerEvents: "none",
            }} />
            <div style={{
              width: 40, height: 40, borderRadius: "50%", position: "relative",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 17, fontWeight: 800, color: th.primary,
              background: "radial-gradient(circle at 32% 26%, rgba(140,200,240,0.42) 0%, rgba(37,95,120,1) 20%, rgba(14,33,58,1) 54%, rgba(6,12,26,1) 100%)",
              boxShadow: "0 4px 16px rgba(0,0,0,0.60), inset 0 2px 4px rgba(255,255,255,0.18), inset 0 -2px 6px rgba(0,0,0,0.40)",
            }}>
              {(user?.name?.charAt(0) || "A").toUpperCase()}
              <div style={{
                position: "absolute", top: 7, left: 9, width: 5, height: 5, borderRadius: "50%",
                background: "rgba(255,255,255,0.40)", filter: "blur(1.5px)", pointerEvents: "none",
              }} />
            </div>
          </div>

          {/* Name info */}
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontSize: 10, fontWeight: 800, letterSpacing: 2.8,
              color: th.textSecondary, lineHeight: 1.2,
              textTransform: "uppercase",
            }}>
              {t.privateClient}
            </div>
            <div style={{
              marginTop: 2, fontSize: 14, fontWeight: 600, color: th.textPrimary,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>
              {user?.name || "Alexander Client"}
            </div>
          </div>
        </div>

        {/* Right: icon buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {([
            {
              icon: <MessageSquare size={15} />,
              onClick: () => setLocation("/messages"),
              badge: unreadMessages,
              testId: "btn-messages",
              feature: "messages" as FeatureKey,
            },
            {
              icon: <Bell size={15} />,
              onClick: () => setLocation("/notifications"),
              badge: notifBadgeCount,
              testId: "btn-notifications",
              feature: "notifications" as FeatureKey,
            },
          ] as const).filter(btn => isEnabled(btn.feature)).map(btn => (
            <button
              key={btn.testId}
              data-testid={btn.testId}
              onClick={btn.onClick}
              style={{
                width: 36, height: 36, borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: th.textSecondary, background: th.iconBtnBg,
                border: `1px solid ${th.iconBtnBorder}`,
                cursor: "pointer", position: "relative", overflow: "hidden",
                boxShadow: "0 2px 10px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.08)",
                flexShrink: 0,
                transition: "background 0.2s",
              }}
            >
              <div style={{
                position: "absolute", top: 0, left: "15%", right: "15%", height: "40%",
                background: `linear-gradient(180deg, ${th.sheenTop} 0%, transparent 100%)`,
                borderRadius: "0 0 50% 50%", pointerEvents: "none",
              }} />
              {btn.icon}
              {btn.badge > 0 && (
                <span style={{
                  position: "absolute", top: 5, right: 5, width: 8, height: 8, borderRadius: "50%",
                  background: "radial-gradient(circle at 35% 30%, #fff5b0, #f0c030)",
                  boxShadow: `0 0 6px ${th.glowStrong}`,
                  border: "1.5px solid rgba(20,10,0,0.4)",
                }} />
              )}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
