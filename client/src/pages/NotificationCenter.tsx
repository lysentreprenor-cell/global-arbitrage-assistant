import { useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft, Bell, MessageSquare, CreditCard, FileText, Shield, Info,
  ArrowUpRight, Trash2, BellOff, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/lib/store";
import { useFeatures } from "@/hooks/useFeatures";
import { motion, AnimatePresence } from "framer-motion";
import { useNotificationsSummary } from "@/hooks/useNotificationsSummary";
import { useNotifications } from "@/hooks/useNotifications";
import type { Notification } from "@/hooks/useNotifications";
import { useLang } from "@/context/LanguageContext";
import { useToast } from "@/hooks/use-toast";

type NotifCategory = "all" | "message" | "payment" | "contract" | "system" | "security";
type StatusFilter = "all" | "new" | "important";

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  message:  MessageSquare,
  payment:  CreditCard,
  contract: FileText,
  system:   Info,
  security: Shield,
};

const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string; glow: string }> = {
  message:  { bg: "bg-blue-500/10",   text: "text-blue-400",   border: "border-blue-500/20",   glow: "bg-blue-500/5" },
  payment:  { bg: "bg-primary/10",    text: "text-primary",    border: "border-primary/20",    glow: "bg-primary/8" },
  contract: { bg: "bg-purple-500/10", text: "text-purple-400", border: "border-purple-500/20", glow: "bg-purple-500/5" },
  system:   { bg: "bg-white/5",       text: "text-white/60",   border: "border-white/10",      glow: "bg-white/3" },
  security: { bg: "bg-red-500/10",    text: "text-red-400",    border: "border-red-500/20",    glow: "bg-red-500/5" },
};

const PRIORITY_DOTS: Record<string, string> = {
  critical: "bg-red-500",
  high:     "bg-amber-400",
  normal:   "bg-primary",
  low:      "bg-muted-foreground/30",
};

function getTypeCategory(notif: Notification): string {
  if (notif.category) return notif.category;
  if (notif.type === "transfer") return "payment";
  if (notif.type === "alert") return "security";
  if (notif.type === "success") return "system";
  return "system";
}

function getTypePriority(notif: Notification): string {
  if (notif.priority) return notif.priority;
  if (notif.type === "alert") return "high";
  return "normal";
}

