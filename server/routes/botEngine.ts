/**
 * Server-side trading bot engine.
 * Runs independently of the browser — survives app close/refresh.
 * Uses Binance for market data, Bybit for order execution.
 */
import express from "express";
import crypto from "crypto";

const router = express.Router();

// ── Types ─────────────────────────────────────────────────────────────────────

type Direction = "long" | "short";

type BotConfig = {
  symbol: string;
  rsiMin: number; rsiMax: number;
  trailPct: number; stopLoss: number; takeProfit: number;
  leverage: number;
  allowShorts: boolean;
  capital: number; // USDT to use per trade
  adxMin: number;
  apiKey: string; secret: string; testnet: boolean;
};

type Position = {
  direction: Direction;
  entryPrice: number;
  qty: number;
  entryTime: string;
  trailRef: number;
};

type LogEntry = { time: string; msg: string; type: "info" | "buy" | "sell" | "warn" };

// ── Global state ──────────────────────────────────────────────────────────────

let running = false;
let intervalId: ReturnType<typeof setInterval> | null = null;
let config: BotConfig | null = null;
let position: Position | null = null;
let logs: LogEntry[] = [];
let sessionPnl = 0;

function addLog(msg: string, type: LogEntry["type"] = "info") {
  const entry: LogEntry = { time: new Date().toISOString(), msg, type };
  logs = [...logs.slice(-199), entry];
  console.log(`[BOT] ${msg}`);
}

// ── Bybit API ─────────────────────────────────────────────────────────────────

async function bybitFetch(method: "GET" | "POST", path: string, params?: Record<string, any>) {
  if (!config) throw new Error("No config");
  const base = config.testnet ? "https://api-testnet.bybit.com" : "https://api.bybit.com";
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

  const toSign = ts + config.apiKey + recvWindow + paramStr;
  const sig = crypto.createHmac("sha256", config.secret).update(toSign).digest("hex");

  const r = await fetch(url, {
    method, body: fetchBody,
    headers: {
      "X-BAPI-API-KEY": config.apiKey, "X-BAPI-SIGN": sig,
      "X-BAPI-SIGN-TYPE": "2", "X-BAPI-TIMESTAMP": ts,
      "X-BAPI-RECV-WINDOW": recvWindow, "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error(`Bybit HTTP ${r.status}`);
  const d = await r.json() as any;
  if (d.retCode !== 0) throw new Error(`Bybit ${d.retCode}: ${d.retMsg}`);
  return d;
}

async function placeOrder(side: Direction, qty: number) {
  if (!config) return;
  try {
    if (config.leverage > 1) {
      try {
        await bybitFetch("POST", "/v5/position/set-leverage", {
          category: "linear", symbol: config.symbol,
          buyLeverage: String(config.leverage), sellLeverage: String(config.leverage),
        });
      } catch { /* may already be set */ }
    }
    const d = await bybitFetch("POST", "/v5/order/create", {
      category: "linear", symbol: config.symbol,
      side: side === "long" ? "Buy" : "Sell",
      orderType: "Market", qty: String(qty),
    });
    addLog(`🟢 LIVE ${side.toUpperCase()} qty=${qty} | OrderID: ${d.result?.orderId}`, "buy");
    return d.result?.orderId;
  } catch (e: any) { addLog(`🔴 Order error: ${e.message}`, "warn"); }
}

async function closePosition(reason: string) {
  if (!config || !position) return;
  try {
    await bybitFetch("POST", "/v5/order/create", {
      category: "linear", symbol: config.symbol,
      side: position.direction === "long" ? "Sell" : "Buy",
      orderType: "Market", qty: String(position.qty), reduceOnly: true,
    });
    addLog(`🔴 LIVE CLOSE ${position.direction.toUpperCase()} — ${reason}`, "sell");
  } catch (e: any) { addLog(`🔴 Close error: ${e.message}`, "warn"); }
}

// ── Indicators ────────────────────────────────────────────────────────────────

function calcRsi(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gains += d; else losses -= d;
  }
  const rs = losses === 0 ? 100 : gains / losses;
  return 100 - 100 / (1 + rs);
}

function calcEma(values: number[], period: number): number {
  if (values.length < period) return values[values.length - 1] ?? 0;
  const k = 2 / (period + 1);
  let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) ema = values[i] * k + ema * (1 - k);
  return ema;
}

function calcMacd(closes: number[]): { macd: number; signal: number } {
  if (closes.length < 26) return { macd: 0, signal: 0 };
  const ema12 = calcEma(closes, 12);
  const ema26 = calcEma(closes, 26);
  const macdLine = ema12 - ema26;
  // Simplified signal: use last 9 macd values
  const macdValues: number[] = [];
  for (let i = Math.max(0, closes.length - 35); i < closes.length; i++) {
    const slice = closes.slice(0, i + 1);
    if (slice.length >= 26) macdValues.push(calcEma(slice, 12) - calcEma(slice, 26));
  }
  const signal = macdValues.length >= 9 ? calcEma(macdValues, 9) : macdLine;
  return { macd: macdLine, signal };
}

function calcAdx(highs: number[], lows: number[], closes: number[], period = 14): number {
  if (closes.length < period + 1) return 20;
  const tr: number[] = [], plusDm: number[] = [], minusDm: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const h = highs[i], l = lows[i], pc = closes[i - 1];
    tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
    const upMove = h - highs[i - 1], downMove = lows[i - 1] - l;
    plusDm.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDm.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }
  const sumTr = tr.slice(-period).reduce((a, b) => a + b, 0);
  const sumPlusDm = plusDm.slice(-period).reduce((a, b) => a + b, 0);
  const sumMinusDm = minusDm.slice(-period).reduce((a, b) => a + b, 0);
  if (sumTr === 0) return 20;
  const plusDi = 100 * sumPlusDm / sumTr;
  const minusDi = 100 * sumMinusDm / sumTr;
  const dx = plusDi + minusDi === 0 ? 0 : 100 * Math.abs(plusDi - minusDi) / (plusDi + minusDi);
  return dx;
}

