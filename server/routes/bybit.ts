import express from "express";
import crypto from "crypto";

const router = express.Router();

const VALID_SYMBOLS = new Set(["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT"]);

async function bybitFetch(
  method: "GET" | "POST",
  path: string,
  apiKey: string,
  secret: string,
  testnet: boolean,
  params?: Record<string, any>
) {
  const base = testnet ? "https://api-testnet.bybit.com" : "https://api.bybit.com";
  const ts = Date.now().toString();
  const recvWindow = "5000";
  let paramStr = "";
  let url = base + path;
  let fetchBody: string | undefined;

  if (method === "GET" && params) {
    paramStr = new URLSearchParams(params as Record<string, string>).toString();
    url += "?" + paramStr;
  } else if (method === "POST" && params) {
    fetchBody = JSON.stringify(params);
    paramStr = fetchBody;
  }

  const toSign = ts + apiKey + recvWindow + paramStr;
  const sig = crypto.createHmac("sha256", secret).update(toSign).digest("hex");

  const r = await fetch(url, {
    method,
    headers: {
      "X-BAPI-API-KEY": apiKey,
      "X-BAPI-SIGN": sig,
      "X-BAPI-SIGN-TYPE": "2",
      "X-BAPI-TIMESTAMP": ts,
      "X-BAPI-RECV-WINDOW": recvWindow,
      "Content-Type": "application/json",
    },
    body: fetchBody,
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) {
    let body = "";
    try { body = await r.text(); } catch { /* ignore */ }
    throw new Error(`Bybit HTTP ${r.status}: ${body.slice(0, 200)}`);
  }
  const data = await r.json() as any;
  if (data.retCode !== 0) throw new Error(`Bybit error ${data.retCode}: ${data.retMsg}`);
  return data;
}

// POST /api/bybit/balance — tries UNIFIED, CONTRACT, SPOT; returns USDT balance
router.post("/balance", async (req, res) => {
  const { apiKey, secret, testnet } = req.body;
  if (!apiKey || !secret) return res.status(400).json({ error: "Missing keys" });
  const accountTypes = ["UNIFIED", "CONTRACT", "SPOT"];
  for (const accountType of accountTypes) {
    try {
      const data = await bybitFetch("GET", "/v5/account/wallet-balance", apiKey, secret, !!testnet, { accountType });
      const coins: any[] = data.result?.list?.[0]?.coin ?? [];
      // API call succeeded — return balance even if 0 (funds may be in margin)
      const usdt = coins.find((c: any) => c.coin === "USDT");
      if (usdt) {
        const balance   = parseFloat(usdt.walletBalance ?? "0");
        const equity    = parseFloat(usdt.equity ?? usdt.walletBalance ?? "0");
        const available = parseFloat(usdt.availableToWithdraw ?? usdt.availableBalance ?? usdt.walletBalance ?? "0");
        return res.json({ balance, equity, available, coin: "USDT", accountType });
      }
      // No USDT coin — return first available coin or 0
      if (coins.length > 0) {
        const c = coins[0];
        return res.json({ balance: parseFloat(c.walletBalance ?? "0"), equity: parseFloat(c.equity ?? c.walletBalance ?? "0"), coin: c.coin, accountType });
      }
      // Account type accessible but no coins — return 0 rather than error
      return res.json({ balance: 0, equity: 0, coin: "USDT", accountType });
    } catch { /* try next account type */ }
  }
  res.status(502).json({ error: "Nie można pobrać salda — sprawdź klucze API" });
});

// POST /api/bybit/order — place market order
router.post("/order", async (req, res) => {
  const { apiKey, secret, testnet, symbol, side, qty, leverage } = req.body;
  if (!apiKey || !secret || !symbol || !side || !qty) return res.status(400).json({ error: "Missing params" });
  if (!VALID_SYMBOLS.has(symbol)) return res.status(400).json({ error: "Invalid symbol" });
  if (!["long","short"].includes(side)) return res.status(400).json({ error: "Invalid side" });
  const parsedQty = parseFloat(qty);
  if (!Number.isFinite(parsedQty) || parsedQty <= 0) return res.status(400).json({ error: "Invalid qty" });
  try {
    // Set leverage
    if (leverage && leverage > 1) {
      try {
        await bybitFetch("POST", "/v5/position/set-leverage", apiKey, secret, !!testnet, {
          category: "linear", symbol,
          buyLeverage: String(leverage),
          sellLeverage: String(leverage),
        });
      } catch { /* ignore — may already be set */ }
    }
    const data = await bybitFetch("POST", "/v5/order/create", apiKey, secret, !!testnet, {
      category: "linear",
      symbol,
      side: side === "long" ? "Buy" : "Sell",
      orderType: "Market",
      qty: String(parsedQty),
      positionIdx: 0,
    });
    res.json({ orderId: data.result?.orderId, retCode: data.retCode });
  } catch (e: any) { res.status(502).json({ error: e.message }); }
});

// POST /api/bybit/close — close position (reduce only)
router.post("/close", async (req, res) => {
  const { apiKey, secret, testnet, symbol, side, qty } = req.body;
  if (!apiKey || !secret || !symbol || !side || !qty) return res.status(400).json({ error: "Missing params" });
  if (!VALID_SYMBOLS.has(symbol)) return res.status(400).json({ error: "Invalid symbol" });
  const parsedQty = parseFloat(qty);
  if (!Number.isFinite(parsedQty) || parsedQty <= 0) return res.status(400).json({ error: "Invalid qty" });
  try {
    const data = await bybitFetch("POST", "/v5/order/create", apiKey, secret, !!testnet, {
      category: "linear",
      symbol,
      side: side === "long" ? "Sell" : "Buy",
      orderType: "Market",
      qty: String(parsedQty),
      reduceOnly: true, positionIdx: 0,
    });
    res.json({ orderId: data.result?.orderId, retCode: data.retCode });
  } catch (e: any) { res.status(502).json({ error: e.message }); }
});

// POST /api/bybit/position
router.post("/position", async (req, res) => {
  const { apiKey, secret, testnet, symbol } = req.body;
  if (!apiKey || !secret) return res.status(400).json({ error: "Missing keys" });
  try {
    const data = await bybitFetch("GET", "/v5/position/list", apiKey, secret, !!testnet, {
      category: "linear",
      symbol: symbol || "BTCUSDT",
    });
    res.json(data.result ?? {});
  } catch (e: any) { res.status(502).json({ error: e.message }); }
});

// POST /api/bybit/test — diagnose API key: read + trade permissions, account type, balance
router.post("/test", async (req, res) => {
  const { apiKey, secret, testnet } = req.body;
  if (!apiKey || !secret) return res.status(400).json({ error: "Missing keys" });
  const base = testnet ? "https://api-testnet.bybit.com" : "https://api.bybit.com";
  const results: Record<string, any> = { base, testnet: !!testnet, readOk: false, tradeOk: false };

  // 1) Read permission: wallet balance (try all account types)
  for (const accountType of ["UNIFIED", "CONTRACT", "SPOT"]) {
    try {
      const data = await bybitFetch("GET", "/v5/account/wallet-balance", apiKey, secret, !!testnet, { accountType });
      const coins: any[] = data.result?.list?.[0]?.coin ?? [];
      results[accountType] = {
        ok: true, retCode: data.retCode,
        coins: coins.map((c: any) => ({ coin: c.coin, balance: c.walletBalance })).filter((c: any) => parseFloat(c.balance) > 0),
      };
      results.readOk = true;
      break;
    } catch (e: any) {
      results[accountType] = { ok: false, error: e.message };
    }
  }

  // 2) Trade permission: set-leverage (non-destructive write — requires Trade permission)
  try {
    const d = await bybitFetch("POST", "/v5/position/set-leverage", apiKey, secret, !!testnet, {
      category: "linear", symbol: "BTCUSDT", buyLeverage: "10", sellLeverage: "10",
    });
    // retCode 0 = success; 110043 = "leverage not modified" — both mean Trade permission OK
    results.tradeOk = d.retCode === 0 || d.retCode === 110043;
    results.tradeRetCode = d.retCode;
    results.tradeRetMsg = d.retMsg;
  } catch (e: any) {
    results.tradeOk = false;
    results.tradeError = e.message;
  }

  res.json(results);
});

export default router;
