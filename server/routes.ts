import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { randomUUID } from "crypto";
import { z } from "zod";
import { searchUsersForDiscovery, slugifyHandleBase } from "./userSearchTools";
import { registerAccountEmailRoutes } from "./accountEmailRoutes";
import { requireAdmin, resolveRequestUser, isAdminEmail } from "./adminHelper";
import { pool } from "./pool";
import { savePushSubscription, removePushSubscription, sendPushToUser, VAPID_PUBLIC } from "./pushNotifications";
import { createNotification, deliverPush, groupMessageNotifications } from "./notificationService";
import { registerStripeRoutes } from "./routes/stripe";
import { getExchangeRates, convertRatesToBase, type CurrencyCode as FxCurrencyCode } from "./exchangeRatesService";
import { getAdminDb } from "./lib/firebaseAdmin";
import { assessRisk } from "./security/riskEngine";
import { validatePinToken } from "./securityCenter";

const transferRateMap = new Map<string, { count: number; resetAt: number }>();
function checkTransferRateLimit(userId: string, maxPerHour = 10): boolean {
  const now = Date.now();
  const entry = transferRateMap.get(userId);
  if (!entry || now > entry.resetAt) {
    transferRateMap.set(userId, { count: 1, resetAt: now + 3_600_000 });
    return true;
  }
  if (entry.count >= maxPerHour) return false;
  entry.count++;
  return true;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Ensure wallets JSONB column exists (idempotent migration)
  await pool.query(
    `ALTER TABLE app_users ADD COLUMN IF NOT EXISTS wallets JSONB`
  ).catch(() => {});

  // Savings goals table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS savings_goals (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      emoji TEXT NOT NULL DEFAULT '🎯',
      target NUMERIC NOT NULL,
      saved NUMERIC NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'PLN',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `).catch(() => {});

  // Recurring payments table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS recurring_payments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      recipient TEXT NOT NULL,
      amount NUMERIC NOT NULL,
      currency TEXT NOT NULL DEFAULT 'PLN',
      frequency TEXT NOT NULL DEFAULT 'monthly',
      next_date DATE NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `).catch(() => {});

  registerAccountEmailRoutes(app);
  registerStripeRoutes(app);

  // --- /api/me — returns the currently authenticated user (session-based) ---
  app.get("/api/me", async (req, res) => {
    try {
      const sessionUser = await resolveRequestUser(req);
      if (!sessionUser?.id) {
        return res.status(401).json({ loggedIn: false });
      }
      // Fetch full profile from storage so we return fresh data
      const user = await storage.getUser(sessionUser.id);
      if (!user) {
        return res.status(401).json({ loggedIn: false });
      }
      const admin = isAdminEmail(user.email);
      const rawRow = await pool.query(
        `SELECT email_verified FROM app_users WHERE id = $1 LIMIT 1`, [user.id]
      );
      const emailVerified = rawRow.rows[0]?.email_verified ?? false;
      return res.json({
        loggedIn: true,
        id: user.id,
        name: user.name,
        email: user.email,
        handle: user.handle ?? null,
        phone: user.phone ?? null,
        avatar: user.avatar ?? null,
        balance: user.balance ?? 0,
        pushNotifications: user.pushNotifications ?? true,
        emailDigest: user.emailDigest ?? false,
        biometricLogin: user.biometricLogin ?? true,
        hideBalances: user.hideBalances ?? false,
        appearance: user.appearance ?? "obsidian-gold",
        role: admin ? "admin" : "user",
        isAdmin: admin,
        emailVerified,
      });
    } catch {
      return res.status(401).json({ loggedIn: false });
    }
  });

  // --- Browser Parity: access flags ---
  app.get("/api/me/access", async (req, res) => {
    try {
      const user = await resolveRequestUser(req);
      if (!user) {
        return res.json({ isAdmin: false, permissions: {} });
      }
      const admin = isAdminEmail(user.email);
      return res.json({
        isAdmin: admin,
        userId: user.id,
        permissions: {
          canTransfer: true,
          canViewHistory: true,
          canManageCards: true,
          canAccessAdminConsole: admin,
        },
      });
    } catch {
      return res.json({ isAdmin: false, permissions: {} });
    }
  });

  // --- User ---
  app.get("/api/user/:id", async (req, res) => {
    const sessionUser = await resolveRequestUser(req);
    if (!sessionUser?.id) return res.status(401).json({ message: "Brak autoryzacji." });
    if (sessionUser.id !== req.params.id && !isAdminEmail(sessionUser.email)) {
      return res.status(403).json({ message: "Brak dostępu." });
    }
    const user = await storage.getUser(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  });

  app.patch("/api/user/:id", async (req, res) => {
    try {
      const sessionUser = await resolveRequestUser(req);
      if (!sessionUser?.id) return res.status(401).json({ message: "Brak autoryzacji." });
      if (sessionUser.id !== req.params.id && !isAdminEmail(sessionUser.email)) {
        return res.status(403).json({ message: "Brak dostępu." });
      }
      const allowed = z.object({
        name: z.string().optional(),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        address: z.string().optional(),
        handle: z.string().optional(),
        balance: z.number().optional(),
        pushNotifications: z.boolean().optional(),
        emailDigest: z.boolean().optional(),
        biometricLogin: z.boolean().optional(),
        hideBalances: z.boolean().optional(),
        appearance: z.enum(["obsidian-gold", "arctic-platinum", "graphite-emerald"]).optional(),
        language: z.enum(["en", "pl"]).optional(),
        currencies: z.object({ enabled: z.array(z.string()), primary: z.string() }).optional(),
      }).parse(req.body);

      // Validate handle uniqueness if being updated
      if (allowed.handle) {
        const raw = allowed.handle.trim().replace(/^@/, "");
        if (!raw) return res.status(400).json({ message: "Host nie może być pusty" });
        const normalizedHandle = "@" + slugifyHandleBase(raw);
        const existing = await storage.getUserByHandle(normalizedHandle);
        if (existing && existing.id !== req.params.id) {
          return res.status(409).json({ message: "Ten host jest już zajęty. Wybierz inny." });
        }
        allowed.handle = normalizedHandle;
      }

      const updated = await storage.updateUser(req.params.id, allowed);
      if (!updated) return res.status(404).json({ message: "User not found" });
      res.json(updated);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  // --- Transactions ---
  app.get("/api/transactions/:userId", async (req, res) => {
    const sessionUser = await resolveRequestUser(req);
    if (!sessionUser?.id) return res.status(401).json({ message: "Brak autoryzacji." });
    if (sessionUser.id !== req.params.userId && !isAdminEmail(sessionUser.email)) {
      return res.status(403).json({ message: "Brak dostępu." });
    }
    const txs = await storage.getTransactions(req.params.userId);
    res.json(txs);
  });

  app.post("/api/transactions", async (req, res) => {
    try {
      const schema = z.object({
        userId: z.string(),
        type: z.enum(["send", "receive", "topup", "payment"]),
        status: z.enum(["pending", "completed", "failed"]).default("completed"),
        amount: z.number(),
        title: z.string(),
        subtitle: z.string(),
        category: z.string().optional(),
        noBalanceUpdate: z.boolean().optional().default(false),
      });
      const data = schema.parse(req.body);
      const { noBalanceUpdate, ...txData } = data;
      const tx = await storage.createTransaction(txData);
      if (!noBalanceUpdate) {
        const user = await storage.getUser(data.userId);
        if (user) {
          await storage.updateUser(data.userId, { balance: user.balance + data.amount });
        }
      }
      res.status(201).json(tx);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  // ── POST /api/transactions/:id/status — backend-only status transitions ──────
  // The `accepted` status is ONLY settable via this endpoint (admin/system), never by clients.
  // Other status transitions (pending → completed → failed/refunded/disputed/cancelled) are
  // also recorded here with full audit history.
  app.post("/api/transactions/:id/status", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const admin = await resolveRequestUser(req);
      const { toStatus, reason } = z.object({
        toStatus: z.enum(["accepted", "refunded", "disputed", "cancelled", "completed", "failed"]),
        reason: z.string().optional(),
      }).parse(req.body);

      const txRow = await pool.query(`SELECT * FROM transactions WHERE id = $1`, [id]);
      if (txRow.rowCount === 0) return res.status(404).json({ message: "Transaction not found" });
      const tx = txRow.rows[0];

      // Record the transition to history
      await pool.query(
        `INSERT INTO transaction_status_history (transaction_id, from_status, to_status, changed_by, reason)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, tx.status, toStatus, admin?.email ?? "system", reason ?? null]
      );

      // Apply the status update (and set acceptedAt if accepted)
      const accepted_at = toStatus === "accepted" ? new Date() : null;
      await pool.query(
        `UPDATE transactions SET status = $1${toStatus === "accepted" ? ", accepted_at = $3" : ""} WHERE id = $2`,
        toStatus === "accepted" ? [toStatus, id, accepted_at] : [toStatus, id]
      );

      // Notify the transaction owner
      const notifMsg: Record<string, string> = {
        accepted: `Your transaction of $${Math.abs(tx.amount)} has been accepted.`,
        refunded: `Your transaction of $${Math.abs(tx.amount)} has been refunded.`,
        disputed: `A dispute has been opened for your transaction of $${Math.abs(tx.amount)}.`,
        cancelled: `Your transaction of $${Math.abs(tx.amount)} has been cancelled.`,
        completed: `Your transaction of $${Math.abs(tx.amount)} has been completed.`,
        failed: `Your transaction of $${Math.abs(tx.amount)} failed.`,
      };
      await createNotification({
        userId: tx.user_id,
        type: toStatus === "refunded" ? "success" : toStatus === "disputed" || toStatus === "failed" ? "alert" : "transfer",
        category: "payment",
        priority: ["disputed", "failed"].includes(toStatus) ? "high" : "normal",
        title: `Transaction ${toStatus.charAt(0).toUpperCase() + toStatus.slice(1)}`,
        message: notifMsg[toStatus] ?? `Transaction status updated to ${toStatus}.`,
        route: "/transactions",
        relatedId: String(id),
        relatedType: "transaction",
        dedupeKey: `tx:status:${id}:${toStatus}`,
      }).catch(() => {});

      res.json({ ok: true, transactionId: id, newStatus: toStatus });
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  // --- Notifications ---
  app.get("/api/notifications/:userId", async (req, res) => {
    const sessionUser = await resolveRequestUser(req);
    if (!sessionUser?.id) return res.status(401).json({ message: "Brak autoryzacji." });
    if (sessionUser.id !== req.params.userId && !isAdminEmail(sessionUser.email)) {
      return res.status(403).json({ message: "Brak dostępu." });
    }
    let notifs = await storage.getNotifications(req.params.userId);
    // Optional filters: ?read=true|false  ?category=message|payment|...
    const { read, category } = req.query;
    if (read !== undefined) {
      const wantRead = read === "true";
      notifs = notifs.filter(n => n.read === wantRead);
    }
    if (category && typeof category === "string") {
      notifs = notifs.filter(n => n.category === category);
    }
    res.json(notifs);
  });

  app.post("/api/notifications", async (req, res) => {
    try {
      const sessionUser = await resolveRequestUser(req);
      if (!sessionUser?.id) return res.status(401).json({ message: "Unauthorized" });
      const schema = z.object({
        userId: z.string(),
        type: z.enum(["info", "alert", "success", "transfer"]),
        category: z.enum(["message", "payment", "contract", "system", "security"]).default("system"),
        priority: z.enum(["low", "normal", "high", "critical"]).default("normal"),
        title: z.string(),
        message: z.string(),
        read: z.boolean().default(false),
        route: z.string().optional(),
        dedupeKey: z.string().optional(),
        groupKey: z.string().optional(),
      });
      const data = schema.parse(req.body);
      // Users can only create notifications for themselves; admins can target any user
      if (data.userId !== sessionUser.id && !isAdminEmail(sessionUser.email)) {
        return res.status(403).json({ message: "Forbidden" });
      }

      // Deduplication: if dedupeKey provided, skip if same-key notification exists in last 10min
      if (data.dedupeKey) {
        const existing = await storage.getNotifications(data.userId);
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
        const dupe = existing.find(n =>
          n.dedupeKey === data.dedupeKey &&
          new Date(n.date) > tenMinutesAgo
        );
        if (dupe) return res.status(200).json(dupe);
      }

      const notif = await storage.createNotification(data);
      res.status(201).json(notif);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.patch("/api/notifications/:id/read", async (req, res) => {
    const sessionUser = await resolveRequestUser(req);
    if (!sessionUser?.id) return res.status(401).json({ message: "Unauthorized" });
    // Admins can mark any notification read; users only their own
    const ownerFilter = isAdminEmail(sessionUser.email) ? undefined : sessionUser.id;
    await storage.markNotificationRead(req.params.id, ownerFilter);
    res.json({ success: true });
  });

  app.patch("/api/notifications/user/:userId/read-all", async (req, res) => {
    const sessionUser = await resolveRequestUser(req);
    if (!sessionUser?.id) return res.status(401).json({ message: "Unauthorized" });
    if (sessionUser.id !== req.params.userId && !isAdminEmail(sessionUser.email)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    await storage.markAllNotificationsRead(req.params.userId);
    res.json({ success: true });
  });

  app.delete("/api/notifications/:id", async (req, res) => {
    try {
      const sessionUser = await resolveRequestUser(req);
      if (!sessionUser?.id) return res.status(401).json({ message: "Unauthorized" });
      // Admins can delete any; regular users only their own (enforced at DB level)
      const ownerFilter = isAdminEmail(sessionUser.email) ? undefined : sessionUser.id;
      const result = await storage.deleteNotification(req.params.id, ownerFilter);
      if (!result.deleted) return res.status(404).json({ message: "Not found or not authorized" });
      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  // --- Notification Preferences ---
  app.get("/api/notification-preferences/:userId", async (req, res) => {
    try {
      const sessionUser = await resolveRequestUser(req);
      if (!sessionUser?.id) return res.status(401).json({ message: "Unauthorized" });
      if (sessionUser.id !== req.params.userId && !isAdminEmail(sessionUser.email)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const prefs = await storage.getNotificationPreferences(req.params.userId);
      res.json(prefs);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.put("/api/notification-preferences/:userId", async (req, res) => {
    try {
      const sessionUser = await resolveRequestUser(req);
      if (!sessionUser?.id) return res.status(401).json({ message: "Unauthorized" });
      if (sessionUser.id !== req.params.userId && !isAdminEmail(sessionUser.email)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const schema = z.object({
        category: z.enum(["message", "payment", "contract", "system", "security"]),
        inApp: z.boolean().optional(),
        push: z.boolean().optional(),
        quietStart: z.number().min(0).max(23).nullable().optional(),
        quietEnd: z.number().min(0).max(23).nullable().optional(),
        importantOnlyInQuiet: z.boolean().optional(),
        dailySummary: z.boolean().optional(),
      });
      const data = schema.parse(req.body);
      const pref = await storage.upsertNotificationPreference({
        userId: req.params.userId,
        inApp: true,
        push: true,
        ...data,
      });
      res.json(pref);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  // --- Admin: Send Test Notification ---
  app.post("/api/admin/send-test-notification", async (req, res) => {
    try {
      const sessionUser = await resolveRequestUser(req);
      if (!sessionUser?.id || !isAdminEmail(sessionUser.email)) {
        return res.status(403).json({ message: "Admin only" });
      }
      const schema = z.object({
        userId: z.string(),
        category: z.enum(["message", "payment", "contract", "system", "security"]),
        priority: z.enum(["low", "normal", "high", "critical"]),
        title: z.string(),
        message: z.string(),
        route: z.string().optional(),
        sendPush: z.boolean().default(false),
      });
      const data = schema.parse(req.body);
      const typeMap: Record<string, "info" | "alert" | "success" | "transfer"> = {
        message: "info",
        payment: "transfer",
        contract: "info",
        system: "alert",
        security: "alert",
      };
      // Use notification service: handles quiet hours, rate limits, push gating
      const notif = await createNotification({
        userId: data.userId,
        type: typeMap[data.category] || "info",
        category: data.category,
        priority: data.priority,
        title: data.title,
        message: data.message,
        route: data.route,
        sendPush: data.sendPush,
      });
      if (!notif) {
        return res.status(429).json({ message: "Rate limited or suppressed by quiet hours" });
      }
      res.json(notif);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  // ── POST /api/admin/notifications/test — scenario-based notification test ───
  app.post("/api/admin/notifications/test", requireAdmin, async (req, res) => {
    try {
      const schema = z.object({
        userId: z.string(),
        scenario: z.enum(["message_received", "payment_sent", "payment_received", "contract_funded", "contract_released", "security_alert", "system_maintenance", "message_group", "payment_accepted", "payment_failed"]),
        sendPush: z.boolean().default(false),
      });
      const { userId, scenario, sendPush } = schema.parse(req.body);
      const scenarios: Record<string, { category: "message"|"payment"|"contract"|"system"|"security"; priority: "low"|"normal"|"high"|"critical"; title: string; message: string; route?: string }> = {
        message_received:    { category: "message",  priority: "normal",   title: "New Message",           message: "You have a new message from @testuser",      route: "/messages" },
        payment_sent:        { category: "payment",  priority: "normal",   title: "Payment Sent",           message: "You sent $50.00 to @testuser",               route: "/transactions" },
        payment_received:    { category: "payment",  priority: "high",     title: "Payment Received",       message: "@testuser sent you $100.00",                 route: "/transactions" },
        contract_funded:     { category: "contract", priority: "high",     title: "Contract Funded",        message: "Your contract has been funded with $500.00", route: "/agreements" },
        contract_released:   { category: "contract", priority: "high",     title: "Funds Released",         message: "Contract funds of $500.00 have been released to you", route: "/agreements" },
        security_alert:      { category: "security", priority: "critical",  title: "Security Alert",        message: "Unusual login attempt detected on your account", route: "/security" },
        system_maintenance:  { category: "system",   priority: "low",      title: "Scheduled Maintenance",  message: "Finlys will undergo maintenance tonight 2–4 AM UTC" },
        message_group:       { category: "message",  priority: "normal",   title: "3 new messages",         message: "You have 3 unread messages from @alice in one conversation", route: "/messages" },
        payment_accepted:    { category: "payment",  priority: "high",     title: "Payment Accepted",        message: "Your payment of $250.00 has been accepted and confirmed", route: "/transactions" },
        payment_failed:      { category: "payment",  priority: "high",     title: "Payment Failed",          message: "Your payment of $250.00 could not be processed. Please try again.", route: "/transactions" },
      };
      const tpl = scenarios[scenario];
      const typeMap: Record<string, "info"|"alert"|"success"|"transfer"> = { message: "info", payment: "transfer", contract: "info", system: "alert", security: "alert" };
      const notif = await createNotification({ userId, type: typeMap[tpl.category] || "info", ...tpl, sendPush, dedupeKey: `scenario:${scenario}:${userId}:${Date.now()}` });
      if (!notif) return res.status(429).json({ message: "Rate limited or suppressed" });
      res.json(notif);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  // ── POST /api/push/register-token — register a push subscription to device_push_tokens ─
  app.post("/api/push/register-token", async (req, res) => {
    try {
      const user = await resolveRequestUser(req);
      if (!user?.id) return res.status(401).json({ message: "Unauthorized" });
      const { endpoint, keys, userAgent } = z.object({
        endpoint: z.string().url(),
        keys: z.object({ p256dh: z.string(), auth: z.string() }),
        userAgent: z.string().optional(),
      }).parse(req.body);
      await pool.query(
        `INSERT INTO device_push_tokens (user_id, endpoint, p256dh, auth, user_agent, active)
         VALUES ($1, $2, $3, $4, $5, true)
         ON CONFLICT (endpoint) DO UPDATE SET user_id = $1, active = true, last_used_at = now()`,
        [user.id, endpoint, keys.p256dh, keys.auth, userAgent ?? null]
      );
      // Also register via legacy savePushSubscription for push dispatch compatibility
      await savePushSubscription(user.id, { endpoint, keys }).catch(() => {});
      res.json({ ok: true });
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  // ── POST /api/push/deactivate-token — deactivate a push token ───────────────
  app.post("/api/push/deactivate-token", async (req, res) => {
    try {
      const user = await resolveRequestUser(req);
      if (!user?.id) return res.status(401).json({ message: "Unauthorized" });
      const { endpoint } = z.object({ endpoint: z.string() }).parse(req.body);
      await pool.query(
        `UPDATE device_push_tokens SET active = false WHERE endpoint = $1 AND user_id = $2`,
        [endpoint, user.id]
      );
      await removePushSubscription(user.id, endpoint).catch(() => {});
      res.json({ ok: true });
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });


  // --- Support Tickets ---
  app.get("/api/support/:userId", async (req, res) => {
    const tickets = await storage.getSupportTickets(req.params.userId);
    res.json(tickets);
  });

  app.post("/api/support", async (req, res) => {
    try {
      const schema = z.object({
        userId: z.string(),
        title: z.string(),
        message: z.string(),
      });
      const data = schema.parse(req.body);
      const ticketId = "t_" + randomUUID();
      const ticket = await storage.createSupportTicket({ id: ticketId, userId: data.userId, title: data.title, status: "open" });
      await storage.addSupportMessage({ id: randomUUID(), ticketId, senderId: "user", text: data.message });
      res.status(201).json(ticket);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.post("/api/support/:id/messages", async (req, res) => {
    try {
      const schema = z.object({
        senderId: z.string(),
        text: z.string(),
      });
      const data = schema.parse(req.body);
      const msg = await storage.addSupportMessage({ ...data, id: randomUUID(), ticketId: req.params.id });
      res.status(201).json(msg);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  // Directory — admin only
  app.get("/api/users/directory", requireAdmin, async (req, res) => {
    try {
      const excludeUserId = String(req.query.excludeUserId || "");
      const limit = Math.min(parseInt(String(req.query.limit || "100")), 200);
      const allUsers = await storage.getAllUsers();
      const safe = allUsers
        .filter(u => u.id !== excludeUserId)
        .slice(0, limit)
        .map(({ passwordHash: _, ...u }) => u);
      res.json(safe);
    } catch {
      res.status(500).json({ message: "Directory fetch failed" });
    }
  });

  app.get("/api/users/search", async (req, res) => {
    try {
      const q = String(req.query.q || "");
      const excludeUserId = String(req.query.excludeUserId || "");
      const allUsers = await storage.getAllUsers();

      let raw: any[];
      if (!q) {
        raw = (allUsers as any[])
          .filter((u: any) => String(u?.id || "") !== String(excludeUserId || ""))
          .map((u: any) => ({
            id: u.id,
            name: u.name,
            email: u.email,
            phone: u.phone,
            handle: u.handle,
          }))
          .slice(0, 30);
      } else {
        raw = searchUsersForDiscovery(allUsers as any[], q, excludeUserId);
      }

      const items = raw.map((u: any) => ({
        id: u.id,
        email: u.email || "",
        displayName: u.name || "",
        host: u.handle ? String(u.handle).replace(/^@/, "") : null,
        phone: u.phone || null,
        avatarUrl: null,
      }));
      res.json({ items, total: items.length });
    } catch (error) {
      res.status(500).json({ message: "User search failed" });
    }
  });


  app.get("/api/users/by-handle", async (req, res) => {
    try {
      const requester = await resolveRequestUser(req);
      if (!requester) return res.status(401).json({ message: "Unauthorized" });
      const raw = String(req.query.handle || "").trim();
      const normalized = raw.startsWith("@") ? raw : `@${raw}`;
      const user = await storage.getUserByHandle(normalized);
      if (!user) return res.status(404).json({ message: "User not found" });
      res.json({ id: user.id, name: user.name, handle: user.handle });
    } catch (e: unknown) { res.status(500).json({ message: e instanceof Error ? e.message : "Error" }); }
  });

  app.get("/api/users/:uid", async (req, res) => {
    try {
      const requester = await resolveRequestUser(req);
      if (!requester) return res.status(401).json({ message: "Unauthorized" });
      const user = await storage.getUser(req.params.uid);
      if (!user) return res.status(404).json({ message: "User not found" });
      res.json({ id: user.id, name: user.name, handle: user.handle, email: user.email });
    } catch (e: unknown) { res.status(500).json({ message: e instanceof Error ? e.message : "Error" }); }
  });

  app.get("/api/users/handle/check", async (req, res) => {
    try {
      const raw = String(req.query.handle || "").trim().replace(/^@/, "");
      if (!raw) return res.status(400).json({ message: "handle is required" });
      const handle = "@" + slugifyHandleBase(raw);
      const existing = await storage.getUserByHandle(handle);
      res.json({ handle, available: !existing });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/users/heartbeat", async (req, res) => {
    try {
      const userId = String(req.body?.userId || "");
      if (!userId) return res.status(400).json({ message: "userId required" });
      await storage.updateLastActive(userId);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/admin/stats", requireAdmin, async (req, res) => {
    try {
      const [stats, allUsers] = await Promise.all([
        storage.getAdminStats(),
        storage.getAllUsers(),
      ]);
      res.json({
        totalUsers: stats.totalUsers,
        onlineUsers: stats.onlineUsers,
        users: allUsers.map(u => ({
          id: u.id,
          name: u.name,
          email: u.email,
          handle: u.handle,
          balance: u.balance,
          createdAt: u.createdAt,
          lastActiveAt: u.lastActiveAt,
          isOnline: u.lastActiveAt ? (Date.now() - new Date(u.lastActiveAt).getTime()) < 5 * 60 * 1000 : false,
        })),
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ── GET /api/admin/messages — all dm_conversations + last messages (admin only) ──
  app.get("/api/admin/messages", requireAdmin, async (req, res) => {
    try {
      const page   = Math.max(1, parseInt(String(req.query.page  ?? "1"), 10));
      const limit  = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "40"), 10)));
      const search = String(req.query.search ?? "").trim().toLowerCase();
      const offset = (page - 1) * limit;

      const { rows } = await pool.query(`
        SELECT
          dc.id              AS conv_id,
          ua.host            AS user_a_handle,
          ub.host            AS user_b_handle,
          dc.updated_at      AS last_msg_at,
          COUNT(dm.id)::int  AS msg_count,
          (SELECT text FROM dm_messages WHERE conversation_id = dc.id ORDER BY created_at DESC LIMIT 1) AS last_text
        FROM dm_conversations dc
        JOIN app_users ua ON ua.id = dc.user_a_id
        JOIN app_users ub ON ub.id = dc.user_b_id
        LEFT JOIN dm_messages dm ON dm.conversation_id = dc.id
        GROUP BY dc.id, ua.host, ub.host, dc.updated_at
        ORDER BY dc.updated_at DESC NULLS LAST
      `);

      const filtered = search
        ? rows.filter((r: any) =>
            r.user_a_handle?.includes(search) ||
            r.user_b_handle?.includes(search) ||
            r.last_text?.toLowerCase().includes(search)
          )
        : rows;

      res.json({ conversations: filtered.slice(offset, offset + limit), total: filtered.length, page, limit });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ── GET /api/admin/messages/:convId — all messages in a dm_conversation ───────
  app.get("/api/admin/messages/:convId", requireAdmin, async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT id, sender_id, text, created_at AS timestamp FROM dm_messages
         WHERE conversation_id = $1 ORDER BY created_at ASC`,
        [req.params.convId]
      );
      res.json({ messages: rows });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // NOTE: GET /api/admin/users is handled by realAuth.ts (registered before routes.ts).
  // The realAuth.ts version queries app_users directly and is the source of truth.
  // Removed duplicate from routes.ts to avoid shadowing conflicts.

  app.post("/api/admin/backfill-handles", requireAdmin, async (req, res) => {
    try {
      const allUsers = await storage.getAllUsers();
      const report: any[] = [];

      for (const user of allUsers) {
        const firstName = String(user.name || "user").trim().split(/\s+/)[0] || "user";
        const baseHandle = "@" + slugifyHandleBase(firstName);
        const currentHandle = user.handle || "";

        if (currentHandle === baseHandle) {
          report.push({ id: user.id, name: user.name, handle: currentHandle, action: "ok" });
          continue;
        }

        let newHandle = baseHandle;
        let attempt = 1;
        while (true) {
          const conflict = await storage.getUserByHandle(newHandle);
          if (!conflict || conflict.id === user.id) break;
          newHandle = baseHandle + (++attempt);
        }

        if (newHandle !== currentHandle) {
          await storage.updateUser(user.id, { handle: newHandle });
          report.push({ id: user.id, name: user.name, oldHandle: currentHandle, newHandle, action: "updated" });
        } else {
          report.push({ id: user.id, name: user.name, handle: currentHandle, action: "ok" });
        }
      }

      res.json({ success: true, total: allUsers.length, report });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // --- P2P Transfer (atomic, both sides) ---
  app.post("/api/transfer", async (req, res) => {
    try {
      const sessionUser = await resolveRequestUser(req);
      if (!sessionUser?.id) return res.status(401).json({ message: "Unauthorized" });

      if (!checkTransferRateLimit(sessionUser.id)) {
        return res.status(429).json({ message: "Zbyt wiele przelewów. Spróbuj ponownie za godzinę." });
      }

      const currencyCodes = ["NOK", "USD", "EUR", "GBP", "CHF", "PLN"] as const;
      const currencySymbols: Record<string, string> = { NOK: "kr", USD: "$", EUR: "€", GBP: "£", CHF: "₣", PLN: "zł" };

      const { senderId, recipientHandle, amount, note, currency, riskAcknowledged, pinToken } = z.object({
        senderId: z.string(),
        recipientHandle: z.string(),
        amount: z.number().positive().max(1_000_000),
        note: z.string().max(500).optional(),
        currency: z.enum(currencyCodes).default("USD"),
        riskAcknowledged: z.boolean().optional(),
        pinToken: z.string().optional(),
      }).parse(req.body);

      if (sessionUser.id !== senderId) return res.status(403).json({ message: "Forbidden" });

      const sender = await storage.getUser(senderId);
      if (!sender) return res.status(404).json({ message: "Sender not found" });

      const normalizedHandle = recipientHandle.startsWith("@") ? recipientHandle : `@${recipientHandle}`;
      const recipient = await storage.getUserByHandle(normalizedHandle);
      if (!recipient) return res.status(404).json({ message: "Recipient not found" });

      if (sender.id === recipient.id) return res.status(400).json({ message: "Cannot send to yourself" });

      // ── Risk assessment (before PIN consumption so token survives retry) ───
      const risk = await assessRisk(sender.id, amount, recipient.id, pool);

      if (risk.level === "high" && !riskAcknowledged) {
        pool.query(
          `INSERT INTO security_events (id, user_id, type, description, metadata, risk_level) VALUES ($1,$2,$3,$4,$5,$6)`,
          [randomUUID(), sender.id, "transfer_failed", `Przelew zablokowany — wysokie ryzyko (${risk.score} pkt) do ${recipient.name}`, JSON.stringify({ amount, currency, recipientId: recipient.id, recipientHandle: normalizedHandle, riskScore: risk.score, riskReasons: risk.reasons, reason: "high_risk_blocked" }), risk.level]
        ).catch(() => {});
        return res.status(422).json({
          requiresAcknowledgment: true,
          riskLevel: "high",
          riskScore: risk.score,
          riskReasons: risk.reasons,
          message: "Operacja zatrzymana ze względów bezpieczeństwa. Skontaktuj się z pomocą.",
        });
      }

      // ── PIN verification gate — enforced when pin_enabled is true ────────────
      // Runs AFTER risk assessment so the token is only consumed when the
      // transfer will actually proceed (no retry-with-consumed-token bug).
      if (amount >= 100) {
        const pinRow = await pool.query(`SELECT pin_enabled FROM security_settings WHERE user_id=$1`, [sender.id]);
        const pinActive = pinRow.rows[0]?.pin_enabled === true;
        if (pinActive) {
          if (!pinToken) {
            return res.status(402).json({ requiresPin: true, message: "Wymagana weryfikacja PIN dla przelewów ≥ 100." });
          }
          if (!validatePinToken(sender.id, pinToken)) {
            return res.status(403).json({ message: "Nieprawidłowy lub wygasły token PIN." });
          }
        }
      }

      // Fetch sender and recipient wallet balances
      const senderWalletRow = await pool.query(`SELECT wallets FROM app_users WHERE id = $1`, [sender.id]);
      const recipientWalletRow = await pool.query(`SELECT wallets FROM app_users WHERE id = $1`, [recipient.id]);
      const senderWallets: Record<string, number> = senderWalletRow.rows[0]?.wallets || {};
      const recipientWallets: Record<string, number> = recipientWalletRow.rows[0]?.wallets || {};

      // All currencies (including USD) use wallets JSONB as single source of truth
      const senderCurrencyBalance = senderWallets[currency] ?? 0;
      if (senderCurrencyBalance < amount) {
        pool.query(
          `INSERT INTO security_events (id, user_id, type, description, metadata, risk_level) VALUES ($1,$2,$3,$4,$5,$6)`,
          [randomUUID(), sender.id, "transfer_failed", `Przelew nieudany — brak środków (${amount} ${currency})`, JSON.stringify({ amount, currency, recipientId: recipient.id, recipientHandle: normalizedHandle, reason: "insufficient_balance" }), risk.level]
        ).catch(() => {});
        return res.status(400).json({ message: `Insufficient ${currency} balance` });
      }

      // Update wallet JSONB for both sender and recipient — atomic transaction
      const newSenderWallets = { ...senderWallets, [currency]: parseFloat(((senderWallets[currency] ?? 0) - amount).toFixed(2)) };
      const newRecipientWallets = { ...recipientWallets, [currency]: parseFloat(((recipientWallets[currency] ?? 0) + amount).toFixed(2)) };
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(`UPDATE app_users SET wallets = $1 WHERE id = $2`, [JSON.stringify(newSenderWallets), sender.id]);
        await client.query(`UPDATE app_users SET wallets = $1 WHERE id = $2`, [JSON.stringify(newRecipientWallets), recipient.id]);
        await client.query("COMMIT");
      } catch (txErr) {
        await client.query("ROLLBACK");
        throw txErr;
      } finally {
        client.release();
      }

      // Create transactions
      await storage.createTransaction({ userId: sender.id, type: "send", status: "completed", amount: -amount, title: recipient.name, subtitle: note || "Transfer" });
      await storage.createTransaction({ userId: recipient.id, type: "receive", status: "completed", amount, title: sender.name, subtitle: note || "Transfer" });

      const transferText = note || "Sent a transfer";
      const sym = currencySymbols[currency] || currency;

      // Create/find dm_conversation and save transfer message (new dm_* system)
      let transferConvId: string | null = null;
      try {
        const pairKey = [sender.id, recipient.id].sort().join(":");
        let convRow = await pool.query(`SELECT id FROM dm_conversations WHERE pair_key = $1 LIMIT 1`, [pairKey]);
        let convId: string;
        if (convRow.rows[0]) {
          convId = convRow.rows[0].id;
        } else {
          convId = randomUUID();
          const [uA, uB] = [sender.id, recipient.id].sort();
          await pool.query(
            `INSERT INTO dm_conversations (id, pair_key, user_a_id, user_b_id, created_at, updated_at)
             VALUES ($1,$2,$3,$4,NOW(),NOW()) ON CONFLICT (pair_key) DO NOTHING`,
            [convId, pairKey, uA, uB]
          );
          convRow = await pool.query(`SELECT id FROM dm_conversations WHERE pair_key = $1 LIMIT 1`, [pairKey]);
          if (convRow.rows[0]) convId = convRow.rows[0].id;
        }
        const msgText = `💸 ${transferText} — ${sym}${amount.toFixed(2)}`;
        await pool.query(
          `INSERT INTO dm_messages (id, conversation_id, sender_id, text, created_at)
           VALUES ($1,$2,$3,$4,NOW())`,
          [randomUUID(), convId, sender.id, msgText]
        );
        await pool.query(`UPDATE dm_conversations SET updated_at=NOW() WHERE id=$1`, [convId]);
        transferConvId = convId;
      } catch (_dmErr) { /* graceful — transfer already committed */ }

      // Firebase signal → recipient sees transfer message in real-time on any device
      if (transferConvId) {
        try {
          const adminDb = getAdminDb();
          if (adminDb) {
            await adminDb.ref(`messaging/inbox/${recipient.id}`).set({ at: Date.now(), convId: transferConvId, from: sender.id });
            await adminDb.ref(`transfers/inbox/${recipient.id}`).set({ at: Date.now(), amount, currency, from: sender.id });
          }
        } catch (_fbErr) { /* non-fatal */ }
      }

      // Notification for recipient
      await storage.createNotification({ userId: recipient.id, type: "transfer", title: "Otrzymano przelew", message: `${sender.name} wysłał(a) Ci ${sym}${amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}` });

      // Security event for sender (with risk level)
      pool.query(
        `INSERT INTO security_events (id, user_id, type, description, metadata, risk_level) VALUES ($1,$2,$3,$4,$5,$6)`,
        [randomUUID(), sender.id, "transfer", `Wysłano przelew ${sym}${amount.toFixed(2)} ${currency} do ${recipient.name}`, JSON.stringify({ amount, currency, recipient: recipient.name, recipientHandle: normalizedHandle, riskScore: risk.score, riskReasons: risk.reasons, recipientId: recipient.id }), risk.level]
      ).catch(() => {});

      const responsePayload: Record<string, any> = { success: true, senderWallets: newSenderWallets, riskLevel: risk.level, recipientId: recipient.id };
      if (risk.level === "medium") {
        responsePayload.warning = "Wygląda na nietypową operację. Sprawdź dane przed potwierdzeniem.";
      }
      res.json(responsePayload);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  // --- Payment Request (sends notification, no money transfer) ---
  app.post("/api/payment-request", async (req, res) => {
    try {
      const sessionUser = await resolveRequestUser(req);
      if (!sessionUser?.id) return res.status(401).json({ message: "Unauthorized" });

      const { requesterId, recipientHandle, amount, note, currency } = z.object({
        requesterId: z.string(),
        recipientHandle: z.string(),
        amount: z.number().positive().max(1_000_000),
        note: z.string().max(500).optional(),
        currency: z.string().default("PLN"),
      }).parse(req.body);

      if (sessionUser.id !== requesterId) return res.status(403).json({ message: "Forbidden" });

      const requester = await storage.getUser(requesterId);
      if (!requester) return res.status(404).json({ message: "Requester not found" });

      const normalizedHandle = recipientHandle.startsWith("@") ? recipientHandle : `@${recipientHandle}`;
      const recipient = await storage.getUserByHandle(normalizedHandle);
      if (!recipient) return res.status(404).json({ message: "Recipient not found" });

      if (requester.id === recipient.id) return res.status(400).json({ message: "Cannot request from yourself" });

      const currencySymbols: Record<string, string> = { NOK: "kr", USD: "$", EUR: "€", GBP: "£", CHF: "₣", PLN: "zł" };
      const sym = currencySymbols[currency] || currency;

      // Notification for recipient — no money moved
      await storage.createNotification({
        userId: recipient.id,
        type: "transfer",
        title: "Prośba o przelew",
        message: `${requester.name} prosi Cię o ${sym}${amount.toLocaleString("pl-PL", { minimumFractionDigits: 2 })}${note ? ` — ${note}` : ""}`,
      });

      // Firebase real-time signal to recipient
      try {
        const adminDb = getAdminDb();
        if (adminDb) {
          await adminDb.ref(`transfers/requests/${recipient.id}`).set({ at: Date.now(), amount, currency, from: requester.id, fromHandle: normalizedHandle.slice(1), note: note || "" });
        }
      } catch (_fbErr) { /* non-fatal */ }

      // Pending record for requester
      await storage.createTransaction({ userId: requester.id, type: "receive", status: "pending", amount, title: recipient.name, subtitle: note || "Prośba o przelew" });

      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  // --- P2P Message (both sides) ---

  app.post("/api/message/send", async (req, res) => {
    try {
      const sessionUser = await resolveRequestUser(req);
      if (!sessionUser?.id) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const msgSchema = z.object({
        senderId: z.string().optional(),
        recipientId: z.string().optional(),
        targetUserId: z.string().optional(),
        recipientHandle: z.string().optional(),
        text: z.string().min(1),
        attachmentId: z.string().optional(),
        isAgreement: z.boolean().optional().default(false),
        agreementId: z.string().optional(),
        agreementTitle: z.string().optional(),
        agreementAmount: z.number().optional(),
        agreementCurrency: z.string().optional(),
      });

      const {
        senderId: bodySenderId,
        recipientId,
        targetUserId,
        recipientHandle,
        text,
        attachmentId,
        isAgreement,
        agreementId,
        agreementTitle,
        agreementAmount,
        agreementCurrency,
      } = msgSchema.parse(req.body);

      const senderId = String(bodySenderId || sessionUser.id);
      if (String(sessionUser.id) !== senderId) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const sender = await storage.getUser(senderId);
      if (!sender) return res.status(404).json({ message: "Sender not found" });

      let recipient: any = null;

      const directRecipientId = recipientId || targetUserId;
      if (directRecipientId) {
        recipient = await storage.getUser(String(directRecipientId));
      }

      if (!recipient && recipientHandle) {
        const normalizedHandle = recipientHandle.startsWith("@")
          ? recipientHandle
          : `@${recipientHandle}`;
        recipient = await storage.getUserByHandle(normalizedHandle);
      }

      if (!recipient) {
        return res.status(404).json({ message: "Recipient not found" });
      }

      if (String(recipient.id) === String(sender.id)) {
        return res.status(400).json({ message: "Cannot message yourself" });
      }

      const [userAId, userBId] = [String(sender.id), String(recipient.id)].sort();
      const pairKey = `${userAId}:${userBId}`;

      let convRow = await pool.query(
        `SELECT id FROM dm_conversations WHERE pair_key = $1 LIMIT 1`,
        [pairKey]
      );

      if (!convRow.rows[0]) {
        await pool.query(
          `INSERT INTO dm_conversations (id, pair_key, user_a_id, user_b_id, created_at, updated_at)
           VALUES ($1, $2, $3, $4, NOW(), NOW())
           ON CONFLICT (pair_key) DO NOTHING`,
          [randomUUID(), pairKey, userAId, userBId]
        );

        convRow = await pool.query(
          `SELECT id FROM dm_conversations WHERE pair_key = $1 LIMIT 1`,
          [pairKey]
        );
      }

      const convId = convRow.rows[0]?.id;
      if (!convId) {
        return res.status(500).json({ message: "Conversation was not created" });
      }

      const msgId = randomUUID();

      const colsRes = await pool.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'dm_messages'`
      );
      const dmMessageCols = new Set(colsRes.rows.map((r: any) => r.column_name));

      const insertCols = ["id", "conversation_id", "sender_id", "text", "created_at"];
      const insertValues: any[] = [msgId, convId, String(sender.id), text];
      const placeholders = ["$1", "$2", "$3", "$4", "NOW()"];

      function addOptional(col: string, value: any) {
        if (dmMessageCols.has(col) && value !== undefined && value !== null) {
          insertCols.push(col);
          insertValues.push(value);
          placeholders.push(`$${insertValues.length}`);
        }
      }

      addOptional("attachment_id", attachmentId);
      addOptional("is_agreement", isAgreement);
      addOptional("agreement_id", agreementId);
      addOptional("agreement_title", agreementTitle);
      addOptional("agreement_amount", agreementAmount);
      addOptional("agreement_currency", agreementCurrency);

      await pool.query(
        `INSERT INTO dm_messages (${insertCols.join(", ")})
         VALUES (${placeholders.join(", ")})`,
        insertValues
      );

      await pool.query(
        `UPDATE dm_conversations SET updated_at = NOW() WHERE id = $1`,
        [convId]
      );

      const msgGroupKey = `msg-conv-${convId}`;
      const grouped = await groupMessageNotifications(
        String(recipient.id),
        msgGroupKey,
        `New message from ${sender.name}`,
        1
      ).catch(() => false);

      if (!grouped) {
        createNotification({
          userId: String(recipient.id),
          type: "info",
          category: "message",
          priority: "normal",
          title: `New message from ${sender.name}`,
          message: text.length > 60 ? text.slice(0, 60) + "..." : text,
          route: `/messages/${convId}`,
          groupKey: msgGroupKey,
          dedupeKey: `msg-${convId}-${Math.floor(Date.now() / 60000)}`,
          sendPush: true,
        }).catch(() => {});
      }

      res.json({
        success: true,
        conversationId: convId,
        id: msgId,
        message: {
          id: msgId,
          conversationId: convId,
          conversation_id: convId,
          senderId: String(sender.id),
          sender_id: String(sender.id),
          text,
          createdAt: new Date().toISOString(),
        },
      });
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });


  // --- Friends ---
  app.get("/api/friends", async (req, res) => {
    try {
      const userId = req.query.userId as string;
      if (!userId) return res.status(400).json({ message: "userId required" });
      const list = await storage.getFriends(userId);
      res.json(list);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/friends", async (req, res) => {
    try {
      const { userId, handle, name } = z.object({ userId: z.string(), handle: z.string(), name: z.string() }).parse(req.body);
      const friend = await storage.addFriend(userId, handle, name);
      res.status(201).json(friend);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.delete("/api/friends", async (req, res) => {
    try {
      const { userId, handle } = z.object({ userId: z.string(), handle: z.string() }).parse(req.body);
      await storage.removeFriend(userId, handle);
      res.json({ ok: true });
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  // --- Wallets ---
  app.get("/api/wallet/balances", async (req, res) => {
    try {
      const user = await resolveRequestUser(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const result = await pool.query(
        `SELECT wallets FROM app_users WHERE id = $1`,
        [user.id]
      );
      if (result.rowCount === 0) return res.status(404).json({ message: "User not found" });
      const row = result.rows[0];
      let wallets = row.wallets as Record<string, number> | null;
      if (!wallets) {
        wallets = { NOK: 0, USD: 0, EUR: 0, GBP: 0, CHF: 0, PLN: 0 };
        await pool.query(
          `UPDATE app_users SET wallets = $1 WHERE id = $2`,
          [JSON.stringify(wallets), user.id]
        );
      }
      // Ensure NOK key exists for older wallet records
      if (wallets.NOK === undefined) {
        wallets.NOK = 0;
      }
      res.json(wallets);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // PUT /api/wallet/balances — ADMIN ONLY
  // Regular users must never directly write their own balance.
  // All balance changes happen server-side via Stripe webhook, /api/transfer, /api/wallet/exchange, /api/agreements/fund.
  app.put("/api/wallet/balances", async (req, res) => {
    try {
      const user = await resolveRequestUser(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      if (!isAdminEmail(user.email)) {
        return res.status(403).json({ message: "Forbidden: balance writes are admin-only. Use /api/payments/add-funds to top up via Stripe." });
      }
      const schema = z.object({
        NOK: z.number().min(0).optional().default(0),
        USD: z.number().min(0),
        EUR: z.number().min(0),
        GBP: z.number().min(0),
        CHF: z.number().min(0),
        PLN: z.number().min(0),
      });
      const wallets = schema.parse(req.body);
      await pool.query(
        `UPDATE app_users SET wallets = $1 WHERE id = $2`,
        [JSON.stringify(wallets), user.id]
      );
      console.log(`[admin] wallet override by admin ${user.email} → user ${user.id}:`, wallets);
      res.json(wallets);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  // ── Canonical aliases ─────────────────────────────────────────────────────
  // GET /api/account/balance — alias for GET /api/wallet/balances
  app.get("/api/account/balance", async (req, res) => {
    try {
      const user = await resolveRequestUser(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const result = await pool.query(`SELECT wallets FROM app_users WHERE id = $1`, [user.id]);
      if (result.rowCount === 0) return res.status(404).json({ message: "User not found" });
      const wallets = (result.rows[0].wallets as Record<string, number>) ?? { NOK: 0, USD: 0, EUR: 0, GBP: 0, CHF: 0, PLN: 0 };
      res.json({ userId: user.id, wallets });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // POST /api/payments/add-funds — alias for POST /api/stripe/create-topup-session
  // Creates a Stripe Checkout session and returns {url} for redirect.
  // Body: { amount: number, currency: string }
  app.post("/api/payments/add-funds", async (req, res) => {
    try {
      const user = await resolveRequestUser(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const r = await fetch(`http://localhost:${process.env.PORT || 5000}/api/stripe/create-topup-session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: req.headers.cookie ?? "",
          authorization: req.headers.authorization ?? "",
        },
        body: JSON.stringify(req.body),
      });
      const data = await r.json();
      res.status(r.status).json(data);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // POST /api/transfers/send — alias for POST /api/transfer
  // Body: { recipientHandle, amount, currency, note? }
  // senderId is taken from the authenticated session (never from body).
  app.post("/api/transfers/send", async (req, res) => {
    try {
      const user = await resolveRequestUser(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const r = await fetch(`http://localhost:${process.env.PORT || 5000}/api/transfer`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: req.headers.cookie ?? "",
          authorization: req.headers.authorization ?? "",
        },
        body: JSON.stringify({ ...req.body, senderId: user.id }),
      });
      const data = await r.json();
      res.status(r.status).json(data);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/agreements/fund", async (req, res) => {
    const client = await pool.connect();
    try {
      const user = await resolveRequestUser(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const { agreementId, workerUid, amount, currency } = z.object({
        agreementId: z.string(),
        workerUid:   z.string().min(1),
        amount:      z.number().positive(),
        currency:    z.string().min(1),
      }).parse(req.body);

      if (user.id === workerUid) return res.status(400).json({ message: "Creator and worker cannot be the same" });

      await client.query("BEGIN");

      const creatorRow = await client.query(`SELECT wallets FROM app_users WHERE id = $1 FOR UPDATE`, [user.id]);
      if (creatorRow.rowCount === 0) { await client.query("ROLLBACK"); return res.status(404).json({ message: "Creator not found" }); }
      const creatorWallets: Record<string, number> = creatorRow.rows[0].wallets || {};
      const cur = currency.toUpperCase();
      const currentBal = typeof creatorWallets[cur] === "number" ? creatorWallets[cur] : 0;
      if (currentBal < amount) { await client.query("ROLLBACK"); return res.status(400).json({ message: "Insufficient balance" }); }

      const newBal = parseFloat((currentBal - amount).toFixed(2));
      const updatedWallets = { ...creatorWallets, [cur]: newBal };
      await client.query(`UPDATE app_users SET wallets = $1 WHERE id = $2`, [JSON.stringify(updatedWallets), user.id]);

      await client.query(`
        INSERT INTO agreement_holds (id, creator_uid, worker_uid, amount, currency, status, created_at)
        VALUES ($1, $2, $3, $4, $5, 'held', NOW())
        ON CONFLICT (id) DO UPDATE SET status = 'held', amount = EXCLUDED.amount, currency = EXCLUDED.currency, worker_uid = EXCLUDED.worker_uid
      `, [agreementId, user.id, workerUid, amount, cur]);

      await client.query("COMMIT");

      // Notify worker that a contract has been funded
      createNotification({
        userId: workerUid,
        type: "transfer",
        category: "contract",
        priority: "high",
        title: "Contract Funded",
        message: `A contract has been funded with ${amount} ${cur}. Funds are held until work is complete.`,
        route: "/agreements",
        relatedId: agreementId,
        relatedType: "agreement_hold",
        dedupeKey: `hold:funded:${agreementId}`,
        sendPush: true,
      }).catch(() => {});

      res.json({ success: true, newBalance: newBal, currency: cur });
    } catch (e: unknown) {
      await client.query("ROLLBACK").catch(() => {});
      res.status(400).json({ message: e instanceof Error ? e.message : "Fund failed" });
    } finally {
      client.release();
    }
  });

  app.post("/api/agreements/release", async (req, res) => {
    const client = await pool.connect();
    try {
      const user = await resolveRequestUser(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const { agreementId } = z.object({ agreementId: z.string() }).parse(req.body);

      await client.query("BEGIN");

      const holdRow = await client.query(
        `SELECT creator_uid, worker_uid, amount, currency, status
         FROM agreement_holds WHERE id = $1 FOR UPDATE`,
        [agreementId]
      );
      if (holdRow.rowCount === 0) { await client.query("ROLLBACK"); return res.status(404).json({ message: "Agreement hold not found" }); }
      const hold = holdRow.rows[0];
      if (hold.creator_uid !== user.id) { await client.query("ROLLBACK"); return res.status(403).json({ message: "Forbidden: not the creator" }); }
      if (hold.status === "released") { await client.query("ROLLBACK"); return res.status(409).json({ message: "Funds already released" }); }

      const workerRow = await client.query(`SELECT wallets FROM app_users WHERE id = $1 FOR UPDATE`, [hold.worker_uid]);
      if (workerRow.rowCount === 0) { await client.query("ROLLBACK"); return res.status(404).json({ message: "Worker not found" }); }
      const workerWallets: Record<string, number> = workerRow.rows[0].wallets || {};
      const cur: string = String(hold.currency).toUpperCase();
      const current = typeof workerWallets[cur] === "number" ? workerWallets[cur] : 0;
      const updatedWallets = { ...workerWallets, [cur]: parseFloat((current + Number(hold.amount)).toFixed(2)) };
      await client.query(`UPDATE app_users SET wallets = $1 WHERE id = $2`, [JSON.stringify(updatedWallets), hold.worker_uid]);

      const updateResult = await client.query(
        `UPDATE agreement_holds SET status = 'released', released_at = NOW() WHERE id = $1 AND status = 'held' RETURNING id`,
        [agreementId]
      );
      if (updateResult.rowCount === 0) { await client.query("ROLLBACK"); return res.status(409).json({ message: "Funds already released" }); }

      await client.query("COMMIT");

      // Notify worker that funds have been released to their account
      createNotification({
        userId: hold.worker_uid,
        type: "success",
        category: "contract",
        priority: "high",
        title: "Funds Released",
        message: `${hold.amount} ${cur} from a contract has been released to your account.`,
        route: "/agreements",
        relatedId: agreementId,
        relatedType: "agreement_hold",
        dedupeKey: `hold:released:${agreementId}`,
        sendPush: true,
      }).catch(() => {});

      res.json({ success: true, newBalance: updatedWallets[cur] });
    } catch (e: unknown) {
      await client.query("ROLLBACK").catch(() => {});
      res.status(400).json({ message: e instanceof Error ? e.message : "Release failed" });
    } finally {
      client.release();
    }
  });

  // --- Savings Goals ---
  app.get("/api/goals", async (req, res) => {
    try {
      const user = await resolveRequestUser(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const { rows } = await pool.query(`SELECT * FROM savings_goals WHERE user_id=$1 ORDER BY created_at ASC`, [user.id]);
      res.json(rows.map(r => ({ id: r.id, name: r.name, emoji: r.emoji, target: parseFloat(r.target), saved: parseFloat(r.saved), currency: r.currency, createdAt: r.created_at })));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/goals", async (req, res) => {
    try {
      const user = await resolveRequestUser(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const { name, emoji, target, currency } = z.object({ name: z.string().max(80), emoji: z.string().max(8), target: z.number().positive(), currency: z.string().max(8) }).parse(req.body);
      const id = randomUUID();
      await pool.query(`INSERT INTO savings_goals (id,user_id,name,emoji,target,currency) VALUES ($1,$2,$3,$4,$5,$6)`, [id, user.id, name, emoji, target, currency]);
      res.json({ id });
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.patch("/api/goals/:id", async (req, res) => {
    try {
      const user = await resolveRequestUser(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const { deposit } = z.object({ deposit: z.number() }).parse(req.body);
      await pool.query(`UPDATE savings_goals SET saved=LEAST(saved+$1,target) WHERE id=$2 AND user_id=$3`, [deposit, req.params.id, user.id]);
      res.json({ ok: true });
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.delete("/api/goals/:id", async (req, res) => {
    try {
      const user = await resolveRequestUser(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      await pool.query(`DELETE FROM savings_goals WHERE id=$1 AND user_id=$2`, [req.params.id, user.id]);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // --- Recurring Payments ---
  app.get("/api/recurring", async (req, res) => {
    try {
      const user = await resolveRequestUser(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const { rows } = await pool.query(`SELECT * FROM recurring_payments WHERE user_id=$1 ORDER BY created_at ASC`, [user.id]);
      res.json(rows.map(r => ({ id: r.id, title: r.title, recipient: r.recipient, amount: parseFloat(r.amount), currency: r.currency, frequency: r.frequency, nextDate: r.next_date, active: r.active })));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/recurring", async (req, res) => {
    try {
      const user = await resolveRequestUser(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const { title, recipient, amount, currency, frequency, nextDate } = z.object({ title: z.string().max(100), recipient: z.string().max(200), amount: z.number().positive().max(1_000_000), currency: z.string().max(8), frequency: z.enum(["daily","weekly","monthly","yearly"]), nextDate: z.string() }).parse(req.body);
      const id = randomUUID();
      await pool.query(`INSERT INTO recurring_payments (id,user_id,title,recipient,amount,currency,frequency,next_date) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [id, user.id, title, recipient, amount, currency, frequency, nextDate]);
      res.json({ id });
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.patch("/api/recurring/:id", async (req, res) => {
    try {
      const user = await resolveRequestUser(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const patch = z.object({ active: z.boolean().optional(), nextDate: z.string().optional() }).parse(req.body);
      if (patch.active !== undefined) await pool.query(`UPDATE recurring_payments SET active=$1 WHERE id=$2 AND user_id=$3`, [patch.active, req.params.id, user.id]);
      if (patch.nextDate) await pool.query(`UPDATE recurring_payments SET next_date=$1 WHERE id=$2 AND user_id=$3`, [patch.nextDate, req.params.id, user.id]);
      res.json({ ok: true });
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.delete("/api/recurring/:id", async (req, res) => {
    try {
      const user = await resolveRequestUser(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      await pool.query(`DELETE FROM recurring_payments WHERE id=$1 AND user_id=$2`, [req.params.id, user.id]);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // --- Cards ---
  app.post("/api/cards/request", async (req, res) => {
    try {
      const user = await resolveRequestUser(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      await createNotification(user.id, "system", "Zamówienie karty przyjęte", `Karta fizyczna zostanie wysłana na adres powiązany z kontem ${user.name} w ciągu 3–5 dni roboczych.`, {});
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/cards", async (req, res) => {
    try {
      const user = await resolveRequestUser(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const result = await pool.query(
        `SELECT id, card_number, cardholder_name, expiry, card_type, currency, status, balance
         FROM sim_cards WHERE user_id = $1 ORDER BY created_at ASC`,
        [user.id]
      );
      const cards = result.rows.map((row: any) => ({
        id: row.id,
        cardNumber: row.card_number,
        cardholderName: row.cardholder_name,
        expiry: row.expiry,
        cardType: (row.card_type as string).toLowerCase() as "visa" | "mastercard" | "amex",
        currency: row.currency,
        status: row.status as "active" | "frozen",
        balance: parseFloat(row.balance ?? "0"),
      }));
      res.json(cards);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.put("/api/cards/:id/freeze", async (req, res) => {
    try {
      const user = await resolveRequestUser(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const { id } = req.params;
      const { frozen } = z.object({ frozen: z.boolean() }).parse(req.body);
      const newStatus = frozen ? "frozen" : "active";
      const result = await pool.query(
        `UPDATE sim_cards SET status = $1 WHERE id = $2 AND user_id = $3 RETURNING id, status, RIGHT(card_number, 4) AS last4`,
        [newStatus, id, user.id]
      );
      if (result.rowCount === 0) return res.status(404).json({ message: "Card not found" });
      const last4 = result.rows[0].last4 || "****";
      await storage.createTransaction({
        userId: user.id,
        type: "payment",
        status: "completed",
        amount: 0,
        title: frozen ? "Card Frozen" : "Card Unfrozen",
        subtitle: `Card ••••${last4}`,
        category: "Security",
      });
      await storage.createNotification({
        userId: user.id,
        type: "alert",
        title: frozen ? "Card Frozen" : "Card Unfrozen",
        message: `Your card ••••${last4} has been ${frozen ? "frozen" : "unfrozen"} successfully.`,
        read: false,
      });

      // Security event for card freeze / unfreeze
      pool.query(
        `INSERT INTO security_events (id, user_id, type, description, metadata) VALUES ($1,$2,$3,$4,$5)`,
        [randomUUID(), user.id, frozen ? "card_freeze" : "card_unfreeze", frozen ? `Zablokowano kartę ••••${last4}` : `Odblokowano kartę ••••${last4}`, JSON.stringify({ cardId: id, last4 })]
      ).catch(() => {});

      res.json({ id: result.rows[0].id, status: result.rows[0].status });
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  // ── Web Push ─────────────────────────────────────────────────────────────

  // Return VAPID public key for client-side subscription
  app.get("/api/push/vapid-public-key", (_req, res) => {
    res.json({ key: VAPID_PUBLIC });
  });

  // Subscribe: save user's push subscription
  app.post("/api/push/subscribe", async (req, res) => {
    try {
      const sessionUser = await resolveRequestUser(req);
      if (!sessionUser?.id) return res.status(401).json({ message: "Unauthorized" });
      const { endpoint, keys } = z.object({
        endpoint: z.string().url(),
        keys: z.object({ p256dh: z.string(), auth: z.string() }),
      }).parse(req.body);
      await savePushSubscription(sessionUser.id, { endpoint, keys });
      res.json({ ok: true });
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  // Unsubscribe: remove a push subscription
  app.post("/api/push/unsubscribe", async (req, res) => {
    try {
      const sessionUser = await resolveRequestUser(req);
      if (!sessionUser?.id) return res.status(401).json({ message: "Unauthorized" });
      const { endpoint } = z.object({ endpoint: z.string() }).parse(req.body);
      await removePushSubscription(sessionUser.id, endpoint);
      res.json({ ok: true });
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  // ── GET /api/exchange-rates ──────────────────────────────────────────────────
  // Returns live exchange rates from ECB/Frankfurter with 1-hour cache.
  // ?base=NOK (default USD) — returns rates relative to the requested base.
  app.get("/api/exchange-rates", async (_req, res) => {
    try {
      const { data, stale } = await getExchangeRates();
      const base = (_req.query.base as string || "USD").toUpperCase() as FxCurrencyCode;
      const validBases: FxCurrencyCode[] = ["USD", "NOK", "EUR", "GBP", "CHF", "PLN"];
      if (!validBases.includes(base)) return res.status(400).json({ message: "Invalid base currency" });

      const rates = base === "USD" ? data.rates : convertRatesToBase(data.rates, base);
      res.json({
        base,
        rates,
        source: data.source,
        fetchedAt: data.fetchedAt,
        stale: stale ?? false,
      });
    } catch (e: any) {
      res.status(503).json({ message: "Exchange rates unavailable", error: e.message });
    }
  });

  // ── POST /api/wallet/exchange ────────────────────────────────────────────────
  // Performs a currency exchange between two wallets, saves Firebase transaction.
  app.post("/api/wallet/exchange", async (req, res) => {
    try {
      const user = await resolveRequestUser(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const schema = z.object({
        fromCurrency: z.enum(["NOK", "USD", "EUR", "GBP", "CHF", "PLN"]),
        toCurrency:   z.enum(["NOK", "USD", "EUR", "GBP", "CHF", "PLN"]),
        fromAmount:   z.number().positive(),
      });
      const { fromCurrency, toCurrency, fromAmount } = schema.parse(req.body);
      if (fromCurrency === toCurrency) return res.status(400).json({ message: "Same currency" });

      // Get live rates
      const { data: ratesData } = await getExchangeRates();
      const usdRates = ratesData.rates;

      // amountInUSD = fromAmount / usdRates[from]  (units of FROM per USD)
      const amountInUSD = fromAmount / usdRates[fromCurrency];
      const toAmount    = parseFloat((amountInUSD * usdRates[toCurrency]).toFixed(2));
      const rate        = parseFloat((usdRates[toCurrency] / usdRates[fromCurrency]).toFixed(6));

      // Load current wallets from DB
      const walletResult = await pool.query(
        `SELECT wallets FROM app_users WHERE id = $1`,
        [user.id]
      );
      if (walletResult.rowCount === 0) return res.status(404).json({ message: "User not found" });
      const wallets = (walletResult.rows[0].wallets || {}) as Record<string, number>;

      const fromBal = wallets[fromCurrency] ?? 0;
      if (fromBal < fromAmount) return res.status(400).json({ message: "Insufficient balance" });

      wallets[fromCurrency] = parseFloat((fromBal - fromAmount).toFixed(2));
      wallets[toCurrency]   = parseFloat(((wallets[toCurrency] ?? 0) + toAmount).toFixed(2));

      await pool.query(
        `UPDATE app_users SET wallets = $1 WHERE id = $2`,
        [JSON.stringify(wallets), user.id]
      );

      // Save exchange transaction to Firebase Realtime Database
      const txId = randomUUID();
      const txRecord = {
        type: "currency_exchange",
        fromCurrency,
        toCurrency,
        fromAmount,
        toAmount,
        rate,
        source: ratesData.source,
        status: "completed",
        createdAt: new Date().toISOString(),
      };
      try {
        const db = getAdminDb();
        if (db) {
          await db.ref(`walletTransactions/${user.id}/${txId}`).set(txRecord);
        }
      } catch (fbErr) {
        console.warn("[wallet/exchange] Firebase write failed:", (fbErr as Error).message);
      }

      res.json({ success: true, fromCurrency, toCurrency, fromAmount, toAmount, rate, txId, wallets });
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  // --- Agreements: server-side creation via Admin SDK (bypasses Firebase security rules) ---
  app.post("/api/agreements/create", async (req, res) => {
    try {
      const sessionUser = await resolveRequestUser(req);
      if (!sessionUser?.id) return res.status(401).json({ message: "Brak autoryzacji." });

      const schema = z.object({
        id:             z.string(),
        title:          z.string().min(1),
        description:    z.string(),
        category:       z.string(),
        creatorUid:     z.string(),
        creatorName:    z.string(),
        workerUid:      z.string(),
        workerName:     z.string(),
        amount:         z.number(),
        currency:       z.string(),
        deadline:       z.string(),
        terms:          z.string(),
        proofPhoto:     z.boolean(),
        proofNote:      z.boolean(),
        completionCriteria: z.string().nullable().optional(),
        acceptance:     z.object({
          creatorAccepted:   z.boolean().nullable().optional(),
          creatorAcceptedAt: z.string().nullable().optional(),
          workerAccepted:    z.boolean().nullable().optional(),
          workerAcceptedAt:  z.string().nullable().optional(),
        }).nullable().optional(),
        deposit:        z.object({
          enabled:    z.boolean(),
          amount:     z.number().nullable(),
          currency:   z.string().nullable(),
          returnRule: z.string().nullable(),
          status:     z.string().nullable(),
        }),
        status:         z.string(),
        conversationId: z.string().nullable(),
        createdAt:      z.string(),
        updatedAt:      z.string(),
      });

      const agreement = schema.parse(req.body);

      // Guard: creator must be the authenticated user
      if (agreement.creatorUid !== sessionUser.id) {
        return res.status(403).json({ message: "Brak dostępu." });
      }

      // Guard: creator and worker must be different users (anti-fraud)
      if (agreement.creatorUid === agreement.workerUid) {
        return res.status(400).json({ message: "Creator and worker cannot be the same user." });
      }

      const db = getAdminDb();
      if (!db) {
        return res.status(503).json({ message: "Firebase Admin SDK not configured — cannot save agreement." });
      }

      const now     = agreement.createdAt;
      const eventId = `ev_${Date.now()}`;
      const { id }  = agreement;

      // Single multi-location update — atomic: either all paths are written or none are.
      await db.ref("/").update({
        [`agreements/${id}`]:                                    agreement,
        [`userAgreements/${agreement.creatorUid}/${id}`]:        { createdAt: now, role: "creator" },
        [`userAgreements/${agreement.workerUid}/${id}`]:         { createdAt: now, role: "worker" },
        [`agreementEvents/${id}/${eventId}`]: {
          type:      "created",
          actorUid:  agreement.creatorUid,
          actorName: agreement.creatorName,
          timestamp: now,
        },
      });

      // Notify the worker that a contract was proposed to them
      createNotification({
        userId:    agreement.workerUid,
        type:      "info",
        category:  "contract",
        priority:  "high",
        title:     "New contract proposal",
        message:   `${agreement.creatorName} proposed a contract: "${agreement.title}"`,
        route:     "/agreements",
        relatedId: id,
        relatedType: "agreement",
        dedupeKey: `agreement-created-${id}`,
        sendPush: true,
      }).catch(() => {});

      res.status(201).json({ ok: true, id });
    } catch (e: any) {
      console.error("[agreements/create]", e.message);
      res.status(400).json({ message: e.message });
    }
  });

  // ── POST /api/sandbox-transfers ─────────────────────────────────────────────
  app.post("/api/sandbox-transfers", async (req, res) => {
    try {
      const user = await resolveRequestUser(req);
      if (!user) return res.status(401).json({ message: "Not authenticated" });

      const body = req.body;
      if (!body.recipientName || !body.recipientIdentifier || !body.destinationType ||
          !body.amount || !body.currency || !body.title || !body.maskedDestination || !body.reference) {
        return res.status(400).json({ message: "Missing required fields" });
      }
      if (typeof body.amount !== "number" || body.amount <= 0) {
        return res.status(400).json({ message: "Invalid amount" });
      }

      if (body.amount >= 100) {
        const pinRow = await pool.query(`SELECT pin_enabled FROM security_settings WHERE user_id=$1`, [user.id]);
        if (pinRow.rows[0]?.pin_enabled === true) {
          const pinToken = req.headers["x-pin-token"] as string | undefined;
          if (!pinToken || !validatePinToken(user.id, pinToken)) {
            return res.status(402).json({ requiresPin: true, message: "Wymagana weryfikacja PIN." });
          }
        }
      }

      const transfer = await storage.createSandboxTransfer({
        senderId: user.id,
        recipientName: body.recipientName,
        recipientIdentifier: body.recipientIdentifier,
        destinationType: body.destinationType,
        amount: body.amount,
        currency: body.currency,
        title: body.title,
        message: body.message || null,
        maskedDestination: body.maskedDestination,
        status: "COMPLETED_SANDBOX",
        provider: "SANDBOX",
        reference: body.reference,
      });

      // Sender notification
      storage.createNotification({
        userId: user.id,
        type: "success",
        category: "payment",
        priority: "normal",
        title: "Przelew wysłany",
        message: `${body.amount} ${body.currency} → ${body.recipientName} (${body.reference})`,
        route: "/history",
        relatedId: transfer.id,
        relatedType: "sandbox_transfer",
        dedupeKey: `sandbox-transfer-sent-${transfer.id}`,
      }).catch(() => {});

      // Try to notify recipient by handle/email/phone
      try {
        let recipientUser: any = null;
        const id = body.recipientIdentifier as string;
        if (id.startsWith("@")) recipientUser = await storage.getUserByHandle(id);
        else if (id.includes("@")) recipientUser = await storage.getUserByEmail(id);
        if (recipientUser && recipientUser.id !== user.id) {
          storage.createNotification({
            userId: recipientUser.id,
            type: "transfer",
            category: "payment",
            priority: "high",
            title: "Otrzymałeś przelew",
            message: `${user.name} wysłał(a) Ci ${body.amount} ${body.currency} (Tryb testowy)`,
            route: "/history",
            relatedId: transfer.id,
            relatedType: "sandbox_transfer",
            dedupeKey: `sandbox-transfer-received-${transfer.id}`,
          }).catch(() => {});
        }
      } catch {}

      res.status(201).json(transfer);
    } catch (e: any) {
      console.error("[sandbox-transfers/create]", e.message);
      res.status(500).json({ message: e.message });
    }
  });

  // ── GET /api/sandbox-transfers ──────────────────────────────────────────────
  app.get("/api/sandbox-transfers", async (req, res) => {
    try {
      const user = await resolveRequestUser(req);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      const transfers = await storage.getSandboxTransfers(user.id);
      res.json(transfers);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ── POST /api/contract-invites ──────────────────────────────────────────────
  app.post("/api/contract-invites", async (req, res) => {
    try {
      const user = await resolveRequestUser(req);
      if (!user) return res.status(401).json({ message: "Not authenticated" });

      const body = req.body;
      if (!body.recipientIdentifier || !body.title || !body.contractType ||
          !body.amount || !body.currency || !body.deadline || !body.description) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      const invite = await storage.createContractInvite({
        senderId: user.id,
        recipientIdentifier: body.recipientIdentifier,
        title: body.title,
        contractType: body.contractType,
        amount: body.amount,
        currency: body.currency,
        deadline: body.deadline,
        description: body.description,
        status: "SENT",
      });

      // Notify recipient if they exist
      try {
        let recipientUser: any = null;
        const id = body.recipientIdentifier as string;
        if (id.startsWith("@")) recipientUser = await storage.getUserByHandle(id);
        else if (id.includes("@")) recipientUser = await storage.getUserByEmail(id);
        if (recipientUser && recipientUser.id !== user.id) {
          storage.createNotification({
            userId: recipientUser.id,
            type: "info",
            category: "contract",
            priority: "high",
            title: "Zaproszenie do umowy",
            message: `${user.name} zaprasza Cię do umowy: „${body.title}"`,
            route: "/agreements",
            relatedId: invite.id,
            relatedType: "contract_invite",
            dedupeKey: `contract-invite-${invite.id}`,
          }).catch(() => {});
        }
      } catch {}

      res.status(201).json(invite);
    } catch (e: any) {
      console.error("[contract-invites/create]", e.message);
      res.status(500).json({ message: e.message });
    }
  });

  return httpServer;
}
