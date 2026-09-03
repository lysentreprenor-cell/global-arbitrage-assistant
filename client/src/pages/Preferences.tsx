import { useLocation } from "wouter";
import { StorageKeys } from "@/lib/localStore";
import { ArrowLeft, Globe, BellRing, Lock, EyeOff, Check, Smartphone, Download, PiggyBank, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore, WALLET_FLAGS, CURRENCY_SYMBOLS, CURRENCY_NAMES, CurrencyCode } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import { useTheme, ThemeName, THEME_OPTIONS, PALETTES } from "@/context/ThemeContext";
import { useLang, Lang } from "@/context/LanguageContext";
import { useState, useEffect } from "react";
import { usePWAInstall, PWAInstallGuide } from "@/components/PWAInstallBanner";

/* language option display names */
const LANG_OPTIONS: { code: Lang; label: string; flag: string }[] = [
  { code: "no", label: "Norsk (NO)",    flag: "🇳🇴" },
  { code: "en", label: "English (US)",  flag: "🇺🇸" },
  { code: "pl", label: "Polski (PL)",   flag: "🇵🇱" },
  { code: "es", label: "Español (ES)",  flag: "🇪🇸" },
];

/* ──────────────────────────────────────────────────────────────────────────
   Theme catalogue — generated from the Meridian palettes.

   The list is NOT hand-written here: it is derived from design/themes.ts, so
   a new theme appears in Preferences the moment it exists in the system, and
   a preview can never show colours the app does not actually use.
   ────────────────────────────────────────────────────────────────────────── */
const THEMES = THEME_OPTIONS.map(opt => {
  const p = PALETTES[opt.id];
  return {
    id: opt.id,
    name: p.name,
    keyword: p.label,
    tagline: p.label,
    desc: p.description,
    canvas: p.canvas,
    surface: p.surface,
    surfaceRaised: p.surfaceRaised,
    line: p.line,
    accent: p.accent,
    text: p.textPrimary,
    textTertiary: p.textTertiary,
    positive: p.positive,
    negative: p.negative,
    /* legacy field names still read further down this screen */
    dotBg: p.canvas,
    activeBorder: p.accent,
    activeGlow: p.accentSubtle,
    labelColor: p.accent,
    labelBg: p.accentSubtle,
  };
});

/* ── Live theme preview ───────────────────────────────────────────────────
   A miniature of the real home screen, drawn with the candidate theme's own
   tokens: canvas, surface, hairline, accent, and the two money semantics.
   What you see is literally what the app will look like.
   ───────────────────────────────────────────────────────────────────────── */
