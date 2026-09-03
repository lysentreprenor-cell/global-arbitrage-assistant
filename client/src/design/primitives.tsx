/**
 * ══════════════════════════════════════════════════════════════════════════
 *  MERIDIAN DESIGN SYSTEM — Component primitives
 *  Finlys · v1.0
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  Every screen is assembled from these. If a screen needs something these
 *  do not offer, the fix is to add a variant here — not a one-off style in
 *  the screen. That single rule is the difference between an app that looks
 *  designed and an app that looks accumulated.
 *
 *  Inventory
 *  ─────────
 *   Layout      Screen · Section · Stack · Row · Divider
 *   Surface     Card · Tile · ListRow
 *   Text        Text · Eyebrow · Amount · Delta
 *   Action      Button · IconButton · Chip · SegmentedControl
 *   Feedback    Badge · Meter · EmptyState · Skeleton · Sheet
 */

import React, { CSSProperties, ReactNode, useEffect } from "react";
import { useTheme } from "@/context/ThemeContext";
import {
  GUTTER, control, elevation, layer, motion as md, radius, space, transition, type as typeScale,
  TypeStyle,
} from "./tokens";

/* ═════════════════════════════════════════════════════════════════════════
   LAYOUT
   ═════════════════════════════════════════════════════════════════════════ */

/**
 * The page frame. Owns the canvas, the gutter and the bottom-nav clearance
 * so no screen has to remember any of the three.
 */
