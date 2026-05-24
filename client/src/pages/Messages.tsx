import React, { useEffect, useRef, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { Search, Plus, MessageSquare, Loader2, X, Star } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "@/lib/store";
import { useWsContext } from "@/context/WsContext";
import { ref, onValue, off } from "firebase/database";
import { realtimeDb } from "@/lib/firebase";

// ── Types ──────────────────────────────────────────────────────────────────────

type ConversationItem = {
  id: string;
  target_user_id?: string;
  target_display_name?: string;
  target_handle?: string | null;
  target_last_seen_at?: string | null;
  last_message?: string | null;
  last_message_at?: string | null;
  unread_count?: number;
  is_online?: boolean;
};

type SearchUser = {
  id: string;
  display_name?: string;
  handle?: string | null;
  email?: string | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60_000) return "teraz";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} min`;
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "wczoraj";
  if (diff < 7 * 86_400_000) {
    const days = ["nd", "pn", "wt", "śr", "cz", "pt", "sb"];
    return days[d.getDay()];
  }
  return d.toLocaleDateString("pl-PL", { day: "numeric", month: "short" });
}

function getInitials(name: string): string {
  return name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase() || "?";
}

function formatHandle(h?: string | null): string {
  if (!h) return "";
  return h.startsWith("@") ? h : `@${h}`;
}

// ── localStorage helpers ───────────────────────────────────────────────────────

function loadFavorites(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem("finlys_fav_convs") || "{}"); } catch { return {}; }
}
function saveFavorites(f: Record<string, boolean>) {
  try { localStorage.setItem("finlys_fav_convs", JSON.stringify(f)); } catch {}
}
function loadBlockedUsers(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem("finlys_blocked_users") || "{}"); } catch { return {}; }
}

// ── Component ─────────────────────────────────────────────────────────────────

type FilterType = "all" | "unread" | "favorites" | "blocked";

const FILTERS: { key: FilterType; label: string }[] = [
  { key: "all", label: "Wszystkie" },
  { key: "unread", label: "Nieprzeczytane" },
  { key: "favorites", label: "Ulubione" },
  { key: "blocked", label: "Zablokowane" },
];

export default function MessagesPage() {
  const [, setLocation] = useLocation();
  const { user } = useAppStore();

  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [deletedConvIds, setDeletedConvIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");
  const [search, setSearch] = useState("");
  const [favorites, setFavorites] = useState<Record<string, boolean>>(loadFavorites);
  const [blockedUsers, setBlockedUsers] = useState<Record<string, boolean>>(loadBlockedUsers);
  const [userResults, setUserResults] = useState<SearchUser[]>([]);
  const [userSearchLoading, setUserSearchLoading] = useState(false);
  const [openingUserId, setOpeningUserId] = useState("");
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const isMounted = useRef(true);
  const searchRef = useRef<HTMLInputElement>(null);
  const loadConversationsRef = useRef<(silent?: boolean) => void>(() => {});

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => { if (isMounted.current) setToast(null); }, 3500);
  }

  // ── Load blocked users from server (authoritative) ─────────────────────────
  useEffect(() => {
    let alive = true;
    fetch("/api/messages/blocks", { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then((data: { ok?: boolean; blockedUserIds?: string[] } | null) => {
        if (!alive || !data?.ok) return;
        const map: Record<string, boolean> = {};
        (data.blockedUserIds ?? []).forEach(id => { map[id] = true; });
        setBlockedUsers(map);
        // Sync localStorage cache with server truth
        try { localStorage.setItem("finlys_blocked_users", JSON.stringify(map)); } catch {}
      })
      .catch(() => {/* fallback: keep localStorage-seeded initial state */});
    return () => { alive = false; };
  }, []);

  // ── WebSocket live updates (shared global WS connection) ────────────────────

  const { subscribe } = useWsContext();

  useEffect(() => {
    return subscribe((event) => {
      if (event.type === "message" && event.conversationId) {
        const convId = String(event.conversationId);
        const msg = (event.message ?? {}) as { text?: string; senderId?: string; attachment?: { mimeType?: string }; createdAt?: string };
        setConversations(prev => {
          const idx = prev.findIndex(c => c.id === convId);
          if (idx === -1) {
            // New conversation not yet in list — reload from server
            loadConversationsRef.current(true);
            return prev;
          }
          const c = prev[idx];
          const preview = msg.text || (msg.attachment?.mimeType?.startsWith("audio/") ? "🎤 Głosowa" : "📎 Załącznik");
          const isSelf = !!user?.id && msg.senderId === user.id;
          const updated = {
            ...c,
            last_message: preview,
            last_message_at: msg.createdAt || new Date().toISOString(),
            unread_count: isSelf ? (c.unread_count || 0) : (c.unread_count || 0) + 1,
          };
          return [updated, ...prev.filter((_, i) => i !== idx)];
        });
      } else if (event.type === "read" && event.conversationId) {
        const convId = String(event.conversationId);
        setConversations(prev => prev.map(c => c.id === convId ? { ...c, unread_count: 0 } : c));
      } else if (event.type === "online" && event.userId) {
        const uid = String(event.userId);
        setConversations(prev => prev.map(c => c.target_user_id === uid ? { ...c, is_online: !!event.online } : c));
      }
    });
  }, [subscribe, user?.id]);

  // ── Data loading ────────────────────────────────────────────────────────────

  const loadConversations = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setError("");
      const res = await fetch("/api/messages/conversations", { credentials: "include" });
      const json = await res.json().catch(() => ({}));
      if (!isMounted.current) return;
      if (!res.ok) throw new Error(json?.error || `Błąd ${res.status}`);
      const list: ConversationItem[] = Array.isArray(json?.conversations)
        ? json.conversations
        : Array.isArray(json?.items)
        ? json.items
        : [];
      setConversations(list);
    } catch (err: any) {
      if (!isMounted.current) return;
      if (!silent) setError(err?.message || "Nie udało się pobrać rozmów.");
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => { loadConversationsRef.current = loadConversations; }, [loadConversations]);

  useEffect(() => {
    isMounted.current = true;
    loadConversations();
    const interval = setInterval(() => loadConversations(true), 8000);
    const onVisible = () => { if (document.visibilityState === "visible") loadConversations(true); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      isMounted.current = false;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [loadConversations]);

  // ── Firebase real-time inbox signal ────────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return;
    const inboxRef = ref(realtimeDb, `messaging/inbox/${user.id}`);
    const unsub = onValue(inboxRef, (snap) => {
      if (!snap.exists() || !isMounted.current) return;
      loadConversations(true);
    });
    return () => off(inboxRef, "value", unsub);
  }, [user?.id, loadConversations]);

  useEffect(() => {
    if (!user?.id) return;
    const settingsRef = ref(realtimeDb, `messaging/inbox/${user.id}/settings`);
    const unsub = onValue(settingsRef, (snap) => {
      const data = snap.val() || {};
      const deleted = new Set<string>(
        Object.entries(data)
          .filter(([, v]: any) => v?.deletedForMe === true)
          .map(([k]) => k)
      );
      setDeletedConvIds(deleted);
    });
    return unsub;
  }, [user?.id]);

  // ── User search ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const q = search.trim();
    if (!q) { setUserResults([]); return; }
    const timer = window.setTimeout(async () => {
      try {
        setUserSearchLoading(true);
        const res = await fetch(`/api/messages/search?q=${encodeURIComponent(q)}`, { credentials: "include" });
        const json = await res.json().catch(() => ({}));
        if (!isMounted.current) return;
        setUserResults(json?.users || json?.results || []);
      } catch { if (isMounted.current) setUserResults([]); }
      finally { if (isMounted.current) setUserSearchLoading(false); }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  async function openOrCreate(userId: string) {
    try {
      setOpeningUserId(userId);

      const res = await fetch("/api/messages/open-or-create", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: userId }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.message || "Nie udało się otworzyć rozmowy.");
      }

      const conversationId = json?.conversationId || json?.id || json?.conversation?.id;
      if (!conversationId) {
        throw new Error("Backend nie zwrócił conversationId.");
      }

      setLocation(`/messages/${conversationId}`);
    } catch (err: any) {
      showToast(err?.message || "Nie udało się otworzyć rozmowy.", false);
    } finally {
      setOpeningUserId("");
    }
  }

  // ── Favorite toggle ──────────────────────────────────────────────────────────

  function toggleFavorite(convId: string, e: React.MouseEvent) {
    e.stopPropagation();
    setFavorites(prev => {
      const next = { ...prev };
      if (next[convId]) delete next[convId]; else next[convId] = true;
      saveFavorites(next);
      return next;
    });
  }

  // ── Derived data ─────────────────────────────────────────────────────────────

  const totalUnread = conversations.reduce((s, c) => s + (c.unread_count || 0), 0);
  const q = search.toLowerCase().trim();
  const showUserResults = !!q;

  const filteredConversations = conversations.filter(c => {
    if (deletedConvIds.has(c.id)) return false;
    if (filter === "unread" && !c.unread_count) return false;
    if (filter === "favorites" && !favorites[c.id]) return false;
    if (filter === "blocked" && !blockedUsers[c.target_user_id || ""]) return false;
    if (!q) return true;
    const name = (c.target_display_name || "").toLowerCase();
    const handle = (c.target_handle || "").toLowerCase();
    return name.includes(q) || handle.includes(q);
  });

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="h-[100dvh] max-h-[100dvh] bg-background flex flex-col relative overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute top-0 right-0 w-full h-[300px] bg-purple-500/10 blur-[100px] pointer-events-none" aria-hidden />

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.97 }}
            className={`fixed top-5 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl text-sm font-semibold shadow-floating border pointer-events-none ${toast.ok ? "bg-card border-success/30 text-success" : "bg-card border-destructive/30 text-destructive"}`}
            data-testid="toast-message"
          >
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="px-6 sticky top-0 z-20 bg-background/90 backdrop-blur-xl border-b border-border">
        <div className="pt-14 pb-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-heading text-foreground tracking-tight">Wiadomości</h1>
              <AnimatePresence>
                {totalUnread > 0 && (
                  <motion.span
                    key="badge"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    className="min-w-[20px] h-5 px-1.5 bg-primary text-primary-foreground text-[12px] font-bold rounded-full flex items-center justify-center"
                    data-testid="badge-unread-total"
                  >
                    {totalUnread}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
            <button
              onClick={() => setLocation("/messages/new")}
              className="w-9 h-9 rounded-full bg-primary/10 border border-primary/20 text-primary flex items-center justify-center hover:bg-primary/20 transition-colors"
              data-testid="button-new-message"
              aria-label="Nowa wiadomość"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>

          {/* Search */}
          <div className="relative mb-3">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Szukaj rozmów lub użytkowników…"
              className="w-full h-11 pl-10 pr-9 bg-secondary border border-border rounded-2xl text-sm text-foreground focus:border-primary/50 outline-none transition-colors placeholder:text-muted-foreground"
              data-testid="input-sidebar-search"
            />
            <AnimatePresence>
              {search && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  onClick={() => { setSearch(""); searchRef.current?.focus(); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Wyczyść"
                >
                  <X className="w-4 h-4" />
                </motion.button>
              )}
            </AnimatePresence>
          </div>

          {/* Filter chips */}
          {!showUserResults && (
            <div className="flex gap-1 bg-secondary/40 rounded-2xl p-1">
              {FILTERS.map(f => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className="flex-1 py-2 rounded-xl text-[12px] font-bold tracking-normal transition-all"
                  style={{
                    background: filter === f.key ? "linear-gradient(135deg,rgba(124,58,237,0.22),rgba(212,160,32,0.18))" : "transparent",
                    color: filter === f.key ? "#d4a020" : "var(--color-muted-foreground)",
                  }}
                  data-testid={`filter-${f.key}`}
                >
                  {f.label}{f.key === "unread" && totalUnread > 0 ? ` (${totalUnread})` : ""}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 min-h-0 overflow-y-auto px-4 py-3 pb-28 space-y-2 relative z-10">
        {/* Error */}
        {error && (
          <div className="rounded-2xl p-3.5 bg-destructive/10 border border-destructive/25 text-destructive text-sm font-medium" data-testid="status-conversations-error">
            {error}
          </div>
        )}

        {/* User search results */}
        <AnimatePresence>
          {showUserResults && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mb-4"
            >
              <p className="text-[13px] font-bold uppercase tracking-widest text-muted-foreground px-1 mb-2">
                {userSearchLoading ? "Szukam użytkowników…" : userResults.length > 0 ? "Użytkownicy" : "Brak wyników"}
              </p>
              {userResults.map(u => {
                const name = u.display_name || u.handle || u.id;
                const handle = formatHandle(u.handle);
                return (
                  <button
                    key={u.id}
                    onClick={() => openOrCreate(u.id)}
                    disabled={!!openingUserId}
                    className="w-full flex items-center gap-3 p-3.5 rounded-2xl bg-card border border-border hover:bg-secondary/50 transition-colors text-left mb-2"
                    data-testid={`button-user-result-${u.id}`}
                  >
                    <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0 border border-primary/20">
                      {getInitials(name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-[15px] text-foreground truncate">{name}</p>
                      {handle && <p className="text-[14px] text-primary font-medium">{handle}</p>}
                    </div>
                    <span className="text-[13px] font-bold text-primary shrink-0 px-2.5 py-1 rounded-lg bg-primary/10 border border-primary/20">
                      {openingUserId === u.id ? "…" : "Napisz"}
                    </span>
                  </button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Conversation list */}
        {loading && !conversations.length ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Loader2 className="w-8 h-8 text-primary animate-spin mb-3" />
            <p className="text-sm text-muted-foreground">Ładowanie rozmów…</p>
          </div>
        ) : filteredConversations.length === 0 && !showUserResults ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-20 h-20 rounded-3xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mb-5">
              <MessageSquare className="w-8 h-8 text-purple-400" />
            </div>
            <h3 className="font-heading text-xl text-foreground mb-2">
              {filter === "unread" ? "Brak nieprzeczytanych"
                : filter === "favorites" ? "Brak ulubionych"
                : filter === "blocked" ? "Brak zablokowanych"
                : "Brak rozmów"}
            </h3>
            <p className="text-sm text-muted-foreground max-w-[220px] leading-relaxed">
              {filter === "unread"
                ? "Wszystkie wiadomości są przeczytane."
                : filter === "favorites"
                ? "Dotknij gwiazdki przy rozmowie, aby dodać ją do ulubionych."
                : filter === "blocked"
                ? "Nie zablokowałeś żadnego użytkownika."
                : "Wyszukaj użytkownika, aby rozpocząć nową rozmowę."}
            </p>
          </div>
        ) : (
          filteredConversations.map((c, i) => {
            const name = c.target_display_name || "Użytkownik";
            const handle = formatHandle(c.target_handle);
            const initials = getInitials(name);
            const hasUnread = (c.unread_count || 0) > 0;
            const isFav = !!favorites[c.id];
            const isBlocked = !!blockedUsers[c.target_user_id || ""];

            return (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.04, 0.3) }}
                className={`flex items-center gap-0 rounded-2xl bg-card border transition-all ${isBlocked ? "border-destructive/20 opacity-60" : "border-border"}`}
              >
                <button
                  onClick={() => setLocation(`/messages/${c.id}`)}
                  className="flex-1 flex items-center gap-3.5 p-4 text-left active:scale-[0.99] transition-transform hover:bg-secondary/50 rounded-2xl"
                  data-testid={`button-conversation-${c.id}`}
                >
                  {/* Avatar + online dot */}
                  <div className="relative shrink-0">
                    <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-base border border-primary/20">
                      {initials}
                    </div>
                    {c.is_online && !isBlocked && (
                      <div className="absolute bottom-0.5 right-0.5 w-3 h-3 rounded-full bg-online border-2 border-background" data-testid={`status-online-${c.id}`} />
                    )}
                  </div>

                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline gap-2 mb-0.5">
                      <span className={`font-semibold text-[17px] truncate ${hasUnread ? "text-foreground" : "text-foreground/80"}`}>
                        {name}
                      </span>
                      {c.last_message_at && (
                        <span className="text-[12px] text-muted-foreground whitespace-nowrap shrink-0">
                          {fmtTime(c.last_message_at)}
                        </span>
                      )}
                    </div>
                    {handle && (
                      <p className="text-[14px] text-primary font-medium mb-0.5">{handle}</p>
                    )}
                    <p className={`text-[15px] truncate ${hasUnread ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                      {isBlocked ? "Zablokowany" : (c.last_message || "Brak wiadomości")}
                    </p>
                  </div>

                  {/* Unread badge */}
                  {hasUnread && !isBlocked && (
                    <div
                      className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[12px] font-bold flex items-center justify-center shrink-0"
                      data-testid={`badge-unread-${c.id}`}
                    >
                      {c.unread_count}
                    </div>
                  )}
                </button>

                {/* Star / favorite button */}
                <button
                  onClick={(e) => toggleFavorite(c.id, e)}
                  className={`pr-3.5 self-stretch flex items-center justify-center transition-colors ${isFav ? "text-favorite" : "text-muted-foreground/30 hover:text-favorite/60"}`}
                  aria-label={isFav ? "Usuń z ulubionych" : "Dodaj do ulubionych"}
                  data-testid={`button-favorite-${c.id}`}
                >
                  <Star className={`w-4 h-4 ${isFav ? "fill-favorite" : ""}`} />
                </button>
              </motion.div>
            );
          })
        )}
      </main>
    </div>
  );
}
