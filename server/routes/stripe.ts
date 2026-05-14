import type { Express, Request, Response } from "express";
import Stripe from "stripe";
import { getAdminDb } from "../lib/firebaseAdmin";
import { pool } from "../pool";
import { requireAuth } from "../middleware/requireAuth";

// ── Mode detection ────────────────────────────────────────────────────────────
function getPaymentMode(): "test" | "live" {
  const m = (process.env.APP_PAYMENT_MODE ?? "test").toLowerCase();
  if (m !== "test" && m !== "live") {
    throw new Error("APP_PAYMENT_MODE must be 'test' or 'live'");
  }
  return m as "test" | "live";
}

function getStripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  const mode = getPaymentMode();
  const expectedPrefix = mode === "live" ? "sk_live_" : "sk_test_";
  if (!key.startsWith(expectedPrefix)) {
    throw new Error(
      `APP_PAYMENT_MODE=${mode} but STRIPE_SECRET_KEY does not start with ${expectedPrefix}`
    );
  }
  return new Stripe(key, { apiVersion: "2025-03-31.basil" });
}

// ── Firebase: persist payment record ────────────────────────────────────────
async function savePaymentToFirebase(
  session: Stripe.Checkout.Session,
  extra: Record<string, unknown> = {}
): Promise<void> {
  const db = getAdminDb();
  if (!db) {
    console.warn("[stripe/webhook] Firebase Admin not available — skipping Firebase write");
    return;
  }

  const record = {
    provider: "stripe",
    mode: getPaymentMode(),
    status: "paid",
    amount_total: session.amount_total,
    currency: session.currency,
    customer_email: session.customer_details?.email ?? null,
    stripeSessionId: session.id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...extra,
  };

  await db.ref(`payments/${session.id}`).set(record);
  console.log(`[stripe/webhook] Payment saved to Firebase: payments/${session.id}`);
}

const VALID_CURRENCIES = ["NOK", "USD", "EUR", "GBP", "CHF", "PLN"] as const;
type TopupCurrency = typeof VALID_CURRENCIES[number];

