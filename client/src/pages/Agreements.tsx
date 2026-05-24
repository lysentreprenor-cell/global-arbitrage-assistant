import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Plus, FileText, Clock, AlertCircle, CheckCircle2, Loader2, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { ref, onValue, off } from "firebase/database";
import { realtimeDb } from "@/lib/firebase";
import { useAppStore, formatMoney, type CurrencyCode } from "@/lib/store";
import { useLang } from "@/context/LanguageContext";
import { useNotificationsSummary } from "@/hooks/useNotificationsSummary";
import { useTheme } from "@/context/ThemeContext";

export type AgreementStatus =
  | "pending_acceptance"
  | "accepted"
  | "funded"
  | "in_progress"
  | "submitted"
  | "completed"
  | "released"
  | "disputed"
  | "cancelled";

export type AgreementAcceptance = {
  creatorAccepted?: boolean;
  creatorAcceptedAt?: string;
  workerAccepted?: boolean;
  workerAcceptedAt?: string;
};

export type Agreement = {
  id: string;
  title: string;
  description: string;
  category: string;
  creatorUid: string;
  creatorName: string;
  workerUid: string;
  workerName: string;
  amount: number;
  currency: CurrencyCode;
  deadline: string;
  terms: string;
  proofPhoto: boolean;
  proofNote: boolean;
  completionCriteria?: string | null;
  acceptance?: AgreementAcceptance;
  status: AgreementStatus;
  conversationId?: string;
  createdAt: string;
  updatedAt: string;
};

const ACTIVE_STATUSES: AgreementStatus[] = ["pending_acceptance", "accepted", "funded", "in_progress", "submitted"];
const CONFIRM_STATUSES: AgreementStatus[] = ["submitted"];
const DONE_STATUSES: AgreementStatus[] = ["completed", "released"];
const DISPUTE_STATUSES: AgreementStatus[] = ["disputed"];

export function statusLabel(status: AgreementStatus, t: Record<string, string>): string {
  const map: Record<AgreementStatus, string> = {
    pending_acceptance: t.agreeStatusPending,
    accepted:           t.agreeStatusAccepted,
    funded:             t.agreeStatusFunded,
    in_progress:        t.agreeStatusInProgress,
    submitted:          t.agreeStatusSubmitted,
    completed:          t.agreeStatusCompleted,
    released:           t.agreeStatusReleased,
    disputed:           t.agreeStatusDisputed,
    cancelled:          t.agreeStatusCancelled,
  };
  return map[status] ?? status;
}

export function statusColor(status: AgreementStatus): string {
  if (["pending_acceptance"].includes(status)) return "#f59e0b";
  if (["accepted", "funded", "in_progress"].includes(status)) return "#3b82f6";
  if (["submitted"].includes(status)) return "#a855f7";
  if (["completed", "released"].includes(status)) return "#22c55e";
  if (["disputed"].includes(status)) return "#ef4444";
  if (["cancelled"].includes(status)) return "#6b7280";
  return "#6b7280";
}

type Tab = "active" | "confirm" | "done" | "dispute";