export function Screen({
  children,
  scroll = true,
  padded = true,
  style,
  ...rest
}: {
  children: ReactNode;
  /** false for chat-style screens that manage their own scroll */
  scroll?: boolean;
  padded?: boolean;
  style?: CSSProperties;
} & React.HTMLAttributes<HTMLDivElement>) {
  const { th } = useTheme();
  return (
    <div
      {...rest}
      style={{
        minHeight: "100%",
        background: th.pageBg,
        position: "relative",
        overflowX: "hidden",
        overflowY: scroll ? "auto" : "hidden",
        paddingLeft: padded ? GUTTER : 0,
        paddingRight: padded ? GUTTER : 0,
        paddingBottom: "var(--bottom-safe-space)",
        transition: transition.theme,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** A titled block of content. The only way to introduce a group. */
export function Section({
  title,
  action,
  children,
  first = false,
  style,
}: {
  title?: string;
  /** right-aligned affordance — keep it to two or three words */
  action?: ReactNode;
  children: ReactNode;
  first?: boolean;
  style?: CSSProperties;
}) {
  return (
    <section style={{ marginTop: first ? 0 : space.xxl, ...style }}>
      {(title || action) && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: space.md,
            marginBottom: space.md,
            minHeight: 20,
          }}
        >
          {title ? <Eyebrow>{title}</Eyebrow> : <span />}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** Vertical rhythm without margin math. */
export function Stack({
  gap = space.md,
  children,
  style,
}: {
  gap?: number;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return <div style={{ display: "flex", flexDirection: "column", gap, ...style }}>{children}</div>;
}

/** Horizontal layout with the two things every row needs: gap and alignment. */
export function Row({
  gap = space.sm,
  align = "center",
  justify = "flex-start",
  wrap = false,
  children,
  style,
}: {
  gap?: number;
  align?: CSSProperties["alignItems"];
  justify?: CSSProperties["justifyContent"];
  wrap?: boolean;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: align,
        justifyContent: justify,
        gap,
        flexWrap: wrap ? "wrap" : "nowrap",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Divider({ inset = 0, style }: { inset?: number; style?: CSSProperties }) {
  const { th } = useTheme();
  return (
    <div
      style={{
        height: 1,
        background: th.line,
        marginLeft: inset,
        marginRight: inset,
        ...style,
      }}
    />
  );
}

export function Spacer({ size = space.lg }: { size?: number }) {
  return <div style={{ height: size, flexShrink: 0 }} />;
}

/* ═════════════════════════════════════════════════════════════════════════
   SURFACES
   ═════════════════════════════════════════════════════════════════════════ */

export type CardTone = "default" | "raised" | "sunken" | "accent" | "outline";

/**
 * The one container. Three tones map to the three luminance steps; `accent`
 * is reserved for a single card per screen at most.
 */
export function Card({
  tone = "default",
  padding = space.xl,
  interactive = false,
  onClick,
  children,
  style,
  ...rest
}: {
  tone?: CardTone;
  padding?: number;
  interactive?: boolean;
  onClick?: () => void;
  children: ReactNode;
  style?: CSSProperties;
} & Omit<React.HTMLAttributes<HTMLDivElement>, "onClick" | "style">) {
  const { th } = useTheme();
  const tones: Record<CardTone, CSSProperties> = {
    default: { background: th.surface, border: `1px solid ${th.line}`, boxShadow: elevation.low },
    raised: { background: th.surfaceRaised, border: `1px solid ${th.line}`, boxShadow: elevation.medium },
    sunken: { background: th.surfaceSunken, border: `1px solid ${th.line}`, boxShadow: elevation.flat },
    accent: { background: th.accentSubtle, border: `1px solid ${th.lineAccent}`, boxShadow: elevation.flat },
    outline: { background: "transparent", border: `1px solid ${th.line}`, boxShadow: elevation.flat },
  };
  const clickable = interactive || !!onClick;
  return (
    <div
      {...rest}
      onClick={onClick}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={
        clickable && onClick
          ? e => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      style={{
        borderRadius: radius.lg,
        padding,
        position: "relative",
        cursor: clickable ? "pointer" : undefined,
        transition: `${transition.color}, ${transition.press}`,
        ...tones[tone],
        ...style,
      }}
      onPointerDown={clickable ? e => { e.currentTarget.style.transform = "scale(0.99)"; } : undefined}
      onPointerUp={clickable ? e => { e.currentTarget.style.transform = "scale(1)"; } : undefined}
      onPointerLeave={clickable ? e => { e.currentTarget.style.transform = "scale(1)"; } : undefined}
    >
      {children}
    </div>
  );
}

/** Square action tile used in grids (quick actions, shortcuts). */
export function Tile({
  icon,
  label,
  meta,
  onClick,
  tone = "default",
  testId,
}: {
  icon: ReactNode;
  label: string;
  meta?: string;
  onClick?: () => void;
  tone?: "default" | "accent";
  testId?: string;
}) {
  const { th } = useTheme();
  return (
    <button
      data-testid={testId}
      onClick={onClick}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: space.sm,
        padding: space.lg,
        minHeight: 92,
        width: "100%",
        textAlign: "left",
        borderRadius: radius.md,
        cursor: "pointer",
        background: tone === "accent" ? th.accentSubtle : th.surface,
        border: `1px solid ${tone === "accent" ? th.lineAccent : th.line}`,
        boxShadow: elevation.low,
        transition: `${transition.color}, ${transition.press}`,
      }}
      onPointerDown={e => { e.currentTarget.style.transform = "scale(0.97)"; }}
      onPointerUp={e => { e.currentTarget.style.transform = "scale(1)"; }}
      onPointerLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}
    >
      <span
        style={{
          width: 34,
          height: 34,
          borderRadius: radius.sm,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: tone === "accent" ? th.accentSubtleStrong : th.surfaceRaised,
          color: tone === "accent" ? th.accent : th.textSecondary,
        }}
      >
        {icon}
      </span>
      <span style={{ ...asStyle(typeScale.bodyStrong), color: th.textPrimary }}>{label}</span>
      {meta && <span style={{ ...asStyle(typeScale.micro), color: th.textTertiary }}>{meta}</span>}
    </button>
  );
}

/**
 * The workhorse of a finance app: a left identity, a middle description and
 * a right value. Every transaction, contact and setting uses this shape, so
 * the eye learns one scan path and reuses it everywhere.
 */
export function ListRow({
  leading,
  title,
  subtitle,
  trailing,
  trailingSub,
  onClick,
  divider = false,
  testId,
}: {
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  trailingSub?: ReactNode;
  onClick?: () => void;
  divider?: boolean;
  testId?: string;
}) {
  const { th } = useTheme();
  return (
    <div
      data-testid={testId}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? e => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      style={{
        display: "flex",
        alignItems: "center",
        gap: space.md,
        minHeight: control.minTouch,
        padding: `${space.md}px 0`,
        cursor: onClick ? "pointer" : undefined,
        borderBottom: divider ? `1px solid ${th.line}` : undefined,
      }}
    >
      {leading}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            ...asStyle(typeScale.bodyStrong),
            color: th.textPrimary,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {title}
        </div>
        {subtitle !== undefined && subtitle !== null && (
          <div style={{ ...asStyle(typeScale.caption), color: th.textTertiary, marginTop: 2 }}>
            {subtitle}
          </div>
        )}
      </div>
      {(trailing || trailingSub) && (
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          {trailing}
          {trailingSub && (
            <div style={{ ...asStyle(typeScale.micro), color: th.textTertiary, marginTop: 2 }}>
              {trailingSub}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Circular identity mark. Initials only — no photo placeholder noise. */
export function Avatar({
  name,
  size = 40,
  online,
}: {
  name?: string;
  size?: number;
  online?: boolean;
}) {
  const { th } = useTheme();
  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <div
        style={{
          width: size,
          height: size,
          borderRadius: radius.pill,
          background: th.surfaceRaised,
          border: `1px solid ${th.line}`,
          color: th.textSecondary,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: Math.round(size * 0.38),
          fontWeight: 600,
          letterSpacing: 0.2,
        }}
      >
        {(name?.trim().charAt(0) || "?").toUpperCase()}
      </div>
      {online !== undefined && (
        <span
          style={{
            position: "absolute",
            right: 0,
            bottom: 0,
            width: Math.max(8, size * 0.24),
            height: Math.max(8, size * 0.24),
            borderRadius: radius.pill,
            background: online ? th.positive : th.textDisabled,
            border: `2px solid ${th.surface}`,
          }}
        />
      )}
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════════════
   TEXT
   ═════════════════════════════════════════════════════════════════════════ */

export type TextTone = "primary" | "secondary" | "tertiary" | "accent" | "positive" | "negative" | "warning" | "onAccent";
export type TextVariant = keyof typeof typeScale;

export function asStyle(t: TypeStyle): CSSProperties {
  return {
    fontFamily: t.fontFamily,
    fontSize: t.fontSize,
    lineHeight: t.lineHeight,
    fontWeight: t.fontWeight,
    letterSpacing: t.letterSpacing,
    textTransform: t.textTransform,
    fontVariantNumeric: t.fontVariantNumeric,
  };
}

export function Text({
  variant = "body",
  tone = "primary",
  children,
  style,
  as: As = "span",
  ...rest
}: {
  variant?: TextVariant;
  tone?: TextTone;
  children: ReactNode;
  style?: CSSProperties;
  as?: "span" | "div" | "p" | "h1" | "h2" | "h3";
} & React.HTMLAttributes<HTMLElement>) {
  const { th } = useTheme();
  const tones: Record<TextTone, string> = {
    primary: th.textPrimary,
    secondary: th.textSecondary,
    tertiary: th.textTertiary,
    accent: th.accent,
    positive: th.positive,
    negative: th.negative,
    warning: th.warning,
    onAccent: th.textOnAccent,
  };
  return (
    <As {...rest} style={{ ...asStyle(typeScale[variant]), color: tones[tone], ...style }}>
      {children}
    </As>
  );
}

/** Section eyebrow. Deliberately quiet: it labels, it does not compete. */
export function Eyebrow({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  const { th } = useTheme();
  return (
    <div style={{ ...asStyle(typeScale.label), color: th.textTertiary, ...style }}>{children}</div>
  );
}

/**
 * Money.
 *
 * Sign is carried by a glyph AND by colour, never by colour alone — that is
 * both an accessibility requirement and the reason a red/green-blind user
 * can still read a statement. Digits are tabular so columns of amounts line
 * up and a changing balance does not shuffle.
 */
export function Amount({
  value,
  currency,
  signed = false,
  size = "md",
  tone,
  masked = false,
  style,
  testId,
}: {
  /** already-formatted string, or a raw number */
  value: number | string;
  currency?: string;
  /** show an explicit + / − marker */
  signed?: boolean;
  size?: "hero" | "lg" | "md" | "sm";
  /** override the automatic in/out colouring */
  tone?: "auto" | "neutral" | "positive" | "negative";
  masked?: boolean;
  style?: CSSProperties;
  testId?: string;
}) {
  const { th } = useTheme();
  const numeric = typeof value === "number" ? value : parseFloat(String(value).replace(/[^0-9.-]/g, ""));
  const resolved = tone ?? (signed ? "auto" : "neutral");
  const color =
    resolved === "positive" || (resolved === "auto" && numeric > 0)
      ? th.positive
      : resolved === "negative" || (resolved === "auto" && numeric < 0)
      ? th.negative
      : th.textPrimary;

  const scale =
    size === "hero" ? typeScale.balance : size === "lg" ? typeScale.display : size === "sm" ? typeScale.amountSm : typeScale.amount;

  // One grouping convention across the whole app, matching store.formatMoney.
  // Mixed separators between two amounts on one screen read as a bug.
  const body =
    typeof value === "number"
      ? Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : value;

  if (masked) {
    return (
      <span data-testid={testId} style={{ ...asStyle(scale), color: th.textDisabled, ...style }}>
        {"•".repeat(size === "hero" ? 6 : 4)}
      </span>
    );
  }

  return (
    <span data-testid={testId} style={{ ...asStyle(scale), color, display: "inline-flex", alignItems: "baseline", ...style }}>
      {/* The sign belongs to the number, so it sits tight against it. */}
      {signed && <span aria-hidden style={{ marginRight: 2 }}>{numeric < 0 ? "−" : "+"}</span>}
      <span>{body}</span>
      {currency && (
        <span
          style={{
            marginLeft: 6,
            fontSize: Math.round(scale.fontSize * (size === "hero" ? 0.4 : 0.78)),
            fontWeight: 600,
            color: th.textTertiary,
            letterSpacing: 0.2,
          }}
        >
          {currency}
        </span>
      )}
    </span>
  );
}

/**
 * A period-over-period change. Colour on the text only — a filled green
 * pill for "+2%" is louder than the information deserves.
 */
export function Delta({ value, suffix = "%", label }: { value: number; suffix?: string; label?: string }) {
  const { th } = useTheme();
  const up = value >= 0;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: space.xs,
        padding: `3px ${space.sm}px`,
        borderRadius: radius.xs,
        background: up ? th.positiveSubtle : th.negativeSubtle,
        ...asStyle(typeScale.micro),
        fontWeight: 600,
        color: up ? th.positive : th.negative,
      }}
    >
      <span aria-hidden>{up ? "↑" : "↓"}</span>
      {Math.abs(value).toFixed(1)}
      {suffix}
      {label && <span style={{ color: th.textTertiary, fontWeight: 500 }}>{label}</span>}
    </span>
  );
}

/* ═════════════════════════════════════════════════════════════════════════
   ACTIONS
   ═════════════════════════════════════════════════════════════════════════ */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

/**
 * One primary button per screen. That is a rule, not a guideline: two
 * equally-weighted calls to action in a money flow is how people send the
 * wrong amount to the wrong person.
 */
export function Button({
  variant = "primary",
  size = "lg",
  full = false,
  icon,
  iconRight,
  disabled,
  loading,
  onClick,
  children,
  style,
  testId,
  type = "button",
  ...rest
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  full?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
  disabled?: boolean;
  loading?: boolean;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  children?: ReactNode;
  style?: CSSProperties;
  testId?: string;
  type?: "button" | "submit";
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "style" | "type">) {
  const { th } = useTheme();
  const heights = { sm: control.heightSm, md: control.heightMd, lg: control.heightLg };
  const variants: Record<ButtonVariant, CSSProperties> = {
    primary: { background: th.accent, color: th.textOnAccent, border: "1px solid transparent", boxShadow: elevation.low },
    secondary: { background: th.surfaceRaised, color: th.textPrimary, border: `1px solid ${th.lineStrong}`, boxShadow: "none" },
    ghost: { background: "transparent", color: th.textSecondary, border: "1px solid transparent", boxShadow: "none" },
    danger: { background: th.dangerSubtle, color: th.danger, border: `1px solid ${th.danger}`, boxShadow: "none" },
  };
  const inactive = disabled || loading;
  return (
    <button
      {...rest}
      type={type}
      data-testid={testId}
      disabled={inactive}
      onClick={onClick}
      aria-busy={loading || undefined}
      style={{
        height: heights[size],
        minHeight: control.minTouch,
        width: full ? "100%" : undefined,
        padding: `0 ${size === "sm" ? space.lg : space.xxl}px`,
        borderRadius: radius.md,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: space.sm,
        cursor: inactive ? "not-allowed" : "pointer",
        opacity: inactive ? 0.45 : 1,
        ...asStyle(size === "sm" ? typeScale.caption : typeScale.bodyStrong),
        fontWeight: 600,
        transition: `${transition.color}, ${transition.press}, opacity ${md.duration.fast}ms linear`,
        ...variants[variant],
        ...style,
      }}
      onPointerDown={e => { if (!inactive) e.currentTarget.style.transform = "scale(0.98)"; }}
      onPointerUp={e => { e.currentTarget.style.transform = "scale(1)"; }}
      onPointerLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}
    >
      {loading ? <Spinner /> : icon}
      {children}
      {iconRight}
    </button>
  );
}

export function IconButton({
  icon,
  label,
  onClick,
  badge,
  tone = "default",
  size = control.minTouch,
  testId,
  style,
}: {
  icon: ReactNode;
  /** required: an icon-only control must still say what it does */
  label: string;
  onClick?: () => void;
  badge?: number;
  tone?: "default" | "accent";
  size?: number;
  testId?: string;
  style?: CSSProperties;
}) {
  const { th } = useTheme();
  return (
    <button
      data-testid={testId}
      onClick={onClick}
      aria-label={label}
      title={label}
      style={{
        width: size,
        height: size,
        borderRadius: radius.pill,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        cursor: "pointer",
        background: tone === "accent" ? th.accentSubtle : th.surfaceRaised,
        border: `1px solid ${tone === "accent" ? th.lineAccent : th.line}`,
        color: tone === "accent" ? th.accent : th.textSecondary,
        transition: `${transition.color}, ${transition.press}`,
        flexShrink: 0,
        ...style,
      }}
      onPointerDown={e => { e.currentTarget.style.transform = "scale(0.94)"; }}
      onPointerUp={e => { e.currentTarget.style.transform = "scale(1)"; }}
      onPointerLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}
    >
      {icon}
      {badge !== undefined && badge > 0 && (
        <span
          style={{
            position: "absolute",
            top: -2,
            right: -2,
            minWidth: 18,
            height: 18,
            padding: "0 5px",
            borderRadius: radius.pill,
            background: th.danger,
            color: "#fff",
            fontSize: 11,
            fontWeight: 700,
            lineHeight: "18px",
            textAlign: "center",
            border: `2px solid ${th.canvas}`,
          }}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </button>
  );
}

export function Chip({
  children,
  selected = false,
  onClick,
  icon,
  testId,
}: {
  children: ReactNode;
  selected?: boolean;
  onClick?: () => void;
  icon?: ReactNode;
  testId?: string;
}) {
  const { th } = useTheme();
  return (
    <button
      data-testid={testId}
      onClick={onClick}
      aria-pressed={selected}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: space.xs,
        height: 34,
        padding: `0 ${space.md}px`,
        borderRadius: radius.pill,
        cursor: onClick ? "pointer" : "default",
        background: selected ? th.accentSubtleStrong : th.surfaceRaised,
        border: `1px solid ${selected ? th.lineAccent : th.line}`,
        color: selected ? th.accent : th.textSecondary,
        ...asStyle(typeScale.caption),
        fontWeight: 600,
        transition: transition.color,
        whiteSpace: "nowrap",
      }}
    >
      {icon}
      {children}
    </button>
  );
}

/** Two to four mutually exclusive options. More than four is a list. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  testId,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  testId?: string;
}) {
  const { th } = useTheme();
  return (
    <div
      data-testid={testId}
      role="tablist"
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${options.length}, 1fr)`,
        gap: 2,
        padding: 3,
        borderRadius: radius.md,
        background: th.surfaceSunken,
        border: `1px solid ${th.line}`,
      }}
    >
      {options.map(opt => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            style={{
              height: 36,
              borderRadius: radius.xs + 2,
              border: "none",
              cursor: "pointer",
              background: active ? th.surfaceRaised : "transparent",
              color: active ? th.textPrimary : th.textTertiary,
              ...asStyle(typeScale.caption),
              fontWeight: 600,
              transition: transition.color,
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════════════
   FEEDBACK
   ═════════════════════════════════════════════════════════════════════════ */

export type BadgeTone = "neutral" | "positive" | "negative" | "warning" | "info" | "accent";

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: BadgeTone }) {
  const { th } = useTheme();
  const map: Record<BadgeTone, [string, string]> = {
    neutral: [th.surfaceRaised, th.textSecondary],
    positive: [th.positiveSubtle, th.positive],
    negative: [th.negativeSubtle, th.negative],
    warning: [th.warningSubtle, th.warning],
    info: [th.infoSubtle, th.info],
    accent: [th.accentSubtleStrong, th.accent],
  };
  const [bg, fg] = map[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: space.xs,
        padding: `3px ${space.sm}px`,
        borderRadius: radius.xs,
        background: bg,
        color: fg,
        ...asStyle(typeScale.micro),
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

/** Progress toward a target. Always paired with a number — a bar alone is a vibe. */
export function Meter({
  value,
  max = 100,
  tone = "accent",
  height = 6,
  label,
}: {
  value: number;
  max?: number;
  tone?: "accent" | "positive" | "warning" | "negative";
  height?: number;
  label?: string;
}) {
  const { th } = useTheme();
  const colors = { accent: th.accent, positive: th.positive, warning: th.warning, negative: th.negative };
  const pct = max > 0 ? Math.min(Math.max((value / max) * 100, 0), 100) : 0;
  return (
    <div>
      <div
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
        style={{ height, borderRadius: radius.pill, background: th.surfaceSunken, overflow: "hidden" }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            borderRadius: radius.pill,
            background: colors[tone],
            transition: `width ${md.duration.normal}ms ${md.easing.standard}`,
          }}
        />
      </div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  const { th } = useTheme();
  return (
    <div style={{ textAlign: "center", padding: `${space.xxxl}px ${space.xl}px` }}>
      {icon && (
        <div
          style={{
            width: 48,
            height: 48,
            margin: "0 auto",
            borderRadius: radius.md,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: th.surfaceRaised,
            color: th.textTertiary,
            marginBottom: space.lg,
          }}
        >
          {icon}
        </div>
      )}
      <Text variant="heading">{title}</Text>
      {body && (
        <Text variant="secondary" tone="tertiary" as="p" style={{ marginTop: space.sm, maxWidth: 280, marginLeft: "auto", marginRight: "auto" }}>
          {body}
        </Text>
      )}
      {action && <div style={{ marginTop: space.xl }}>{action}</div>}
    </div>
  );
}

export function Skeleton({ height = 16, width = "100%", radius: r = radius.xs }: { height?: number; width?: number | string; radius?: number }) {
  const { th } = useTheme();
  return (
    <div
      style={{
        height,
        width,
        borderRadius: r,
        background: th.surfaceRaised,
        animation: "md-pulse 1.4s ease-in-out infinite",
      }}
    />
  );
}

export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        border: "2px solid currentColor",
        borderTopColor: "transparent",
        display: "inline-block",
        animation: "md-spin 0.7s linear infinite",
      }}
    />
  );
}

/**
 * Bottom sheet. Sheets, not centre-modals: on a phone the bottom of the
 * screen is where the thumb already is, and a sheet keeps the context you
 * came from visible behind it — which matters when the context is money.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  testId,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  testId?: string;
}) {
  const { th } = useTheme();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      data-testid={testId}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: layer.modal,
        background: th.scrim,
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        animation: `md-fade ${md.duration.fast}ms ${md.easing.standard}`,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={e => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 448,
          maxHeight: "88vh",
          overflowY: "auto",
          background: th.overlay,
          borderTop: `1px solid ${th.lineStrong}`,
          borderRadius: `${radius.xl}px ${radius.xl}px 0 0`,
          boxShadow: elevation.overlay,
          padding: `${space.md}px ${GUTTER}px calc(${space.xxxl}px + env(safe-area-inset-bottom))`,
          animation: `md-sheet-in ${md.duration.normal}ms ${md.easing.standard}`,
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", paddingBottom: space.md }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: th.lineStrong }} />
        </div>
        {title && (
          <div style={{ marginBottom: space.lg }}>
            <Text variant="heading">{title}</Text>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
