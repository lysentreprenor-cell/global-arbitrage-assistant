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
import { calcRsi, calcEma, calcMacd, calcAdx, calcAtr, calcVolumeMult, calcStochRsi, calcBBPercB, calcRoc, TREND, calc4HTrend, calcRegime, MTF_WEIGHTS, MTF_STRONG_BEAR, trendStackScore, trendStackLabel } from "../lib/indicators";
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
  symbols?: string[]; // multi-symbol scan list; if set, bot scans all and picks best signal
  rsiMin: number; rsiMax: number;
  trailPct: number; stopLoss: number; takeProfit: number;
  leverage: number;
  allowShorts: boolean;
  capital: number;
  riskPct: number;    // % of capital per trade (e.g. 20 = risk only 20% per position)
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
  symbol?: string;             // which asset this position is for (defaults to config.symbol)
};

type LogEntry = { time: string; msg: string; type: "info" | "buy" | "sell" | "warn" };
type TradeRecord = { dir: Direction; entry: number; exit: number; pnlUsdt: number; pnlPct: number; reason: string; signal: string; time: string; durationH: number };

// ── Global state ──────────────────────────────────────────────────────────────

let running = false;
let intervalId: ReturnType<typeof setInterval> | null = null;
let priceIntervalId: ReturnType<typeof setInterval> | null = null;
let config: BotConfig | null = null;
let position: Position | null = null;
let isClosing = false; // mutex: prevents priceCheck + engineTick from both closing at once
let isTickRunning = false; // guard: prevents concurrent engineTick if one tick takes >60s
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
      // Reconcile restored position against the exchange — drop phantoms that don't exist there,
      // then (if we have no position) try to rebuild one from the real coin balance.
      (async () => {
        if (position) await reconcilePosition();
        if (!position) await recoverPositionFromBalance();
      })();
      engineTick();
      intervalId = setInterval(engineTick, 60_000);
      priceIntervalId = setInterval(priceCheck, 5_000);
    }
  } catch { /* ignore */ }
}

// Kraken Balance asset key for the base coin of a symbol (BTCUSDT → XXBT)
const KRAKEN_BALANCE_ASSET: Record<string, string> = {
  BTCUSDT: "XXBT",  ETHUSDT: "XETH",  SOLUSDT: "SOL",   DOGEUSDT: "XXDG",
  XRPUSDT: "XXRP",  ADAUSDT: "ADA",   AVAXUSDT: "AVAX", LINKUSDT: "LINK",
  DOTUSDT: "DOT",   LTCUSDT: "XLTC",  BCHUSDT: "BCH",   ATOMUSDT: "ATOM",
  UNIUSDT: "UNI",   SHIBUSDT: "SHIB", PEPEUSDT: "PEPE", SUIUSDT: "SUI",
  TONUSDT: "TON",   TRXUSDT: "TRX",   MATICUSDT: "MATIC",
};

// Kraken order precision per symbol: dec = decimal places for qty, min = minimum order qty
const KRAKEN_SPEC: Record<string, { dec: number; min: number }> = {
  BTCUSDT:  { dec: 4, min: 0.0001 },
  ETHUSDT:  { dec: 3, min: 0.004 },
  SOLUSDT:  { dec: 2, min: 0.01 },
  DOGEUSDT: { dec: 0, min: 50 },
  XRPUSDT:  { dec: 2, min: 10 },
  ADAUSDT:  { dec: 1, min: 10 },
  AVAXUSDT: { dec: 3, min: 0.1 },
  LINKUSDT: { dec: 3, min: 0.1 },
  DOTUSDT:  { dec: 2, min: 1 },
  LTCUSDT:  { dec: 3, min: 0.01 },
  BCHUSDT:  { dec: 4, min: 0.001 },
  ATOMUSDT: { dec: 2, min: 0.5 },
  UNIUSDT:  { dec: 2, min: 0.5 },
  SHIBUSDT: { dec: 0, min: 50000 },
  PEPEUSDT: { dec: 0, min: 500000 },
  SUIUSDT:  { dec: 2, min: 1 },
  TONUSDT:  { dec: 3, min: 0.5 },
  TRXUSDT:  { dec: 0, min: 100 },
  MATICUSDT:{ dec: 2, min: 5 },
};

// Verify a restored position actually exists on the exchange; clear it if it's a phantom.
// IMPORTANT: spot trades (leverage ≤ 1) do NOT appear in OpenPositions — they are just a
// coin balance. Only margin/leveraged trades show up as Kraken "positions". So we check the
// right place depending on how the position was opened.
async function reconcilePosition() {
  if (!config || !position || config.platform !== "kraken") return;
  const effLev = Math.max(1, config.leverage ?? 1);
  try {
    if (effLev > 1) {
      // ── Margin/leveraged → check OpenPositions ──────────────────────────────
      const open = await krakenPrivate("/0/private/OpenPositions");
      const positions = open ? Object.values(open) as any[] : [];
      const hasMatch = positions.some(p => {
        const t = (p.type ?? "").toLowerCase(); // "buy"/"sell"
        return position && ((position.direction === "long" && t === "buy") || (position.direction === "short" && t === "sell"));
      });
      if (positions.length === 0 || !hasMatch) {
        addLog(`⚠️ Pozycja margin ${position.direction.toUpperCase()} nie istnieje na Krakenie — usuwam fantomową pozycję`, "warn");
        position = null;
        saveState();
      } else {
        addLog(`✅ Pozycja margin potwierdzona na Krakenie (${positions.length} otwartych)`);
      }
    } else {
      // ── Spot (1x) → check the actual coin balance ───────────────────────────
      // A spot LONG means we hold the base coin; verify the balance roughly matches qty.
      const asset = KRAKEN_BALANCE_ASSET[config.symbol];
      if (!asset) {
        addLog(`ℹ️ Nieznany symbol ${config.symbol} — pomijam reconcile (zachowuję pozycję)`, "info");
        return;
      }
      const bal = await krakenPrivate("/0/private/Balance");
      const coinBal = parseFloat(bal?.[asset] ?? "0");
      // Need at least ~70% of recorded qty to consider it still open (allows for fees/rounding)
      const threshold = position.qty * 0.7;
      if (position.direction === "long" && coinBal >= threshold) {
        addLog(`✅ Pozycja spot LONG potwierdzona — saldo ${asset}=${coinBal} (≈qty ${position.qty})`);
      } else if (position.direction === "long") {
        addLog(`⚠️ Brak salda ${asset} (${coinBal} < ${threshold.toFixed(6)}) — pozycja spot już zamknięta, usuwam`, "warn");
        position = null;
        saveState();
      } else {
        // Spot shorts aren't really possible on Kraken consumer accounts — keep as-is, just warn
        addLog(`ℹ️ Pozycja spot SHORT — nie mogę zweryfikować przez saldo, zachowuję`, "info");
      }
    }
  } catch (e: any) {
    // Don't clear on API error — could be transient; just warn
    addLog(`⚠️ Nie udało się zweryfikować pozycji na Krakenie: ${e.message} — zachowuję pozycję`, "warn");
  }
}

// Minimum USD value of a coin balance to count as a real open position (ignore dust).
const RECOVER_MIN_USD = 5;