function calcVolumeMult(volumes: number[]): number {
  if (volumes.length < 20) return 1;
  const avg = volumes.slice(-20, -1).reduce((a, b) => a + b, 0) / 19;
  return avg === 0 ? 1 : volumes[volumes.length - 1] / avg;
}

// ── Main engine tick ──────────────────────────────────────────────────────────

async function fetchCandles(symbol: string, _testnet: boolean): Promise<{closes:number[];highs:number[];lows:number[];volumes:number[];price:number}|null> {
  // Always use mainnet for market data — price is identical, testnet klines return 403
  const base = "https://api.bybit.com";
  try {
    const r = await fetch(`${base}/v5/market/kline?category=linear&symbol=${symbol}&interval=60&limit=100`, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json() as any;
    if (d.retCode !== 0) throw new Error(`Bybit ${d.retCode}: ${d.retMsg}`);
    const list: any[] = (d.result?.list ?? []).reverse(); // Bybit returns newest first
    if (list.length < 30) throw new Error("Not enough candles");
    return {
      closes:  list.map((k: any) => parseFloat(k[4])),
      highs:   list.map((k: any) => parseFloat(k[2])),
      lows:    list.map((k: any) => parseFloat(k[3])),
      volumes: list.map((k: any) => parseFloat(k[5])),
      price:   parseFloat(list[list.length - 1][4]),
    };
  } catch (e: any) {
    addLog(`Klines error: ${e.message}`, "warn");
    return null;
  }
}

async function engineTick() {
  if (!config || !running) return;

  try {
    const candles = await fetchCandles(config.symbol, config.testnet);
    if (!candles) return;
    const { closes, highs, lows, volumes, price } = candles;

    const rsi    = calcRsi(closes);
    const ema21  = calcEma(closes, 21);
    const macd   = calcMacd(closes);
    const adx    = calcAdx(highs, lows, closes);
    const volMult = calcVolumeMult(volumes);
    const pvsEma = (price - ema21) / ema21 * 100;

    addLog(`Tick: ${config.symbol} $${price.toFixed(0)} RSI=${rsi.toFixed(1)} ADX=${adx.toFixed(1)} Vol×${volMult.toFixed(1)} EMA${pvsEma.toFixed(2)}%`);

    // ── Manage open position ──
    if (position) {
      const rawPct = (price - position.entryPrice) / position.entryPrice * 100;
      const pct = position.direction === "short" ? -rawPct : rawPct;

      // Update trail ref
      if (position.direction === "long")  position.trailRef = Math.max(position.trailRef, price);
      if (position.direction === "short") position.trailRef = Math.min(position.trailRef, price);

      const trailSL = position.direction === "long"
        ? position.trailRef * (1 - config.trailPct / 100)
        : position.trailRef * (1 + config.trailPct / 100);
      const initSL = position.direction === "long"
        ? position.entryPrice * (1 - config.stopLoss / 100)
        : position.entryPrice * (1 + config.stopLoss / 100);

      let reason: string | null = null;
      if (pct >= config.takeProfit) reason = `TP +${pct.toFixed(2)}%`;
      else if (position.direction === "long"  && price <= Math.max(trailSL, initSL)) reason = `SL/Trail ${pct.toFixed(2)}%`;
      else if (position.direction === "short" && price >= Math.min(trailSL, initSL)) reason = `SL/Trail ${pct.toFixed(2)}%`;

      if (reason) {
        const pnlUsdt = pct / 100 * config.capital;
        sessionPnl += pnlUsdt;
        addLog(`CLOSE ${position.direction.toUpperCase()} — ${reason} | ${pnlUsdt >= 0 ? "+" : ""}${pnlUsdt.toFixed(2)} USDT`, pnlUsdt >= 0 ? "sell" : "warn");
        await closePosition(reason);
        position = null;
      }
      return; // Don't open new position while one is open
    }

    // ── Check entry signal ──
    const isLong  = rsi >= config.rsiMin && rsi <= config.rsiMax && pvsEma > -2 && pvsEma < 5
                    && macd.macd > macd.signal && adx >= config.adxMin && volMult >= 1.2;
    const isShort = config.allowShorts && rsi >= config.rsiMin && rsi <= config.rsiMax
                    && pvsEma > -5 && pvsEma < 2
                    && macd.macd < macd.signal && adx >= config.adxMin && volMult >= 1.2;

    if (!isLong && !isShort) return;

    const direction: Direction = isLong ? "long" : "short";
    const decimals = config.symbol === "BTCUSDT" ? 3 : 2;
    const minQty   = config.symbol === "BTCUSDT" ? 0.001 : 0.01;
    const qty = Math.max(parseFloat(((config.capital * config.leverage) / price).toFixed(decimals)), minQty);

    addLog(`SIGNAL ${direction.toUpperCase()} RSI=${rsi.toFixed(1)} ADX=${adx.toFixed(1)} Vol×${volMult.toFixed(1)}`, "info");
    await placeOrder(direction, qty);
    position = { direction, entryPrice: price, qty, entryTime: new Date().toISOString(), trailRef: price };

  } catch (e: any) { addLog(`Tick error: ${e.message}`, "warn"); }
}

// ── HTTP endpoints ────────────────────────────────────────────────────────────

router.post("/start", (req, res) => {
  const { apiKey, secret, testnet, symbol, rsiMin, rsiMax, trailPct, stopLoss, takeProfit, leverage, allowShorts, capital, adxMin } = req.body;
  if (!apiKey || !secret) return res.status(400).json({ error: "Missing Bybit keys" });

  if (running && intervalId) clearInterval(intervalId);

  config = {
    symbol: symbol || "BTCUSDT",
    rsiMin: rsiMin ?? 50, rsiMax: rsiMax ?? 70,
    trailPct: trailPct ?? 0.15, stopLoss: stopLoss ?? 1.0, takeProfit: takeProfit ?? 2.0,
    leverage: leverage ?? 1,
    allowShorts: allowShorts ?? false,
    capital: capital ?? 9,
    adxMin: adxMin ?? 20,
    apiKey, secret, testnet: testnet === true,
  };

  running = true;
  sessionPnl = 0;
  logs = [];
  addLog(`Bot started — ${config.symbol} capital=${config.capital} USDT lev=${config.leverage}x`, "info");

  // Run immediately, then every 60s
  engineTick();
  intervalId = setInterval(engineTick, 60_000);

  res.json({ ok: true, message: "Bot started on server" });
});

router.post("/stop", (_req, res) => {
  running = false;
  if (intervalId) { clearInterval(intervalId); intervalId = null; }
  addLog("Bot stopped", "warn");
  res.json({ ok: true });
});

router.get("/status", (_req, res) => {
  res.json({
    running, position, sessionPnl,
    logs: logs.slice(-50),
    symbol: config?.symbol,
    capital: config?.capital,
    leverage: config?.leverage,
  });
});

export default router;
