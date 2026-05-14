import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { useAppStore } from "@/lib/store";

type NotificationBadgeValue = {
  unreadCount: number;
  resetUnread: () => void;
  refreshUnread: () => Promise<void>;
};

const NotificationBadgeContext = createContext<NotificationBadgeValue>({
  unreadCount: 0,
  resetUnread: () => {},
  refreshUnread: async () => {},
});

export function useNotificationBadge() {
  return useContext(NotificationBadgeContext);
}

async function fetchUnreadCount(userId: string): Promise<number> {
  try {
    const res = await fetch(`/api/notifications/${userId}?read=false`, { credentials: "include" });
    if (!res.ok) return 0;
    const data = await res.json();
    return Array.isArray(data) ? data.length : 0;
  } catch {
    return 0;
  }
}

export function NotificationBadgeProvider({
  children,
  isAuthenticated,
}: {
  children: React.ReactNode;
  isAuthenticated: boolean;
}) {
  const { user } = useAppStore();
  const [unreadCount, setUnreadCount] = useState(0);
  const [location] = useLocation();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onNotifPage = location === "/notifications" || location.startsWith("/notifications");
  const onNotifPageRef = useRef(onNotifPage);
  onNotifPageRef.current = onNotifPage;

  const refreshUnread = useCallback(async () => {
    if (!user?.id) return;
    // Never re-inflate the badge while the user is viewing /notifications
    if (onNotifPageRef.current) return;
    const count = await fetchUnreadCount(user.id);
    setUnreadCount(count);
  }, [user?.id]);

  const resetUnread = useCallback(() => setUnreadCount(0), []);

  // Initial fetch on auth
  useEffect(() => {
    if (!isAuthenticated || !user?.id) {
      setUnreadCount(0);
      return;
    }
    refreshUnread();
  }, [isAuthenticated, user?.id, refreshUnread]);

  // Poll every 60 seconds while authenticated
  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;
    pollRef.current = setInterval(() => { refreshUnread(); }, 60_000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [isAuthenticated, user?.id, refreshUnread]);

  // Clear badge to 0 when user visits /notifications; stay at 0 while there
  useEffect(() => {
    if (!isAuthenticated) return;
    if (onNotifPage) {
      setUnreadCount(0);
    }
  }, [location, isAuthenticated, onNotifPage]);

  return (
    <NotificationBadgeContext.Provider value={{ unreadCount, resetUnread, refreshUnread }}>
      {children}
    </NotificationBadgeContext.Provider>
  );
}
