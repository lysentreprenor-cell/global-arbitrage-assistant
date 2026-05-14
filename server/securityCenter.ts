import type { Express, Request, Response, NextFunction } from "express";
import { Router } from "express";
import type { Pool } from "pg";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { storage } from "./storage";

const SESSION_COOKIE = "app_session";
const OTP_DEV_MODE = String(process.env.OTP_DEV_MODE ?? "true").toLowerCase() === "true";

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}
function makeOtpCode(): string { return String(Math.floor(100000 + Math.random() * 900000)); }
function addMinutes(m: number) { return new Date(Date.now() + m * 60 * 1000); }
function addDays(d: number) { return new Date(Date.now() + d * 24 * 60 * 60 * 1000); }
function parseCookies(h?: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!h) return out;
  for (const c of h.split(";")) {
    const [k, ...rest] = c.split("=");
    const key = k?.trim();
    if (!key) continue;
    out[key] = decodeURIComponent(rest.join("=").trim());
  }
  return out;
}
function getDeviceFingerprint(req: Request): string {
  const ua = String(req.headers["user-agent"] || "unknown");
  const lang = String(req.headers["accept-language"] || "unknown");
  return sha256(`${ua}__${lang}`);
}
function getSecurityScore(s: any, extras?: { trustedDevices?: number; sessions?: number }) {
  let score = 20;
  if (s?.biometric_enabled) score += 15;
  if (s?.two_factor_enabled) score += 25;
  if (s?.hide_balance) score += 10;
  if (s?.login_alerts) score += 10;
  if (s?.transfer_confirmation) score += 10;
  if (s?.suspicious_login_protection) score += 10;
  if ((extras?.trustedDevices || 0) > 0) score += 5;
  if ((extras?.sessions || 0) > 0 && (extras?.sessions || 0) <= 3) score += 5;
  if (score > 100) score = 100;
  if (score >= 80) return { score, level: "high" as const, label: "High Protection", labelPl: "Wysoki poziom ochrony" };
  if (score >= 55) return { score, level: "medium" as const, label: "Medium Protection", labelPl: "Średni poziom ochrony" };
  return { score, level: "low" as const, label: "Basic Protection", labelPl: "Podstawowy poziom ochrony" };
}

