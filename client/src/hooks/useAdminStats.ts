import { useEffect, useMemo, useState, useCallback } from "react";
import { useAppStore } from "@/lib/store";

export type AdminStatUser = {
  id: string;
  name: string;
  email?: string;
  handle?: string;
  isOnline?: boolean;
  balance?: number;
  lastActiveAt?: string | null;
};

export function useAdminStats() {
  const { user } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalUsers, setTotalUsers] = useState(0);
  const [onlineUsers, setOnlineUsers] = useState(0);
  const [users, setUsers] = useState<AdminStatUser[]>([]);

  const load = useCallback(async () => {
    if (!user?.id) return;
    try {
      setLoading(true);
      setError(null);
      const response = await fetch("/api/admin/stats", {
        headers: { "x-user-id": user.id },
      });
      if (response.status === 403) {
        setError("Brak dostępu do panelu admina.");
        return;
      }
      if (!response.ok) throw new Error("Admin stats fetch failed");
      const data = await response.json();
      setTotalUsers(Number(data?.totalUsers ?? 0));
      setOnlineUsers(Number(data?.onlineUsers ?? 0));
      setUsers(Array.isArray(data?.users) ? data.users : []);
    } catch (err: any) {
      setError(err?.message || "Admin stats fetch failed");
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    load();
    const id = window.setInterval(load, 30_000);
    return () => window.clearInterval(id);
  }, [load]);

  return useMemo(() => ({
    loading,
    error,
    totalUsers,
    onlineUsers,
    users,
    reload: load,
  }), [loading, error, totalUsers, onlineUsers, users, load]);
}
