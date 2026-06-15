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
import { calcRsi, calcEma, calcMacd, calcAdx, calcAtr, calcVolumeMult, calcStochRsi, calcBBPercB, calcRoc } from "../lib/indicators";
import { simulate } from "../lib/strategySim";
import { nextKrakenNonce, krakenSerialize } from "../lib/krakenNonce";

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
      intervalId = setInterval(engineTick, 60_000);
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
  const cfg = config;
  // Serialize + monotonic nonce shared with the frontend Kraken routes so
  // concurrent calls never collide or arrive out of order ("Invalid nonce").
  return krakenSerialize(async () => {
    const nonce = nextKrakenNonce();
    const allParams = { ...params, nonce };
    const body = new URLSearchParams(allParams as Record<string, string>).toString();
    const sha256 = crypto.createHash("sha256").update(nonce + body).digest();
    const hmacInput = Buffer.concat([Buffer.from(path), sha256]);
    const sign = crypto
      .createHmac("sha512", Buffer.from(cfg.secret, "base64"))
      .update(hmacInput)
      .digest("base64");
    const r = await fetch(`https://api.kraken.com${path}`, {
      method: "POST",
      headers: {
        "API-Key": cfg.apiKey.trim(),
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
  });
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
    const since = Math.floor(Date.now() / 1000) - 150 * 5 * 60;
    const raw = await krakenOhlcFetch(pair, 5, since);
    if (!raw || raw.length < 50) throw new Error("Not enough candles");
    const list = raw.slice(-150);
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

// ── Kraken public OHLC: serialized queue + rate-limit backoff + timeline cache ─

// One OHLC request at a time — prevents 429 collisions between bot tick + simulation
let _krakenOhlcQ: Promise<void> = Promise.resolve();
let _krakenOhlcLast = 0; // timestamp of last completed OHLC request

// Timeline cache per (pair, interval): stores all candles seen, merged + deduped.
// TTL 5 min — fresh enough for backtest, prevents re-fetching on repeated clicks.
interface OhlcCacheEntry { candles: any[]; fetchedAt: number }
const _ohlcCache = new Map<string, OhlcCacheEntry>();

function _ohlcCacheKey(pair: string, interval: number) { return `${pair}_${interval}`; }

function _ohlcCacheMerge(pair: string, interval: number, newCandles: any[]) {
  const key = _ohlcCacheKey(pair, interval);
  const ex = _ohlcCache.get(key);
  let merged: any[];
  if (!ex) {
    merged = [...newCandles];
  } else {
    const seen = new Set<number>(ex.candles.map((c: any) => c[0] as number));
    const added = newCandles.filter((c: any) => !seen.has(c[0]));
    merged = [...ex.candles, ...added].sort((a: any, b: any) => a[0] - b[0]);
    if (merged.length > 12000) merged = merged.slice(-12000); // keep ≤42 days at 5m
  }
  _ohlcCache.set(key, { candles: merged, fetchedAt: Date.now() });
}

function _ohlcCacheGet(pair: string, interval: number, since: number): any[] | null {
  const entry = _ohlcCache.get(_ohlcCacheKey(pair, interval));
  if (!entry || Date.now() - entry.fetchedAt > 5 * 60 * 1000) return null;
  const slice = entry.candles.filter((c: any) => c[0] >= since);
  return slice.length >= 20 ? slice : null; // only return if enough candles from that point
}

async function krakenOhlcFetch(pair: string, interval: number, since: number): Promise<any[] | null> {
  // Check timeline cache first — avoids a Kraken call if we have fresh data
  const cached = _ohlcCacheGet(pair, interval, since);
  if (cached) return cached;

  return new Promise<any[] | null>((resolve) => {
    _krakenOhlcQ = _krakenOhlcQ.then(async () => {
      // Enforce ≥500ms gap between consecutive OHLC requests (Kraken public limit ~2/sec)
      const gap = 500 - (Date.now() - _krakenOhlcLast);
      if (gap > 0) await new Promise(r => setTimeout(r, gap));
      _krakenOhlcLast = Date.now();

      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const r = await fetch(
            `https://api.kraken.com/0/public/OHLC?pair=${pair}&interval=${interval}&since=${since}`,
            { signal: AbortSignal.timeout(15000) },
          );
          if (r.status === 429 || r.status === 520) {
            await new Promise(r2 => setTimeout(r2, 2000 * (attempt + 1)));
            continue;
          }
          if (!r.ok) { resolve(null); return; }
          const d = await r.json() as any;
          if (d.error?.length) { resolve(null); return; }
          const key = Object.keys(d.result).find(k => k !== "last");
          if (!key) { resolve([]); return; }
          const candles: any[] = d.result[key] ?? [];
          if (candles.length > 0) _ohlcCacheMerge(pair, interval, candles);
          resolve(candles);
          return;
        } catch {
          if (attempt < 4) await new Promise(r2 => setTimeout(r2, 1000 * (attempt + 1)));
        }
      }
      resolve(null);
    }).catch(() => { resolve(null); });
  });
}

// ── Indicator snapshot (2-min cache) ─────────────────────────────────────────
let indSnapCache: { ts: number; symbol: string; snap: Record<string, number> } | null = null;

async function getIndSnap(symbol: string): Promise<Record<string, number>> {
  if (indSnapCache && indSnapCache.symbol === symbol && Date.now() - indSnapCache.ts < 120_000) {
    return indSnapCache.snap;
  }
  const PAIR_MAP: Record<string, string> = { BTCUSDT: "XBTUSD", ETHUSDT: "ETHUSD", SOLUSDT: "SOLUSD" };
  const pair = PAIR_MAP[symbol] ?? "XBTUSD";
  const since = Math.floor(Date.now() / 1000) - 100 * 5 * 60;
  const rawList = await krakenOhlcFetch(pair, 5, since);
  if (!rawList || rawList.length < 50) throw new Error("Not enough candles");
  const list = rawList.slice(-100);

  const closes  = list.map((c: any) => parseFloat(c[4]));
  const opens   = list.map((c: any) => parseFloat(c[1]));
  const highs   = list.map((c: any) => parseFloat(c[2]));
  const lows    = list.map((c: any) => parseFloat(c[3]));
  const volumes = list.map((c: any) => parseFloat(c[6]));

  const price = closes[closes.length - 1];
  const openC = opens[opens.length - 1] ?? price;

  const stochRsi = calcStochRsi(closes);
  const bbPercB  = calcBBPercB(closes);
  const roc14    = calcRoc(closes, 14);
  const adxNow   = calcAdx(highs, lows, closes);
  const adxPrev  = calcAdx(highs.slice(0, -3), lows.slice(0, -3), closes.slice(0, -3));
  const ema21    = calcEma(closes, 21);
  const ema21p   = calcEma(closes.slice(0, -1), 21);

  const body   = Math.abs(price - openC);
  const range  = (highs[highs.length - 1] - lows[lows.length - 1]) || 1;
  const upWick = highs[highs.length - 1] - Math.max(price, openC);

  const tenH = Math.max(...highs.slice(-9)), tenL = Math.min(...lows.slice(-9));
  const kijH = highs.length >= 26 ? Math.max(...highs.slice(-26)) : tenH;
  const kijL = lows.length  >= 26 ? Math.min(...lows.slice(-26))  : tenL;
  const tenkan = (tenH + tenL) / 2, kijun = (kijH + kijL) / 2;

  const haC = (openC + highs[highs.length-1] + lows[lows.length-1] + price) / 4;
  const haO = opens.length >= 2 ? (opens[opens.length-2] + closes[closes.length-2]) / 2 : openC;

  const calcBBW = (arr: number[]) => {
    const sma = arr.reduce((s, v) => s + v, 0) / arr.length;
    const std  = Math.sqrt(arr.reduce((s, v) => s + (v - sma) ** 2, 0) / arr.length);
    return sma > 0 ? (4 * std) / sma * 100 : 0;
  };
  const currW = calcBBW(closes.slice(-20));
  const avgW  = [1,2,3,4,5].reduce((s, k) => {
    const sl2 = closes.slice(-20-k, -k); return s + (sl2.length >= 10 ? calcBBW(sl2) : currW);
  }, 0) / 5;

  const snap: Record<string, number> = {
    stochRsi:      parseFloat(stochRsi.toFixed(1)),
    bbPercB:       parseFloat(bbPercB.toFixed(1)),
    roc14:         parseFloat(roc14.toFixed(2)),
    adx:           parseFloat(adxNow.toFixed(1)),
    adxRising:     adxNow > adxPrev ? 1 : 0,
    bodyQuality:   parseFloat((body / range).toFixed(2)),
    emaSlope:      ema21 > ema21p ? 1 : 0,
    candleConfirm: [closes[closes.length-1], closes[closes.length-2]].filter(v => v > ema21).length,
    volTrend:      (volumes[volumes.length-1] > volumes[volumes.length-2] && volumes[volumes.length-2] > volumes[volumes.length-3]) ? 1 : 0,
    wickRej:       parseFloat((body > 0 ? upWick / body : 0).toFixed(2)),
    ichimokuOk:    tenkan > kijun ? 1 : 0,
    heikinAshi:    haC > haO ? 1 : 0,
    bbSqueeze:     currW < avgW * 0.8 ? 1 : 0,
  };

  indSnapCache = { ts: Date.now(), symbol, snap };
  return snap;
}

async function fetch4HCandles(symbol: string): Promise<{ema9:number;ema21:number}|null> {
  const pair = krakenPair(symbol);
  try {
    const since = Math.floor(Date.now() / 1000) - 50 * 4 * 3600;
    const raw = await krakenOhlcFetch(pair, 240, since);
    if (!raw || raw.length < 22) return null;
    const list = raw.slice(-30);
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
    const rsiBuyFiltered = rsiBuy && !bearMkt && fourHourTrend !== "bear";
    const trendQuality = adx >= 15;
    // Crash protection: >5% dip from 24h high = crash risk, skip new entries
    const isLong  = (crossBuy || rsiBuyFiltered || trendFollow) && longConf && !inCrash && trendQuality;
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
    rsiMin:     rsiMin     ?? 36,   // buy dip when RSI < 36
    rsiMax:     rsiMax     ?? 67,   // sell pump when RSI > 67
    trailPct:   trailPct   ?? 0.45, // 0.45% trailing stop
    stopLoss:   stopLoss   ?? 1.20, // 1.2% SL — must survive Kraken 0.52% RT fee
    takeProfit: takeProfit ?? 2.50, // 2.5% TP — net 1.98% profit after 0.52% fees
    leverage:   leverage   ?? 10,
    allowShorts: allowShorts ?? true,
    capital: capital ?? 9,
    adxMin:        adxMin        ?? 12,  // niższy próg — 5m mają słabszy ADX
    confluenceMin: confluenceMin ?? 1,   // 1 z 3 potwierdzeń (mniej restrykcyjne)
    volMultMin:    volMultMin    ?? 1.0, // brak filtra wolumenu
    cooldownMin:   cooldownMin   ?? 20,  // 20min między wejściami (zamiast 60)
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
  intervalId = setInterval(engineTick, 60_000); // co 1 min — świece 5m
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
    autoRetrain: { enabled: !!autoRetrainId, intervalH: autoRetrainIntervalH },
  });
});

