/**
 * ══════════════════════════════════════════════════════════════════════════
 *  MERIDIAN DESIGN SYSTEM — Semantic tokens & themes
 *  Finlys · v1.0
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  Four themes, ONE structure. Each theme is the same system rotated to a
 *  different hue — that is what makes the product read as designed rather
 *  than assembled. A new theme means filling in this exact shape; it never
 *  means inventing new roles.
 *
 *  ── Why it looks the way it does (money-app psychology) ─────────────────
 *
 *  · CANVAS is ink, not black. Pure #000 with neon on top is the visual
 *    language of crypto casinos; a deep desaturated ink with quiet surfaces
 *    is the language of a private bank at night. Trust is calm.
 *
 *  · ONE ACCENT per theme, spent sparingly. If three things glow, nothing
 *    is important and the user has to decide what matters — decision cost
 *    is exactly what a finance app must remove (Hick's law).
 *
 *  · SEMANTIC COLOUR IS RESERVED. Green only ever means money arriving,
 *    red only ever means money leaving or danger. Never decoration. This is
 *    what lets a user read a balance in half a second without parsing it.
 *
 *  · NEGATIVE AMOUNTS ARE NOT ALARMS. Spending is normal; a screaming red
 *    on every coffee purchase trains anxiety and then blindness. Outflow is
 *    a muted terracotta, danger is a distinctly stronger red.
 *
 *  · NO GLOW ON NUMBERS. Legibility is the trust signal. Balances are solid,
 *    high-contrast, tabular — never gradient-clipped, never blurred.
 */

import { elevation } from "./tokens";

/* ─────────────────────────────────────────────────────────────────────────
   The shape every theme must fill
   ───────────────────────────────────────────────────────────────────────── */
export interface Palette {
  /** brand + UI identity */
  name: string;
  /** short human label shown in Preferences */
  label: string;
  /** what this theme is for, one line, no marketing */
  description: string;

  /* ── surfaces: a luminance ladder, darkest → lightest ── */
  canvas: string;
  canvasTop: string;
  surface: string;
  surfaceRaised: string;
  surfaceSunken: string;
  overlay: string;
  scrim: string;

  /* ── lines ── */
  line: string;
  lineStrong: string;
  lineAccent: string;

  /* ── text ── */
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  textDisabled: string;
  textOnAccent: string;

  /* ── the single accent ── */
  accent: string;
  accentHover: string;
  accentPressed: string;
  accentSubtle: string;
  accentSubtleStrong: string;

  /* ── semantics: fixed meaning across all themes ── */
  positive: string;
  positiveSubtle: string;
  negative: string;
  negativeSubtle: string;
  warning: string;
  warningSubtle: string;
  info: string;
  infoSubtle: string;
  danger: string;
  dangerSubtle: string;

  /* ── data-visualisation ramp: ordered, colour-blind safe ── */
  series: [string, string, string, string, string];

  /** barely-there hue wash behind the hero. 4% max. */
  tint: string;
}

/* ─────────────────────────────────────────────────────────────────────────
   Shared semantics — identical in every theme on purpose.
   A user who learns "green = in" must never have to relearn it.
   ───────────────────────────────────────────────────────────────────────── */
const SEMANTIC = {
  positive: "#3DBE86",
  positiveSubtle: "rgba(61,190,134,0.12)",
  negative: "#D98A72",
  negativeSubtle: "rgba(217,138,114,0.12)",
  warning: "#E2A93F",
  warningSubtle: "rgba(226,169,63,0.13)",
  info: "#6BA5DE",
  infoSubtle: "rgba(107,165,222,0.12)",
  danger: "#E05B54",
  dangerSubtle: "rgba(224,91,84,0.13)",
} as const;

const SERIES: Palette["series"] = ["#6BA5DE", "#3DBE86", "#C9A24B", "#9A8CE8", "#D98A72"];

/* ─────────────────────────────────────────────────────────────────────────
   THEMES
   ───────────────────────────────────────────────────────────────────────── */
export type ThemeId = "black-gold" | "ice-silver" | "emerald-gold" | "royal-violet";

