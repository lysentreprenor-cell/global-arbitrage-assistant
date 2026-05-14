import type { Express } from "express";
import { randomUUID } from "crypto";
import { pool } from "./pool";
import { resolveRequestUser } from "./adminHelper";
import { storage } from "./storage";

// ── Demo asset catalog ─────────────────────────────────────────────────────
// Prices are deterministic: base ± sine variation based on UTC day+hour.
// No Math.random() — same price for every user at the same time.
const DEMO_CATALOG = [
  { id: "btc",  name: "Bitcoin",           symbol: "BTC",  basePrice: 64230.50, category: "crypto", colorClass: "text-amber-500",  bgClass: "bg-amber-500/10"  },
  { id: "eth",  name: "Ethereum",          symbol: "ETH",  basePrice: 3450.20,  category: "crypto", colorClass: "text-blue-500",   bgClass: "bg-blue-500/10"   },
  { id: "sol",  name: "Solana",            symbol: "SOL",  basePrice: 148.60,   category: "crypto", colorClass: "text-violet-500", bgClass: "bg-violet-500/10" },
  { id: "aapl", name: "Apple Inc.",        symbol: "AAPL", basePrice: 178.40,   category: "stock",  colorClass: "text-red-500",    bgClass: "bg-red-500/10"    },
  { id: "msft", name: "Microsoft",         symbol: "MSFT", basePrice: 415.20,   category: "stock",  colorClass: "text-cyan-500",   bgClass: "bg-cyan-500/10"   },
  { id: "voo",  name: "Vanguard S&P 500",  symbol: "VOO",  basePrice: 482.10,   category: "etf",    colorClass: "text-green-500",  bgClass: "bg-green-500/10"  },
];

// ── Helper: resolve assetId from either assetId or symbol (case-insensitive) ─
function resolveAsset(rawAssetId?: string, rawSymbol?: string) {
  if (rawAssetId) {
    const a = DEMO_CATALOG.find(c => c.id === rawAssetId.toLowerCase());
    if (a) return a;
  }
  if (rawSymbol) {
    const a = DEMO_CATALOG.find(c => c.symbol === rawSymbol.toUpperCase());
    if (a) return a;
  }
  return null;
}

function getDemoQuote(asset: typeof DEMO_CATALOG[number]) {
  const now = new Date();
  const daySlot = now.getUTCDay() * 24 + now.getUTCHours(); // changes hourly
  const phase = asset.id.charCodeAt(0) + asset.id.charCodeAt(1);
  const variation = Math.sin(daySlot * 0.4 + phase) * 0.04;
  const price = +(asset.basePrice * (1 + variation)).toFixed(2);
  const change24h = +(variation * 100).toFixed(2);
  const sparkline = Array.from({ length: 7 }, (_, i) => {
    const v = Math.sin((daySlot - (6 - i)) * 0.4 + phase) * 0.04;
    return +(asset.basePrice * (1 + v)).toFixed(2);
  });
  return { ...asset, price, change24h, sparkline };
}

// ── Shared security event logger (fire-and-forget) ─────────────────────────
function logSecurityEvent(userId: string, type: string, description: string, meta: object) {
  pool.query(
    `INSERT INTO security_events (id, user_id, type, description, metadata) VALUES ($1,$2,$3,$4,$5)`,
    [randomUUID(), userId, type, description, JSON.stringify(meta)]
  ).catch(() => {});
}

