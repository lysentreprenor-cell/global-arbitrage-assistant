import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { useWsContext } from "@/context/WsContext";
import { ref, onValue, off } from "firebase/database";
import { realtimeDb } from "@/lib/firebase";

type MessageBadgeContextValue = {
  unreadCount: number;
  resetUnread: () => void;
  refreshUnread: () => void;
};

const MessageBadgeContext = createContext<MessageBadgeContextValue>({
  unreadCount: 0,
  resetUnread: () => {},
  refreshUnread: () => {},
});

export function useMessageBadge() {
  return useContext(MessageBadgeContext);
}

async function fetchTotalUnread(): Promise<number> {
  try {
    const r = await fetch("/api/messages/conversations", { credentials: "include" });
    if (!r.ok) return 0;
    const json = await r.json();
    const convs: Array<{ unread_count?: number }> = json?.conversations || json?.items || [];
    return convs.reduce((s, c) => s + (c.unread_count || 0), 0);
  } catch {
    return 0;
  }
}

export function MessageBadgeProvider({ children, isAuthenticated, userId }: { children: React.ReactNode; isAuthenticated: boolean; userId?: string }) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [location] = useLocation();
  const { subscribe } = useWsContext();
  const isMounted = useRef(true);

  const refreshUnread = useCallback(() => {
    fetchTotalUnread().then(count => { if (isMounted.current) setUnreadCount(count); });
  }, []);

  const resetUnread = useCallback(() => {
    setUnreadCount(0);
  }, []);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  useEffect(() => {
    if (!isAuthenticated) { setUnreadCount(0); return; }
    refreshUnread();
  }, [isAuthenticated, refreshUnread]);

  // ── Firebase real-time inbox signal ────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated || !userId) return;
    const inboxRef = ref(realtimeDb, `messaging/inbox/${userId}`);
    const unsub = onValue(inboxRef, (snap) => {
      if (!snap.exists() || !isMounted.current) return;
      refreshUnread();
    });
    return () => off(inboxRef, "value", unsub);
  }, [isAuthenticated, userId, refreshUnread]);

  // ── WS fallback (typing / read events) ────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) return;
    return subscribe((event) => {
      if (event.type === "message") {
        const loc = window.location.pathname;
        if (!loc.startsWith("/messages")) {
          setUnreadCount(prev => prev + 1);
        } else if (loc === "/messages") {
          fetchTotalUnread().then(count => { if (isMounted.current) setUnreadCount(count); });
        }
      } else if (event.type === "read") {
        fetchTotalUnread().then(count => { if (isMounted.current) setUnreadCount(count); });
      }
    });
  }, [isAuthenticated, subscribe]);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (location === "/messages" || location.startsWith("/messages/")) {
      refreshUnread();
    }
  }, [location, isAuthenticated, refreshUnread]);

  return (
    <MessageBadgeContext.Provider value={{ unreadCount, resetUnread, refreshUnread }}>
      {children}
    </MessageBadgeContext.Provider>
  );
}
