import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Search, MessageCircle, User, X, Mail, Phone, AtSign, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/lib/store";
import { motion, AnimatePresence } from "framer-motion";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useAdminAccess } from "@/hooks/useAdminAccess";

type DirUser = {
  id: string;
  name: string;
  handle: string;
  email?: string;
  phone?: string;
};

function getInitials(name: string) {
  return (name || "U").trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() || "").join("");
}

const AVATAR_COLORS = [
  "bg-blue-500/20 text-blue-400",
  "bg-purple-500/20 text-purple-400",
  "bg-emerald-500/20 text-emerald-400",
  "bg-amber-500/20 text-amber-400",
  "bg-rose-500/20 text-rose-400",
  "bg-cyan-500/20 text-cyan-400",
];

function avatarColor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function maskEmail(email?: string) {
  if (!email) return null;
  const [local, domain] = email.split("@");
  if (!domain) return email;
  return `${local[0]}***@${domain}`;
}

function maskPhone(phone?: string) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 6) return phone;
  return phone.slice(0, -4).replace(/\d/g, "•") + phone.slice(-4);
}

export default function UserDirectory() {
  const [, setLocation] = useLocation();
  const { openConversation, user } = useAppStore();
  const { userId } = useCurrentUser();
  const { isAdmin } = useAdminAccess();

  const [allUsers, setAllUsers] = useState<DirUser[]>([]);
  const [filtered, setFiltered] = useState<DirUser[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [profileUser, setProfileUser] = useState<DirUser | null>(null);

  // Load directory on mount — guard inside effect so hooks order is stable
  useEffect(() => {
    if (!isAdmin || !userId) { setLoading(false); return; }
    const params = new URLSearchParams();
    params.set("excludeUserId", userId);
    fetch(`/api/users/directory?${params}`, {
      headers: { "x-user-id": userId },
    })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(data => {
        const list: DirUser[] = Array.isArray(data) ? data : [];
        setAllUsers(list);
        setFiltered(list);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isAdmin, userId]);

  // Live search
  useEffect(() => {
    const q = query.trim().toLowerCase().replace(/^@/, "");
    if (!q) { setFiltered(allUsers); return; }
    const result = allUsers.filter(u =>
      u.name.toLowerCase().includes(q) ||
      (u.handle || "").toLowerCase().replace(/^@/, "").includes(q) ||
      (u.email || "").toLowerCase().includes(q) ||
      (u.phone || "").replace(/\D/g, "").includes(q.replace(/\D/g, ""))
    );
    setFiltered(result);
  }, [query, allUsers]);

  const handleMessage = useCallback((u: DirUser) => {
    const convoId = openConversation(u.handle, u.name);
    setLocation(`/messages/${convoId}`);
  }, [openConversation, setLocation]);

  // Non-admin guard — shown after all hooks
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 gap-6">
        <div className="w-20 h-20 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
          <Lock className="w-8 h-8 text-red-400" />
        </div>
        <div className="text-center">
          <h2 className="text-xl font-bold text-white/90 mb-2">Brak dostępu</h2>
          <p className="text-muted-foreground text-sm">Katalog użytkowników jest dostępny tylko dla administratora.</p>
        </div>
        <Button onClick={() => setLocation("/profile")} className="rounded-xl px-6">Wróć do profilu</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-28 relative overflow-hidden flex flex-col">
      <div className="absolute top-[-10%] right-[-10%] w-[400px] h-[400px] bg-primary/5 rounded-full blur-[100px] pointer-events-none" />

      {/* Header */}
      <header className="px-6 pt-14 pb-4 sticky top-0 bg-background/90 backdrop-blur-xl z-20 border-b border-white/5">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="rounded-full bg-secondary border border-white/5 hover:bg-secondary/80" onClick={() => setLocation("/profile")}>
              <ArrowLeft className="w-5 h-5 text-foreground" />
            </Button>
            <div>
              <h1 className="text-2xl font-heading text-white/90 leading-none">Katalog</h1>
              <p className="text-[13px] text-muted-foreground mt-0.5">{allUsers.length} użytkowników</p>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Szukaj po nazwie, @host, e-mail, telefon…"
            autoFocus
            data-testid="input-directory-search"
            className="w-full h-12 pl-11 pr-10 bg-card border border-white/10 rounded-xl text-[15px] focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all outline-none text-white placeholder:text-muted-foreground/50"
          />
          {query && (
            <button onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      {/* List */}
      <main className="px-6 py-4 relative z-10 flex-1">
        {loading ? (
          <div className="flex flex-col gap-3 mt-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-20 rounded-2xl bg-card/50 animate-pulse border border-white/5" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-20 h-20 bg-secondary rounded-full flex items-center justify-center mb-5 border border-white/5">
              <User className="w-8 h-8 text-muted-foreground/50" />
            </div>
            <p className="text-white/80 font-semibold text-lg mb-1">Brak wyników</p>
            <p className="text-muted-foreground text-sm max-w-[200px]">
              {query ? "Spróbuj innego zapytania." : "Brak użytkowników w katalogu."}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((u, i) => {
              const color = avatarColor(u.id);
              const initials = getInitials(u.name);
              return (
                <motion.div
                  key={u.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.03, 0.3) }}
                  className="flex items-center gap-4 p-4 rounded-2xl bg-card border border-white/5 hover:bg-secondary/40 transition-colors"
                  data-testid={`dir-user-${u.id}`}
                >
                  {/* Avatar */}
                  <div className={`w-13 h-13 w-[52px] h-[52px] rounded-full flex items-center justify-center font-bold text-base shrink-0 border border-white/5 ${color}`}>
                    {initials}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-[15px] text-white/90 truncate">{u.name}</p>
                    <p className="text-[13px] text-primary/80 font-mono truncate">{u.handle}</p>
                    {(u.email || u.phone) && (
                      <p className="text-[13px] text-muted-foreground truncate mt-0.5">
                        {maskEmail(u.email) || maskPhone(u.phone)}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <button
                      data-testid={`btn-message-${u.id}`}
                      onClick={() => handleMessage(u)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-[13px] font-bold hover:bg-primary/90 active:scale-[0.96] transition-all"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      Napisz
                    </button>
                    <button
                      data-testid={`btn-profile-${u.id}`}
                      onClick={() => setProfileUser(u)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-secondary border border-white/10 text-[13px] font-bold text-white/80 hover:bg-secondary/80 active:scale-[0.96] transition-all"
                    >
                      <User className="w-3.5 h-3.5" />
                      Profil
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </main>

      {/* Profile bottom sheet */}
      <AnimatePresence>
        {profileUser && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 flex items-end"
            onClick={e => { if (e.target === e.currentTarget) setProfileUser(null); }}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 280 }}
              className="w-full bg-card rounded-t-3xl border-t border-white/10 p-6 pb-10 space-y-5"
            >
              {/* Header */}
              <div className="flex items-center justify-between">
                <p className="text-[12px] font-bold uppercase tracking-widest text-muted-foreground">Profil użytkownika</p>
                <button onClick={() => setProfileUser(null)} className="w-8 h-8 rounded-full bg-secondary border border-white/10 flex items-center justify-center text-muted-foreground hover:text-white transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Avatar + name */}
              <div className="flex items-center gap-4">
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-bold border border-white/10 ${avatarColor(profileUser.id)}`}>
                  {getInitials(profileUser.name)}
                </div>
                <div>
                  <p className="text-xl font-bold text-white/90">{profileUser.name}</p>
                  <p className="text-sm font-mono text-primary/80">{profileUser.handle}</p>
                </div>
              </div>

              {/* Details */}
              <div className="bg-background rounded-2xl border border-white/8 divide-y divide-white/5">
                <div className="flex items-center gap-3 px-4 py-3">
                  <AtSign className="w-4 h-4 text-primary shrink-0" />
                  <div>
                    <p className="text-[12px] uppercase tracking-wider text-muted-foreground font-semibold">Host</p>
                    <p className="text-sm font-mono text-white/90">{profileUser.handle}</p>
                  </div>
                </div>
                {profileUser.email && (
                  <div className="flex items-center gap-3 px-4 py-3">
                    <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-[12px] uppercase tracking-wider text-muted-foreground font-semibold">E-mail</p>
                      <p className="text-sm text-white/70">{maskEmail(profileUser.email)}</p>
                    </div>
                  </div>
                )}
                {profileUser.phone && (
                  <div className="flex items-center gap-3 px-4 py-3">
                    <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-[12px] uppercase tracking-wider text-muted-foreground font-semibold">Telefon</p>
                      <p className="text-sm text-white/70">{maskPhone(profileUser.phone)}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* CTA */}
              <button
                onClick={() => { setProfileUser(null); handleMessage(profileUser); }}
                className="w-full h-14 rounded-2xl text-base font-bold bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              >
                <MessageCircle className="w-5 h-5" />
                Napisz wiadomość
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
