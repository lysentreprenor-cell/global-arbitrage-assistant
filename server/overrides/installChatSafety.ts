import type { Express, Request, Response } from "express";
import type { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { resolveRequestUser } from "../adminHelper";
import { ensureMessagesSchema } from "./installMessagesFix";

async function getAuthUserId(req: Request): Promise<string | null> {
  const user = await resolveRequestUser(req);
  return user?.id ?? null;
}

export function installChatSafety(app: Express, pool: Pool) {

  // ── GET /api/messages/blocks — lista zablokowanych ───────────────────────
  // Registered BEFORE generic GET /api/messages/:conversationId in installMessagesFix

  app.get("/api/messages/blocks", async (req: Request, res: Response) => {
    try {
      await ensureMessagesSchema(pool);
      const currentUserId = await getAuthUserId(req);
      if (!currentUserId) return res.status(401).json({ ok: false, error: "Brak autoryzacji." });

      const result = await pool.query(
        `SELECT b.id, b.blocked_id, b.reason, b.created_at,
                u.display_name AS blocked_name
         FROM dm_blocks b
         LEFT JOIN app_users u ON u.id::text = b.blocked_id::text
         WHERE b.blocker_id::text = $1
         ORDER BY b.created_at DESC`,
        [String(currentUserId)]
      );

      return res.json({ ok: true, blocks: result.rows });
    } catch (error: any) {
      return res.status(500).json({ ok: false, error: error?.message || "Failed to load blocks." });
    }
  });

  // ── POST /api/messages/block/:userId — zablokuj użytkownika ─────────────

  app.post("/api/messages/block/:userId", async (req: Request, res: Response) => {
    try {
      await ensureMessagesSchema(pool);
      const currentUserId = await getAuthUserId(req);
      if (!currentUserId) return res.status(401).json({ ok: false, error: "Brak autoryzacji." });

      const targetId = String(req.params.userId);
      if (targetId === String(currentUserId)) {
        return res.status(400).json({ ok: false, error: "Nie możesz zablokować siebie." });
      }

      const reason = String(req.body?.reason || "").trim().slice(0, 500) || null;
      const id = randomUUID();

      await pool.query(
        `INSERT INTO dm_blocks (id, blocker_id, blocked_id, reason, created_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (blocker_id, blocked_id) DO NOTHING`,
        [id, String(currentUserId), targetId, reason]
      );

      return res.json({ ok: true, blocked: true });
    } catch (error: any) {
      return res.status(500).json({ ok: false, error: error?.message || "Block failed." });
    }
  });

  // ── DELETE /api/messages/block/:userId — odblokuj ────────────────────────

  app.delete("/api/messages/block/:userId", async (req: Request, res: Response) => {
    try {
      await ensureMessagesSchema(pool);
      const currentUserId = await getAuthUserId(req);
      if (!currentUserId) return res.status(401).json({ ok: false, error: "Brak autoryzacji." });

      const targetId = String(req.params.userId);

      await pool.query(
        `DELETE FROM dm_blocks WHERE blocker_id::text = $1 AND blocked_id::text = $2`,
        [String(currentUserId), targetId]
      );

      return res.json({ ok: true, blocked: false });
    } catch (error: any) {
      return res.status(500).json({ ok: false, error: error?.message || "Unblock failed." });
    }
  });

  // ── GET /api/messages/block-status/:userId — sprawdź blok ────────────────

  app.get("/api/messages/block-status/:userId", async (req: Request, res: Response) => {
    try {
      await ensureMessagesSchema(pool);
      const currentUserId = await getAuthUserId(req);
      if (!currentUserId) return res.status(401).json({ ok: false, error: "Brak autoryzacji." });

      const targetId = String(req.params.userId);

      const result = await pool.query(
        `SELECT 1 FROM dm_blocks WHERE blocker_id::text = $1 AND blocked_id::text = $2 LIMIT 1`,
        [String(currentUserId), targetId]
      );

      return res.json({ ok: true, isBlocked: Boolean(result.rows[0]) });
    } catch (error: any) {
      return res.status(500).json({ ok: false, error: error?.message || "Block status check failed." });
    }
  });

  // ── POST /api/messages/report/:userId — zgłoś użytkownika ───────────────

  app.post("/api/messages/report/:userId", async (req: Request, res: Response) => {
    try {
      await ensureMessagesSchema(pool);
      const currentUserId = await getAuthUserId(req);
      if (!currentUserId) return res.status(401).json({ ok: false, error: "Brak autoryzacji." });

      const targetId = String(req.params.userId);
      if (targetId === String(currentUserId)) {
        return res.status(400).json({ ok: false, error: "Nie możesz zgłosić siebie." });
      }

      const reason = String(req.body?.reason || "").trim();
      if (!reason) return res.status(400).json({ ok: false, error: "Podaj powód zgłoszenia." });

      const details = String(req.body?.details || "").trim().slice(0, 2000) || null;
      const id = randomUUID();

      await pool.query(
        `INSERT INTO dm_reports (id, reporter_id, reported_id, reason, details, status, created_at)
         VALUES ($1, $2, $3, $4, $5, 'pending', NOW())`,
        [id, String(currentUserId), targetId, reason.slice(0, 500), details]
      );

      return res.json({ ok: true, reportId: id });
    } catch (error: any) {
      return res.status(500).json({ ok: false, error: error?.message || "Report failed." });
    }
  });
}