export default function Agreements() {
  const [, setLocation] = useLocation();
  const { user } = useAppStore();
  const { t } = useLang();
  const { th } = useTheme();
  const { unreadCount: notifUnread } = useNotificationsSummary();
  const [tab, setTab] = useState<Tab>("active");
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [loading, setLoading] = useState(true);
  const listenersRef = useRef<Array<() => void>>([]);

  useEffect(() => {
    if (!user?.id) return;

    const userAgreementsRef = ref(realtimeDb, `userAgreements/${user.id}`);
    let isMounted = true;

    const unsubscribe = onValue(userAgreementsRef, async (snap) => {
      if (!snap.exists() || !isMounted) {
        if (isMounted) { setAgreements([]); setLoading(false); }
        return;
      }
      const ids = Object.keys(snap.val() || {});
      if (ids.length === 0) {
        if (isMounted) { setAgreements([]); setLoading(false); }
        return;
      }

      const results: Agreement[] = [];
      let pending = ids.length;

      ids.forEach(id => {
        const agRef = ref(realtimeDb, `agreements/${id}`);
        const agUnsub = onValue(agRef, (agSnap) => {
          if (agSnap.exists()) {
            const val = agSnap.val() as Agreement;
            if (isMounted) {
              setAgreements(prev => {
                const filtered = prev.filter(a => a.id !== id);
                return [...filtered, { ...val, id }].sort((a, b) =>
                  new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
                );
              });
            }
          }
          pending--;
          if (pending === 0 && isMounted) setLoading(false);
        });
        listenersRef.current.push(() => off(agRef));
      });
    });

    return () => {
      isMounted = false;
      off(userAgreementsRef);
      listenersRef.current.forEach(fn => fn());
      listenersRef.current = [];
    };
  }, [user?.id]);

  const tabs: { key: Tab; label: string; statuses: AgreementStatus[] }[] = [
    { key: "active",   label: t.agreeTabActive,   statuses: ACTIVE_STATUSES },
    { key: "confirm",  label: t.agreeTabConfirm,  statuses: CONFIRM_STATUSES },
    { key: "done",     label: t.agreeTabDone,     statuses: DONE_STATUSES },
    { key: "dispute",  label: t.agreeTabDispute,  statuses: DISPUTE_STATUSES },
  ];

  const currentTab = tabs.find(t => t.key === tab)!;
  const displayed = agreements.filter(a => currentTab.statuses.includes(a.status));

  const tabCounts: Record<Tab, number> = {
    active:  agreements.filter(a => ACTIVE_STATUSES.includes(a.status)).length,
    confirm: agreements.filter(a => CONFIRM_STATUSES.includes(a.status)).length,
    done:    agreements.filter(a => DONE_STATUSES.includes(a.status)).length,
    dispute: agreements.filter(a => DISPUTE_STATUSES.includes(a.status)).length,
  };

  return (
    <div className="min-h-screen bg-background pb-32 relative overflow-x-hidden flex flex-col">
      <div className="absolute top-0 right-0 w-full h-[300px] bg-primary/5 blur-[100px] pointer-events-none" />

      <header className="px-6 pt-14 pb-4 sticky top-0 bg-background/90 backdrop-blur-xl z-20 border-b border-border">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost" size="icon"
              className="rounded-full bg-secondary border border-border hover:bg-secondary/80"
              onClick={() => setLocation("/")}
            >
              <ArrowLeft className="w-5 h-5 text-foreground" />
            </Button>
            <h1 className="text-2xl font-heading text-foreground">{t.agreeTitle}</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost" size="icon"
              className="relative rounded-full bg-secondary/60 border border-white/5 hover:bg-secondary/80"
              onClick={() => setLocation("/notifications")}
              data-testid="button-agreements-bell"
            >
              <Bell className="w-5 h-5 text-foreground/70" />
              {notifUnread > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-primary text-white text-[12px] font-bold rounded-full flex items-center justify-center">
                  {notifUnread > 9 ? "9+" : notifUnread}
                </span>
              )}
            </Button>
            <Button
              data-testid="button-new-agreement"
              onClick={() => setLocation("/agreements/new")}
              className="h-10 px-4 rounded-full bg-primary/15 text-primary border border-primary/25 hover:bg-primary/25 text-[13px] font-bold tracking-widest"
            >
              <Plus className="w-4 h-4 mr-1" />
              {t.agreeNewContract}
            </Button>
          </div>
        </div>

        <div className="flex gap-1 bg-secondary/40 rounded-2xl p-1">
          {tabs.map(tb => (
            <button
              key={tb.key}
              data-testid={`tab-agree-${tb.key}`}
              onClick={() => setTab(tb.key)}
              className="flex-1 relative py-2 rounded-xl text-[13px] font-bold tracking-wider transition-all"
              style={{
                background: tab === tb.key ? `${th.primary}22` : "transparent",
                color: tab === tb.key ? th.primary : "var(--color-muted-foreground)",
              }}
            >
              {tb.label}
              {tabCounts[tb.key] > 0 && (
                <span style={{
                  position: "absolute", top: 4, right: 4,
                  minWidth: 14, height: 14, borderRadius: 999,
                  background: tab === tb.key ? th.primary : "var(--color-muted)",
                  color: tab === tb.key ? "#000" : "var(--color-muted-foreground)",
                  fontSize: 10, fontWeight: 800,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  padding: "0 3px",
                }}>
                  {tabCounts[tb.key]}
                </span>
              )}
            </button>
          ))}
        </div>
      </header>

      <main className="px-4 py-4 flex-1">
        {loading ? (
          <div className="flex justify-center items-center py-20">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : displayed.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-20 text-center"
          >
            <div className="w-20 h-20 rounded-3xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-5">
              <FileText className="w-8 h-8 text-primary/40" />
            </div>
            <h3 className="text-lg font-heading text-foreground/80 mb-2">{t.agreeEmpty}</h3>
            <p className="text-sm text-muted-foreground max-w-[220px]">{t.agreeEmptyDesc}</p>
            {tab === "active" && (
              <Button
                onClick={() => setLocation("/agreements/new")}
                className="mt-6 rounded-xl bg-primary/15 text-primary border border-primary/25 hover:bg-primary/25 font-bold"
              >
                {t.agreeNewBtn}
              </Button>
            )}
          </motion.div>
        ) : (
          <AnimatePresence mode="popLayout">
            <div className="space-y-3">
              {displayed.map((ag, i) => {
                const isCreator = ag.creatorUid === user?.id;
                const other = isCreator ? ag.workerName : ag.creatorName;
                const color = statusColor(ag.status);
                const deadline = ag.deadline ? new Date(ag.deadline) : null;
                const overdue = deadline && deadline < new Date() && !["completed","released","cancelled"].includes(ag.status);
                return (
                  <motion.div
                    key={ag.id}
                    data-testid={`card-agreement-${ag.id}`}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ delay: i * 0.04 }}
                    onClick={() => setLocation(`/agreements/${ag.id}`)}
                    className="bg-card border border-border rounded-3xl p-4 cursor-pointer hover:bg-secondary/30 transition-colors shadow-premium"
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div style={{
                          width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                          background: `${color}18`, border: `1px solid ${color}30`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          {ag.status === "disputed" ? (
                            <AlertCircle size={18} style={{ color }} />
                          ) : ["completed","released"].includes(ag.status) ? (
                            <CheckCircle2 size={18} style={{ color }} />
                          ) : (
                            <FileText size={18} style={{ color }} />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground/90 text-[15px] leading-tight truncate">{ag.title}</p>
                          <p className="text-[13px] text-muted-foreground mt-0.5 truncate">{other}</p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <p className="text-base font-heading text-foreground">{formatMoney(ag.amount, ag.currency)}</p>
                        <span style={{
                          fontSize: 11, fontWeight: 800, letterSpacing: "0.06em",
                          textTransform: "uppercase", color,
                          background: `${color}15`, border: `1px solid ${color}25`,
                          padding: "2px 7px", borderRadius: 999,
                        }}>
                          {statusLabel(ag.status, t)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        {deadline && (
                          <>
                            <Clock size={11} style={{ color: overdue ? "#ef4444" : "var(--color-muted-foreground)" }} />
                            <span style={{ fontSize: 12, color: overdue ? "#ef4444" : "var(--color-muted-foreground)", fontWeight: 600 }}>
                              {deadline.toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                            </span>
                          </>
                        )}
                      </div>
                      <span className="text-[12px] font-bold tracking-widest text-primary uppercase">
                        {t.agreeOpenBtn} →
                      </span>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </AnimatePresence>
        )}
      </main>
    </div>
  );
}
