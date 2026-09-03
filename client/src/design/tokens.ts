/**
 * ══════════════════════════════════════════════════════════════════════════
 *  MERIDIAN DESIGN SYSTEM — Primitive tokens
 *  Finlys · v1.0
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  These are the *primitives*: raw, context-free values. They are never used
 *  directly in a screen. Screens consume the SEMANTIC tokens exported from
 *  `themes.ts`, which are assembled from the primitives below.
 *
 *      primitive  →  semantic  →  component  →  screen
 *      (this file)   (themes)     (primitives.tsx)
 *
 *  Rules of the system (see design/README.md for the full rationale):
 *   1. Everything sits on a 4pt grid. No arbitrary pixel values.
 *   2. Depth is expressed with luminance steps first, shadow second.
 *      Never with glow. Glow reads as "casino", not as "bank".
 *   3. Colour carries meaning. Green = money in, red = money out,
 *      amber = pending, accent = the one action we want you to take.
 *      A colour that means nothing is not allowed on screen.
 *   4. Money is typeset, not decorated: tabular figures, high contrast,
 *      never gradient-filled, never blurred.
 */

/* ─────────────────────────────────────────────────────────────────────────
   SPACE — 4pt grid
   ───────────────────────────────────────────────────────────────────────── */
export const space = {
  /** 2  — hairline nudges, icon optical alignment */
  xxs: 2,
  /** 4  — inside a chip */
  xs: 4,
  /** 8  — between tightly related items (icon ↔ label) */
  sm: 8,
  /** 12 — between rows inside a card */
  md: 12,
  /** 16 — card padding (compact), between cards */
  lg: 16,
  /** 20 — card padding (default), screen gutter */
  xl: 20,
  /** 24 — between content groups */
  xxl: 24,
  /** 32 — between sections */
  xxxl: 32,
  /** 48 — above a screen-level footer / after a hero */
  huge: 48,
} as const;

/** The single horizontal gutter of every screen. Never overridden. */
export const GUTTER = space.xl;

/* ─────────────────────────────────────────────────────────────────────────
   RADIUS — one ramp, used consistently by nesting level
   ───────────────────────────────────────────────────────────────────────── */
export const radius = {
  /** 8  — chips, badges, small inputs */
  xs: 8,
  /** 12 — icon tiles, list-row thumbnails */
  sm: 12,
  /** 16 — inputs, nested cards, buttons (rectangular) */
  md: 16,
  /** 20 — standard card */
  lg: 20,
  /** 28 — hero card, bottom sheets */
  xl: 28,
  /** fully round — pills, avatars, FAB */
  pill: 999,
} as const;

/* ─────────────────────────────────────────────────────────────────────────
   TYPE — one ramp. Hierarchy comes from size + weight + colour, never
   from decoration. Money uses tabular figures so digits never jitter.
   ───────────────────────────────────────────────────────────────────────── */
export const font = {
  /** UI text — geometric grotesk, friendly but neutral */
  sans: "'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  /** Numerals, balances and display — engineered, slightly technical */
  display: "'Sora', 'Outfit', -apple-system, BlinkMacSystemFont, sans-serif",
  /** Account numbers, IBANs, codes */
  mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
} as const;

export type TypeStyle = {
  fontFamily?: string;
  fontSize: number;
  lineHeight: number;
  fontWeight: number;
  letterSpacing: number;
  textTransform?: "uppercase";
  fontVariantNumeric?: string;
};

export const type: Record<
  | "balance"
  | "display"
  | "title"
  | "heading"
  | "subheading"
  | "body"
  | "bodyStrong"
  | "secondary"
  | "caption"
  | "label"
  | "micro"
  | "amount"
  | "amountSm",
  TypeStyle
