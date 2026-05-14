import { useTheme, ThemeName } from "@/context/ThemeContext";

const OPTIONS: { id: ThemeName; label: string; dot: string; ring: string }[] = [
  {
    id:    "black-gold",
    label: "BLACK GOLD",
    dot:   "linear-gradient(135deg, #1c2e60 0%, #050e1e 100%)",
    ring:  "rgba(247,210,72,0.60)",
  },
  {
    id:    "ice-silver",
    label: "ICE SILVER",
    dot:   "linear-gradient(135deg, #1a2848 0%, #070d1e 100%)",
    ring:  "rgba(180,210,255,0.60)",
  },
  {
    id:    "emerald-gold",
    label: "EMERALD GOLD",
    dot:   "linear-gradient(135deg, #082010 0%, #020a04 100%)",
    ring:  "rgba(36,200,100,0.60)",
  },
  {
    id:    "royal-violet",
    label: "ROYAL VIOLET",
    dot:   "linear-gradient(135deg, #1a0840 0%, #06021a 100%)",
    ring:  "rgba(168,80,255,0.60)",
  },
];

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6,
      padding: "6px 10px", borderRadius: 999,
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.08)",
      boxShadow: "0 2px 12px rgba(0,0,0,0.30), inset 0 1px 0 rgba(255,255,255,0.06)",
    }}>
      {OPTIONS.map(opt => {
        const active = theme === opt.id;
        return (
          <button
            key={opt.id}
            data-testid={`theme-${opt.id}`}
            onClick={() => setTheme(opt.id)}
            title={opt.label}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: active ? "4px 9px 4px 5px" : "0",
              borderRadius: 999, border: "none",
              background: active ? "rgba(255,255,255,0.08)" : "transparent",
              cursor: "pointer", transition: "all 0.22s",
            }}
          >
            <div style={{
              width: 16, height: 16, borderRadius: "50%",
              background: opt.dot, flexShrink: 0,
              boxShadow: active
                ? `0 0 0 2px ${opt.ring}, 0 0 8px ${opt.ring}`
                : `0 0 0 1px rgba(255,255,255,0.18)`,
              transition: "box-shadow 0.22s",
            }} />
            {active && (
              <span style={{
                fontSize: 9, fontWeight: 800, letterSpacing: 1.4,
                color: "rgba(255,255,255,0.75)",
                textShadow: "0 1px 0 rgba(0,0,0,0.60)",
                whiteSpace: "nowrap",
              }}>
                {opt.label}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
