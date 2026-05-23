import { useLocation } from "wouter";
import { ArrowLeft, Globe, BellRing, Lock, EyeOff, Check, Smartphone, Download, PiggyBank, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore, WALLET_FLAGS, CURRENCY_SYMBOLS, CURRENCY_NAMES, CurrencyCode } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import { useTheme, ThemeName } from "@/context/ThemeContext";
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

/* ── Psychological luxury theme definitions ── */
const THEMES: {
  id: ThemeName;
  name: string;
  keyword: string;
  tagline: string;
  desc: string;
  /* preview swatches */
  previewBg: string;
  previewCard: string;
  previewAccent1: string;
  previewAccent2: string;
  previewAccent3: string;
  dotBg: string;
  activeBorder: string;
  activeGlow: string;
  labelColor: string;
  labelBg: string;
}[] = [
  {
    id:             "black-gold",
    name:           "Black Gold",
    keyword:        "SOVEREIGN DARK",
    tagline:        "Power · Prestige · Depth",
    desc:           "Forged in midnight. Sealed in gold. The palette of authority — timeless like a vault, warm like a flame.",
    previewBg:      "linear-gradient(135deg, #040e24 0%, #010508 100%)",
    previewCard:    "linear-gradient(160deg, rgba(24,40,88,0.92) 0%, rgba(8,14,32,0.99) 100%)",
    previewAccent1: "#f7dc8b",
    previewAccent2: "#ff5fa0",
    previewAccent3: "#a0bcff",
    dotBg:          "linear-gradient(135deg, #1c2e60 0%, #050e1e 100%)",
    activeBorder:   "rgba(247,210,72,0.72)",
    activeGlow:     "rgba(247,210,72,0.22)",
    labelColor:     "#f7dc8b",
    labelBg:        "rgba(247,210,72,0.10)",
  },
  {
    id:             "ice-silver",
    name:           "Ice Silver",
    keyword:        "COLD PRECISION",
    tagline:        "Clarity · Frost · Elegance",
    desc:           "The luminance of crystalline wealth. Cold as arctic steel — pure, transparent, and uncompromising in every detail.",
    previewBg:      "linear-gradient(135deg, #050c18 0%, #010408 100%)",
    previewCard:    "linear-gradient(160deg, rgba(20,32,64,0.90) 0%, rgba(6,12,30,0.99) 100%)",
    previewAccent1: "#c4d8f8",
    previewAccent2: "#88b4e0",
    previewAccent3: "#5880b8",
    dotBg:          "linear-gradient(135deg, #1a2848 0%, #070d1e 100%)",
    activeBorder:   "rgba(180,210,255,0.60)",
    activeGlow:     "rgba(180,210,255,0.18)",
    labelColor:     "#c4d8f8",
    labelBg:        "rgba(180,210,255,0.10)",
  },
  {
    id:             "emerald-gold",
    name:           "Emerald Gold",
    keyword:        "FOREST WEALTH",
    tagline:        "Growth · Mastery · Nature",
    desc:           "Ancient authority of rare earth. Emerald reserves run deep — where nature and capital converge, wealth compounds.",
    previewBg:      "linear-gradient(135deg, #020e08 0%, #010602 100%)",
    previewCard:    "linear-gradient(160deg, rgba(8,32,18,0.92) 0%, rgba(2,12,6,0.99) 100%)",
    previewAccent1: "#f7dc8b",
    previewAccent2: "#24c87a",
    previewAccent3: "#a0e0b8",
    dotBg:          "linear-gradient(135deg, #082010 0%, #020a04 100%)",
    activeBorder:   "rgba(36,200,100,0.60)",
    activeGlow:     "rgba(36,200,100,0.16)",
    labelColor:     "#24c87a",
    labelBg:        "rgba(36,200,100,0.10)",
  },
  {
    id:             "royal-violet",
    name:           "Royal Violet",
    keyword:        "SOVEREIGN VIOLET",
    tagline:        "Luxury · Mystery · Vision",
    desc:           "The deep royal purple of sovereign power. Velvet darkness with violet light — where ambition meets artistry.",
    previewBg:      "linear-gradient(135deg, #08041a 0%, #020108 100%)",
    previewCard:    "linear-gradient(160deg, rgba(32,12,80,0.88) 0%, rgba(10,2,28,0.99) 100%)",
    previewAccent1: "#c07cff",
    previewAccent2: "#d080ff",
    previewAccent3: "#9040e0",
    dotBg:          "linear-gradient(135deg, #1a0840 0%, #06021a 100%)",
    activeBorder:   "rgba(168,80,255,0.60)",
    activeGlow:     "rgba(168,80,255,0.18)",
    labelColor:     "#c07cff",
    labelBg:        "rgba(168,80,255,0.10)",
  },
];

