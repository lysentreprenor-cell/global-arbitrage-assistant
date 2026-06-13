/**
 * Server-side trading bot engine.
 * Runs independently of the browser — survives app close/refresh.
 * Uses Binance for market data, Bybit for order execution.
 */
import express from "express";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { bybitFetch as proxyFetch } from "../proxyDispatcher";
import { calcRsi, calcEma, calcMacd, calcAdx, calcAtr, calcVolumeMult } from "../lib/indicators";

const router = express.Router();
const STATE_FILE = path.resolve(process.cwd(), "bot_state.json");
const KEY_FILE   = path.resolve(process.cwd(), ".bot_key");
const KEYS_FILE  = path.resolve(process.cwd(), "api_keys.enc");

// ── Encrypted key storage ─────────────────────────────────────────────────────

function getEncKey(): Buffer {
  if (fs.existsSync(KEY_FILE)) return Buffer.from(fs.readFileSync(KEY_FILE, "utf8").trim(), "hex");
  const key = crypto.randomBytes(32);
  fs.writeFileSync(KEY_FILE, key.toString("hex"), { mode: 0o600 });
  return key;
}

function encryptApiKeys(apiKey: string, secret: string, testnet: boolean, platform: Platform = "global"): void {
  try {
    const encKey = getEncKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", encKey, iv);
    const payload = JSON.stringify({ apiKey, secret, testnet, platform });
    const enc = Buffer.concat([cipher.update(payload, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    fs.writeFileSync(KEYS_FILE, JSON.stringify({
      iv: iv.toString("hex"), enc: enc.toString("hex"), tag: tag.toString("hex"),
    }), { mode: 0o600 });
  } catch { /* ignore */ }
}

function decryptApiKeys(): { apiKey: string; secret: string; testnet: boolean; platform?: Platform } | null {
  try {
    if (!fs.existsSync(KEYS_FILE)) return null;
    const encKey = getEncKey();
    const { iv, enc, tag } = JSON.parse(fs.readFileSync(KEYS_FILE, "utf8"));
    const decipher = crypto.createDecipheriv("aes-256-gcm", encKey, Buffer.from(iv, "hex"));
    decipher.setAuthTag(Buffer.from(tag, "hex"));
    const dec = Buffer.concat([decipher.update(Buffer.from(enc, "hex")), decipher.final()]);
    return JSON.parse(dec.toString("utf8"));
  } catch { return null; }
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Direction = "long" | "short";
type Platform = "global" | "eu" | "kraken";

type KrakenFiat = "USD" | "EUR";

type BotConfig = {
  symbol: string;
  rsiMin: number; rsiMax: number;
  trailPct: number; stopLoss: number; takeProfit: number;
  leverage: number;
  allowShorts: boolean;
  capital: number;
  adxMin: number;
  confluenceMin: number;  // 1=aggressive, 2=normal, 3=cautious
  volMultMin: number;     // volume spike threshold (1.0 = disabled)
  cooldownMin: number;    // minutes between entries
  apiKey: string; secret: string; testnet: boolean;
  platform: Platform;
  krakenFiat?: KrakenFiat; // auto-detected from balance: EUR or USD
};

type Position = {
  direction: Direction;
  entryPrice: number;
  qty: number;
  entryTime: string;
  trailRef: number;
  slPct: number;        // effective stop-loss % (ATR-based or config fallback)
  tpPct: number;        // effective take-profit %
  trailPct: number;     // effective trailing-stop %
  breakEvenSet: boolean; // true once SL has been moved to break-even
  signal?: string;             // which condition triggered entry (optional for restored positions)
};

type LogEntry = { time: string; msg: string; type: "info" | "buy" | "sell" | "warn" };
type TradeRecord = { dir: Direction; entry: number; exit: number; pnlUsdt: number; pnlPct: number; reason: string; signal: string; time: string; durationH: number };

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
    // Never persist API keys to disk
    const safeCfg = config ? { ...config, apiKey: "", secret: "" } : null;
    fs.writeFileSync(STATE_FILE, JSON.stringify({ running, config: safeCfg, position, sessionPnl }));
  } catch { /* ignore */ }
}

function loadState() {
  try {
    if (!fs.existsSync(STATE_FILE)) return;
    const s = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    if (s.running && s.config) {
      const savedKeys = decryptApiKeys();
      if (!savedKeys) { addLog("Auto-resume: brak zapisanych kluczy", "warn"); return; }
      config = { ...s.config, apiKey: savedKeys.apiKey, secret: savedKeys.secret, testnet: savedKeys.testnet, platform: savedKeys.platform ?? s.config.platform ?? "global" };
      // Restore position if it's not stale (< 48h old)
      if (s.position && s.position.entryTime) {
        const ageH = (Date.now() - new Date(s.position.entryTime).getTime()) / 3_600_000;
        position = ageH < 48 ? s.position : null;
        if (position) lastEntryTime = new Date(position.entryTime).getTime();
      } else {
        position = null;
      }
      sessionPnl = s.sessionPnl ?? 0;
      running = true;
      saveState();
      addLog(`Auto-resume po restarcie${position ? ` — przywrócono pozycję ${position.direction.toUpperCase()} z ${new Date(position.entryTime).toLocaleTimeString()}` : ""}`, "info");
      engineTick();
      intervalId = setInterval(engineTick, 5 * 60_000);
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
  const base = config.testnet ? "https://api-testnet.bybit.com"
    : config.platform === "eu" ? "https://api.bybit.eu" : "https://api.bybit.com";
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

  const r = await proxyFetch(url, {
    method, body: fetchBody,
    headers: {
      "X-BAPI-API-KEY": config.apiKey, "X-BAPI-SIGN": sig,
      "X-BAPI-SIGN-TYPE": "2", "X-BAPI-TIMESTAMP": ts,
      "X-BAPI-RECV-WINDOW": recvWindow, "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(10000),
  } as any);
  if (!r.ok) throw new Error(`Bybit HTTP ${r.status}`);
  const d = await r.json() as any;
  if (d.retCode !== 0) throw new Error(`Bybit ${d.retCode}: ${d.retMsg}`);
  return d;
}

// ── Kraken API ────────────────────────────────────────────────────────────────

async function krakenPrivate(path: string, params: Record<string, any> = {}) {
  if (!config) throw new Error("No config");
  const nonce = Date.now() * 1000;
  const allParams = { ...params, nonce: nonce.toString() };
  const body = new URLSearchParams(allParams as Record<string, string>).toString();
  const sha256 = crypto.createHash("sha256").update(allParams.nonce + body).digest();
  const hmacInput = Buffer.concat([Buffer.from(path), sha256]);
  const sign = crypto
    .createHmac("sha512", Buffer.from(config.secret, "base64"))
    .update(hmacInput)
    .digest("base64");
  const r = await fetch(`https://api.kraken.com${path}`, {
    method: "POST",
    headers: {
      "API-Key": config.apiKey.trim(),
      "API-Sign": sign,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error(`Kraken HTTP ${r.status}`);
  const d = await r.json() as any;
  if (d.error?.length) throw new Error(`Kraken: ${d.error[0]}`);
  return d.result;
}

// Returns orderId/txid on success, throws on failure
async function placeOrder(side: Direction, qty: number): Promise<string> {
  if (!config) throw new Error("No config");
  if (config.platform === "kraken") {
    const pair = krakenPair(config.symbol);
    const effLev = Math.max(1, config.leverage ?? 1);
    const orderParams: Record<string, string> = {
      pair, type: side === "long" ? "buy" : "sell", ordertype: "market", volume: String(qty),
    };
    if (effLev > 1) orderParams.leverage = String(effLev);
    const result = await krakenPrivate("/0/private/AddOrder", orderParams);
    const txid = result.txid?.[0] ?? "unknown";
    addLog(`🟢 LIVE ${side.toUpperCase()} qty=${qty}${effLev > 1 ? ` lev=${effLev}x` : ""} | TxID: ${txid}`, "buy");
    return txid;
  }
  const params: Record<string, any> = config.platform === "eu"
    ? { category: "spot", symbol: config.symbol, side: side === "long" ? "Buy" : "Sell",
        orderType: "Market", qty: String(qty), marketUnit: "baseCoin", isLeverage: 1 }
    : { category: "linear", symbol: config.symbol, side: side === "long" ? "Buy" : "Sell",
        orderType: "Market", qty: String(qty), positionIdx: 0 };
  const d = await bybitFetch("POST", "/v5/order/create", params);
  const orderId = d.result?.orderId ?? "unknown";
  addLog(`🟢 LIVE ${side.toUpperCase()} qty=${qty} | OrderID: ${orderId}`, "buy");
  return orderId;
}

// Returns true on success, false on failure
async function closePosition(reason: string): Promise<boolean> {
  if (!config || !position) return false;
  try {
    if (config.platform === "kraken") {
      const pair = krakenPair(config.symbol);
      const closeSide = position.direction === "long" ? "sell" : "buy";
      const effLev = Math.max(1, config.leverage ?? 1);
      const closeParams: Record<string, string> = {
        pair, type: closeSide, ordertype: "market", volume: String(position.qty),
      };
      if (effLev > 1) closeParams.leverage = String(effLev);
      await krakenPrivate("/0/private/AddOrder", closeParams);
      addLog(`🔴 LIVE CLOSE ${position.direction.toUpperCase()} — ${reason}`, "sell");
      return true;
    }
    const closeSide = position.direction === "long" ? "Sell" : "Buy";
    const params: Record<string, any> = config.platform === "eu"
      ? { category: "spot", symbol: config.symbol, side: closeSide,
          orderType: "Market", qty: String(position.qty), marketUnit: "baseCoin", isLeverage: 1 }
      : { category: "linear", symbol: config.symbol, side: closeSide,
          orderType: "Market", qty: String(position.qty), positionIdx: 0, reduceOnly: true };
    await bybitFetch("POST", "/v5/order/create", params);
    addLog(`🔴 LIVE CLOSE ${position.direction.toUpperCase()} — ${reason}`, "sell");
    return true;
  } catch (e: any) {
    addLog(`🔴 Close error: ${e.message}`, "warn");
    return false;
  }
}

// ── Indicators ────────────────────────────────────────────────────────────────
// All functions imported from ../lib/indicators

// ── Main engine tick ──────────────────────────────────────────────────────────

const SYMBOL_MAP_USD: Record<string, string> = {
  BTCUSDT: "XBTUSD", ETHUSDT: "ETHUSD", SOLUSDT: "SOLUSD",
};
const SYMBOL_MAP_EUR: Record<string, string> = {
  BTCUSDT: "XBTEUR", ETHUSDT: "ETHEUR", SOLUSDT: "SOLEUR",
};
// For non-Kraken platforms
const SYMBOL_MAP: Record<string, string> = {
  BTCUSDT: "XBTUSD", ETHUSDT: "ETHUSD", SOLUSDT: "SOLUSD",
};

function krakenPair(symbol: string): string {
  const fiat = config?.krakenFiat ?? "USD";
  return (fiat === "EUR" ? SYMBOL_MAP_EUR : SYMBOL_MAP_USD)[symbol] ?? "XBTUSD";
}

let lastPrice = 0;
let lastEntryTime = 0;
let closeFailCount = 0;
let prevRsi = 50;          // RSI recovery detection: was oversold, now bouncing
let dipFromHigh = 0;       // current % dip from 24h close high
let marketRegime: "bull" | "bear" | "neutral" = "neutral";
let tickCount = 0;             // warmup: skip rsiRecovering first 3 ticks
let adxLowCount = 0;           // consecutive ticks with ADX < 20
let rangeMode = false;         // true when ADX<20 for 6+ consecutive ticks
let dailyDate = "";            // YYYY-MM-DD for daily loss reset
let dailyStartPnl = 0;         // sessionPnl at start of current day
let tradeHistory: TradeRecord[] = [];
let sessionWins = 0;
let sessionLosses = 0;
let sessionPeakPnl = 0;
let sessionMaxDrawdown = 0;
let fourHourTrend: "bull" | "bear" | "neutral" = "neutral";
let lastEntrySignal = "";

async function fetchCandles(symbol: string): Promise<{closes:number[];highs:number[];lows:number[];volumes:number[];price:number}|null> {
  const pair = krakenPair(symbol);
  try {
    const since = Math.floor(Date.now() / 1000) - 150 * 3600; // last 150 hours (1h candles)
    const r = await fetch(`https://api.kraken.com/0/public/OHLC?pair=${pair}&interval=60&since=${since}`, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error(`Kraken HTTP ${r.status}`);
    const d = await r.json() as any;
    if (d.error?.length) throw new Error(`Kraken: ${d.error[0]}`);
    const key = Object.keys(d.result).find(k => k !== "last")!;
    const list: any[] = (d.result[key] ?? []).slice(-150);
    if (list.length < 50) throw new Error("Not enough candles");
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
  const pair = krakenPair(symbol);
  try {
    const r = await fetch(`https://api.kraken.com/0/public/Ticker?pair=${pair}`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    const d = await r.json() as any;
    const key = Object.keys(d.result ?? {})[0];
    if (!key) return null;
    return parseFloat(d.result[key].c[0]); // last trade price
  } catch { return null; }
}

async function fetch4HCandles(symbol: string): Promise<{ema9:number;ema21:number}|null> {
  const pair = krakenPair(symbol);
  try {
    const since = Math.floor(Date.now() / 1000) - 50 * 4 * 3600;
    const r = await fetch(`https://api.kraken.com/0/public/OHLC?pair=${pair}&interval=240&since=${since}`, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const d = await r.json() as any;
    if (d.error?.length) return null;
    const key = Object.keys(d.result).find(k => k !== "last")!;
    const list: any[] = (d.result[key] ?? []).slice(-30);
    if (list.length < 22) return null;
    const c4h = list.map((k: any) => parseFloat(k[4]));
    return { ema9: calcEma(c4h, 9), ema21: calcEma(c4h, 21) };
  } catch { return null; }
}

function recordTrade(pos: Position, exitPrice: number, pnlUsdt: number, pnlPct: number, reason: string) {
  const durationH = (Date.now() - new Date(pos.entryTime).getTime()) / 3_600_000;
  if (pnlPct > 0) sessionWins++;
  else sessionLosses++;
  if (sessionPnl > sessionPeakPnl) sessionPeakPnl = sessionPnl;
  const dd = sessionPeakPnl > sessionPnl ? sessionPeakPnl - sessionPnl : 0;
  if (dd > sessionMaxDrawdown) sessionMaxDrawdown = dd;
  tradeHistory = [...tradeHistory.slice(-49), {
    dir: pos.direction, entry: pos.entryPrice, exit: exitPrice,
    pnlUsdt, pnlPct: parseFloat(pnlPct.toFixed(3)),
    reason, signal: pos.signal ?? "unknown",
    time: new Date().toISOString(), durationH: parseFloat(durationH.toFixed(1)),
  }];
}

// ── Fast exit check (every 5s) ────────────────────────────────────────────────
async function priceCheck() {
  if (!config || !running || !position) return;
  const price = await fetchCurrentPrice(config.symbol);
  if (!price) return;
  lastPrice = price;

  const rawPct = (price - position.entryPrice) / position.entryPrice * 100;
  const pct    = position.direction === "short" ? -rawPct : rawPct;

  // Update trailing high/low reference
  if (position.direction === "long")  position.trailRef = Math.max(position.trailRef, price);
  if (position.direction === "short") position.trailRef = Math.min(position.trailRef, price);

  // Break-even: once profit reaches 50% of TP, lock trail at entry price + tighten trail (TP1)
  if (!position.breakEvenSet && pct >= position.tpPct * 0.5) {
    position.breakEvenSet = true;
    position.trailPct = Math.max(position.trailPct * 0.5, 0.08); // tighten trail after TP1
    // Push trailRef so that trailSL lands exactly at entryPrice
    if (position.direction === "long") {
      const neededRef = position.entryPrice / (1 - position.trailPct / 100);
      position.trailRef = Math.max(position.trailRef, neededRef);
    } else {
      const neededRef = position.entryPrice / (1 + position.trailPct / 100);
      position.trailRef = Math.min(position.trailRef, neededRef);
    }
    addLog(`🎯 TP1 +${pct.toFixed(2)}% — break-even + trail zwężony do ${position.trailPct.toFixed(2)}%`, "info");
  }

  const trailSL = position.direction === "long"
    ? position.trailRef * (1 - position.trailPct / 100)
    : position.trailRef * (1 + position.trailPct / 100);
  const initSL = position.direction === "long"
    ? position.entryPrice * (1 - position.slPct / 100)
    : position.entryPrice * (1 + position.slPct / 100);

  let reason: string | null = null;
  if (pct >= position.tpPct) reason = `TP +${pct.toFixed(2)}%`;
  else if (position.direction === "long"  && price <= Math.max(trailSL, initSL)) reason = `SL/Trail ${pct.toFixed(2)}%`;
  else if (position.direction === "short" && price >= Math.max(trailSL, initSL)) reason = `SL/Trail ${pct.toFixed(2)}%`;

  if (reason) {
    const KRAKEN_FEE_RT = 0.0052; // 0.26% taker × 2 (open + close)
    const feeCost = config.platform === "kraken" ? config.capital * KRAKEN_FEE_RT : 0;
    const pnlUsdt = pct / 100 * config.capital - feeCost;
    const closed = await closePosition(reason);
    if (closed) {
      sessionPnl += pnlUsdt;
      recordTrade(position, price, pnlUsdt, pct, reason);
      addLog(`CLOSE ${position.direction.toUpperCase()} — ${reason} | ${pnlUsdt >= 0 ? "+" : ""}${pnlUsdt.toFixed(2)} USDT`, pnlUsdt >= 0 ? "sell" : "warn");
      position = null;
      closeFailCount = 0;
      saveState();
    } else {
      closeFailCount++;
      if (closeFailCount >= 5) {
        addLog(`⚠️ Zamknięcie nieudane ${closeFailCount}x — czyszczę pozycję lokalnie`, "warn");
        position = null;
        closeFailCount = 0;
        saveState();
      }
    }
  }
}

// ── Full indicator tick (every 5 min — 1h candles) ───────────────────────────
async function engineTick() {
  if (!config || !running) return;

  try {
    const candles = await fetchCandles(config.symbol);
    if (!candles) return;
    const { closes, highs, lows, volumes } = candles;
    // Always fetch live price for accurate entry — don't rely on priceCheck interval
    const livePrice = await fetchCurrentPrice(config.symbol);
    const price = livePrice ?? (lastPrice > 0 ? lastPrice : candles.price);
    if (livePrice) lastPrice = livePrice;

    // Use closed candles only (drop last which may be in-progress) for cross detection
    const closedCloses = closes.slice(0, -1);
    const rsi     = calcRsi(closedCloses);
    const ema9    = calcEma(closedCloses, 9);
    const ema21   = calcEma(closedCloses, 21);
    const prevEma9  = calcEma(closedCloses.slice(0, -1), 9);
    const prevEma21 = calcEma(closedCloses.slice(0, -1), 21);

    const { macd: macdLine, signal: macdSignal } = calcMacd(closedCloses);
    const adx     = calcAdx(highs.slice(0, -1), lows.slice(0, -1), closedCloses);
    const volMult = calcVolumeMult(volumes.slice(0, -1));
    const atr     = calcAtr(highs.slice(0, -1), lows.slice(0, -1), closedCloses);
    const atrPct  = price > 0 ? (atr / price) * 100 : 0;

    // ── Warmup & auxiliary indicators ────────────────────────────────────────
    tickCount++;
    const warmedUp = tickCount > 3;
    const utcHour = new Date().getUTCHours();
    const lowLiqHour = utcHour >= 2 && utcHour < 6;
    // Daily loss tracking
    const todayStr = new Date().toISOString().slice(0, 10);
    if (dailyDate !== todayStr) { dailyDate = todayStr; dailyStartPnl = sessionPnl; }
    const dailyLossPct = config.capital > 0 ? (sessionPnl - dailyStartPnl) / config.capital * 100 : 0;
    // 4H trend
    const h4 = await fetch4HCandles(config.symbol);
    if (h4) fourHourTrend = h4.ema9 > h4.ema21 * 1.001 ? "bull" : h4.ema9 < h4.ema21 * 0.999 ? "bear" : "neutral";
    // Range detection: ADX < 20 for 6+ consecutive ticks → mean-reversion only mode
    if (adx < 20) adxLowCount++;
    else adxLowCount = 0;
    rangeMode = adxLowCount >= 6;

    // ── Dip statistics (BTC mean reversion context) ──────────────────────────
    // 1. RSI Recovery: RSI was oversold (< rsiMin) and is now rising — catches the bounce
    //    warmedUp guard: skip first 3 ticks when prevRsi starts at 50 (cold start false positives)
    const rsiRecovering = warmedUp && prevRsi < (config.rsiMin ?? 40) && rsi > prevRsi + 1.0;
    // 2. Bear market regime: EMA9 < EMA21 AND 5-candle price slope < -1.5% — downtrend
    const slope5 = closedCloses.length >= 6
      ? (closedCloses[closedCloses.length-1] - closedCloses[closedCloses.length-6]) / closedCloses[closedCloses.length-6] * 100
      : 0;
    const bearMkt = ema9 < ema21 && slope5 < -1.5;
    const bullMkt = ema9 > ema21 && slope5 > 0.3;
    marketRegime = bearMkt ? "bear" : bullMkt ? "bull" : "neutral";
    // 3. Crash protection: price >5% below 24h high — avoid catching falling knives in crashes
    const recent24Closes = closedCloses.slice(-24);
    const recent24High = recent24Closes.length > 0 ? Math.max(...recent24Closes) : price;
    dipFromHigh = recent24High > 0 ? (recent24High - price) / recent24High * 100 : 0;
    const inCrash = dipFromHigh > 5.0;
    // Update prevRsi for next tick
    prevRsi = rsi;

    addLog(`Tick: ${config.symbol} $${price.toFixed(0)} RSI=${rsi.toFixed(1)}${rsiRecovering?"↑":""}(prev=${prevRsi.toFixed(1)}) MACD=${macdLine.toFixed(1)} ADX=${adx.toFixed(0)}${rangeMode?"[range]":""} 4H:${fourHourTrend} ATR=${atrPct.toFixed(2)}% Dip=${dipFromHigh.toFixed(1)}% Reżim=${marketRegime}`);

    // ── Open position management ─────────────────────────────────────────────
    if (position) {
      const holdHours = (Date.now() - new Date(position.entryTime).getTime()) / 3_600_000;

      // Max hold: 48h time-based exit to prevent stuck positions
      if (holdHours >= 48) {
        const rawPct = (price - position.entryPrice) / position.entryPrice * 100;
        const pct    = position.direction === "short" ? -rawPct : rawPct;
        addLog(`⏱️ Max hold 48h (${holdHours.toFixed(0)}h) — zamykam pozycję`, "warn");
        const closed = await closePosition(`Max hold ${holdHours.toFixed(0)}h`);
        if (closed) {
          const KRAKEN_FEE_RT = 0.0052;
          const feeCost = config.platform === "kraken" ? config.capital * KRAKEN_FEE_RT : 0;
          sessionPnl += pct / 100 * config.capital - feeCost;
          position = null;
          saveState();
        }
        return;
      }

      // RSI extreme exit: momentum has fully reversed — take whatever we have
      const rsiOverbought = position.direction === "long"  && rsi > Math.max(config.rsiMax + 8, 78);
      const rsiOversold   = position.direction === "short" && rsi < Math.min(config.rsiMin - 8, 22);
      if (rsiOverbought || rsiOversold) {
        const rawPct = (price - position.entryPrice) / position.entryPrice * 100;
        const pct    = position.direction === "short" ? -rawPct : rawPct;
        const reason = `RSI extreme ${rsi.toFixed(1)}`;
        addLog(`📊 RSI exit — ${reason} | P&L ${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`, pct >= 0 ? "sell" : "warn");
        const closed = await closePosition(reason);
        if (closed) {
          const KRAKEN_FEE_RT = 0.0052;
          const feeCost = config.platform === "kraken" ? config.capital * KRAKEN_FEE_RT : 0;
          sessionPnl += pct / 100 * config.capital - feeCost;
          position = null;
          saveState();
        }
        return;
      }

      return; // normal tick — priceCheck handles SL/TP/trail every 5s
    }

    // ── Entry filters (time, daily loss) ────────────────────────────────────
    if (dailyLossPct <= -3.0) {
      addLog(`⛔ Dzienny limit straty -3%: ${dailyLossPct.toFixed(1)}% — blokuję nowe wejścia`, "warn");
      return;
    }
    if (lowLiqHour) {
      addLog(`⏸ Niska płynność UTC ${utcHour}:xx (02-06) — pomijam sygnał`, "info");
      return;
    }

    // ── Entry logic ──────────────────────────────────────────────────────────
    const rsiMin = config.rsiMin ?? 40;
    const rsiMax = config.rsiMax ?? 65;
    const adxMin = config.adxMin ?? 15;

    const crossBuy  = ema9 > ema21 && prevEma9 <= prevEma21;
    const crossSell = ema9 < ema21 && prevEma9 >= prevEma21;
    // RSI buy: either RSI < threshold OR recovering from oversold (bounce confirmation)
    const rsiBuy    = rsi < rsiMin || rsiRecovering;
    const rsiSell   = rsi > rsiMax;

    // Confluence: require 2 of 3 (MACD direction, ADX strength, volume spike)
    const macdBull  = macdLine > macdSignal;
    const macdBear  = macdLine < macdSignal;
    const confMin   = config.confluenceMin ?? 2;
    const trendOk   = adx >= adxMin;
    const volOk     = volMult >= (config.volMultMin ?? 1.2);
    const longConf  = (macdBull ? 1 : 0) + (trendOk ? 1 : 0) + (volOk ? 1 : 0) >= confMin;
    const shortConf = (macdBear ? 1 : 0) + (trendOk ? 1 : 0) + (volOk ? 1 : 0) >= confMin;

    const effLev = Math.max(1, config.leverage ?? 1);

    // Trend-following: RSI 50-63 + MACD↑ + EMA9>EMA21 + ADX≥25 (not just dip-buying)
    // Disabled in range mode (ADX<20 for 6+ ticks) — momentum entries fail in consolidation
    const trendFollow = !rangeMode && rsi >= 50 && rsi <= 63 && macdBull && ema9 > ema21 && adx >= 25 && fourHourTrend !== "bear";

    // Bear market filter: skip RSI dip signals in clear downtrend (EMA + price slope)
    // EMA crossover signals still allowed — they mark trend reversal
    const rsiBuyFiltered = rsiBuy && !bearMkt;
    // Crash protection: >5% dip from 24h high = crash risk, skip new entries
    const isLong  = (crossBuy || rsiBuyFiltered || trendFollow) && longConf && !inCrash;
    // Kraken spot (lev=1): no shorting; Kraken margin (lev>1): shorts allowed
    const krakenSpot = config.platform === "kraken" && effLev === 1;
    const isShort = !krakenSpot && config.allowShorts && (crossSell || rsiSell) && shortConf;

    const cooldownMs = (config.cooldownMin ?? 60) * 60 * 1000;
    const cooldownOk = Date.now() - lastEntryTime > cooldownMs;
    const doLong  = isLong  && cooldownOk;
    const doShort = isShort && cooldownOk;

    if (!doLong && !doShort) {
      const blockReason = inCrash ? `Crash(-${dipFromHigh.toFixed(1)}%)` : bearMkt ? `Bear` : rangeMode ? `Range(ADX${adx.toFixed(0)})` : `brak`;
      addLog(`Brak sygnału — RSI=${rsi.toFixed(1)} MACD${macdBull ? "↑" : "↓"} ADX=${adx.toFixed(0)} 4H:${fourHourTrend} Reżim:${marketRegime} [blok:${blockReason}]`);
      return;
    }
    // Determine which signal triggered
    lastEntrySignal = crossBuy ? "EMA_cross" : trendFollow ? "TrendFollow" : rsiRecovering ? "RSI_bounce" : "RSI_dip";

    const direction: Direction = doLong ? "long" : "short";

    // ATR-based dynamic TP/SL — use whichever is wider to avoid being stopped by noise
    // 1h BTC ATR is typically 0.5–1.5%; fixed 0.6% TP would be too tight
    const effSL    = Math.max(config.stopLoss,   atrPct * 1.5);
    const effTP    = Math.max(config.takeProfit,  atrPct * 2.5);
    const effTrail = Math.max(config.trailPct,    atrPct * 0.8);

    const spec = config.platform === "kraken"
      ? (config.symbol === "BTCUSDT" ? { dec: 4, min: 0.0001 } : config.symbol === "ETHUSDT" ? { dec: 3, min: 0.004 } : { dec: 2, min: 0.01 })
      : config.platform === "eu"
      ? (config.symbol === "BTCUSDT" ? { dec: 5, min: 0.00005 } : config.symbol === "ETHUSDT" ? { dec: 4, min: 0.0001 } : { dec: 2, min: 0.01 })
      : (config.symbol === "BTCUSDT" ? { dec: 3, min: 0.001 }   : config.symbol === "ETHUSDT" ? { dec: 2, min: 0.01 }   : { dec: 1, min: 0.1 });
    const qty = Math.max(parseFloat(((config.capital * effLev) / price).toFixed(spec.dec)), spec.min);

    // Balance check
    try {
      if (config.platform === "kraken") {
        const balResult = await krakenPrivate("/0/private/Balance");
        const usd = parseFloat(balResult.ZUSD ?? "0");
        const eur = parseFloat(balResult.ZEUR ?? "0");
        // Auto-detect fiat: prefer whichever is larger
        config.krakenFiat = eur > usd ? "EUR" : "USD";
        const avail = config.krakenFiat === "EUR" ? eur : usd;
        if (avail < config.capital) {
          addLog(`❌ Niewystarczające saldo: ${avail.toFixed(2)} ${config.krakenFiat} < ${config.capital} — pomijam`, "warn");
          return;
        }
      } else {
        const balData = await bybitFetch("GET", "/v5/account/wallet-balance",
          { accountType: config.platform === "eu" ? "SPOT" : "UNIFIED" });
        const coins: any[] = balData.result?.list?.[0]?.coin ?? [];
        const usdtCoin = coins.find((c: any) => c.coin === "USDT");
        const avail = parseFloat(usdtCoin?.availableToWithdraw ?? usdtCoin?.availableBalance ?? usdtCoin?.walletBalance ?? "0");
        if (avail < config.capital) {
          addLog(`❌ Niewystarczające saldo: ${avail.toFixed(2)} USDT < ${config.capital} USDT — pomijam`, "warn");
          return;
        }
      }
    } catch { /* proceed anyway */ }

    addLog(`🎯 SYGNAŁ ${direction.toUpperCase()} [${lastEntrySignal}] RSI=${rsi.toFixed(1)} MACD${macdBull ? "↑" : "↓"} ADX=${adx.toFixed(0)} 4H:${fourHourTrend} ATR=${atrPct.toFixed(2)}% → SL=${effSL.toFixed(2)}% TP=${effTP.toFixed(2)}% qty=${qty} lev=${effLev}x`, "info");
    try {
      if (config.platform !== "eu" && config.platform !== "kraken" && effLev > 1) {
        try {
          await bybitFetch("POST", "/v5/position/set-leverage", {
            category: "linear", symbol: config.symbol,
            buyLeverage: String(effLev), sellLeverage: String(effLev),
          });
        } catch { /* already set */ }
      }
      await placeOrder(direction, qty);
      position = {
        direction, entryPrice: price, qty, entryTime: new Date().toISOString(), trailRef: price,
        slPct: effSL, tpPct: effTP, trailPct: effTrail, breakEvenSet: false,
        signal: lastEntrySignal,
      };
      lastEntryTime = Date.now();
      saveState();
    } catch (e: any) {
      addLog(`🔴 ZLECENIE NIEUDANE: ${e.message}`, "warn");
    }

  } catch (e: any) { addLog(`Tick error: ${e.message}`, "warn"); }
}

// ── HTTP endpoints ────────────────────────────────────────────────────────────

// GET /api/bot/keys — check if encrypted keys are saved (never returns actual keys)
router.get("/keys", (_req, res) => {
  const keys = decryptApiKeys();
  res.json({ hasKeys: !!keys, testnet: keys?.testnet ?? false, platform: keys?.platform ?? "global" });
});

// POST /api/bot/keys — save encrypted keys
router.post("/keys", (req, res) => {
  const { apiKey, secret, testnet, platform } = req.body;
  if (!apiKey || !secret) return res.status(400).json({ error: "Missing keys" });
  const plat: Platform = platform === "eu" ? "eu" : platform === "kraken" ? "kraken" : "global";
  encryptApiKeys(apiKey.trim(), secret.trim(), !!testnet, plat);
  res.json({ ok: true });
});

router.post("/start", (req, res) => {
  let { apiKey, secret, testnet, platform } = req.body;
  const { symbol, rsiMin, rsiMax, trailPct, stopLoss, takeProfit, leverage, allowShorts, capital, adxMin,
          confluenceMin, volMultMin, cooldownMin } = req.body;

  // If keys not provided, try to load saved encrypted keys
  if (!apiKey || !secret) {
    const saved = decryptApiKeys();
    if (!saved) return res.status(400).json({ error: "Missing exchange keys" });
    apiKey = saved.apiKey; secret = saved.secret; testnet = saved.testnet;
    platform = platform ?? saved.platform;
  }

  if (intervalId) { clearInterval(intervalId); intervalId = null; }
  if (priceIntervalId) { clearInterval(priceIntervalId); priceIntervalId = null; }

  config = {
    symbol: symbol || "BTCUSDT",
    rsiMin:     rsiMin     ?? 40,   // buy dip when RSI < 40
    rsiMax:     rsiMax     ?? 65,   // sell pump when RSI > 65
    trailPct:   trailPct   ?? 0.15, // 0.15% trailing stop
    stopLoss:   stopLoss   ?? 0.4,  // 0.4% stop loss
    takeProfit: takeProfit ?? 0.6,  // 0.6% take profit (scalping)
    leverage:   leverage   ?? 10,
    allowShorts: allowShorts ?? true,
    capital: capital ?? 9,
    adxMin:        adxMin        ?? 15,
    confluenceMin: confluenceMin ?? 2,
    volMultMin:    volMultMin    ?? 1.2,
    cooldownMin:   cooldownMin   ?? 60,
    apiKey, secret, testnet: testnet === true,
    platform: platform === "eu" ? "eu" : platform === "kraken" ? "kraken" : "global",
  };

  // Save keys encrypted for auto-resume after restarts
  encryptApiKeys(apiKey, secret, testnet === true, config.platform);

  running = true;
  position = null;
  sessionPnl = 0;
  closeFailCount = 0;
  lastEntryTime = 0;
  lastPrice = 0;
  prevRsi = 50;
  dipFromHigh = 0;
  marketRegime = "neutral";
  tickCount = 0;
  adxLowCount = 0;
  rangeMode = false;
  dailyDate = "";
  dailyStartPnl = 0;
  tradeHistory = [];
  sessionWins = 0;
  sessionLosses = 0;
  sessionPeakPnl = 0;
  sessionMaxDrawdown = 0;
  fourHourTrend = "neutral";
  lastEntrySignal = "";
  logs = [];
  const krakenLev = Math.max(1, config.leverage ?? 1);
  const platformLabel = config.platform === "kraken"
    ? `Kraken (${krakenLev > 1 ? `margin ${krakenLev}x` : "spot"} ${config.krakenFiat ?? "USD"})`
    : config.platform === "eu" ? "Bybit EU (spot margin)" : "Bybit Global (linear)";
  const capitalLabel = config.platform === "kraken" ? (config.krakenFiat ?? "USD") : "USDT";
  addLog(`Bot started — ${config.symbol} ${platformLabel} capital=${config.capital} ${capitalLabel} | TP=${config.takeProfit}% SL=${config.stopLoss}%`, "info");
  saveState();

  engineTick();
  intervalId = setInterval(engineTick, 5 * 60_000); // co 5 min — świece 1h
  priceIntervalId = setInterval(priceCheck, 5_000); // co 5s — cena live

  res.json({ ok: true, message: "Bot started on server" });
});

// POST /api/bot/params — live-update RSI/trail params without restarting bot
router.post("/params", (req, res) => {
  if (!config || !running) return res.status(400).json({ error: "Bot not running" });
  const { rsiMin, rsiMax, trailPct, stopLoss, takeProfit } = req.body;
  if (rsiMin != null)     config.rsiMin     = parseFloat(rsiMin);
  if (rsiMax != null)     config.rsiMax     = parseFloat(rsiMax);
  if (trailPct != null)   config.trailPct   = parseFloat(trailPct);
  if (stopLoss != null)   config.stopLoss   = parseFloat(stopLoss);
  if (takeProfit != null) config.takeProfit = parseFloat(takeProfit);
  addLog(`⚙️ Parametry zaktualizowane (Deep Train): RSI[${config.rsiMin}-${config.rsiMax}] Trail${config.trailPct}%`, "info");
  res.json({ ok: true });
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
  const totalTrades = sessionWins + sessionLosses;
  const winRate = totalTrades > 0 ? sessionWins / totalTrades * 100 : 0;
  const histWins  = tradeHistory.filter(t => t.pnlPct > 0);
  const histLosses = tradeHistory.filter(t => t.pnlPct <= 0);
  const avgWin  = histWins.length  > 0 ? histWins.reduce((s, t) => s + t.pnlPct, 0)  / histWins.length  : 0;
  const avgLoss = histLosses.length > 0 ? histLosses.reduce((s, t) => s + t.pnlPct, 0) / histLosses.length : 0;
  res.json({
    running, position, sessionPnl,
    logs: logs.slice(-50),
    symbol: config?.symbol,
    capital: config?.capital,
    leverage: config?.leverage,
    dipStats: {
      dipFromHigh: parseFloat(dipFromHigh.toFixed(1)),
      marketRegime,
      rsiRecovering: tickCount > 3 && prevRsi < (config?.rsiMin ?? 40) && prevRsi > 0,
      prevRsi: parseFloat(prevRsi.toFixed(1)),
      crashActive: dipFromHigh > 5.0,
      fourHourTrend,
      rangeMode,
    },
    sessionStats: {
      wins: sessionWins,
      losses: sessionLosses,
      winRate: parseFloat(winRate.toFixed(1)),
      avgWin: parseFloat(avgWin.toFixed(2)),
      avgLoss: parseFloat(avgLoss.toFixed(2)),
      maxDrawdown: parseFloat(sessionMaxDrawdown.toFixed(2)),
      tradeHistory: tradeHistory.slice(-10),
    },
  });
});

// ── Backtest / simulation (public — no auth required) ─────────────────────────

router.post("/backtest", async (req, res) => {
  try {
    const {
      symbol = "BTCUSDT",
      rsiMin = 40, rsiMax = 65, adxMin = 15,
      confluenceMin = 2, volMultMin = 1.2, cooldownMin = 60,
      stopLoss = 0.4, takeProfit = 0.6, trailPct = 0.15,
    } = req.body ?? {};

    // Map Bybit symbol to Kraken pair (USD)
    const PAIR_MAP: Record<string, string> = { BTCUSDT: "XBTUSD", ETHUSDT: "ETHUSD", SOLUSDT: "SOLUSD" };
    const pair = PAIR_MAP[symbol] ?? "XBTUSD";
    const since = Math.floor(Date.now() / 1000) - 720 * 3600; // 30 days
    const url = `https://api.kraken.com/0/public/OHLC?pair=${pair}&interval=60&since=${since}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(`Kraken HTTP ${r.status}`);
    const d = await r.json() as any;
    if (d.error?.length) throw new Error(`Kraken: ${d.error[0]}`);
    const key = Object.keys(d.result).find(k => k !== "last")!;
    const raw: any[] = d.result[key] ?? [];
    if (raw.length < 60) throw new Error("Za mało danych historycznych");

    const closes  = raw.map((c: any) => parseFloat(c[4]));
    const highs   = raw.map((c: any) => parseFloat(c[2]));
    const lows    = raw.map((c: any) => parseFloat(c[3]));
    const volumes = raw.map((c: any) => parseFloat(c[6]));

    type SimTrade = { dir: string; entryPrice: number; exitPrice: number; pnlPct: number; reason: string; date: string };
    const trades: SimTrade[] = [];
    const cooldownMs = (cooldownMin as number) * 60 * 1000;
    let lastEntry = 0;

    for (let i = 50; i < raw.length - 2; i++) {
      const tMs = raw[i][0] * 1000;
      if (tMs - lastEntry <= cooldownMs) continue;

      const sc = closes.slice(Math.max(0, i - 149), i + 1);
      const sh = highs.slice(Math.max(0, i - 149), i + 1);
      const sl = lows.slice(Math.max(0, i - 149), i + 1);
      const sv = volumes.slice(Math.max(0, i - 149), i + 1);

      const rsi     = calcRsi(sc);
      const ema9    = calcEma(sc, 9);
      const ema21   = calcEma(sc, 21);
      const prevSc  = closes.slice(Math.max(0, i - 150), i);
      const prevE9  = calcEma(prevSc, 9);
      const prevE21 = calcEma(prevSc, 21);
      const { macd: macdLine, signal: macdSig } = calcMacd(sc);
      const adx     = calcAdx(sh, sl, sc);
      const volMult = calcVolumeMult(sv);
      const atr     = calcAtr(sh, sl, sc);
      const price   = parseFloat(raw[i][4]);

      const crossBuy  = ema9 > ema21 && prevE9 <= prevE21;
      const rsiBuy    = rsi < (rsiMin as number);
      const macdBull  = macdLine > macdSig;
      const trendOk   = adx >= (adxMin as number);
      const volOk     = volMult >= (volMultMin as number);
      const confScore = (macdBull ? 1 : 0) + (trendOk ? 1 : 0) + (volOk ? 1 : 0);
      if (confScore < (confluenceMin as number)) continue;
      if (!crossBuy && !rsiBuy) continue;

      const atrPct  = price > 0 ? (atr / price) * 100 : 0;
      const effSL   = Math.max(stopLoss as number, atrPct * 1.5);
      const effTP   = Math.max(takeProfit as number, atrPct * 2.5);
      const effTrl  = Math.max(trailPct as number, atrPct * 0.8);

      let exit = price, reason = "session_end", trailRef = price;
      for (let j = i + 1; j < Math.min(i + 48, raw.length); j++) {
        const hi = parseFloat(raw[j][2]);
        const lo = parseFloat(raw[j][3]);
        const cl = parseFloat(raw[j][4]);
        trailRef = Math.max(trailRef, hi);
        if (lo <= price * (1 - effSL / 100))  { exit = price * (1 - effSL / 100); reason = "stop_loss";   break; }
        if (hi >= price * (1 + effTP / 100))  { exit = price * (1 + effTP / 100); reason = "take_profit"; break; }
        const tSL = trailRef * (1 - effTrl / 100);
        if (cl <= tSL && j > i + 2)           { exit = tSL;                       reason = "trail_stop";  break; }
        if (j === i + 47) exit = cl;
      }

      const pnlPct = (exit - price) / price * 100;
      trades.push({ dir: "long", entryPrice: parseFloat(price.toFixed(2)), exitPrice: parseFloat(exit.toFixed(2)), pnlPct: parseFloat(pnlPct.toFixed(3)), reason, date: new Date(tMs).toISOString() });
      lastEntry = tMs;
    }

    const wins = trades.filter(t => t.pnlPct > 0).length;
    const winRate = trades.length > 0 ? (wins / trades.length) * 100 : 0;
    const totalReturn = trades.reduce((s, t) => s + t.pnlPct, 0);
    const avgWin  = wins > 0 ? trades.filter(t => t.pnlPct > 0).reduce((s, t) => s + t.pnlPct, 0) / wins : 0;
    const losses  = trades.length - wins;
    const avgLoss = losses > 0 ? trades.filter(t => t.pnlPct <= 0).reduce((s, t) => s + t.pnlPct, 0) / losses : 0;
    let equity = 100, peakEq = 100, maxDD = 0;
    for (const t of trades) {
      equity *= (1 + t.pnlPct / 100);
      if (equity > peakEq) peakEq = equity;
      const dd = (peakEq - equity) / peakEq * 100;
      if (dd > maxDD) maxDD = dd;
    }

    res.json({
      ok: true,
      days: Math.round(raw.length / 24),
      symbol,
      numTrades: trades.length,
      winRate: parseFloat(winRate.toFixed(1)),
      totalReturn: parseFloat(totalReturn.toFixed(2)),
      maxDrawdown: parseFloat(maxDD.toFixed(2)),
      avgWin: parseFloat(avgWin.toFixed(2)),
      avgLoss: parseFloat(avgLoss.toFixed(2)),
      finalEquity: parseFloat(equity.toFixed(2)),
      trades: trades.slice(-30),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Auto-resume bot if it was running before server restart
setTimeout(loadState, 3000);

export default router;
