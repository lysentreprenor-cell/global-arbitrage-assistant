import { createContext, useContext, useEffect, useRef, useState, useCallback, ReactNode } from "react";

export type WsEvent =
  | { type: "message"; conversationId: string; message: Record<string, unknown> }
  | { type: "read"; conversationId: string }
  | { type: "online"; userId: string; online: boolean }
  | { type: "typing"; conversationId: string; isTyping: boolean; userId: string }
  | { type: "auth_ok"; userId: string }
  | { type: string; [key: string]: unknown };

interface WsContextValue {
  subscribe: (handler: (event: WsEvent) => void) => () => void;
  send: (data: object) => void;
  isConnected: boolean;
}

const WsContext = createContext<WsContextValue>({
  subscribe: () => () => {},
  send: () => {},
  isConnected: false,
});

export function useWsContext() {
  return useContext(WsContext);
}

export function WsProvider({ children, isAuthenticated }: { children: ReactNode; isAuthenticated: boolean }) {
  const wsRef = useRef<WebSocket | null>(null);
  const aliveRef = useRef(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handlersRef = useRef<Set<(event: WsEvent) => void>>(new Set());
  const [isConnected, setIsConnected] = useState(false);

  const send = useCallback((data: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      try { wsRef.current.send(JSON.stringify(data)); } catch {}
    }
  }, []);

  const subscribe = useCallback((handler: (event: WsEvent) => void) => {
    handlersRef.current.add(handler);
    return () => { handlersRef.current.delete(handler); };
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      wsRef.current?.close();
      wsRef.current = null;
      setIsConnected(false);
      return;
    }

    aliveRef.current = true;

    function connect() {
      if (!aliveRef.current) return;
      if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) return;

      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      const jwtToken = localStorage.getItem("item_access_token");
      const wsUrl = jwtToken
        ? `${proto}//${window.location.host}/ws?token=${encodeURIComponent(jwtToken)}`
        : `${proto}//${window.location.host}/ws`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        try { ws.send(JSON.stringify({ type: "auth" })); } catch {}
      };

      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data as string) as WsEvent;
          handlersRef.current.forEach(h => { try { h(data); } catch {} });
        } catch {}
      };

      ws.onclose = () => {
        wsRef.current = null;
        setIsConnected(false);
        if (aliveRef.current) {
          reconnectTimerRef.current = setTimeout(connect, 3000);
        }
      };

      ws.onerror = () => { ws.close(); };
    }

    connect();

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED) {
          if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
          connect();
        }
      }
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      aliveRef.current = false;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [isAuthenticated]);

  return (
    <WsContext.Provider value={{ subscribe, send, isConnected }}>
      {children}
    </WsContext.Provider>
  );
}
