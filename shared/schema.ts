import { sql } from "drizzle-orm";
import { pgTable, text, varchar, uuid, real, boolean, timestamp, pgEnum, uniqueIndex, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const transactionTypeEnum = pgEnum("transaction_type", ["send", "receive", "topup", "payment"]);
export const transactionStatusEnum = pgEnum("transaction_status", ["pending", "completed", "failed", "accepted", "refunded", "disputed", "cancelled"]);
export const notificationTypeEnum = pgEnum("notification_type", ["info", "alert", "success", "transfer"]);
export const notificationCategoryEnum = pgEnum("notification_category", ["message", "payment", "contract", "system", "security"]);
export const notificationPriorityEnum = pgEnum("notification_priority", ["low", "normal", "high", "critical"]);
export const ticketStatusEnum = pgEnum("ticket_status", ["open", "pending", "resolved", "closed"]);
export const appearanceEnum = pgEnum("appearance", ["obsidian-gold", "arctic-platinum", "graphite-emerald"]);

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  handle: text("handle").notNull().unique(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  phone: text("phone"),
  address: text("address"),
  balance: real("balance").notNull().default(0),
  pushNotifications: boolean("push_notifications").notNull().default(true),
  emailDigest: boolean("email_digest").notNull().default(false),
  biometricLogin: boolean("biometric_login").notNull().default(true),
  hideBalances: boolean("hide_balances").notNull().default(false),
  appearance: appearanceEnum("appearance").notNull().default("obsidian-gold"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  lastActiveAt: timestamp("last_active_at"),
});

export const transactions = pgTable("transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  type: transactionTypeEnum("type").notNull(),
  status: transactionStatusEnum("status").notNull().default("completed"),
  amount: real("amount").notNull(),
  title: text("title").notNull(),
  subtitle: text("subtitle").notNull(),
  category: text("category"),
  date: timestamp("date").notNull().default(sql`now()`),
  contractId: text("contract_id"),
  provider: text("provider"),
  providerPaymentId: text("provider_payment_id"),
  receiptUrl: text("receipt_url"),
  failureReason: text("failure_reason"),
  acceptedAt: timestamp("accepted_at"),
});

export const transactionStatusHistory = pgTable("transaction_status_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  transactionId: varchar("transaction_id").notNull().references(() => transactions.id),
  fromStatus: transactionStatusEnum("from_status"),
  toStatus: transactionStatusEnum("to_status").notNull(),
  changedBy: text("changed_by").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const devicePushTokens = pgTable("device_push_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: text("user_agent"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  lastUsedAt: timestamp("last_used_at"),
}, (t) => [uniqueIndex("device_push_tokens_endpoint_idx").on(t.endpoint)]);

export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  type: notificationTypeEnum("type").notNull(),
  category: notificationCategoryEnum("category").notNull().default("system"),
  priority: notificationPriorityEnum("priority").notNull().default("normal"),
  title: text("title").notNull(),
  message: text("message").notNull(),
  read: boolean("read").notNull().default(false),
  route: text("route"),
  dedupeKey: text("dedupe_key"),
  groupKey: text("group_key"),
  date: timestamp("date").notNull().default(sql`now()`),
  relatedId: text("related_id"),
  relatedType: text("related_type"),
  isDelivered: boolean("is_delivered").notNull().default(false),
  deliveredAt: timestamp("delivered_at"),
  readAt: timestamp("read_at"),
  expiresAt: timestamp("expires_at"),
});

export const notificationPreferences = pgTable("notification_preferences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  category: notificationCategoryEnum("category").notNull(),
  inApp: boolean("in_app").notNull().default(true),
  push: boolean("push").notNull().default(true),
  quietStart: integer("quiet_start"),
  quietEnd: integer("quiet_end"),
  importantOnlyInQuiet: boolean("important_only_in_quiet").notNull().default(false),
  dailySummary: boolean("daily_summary").notNull().default(false),
}, (t) => [uniqueIndex("notif_prefs_user_category_idx").on(t.userId, t.category)]);

export const conversations = pgTable("conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  contactName: text("contact_name").notNull(),
  contactHandle: text("contact_handle").notNull(),
  unreadCount: real("unread_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull().references(() => conversations.id),
  senderId: text("sender_id").notNull(),
  text: text("text").notNull(),
  timestamp: timestamp("timestamp").notNull().default(sql`now()`),
  isTransfer: boolean("is_transfer").notNull().default(false),
  transferAmount: real("transfer_amount"),
  transferStatus: text("transfer_status"),
  isAgreement: boolean("is_agreement").notNull().default(false),
  agreementId: varchar("agreement_id"),
  agreementTitle: text("agreement_title"),
  agreementAmount: real("agreement_amount"),
  agreementCurrency: varchar("agreement_currency", { length: 10 }),
});