> = {
  /** The one number the screen exists for. */
  balance: {
    fontFamily: font.display,
    fontSize: 38,
    lineHeight: 1.05,
    fontWeight: 700,
    letterSpacing: -1.2,
    fontVariantNumeric: "tabular-nums",
  },
  display: {
    fontFamily: font.display,
    fontSize: 28,
    lineHeight: 1.15,
    fontWeight: 700,
    letterSpacing: -0.7,
  },
  /** Screen title */
  title: {
    fontFamily: font.display,
    fontSize: 22,
    lineHeight: 1.2,
    fontWeight: 650,
    letterSpacing: -0.4,
  },
  /** Card title */
  heading: {
    fontSize: 17,
    lineHeight: 1.3,
    fontWeight: 650,
    letterSpacing: -0.2,
  },
  subheading: {
    fontSize: 15,
    lineHeight: 1.35,
    fontWeight: 600,
    letterSpacing: -0.1,
  },
  body: {
    fontSize: 15,
    lineHeight: 1.5,
    fontWeight: 450,
    letterSpacing: 0,
  },
  bodyStrong: {
    fontSize: 15,
    lineHeight: 1.5,
    fontWeight: 600,
    letterSpacing: 0,
  },
  secondary: {
    fontSize: 14,
    lineHeight: 1.45,
    fontWeight: 450,
    letterSpacing: 0,
  },
  caption: {
    fontSize: 13,
    lineHeight: 1.4,
    fontWeight: 500,
    letterSpacing: 0,
  },
  /** Section eyebrow. Quiet, spaced, never shouty. */
  label: {
    fontSize: 11,
    lineHeight: 1.2,
    fontWeight: 700,
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  micro: {
    fontSize: 12,
    lineHeight: 1.3,
    fontWeight: 500,
    letterSpacing: 0.1,
  },
  /** Money in a list row */
  amount: {
    fontFamily: font.display,
    fontSize: 16,
    lineHeight: 1.2,
    fontWeight: 600,
    letterSpacing: -0.3,
    fontVariantNumeric: "tabular-nums",
  },
  amountSm: {
    fontFamily: font.display,
    fontSize: 14,
    lineHeight: 1.2,
    fontWeight: 600,
    letterSpacing: -0.2,
    fontVariantNumeric: "tabular-nums",
  },
};

/* ─────────────────────────────────────────────────────────────────────────
   ELEVATION — four steps, shadow only. Depth must survive a screenshot
   printed in greyscale, so luminance does the work and shadow only seats
   the surface.
   ───────────────────────────────────────────────────────────────────────── */
export const elevation = {
  /** flush with the canvas */
  flat: "none",
  /** resting card */
  low: "0 1px 2px rgba(0,0,0,0.28), 0 4px 12px -6px rgba(0,0,0,0.36)",
  /** hero card, sticky chrome */
  medium: "0 2px 6px rgba(0,0,0,0.30), 0 12px 28px -14px rgba(0,0,0,0.55)",
  /** floating action, popovers */
  high: "0 4px 10px rgba(0,0,0,0.32), 0 20px 44px -20px rgba(0,0,0,0.62)",
  /** sheets and dialogs */
  overlay: "0 -8px 40px -12px rgba(0,0,0,0.65)",
} as const;

/* ─────────────────────────────────────────────────────────────────────────
   MOTION — three durations, two curves. Anything slower than 320ms in a
   money app reads as lag; anything bouncier than this reads as a toy.
   ───────────────────────────────────────────────────────────────────────── */
export const motion = {
  duration: {
    /** state change on press */
    instant: 120,
    /** the default */
    fast: 180,
    /** entering content, sheets */
    normal: 260,
    /** theme cross-fade only */
    slow: 400,
  },
  easing: {
    /** enter / exit — decelerating, calm */
    standard: "cubic-bezier(0.2, 0, 0, 1)",
    /** press feedback */
    exit: "cubic-bezier(0.4, 0, 1, 1)",
  },
} as const;

/** Standard transition string for interactive surfaces. */
export const transition = {
  press: `transform ${motion.duration.instant}ms ${motion.easing.exit}`,
  color: `background-color ${motion.duration.fast}ms linear, border-color ${motion.duration.fast}ms linear, color ${motion.duration.fast}ms linear`,
  theme: `background ${motion.duration.slow}ms linear, border-color ${motion.duration.slow}ms linear`,
} as const;

/* ─────────────────────────────────────────────────────────────────────────
   LAYERS — one z-index scale so nothing ever fights
   ───────────────────────────────────────────────────────────────────────── */
export const layer = {
  base: 0,
  raised: 1,
  sticky: 40,
  nav: 50,
  header: 60,
  sheet: 900,
  modal: 1000,
  toast: 1100,
  splash: 9999,
} as const;

/* ─────────────────────────────────────────────────────────────────────────
   CONTROLS — touch targets. 44px is the floor, everywhere, no exceptions.
   ───────────────────────────────────────────────────────────────────────── */
export const control = {
  heightSm: 40,
  heightMd: 48,
  heightLg: 54,
  /** WCAG / HIG minimum tap target */
  minTouch: 44,
  iconSm: 16,
  iconMd: 18,
  iconLg: 22,
} as const;

/** Chrome geometry shared by the shell (nav, header, safe areas). */
export const chrome = {
  headerHeight: 60,
  navHeight: 68,
  /** distance from the bottom of the nav pill to the screen edge */
  navInset: 18,
} as const;
