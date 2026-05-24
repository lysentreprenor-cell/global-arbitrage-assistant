import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { StorageKeys } from "@/lib/localStore";

export type ThemeName = "black-gold" | "ice-silver" | "emerald-gold" | "royal-violet";

const LEGACY_MAP: Record<string, ThemeName> = {
  "obsidian-gold":    "black-gold",
  "arctic-platinum":  "ice-silver",
  "graphite-emerald": "emerald-gold",
};

function resolveTheme(raw: string | null): ThemeName {
  if (!raw) return "black-gold";
  if (raw in LEGACY_MAP) return LEGACY_MAP[raw];
  const valid: ThemeName[] = ["black-gold", "ice-silver", "emerald-gold", "royal-violet"];
  return valid.includes(raw as ThemeName) ? (raw as ThemeName) : "black-gold";
}

export interface DashTheme {
  pageBg: string;
  cardBg: string;
  cardAltBg: string;
  txRowBg: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  borderMuted: string;
  iconBtnBg: string;
  iconBtnBorder: string;
  ambient1: string;
  ambient2: string;
  ambient3: string;
  sectionBorder: string;
  sheenTop: string;
  navBg: string;
  navBorder: string;
  navGlint: string;
  balanceGlow: boolean;
  labelColor: string;
  subLabelColor: string;
  /* new premium tokens */
  primary: string;
  primaryGradient: string;
  glow: string;
  glowStrong: string;
  navActiveBg: string;
  navActiveGlow: string;
  topPanelBg: string;
  topPanelBorder: string;
  topPanelGlow: string;
  orbBg: string;
  orbShadow: string;
  orbColor: string;
  /* hero CTA button */
  primaryBtnColor: string;
  primaryBtnShadow: string;
  /* secondary outline button */
  secondaryBtnBg: string;
  secondaryBtnBorder: string;
  secondaryBtnColor: string;
  /* wallet active tile */
  activeTileBg: string;
  activeTileBorder: string;
  activeTileGlow: string;
  activeTileColor: string;
  /* bottom nav outer fade + per-tab accent colors */
  navFade: string;
  tabCards: string;
  tabMessages: string;
  tabAgreements: string;
}