async function ensureSecurityTables(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS security_settings (
      user_id UUID PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
      biometric_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      biometric_method TEXT NOT NULL DEFAULT 'device_preference',
      two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      hide_balance BOOLEAN NOT NULL DEFAULT FALSE,
      login_alerts BOOLEAN NOT NULL DEFAULT TRUE,
      transfer_confirmation BOOLEAN NOT NULL DEFAULT TRUE,
      suspicious_login_protection BOOLEAN NOT NULL DEFAULT TRUE,
      last_security_review_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS trusted_devices (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      device_name TEXT NOT NULL,
      device_key TEXT NOT NULL,
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, device_key)
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS security_events (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      description TEXT NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS security_otp_challenges (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      target TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      consumed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS transfer_challenges (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      target_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
      amount NUMERIC(18,2) NOT NULL DEFAULT 0,
      code_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      consumed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS device_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      device_fingerprint TEXT NOT NULL,
      user_agent TEXT NOT NULL DEFAULT '',
      platform TEXT NOT NULL DEFAULT 'web',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`ALTER TABLE security_events ADD COLUMN IF NOT EXISTS risk_level TEXT;`).catch(() => {});
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS device_sessions_user_fp_idx ON device_sessions(user_id, device_fingerprint);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS device_sessions_user_idx ON device_sessions(user_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS trusted_devices_user_idx ON trusted_devices(user_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS security_events_user_idx ON security_events(user_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS security_otp_user_idx ON security_otp_challenges(user_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS transfer_challenges_user_idx ON transfer_challenges(user_id);`);
  // add biometric_method column if upgrading from older schema
  await pool.query(`ALTER TABLE security_settings ADD COLUMN IF NOT EXISTS biometric_method TEXT NOT NULL DEFAULT 'device_preference';`).catch(() => {});
  await pool.query(`ALTER TABLE security_settings ADD COLUMN IF NOT EXISTS last_security_review_at TIMESTAMPTZ;`).catch(() => {});
  await pool.query(`ALTER TABLE security_settings ADD COLUMN IF NOT EXISTS pin_hash TEXT;`).catch(() => {});
  await pool.query(`ALTER TABLE security_settings ADD COLUMN IF NOT EXISTS pin_enabled BOOLEAN NOT NULL DEFAULT FALSE;`).catch(() => {});
}

// ── In-memory PIN attempt tracker (resets on server restart — fine for sandbox) ──
const pinAttempts = new Map<string, { count: number; lockedUntil?: number }>();
const PIN_MAX_ATTEMPTS = 5;
const PIN_LOCKOUT_MS = 5 * 60 * 1000;
// Short-lived PIN tokens: userId → { token, expiresAt }
const pinTokens = new Map<string, { token: string; expiresAt: number }>();

async function ensureSettings(pool: Pool, userId: string) {
  await pool.query(
    `INSERT INTO security_settings (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
    [userId]
  );
}

async function logEvent(pool: Pool, userId: string, type: string, description: string, metadata: Record<string, any> = {}) {
  await pool.query(
    `INSERT INTO security_events (id, user_id, type, description, metadata) VALUES ($1,$2,$3,$4,$5)`,
    [crypto.randomUUID(), userId, type, description, JSON.stringify(metadata)]
  ).catch(() => {});
}

async function attachUser(pool: Pool, req: Request, _res: Response, next: NextFunction) {
  // Re-use req.user if already set by existing auth middleware
  if ((req as any).user !== undefined) return next();
  try {
    const cookies = parseCookies(req.headers.cookie);
    const rawToken = cookies[SESSION_COOKIE];
    if (!rawToken) { (req as any).user = null; return next(); }
    const r = await pool.query(
      `SELECT u.id, u.email, u.role, u.display_name FROM app_sessions s
       JOIN app_users u ON u.id = s.user_id
       WHERE s.token_hash=$1 AND s.expires_at > NOW() AND u.is_active=TRUE LIMIT 1`,
      [sha256(rawToken)]
    );
    (req as any).user = r.rows[0]
      ? { id: r.rows[0].id, email: r.rows[0].email, role: r.rows[0].role, displayName: r.rows[0].display_name || "Użytkownik" }
      : null;
    return next();
  } catch { (req as any).user = null; return next(); }
}

function requireUser(req: Request, res: Response, next: NextFunction) {
  if (!(req as any).user?.id) return res.status(401).json({ error: "Brak autoryzacji." });
  next();
}

export async function installSecurityCenter(app: Express, pool: Pool) {
  await ensureSecurityTables(pool);
  const r = Router();

  r.use((req: Request, res: Response, next: NextFunction) => attachUser(pool, req, res, next));

  // ── GET /api/security-center ────────────────────────────────────────────────
  r.get("/api/security-center", requireUser, async (req, res) => {
    const uid = (req as any).user.id;
    try {
      await ensureSettings(pool, uid);
      const [sRes, dRes, eRes, sessRes, dsRes, rtRes] = await Promise.all([
        pool.query(`SELECT * FROM security_settings WHERE user_id=$1`, [uid]),
        pool.query(`SELECT id,device_name,device_key,last_seen_at,created_at FROM trusted_devices WHERE user_id=$1 ORDER BY last_seen_at DESC`, [uid]),
        pool.query(`SELECT id,type,description,metadata,created_at FROM security_events WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20`, [uid]),
        pool.query(`SELECT id,expires_at,created_at FROM app_sessions WHERE user_id=$1 ORDER BY created_at DESC`, [uid]).catch(() => ({ rows: [] as any[] })),
        pool.query(`SELECT id,device_fingerprint,user_agent,platform,created_at,last_seen_at FROM device_sessions WHERE user_id=$1 ORDER BY last_seen_at DESC LIMIT 10`, [uid]).catch(() => ({ rows: [] as any[] })),
        pool.query(`SELECT id,type,description,metadata,created_at FROM security_events WHERE user_id=$1 AND type='transfer' ORDER BY created_at DESC LIMIT 5`, [uid]).catch(() => ({ rows: [] as any[] })),
      ]);
      const s = sRes.rows[0];
      const summary = getSecurityScore(s, { trustedDevices: dRes.rows.length, sessions: sessRes.rows.length });
      return res.json({
        ok: true, summary,
        settings: {
          biometricEnabled: Boolean(s?.biometric_enabled),
          biometricMethod: s?.biometric_method || "device_preference",
          twoFactorEnabled: Boolean(s?.two_factor_enabled),
          hideBalance: Boolean(s?.hide_balance),
          loginAlerts: Boolean(s?.login_alerts),
          transferConfirmation: Boolean(s?.transfer_confirmation),
          suspiciousLoginProtection: Boolean(s?.suspicious_login_protection),
          lastSecurityReviewAt: s?.last_security_review_at || null,
          pinEnabled: Boolean(s?.pin_enabled),
          pinConfigured: !!s?.pin_hash,
        },
        devices: dRes.rows, sessions: sessRes.rows, events: eRes.rows,
        deviceSessions: dsRes.rows, recentTransfers: rtRes.rows,
        capabilities: { biometricMode: "preference", note: "Na web to preferencja bezpieczeństwa. Pełny Face ID / Touch ID wymaga WebAuthn/passkeys albo wersji natywnej." },
      });
    } catch (err: any) { return res.status(500).json({ error: err?.message || "Błąd centrum bezpieczeństwa." }); }
  });

  // ── GET /api/security-center/mini ─────────────────────────────────────────
  r.get("/api/security-center/mini", requireUser, async (req, res) => {
    const uid = (req as any).user.id;
    try {
      await ensureSettings(pool, uid);
      const sRes = await pool.query(`SELECT * FROM security_settings WHERE user_id=$1`, [uid]);
      const s = sRes.rows[0];
      const summary = getSecurityScore(s);
      return res.json({
        ok: true, summary,
        flags: {
          hideBalance: Boolean(s?.hide_balance),
          twoFactorEnabled: Boolean(s?.two_factor_enabled),
          biometricEnabled: Boolean(s?.biometric_enabled),
          loginAlerts: Boolean(s?.login_alerts),
          transferConfirmation: Boolean(s?.transfer_confirmation),
          suspiciousLoginProtection: Boolean(s?.suspicious_login_protection),
        },
      });
    } catch (err: any) { return res.status(500).json({ error: err?.message }); }
  });

  // ── PUT /api/security-center/settings ─────────────────────────────────────
  r.put("/api/security-center/settings", requireUser, async (req, res) => {
    const uid = (req as any).user.id;
    try {
      await ensureSettings(pool, uid);
      const { biometricEnabled, biometricMethod, twoFactorEnabled, hideBalance, loginAlerts, transferConfirmation, suspiciousLoginProtection, pinEnabled } = req.body;
      // Guard: cannot enable PIN toggle unless a PIN has been configured
      if (Boolean(pinEnabled)) {
        const hashRow = await pool.query(`SELECT pin_hash FROM security_settings WHERE user_id=$1`, [uid]);
        if (!hashRow.rows[0]?.pin_hash) {
          return res.status(400).json({ error: "Ustaw PIN przed włączeniem tej opcji." });
        }
      }
      await pool.query(
        `UPDATE security_settings SET biometric_enabled=$1,biometric_method=$2,two_factor_enabled=$3,hide_balance=$4,login_alerts=$5,transfer_confirmation=$6,suspicious_login_protection=$7,pin_enabled=$8,updated_at=NOW() WHERE user_id=$9`,
        [Boolean(biometricEnabled), String(biometricMethod||"device_preference"), Boolean(twoFactorEnabled), Boolean(hideBalance), Boolean(loginAlerts), Boolean(transferConfirmation), Boolean(suspiciousLoginProtection), Boolean(pinEnabled), uid]
      );
      await logEvent(pool, uid, "settings_update", "Zaktualizowano ustawienia bezpieczeństwa.", req.body);
      return res.json({ ok: true });
    } catch (err: any) { return res.status(500).json({ error: err?.message }); }
  });

  // ── POST /api/security-center/review ──────────────────────────────────────
  r.post("/api/security-center/review", requireUser, async (req, res) => {
    const uid = (req as any).user.id;
    try {
      await ensureSettings(pool, uid);
      await pool.query(`UPDATE security_settings SET last_security_review_at=NOW(),updated_at=NOW() WHERE user_id=$1`, [uid]);
      await logEvent(pool, uid, "security_review", "Przejrzano ustawienia bezpieczeństwa.");
      return res.json({ ok: true });
    } catch (err: any) { return res.status(500).json({ error: err?.message }); }
  });

  // ── POST /api/security-center/2fa/send ───────────────────────────────────
  r.post("/api/security-center/2fa/send", requireUser, async (req, res) => {
    const uid = (req as any).user.id;
    const userEmail = (req as any).user.email;
    try {
      const target = String(req.body?.target || userEmail || "").trim() || userEmail;
      const code = makeOtpCode();
      const expiresAt = addMinutes(10);
      await pool.query(`INSERT INTO security_otp_challenges (id,user_id,target,code_hash,expires_at) VALUES ($1,$2,$3,$4,$5)`,
        [crypto.randomUUID(), uid, target, sha256(code), expiresAt]);
      await logEvent(pool, uid, "two_factor_send", "Wysłano kod 2FA.", { target });
      return res.json({ ok: true, expiresAt, target, ...(OTP_DEV_MODE ? { devCode: code } : {}) });
    } catch (err: any) { return res.status(500).json({ error: err?.message }); }
  });

  // ── POST /api/security-center/2fa/verify ─────────────────────────────────
  r.post("/api/security-center/2fa/verify", requireUser, async (req, res) => {
    const uid = (req as any).user.id;
    const userEmail = (req as any).user.email;
    try {
      const target = String(req.body?.target || userEmail || "").trim() || userEmail;
      const code = String(req.body?.code ?? "").trim();
      if (!code) return res.status(400).json({ error: "Podaj kod 2FA." });
      const found = await pool.query(
        `SELECT id FROM security_otp_challenges WHERE user_id=$1 AND target=$2 AND code_hash=$3 AND consumed_at IS NULL AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1`,
        [uid, target, sha256(code)]
      );
      if (!found.rows[0]) return res.status(400).json({ error: "Nieprawidłowy lub wygasły kod 2FA." });
      await pool.query(`UPDATE security_otp_challenges SET consumed_at=NOW() WHERE id=$1`, [found.rows[0].id]);
      await ensureSettings(pool, uid);
      await pool.query(`UPDATE security_settings SET two_factor_enabled=TRUE,updated_at=NOW() WHERE user_id=$1`, [uid]);
      await logEvent(pool, uid, "two_factor_verified", "Włączono uwierzytelnianie dwuskładnikowe.");
      return res.json({ ok: true });
    } catch (err: any) { return res.status(500).json({ error: err?.message }); }
  });

  // ── POST /api/security-center/2fa/disable ────────────────────────────────
  r.post("/api/security-center/2fa/disable", requireUser, async (req, res) => {
    const uid = (req as any).user.id;
    try {
      await ensureSettings(pool, uid);
      await pool.query(`UPDATE security_settings SET two_factor_enabled=FALSE,updated_at=NOW() WHERE user_id=$1`, [uid]);
      await logEvent(pool, uid, "two_factor_disabled", "Wyłączono uwierzytelnianie dwuskładnikowe.");
      return res.json({ ok: true });
    } catch (err: any) { return res.status(500).json({ error: err?.message }); }
  });

  // ── GET /api/security-center/device-status ────────────────────────────────
  r.get("/api/security-center/device-status", requireUser, async (req, res) => {
    const uid = (req as any).user.id;
    try {
      const deviceKey = getDeviceFingerprint(req);
      const result = await pool.query(
        `SELECT id,device_name,device_key,last_seen_at,created_at FROM trusted_devices WHERE user_id=$1 AND device_key=$2 LIMIT 1`,
        [uid, deviceKey]
      );
      return res.json({ ok: true, trusted: Boolean(result.rows[0]), item: result.rows[0] || null });
    } catch (err: any) { return res.status(500).json({ error: err?.message }); }
  });

  // ── POST /api/security-center/devices/trust-current ──────────────────────
  r.post("/api/security-center/devices/trust-current", requireUser, async (req, res) => {
    const uid = (req as any).user.id;
    try {
      const deviceName = String(req.body?.deviceName || req.headers["user-agent"] || "To urządzenie").slice(0, 200);
      const deviceKey = getDeviceFingerprint(req);
      await pool.query(
        `INSERT INTO trusted_devices (id,user_id,device_name,device_key,last_seen_at) VALUES ($1,$2,$3,$4,NOW())
         ON CONFLICT (user_id,device_key) DO UPDATE SET device_name=EXCLUDED.device_name,last_seen_at=NOW()`,
        [crypto.randomUUID(), uid, deviceName, deviceKey]
      );
      await logEvent(pool, uid, "device_trusted", "Dodano bieżące urządzenie do zaufanych.", { deviceName });
      return res.json({ ok: true });
    } catch (err: any) { return res.status(500).json({ error: err?.message }); }
  });

  // ── POST /api/security-center/devices/trust ───────────────────────────────
  r.post("/api/security-center/devices/trust", requireUser, async (req, res) => {
    const uid = (req as any).user.id;
    try {
      const deviceName = String(req.body?.deviceName || req.headers["user-agent"] || "To urządzenie").slice(0, 200);
      const deviceKey = String(req.body?.deviceKey || getDeviceFingerprint(req));
      await pool.query(
        `INSERT INTO trusted_devices (id,user_id,device_name,device_key,last_seen_at) VALUES ($1,$2,$3,$4,NOW())
         ON CONFLICT (user_id,device_key) DO UPDATE SET device_name=EXCLUDED.device_name,last_seen_at=NOW()`,
        [crypto.randomUUID(), uid, deviceName, deviceKey]
      );
      await logEvent(pool, uid, "device_trusted", "Dodano zaufane urządzenie.", { deviceName });
      return res.json({ ok: true });
    } catch (err: any) { return res.status(500).json({ error: err?.message }); }
  });

  // ── DELETE /api/security-center/devices/:deviceId ─────────────────────────
  r.delete("/api/security-center/devices/:deviceId", requireUser, async (req, res) => {
    const uid = (req as any).user.id;
    try {
      await pool.query(`DELETE FROM trusted_devices WHERE id=$1 AND user_id=$2`, [req.params.deviceId, uid]);
      await logEvent(pool, uid, "device_removed", "Usunięto zaufane urządzenie.", { deviceId: req.params.deviceId });
      return res.json({ ok: true });
    } catch (err: any) { return res.status(500).json({ error: err?.message }); }
  });

  // ── POST /api/security-center/sessions/revoke ─────────────────────────────
  r.post("/api/security-center/sessions/revoke", requireUser, async (req, res) => {
    const uid = (req as any).user.id;
    try {
      const sessionId = String(req.body?.sessionId ?? "").trim();
      if (!sessionId) return res.status(400).json({ error: "Brakuje sessionId." });
      await pool.query(`DELETE FROM app_sessions WHERE id=$1 AND user_id=$2`, [sessionId, uid]);
      await logEvent(pool, uid, "session_revoked", "Zakończono sesję zdalnie.", { sessionId });
      return res.json({ ok: true });
    } catch (err: any) { return res.status(500).json({ error: err?.message }); }
  });

  // ── POST /api/security-center/sessions/revoke-others ─────────────────────
  r.post("/api/security-center/sessions/revoke-others", requireUser, async (req, res) => {
    const uid = (req as any).user.id;
    try {
      const cookies = parseCookies(req.headers.cookie);
      const rawToken = cookies[SESSION_COOKIE];
      if (!rawToken) return res.status(400).json({ error: "Brak aktywnej sesji." });
      await pool.query(`DELETE FROM app_sessions WHERE user_id=$1 AND token_hash<>$2`, [uid, sha256(rawToken)]);
      await logEvent(pool, uid, "sessions_revoked_others", "Wylogowano wszystkie inne sesje.");
      return res.json({ ok: true });
    } catch (err: any) { return res.status(500).json({ error: err?.message }); }
  });

  // ── GET /api/security-center/events ───────────────────────────────────────
  r.get("/api/security-center/events", requireUser, async (req, res) => {
    const uid = (req as any).user.id;
    try {
      const result = await pool.query(
        `SELECT id,type,description,metadata,created_at FROM security_events WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`,
        [uid]
      );
      return res.json({ ok: true, items: result.rows });
    } catch (err: any) { return res.status(500).json({ error: err?.message }); }
  });

  // ── Transfer confirmation ──────────────────────────────────────────────────
  r.post("/api/security-center/transfer/send-confirmation", requireUser, async (req, res) => {
    const uid = (req as any).user.id;
    try {
      const amount = Number(req.body?.amount || 0);
      if (!amount || amount <= 0) return res.status(400).json({ error: "Nieprawidłowa kwota przelewu." });
      const targetUserId = String(req.body?.targetUserId || "").trim() || null;
      const code = makeOtpCode();
      const expiresAt = addMinutes(10);
      await pool.query(
        `INSERT INTO transfer_challenges (id,user_id,target_user_id,amount,code_hash,expires_at) VALUES ($1,$2,$3,$4,$5,$6)`,
        [crypto.randomUUID(), uid, targetUserId, amount, sha256(code), expiresAt]
      );
      await logEvent(pool, uid, "transfer_confirmation_sent", "Wysłano kod potwierdzający przelew.", { amount });
      return res.json({ ok: true, expiresAt, ...(OTP_DEV_MODE ? { devCode: code } : {}) });
    } catch (err: any) { return res.status(500).json({ error: err?.message }); }
  });

  // ── POST /api/security/register-device ───────────────────────────────────
  r.post("/api/security/register-device", requireUser, async (req, res) => {
    const uid = (req as any).user.id;
    try {
      const fingerprint = String(req.body?.fingerprint || getDeviceFingerprint(req)).slice(0, 256);
      const userAgent = String(req.body?.userAgent || req.headers["user-agent"] || "").slice(0, 512);
      const platform = String(req.body?.platform || "web").slice(0, 64);

      const existing = await pool.query(
        `SELECT id FROM device_sessions WHERE user_id=$1 AND device_fingerprint=$2 LIMIT 1`,
        [uid, fingerprint]
      );
      const isNew = !existing.rows[0];

      await pool.query(
        `INSERT INTO device_sessions (id, user_id, device_fingerprint, user_agent, platform, created_at, last_seen_at)
         VALUES ($1,$2,$3,$4,$5,NOW(),NOW())
         ON CONFLICT (user_id, device_fingerprint) DO UPDATE SET last_seen_at=NOW(), user_agent=EXCLUDED.user_agent`,
        [crypto.randomUUID(), uid, fingerprint, userAgent, platform]
      );

      if (isNew) {
        await logEvent(pool, uid, "new_device", "Nowe urządzenie zalogowane do konta.", { userAgent, platform, fingerprint: fingerprint.slice(0, 16) + "…" });
        storage.createNotification({
          userId: uid,
          type: "alert",
          category: "security",
          priority: "high",
          title: "Nowe urządzenie",
          message: "Nowe urządzenie zalogowane do Twojego konta Finlys.",
          route: "/security",
          dedupeKey: `new-device-${uid}-${fingerprint.slice(0, 16)}`,
        }).catch(() => {});
      }

      return res.json({ ok: true, isNew });
    } catch (err: any) { return res.status(500).json({ error: err?.message }); }
  });

  // ── POST /api/security/set-pin ───────────────────────────────────────────
  r.post("/api/security/set-pin", requireUser, async (req, res) => {
    const uid = (req as any).user.id;
    try {
      const pin = String(req.body?.pin ?? "").trim();
      if (!/^\d{4,6}$/.test(pin)) return res.status(400).json({ error: "PIN musi mieć 4–6 cyfr." });
      await ensureSettings(pool, uid);
      const pinHash = await bcrypt.hash(pin, 12);
      await pool.query(
        `UPDATE security_settings SET pin_hash=$1, pin_enabled=TRUE, updated_at=NOW() WHERE user_id=$2`,
        [pinHash, uid]
      );
      await logEvent(pool, uid, "pin_set", "Ustawiono PIN bezpieczeństwa.", {});
      pinAttempts.delete(uid);
      return res.json({ ok: true });
    } catch (err: any) { return res.status(500).json({ error: err?.message }); }
  });

  // ── POST /api/security/verify-pin ────────────────────────────────────────
  r.post("/api/security/verify-pin", requireUser, async (req, res) => {
    const uid = (req as any).user.id;
    try {
      const pin = String(req.body?.pin ?? "").trim();
      if (!/^\d{4,6}$/.test(pin)) return res.status(400).json({ error: "Nieprawidłowy format PIN." });

      // Lockout check
      const tracker = pinAttempts.get(uid) ?? { count: 0 };
      if (tracker.lockedUntil && tracker.lockedUntil > Date.now()) {
        const mins = Math.ceil((tracker.lockedUntil - Date.now()) / 60000);
        return res.status(429).json({ error: `Zbyt wiele prób. Zablokowane na ${mins} min.` });
      }

      await ensureSettings(pool, uid);
      const sRes = await pool.query(`SELECT pin_hash, pin_enabled FROM security_settings WHERE user_id=$1`, [uid]);
      const s = sRes.rows[0];
      if (!s?.pin_hash) {
        return res.status(400).json({ error: "PIN nie został skonfigurowany. Ustaw PIN w Centrum Bezpieczeństwa." });
      }

      const pinMatches = await bcrypt.compare(pin, s.pin_hash);
      if (!pinMatches) {
        const newCount = (tracker.count ?? 0) + 1;
        const lockedUntil = newCount >= PIN_MAX_ATTEMPTS ? Date.now() + PIN_LOCKOUT_MS : undefined;
        pinAttempts.set(uid, { count: newCount, lockedUntil });
        await logEvent(pool, uid, "pin_failed", "Błędna próba PIN.", { attempt: newCount });
        const left = PIN_MAX_ATTEMPTS - newCount;
        if (lockedUntil) return res.status(429).json({ error: `Zbyt wiele błędnych prób. Konto zablokowane na 5 minut.` });
        return res.status(400).json({ error: `Nieprawidłowy PIN. Pozostało prób: ${Math.max(0, left)}.` });
      }

      // Success — clear attempts, issue short-lived token
      pinAttempts.delete(uid);
      const token = crypto.randomUUID();
      pinTokens.set(uid, { token, expiresAt: Date.now() + 5 * 60 * 1000 });
      await logEvent(pool, uid, "pin_verified", "Pomyślnie zweryfikowano PIN.", {});
      return res.json({ ok: true, pinToken: token });
    } catch (err: any) { return res.status(500).json({ error: err?.message }); }
  });

  // ── DELETE /api/security/devices/:deviceId ────────────────────────────────
  r.delete("/api/security/devices/:deviceId", requireUser, async (req, res) => {
    const uid = (req as any).user.id;
    try {
      await pool.query(`DELETE FROM device_sessions WHERE id=$1 AND user_id=$2`, [req.params.deviceId, uid]);
      await logEvent(pool, uid, "device_session_removed", "Usunięto sesję urządzenia.", { deviceId: req.params.deviceId });
      return res.json({ ok: true });
    } catch (err: any) { return res.status(500).json({ error: err?.message }); }
  });

  r.post("/api/security-center/transfer/verify-confirmation", requireUser, async (req, res) => {
    const uid = (req as any).user.id;
    try {
      const amount = Number(req.body?.amount || 0);
      const code = String(req.body?.code ?? "").trim();
      if (!amount || !code) return res.status(400).json({ error: "Brak danych potwierdzenia." });
      const found = await pool.query(
        `SELECT id FROM transfer_challenges WHERE user_id=$1 AND amount=$2 AND code_hash=$3 AND consumed_at IS NULL AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1`,
        [uid, amount, sha256(code)]
      );
      if (!found.rows[0]) return res.status(400).json({ error: "Nieprawidłowy lub wygasły kod potwierdzenia." });
      await pool.query(`UPDATE transfer_challenges SET consumed_at=NOW() WHERE id=$1`, [found.rows[0].id]);
      await logEvent(pool, uid, "transfer_confirmation_verified", "Potwierdzono przelew.", { amount });
      return res.json({ ok: true, confirmed: true });
    } catch (err: any) { return res.status(500).json({ error: err?.message }); }
  });

  app.use(r);
  console.log("[SecurityCenter] installed");
}

/**
 * Validate (and consume) a short-lived PIN token issued by POST /api/security/pin/verify.
 * Returns true if the token is valid and not yet expired; false otherwise.
 * Tokens are single-use — they are deleted from the store on first valid check.
 */
export function validatePinToken(userId: string, token: string): boolean {
  const entry = pinTokens.get(userId);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) { pinTokens.delete(userId); return false; }
  if (entry.token !== token) return false;
  pinTokens.delete(userId); // single-use — consume immediately
  return true;
}
