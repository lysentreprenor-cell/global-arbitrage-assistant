/**
 * NotificationService — central service for creating and delivering notifications.
 *
 * Responsibilities:
 *  - Ownership-safe notification creation
 *  - DB-level deduplication via dedupeKey (no duplicate within TTL window)
 *  - Rate limiting: max 20 notifications per user per hour
 *  - Quiet-hours gating per category (skip push during user's quiet window)
 *  - Grouping: collapse notifications by groupKey before fanout
 *  - Smart push: only send push if user preference allows it for that category
 */

import { db } from "./db";
import { notifications, notificationPreferences } from "@shared/schema";
import { eq, and, gte, count } from "drizzle-orm";
import { randomUUID } from "crypto";
import { sendPushToUser } from "./pushNotifications";
import type { Notification } from "@shared/schema";

export type NotifInput = {
  userId: string;
  type: "info" | "alert" | "success" | "transfer";
  category?: "message" | "payment" | "contract" | "system" | "security";
  priority?: "low" | "normal" | "high" | "critical";
  title: string;
  message: string;
  route?: string;
  dedupeKey?: string;
  groupKey?: string;
  relatedId?: string;
  relatedType?: string;
  expiresAt?: Date;
  sendPush?: boolean;
};

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX = 20;
const DEDUPE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Check whether the current UTC hour falls within a quiet window [start, end).
 * Handles overnight windows (e.g. 22 → 06).
 */
function isQuietNow(quietStart: number | null, quietEnd: number | null): boolean {
  if (quietStart === null || quietEnd === null) return false;
  const hour = new Date().getUTCHours();
  if (quietStart <= quietEnd) {
    return hour >= quietStart && hour < quietEnd;
  }
  // overnight: e.g. 22–06
  return hour >= quietStart || hour < quietEnd;
}

export async function createNotification(input: NotifInput): Promise<Notification | null> {
  const {
    userId,
    type,
    category = "system",
    priority = "normal",
    title,
    message,
    route,
    dedupeKey,
    groupKey,
    relatedId,
    relatedType,
    expiresAt,
    sendPush: wantPush = false,
  } = input;

  // ── Rate limiting (push-only — in-app notifications are always created) ────
  // Rate limiting only controls whether a push is sent, not whether the DB row is created.
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
  const [{ count: recentCount }] = await db
    .select({ count: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), gte(notifications.date, windowStart)));

  const isRateLimited = Number(recentCount) >= RATE_LIMIT_MAX && (priority === "low" || priority === "normal");

  // ── In-app preference enforcement ─────────────────────────────────────────
  // Critical priority always bypasses inApp disable; others respect the preference
  if (priority !== "critical") {
    const prefRows = await db
      .select()
      .from(notificationPreferences)
      .where(and(eq(notificationPreferences.userId, userId), eq(notificationPreferences.category, category)))
      .limit(1);
    if (prefRows.length > 0 && prefRows[0].inApp === false) {
      return null; // User has disabled in-app notifications for this category
    }
  }

  // ── Deduplication (time-window based) ─────────────────────────────────────
  // Pre-check for dedupe window (app-layer check for recent duplicates within DEDUPE_WINDOW_MS)
  if (dedupeKey) {
    const dedupeWindow = new Date(Date.now() - DEDUPE_WINDOW_MS);
    const existing = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, userId),
          eq(notifications.dedupeKey, dedupeKey),
          gte(notifications.date, dedupeWindow)
        )
      )
      .limit(1);
    if (existing.length > 0) return existing[0];
  }

  // ── Create notification (atomic: ON CONFLICT DO NOTHING on unique dedupe_key) ─
  // The unique partial index on (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL
  // ensures concurrent inserts with the same key are safely no-oped at DB level.
  const rows = await db
    .insert(notifications)
    .values({
      id: randomUUID(),
      userId,
      type,
      category,
      priority,
      title,
      message,
      route: route ?? null,
      dedupeKey: dedupeKey ?? null,
      groupKey: groupKey ?? null,
      relatedId: relatedId ?? null,
      relatedType: relatedType ?? null,
      expiresAt: expiresAt ?? null,
      read: false,
      isDelivered: false,
    })
    .onConflictDoNothing()
    .returning();

  // If ON CONFLICT DO NOTHING fired (concurrent duplicate), return null
  if (rows.length === 0) return null;
  const [notif] = rows;

  // ── Smart push fanout (rate-limited per user/hour for low-normal priority) ─
  if (wantPush && !isRateLimited) {
    await deliverPush(userId, category, priority, title, message, route, notif.id);
  }

  return notif;
}

