import type { Express, Request, Response } from "express";
import type { Pool } from "pg";
import type { Server as HttpServer } from "http";
import { randomUUID, createHash } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import { resolveRequestUser } from "../adminHelper";
import jwt from "jsonwebtoken";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";

// ─── Types ───────────────────────────────────────────────────────────────────

type UserRow = {
  id: string;
  display_name: string;
  handle: string | null;
  email: string | null;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function parseCookies(cookieHeader: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const part of cookieHeader.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k) result[k.trim()] = decodeURIComponent(v.join("=").trim());
  }
  return result;
}

async function getAuthUserId(req: Request): Promise<string | null> {
  const user = await resolveRequestUser(req);
  return user?.id ?? null;
}

function q(col: string) { return `"${col}"`; }

// ─── Schema ──────────────────────────────────────────────────────────────────

export async function ensureMessagesSchema(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dm_conversations (
      id TEXT PRIMARY KEY,
      pair_key TEXT UNIQUE NOT NULL,
      user_a_id TEXT NOT NULL,
      user_b_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_dm_conversations_user_a_id ON dm_conversations(user_a_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_dm_conversations_user_b_id ON dm_conversations(user_b_id)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS dm_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES dm_conversations(id) ON DELETE CASCADE,
      sender_id TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_dm_messages_conversation_id ON dm_messages(conversation_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_dm_messages_created_at ON dm_messages(created_at DESC)`);

  // Read-receipt tracking: per user, per conversation
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dm_reads (
      user_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL REFERENCES dm_conversations(id) ON DELETE CASCADE,
      last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, conversation_id)
    )
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_dm_reads_conv ON dm_reads(conversation_id)`);

  // Anti-abuse: block list (uuid FK-compatible with app_users.id; id stays varchar per convention)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dm_blocks (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
      blocker_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      blocked_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(blocker_id, blocked_id)
    )
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_dm_blocks_blocker ON dm_blocks(blocker_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_dm_blocks_blocked ON dm_blocks(blocked_id)`);

  // Add FK constraints to dm_blocks referencing app_users (idempotent)
  await pool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dm_blocks_blocker_fk') THEN
        ALTER TABLE dm_blocks ADD CONSTRAINT dm_blocks_blocker_fk
          FOREIGN KEY (blocker_id) REFERENCES app_users(id) ON DELETE CASCADE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dm_blocks_blocked_fk') THEN
        ALTER TABLE dm_blocks ADD CONSTRAINT dm_blocks_blocked_fk
          FOREIGN KEY (blocked_id) REFERENCES app_users(id) ON DELETE CASCADE;
      END IF;
    END $$
  `).catch(() => {}); // Graceful fail if app_users not yet ready

  // Anti-abuse: reports (uuid FK-compatible with app_users.id; id stays varchar per convention)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dm_reports (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
      reporter_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      reported_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      reason TEXT NOT NULL,
      details TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_dm_reports_reporter ON dm_reports(reporter_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_dm_reports_reported ON dm_reports(reported_id)`);

  // Add FK constraints to dm_reports referencing app_users (idempotent)
  await pool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dm_reports_reporter_fk') THEN
        ALTER TABLE dm_reports ADD CONSTRAINT dm_reports_reporter_fk
          FOREIGN KEY (reporter_id) REFERENCES app_users(id) ON DELETE CASCADE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dm_reports_reported_fk') THEN
        ALTER TABLE dm_reports ADD CONSTRAINT dm_reports_reported_fk
          FOREIGN KEY (reported_id) REFERENCES app_users(id) ON DELETE CASCADE;
      END IF;
    END $$
  `).catch(() => {}); // Graceful fail if app_users not yet ready

  // attachment_id column on dm_messages (optional reference to dm_attachments)
  await pool.query(`ALTER TABLE dm_messages ADD COLUMN IF NOT EXISTS attachment_id TEXT`).catch(() => {});

  // dm_attachments: stores uploaded file metadata
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dm_attachments (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      message_id TEXT REFERENCES dm_messages(id) ON DELETE SET NULL,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      storage_key TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_dm_attachments_message ON dm_attachments(message_id)`);
  // Idempotent: add uploader_id if not present
  await pool.query(`ALTER TABLE dm_attachments ADD COLUMN IF NOT EXISTS uploader_id TEXT`).catch(() => {});

  // dm_message_status: per-message delivery/read tracking
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dm_message_status (
      message_id TEXT NOT NULL REFERENCES dm_messages(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('delivered', 'read')),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (message_id, user_id)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_dm_msg_status_message ON dm_message_status(message_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_dm_msg_status_user ON dm_message_status(user_id)`);

  // last_seen_at on app_users (idempotent)
  await pool.query(`ALTER TABLE app_users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ`).catch(() => {});
}

// ─── Rate limiter (in-memory, per user) ──────────────────────────────────────
// max 30 messages per 60 seconds per user_id

const rateLimitWindows = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(userId: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const WINDOW_MS = 60_000;
  const MAX_PER_WINDOW = 30;

  const entry = rateLimitWindows.get(userId);
  if (!entry || now > entry.resetAt) {
    rateLimitWindows.set(userId, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true };
  }
  if (entry.count >= MAX_PER_WINDOW) {
    return { allowed: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }
  entry.count += 1;
  return { allowed: true };
}

// ─── Block helpers ────────────────────────────────────────────────────────────

async function isUserBlocked(pool: Pool, senderId: string, recipientId: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1 FROM dm_blocks WHERE blocker_id::text = $1 AND blocked_id::text = $2 LIMIT 1`,
    [recipientId, senderId]
  );
  return Boolean(result.rows[0]);
}

// ─── App users helpers ────────────────────────────────────────────────────────

async function getAppUsersColumns(pool: Pool): Promise<string[]> {
  const result = await pool.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'app_users'
  `);
  return result.rows.map((r: any) => String(r.column_name));
}

function pickFirstExisting(columns: string[], preferred: string[]) {
  return preferred.find((c) => columns.includes(c)) || null;
}

async function searchUsers(pool: Pool, query: string, currentUserId: string | null): Promise<UserRow[]> {
  const cols = await getAppUsersColumns(pool);
  if (!cols.includes("id")) throw new Error("Tabela app_users nie ma kolumny id.");

  const displayCol = pickFirstExisting(cols, ["full_name", "display_name", "name", "username", "email"]) || "id";
  const handleCol  = pickFirstExisting(cols, ["handle", "host", "username", "email"]);
  const emailCol   = pickFirstExisting(cols, ["email"]);
  const searchCols = ["full_name", "display_name", "name", "username", "email", "handle", "host"].filter(c => cols.includes(c));

  if (searchCols.length === 0) {
    const result = await pool.query(
      `SELECT ${q("id")}::text AS id, ${q(displayCol)}::text AS display_name,
              ${handleCol ? `${q(handleCol)}::text` : "NULL"} AS handle,
              ${emailCol  ? `${q(emailCol)}::text`  : "NULL"} AS email
       FROM app_users ${currentUserId ? `WHERE ${q("id")}::text <> $1` : ""} ORDER BY ${q(displayCol)} ASC LIMIT 20`,
      currentUserId ? [currentUserId] : []
    );
    return result.rows;
  }

  const conditions = searchCols.map((col, idx) => `${q(col)}::text ILIKE $${currentUserId ? idx + 2 : idx + 1}`);
  const params: any[] = currentUserId ? [currentUserId] : [];
  for (let i = 0; i < searchCols.length; i++) params.push(`%${query}%`);

  const result = await pool.query(
    `SELECT ${q("id")}::text AS id, ${q(displayCol)}::text AS display_name,
            ${handleCol ? `${q(handleCol)}::text` : "NULL"} AS handle,
            ${emailCol  ? `${q(emailCol)}::text`  : "NULL"} AS email
     FROM app_users
     WHERE ${currentUserId ? `${q("id")}::text <> $1 AND` : ""} (${conditions.join(" OR ")})
     ORDER BY ${q(displayCol)} ASC LIMIT 20`,
    params
  );
  return result.rows;
}

async function resolveTargetUser(pool: Pool, body: any, currentUserId: string | null): Promise<UserRow | null> {
  const cols = await getAppUsersColumns(pool);
  const displayCol = pickFirstExisting(cols, ["full_name", "display_name", "name", "username", "email"]) || "id";
  const handleCol  = pickFirstExisting(cols, ["handle", "host", "username", "email"]);
  const emailCol   = pickFirstExisting(cols, ["email"]);

  if (body?.targetUserId) {
    const result = await pool.query(
      `SELECT ${q("id")}::text AS id, ${q(displayCol)}::text AS display_name,
              ${handleCol ? `${q(handleCol)}::text` : "NULL"} AS handle,
              ${emailCol  ? `${q(emailCol)}::text`  : "NULL"} AS email
       FROM app_users WHERE ${q("id")}::text = $1 LIMIT 1`,
      [String(body.targetUserId)]
    );
    const row = result.rows[0] || null;
    if (row && row.id !== currentUserId) return row;
  }

  const query = String(body?.email || body?.handle || body?.query || "").trim();
  if (!query) return null;
  const hits = await searchUsers(pool, query, currentUserId);
  return hits[0] || null;
}

function buildPairKey(a: string, b: string) { return [String(a), String(b)].sort().join(":"); }

async function getOrCreateConversation(pool: Pool, me: string, target: string) {
  const pairKey = buildPairKey(me, target);
  const found = await pool.query(`SELECT id, user_a_id, user_b_id, created_at, updated_at FROM dm_conversations WHERE pair_key = $1 LIMIT 1`, [pairKey]);
  if (found.rows[0]) return found.rows[0];

  const id = randomUUID();
  const [userA, userB] = [String(me), String(target)].sort();
  const inserted = await pool.query(
    `INSERT INTO dm_conversations (id, pair_key, user_a_id, user_b_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, NOW(), NOW())
     RETURNING id, user_a_id, user_b_id, created_at, updated_at`,
    [id, pairKey, userA, userB]
  );
  return inserted.rows[0];
}

async function userIsConversationMember(pool: Pool, conversationId: string, userId: string) {
  const result = await pool.query(
    `SELECT 1 FROM dm_conversations WHERE id = $1 AND ($2 = user_a_id OR $2 = user_b_id) LIMIT 1`,
    [conversationId, userId]
  );
  return Boolean(result.rows[0]);
}

async function markConversationRead(pool: Pool, conversationId: string, userId: string) {
  await pool.query(
    `INSERT INTO dm_reads (user_id, conversation_id, last_read_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (user_id, conversation_id) DO UPDATE SET last_read_at = NOW()`,
    [userId, conversationId]
  );
}

// ─── WebSocket client registry ────────────────────────────────────────────────

const clients = new Map<string, Set<WebSocket>>();

function registerClient(userId: string, ws: WebSocket) {
  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId)!.add(ws);
}