// ── DB: credit user wallet after confirmed payment ───────────────────────────
// Fully atomic: uses a DB transaction with SELECT FOR UPDATE to prevent
// any race condition between concurrent webhook retries and verify-session calls.
async function creditUserWallet(
  userId: string,
  amount: number,
  currency: string,
  stripeSessionId: string
): Promise<{ credited: boolean; alreadyCredited: boolean }> {
  const key = currency.toUpperCase() as TopupCurrency;
  if (!VALID_CURRENCIES.includes(key)) {
    console.error(`[TOPUP] creditUserWallet: unsupported currency ${currency}`);
    return { credited: false, alreadyCredited: false };
  }

  const sessionSuffix = stripeSessionId.slice(-8);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // ── Lock the user row so no two concurrent calls can both pass the
    //    duplicate check before either one inserts the transaction record.
    const lockResult = await client.query(
      `SELECT wallets FROM app_users WHERE id = $1 FOR UPDATE`,
      [userId]
    );
    if ((lockResult.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      console.error(`[TOPUP] creditUserWallet: user ${userId} not found`);
      return { credited: false, alreadyCredited: false };
    }

    // ── Idempotency: check INSIDE the lock so concurrent calls serialize ──
    const dupCheck = await client.query(
      `SELECT id FROM transactions WHERE user_id = $1 AND subtitle LIKE $2 LIMIT 1`,
      [userId, `%Stripe #${sessionSuffix}%`]
    );
    if ((dupCheck.rowCount ?? 0) > 0) {
      await client.query("COMMIT");
      console.log(`[TOPUP] IDEMPOTENCY_HIT session_suffix=${sessionSuffix} user=${userId} — skipping double-credit`);
      return { credited: false, alreadyCredited: true };
    }

    // ── Credit wallet ─────────────────────────────────────────────────────
    const row = lockResult.rows[0];
    let wallets: Record<string, number> = row.wallets ?? { NOK: 0, USD: 0, EUR: 0, GBP: 0, CHF: 0, PLN: 0 };

    const balanceBefore = wallets[key] ?? 0;
    console.log(`[TOPUP] BALANCE_BEFORE user=${userId} ${key}=${balanceBefore}`);

    wallets = { ...wallets, [key]: parseFloat((balanceBefore + amount).toFixed(2)) };

    await client.query(
      `UPDATE app_users SET wallets = $1 WHERE id = $2`,
      [JSON.stringify(wallets), userId]
    );
    console.log(`[TOPUP] BALANCE_AFTER user=${userId} ${key}=${wallets[key]}`);

    // ── Insert transaction record ─────────────────────────────────────────
    await client.query(
      `INSERT INTO transactions (user_id, type, status, amount, title, subtitle, category)
       VALUES ($1, 'topup', 'completed', $2, 'Doładowanie kartą', $3, 'Top-up')`,
      [userId, amount, `Stripe #${sessionSuffix}`]
    );
    console.log(`[TOPUP] TOPUP_SAVED +${amount} ${key} → user ${userId} (session_suffix=${sessionSuffix})`);

    await client.query("COMMIT");
    return { credited: true, alreadyCredited: false };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export function registerStripeRoutes(app: Express) {

  // ── 1. Legacy test session (PaymentsTest page) ────────────────────────────
  app.post("/api/stripe/create-checkout-session", async (req: Request, res: Response) => {
    try {
      const stripe = getStripeClient();
      const host = req.headers.origin || `${req.protocol}://${req.headers.host}`;

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [{
          price_data: {
            currency: "nok",
            product_data: {
              name: "Test Payment – Finlys",
              description: "Testowa płatność Stripe Sandbox (100 NOK)",
            },
            unit_amount: 10000,
          },
          quantity: 1,
        }],
        mode: "payment",
        success_url: `${host}/payments-test?success=true`,
        cancel_url: `${host}/payments-test?canceled=true`,
      });

      res.json({ url: session.url });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Stripe error";
      console.error("[stripe] create-checkout-session error:", message);
      res.status(500).json({ error: message });
    }
  });

  // ── 2. Wallet top-up session ──────────────────────────────────────────────
  // POST /api/stripe/create-topup-session
  // Body: { amount: number, currency: string }
  // Auth: Bearer JWT required — userId taken from token, never from body
  app.post("/api/stripe/create-topup-session", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.authUserId!;

      const { amount: rawAmount, currency: rawCurrency } = req.body as {
        amount?: unknown;
        currency?: unknown;
      };

      const amount = Number(rawAmount);
      const rawMax = process.env.TOPUP_MAX_AMOUNT;
      const maxAmount = rawMax === undefined ? 5000 : Number(rawMax);
      if (!Number.isFinite(maxAmount) || maxAmount < 10) {
        console.error(`[stripe] Invalid TOPUP_MAX_AMOUNT env value: "${rawMax}"`);
        return res.status(500).json({ error: "Server misconfiguration: invalid TOPUP_MAX_AMOUNT" });
      }
      if (!Number.isFinite(amount) || amount < 10 || amount > maxAmount) {
        return res.status(400).json({ error: `amount must be between 10 and ${maxAmount}` });
      }

      const currency = (String(rawCurrency ?? "NOK").toUpperCase()) as TopupCurrency;
      if (!VALID_CURRENCIES.includes(currency)) {
        return res.status(400).json({ error: `currency must be one of ${VALID_CURRENCIES.join(", ")}` });
      }

      const stripe = getStripeClient();
      const host = req.headers.origin || `${req.protocol}://${req.headers.host}`;
      const stripeCurrency = currency.toLowerCase();
      const unitAmount = Math.round(amount * 100);

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [{
          price_data: {
            currency: stripeCurrency,
            product_data: {
              name: "Doładowanie portfela – Finlys",
              description: `Zasilenie konta o ${amount} ${currency}`,
            },
            unit_amount: unitAmount,
          },
          quantity: 1,
        }],
        mode: "payment",
        metadata: {
          type: "wallet_topup",
          userId,
          amount: String(amount),
          currency,
        },
        success_url: `${host}/wallet/top-up?success=true&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${host}/wallet/top-up`,
      });

      console.log(`[stripe] payment_created session=${session.id} user=${userId} currency=${currency} mode=${getPaymentMode()}`);
      res.json({ url: session.url });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Stripe error";
      console.error("[stripe] create-topup-session error:", message);
      res.status(500).json({ error: message });
    }
  });

  // ── 3. Verify session (client-side fallback for when webhook is missing) ───
  // GET /api/stripe/verify-session?session_id=cs_xxx
  // Fetches the Stripe session, credits the wallet if paid, idempotent.
  // Requires the caller to be authenticated as the session owner.
  app.get("/api/stripe/verify-session", requireAuth, async (req: Request, res: Response) => {
    const sessionId = req.query.session_id as string | undefined;
    if (!sessionId || typeof sessionId !== "string" || !sessionId.startsWith("cs_")) {
      return res.status(400).json({ error: "session_id is required and must start with cs_" });
    }

    const callerId = req.authUserId!;

    try {
      const stripe = getStripeClient();
      console.log(`[TOPUP] VERIFY_SESSION_REQUEST session_id=${sessionId} caller=${callerId}`);

      const session = await stripe.checkout.sessions.retrieve(sessionId);
      console.log(`[TOPUP] CHECKOUT_COMPLETED session_id=${session.id} payment_status=${session.payment_status}`);

      const meta = session.metadata ?? {};
      console.log(`[TOPUP] TOPUP_METADATA type=${meta.type} userId=${meta.userId} amount=${meta.amount} currency=${meta.currency}`);

      // Ownership check: caller must be the user this session was created for
      if (meta.userId && meta.userId !== callerId) {
        console.warn(`[TOPUP] VERIFY_SESSION_OWNERSHIP_FAIL session=${sessionId} meta.userId=${meta.userId} caller=${callerId}`);
        return res.status(403).json({ error: "Session does not belong to the authenticated user" });
      }

      if (session.payment_status !== "paid") {
        return res.json({ credited: false, alreadyCredited: false, reason: `payment_status=${session.payment_status}` });
      }

      if (meta.type !== "wallet_topup" || !meta.userId) {
        return res.json({ credited: false, alreadyCredited: false, reason: "not a wallet_topup session" });
      }

      const rawAmount = meta.amount ?? meta.amountNok;
      const currency = meta.currency ?? "NOK";
      const parsedAmount = rawAmount ? parseFloat(rawAmount) : NaN;

      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ error: "Invalid amount in session metadata" });
      }

      const result = await creditUserWallet(meta.userId, parsedAmount, currency, session.id);

      // Also save to Firebase (fire-and-forget, non-blocking)
      savePaymentToFirebase(session, {
        type: "wallet_topup",
        userId: meta.userId,
        amount: meta.amount,
        currency,
      }).catch((err: unknown) => {
        console.warn("[stripe/verify-session] Firebase write error:", (err as Error).message);
      });

      return res.json({
        credited: result.credited,
        alreadyCredited: result.alreadyCredited,
        amount: parsedAmount,
        currency,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Stripe error";
      console.error("[stripe/verify-session] error:", message);
      return res.status(500).json({ error: message });
    }
  });

  // ── 4. Webhook ────────────────────────────────────────────────────────────
  app.post("/api/stripe/webhook", async (req: Request, res: Response) => {
    const sig = req.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;

    console.log(`[TOPUP] WEBHOOK_RECEIVED sig_present=${!!sig} secret_set=${!!webhookSecret}`);

    if (!rawBody) {
      console.error("[stripe/webhook] Raw body not available");
      return res.status(400).json({ error: "Raw body missing" });
    }

    // In live mode, signature is mandatory
    if (getPaymentMode() === "live" && (!webhookSecret || !sig)) {
      console.error("[stripe] payment_failed WEBHOOK_NO_SIGNATURE — live mode requires STRIPE_WEBHOOK_SECRET");
      return res.status(400).json({ error: "Webhook signature required in live mode" });
    }

    let event: Stripe.Event;

    if (webhookSecret && sig) {
      try {
        const stripe = getStripeClient();
        event = stripe.webhooks.constructEvent(rawBody, sig as string, webhookSecret);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Signature verification failed";
        console.error("[stripe/webhook] Signature error:", message);
        return res.status(400).json({ error: `Webhook signature verification failed: ${message}` });
      }
    } else {
      console.warn("[stripe/webhook] STRIPE_WEBHOOK_SECRET not set — skipping signature verification (test mode only)");
      try {
        event = JSON.parse(rawBody.toString("utf-8")) as Stripe.Event;
      } catch {
        return res.status(400).json({ error: "Invalid JSON body" });
      }
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      console.log(`[TOPUP] CHECKOUT_COMPLETED session_id=${session.id} payment_status=${session.payment_status}`);

      const meta = session.metadata ?? {};
      const isWalletTopup = meta.type === "wallet_topup";
      console.log(`[TOPUP] TOPUP_METADATA type=${meta.type} userId=${meta.userId} amount=${meta.amount} currency=${meta.currency}`);

      if (isWalletTopup && meta.userId) {
        console.log(`[stripe] payment_created session=${session.id} user=${meta.userId} mode=${getPaymentMode()}`);
      }

      // Save to Firebase regardless of type
      try {
        await savePaymentToFirebase(session, isWalletTopup ? {
          type: "wallet_topup",
          userId: meta.userId,
          amount: meta.amount ?? meta.amountNok,
          currency: meta.currency ?? "NOK",
        } : {});
      } catch (err: unknown) {
        console.error("[stripe/webhook] Firebase write error:", (err as Error).message);
      }

      // Credit wallet only for wallet_topup payments
      if (isWalletTopup && meta.userId) {
        const rawAmount = meta.amount ?? meta.amountNok;
        const currency = meta.currency ?? "NOK";
        const parsedAmount = rawAmount ? parseFloat(rawAmount) : NaN;
        if (!isNaN(parsedAmount) && parsedAmount > 0) {
          try {
            const result = await creditUserWallet(meta.userId, parsedAmount, currency, session.id);
            if (result.credited) {
              console.log(`[stripe] payment_completed session=${session.id} user=${meta.userId} currency=${currency} mode=${getPaymentMode()}`);
            } else if (result.alreadyCredited) {
              console.log(`[stripe] payment_duplicate session=${session.id} user=${meta.userId}`);
            } else {
              console.error(`[stripe] payment_failed session=${session.id} user=${meta.userId} reason=credit_returned_false`);
            }
          } catch (err: unknown) {
            console.error(`[stripe] payment_failed session=${session.id} user=${meta.userId} error=${(err as Error).message}`);
          }
        }
      }
    } else {
      console.log(`[stripe/webhook] Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  });
}
