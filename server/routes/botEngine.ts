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

type BotConfig = {
  symbol: string;
  rsiMin: number; rsiMax: number;
  trailPct: number; stopLoss: number; takeProfit: number;
  leverage: number;
  allowShorts: boolean;
  capital: number; // USDT to use per trade
  adxMin: number;
  apiKey: string; secret: string; testnet: boolean;
  platform: Platform; // "kraken" → spot, "eu" → api.bybit.eu (spot margin), "global" → api.bybit.com (linear)
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
    const pair = SYMBOL_MAP[config.symbol] ?? "XBTUSD";
    const result = await krakenPrivate("/0/private/AddOrder", {
      pair, type: side === "long" ? "buy" : "sell", ordertype: "market", volume: String(qty),
    });
    const txid = result.txid?.[0] ?? "unknown";
    addLog(`🟢 LIVE ${side.toUpperCase()} qty=${qty} | TxID: ${txid}`, "buy");
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
      const pair = SYMBOL_MAP[config.symbol] ?? "XBTUSD";
      const closeSide = position.direction === "long" ? "sell" : "buy";
      await krakenPrivate("/0/private/AddOrder", {
        pair, type: closeSide, ordertype: "market", volume: String(position.qty),
      });
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
  const pct    = position.direction === "short" ? -rawPct : rawPct;

  // Update trailing high/low reference
  if (position.direction === "long")  position.trailRef = Math.max(position.trailRef, price);
  if (position.direction === "short") position.trailRef = Math.min(position.trailRef, price);

  // Break-even: once profit reaches 50% of TP, lock trail at entry price
  if (!position.breakEvenSet && pct >= position.tpPct * 0.5) {
    position.breakEvenSet = true;
    // Push trailRef so that trailSL lands exactly at entryPrice
    if (position.direction === "long") {
      const neededRef = position.entryPrice / (1 - position.trailPct / 100);
      position.trailRef = Math.max(position.trailRef, neededRef);
    } else {
      const neededRef = position.entryPrice / (1 + position.trailPct / 100);
      position.trailRef = Math.min(position.trailRef, neededRef);
    }
    addLog(`🔒 Break-even aktywny przy +${pct.toFixed(2)}%`, "info");
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

    addLog(`Tick: ${config.symbol} $${price.toFixed(0)} RSI=${rsi.toFixed(1)} MACD=${macdLine.toFixed(1)}/${macdSignal.toFixed(1)} ADX=${adx.toFixed(0)} ATR=${atrPct.toFixed(2)}% Vol×${volMult.toFixed(2)}`);

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

    // ── Entry logic ──────────────────────────────────────────────────────────
    const rsiMin = config.rsiMin ?? 40;
    const rsiMax = config.rsiMax ?? 65;
    const adxMin = config.adxMin ?? 15;

    const crossBuy  = ema9 > ema21 && prevEma9 <= prevEma21;
    const crossSell = ema9 < ema21 && prevEma9 >= prevEma21;
    const rsiBuy    = rsi < rsiMin;
    const rsiSell   = rsi > rsiMax;

    // Confluence: require 2 of 3 (MACD direction, ADX strength, volume spike)
    const macdBull  = macdLine > macdSignal;
    const macdBear  = macdLine < macdSignal;
    const trendOk   = adx >= adxMin;
    const volOk     = volMult >= 1.2;
    const longConf  = (macdBull ? 1 : 0) + (trendOk ? 1 : 0) + (volOk ? 1 : 0) >= 2;
    const shortConf = (macdBear ? 1 : 0) + (trendOk ? 1 : 0) + (volOk ? 1 : 0) >= 2;

    const isLong  = (crossBuy  || rsiBuy)  && longConf;
    // Kraken spot: no short selling (would require owning the asset to sell)
    const isShort = config.platform !== "kraken" && config.allowShorts && (crossSell || rsiSell) && shortConf;

    const cooldownOk = Date.now() - lastEntryTime > 60 * 60 * 1000;
    const doLong  = isLong  && cooldownOk;
    const doShort = isShort && cooldownOk;

    if (!doLong && !doShort) {
      addLog(`Brak sygnału — EMA9${ema9 > ema21 ? ">" : "<"}EMA21 RSI=${rsi.toFixed(1)} MACD${macdBull ? "↑" : "↓"} ADX=${adx.toFixed(0)} Vol×${volMult.toFixed(2)}`);
      return;
    }

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
    const effLev = config.platform === "kraken" ? 1 : Math.max(1, config.leverage ?? 1);
    const qty = Math.max(parseFloat(((config.capital * effLev) / price).toFixed(spec.dec)), spec.min);

    // Balance check
    try {
      if (config.platform === "kraken") {
        const balResult = await krakenPrivate("/0/private/Balance");
        const usd = parseFloat(balResult.ZUSD ?? "0");
        const eur = parseFloat(balResult.ZEUR ?? "0");
        const avail = usd > 0 ? usd : eur;
        if (avail < config.capital) {
          addLog(`❌ Niewystarczające saldo: ${avail.toFixed(2)} < ${config.capital} — pomijam`, "warn");
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

    addLog(`🎯 SYGNAŁ ${direction.toUpperCase()} RSI=${rsi.toFixed(1)} MACD${macdBull ? "↑" : "↓"} ADX=${adx.toFixed(0)} ATR=${atrPct.toFixed(2)}% → SL=${effSL.toFixed(2)}% TP=${effTP.toFixed(2)}% qty=${qty} lev=${effLev}x`, "info");
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
  const { symbol, rsiMin, rsiMax, trailPct, stopLoss, takeProfit, leverage, allowShorts, capital, adxMin } = req.body;

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
    adxMin:  adxMin  ?? 15,
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
  logs = [];
  const platformLabel = config.platform === "kraken" ? "Kraken (spot)" : config.platform === "eu" ? "Bybit EU (spot margin)" : "Bybit Global (linear)";
  addLog(`Bot started — ${config.symbol} ${platformLabel} capital=${config.capital} USDT | TP=${config.takeProfit}% SL=${config.stopLoss}%`, "info");
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
