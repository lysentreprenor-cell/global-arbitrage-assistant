import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/lib/store";
import type { Notification } from "@/lib/store";

// Re-export for convenience
export type { Notification };

type NotifFilter = {
  read?: boolean;
  category?: "message" | "payment" | "contract" | "system" | "security";
};

function dbToAppNotif(n: Record<string, unknown>): Notification {
  return {
    id: String(n.id),
    title: String(n.title),
    message: String(n.message),
    date: typeof n.date === "string" ? n.date : new Date(n.date as string | number | Date).toISOString(),
    read: Boolean(n.read),
    type: (n.type as Notification["type"]) ?? "info",
    category: (n.category as Notification["category"]) ?? undefined,
    priority: (n.priority as Notification["priority"]) ?? undefined,
    route: (n.route as string | null) ?? null,
    groupKey: ((n.group_key ?? n.groupKey) as string | null) ?? null,
  };
}

/**
 * Polls the server for notifications every 30 seconds.
 * Also syncs the result into the global AppStore so existing consumers continue to work.
 */
export function useNotifications(filter?: NotifFilter) {
  const { user } = useAppStore();
  const queryClient = useQueryClient();
  const userId = user?.id;

  const query = useQuery<Notification[]>({
    queryKey: ["notifications", userId, filter],
    enabled: !!userId,
    refetchInterval: 30_000,
    staleTime: 10_000,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filter?.read !== undefined) params.set("read", String(filter.read));
      if (filter?.category) params.set("category", filter.category);
      const qs = params.toString();
      const res = await fetch(
        `/api/notifications/${userId}${qs ? `?${qs}` : ""}`,
        { credentials: "include" }
      );
      if (!res.ok) return [];
      const data = await res.json();
      const mapped = (data as Record<string, unknown>[]).map(dbToAppNotif);
      return mapped;
    },
    select: (data) => data,
  });

  const markReadMutation = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/notifications/${id}/read`, { method: "PATCH", credentials: "include" });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications", userId] }),
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      await fetch(`/api/notifications/user/${userId}/read-all`, { method: "PATCH", credentials: "include" });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications", userId] }),
  });

  const deleteNotifMutation = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/notifications/${id}`, { method: "DELETE", credentials: "include" });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications", userId] }),
  });

  const allNotifications = query.data ?? [];
  const unreadByType = allNotifications.reduce<Record<string, number>>((acc, n) => {
    if (!n.read) {
      const cat = n.category ?? (n.type === "transfer" ? "payment" : n.type === "alert" ? "security" : "system");
      acc[cat] = (acc[cat] ?? 0) + 1;
    }
    return acc;
  }, {});

  return {
    notifications: allNotifications,
    isLoading: query.isLoading,
    unreadCount: allNotifications.filter(n => !n.read).length,
    unreadByType,
    markRead: markReadMutation.mutate,
    markAllRead: markAllReadMutation.mutate,
    deleteNotif: deleteNotifMutation.mutate,
    refetch: query.refetch,
  };
}