/* ── Mini theme preview card ── */
function ThemePreview({ t, active, onClick }: {
  t: typeof THEMES[0]; active: boolean; onClick: () => void;
}) {
  const { t: lt } = useLang();
  return (
    <motion.div
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      data-testid={`theme-card-${t.id}`}
      style={{
        borderRadius: 24, overflow: "hidden", cursor: "pointer",
        border: `1.5px solid ${active ? t.activeBorder : "rgba(255,255,255,0.07)"}`,
        boxShadow: active
          ? `0 0 0 3px ${t.activeGlow}, 0 16px 48px rgba(0,0,0,0.40), inset 0 1px 0 rgba(255,255,255,0.06)`
          : "0 8px 28px rgba(0,0,0,0.30), inset 0 1px 0 rgba(255,255,255,0.04)",
        transition: "all 0.30s ease",
        position: "relative",
      }}
    >
      {/* ── Mini screen preview ── */}
      <div style={{ background: t.previewBg, padding: "16px 14px 14px", position: "relative" }}>
        {/* fake header row */}
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 12 }}>
          <div style={{
            width: 24, height: 24, borderRadius: "50%",
            background: "radial-gradient(circle at 35% 30%, rgba(140,200,240,0.60) 0%, rgba(20,50,90,1) 60%)",
            border: "1px solid rgba(247,210,72,0.50)",
          }} />
          <div style={{ flex: 1 }}>
            <div style={{
              height: 5, borderRadius: 3, width: "55%", marginBottom: 3,
              background: "rgba(255,255,255,0.22)",
            }} />
            <div style={{
              height: 4, borderRadius: 3, width: "35%",
              background: "rgba(255,255,255,0.12)",
            }} />
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {[t.previewAccent1, t.previewAccent2].map((col, i) => (
              <div key={i} style={{
                width: 18, height: 18, borderRadius: "50%",
                background: "rgba(255,255,255,0.08)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: col }} />
              </div>
            ))}
          </div>
        </div>

        {/* fake balance card */}
        <div style={{
          borderRadius: 14, padding: "10px 12px",
          background: t.previewCard,
          border: "1px solid rgba(255,255,255,0.10)",
          boxShadow: "0 8px 24px rgba(0,0,0,0.40)",
          marginBottom: 8,
        }}>
          <div style={{
            height: 4, borderRadius: 3, width: "52%",
            background: `linear-gradient(90deg, ${t.previewAccent1}66, ${t.previewAccent1}22)`,
            marginBottom: 8,
          }} />
          <div style={{
            height: 14, borderRadius: 4, width: "80%",
            background: `linear-gradient(90deg, ${t.previewAccent1}, ${t.previewAccent1}88)`,
            marginBottom: 10,
          }} />
          <div style={{ display: "flex", gap: 6 }}>
            <div style={{
              height: 20, flex: 1, borderRadius: 99,
              background: `linear-gradient(90deg, ${t.previewAccent1}dd, ${t.previewAccent1}99)`,
            }} />
            <div style={{
              height: 20, flex: 1, borderRadius: 99,
              border: `1px solid ${t.previewAccent1}88`,
              background: "transparent",
            }} />
          </div>
        </div>

        {/* fake quick tiles */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 5 }}>
          {[t.previewAccent1, t.previewAccent2, t.previewAccent3, t.previewAccent2].map((col, i) => (
            <div key={i} style={{
              height: 28, borderRadius: 8,
              background: `${col}22`,
              border: `1px solid ${col}44`,
            }} />
          ))}
        </div>
      </div>

      {/* ── Info panel ── */}
      <div style={{
        padding: "14px 16px 16px",
        background: "linear-gradient(180deg, rgba(18,26,52,0.99) 0%, rgba(10,14,30,1) 100%)",
        borderTop: "1px solid rgba(255,255,255,0.06)",
      }}>
        {/* keyword badge */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          padding: "4px 10px", borderRadius: 999,
          background: t.labelBg,
          border: `1px solid ${t.activeBorder}44`,
          marginBottom: 8,
        }}>
          <div style={{ width: 5, height: 5, borderRadius: "50%", background: t.labelColor }} />
          <span style={{
            fontSize: 11, fontWeight: 800, letterSpacing: 1.6,
            color: t.labelColor,
          }}>
            {t.keyword}
          </span>
        </div>

        <div style={{
          fontSize: 15, fontWeight: 700, marginBottom: 2,
          color: "#ffffff",
        }}>
          {t.name}
        </div>
        <div style={{
          fontSize: 12, fontWeight: 700, letterSpacing: 1.0, marginBottom: 8,
          color: "rgba(255,255,255,0.42)",
        }}>
          {t.tagline}
        </div>
        <div style={{
          fontSize: 12, lineHeight: 1.6,
          color: "rgba(255,255,255,0.52)",
        }}>
          {t.desc}
        </div>

        {/* active indicator */}
        {active && (
          <div style={{
            marginTop: 12, display: "flex", alignItems: "center", gap: 6,
            padding: "6px 12px", borderRadius: 99,
            background: t.labelBg, border: `1px solid ${t.activeBorder}66`,
            width: "fit-content",
          }}>
            <Check size={11} style={{ color: t.labelColor }} />
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.2, color: t.labelColor }}>
              {lt.active}
            </span>
          </div>
        )}
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
    try { return localStorage.getItem("finlys_roundup_enabled") === "true"; } catch { return false; }
  });
  const [offlineMode, setOfflineMode]           = useState(() => {
    try { return localStorage.getItem("finlys_offline_mode") === "true"; } catch { return false; }
  });

  const handleRoundupToggle = (val: boolean) => {
    setRoundupEnabled(val);
    localStorage.setItem("finlys_roundup_enabled", String(val));
    toast({
      title: "Preference Updated",
      description: val
        ? (lang === "pl" ? "Zaokrąglenie włączone" : "Round-up savings enabled")
        : (lang === "pl" ? "Zaokrąglenie wyłączone" : "Round-up savings disabled"),
    });
  };

  const handleOfflineModeToggle = (val: boolean) => {
    setOfflineMode(val);
    localStorage.setItem("finlys_offline_mode", String(val));
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
              <Switch checked={true} disabled />
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