const THEMES: Record<ThemeName, DashTheme> = {
  "black-gold": {
    pageBg:          "linear-gradient(180deg, #040e24 0%, #020b18 50%, #010508 100%)",
    cardBg:          "linear-gradient(160deg, rgba(24,40,88,0.92) 0%, rgba(14,24,56,0.96) 50%, rgba(8,14,32,0.99) 100%)",
    cardAltBg:       "linear-gradient(160deg, rgba(20,34,72,0.94) 0%, rgba(10,18,44,0.97) 100%)",
    txRowBg:         "linear-gradient(160deg, rgba(28,44,88,0.60) 0%, rgba(12,20,48,0.78) 100%)",
    textPrimary:     "#ffffff",
    textSecondary:   "rgba(255,255,255,0.60)",
    textMuted:       "rgba(255,255,255,0.38)",
    border:          "rgba(247,210,72,0.14)",
    borderMuted:     "rgba(255,255,255,0.07)",
    iconBtnBg:       "rgba(255,255,255,0.06)",
    iconBtnBorder:   "rgba(247,210,72,0.20)",
    ambient1:        "rgba(40,90,200,0.40)",
    ambient2:        "rgba(90,40,160,0.22)",
    ambient3:        "rgba(210,168,50,0.20)",
    sectionBorder:   "rgba(255,255,255,0.07)",
    sheenTop:        "rgba(255,255,255,0.07)",
    navBg:           "linear-gradient(180deg, rgba(18,30,70,0.98) 0%, rgba(6,12,28,1) 100%)",
    navBorder:       "rgba(247,210,72,0.20)",
    navGlint:        "rgba(247,220,120,0.28)",
    balanceGlow:     true,
    labelColor:      "rgba(255,255,255,0.75)",
    subLabelColor:   "rgba(255,255,255,0.42)",
    primary:         "#f7dc8b",
    primaryGradient: "linear-gradient(180deg, #fff4b8 0%, #f9d95e 22%, #d4a020 62%, #b8880a 100%)",
    glow:            "rgba(247,210,72,0.28)",
    glowStrong:      "rgba(247,210,72,0.50)",
    navActiveBg:     "rgba(168,85,247,0.15)",
    navActiveGlow:   "0 0 14px rgba(168,85,247,0.38), inset 0 1px 0 rgba(255,255,255,0.07)",
    topPanelBg:      "linear-gradient(160deg, rgba(20,36,80,0.92) 0%, rgba(10,18,44,0.96) 100%)",
    topPanelBorder:  "rgba(247,210,72,0.22)",
    topPanelGlow:    "0 8px 32px rgba(0,0,0,0.60), 0 2px 0 rgba(255,255,255,0.06), inset 0 1px 0 rgba(247,220,100,0.12), 0 0 40px rgba(247,180,20,0.08)",
    orbBg:           "radial-gradient(circle at 35% 28%, #fff6c0 0%, #f7d84a 28%, #c48a06 65%, #8a5e00 100%)",
    orbShadow:       "inset 0 2px 4px rgba(255,255,220,0.60), inset 0 -3px 6px rgba(0,0,0,0.28), 0 3px 0 rgba(120,80,0,0.90), 0 10px 28px rgba(200,148,20,0.55), 0 0 0 1px rgba(255,220,80,0.24)",
    orbColor:        "#1a1400",
    primaryBtnColor: "#1a1400",
    primaryBtnShadow: "inset 0 1.5px 0 rgba(255,255,240,0.80), inset 0 -2px 0 rgba(0,0,0,0.22), 0 3px 0 rgba(140,90,4,0.90), 0 8px 20px rgba(210,158,20,0.55)",
    secondaryBtnBg:   "rgba(247,220,100,0.05)",
    secondaryBtnBorder: "rgba(238,203,100,0.62)",
    secondaryBtnColor:  "#e8d080",
    activeTileBg:    "rgba(247,210,72,0.08)",
    activeTileBorder: "rgba(247,210,72,0.55)",
    activeTileGlow:  "0 0 0 1px rgba(247,210,72,0.20), 0 8px 24px rgba(0,0,0,0.35)",
    activeTileColor: "#f7d248",
    navFade:         "rgba(2,6,16,1)",
    tabCards:        "#a855f7",
    tabMessages:     "#a855f7",
    tabAgreements:   "#a855f7",
  },
  "ice-silver": {
    pageBg:          "linear-gradient(180deg, #050c18 0%, #030810 50%, #010408 100%)",
    cardBg:          "linear-gradient(160deg, rgba(20,32,64,0.90) 0%, rgba(12,20,48,0.95) 50%, rgba(6,12,30,0.99) 100%)",
    cardAltBg:       "linear-gradient(160deg, rgba(18,28,58,0.92) 0%, rgba(8,16,40,0.97) 100%)",
    txRowBg:         "linear-gradient(160deg, rgba(22,34,68,0.58) 0%, rgba(10,18,44,0.76) 100%)",
    textPrimary:     "#f0f6ff",
    textSecondary:   "rgba(220,236,255,0.62)",
    textMuted:       "rgba(180,210,255,0.40)",
    border:          "rgba(180,210,255,0.16)",
    borderMuted:     "rgba(180,210,255,0.08)",
    iconBtnBg:       "rgba(180,210,255,0.07)",
    iconBtnBorder:   "rgba(180,210,255,0.22)",
    ambient1:        "rgba(60,110,220,0.32)",
    ambient2:        "rgba(100,140,240,0.18)",
    ambient3:        "rgba(160,200,255,0.14)",
    sectionBorder:   "rgba(180,210,255,0.08)",
    sheenTop:        "rgba(200,224,255,0.12)",
    navBg:           "linear-gradient(180deg, rgba(16,26,58,0.98) 0%, rgba(6,10,26,1) 100%)",
    navBorder:       "rgba(180,210,255,0.22)",
    navGlint:        "rgba(200,224,255,0.32)",
    balanceGlow:     true,
    labelColor:      "rgba(220,236,255,0.76)",
    subLabelColor:   "rgba(180,210,255,0.44)",
    primary:         "#c4d8f8",
    primaryGradient: "linear-gradient(180deg, #eaf4ff 0%, #c8e0f8 22%, #86aadc 62%, #5880b8 100%)",
    glow:            "rgba(180,210,255,0.24)",
    glowStrong:      "rgba(180,210,255,0.46)",
    navActiveBg:     "rgba(180,210,255,0.12)",
    navActiveGlow:   "0 0 16px rgba(180,210,255,0.22), inset 0 1px 0 rgba(200,224,255,0.10)",
    topPanelBg:      "linear-gradient(160deg, rgba(18,30,66,0.92) 0%, rgba(8,16,42,0.96) 100%)",
    topPanelBorder:  "rgba(180,210,255,0.24)",
    topPanelGlow:    "0 8px 32px rgba(0,0,0,0.62), 0 2px 0 rgba(255,255,255,0.05), inset 0 1px 0 rgba(200,224,255,0.14), 0 0 40px rgba(140,190,255,0.06)",
    orbBg:           "radial-gradient(circle at 35% 28%, #f0f8ff 0%, #c8dff8 28%, #7aaad8 65%, #4878c0 100%)",
    orbShadow:       "inset 0 2px 4px rgba(240,248,255,0.60), inset 0 -3px 6px rgba(0,0,0,0.28), 0 3px 0 rgba(60,100,180,0.90), 0 10px 28px rgba(100,160,240,0.55), 0 0 0 1px rgba(180,220,255,0.24)",
    orbColor:        "#0a1828",
    primaryBtnColor: "#0a1828",
    primaryBtnShadow: "inset 0 1.5px 0 rgba(240,248,255,0.80), inset 0 -2px 0 rgba(0,0,0,0.22), 0 3px 0 rgba(60,100,180,0.90), 0 8px 20px rgba(100,160,240,0.55)",
    secondaryBtnBg:   "rgba(180,210,255,0.05)",
    secondaryBtnBorder: "rgba(180,210,255,0.55)",
    secondaryBtnColor:  "#c4d8f8",
    activeTileBg:    "rgba(180,210,255,0.08)",
    activeTileBorder: "rgba(180,210,255,0.55)",
    activeTileGlow:  "0 0 0 1px rgba(180,210,255,0.20), 0 8px 24px rgba(0,0,0,0.35)",
    activeTileColor: "#c4d8f8",
    navFade:         "rgba(2,5,14,1)",
    tabCards:        "#88c8ff",
    tabMessages:     "#78eac8",
    tabAgreements:   "#c0b0ff",
  },
  "emerald-gold": {
    pageBg:          "linear-gradient(180deg, #020e08 0%, #010a04 50%, #010602 100%)",
    cardBg:          "linear-gradient(160deg, rgba(8,32,18,0.92) 0%, rgba(4,20,10,0.96) 50%, rgba(2,12,6,0.99) 100%)",
    cardAltBg:       "linear-gradient(160deg, rgba(6,28,16,0.94) 0%, rgba(2,16,8,0.97) 100%)",
    txRowBg:         "linear-gradient(160deg, rgba(10,36,20,0.60) 0%, rgba(4,18,10,0.78) 100%)",
    textPrimary:     "#f0fff8",
    textSecondary:   "rgba(200,255,220,0.60)",
    textMuted:       "rgba(160,240,190,0.38)",
    border:          "rgba(36,200,100,0.18)",
    borderMuted:     "rgba(36,200,100,0.09)",
    iconBtnBg:       "rgba(36,200,100,0.07)",
    iconBtnBorder:   "rgba(36,200,100,0.22)",
    ambient1:        "rgba(20,160,70,0.32)",
    ambient2:        "rgba(36,200,100,0.18)",
    ambient3:        "rgba(210,168,50,0.20)",
    sectionBorder:   "rgba(36,200,100,0.08)",
    sheenTop:        "rgba(100,255,160,0.08)",
    navBg:           "linear-gradient(180deg, rgba(6,24,14,0.98) 0%, rgba(2,10,6,1) 100%)",
    navBorder:       "rgba(36,200,100,0.22)",
    navGlint:        "rgba(100,240,160,0.28)",
    balanceGlow:     true,
    labelColor:      "rgba(200,255,220,0.76)",
    subLabelColor:   "rgba(160,240,190,0.44)",
    primary:         "#f7dc8b",
    primaryGradient: "linear-gradient(180deg, #fff4b8 0%, #f9d95e 22%, #d4a020 62%, #b8880a 100%)",
    glow:            "rgba(36,200,100,0.28)",
    glowStrong:      "rgba(36,200,100,0.50)",
    navActiveBg:     "rgba(36,200,100,0.12)",
    navActiveGlow:   "0 0 16px rgba(36,200,100,0.24), inset 0 1px 0 rgba(100,255,160,0.10)",
    topPanelBg:      "linear-gradient(160deg, rgba(8,28,16,0.92) 0%, rgba(2,16,8,0.96) 100%)",
    topPanelBorder:  "rgba(36,200,100,0.24)",
    topPanelGlow:    "0 8px 32px rgba(0,0,0,0.62), 0 2px 0 rgba(255,255,255,0.04), inset 0 1px 0 rgba(100,255,160,0.10), 0 0 40px rgba(20,160,60,0.08)",
    orbBg:           "radial-gradient(circle at 35% 28%, #fff6c0 0%, #f7d84a 28%, #c48a06 65%, #8a5e00 100%)",
    orbShadow:       "inset 0 2px 4px rgba(255,255,220,0.60), inset 0 -3px 6px rgba(0,0,0,0.28), 0 3px 0 rgba(120,80,0,0.90), 0 10px 28px rgba(200,148,20,0.55), 0 0 0 1px rgba(255,220,80,0.24)",
    orbColor:        "#0a1400",
    primaryBtnColor: "#0a1400",
    primaryBtnShadow: "inset 0 1.5px 0 rgba(255,255,220,0.80), inset 0 -2px 0 rgba(0,0,0,0.22), 0 3px 0 rgba(80,140,10,0.90), 0 8px 20px rgba(160,220,20,0.45)",
    secondaryBtnBg:   "rgba(36,200,100,0.05)",
    secondaryBtnBorder: "rgba(36,200,100,0.60)",
    secondaryBtnColor:  "#24d487",
    activeTileBg:    "rgba(36,200,100,0.08)",
    activeTileBorder: "rgba(36,200,100,0.55)",
    activeTileGlow:  "0 0 0 1px rgba(36,200,100,0.20), 0 8px 24px rgba(0,0,0,0.35)",
    activeTileColor: "#3ddda0",
    navFade:         "rgba(1,6,3,1)",
    tabCards:        "#ff80b0",
    tabMessages:     "#5aeaa0",
    tabAgreements:   "#f7dc8b",
  },
  "royal-violet": {
    pageBg:          "linear-gradient(180deg, #08041a 0%, #050210 50%, #020108 100%)",
    cardBg:          "linear-gradient(160deg, rgba(32,12,80,0.88) 0%, rgba(18,6,50,0.94) 50%, rgba(10,2,28,0.99) 100%)",
    cardAltBg:       "linear-gradient(160deg, rgba(28,8,68,0.92) 0%, rgba(14,4,40,0.97) 100%)",
    txRowBg:         "linear-gradient(160deg, rgba(36,12,84,0.60) 0%, rgba(16,4,46,0.78) 100%)",
    textPrimary:     "#faf0ff",
    textSecondary:   "rgba(240,210,255,0.62)",
    textMuted:       "rgba(200,160,255,0.40)",
    border:          "rgba(168,80,255,0.18)",
    borderMuted:     "rgba(168,80,255,0.09)",
    iconBtnBg:       "rgba(168,80,255,0.07)",
    iconBtnBorder:   "rgba(168,80,255,0.24)",
    ambient1:        "rgba(120,40,240,0.38)",
    ambient2:        "rgba(200,80,255,0.20)",
    ambient3:        "rgba(80,20,200,0.22)",
    sectionBorder:   "rgba(168,80,255,0.09)",
    sheenTop:        "rgba(200,140,255,0.10)",
    navBg:           "linear-gradient(180deg, rgba(24,8,60,0.98) 0%, rgba(8,2,22,1) 100%)",
    navBorder:       "rgba(168,80,255,0.24)",
    navGlint:        "rgba(200,140,255,0.30)",
    balanceGlow:     true,
    labelColor:      "rgba(240,210,255,0.76)",
    subLabelColor:   "rgba(200,160,255,0.44)",
    primary:         "#c07cff",
    primaryGradient: "linear-gradient(180deg, #f0d8ff 0%, #d0a0ff 22%, #9040e0 62%, #6020c0 100%)",
    glow:            "rgba(168,80,255,0.32)",
    glowStrong:      "rgba(168,80,255,0.55)",
    navActiveBg:     "rgba(168,80,255,0.14)",
    navActiveGlow:   "0 0 16px rgba(168,80,255,0.28), inset 0 1px 0 rgba(200,140,255,0.12)",
    topPanelBg:      "linear-gradient(160deg, rgba(28,8,70,0.92) 0%, rgba(14,4,40,0.96) 100%)",
    topPanelBorder:  "rgba(168,80,255,0.26)",
    topPanelGlow:    "0 8px 32px rgba(0,0,0,0.64), 0 2px 0 rgba(255,255,255,0.05), inset 0 1px 0 rgba(200,140,255,0.14), 0 0 40px rgba(120,40,240,0.10)",
    orbBg:           "radial-gradient(circle at 35% 28%, #f8d0ff 0%, #d080ff 28%, #9030d0 65%, #6010a0 100%)",
    orbShadow:       "inset 0 2px 4px rgba(248,220,255,0.60), inset 0 -3px 6px rgba(0,0,0,0.28), 0 3px 0 rgba(80,20,160,0.90), 0 10px 28px rgba(160,60,240,0.55), 0 0 0 1px rgba(200,120,255,0.24)",
    orbColor:        "#180828",
    primaryBtnColor: "#180828",
    primaryBtnShadow: "inset 0 1.5px 0 rgba(240,220,255,0.80), inset 0 -2px 0 rgba(0,0,0,0.22), 0 3px 0 rgba(80,20,160,0.90), 0 8px 20px rgba(160,60,240,0.55)",
    secondaryBtnBg:   "rgba(168,80,255,0.05)",
    secondaryBtnBorder: "rgba(168,80,255,0.60)",
    secondaryBtnColor:  "#c07cff",
    activeTileBg:    "rgba(168,80,255,0.08)",
    activeTileBorder: "rgba(168,80,255,0.55)",
    activeTileGlow:  "0 0 0 1px rgba(168,80,255,0.20), 0 8px 24px rgba(0,0,0,0.35)",
    activeTileColor: "#c07cff",
    navFade:         "rgba(5,2,14,1)",
    tabCards:        "#ff80c0",
    tabMessages:     "#80e0c0",
    tabAgreements:   "#c07cff",
  },
};

interface ThemeContextValue {
  theme: ThemeName;
  th: DashTheme;
  setTheme: (t: ThemeName) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "black-gold",
  th: THEMES["black-gold"],
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>(() => {
    return resolveTheme(localStorage.getItem(StorageKeys.THEME));
  });

  const setTheme = (t: ThemeName) => {
    const resolved = resolveTheme(t);
    setThemeState(resolved);
    localStorage.setItem(StorageKeys.THEME, resolved);
  };

  useEffect(() => {
    document.body.classList.remove(
      "theme-ice-silver", "theme-emerald-gold", "theme-royal-violet",
      "theme-arctic-platinum", "theme-graphite-emerald",
    );
    if (theme === "ice-silver")   document.body.classList.add("theme-ice-silver");
    if (theme === "emerald-gold") document.body.classList.add("theme-emerald-gold");
    if (theme === "royal-violet") document.body.classList.add("theme-royal-violet");
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, th: THEMES[theme], setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

export { THEMES };
