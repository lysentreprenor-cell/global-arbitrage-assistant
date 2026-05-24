import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { User, Settings, Bell, Shield, LogOut, HelpCircle, ChevronRight, Sparkles, ArrowLeft, Users, Star, SplitSquareHorizontal, RefreshCw, PiggyBank, BadgeCheck, Gift, CreditCard, Lock, Palette, History, Banknote } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/context/ThemeContext";
import { useLang } from "@/context/LanguageContext";
import { useProfileOverview } from "@/hooks/useProfileOverview";
import UserHandleText from "@/components/UserHandleText";
import { useAdminStats } from "@/hooks/useAdminStats";
import AdminQuickPanel from "@/components/AdminQuickPanel";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { ref as dbRef, onValue, off } from "firebase/database";
import { realtimeDb } from "@/lib/firebase";

export default function Profile() {
  const [, setLocation] = useLocation();
  const { user, logout } = useAppStore();
  const { toast } = useToast();
  const { th } = useTheme();
  const { lang, t } = useLang();
  const profileOverview = useProfileOverview();
  const visibleHandle = profileOverview?.userHandle || user?.handle || "";

  const { isAdmin } = useAdminAccess();
  const adminStats = useAdminStats();
  const isMounted = useRef(true);

  const [myProfile, setMyProfile] = useState<{
    ratingAverage: number | null;
    ratingCount: number;
    recommendedPercent: number | null;
    completedAgreements: number;
  } | null>(null);

  useEffect(() => {
    isMounted.current = true;
    if (!user?.id) return;
    const profileRef = dbRef(realtimeDb, `users/${user.id}/profile`);
    onValue(profileRef, snap => {
      if (!isMounted.current) return;
      if (snap.exists()) {
        const p = snap.val() as {
          ratingAverage?: number;
          ratingCount?: number;
          recommendedYesCount?: number;
          recommendedCount?: number;
          recommendedPercent?: number;
          completedAgreements?: number;
        };
        let recommendedPercent: number | null = null;
        if ((p.recommendedCount ?? 0) > 0) {
          recommendedPercent = Math.round(((p.recommendedYesCount ?? 0) / p.recommendedCount!) * 100);
        } else if (p.recommendedPercent != null) {
          recommendedPercent = p.recommendedPercent;
        }
        setMyProfile({
          ratingAverage: p.ratingAverage ?? null,
          ratingCount: p.ratingCount ?? 0,
          recommendedPercent,
          completedAgreements: p.completedAgreements ?? 0,
        });
      }
    });
    return () => {
      isMounted.current = false;
      off(profileRef);
    };
  }, [user?.id]);

  const computeLevel = (completedAgreements: number, ratingAverage: number | null): string => {
    if (completedAgreements >= 25 && (ratingAverage ?? 0) >= 4.8) return "super";
    if (completedAgreements >= 10 && (ratingAverage ?? 0) >= 4.7) return "top";
    if (completedAgreements >= 3  && (ratingAverage ?? 0) >= 4.5) return "trusted";
    if (user?.emailVerified) return "verified";
    return "new";
  };

  const levelLabel = (level: string): string => {
    const map: Record<string, string> = {
      super: t.levelSuper, top: t.levelTop, trusted: t.levelTrusted,
      verified: t.levelVerified, new: t.levelNew,
    };
    return map[level] ?? level;
  };

  const levelColor = (level: string): string => {
    const map: Record<string, string> = {
      super: "#f59e0b", top: "#a855f7", trusted: "#3b82f6",
      verified: "#22c55e", new: "rgba(255,255,255,0.4)",
    };
    return map[level] ?? "rgba(255,255,255,0.4)";
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch {}
    logout();
    setLocation("/auth");
  };

  const handleAction = (route: string, label: string) => {
    if (route.startsWith("/")) {
      setLocation(route);
    } else {
      toast({ title: label, description: `${label} — wkrótce dostępne.` });
    }
  };

  const pl = lang === "pl";
  const level = computeLevel(myProfile?.completedAgreements ?? 0, myProfile?.ratingAverage ?? null);
  const lColor = levelColor(level);

  const settingsItems = [
    { icon: User,        label: pl ? "Profil i dane konta"     : "Identity & Profile",     route: "/profile/account" },
    { icon: Palette,     label: pl ? "Wygląd i preferencje"    : "App Preferences",        route: "/profile/preferences" },
    { icon: Lock,        label: pl ? "Bezpieczeństwo i PIN"    : "Security & Access",      route: "/profile/security" },
    { icon: Bell,        label: pl ? "Powiadomienia"           : "Alerts & Notifications", route: "/profile/notifications" },
    { icon: CreditCard,  label: pl ? "Karty płatnicze"         : "Payment Cards",          route: "/cards" },
    { icon: History,     label: pl ? "Historia transakcji"     : "Transaction History",    route: "/history" },
    { icon: BadgeCheck,  label: pl ? "Weryfikacja tożsamości"  : "Identity Verification",  route: "/kyc",
      badge: (() => { try { return localStorage.getItem("finlys_kyc") ? (pl ? "Zweryfikowany ✓" : "Verified ✓") : null; } catch { return null; } })() },
    { icon: Gift,        label: pl ? "Program poleceń"         : "Referral Program",       route: "/referral" },
    { icon: HelpCircle,  label: pl ? "Pomoc i wsparcie"        : "Help & Support",         route: "/profile/support" },
  ];

  const financialItems = [
    { icon: Banknote,              label: pl ? "Pożyczka P2P"          : "P2P Loan",            route: "/transfer/loan" },
    { icon: SplitSquareHorizontal, label: pl ? "Podziel rachunek"      : "Split Bill",          route: "/split" },
    { icon: RefreshCw,             label: pl ? "Zlecenia stałe"        : "Recurring Payments",  route: "/recurring" },
    { icon: PiggyBank,             label: pl ? "Cele oszczędnościowe"  : "Savings Goals",       route: "/savings" },
  ];

  return (
    <div className="pb-28 min-h-screen bg-background relative overflow-x-hidden">
      <div className="absolute top-0 right-0 w-full h-[400px] bg-primary/5 blur-[120px] pointer-events-none" />

      {/* ── Header ── */}
      <header className="px-6 pt-14 pb-8 relative z-10 flex flex-col items-center text-center">
        <div className="absolute top-14 left-6">
          <Button variant="ghost" size="icon" className="rounded-full bg-secondary border border-white/5 hover:bg-secondary/80" onClick={() => setLocation("/")}>
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </Button>
        </div>

        <div className="relative mb-5 mt-4">
          <div className="w-28 h-28 bg-gradient-to-br from-[#2A2A2A] to-[#0A0A0A] text-white text-4xl font-bold rounded-[2rem] flex items-center justify-center uppercase shadow-premium font-heading border border-white/10 relative overflow-hidden">
            {user?.avatar ? (
              <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
            ) : (
              <>
                <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent" />
                <span className="relative z-10">{user?.name?.charAt(0) || "U"}</span>
              </>
            )}
          </div>
          <div className="absolute -bottom-2 -right-2 w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-lg border border-primary-foreground/20 rotate-12">
            <Sparkles className="w-5 h-5 text-primary-foreground" />
          </div>
        </div>

        <h2 className="text-3xl font-heading mb-1" style={{ color: th.textPrimary }}>{user?.name || "Klient"}</h2>
        <UserHandleText handle={visibleHandle} className="mt-1 text-muted-foreground" />
        <p className="text-muted-foreground text-sm font-medium mt-0.5">{user?.email}</p>

        <div className="mt-4 inline-flex items-center gap-2 px-5 py-2 bg-secondary border border-white/5 rounded-full text-[12px] font-bold uppercase tracking-[0.15em] text-primary shadow-inner-glow">
          {pl ? "Klient Prywatny" : "Private Member"}
        </div>

        {/* Poziom reputacji pod avatarem */}
        <div className="mt-3" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: 999, background: `${lColor}14`, border: `1px solid ${lColor}30` }}>
          <Star size={11} fill={lColor} stroke={lColor} />
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", color: lColor }}>{levelLabel(level)}</span>
        </div>
      </header>

      <main className="px-6 space-y-4 relative z-10">

        {/* ── Reputacja ── */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
          data-testid="card-reputation" className="bg-card border border-white/5 rounded-3xl p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[12px] font-bold uppercase tracking-widest text-muted-foreground">{t.reputationSection}</p>
            <span data-testid="badge-my-level" style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.07em", textTransform: "uppercase", color: lColor, background: `${lColor}18`, border: `1px solid ${lColor}35`, borderRadius: 999, padding: "3px 10px" }}>
              {levelLabel(level)}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { value: myProfile?.ratingAverage != null ? myProfile.ratingAverage.toFixed(1) : "—", label: t.ratingAvg, icon: <Star size={11} fill="#f59e0b" stroke="#f59e0b" /> },
              { value: myProfile?.ratingCount ?? 0, label: t.ratingCount },
              { value: myProfile?.recommendedPercent != null ? `${myProfile.recommendedPercent}%` : "—", label: t.ratingRecommended },
              { value: myProfile?.completedAgreements ?? 0, label: t.ratingCompletedAgreements },
            ].map((s, i) => (
              <div key={i} className="bg-secondary/40 rounded-2xl p-3 flex flex-col items-center gap-1">
                <div className="flex items-center gap-0.5">
                  {s.icon}
                  <span className="text-base font-heading text-white">{s.value}</span>
                </div>
                <p className="text-[11px] text-muted-foreground/60 text-center">{s.label}</p>
              </div>
            ))}
          </div>
          {(!myProfile || myProfile.ratingCount === 0) && (
            <p className="text-[11px] text-muted-foreground/50 text-center mt-3">{t.ratingBuildReputation}</p>
          )}
        </motion.div>

        {/* ── Ustawienia ── */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
          <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-2 px-1">{pl ? "Ustawienia" : "Settings"}</p>
          <div className="bg-card rounded-3xl p-2 border border-white/5">
            {settingsItems.map((item, i, arr) => (
              <div key={i} data-testid={`profile-settings-${i}`} onClick={() => handleAction(item.route, item.label)}
                className={`p-4 flex items-center justify-between cursor-pointer hover:bg-secondary transition-colors rounded-2xl group ${i !== arr.length - 1 ? "border-b border-border/20 rounded-b-none mb-0.5" : ""}`}>
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 bg-secondary rounded-xl flex items-center justify-center text-primary border border-border/20 group-hover:scale-105 transition-transform">
                    <item.icon className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="font-semibold text-[14px]" style={{ color: th.textPrimary }}>{item.label}</span>
                    {item.badge && (
                      <span className="ml-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/20">{item.badge}</span>
                    )}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground opacity-40 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
              </div>
            ))}
          </div>
        </motion.div>

        {/* ── Narzędzia finansowe ── */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-2 px-1">{pl ? "Narzędzia" : "Tools"}</p>
          <div className="bg-card rounded-3xl p-2 border border-white/5">
            {financialItems.map((item, i, arr) => (
              <div key={i} onClick={() => handleAction(item.route, item.label)}
                className={`p-4 flex items-center justify-between cursor-pointer hover:bg-secondary transition-colors rounded-2xl group ${i !== arr.length - 1 ? "border-b border-border/20 rounded-b-none mb-0.5" : ""}`}>
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 bg-secondary rounded-xl flex items-center justify-center text-primary border border-border/20 group-hover:scale-105 transition-transform">
                    <item.icon className="w-5 h-5" />
                  </div>
                  <span className="font-semibold text-[14px]" style={{ color: th.textPrimary }}>{item.label}</span>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground opacity-40 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
              </div>
            ))}
          </div>
        </motion.div>

        {/* ── Admin ── */}
        {isAdmin && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground px-1">Admin</p>
            <AdminQuickPanel loading={adminStats.loading} error={adminStats.error} totalUsers={adminStats.totalUsers} onlineUsers={adminStats.onlineUsers} users={adminStats.users} reload={adminStats.reload} />
            <div onClick={() => setLocation("/users")} className="bg-card rounded-2xl p-4 flex items-center justify-between cursor-pointer hover:bg-secondary border border-white/5 group">
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 bg-secondary rounded-xl flex items-center justify-center text-primary border border-border/20"><Users className="w-5 h-5" /></div>
                <span className="font-semibold text-[14px]" style={{ color: th.textPrimary }}>Katalog użytkowników</span>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground opacity-40 group-hover:opacity-100" />
            </div>
            <button onClick={() => setLocation("/admin")} className="w-full bg-red-500/10 rounded-3xl p-4 flex items-center justify-center gap-3 border border-red-500/20 text-red-500 hover:bg-red-500/20 transition-colors font-semibold uppercase tracking-widest text-[12px]">
              <Shield className="w-4 h-4" /> Admin Console
            </button>
          </motion.div>
        )}

        {/* ── Wyloguj ── */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}>
          <button onClick={handleLogout} className="w-full bg-card rounded-3xl p-4 flex items-center justify-center gap-3 border border-white/5 text-destructive hover:bg-destructive/10 transition-colors font-semibold uppercase tracking-widest text-[12px]">
            <LogOut className="w-4 h-4" />
            {pl ? "Wyloguj się" : "Sign Out"}
          </button>
        </motion.div>

      </main>
    </div>
  );
}
