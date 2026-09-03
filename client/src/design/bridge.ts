/**
 * ══════════════════════════════════════════════════════════════════════════
 *  MERIDIAN — Legacy bridge
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  Forty-plus screens were written against the old ad-hoc `th.*` object.
 *  Rather than freeze the redesign behind a forty-screen rewrite, this file
 *  re-derives that exact object from the Meridian palette, so every screen
 *  inherits the new surfaces, lines, accent and semantics on the next render
 *  without touching a single one of them.
 *
 *  The old keys are kept, but their VALUES now obey the system:
 *   · gradients flattened to luminance steps
 *   · glows removed (kept as near-zero so old `boxShadow` strings still parse)
 *   · every "accent" key resolved to the theme's ONE accent
 *
 *  New code should read the semantic fields at the bottom of `DashTheme`
 *  (`accent`, `surface`, `positive`, …) or use `design/primitives`.
 *  The deprecated block above them is closed for new usage.
 */

import { Palette, alpha } from "./themes";
import { elevation, radius } from "./tokens";

export interface DashTheme {
  /* ── deprecated: kept so pre-Meridian screens keep rendering ────────── */
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
  primaryBtnColor: string;
  primaryBtnShadow: string;
  secondaryBtnBg: string;
  secondaryBtnBorder: string;
  secondaryBtnColor: string;
  activeTileBg: string;
  activeTileBorder: string;
  activeTileGlow: string;
  activeTileColor: string;
  navFade: string;
  tabCards: string;
  tabMessages: string;
  tabAgreements: string;

  /* ── Meridian semantics: use these ──────────────────────────────────── */
  canvas: string;
  surface: string;
  surfaceRaised: string;
  surfaceSunken: string;
  overlay: string;
  scrim: string;
  line: string;
  lineStrong: string;
  lineAccent: string;
  accent: string;
  accentHover: string;
  accentPressed: string;
  accentSubtle: string;
  accentSubtleStrong: string;
  textOnAccent: string;
  textTertiary: string;
  textDisabled: string;
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
  series: readonly string[];
  tint: string;
  radius: typeof radius;
  elevation: typeof elevation;
}

export function toDashTheme(p: Palette): DashTheme {
  return {
    /* ── deprecated keys, re-derived ─────────────────────────────────── */
    // A canvas is a canvas: a 4% vertical lift at the top, nothing more.
    pageBg: `linear-gradient(180deg, ${p.canvasTop} 0%, ${p.canvas} 42%, ${p.canvas} 100%)`,
    cardBg: p.surface,
    cardAltBg: p.surfaceRaised,
    txRowBg: p.surfaceSunken,
    textPrimary: p.textPrimary,
    textSecondary: p.textSecondary,
    textMuted: p.textTertiary,
    border: p.line,
    borderMuted: p.line,
    iconBtnBg: p.surfaceRaised,
    iconBtnBorder: p.line,
    // Ambient washes: present, but at a strength you notice only when gone.
    ambient1: p.tint,
    ambient2: "rgba(0,0,0,0)",
    ambient3: "rgba(0,0,0,0)",
    sectionBorder: p.line,
    sheenTop: "rgba(255,255,255,0.04)",
    navBg: p.overlay,
    navBorder: p.lineStrong,
    navGlint: "rgba(255,255,255,0.06)",
    balanceGlow: false,
    labelColor: p.textSecondary,
    subLabelColor: p.textTertiary,
    primary: p.accent,
    // A 2-stop gradient with a 6% delta: enough to seat a button, not to shine.
    primaryGradient: `linear-gradient(180deg, ${p.accentHover} 0%, ${p.accent} 100%)`,
    glow: alpha(p.accent, 0.16),
    glowStrong: alpha(p.accent, 0.24),
    navActiveBg: p.accentSubtleStrong,
    navActiveGlow: "none",
    topPanelBg: p.overlay,
    topPanelBorder: p.line,
    topPanelGlow: elevation.medium,
    orbBg: p.accent,
    orbShadow: `${elevation.high}, 0 0 0 1px ${p.lineAccent}`,
    orbColor: p.textOnAccent,
    primaryBtnColor: p.textOnAccent,
    primaryBtnShadow: elevation.low,
    secondaryBtnBg: "transparent",
    secondaryBtnBorder: p.lineStrong,
    secondaryBtnColor: p.textPrimary,
    activeTileBg: p.accentSubtle,
    activeTileBorder: p.lineAccent,
    activeTileGlow: elevation.low,
    activeTileColor: p.accent,
    navFade: p.canvas,
    // One accent for every active tab. Per-tab colours were decoration
    // pretending to be information.
    tabCards: p.accent,
    tabMessages: p.accent,
    tabAgreements: p.accent,

    /* ── semantics ───────────────────────────────────────────────────── */
    canvas: p.canvas,
    surface: p.surface,
    surfaceRaised: p.surfaceRaised,
    surfaceSunken: p.surfaceSunken,
    overlay: p.overlay,
    scrim: p.scrim,
    line: p.line,
    lineStrong: p.lineStrong,
    lineAccent: p.lineAccent,
    accent: p.accent,
    accentHover: p.accentHover,
    accentPressed: p.accentPressed,
    accentSubtle: p.accentSubtle,
    accentSubtleStrong: p.accentSubtleStrong,
    textOnAccent: p.textOnAccent,
    textTertiary: p.textTertiary,
    textDisabled: p.textDisabled,
    positive: p.positive,
    positiveSubtle: p.positiveSubtle,
    negative: p.negative,
    negativeSubtle: p.negativeSubtle,
    warning: p.warning,
    warningSubtle: p.warningSubtle,
    info: p.info,
    infoSubtle: p.infoSubtle,
    danger: p.danger,
    dangerSubtle: p.dangerSubtle,
    series: p.series,
    tint: p.tint,
    radius,
    elevation,
  };
}
