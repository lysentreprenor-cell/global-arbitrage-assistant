import { db } from "./db";
import { pool } from "./pool";
import { transactions, notifications, notificationPreferences, conversations, messages, supportTickets, supportMessages, friends, agreementHolds, sandboxTransfers, contractInvites } from "@shared/schema";
import { eq, desc, gte, sql, and } from "drizzle-orm";
import type {
  User, Transaction, Notification, NotificationPreference, Conversation, Message, SupportTicket, SupportMessage, Friend, AgreementHold,
  SandboxTransfer, InsertSandboxTransfer, ContractInvite, InsertContractInvite,
} from "@shared/schema";
import { randomUUID } from "crypto";

/*
  User operations use app_users table (new auth system) via raw SQL pool.
  Domain operations (transactions, notifications, etc.) use Drizzle.
*/

function mapToUser(row: any): User {
  const md = (row.metadata && typeof row.metadata === "object") ? row.metadata : {};
  const settings = (md.settings && typeof md.settings === "object") ? md.settings : {};
  return {
    id: row.id,
    name: row.display_name || "Użytkownik",
    handle: row.host ? `@${row.host}` : `@u${String(row.id).slice(0, 8)}`,
    email: row.email,
    passwordHash: row.password_hash || null,
    phone: row.phone || null,
    address: md.address ?? null,
    balance: Number(row.balance ?? 0),
    pushNotifications: settings.pushNotifications ?? true,
    emailDigest: settings.emailDigest ?? false,
    biometricLogin: settings.biometricLogin ?? true,
    hideBalances: settings.hideBalances ?? false,
    appearance: (settings.appearance ?? "obsidian-gold") as any,
    language: (settings.language ?? null) as any,
    createdAt: row.created_at,
    lastActiveAt: row.last_active_at || null,
  } as any;
}

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByHandle(handle: string): Promise<User | undefined>;
  upsertUser(user: any): Promise<User>;
  updateUser(id: string, data: Partial<User>): Promise<User | undefined>;
  updateLastActive(id: string): Promise<void>;
  getAdminStats(): Promise<{ totalUsers: number; onlineUsers: number }>;

  getTransactions(userId: string): Promise<Transaction[]>;
  createTransaction(tx: typeof transactions.$inferInsert): Promise<Transaction>;

  getNotifications(userId: string): Promise<Notification[]>;
  createNotification(notif: typeof notifications.$inferInsert): Promise<Notification>;
  markNotificationRead(id: string, userId?: string): Promise<void>;
  markAllNotificationsRead(userId: string): Promise<void>;
  deleteNotification(id: string, userId?: string): Promise<{ deleted: boolean }>;
  getNotificationPreferences(userId: string): Promise<NotificationPreference[]>;
  upsertNotificationPreference(pref: typeof notificationPreferences.$inferInsert): Promise<NotificationPreference>;

  getConversations(userId: string): Promise<(Conversation & { messages: Message[] })[]>;
  getConversation(id: string): Promise<(Conversation & { messages: Message[] }) | undefined>;
  upsertConversation(convo: typeof conversations.$inferInsert & { id: string }): Promise<Conversation>;
  addMessage(msg: typeof messages.$inferInsert & { id: string }): Promise<Message>;
  markConversationRead(conversationId: string): Promise<void>;
  getConversationByContact(userId: string, contactHandle: string): Promise<Conversation | undefined>;
  incrementConversationUnread(conversationId: string): Promise<void>;

  getSupportTickets(userId: string): Promise<(SupportTicket & { messages: SupportMessage[] })[]>;
  createSupportTicket(ticket: typeof supportTickets.$inferInsert & { id: string }): Promise<SupportTicket>;
  addSupportMessage(msg: typeof supportMessages.$inferInsert & { id: string }): Promise<SupportMessage>;
  reopenTicket(ticketId: string): Promise<void>;

  getFriends(userId: string): Promise<Friend[]>;
  addFriend(userId: string, handle: string, name: string): Promise<Friend>;
  removeFriend(userId: string, handle: string): Promise<void>;
  isFriend(userId: string, handle: string): Promise<boolean>;

  createAgreementHold(hold: typeof agreementHolds.$inferInsert): Promise<AgreementHold>;
  getAgreementHold(agreementId: string): Promise<AgreementHold | undefined>;
  releaseAgreementHold(agreementId: string): Promise<void>;

  createSandboxTransfer(data: InsertSandboxTransfer): Promise<SandboxTransfer>;
  getSandboxTransfers(userId: string): Promise<SandboxTransfer[]>;
  createContractInvite(data: InsertContractInvite): Promise<ContractInvite>;
  getContractInvites(userId: string): Promise<ContractInvite[]>;
}

