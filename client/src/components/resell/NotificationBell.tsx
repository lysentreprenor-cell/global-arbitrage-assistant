import React, { useState, useEffect, useRef } from "react";
import { Bell, BellRing, X, CheckCheck, Package, Zap, ShoppingCart, Info, Trash2 } from "lucide-react";
import { useLocation } from "wouter";

interface AppNotification {
  id: string;
  type: "order" | "autopilot" | "fulfillment" | "info" | "profit";
  title: string;
  body: string;
  profit?: number;
  productName?: string;
  buyerName?: string;
  buyerAddress?: string;
  sourceUrl?: string;
  buyPrice?: number;
  sellPrice?: number;
  listingId?: number;
  orderId?: number;
  read: boolean;
  createdAt: string;
}

export function NotificationBell() {
  const [, setLocation] = useLocation();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [shake, setShake] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const prevUnread = useRef(0);
  // Track which listingIds have been published (id → "loading" | "done")
  const [publishedIds, setPublishedIds] = useState<Record<number, "loading" | "done">>({});

  const fetchNotifications = async () => {
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) return;
      const data = await res.json() as { notifications: AppNotification[]; unread: number };
      setNotifications(data.notifications ?? []);
      setUnread(data.unread ?? 0);

      // Trigger shake animation if new unread appeared
      if ((data.unread ?? 0) > prevUnread.current && prevUnread.current > 0) {
        setShake(true);
        setTimeout(() => setShake(false), 600);
      }
      prevUnread.current = data.unread ?? 0;
    } catch { /* ignore */ }
  };

  // Poll every 10 seconds
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 10000);

    // SSE for real-time
    let sse: EventSource | null = null;
    try {
      sse = new EventSource("/api/notifications/stream");
      sse.onmessage = (event) => {
        if (!event.data || event.data === "connected") return;
        try {
          const n: AppNotification = JSON.parse(event.data);
          setNotifications(prev => [n, ...prev.filter(x => x.id !== n.id)]);
          setUnread(prev => prev + 1);
          // Bell shake
          setShake(true);
          setTimeout(() => setShake(false), 600);
          prevUnread.current += 1;
        } catch { /* ignore */ }
      };
    } catch { /* SSE not supported */ }

    return () => { clearInterval(interval); sse?.close(); };
  }, []);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const markAllRead = async () => {
    await fetch("/api/notifications/mark-read", { method: "POST" });
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnread(0);
    prevUnread.current = 0;
  };

  const clearAll = async () => {
    await fetch("/api/notifications", { method: "DELETE" });
    setNotifications([]);
    setUnread(0);
    prevUnread.current = 0;
  };

  const typeIcon = (type: AppNotification["type"]) => {
    if (type === "order") return <ShoppingCart size={13} color="#4ade80" />;
    if (type === "fulfillment") return <Package size={13} color="#f5c842" />;
    if (type === "autopilot") return <Zap size={13} color="#a78bfa" />;
    return <Info size={13} color="#60a5fa" />;
  };

  const typeColor = (type: AppNotification["type"]) => {
    if (type === "order") return "rgba(74,222,128,0.15)";
    if (type === "fulfillment") return "rgba(245,200,66,0.1)";
    if (type === "autopilot") return "rgba(139,92,246,0.12)";
    return "rgba(96,165,250,0.08)";
  };

  const typeBorder = (type: AppNotification["type"]) => {
    if (type === "order") return "rgba(74,222,128,0.25)";
    if (type === "fulfillment") return "rgba(245,200,66,0.2)";
    if (type === "autopilot") return "rgba(139,92,246,0.2)";
    return "rgba(96,165,250,0.15)";
  };

  const publishListing = async (e: React.MouseEvent, listingId: number) => {
    e.stopPropagation();
    setPublishedIds(prev => ({ ...prev, [listingId]: "loading" }));
    try {
      await fetch(`/api/dropship/listings/${listingId}/status`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "active" }),
      });
      setPublishedIds(prev => ({ ...prev, [listingId]: "done" }));
    } catch {
      setPublishedIds(prev => { const n = { ...prev }; delete n[listingId]; return n; });
    }
  };

  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => { setOpen(o => !o); if (!open && unread > 0) markAllRead(); }}
        style={{
          position: "relative", background: "none", border: "none",
          cursor: "pointer", color: unread > 0 ? "#f5c842" : "rgba(255,255,255,0.35)",
          padding: "6px", borderRadius: 8, display: "flex", alignItems: "center",
          animation: shake ? "bellShake 0.5s ease" : "none",
          transition: "color 0.2s",
        }}
        title={`${unread} unread notification${unread !== 1 ? "s" : ""}`}
      >
        {unread > 0 ? <BellRing size={18} /> : <Bell size={18} />}
        {unread > 0 && (
          <span style={{
            position: "absolute", top: 2, right: 2,
            width: 16, height: 16, borderRadius: "50%",
            background: "#f87171", color: "#fff", fontSize: 9, fontWeight: 900,
            display: "flex", alignItems: "center", justifyContent: "center",
            border: "1.5px solid rgba(10,0,20,0.97)",
          }}>
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: "absolute", bottom: "calc(100% + 8px)", right: 0, zIndex: 9999,
          width: 340, maxHeight: 480,
          background: "#130d22", border: "1px solid rgba(139,92,246,0.25)",
          borderRadius: 14, overflow: "hidden",
          boxShadow: "0 8px 40px rgba(0,0,0,0.7)",
          display: "flex", flexDirection: "column",
        }}>
          {/* Header */}
          <div style={{ padding: "12px 14px 10px", borderBottom: "1px solid rgba(255,255,255,0.07)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <Bell size={14} color="#a78bfa" />
              <span style={{ color: "#fff", fontWeight: 800, fontSize: 13 }}>Notifications</span>
              {unread > 0 && (
                <span style={{ background: "rgba(248,113,113,0.15)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 99, padding: "1px 7px", color: "#f87171", fontSize: 10, fontWeight: 700 }}>{unread} new</span>
              )}
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              {notifications.length > 0 && (
                <button onClick={markAllRead} title="Mark all read" style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.3)", padding: 4, borderRadius: 6 }}>
                  <CheckCheck size={13} />
                </button>
              )}
              {notifications.length > 0 && (
                <button onClick={clearAll} title="Clear all" style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.3)", padding: 4, borderRadius: 6 }}>
                  <Trash2 size={13} />
                </button>
              )}
              <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.3)", padding: 4, borderRadius: 6 }}>
                <X size={13} />
              </button>
            </div>
          </div>

          {/* List */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {notifications.length === 0 ? (
              <div style={{ padding: "32px 16px", textAlign: "center", color: "rgba(255,255,255,0.2)", fontSize: 12 }}>
                <Bell size={28} style={{ opacity: 0.15, marginBottom: 8, display: "block", margin: "0 auto 8px" }} />
                No notifications yet
              </div>
            ) : notifications.slice(0, 25).map(n => (
              <div key={n.id} style={{
                padding: "10px 14px",
                background: n.read ? "transparent" : typeColor(n.type),
                borderBottom: "1px solid rgba(255,255,255,0.04)",
                borderLeft: n.read ? "none" : `3px solid ${typeBorder(n.type)}`,
                cursor: n.type === "fulfillment" || n.type === "order" ? "pointer" : "default",
              }}
              onClick={() => {
                if (n.orderId || n.listingId) {
                  setOpen(false);
                  setLocation("/resell/dropship");
                }
              }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ marginTop: 1, flexShrink: 0 }}>{typeIcon(n.type)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: n.read ? "rgba(255,255,255,0.6)" : "#fff", fontWeight: n.read ? 500 : 700, fontSize: 12, marginBottom: 3, lineHeight: 1.3 }}>{n.title}</div>
                    <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, lineHeight: 1.4, whiteSpace: "pre-line" }}>{n.body}</div>
                    {n.profit != null && n.profit > 0 && (
                      <div style={{ color: "#4ade80", fontWeight: 800, fontSize: 11, marginTop: 3 }}>+${n.profit} profit</div>
                    )}

                    {/* One-click publish for autopilot draft listings */}
                    {n.type === "autopilot" && n.listingId != null && (() => {
                      const pubState = publishedIds[n.listingId];
                      if (pubState === "done") {
                        return (
                          <div style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 6, padding: "4px 10px", borderRadius: 7, background: "rgba(74,222,128,0.12)", border: "1px solid rgba(74,222,128,0.25)", color: "#4ade80", fontSize: 10, fontWeight: 700 }}>
                            ✓ Published & Live
                          </div>
                        );
                      }
                      return (
                        <button
                          onClick={e => publishListing(e, n.listingId!)}
                          disabled={pubState === "loading"}
                          style={{
                            display: "inline-flex", alignItems: "center", gap: 5, marginTop: 6,
                            padding: "5px 12px", borderRadius: 7, border: "none", cursor: pubState === "loading" ? "default" : "pointer",
                            background: pubState === "loading" ? "rgba(139,92,246,0.1)" : "linear-gradient(135deg, #8b5cf6, #7c3aed)",
                            color: "#fff", fontSize: 11, fontWeight: 800,
                          }}>
                          {pubState === "loading" ? "Publishing…" : "⚡ Publish Listing"}
                        </button>
                      );
                    })()}

                    {/* Buy now link for fulfillment notifications */}
                    {n.sourceUrl && n.type === "fulfillment" && (
                      <a href={n.sourceUrl} target="_blank" rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 6, padding: "4px 10px", borderRadius: 7, background: "rgba(245,200,66,0.15)", border: "1px solid rgba(245,200,66,0.3)", color: "#f5c842", fontSize: 10, fontWeight: 700, textDecoration: "none" }}>
                        🛒 Buy Now
                      </a>
                    )}
                  </div>
                  <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 9, flexShrink: 0, marginTop: 2 }}>{timeAgo(n.createdAt)}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div style={{ padding: "8px 14px", borderTop: "1px solid rgba(255,255,255,0.06)", textAlign: "center", flexShrink: 0 }}>
              <button onClick={() => { setOpen(false); setLocation("/resell/autopilot"); }}
                style={{ background: "none", border: "none", color: "rgba(139,92,246,0.7)", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>
                View Autopilot →
              </button>
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes bellShake {
          0%,100% { transform: rotate(0); }
          20% { transform: rotate(-15deg); }
          40% { transform: rotate(15deg); }
          60% { transform: rotate(-10deg); }
          80% { transform: rotate(10deg); }
        }
      `}</style>
    </div>
  );
}
