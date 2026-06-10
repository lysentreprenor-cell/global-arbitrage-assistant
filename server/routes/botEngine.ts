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
type Platform = "global" | "eu";

type BotConfig = {
  symbol: string;
  rsiMin: number; rsiMax: number;
  trailPct: number; stopLoss: number; takeProfit: number;
  leverage: number;
  allowShorts: boolean;
  capital: number; // USDT to use per trade
  adxMin: number;
  apiKey: string; secret: string; testnet: boolean;
  platform: Platform; // "eu" → api.bybit.eu (spot margin), "global" → api.bybit.com (linear)
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
      position = null;
      sessionPnl = 0;
      running = true;
      addLog("Auto-resume po restarcie serwera", "info");
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

// Returns orderId on success, throws on failure
async function placeOrder(side: Direction, qty: number): Promise<string> {
  if (!config) throw new Error("No config");
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
  BTCUSDT: "XBTUSD", ETHUSDT: "ETHUSD", SOLUSDT: "SOLUSD", BNBUSDT: "BNBUSD",
};

let lastPrice = 0;
let lastEntryTime = 0;
let closeFailCount = 0;

async function fetchCandles(symbol: string): Promise<{closes:number[];highs:number[];lows:number[];volumes:number[];price:number}|null> {
  const pair = SYMBOL_MAP[symbol] ?? "XBTUSD";
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
    const price = lastPrice > 0 ? lastPrice : candles.price;

    const rsi  = calcRsi(closes);
    const ema9  = calcEma(closes, 9);
    const ema21 = calcEma(closes, 21);
    // Previous bar EMAs for crossover detection
    const prevEma9  = calcEma(closes.slice(0, -1), 9);
    const prevEma21 = calcEma(closes.slice(0, -1), 21);

    // Multi-indicator confluence
    const { macd: macdLine, signal: macdSignal } = calcMacd(closes);
    const adx     = calcAdx(highs, lows, closes);
    const volMult = calcVolumeMult(volumes);

    addLog(`Tick: ${config.symbol} $${price.toFixed(0)} RSI=${rsi.toFixed(1)} MACD=${macdLine.toFixed(1)}/${macdSignal.toFixed(1)} ADX=${adx.toFixed(0)} Vol×${volMult.toFixed(2)}`);

    // If position open — priceCheck handles exits every 5s
    if (position) return;

    const rsiMin = config.rsiMin ?? 40;
    const rsiMax = config.rsiMax ?? 65;
    const adxMin = config.adxMin ?? 15;

    // Signal A: EMA crossover (trend reversal — high conviction)
    const crossBuy  = ema9 > ema21 && prevEma9 <= prevEma21;
    const crossSell = ema9 < ema21 && prevEma9 >= prevEma21;

    // Signal B: RSI mean-reversion (oversold/overbought on 1h timeframe)
    const rsiBuy  = rsi < rsiMin;
    const rsiSell = rsi > rsiMax;

    // Confluence filters — require 2 of 3: MACD direction, ADX trend strength, volume
    const macdBull  = macdLine > macdSignal;
    const macdBear  = macdLine < macdSignal;
    const trendOk   = adx >= adxMin;
    const volOk     = volMult >= 1.2;
    const longConf  = (macdBull ? 1 : 0) + (trendOk ? 1 : 0) + (volOk ? 1 : 0) >= 2;
    const shortConf = (macdBear ? 1 : 0) + (trendOk ? 1 : 0) + (volOk ? 1 : 0) >= 2;

    const isLong  = (crossBuy  || rsiBuy)  && longConf;
    const isShort = config.allowShorts && (crossSell || rsiSell) && shortConf && !position;

    // 1h cooldown between trades (candle period)
    const cooldownOk = Date.now() - lastEntryTime > 60 * 60 * 1000;

    const doLong  = isLong  && cooldownOk;
    const doShort = isShort && cooldownOk;

    if (!doLong && !doShort) {
      addLog(`Brak sygnału — EMA9${ema9 > ema21 ? ">" : "<"}EMA21 RSI=${rsi.toFixed(1)} MACD${macdBull ? "↑" : "↓"} ADX=${adx.toFixed(0)} Vol×${volMult.toFixed(2)}`);
      return;
    }

    const direction: Direction = doLong ? "long" : "short";
    // Qty steps differ: spot (EU margin) allows fine precision, linear (global) has coarse steps
    const spec = config.platform === "eu"
      ? (config.symbol === "BTCUSDT" ? { dec: 5, min: 0.00005 } : config.symbol === "ETHUSDT" ? { dec: 4, min: 0.0001 } : { dec: 2, min: 0.01 })
      : (config.symbol === "BTCUSDT" ? { dec: 3, min: 0.001 }   : config.symbol === "ETHUSDT" ? { dec: 2, min: 0.01 }   : { dec: 1, min: 0.1 });
    const effLev = Math.max(1, config.leverage ?? 1);
    const qty = Math.max(parseFloat(((config.capital * effLev) / price).toFixed(spec.dec)), spec.min);

    // Balance check before placing order
    try {
      const balData = await bybitFetch("GET", "/v5/account/wallet-balance",
        { accountType: config.platform === "eu" ? "SPOT" : "UNIFIED" });
      const coins: any[] = balData.result?.list?.[0]?.coin ?? [];
      const usdtCoin = coins.find((c: any) => c.coin === "USDT");
      const avail = parseFloat(usdtCoin?.availableToWithdraw ?? usdtCoin?.availableBalance ?? usdtCoin?.walletBalance ?? "0");
      if (avail < config.capital) {
        addLog(`❌ Niewystarczające saldo: ${avail.toFixed(2)} USDT < ${config.capital} USDT — pomijam`, "warn");
        return;
      }
    } catch { /* balance check failed — proceed anyway */ }

    addLog(`🎯 SYGNAŁ ${direction.toUpperCase()} EMA9=${ema9.toFixed(0)} EMA21=${ema21.toFixed(0)} RSI=${rsi.toFixed(1)} qty=${qty} lev=${effLev}x`, "info");
    try {
      // For global linear: set leverage before first order of each session
      if (config.platform !== "eu" && effLev > 1) {
        try {
          await bybitFetch("POST", "/v5/position/set-leverage", {
            category: "linear", symbol: config.symbol,
            buyLeverage: String(effLev), sellLeverage: String(effLev),
          });
        } catch { /* already set or not applicable — ignore */ }
      }
      await placeOrder(direction, qty);
      position = { direction, entryPrice: price, qty, entryTime: new Date().toISOString(), trailRef: price };
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
  encryptApiKeys(apiKey.trim(), secret.trim(), !!testnet, platform === "eu" ? "eu" : "global");
  res.json({ ok: true });
});

router.post("/start", (req, res) => {
  let { apiKey, secret, testnet, platform } = req.body;
  const { symbol, rsiMin, rsiMax, trailPct, stopLoss, takeProfit, leverage, allowShorts, capital, adxMin } = req.body;

  // If keys not provided, try to load saved encrypted keys
  if (!apiKey || !secret) {
    const saved = decryptApiKeys();
    if (!saved) return res.status(400).json({ error: "Missing Bybit keys" });
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
    adxMin:  adxMin  ?? 15,
    apiKey, secret, testnet: testnet === true,
    platform: platform === "eu" ? "eu" : "global",
  };

  // Save keys encrypted for auto-resume after restarts
  encryptApiKeys(apiKey, secret, testnet === true, config.platform);

  running = true;
  position = null;
  sessionPnl = 0;
  closeFailCount = 0;
  lastEntryTime = 0;
  lastPrice = 0;
  logs = [];
  addLog(`Bot started — ${config.symbol} ${config.platform === "eu" ? "Bybit EU (spot margin)" : "Bybit Global (linear)"} capital=${config.capital} USDT | Scalping TP=${config.takeProfit}% SL=${config.stopLoss}%`, "info");
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
