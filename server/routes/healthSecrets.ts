import type { Express, Request, Response } from "express";
import { runManualBackup } from "../scripts/backupUsers";
import path from "path";

function present(key: string): boolean {
  return !!process.env[key];
}

function masked(key: string): { exists: boolean; length: number; preview: string } {
  const val = process.env[key] ?? "";
  if (!val) return { exists: false, length: 0, preview: "" };
  return {
    exists: true,
    length: val.length,
    preview: val.length >= 8 ? `${val.slice(0, 4)}…${val.slice(-4)}` : "****",
  };
}

export function registerHealthSecretsRoute(app: Express): void {
  app.get("/api/health/secrets", (_req, res) => {
    res.json({
      firebase: {
        apiKey:            present("VITE_FIREBASE_API_KEY"),
        authDomain:        present("VITE_FIREBASE_AUTH_DOMAIN"),
        projectId:         present("VITE_FIREBASE_PROJECT_ID"),
        storageBucket:     present("VITE_FIREBASE_STORAGE_BUCKET"),
        messagingSenderId: present("VITE_FIREBASE_MESSAGING_SENDER_ID"),
        appId:             present("VITE_FIREBASE_APP_ID"),
        databaseUrl:       present("FIREBASE_DATABASE_URL") || present("VITE_FIREBASE_DATABASE_URL"),
        serviceAccount:    present("FIREBASE_SERVICE_ACCOUNT"),
      },
      stripe: {
        publishableKey: present("VITE_STRIPE_PUBLISHABLE_KEY"),
        secretKey:      present("STRIPE_SECRET_KEY"),
        webhookSecret:  present("STRIPE_WEBHOOK_SECRET"),
      },
      auth: {
        jwtSecret:     present("JWT_SECRET"),
        sessionSecret: present("SESSION_SECRET"),
      },
      email: {
        resendApiKey: present("RESEND_API_KEY"),
      },
    });
  });

  // GET /api/health/payments — payment diagnostics (no secret values exposed)
  app.get("/api/health/payments", (_req, res) => {
    const stripeSecretKey = masked("STRIPE_SECRET_KEY");
    const stripeWebhook   = masked("STRIPE_WEBHOOK_SECRET");
    const stripePub       = masked("VITE_STRIPE_PUBLISHABLE_KEY");
    const paymentMode     = (process.env.APP_PAYMENT_MODE ?? "test").toLowerCase();
    const skVal           = process.env.STRIPE_SECRET_KEY ?? "";

    const stripeReady =
      stripeSecretKey.exists &&
      stripePub.exists &&
      (paymentMode === "test" ? skVal.startsWith("sk_test_") : skVal.startsWith("sk_live_"));

    res.json({
      backendActive: true,
      paymentMode,
      stripeReady,
      routes: {
        addFunds:      "POST /api/payments/add-funds  →  POST /api/stripe/create-topup-session",
        transferSend:  "POST /api/transfers/send      →  POST /api/transfer",
        balance:       "GET  /api/account/balance     →  GET  /api/wallet/balances",
        webhook:       "POST /api/stripe/webhook",
        verifySession: "GET  /api/stripe/verify-session?session_id=cs_xxx",
      },
      secrets: {
        STRIPE_SECRET_KEY:           { exists: stripeSecretKey.exists, length: stripeSecretKey.length, preview: stripeSecretKey.preview, location: "backend only (process.env)" },
        STRIPE_WEBHOOK_SECRET:       { exists: stripeWebhook.exists,   length: stripeWebhook.length,   preview: stripeWebhook.preview,   location: "backend only (process.env)" },
        VITE_STRIPE_PUBLISHABLE_KEY: { exists: stripePub.exists,       length: stripePub.length,       preview: stripePub.preview,       location: "frontend (import.meta.env) — public key, safe" },
      },
      security: {
        putWalletBalancesAdminOnly: true,
        senderIdFromSession:        true,
        topupWebhookIdempotent:     true,
        transferChecksBalance:      true,
        transferChecksSelf:         true,
        transferChecksAmount:       true,
        noSecretsInFrontend:        true,
      },
      dataFlow: {
        addFunds:    "Frontend → POST /api/payments/add-funds → Stripe Checkout → POST /api/stripe/webhook → creditUserWallet() → PostgreSQL",
        transfer:    "Frontend → POST /api/transfers/send → validateSession + balance check → UPDATE wallets → PostgreSQL",
        balance:     "Frontend → GET /api/account/balance → SELECT wallets FROM app_users → PostgreSQL",
        firebase:    "Notifications / realtime status ONLY — NOT balance, NOT transactions",
      },
      balanceSource:     "PostgreSQL  app_users.wallets (JSONB)",
      transactionSource: "PostgreSQL  transactions table",
    });
  });

  // POST /api/admin/backup — manual backup trigger (admin only)
  app.post("/api/admin/backup", async (req: Request, res: Response) => {
    const user = (req as any).user ?? (req as any).session?.user;
    const isAdmin =
      user?.role === "admin" ||
      user?.email === process.env.ADMIN_EMAIL ||
      user?.email === "lysenteprenor@gmail.com";

    if (!isAdmin) {
      return res.status(403).json({ error: "Admin only" });
    }

    try {
      const result = await runManualBackup();
      return res.json({
        ok: true,
        users: {
          rows: result.users.rows,
          file: path.basename(result.users.file),
        },
        transactions: {
          rows: result.transactions.rows,
          file: path.basename(result.transactions.file),
        },
      });
    } catch (err: any) {
      console.error("[backup] Manual backup failed:", err);
      return res.status(500).json({ error: "Backup failed", detail: err?.message });
    }
  });
}
