import React, { ReactNode } from "react";
import {
  luxuryAccentColor,
  luxuryGradients,
  luxuryTheme,
  type LuxuryAccent,
} from "../../theme/luxuryTheme";

export type LuxuryQuickAction = {
  key: string;
  icon: ReactNode;
  label: string;
  accent?: LuxuryAccent;
};

export type LuxuryBottomNavItem = {
  key: string;
  icon: ReactNode;
  label: string;
  active?: boolean;
};

type LuxuryAppShellProps = {
  initials?: string;
  overline?: string;
  clientName?: string;
  heroLabel?: string;
  heroValue?: string;
  heroBadge?: string;
  cashFlowLabel?: string;
  cashFlowValue?: string;
  cashFlowDelta?: string;
  leftHeaderAction?: ReactNode;
  rightHeaderAction?: ReactNode;
  quickActions?: LuxuryQuickAction[];
  bottomLeftItem?: LuxuryBottomNavItem;
  bottomRightItem?: LuxuryBottomNavItem;
  centerActionIcon?: ReactNode;
  primaryButtonLabel?: string;
  secondaryButtonLabel?: string;
  children?: ReactNode;
};

const defaultQuickActions: LuxuryQuickAction[] = [
  { key: "forecast", icon: "✦", label: "FORECAST", accent: "pink" },
  { key: "request", icon: "↙", label: "REQUEST", accent: "pink" },
  { key: "invest", icon: "+", label: "INVEST", accent: "green" },
  { key: "cards", icon: "⋯", label: "CARDS", accent: "blue" },
];

const defaultBottomLeft: LuxuryBottomNavItem = {
  key: "home",
  icon: "⌂",
  label: "HOME",
  active: true,
};

const defaultBottomRight: LuxuryBottomNavItem = {
  key: "cards",
  icon: "▭",
  label: "CARDS",
  active: false,
};

function QuickActionTile({ item }: { item: LuxuryQuickAction }) {
  return (
    <div
      style={{
        display: "grid",
        justifyItems: "center",
        gap: 10,
      }}
    >
      <div
        style={{
          width: "100%",
          aspectRatio: "1 / 1",
          borderRadius: luxuryTheme.radius.md,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(255,255,255,0.05)",
          border: `1px solid ${luxuryTheme.colors.glassBorder}`,
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
          fontSize: 26,
          color: luxuryAccentColor[item.accent ?? "gold"],
        }}
      >
        {item.icon}
      </div>

      <div
        style={{
          fontSize: 11,
          letterSpacing: 1.2,
          color: "rgba(255,255,255,0.88)",
          textAlign: "center",
        }}
      >
        {item.label}
      </div>
    </div>
  );
}

function BottomItem({ item }: { item: LuxuryBottomNavItem }) {
  return (
    <div
      style={{
        display: "grid",
        justifyItems: "center",
        gap: 6,
        fontSize: 11,
        letterSpacing: 1.2,
        color: item.active ? luxuryTheme.colors.goldText : "rgba(255,255,255,0.82)",
      }}
    >
      <div
        style={{
          fontSize: 20,
          color: item.active ? luxuryTheme.colors.goldText : luxuryTheme.colors.pink,
        }}
      >
        {item.icon}
      </div>
      <div>{item.label}</div>
    </div>
  );
}

