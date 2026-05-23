import { useLocation } from "wouter";
import { ArrowLeft, Bell, MessageSquare, CreditCard, FileText, Shield, Info, Moon, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useAppStore } from "@/lib/store";
import { motion } from "framer-motion";
import { useLang } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from(Array.from(rawData).map((c) => c.charCodeAt(0)));
}

async function doSubscribe(): Promise<boolean> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;
  const reg = await navigator.serviceWorker.ready;
  const res = await fetch("/api/push/vapid-public-key", { credentials: "include" });
  const { key } = await res.json();
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(key),
  });
  const json = sub.toJSON();
  if (!json.keys?.p256dh || !json.keys?.auth) return false;
  await fetch("/api/push/subscribe", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: sub.endpoint, keys: json.keys }),
  });
  return true;
}

async function doUnsubscribe(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await fetch("/api/push/unsubscribe", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  });
  await sub.unsubscribe();
}

type NotifCategory = "message" | "payment" | "contract" | "system" | "security";

interface CategoryPref {
  category: NotifCategory;
  inApp: boolean;
  push: boolean;
  quietStart: number | null;
  quietEnd: number | null;
}

const CATEGORY_META: {
  key: NotifCategory;
  Icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  labelKey: "notifMessages" | "notifPayments" | "notifContracts" | "notifSystem" | "notifSecurity";
  desc: string;
  canDisable: boolean;
}[] = [
  { key: "message",  Icon: MessageSquare, iconBg: "bg-blue-500/10",   iconColor: "text-blue-400",   labelKey: "notifMessages",  desc: "When you receive new messages",   canDisable: true  },
  { key: "payment",  Icon: CreditCard,    iconBg: "bg-primary/10",    iconColor: "text-primary",    labelKey: "notifPayments",  desc: "Transfers, top-ups and payments",  canDisable: false },
  { key: "contract", Icon: FileText,      iconBg: "bg-purple-500/10", iconColor: "text-purple-400", labelKey: "notifContracts", desc: "Contract status updates",          canDisable: true  },
  { key: "system",   Icon: Info,          iconBg: "bg-white/5",       iconColor: "text-white/60",   labelKey: "notifSystem",    desc: "App updates and information",      canDisable: true  },
  { key: "security", Icon: Shield,        iconBg: "bg-red-500/10",    iconColor: "text-red-400",    labelKey: "notifSecurity",  desc: "Login alerts and security events", canDisable: false },
];

const HOURS = Array.from({ length: 24 }, (_, i) => i);

