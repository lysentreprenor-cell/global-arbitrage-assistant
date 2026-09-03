import { createContext, useContext, useState, useEffect, useMemo, ReactNode } from "react";
import { StorageKeys } from "@/lib/localStore";
import { PALETTES, THEME_IDS, ThemeId, Palette, paletteToCssVars, paletteToShadcnVars } from "@/design/themes";
import { toDashTheme, DashTheme } from "@/design/bridge";

/**
 * Theme provider for the Meridian design system.
 *
 * One palette drives three consumers at once, so they can never drift:
 *   1. `th`  — the object React components read (see design/bridge.ts)
 *   2. `--md-*`  CSS variables — for plain CSS and hand-written styles
 *   3. shadcn `--background`/`--primary`/… — for the Tailwind component layer
 */

export type ThemeName = ThemeId;
export type { DashTheme };

/** Theme ids that shipped before Meridian. Kept so saved preferences survive. */
const LEGACY_MAP: Record<string, ThemeName> = {
  "obsidian-gold": "black-gold",
  "arctic-platinum": "ice-silver",
  "graphite-emerald": "emerald-gold",
};

export const DEFAULT_THEME: ThemeName = "black-gold";

function resolveTheme(raw: string | null): ThemeName {
  if (!raw) return DEFAULT_THEME;
  if (raw in LEGACY_MAP) return LEGACY_MAP[raw];
  return THEME_IDS.includes(raw as ThemeName) ? (raw as ThemeName) : DEFAULT_THEME;
}

interface ThemeContextValue {
  theme: ThemeName;
  /** design tokens for the active theme */
  th: DashTheme;
  /** the raw palette, for anything that needs the source values */
  palette: Palette;
  setTheme: (t: ThemeName) => void;
}

const DEFAULT_PALETTE = PALETTES[DEFAULT_THEME];

const ThemeContext = createContext<ThemeContextValue>({
  theme: DEFAULT_THEME,
  th: toDashTheme(DEFAULT_PALETTE),
  palette: DEFAULT_PALETTE,
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>(() => {
    try {
      return resolveTheme(localStorage.getItem(StorageKeys.THEME));
    } catch {
      return DEFAULT_THEME;
    }
  });

  const setTheme = (t: ThemeName) => {
    const resolved = resolveTheme(t);
    setThemeState(resolved);
    try {
      localStorage.setItem(StorageKeys.THEME, resolved);
    } catch {
      /* private mode — the theme simply won't persist */
    }
  };

  const palette = PALETTES[theme];
  const th = useMemo(() => toDashTheme(palette), [palette]);

  /* Publish the palette to CSS so every layer reads the same numbers. */
  useEffect(() => {
    const root = document.documentElement;
    const vars = { ...paletteToCssVars(palette), ...paletteToShadcnVars(palette) };
    Object.entries(vars).forEach(([key, value]) => root.style.setProperty(key, value));

    document.body.dataset.theme = theme;

    /* Keep the PWA status bar in step with the canvas. */
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", palette.canvas);

    /* Legacy class hooks, still referenced by a few Tailwind overrides. */
    document.body.classList.remove(
      "theme-ice-silver", "theme-emerald-gold", "theme-royal-violet",
      "theme-arctic-platinum", "theme-graphite-emerald",
    );
    if (theme !== DEFAULT_THEME) document.body.classList.add(`theme-${theme}`);
  }, [theme, palette]);

  const value = useMemo(() => ({ theme, th, palette, setTheme }), [theme, th, palette]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

/** Metadata for theme pickers. Single source for every surface that lists themes. */
export const THEME_OPTIONS = THEME_IDS.map(id => ({
  id,
  name: PALETTES[id].name,
  label: PALETTES[id].label,
  description: PALETTES[id].description,
  canvas: PALETTES[id].canvas,
  surface: PALETTES[id].surface,
  accent: PALETTES[id].accent,
}));

export { PALETTES };
