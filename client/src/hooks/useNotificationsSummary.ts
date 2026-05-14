import { useMemo } from "react";
import { useAppStore } from "@/lib/store";
import { useNotificationBadge } from "@/context/NotificationBadgeContext";

/**
 * Unified notification summary.
 * - `unreadCount` comes from NotificationBadgeContext (polled from server every 60s)
 *   so it stays accurate even when the store hasn't been refreshed.
 * - `list`, `recentNotifications` etc. still read from the in-memory store for fast rendering.
 */
export function useNotificationsSummary() {
  const { notifications } = useAppStore();
  const { unreadCount: serverUnreadCount } = useNotificationBadge();

  return useMemo(() => {
    const unreadNotifications = notifications.filter(n => !n.read);
    // Prefer server-side unread count (badge context) over store count
    const unreadCount = serverUnreadCount ?? unreadNotifications.length;
    const recentNotifications = [...notifications]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 10);

    return {
      list: notifications,
      unreadNotifications,
      unreadCount,
      recentNotifications,
      total: notifications.length,
      hasUnread: unreadCount > 0,
    };
  }, [notifications, serverUnreadCount]);
}
