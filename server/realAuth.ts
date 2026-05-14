import type { Express, Request, Response, NextFunction } from "express";
import { Pool } from "pg";
import crypto from "node:crypto";

/*
  Production-grade auth integrated with the existing Express app.
  - Uses `app_users` (scrypt passwords) + `app_sessions` (cookie tokens)
  - Creates new tables: kyc_records, bank_accounts, audit_logs, otp_codes, file_objects, app_settings
  - Syncs to Drizzle `users` table so existing domain routes (transactions, cards…) work
  - Returns flat user format compatible with the frontend Zustand store
*/

const DATABASE_URL = process.env.DATABASE_URL || "";
export const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || "lysenteprenor@gmail.com").trim().toLowerCase();
const APP_SESSION_COOKIE = "app_session";
const SESSION_DAYS = 30;

if (!DATABASE_URL) { console.error("Missing env: DATABASE_URL"); process.exit(1); }

const db = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

// ─── Types ───────────────────────────────────────────────────────────────────

export type AppUser = {
  id: string;
  email: string;
  role: "user" | "admin";
  displayName: string;
  host: string | null;
  phone: string | null;
  avatarUrl: string | null;
  bio: string | null;
  countryCode: string | null;
};

export type AppRequest = Request & { user?: AppUser | null };

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function normalizeEmail(email?: string | null): string {
  return String(email ?? "").trim().toLowerCase();
}

function normalizeText(value?: string | null): string | null {
  const v = String(value ?? "").trim();
  return v ? v : null;
}

export function normalizeHost(value?: string | null): string | null {
  const v = String(value ?? "").trim().replace(/^@+/, "").toLowerCase();
  return v || null;
}

