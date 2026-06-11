/**
 * Kraken exchange API endpoints.
 * Authentication: HMAC-SHA512 with base64-encoded secret.
 * No IP restrictions — works directly from any server.
 */
import express from "express";
import crypto from "crypto";

const router = express.Router();

const VALID_SYMBOLS = new Set(["BTCUSDT", "ETHUSDT", "SOLUSDT"]);
const KRAKEN_PAIRS: Record<string, string> = {
  BTCUSDT: "XBTUSD", ETHUSDT: "ETHUSD", SOLUSDT: "SOLUSD",
};

function krakenSign(
  apiSecret: string, path: string, params: Record<string, any>,
): { sign: string; body: string } {
  const nonce = Date.now() * 1000;
  const allParams = { ...params, nonce: nonce.toString() };
  const body = new URLSearchParams(allParams as Record<string, string>).toString();
  const sha256 = crypto.createHash("sha256").update(nonce + body).digest();
  const hmacInput = Buffer.concat([Buffer.from(path), sha256]);
  const sign = crypto
    .createHmac("sha512", Buffer.from(apiSecret, "base64"))
    .update(hmacInput)
    .digest("base64");
  return { sign, body };
}

async function krakenPrivate(
  apiKey: string, apiSecret: string, path: string, params: Record<string, any> = {},
) {
  const { sign, body } = krakenSign(apiSecret, path, params);
  const r = await fetch(`https://api.kraken.com${path}`, {
    method: "POST",
    headers: {
      "API-Key": apiKey.trim(),
      "API-Sign": sign,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) {
    let txt = ""; try { txt = await r.text(); } catch { /* ignore */ }
    throw new Error(`Kraken HTTP ${r.status}: ${txt.slice(0, 200)}`);
  }
  const d = await r.json() as any;
  if (d.error?.length) throw new Error(`Kraken: ${d.error[0]}`);
  return d.result;
}

// POST /api/kraken/balance
router.post("/balance", async (req, res) => {
  const { apiKey, secret } = req.body;
  if (!apiKey || !secret) return res.status(400).json({ error: "Missing keys" });
  try {
    const result = await krakenPrivate(apiKey, secret, "/0/private/Balance");
    const usd = parseFloat(result.ZUSD ?? "0");
    const eur = parseFloat(result.ZEUR ?? "0");
    const btc = parseFloat(result.XXBT ?? "0");
    const eth = parseFloat(result.XETH ?? "0");
    // Primary fiat balance: USD > EUR > 0; secondary: crypto
    const balance  = usd > 0 ? usd : eur > 0 ? eur : btc;
    const currency = usd > 0 ? "USD" : eur > 0 ? "EUR" : "BTC";
    res.json({ balance, currency, usd, eur, btc, eth });
  } catch (e: any) { res.status(502).json({ error: e.message }); }
});

// POST /api/kraken/order — market buy (long) or sell (short)
router.post("/order", async (req, res) => {
  const { apiKey, secret, symbol, side, qty } = req.body;
  if (!apiKey || !secret || !symbol || !side || !qty) return res.status(400).json({ error: "Missing params" });
  if (!VALID_SYMBOLS.has(symbol)) return res.status(400).json({ error: "Invalid symbol" });
  if (!["long", "short"].includes(side)) return res.status(400).json({ error: "Invalid side" });
  const parsedQty = parseFloat(qty);
  if (!Number.isFinite(parsedQty) || parsedQty <= 0) return res.status(400).json({ error: "Invalid qty" });
  try {
    const result = await krakenPrivate(apiKey, secret, "/0/private/AddOrder", {
      pair:      KRAKEN_PAIRS[symbol],
      type:      side === "long" ? "buy" : "sell",
      ordertype: "market",
      volume:    parsedQty.toString(),
    });
    res.json({ txid: result.txid?.[0], descr: result.descr?.order });
  } catch (e: any) { res.status(502).json({ error: e.message }); }
});

// POST /api/kraken/close — close position (reverse trade)
router.post("/close", async (req, res) => {
  const { apiKey, secret, symbol, side, qty } = req.body;
  if (!apiKey || !secret || !symbol || !side || !qty) return res.status(400).json({ error: "Missing params" });
  if (!VALID_SYMBOLS.has(symbol)) return res.status(400).json({ error: "Invalid symbol" });
  const parsedQty = parseFloat(qty);
  if (!Number.isFinite(parsedQty) || parsedQty <= 0) return res.status(400).json({ error: "Invalid qty" });
  try {
    const closeSide = side === "long" ? "sell" : "buy";
    const result = await krakenPrivate(apiKey, secret, "/0/private/AddOrder", {
      pair:      KRAKEN_PAIRS[symbol],
      type:      closeSide,
      ordertype: "market",
      volume:    parsedQty.toString(),
    });
    res.json({ txid: result.txid?.[0], descr: result.descr?.order });
  } catch (e: any) { res.status(502).json({ error: e.message }); }
});

// POST /api/kraken/test — diagnose API keys
router.post("/test", async (req, res) => {
  const { apiKey, secret } = req.body;
  if (!apiKey || !secret) return res.status(400).json({ error: "Missing keys" });
  try {
    const [balance, tradeBalance] = await Promise.all([
      krakenPrivate(apiKey, secret, "/0/private/Balance"),
      krakenPrivate(apiKey, secret, "/0/private/TradeBalance").catch(() => null),
    ]);
    // mf = free margin, ml = margin level — present only when margin is enabled on the account
    const freeMargin   = tradeBalance?.mf != null ? parseFloat(tradeBalance.mf) : null;
    const marginLevel  = tradeBalance?.ml != null ? parseFloat(tradeBalance.ml) : null;
    const marginEnabled = freeMargin !== null;
    res.json({
      readOk:  true,
      tradeOk: true,
      balance: {
        USD: parseFloat(balance.ZUSD ?? "0"),
        EUR: parseFloat(balance.ZEUR ?? "0"),
        BTC: parseFloat(balance.XXBT ?? "0"),
        ETH: parseFloat(balance.XETH ?? "0"),
      },
      equity:        tradeBalance ? parseFloat(tradeBalance.e ?? "0") : null,
      marginEnabled, freeMargin, marginLevel,
    });
  } catch (e: any) {
    res.json({ readOk: false, tradeOk: false, error: e.message });
  }
});

export default router;