function unregisterClient(userId: string, ws: WebSocket) {
  const set = clients.get(userId);
  if (set) { set.delete(ws); if (set.size === 0) clients.delete(userId); }
}

function isOnline(userId: string): boolean { return (clients.get(userId)?.size ?? 0) > 0; }

function sendToUser(userId: string, payload: object) {
  const set = clients.get(userId);
  if (!set) return;
  const data = JSON.stringify(payload);
  for (const ws of Array.from(set)) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  }
}

async function broadcastToConversation(pool: Pool, conversationId: string, payload: object, exclude?: string) {
  const conv = await pool.query(`SELECT user_a_id, user_b_id FROM dm_conversations WHERE id = $1 LIMIT 1`, [conversationId]);
  if (!conv.rows[0]) return;
  const { user_a_id, user_b_id } = conv.rows[0];
  for (const uid of [user_a_id, user_b_id]) {
    if (uid !== exclude) sendToUser(uid, payload);
  }
}

async function getUserIdFromSessionCookie(pool: Pool, rawToken: string): Promise<string | null> {
  if (!rawToken) return null;
  try {
    const result = await pool.query(
      `SELECT u.id FROM app_sessions s JOIN app_users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > NOW() AND u.is_active = TRUE LIMIT 1`,
      [sha256(rawToken)]
    );
    return result.rows[0]?.id ?? null;
  } catch { return null; }
}

// ─── Typing timers (in-memory) ────────────────────────────────────────────────
// key = `${userId}:${conversationId}`, value = auto-reset timer
const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();

// ─── File upload (multer) ────────────────────────────────────────────────────
const UPLOAD_DIR = path.resolve("uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB (increased for audio)
  fileFilter: (_req, file, cb) => {
    const ok = file.mimetype.startsWith("image/")
      || file.mimetype.startsWith("audio/")
      || file.mimetype === "application/pdf"
      || file.mimetype.startsWith("text/");
    ok ? cb(null, true) : cb(new Error("Nieobsługiwany typ pliku. Dozwolone: obrazy, audio, PDF, tekstowe."));
  },
});

// ─── Update last_seen_at helper ───────────────────────────────────────────────
async function touchLastSeen(pool: Pool, userId: string) {
  await pool.query(`UPDATE app_users SET last_seen_at = NOW() WHERE id = $1`, [userId]).catch(() => {});
}

// ─── Main installer ───────────────────────────────────────────────────────────

