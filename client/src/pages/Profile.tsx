import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { User, Settings, Bell, Shield, LogOut, HelpCircle, ChevronRight, Sparkles, ArrowLeft, Users, Star } from "lucide-react";
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
        // Prefer separate counts (accurate), fall back to legacy recommendedPercent
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
      toast({ title: label, description: `The ${label.toLowerCase()} portal is coming soon.` });
    }
  };

  return (
    <div className="pb-28 min-h-screen bg-background relative overflow-hidden">
      <div className="absolute top-0 right-0 w-full h-[400px] bg-primary/5 blur-[120px] pointer-events-none"></div>

      <header className="px-6 pt-14 pb-10 relative z-10 flex flex-col items-center text-center">
        <div className="absolute top-14 left-6">
          <Button variant="ghost" size="icon" className="rounded-full bg-secondary border border-white/5 hover:bg-secondary/80" onClick={() => setLocation("/")}>
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </Button>
        </div>
        
        <div className="relative mb-6 mt-4">
          <div className="w-28 h-28 bg-gradient-to-br from-[#2A2A2A] to-[#0A0A0A] text-white text-4xl font-bold rounded-[2rem] flex items-center justify-center uppercase shadow-premium font-heading border border-white/10 relative overflow-hidden">
             {user?.avatar ? (
               <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
             ) : (
               <>
                 <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent"></div>
                 <span className="relative z-10">{user?.name?.charAt(0) || "U"}</span>
               </>
             )}
          </div>
          <div className="absolute -bottom-2 -right-2 w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-lg border border-primary-foreground/20 rotate-12">
            <Sparkles className="w-5 h-5 text-primary-foreground" />
          </div>
        </div>
        <h2 className="text-3xl font-heading mb-1" style={{ color: th.textPrimary }}>{user?.name || "Client"}</h2>
        <UserHandleText handle={visibleHandle} className="mt-1 text-muted-foreground" />
        <p className="text-muted-foreground text-sm font-medium tracking-wide">{user?.email}</p>
        
        <div className="mt-6 inline-flex items-center gap-2 px-5 py-2 bg-secondary border border-white/5 rounded-full text-[12px] font-bold uppercase tracking-[0.15em] text-primary shadow-inner-glow">
          {lang === "pl" ? "Klient Prywatny" : "Private Member"}
        </div>
      </header>

      <main className="px-6 space-y-6 relative z-10">
        {/* Reputation card */}
        {(() => {
          const level = computeLevel(myProfile?.completedAgreements ?? 0, myProfile?.ratingAverage ?? null);
          const lColor = levelColor(level);
          return (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              data-testid="card-reputation"
              className="bg-card border border-white/5 rounded-3xl p-5"
            >
              <div className="flex items-center justify-between mb-4">
                <p className="text-[13px] font-bold uppercase tracking-widest text-muted-foreground">{t.reputationSection}</p>
                <span
                  data-testid="badge-my-level"
                  style={{
                    fontSize: 12, fontWeight: 800, letterSpacing: "0.07em", textTransform: "uppercase",
                    color: lColor, background: `${lColor}18`,
                    border: `1px solid ${lColor}35`, borderRadius: 999, padding: "3px 10px",
                  }}
                >
                  {levelLabel(level)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-secondary/40 rounded-2xl p-3 flex flex-col items-center gap-1">
                  <div className="flex items-center gap-0.5">
                    <Star size={12} fill="#f59e0b" stroke="#f59e0b" />
                    <span data-testid="text-my-rating-avg" className="text-base font-heading text-white">
                      {myProfile?.ratingAverage != null ? myProfile.ratingAverage.toFixed(1) : "—"}
                    </span>
                  </div>
                  <p className="text-[12px] text-muted-foreground/60 text-center">{t.ratingAvg}</p>
                </div>

                <div className="bg-secondary/40 rounded-2xl p-3 flex flex-col items-center gap-1">
                  <span data-testid="text-my-rating-count" className="text-base font-heading text-white">
                    {myProfile?.ratingCount ?? 0}
                  </span>
                  <p className="text-[12px] text-muted-foreground/60 text-center">{t.ratingCount}</p>
                </div>

                <div className="bg-secondary/40 rounded-2xl p-3 flex flex-col items-center gap-1">
                  <span data-testid="text-my-recommended" className="text-base font-heading text-white">
                    {myProfile?.recommendedPercent != null ? `${myProfile.recommendedPercent}%` : "—"}
                  </span>
                  <p className="text-[12px] text-muted-foreground/60 text-center">{t.ratingRecommended}</p>
                </div>

                <div className="bg-secondary/40 rounded-2xl p-3 flex flex-col items-center gap-1">
                  <span data-testid="text-my-completed-agreements" className="text-base font-heading text-white">
                    {myProfile?.completedAgreements ?? 0}
                  </span>
                  <p className="text-[12px] text-muted-foreground/60 text-center">{t.ratingCompletedAgreements}</p>
                </div>
              </div>

              {(!myProfile || myProfile.ratingCount === 0) && (
                <p className="text-[12px] text-muted-foreground/50 text-center mt-3">
                  {t.ratingBuildReputation}
                </p>
              )}
            </motion.div>
          );
        })()}

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="bg-card rounded-3xl p-2 border border-white/5 shadow-sm"
        >
          {[
            { icon: User, label: "Identity & Profile", route: "/profile/account" },
            { icon: Settings, label: "App Preferences", route: "/profile/preferences" },
            { icon: Shield, label: "Security & Access", route: "/profile/security" },
          ].map((item, i, arr) => (
            <div 
              key={i}
              data-testid={`profile-menu-${i}`}
              onClick={() => handleAction(item.route, item.label)}
              className={`p-4 flex items-center justify-between cursor-pointer hover:bg-secondary transition-colors rounded-2xl group ${i !== arr.length - 1 ? 'border-b border-border/20 rounded-b-none mb-1' : ''}`}
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-secondary rounded-xl flex items-center justify-center text-primary border border-border/20 group-hover:scale-105 transition-transform">
                  <item.icon className="w-5 h-5" />
                </div>
                <span className="font-semibold text-[15px]" style={{ color: th.textPrimary }}>{item.label}</span>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
            </div>
          ))}
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="bg-card rounded-3xl p-2 border border-white/5 shadow-sm"
        >
          {[
            ...(isAdmin ? [{ icon: Users, label: "Katalog użytkowników", route: "/users" }] : []),
            { icon: Bell, label: "Alerts & Notifications", route: "/profile/notifications" },
            { icon: HelpCircle, label: "Concierge Support", route: "/profile/support" },
          ].map((item, i, arr) => (
            <div 
              key={i}
              data-testid={`profile-menu-b-${i}`}
              onClick={() => handleAction(item.route, item.label)}
              className={`p-4 flex items-center justify-between cursor-pointer hover:bg-secondary transition-colors rounded-2xl group ${i !== arr.length - 1 ? 'border-b border-border/20 rounded-b-none mb-1' : ''}`}
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-secondary rounded-xl flex items-center justify-center text-primary border border-border/20 group-hover:scale-105 transition-transform">
                  <item.icon className="w-5 h-5" />
                </div>
                <span className="font-semibold text-[15px]" style={{ color: th.textPrimary }}>{item.label}</span>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
            </div>
          ))}
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="space-y-4"
        >
          {isAdmin && (
            <>
              <AdminQuickPanel
                loading={adminStats.loading}
                error={adminStats.error}
                totalUsers={adminStats.totalUsers}
                onlineUsers={adminStats.onlineUsers}
                users={adminStats.users}
                reload={adminStats.reload}
              />
              <button 
                onClick={() => setLocation("/admin")}
                className="w-full bg-red-500/10 rounded-3xl p-4 flex items-center justify-center gap-3 border border-red-500/20 text-red-500 hover:bg-red-500/20 transition-colors font-semibold uppercase tracking-widest text-[13px] group"
              >
                <Shield className="w-4 h-4" />
                Admin Console
              </button>
            </>
          )}

          <button 
            onClick={handleLogout}
            className="w-full bg-card rounded-3xl p-4 flex items-center justify-center gap-3 border border-white/5 text-destructive hover:bg-destructive/10 transition-colors font-semibold uppercase tracking-widest text-[13px] group"
          >
            <LogOut className="w-4 h-4" />
            Secure Disconnect
          </button>
        </motion.div>
      </main>
    </div>
  );
}