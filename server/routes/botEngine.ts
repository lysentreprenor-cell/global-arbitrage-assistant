/**
 * Server-side trading bot engine.
 * Runs independently of the browser — survives app close/refresh.
 * Uses Binance for market data, Bybit for order execution.
 */
import express from "express";
import crypto from "crypto";
import fs from "fs";
import path from "path";

const router = express.Router();
const STATE_FILE = path.resolve(process.cwd(), "bot_state.json");

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
let priceIntervalId: ReturnType<typeof setInterval> | null = null;
let config: BotConfig | null = null;
let position: Position | null = null;
let logs: LogEntry[] = [];
let sessionPnl = 0;

function saveState() {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify({ running, config, position, sessionPnl }));
  } catch { /* ignore */ }
}

function loadState() {
  try {
    if (!fs.existsSync(STATE_FILE)) return;
    const s = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    if (s.running && s.config) {
      config = s.config;
      position = s.position ?? null;
      sessionPnl = s.sessionPnl ?? 0;
      running = true;
      addLog("Auto-resume po restarcie serwera", "info");
      engineTick();
      intervalId = setInterval(engineTick, 30_000);
      priceIntervalId = setInterval(priceCheck, 5_000);
    }
  } catch { /* ignore */ }
}

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

// Returns orderId on success, throws on failure
async function placeOrder(side: Direction, qty: number): Promise<string> {
  if (!config) throw new Error("No config");
  if (config.leverage > 1) {
    try {
      await bybitFetch("POST", "/v5/position/set-leverage", {
        category: "linear", symbol: config.symbol,
        buyLeverage: String(config.leverage), sellLeverage: String(config.leverage),
      });
    } catch { /* leverage may already be set */ }
  }
  const d = await bybitFetch("POST", "/v5/order/create", {
    category: "linear", symbol: config.symbol,
    side: side === "long" ? "Buy" : "Sell",
    orderType: "Market", qty: String(qty),
  });
  const orderId = d.result?.orderId ?? "unknown";
  addLog(`🟢 LIVE ${side.toUpperCase()} qty=${qty} | OrderID: ${orderId}`, "buy");
  return orderId;
}