// If the bot starts with NO tracked position but the Kraken account already holds the
// traded coin (e.g. a spot LONG bought before a restart that wiped bot-state.json),
// rebuild the position from the real balance so SL/TP monitoring resumes. Entry price is
// pulled from the most recent buy in TradesHistory; falls back to the current price.
async function recoverPositionFromBalance(): Promise<void> {
  if (!config || position || config.platform !== "kraken") return;
  const effLev = Math.max(1, config.leverage ?? 1);
  if (effLev > 1) return; // margin positions are handled by OpenPositions / reconcile
  // Scan all configured symbols (not just primary) — bot may hold ETH or SOL from a prev trade
  const symbolsToScan = Array.from(new Set([config.symbol, ...(config.symbols ?? [])]));
  for (const scanSym of symbolsToScan) {
    await recoverSingleSymbol(scanSym);
    if (position) return; // found one — stop scanning
  }
}

async function recoverSingleSymbol(scanSym: string): Promise<void> {
  if (!config || position) return;
  const asset = KRAKEN_BALANCE_ASSET[scanSym];
  if (!asset) return;
  try {
    const bal = await krakenPrivate("/0/private/Balance");
    const coinBal = parseFloat(bal?.[asset] ?? "0");
    if (coinBal <= 0) return;

    const price = await fetchCurrentPrice(scanSym);
    if (!price) { addLog(`ℹ️ Wykryto saldo ${asset}=${coinBal}, ale brak ceny — pomijam odtwarzanie`, "info"); return; }

    const valueUsd = coinBal * price;
    if (valueUsd < RECOVER_MIN_USD) return; // dust — not a tradeable position

    const PAIR_VARIANTS: Record<string, string[]> = {
      BTCUSDT:   ["XBTEUR",   "XBTUSD",    "XXBTZEUR",  "XXBTZUSD",  "XBT/EUR",  "XBT/USD"],
      ETHUSDT:   ["ETHEUR",   "ETHUSD",    "XETHZEUR",  "XETHZUSD",  "ETH/EUR",  "ETH/USD"],
      SOLUSDT:   ["SOLEUR",   "SOLUSD",    "SOL/EUR",   "SOL/USD"],
      DOGEUSDT:  ["XDGEUR",   "XDGUSD",    "XDG/EUR",   "XDG/USD"],
      XRPUSDT:   ["XXRPZEUR", "XXRPZUSD",  "XRPEUR",    "XRPUSD",    "XRP/EUR",  "XRP/USD"],
      ADAUSDT:   ["ADAEUR",   "ADAUSD",    "ADA/EUR",   "ADA/USD"],
      AVAXUSDT:  ["AVAXEUR",  "AVAXUSD",   "AVAX/EUR",  "AVAX/USD"],
      LINKUSDT:  ["LINKEUR",  "LINKUSD",   "LINK/EUR",  "LINK/USD"],
      DOTUSDT:   ["DOTEUR",   "DOTUSD",    "DOT/EUR",   "DOT/USD"],
      LTCUSDT:   ["XLTCZEUR", "XLTCZUSD",  "LTCEUR",    "LTCUSD",    "LTC/EUR",  "LTC/USD"],
      BCHUSDT:   ["BCHEUR",   "BCHUSD",    "BCH/EUR",   "BCH/USD"],
      ATOMUSDT:  ["ATOMEUR",  "ATOMUSD",   "ATOM/EUR",  "ATOM/USD"],
      UNIUSDT:   ["UNIEUR",   "UNIUSD",    "UNI/EUR",   "UNI/USD"],
      SHIBUSDT:  ["SHIBEUR",  "SHIBUSD",   "SHIB/EUR",  "SHIB/USD"],
      PEPEUSDT:  ["PEPEEUR",  "PEPEUSD",   "PEPE/EUR",  "PEPE/USD"],
      SUIUSDT:   ["SUIEUR",   "SUIUSD",    "SUI/EUR",   "SUI/USD"],
      TONUSDT:   ["TONEUR",   "TONUSD",    "TON/EUR",   "TON/USD"],
      TRXUSDT:   ["TRXEUR",   "TRXUSD",    "TRX/EUR",   "TRX/USD"],
      MATICUSDT: ["MATICEUR", "MATICUSD",  "MATIC/EUR", "MATIC/USD"],
    };
    const pairVariants = PAIR_VARIANTS[scanSym] ?? [krakenPair(scanSym)];

    let entryPrice = 0;
    let entryTime = new Date().toISOString();
    try {
      for (const offset of [0, 50]) {
        const th = await krakenPrivate("/0/private/TradesHistory", { ofs: String(offset) });
        const trades = th?.trades ? Object.values(th.trades) as any[] : [];
        const buys = trades
          .filter(t => pairVariants.includes(t.pair) && (t.type ?? "").toLowerCase() === "buy")
          .sort((a: any, b: any) => (b.time ?? 0) - (a.time ?? 0));
        if (buys.length > 0) {
          const last = buys[0];
          const p = parseFloat(last.price ?? "0");
          if (p > 0) { entryPrice = p; if (last.time) entryTime = new Date(last.time * 1000).toISOString(); }
          break;
        }
        if (trades.length < 50) break;
      }
    } catch { /* TradesHistory may be unavailable — proceed with fallback */ }

    const entryKnown = entryPrice > 0;
    if (!entryKnown) {
      entryPrice = price;
      addLog(`⚠️ Nie znaleziono historii zakupu ${asset} — jako wejście przyjęta cena bieżąca $${price.toFixed(0)}, SL poszerzony do 8% (bezpieczeństwo). Prawdziwy zysk: sprawdź Krakena.`, "warn");
    }

    const spec = KRAKEN_SPEC[scanSym] ?? { dec: 2, min: 0.01 };
    const qty = parseFloat(coinBal.toFixed(spec.dec));
    if (qty <= 0) return;

    const recoveredSlPct = entryKnown ? config.stopLoss : Math.max(config.stopLoss, 8.0);

    position = {
      direction: "long",
      entryPrice,
      qty,
      entryTime,
      trailRef: Math.max(entryPrice, price),
      slPct: recoveredSlPct,
      tpPct: config.takeProfit,
      trailPct: config.trailPct,
      breakEvenSet: false,
      signal: entryKnown ? "recovered_from_balance" : "recovered_unknown_entry",
      symbol: scanSym,
    };
    lastEntryTime = new Date(entryTime).getTime();
    saveState();
    addLog(`♻️ Odtworzono pozycję LONG z salda Krakena: ${asset}=${coinBal} (~$${valueUsd.toFixed(2)}) wejście${entryKnown ? "" : "≈bieżąca"}=$${entryPrice.toFixed(0)} SL=${recoveredSlPct}% TP=${config.takeProfit}%${entryKnown ? "" : " [szeroki SL — historia kupna nieznana]"}`, "buy");
  } catch (e: any) {
    addLog(`⚠️ Nie udało się odtworzyć pozycji z salda: ${e.message}`, "warn");
  }
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

// Returns { txid, fillPrice } on confirmed fill, throws on failure
async function placeOrder(side: Direction, qty: number, sym?: string): Promise<{ txid: string; fillPrice: number }> {
  if (!config) throw new Error("No config");
  const tradeSym = sym ?? config.symbol;
  if (config.platform === "kraken") {
    const pair = krakenPair(tradeSym);
    const effLev = Math.max(1, config.leverage ?? 1);
    const orderParams: Record<string, string> = {
      pair, type: side === "long" ? "buy" : "sell", ordertype: "market", volume: String(qty),
    };
    if (effLev > 1) orderParams.leverage = String(effLev);
    const result = await krakenPrivate("/0/private/AddOrder", orderParams);
    const txid = result.txid?.[0];
    // No txid means Kraken did NOT accept the order — never record a phantom position
    if (!txid) throw new Error("Kraken nie zwrócił txid — zlecenie odrzucone");
    addLog(`🟢 LIVE ${side.toUpperCase()} qty=${qty}${effLev > 1 ? ` lev=${effLev}x` : ""} | TxID: ${txid}`, "buy");
    // Verify the market order actually filled and capture the real average fill price
    let fillPrice = 0;
    try {
      const q = await krakenPrivate("/0/private/QueryOrders", { txid });
      const ord = q?.[txid];
      if (ord) {
        if (ord.status === "canceled" || ord.status === "expired") {
          throw new Error(`Zlecenie ${ord.status} na Krakenie`);
        }
        fillPrice = parseFloat(ord.price ?? ord.avg_price ?? "0") || 0;
        addLog(`✅ Wypełniono: status=${ord.status} cena=${fillPrice || "?"} vol=${ord.vol_exec ?? "?"}`);
      }
    } catch (e: any) {
      // QueryOrders failed but AddOrder succeeded — proceed with tick price as entry
      addLog(`⚠️ Nie zweryfikowano wypełnienia: ${e.message}`, "warn");
    }
    return { txid, fillPrice };
  }
  const params: Record<string, any> = config.platform === "eu"
    ? { category: "spot", symbol: config.symbol, side: side === "long" ? "Buy" : "Sell",
        orderType: "Market", qty: String(qty), marketUnit: "baseCoin", isLeverage: 1 }
    : { category: "linear", symbol: config.symbol, side: side === "long" ? "Buy" : "Sell",
        orderType: "Market", qty: String(qty), positionIdx: 0 };
  const d = await bybitFetch("POST", "/v5/order/create", params);
  const orderId = d.result?.orderId;
  if (!orderId) throw new Error("Brak orderId — zlecenie odrzucone");
  addLog(`🟢 LIVE ${side.toUpperCase()} qty=${qty} | OrderID: ${orderId}`, "buy");
  return { txid: orderId, fillPrice: 0 };
}

// Returns true on success, false on failure
async function closePosition(reason: string): Promise<boolean> {
  if (!config || !position) return false;
  const closeSym = position.symbol ?? config.symbol;
  try {
    if (config.platform === "kraken") {
      const pair = krakenPair(closeSym);
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
      ? { category: "spot", symbol: closeSym, side: closeSide,
          orderType: "Market", qty: String(position.qty), marketUnit: "baseCoin", isLeverage: 1 }
      : { category: "linear", symbol: closeSym, side: closeSide,
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
  BTCUSDT: "XBTUSD",  ETHUSDT: "ETHUSD",   SOLUSDT: "SOLUSD",   DOGEUSDT: "XDGUSD",
  XRPUSDT: "XXRPZUSD",ADAUSDT: "ADAUSD",   AVAXUSDT: "AVAXUSD", LINKUSDT: "LINKUSD",
  DOTUSDT: "DOTUSD",  LTCUSDT: "XLTCZUSD", BCHUSDT: "BCHUSD",   ATOMUSDT: "ATOMUSD",
  UNIUSDT: "UNIUSD",  SHIBUSDT: "SHIBUSD", PEPEUSDT: "PEPEUSD", SUIUSDT: "SUIUSD",
  TONUSDT: "TONUSD",  TRXUSDT: "TRXUSD",   MATICUSDT: "MATICUSD",
};
const SYMBOL_MAP_EUR: Record<string, string> = {
  BTCUSDT: "XBTEUR",  ETHUSDT: "ETHEUR",   SOLUSDT: "SOLEUR",   DOGEUSDT: "XDGEUR",
  XRPUSDT: "XXRPZEUR",ADAUSDT: "ADAEUR",   AVAXUSDT: "AVAXEUR", LINKUSDT: "LINKEUR",
  DOTUSDT: "DOTEUR",  LTCUSDT: "XLTCZEUR", BCHUSDT: "BCHEUR",   ATOMUSDT: "ATOMEUR",
  UNIUSDT: "UNIEUR",  SHIBUSDT: "SHIBEUR", PEPEUSDT: "PEPEEUR", SUIUSDT: "SUIEUR",
  TONUSDT: "TONEUR",  TRXUSDT: "TRXEUR",   MATICUSDT: "MATICEUR",
};
// For non-Kraken platforms (Bybit uses the symbol name directly)
const SYMBOL_MAP: Record<string, string> = {
  BTCUSDT: "XBTUSD",  ETHUSDT: "ETHUSD",   SOLUSDT: "SOLUSD",   DOGEUSDT: "XDGUSD",
  XRPUSDT: "XXRPZUSD",ADAUSDT: "ADAUSD",   AVAXUSDT: "AVAXUSD", LINKUSDT: "LINKUSD",
  DOTUSDT: "DOTUSD",  LTCUSDT: "XLTCZUSD", BCHUSDT: "BCHUSD",   ATOMUSDT: "ATOMUSD",
  UNIUSDT: "UNIUSD",  SHIBUSDT: "SHIBUSD", PEPEUSDT: "PEPEUSD", SUIUSDT: "SUIUSD",
  TONUSDT: "TONUSD",  TRXUSDT: "TRXUSD",   MATICUSDT: "MATICUSD",
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
// Regime hysteresis: only switch regime after N consecutive matching ticks
let regimeCandidate: "bull" | "bear" | "neutral" = "neutral";
let regimeCandidateCount = 0;
let tickCount = 0;             // warmup: skip rsiRecovering first 3 ticks
let adxLowCount = 0;           // consecutive ticks with ADX < 20
let rangeMode = false;         // true when ADX<20 for 6+ consecutive ticks
let dailyDate = "";            // YYYY-MM-DD for daily loss reset
let dailyStartPnl = 0;         // sessionPnl at start of current day
let tradeHistory: TradeRecord[] = [];
let sessionWins = 0;
let sessionLosses = 0;
let consecutiveLosses = 0;  // streak counter for circuit breaker
let lossPauseUntil = 0;     // epoch ms — block new entries until this time
let sessionPeakPnl = 0;
let sessionMaxDrawdown = 0;
let fourHourTrend: "bull" | "bear" | "neutral" = "neutral";
// Layer 1 — multi-timeframe trend stack
let trendScore = 0;                                                  // weighted aggregate ∈ [-1,+1]
let trendStack: Record<number, "bull" | "bear" | "neutral"> = {};    // per-TF breakdown
let lastEntrySignal = "";

// ── Live indicator snapshot (updated every engineTick) ─────────────────────────
let liveRsi = 0;
let liveStochRsi = 50;
let liveBbPercB = 50;
let liveVwap = 0;
let liveAdx = 0;

// ── Fear & Greed Index cache (alternative.me, updates daily) ─────────────────────
let fngCache: { value: number; label: string; fetchedAt: number } | null = null;
async function fetchFearGreed(): Promise<{ value: number; label: string } | null> {
  if (fngCache && Date.now() - fngCache.fetchedAt < 3_600_000) return fngCache;
  try {
    const r = await fetch("https://api.alternative.me/fng/?limit=1", { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return fngCache ?? null;
    const d = await r.json() as any;
    const item = d?.data?.[0];
    if (!item) return fngCache ?? null;
    fngCache = { value: Number(item.value), label: item.value_classification, fetchedAt: Date.now() };
    return fngCache;
  } catch {
    return fngCache ?? null;
  }
}

async function fetchCandles(symbol: string): Promise<{closes:number[];opens:number[];highs:number[];lows:number[];volumes:number[];vwaps:number[];price:number}|null> {
  const pair = krakenPair(symbol);
  try {
    const since = Math.floor(Date.now() / 1000) - 150 * 5 * 60;
    const raw = await krakenOhlcFetch(pair, 5, since);
    if (!raw || raw.length < 50) throw new Error("Not enough candles");
    const list = raw.slice(-150);
    return {
      closes:  list.map((k: any) => parseFloat(k[4])),
      opens:   list.map((k: any) => parseFloat(k[1])),
      highs:   list.map((k: any) => parseFloat(k[2])),
      lows:    list.map((k: any) => parseFloat(k[3])),
      volumes: list.map((k: any) => parseFloat(k[6])),
      vwaps:   list.map((k: any) => parseFloat(k[5])),
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

/** Trend on a single Kraken interval (minutes) via EMA9 vs EMA21. Cached/queued by krakenOhlcFetch. */
async function fetchTfTrend(symbol: string, interval: number): Promise<"bull" | "bear" | "neutral"> {
  const pair = krakenPair(symbol);
  try {
    const since = Math.floor(Date.now() / 1000) - 70 * interval * 60;
    const raw = await krakenOhlcFetch(pair, interval, since);
    if (!raw || raw.length < 25) return "neutral";
    const closes = raw.slice(-60).map((k: any) => parseFloat(k[4]));
    return calc4HTrend(calcEma(closes, 9), calcEma(closes, 21));
  } catch { return "neutral"; }
}

/**
 * Layer 1 — multi-timeframe trend stack. Fetches 1m/5m/15m/30m/1h/4h in parallel,
 * each votes bull/bear/neutral, returns the weighted aggregate score ∈ [-1,+1]
 * plus the per-timeframe breakdown for logging and the UI.
 */
async function fetchTrendStack(symbol: string): Promise<{
  score: number;
  trends: Record<number, "bull" | "bear" | "neutral">;
}> {
  const intervals = Object.keys(MTF_WEIGHTS).map(Number); // [1,5,15,30,60,240]
  const results = await Promise.all(intervals.map(iv => fetchTfTrend(symbol, iv)));
  const trends: Record<number, "bull" | "bear" | "neutral"> = {};
  const votes = intervals.map((iv, i) => {
    trends[iv] = results[i];
    return { w: MTF_WEIGHTS[iv as keyof typeof MTF_WEIGHTS], trend: results[i] };
  });
  return { score: trendStackScore(votes), trends };
}

// ── Kraken public OHLC: serialized queue + rate-limit backoff + timeline cache ─

// One OHLC request at a time — prevents 429 collisions between bot tick + simulation
let _krakenOhlcQ: Promise<void> = Promise.resolve();
let _krakenOhlcLast = 0; // timestamp of last completed OHLC request

// Timeline cache per (pair, interval): stores all candles seen, merged + deduped.
// TTL 5 min — fresh enough for backtest, prevents re-fetching on repeated clicks.
interface OhlcCacheEntry { candles: any[]; fetchedAt: number }
const _ohlcCache = new Map<string, OhlcCacheEntry>();

// ── Persistent candle storage ─────────────────────────────────────────────────
// Candles are saved to data/ohlc_cache.json so they survive app restarts.
// Up to 30 days of history — enough for meaningful backtests/simulation.
const CANDLE_FILE = path.resolve(process.cwd(), "data", "ohlc_cache.json");
let _candlesSaveTimer: ReturnType<typeof setTimeout> | null = null;

function _candlesDiskLoad() {
  try {
    if (!fs.existsSync(CANDLE_FILE)) return;
    const raw: Record<string, any[]> = JSON.parse(fs.readFileSync(CANDLE_FILE, "utf8"));
    const cutoff = Math.floor(Date.now() / 1000) - 30 * 24 * 3600; // 30-day trim
    let count = 0;
    for (const [key, candles] of Object.entries(raw)) {
      if (!Array.isArray(candles) || !candles.length) continue;
      const fresh = candles.filter((c: any) => c[0] >= cutoff);
      if (fresh.length >= 10) {
        // fetchedAt=0 → TTL check fails → first request always fetches fresh
        // data from Kraken and merges it with this history
        _ohlcCache.set(key, { candles: fresh, fetchedAt: 0 });
        count += fresh.length;
      }
    }
    if (count > 0) {
      const summary = [..._ohlcCache.keys()].map(k => `${k}:${_ohlcCache.get(k)!.candles.length}`).join(", ");
      console.log(`[candles] Loaded ${count} candles from disk (${summary})`);
    }
  } catch (e) {
    console.warn("[candles] Failed to load from disk:", e);
  }
}

// Debounced 30 s — avoids hammering storage on every bot tick.
function _candlesDiskSave() {
  if (_candlesSaveTimer) clearTimeout(_candlesSaveTimer);
  _candlesSaveTimer = setTimeout(() => {
    try {
      const dir = path.dirname(CANDLE_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const obj: Record<string, any[]> = {};
      for (const [key, entry] of _ohlcCache.entries()) {
        obj[key] = entry.candles;
      }
      fs.writeFileSync(CANDLE_FILE, JSON.stringify(obj));
    } catch (e) {
      console.warn("[candles] Failed to save to disk:", e);
    }
    _candlesSaveTimer = null;
  }, 30_000);
}

_candlesDiskLoad();

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
  _candlesDiskSave();
}

function _ohlcCacheGet(pair: string, interval: number, since: number): any[] | null {
  const entry = _ohlcCache.get(_ohlcCacheKey(pair, interval));
  if (!entry || Date.now() - entry.fetchedAt > 5 * 60 * 1000) return null;
  if (!entry.candles.length) return null;
  const slice = entry.candles.filter((c: any) => c[0] >= since);
  // Plenty of data → serve from cache regardless of how far back it reaches.
  // Kraken returns the same recent candles regardless of 'since' anyway, so
  // a re-fetch would not give older data.
  if (slice.length >= 200) return slice;
  // Small cache: only serve if it actually reaches back to the requested start,
  // otherwise force a Kraken re-fetch (may return more candles).
  const earliest = entry.candles[0][0] as number;
  if (earliest > since + interval * 60) return null;
  return slice.length >= 20 ? slice : null;
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
          // HTTP rate-limit or server errors → retry with backoff
          if (r.status === 429 || r.status === 520 || r.status >= 500) {
            await new Promise(r2 => setTimeout(r2, 2000 * (attempt + 1)));
            continue;
          }
          if (!r.ok) { console.warn(`[ohlc] HTTP ${r.status} pair=${pair} int=${interval}`); resolve(null); return; }
          const d = await r.json() as any;
          // Kraken can return HTTP 200 but with rate-limit error in JSON body — must retry
          if (d.error?.length) {
            const isRateLimit = d.error.some((e: string) =>
              typeof e === "string" && (e.includes("Rate limit") || e.includes("EGeneral:Temporary")));
            if (isRateLimit) {
              await new Promise(r2 => setTimeout(r2, 2000 * (attempt + 1)));
              continue;
            }
            console.warn(`[ohlc] Kraken error pair=${pair} int=${interval}:`, d.error);
            resolve(null); return;
          }
          const key = Object.keys(d.result ?? {}).find(k => k !== "last");
          if (!key) { console.warn(`[ohlc] No result key pair=${pair} int=${interval} keys=`, Object.keys(d.result ?? {})); resolve([]); return; }
          const candles: any[] = d.result[key] ?? [];
          if (candles.length > 0) {
            _ohlcCacheMerge(pair, interval, candles);
            // Return the full merged slice (includes disk history loaded at startup)
            // when it is larger than what Kraken just returned.
            const merged = _ohlcCache.get(_ohlcCacheKey(pair, interval));
            if (merged && merged.candles.length > candles.length) {
              const full = merged.candles.filter((c: any) => c[0] >= since);
              if (full.length > candles.length) { resolve(full); return; }
            }
          }
          resolve(candles);
          return;
        } catch (err: any) {
          console.warn(`[ohlc] attempt ${attempt} failed pair=${pair} int=${interval}:`, err?.message ?? err);
          if (attempt < 4) await new Promise(r2 => setTimeout(r2, 1000 * (attempt + 1)));
        }
      }
      console.warn(`[ohlc] all retries failed pair=${pair} int=${interval}`);
      resolve(null);
    }).catch((err: any) => { console.warn(`[ohlc] queue error:`, err?.message ?? err); resolve(null); });
  });
}

// ── Indicator snapshot (2-min cache) ─────────────────────────────────────────
let indSnapCache: { ts: number; symbol: string; snap: Record<string, number> } | null = null;

async function getIndSnap(symbol: string): Promise<Record<string, number>> {
  if (indSnapCache && indSnapCache.symbol === symbol && Date.now() - indSnapCache.ts < 120_000) {
    return indSnapCache.snap;
  }
  const pair = krakenPair(symbol);
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

function recordTrade(pos: Position, exitPrice: number, pnlUsdt: number, pnlPct: number, reason: string) {
  const durationH = (Date.now() - new Date(pos.entryTime).getTime()) / 3_600_000;
  if (pnlPct > 0) {
    sessionWins++;
    consecutiveLosses = 0;
    lossPauseUntil = 0;
  } else {
    sessionLosses++;
    consecutiveLosses++;
    // Circuit breaker: 3 losses in a row → 2h cooldown to avoid bleeding in a bad regime
    if (consecutiveLosses >= 3) {
      lossPauseUntil = Date.now() + 2 * 3600 * 1000;
      addLog(`🛑 ${consecutiveLosses} strat z rzędu — pauza 2h (circuit breaker)`, "warn");
    }
  }
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
  if (!config || !running || !position || isClosing) return;
  const live = await fetchCurrentPrice(position.symbol ?? config.symbol);
  if (live) {
    lastPrice = live;
  } else if (lastPrice <= 0) {
    return; // no price at all — skip
  }
  const price = live ?? lastPrice; // fall back to last known price for SL/TP

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
  // Long SL: tighter = higher price = Math.max; Short SL: tighter = lower price = Math.min
  else if (position.direction === "long"  && price <= Math.max(trailSL, initSL)) reason = `SL/Trail ${pct.toFixed(2)}%`;
  else if (position.direction === "short" && price >= Math.min(trailSL, initSL)) reason = `SL/Trail ${pct.toFixed(2)}%`;

  if (reason) {
    isClosing = true;
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
    isClosing = false;
  }
}

// ── Lightweight multi-symbol signal scanner ───────────────────────────────────
// Fetches candles + indicators for a single symbol and returns signal data.
// Used to scan alternative symbols when the primary has no signal.
type QuickSignal = {
  sym: string; bbPercB: number; isLong: boolean; isShort: boolean;
  score: number; price: number; atrPct: number;
  effSL: number; effTP: number; effTrail: number; qty: number;
  spec: { dec: number; min: number };
};

async function quickScanSymbol(sym: string): Promise<QuickSignal | null> {
  if (!config) return null;
  try {
    const candles = await fetchCandles(sym);
    if (!candles) return null;
    const { closes, volumes, vwaps, highs, lows } = candles;
    const price = await fetchCurrentPrice(sym) ?? candles.price;
    if (!price) return null;
    const closedCloses = closes.slice(0, -1);
    const bbPercB = calcBBPercB(closedCloses);
    const atr = calcAtr(highs.slice(0, -1), lows.slice(0, -1), closedCloses);
    const atrPct = price > 0 ? (atr / price) * 100 : 0;

    const closedVwaps = vwaps.slice(0, -1);
    const closedVols = volumes.slice(0, -1);
    const vwapN = Math.min(48, closedVwaps.length);
    const vwapNum = closedVwaps.slice(-vwapN).reduce((s, v, i) => s + v * closedVols.slice(-vwapN)[i], 0);
    const vwapDen = closedVols.slice(-vwapN).reduce((s, v) => s + v, 0);
    const vwap = vwapDen > 0 ? vwapNum / vwapDen : price;

    const recent24High = closedCloses.length > 0 ? Math.max(...closedCloses.slice(-24)) : price;
    const dipSym = recent24High > 0 ? (recent24High - price) / recent24High * 100 : 0;
    const inCrashSym = dipSym > TREND.CRASH_DIP_PCT;

    const effLev = Math.max(1, config.leverage ?? 1);
    const spotOnly = config.platform === "kraken" && effLev <= 1;
    const isLong  = bbPercB < 40 && price < vwap && !inCrashSym;
    const isShort = config.allowShorts && !spotOnly && bbPercB > 60 && price > vwap;
    const score   = isLong ? (50 - bbPercB) : isShort ? (bbPercB - 50) : 0;

    const effSL    = Math.max(config.stopLoss,   atrPct * 1.5);
    const effTP    = Math.max(config.takeProfit,  atrPct * 2.5);
    const effTrail = Math.max(config.trailPct,    atrPct * 0.8);

    const spec = KRAKEN_SPEC[sym] ?? { dec: 2, min: 0.01 };

    const riskFraction = Math.min(100, Math.max(1, config.riskPct ?? 100)) / 100;
    const slForSizing  = effSL / 100;
    const atrScale     = slForSizing > 0 ? Math.min(1, (config.stopLoss / 100) / slForSizing) : 1;
    const positionUsdt = config.capital * riskFraction * atrScale * effLev;
    const qty = Math.max(parseFloat((positionUsdt / price).toFixed(spec.dec)), spec.min);

    return { sym, bbPercB, isLong, isShort, score, price, atrPct, effSL, effTP, effTrail, qty, spec };
  } catch { return null; }
}

// ── Full indicator tick (every 5 min — 1h candles) ───────────────────────────
async function engineTick() {
  if (!config || !running) return;
  if (isTickRunning) { addLog("⏭ Tick pominięty — poprzedni jeszcze trwa", "warn"); return; }
  isTickRunning = true;
  try {
    // Fetch candles, live price and the multi-TF trend stack (1m→4h) in parallel
    const [candles, livePrice, stack] = await Promise.all([
      fetchCandles(config.symbol),
      fetchCurrentPrice(config.symbol),
      fetchTrendStack(config.symbol),
    ]);
    if (!candles) return;
    const { closes, opens, highs, lows, volumes, vwaps } = candles;
    const price = livePrice ?? (lastPrice > 0 ? lastPrice : candles.price);
    if (livePrice) lastPrice = livePrice;
    // Layer 1: aggregate trend across all timeframes
    trendScore = stack.score;
    trendStack = stack.trends;
    fourHourTrend = stack.trends[240] ?? "neutral";  // 4H component drives capitulation logic

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

    // ── Extra quality indicators ──────────────────────────────────────────────
    const stochRsi = calcStochRsi(closedCloses);
    const bbPercB  = calcBBPercB(closedCloses);

    // RSI divergence: price moved one direction but RSI moved opposite (5-bar lookback)
    const rsi5ago   = closedCloses.length >= 20 ? calcRsi(closedCloses.slice(0, -5)) : rsi;
    const price5ago = closedCloses.length >= 6  ? closedCloses[closedCloses.length - 6] : 0;
    const curPrice  = closedCloses[closedCloses.length - 1];
    const rsiDivBull = price5ago > 0 && curPrice < price5ago * 0.997 && rsi > rsi5ago + 2;
    const rsiDivBear = price5ago > 0 && curPrice > price5ago * 1.003 && rsi < rsi5ago - 2;

    // Rolling 4h VWAP from Kraken's per-candle VWAP × volume
    const closedVwaps = vwaps.slice(0, -1);
    const closedVols  = volumes.slice(0, -1);
    const vwapN = Math.min(48, closedVwaps.length);
    const vwapNumer = closedVwaps.slice(-vwapN).reduce((s, v, i) => s + v * closedVols.slice(-vwapN)[i], 0);
    const vwapDenom = closedVols.slice(-vwapN).reduce((s, v) => s + v, 0);
    const vwap      = vwapDenom > 0 ? vwapNumer / vwapDenom : price;
    const belowVwap = price < vwap;
    const aboveVwap = price > vwap;

    // Candle body confirmation: last closed candle must close in signal direction
    const lastOpen  = opens[opens.length - 2] ?? closedCloses[closedCloses.length - 2];
    const lastClose = closedCloses[closedCloses.length - 1];
    const bullCandle = lastClose > lastOpen;
    const bearCandle = lastClose < lastOpen;

    // ── Warmup & auxiliary indicators ────────────────────────────────────────
    tickCount++;
    const warmedUp = tickCount > 3;
    const utcHour = new Date().getUTCHours();
    const lowLiqHour = utcHour >= TREND.LOW_LIQ_START && utcHour < TREND.LOW_LIQ_END;
    // Daily loss tracking
    const todayStr = new Date().toISOString().slice(0, 10);
    if (dailyDate !== todayStr) { dailyDate = todayStr; dailyStartPnl = sessionPnl; }
    const dailyLossPct = config.capital > 0 ? (sessionPnl - dailyStartPnl) / config.capital * 100 : 0;
    // Range detection: ADX < 20 for 6+ consecutive ticks → mean-reversion only mode
    if (adx < TREND.ADX_RANGE_THRESH) adxLowCount++;
    else adxLowCount = 0;
    rangeMode = adxLowCount >= TREND.ADX_RANGE_TICKS;

    // ── Dip statistics (BTC mean reversion context) ──────────────────────────
    // 1. RSI Recovery: RSI was oversold (< rsiMin) and is now rising — catches the bounce
    //    warmedUp guard: skip first 3 ticks when prevRsi starts at 50 (cold start false positives)
    const rsiRecovering = warmedUp && prevRsi < (config.rsiMin ?? 40) && rsi > prevRsi + 1.0;
    // 2. Bear market regime — 4 layers of confirmation:
    //    a) ATR-adaptive slope: threshold scales with volatility (not a fixed -1.5%)
    //    b) 15m intermediate timeframe: 5m bear must agree with 15m EMA direction
    //    c) Volume confirmation: real selling has above-average volume
    //    d) Hysteresis: require REGIME_HYSTERESIS consecutive ticks before switching
    const slope5 = closedCloses.length >= 6
      ? (closedCloses[closedCloses.length-1] - closedCloses[closedCloses.length-6]) / closedCloses[closedCloses.length-6] * 100
      : 0;
    const rawRegime = calcRegime(slope5, ema9, ema21, atrPct);
    // Hysteresis: hold current regime until new one persists for REGIME_HYSTERESIS ticks
    if (rawRegime === regimeCandidate) {
      regimeCandidateCount = Math.min(regimeCandidateCount + 1, TREND.REGIME_HYSTERESIS + 1);
    } else {
      regimeCandidate = rawRegime;
      regimeCandidateCount = 1;
    }
    if (regimeCandidateCount >= TREND.REGIME_HYSTERESIS) marketRegime = regimeCandidate;
    // 15m alignment (from the trend stack): 5m bear must agree with 15m direction
    const m15Tr   = trendStack[15] ?? "neutral";
    const m15bear = m15Tr !== "bull";   // bear or neutral → allow bearMkt
    const m15bull = m15Tr !== "bear";   // bull or neutral → allow bullMkt
    const bearMkt = marketRegime === "bear" && m15bear && volMult > TREND.BEAR_MKT_VOL_MULT;
    const bullMkt = marketRegime === "bull" && m15bull;
    // 3. Crash protection: price >5% below 24h high — avoid catching falling knives in crashes
    const recent24Closes = closedCloses.slice(-24);
    const recent24High = recent24Closes.length > 0 ? Math.max(...recent24Closes) : price;
    dipFromHigh = recent24High > 0 ? (recent24High - price) / recent24High * 100 : 0;
    const inCrash = dipFromHigh > TREND.CRASH_DIP_PCT;

    // Persist for /status endpoint
    liveRsi = rsi; liveStochRsi = stochRsi; liveBbPercB = bbPercB; liveVwap = vwap; liveAdx = adx;

    // Fear & Greed — non-blocking, cached 1h
    fetchFearGreed().catch(() => {});

    // Compact per-TF arrow stack, e.g. "1m↓5m↑15m↑30m↑1h↑4h↑"
    const arrow = (t: "bull" | "bear" | "neutral") => t === "bull" ? "↑" : t === "bear" ? "↓" : "=";
    const stackLog = `1m${arrow(trendStack[1] ?? "neutral")}5m${arrow(trendStack[5] ?? "neutral")}15m${arrow(trendStack[15] ?? "neutral")}30m${arrow(trendStack[30] ?? "neutral")}1h${arrow(trendStack[60] ?? "neutral")}4h${arrow(trendStack[240] ?? "neutral")}`;
    addLog(`Tick: ${config.symbol} $${price.toFixed(0)} RSI=${rsi.toFixed(1)}${rsiRecovering?"↑":rsiDivBull?"⬆":""}(prev=${prevRsi.toFixed(1)}) MACD=${macdLine.toFixed(1)} ADX=${adx.toFixed(0)}${rangeMode?"[range]":""} Trend[${stackLog}]=${trendScore >= 0 ? "+" : ""}${trendScore.toFixed(2)} ATR=${atrPct.toFixed(2)}% StochRSI=${stochRsi.toFixed(0)} BB%B=${bbPercB.toFixed(0)} VWAP=$${vwap.toFixed(0)}${belowVwap?"↓":aboveVwap?"↑":""} Dip=${dipFromHigh.toFixed(1)}% Reżim=${marketRegime}(${regimeCandidateCount}/${TREND.REGIME_HYSTERESIS})`);
    prevRsi = rsi; // update after log so (prev=) shows last tick's RSI

    // ── Open position management ─────────────────────────────────────────────
    if (position && !isClosing) {
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
    if (Date.now() < lossPauseUntil) {
      const minsLeft = Math.ceil((lossPauseUntil - Date.now()) / 60000);
      addLog(`⛔ Circuit breaker (${consecutiveLosses} strat z rzędu) — pauza jeszcze ${minsLeft}min`, "warn");
      return;
    }
    if (lowLiqHour) {
      addLog(`⏸ Niska płynność UTC ${utcHour}:xx (02-06) — pomijam sygnał`, "info");
      return;
    }

    // ── Entry logic — simplified single mode ─────────────────────────────────
    // Long:  BB%B < 40 + price below VWAP + no crash
    // Short: BB%B > 60 + price above VWAP
    const effLev = Math.max(1, config.leverage ?? 1);
    const macdBull = macdLine > macdSignal; // kept for display/log only

    const spotOnly = config.platform === "kraken" && effLev <= 1;
    const isLong  = bbPercB < 40 && belowVwap && !inCrash;
    const isShort = config.allowShorts && !spotOnly && bbPercB > 60 && aboveVwap;

    const cooldownMs = (config.cooldownMin ?? 60) * 60 * 1000;
    const cooldownOk = Date.now() - lastEntryTime > cooldownMs;
    const doLong  = isLong  && cooldownOk;
    const doShort = isShort && cooldownOk;

    if (!doLong && !doShort) {
      const coolLeft = cooldownOk ? "✓" : `${Math.ceil((cooldownMs - (Date.now() - lastEntryTime)) / 60000)}m`;
      // Scan alternative symbols in parallel when primary has no signal and cooldown is OK
      const altSymbols = (config.symbols ?? []).filter(s => s !== config!.symbol);
      if (altSymbols.length > 0 && cooldownOk) {
        const scans = (await Promise.all(altSymbols.map(quickScanSymbol))).filter(Boolean) as QuickSignal[];
        const best = scans.filter(s => s.isLong || s.isShort).sort((a, b) => b.score - a.score)[0];
        if (best) {
          const altDir: Direction = best.isLong ? "long" : "short";
          addLog(`🎯 SYGNAŁ ${altDir.toUpperCase()} [multi:${best.sym}] BB%B=${best.bbPercB.toFixed(0)} ATR=${best.atrPct.toFixed(2)}% → SL=${best.effSL.toFixed(2)}% TP=${best.effTP.toFixed(2)}% qty=${best.qty}`, "info");
          try {
            const { fillPrice } = await placeOrder(altDir, best.qty, best.sym);
            const entryPrice = fillPrice > 0 ? fillPrice : best.price;
            position = {
              direction: altDir, entryPrice, qty: best.qty,
              entryTime: new Date().toISOString(), trailRef: entryPrice,
              slPct: best.effSL, tpPct: best.effTP, trailPct: best.effTrail,
              breakEvenSet: false, signal: "multi_scan", symbol: best.sym,
            };
            lastEntryTime = Date.now();
            saveState();
          } catch (e: any) {
            addLog(`🔴 ZLECENIE ${best.sym} NIEUDANE: ${e.message}`, "warn");
          }
          return;
        }
      }
      addLog(`Brak sygnału — BB%B=${bbPercB.toFixed(0)}(long<40,short>60) vwap=${belowVwap?"↓":aboveVwap?"↑":"="} RSI=${rsi.toFixed(1)} cool=${coolLeft} crash=${inCrash}`);
      return;
    }
    lastEntrySignal = isLong ? (bbPercB < 0 ? "BB_extreme_long" : "BB_dip_long") : "BB_top_short";

    const direction: Direction = doLong ? "long" : "short";

    // ATR-based dynamic TP/SL — use whichever is wider to avoid being stopped by noise
    // 1h BTC ATR is typically 0.5–1.5%; fixed 0.6% TP would be too tight
    const effSL    = Math.max(config.stopLoss,   atrPct * 1.5);
    const effTP    = Math.max(config.takeProfit,  atrPct * 2.5);
    const effTrail = Math.max(config.trailPct,    atrPct * 0.8);

    const spec = KRAKEN_SPEC[config.symbol] ?? { dec: 2, min: 0.01 };

    // Risk-based position sizing: invest only riskPct% of capital per trade.
    // Further scaled down when ATR-based SL is larger than the fixed SL setting
    // so that dollar risk stays constant regardless of volatility.
    const riskFraction = Math.min(100, Math.max(1, config.riskPct ?? 100)) / 100;
    const slForSizing  = Math.max(config.stopLoss, atrPct * 1.5) / 100;  // as decimal
    const baseRisk     = config.capital * riskFraction;                   // USDT at risk
    // ATR scaling: if actual SL is 2× the configured SL, halve the size
    const atrScale     = slForSizing > 0 ? Math.min(1, (config.stopLoss / 100) / slForSizing) : 1;
    const positionUsdt = baseRisk * atrScale * effLev;
    const qty = Math.max(parseFloat((positionUsdt / price).toFixed(spec.dec)), spec.min);
    addLog(`📐 Rozmiar: ${(riskFraction * 100).toFixed(0)}% × ATR-scale ${atrScale.toFixed(2)} = $${positionUsdt.toFixed(2)} → qty=${qty}`);

    // Balance check
    try {
      if (config.platform === "kraken") {
        const balResult = await krakenPrivate("/0/private/Balance");
        const usd = parseFloat(balResult.ZUSD ?? "0");
        const eur = parseFloat(balResult.ZEUR ?? "0");
        config.krakenFiat = eur > usd ? "EUR" : "USD";
        const avail = config.krakenFiat === "EUR" ? eur : usd;
        // Convert EUR to USD equivalent for comparison (approx 1.08 rate)
        const availUsd = config.krakenFiat === "EUR" ? avail * 1.08 : avail;
        const needed = positionUsdt / Math.max(1, config.leverage ?? 1);
        if (availUsd < needed * 1.05) { // 5% buffer covers Kraken 0.26% fee
          addLog(`❌ Saldo ${avail.toFixed(2)} ${config.krakenFiat} (~$${availUsd.toFixed(2)}) — potrzeba min. $${(needed * 1.05).toFixed(2)}`, "warn");
          return;
        }
        addLog(`💰 Saldo: ${avail.toFixed(2)} ${config.krakenFiat} (~$${availUsd.toFixed(2)}) pozycja: $${positionUsdt.toFixed(2)}`);
      } else {
        const balData = await bybitFetch("GET", "/v5/account/wallet-balance",
          { accountType: config.platform === "eu" ? "SPOT" : "UNIFIED" });
        const coins: any[] = balData.result?.list?.[0]?.coin ?? [];
        const usdtCoin = coins.find((c: any) => c.coin === "USDT");
        const avail = parseFloat(usdtCoin?.availableToWithdraw ?? usdtCoin?.availableBalance ?? usdtCoin?.walletBalance ?? "0");
        const needed = positionUsdt / Math.max(1, config.leverage ?? 1);
        if (avail < needed * 1.1) {
          addLog(`❌ Saldo ${avail.toFixed(2)} USDT — potrzeba min. ${(needed * 1.1).toFixed(2)} na tę pozycję`, "warn");
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
      const { fillPrice } = await placeOrder(direction, qty);
      const entryPrice = fillPrice > 0 ? fillPrice : price; // real fill price if available
      position = {
        direction, entryPrice, qty, entryTime: new Date().toISOString(), trailRef: entryPrice,
        slPct: effSL, tpPct: effTP, trailPct: effTrail, breakEvenSet: false,
        signal: lastEntrySignal, symbol: config.symbol,
      };
      lastEntryTime = Date.now();
      saveState();
    } catch (e: any) {
      addLog(`🔴 ZLECENIE NIEUDANE: ${e.message}`, "warn");
    }

  } catch (e: any) { addLog(`Tick error: ${e.message}`, "warn"); }
  finally { isTickRunning = false; }
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
  const { symbol, symbols, rsiMin, rsiMax, trailPct, stopLoss, takeProfit, leverage, allowShorts, capital, riskPct, adxMin,
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
    symbols: Array.isArray(symbols) && symbols.length > 0 ? symbols : undefined,
    rsiMin:     rsiMin     ?? 40,   // kup przy RSI < 40 — wyprzedanie na 5m
    rsiMax:     rsiMax     ?? 70,   // trzymaj do RSI > 70
    trailPct:   trailPct   ?? 1.50, // 1.5% trail — sprawdzony w grid-search
    stopLoss:   stopLoss   ?? 1.50, // SL 1.5% — powyżej opłaty 0.52%
    takeProfit: takeProfit ?? 5.00, // TP 5% — R/R > 3:1
    leverage:   leverage   ?? 10,
    allowShorts: allowShorts ?? true,
    capital: capital ?? 9,
    riskPct: riskPct ?? 100,  // default 100% for backward compat; UI sends 20%
    adxMin:        adxMin        ?? 18,  // ADX > 18 — działa w obecnym rynku (BTC ADX ~18-22)
    confluenceMin: confluenceMin ?? 1,   // 1 z 3 wskaźników — MACD lub wolumen lub trend
    volMultMin:    volMultMin    ?? 0.8, // wolumen 0.8× — prawie zawsze spełniony
    cooldownMin:   cooldownMin   ?? 20,  // 20 min między wejściami — ~3-6 transakcji/dzień
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
  regimeCandidate = "neutral";
  regimeCandidateCount = 0;
  trendScore = 0;
  trendStack = {};
  tickCount = 0;
  adxLowCount = 0;
  rangeMode = false;
  dailyDate = "";
  dailyStartPnl = 0;
  tradeHistory = [];
  sessionWins = 0;
  sessionLosses = 0;
  consecutiveLosses = 0;
  lossPauseUntil = 0;
  sessionPeakPnl = 0;
  sessionMaxDrawdown = 0;
  fourHourTrend = "neutral";
  regimeCandidate = "neutral";
  regimeCandidateCount = 0;
  trendScore = 0;
  trendStack = {};
  lastEntrySignal = "";
  logs = [];
  const krakenLev = Math.max(1, config.leverage ?? 1);
  const platformLabel = config.platform === "kraken"
    ? `Kraken (${krakenLev > 1 ? `margin ${krakenLev}x` : "spot"} ${config.krakenFiat ?? "USD"})`
    : config.platform === "eu" ? "Bybit EU (spot margin)" : "Bybit Global (linear)";
  const capitalLabel = config.platform === "kraken" ? (config.krakenFiat ?? "USD") : "USDT";
  addLog(`Bot started — ${config.symbol} ${platformLabel} capital=${config.capital} ${capitalLabel} | TP=${config.takeProfit}% SL=${config.stopLoss}%`, "info");
  saveState();

  // If the account already holds the traded coin (e.g. a spot LONG from a previous
  // session), adopt it as the current position so SL/TP monitoring covers it.
  recoverPositionFromBalance().catch(() => {});

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
  // ── Market opinion ─────────────────────────────────────────────────────────
  const _fng = fngCache?.value ?? 50;
  const _capitul = liveRsi < TREND.CAPITULATION_RSI || _fng < TREND.CAPITULAION_FNG;
  const _extremeCap = _capitul && liveRsi < 30 && liveBbPercB < 0;
  const _oversold   = liveRsi < 35 && liveBbPercB < 20 && liveStochRsi < 25;
  const _overbought = liveRsi > 70 && liveBbPercB > 80;
  const _stackLabel = trendScore > 0.30 ? "bull" : trendScore < -0.30 ? "bear" : "neutral";
  const _strongBear = trendScore < -0.60;
  const _strongBull = trendScore > 0.60;

  let marketOpinion: { text: string; color: "green" | "red" | "yellow" | "gray"; emoji: string };
  if (_extremeCap) {
    marketOpinion = { text: "Ekstremalne wyprzedanie — czas na LONG (kapitulacja rynku)", color: "green", emoji: "🚨" };
  } else if (_oversold && marketRegime !== "bear") {
    marketOpinion = { text: "RSI wyprzedany, cena przy dolnej BB — możliwy LONG na odbiciu", color: "green", emoji: "📈" };
  } else if (_oversold && marketRegime === "bear") {
    marketOpinion = { text: "Wyprzedany w trendzie niedźwiedzim — czekaj na potwierdzenie odbicia", color: "yellow", emoji: "⚠️" };
  } else if (_overbought && _stackLabel !== "bull") {
    marketOpinion = { text: "RSI wykupiony, cena przy górnej BB — czas na sprzedaż lub SHORT", color: "red", emoji: "📉" };
  } else if (rangeMode && liveBbPercB < 20) {
    marketOpinion = { text: "Konsolidacja, cena przy dole zakresu — kup przy dolnej wstędze BB", color: "green", emoji: "↔️" };
  } else if (rangeMode && liveBbPercB > 80) {
    marketOpinion = { text: "Konsolidacja, cena przy górze zakresu — sprzedaj przy górnej wstędze BB", color: "red", emoji: "↔️" };
  } else if (_strongBull && marketRegime !== "bear") {
    marketOpinion = { text: "Silny trend wzrostowy — utrzymaj pozycję LONG lub czekaj na korektę", color: "green", emoji: "🚀" };
  } else if (_strongBear || marketRegime === "bear") {
    marketOpinion = { text: "Trend spadkowy — unikaj longów, rozważ SHORT lub czekaj na dno", color: "red", emoji: "🐻" };
  } else if (rangeMode) {
    marketOpinion = { text: "Rynek w konsolidacji — handluj wstęgi BB lub czekaj na wybicie", color: "yellow", emoji: "↔️" };
  } else {
    marketOpinion = { text: "Brak wyraźnego sygnału — obserwuj wskaźniki i czekaj na setup", color: "gray", emoji: "👀" };
  }

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
      trendScore: parseFloat(trendScore.toFixed(2)),
      trendStack,
      marketOpinion,
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
    riskPct: config?.riskPct ?? 100,
    fearGreed: fngCache ? { value: fngCache.value, label: fngCache.label } : null,
    liveIndicators: {
      rsi: liveRsi, stochRsi: liveStochRsi, bbPercB: liveBbPercB,
      vwap: liveVwap, adx: liveAdx,
    },
    circuitBreaker: {
      active: Date.now() < lossPauseUntil,
      consecutiveLosses,
      pauseUntil: lossPauseUntil > 0 ? new Date(lossPauseUntil).toISOString() : null,
    },
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

    const pair = krakenPair(symbol);

    // Single fetch — Kraken returns up to 720 recent candles regardless of 'since'.
    // With disk history loaded at startup the merged result may be much larger.
    const since5 = Math.floor(Date.now() / 1000) - 30 * 24 * 3600;
    let raw: any[] = (await krakenOhlcFetch(pair, 5, since5)) ?? [];
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
  const pair = krakenPair(symbol);

  // Single fetch — Kraken returns up to 720 recent candles regardless of 'since'.
  // With disk history (data/ohlc_cache.json) the merged result grows over time.
  const since5 = Math.floor(Date.now() / 1000) - 30 * 24 * 3600;
  let raw: any[] = (await krakenOhlcFetch(pair, 5, since5)) ?? [];
  const seen = new Set<number>();
  raw = raw.filter(c => { if (seen.has(c[0])) return false; seen.add(c[0]); return true; }).sort((a, b) => a[0] - b[0]);
  if (raw.length < 200) throw new Error(`Za mało danych historycznych 5m (${raw.length} świec, wymagane 200) [${pair}]`);

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
    // Score weights out-of-sample (validation) Sharpe 70% over training 30% to resist overfitting.
    // Combos that only look good on training data score low; robust combos that hold up score high.
    const score = (tr.sharpe * 0.3 + vr.sharpe * 0.7) * (confidence / 100);

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

    const pair = krakenPair(symbol);
    const since5 = Math.floor(Date.now() / 1000) - 30 * 24 * 3600;
    let raw: any[] = (await krakenOhlcFetch(pair, 5, since5)) ?? [];
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