function formatDate(date: string | Date) {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMs / 3600000);
  const diffD = Math.floor(diffMs / 86400000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffH < 24) return `${diffH}h ago`;
  if (diffD < 7) return `${diffD}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function NotificationCenter() {
  const [, setLocation] = useLocation();
  const { markAsRead, markAllAsRead, removeNotification, user } = useAppStore();
  const { isEnabled } = useFeatures();
  const notifSummary = useNotificationsSummary();
  // Primary data source: React Query polling (30s interval)
  const { notifications: rqNotifications, isLoading, markRead: rqMarkRead, markAllRead: rqMarkAllRead, deleteNotif: rqDelete } = useNotifications();
  const { t } = useLang();
  const { toast } = useToast();
  const [activeFilter, setActiveFilter] = useState<NotifCategory>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Use React Query data as the authoritative source
  const notifications = rqNotifications;

  if (!isEnabled("notifications")) {
    setLocation("/");
    return null;
  }

  const filters: { key: NotifCategory; label: string }[] = [
    { key: "all",      label: t.notifAll },
    { key: "message",  label: t.notifMessages },
    { key: "payment",  label: t.notifPayments },
    { key: "contract", label: t.notifContracts },
    { key: "security", label: t.notifSecurity },
    { key: "system",   label: t.notifSystem },
  ];

  const categoryFiltered = activeFilter === "all"
    ? notifications
    : notifications.filter(n => getTypeCategory(n) === activeFilter);

  const filtered = statusFilter === "all"
    ? categoryFiltered
    : statusFilter === "new"
      ? categoryFiltered.filter(n => !n.read)
      : categoryFiltered.filter(n => {
          const p = getTypePriority(n);
          return p === "high" || p === "critical";
        });

  const countForFilter = (key: NotifCategory) =>
    key === "all"
      ? notifications.filter(n => !n.read).length
      : notifications.filter(n => !n.read && getTypeCategory(n) === key).length;

  const handleClick = (notif: Notification) => {
    if (!notif.read) {
      // Update both the query cache and the store
      rqMarkRead(notif.id);
      markAsRead(notif.id);
    }
    const route = notif.route;
    if (route) setLocation(route);
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDeletingId(id);
    // Use React Query mutation — it invalidates the cache after success
    rqDelete(id, {
      onSuccess: () => {
        removeNotification(id);
        setDeletingId(null);
      },
      onError: () => {
        toast({ title: "Error", variant: "destructive" });
        setDeletingId(null);
      },
    });
  };

  const handleMarkAllRead = () => {
    // Use React Query mutation — it invalidates the cache after success
    rqMarkAllRead(undefined, { onSuccess: () => markAllAsRead() });
  };

  // Compute unread from the local React Query data (authoritative for this page)
  // Do NOT use notifSummary (badge context) — it is reset to 0 on /notifications
  const unreadTotal = rqNotifications.filter(n => !n.read).length;

  return (
    <div className="min-h-screen bg-background pb-32 relative overflow-hidden flex flex-col">
      <div className="absolute top-[-10%] right-[-10%] w-[350px] h-[350px] bg-primary/8 rounded-full blur-[100px] pointer-events-none" />

      {/* Header */}
      <header className="px-6 pt-14 pb-0 sticky top-0 bg-background/90 backdrop-blur-xl z-20 border-b border-white/5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost" size="icon"
              className="rounded-full bg-secondary border border-white/5 hover:bg-secondary/80"
              onClick={() => setLocation("/")}
            >
              <ArrowLeft className="w-5 h-5 text-foreground" />
            </Button>
            <div>
              <h1 className="text-2xl font-heading text-white/90">Alerts</h1>
              {unreadTotal > 0 && (
                <p className="text-[12px] text-muted-foreground font-medium tracking-widest uppercase">
                  {unreadTotal} unread
                </p>
              )}
            </div>
          </div>
          {unreadTotal > 0 && (
            <Button
              variant="ghost"
              onClick={handleMarkAllRead}
              className="text-primary hover:bg-primary/10 hover:text-primary px-3 rounded-full text-[12px] font-bold tracking-widest uppercase"
              data-testid="button-mark-all-read"
            >
              {t.notifMarkAllRead}
            </Button>
          )}
        </div>

        {/* Status filter pills */}
        <div className="flex gap-1.5 mb-2">
          {(["all", "new", "important"] as StatusFilter[]).map(sf => (
            <button
              key={sf}
              data-testid={`tab-status-${sf}`}
              onClick={() => setStatusFilter(sf)}
              className={`h-7 px-3 rounded-full text-[12px] font-bold tracking-widest uppercase transition-all
                ${statusFilter === sf
                  ? sf === "new"
                    ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                    : sf === "important"
                      ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                      : "bg-primary/15 text-primary border border-primary/30"
                  : "bg-secondary/40 text-muted-foreground border border-white/5 hover:border-white/10"
                }`}
            >
              {sf === "all" ? t.notifFilterAll : sf === "new" ? t.notifFilterNew : t.notifFilterImportant}
            </button>
          ))}
        </div>

        {/* Category filter tabs */}
        <div className="flex gap-2 overflow-x-auto pb-3 scrollbar-hide -mx-1 px-1">
          {filters.map(f => {
            const count = countForFilter(f.key);
            const isActive = activeFilter === f.key;
            return (
              <button
                key={f.key}
                data-testid={`tab-notif-${f.key}`}
                onClick={() => setActiveFilter(f.key)}
                className={`flex items-center gap-1.5 rounded-full h-8 px-3.5 text-[13px] font-semibold whitespace-nowrap flex-shrink-0 transition-all
                  ${isActive
                    ? "bg-primary/15 text-primary border border-primary/30"
                    : "bg-secondary/60 text-muted-foreground border border-white/5 hover:border-white/10 hover:text-foreground/70"
                  }`}
              >
                {f.label}
                {count > 0 && (
                  <span className={`w-4 h-4 rounded-full text-[12px] font-bold flex items-center justify-center ${
                    isActive ? "bg-primary text-white" : "bg-white/10 text-muted-foreground"
                  }`}>
                    {count > 9 ? "9+" : count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </header>

      {/* Content */}
      <main className="px-5 py-5 relative z-10 flex-1">
        <AnimatePresence mode="popLayout">
          {filtered.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-24 text-center"
            >
              <div className="w-20 h-20 bg-secondary rounded-full flex items-center justify-center mb-6 border border-white/5">
                <BellOff className="w-8 h-8 text-muted-foreground/40" />
              </div>
              <h3 className="text-xl font-heading text-white/80 mb-2">{t.notifEmpty}</h3>
              <p className="text-muted-foreground max-w-[220px] text-sm">{t.notifEmptyDesc}</p>
            </motion.div>
          ) : (
            <div className="space-y-3">
              {filtered.map((notif, index) => {
                const cat = getTypeCategory(notif);
                const priority = getTypePriority(notif);
                const colors = CATEGORY_COLORS[cat] ?? CATEGORY_COLORS.system;
                const IconComp = CATEGORY_ICONS[cat] ?? Info;
                const priorityDotClass = PRIORITY_DOTS[priority] ?? PRIORITY_DOTS.normal;
                const hasRoute = !!notif.route;
                return (
                  <motion.div
                    key={notif.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: deletingId === notif.id ? 0 : 1, y: 0 }}
                    exit={{ opacity: 0, x: -40 }}
                    transition={{ delay: index * 0.03 }}
                    onClick={() => handleClick(notif)}
                    data-testid={`card-notification-${notif.id}`}
                    className={`relative overflow-hidden rounded-3xl border transition-all cursor-pointer group ${
                      notif.read
                        ? "bg-card border-white/5 opacity-75"
                        : "bg-card border-primary/25 shadow-premium"
                    }`}
                  >
                    {/* Unread ambient glow */}
                    {!notif.read && (
                      <div className={`absolute top-0 right-0 w-32 h-32 ${colors.glow} rounded-full blur-2xl pointer-events-none -mr-12 -mt-12`} />
                    )}

                    <div className="flex gap-4 p-4 relative z-10">
                      {/* Category icon */}
                      <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border ${colors.bg} ${colors.border}`}>
                        <IconComp className={`w-5 h-5 ${colors.text}`} />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-0.5">
                          <h4 className={`font-semibold text-[14px] leading-snug ${notif.read ? "text-white/65" : "text-white/90"}`}>
                            {notif.title}
                          </h4>
                          {!notif.read && (
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${priorityDotClass}`} />
                          )}
                        </div>
                        <p className={`text-sm leading-relaxed ${notif.read ? "text-muted-foreground" : "text-white/72"}`}>
                          {notif.message}
                        </p>
                        <div className="flex items-center justify-between mt-2.5">
                          <div className="flex items-center gap-2">
                            <span className={`text-[12px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full border ${colors.bg} ${colors.text} ${colors.border}`}>
                              {cat}
                            </span>
                            <span className="text-[12px] text-muted-foreground">
                              {formatDate(notif.date)}
                            </span>
                          </div>
                          {hasRoute && (
                            <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-primary transition-colors" />
                          )}
                        </div>
                      </div>

                      {/* Delete button */}
                      <button
                        onClick={(e) => handleDelete(e, notif.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-xl hover:bg-red-500/15 text-muted-foreground hover:text-red-400 self-start shrink-0 -mr-1 -mt-0.5"
                        data-testid={`button-delete-notif-${notif.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
