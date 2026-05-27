import { Router, type Request, type Response } from "express";

const router = Router();

export interface AppNotification {
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

// In-memory store
export const notifications: AppNotification[] = [];

// SSE client connections
const sseClients = new Set<Response>();

// Emit a notification to all connected clients
export function emitNotification(n: Omit<AppNotification, "id" | "read" | "createdAt">) {
  const notification: AppNotification = {
    ...n,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    read: false,
    createdAt: new Date().toISOString(),
  };
  notifications.unshift(notification);
  if (notifications.length > 200) notifications.splice(200);

  // Push to all SSE clients
  const payload = `data: ${JSON.stringify(notification)}\n\n`;
  sseClients.forEach(client => {
    try { client.write(payload); } catch { sseClients.delete(client); }
  });

  return notification;
}

// GET /api/notifications - get all (newest first)
router.get("/", (_req: Request, res: Response) => {
  res.json({ notifications, unread: notifications.filter(n => !n.read).length });
});

// POST /api/notifications/mark-read - mark all as read
router.post("/mark-read", (_req: Request, res: Response) => {
  notifications.forEach(n => { n.read = true; });
  res.json({ ok: true });
});

// POST /api/notifications/mark-read/:id - mark one as read
router.post("/mark-read/:id", (req: Request, res: Response) => {
  const n = notifications.find(n => n.id === req.params.id);
  if (n) n.read = true;
  res.json({ ok: true });
});

// DELETE /api/notifications - clear all
router.delete("/", (_req: Request, res: Response) => {
  notifications.splice(0);
  res.json({ ok: true });
});

// GET /api/notifications/stream - SSE endpoint
router.get("/stream", (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();

  // Send recent unread notifications on connect
  const recent = notifications.slice(0, 5).filter(n => !n.read);
  recent.forEach(n => res.write(`data: ${JSON.stringify(n)}\n\n`));

  // Heartbeat every 30s
  const heartbeat = setInterval(() => {
    try { res.write(`: heartbeat\n\n`); } catch { clearInterval(heartbeat); sseClients.delete(res); }
  }, 30000);

  sseClients.add(res);
  req.on("close", () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  });
});

export default router;