export class PgStorage implements IStorage {
  // ── User operations (app_users via raw SQL) ──────────────────────────────

  async getUser(id: string): Promise<User | undefined> {
    const r = await pool.query(
      `SELECT * FROM app_users WHERE id = $1 LIMIT 1`, [id]
    );
    return r.rows[0] ? mapToUser(r.rows[0]) : undefined;
  }

  async getAllUsers(): Promise<User[]> {
    const r = await pool.query(`SELECT * FROM app_users ORDER BY created_at DESC`);
    return r.rows.map(mapToUser);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const r = await pool.query(
      `SELECT * FROM app_users WHERE LOWER(email) = $1 LIMIT 1`,
      [email.trim().toLowerCase()]
    );
    return r.rows[0] ? mapToUser(r.rows[0]) : undefined;
  }

  async getUserByHandle(handle: string): Promise<User | undefined> {
    const host = handle.replace(/^@/, "").toLowerCase();
    if (!host) return undefined;
    const r = await pool.query(
      `SELECT * FROM app_users WHERE LOWER(host) = $1 LIMIT 1`, [host]
    );
    return r.rows[0] ? mapToUser(r.rows[0]) : undefined;
  }

  async upsertUser(user: any): Promise<User> {
    const host = user.handle ? user.handle.replace(/^@/, "") : null;
    const r = await pool.query(`
      INSERT INTO app_users (id, email, password_hash, display_name, host, phone, balance, role, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)
      ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        display_name = EXCLUDED.display_name,
        host = EXCLUDED.host,
        phone = EXCLUDED.phone,
        balance = EXCLUDED.balance,
        updated_at = NOW()
      RETURNING *`,
      [
        user.id, user.email, user.passwordHash || user.password_hash || "",
        user.name || "Użytkownik", host, user.phone || null,
        user.balance ?? 0, user.role || "user"
      ]
    );
    return mapToUser(r.rows[0]);
  }

  async updateUser(id: string, data: Partial<User>): Promise<User | undefined> {
    const sets: string[] = [];
    const vals: any[] = [];
    let idx = 1;

    if (data.name !== undefined) { sets.push(`display_name = $${idx++}`); vals.push(data.name); }
    if (data.handle !== undefined) { sets.push(`host = $${idx++}`); vals.push(data.handle.replace(/^@/, "")); }
    if (data.email !== undefined) { sets.push(`email = $${idx++}`); vals.push(data.email); }
    if (data.phone !== undefined) { sets.push(`phone = $${idx++}`); vals.push(data.phone); }
    if ((data as any).balance !== undefined) { sets.push(`balance = $${idx++}`); vals.push((data as any).balance); }

    // Settings + language are stored under metadata.settings (jsonb) so they
    // sync across devices for the same user. Merge instead of overwrite.
    const settingsPatch: Record<string, any> = {};
    const d: any = data;
    if (d.pushNotifications !== undefined) settingsPatch.pushNotifications = d.pushNotifications;
    if (d.emailDigest !== undefined) settingsPatch.emailDigest = d.emailDigest;
    if (d.biometricLogin !== undefined) settingsPatch.biometricLogin = d.biometricLogin;
    if (d.hideBalances !== undefined) settingsPatch.hideBalances = d.hideBalances;
    if (d.appearance !== undefined) settingsPatch.appearance = d.appearance;
    if (d.language !== undefined) settingsPatch.language = d.language;
    if (d.currencies !== undefined) settingsPatch.currencies = d.currencies;

    const metaPatch: Record<string, any> = {};
    if (d.address !== undefined) metaPatch.address = d.address;
    if (Object.keys(settingsPatch).length > 0) metaPatch.settings = settingsPatch;

    if (Object.keys(metaPatch).length > 0) {
      // Build ONE metadata expression (multiple `metadata = ...` assignments in
      // the same SET list would silently overwrite each other — last wins).
      // Compose nested jsonb_set calls so settings + address can update atomically.
      let metaExpr = `COALESCE(metadata, '{}'::jsonb)`;
      if (metaPatch.settings) {
        metaExpr = `jsonb_set(
          ${metaExpr},
          '{settings}',
          COALESCE(metadata->'settings', '{}'::jsonb) || $${idx++}::jsonb,
          true
        )`;
        vals.push(JSON.stringify(metaPatch.settings));
      }
      if (metaPatch.address !== undefined) {
        metaExpr = `jsonb_set(${metaExpr}, '{address}', $${idx++}::jsonb, true)`;
        vals.push(JSON.stringify(metaPatch.address));
      }
      sets.push(`metadata = ${metaExpr}`);
    }

    if (sets.length === 0) {
      const r = await pool.query(`SELECT * FROM app_users WHERE id = $1 LIMIT 1`, [id]);
      return r.rows[0] ? mapToUser(r.rows[0]) : undefined;
    }

    sets.push(`updated_at = NOW()`);
    vals.push(id);
    const r = await pool.query(
      `UPDATE app_users SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`, vals
    );
    return r.rows[0] ? mapToUser(r.rows[0]) : undefined;
  }