// ── Backtest / simulation (public — no auth required) ─────────────────────────

router.post("/backtest", async (req, res) => {
  try {
    const {
      symbol = "BTCUSDT",
      rsiMin = 35, rsiMax = 68, adxMin = 12,
      confluenceMin = 1, volMultMin = 1.0, cooldownMin = 20,
      stopLoss = 0.3, takeProfit = 0.6, trailPct = 0.12,
      leverage = 1, allowShorts = false,
      filters,
    } = req.body ?? {};

    const PAIR_MAP: Record<string, string> = { BTCUSDT: "XBTUSD", ETHUSDT: "ETHUSD", SOLUSDT: "SOLUSD" };
    const pair = PAIR_MAP[symbol] ?? "XBTUSD";
    const FIVE = 5 * 60; // 5m in seconds

    // ── Fetch 5m candles, paginated (~7 days = 2016 candles, 3 pages) ──────────
    const wantPages = 3;
    let sinceP = Math.floor(Date.now() / 1000) - wantPages * 720 * FIVE;
    let raw: any[] = [];
    for (let pg = 0; pg < wantPages; pg++) {
      const page = await krakenOhlcFetch(pair, 5, sinceP);
      if (!page || !page.length) break;
      raw.push(...page);
      sinceP = page[page.length - 1][0] + FIVE;
    }
    // dedup + sort by time
    const seen = new Set<number>();
    raw = raw.filter(c => { if (seen.has(c[0])) return false; seen.add(c[0]); return true; }).sort((a, b) => a[0] - b[0]);
    if (raw.length < 100) throw new Error(`Za mało danych historycznych 5m (${raw.length} świec, wymagane 100)`);

    // ── Fetch 4H candles for trend lookup (mirrors live fetch4HCandles) ────────
    let raw4: any[] = [];
    try {
      const h4since = Math.floor(Date.now() / 1000) - 200 * 4 * 3600;
      const r4list = await krakenOhlcFetch(pair, 240, h4since);
      if (r4list) raw4 = r4list;
    } catch { /* 4h optional — falls back to neutral */ }
    // ── Run shared sim engine (mirrors live engineTick exactly) ────────────────
    const r = simulate(raw, raw4, {
      rsiMin, rsiMax, adxMin, confluenceMin, volMultMin, cooldownMin,
      stopLoss, takeProfit, trailPct, leverage, allowShorts,
      filters,
    });

    res.json({
      ok: true,
      days: Math.round(raw.length * 5 / 60 / 24),
      symbol,
      numTrades: r.numTrades,
      longs: r.longs,
      shorts: r.shorts,
      winRate: r.winRate,
      totalReturn: r.totalReturn,
      maxDrawdown: r.maxDrawdown,
      avgWin: r.avgWin,
      avgLoss: r.avgLoss,
      finalEquity: r.finalEquity,
      trades: r.trades.slice(-30),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Shared optimization engine (walk-forward + extended grid) ─────────────────

type OptCombo = {
  rsiMin: number; rsiMax: number; trailPct: number; stopLoss: number; takeProfit: number;
  trainWinRate: number; trainReturn: number; trainSharpe: number; trainTrades: number;
  validWinRate: number; validReturn: number; validSharpe: number; validTrades: number;
  confidence: number; score: number;
};

async function runOptimize(params: {
  symbol: string; adxMin: number; confluenceMin: number;
  volMultMin: number; cooldownMin: number; leverage: number; allowShorts: boolean;
}): Promise<{ result: OptCombo; days: number; combosTested: number }> {
  const { symbol, adxMin, confluenceMin, volMultMin, cooldownMin, leverage, allowShorts } = params;
  const PAIR_MAP: Record<string, string> = { BTCUSDT: "XBTUSD", ETHUSDT: "ETHUSD", SOLUSDT: "SOLUSD" };
  const pair = PAIR_MAP[symbol] ?? "XBTUSD";
  const FIVE = 5 * 60;

  // Fetch ~18 days (8 pages × 720 candles = 5760 candles × 5min = 20 days)
  const wantPages = 8;
  let sinceP = Math.floor(Date.now() / 1000) - wantPages * 720 * FIVE;
  let raw: any[] = [];
  for (let pg = 0; pg < wantPages; pg++) {
    const page = await krakenOhlcFetch(pair, 5, sinceP);
    if (!page || !page.length) break;
    raw.push(...page);
    sinceP = page[page.length - 1][0] + FIVE;
  }
  const seen = new Set<number>();
  raw = raw.filter(c => { if (seen.has(c[0])) return false; seen.add(c[0]); return true; }).sort((a, b) => a[0] - b[0]);
  if (raw.length < 200) throw new Error(`Za mało danych historycznych 5m (${raw.length} świec, wymagane 200)`);

  // 4H candles (optional)
  let raw4: any[] = [];
  try {
    const h4since = Math.floor(Date.now() / 1000) - 200 * 4 * 3600;
    const r4list = await krakenOhlcFetch(pair, 240, h4since);
    if (r4list) raw4 = r4list;
  } catch { /* neutral fallback */ }

  // Walk-forward split: 70% train → 30% validate
  const splitIdx = Math.floor(raw.length * 0.70);
  const trainRaw = raw.slice(0, splitIdx);
  const validRaw = raw.slice(splitIdx);

  // Grid designed for Kraken 0.52% round-trip fee — minimum TP 1.5% to profit after fees
  // [rsiMin, rsiMax, trailPct, stopLoss, takeProfit]
  const grid: [number, number, number, number, number][] = [
    [35, 65, 0.30, 1.00, 2.00], [35, 65, 0.50, 1.20, 2.50], [35, 65, 0.60, 1.50, 3.00],
    [30, 70, 0.40, 1.20, 2.50], [30, 70, 0.60, 1.50, 3.00], [30, 70, 0.80, 2.00, 4.00],
    [40, 65, 0.30, 0.80, 1.80], [40, 65, 0.40, 1.00, 2.00], [40, 65, 0.50, 1.20, 2.50],
    [38, 62, 0.35, 0.90, 1.80], [38, 62, 0.45, 1.10, 2.20], [42, 68, 0.40, 1.00, 2.20],
    [33, 67, 0.30, 1.00, 2.00], [36, 64, 0.35, 0.90, 1.90], [32, 68, 0.50, 1.50, 3.00],
    [28, 72, 0.50, 1.50, 3.00], [30, 65, 0.40, 1.00, 2.20], [35, 70, 0.45, 1.20, 2.50],
    [40, 70, 0.60, 1.50, 3.00], [45, 65, 0.35, 0.90, 1.80],
  ];

  let best: OptCombo | null = null;

  for (const [rsiMin, rsiMax, trailPct, stopLoss, takeProfit] of grid) {
    // Optimizer uses permissive confluence/cooldown to find signals across all combos.
    // Strict preset settings are applied by the live bot, not the signal search.
    const p = { rsiMin, rsiMax, adxMin, confluenceMin: 1, volMultMin: 1.0, cooldownMin: 30, stopLoss, takeProfit, trailPct, leverage, allowShorts };
    const tr = simulate(trainRaw, raw4, p);
    if (tr.numTrades < 3) continue;
    const vr = simulate(validRaw, raw4, p);

    // Confidence: 60% win-rate consistency + 40% validation return positive
    const wrRatio = tr.winRate > 0 ? Math.min(1, vr.winRate / tr.winRate) : 0;
    const confidence = Math.round(wrRatio * 60 + (vr.totalReturn >= 0 ? 40 : vr.totalReturn >= -1 ? 20 : 0));
    const score = tr.sharpe * (confidence / 100);

    const cand: OptCombo = {
      rsiMin, rsiMax, trailPct, stopLoss, takeProfit,
      trainWinRate: parseFloat(tr.winRate.toFixed(1)),   trainReturn: parseFloat(tr.totalReturn.toFixed(2)),
      trainSharpe:  parseFloat(tr.sharpe.toFixed(2)),    trainTrades: tr.numTrades,
      validWinRate: parseFloat((vr.winRate ?? 0).toFixed(1)),   validReturn: parseFloat((vr.totalReturn ?? 0).toFixed(2)),
      validSharpe:  parseFloat((vr.sharpe ?? 0).toFixed(2)),    validTrades: vr.numTrades ?? 0,
      confidence, score,
    };
    if (!best || cand.score > best.score) best = cand;
  }

  if (!best) throw new Error("Żadna kombinacja nie miała wystarczająco transakcji");
  return { result: best, days: Math.round(raw.length * 5 / 60 / 24), combosTested: grid.length };
}

// ── Auto-retrain timer ─────────────────────────────────────────────────────────

let autoRetrainId: ReturnType<typeof setInterval> | null = null;
let autoRetrainIntervalH = 24;

async function doAutoRetrain() {
  if (!running || !config) return;
  try {
    addLog("🧠 Auto-retrain start…", "info");
    const { result } = await runOptimize({
      symbol: config.symbol, adxMin: config.adxMin,
      confluenceMin: config.confluenceMin, volMultMin: config.volMultMin,
      cooldownMin: config.cooldownMin, leverage: config.leverage,
      allowShorts: config.allowShorts,
    });
    if (result.confidence >= 55 && result.trainWinRate >= 45) {
      config.rsiMin     = result.rsiMin;
      config.rsiMax     = result.rsiMax;
      config.trailPct   = result.trailPct;
      config.stopLoss   = result.stopLoss;
      config.takeProfit = result.takeProfit;
      addLog(`🧠 Auto-retrain ✓ RSI[${result.rsiMin}–${result.rsiMax}] SL${result.stopLoss}% TP${result.takeProfit}% conf=${result.confidence}%`, "info");
    } else {
      addLog(`🧠 Auto-retrain: wynik słaby (conf=${result.confidence}% WR=${result.trainWinRate}%) — bez zmian`, "warn");
    }
  } catch (e: any) {
    addLog(`🧠 Auto-retrain błąd: ${e.message}`, "warn");
  }
}

// POST /api/bot/autotrain — enable/disable server-side auto-retraining
router.post("/autotrain", (req, res) => {
  const { enabled, intervalH = 24 } = req.body ?? {};
  if (autoRetrainId) { clearInterval(autoRetrainId); autoRetrainId = null; }
  if (enabled) {
    autoRetrainIntervalH = Math.max(1, Math.min(168, Number(intervalH) || 24));
    autoRetrainId = setInterval(doAutoRetrain, autoRetrainIntervalH * 3600 * 1000);
    addLog(`🧠 Auto-retrain włączony co ${autoRetrainIntervalH}h`, "info");
    res.json({ ok: true, enabled: true, intervalH: autoRetrainIntervalH });
  } else {
    addLog("🧠 Auto-retrain wyłączony", "info");
    res.json({ ok: true, enabled: false });
  }
});

// GET /api/bot/indicators — live indicator snapshot (2-min cache)
router.get("/indicators", async (req, res) => {
  try {
    const symbol = (req.query.symbol as string) || config?.symbol || "BTCUSDT";
    const snap = await getIndSnap(symbol);
    res.json({ ok: true, ...snap });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/bot/auto-indicators — test which filters improve performance
router.post("/auto-indicators", async (req, res) => {
  try {
    const {
      symbol = "BTCUSDT", leverage = 1, allowShorts = false,
      rsiMin = 36, rsiMax = 67, adxMin = 16,
      confluenceMin = 1, volMultMin = 1.0, cooldownMin = 30,
      stopLoss = 1.20, takeProfit = 2.50, trailPct = 0.45,
    } = req.body ?? {};

    const PAIR_MAP: Record<string, string> = { BTCUSDT: "XBTUSD", ETHUSDT: "ETHUSD", SOLUSDT: "SOLUSD" };
    const pair = PAIR_MAP[symbol] ?? "XBTUSD";
    const FIVE = 5 * 60;
    const wantPages = 8;
    let sinceP = Math.floor(Date.now() / 1000) - wantPages * 720 * FIVE;
    let raw: any[] = [];
    for (let pg = 0; pg < wantPages; pg++) {
      const page = await krakenOhlcFetch(pair, 5, sinceP);
      if (!page || !page.length) break;
      raw.push(...page);
      sinceP = page[page.length - 1][0] + FIVE;
    }
    const seen = new Set<number>();
    raw = raw.filter(c => { if (seen.has(c[0])) return false; seen.add(c[0]); return true; }).sort((a, b) => a[0] - b[0]);
    if (raw.length < 200) throw new Error(`Za mało danych historycznych 5m (${raw.length} świec, wymagane 200)`);

    let raw4: any[] = [];
    try {
      const h4since = Math.floor(Date.now() / 1000) - 200 * 4 * 3600;
      const r4list = await krakenOhlcFetch(pair, 240, h4since);
      if (r4list) raw4 = r4list;
    } catch { /* neutral */ }

    const baseP = { rsiMin, rsiMax, adxMin, confluenceMin, volMultMin, cooldownMin, stopLoss, takeProfit, trailPct, leverage, allowShorts };
    const baseline = simulate(raw, raw4, baseP);

    const filterKeys = ['stochRsi80','bbPercB80','bodyQuality','emaSlope','candleConfirm','adxRising','volTrend','wickRej','roc14','ichimoku','heikinAshi','bbSqueeze'] as const;
    const scores: Record<string, { winRate: number; totalReturn: number; numTrades: number; delta: number }> = {};

    for (const fKey of filterKeys) {
      const result = simulate(raw, raw4, { ...baseP, filters: { [fKey]: true } });
      const delta = (result.winRate - baseline.winRate) + (result.totalReturn - baseline.totalReturn) * 0.3;
      scores[fKey] = { winRate: result.winRate, totalReturn: result.totalReturn, numTrades: result.numTrades, delta: parseFloat(delta.toFixed(2)) };
    }

    const recommended = filterKeys.filter(k => scores[k].delta > 0.5 && scores[k].numTrades >= 3);
    res.json({
      ok: true,
      baseline: { winRate: baseline.winRate, totalReturn: baseline.totalReturn, numTrades: baseline.numTrades },
      scores,
      recommended,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Optimizer HTTP endpoint ────────────────────────────────────────────────────
router.post("/optimize", async (req, res) => {
  try {
    const {
      symbol = "BTCUSDT",
      adxMin = 12, confluenceMin = 1, volMultMin = 1.0, cooldownMin = 20,
      leverage = 1, allowShorts = false,
    } = req.body ?? {};

    const { result, days, combosTested } = await runOptimize({
      symbol, adxMin, confluenceMin, volMultMin, cooldownMin, leverage, allowShorts,
    });

    res.json({ ok: true, ...result, days, combosTested });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Auto-resume bot if it was running before server restart
setTimeout(loadState, 3000);

export default router;