export const PALETTES: Record<ThemeId, Palette> = {
  /* ── 1 · MERIDIAN INK — the default. Ink navy, brass accent. ───────── */
  "black-gold": {
    name: "Meridian Ink",
    label: "Ink & Brass",
    description: "Deep ink with a brass accent. The default: quiet, warm, built for reading numbers at night.",

    canvas: "#0A0D13",
    canvasTop: "#0D1119",
    surface: "#12171F",
    surfaceRaised: "#171D27",
    surfaceSunken: "#0C1017",
    overlay: "#141922",
    scrim: "rgba(5,7,11,0.72)",

    line: "rgba(233,240,250,0.08)",
    lineStrong: "rgba(233,240,250,0.15)",
    lineAccent: "rgba(201,162,75,0.32)",

    textPrimary: "#EEF2F8",
    textSecondary: "rgba(232,239,248,0.68)",
    textTertiary: "rgba(232,239,248,0.46)",
    textDisabled: "rgba(232,239,248,0.28)",
    textOnAccent: "#17130A",

    accent: "#C9A24B",
    accentHover: "#DAB463",
    accentPressed: "#AE8A38",
    accentSubtle: "rgba(201,162,75,0.10)",
    accentSubtleStrong: "rgba(201,162,75,0.18)",

    ...SEMANTIC,
    series: SERIES,
    tint: "rgba(201,162,75,0.05)",
  },

  /* ── 2 · NORDIC FROST — cold slate, steel-blue accent. ─────────────── */
  "ice-silver": {
    name: "Nordic Frost",
    label: "Frost & Steel",
    description: "Cold slate with a steel-blue accent. Highest clarity, lowest warmth — for long working sessions.",

    canvas: "#090C11",
    canvasTop: "#0C1118",
    surface: "#111721",
    surfaceRaised: "#161E2A",
    surfaceSunken: "#0B0F15",
    overlay: "#131A24",
    scrim: "rgba(4,6,10,0.72)",

    line: "rgba(220,235,255,0.09)",
    lineStrong: "rgba(220,235,255,0.16)",
    lineAccent: "rgba(122,168,224,0.34)",

    textPrimary: "#EDF3FA",
    textSecondary: "rgba(226,238,252,0.68)",
    textTertiary: "rgba(226,238,252,0.46)",
    textDisabled: "rgba(226,238,252,0.28)",
    textOnAccent: "#08131F",

    accent: "#7AA8E0",
    accentHover: "#93BAEC",
    accentPressed: "#638FC6",
    accentSubtle: "rgba(122,168,224,0.10)",
    accentSubtleStrong: "rgba(122,168,224,0.18)",

    ...SEMANTIC,
    series: SERIES,
    tint: "rgba(122,168,224,0.055)",
  },

  /* ── 3 · VAULT GREEN — deep pine, emerald accent. ──────────────────── */
  "emerald-gold": {
    name: "Vault Green",
    label: "Pine & Emerald",
    description: "Deep pine with an emerald accent. Growth-forward, for people who watch a portfolio more than a balance.",

    canvas: "#070D0A",
    canvasTop: "#0A1310",
    surface: "#0E1815",
    surfaceRaised: "#12201B",
    surfaceSunken: "#08110D",
    overlay: "#101B17",
    scrim: "rgba(3,8,6,0.74)",

    line: "rgba(224,248,236,0.08)",
    lineStrong: "rgba(224,248,236,0.15)",
    lineAccent: "rgba(61,190,134,0.32)",

    textPrimary: "#ECF6F1",
    textSecondary: "rgba(226,246,238,0.68)",
    textTertiary: "rgba(226,246,238,0.46)",
    textDisabled: "rgba(226,246,238,0.28)",
    textOnAccent: "#03150D",

    accent: "#3DBE86",
    accentHover: "#57D09B",
    accentPressed: "#2FA070",
    accentSubtle: "rgba(61,190,134,0.10)",
    accentSubtleStrong: "rgba(61,190,134,0.18)",

    ...SEMANTIC,
    series: ["#3DBE86", "#6BA5DE", "#C9A24B", "#9A8CE8", "#D98A72"],
    tint: "rgba(61,190,134,0.05)",
  },

  /* ── 4 · MIDNIGHT INDIGO — violet-ink, periwinkle accent. ──────────── */
  "royal-violet": {
    name: "Midnight Indigo",
    label: "Indigo & Iris",
    description: "Violet ink with an iris accent. The most expressive of the four, still built on the same grid.",

    canvas: "#0A0912",
    canvasTop: "#0E0C18",
    surface: "#14121F",
    surfaceRaised: "#191627",
    surfaceSunken: "#0C0B14",
    overlay: "#171423",
    scrim: "rgba(6,5,12,0.74)",

    line: "rgba(233,230,255,0.09)",
    lineStrong: "rgba(233,230,255,0.16)",
    lineAccent: "rgba(154,140,232,0.34)",

    textPrimary: "#F0EEF9",
    textSecondary: "rgba(234,231,250,0.68)",
    textTertiary: "rgba(234,231,250,0.46)",
    textDisabled: "rgba(234,231,250,0.28)",
    textOnAccent: "#0D0A1C",

    accent: "#9A8CE8",
    accentHover: "#B0A4F0",
    accentPressed: "#7F71CE",
    accentSubtle: "rgba(154,140,232,0.10)",
    accentSubtleStrong: "rgba(154,140,232,0.18)",

    ...SEMANTIC,
    series: ["#9A8CE8", "#6BA5DE", "#3DBE86", "#C9A24B", "#D98A72"],
    tint: "rgba(154,140,232,0.055)",
  },
};