  async updateLastActive(id: string): Promise<void> {
    await pool.query(`UPDATE app_users SET last_active_at = NOW() WHERE id = $1`, [id]);
  }

  async getAdminStats(): Promise<{ totalUsers: number; onlineUsers: number }> {
    const [tot, online] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS count FROM app_users`),
      pool.query(`SELECT COUNT(*)::int AS count FROM app_users WHERE last_active_at > NOW() - INTERVAL '5 minutes'`),
    ]);
    return {
      totalUsers: tot.rows[0]?.count ?? 0,
      onlineUsers: online.rows[0]?.count ?? 0,
    };
  }

  // ── Domain operations (Drizzle) ───────────────────────────────────────────

  async getTransactions(userId: string): Promise<Transaction[]> {
    return db.select().from(transactions).where(eq(transactions.userId, userId)).orderBy(desc(transactions.date));
  }

  async createTransaction(tx: typeof transactions.$inferInsert): Promise<Transaction> {
    const rows = await db.insert(transactions).values({ ...tx, id: randomUUID() }).returning();
    return rows[0];
  }

  async getNotifications(userId: string): Promise<Notification[]> {
    return db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.date));
  }

  async createNotification(notif: typeof notifications.$inferInsert): Promise<Notification> {
    const rows = await db.insert(notifications).values({ ...notif, id: randomUUID() }).returning();
    return rows[0];
  }

  async markNotificationRead(id: string, userId?: string): Promise<void> {
    const condition = userId
      ? and(eq(notifications.id, id), eq(notifications.userId, userId))
      : eq(notifications.id, id);
    await db.update(notifications).set({ read: true }).where(condition);
  }

  async markAllNotificationsRead(userId: string): Promise<void> {
    await db.update(notifications).set({ read: true }).where(eq(notifications.userId, userId));
  }

  async deleteNotification(id: string, userId?: string): Promise<{ deleted: boolean }> {
    const condition = userId
      ? and(eq(notifications.id, id), eq(notifications.userId, userId))
      : eq(notifications.id, id);
    const rows = await db.delete(notifications).where(condition).returning({ id: notifications.id });
    return { deleted: rows.length > 0 };
  }

  async getNotificationPreferences(userId: string): Promise<NotificationPreference[]> {
    return db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId));
  }

  async upsertNotificationPreference(pref: typeof notificationPreferences.$inferInsert): Promise<NotificationPreference> {
    const rows = await db.insert(notificationPreferences)
      .values({ ...pref, id: randomUUID() })
      .onConflictDoUpdate({
        target: [notificationPreferences.userId, notificationPreferences.category],
        set: {
          inApp: pref.inApp,
          push: pref.push,
          quietStart: pref.quietStart,
          quietEnd: pref.quietEnd,
          importantOnlyInQuiet: pref.importantOnlyInQuiet,
          dailySummary: pref.dailySummary,
        },
      })
      .returning();
    return rows[0];
  }

  async getConversations(userId: string): Promise<(Conversation & { messages: Message[] })[]> {
    const convos = await db.select().from(conversations).where(eq(conversations.userId, userId));
    const result = [];
    for (const convo of convos) {
      const msgs = await db.select().from(messages).where(eq(messages.conversationId, convo.id)).orderBy(messages.timestamp);
      result.push({ ...convo, messages: msgs });
    }
    return result;
  }

  async getConversation(id: string): Promise<(Conversation & { messages: Message[] }) | undefined> {
    const rows = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
    if (!rows.length) return undefined;
    const convo = rows[0];
    const msgs = await db.select().from(messages).where(eq(messages.conversationId, convo.id)).orderBy(messages.timestamp);
    return { ...convo, messages: msgs };
  }

  async upsertConversation(convo: typeof conversations.$inferInsert & { id: string }): Promise<Conversation> {
    const rows = await db.insert(conversations).values(convo)
      .onConflictDoUpdate({ target: conversations.id, set: { unreadCount: convo.unreadCount } })
      .returning();
    return rows[0];
  }

  async addMessage(msg: typeof messages.$inferInsert & { id: string }): Promise<Message> {
    const rows = await db.insert(messages).values(msg).returning();
    return rows[0];
  }

  async markConversationRead(conversationId: string): Promise<void> {
    await db.update(conversations).set({ unreadCount: 0 }).where(eq(conversations.id, conversationId));
  }

  async getConversationByContact(userId: string, contactHandle: string): Promise<Conversation | undefined> {
    const rows = await db.select().from(conversations)
      .where(and(eq(conversations.userId, userId), eq(conversations.contactHandle, contactHandle)))
      .limit(1);
    return rows[0];
  }

  async incrementConversationUnread(conversationId: string): Promise<void> {
    await db.update(conversations).set({ unreadCount: sql`unread_count + 1` }).where(eq(conversations.id, conversationId));
  }

  async getSupportTickets(userId: string): Promise<(SupportTicket & { messages: SupportMessage[] })[]> {
    const tickets = await db.select().from(supportTickets).where(eq(supportTickets.userId, userId)).orderBy(desc(supportTickets.updatedAt));
    const result = [];
    for (const ticket of tickets) {
      const msgs = await db.select().from(supportMessages).where(eq(supportMessages.ticketId, ticket.id)).orderBy(supportMessages.timestamp);
      result.push({ ...ticket, messages: msgs });
    }
    return result;
  }

  async createSupportTicket(ticket: typeof supportTickets.$inferInsert & { id: string }): Promise<SupportTicket> {
    const rows = await db.insert(supportTickets).values(ticket).returning();
    return rows[0];
  }

  async addSupportMessage(msg: typeof supportMessages.$inferInsert & { id: string }): Promise<SupportMessage> {
    await db.update(supportTickets).set({ updatedAt: new Date() }).where(eq(supportTickets.id, msg.ticketId));
    const rows = await db.insert(supportMessages).values(msg).returning();
    return rows[0];
  }

  async reopenTicket(ticketId: string): Promise<void> {
    await db.update(supportTickets).set({ status: "open", updatedAt: new Date() }).where(eq(supportTickets.id, ticketId));
  }

  async getFriends(userId: string): Promise<Friend[]> {
    return db.select().from(friends).where(eq(friends.userId, userId)).orderBy(desc(friends.createdAt));
  }

  async addFriend(userId: string, handle: string, name: string): Promise<Friend> {
    const rows = await db.insert(friends).values({ id: randomUUID(), userId, friendHandle: handle, friendName: name })
      .onConflictDoNothing().returning();
    if (rows[0]) return rows[0];
    const existing = await db.select().from(friends)
      .where(and(eq(friends.userId, userId), eq(friends.friendHandle, handle))).limit(1);
    return existing[0];
  }

  async removeFriend(userId: string, handle: string): Promise<void> {
    await db.delete(friends).where(and(eq(friends.userId, userId), eq(friends.friendHandle, handle)));
  }

  async isFriend(userId: string, handle: string): Promise<boolean> {
    const rows = await db.select().from(friends)
      .where(and(eq(friends.userId, userId), eq(friends.friendHandle, handle))).limit(1);
    return rows.length > 0;
  }

  async createAgreementHold(hold: typeof agreementHolds.$inferInsert): Promise<AgreementHold> {
    const rows = await db.insert(agreementHolds).values(hold).onConflictDoUpdate({
      target: agreementHolds.id,
      set: { status: hold.status ?? "held", amount: hold.amount, currency: hold.currency, workerUid: hold.workerUid, creatorUid: hold.creatorUid },
    }).returning();
    return rows[0];
  }

  async getAgreementHold(agreementId: string): Promise<AgreementHold | undefined> {
    const rows = await db.select().from(agreementHolds).where(eq(agreementHolds.id, agreementId)).limit(1);
    return rows[0];
  }

  async releaseAgreementHold(agreementId: string): Promise<void> {
    await db.update(agreementHolds).set({ status: "released", releasedAt: new Date() }).where(eq(agreementHolds.id, agreementId));
  }

  async createSandboxTransfer(data: InsertSandboxTransfer): Promise<SandboxTransfer> {
    const rows = await db.insert(sandboxTransfers).values(data).returning();
    return rows[0];
  }

  async getSandboxTransfers(userId: string): Promise<SandboxTransfer[]> {
    return db.select().from(sandboxTransfers)
      .where(eq(sandboxTransfers.senderId, userId))
      .orderBy(desc(sandboxTransfers.createdAt));
  }

  async createContractInvite(data: InsertContractInvite): Promise<ContractInvite> {
    const rows = await db.insert(contractInvites).values(data).returning();
    return rows[0];
  }

  async getContractInvites(userId: string): Promise<ContractInvite[]> {
    return db.select().from(contractInvites)
      .where(eq(contractInvites.senderId, userId))
      .orderBy(desc(contractInvites.createdAt));
  }
}

export const storage = new PgStorage();