export default function LuxuryAppShell({
  initials = "A",
  overline = "PRIVATE CLIENT",
  clientName = "Alexander Client",
  heroLabel = "TOTAL WEALTH",
  heroValue = "$125,000.00",
  heroBadge = "PLATINUM",
  cashFlowLabel = "CASH FLOW",
  cashFlowValue = "+$2,450.00",
  cashFlowDelta = "0.22%",
  leftHeaderAction = "💬",
  rightHeaderAction = "🔔",
  quickActions = defaultQuickActions,
  bottomLeftItem = defaultBottomLeft,
  bottomRightItem = defaultBottomRight,
  centerActionIcon = "⇄",
  primaryButtonLabel = "＋ Add Funds",
  secondaryButtonLabel = "↗ Transfer",
  children,
}: LuxuryAppShellProps) {
  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: luxuryGradients.page,
        overflow: "hidden",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: -120,
          left: -80,
          width: 320,
          height: 320,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(36,85,173,0.34) 0%, rgba(36,85,173,0) 72%)",
          filter: "blur(8px)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: -100,
          right: -80,
          width: 300,
          height: 300,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(205,160,62,0.16) 0%, rgba(205,160,62,0) 72%)",
          filter: "blur(10px)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "relative",
          width: 390,
          maxWidth: "100%",
          borderRadius: luxuryTheme.radius.phone,
          padding: 12,
          background: luxuryGradients.phoneFrame,
          boxShadow: luxuryTheme.shadows.frame,
          border: `1px solid ${luxuryTheme.colors.glassBorder}`,
        }}
      >
        <div
          style={{
            position: "relative",
            minHeight: 820,
            borderRadius: luxuryTheme.radius.screen,
            overflow: "hidden",
            padding: 22,
            background: luxuryGradients.screen,
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 10,
              left: "50%",
              transform: "translateX(-50%)",
              width: 112,
              height: 30,
              borderRadius: 999,
              background: "rgba(0,0,0,0.62)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)",
            }}
          />

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              marginTop: 20,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                minWidth: 0,
              }}
            >
              <div
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 28,
                  fontWeight: 700,
                  color: luxuryTheme.colors.gold,
                  background:
                    "radial-gradient(circle at 35% 30%, rgba(37,95,120,1) 0%, rgba(14,33,58,1) 65%, rgba(7,14,29,1) 100%)",
                  boxShadow:
                    "0 0 0 2px rgba(248,221,134,0.1), 0 0 20px rgba(245,211,115,0.32), inset 0 0 0 1px rgba(255,255,255,0.16)",
                }}
              >
                {initials}
              </div>

              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: 3,
                    color: "rgba(255,255,255,0.88)",
                  }}
                >
                  {overline}
                </div>

                <div
                  style={{
                    marginTop: 6,
                    fontSize: 19,
                    fontWeight: 500,
                    color: luxuryTheme.colors.text,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {clientName}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
              {[leftHeaderAction, rightHeaderAction].map((action, index) => (
                <div
                  key={index}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 18,
                    color: "#eef4ff",
                    background: luxuryTheme.colors.glass,
                    border: `1px solid ${luxuryTheme.colors.glassBorder}`,
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
                  }}
                >
                  {action}
                </div>
              ))}
            </div>
          </div>

          <div
            style={{
              marginTop: 26,
              borderRadius: luxuryTheme.radius.xl,
              padding: 24,
              background: luxuryGradients.primaryCard,
              border: `1px solid rgba(255,255,255,0.11)`,
              boxShadow: luxuryTheme.shadows.card,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: 3.2,
                  color: "#ead28b",
                }}
              >
                {heroLabel}
              </div>

              <div
                style={{
                  borderRadius: 999,
                  padding: "8px 16px",
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: 1.2,
                  color: luxuryTheme.colors.chipPinkText,
                  background: luxuryGradients.pinkBadge,
                  boxShadow: "0 10px 26px rgba(226,30,113,0.3)",
                }}
              >
                {heroBadge}
              </div>
            </div>

            <div
              style={{
                marginTop: 28,
                fontSize: 36,
                lineHeight: 1.05,
                fontWeight: 700,
                color: luxuryTheme.colors.gold,
                textShadow: "0 0 18px rgba(247,220,139,0.14)",
              }}
            >
              {heroValue}
            </div>

            <div
              style={{
                marginTop: 26,
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 14,
              }}
            >
              <button
                style={{
                  height: 60,
                  borderRadius: 999,
                  border: "none",
                  outline: "none",
                  cursor: "pointer",
                  fontSize: 16,
                  fontWeight: 700,
                  color: "#1b2232",
                  background: luxuryGradients.goldButton,
                  boxShadow: luxuryTheme.shadows.goldButton,
                }}
              >
                {primaryButtonLabel}
              </button>

              <button
                style={{
                  height: 60,
                  borderRadius: 999,
                  outline: "none",
                  cursor: "pointer",
                  fontSize: 16,
                  fontWeight: 700,
                  color: luxuryTheme.colors.text,
                  background: "transparent",
                  border: `1px solid rgba(238,203,112,0.78)`,
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
                }}
              >
                {secondaryButtonLabel}
              </button>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 14,
              marginTop: 28,
            }}
          >
            {quickActions.map((item) => (
              <QuickActionTile key={item.key} item={item} />
            ))}
          </div>

          {children ? (
            <div
              style={{
                marginTop: 24,
                borderRadius: luxuryTheme.radius.lg,
                padding: 18,
                background: luxuryGradients.secondaryCard,
                border: `1px solid rgba(255,255,255,0.09)`,
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
              }}
            >
              {children}
            </div>
          ) : null}

          <div
            style={{
              marginTop: 24,
              borderRadius: luxuryTheme.radius.lg,
              padding: 22,
              background: luxuryGradients.secondaryCard,
              border: `1px solid rgba(255,255,255,0.09)`,
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
            }}
          >
            <div
              style={{
                fontSize: 14,
                letterSpacing: 3,
                color: luxuryTheme.colors.muted,
              }}
            >
              {cashFlowLabel}
            </div>

            <div
              style={{
                marginTop: 10,
                display: "flex",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 700,
                  color: luxuryTheme.colors.green,
                  textShadow: "0 0 10px rgba(36,212,135,0.1)",
                }}
              >
                {cashFlowValue}
              </div>

              <div
                style={{
                  padding: "4px 10px",
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#7df0ba",
                  background: "rgba(35,183,118,0.14)",
                  border: "1px solid rgba(80,225,155,0.18)",
                }}
              >
                {cashFlowDelta}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 18, display: "flex", justifyContent: "center" }}>
            <div
              style={{
                width: "100%",
                borderRadius: 999,
                padding: "14px 18px",
                background:
                  "linear-gradient(180deg, rgba(14,29,61,0.96) 0%, rgba(8,18,38,1) 100%)",
                border: `1px solid rgba(255,255,255,0.1)`,
                display: "grid",
                gridTemplateColumns: "1fr auto 1fr",
                alignItems: "center",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-evenly", alignItems: "center" }}>
                <BottomItem item={bottomLeftItem} />
              </div>

              <div
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 28,
                  color: "#1a2536",
                  background: luxuryGradients.goldCenter,
                  boxShadow: luxuryTheme.shadows.goldCenter,
                  border: "1px solid rgba(255,255,255,0.18)",
                }}
              >
                {centerActionIcon}
              </div>

              <div style={{ display: "flex", justifyContent: "space-evenly", alignItems: "center" }}>
                <BottomItem item={bottomRightItem} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
