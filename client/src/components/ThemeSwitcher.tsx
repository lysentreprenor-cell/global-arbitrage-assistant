import { useTheme, THEME_OPTIONS } from "@/context/ThemeContext";
import { radius, space, transition } from "@/design/tokens";

/**
 * Compact theme switcher.
 *
 * A theme is previewed by the two things that actually change — the canvas
 * and the accent — not by a marketing name. The name is the tooltip.
 */
export function ThemeSwitcher() {
  const { theme, setTheme, th } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: space.xs,
        padding: 4,
        borderRadius: radius.pill,
        background: th.surfaceSunken,
        border: `1px solid ${th.line}`,
      }}
    >
      {THEME_OPTIONS.map(opt => {
        const active = theme === opt.id;
        return (
          <button
            key={opt.id}
            data-testid={`theme-${opt.id}`}
            role="radio"
            aria-checked={active}
            aria-label={opt.name}
            title={opt.name}
            onClick={() => setTheme(opt.id)}
            style={{
              width: 30,
              height: 30,
              borderRadius: radius.pill,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              background: "transparent",
              border: `1px solid ${active ? th.lineAccent : "transparent"}`,
              transition: transition.color,
            }}
          >
            <span
              style={{
                width: 16,
                height: 16,
                borderRadius: radius.pill,
                display: "block",
                // canvas on one half, accent on the other: the whole theme in 16px
                background: `linear-gradient(135deg, ${opt.canvas} 0% 50%, ${opt.accent} 50% 100%)`,
                boxShadow: `0 0 0 1px ${active ? opt.accent : th.lineStrong}`,
              }}
            />
          </button>
        );
      })}
    </div>
  );
}
