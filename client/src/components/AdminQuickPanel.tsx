import { RefreshCw, Shield, Users, Wifi } from "lucide-react";
import type { AdminStatUser } from "@/hooks/useAdminStats";
import { useLocation } from "wouter";

type Props = {
  loading: boolean;
  error: string | null;
  totalUsers: number;
  onlineUsers: number;
  users: AdminStatUser[];
  reload: () => void;
};

export default function AdminQuickPanel({ loading, error, totalUsers, onlineUsers, users, reload }: Props) {
  const [, setLocation] = useLocation();

  return (
    <div className="rounded-3xl border border-amber-500/20 bg-amber-500/5 overflow-hidden shadow-sm">
      <div className="px-5 py-4 border-b border-amber-500/15 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-amber-500/15 flex items-center justify-center">
            <Shield className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground/90 font-heading">Admin Overview</p>
            <p className="text-[12px] text-muted-foreground tracking-widest uppercase">Live · auto-refresh 30s</p>
          </div>
        </div>
        <button
          onClick={reload}
          disabled={loading}
          className="w-8 h-8 rounded-full bg-secondary border border-white/5 flex items-center justify-center hover:bg-secondary/80 transition-colors disabled:opacity-40"
          data-testid="button-admin-quick-refresh"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-muted-foreground ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="p-5 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-card border border-white/5 rounded-2xl p-4">
            <Users className="w-4 h-4 text-blue-400 mb-2" />
            <div className="text-2xl font-bold text-foreground/95">{loading ? "…" : totalUsers}</div>
            <div className="text-[12px] text-muted-foreground mt-0.5">Registered users</div>
          </div>
          <div className="bg-card border border-white/5 rounded-2xl p-4">
            <Wifi className="w-4 h-4 text-emerald-400 mb-2" />
            <div className="text-2xl font-bold text-foreground/95">{loading ? "…" : onlineUsers}</div>
            <div className="text-[12px] text-muted-foreground mt-0.5">Online now</div>
          </div>
        </div>

        {error && (
          <p className="text-[13px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">{error}</p>
        )}

        {!loading && !error && users.length > 0 && (
          <div className="space-y-2">
            {users.slice(0, 8).map((u) => (
              <div key={u.id} className="flex items-center justify-between bg-card border border-white/5 rounded-xl px-3 py-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="relative flex-shrink-0">
                    <div className="w-8 h-8 rounded-full bg-secondary border border-white/8 flex items-center justify-center text-[13px] font-bold text-foreground/70">
                      {u.name?.charAt(0) || "?"}
                    </div>
                    {u.isOnline && (
                      <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-emerald-500 border-2 border-background" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground/90 truncate">{u.name}</p>
                    <p className="text-[12px] text-muted-foreground truncate">{u.handle || u.id?.slice(0, 8)}</p>
                  </div>
                </div>
                {u.isOnline ? (
                  <span className="flex-shrink-0 flex items-center gap-1 text-[12px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md uppercase tracking-widest">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                    Online
                  </span>
                ) : (
                  <span className="flex-shrink-0 text-[12px] font-medium text-muted-foreground bg-white/5 border border-white/10 px-2 py-0.5 rounded-md uppercase tracking-widest">
                    Offline
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        <button
          onClick={() => setLocation("/admin")}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-amber-500/20 text-amber-400 text-[13px] font-semibold uppercase tracking-widest hover:bg-amber-500/10 transition-colors"
          data-testid="button-open-admin-console"
        >
          <Shield className="w-3.5 h-3.5" />
          Full Admin Console
        </button>
      </div>
    </div>
  );
}