export const agreementHolds = pgTable("agreement_holds", {
  id: varchar("id").primaryKey(),
  creatorUid: varchar("creator_uid").notNull(),
  workerUid: varchar("worker_uid").notNull(),
  amount: real("amount").notNull(),
  currency: varchar("currency", { length: 10 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("held"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  releasedAt: timestamp("released_at"),
});

export const supportTickets = pgTable("support_tickets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  title: text("title").notNull(),
  status: ticketStatusEnum("status").notNull().default("open"),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

export const supportMessages = pgTable("support_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ticketId: varchar("ticket_id").notNull().references(() => supportTickets.id),
  senderId: text("sender_id").notNull(),
  text: text("text").notNull(),
  timestamp: timestamp("timestamp").notNull().default(sql`now()`),
});

export const friends = pgTable("friends", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  friendHandle: text("friend_handle").notNull(),
  friendName: text("friend_name").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (t) => [uniqueIndex("friends_user_handle_idx").on(t.userId, t.friendHandle)]);

export const dmBlocks = pgTable("dm_blocks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  blockerId: uuid("blocker_id").notNull(),
  blockedId: uuid("blocked_id").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (t) => [uniqueIndex("dm_blocks_pair_idx").on(t.blockerId, t.blockedId)]);

export const dmReports = pgTable("dm_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  reporterId: uuid("reporter_id").notNull(),
  reportedId: uuid("reported_id").notNull(),
  reason: text("reason").notNull(),
  details: text("details"),
  status: varchar("status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const insertDmBlockSchema = createInsertSchema(dmBlocks).omit({ id: true, createdAt: true });
export const insertDmReportSchema = createInsertSchema(dmReports).omit({ id: true, createdAt: true });

export type DmBlock = typeof dmBlocks.$inferSelect;
export type DmReport = typeof dmReports.$inferSelect;

// Note: dm_attachments and dm_message_status are managed by raw SQL in installMessagesFix.ts
// because they reference raw-SQL-managed tables (dm_messages, app_users).
// Type definitions only (no Drizzle table — avoids FK resolution issues):

export type DmAttachment = {
  id: string;
  messageId: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  createdAt: Date;
};

export type DmMessageStatus = {
  messageId: string;
  userId: string;
  status: "delivered" | "read";
  updatedAt: Date;
};

// ── Sandbox Transfers ──────────────────────────────────────────────────────────
export const sandboxTransferDestinationEnum = pgEnum("sandbox_transfer_destination", ["BANK_ACCOUNT", "CARD", "PHONE", "HOST"]);
export const sandboxTransferStatusEnum = pgEnum("sandbox_transfer_status", ["PENDING", "COMPLETED_SANDBOX", "FAILED"]);

export const sandboxTransfers = pgTable("sandbox_transfers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  senderId: varchar("sender_id").notNull(),
  recipientName: text("recipient_name").notNull(),
  recipientIdentifier: text("recipient_identifier").notNull(),
  destinationType: sandboxTransferDestinationEnum("destination_type").notNull(),
  amount: real("amount").notNull(),
  currency: varchar("currency", { length: 10 }).notNull(),
  title: text("title").notNull(),
  message: text("message"),
  maskedDestination: text("masked_destination").notNull(),
  status: sandboxTransferStatusEnum("status").notNull().default("COMPLETED_SANDBOX"),
  provider: text("provider").notNull().default("SANDBOX"),
  reference: text("reference").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// ── Contract Invites ───────────────────────────────────────────────────────────
export const contractTypeEnum = pgEnum("contract_type_invite", ["SERVICE", "SALE", "DEPOSIT", "RENOVATION", "CUSTOM"]);
export const contractInviteStatusEnum = pgEnum("contract_invite_status", ["SENT", "ACCEPTED", "DECLINED", "CANCELLED"]);

export const contractInvites = pgTable("contract_invites", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  senderId: varchar("sender_id").notNull(),
  recipientIdentifier: text("recipient_identifier").notNull(),
  title: text("title").notNull(),
  contractType: contractTypeEnum("contract_type").notNull(),
  amount: real("amount").notNull(),
  currency: varchar("currency", { length: 10 }).notNull(),
  deadline: text("deadline").notNull(),
  description: text("description").notNull(),
  status: contractInviteStatusEnum("status").notNull().default("SENT"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const insertSandboxTransferSchema = createInsertSchema(sandboxTransfers).omit({ id: true, createdAt: true });
export const insertContractInviteSchema = createInsertSchema(contractInvites).omit({ id: true, createdAt: true });

export type SandboxTransfer = typeof sandboxTransfers.$inferSelect;
export type InsertSandboxTransfer = z.infer<typeof insertSandboxTransferSchema>;
export type ContractInvite = typeof contractInvites.$inferSelect;
export type InsertContractInvite = z.infer<typeof insertContractInviteSchema>;

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertTransactionSchema = createInsertSchema(transactions).omit({ id: true });
export const insertTransactionStatusHistorySchema = createInsertSchema(transactionStatusHistory).omit({ id: true, createdAt: true });
export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true, date: true });
export const insertNotificationPreferenceSchema = createInsertSchema(notificationPreferences).omit({ id: true });
export const insertConversationSchema = createInsertSchema(conversations).omit({ id: true, createdAt: true });
export const insertMessageSchema = createInsertSchema(messages).omit({ id: true, timestamp: true });
export const insertSupportTicketSchema = createInsertSchema(supportTickets).omit({ id: true, updatedAt: true });
export const insertSupportMessageSchema = createInsertSchema(supportMessages).omit({ id: true, timestamp: true });
export const insertFriendSchema = createInsertSchema(friends).omit({ id: true, createdAt: true });
export const insertAgreementHoldSchema = createInsertSchema(agreementHolds).omit({ createdAt: true, releasedAt: true });
export const insertDevicePushTokenSchema = createInsertSchema(devicePushTokens).omit({ id: true, createdAt: true, lastUsedAt: true });

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type TransactionStatusHistory = typeof transactionStatusHistory.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type NotificationPreference = typeof notificationPreferences.$inferSelect;
export type InsertNotificationPreference = z.infer<typeof insertNotificationPreferenceSchema>;
export type DevicePushToken = typeof devicePushTokens.$inferSelect;
export type InsertDevicePushToken = z.infer<typeof insertDevicePushTokenSchema>;
export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type SupportTicket = typeof supportTickets.$inferSelect;
export type SupportMessage = typeof supportMessages.$inferSelect;
export type Friend = typeof friends.$inferSelect;
export type AgreementHold = typeof agreementHolds.$inferSelect;
export type InsertAgreementHold = z.infer<typeof insertAgreementHoldSchema>;