// Returns true on success, false on failure
async function closePosition(reason: string): Promise<boolean> {
  if (!config || !position) return false;
  try {
    await bybitFetch("POST", "/v5/order/create", {
      category: "linear", symbol: config.symbol,
      side: position.direction === "long" ? "Sell" : "Buy",
      orderType: "Market", qty: String(position.qty), reduceOnly: true,
    });
    addLog(`🔴 LIVE CLOSE ${position.direction.toUpperCase()} — ${reason}`, "sell");
    return true;
  } catch (e: any) {
    addLog(`🔴 Close error: ${e.message}`, "warn");
    return false;
  }
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

const SYMBOL_MAP: Record<string, string> = {
  BTCUSDT: "XBTUSD", ETHUSDT: "ETHUSD", SOLUSDT: "SOLUSD",
};

// Cached candle data refreshed every 60s
let candleCache: { closes:number[]; highs:number[]; lows:number[]; volumes:number[]; cachedAt:number } | null = null;
// Latest price from fast ticker (refreshed every 5s)
let lastPrice = 0;

async function fetchCandles(symbol: string): Promise<{closes:number[];highs:number[];lows:number[];volumes:number[];price:number}|null> {
  const pair = SYMBOL_MAP[symbol] ?? "XBTUSD";
  try {
    const r = await fetch(`https://api.kraken.com/0/public/OHLC?pair=${pair}&interval=1&since=0`, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error(`Kraken HTTP ${r.status}`);
    const d = await r.json() as any;
    if (d.error?.length) throw new Error(`Kraken: ${d.error[0]}`);
    const key = Object.keys(d.result).find(k => k !== "last")!;
    const list: any[] = (d.result[key] ?? []).slice(-100);
    if (list.length < 30) throw new Error("Not enough candles");
    return {
      closes:  list.map((k: any) => parseFloat(k[4])),
      highs:   list.map((k: any) => parseFloat(k[2])),
      lows:    list.map((k: any) => parseFloat(k[3])),
      volumes: list.map((k: any) => parseFloat(k[6])),
      price:   parseFloat(list[list.length - 1][4]),
    };
  } catch (e: any) {
    addLog(`Klines error: ${e.message}`, "warn");
    return null;
  }
}

async function fetchCurrentPrice(symbol: string): Promise<number | null> {
  const pair = SYMBOL_MAP[symbol] ?? "XBTUSD";
  try {
    const r = await fetch(`https://api.kraken.com/0/public/Ticker?pair=${pair}`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    const d = await r.json() as any;
    const key = Object.keys(d.result ?? {})[0];
    if (!key) return null;
    return parseFloat(d.result[key].c[0]); // last trade price
  } catch { return null; }
}

// ── Fast exit check (every 5s) ────────────────────────────────────────────────
async function priceCheck() {
  if (!config || !running || !position) return;
  const price = await fetchCurrentPrice(config.symbol);
  if (!price) return;
  lastPrice = price;

  const rawPct = (price - position.entryPrice) / position.entryPrice * 100;
  const pct = position.direction === "short" ? -rawPct : rawPct;

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
    const closed = await closePosition(reason);
    if (closed) {
      sessionPnl += pnlUsdt;
      addLog(`CLOSE ${position.direction.toUpperCase()} — ${reason} | ${pnlUsdt >= 0 ? "+" : ""}${pnlUsdt.toFixed(2)} USDT`, pnlUsdt >= 0 ? "sell" : "warn");
      position = null;
      saveState();
    }
  }
}

// ── Full indicator tick (every 30s) ───────────────────────────────────────────
async function engineTick() {
  if (!config || !running) return;

  try {
    const candles = await fetchCandles(config.symbol);
    if (!candles) return;
    const { closes } = candles;
    const price = lastPrice > 0 ? lastPrice : candles.price;

    const rsi  = calcRsi(closes);
    const ema9  = calcEma(closes, 9);
    const ema21 = calcEma(closes, 21);
    // Previous bar EMAs for crossover detection
    const prevEma9  = calcEma(closes.slice(0, -1), 9);
    const prevEma21 = calcEma(closes.slice(0, -1), 21);

    addLog(`Tick: ${config.symbol} $${price.toFixed(0)} RSI=${rsi.toFixed(1)} EMA9=${ema9.toFixed(0)} EMA21=${ema21.toFixed(0)}`);

    // If position open — priceCheck handles exits every 5s
    if (position) return;

    // EMA9 crosses above EMA21 → LONG (bullish crossover)
    const isLong = ema9 > ema21 && prevEma9 <= prevEma21 && rsi < 70;
    // EMA9 crosses below EMA21 → SHORT (bearish crossover)
    const isShort = config.allowShorts && ema9 < ema21 && prevEma9 >= prevEma21 && rsi > 30;

    // Fallback: if no recent crossover, use current position of EMAs
    const trendLong  = !isLong  && ema9 > ema21 && rsi >= config.rsiMin && rsi <= config.rsiMax;
    const trendShort = !isShort && config.allowShorts && ema9 < ema21 && rsi > 30 && rsi < 60;

    const doLong  = isLong  || trendLong;
    const doShort = isShort || trendShort;

    if (!doLong && !doShort) {
      addLog(`Brak sygnału — EMA9${ema9 > ema21 ? ">" : "<"}EMA21 RSI=${rsi.toFixed(1)}`);
      return;
    }

    const direction: Direction = doLong ? "long" : "short";
    const decimals = config.symbol === "BTCUSDT" ? 3 : 2;
    const minQty   = config.symbol === "BTCUSDT" ? 0.001 : 0.01;
    const qty = Math.max(parseFloat(((config.capital * config.leverage) / price).toFixed(decimals)), minQty);

    addLog(`🎯 SYGNAŁ ${direction.toUpperCase()} EMA9=${ema9.toFixed(0)} EMA21=${ema21.toFixed(0)} RSI=${rsi.toFixed(1)} qty=${qty}`, "info");
    try {
      await placeOrder(direction, qty);
      position = { direction, entryPrice: price, qty, entryTime: new Date().toISOString(), trailRef: price };
      saveState();
    } catch (e: any) {
      addLog(`🔴 ZLECENIE NIEUDANE: ${e.message}`, "warn");
    }

  } catch (e: any) { addLog(`Tick error: ${e.message}`, "warn"); }
}

// ── HTTP endpoints ────────────────────────────────────────────────────────────

router.post("/start", (req, res) => {
  const { apiKey, secret, testnet, symbol, rsiMin, rsiMax, trailPct, stopLoss, takeProfit, leverage, allowShorts, capital, adxMin } = req.body;
  if (!apiKey || !secret) return res.status(400).json({ error: "Missing Bybit keys" });

  if (intervalId) { clearInterval(intervalId); intervalId = null; }
  if (priceIntervalId) { clearInterval(priceIntervalId); priceIntervalId = null; }

  config = {
    symbol: symbol || "BTCUSDT",
    rsiMin: rsiMin ?? 35,      // scalping: szeroki zakres RSI
    rsiMax: rsiMax ?? 70,
    trailPct: trailPct ?? 0.1, // 0.1% trailing stop
    stopLoss: stopLoss ?? 0.3,  // 0.3% stop loss (szybkie cięcie strat)
    takeProfit: takeProfit ?? 0.5, // 0.5% take profit (szybki zysk)
    leverage: leverage ?? 10,   // 10x dźwignia dla małego kapitału
    allowShorts: allowShorts ?? true, // shortuj też
    capital: capital ?? 9,
    adxMin: adxMin ?? 15,      // niższy próg ADX
    apiKey, secret, testnet: testnet === true,
  };

  running = true;
  position = null;
  sessionPnl = 0;
  logs = [];
  addLog(`Bot started — ${config.symbol} capital=${config.capital} USDT lev=${config.leverage}x | Scalping TP=${config.takeProfit}% SL=${config.stopLoss}%`, "info");
  saveState();

  engineTick();
  intervalId = setInterval(engineTick, 30_000);   // co 30s — świece 1m
  priceIntervalId = setInterval(priceCheck, 5_000); // co 5s — cena live

  res.json({ ok: true, message: "Bot started on server" });
});

router.post("/stop", (_req, res) => {
  running = false;
  if (intervalId) { clearInterval(intervalId); intervalId = null; }
  if (priceIntervalId) { clearInterval(priceIntervalId); priceIntervalId = null; }
  addLog("Bot stopped", "warn");
  saveState();
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

// Auto-resume bot if it was running before server restart
setTimeout(loadState, 3000);

export default router;
