export const luxuryTheme = {
  colors: {
    pageTop: "rgba(14,42,92,0.9)",
    pageMid: "rgba(6,17,42,1)",
    pageBottom: "rgba(2,8,20,1)",

    phoneFrameTop: "rgba(52,74,112,0.48)",
    phoneFrameMid: "rgba(17,30,60,0.96)",
    phoneFrameBottom: "rgba(8,15,30,1)",

    screenTop: "rgba(7,23,56,1)",
    screenMid: "rgba(5,15,35,1)",
    screenBottom: "rgba(3,11,24,1)",

    cardTop: "rgba(28,45,83,0.98)",
    cardBottom: "rgba(16,28,54,0.98)",

    secondaryCardTop: "rgba(21,36,68,0.96)",
    secondaryCardBottom: "rgba(11,23,46,0.98)",

    glass: "rgba(255,255,255,0.06)",
    glassBorder: "rgba(255,255,255,0.09)",

    text: "#ffffff",
    muted: "rgba(255,255,255,0.72)",
    gold: "#f7dc8b",
    goldDark: "#cf9a35",
    goldText: "#f0d27b",
    green: "#24d487",
    pink: "#ff5f97",
    blue: "#a9bcff",
    chipPinkText: "#ffd6f0",
    chipPinkA: "rgba(132,13,63,0.96)",
    chipPinkB: "rgba(232,30,114,0.96)",
  },
  radius: {
    phone: 42,
    screen: 32,
    xl: 30,
    lg: 28,
    md: 20,
    pill: 999,
  },
  shadows: {
    frame:
      "0 40px 120px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.12), 0 0 0 1px rgba(255,255,255,0.06)",
    card:
      "0 22px 60px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.06)",
    goldButton:
      "0 18px 34px rgba(220,171,66,0.26), inset 0 1px 0 rgba(255,255,255,0.5)",
    goldCenter:
      "0 14px 36px rgba(219,178,74,0.34), inset 0 1px 0 rgba(255,255,255,0.55)",
  },
} as const;

export type LuxuryAccent = "gold" | "pink" | "green" | "blue";

export const luxuryAccentColor: Record<LuxuryAccent, string> = {
  gold: luxuryTheme.colors.goldText,
  pink: luxuryTheme.colors.pink,
  green: "#41d390",
  blue: luxuryTheme.colors.blue,
};

export const luxuryGradients = {
  page: `radial-gradient(circle at 50% 0%, ${luxuryTheme.colors.pageTop} 0%, ${luxuryTheme.colors.pageMid} 35%, ${luxuryTheme.colors.pageBottom} 100%)`,
  phoneFrame: `linear-gradient(180deg, ${luxuryTheme.colors.phoneFrameTop} 0%, ${luxuryTheme.colors.phoneFrameMid} 14%, ${luxuryTheme.colors.phoneFrameBottom} 100%)`,
  screen: `linear-gradient(180deg, ${luxuryTheme.colors.screenTop} 0%, ${luxuryTheme.colors.screenMid} 35%, ${luxuryTheme.colors.screenBottom} 100%)`,
  primaryCard: `linear-gradient(180deg, ${luxuryTheme.colors.cardTop} 0%, ${luxuryTheme.colors.cardBottom} 100%)`,
  secondaryCard: `linear-gradient(180deg, ${luxuryTheme.colors.secondaryCardTop} 0%, ${luxuryTheme.colors.secondaryCardBottom} 100%)`,
  pinkBadge: `linear-gradient(135deg, ${luxuryTheme.colors.chipPinkA} 0%, ${luxuryTheme.colors.chipPinkB} 100%)`,
  goldButton: "linear-gradient(180deg, rgba(248,228,164,1) 0%, rgba(215,164,63,1) 100%)",
  goldCenter: "radial-gradient(circle at 35% 30%, #fff1b8 0%, #f2d57f 36%, #cf9a35 100%)",
};
