import "./envValidate";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { registerHealthSecretsRoute } from "./routes/healthSecrets";
import { installAuthFix } from "./replitAuthFix";
import { installRealAuth } from "./realAuth";
import { installSecurityCenter } from "./securityCenter";
import { pool } from "./pool";
import { installInvestRoutes } from "./investRoutes";
import { installRealInvestQuotes } from "./overrides/installRealInvestQuotes";
import { installMessagesFix } from "./overrides/installMessagesFix";
import { installChatSafety } from "./overrides/installChatSafety";
import { authRouter } from "./routes/auth";
import { serveStatic } from "./static";
import { createServer } from "http";
import fs from "fs";
import path from "path";
import { runStartupBackup, runManualBackup } from "./scripts/backupUsers";
import transactionsRouter from "./routes/transactions";
import messagesRouter from "./routes/messages";
import usersRouter from "./routes/users";
import resellScanRouter from "./routes/resellScan";
import marketScanRouter from "./routes/marketScan";

const app = express();
const httpServer = createServer(app);

// Stały znacznik wersji — generowany raz przy starcie serwera
const BUILD_TS = Date.now().toString();

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

async function runStartupMigrations() {
  try {
    await pool.query(`
      ALTER TABLE app_users
        ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sim_cards (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id          UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        card_number      TEXT NOT NULL,
        cardholder_name  TEXT NOT NULL DEFAULT '',
        expiry           TEXT NOT NULL DEFAULT '',
        card_type        TEXT NOT NULL DEFAULT 'visa',
        currency         TEXT NOT NULL DEFAULT 'USD',
        status           TEXT NOT NULL DEFAULT 'active',
        balance          NUMERIC(18,2) NOT NULL DEFAULT 0,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`ALTER TABLE sim_cards ADD COLUMN IF NOT EXISTS cardholder_name TEXT NOT NULL DEFAULT ''`);
    await pool.query(`ALTER TABLE sim_cards ADD COLUMN IF NOT EXISTS expiry TEXT NOT NULL DEFAULT ''`);
    await pool.query(`ALTER TABLE sim_cards ADD COLUMN IF NOT EXISTS card_type TEXT NOT NULL DEFAULT 'visa'`);
    await pool.query(`ALTER TABLE sim_cards ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'USD'`);
    await pool.query(`ALTER TABLE sim_cards ADD COLUMN IF NOT EXISTS balance NUMERIC(18,2) NOT NULL DEFAULT 0`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        user_id   UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        endpoint  TEXT NOT NULL,
        p256dh    TEXT NOT NULL,
        auth      TEXT NOT NULL,
        PRIMARY KEY (user_id, endpoint)
      )
    `);
    await pool.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sandbox_transfer_destination') THEN
          CREATE TYPE sandbox_transfer_destination AS ENUM ('BANK_ACCOUNT', 'CARD', 'PHONE', 'HOST');
        END IF;
      END $$;
    `);
    await pool.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sandbox_transfer_status') THEN
          CREATE TYPE sandbox_transfer_status AS ENUM ('PENDING', 'COMPLETED_SANDBOX', 'FAILED');
        END IF;
      END $$;
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sandbox_transfers (
        id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        sender_id           TEXT NOT NULL,
        recipient_name      TEXT NOT NULL,
        recipient_identifier TEXT NOT NULL,
        destination_type    TEXT NOT NULL,
        amount              REAL NOT NULL,
        currency            VARCHAR(10) NOT NULL,
        title               TEXT NOT NULL,
        message             TEXT,
        masked_destination  TEXT NOT NULL,
        status              TEXT NOT NULL DEFAULT 'COMPLETED_SANDBOX',
        provider            TEXT NOT NULL DEFAULT 'SANDBOX',
        reference           TEXT NOT NULL,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contract_type_invite') THEN
          CREATE TYPE contract_type_invite AS ENUM ('SERVICE', 'SALE', 'DEPOSIT', 'RENOVATION', 'CUSTOM');
        END IF;
      END $$;
    `);
    await pool.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contract_invite_status') THEN
          CREATE TYPE contract_invite_status AS ENUM ('SENT', 'ACCEPTED', 'DECLINED', 'CANCELLED');
        END IF;
      END $$;
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS contract_invites (
        id                   TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        sender_id            TEXT NOT NULL,
        recipient_identifier TEXT NOT NULL,
        title                TEXT NOT NULL,
        contract_type        TEXT NOT NULL,
        amount               REAL NOT NULL,
        currency             VARCHAR(10) NOT NULL,
        deadline             TEXT NOT NULL,
        description          TEXT NOT NULL,
        status               TEXT NOT NULL DEFAULT 'SENT',
        created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    // Drop all legacy messaging tables — only dm_conversations + dm_messages are used
    await pool.query(`DROP TABLE IF EXISTS chat_messages CASCADE`).catch(() => {});
    await pool.query(`DROP TABLE IF EXISTS chat_participants CASCADE`).catch(() => {});
    await pool.query(`DROP TABLE IF EXISTS chat_conversations CASCADE`).catch(() => {});
    await pool.query(`DROP TABLE IF EXISTS messages CASCADE`).catch(() => {});
    await pool.query(`DROP TABLE IF EXISTS conversations CASCADE`).catch(() => {});

    // Merge duplicate dm_conversations: old pair_key used "_" separator; new uses ":".
    // For each underscore-format conversation, migrate messages to the canonical colon-format one.
    try {
      const oldConvs = await pool.query(
        `SELECT id, pair_key, user_a_id, user_b_id FROM dm_conversations WHERE pair_key LIKE '%\\_%' ESCAPE '\\'`
      );
      for (const old of oldConvs.rows) {
        const colonKey = [old.user_a_id, old.user_b_id].sort().join(":");
        const canonical = await pool.query(
          `SELECT id FROM dm_conversations WHERE pair_key = $1 LIMIT 1`, [colonKey]
        );
        if (canonical.rows[0] && canonical.rows[0].id !== old.id) {
          const canonId = canonical.rows[0].id;
          await pool.query(`UPDATE dm_messages SET conversation_id = $1 WHERE conversation_id = $2`, [canonId, old.id]).catch(() => {});
          await pool.query(`UPDATE dm_reads SET conversation_id = $1 WHERE conversation_id = $2`, [canonId, old.id]).catch(() => {});
          await pool.query(`UPDATE dm_conversations SET updated_at = NOW() WHERE id = $1`, [canonId]).catch(() => {});
          await pool.query(`DELETE FROM dm_conversations WHERE id = $1`, [old.id]).catch(() => {});
          console.log(`[migrations] merged duplicate conv ${old.id} → ${canonId} (pair ${colonKey})`);
        } else if (!canonical.rows[0]) {
          await pool.query(`UPDATE dm_conversations SET pair_key = $1 WHERE id = $2`, [colonKey, old.id]).catch(() => {});
          console.log(`[migrations] renamed conv pair_key ${old.pair_key} → ${colonKey}`);
        }
      }
      if (oldConvs.rows.length > 0) console.log(`[migrations] duplicate conv cleanup done (${oldConvs.rows.length} processed)`);
    } catch (mergeErr) {
      console.error("[migrations] duplicate conv merge failed (non-fatal):", mergeErr);
    }

    console.log("[migrations] startup migrations OK — legacy messaging tables removed");
  } catch (err) {
    console.error("[migrations] startup migration failed:", err);
  }
}