// ── DB init ────────────────────────────────────────────────────────────────
async function ensureInvestTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS portfolio_holdings (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id        TEXT NOT NULL,
      asset_id       TEXT NOT NULL,
      quantity       NUMERIC(18,8) NOT NULL DEFAULT 0,
      avg_cost       NUMERIC(18,8) NOT NULL DEFAULT 0,
      total_invested NUMERIC(18,8) NOT NULL DEFAULT 0,
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, asset_id)
    )
  `).catch(() => {});

  await pool.query(`
    CREATE TABLE IF NOT EXISTS portfolio_transactions (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id        TEXT NOT NULL,
      asset_id       TEXT NOT NULL,
      type           TEXT NOT NULL DEFAULT 'buy',
      quantity       NUMERIC(18,8) NOT NULL,
      price_per_unit NUMERIC(18,8) NOT NULL,
      total_amount   NUMERIC(18,8) NOT NULL,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `).catch(() => {});

  await pool.query(`CREATE INDEX IF NOT EXISTS ph_user_idx ON portfolio_holdings(user_id)`).catch(() => {});
  await pool.query(`CREATE INDEX IF NOT EXISTS pt_user_idx ON portfolio_transactions(user_id)`).catch(() => {});
}

// ── Shared: build holdings array from DB rows + live quotes ───────────────
function buildHoldings(rows: any[], quoteMap: Record<string, ReturnType<typeof getDemoQuote>>) {
  return rows.map(h => {
    const q = quoteMap[h.asset_id];
    const qty = parseFloat(h.quantity);
    const invested = parseFloat(h.total_invested);
    const avgCost = parseFloat(h.avg_cost);
    const currentPrice = q?.price ?? 0;
    const currentValue = +(currentPrice * qty).toFixed(2);
    const gainLoss = +(currentValue - invested).toFixed(2);
    const gainLossPct = invested > 0 ? +((gainLoss / invested) * 100).toFixed(2) : 0;
    return {
      assetId: h.asset_id,
      symbol: q?.symbol ?? h.asset_id.toUpperCase(),
      name: q?.name ?? h.asset_id,
      colorClass: q?.colorClass ?? "text-gray-500",
      bgClass: q?.bgClass ?? "bg-gray-500/10",
      quantity: qty,
      avgCost,
      averageBuyPrice: avgCost,   // alias expected by new frontend
      totalInvested: invested,
      currentPrice,
      currentValue,
      gainLoss,
      gainLossPct,
      updatedAt: h.updated_at,
    };
  });
}

// ── Route installer ────────────────────────────────────────────────────────
export async function installInvestRoutes(app: Express) {
  await ensureInvestTables();

  // ── GET /api/invest/quotes ─────────────────────────────────────────────
  // Returns deterministic demo prices (no Math.random).
  // Aliased as both `generatedAt` and `updatedAt` for frontend compatibility.
  app.get("/api/invest/quotes", (_req, res) => {
    const quotes = DEMO_CATALOG.map(getDemoQuote);
    const now = new Date().toISOString();
    res.json({
      quotes,
      generatedAt: now,
      updatedAt: now,
      source: "demo-sin-based",
    });
  });

  // ── GET /api/invest/portfolio ──────────────────────────────────────────
  // Returns holdings + transactions + summary + cashBalance.
  app.get("/api/invest/portfolio", async (req, res) => {
    try {
      const user = await resolveRequestUser(req);
      if (!user?.id) return res.status(401).json({ error: "Unauthorized" });

      const [holdingsRes, txRes, userRes] = await Promise.all([
        pool.query(
          `SELECT * FROM portfolio_holdings WHERE user_id = $1 AND quantity > 0 ORDER BY total_invested DESC`,
          [user.id]
        ),
        pool.query(
          `SELECT id, asset_id, type, quantity::float, price_per_unit::float, total_amount::float, created_at
           FROM portfolio_transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`,
          [user.id]
        ),
        pool.query(`SELECT balance FROM app_users WHERE id = $1`, [user.id]),
      ]);

      const quotes = DEMO_CATALOG.map(getDemoQuote);
      const quoteMap = Object.fromEntries(quotes.map(q => [q.id, q]));
      const holdings = buildHoldings(holdingsRes.rows, quoteMap);

      const totalValue       = +holdings.reduce((s, h) => s + h.currentValue, 0).toFixed(2);
      const totalInvested    = +holdings.reduce((s, h) => s + h.totalInvested, 0).toFixed(2);
      const totalGainLoss    = +(totalValue - totalInvested).toFixed(2);
      const totalGainLossPct = totalInvested > 0 ? +((totalGainLoss / totalInvested) * 100).toFixed(2) : 0;

      // Enrich transactions — keep both raw DB names AND frontend-expected aliases
      const catalogMap = Object.fromEntries(DEMO_CATALOG.map(a => [a.id, a]));
      const transactions = txRes.rows.map(t => ({
        ...t,
        symbol:     catalogMap[t.asset_id]?.symbol     ?? t.asset_id.toUpperCase(),
        name:       catalogMap[t.asset_id]?.name       ?? t.asset_id,
        colorClass: catalogMap[t.asset_id]?.colorClass ?? "text-gray-500",
        bgClass:    catalogMap[t.asset_id]?.bgClass    ?? "bg-gray-500/10",
        // Frontend aliases
        price:       t.price_per_unit,
        amount:      t.total_amount,
        createdAt:   t.created_at,
      }));

      const cashBalance = parseFloat(userRes.rows[0]?.balance ?? "0");

      res.json({
        holdings,
        transactions,
        cashBalance,                   // ← consumed by new frontend
        summary: {
          totalValue, totalInvested, totalGainLoss, totalGainLossPct,
          assetCount: holdings.length,
        },
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── POST /api/invest/buy ───────────────────────────────────────────────
  // Accepts: { assetId?, symbol?, amountUSD?, amountUsd? }
  // Uses atomic BEGIN/COMMIT/ROLLBACK.
  app.post("/api/invest/buy", async (req, res) => {
    const body = req.body ?? {};

    // Resolve asset — accept either assetId (e.g. "btc") or symbol (e.g. "BTC")
    const catalog = resolveAsset(body.assetId, body.symbol);
    if (!catalog)
      return res.status(404).json({
        error: body.assetId || body.symbol
          ? `Asset '${body.assetId ?? body.symbol}' not found`
          : "assetId or symbol is required",
      });

    // Resolve amount — accept amountUSD or amountUsd
    const rawAmount = body.amountUSD ?? body.amountUsd;
    const amountUSD = parseFloat(rawAmount);
    if (!isFinite(amountUSD) || amountUSD <= 0)
      return res.status(400).json({ error: "amountUSD must be a positive number" });

    let user: any;
    try {
      user = await resolveRequestUser(req);
      if (!user?.id) return res.status(401).json({ error: "Unauthorized" });
    } catch {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const quote    = getDemoQuote(catalog);
    const quantity = +(amountUSD / quote.price).toFixed(8);
    const txId     = randomUUID();

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // 1. Lock row + check balance atomically
      const userRes = await client.query(
        `SELECT balance FROM app_users WHERE id = $1 FOR UPDATE`,
        [user.id]
      );
      if (userRes.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "User not found" });
      }
      const currentBalance = parseFloat(userRes.rows[0].balance);
      if (currentBalance < amountUSD) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          error: `Insufficient balance. Available: $${currentBalance.toFixed(2)}`,
        });
      }

      // 2. Deduct balance
      const newBalance = +(currentBalance - amountUSD).toFixed(2);
      await client.query(`UPDATE app_users SET balance = $1 WHERE id = $2`, [newBalance, user.id]);

      // 3. Upsert portfolio_holdings (weighted average cost)
      await client.query(`
        INSERT INTO portfolio_holdings (id, user_id, asset_id, quantity, avg_cost, total_invested, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (user_id, asset_id) DO UPDATE SET
          quantity       = portfolio_holdings.quantity + EXCLUDED.quantity,
          avg_cost       = (portfolio_holdings.total_invested + EXCLUDED.total_invested)
                           / NULLIF(portfolio_holdings.quantity + EXCLUDED.quantity, 0),
          total_invested = portfolio_holdings.total_invested + EXCLUDED.total_invested,
          updated_at     = NOW()
      `, [randomUUID(), user.id, catalog.id, quantity, quote.price, amountUSD]);

      // 4. Insert portfolio_transaction record
      await client.query(`
        INSERT INTO portfolio_transactions (id, user_id, asset_id, type, quantity, price_per_unit, total_amount)
        VALUES ($1, $2, $3, 'buy', $4, $5, $6)
      `, [txId, user.id, catalog.id, quantity, quote.price, amountUSD]);

      await client.query("COMMIT");

      // Fire-and-forget (outside TX)
      storage.createTransaction({
        userId: user.id, type: "payment", status: "completed",
        amount: -amountUSD,
        title: `Bought ${catalog.symbol}`,
        subtitle: `${quantity.toFixed(6)} ${catalog.symbol} @ $${quote.price.toLocaleString()}`,
        category: "Investment",
      }).catch(() => {});

      logSecurityEvent(user.id, "invest_buy",
        `Zakup ${catalog.symbol}: ${quantity.toFixed(6)} szt. za $${amountUSD.toFixed(2)}`,
        { assetId: catalog.id, symbol: catalog.symbol, amountUSD, quantity, price: quote.price, txId }
      );

      res.json({ success: true, quantity, price: quote.price, amountUSD, newBalance, txId });
    } catch (e: any) {
      await client.query("ROLLBACK").catch(() => {});
      res.status(400).json({ error: e.message });
    } finally {
      client.release();
    }
  });

  // ── POST /api/invest/sell ──────────────────────────────────────────────
  // Accepts: { assetId?, symbol?, quantity }
  // Uses atomic BEGIN/COMMIT/ROLLBACK.
  app.post("/api/invest/sell", async (req, res) => {
    const body = req.body ?? {};

    // Validate quantity first
    const { quantity: rawQty } = body;
    if (rawQty === undefined || rawQty === null || rawQty === "")
      return res.status(400).json({ error: "quantity is required" });
    const quantity = parseFloat(rawQty);
    if (!isFinite(quantity))
      return res.status(400).json({ error: "quantity must be a valid number" });
    if (quantity <= 0)
      return res.status(400).json({ error: "quantity must be greater than 0" });

    // Resolve asset — accept either assetId or symbol
    const catalog = resolveAsset(body.assetId, body.symbol);
    if (!catalog)
      return res.status(404).json({
        error: body.assetId || body.symbol
          ? `Asset '${body.assetId ?? body.symbol}' not found`
          : "assetId or symbol is required",
      });

    let user: any;
    try {
      user = await resolveRequestUser(req);
      if (!user?.id) return res.status(401).json({ error: "Unauthorized" });
    } catch {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const quote = getDemoQuote(catalog);
    const txId  = randomUUID();

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // 1. Lock holding row + check quantity
      const holdingRes = await client.query(
        `SELECT quantity::float, avg_cost::float, total_invested::float
         FROM portfolio_holdings WHERE user_id=$1 AND asset_id=$2 FOR UPDATE`,
        [user.id, catalog.id]
      );
      if (holdingRes.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: `No holding found for ${catalog.symbol}` });
      }

      const holding    = holdingRes.rows[0];
      const currentQty = parseFloat(holding.quantity);
      if (quantity > currentQty + 1e-10) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          error: `Cannot sell ${quantity.toFixed(6)} ${catalog.symbol}. You hold ${currentQty.toFixed(6)}.`,
        });
      }

      const totalReceived = +(quantity * quote.price).toFixed(2);
      const sellRatio     = Math.min(quantity / currentQty, 1);
      const investedSold  = +(parseFloat(holding.total_invested) * sellRatio).toFixed(8);
      const newQty        = +(currentQty - quantity).toFixed(8);

      // 2. Update or delete holding
      if (newQty <= 1e-10) {
        await client.query(
          `DELETE FROM portfolio_holdings WHERE user_id=$1 AND asset_id=$2`,
          [user.id, catalog.id]
        );
      } else {
        await client.query(`
          UPDATE portfolio_holdings
          SET quantity       = $1,
              total_invested = GREATEST(total_invested - $2, 0),
              updated_at     = NOW()
          WHERE user_id = $3 AND asset_id = $4
        `, [newQty, investedSold, user.id, catalog.id]);
      }

      // 3. Credit balance
      const balRes = await client.query(
        `SELECT balance FROM app_users WHERE id = $1 FOR UPDATE`,
        [user.id]
      );
      const currentBalance = parseFloat(balRes.rows[0]?.balance ?? "0");
      const newBalance = +(currentBalance + totalReceived).toFixed(2);
      await client.query(`UPDATE app_users SET balance = $1 WHERE id = $2`, [newBalance, user.id]);

      // 4. Insert portfolio_transaction
      await client.query(`
        INSERT INTO portfolio_transactions (id, user_id, asset_id, type, quantity, price_per_unit, total_amount)
        VALUES ($1, $2, $3, 'sell', $4, $5, $6)
      `, [txId, user.id, catalog.id, quantity, quote.price, totalReceived]);

      await client.query("COMMIT");

      // Fire-and-forget (outside TX)
      storage.createTransaction({
        userId: user.id, type: "payment", status: "completed",
        amount: totalReceived,
        title: `Sold ${catalog.symbol}`,
        subtitle: `${quantity.toFixed(6)} ${catalog.symbol} @ $${quote.price.toLocaleString()}`,
        category: "Investment",
      }).catch(() => {});

      logSecurityEvent(user.id, "invest_sell",
        `Sprzedaż ${catalog.symbol}: ${quantity.toFixed(6)} szt. za $${totalReceived.toFixed(2)}`,
        { assetId: catalog.id, symbol: catalog.symbol, quantity, price: quote.price, totalReceived, txId }
      );

      res.json({ success: true, quantity, price: quote.price, totalReceived, newBalance, txId });
    } catch (e: any) {
      await client.query("ROLLBACK").catch(() => {});
      res.status(400).json({ error: e.message });
    } finally {
      client.release();
    }
  });

  // ── GET /api/invest/transactions — standalone history fallback ───────────
  app.get("/api/invest/transactions", async (req, res) => {
    try {
      const user = await resolveRequestUser(req);
      if (!user?.id) return res.status(401).json({ error: "Unauthorized" });

      const r = await pool.query(
        `SELECT id, asset_id, type, quantity::float, price_per_unit::float, total_amount::float, created_at
         FROM portfolio_transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`,
        [user.id]
      );
      const catalogMap = Object.fromEntries(DEMO_CATALOG.map(a => [a.id, a]));
      const transactions = r.rows.map(t => ({
        ...t,
        symbol:     catalogMap[t.asset_id]?.symbol     ?? t.asset_id.toUpperCase(),
        name:       catalogMap[t.asset_id]?.name       ?? t.asset_id,
        colorClass: catalogMap[t.asset_id]?.colorClass ?? "text-gray-500",
        bgClass:    catalogMap[t.asset_id]?.bgClass    ?? "bg-gray-500/10",
        price:      t.price_per_unit,
        amount:     t.total_amount,
        createdAt:  t.created_at,
      }));
      res.json({ transactions });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
}
