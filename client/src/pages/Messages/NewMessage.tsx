import React, { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Search, Loader2, UserPlus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { apiFetch, ApiError } from "@/lib/api";

type SearchUser = {
  id: string;
  display_name?: string;
  handle?: string | null;
  email?: string | null;
};

function getDisplayName(user: SearchUser) {
  return user.display_name || user.handle || user.email || user.id;
}

function getInitials(name: string) {
  return name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase() || "?";
}

function formatHandle(h?: string | null) {
  if (!h) return "";
  return h.startsWith("@") ? h : `@${h}`;
}

export default function NewMessagePage() {
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [openingId, setOpeningId] = useState("");
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    const value = query.trim();
    if (!value) { setResults([]); setSearched(false); setError(""); return; }

    const timer = window.setTimeout(async () => {
      try {
        setLoading(true);
        setError("");
        const json = await apiFetch<{ users?: SearchUser[]; results?: SearchUser[] }>(
          `/api/messages/search?q=${encodeURIComponent(value)}`
        );
        const list = json?.users || json?.results || [];
        setResults(Array.isArray(list) ? list : []);
        setSearched(true);
      } catch (err: any) {
        setResults([]);
        setError(err instanceof ApiError ? err.message : "Nie udało się wyszukać użytkowników.");
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => window.clearTimeout(timer);
  }, [query]);

  async function openConversation(user: SearchUser) {
    try {
      setOpeningId(user.id);
      setError("");

      const res = await fetch("/api/messages/open-or-create", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: user.id }),
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
      setError(err?.message || "Nie udało się otworzyć rozmowy.");
    } finally {
      setOpeningId("");
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col relative overflow-x-hidden">
      {/* Ambient */}
      <div className="absolute top-0 right-0 w-72 h-72 bg-primary/5 rounded-full blur-[80px] pointer-events-none" aria-hidden />

      {/* Header */}
      <header className="px-5 pt-14 pb-4 sticky top-0 z-20 bg-background/90 backdrop-blur-xl border-b border-border">
        <div className="flex items-center gap-3 mb-4">
          <button
            type="button"
            onClick={() => window.history.back()}
            className="w-10 h-10 rounded-full bg-secondary border border-border flex items-center justify-center text-foreground hover:bg-muted transition-colors shrink-0"
            aria-label="Wróć"
            data-testid="button-back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-2xl font-heading text-foreground tracking-tight">Nowa wiadomość</h1>
        </div>

        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Szukaj po nazwie, @handle lub e-mail…"
            autoFocus
            className="w-full h-12 pl-10 pr-4 bg-secondary border border-border rounded-2xl text-[15px] text-foreground placeholder:text-muted-foreground focus:border-primary/50 outline-none transition-colors"
            data-testid="input-new-message-search"
          />
          {loading && (
            <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />
          )}
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 px-5 py-4 pb-28 space-y-3 relative z-10">
        {/* Error */}
        {error && (
          <div className="rounded-2xl p-3.5 bg-destructive/10 border border-destructive/25 text-destructive text-sm font-medium" data-testid="status-search-error">
            {error}
          </div>
        )}

        {/* Empty state (before search) */}
        {!query.trim() && !results.length && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 rounded-3xl bg-secondary border border-border flex items-center justify-center mb-5">
              <UserPlus className="w-8 h-8 text-muted-foreground/40" />
            </div>
            <h3 className="font-heading text-xl text-foreground mb-2">Znajdź użytkownika</h3>
            <p className="text-sm text-muted-foreground max-w-[220px] leading-relaxed">
              Wpisz nazwę, uchwyt lub adres e-mail, aby rozpocząć nową rozmowę.
            </p>
          </div>
        )}

        {/* No results */}
        {searched && !loading && results.length === 0 && !error && (
          <p className="text-sm text-muted-foreground px-1" data-testid="status-no-results">
            Nie znaleziono użytkowników dla &quot;{query}&quot;.
          </p>
        )}

        {/* Results */}
        <AnimatePresence>
          {results.map((u, i) => {
            const name = getDisplayName(u);
            const handle = formatHandle(u.handle);
            const sub = handle || u.email || u.id;
            const opening = openingId === u.id;
            return (
              <motion.button
                key={u.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                type="button"
                onClick={() => openConversation(u)}
                disabled={!!openingId}
                className="w-full flex items-center gap-3.5 p-4 rounded-2xl bg-card border border-border hover:bg-secondary/50 active:scale-[0.99] transition-all text-left"
                data-testid={`button-user-result-${u.id}`}
              >
                <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-base border border-primary/20 shrink-0">
                  {getInitials(name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[15px] text-foreground truncate">{name}</p>
                  <p className="text-xs text-primary font-medium truncate">{sub}</p>
                </div>
                <span className={`text-xs font-bold px-3 py-1.5 rounded-xl border shrink-0 transition-colors ${opening ? "bg-muted text-muted-foreground border-border" : "bg-primary/10 text-primary border-primary/20"}`}>
                  {opening ? "…" : "Napisz"}
                </span>
              </motion.button>
            );
          })}
        </AnimatePresence>
      </main>
    </div>
  );
}