function ThemePreview({ t, active, onClick }: {
  t: typeof THEMES[0]; active: boolean; onClick: () => void;
}) {
  const { t: lt } = useLang();
  return (
    <motion.div
      whileTap={{ scale: 0.99 }}
      onClick={onClick}
      data-testid={`theme-card-${t.id}`}
      role="radio"
      aria-checked={active}
      style={{
        borderRadius: 20,
        overflow: "hidden",
        cursor: "pointer",
        background: t.surface,
        border: `1px solid ${active ? t.accent : "rgba(255,255,255,0.08)"}`,
        boxShadow: active
          ? "0 2px 6px rgba(0,0,0,0.30), 0 12px 28px -14px rgba(0,0,0,0.55)"
          : "0 1px 2px rgba(0,0,0,0.28), 0 4px 12px -6px rgba(0,0,0,0.36)",
        transition: "border-color 180ms linear, box-shadow 180ms linear",
      }}
    >
      {/* miniature of the real home screen */}
      <div style={{ background: t.canvas, padding: 14 }}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <div style={{ width: 22, height: 22, borderRadius: 999, background: t.surfaceRaised, border: `1px solid ${t.line}` }} />
          <div style={{ flex: 1 }}>
            <div style={{ height: 5, width: "45%", borderRadius: 3, background: t.text, opacity: 0.7 }} />
            <div style={{ height: 4, width: "28%", borderRadius: 3, marginTop: 4, background: t.textTertiary }} />
          </div>
          <div style={{ width: 18, height: 18, borderRadius: 999, background: t.surfaceRaised, border: `1px solid ${t.line}` }} />
        </div>

        {/* balance card */}
        <div style={{
          borderRadius: 12, padding: 12, marginBottom: 8,
          background: t.surface, border: `1px solid ${t.line}`,
        }}>
          <div style={{ height: 4, width: "34%", borderRadius: 3, background: t.textTertiary, marginBottom: 10 }} />
          <div style={{ height: 13, width: "62%", borderRadius: 3, background: t.text, marginBottom: 12 }} />
          <div style={{ display: "flex", gap: 6 }}>
            <div style={{ height: 18, flex: 1, borderRadius: 6, background: t.accent }} />
            <div style={{ height: 18, flex: 1, borderRadius: 6, background: t.surfaceRaised, border: `1px solid ${t.line}` }} />
          </div>
        </div>

        {/* cash-flow rows: the two semantic colours, in their real roles */}
        <div style={{ borderRadius: 12, padding: 12, background: t.surface, border: `1px solid ${t.line}`, display: "grid", gap: 8 }}>
          {[t.positive, t.negative].map((col, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ height: 4, flex: 1, borderRadius: 3, background: col, opacity: i === 0 ? 1 : 0.7 }} />
              <div style={{ height: 4, width: 22, borderRadius: 3, background: t.textTertiary }} />
            </div>
          ))}
        </div>
      </div>

      {/* description */}
      <div style={{ padding: 14, borderTop: `1px solid ${t.line}`, background: t.surface }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ fontSize: 15, fontWeight: 650, color: t.text }}>{t.name}</div>
          {active && (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              padding: "3px 8px", borderRadius: 8,
              background: t.labelBg, color: t.accent,
              fontSize: 11, fontWeight: 600, letterSpacing: 0.2,
            }}>
              <Check size={11} />
              {lt.active}
            </span>
          )}
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.5, color: t.textTertiary, marginTop: 6 }}>
          {t.desc}
        </div>
      </div>
    </motion.div>
  );
}