(async () => {
  await runStartupMigrations();
  runStartupBackup().catch(() => {});

  // ── Wersja build (dla auto-update) ─────────────────────────────────────────
  app.get("/api/version", (_req: Request, res: Response) => {
    res.json({ version: BUILD_TS });
  });

  // ── Dynamiczny service worker z wstrzykniętym BUILD_TS ─────────────────────
  // Dzięki temu każde uruchomienie serwera = nowy timestamp = nowa wersja SW
  // = przeglądarka instaluje nowy SW = app.reload() dla wszystkich klientów
  const SW_PATH = path.resolve(process.cwd(), "client/public/sw.js");
  app.get("/sw.js", (_req: Request, res: Response) => {
    if (!fs.existsSync(SW_PATH)) {
      return res.status(404).send("// service worker not found");
    }
    const injected = fs.readFileSync(SW_PATH, "utf-8").replace(/__BUILD_TS__/g, BUILD_TS);
    res.setHeader("Content-Type", "application/javascript; charset=utf-8");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Service-Worker-Allowed", "/");
    return res.send(injected);
  });

  // Health / diagnostics — secrets presence check (no values, public)
  registerHealthSecretsRoute(app);

  await installAuthFix(app).catch((e: unknown) => console.error("[startup] installAuthFix failed:", e));
  await installRealAuth(app).catch((e: unknown) => console.error("[startup] installRealAuth failed:", e));
  await installSecurityCenter(app, pool).catch((e: unknown) => console.error("[startup] installSecurityCenter failed:", e));
  installRealInvestQuotes(app);
  await installInvestRoutes(app).catch((e: unknown) => console.error("[startup] installInvestRoutes failed:", e));

  app.use("/api/auth", authRouter);

  installChatSafety(app, pool);
  installMessagesFix(app, pool, httpServer);

  await registerRoutes(httpServer, app).catch((e: unknown) => console.error("[startup] registerRoutes failed:", e));

  app.use("/api/transactions", transactionsRouter);
  app.use("/api/messages", messagesRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/resell", resellScanRouter);
  app.use("/api/market", marketScanRouter);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "3000", 10);

  let retries = 0;
  httpServer.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE" && retries < 10) {
      retries++;
      console.error(`[server] Port ${port} in use, retry ${retries}/10 in 1s…`);
      setTimeout(() => {
        httpServer.close();
        httpServer.listen({ port, host: "0.0.0.0", reusePort: true });
      }, 1000);
    } else {
      console.error("[server] HTTP server error:", err);
      process.exit(1);
    }
  });

  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );

  function shutdown(signal: string) {
    log(`${signal} received — closing server gracefully`);
    httpServer.closeAllConnections();
    httpServer.close(() => {
      pool.end().catch(() => {}).finally(() => {
        log("Server closed. Exiting.");
        process.exit(0);
      });
    });
    // Force-exit after 5 s if connections hang
    setTimeout(() => {
      console.error("[server] Forced exit after timeout");
      process.exit(1);
    }, 5000).unref();
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT",  () => shutdown("SIGINT"));
})();