export function isAdminEmail(email?: string | null): boolean {
  return normalizeEmail(email) === ADMIN_EMAIL;
}

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePassword(password: string): boolean {
  return typeof password === "string" && password.length >= 6;
}

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function hashPassword(password: string, salt?: string): string {
  const finalSalt = salt || crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, finalSalt, 64).toString("hex");
  return `${finalSalt}:${derived}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = String(stored).split(":");
  if (!salt || !hash) return false;
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(derived, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function parseCookies(cookieHeader?: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const chunk of cookieHeader.split(";")) {
    const [rawKey, ...rest] = chunk.split("=");
    const key = rawKey?.trim();
    const value = rest.join("=").trim();
    if (!key) continue;
    out[key] = decodeURIComponent(value);
  }
  return out;
}

function makeSessionToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function makeCookie(token: string): string {
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${APP_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function clearCookie(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${APP_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

function roleFromEmail(email: string): "user" | "admin" {
  return isAdminEmail(email) ? "admin" : "user";
}

function nowPlusDays(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

// ─── DB bootstrap ─────────────────────────────────────────────────────────────

async function bootstrapDatabase() {
  // app_users already exists; ensure new columns are present
  await db.query(`ALTER TABLE app_users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin'))`).catch(() => {});
  await db.query(`ALTER TABLE app_users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE`).catch(() => {});
  await db.query(`ALTER TABLE app_users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE`).catch(() => {});
  await db.query(`ALTER TABLE app_users ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN NOT NULL DEFAULT FALSE`).catch(() => {});
  await db.query(`ALTER TABLE app_users ADD COLUMN IF NOT EXISTS bio TEXT`).catch(() => {});
  await db.query(`ALTER TABLE app_users ADD COLUMN IF NOT EXISTS country_code TEXT`).catch(() => {});

  // app_sessions already exists — compatible

  // KYC
  await db.query(`
    CREATE TABLE IF NOT EXISTS kyc_records (
      user_id UUID PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started','pending','verified','rejected')),
      provider TEXT,
      reference_id TEXT,
      full_name TEXT,
      date_of_birth TEXT,
      document_country TEXT,
      rejection_reason TEXT,
      raw_result JSONB NOT NULL DEFAULT '{}'::jsonb,
      verified_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Bank accounts
  await db.query(`
    CREATE TABLE IF NOT EXISTS bank_accounts (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      account_label TEXT NOT NULL,
      iban_masked TEXT,
      account_number_masked TEXT,
      bank_name TEXT,
      currency TEXT NOT NULL DEFAULT 'USD',
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','blocked')),
      is_primary BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);


  // Audit logs
  await db.query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id UUID PRIMARY KEY,
      actor_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // OTP codes
  await db.query(`
    CREATE TABLE IF NOT EXISTS otp_codes (
      id UUID PRIMARY KEY,
      user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
      channel TEXT NOT NULL CHECK (channel IN ('email','sms')),
      target TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      consumed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // File objects
  await db.query(`
    CREATE TABLE IF NOT EXISTS file_objects (
      id UUID PRIMARY KEY,
      owner_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
      bucket TEXT NOT NULL,
      object_key TEXT NOT NULL,
      original_name TEXT,
      mime_type TEXT,
      size_bytes BIGINT NOT NULL DEFAULT 0,
      visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','protected','public')),
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // App settings
  await db.query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Indexes
  await db.query(`CREATE INDEX IF NOT EXISTS app_users_email_idx ON app_users(email)`).catch(() => {});
  await db.query(`CREATE INDEX IF NOT EXISTS app_users_host_idx ON app_users(host)`).catch(() => {});
  await db.query(`CREATE INDEX IF NOT EXISTS app_sessions_user_idx ON app_sessions(user_id)`).catch(() => {});
  await db.query(`CREATE INDEX IF NOT EXISTS app_sessions_expires_idx ON app_sessions(expires_at)`).catch(() => {});
  await db.query(`CREATE INDEX IF NOT EXISTS bank_accounts_user_idx ON bank_accounts(user_id)`).catch(() => {});
  await db.query(`CREATE INDEX IF NOT EXISTS audit_logs_actor_idx ON audit_logs(actor_user_id)`).catch(() => {});
  await db.query(`CREATE INDEX IF NOT EXISTS otp_target_idx ON otp_codes(target)`).catch(() => {});

  // Ensure admin email has admin role
  await db.query(`
    UPDATE app_users SET role = 'admin', updated_at = NOW() WHERE LOWER(email) = $1
  `, [ADMIN_EMAIL]);

  // Clean stale sessions and OTPs
  await db.query(`DELETE FROM app_sessions WHERE expires_at < NOW()`).catch(() => {});
  await db.query(`DELETE FROM otp_codes WHERE expires_at < NOW() OR consumed_at IS NOT NULL`).catch(() => {});

  // One-time migration: verify all pre-existing users so they are never locked out.
  // Uses app_settings as a migration flag so this never runs again after the first time.
  const migrationFlag = await db.query(
    `SELECT value FROM app_settings WHERE key = 'email_verify_migration_v1' LIMIT 1`
  ).catch(() => ({ rows: [] }));
  if (!migrationFlag.rows[0]) {
    await db.query(
      `UPDATE app_users SET email_verified = TRUE, updated_at = NOW() WHERE email_verified = FALSE`
    ).catch(() => {});
    await db.query(
      `INSERT INTO app_settings (key, value) VALUES ('email_verify_migration_v1', 'true'::jsonb)
       ON CONFLICT (key) DO NOTHING`
    ).catch(() => {});
    console.log("[bootstrap] email_verify_migration_v1: existing users verified (one-time)");
  }

  // Assign handles to existing users who don't have one yet
  await assignMissingHandles();
}

/** Generates a unique handle from an email address (first 3 alpha chars + numeric suffix). */
async function generateHandleFromEmail(email: string): Promise<string> {
  const localPart = email.split("@")[0] ?? "";
  const base = localPart.replace(/[^a-z]/gi, "").toLowerCase().slice(0, 3) || "usr";
  let candidate = base;
  let counter = 2;
  while (true) {
    const existing = await db.query(
      `SELECT id FROM app_users WHERE host = $1 LIMIT 1`,
      [candidate]
    );
    if (!existing.rows[0]) return candidate;
    candidate = `${base}${counter}`;
    counter++;
  }
}

/** One-time migration: assign a handle to every user that doesn't have one yet. */
async function assignMissingHandles(): Promise<void> {
  try {
    const rows = await db.query(
      `SELECT id, email FROM app_users WHERE host IS NULL OR host = '' ORDER BY created_at ASC`
    );
    for (const row of rows.rows) {
      const handle = await generateHandleFromEmail(row.email);
      await db.query(
        `UPDATE app_users SET host = $1, updated_at = NOW() WHERE id = $2`,
        [handle, row.id]
      );
    }
    if (rows.rows.length > 0) {
      console.log(`[auth] Assigned handles to ${rows.rows.length} user(s) without a handle.`);
    }
  } catch (err) {
    console.error("[auth] assignMissingHandles error:", err);
  }
}

// ─── Audit log ───────────────────────────────────────────────────────────────

async function logAudit(
  actorUserId: string | null,
  action: string,
  targetType: string,
  targetId?: string | null,
  metadata?: Record<string, any>
) {
  try {
    await db.query(
      `INSERT INTO audit_logs (id, actor_user_id, action, target_type, target_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [crypto.randomUUID(), actorUserId, action, targetType, targetId ?? null, JSON.stringify(metadata ?? {})]
    );
  } catch (err) {
    console.error("audit log error:", err);
  }
}

// ─── User queries ─────────────────────────────────────────────────────────────

async function findAppUserByEmail(email: string) {
  const r = await db.query(
    `SELECT id, email, password_hash, role, is_active, display_name, host, phone, avatar_url, bio, country_code
     FROM app_users WHERE LOWER(email) = $1 LIMIT 1`,
    [normalizeEmail(email)]
  );
  return r.rows[0] || null;
}

async function findAppUserById(userId: string) {
  const r = await db.query(
    `SELECT id, email, role, is_active, email_verified, phone_verified, display_name, host, phone, avatar_url, bio, country_code
     FROM app_users WHERE id = $1 LIMIT 1`,
    [userId]
  );
  return r.rows[0] || null;
}

function mapAppUser(row: any): AppUser {
  return {
    id: row.id,
    email: row.email,
    role: isAdminEmail(row.email) ? "admin" : (row.role ?? "user"),
    displayName: row.display_name ?? "Użytkownik",
    host: row.host ?? null,
    phone: row.phone ?? null,
    avatarUrl: row.avatar_url ?? null,
    bio: row.bio ?? null,
    countryCode: row.country_code ?? null,
  };
}

/** Flat format the frontend Zustand store (dbUserToAppUser) expects */
function toFrontendUser(row: any) {
  const host = row.host ?? null;
  const handle = host ? `@${host}` : null;
  return {
    id: row.id,
    email: row.email,
    name: row.display_name ?? "Użytkownik",
    handle,
    phone: row.phone ?? null,
    avatar: row.avatar_url ?? null,
    balance: 0,
    pushNotifications: true,
    emailDigest: false,
    biometricLogin: true,
    hideBalances: false,
    appearance: "obsidian-gold",
    role: isAdminEmail(row.email) ? "admin" : (row.role ?? "user"),
    isAdmin: isAdminEmail(row.email),
  };
}


// ─── Session management ───────────────────────────────────────────────────────

async function createSession(userId: string): Promise<string> {
  const rawToken = makeSessionToken();
  await db.query(
    `INSERT INTO app_sessions (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)`,
    [crypto.randomUUID(), userId, sha256(rawToken), nowPlusDays(SESSION_DAYS)]
  );
  return rawToken;
}

async function deleteSession(rawToken?: string | null) {
  if (!rawToken) return;
  await db.query(`DELETE FROM app_sessions WHERE token_hash = $1`, [sha256(rawToken)]);
}

// ─── Middleware ───────────────────────────────────────────────────────────────

export async function authMiddleware(req: AppRequest, _res: Response, next: NextFunction) {
  try {
    const rawToken = parseCookies(req.headers.cookie)[APP_SESSION_COOKIE];
    if (!rawToken) { req.user = null; return next(); }

    const r = await db.query(
      `SELECT u.id, u.email, u.role, u.is_active, u.display_name, u.host, u.phone, u.avatar_url, u.bio, u.country_code
       FROM app_sessions s
       JOIN app_users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > NOW() AND u.is_active = TRUE
       LIMIT 1`,
      [sha256(rawToken)]
    );

    req.user = r.rows[0] ? mapAppUser(r.rows[0]) : null;
    return next();
  } catch (err) {
    console.error("authMiddleware error:", err);
    req.user = null;
    return next();
  }
}

export function requireAuth(req: AppRequest, res: Response, next: NextFunction) {
  if (!req.user?.id) return res.status(401).json({ error: "Brak autoryzacji." });
  return next();
}

export function requireAdmin(req: AppRequest, res: Response, next: NextFunction) {
  if (!req.user?.id) return res.status(401).json({ error: "Brak autoryzacji." });
  if (req.user.role !== "admin" && !isAdminEmail(req.user.email)) {
    return res.status(403).json({ error: "Brak dostępu do panelu admina." });
  }
  return next();
}


// ─── Main export ──────────────────────────────────────────────────────────────

export async function installRealAuth(app: Express) {
  await bootstrapDatabase();

  // ── Health ──────────────────────────────────────────────────────────────────
  app.get("/api/health", async (_req, res) => {
    const r = await db.query("SELECT NOW() AS now");
    res.json({ ok: true, db: true, time: r.rows[0]?.now ?? null });
  });

  // ── OTP ─────────────────────────────────────────────────────────────────────
  app.post("/api/otp/send", requireAuth as any, async (req: AppRequest, res: Response) => {
    try {
      const channel = String(req.body?.channel ?? "").trim();
      const target = String(req.body?.target ?? "").trim();
      if (!["email", "sms"].includes(channel) || !target) {
        return res.status(400).json({ error: "Nieprawidłowe dane OTP." });
      }
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      await db.query(
        `INSERT INTO otp_codes (id, user_id, channel, target, code_hash, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [crypto.randomUUID(), req.user!.id, channel, target, sha256(code), expiresAt]
      );
      await logAudit(req.user!.id, "otp_send", "otp", null, { channel, target });
      return res.json({ ok: true, expiresAt, ...(process.env.NODE_ENV !== "production" ? { devCode: code } : {}) });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || "Nie udało się wysłać OTP." });
    }
  });

  app.post("/api/otp/verify", requireAuth as any, async (req: AppRequest, res: Response) => {
    try {
      const channel = String(req.body?.channel ?? "").trim();
      const target = String(req.body?.target ?? "").trim();
      const code = String(req.body?.code ?? "").trim();
      if (!["email", "sms"].includes(channel) || !target || !code) {
        return res.status(400).json({ error: "Nieprawidłowe dane OTP." });
      }
      const found = await db.query(
        `SELECT id FROM otp_codes WHERE user_id=$1 AND channel=$2 AND target=$3 AND code_hash=$4
         AND consumed_at IS NULL AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1`,
        [req.user!.id, channel, target, sha256(code)]
      );
      if (!found.rows[0]) return res.status(400).json({ error: "Kod OTP jest nieprawidłowy lub wygasł." });
      await db.query(`UPDATE otp_codes SET consumed_at=NOW() WHERE id=$1`, [found.rows[0].id]);
      if (channel === "email" && normalizeEmail(target) === normalizeEmail(req.user!.email)) {
        await db.query(`UPDATE app_users SET email_verified=TRUE, updated_at=NOW() WHERE id=$1`, [req.user!.id]);
      }
      if (channel === "sms") {
        await db.query(`UPDATE app_users SET phone_verified=TRUE, updated_at=NOW() WHERE id=$1`, [req.user!.id]);
      }
      await logAudit(req.user!.id, "otp_verify", "otp", found.rows[0].id, { channel, target });
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || "Nie udało się zweryfikować OTP." });
    }
  });

  // ── KYC ─────────────────────────────────────────────────────────────────────
  app.get("/api/kyc/me", requireAuth as any, async (req: AppRequest, res: Response) => {
    try {
      const r = await db.query(`SELECT * FROM kyc_records WHERE user_id=$1 LIMIT 1`, [req.user!.id]);
      return res.json({ item: r.rows[0] ?? null });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || "Błąd KYC." });
    }
  });

  app.post("/api/kyc/start", requireAuth as any, async (req: AppRequest, res: Response) => {
    try {
      const provider = normalizeText(req.body?.provider) || "manual";
      const referenceId = normalizeText(req.body?.referenceId) || crypto.randomUUID();
      const fullName = normalizeText(req.body?.fullName);
      const dateOfBirth = normalizeText(req.body?.dateOfBirth);
      const documentCountry = normalizeText(req.body?.documentCountry);
      await db.query(`
        INSERT INTO kyc_records (user_id, status, provider, reference_id, full_name, date_of_birth, document_country, updated_at)
        VALUES ($1,'pending',$2,$3,$4,$5,$6,NOW())
        ON CONFLICT (user_id) DO UPDATE SET
          status='pending', provider=EXCLUDED.provider, reference_id=EXCLUDED.reference_id,
          full_name=EXCLUDED.full_name, date_of_birth=EXCLUDED.date_of_birth,
          document_country=EXCLUDED.document_country, updated_at=NOW()`,
        [req.user!.id, provider, referenceId, fullName, dateOfBirth, documentCountry]
      );
      await logAudit(req.user!.id, "kyc_start", "kyc", req.user!.id, { provider });
      return res.json({ ok: true, status: "pending" });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || "Nie udało się uruchomić KYC." });
    }
  });

  // ── Bank accounts ────────────────────────────────────────────────────────────
  app.get("/api/bank-accounts", requireAuth as any, async (req: AppRequest, res: Response) => {
    try {
      const r = await db.query(
        `SELECT * FROM bank_accounts WHERE user_id=$1 ORDER BY is_primary DESC, created_at DESC`,
        [req.user!.id]
      );
      return res.json({ items: r.rows, total: r.rows.length });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || "Błąd kont bankowych." });
    }
  });

  app.post("/api/bank-accounts", requireAuth as any, async (req: AppRequest, res: Response) => {
    try {
      const accountLabel = normalizeText(req.body?.accountLabel) || "Konto";
      const bankName = normalizeText(req.body?.bankName);
      const currency = normalizeText(req.body?.currency) || "PLN";
      const isPrimary = Boolean(req.body?.isPrimary);

      if (isPrimary) {
        await db.query(`UPDATE bank_accounts SET is_primary=FALSE, updated_at=NOW() WHERE user_id=$1`, [req.user!.id]);
      }

      const recordId = crypto.randomUUID();
      await db.query(`
        INSERT INTO bank_accounts (id, user_id, account_label, bank_name, currency, status, is_primary)
        VALUES ($1,$2,$3,$4,$5,'pending',$6)`,
        [recordId, req.user!.id, accountLabel, bankName, currency, isPrimary]
      );

      await logAudit(req.user!.id, "bank_account_create", "bank_account", recordId, { accountLabel, currency });
      const created = await db.query(`SELECT * FROM bank_accounts WHERE id=$1`, [recordId]);
      return res.status(201).json({ ok: true, item: created.rows[0] });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || "Błąd dodawania konta." });
    }
  });


  // ── Files ────────────────────────────────────────────────────────────────────
  app.post("/api/files/meta", requireAuth as any, async (req: AppRequest, res: Response) => {
    try {
      const bucket = normalizeText(req.body?.bucket) || "app";
      const objectKey = normalizeText(req.body?.objectKey);
      if (!objectKey) return res.status(400).json({ error: "Brakuje objectKey." });
      const fileId = crypto.randomUUID();
      await db.query(`
        INSERT INTO file_objects (id, owner_user_id, bucket, object_key, original_name, mime_type, size_bytes, visibility, metadata)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [fileId, req.user!.id, bucket, objectKey,
         normalizeText(req.body?.originalName), normalizeText(req.body?.mimeType),
         Number(req.body?.sizeBytes || 0),
         ["private","protected","public"].includes(String(req.body?.visibility)) ? String(req.body?.visibility) : "private",
         JSON.stringify(req.body?.metadata ?? {})]
      );
      await logAudit(req.user!.id, "file_meta_create", "file", fileId, { bucket, objectKey });
      const created = await db.query(`SELECT * FROM file_objects WHERE id=$1`, [fileId]);
      return res.status(201).json({ ok: true, item: created.rows[0] });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || "Błąd pliku." });
    }
  });

  app.get("/api/files/meta", requireAuth as any, async (req: AppRequest, res: Response) => {
    try {
      const r = await db.query(
        `SELECT * FROM file_objects WHERE owner_user_id=$1 ORDER BY created_at DESC`,
        [req.user!.id]
      );
      return res.json({ items: r.rows, total: r.rows.length });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || "Błąd plików." });
    }
  });

  // ── Admin ────────────────────────────────────────────────────────────────────
  app.get("/api/admin/summary", requireAdmin as any, async (_req, res: Response) => {
    try {
      const [usersCount, kycCount, pendingKyc, filesCount] = await Promise.all([
        db.query(`SELECT COUNT(*)::int AS count FROM app_users`),
        db.query(`SELECT COUNT(*)::int AS count FROM kyc_records`),
        db.query(`SELECT COUNT(*)::int AS count FROM kyc_records WHERE status='pending'`),
        db.query(`SELECT COUNT(*)::int AS count FROM file_objects`),
      ]);
      return res.json({
        users: usersCount.rows[0]?.count ?? 0,
        kyc: kycCount.rows[0]?.count ?? 0,
        pendingKyc: pendingKyc.rows[0]?.count ?? 0,
        files: filesCount.rows[0]?.count ?? 0,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || "Błąd podsumowania." });
    }
  });

  app.get("/api/admin/users", requireAdmin as any, async (req: AppRequest, res: Response) => {
    try {
      const q = String(req.query.q ?? "").trim().toLowerCase();
      const r = await db.query(
        `SELECT id, email, role, is_active, email_verified, phone_verified, created_at, updated_at,
                display_name, host, phone, avatar_url, bio, country_code
         FROM app_users ORDER BY created_at DESC`
      );
      const filtered = q
        ? r.rows.filter(row => [row.email, row.display_name, row.host, row.phone].filter(Boolean).some(v => String(v).toLowerCase().includes(q)))
        : r.rows;
      return res.json({
        items: filtered.map(row => ({
          id: row.id, email: row.email,
          role: isAdminEmail(row.email) ? "admin" : row.role,
          isActive: row.is_active, emailVerified: row.email_verified, phoneVerified: row.phone_verified,
          createdAt: row.created_at, updatedAt: row.updated_at,
          displayName: row.display_name, host: row.host, phone: row.phone,
          avatarUrl: row.avatar_url, bio: row.bio, countryCode: row.country_code,
        })),
        total: filtered.length,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || "Błąd listy użytkowników." });
    }
  });

  app.get("/api/admin/kyc", requireAdmin as any, async (_req, res: Response) => {
    try {
      const r = await db.query(
        `SELECT k.*, u.email, u.display_name FROM kyc_records k
         JOIN app_users u ON u.id = k.user_id ORDER BY k.updated_at DESC`
      );
      return res.json({ items: r.rows, total: r.rows.length });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || "Błąd KYC." });
    }
  });

  app.put("/api/admin/kyc/:userId", requireAdmin as any, async (req: AppRequest, res: Response) => {
    try {
      const status = String(req.body?.status ?? "").trim();
      const rejectionReason = normalizeText(req.body?.rejectionReason);
      if (!["not_started","pending","verified","rejected"].includes(status)) {
        return res.status(400).json({ error: "Nieprawidłowy status KYC." });
      }
      await db.query(`
        INSERT INTO kyc_records (user_id, status, rejection_reason, raw_result, verified_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,NOW())
        ON CONFLICT (user_id) DO UPDATE SET
          status=EXCLUDED.status, rejection_reason=EXCLUDED.rejection_reason,
          raw_result=EXCLUDED.raw_result, verified_at=EXCLUDED.verified_at, updated_at=NOW()`,
        [req.params.userId, status, rejectionReason,
         JSON.stringify(req.body?.rawResult ?? {}), status === "verified" ? new Date() : null]
      );
      await logAudit(String(req.user!.id), "kyc_update", "kyc", String(req.params.userId), { status });
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || "Błąd KYC." });
    }
  });

  app.post("/api/admin/notifications/send", requireAdmin as any, async (req: AppRequest, res: Response) => {
    try {
      const userId = String(req.body?.userId ?? "").trim();
      const title = normalizeText(req.body?.title) || "Powiadomienie";
      const message = normalizeText(req.body?.body || req.body?.message) || "";
      if (!userId) return res.status(400).json({ error: "Brakuje userId." });

      // Insert into the existing notifications table (varchar-id, Drizzle schema)
      const id = crypto.randomUUID();
      await db.query(
        `INSERT INTO notifications (id, user_id, type, title, message, read)
         VALUES ($1,$2,'system',$3,$4,FALSE)`,
        [id, userId, title, message]
      );
      await logAudit(req.user!.id, "notification_send", "notification", id, { userId });
      return res.status(201).json({ ok: true, id });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || "Nie udało się wysłać powiadomienia." });
    }
  });

  app.get("/api/admin/audit-logs", requireAdmin as any, async (req: AppRequest, res: Response) => {
    try {
      const limit = Math.min(200, Math.max(1, Number(req.query.limit || 100)));
      const r = await db.query(`SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT $1`, [limit]);
      return res.json({ items: r.rows, total: r.rows.length });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || "Błąd logów." });
    }
  });

  // /api/users/directory — admin user directory for frontend UserDirectory page
  app.get("/api/users/directory", requireAdmin as any, async (req: AppRequest, res: Response) => {
    try {
      const q = String(req.query.q ?? "").trim().toLowerCase();
      const r = await db.query(
        `SELECT id, email, display_name, host, phone, avatar_url, created_at
         FROM app_users ORDER BY created_at DESC`
      );
      const filtered = q
        ? r.rows.filter(row => [row.email, row.display_name, row.host].filter(Boolean).some(v => String(v).toLowerCase().includes(q)))
        : r.rows;
      return res.json(filtered.map(row => ({
        id: row.id, email: row.email, name: row.display_name,
        handle: row.host ? `@${row.host}` : null,
        phone: row.phone, avatar: row.avatar_url, createdAt: row.created_at,
      })));
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || "Błąd katalogu." });
    }
  });
}
