import type { Express, NextFunction, Request, Response } from "express";
import { Router } from "express";
import { Pool } from "pg";
import crypto from "node:crypto";

/*
JAK UŻYĆ:
1. Zapisz ten plik jako: server/replitAuthFix.ts

2. W głównym pliku backendu dodaj:
   import { installAuthFix } from "./replitAuthFix";

3. Jeśli masz już istniejący pool do Postgresa, podłącz tak:
   await installAuthFix(app, pool);

   Jeśli NIE masz gotowego poola:
   await installAuthFix(app);

4. Ten patch:
   - naprawia rejestrację
   - zapisuje userów WYŁĄCZNIE do app_users
   - tworzy sesję
   - daje admin access tylko dla ADMIN_EMAIL
   - daje listę userów tylko adminowi
   - zwraca PRAWDZIWY komunikat błędu do frontu
*/

const DEFAULT_ADMIN_EMAIL = "lysenteprenor@gmail.com";
const SESSION_COOKIE = "app_session";
const SESSION_DAYS = 30;

type Role = "user" | "admin";

type AppUser = {
  id: string;
  email: string;
  role: Role;
  isActive: boolean;
  emailVerified: boolean;
  phoneVerified: boolean;
  displayName: string;
  host: string | null;
  phone: string | null;
  avatarUrl: string | null;
  bio: string | null;
  countryCode: string | null;
};

type AppRequest = Request & {
  user?: AppUser | null;
};

function envAdminEmail() {
  return String(process.env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL)
    .trim()
    .toLowerCase();
}

function normalizeEmail(email?: string | null): string {
  return String(email ?? "").trim().toLowerCase();
}

function normalizeText(value?: string | null): string | null {
  const v = String(value ?? "").trim();
  return v ? v : null;
}

function normalizeHost(value?: string | null): string | null {
  const v = String(value ?? "").trim().replace(/^@+/, "").toLowerCase();
  return v || null;
}

/** Generates a unique handle from an email address.
 *  Takes the first 3 letters of the local part (before @), all lowercase,
 *  letters only. If the handle is taken, appends an incrementing number.
 *  Examples: piotrparafiniuk18@gmail.com → pio, dag, lys, pio2, pio3…
 */
async function generateHandleFromEmail(
  email: string,
  queryFn: (sql: string, params: any[]) => Promise<{ rows: any[] }>
): Promise<string> {
  const localPart = email.split("@")[0] ?? "";
  const base = localPart.replace(/[^a-z]/gi, "").toLowerCase().slice(0, 3) || "usr";
  let candidate = base;
  let counter = 2;
  while (true) {
    const existing = await queryFn(
      `SELECT id FROM app_users WHERE host = $1 LIMIT 1`,
      [candidate]
    );
    if (!existing.rows[0]) return candidate;
    candidate = `${base}${counter}`;
    counter++;
  }
}

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePassword(password: string): boolean {
  return typeof password === "string" && password.length >= 8;
}

function isAdminEmail(email?: string | null): boolean {
  return normalizeEmail(email) === envAdminEmail();
}

function roleFromEmail(email: string): Role {
  return isAdminEmail(email) ? "admin" : "user";
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
  return `${SESSION_COOKIE}=${encodeURIComponent(
    token
  )}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function clearCookie(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

function futureDate(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function futureMinutes(minutes: number) {
  return new Date(Date.now() + minutes * 60 * 1000);
}

async function sendPasswordResetEmail(to: string, code: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "onboarding@resend.dev";

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;background:#0a0a0a;color:#fff;padding:32px;border-radius:16px;">
      <div style="text-align:center;margin-bottom:24px;">
        <div style="display:inline-block;background:#1a1a1a;border:1px solid #333;border-radius:12px;padding:12px 24px;">
          <span style="font-size:20px;font-weight:700;letter-spacing:2px;color:#c9a84c;">FINLYS</span>
        </div>
      </div>
      <h2 style="margin:0 0 8px;font-size:22px;color:#fff;">Resetowanie hasła</h2>
      <p style="color:#888;margin:0 0 24px;">Otrzymaliśmy prośbę o reset hasła do Twojego konta.</p>
      <div style="background:#1a1a1a;border:1px solid #333;border-radius:12px;padding:24px;text-align:center;margin:0 0 24px;">
        <p style="color:#888;font-size:13px;margin:0 0 8px;text-transform:uppercase;letter-spacing:1px;">Kod weryfikacyjny (15 min)</p>
        <span style="font-size:40px;font-weight:700;letter-spacing:10px;color:#c9a84c;">${code}</span>
      </div>
      <p style="color:#666;font-size:13px;margin:0;">Jeśli to nie Ty wysłałeś/aś tę prośbę, zignoruj tę wiadomość. Kod wygasa po 15 minutach.</p>
    </div>
  `;

  if (!apiKey) {
    console.log("[forgot-password] RESEND_API_KEY missing — code preview:", code);
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [to], subject: "Finlys — kod resetowania hasła", html }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("[forgot-password] Resend error:", text);
    throw new Error("Nie udało się wysłać e-maila z kodem.");
  }
}