function formatHour(h: number) {
  const ampm = h < 12 ? "AM" : "PM";
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${display}:00 ${ampm}`;
}

function MailIcon(props: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}

export default function Notifications() {
  const [, setLocation] = useLocation();
  const { user, updateSettings } = useAppStore();
  const { t } = useLang();
  const { theme } = useTheme();
  const { toast } = useToast();
  const isLight = (theme as string) === "arctic-platinum";
  const textPrimary = isLight ? "text-gray-900" : "text-white/90";

  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const pushSupported = "Notification" in window && "PushManager" in window;

  const [prefs, setPrefs] = useState<Record<NotifCategory, CategoryPref>>(() =>
    Object.fromEntries(
      CATEGORY_META.map(m => [m.key, { category: m.key, inApp: true, push: true, quietStart: null, quietEnd: null }])
    ) as Record<NotifCategory, CategoryPref>
  );
  const [prefsLoading, setPrefsLoading] = useState(false);
  const [showQuiet, setShowQuiet] = useState<NotifCategory | null>(null);
  const [importantOnlyInQuiet, setImportantOnlyInQuiet] = useState<boolean>(
    () => localStorage.getItem("notif_important_only_quiet") === "true"
  );
  const [dailySummary, setDailySummary] = useState<boolean>(
    () => localStorage.getItem("notif_daily_summary") === "true"
  );

  const persistGlobalPref = (patch: { importantOnlyInQuiet?: boolean; dailySummary?: boolean }) => {
    if (!user?.id) return;
    fetch(`/api/notification-preferences/${user.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ category: "system", ...patch }),
    }).catch(() => {});
  };

  const handleImportantOnlyInQuiet = (v: boolean) => {
    setImportantOnlyInQuiet(v);
    localStorage.setItem("notif_important_only_quiet", String(v));
    persistGlobalPref({ importantOnlyInQuiet: v });
  };

  const handleDailySummary = (v: boolean) => {
    setDailySummary(v);
    localStorage.setItem("notif_daily_summary", String(v));
    persistGlobalPref({ dailySummary: v });
  };

  useEffect(() => {
    if (!pushSupported || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.ready.then(reg =>
      reg.pushManager.getSubscription().then(sub => {
        setPushEnabled(!!sub && Notification.permission === "granted");
      })
    ).catch(() => {});
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    fetch(`/api/notification-preferences/${user.id}`, { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then((data: any[]) => {
        if (!Array.isArray(data)) return;
        setPrefs(prev => {
          const next = { ...prev };
          data.forEach(p => {
            const cat = p.category as NotifCategory;
            if (next[cat]) {
              next[cat] = {
                category: cat,
                inApp: p.in_app ?? p.inApp ?? true,
                push: p.push ?? true,
                quietStart: p.quiet_start ?? p.quietStart ?? null,
                quietEnd: p.quiet_end ?? p.quietEnd ?? null,
              };
            }
            // Load global quiet-mode settings from the "system" category row
            if (cat === "system") {
              if (p.important_only_in_quiet != null || p.importantOnlyInQuiet != null) {
                const serverVal = p.important_only_in_quiet ?? p.importantOnlyInQuiet ?? false;
                setImportantOnlyInQuiet(serverVal);
                localStorage.setItem("notif_important_only_quiet", String(serverVal));
              }
              if (p.daily_summary != null || p.dailySummary != null) {
                const serverVal = p.daily_summary ?? p.dailySummary ?? false;
                setDailySummary(serverVal);
                localStorage.setItem("notif_daily_summary", String(serverVal));
              }
            }
          });
          return next;
        });
      })
      .catch(() => {});
  }, [user?.id]);

  const savePref = async (category: NotifCategory, patch: Partial<CategoryPref>) => {
    if (!user?.id) return;
    const updated = { ...prefs[category], ...patch };
    setPrefs(prev => ({ ...prev, [category]: updated }));
    setPrefsLoading(true);
    try {
      await fetch(`/api/notification-preferences/${user.id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          inApp: updated.inApp,
          push: updated.push,
          quietStart: updated.quietStart ?? null,
          quietEnd: updated.quietEnd ?? null,
        }),
      });
      toast({ title: t.notifPrefsSaved });
    } catch {
      toast({ title: "Error", variant: "destructive" });
    } finally {
      setPrefsLoading(false);
    }
  };

  const togglePush = async (on: boolean) => {
    setPushLoading(true);
    try {
      if (on) {
        const ok = await doSubscribe();
        setPushEnabled(ok);
        if (ok) {
          updateSettings({ pushNotifications: true });
          toast({ title: "Push notifications enabled" });
        } else {
          toast({ title: "Permission denied", description: "Allow notifications in browser settings.", variant: "destructive" });
        }
      } else {
        await doUnsubscribe();
        setPushEnabled(false);
        updateSettings({ pushNotifications: false });
        toast({ title: "Push notifications disabled" });
      }
    } catch {
      toast({ title: "Error", variant: "destructive" });
    } finally {
      setPushLoading(false);
    }
  };

  const toggle = (key: keyof NonNullable<typeof user>["settings"]) => {
    if (!user?.settings) return;
    updateSettings({ [key]: !user.settings[key] });
  };

  return (
    <div className="min-h-screen bg-background pb-32 relative overflow-x-hidden">
      <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-primary/5 rounded-full blur-[100px] pointer-events-none" />

      <header className="px-6 pt-14 pb-6 flex items-center sticky top-0 bg-background/90 backdrop-blur-xl z-10 border-b border-border/50">
        <Button
          variant="ghost" size="icon"
          className="rounded-full bg-secondary border border-white/5 mr-4 hover:bg-secondary/80"
          onClick={() => setLocation("/profile")}
        >
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </Button>
        <h1 className={`text-2xl font-heading ${textPrimary}`}>Alert Preferences</h1>
      </header>

      <main className="px-6 py-8 space-y-8 relative z-10">

        {/* Delivery Channels */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
          <h2 className="text-[13px] font-bold uppercase tracking-[0.15em] text-primary/80 px-2">
            {t.notifDelivery}
          </h2>
          <div className="bg-card border border-white/5 rounded-3xl p-2 shadow-premium">
            <div className="p-5 flex items-center justify-between border-b border-white/5">
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 bg-secondary rounded-xl flex items-center justify-center text-primary border border-white/5">
                  <Bell className="w-5 h-5" />
                </div>
                <div>
                  <p className={`font-semibold text-[15px] ${textPrimary}`}>Push Alerts</p>
                  <p className="text-[13px] text-muted-foreground mt-0.5">
                    {!pushSupported
                      ? "Not supported in this browser"
                      : Notification.permission === "denied"
                      ? "Blocked in browser settings"
                      : "Chrome notifications even when app is closed"}
                  </p>
                </div>
              </div>
              <Switch
                checked={pushEnabled}
                onCheckedChange={togglePush}
                disabled={pushLoading || !pushSupported || Notification.permission === "denied"}
                data-testid="switch-push-notifications"
              />
            </div>
            <div className="p-5 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 bg-secondary rounded-xl flex items-center justify-center text-primary border border-white/5">
                  <MailIcon className="w-5 h-5" />
                </div>
                <div>
                  <p className={`font-semibold text-[15px] ${textPrimary}`}>Email Reports</p>
                  <p className="text-[13px] text-muted-foreground mt-0.5">Detailed weekly briefs</p>
                </div>
              </div>
              <Switch
                checked={user?.settings?.emailDigest}
                onCheckedChange={() => toggle("emailDigest")}
                data-testid="switch-email-digest"
              />
            </div>
          </div>
        </motion.div>

        {/* Global Quiet Mode Options */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }} className="space-y-3">
          <h2 className="text-[13px] font-bold uppercase tracking-[0.15em] text-primary/80 px-2">
            {t.notifQuietModeTitle}
          </h2>
          <div className="bg-card border border-white/5 rounded-3xl p-2 shadow-premium">
            <div className="p-5 flex items-center justify-between border-b border-white/5">
              <div>
                <p className={`font-semibold text-[14px] ${textPrimary}`}>{t.notifImportantOnly}</p>
                <p className="text-[13px] text-muted-foreground mt-0.5">{t.notifQuietModeDesc}</p>
              </div>
              <Switch
                checked={importantOnlyInQuiet}
                onCheckedChange={handleImportantOnlyInQuiet}
                data-testid="switch-important-only-quiet"
              />
            </div>
            <div className="p-5 flex items-center justify-between">
              <div>
                <p className={`font-semibold text-[14px] ${textPrimary}`}>{t.notifDailySummary}</p>
                <p className="text-[13px] text-muted-foreground mt-0.5">Receive a daily digest of all non-urgent notifications at 9:00 AM</p>
              </div>
              <Switch
                checked={dailySummary}
                onCheckedChange={handleDailySummary}
                data-testid="switch-daily-summary"
              />
            </div>
          </div>
        </motion.div>

        {/* Per-Category */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="space-y-3">
          <h2 className="text-[13px] font-bold uppercase tracking-[0.15em] text-primary/80 px-2">
            {t.notifPerCategory}
          </h2>
          <div className="bg-card border border-white/5 rounded-3xl p-2 shadow-premium">
            {CATEGORY_META.map((meta, idx) => {
              const pref = prefs[meta.key];
              const isLast = idx === CATEGORY_META.length - 1;
              const isShowingQuiet = showQuiet === meta.key;
              return (
                <div key={meta.key} className={!isLast ? "border-b border-white/5" : ""}>
                  <div className="p-4 flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center border border-white/5 shrink-0 ${meta.iconBg}`}>
                      <meta.Icon className={`w-4 h-4 ${meta.iconColor}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`font-semibold text-[14px] leading-snug ${textPrimary}`}>{t[meta.labelKey]}</p>
                      <p className="text-[13px] text-muted-foreground mt-0.5 leading-tight">{meta.desc}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-[13px] text-muted-foreground tracking-wider uppercase">{t.notifInApp}</span>
                        <Switch
                          checked={pref.inApp}
                          onCheckedChange={v => savePref(meta.key, { inApp: v })}
                          disabled={!meta.canDisable || prefsLoading}
                          data-testid={`switch-inapp-${meta.key}`}
                          className="scale-[0.75]"
                        />
                      </div>
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-[13px] text-muted-foreground tracking-wider uppercase">{t.notifPushToggle}</span>
                        <Switch
                          checked={pref.push}
                          onCheckedChange={v => savePref(meta.key, { push: v })}
                          disabled={!meta.canDisable || prefsLoading}
                          data-testid={`switch-push-${meta.key}`}
                          className="scale-[0.75]"
                        />
                      </div>
                      <button
                        onClick={() => setShowQuiet(isShowingQuiet ? null : meta.key)}
                        className={`w-8 h-8 rounded-xl flex items-center justify-center border transition-all ${
                          pref.quietStart != null
                            ? "bg-primary/15 border-primary/30 text-primary"
                            : "bg-secondary border-white/5 text-muted-foreground hover:text-foreground/70"
                        }`}
                        data-testid={`button-quiet-${meta.key}`}
                        title={t.notifQuietHoursTitle}
                      >
                        <Moon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {isShowingQuiet && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      className="px-4 pb-4"
                    >
                      <div className="bg-secondary/30 rounded-2xl p-4 border border-white/5">
                        <div className="flex items-center gap-2 mb-3">
                          <Clock className="w-3.5 h-3.5 text-primary" />
                          <span className="text-[13px] font-bold uppercase tracking-widest text-primary">{t.notifQuietHours}</span>
                          {pref.quietStart != null && (
                            <button
                              onClick={() => savePref(meta.key, { quietStart: null, quietEnd: null })}
                              className="ml-auto text-[12px] text-muted-foreground hover:text-red-400 transition-colors"
                            >
                              Clear
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-[12px] text-muted-foreground uppercase tracking-wider block mb-1.5">{t.notifQuietFrom}</label>
                            <select
                              value={pref.quietStart ?? ""}
                              onChange={e => savePref(meta.key, { quietStart: e.target.value !== "" ? parseInt(e.target.value) : null })}
                              className="w-full bg-background border border-white/10 rounded-xl px-3 py-2 text-sm text-foreground appearance-none focus:outline-none focus:border-primary/50"
                            >
                              <option value="">Off</option>
                              {HOURS.map(h => <option key={h} value={h}>{formatHour(h)}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="text-[12px] text-muted-foreground uppercase tracking-wider block mb-1.5">{t.notifQuietTo}</label>
                            <select
                              value={pref.quietEnd ?? ""}
                              onChange={e => savePref(meta.key, { quietEnd: e.target.value !== "" ? parseInt(e.target.value) : null })}
                              className="w-full bg-background border border-white/10 rounded-xl px-3 py-2 text-sm text-foreground appearance-none focus:outline-none focus:border-primary/50"
                            >
                              <option value="">Off</option>
                              {HOURS.map(h => <option key={h} value={h}>{formatHour(h)}</option>)}
                            </select>
                          </div>
                        </div>
                        {pref.quietStart != null && pref.quietEnd != null && (
                          <p className="text-[13px] text-muted-foreground mt-2">
                            Silent from {formatHour(pref.quietStart)} to {formatHour(pref.quietEnd)}
                          </p>
                        )}
                      </div>
                    </motion.div>
                  )}
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* Safety notice */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}>
          <div className="bg-amber-500/5 border border-amber-500/15 rounded-2xl p-4">
            <div className="flex gap-3 items-start">
              <Shield className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
              <p className="text-[12px] text-muted-foreground leading-relaxed">
                Payment and security notifications cannot be disabled — they are required for account safety and regulatory compliance.
              </p>
            </div>
          </div>
        </motion.div>

      </main>
    </div>
  );
}