// ── Exported anti-spam primitives ─────────────────────────────────────────────

/**
 * shouldSendPush — decides whether to send a push for the given userId/category/priority.
 * Checks push opt-out preference and quiet hours. Does NOT check rate limit (see rateLimitNotification).
 */
export async function shouldSendPush(
  userId: string,
  category: "message" | "payment" | "contract" | "system" | "security",
  priority: string
): Promise<boolean> {
  // Fetch all pref rows for this user in one query (≤5 rows) to get both
  // per-category settings and the global "system" row (for importantOnlyInQuiet)
  const allPrefs = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId));

  const pref = allPrefs.find(p => p.category === category);
  const systemPref = allPrefs.find(p => p.category === "system");

  if (pref && !pref.push) return false;
  if (priority !== "critical") {
    const quietNow = pref ? isQuietNow(pref.quietStart, pref.quietEnd) : false;
    if (quietNow) {
      // importantOnlyInQuiet is a GLOBAL setting stored in the "system" row
      const importantOnly = systemPref?.importantOnlyInQuiet ?? false;
      if (importantOnly && priority !== "high") return false;
      if (!importantOnly) return false; // All non-critical suppressed in quiet hours
    }
  }
  return true;
}

/**
 * rateLimitNotification — returns true if push should be suppressed due to rate limit.
 * Rate limit: 20 notifications per user per hour for low/normal priority.
 * High/critical bypass the limit.
 */
export async function rateLimitNotification(userId: string, priority: string): Promise<boolean> {
  if (priority === "high" || priority === "critical") return false;
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
  const [{ count: recentCount }] = await db
    .select({ count: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), gte(notifications.date, windowStart)));
  return Number(recentCount) >= RATE_LIMIT_MAX;
}

/**
 * groupMessageNotifications — collapses multiple message notifications from the same
 * sender/conversation into a single grouped notification (by groupKey).
 * Returns true if an existing group was updated (caller should skip inserting a new one).
 */
export async function groupMessageNotifications(
  userId: string,
  groupKey: string,
  title: string,
  messageCount: number
): Promise<boolean> {
  const groupWindowStart = new Date(Date.now() - 30 * 60 * 1000); // 30-min grouping window
  const existing = await db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.groupKey, groupKey),
        gte(notifications.date, groupWindowStart)
      )
    )
    .limit(1);
  if (existing.length === 0) return false;
  // Parse the existing count from the title (e.g. "3 new messages" → 3), increment, update
  const existingTitle = existing[0].title ?? "";
  const countMatch = existingTitle.match(/^(\d+) new message/);
  const prevCount = countMatch ? parseInt(countMatch[1], 10) : 1;
  const newCount = prevCount + messageCount;
  await db
    .update(notifications)
    .set({ title: `${newCount} new messages`, date: new Date() })
    .where(eq(notifications.id, existing[0].id));
  return true;
}

/**
 * sendSmartPush — unified smart push helper.
 * Checks rate limit + quiet hours + user preference before dispatching.
 */
export async function sendSmartPush(
  userId: string,
  category: "message" | "payment" | "contract" | "system" | "security",
  priority: string,
  title: string,
  body: string,
  route?: string | null,
  groupKey?: string
): Promise<void> {
  const [rateLimited, allowed] = await Promise.all([
    rateLimitNotification(userId, priority),
    shouldSendPush(userId, category, priority),
  ]);
  if (rateLimited || !allowed) return;
  await sendPushToUser(userId, {
    title,
    body,
    icon: "/icons/icon-192.png",
    route: route ?? "/notifications",
    category,
    priority,
    groupKey: groupKey ?? "",
  }).catch(() => {});
}

/**
 * Deliver a push notification respecting user preferences (in-app/push toggles + quiet hours).
 */
export async function deliverPush(
  userId: string,
  category: string,
  priority: string,
  title: string,
  body: string,
  route: string | undefined | null,
  groupKey: string
): Promise<void> {
  // Delegate to the canonical shouldSendPush gate (handles push opt-out, quiet hours, importantOnlyInQuiet)
  const allowed = await shouldSendPush(
    userId,
    category as "message" | "payment" | "contract" | "system" | "security",
    priority
  );
  if (!allowed) return;

  await sendPushToUser(userId, {
    title,
    body,
    icon: "/icons/icon-192.png",
    route: route ?? "/notifications",
    category,
    priority,
    groupKey,
  }).catch(() => {});
}