export default function Preferences() {
  const [, setLocation] = useLocation();
  const { user, updateSettings, enabledCurrencies, primaryCurrency, saveCurrencySettings } = useAppStore();
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const { lang, setLang, t: lt } = useLang();

  const [showLangMenu, setShowLangMenu]         = useState(false);
  const [showCurrencyMenu, setShowCurrencyMenu] = useState(false);
  const [showAddCurrencyMenu, setShowAddCurrencyMenu] = useState(false);
  const [showThemes, setShowThemes]             = useState(false);
  const [roundupEnabled, setRoundupEnabled]     = useState(() => {
    try { return localStorage.getItem(StorageKeys.ROUNDUP) === "true"; } catch { return false; }
  });
  const [offlineMode, setOfflineMode]           = useState(() => {
    try { return localStorage.getItem(StorageKeys.OFFLINE_MODE) === "true"; } catch { return false; }
  });
  const [appLock, setAppLock] = useState(() => {
    try { return localStorage.getItem(StorageKeys.APP_LOCK) === "true"; } catch { return false; }
  });

  const handleAppLockToggle = (val: boolean) => {
    setAppLock(val);
    try { localStorage.setItem(StorageKeys.APP_LOCK, String(val)); } catch { /* ignore */ }
  };

  const handleRoundupToggle = (val: boolean) => {
    setRoundupEnabled(val);
    localStorage.setItem(StorageKeys.ROUNDUP, String(val));
    toast({
      title: "Preference Updated",
      description: val
        ? (lang === "pl" ? "Zaokrąglenie włączone" : "Round-up savings enabled")
        : (lang === "pl" ? "Zaokrąglenie wyłączone" : "Round-up savings disabled"),
    });
  };

  const handleOfflineModeToggle = (val: boolean) => {
    setOfflineMode(val);
    localStorage.setItem(StorageKeys.OFFLINE_MODE, String(val));
    toast({
      title: "Preference Updated",
      description: val
        ? (lang === "pl" ? "Tryb offline włączony" : "Offline mode enabled")
        : (lang === "pl" ? "Tryb offline wyłączony" : "Offline mode disabled"),
    });
  };

  const ALL_CURRENCIES: CurrencyCode[] = ["NOK","USD","EUR","GBP","CHF","PLN","SEK","DKK","CAD","AUD","JPY"];

  const handleThemeChange = (id: ThemeName) => {
    setTheme(id);
    updateSettings({ appearance: id });
    toast({ title: lt.themeUpdated, description: `${THEMES.find(th => th.id === id)?.name} ${lt.themeActive}` });
  };

  const handleToggle = (key: "hideBalances") => {
    if (!user?.settings) return;
    const newValue = !user.settings[key];
    updateSettings({ [key]: newValue });
    toast({
      title: "Preference Updated",
      description: `Hide Balances ${newValue ? "enabled" : "disabled"}.`,
    });
  };

  return (
    <div className="min-h-screen bg-background pb-28 relative overflow-x-hidden transition-colors duration-500">
      <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-primary/5 rounded-full blur-[100px] pointer-events-none" />

      {/* ── Header ── */}
      <header className="px-6 pt-14 pb-6 flex items-center sticky top-0 bg-background/90 backdrop-blur-xl z-10 border-b border-border/40 transition-colors duration-500">
        <Button
          variant="ghost" size="icon"
          className="rounded-full bg-secondary border border-border/30 mr-4 hover:bg-secondary/80"
          onClick={() => setLocation("/profile")}
        >
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </Button>
        <div>
          <h1 className="text-2xl font-heading text-foreground/90">{lt.appPreferences}</h1>
          <p className="text-xs text-muted-foreground mt-0.5 tracking-wide">{lt.personalise}</p>
        </div>
      </header>

      <main className="px-5 py-8 space-y-10 relative z-10">

        {/* ── APPEARANCE section (accordion) ── */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="space-y-4"
        >
          <h2 className="text-[13px] font-black uppercase tracking-[0.20em] text-primary/80 px-1">
            {lt.visualExperience}
          </h2>

          {/* Accordion trigger row */}
          <div
            data-testid="pref-appearance-row"
            onClick={() => setShowThemes(s => !s)}
            className="bg-card border border-border/30 rounded-3xl p-2 shadow-premium transition-colors duration-500 cursor-pointer"
          >
            <div className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 bg-secondary rounded-xl flex items-center justify-center text-primary border border-border/20">
                  {/* 3-dot theme preview orbs */}
                  <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                    {THEMES.map(th => (
                      <div key={th.id} style={{
                        width: theme === th.id ? 14 : 9,
                        height: theme === th.id ? 14 : 9,
                        borderRadius: "50%",
                        background: th.dotBg,
                        border: theme === th.id ? `2px solid ${th.activeBorder}` : "1px solid rgba(255,255,255,0.12)",
                        boxShadow: theme === th.id ? `0 0 8px ${th.activeGlow}` : "none",
                        transition: "all 0.2s",
                      }} />
                    ))}
                  </div>
                </div>
                <div>
                  <p className="font-semibold text-[15px] text-foreground/90">{lt.visualExperience}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{THEMES.find(th => th.id === theme)?.name}</p>
                </div>
              </div>
              <span className="text-[12px] font-bold tracking-widest text-primary uppercase bg-primary/10 px-2 py-1 rounded-md transition-transform" style={{ transform: showThemes ? "rotate(180deg)" : "rotate(0deg)" }}>
                {showThemes ? "▲" : "▼"}
              </span>
            </div>

            <AnimatePresence>
              {showThemes && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "8px 4px 12px" }}>
                    {THEMES.map((t, i) => (
                      <motion.div
                        key={t.id}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.28, delay: i * 0.07 }}
                      >
                        <ThemePreview
                          t={t}
                          active={theme === t.id}
                          onClick={() => handleThemeChange(t.id)}
                        />
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* ── LOCALIZATION section ── */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.12 }}
          className="space-y-4"
        >
          <h2 className="text-[13px] font-black uppercase tracking-[0.20em] text-primary/80 px-1">
            {lt.localisation}
          </h2>
          <div className="bg-card border border-border/30 rounded-3xl p-2 shadow-premium transition-colors duration-500">

            {/* Language */}
            <div
              className="p-5 flex items-center justify-between border-b border-border/30 cursor-pointer hover:bg-secondary/50 transition-colors"
              data-testid="pref-language-row"
              onClick={() => { setShowLangMenu(!showLangMenu); setShowCurrencyMenu(false); }}
            >
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 bg-secondary rounded-xl flex items-center justify-center text-primary border border-border/20">
                  <Globe className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-semibold text-[15px] text-foreground/90">{lt.language}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {LANG_OPTIONS.find(o => o.code === lang)?.flag} {LANG_OPTIONS.find(o => o.code === lang)?.label}
                  </p>
                </div>
              </div>
              <span className="text-[12px] font-bold tracking-widest text-primary uppercase bg-primary/10 px-2 py-1 rounded-md">{lt.edit}</span>
            </div>
            <AnimatePresence>
              {showLangMenu && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden border-b border-border/30 bg-secondary/20"
                >
                  <div className="py-2 px-4 flex flex-col gap-2">
                    {LANG_OPTIONS.map(opt => (
                      <div
                        key={opt.code}
                        data-testid={`lang-option-${opt.code}`}
                        onClick={() => {
                          setLang(opt.code);
                          setShowLangMenu(false);
                          toast({ title: lt.languageSet, description: `${opt.flag} ${opt.label}` });
                        }}
                        className={`p-3 text-sm rounded-xl cursor-pointer flex items-center justify-between ${lang === opt.code ? "bg-primary/20 text-primary font-semibold" : "text-muted-foreground hover:bg-secondary/50"}`}
                      >
                        <span>{opt.flag} {opt.label}</span>
                        {lang === opt.code && <Check className="w-4 h-4" />}
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Currency */}
            <div
              data-testid="pref-currency-row"
              className="p-5 flex items-center justify-between cursor-pointer hover:bg-secondary/50 transition-colors"
              onClick={() => { setShowCurrencyMenu(s => !s); setShowLangMenu(false); setShowAddCurrencyMenu(false); }}
            >
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 bg-secondary rounded-xl flex items-center justify-center border border-border/20">
                  <span className="font-bold font-serif text-lg">{WALLET_FLAGS[primaryCurrency]}</span>
                </div>
                <div>
                  <p className="font-semibold text-[15px] text-foreground/90">{lt.primaryCurrency}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{WALLET_FLAGS[primaryCurrency]} {primaryCurrency} — {CURRENCY_NAMES[primaryCurrency]}</p>
                </div>
              </div>
              <span className="text-[12px] font-bold tracking-widest text-primary uppercase bg-primary/10 px-2 py-1 rounded-md">{lt.edit}</span>
            </div>
            <AnimatePresence>
              {showCurrencyMenu && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden bg-secondary/20"
                >
                  <div className="py-3 px-4 space-y-2">
                    <p className="text-[12px] font-bold uppercase tracking-widest text-muted-foreground px-1 pb-1">Active Currencies</p>
                    {enabledCurrencies.map(cur => {
                      const isPrimary = cur === primaryCurrency;
                      return (
                        <div
                          key={cur}
                          className={`p-3 rounded-xl flex items-center gap-3 ${isPrimary ? "bg-primary/15 border border-primary/25" : "bg-card/60 border border-border/20"}`}
                        >
                          <span className="text-xl">{WALLET_FLAGS[cur]}</span>
                          <div className="flex-1 min-w-0">
                            <p className={`font-bold text-sm ${isPrimary ? "text-primary" : "text-foreground"}`}>{cur}</p>
                            <p className="text-xs text-muted-foreground">{CURRENCY_NAMES[cur]} · {CURRENCY_SYMBOLS[cur]}</p>
                          </div>
                          {isPrimary ? (
                            <span className="text-[12px] font-black tracking-widest text-primary bg-primary/10 px-2 py-1 rounded-md">{lt.primaryBadge}</span>
                          ) : (
                            <div className="flex gap-2">
                              <button
                                data-testid={`pref-set-primary-${cur}`}
                                onClick={() => {
                                  saveCurrencySettings(enabledCurrencies, cur);
                                  toast({ title: "Primary currency set", description: `${WALLET_FLAGS[cur]} ${cur}` });
                                }}
                                className="text-[12px] font-bold text-primary bg-primary/10 px-2 py-1 rounded-md hover:bg-primary/20 transition-colors"
                              >
                                {lt.setPrimary}
                              </button>
                              {enabledCurrencies.length > 1 && (
                                <button
                                  data-testid={`pref-remove-currency-${cur}`}
                                  onClick={() => {
                                    const next = enabledCurrencies.filter(c => c !== cur);
                                    saveCurrencySettings(next, primaryCurrency);
                                    toast({ title: "Currency removed", description: `${cur} removed` });
                                  }}
                                  className="text-[12px] font-bold text-destructive/70 bg-destructive/10 px-2 py-1 rounded-md hover:bg-destructive/20 transition-colors"
                                >
                                  {lt.removeCurrency}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Add currency */}
                    {!showAddCurrencyMenu ? (
                      <button
                        data-testid="pref-btn-add-currency"
                        onClick={() => setShowAddCurrencyMenu(true)}
                        className="w-full p-3 rounded-xl border border-dashed border-border/40 text-muted-foreground text-sm font-semibold flex items-center gap-2 hover:bg-secondary/40 transition-colors"
                      >
                        <span className="text-base">+</span> {lt.addCurrency}
                      </button>
                    ) : (
                      <div className="space-y-1">
                        <p className="text-[12px] font-bold uppercase tracking-widest text-muted-foreground px-1 pb-1">{lt.addCurrency}</p>
                        {ALL_CURRENCIES.filter(c => !enabledCurrencies.includes(c)).map(cur => (
                          <button
                            key={cur}
                            data-testid={`pref-add-currency-${cur}`}
                            onClick={() => {
                              const next = [...enabledCurrencies, cur];
                              saveCurrencySettings(next, primaryCurrency);
                              setShowAddCurrencyMenu(false);
                              toast({ title: "Currency added", description: `${WALLET_FLAGS[cur]} ${cur} — ${CURRENCY_NAMES[cur]}` });
                            }}
                            className="w-full p-3 rounded-xl bg-card/60 border border-border/20 flex items-center gap-3 hover:bg-secondary/50 transition-colors text-left"
                          >
                            <span className="text-xl">{WALLET_FLAGS[cur]}</span>
                            <div className="flex-1">
                              <p className="font-bold text-sm text-foreground">{cur}</p>
                              <p className="text-xs text-muted-foreground">{CURRENCY_NAMES[cur]} · {CURRENCY_SYMBOLS[cur]}</p>
                            </div>
                            <span className="text-[12px] font-bold text-muted-foreground bg-secondary px-2 py-1 rounded">+ Add</span>
                          </button>
                        ))}
                        {ALL_CURRENCIES.every(c => enabledCurrencies.includes(c)) && (
                          <p className="text-xs text-muted-foreground text-center py-2">All currencies are already added.</p>
                        )}
                        <button
                          onClick={() => setShowAddCurrencyMenu(false)}
                          className="w-full py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* ── PRIVACY section ── */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.22 }}
          className="space-y-4"
        >
          <h2 className="text-[13px] font-black uppercase tracking-[0.20em] text-primary/80 px-1">
            {lt.privacyExp}
          </h2>
          <div className="bg-card border border-border/30 rounded-3xl p-2 shadow-premium transition-colors duration-500">
            <div className="p-5 flex items-center justify-between border-b border-border/30">
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 bg-secondary rounded-xl flex items-center justify-center text-primary border border-border/20">
                  <EyeOff className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-semibold text-[15px] text-foreground/90">{lt.hideBalances}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{lt.hideBalancesDesc}</p>
                </div>
              </div>
              <Switch checked={user?.settings?.hideBalances ?? false} onCheckedChange={() => handleToggle("hideBalances")} />
            </div>
            <div className="p-5 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 bg-secondary rounded-xl flex items-center justify-center text-primary border border-border/20">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-semibold text-[15px] text-foreground/90">{lt.appLock}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{lt.appLockDesc}</p>
                </div>
              </div>
              <Switch checked={appLock} onCheckedChange={handleAppLockToggle} />
            </div>
          </div>
        </motion.div>

        {/* ── EXTRA FEATURES section ── */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.30 }}
          className="space-y-4"
        >
          <h2 className="text-[13px] font-black uppercase tracking-[0.20em] text-primary/80 px-1">
            {lang === "pl" ? "Dodatkowe funkcje" : "Extra Features"}
          </h2>
          <div className="bg-card border border-border/30 rounded-3xl p-2 shadow-premium transition-colors duration-500">
            {/* Round-up savings */}
            <div className="p-5 flex items-center justify-between border-b border-border/30">
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 bg-secondary rounded-xl flex items-center justify-center text-primary border border-border/20">
                  <PiggyBank className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-semibold text-[15px] text-foreground/90">
                    {lang === "pl" ? "Zaokrąglenie na oszczędności" : "Round-up savings"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {lang === "pl"
                      ? "Każdy przelew zaokrąglany w górę do pełnego złotego. Różnica trafia na cel oszczędnościowy."
                      : "Every transfer is rounded up to the nearest whole unit. The difference goes to your savings goal."}
                  </p>
                </div>
              </div>
              <Switch checked={roundupEnabled} onCheckedChange={handleRoundupToggle} />
            </div>
            {/* Offline mode */}
            <div className="p-5 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 bg-secondary rounded-xl flex items-center justify-center text-primary border border-border/20">
                  <WifiOff className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-semibold text-[15px] text-foreground/90">
                    {lang === "pl" ? "Tryb offline" : "Offline mode"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {lang === "pl"
                      ? "Przeglądaj historię i umowy bez połączenia z internetem."
                      : "Browse history and agreements without internet connection."}
                  </p>
                </div>
              </div>
              <Switch checked={offlineMode} onCheckedChange={handleOfflineModeToggle} />
            </div>
          </div>
        </motion.div>

        {/* ── PWA Install ── */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.38 }} className="px-5 pb-2">
          <h2 className="text-[13px] font-bold uppercase tracking-[0.12em] text-muted-foreground mb-3 px-1">Aplikacja mobilna</h2>
          <div className="bg-card rounded-3xl border border-border/30 shadow-sm overflow-hidden">
            <PWAInstallSection />
          </div>
        </motion.div>

      </main>
    </div>
  );
}

function PWAInstallSection() {
  const { canInstall, isInstalled, install, showGuide, setShowGuide } = usePWAInstall();

  return (
    <>
      <div className="p-5">
        {isInstalled ? (
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 bg-green-500/10 rounded-xl flex items-center justify-center text-green-400 border border-green-500/20">
              <Check className="w-5 h-5" />
            </div>
            <div>
              <p className="font-semibold text-[15px] text-foreground/90">Aplikacja zainstalowana</p>
              <p className="text-xs text-muted-foreground mt-0.5">Finlys działa jako natywna aplikacja</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 bg-secondary rounded-xl flex items-center justify-center text-primary border border-border/20">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <p className="font-semibold text-[15px] text-foreground/90">Zainstaluj na telefonie</p>
                <p className="text-xs text-muted-foreground mt-0.5">Pełny ekran, bez paska przeglądarki</p>
              </div>
            </div>
            <Button
              onClick={canInstall ? install : () => setShowGuide(true)}
              className="w-full rounded-xl bg-primary text-primary-foreground font-semibold h-11 flex items-center gap-2"
              data-testid="button-pwa-install-settings"
            >
              <Download className="w-4 h-4" />
              {canInstall ? "Zainstaluj aplikację" : "Jak zainstalować?"}
            </Button>
          </div>
        )}
      </div>

      <AnimatePresence>
        {showGuide && <PWAInstallGuide onClose={() => setShowGuide(false)} />}
      </AnimatePresence>
    </>
  );
}