export const THEME_IDS = Object.keys(PALETTES) as ThemeId[];

/* ─────────────────────────────────────────────────────────────────────────
   CSS custom properties
   Published so plain CSS / Tailwind utilities and the shadcn layer can read
   the same values the React components use. Single source of truth.
   ───────────────────────────────────────────────────────────────────────── */
export function paletteToCssVars(p: Palette): Record<string, string> {
  return {
    "--md-canvas": p.canvas,
    "--md-canvas-top": p.canvasTop,
    "--md-surface": p.surface,
    "--md-surface-raised": p.surfaceRaised,
    "--md-surface-sunken": p.surfaceSunken,
    "--md-overlay": p.overlay,
    "--md-scrim": p.scrim,
    "--md-line": p.line,
    "--md-line-strong": p.lineStrong,
    "--md-line-accent": p.lineAccent,
    "--md-text": p.textPrimary,
    "--md-text-secondary": p.textSecondary,
    "--md-text-tertiary": p.textTertiary,
    "--md-text-disabled": p.textDisabled,
    "--md-text-on-accent": p.textOnAccent,
    "--md-accent": p.accent,
    "--md-accent-hover": p.accentHover,
    "--md-accent-pressed": p.accentPressed,
    "--md-accent-subtle": p.accentSubtle,
    "--md-accent-subtle-strong": p.accentSubtleStrong,
    "--md-positive": p.positive,
    "--md-negative": p.negative,
    "--md-warning": p.warning,
    "--md-info": p.info,
    "--md-danger": p.danger,
    "--md-tint": p.tint,
    "--md-elevation-low": elevation.low,
    "--md-elevation-medium": elevation.medium,
    "--md-elevation-high": elevation.high,
  };
}

/**
 * The shadcn/Tailwind layer expects bare `H S% L%` triplets. We derive them
 * from the same palette so a Tailwind `bg-card` and a Meridian `<Card>` can
 * never drift apart.
 */
export function paletteToShadcnVars(p: Palette): Record<string, string> {
  return {
    "--background": hslTriplet(p.canvas),
    "--foreground": hslTriplet(p.textPrimary),
    "--card": hslTriplet(p.surface),
    "--card-foreground": hslTriplet(p.textPrimary),
    "--popover": hslTriplet(p.overlay),
    "--popover-foreground": hslTriplet(p.textPrimary),
    "--primary": hslTriplet(p.accent),
    "--primary-foreground": hslTriplet(p.textOnAccent),
    "--secondary": hslTriplet(p.surfaceRaised),
    "--secondary-foreground": hslTriplet(p.textPrimary),
    "--muted": hslTriplet(p.surfaceRaised),
    "--muted-foreground": hslTriplet(mix(p.textPrimary, p.surface, 0.45)),
    "--accent": hslTriplet(p.surfaceRaised),
    "--accent-foreground": hslTriplet(p.textPrimary),
    "--destructive": hslTriplet(p.danger),
    "--destructive-foreground": hslTriplet(p.textPrimary),
    "--border": hslTriplet(mix(p.textPrimary, p.surface, 0.14)),
    "--input": hslTriplet(mix(p.textPrimary, p.surface, 0.14)),
    "--ring": hslTriplet(p.accent),
    "--success": hslTriplet(p.positive),
    "--online": hslTriplet(p.positive),
    "--warning": hslTriplet(p.warning),
    "--highlight": hslTriplet(p.series[3]),
    "--alert": hslTriplet(p.negative),
    "--favorite": hslTriplet(p.accent),
  };
}

/* ── tiny colour utilities (hex only; the palette is authored in hex) ───── */

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/** `#12171F` → `"218 26% 10%"` — the triplet form Tailwind's hsl() wrapper needs. */
export function hslTriplet(hex: string): string {
  const [r255, g255, b255] = parseHex(hex);
  const r = r255 / 255, g = g255 / 255, b = b255 / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/** Linear blend of two hex colours. `t` = share of `a`. */
export function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = parseHex(a);
  const [br, bg, bb] = parseHex(b);
  const to = (x: number) => Math.round(x).toString(16).padStart(2, "0");
  return `#${to(ar * t + br * (1 - t))}${to(ag * t + bg * (1 - t))}${to(ab * t + bb * (1 - t))}`;
}

/** Hex → `rgba()` with an explicit alpha. Used for state layers. */
export function alpha(hex: string, a: number): string {
  const [r, g, b] = parseHex(hex);
  return `rgba(${r},${g},${b},${a})`;
}