async function sendVerificationEmail(to: string, code: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "onboarding@resend.dev";

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;background:#0a0a0a;color:#fff;padding:32px;border-radius:16px;">
      <div style="text-align:center;margin-bottom:24px;">
        <div style="display:inline-block;background:#1a1a1a;border:1px solid #333;border-radius:12px;padding:12px 24px;">
          <span style="font-size:20px;font-weight:700;letter-spacing:2px;color:#c9a84c;">FINLYS</span>
        </div>
      </div>
      <h2 style="margin:0 0 8px;font-size:22px;color:#fff;">Zweryfikuj swój e-mail</h2>
      <p style="color:#888;margin:0 0 24px;">Aby dokończyć rejestrację, wpisz poniższy kod weryfikacyjny w aplikacji.</p>
      <div style="background:#1a1a1a;border:1px solid #333;border-radius:12px;padding:24px;text-align:center;margin:0 0 24px;">
        <p style="color:#888;font-size:13px;margin:0 0 8px;text-transform:uppercase;letter-spacing:1px;">Kod weryfikacyjny (15 min)</p>
        <span style="font-size:40px;font-weight:700;letter-spacing:10px;color:#c9a84c;">${code}</span>
      </div>
      <p style="color:#666;font-size:13px;margin:0;">Jeśli to nie Ty zakładałeś/aś konto Finlys, zignoruj tę wiadomość. Kod wygasa po 15 minutach.</p>
    </div>
  `;

  if (!apiKey) {
    console.log("[verify-email] RESEND_API_KEY missing — code preview:", code);
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [to], subject: "Finlys — zweryfikuj swój e-mail", html }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("[verify-email] Resend error:", text);
    throw new Error("Nie udało się wysłać e-maila weryfikacyjnego.");
  }
}

async function sendEmailVerificationOTP(pool: Pool, userId: string, email: string): Promise<string> {
  const isDev = process.env.NODE_ENV !== "production";
  const code = isDev ? "123456" : String(Math.floor(100000 + Math.random() * 900000));
  await pool.query(
    `DELETE FROM otp_codes WHERE user_id = $1 AND channel = 'email' AND target = $2 AND consumed_at IS NULL`,
    [userId, email]
  );
  await pool.query(
    `INSERT INTO otp_codes (id, user_id, channel, target, code_hash, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [crypto.randomUUID(), userId, "email", email, sha256(code), futureMinutes(15)]
  );
  return code;
}

function mapUser(row: any): AppUser {
  return {
    id: row.id,
    email: row.email,
    role: isAdminEmail(row.email) ? "admin" : row.role,
    isActive: Boolean(row.is_active),
    emailVerified: Boolean(row.email_verified),
    phoneVerified: Boolean(row.phone_verified),
    displayName: row.display_name || "Użytkownik",
    host: row.host ?? null,
    phone: row.phone ?? null,
    avatarUrl: row.avatar_url ?? null,
    bio: row.bio ?? null,
    countryCode: row.country_code ?? null,
  };
}