export function installMessagesFix(app: Express, pool: Pool, httpServer?: HttpServer) {

  // ── WebSocket server ──────────────────────────────────────────────────────
  if (httpServer) {
    const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

    wss.on("error", (err) => {
      console.error("[ws] WebSocketServer error:", err);
    });

    wss.on("connection", async (ws, req) => {
      const cookieHeader = req.headers.cookie || "";
      const cookies = parseCookies(cookieHeader);
      const rawToken = cookies["app_session"] || "";
      let userId = await getUserIdFromSessionCookie(pool, rawToken);

      // Fallback: JWT Bearer token passed as ?token= query param
      // (used by JWT-only auth flows that don't create app_session cookies)
      if (!userId) {
        try {
          const reqUrl = new URL(req.url || "/", "http://localhost");
          const jwtToken = reqUrl.searchParams.get("token") || "";
          if (jwtToken) {
            const secret = process.env.JWT_SECRET;
            if (secret) {
              const decoded = jwt.verify(jwtToken, secret) as Record<string, any>;
              const rawId = decoded.sub || decoded.userId || decoded.id;
              if (rawId) {
                const row = await pool.query(
                  `SELECT id::text AS id FROM app_users WHERE id::text = $1 AND is_active = TRUE LIMIT 1`,
                  [String(rawId)]
                );
                userId = row.rows[0]?.id ?? null;
              }
            }
          }
        } catch { /* invalid JWT — ignore */ }
      }

      if (!userId) {
        ws.close(4001, "Unauthorized");
        return;
      }

      registerClient(userId, ws);
      touchLastSeen(pool, userId);

      // Tell the user their own online status + notify others
      ws.send(JSON.stringify({ type: "auth_ok", userId }));

      // Notify conversation partners that this user is online
      try {
        const convs = await pool.query(
          `SELECT id, user_a_id, user_b_id FROM dm_conversations WHERE user_a_id = $1 OR user_b_id = $1`,
          [userId]
        );
        for (const conv of convs.rows) {
          const partnerId = conv.user_a_id === userId ? conv.user_b_id : conv.user_a_id;
          sendToUser(partnerId, { type: "online", userId, online: true });
        }
      } catch {}

      // ── Handle incoming WS messages ───────────────────────────────────────
      ws.on("message", async (raw) => {
        touchLastSeen(pool, userId);
        try {
          const data = JSON.parse(String(raw));

          // ── Typing indicator ─────────────────────────────────────────────
          if (data.type === "typing_start" && data.conversationId) {
            const convId = String(data.conversationId);
            const member = await userIsConversationMember(pool, convId, userId);
            if (!member) return;

            const conv = await pool.query(
              `SELECT user_a_id, user_b_id FROM dm_conversations WHERE id = $1 LIMIT 1`,
              [convId]
            );
            if (!conv.rows[0]) return;
            const { user_a_id, user_b_id } = conv.rows[0];
            const partnerId = user_a_id === userId ? user_b_id : user_a_id;

            // Send typing=true to partner
            sendToUser(partnerId, { type: "typing", userId, conversationId: convId, isTyping: true });

            // Auto-reset after 3 s
            const key = `${userId}:${convId}`;
            const existing = typingTimers.get(key);
            if (existing) clearTimeout(existing);
            const timer = setTimeout(() => {
              sendToUser(partnerId, { type: "typing", userId, conversationId: convId, isTyping: false });
              typingTimers.delete(key);
            }, 3000);
            typingTimers.set(key, timer);
          }
        } catch {}
      });

      ws.on("close", async () => {
        unregisterClient(userId, ws);
        // Notify partners of offline
        try {
          if (!isOnline(userId)) {
            const convs = await pool.query(
              `SELECT id, user_a_id, user_b_id FROM dm_conversations WHERE user_a_id = $1 OR user_b_id = $1`,
              [userId]
            );
            for (const conv of convs.rows) {
              const partnerId = conv.user_a_id === userId ? conv.user_b_id : conv.user_a_id;
              sendToUser(partnerId, { type: "online", userId, online: false });
            }
          }
        } catch {}
      });

      ws.on("error", () => { unregisterClient(userId, ws); });
    });
  }

  // ── HTTP routes ───────────────────────────────────────────────────────────

  app.get("/api/messages/health", async (_req: Request, res: Response) => {
    try {
      await ensureMessagesSchema(pool);
      return res.json({ ok: true, status: "messages-ready" });
    } catch (error: any) {
      return res.status(500).json({ ok: false, error: error?.message || "messages health failed" });
    }
  });

  app.get("/api/messages/search", async (req: Request, res: Response) => {
    try {
      await ensureMessagesSchema(pool);
      const qValue = String(req.query.q || req.query.query || "").trim();
      const currentUserId = await getAuthUserId(req);

      if (!qValue) return res.json({ ok: true, query: "", users: [], results: [] });

      const users = await searchUsers(pool, qValue, currentUserId);
      return res.json({ ok: true, query: qValue, users, results: users });
    } catch (error: any) {
      return res.status(500).json({ ok: false, error: error?.message || "search failed", users: [], results: [] });
    }
  });

  // ── Online status endpoint ───────────────────────────────────────────────

  app.get("/api/messages/online/:userId", async (req: Request, res: Response) => {
    const userId = String(req.params.userId);
    return res.json({ ok: true, userId, online: isOnline(userId) });
  });

  // ── Mark read endpoint ───────────────────────────────────────────────────

  app.post("/api/messages/:conversationId/read", async (req: Request, res: Response) => {
    try {
      const currentUserId = await getAuthUserId(req);
      if (!currentUserId) return res.status(401).json({ ok: false, error: "Brak autoryzacji." });

      const conversationId = String(req.params.conversationId);
      const member = await userIsConversationMember(pool, conversationId, currentUserId);
      if (!member) return res.status(403).json({ ok: false, error: "Brak dostępu." });

      await markConversationRead(pool, conversationId, currentUserId);
      touchLastSeen(pool, currentUserId);

      // Mark all partner messages in this conversation as 'read' in dm_message_status
      const conv = await pool.query(`SELECT user_a_id, user_b_id FROM dm_conversations WHERE id = $1 LIMIT 1`, [conversationId]);
      if (conv.rows[0]) {
        const { user_a_id, user_b_id } = conv.rows[0];
        const partnerId = user_a_id === currentUserId ? user_b_id : user_a_id;

        // Upsert read status for all partner messages
        await pool.query(
          `INSERT INTO dm_message_status (message_id, user_id, status, updated_at)
           SELECT m.id, $1, 'read', NOW()
           FROM dm_messages m
           WHERE m.conversation_id = $2 AND m.sender_id = $3
           ON CONFLICT (message_id, user_id) DO UPDATE SET status = 'read', updated_at = NOW()`,
          [currentUserId, conversationId, partnerId]
        ).catch(() => {});

        sendToUser(partnerId, { type: "read", conversationId, userId: currentUserId });
      }

      return res.json({ ok: true });
    } catch (error: any) {
      return res.status(500).json({ ok: false, error: error?.message || "mark read failed" });
    }
  });

  // ── Open / create conversation ────────────────────────────────────────────

  const openOrCreateHandler = async (req: Request, res: Response) => {
    try {
      await ensureMessagesSchema(pool);
      const currentUserId = await getAuthUserId(req);
      if (!currentUserId) return res.status(401).json({ ok: false, error: "Brak autoryzacji użytkownika." });

      touchLastSeen(pool, String(currentUserId));
      const target = await resolveTargetUser(pool, req.body || {}, currentUserId);
      if (!target) return res.status(404).json({ ok: false, error: "Nie znaleziono użytkownika docelowego." });
      if (String(target.id) === String(currentUserId)) return res.status(400).json({ ok: false, error: "Nie możesz rozpocząć rozmowy z samym sobą." });

      const conversation = await getOrCreateConversation(pool, String(currentUserId), String(target.id));

      const initialText = String(req.body?.text || "").trim();
      if (initialText) {
        const msgId = randomUUID();
        await pool.query(
          `INSERT INTO dm_messages (id, conversation_id, sender_id, text, created_at) VALUES ($1, $2, $3, $4, NOW())`,
          [msgId, conversation.id, String(currentUserId), initialText]
        );
        await pool.query(`UPDATE dm_conversations SET updated_at = NOW() WHERE id = $1`, [conversation.id]);

        const msgData = { id: msgId, conversationId: conversation.id, senderId: currentUserId, text: initialText, createdAt: new Date().toISOString(), isOwn: false };
        sendToUser(String(target.id), { type: "message", conversationId: conversation.id, message: msgData });
      }

      return res.json({ ok: true, id: conversation.id, conversationId: conversation.id, conversation, target });
    } catch (error: any) {
      return res.status(500).json({ ok: false, error: error?.message || "open/create conversation failed" });
    }
  };

  app.post("/api/messages/open-or-create", openOrCreateHandler);
  app.post("/api/messages/start", openOrCreateHandler);
  app.post("/api/messages/create", openOrCreateHandler);

  // ── Conversations list ────────────────────────────────────────────────────

  app.get("/api/messages/conversations", async (req: Request, res: Response) => {
    try {
      await ensureMessagesSchema(pool);
      const currentUserId = await getAuthUserId(req);
      if (!currentUserId) return res.status(401).json({ ok: false, error: "Brak autoryzacji użytkownika.", conversations: [], items: [] });

      touchLastSeen(pool, currentUserId);
      const cols = await getAppUsersColumns(pool);
      const displayCol = pickFirstExisting(cols, ["full_name", "display_name", "name", "username", "email"]) || "id";
      const handleCol  = pickFirstExisting(cols, ["handle", "host", "username", "email"]);

      const sql = `
        SELECT
          c.id,
          CASE WHEN c.user_a_id = $1 THEN c.user_b_id ELSE c.user_a_id END AS target_user_id,
          (SELECT ${q(displayCol)}::text FROM app_users u
           WHERE u.id::text = CASE WHEN c.user_a_id = $1 THEN c.user_b_id ELSE c.user_a_id END LIMIT 1) AS target_display_name,
          (SELECT ${handleCol ? `${q(handleCol)}::text` : "NULL"} FROM app_users u
           WHERE u.id::text = CASE WHEN c.user_a_id = $1 THEN c.user_b_id ELSE c.user_a_id END LIMIT 1) AS target_handle,
          (SELECT u.last_seen_at FROM app_users u
           WHERE u.id::text = CASE WHEN c.user_a_id = $1 THEN c.user_b_id ELSE c.user_a_id END LIMIT 1) AS target_last_seen_at,
          (SELECT COALESCE(NULLIF(m.text, ''),
             CASE WHEN m.attachment_id IS NOT NULL THEN
               CASE WHEN (SELECT mime_type FROM dm_attachments a WHERE a.id = m.attachment_id LIMIT 1) LIKE 'audio/%'
                    THEN '🎤 Wiadomość głosowa'
                    ELSE '📎 Załącznik'
               END
             ELSE '' END)
           FROM dm_messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message,
          (SELECT m.created_at FROM dm_messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message_at,
          (SELECT COUNT(*)::int FROM dm_messages m
           WHERE m.conversation_id = c.id
             AND m.sender_id <> $1
             AND m.created_at > COALESCE((SELECT dr.last_read_at FROM dm_reads dr WHERE dr.user_id = $1 AND dr.conversation_id = c.id LIMIT 1), '1970-01-01'::timestamptz)
          ) AS unread_count,
          c.created_at,
          c.updated_at
        FROM dm_conversations c
        WHERE c.user_a_id = $1 OR c.user_b_id = $1
        ORDER BY COALESCE(
          (SELECT m.created_at FROM dm_messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1),
          c.updated_at, c.created_at
        ) DESC
      `;

      const result = await pool.query(sql, [String(currentUserId)]);

      // Enrich with online status
      const rows = result.rows.map((r: any) => ({
        ...r,
        is_online: isOnline(String(r.target_user_id)),
      }));

      return res.json({ ok: true, conversations: rows, items: rows });
    } catch (error: any) {
      return res.status(500).json({ ok: false, error: error?.message || "conversations load failed", conversations: [], items: [] });
    }
  });

  // ── Load messages ─────────────────────────────────────────────────────────

  const loadConversationMessages = async (req: Request, res: Response) => {
    try {
      await ensureMessagesSchema(pool);
      const currentUserId = await getAuthUserId(req);
      if (!currentUserId) return res.status(401).json({ ok: false, error: "Brak autoryzacji użytkownika.", messages: [], items: [] });

      touchLastSeen(pool, String(currentUserId));
      const conversationId = String(req.params.conversationId);
      const member = await userIsConversationMember(pool, conversationId, String(currentUserId));
      if (!member) return res.status(403).json({ ok: false, error: "Brak dostępu do tej rozmowy.", messages: [], items: [] });

      const result = await pool.query(
        `SELECT
           m.id,
           m.conversation_id AS "conversationId",
           m.sender_id AS "senderId",
           m.text,
           m.created_at AS "createdAt",
           m.attachment_id AS "attachmentId",
           (m.sender_id = $2) AS "isOwn",
           COALESCE(
             (SELECT ms.status FROM dm_message_status ms
              WHERE ms.message_id = m.id
                AND ms.user_id != m.sender_id
              ORDER BY CASE ms.status WHEN 'read' THEN 1 WHEN 'delivered' THEN 2 ELSE 3 END
              LIMIT 1),
             'sent'
           ) AS status,
           (SELECT json_build_object(
              'id', a.id,
              'fileName', a.file_name,
              'mimeType', a.mime_type,
              'sizeBytes', a.size_bytes
            ) FROM dm_attachments a WHERE a.id = m.attachment_id LIMIT 1
           ) AS attachment
         FROM dm_messages m
         WHERE m.conversation_id = $1
         ORDER BY m.created_at ASC`,
        [conversationId, String(currentUserId)]
      );

      return res.json({ ok: true, conversationId, currentUserId: String(currentUserId), messages: result.rows, items: result.rows });
    } catch (error: any) {
      return res.status(500).json({ ok: false, error: error?.message || "messages load failed", messages: [], items: [] });
    }
  };

  // ── Upload attachment ──────────────────────────────────────────────────────
  // Must be before generic /api/messages/:conversationId route

  app.post("/api/messages/upload",
    (req: Request, res: Response, next: (err?: any) => void) => {
      upload.single("file")(req, res, (err) => {
        if (err) {
          // Multer errors (file too large, wrong type, etc.)
          const msg = err?.code === "LIMIT_FILE_SIZE"
            ? "Plik jest za duży. Maksymalny rozmiar to 25MB."
            : err?.message || "Błąd przesyłania pliku.";
          return res.status(400).json({ ok: false, error: msg });
        }
        next();
      });
    },
    async (req: Request, res: Response) => {
    try {
      await ensureMessagesSchema(pool);
      const currentUserId = await getAuthUserId(req);
      if (!currentUserId) return res.status(401).json({ ok: false, error: "Brak autoryzacji." });

      if (!req.file) return res.status(400).json({ ok: false, error: "Brak pliku." });

      touchLastSeen(pool, currentUserId);
      const id = randomUUID();
      await pool.query(
        `INSERT INTO dm_attachments (id, message_id, uploader_id, file_name, mime_type, size_bytes, storage_key, created_at)
         VALUES ($1, NULL, $2, $3, $4, $5, $6, NOW())`,
        [id, currentUserId, req.file.originalname, req.file.mimetype, req.file.size, req.file.path]
      );

      return res.json({
        ok: true,
        attachmentId: id,
        fileName: req.file.originalname,
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size,
      });
    } catch (error: any) {
      return res.status(500).json({ ok: false, error: error?.message || "Upload failed." });
    }
  });

  // ── Download / view attachment ────────────────────────────────────────────
  // Must be before generic /api/messages/:conversationId route

  app.get("/api/messages/attachment/:id", async (req: Request, res: Response) => {
    try {
      await ensureMessagesSchema(pool);
      const currentUserId = await getAuthUserId(req);
      if (!currentUserId) return res.status(401).json({ ok: false, error: "Brak autoryzacji." });

      touchLastSeen(pool, currentUserId);
      const att = await pool.query(
        `SELECT id, message_id, uploader_id, file_name, mime_type, storage_key FROM dm_attachments WHERE id = $1 LIMIT 1`,
        [req.params.id]
      );
      if (!att.rows[0]) return res.status(404).json({ ok: false, error: "Nie znaleziono załącznika." });
      const { message_id, uploader_id, file_name, mime_type, storage_key } = att.rows[0];

      // Auth: if attachment is not yet bound to a message, only the uploader may access it
      if (!message_id) {
        if (String(uploader_id || "") !== String(currentUserId)) {
          return res.status(403).json({ ok: false, error: "Brak dostępu." });
        }
      } else {
        // Attachment is bound — user must be a member of the owning conversation
        const msg = await pool.query(`SELECT conversation_id FROM dm_messages WHERE id = $1 LIMIT 1`, [message_id]);
        if (!msg.rows[0]) return res.status(404).json({ ok: false, error: "Wiadomość nie istnieje." });
        const member = await userIsConversationMember(pool, msg.rows[0].conversation_id, currentUserId);
        if (!member) return res.status(403).json({ ok: false, error: "Brak dostępu." });
      }

      const absPath = path.isAbsolute(storage_key) ? storage_key : path.resolve(storage_key);
      if (!fs.existsSync(absPath)) return res.status(404).json({ ok: false, error: "Plik nie istnieje." });

      res.setHeader("Content-Type", mime_type);
      res.setHeader("Content-Disposition", `inline; filename="${file_name}"`);
      return res.sendFile(absPath);
    } catch (error: any) {
      return res.status(500).json({ ok: false, error: error?.message || "Download failed." });
    }
  });

  // ── Search messages within a conversation ─────────────────────────────────
  // Must be BEFORE the generic /api/messages/:conversationId route
  // GET /api/messages/:conversationId/search?q=<query>&limit=<n>&offset=<n>

  app.get("/api/messages/:conversationId/search", async (req: Request, res: Response) => {
    try {
      await ensureMessagesSchema(pool);
      const currentUserId = await getAuthUserId(req);
      if (!currentUserId) return res.status(401).json({ ok: false, error: "Brak autoryzacji.", messages: [] });

      touchLastSeen(pool, String(currentUserId));
      const conversationId = String(req.params.conversationId);
      const member = await userIsConversationMember(pool, conversationId, String(currentUserId));
      if (!member) return res.status(403).json({ ok: false, error: "Brak dostępu.", messages: [] });

      const q = String(req.query.q || req.query.query || "").trim();
      if (!q) return res.json({ ok: true, conversationId, query: "", messages: [], total: 0 });

      const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || "100"), 10) || 100));
      const offset = Math.max(0, parseInt(String(req.query.offset || "0"), 10) || 0);

      const result = await pool.query(
        `SELECT
           m.id,
           m.conversation_id AS "conversationId",
           m.sender_id AS "senderId",
           m.text,
           m.created_at AS "createdAt",
           m.attachment_id AS "attachmentId",
           (m.sender_id = $2) AS "isOwn",
           COALESCE(
             (SELECT ms.status FROM dm_message_status ms
              WHERE ms.message_id = m.id AND ms.user_id != m.sender_id
              ORDER BY CASE ms.status WHEN 'read' THEN 1 WHEN 'delivered' THEN 2 ELSE 3 END
              LIMIT 1),
             'sent'
           ) AS status,
           (SELECT json_build_object(
              'id', a.id,
              'fileName', a.file_name,
              'mimeType', a.mime_type,
              'sizeBytes', a.size_bytes
            ) FROM dm_attachments a WHERE a.id = m.attachment_id LIMIT 1
           ) AS attachment
         FROM dm_messages m
         WHERE m.conversation_id = $1
           AND (m.text ILIKE $3
             OR EXISTS (SELECT 1 FROM dm_attachments a WHERE a.id = m.attachment_id AND a.file_name ILIKE $3))
         ORDER BY m.created_at ASC
         LIMIT $4 OFFSET $5`,
        [conversationId, String(currentUserId), `%${q}%`, limit, offset]
      );

      const countResult = await pool.query(
        `SELECT COUNT(*)::int AS total FROM dm_messages m
         WHERE m.conversation_id = $1
           AND (m.text ILIKE $2
             OR EXISTS (SELECT 1 FROM dm_attachments a WHERE a.id = m.attachment_id AND a.file_name ILIKE $2))`,
        [conversationId, `%${q}%`]
      );

      return res.json({
        ok: true,
        conversationId,
        currentUserId: String(currentUserId),
        query: q,
        messages: result.rows,
        items: result.rows,
        total: countResult.rows[0]?.total ?? 0,
      });
    } catch (error: any) {
      return res.status(500).json({ ok: false, error: error?.message || "search failed", messages: [] });
    }
  });

  app.get("/api/messages/:conversationId", loadConversationMessages);
  app.get("/api/messages/conversations/:conversationId/messages", loadConversationMessages);

  // ── Send message ──────────────────────────────────────────────────────────

  const sendHandler = async (req: Request, res: Response) => {
    try {
      await ensureMessagesSchema(pool);
      const currentUserId = await getAuthUserId(req);
      if (!currentUserId) return res.status(401).json({ ok: false, error: "Brak autoryzacji użytkownika." });

      // Rate limit check
      const rl = checkRateLimit(String(currentUserId));
      if (!rl.allowed) {
        return res.status(429).json({ ok: false, error: `Zbyt wiele wiadomości. Spróbuj za ${rl.retryAfter} sekund.` });
      }

      const conversationId = String(req.params.conversationId || req.body?.conversationId || "");
      const text = String(req.body?.text || "").trim();
      const attachmentId = req.body?.attachmentId ? String(req.body.attachmentId) : null;

      if (!conversationId) return res.status(400).json({ ok: false, error: "Brak conversationId." });
      if (!text && !attachmentId) return res.status(400).json({ ok: false, error: "Treść wiadomości nie może być pusta." });
      if (text.length > 4000) return res.status(400).json({ ok: false, error: "Wiadomość jest za długa (max 4000 znaków)." });

      const member = await userIsConversationMember(pool, conversationId, String(currentUserId));
      if (!member) return res.status(403).json({ ok: false, error: "Brak dostępu do tej rozmowy." });

      // Block check: is sender blocked by the recipient?
      const conv = await pool.query(`SELECT user_a_id, user_b_id FROM dm_conversations WHERE id = $1 LIMIT 1`, [conversationId]);
      let partnerId: string | null = null;
      if (conv.rows[0]) {
        const { user_a_id, user_b_id } = conv.rows[0];
        partnerId = user_a_id === String(currentUserId) ? String(user_b_id) : String(user_a_id);
        const blocked = await isUserBlocked(pool, String(currentUserId), partnerId);
        if (blocked) {
          return res.status(403).json({ ok: false, error: "Nie możesz wysyłać wiadomości do tego użytkownika." });
        }
      }

      // Validate attachment ownership + ensure it is not already bound to another message
      if (attachmentId) {
        const attCheck = await pool.query(
          `SELECT uploader_id, message_id FROM dm_attachments WHERE id = $1 LIMIT 1`,
          [attachmentId]
        );
        if (!attCheck.rows[0]) {
          return res.status(400).json({ ok: false, error: "Nie znaleziono załącznika." });
        }
        const { uploader_id: attUploaderId, message_id: attMessageId } = attCheck.rows[0];
        if (String(attUploaderId || "") !== String(currentUserId)) {
          return res.status(403).json({ ok: false, error: "Nie możesz użyć tego załącznika." });
        }
        if (attMessageId) {
          return res.status(409).json({ ok: false, error: "Załącznik jest już przypisany do innej wiadomości." });
        }
      }

      const msgId = randomUUID();
      touchLastSeen(pool, String(currentUserId));

      const inserted = await pool.query(
        `INSERT INTO dm_messages (id, conversation_id, sender_id, text, attachment_id, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         RETURNING id, conversation_id AS "conversationId", sender_id AS "senderId", text, attachment_id AS "attachmentId", created_at AS "createdAt"`,
        [msgId, conversationId, String(currentUserId), text || "", attachmentId]
      );
      await pool.query(`UPDATE dm_conversations SET updated_at = NOW() WHERE id = $1`, [conversationId]);

      const savedMsg = inserted.rows[0];

      // If recipient is online → mark as 'delivered'
      if (partnerId && isOnline(partnerId)) {
        await pool.query(
          `INSERT INTO dm_message_status (message_id, user_id, status, updated_at)
           VALUES ($1, $2, 'delivered', NOW())
           ON CONFLICT (message_id, user_id) DO UPDATE SET status = 'delivered', updated_at = NOW()`,
          [msgId, partnerId]
        ).catch(() => {});
      }

      // Enrich with attachment metadata if present
      let attachmentMeta = null;
      if (attachmentId) {
        const attResult = await pool.query(
          `SELECT id, file_name AS "fileName", mime_type AS "mimeType", size_bytes AS "sizeBytes"
           FROM dm_attachments WHERE id = $1 LIMIT 1`,
          [attachmentId]
        );
        attachmentMeta = attResult.rows[0] || null;
        // Update attachment's message_id
        await pool.query(`UPDATE dm_attachments SET message_id = $1 WHERE id = $2`, [msgId, attachmentId]).catch(() => {});
      }

      // Broadcast to conversation partner(s) in real-time
      const msgPayload = { ...savedMsg, isOwn: false, status: "sent", attachment: attachmentMeta };
      await broadcastToConversation(pool, conversationId, { type: "message", conversationId, message: msgPayload }, String(currentUserId));

      return res.json({ ok: true, message: { ...savedMsg, status: "sent", attachment: attachmentMeta } });
    } catch (error: any) {
      return res.status(500).json({ ok: false, error: error?.message || "send failed" });
    }
  };

  app.post("/api/messages/:conversationId/send", sendHandler);
  app.post("/api/messages/send", sendHandler);

  // ── Block / Unblock / Block-status / Blocks list / Report ─────────────────

  // GET /api/messages/blocks — returns array of user IDs the current user has blocked
  app.get("/api/messages/blocks", async (req: Request, res: Response) => {
    try {
      await ensureMessagesSchema(pool);
      const currentUserId = await getAuthUserId(req);
      if (!currentUserId) return res.status(401).json({ ok: false, error: "Brak autoryzacji." });
      const result = await pool.query(
        `SELECT blocked_id::text FROM dm_blocks WHERE blocker_id::text = $1`,
        [currentUserId]
      );
      return res.json({ ok: true, blockedUserIds: result.rows.map((r: { blocked_id: string }) => r.blocked_id) });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err?.message || "blocks list failed" });
    }
  });

  // GET /api/messages/block-status/:userId — true if current user has blocked :userId
  app.get("/api/messages/block-status/:userId", async (req: Request, res: Response) => {
    try {
      await ensureMessagesSchema(pool);
      const currentUserId = await getAuthUserId(req);
      if (!currentUserId) return res.status(401).json({ ok: false, error: "Brak autoryzacji." });
      const targetId = String(req.params.userId);
      const blocked = await isUserBlocked(pool, targetId, currentUserId);
      return res.json({ ok: true, blocked });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err?.message || "block-status check failed" });
    }
  });

  // POST /api/messages/block/:userId — block a user
  app.post("/api/messages/block/:userId", async (req: Request, res: Response) => {
    try {
      await ensureMessagesSchema(pool);
      const currentUserId = await getAuthUserId(req);
      if (!currentUserId) return res.status(401).json({ ok: false, error: "Brak autoryzacji." });
      const targetId = String(req.params.userId);
      if (targetId === String(currentUserId)) return res.status(400).json({ ok: false, error: "Nie możesz zablokować siebie." });
      await pool.query(
        `INSERT INTO dm_blocks (blocker_id, blocked_id) VALUES ($1::text, $2::text) ON CONFLICT DO NOTHING`,
        [currentUserId, targetId]
      );
      return res.json({ ok: true, blocked: true });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err?.message || "block failed" });
    }
  });

  // DELETE /api/messages/block/:userId — unblock a user
  app.delete("/api/messages/block/:userId", async (req: Request, res: Response) => {
    try {
      await ensureMessagesSchema(pool);
      const currentUserId = await getAuthUserId(req);
      if (!currentUserId) return res.status(401).json({ ok: false, error: "Brak autoryzacji." });
      const targetId = String(req.params.userId);
      await pool.query(
        `DELETE FROM dm_blocks WHERE blocker_id::text = $1 AND blocked_id::text = $2`,
        [currentUserId, targetId]
      );
      return res.json({ ok: true, blocked: false });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err?.message || "unblock failed" });
    }
  });

  // POST /api/messages/report/:userId — report a user
  app.post("/api/messages/report/:userId", async (req: Request, res: Response) => {
    try {
      await ensureMessagesSchema(pool);
      const currentUserId = await getAuthUserId(req);
      if (!currentUserId) return res.status(401).json({ ok: false, error: "Brak autoryzacji." });
      const targetId = String(req.params.userId);
      const reason = String(req.body?.reason || "").trim().substring(0, 500);
      if (!reason) return res.status(400).json({ ok: false, error: "Powód zgłoszenia jest wymagany." });
      await pool.query(
        `INSERT INTO dm_reports (reporter_id, reported_id, reason) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [currentUserId, targetId, reason]
      );
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err?.message || "report failed" });
    }
  });

  // ── Bridge: Legacy API → dm_* tables ──────────────────────────────────────
  // Stary cached frontend wywołuje te ścieżki. Obsługujemy je nowym systemem
  // żeby obaj użytkownicy (stary JS / nowy JS) trafiali do tych samych tabel.

  // POST /api/conversations/direct (stary flow: NewMessage → wybierz użytkownika)
  app.post("/api/conversations/direct", async (req: Request, res: Response) => {
    try {
      await ensureMessagesSchema(pool);
      const currentUserId = await getAuthUserId(req);
      if (!currentUserId) return res.status(401).json({ ok: false, error: "Brak autoryzacji użytkownika." });

      const target = await resolveTargetUser(pool, req.body || {}, currentUserId);
      if (!target) return res.status(404).json({ ok: false, error: "Nie znaleziono użytkownika docelowego." });
      if (String(target.id) === String(currentUserId)) return res.status(400).json({ ok: false, error: "Nie możesz pisać do siebie." });

      const conversation = await getOrCreateConversation(pool, String(currentUserId), String(target.id));

      return res.json({
        ok: true,
        conversationId: conversation.id,
        redirectTo: `/messages/${conversation.id}`,
        id: conversation.id,
        conversation,
        target,
      });
    } catch (error: any) {
      return res.status(500).json({ ok: false, error: error?.message || "create conversation failed" });
    }
  });

  // GET /api/conversations/:userId — stary frontend ładuje listę rozmów po userId
  // Ignorujemy userId z URL, używamy sesji (bezpieczniej), zwracamy stary kształt JSON
  app.get("/api/conversations/:legacyUserId", async (req: Request, res: Response) => {
    try {
      await ensureMessagesSchema(pool);
      const currentUserId = await getAuthUserId(req);
      if (!currentUserId) return res.json([]);

      const cols = await getAppUsersColumns(pool);
      const displayCol = pickFirstExisting(cols, ["full_name", "display_name", "name", "username", "email"]) || "id";
      const handleCol  = pickFirstExisting(cols, ["handle", "host", "username", "email"]);

      const convResult = await pool.query(
        `SELECT
           c.id,
           CASE WHEN c.user_a_id = $1 THEN c.user_b_id ELSE c.user_a_id END AS partner_id,
           (SELECT ${q(displayCol)}::text FROM app_users u
            WHERE u.id::text = CASE WHEN c.user_a_id = $1 THEN c.user_b_id ELSE c.user_a_id END LIMIT 1) AS contact_name,
           (SELECT ${handleCol ? `${q(handleCol)}::text` : "NULL"} FROM app_users u
            WHERE u.id::text = CASE WHEN c.user_a_id = $1 THEN c.user_b_id ELSE c.user_a_id END LIMIT 1) AS contact_handle,
           c.created_at, c.updated_at
         FROM dm_conversations c
         WHERE c.user_a_id = $1 OR c.user_b_id = $1
         ORDER BY COALESCE(c.updated_at, c.created_at) DESC`,
        [String(currentUserId)]
      );

      const conversations = await Promise.all(
        convResult.rows.map(async (c: any) => {
          const msgResult = await pool.query(
            `SELECT id, conversation_id AS "conversationId", sender_id AS "senderId", text,
                    created_at AS timestamp, false AS "isTransfer",
                    NULL::numeric AS "transferAmount", NULL AS "transferStatus"
             FROM dm_messages WHERE conversation_id = $1 ORDER BY created_at ASC`,
            [c.id]
          );
          const handle = c.contact_handle
            ? (String(c.contact_handle).startsWith("@") ? c.contact_handle : `@${c.contact_handle}`)
            : "@unknown";
          return {
            id: c.id,
            userId: currentUserId,
            contactName: c.contact_name || "User",
            contactHandle: handle,
            unreadCount: 0,
            createdAt: c.created_at,
            messages: msgResult.rows,
          };
        })
      );

      return res.json(conversations);
    } catch {
      return res.json([]);
    }
  });

  // POST /api/message/send {senderId, recipientHandle, text} — stary format wysyłania
  app.post("/api/message/send", async (req: Request, res: Response) => {
    try {
      await ensureMessagesSchema(pool);
      const currentUserId = await getAuthUserId(req);
      if (!currentUserId) return res.status(401).json({ ok: false, error: "Brak autoryzacji." });

      // Rate limit check (same as primary send handler)
      const rl = checkRateLimit(String(currentUserId));
      if (!rl.allowed) {
        return res.status(429).json({ ok: false, error: `Zbyt wiele wiadomości. Spróbuj za ${rl.retryAfter} sekund.` });
      }

      const text = String(req.body?.text || "").trim();
      if (!text) return res.status(400).json({ ok: false, error: "Treść wiadomości nie może być pusta." });
      if (text.length > 4000) return res.status(400).json({ ok: false, error: "Wiadomość jest za długa (max 4000 znaków)." });

      // Rozwiąż odbiorcę — stary format przesyła recipientHandle (np. "@u90ef907b")
      // Najpierw przez targetUserId, potem przez handle (strip @), potem przez searchUsers
      let targetId: string | null = req.body?.targetUserId || null;
      if (!targetId) {
        const rawHandle = String(req.body?.recipientHandle || req.body?.handle || "").replace(/^@/, "").trim();
        if (rawHandle) {
          const cols = await getAppUsersColumns(pool);
          const handleCol = pickFirstExisting(cols, ["handle", "host", "username"]);
          // Szukaj dokładnego dopasowania po handle (bez @)
          if (handleCol) {
            const r = await pool.query(
              `SELECT ${q("id")}::text AS id FROM app_users WHERE LOWER(${q(handleCol)}::text) = LOWER($1) AND ${q("id")}::text <> $2 LIMIT 1`,
              [rawHandle, String(currentUserId)]
            );
            if (r.rows[0]) targetId = r.rows[0].id;
          }
          // Fallback: ILIKE search przez searchUsers
          if (!targetId) {
            const hits = await searchUsers(pool, rawHandle, currentUserId);
            if (hits[0]) targetId = hits[0].id;
          }
        }
      }
      if (!targetId) return res.status(404).json({ ok: false, error: "Nie znaleziono odbiorcy." });

      // Block check: is sender blocked by the recipient?
      const blocked = await isUserBlocked(pool, String(currentUserId), targetId);
      if (blocked) {
        return res.status(403).json({ ok: false, error: "Nie możesz wysyłać wiadomości do tego użytkownika." });
      }

      const target = { id: targetId };

      const conversation = await getOrCreateConversation(pool, String(currentUserId), String(target.id));

      const msgId = randomUUID();
      const inserted = await pool.query(
        `INSERT INTO dm_messages (id, conversation_id, sender_id, text, created_at)
         VALUES ($1, $2, $3, $4, NOW())
         RETURNING id, conversation_id AS "conversationId", sender_id AS "senderId", text, created_at AS "createdAt"`,
        [msgId, conversation.id, String(currentUserId), text]
      );
      await pool.query(`UPDATE dm_conversations SET updated_at = NOW() WHERE id = $1`, [conversation.id]);

      const savedMsg = inserted.rows[0];
      await broadcastToConversation(pool, conversation.id, { type: "message", conversationId: conversation.id, message: { ...savedMsg, isOwn: false } }, String(currentUserId));

      return res.json({ ok: true, message: savedMsg });
    } catch (error: any) {
      return res.status(500).json({ ok: false, error: error?.message || "send failed" });
    }
  });

  // ── Attachment cleanup job ────────────────────────────────────────────────
  // Removes orphaned attachments (no linked message) older than ATTACHMENT_ORPHAN_TTL_HOURS (default 24h).
  // Optionally removes all attachments older than ATTACHMENT_RETENTION_DAYS when that env var is set.
  // Runs once on startup and then every ATTACHMENT_CLEANUP_INTERVAL_MS (default 1 hour).

  let cleanupRunning = false; // simple run-lock to prevent overlapping runs

  async function runAttachmentCleanup() {
    if (cleanupRunning) return;
    cleanupRunning = true;
    try {
      const orphanTtlHours = parseInt(process.env.ATTACHMENT_ORPHAN_TTL_HOURS ?? "24", 10);
      const retentionDays  = parseInt(process.env.ATTACHMENT_RETENTION_DAYS  ?? "0",  10);

      const toDelete: { id: string; storage_key: string }[] = [];

      // 1. Orphaned attachments (message_id IS NULL) older than the TTL
      const orphanResult = await pool.query<{ id: string; storage_key: string }>(
        `SELECT id, storage_key FROM dm_attachments
         WHERE message_id IS NULL
           AND created_at < NOW() - ($1 || ' hours')::interval`,
        [orphanTtlHours]
      );
      toDelete.push(...orphanResult.rows);

      // 2. All attachments past the retention window (when configured)
      if (retentionDays > 0) {
        const retainResult = await pool.query<{ id: string; storage_key: string }>(
          `SELECT id, storage_key FROM dm_attachments
           WHERE created_at < NOW() - ($1 || ' days')::interval`,
          [retentionDays]
        );
        // Deduplicate by id
        const seen = new Set(toDelete.map((r) => r.id));
        for (const row of retainResult.rows) {
          if (!seen.has(row.id)) toDelete.push(row);
        }
      }

      if (toDelete.length === 0) return;

      const ids = toDelete.map((r) => r.id);

      // Delete DB rows first so the files are no longer referenced
      await pool.query(
        `DELETE FROM dm_attachments WHERE id = ANY($1::text[])`,
        [ids]
      );

      // Delete files from disk asynchronously (best-effort; log failures but don't throw)
      let deletedFiles = 0;
      for (const { storage_key } of toDelete) {
        try {
          const filePath = path.isAbsolute(storage_key)
            ? storage_key
            : path.join(UPLOAD_DIR, storage_key);
          await fs.promises.access(filePath).then(
            () => fs.promises.unlink(filePath).then(() => { deletedFiles++; }),
            () => {}  // file not found — already gone, skip silently
          );
        } catch (fileErr) {
          console.warn("[attachment-cleanup] Could not delete file:", storage_key, fileErr);
        }
      }

      console.log(
        `[attachment-cleanup] Removed ${ids.length} attachment record(s) and ${deletedFiles} file(s).`
      );
    } catch (err: any) {
      // Schema may not exist yet on the very first startup run — log and recover gracefully
      if (err?.code === "42P01") {
        console.warn("[attachment-cleanup] Schema not ready yet, will retry on next interval.");
      } else {
        console.error("[attachment-cleanup] Cleanup job failed:", err);
      }
    } finally {
      cleanupRunning = false;
    }
  }

  const CLEANUP_INTERVAL_MS =
    parseInt(process.env.ATTACHMENT_CLEANUP_INTERVAL_MS ?? "0", 10) ||
    60 * 60 * 1000; // default: 1 hour

  // Run once immediately after the server starts, then on the interval
  setImmediate(() => runAttachmentCleanup());
  setInterval(() => runAttachmentCleanup(), CLEANUP_INTERVAL_MS).unref();
}