async function ensureSchema(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_users (
      id UUID PRIMARY KEY,
      email TEXT UNIQUE,
      password_hash TEXT,
      role TEXT NOT NULL DEFAULT 'user',
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      email_verified BOOLEAN NOT NULL DEFAULT FALSE,
      phone_verified BOOLEAN NOT NULL DEFAULT FALSE,
      display_name TEXT NOT NULL DEFAULT 'Użytkownik',
      host TEXT UNIQUE,
      phone TEXT,
      avatar_url TEXT,
      bio TEXT,
      country_code TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE app_users ADD COLUMN IF NOT EXISTS email TEXT;
    ALTER TABLE app_users ADD COLUMN IF NOT EXISTS password_hash TEXT;
    ALTER TABLE app_users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';
    ALTER TABLE app_users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE app_users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE app_users ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE app_users ADD COLUMN IF NOT EXISTS display_name TEXT NOT NULL DEFAULT 'Użytkownik';
    ALTER TABLE app_users ADD COLUMN IF NOT EXISTS host TEXT;
    ALTER TABLE app_users ADD COLUMN IF NOT EXISTS phone TEXT;
    ALTER TABLE app_users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
    ALTER TABLE app_users ADD COLUMN IF NOT EXISTS bio TEXT;
    ALTER TABLE app_users ADD COLUMN IF NOT EXISTS country_code TEXT;
    ALTER TABLE app_users ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
    ALTER TABLE app_users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    ALTER TABLE app_users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS app_users_email_unique ON app_users (LOWER(email));
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS app_users_host_unique ON app_users (host);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_sessions (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS app_sessions_user_idx ON app_sessions(user_id);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS app_sessions_exp_idx ON app_sessions(expires_at);
  `);

  await pool.query(`
    DELETE FROM app_sessions WHERE expires_at < NOW();
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS prt_user_idx ON password_reset_tokens(user_id);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS prt_exp_idx ON password_reset_tokens(expires_at);
  `);

  await pool.query(`
    DELETE FROM password_reset_tokens WHERE expires_at < NOW();
  `);

  // Blocklist — emaile które nie mogą się ponownie zarejestrować
  await pool.query(`
    CREATE TABLE IF NOT EXISTS blocked_emails (
      email      TEXT PRIMARY KEY,
      reason     TEXT NOT NULL DEFAULT 'deleted_by_admin',
      blocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS account_deletion_log (
      id               SERIAL PRIMARY KEY,
      user_id          TEXT NOT NULL,
      email            TEXT NOT NULL,
      handle           TEXT,
      display_name     TEXT,
      registered_at    TIMESTAMPTZ,
      deleted_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_by       TEXT NOT NULL CHECK (deleted_by IN ('admin', 'self')),
      deleted_by_email TEXT,
      wallets_snapshot JSONB
    );
  `);

  await pool.query(
    `
    UPDATE app_users
    SET role = 'admin', updated_at = NOW()
    WHERE LOWER(email) = $1
    `,
    [envAdminEmail()]
  );
}

async function findUserByEmail(pool: Pool, email: string) {
  const result = await pool.query(
    `
    SELECT
      id,
      email,
      password_hash,
      role,
      is_active,
      email_verified,
      phone_verified,
      display_name,
      host,
      phone,
      avatar_url,
      bio,
      country_code
    FROM app_users
    WHERE LOWER(email) = $1
    LIMIT 1
    `,
    [normalizeEmail(email)]
  );

  return result.rows[0] || null;
}

async function findUserById(pool: Pool, userId: string) {
  const result = await pool.query(
    `
    SELECT
      id,
      email,
      password_hash,
      role,
      is_active,
      email_verified,
      phone_verified,
      display_name,
      host,
      phone,
      avatar_url,
      bio,
      country_code
    FROM app_users
    WHERE id = $1
    LIMIT 1
    `,
    [userId]
  );

  return result.rows[0] || null;
}

async function createSession(pool: Pool, userId: string) {
  const rawToken = makeSessionToken();

  await pool.query(
    `
    INSERT INTO app_sessions (id, user_id, token_hash, expires_at)
    VALUES ($1, $2, $3, $4)
    `,
    [crypto.randomUUID(), userId, sha256(rawToken), futureDate(SESSION_DAYS)]
  );

  return rawToken;
}

async function deleteSession(pool: Pool, rawToken?: string | null) {
  if (!rawToken) return;

  await pool.query(
    `DELETE FROM app_sessions WHERE token_hash = $1`,
    [sha256(rawToken)]
  );
}

async function authMiddleware(pool: Pool, req: AppRequest, _res: Response, next: NextFunction) {
  try {
    const cookies = parseCookies(req.headers.cookie);
    const rawToken = cookies[SESSION_COOKIE];

    if (!rawToken) {
      req.user = null;
      return next();
    }

    const result = await pool.query(
      `
      SELECT
        u.id,
        u.email,
        u.role,
        u.is_active,
        u.email_verified,
        u.phone_verified,
        u.display_name,
        u.host,
        u.phone,
        u.avatar_url,
        u.bio,
        u.country_code
      FROM app_sessions s
      JOIN app_users u ON u.id = s.user_id
      WHERE s.token_hash = $1
        AND s.expires_at > NOW()
        AND u.is_active = TRUE
      LIMIT 1
      `,
      [sha256(rawToken)]
    );

    req.user = result.rows[0] ? mapUser(result.rows[0]) : null;
    return next();
  } catch (error) {
    console.error("authMiddleware error:", error);
    req.user = null;
    return next();
  }
}

function requireAuth(req: AppRequest, res: Response, next: NextFunction) {
  if (!req.user?.id) {
    return res.status(401).json({ error: "Brak autoryzacji." });
  }
  return next();
}

function requireAdmin(req: AppRequest, res: Response, next: NextFunction) {
  if (!req.user?.id) {
    return res.status(401).json({ error: "Brak autoryzacji." });
  }
  if (req.user.role !== "admin" && !isAdminEmail(req.user.email)) {
    return res.status(403).json({ error: "Brak dostępu do panelu admina." });
  }
  return next();
}

export async function installAuthFix(app: Express, existingPool?: Pool) {
  const pool =
    existingPool ||
    new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });

  if (!process.env.DATABASE_URL && !existingPool) {
    throw new Error("Brak DATABASE_URL i nie przekazano istniejącego pool.");
  }

  await ensureSchema(pool);

  app.use((req: AppRequest, res: Response, next: NextFunction) =>
    authMiddleware(pool, req, res, next)
  );

  const router = Router();

  // REJESTRACJA
  router.post("/api/auth/register", async (req: AppRequest, res: Response) => {
    const client = await pool.connect();

    try {
      const email = normalizeEmail(req.body?.email);
      const password = String(req.body?.password ?? "");
      const displayName = normalizeText(req.body?.displayName) || "Użytkownik";
      let host = normalizeHost(req.body?.host);
      const phone = normalizeText(req.body?.phone);
      const avatarUrl = normalizeText(req.body?.avatarUrl);
      const bio = normalizeText(req.body?.bio);
      const countryCode = normalizeText(req.body?.countryCode);

      if (!validateEmail(email)) {
        return res.status(400).json({ error: "Nieprawidłowy e-mail." });
      }

      if (!validatePassword(password)) {
        return res.status(400).json({
          error: "Hasło musi mieć minimum 8 znaków.",
        });
      }

      // Sprawdź blocklist — email zablokowany przez admina
      const blockCheck = await client.query(
        `SELECT email FROM blocked_emails WHERE email = $1 LIMIT 1`,
        [email]
      );
      if (blockCheck.rows[0]) {
        return res.status(403).json({ error: "Ten e-mail nie może być użyty do rejestracji." });
      }

      const emailCheck = await client.query(
        `SELECT id FROM app_users WHERE LOWER(email) = $1 LIMIT 1`,
        [email]
      );

      if (emailCheck.rows[0]) {
        return res.status(409).json({ error: "Ten e-mail jest już zajęty." });
      }

      // Auto-generate handle from email if not provided
      if (!host) {
        host = await generateHandleFromEmail(email, (sql, params) => client.query(sql, params));
      }

      if (host) {
        const hostCheck = await client.query(
          `SELECT id FROM app_users WHERE host = $1 LIMIT 1`,
          [host]
        );

        if (hostCheck.rows[0]) {
          return res.status(409).json({ error: "Ten host jest już zajęty." });
        }
      }

      const userId = crypto.randomUUID();
      const passwordHash = hashPassword(password);
      const role = roleFromEmail(email);

      await client.query("BEGIN");

      await client.query(
        `
        INSERT INTO app_users (
          id,
          email,
          password_hash,
          role,
          is_active,
          email_verified,
          phone_verified,
          display_name,
          host,
          phone,
          avatar_url,
          bio,
          country_code,
          created_at,
          updated_at
        )
        VALUES (
          $1, $2, $3, $4,
          TRUE, FALSE, FALSE,
          $5, $6, $7, $8, $9, $10,
          NOW(), NOW()
        )
        `,
        [
          userId,
          email,
          passwordHash,
          role,
          displayName,
          host,
          phone,
          avatarUrl,
          bio,
          countryCode,
        ]
      );

      const rawToken = makeSessionToken();

      await client.query(
        `
        INSERT INTO app_sessions (
          id,
          user_id,
          token_hash,
          expires_at,
          created_at
        )
        VALUES ($1, $2, $3, $4, NOW())
        `,
        [
          crypto.randomUUID(),
          userId,
          sha256(rawToken),
          futureDate(SESSION_DAYS),
        ]
      );

      await client.query("COMMIT");

      const created = await findUserById(pool, userId);

      res.setHeader("Set-Cookie", makeCookie(rawToken));

      // Send email verification OTP
      const verifyCode = await sendEmailVerificationOTP(pool, userId, email);
      let emailSent = false;
      try {
        await sendVerificationEmail(email, verifyCode);
        emailSent = true;
      } catch (emailErr: any) {
        console.error("[register] Verification email send failed:", emailErr?.message);
        console.log(`[register] Verify code for ${email}: ${verifyCode}`);
      }

      const isDev = process.env.NODE_ENV !== "production";

      return res.status(201).json({
        ok: true,
        needsVerification: true,
        user: created ? mapUser(created) : null,
        ...(isDev ? { devCode: verifyCode } : {}),
      });
    } catch (error: any) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("REGISTER ERROR:", error);
      return res.status(500).json({
        error: error?.message || "Nie udało się utworzyć konta.",
      });
    } finally {
      client.release();
    }
  });

  // LOGOWANIE
  router.post("/api/auth/login", async (req: AppRequest, res: Response) => {
    try {
      const email = normalizeEmail(req.body?.email);
      const password = String(req.body?.password ?? "");

      if (!validateEmail(email)) {
        return res.status(400).json({ error: "Nieprawidłowy e-mail." });
      }

      const found = await findUserByEmail(pool, email);

      if (!found || !verifyPassword(password, found.password_hash)) {
        return res.status(401).json({ error: "Błędny e-mail lub hasło." });
      }

      if (!found.is_active) {
        return res.status(403).json({ error: "Konto jest nieaktywne." });
      }

      if (isAdminEmail(found.email) && found.role !== "admin") {
        await pool.query(
          `UPDATE app_users SET role = 'admin', updated_at = NOW() WHERE id = $1`,
          [found.id]
        );
      }

      const rawToken = await createSession(pool, found.id);

      res.setHeader("Set-Cookie", makeCookie(rawToken));

      // Auto-verify email on successful login (user proved ownership via password)
      if (!found.email_verified) {
        pool.query(
          `UPDATE app_users SET email_verified = TRUE, updated_at = NOW() WHERE id = $1`,
          [found.id]
        ).catch(() => {});
      }

      pool.query(
        `INSERT INTO security_events (id, user_id, type, description, metadata)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT DO NOTHING`,
        [
          crypto.randomUUID(),
          found.id,
          "login",
          "Successful login",
          JSON.stringify({ ip: req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown", ua: req.headers["user-agent"] || "unknown" }),
        ]
      ).catch(() => {});

      const refreshed = await findUserById(pool, found.id);

      return res.json({
        ok: true,
        user: refreshed ? mapUser(refreshed) : null,
      });
    } catch (error: any) {
      console.error("LOGIN ERROR:", error);
      return res.status(500).json({
        error: error?.message || "Nie udało się zalogować.",
      });
    }
  });

  // WERYFIKACJA E-MAILA — sprawdzenie kodu OTP
  router.post("/api/auth/verify-email", async (req: AppRequest, res: Response) => {
    try {
      const email = normalizeEmail(req.body?.email);
      const code = String(req.body?.code ?? "").trim();

      if (!validateEmail(email)) {
        return res.status(400).json({ error: "Nieprawidłowy e-mail." });
      }
      if (!code || code.length !== 6) {
        return res.status(400).json({ error: "Kod musi mieć 6 cyfr." });
      }

      const userResult = await pool.query(
        `SELECT id FROM app_users WHERE LOWER(email) = $1 AND is_active = TRUE LIMIT 1`,
        [email]
      );
      if (!userResult.rows[0]) {
        return res.status(400).json({ error: "Nie znaleziono konta dla tego e-maila." });
      }

      const userId = userResult.rows[0].id;

      const otpResult = await pool.query(
        `SELECT id FROM otp_codes
         WHERE user_id = $1 AND channel = 'email' AND target = $2
           AND code_hash = $3 AND consumed_at IS NULL AND expires_at > NOW()
         ORDER BY created_at DESC LIMIT 1`,
        [userId, email, sha256(code)]
      );

      if (!otpResult.rows[0]) {
        return res.status(400).json({ error: "Kod jest nieprawidłowy lub wygasł." });
      }

      await pool.query(`UPDATE otp_codes SET consumed_at = NOW() WHERE id = $1`, [otpResult.rows[0].id]);
      await pool.query(`UPDATE app_users SET email_verified = TRUE, updated_at = NOW() WHERE id = $1`, [userId]);

      const updated = await findUserById(pool, userId);

      return res.json({
        ok: true,
        user: updated ? mapUser(updated) : null,
      });
    } catch (error: any) {
      console.error("VERIFY EMAIL ERROR:", error);
      return res.status(500).json({ error: error?.message || "Nie udało się zweryfikować e-maila." });
    }
  });

  // PONOWNE WYSŁANIE KODU WERYFIKACYJNEGO
  router.post("/api/auth/resend-verification", async (req: AppRequest, res: Response) => {
    try {
      const email = normalizeEmail(req.body?.email);
      if (!validateEmail(email)) {
        return res.status(400).json({ error: "Nieprawidłowy e-mail." });
      }

      const userResult = await pool.query(
        `SELECT id FROM app_users WHERE LOWER(email) = $1 AND is_active = TRUE LIMIT 1`,
        [email]
      );
      if (!userResult.rows[0]) {
        return res.json({ ok: true, sent: false });
      }

      const userId = userResult.rows[0].id;
      const code = await sendEmailVerificationOTP(pool, userId, email);
      let emailSent = false;
      try {
        await sendVerificationEmail(email, code);
        emailSent = true;
      } catch (emailErr: any) {
        console.error("[resend-verification] Email failed:", emailErr?.message);
        console.log(`[resend-verification] Code for ${email}: ${code}`);
      }

      const isDev = process.env.NODE_ENV !== "production";
      return res.json({
        ok: true,
        sent: emailSent,
        ...(isDev ? { devCode: code } : {}),
      });
    } catch (error: any) {
      console.error("RESEND VERIFICATION ERROR:", error);
      return res.status(500).json({ error: error?.message || "Nie udało się wysłać kodu." });
    }
  });

  // WYLOGOWANIE
  router.post("/api/auth/logout", async (req: AppRequest, res: Response) => {
    try {
      const rawToken = parseCookies(req.headers.cookie)[SESSION_COOKIE];
      await deleteSession(pool, rawToken);

      res.setHeader("Set-Cookie", clearCookie());

      return res.json({ ok: true });
    } catch (error: any) {
      console.error("LOGOUT ERROR:", error);
      return res.status(500).json({
        error: error?.message || "Nie udało się wylogować.",
      });
    }
  });

  // AKTUALNY USER
  router.get("/api/auth/me", async (req: AppRequest, res: Response) => {
    return res.json({
      user: req.user ?? null,
      isAdmin: Boolean(req.user && (req.user.role === "admin" || isAdminEmail(req.user.email))),
    });
  });

  // ACCESS
  router.get("/api/me/access", async (req: AppRequest, res: Response) => {
    return res.json({
      isAdmin: Boolean(req.user && (req.user.role === "admin" || isAdminEmail(req.user.email))),
      email: req.user?.email ?? null,
    });
  });

  // AKTUALIZACJA PROFILU
  router.put("/api/auth/profile", requireAuth, async (req: AppRequest, res: Response) => {
    try {
      const displayName = normalizeText(req.body?.displayName) || req.user!.displayName;
      const host = normalizeHost(req.body?.host);
      const phone = normalizeText(req.body?.phone);
      const avatarUrl = normalizeText(req.body?.avatarUrl);
      const bio = normalizeText(req.body?.bio);
      const countryCode = normalizeText(req.body?.countryCode);

      if (host) {
        const hostCheck = await pool.query(
          `
          SELECT id
          FROM app_users
          WHERE host = $1 AND id <> $2
          LIMIT 1
          `,
          [host, req.user!.id]
        );

        if (hostCheck.rows[0]) {
          return res.status(409).json({ error: "Ten host jest już zajęty." });
        }
      }

      await pool.query(
        `
        UPDATE app_users
        SET
          display_name = $1,
          host = $2,
          phone = $3,
          avatar_url = $4,
          bio = $5,
          country_code = $6,
          updated_at = NOW()
        WHERE id = $7
        `,
        [displayName, host, phone, avatarUrl, bio, countryCode, req.user!.id]
      );

      const updated = await findUserById(pool, req.user!.id);

      return res.json({
        ok: true,
        user: updated ? mapUser(updated) : null,
      });
    } catch (error: any) {
      console.error("PROFILE UPDATE ERROR:", error);
      return res.status(500).json({
        error: error?.message || "Nie udało się zapisać profilu.",
      });
    }
  });

  // SYNC - bez drugiej tabeli, tylko update app_users
  router.post("/api/system/sync-user", requireAuth, async (req: AppRequest, res: Response) => {
    try {
      const id = String(req.body?.id ?? "").trim();

      if (!id || id !== req.user!.id) {
        return res.status(403).json({
          error: "Nieprawidłowy identyfikator użytkownika.",
        });
      }

      const displayName = normalizeText(req.body?.displayName) || req.user!.displayName;
      const host = normalizeHost(req.body?.host);
      const phone = normalizeText(req.body?.phone);
      const avatarUrl = normalizeText(req.body?.avatarUrl);
      const bio = normalizeText(req.body?.bio);
      const countryCode = normalizeText(req.body?.countryCode);

      if (host) {
        const hostCheck = await pool.query(
          `
          SELECT id
          FROM app_users
          WHERE host = $1 AND id <> $2
          LIMIT 1
          `,
          [host, req.user!.id]
        );

        if (hostCheck.rows[0]) {
          return res.status(409).json({ error: "Ten host jest już zajęty." });
        }
      }

      await pool.query(
        `
        UPDATE app_users
        SET
          display_name = $1,
          host = $2,
          phone = $3,
          avatar_url = $4,
          bio = $5,
          country_code = $6,
          updated_at = NOW()
        WHERE id = $7
        `,
        [displayName, host, phone, avatarUrl, bio, countryCode, req.user!.id]
      );

      const updated = await findUserById(pool, req.user!.id);

      return res.json({
        ok: true,
        user: updated ? mapUser(updated) : null,
      });
    } catch (error: any) {
      console.error("SYNC USER ERROR:", error);
      return res.status(500).json({
        error: error?.message || "Nie udało się zsynchronizować użytkownika.",
      });
    }
  });

  // ZAPOMNIANE HASŁO — wyślij kod na email
  router.post("/api/auth/forgot-password", async (req: AppRequest, res: Response) => {
    try {
      const email = normalizeEmail(req.body?.email);
      if (!validateEmail(email)) {
        return res.status(400).json({ error: "Nieprawidłowy e-mail." });
      }

      const userResult = await pool.query(
        `SELECT id FROM app_users WHERE LOWER(email) = $1 AND is_active = TRUE LIMIT 1`,
        [email]
      );

      if (!userResult.rows[0]) {
        return res.json({ ok: true, sent: false });
      }

      const userId = userResult.rows[0].id;

      await pool.query(
        `DELETE FROM password_reset_tokens WHERE user_id = $1`,
        [userId]
      );

      const isDev = process.env.NODE_ENV !== "production";
      const code = isDev ? "123456" : String(Math.floor(100000 + Math.random() * 900000));
      const tokenHash = sha256(code);

      await pool.query(
        `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at)
         VALUES ($1, $2, $3, $4)`,
        [crypto.randomUUID(), userId, tokenHash, futureMinutes(15)]
      );

      let emailSent = false;
      try {
        await sendPasswordResetEmail(email, code);
        emailSent = true;
      } catch (emailErr: any) {
        console.error("[forgot-password] Email send failed (token saved):", emailErr?.message);
        console.log(`[forgot-password] Reset code for ${email}: ${code}`);
      }

      return res.json({
        ok: true,
        sent: emailSent,
        ...(isDev ? { devCode: code } : {}),
      });
    } catch (error: any) {
      console.error("FORGOT PASSWORD ERROR:", error);
      return res.status(500).json({ error: error?.message || "Nie udało się przetworzyć prośby." });
    }
  });

  // RESET HASŁA — weryfikacja kodu + nowe hasło
  router.post("/api/auth/reset-password", async (req: AppRequest, res: Response) => {
    try {
      const email = normalizeEmail(req.body?.email);
      const code = String(req.body?.code ?? "").trim();
      const newPassword = String(req.body?.password ?? "");

      if (!validateEmail(email)) {
        return res.status(400).json({ error: "Nieprawidłowy e-mail." });
      }
      if (!code || code.length !== 6) {
        return res.status(400).json({ error: "Nieprawidłowy kod (6 cyfr)." });
      }
      if (!validatePassword(newPassword)) {
        return res.status(400).json({ error: "Hasło musi mieć minimum 8 znaków." });
      }

      const userResult = await pool.query(
        `SELECT id FROM app_users WHERE LOWER(email) = $1 AND is_active = TRUE LIMIT 1`,
        [email]
      );

      if (!userResult.rows[0]) {
        return res.status(400).json({ error: "Nieprawidłowy kod lub e-mail." });
      }

      const userId = userResult.rows[0].id;
      const tokenHash = sha256(code);

      const tokenResult = await pool.query(
        `SELECT id FROM password_reset_tokens
         WHERE user_id = $1
           AND token_hash = $2
           AND expires_at > NOW()
           AND used_at IS NULL
         LIMIT 1`,
        [userId, tokenHash]
      );

      if (!tokenResult.rows[0]) {
        return res.status(400).json({ error: "Kod jest nieprawidłowy lub wygasł." });
      }

      const newHash = hashPassword(newPassword);

      await pool.query(
        `UPDATE app_users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
        [newHash, userId]
      );

      await pool.query(
        `UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1`,
        [tokenResult.rows[0].id]
      );

      await pool.query(
        `DELETE FROM app_sessions WHERE user_id = $1`,
        [userId]
      );

      return res.json({ ok: true });
    } catch (error: any) {
      console.error("RESET PASSWORD ERROR:", error);
      return res.status(500).json({ error: error?.message || "Nie udało się zresetować hasła." });
    }
  });

  // SPRAWDZENIE E-MAIL (czy konto istnieje)
  router.post("/api/auth/check-email", async (req: AppRequest, res: Response) => {
    try {
      const email = normalizeEmail(req.body?.email);
      if (!validateEmail(email)) {
        return res.status(400).json({ error: "Nieprawidłowy e-mail." });
      }

      // Sprawdź najpierw blocklist — zablokowany email nie może się nigdy zarejestrować
      const blocked = await pool.query(
        `SELECT email FROM blocked_emails WHERE email = $1 LIMIT 1`,
        [email]
      );
      if (blocked.rows[0]) {
        return res.json({ exists: false, blocked: true });
      }

      const result = await pool.query(
        `SELECT id FROM app_users WHERE LOWER(email) = $1 LIMIT 1`,
        [email]
      );
      return res.json({ exists: Boolean(result.rows[0]) });
    } catch (error: any) {
      console.error("CHECK EMAIL ERROR:", error);
      return res.status(500).json({ error: error?.message || "Błąd serwera." });
    }
  });

  // USUŃ USERA (admin) — czyści wszystkie tabele + dodaje email do blocklist
  router.delete("/api/admin/users/:id", requireAdmin, async (req: AppRequest, res: Response) => {
    const targetId = req.params.id;

    if (!targetId) {
      return res.status(400).json({ error: "Brak ID użytkownika." });
    }

    // Nie pozwól usunąć admina
    if (normalizeEmail(req.user?.email) === envAdminEmail()) {
      const isTargetAdmin = await pool.query(
        `SELECT email FROM app_users WHERE id = $1 AND LOWER(email) = $2 LIMIT 1`,
        [targetId, envAdminEmail()]
      );
      if (isTargetAdmin.rows[0]) {
        return res.status(403).json({ error: "Nie można usunąć konta admina." });
      }
    }

    const userRow = await pool.query(
      `SELECT id, email, display_name, host, wallets, created_at FROM app_users WHERE id = $1 LIMIT 1`,
      [targetId]
    );
    if (!userRow.rows[0]) {
      return res.status(404).json({ error: "Użytkownik nie istnieje." });
    }

    const targetEmail = normalizeEmail(userRow.rows[0].email);
    const targetUUID = userRow.rows[0].id;
    const targetHandle = userRow.rows[0].host ?? null;
    const targetDisplayName = userRow.rows[0].display_name ?? null;
    const targetWallets = userRow.rows[0].wallets ?? null;
    const targetRegisteredAt = userRow.rows[0].created_at ?? null;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // TEXT/VARCHAR tables
      const textIds = [targetUUID];
      for (const [tbl, col] of [
        ["notifications",            "user_id"],
        ["notification_preferences", "user_id"],
        ["device_push_tokens",       "user_id"],
        ["friends",                  "user_id"],
        ["conversations",            "user_id"],
        ["portfolio_transactions",   "user_id"],
        ["portfolio_holdings",       "user_id"],
        ["sandbox_transfers",        "sender_id"],
        ["contract_invites",         "sender_id"],
        ["audit_logs",               "actor_user_id"],
      ] as const) {
        await client.query(`DELETE FROM ${tbl} WHERE ${col}::text = $1`, textIds);
      }

      await client.query(
        `DELETE FROM transaction_status_history WHERE transaction_id IN (SELECT id FROM transactions WHERE user_id = $1)`,
        textIds
      );
      await client.query(`DELETE FROM transactions WHERE user_id = $1`, textIds);

      await client.query(
        `DELETE FROM support_messages WHERE ticket_id IN (SELECT id FROM support_tickets WHERE user_id = $1)`,
        textIds
      );
      await client.query(`DELETE FROM support_tickets WHERE user_id = $1`, textIds);

      await client.query(
        `DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE user_id = $1)`,
        textIds
      );

      await client.query(
        `DELETE FROM dm_conversations WHERE user_a_id = $1 OR user_b_id = $1`,
        textIds
      );

      await client.query(
        `DELETE FROM agreement_holds WHERE creator_uid = $1 OR worker_uid = $1`,
        textIds
      );

      // UUID tables (CASCADE handles most, but explicit for safety)
      const uuidVal = targetUUID as string;
      await client.query(
        `DELETE FROM app_sessions WHERE user_id = $1::uuid`,
        [uuidVal]
      );

      // Remove the user
      await client.query(`DELETE FROM app_users WHERE id = $1::uuid`, [uuidVal]);

      // Add to blocklist so they cannot re-register
      await client.query(
        `INSERT INTO blocked_emails (email, reason, blocked_at)
         VALUES ($1, 'deleted_by_admin', NOW())
         ON CONFLICT (email) DO NOTHING`,
        [targetEmail]
      );

      // Log deletion details permanently
      await client.query(
        `INSERT INTO account_deletion_log
           (user_id, email, handle, display_name, registered_at, deleted_at, deleted_by, deleted_by_email, wallets_snapshot)
         VALUES ($1, $2, $3, $4, $5, NOW(), 'admin', $6, $7)`,
        [targetUUID, targetEmail, targetHandle, targetDisplayName, targetRegisteredAt,
         normalizeEmail(req.user?.email ?? ""), targetWallets ? JSON.stringify(targetWallets) : null]
      );

      await client.query("COMMIT");

      console.log(`[admin] Deleted user ${targetEmail} (${targetUUID}) and blocked email.`);

      return res.json({
        ok: true,
        deleted: { id: targetUUID, email: targetEmail },
        blocked: true,
      });
    } catch (err: any) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("[admin] Delete user failed:", err);
      return res.status(500).json({ error: err?.message || "Nie udało się usunąć użytkownika." });
    } finally {
      client.release();
    }
  });

  // LISTA USERÓW TYLKO DLA ADMINA
  router.get("/api/admin/users", requireAdmin, async (req: AppRequest, res: Response) => {
    try {
      const q = String(req.query.q ?? "").trim().toLowerCase();

      const result = await pool.query(
        `
        SELECT
          id,
          email,
          role,
          is_active,
          email_verified,
          phone_verified,
          display_name,
          host,
          phone,
          avatar_url,
          bio,
          country_code,
          created_at,
          updated_at
        FROM app_users
        ORDER BY created_at DESC
        `
      );

      const filtered = q
        ? result.rows.filter((row) =>
            [
              row.email,
              row.display_name,
              row.host,
              row.phone,
              row.country_code,
            ]
              .filter(Boolean)
              .some((value) => String(value).toLowerCase().includes(q))
          )
        : result.rows;

      return res.json({
        items: filtered.map((row) => ({
          id: row.id,
          email: row.email,
          role: isAdminEmail(row.email) ? "admin" : row.role,
          isActive: row.is_active,
          emailVerified: row.email_verified,
          phoneVerified: row.phone_verified,
          displayName: row.display_name,
          host: row.host,
          phone: row.phone,
          avatarUrl: row.avatar_url,
          bio: row.bio,
          countryCode: row.country_code,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        })),
        total: filtered.length,
      });
    } catch (error: any) {
      console.error("ADMIN USERS ERROR:", error);
      return res.status(500).json({
        error: error?.message || "Nie udało się pobrać listy użytkowników.",
      });
    }
  });

  // ── GET /api/admin/deletion-log — historia usuniętych kont (admin) ────────
  router.get("/api/admin/deletion-log", requireAdmin, async (_req: AppRequest, res: Response) => {
    try {
      const result = await pool.query(
        `SELECT id, user_id, email, handle, display_name, registered_at, deleted_at,
                deleted_by, deleted_by_email, wallets_snapshot
         FROM account_deletion_log
         ORDER BY deleted_at DESC
         LIMIT 200`
      );
      return res.json({ items: result.rows, total: result.rows.length });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || "Błąd pobierania logu." });
    }
  });

  // ── DELETE /api/auth/account — self-service account deletion ──────────────
  router.delete("/api/auth/account", requireAuth, async (req: AppRequest, res: Response) => {
    const currentUser = req.user;
    if (!currentUser?.id || !currentUser?.email) {
      return res.status(401).json({ error: "Brak uwierzytelnienia." });
    }

    // Admins cannot delete their own account via this endpoint
    if (normalizeEmail(currentUser.email) === envAdminEmail()) {
      return res.status(403).json({ error: "Konto administratora nie może zostać usunięte." });
    }

    const userRow = await pool.query(
      `SELECT id, email, display_name, host, wallets, created_at FROM app_users WHERE id = $1 LIMIT 1`,
      [currentUser.id]
    );
    if (!userRow.rows[0]) {
      return res.status(404).json({ error: "Konto nie istnieje." });
    }

    const targetEmail = normalizeEmail(userRow.rows[0].email);
    const targetUUID = userRow.rows[0].id as string;
    const targetHandle = userRow.rows[0].host ?? null;
    const targetDisplayName = userRow.rows[0].display_name ?? null;
    const targetWallets = userRow.rows[0].wallets ?? null;
    const targetRegisteredAt = userRow.rows[0].created_at ?? null;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const textIds = [targetUUID];

      // TEXT/VARCHAR foreign key tables
      for (const [tbl, col] of [
        ["notifications",            "user_id"],
        ["notification_preferences", "user_id"],
        ["device_push_tokens",       "user_id"],
        ["friends",                  "user_id"],
        ["conversations",            "user_id"],
        ["portfolio_transactions",   "user_id"],
        ["portfolio_holdings",       "user_id"],
        ["sandbox_transfers",        "sender_id"],
        ["contract_invites",         "sender_id"],
        ["audit_logs",               "actor_user_id"],
      ] as const) {
        await client.query(`DELETE FROM ${tbl} WHERE ${col}::text = $1`, textIds);
      }

      await client.query(
        `DELETE FROM transaction_status_history WHERE transaction_id IN (SELECT id FROM transactions WHERE user_id = $1)`,
        textIds
      );
      await client.query(`DELETE FROM transactions WHERE user_id = $1`, textIds);

      await client.query(
        `DELETE FROM support_messages WHERE ticket_id IN (SELECT id FROM support_tickets WHERE user_id = $1)`,
        textIds
      );
      await client.query(`DELETE FROM support_tickets WHERE user_id = $1`, textIds);

      await client.query(
        `DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE user_id = $1)`,
        textIds
      );

      await client.query(
        `DELETE FROM dm_conversations WHERE user_a_id = $1 OR user_b_id = $1`,
        textIds
      );

      await client.query(
        `DELETE FROM agreement_holds WHERE creator_uid = $1 OR worker_uid = $1`,
        textIds
      );

      // UUID — sessions (CASCADE handles most)
      await client.query(`DELETE FROM app_sessions WHERE user_id = $1::uuid`, [targetUUID]);

      // Remove the user row
      await client.query(`DELETE FROM app_users WHERE id = $1::uuid`, [targetUUID]);

      // Blocklist — prevent re-registration with same email
      await client.query(
        `INSERT INTO blocked_emails (email, reason, blocked_at)
         VALUES ($1, 'deleted_by_user', NOW())
         ON CONFLICT (email) DO NOTHING`,
        [targetEmail]
      );

      // Log deletion details permanently
      await client.query(
        `INSERT INTO account_deletion_log
           (user_id, email, handle, display_name, registered_at, deleted_at, deleted_by, deleted_by_email, wallets_snapshot)
         VALUES ($1, $2, $3, $4, $5, NOW(), 'self', NULL, $6)`,
        [targetUUID, targetEmail, targetHandle, targetDisplayName, targetRegisteredAt,
         targetWallets ? JSON.stringify(targetWallets) : null]
      );

      await client.query("COMMIT");

      // Clear session cookie
      res.clearCookie("finlys_session", { path: "/" });

      console.log(`[account] Self-deleted: ${targetEmail} (${targetUUID})`);
      return res.json({ ok: true });
    } catch (err: any) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("[account] Self-delete failed:", err);
      return res.status(500).json({ error: err?.message || "Nie udało się usunąć konta." });
    } finally {
      client.release();
    }
  });

  app.use(router);
}
