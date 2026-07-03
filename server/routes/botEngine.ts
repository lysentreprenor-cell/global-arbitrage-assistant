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
const LEARN_FILE = path.resolve(process.cwd(), "data", "learning.json");

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
  maxHoldMin?: number;    // max minutes to hold a position (0/undefined = 48h default)
  minVolume?: number;     // min 24h turnover in quote currency to trade a coin (0 = off)
  maxPositions?: number;  // max simultaneous open positions (default 1)
  paperMode?: boolean;    // live paper trading — real prices, virtual money, no real orders
  humanRhythm?: boolean;  // "watch the people" — trade when humans are active, rest when they sleep
  learnAdapt?: boolean;   // ACT on the learning journal — skip conditions with proven negative E
  bbMax?: number;         // BB%B entry threshold for longs (default 40; 25 = deep-dip only) — sim/paper for now
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
  leverage?: number;           // leverage this position was OPENED with (close with the same)
  fiat?: KrakenFiat;           // quote currency the entry price is in — price checks MUST use
                               // the same fiat, else a USD→EUR auto-flip fakes a ~-8% "loss"
  ctx?: { hour: number; human: number; bb: number; regime: string }; // entry context for learning
};

type LogEntry = { time: string; msg: string; type: "info" | "buy" | "sell" | "warn" };
type TradeRecord = { dir: Direction; entry: number; exit: number; pnlUsdt: number; pnlPct: number; reason: string; signal: string; time: string; durationH: number };

// ── Global state ──────────────────────────────────────────────────────────────

let running = false;
let intervalId: ReturnType<typeof setInterval> | null = null;
let priceIntervalId: ReturnType<typeof setInterval> | null = null;
let config: BotConfig | null = null;
let positions: Position[] = [];        // open positions (up to config.maxPositions)
let closingSymbols = new Set<string>(); // per-symbol close guard (replaces single isClosing)
let isClosing = false; // legacy global guard, kept for any remaining single-position paths
let isTickRunning = false; // guard: prevents concurrent engineTick if one tick takes >60s
let logs: LogEntry[] = [];
let sessionPnl = 0;

// Bot's own purchase memory — what it bought, at what price, and the exit rules.
// Keyed by symbol. Survives restarts via bot-state.json so recovery uses the REAL
// entry price (not the current price) and the correct SL/TP, even when the API key
// can't read TradesHistory.
type OwnedEntry = { entryPrice: number; entryTime: string; qty: number; slPct: number; tpPct: number; trailPct: number; leverage?: number; fiat?: KrakenFiat };
let ownedEntries: Record<string, OwnedEntry> = {};

// Memory of margin positions the bot OPENED (pair, side, volume, leverage). Lets the bot
// close them later by placing the opposite order — WITHOUT needing read permission, since
// it already knows what it opened. Persisted so it survives restarts.
type OwnMargin = { pair: string; side: "buy" | "sell"; vol: number; lev: number; time: string };
let ownMargin: OwnMargin[] = [];

// ── Learning journal ──────────────────────────────────────────────────────────
// Persistent record of the CONTEXT of every closed trade + its outcome. Survives
// restarts (that's the point — accumulate evidence over time). Later analyzed to
// reveal which conditions have positive expectancy (E) — evidence, not guessing.
type LearnRecord = {
  time: string; symbol: string; dir: string; pnlPct: number; win: boolean;
  hour: number;        // UTC hour of entry
  human: number;       // human-activity weight at entry (0..1)
  bb: number;          // BB%B at entry
  regime: string;      // market regime at entry
  reason: string;      // exit reason
  paper?: boolean;     // true = from live simulation (slightly optimistic), false = real
};
let learningLog: LearnRecord[] = [];

function loadLearning() {
  try {
    if (fs.existsSync(LEARN_FILE)) {
      const raw = JSON.parse(fs.readFileSync(LEARN_FILE, "utf8"));
      if (Array.isArray(raw)) learningLog = raw.slice(-3000);
    }
  } catch { /* ignore */ }
}
function saveLearning() {
  try {
    const dir = path.dirname(LEARN_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(LEARN_FILE, JSON.stringify(learningLog.slice(-3000)));
  } catch { /* ignore */ }
}
loadLearning();

// Record a buy the bot itself made so it can recover it accurately later.
function rememberBuy(sym: string, p: { entryPrice: number; entryTime: string; qty: number; slPct: number; tpPct: number; trailPct: number; leverage?: number; fiat?: KrakenFiat }) {
  ownedEntries[sym] = { entryPrice: p.entryPrice, entryTime: p.entryTime, qty: p.qty, slPct: p.slPct, tpPct: p.tpPct, trailPct: p.trailPct, leverage: p.leverage, fiat: p.fiat };
  saveState();
}

// Forget a coin once it's been sold.
function forgetBuy(sym: string) {
  if (ownedEntries[sym]) { delete ownedEntries[sym]; saveState(); }
}

function saveState() {
  try {
    // Never persist API keys to disk
    const safeCfg = config ? { ...config, apiKey: "", secret: "" } : null;
    fs.writeFileSync(STATE_FILE, JSON.stringify({ running, config: safeCfg, positions, sessionPnl, ownedEntries, ownMargin }));
  } catch { /* ignore */ }
}

// Convenience: max simultaneous positions, and whether we already hold a symbol.
function maxPos(): number { return Math.max(1, config?.maxPositions ?? 1); }
function holdsSymbol(sym: string): boolean { return positions.some(p => (p.symbol ?? config?.symbol) === sym); }

function loadState() {
  try {
    if (!fs.existsSync(STATE_FILE)) return;
    const s = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    if (s.running && s.config) {
      const savedKeys = decryptApiKeys();
      if (!savedKeys) { addLog("Auto-resume: brak zapisanych kluczy", "warn"); return; }
      config = { ...s.config, apiKey: savedKeys.apiKey, secret: savedKeys.secret, testnet: savedKeys.testnet, platform: savedKeys.platform ?? s.config.platform ?? "global" };
      // Restore positions array (back-compat: also accept a legacy single `position`).
      const restored: Position[] = Array.isArray(s.positions) ? s.positions
        : (s.position ? [s.position] : []);
      positions = restored.filter((p: Position) =>
        p && p.entryTime && (Date.now() - new Date(p.entryTime).getTime()) / 3_600_000 < 48);
      if (positions.length > 0) lastEntryTime = Math.max(...positions.map(p => new Date(p.entryTime).getTime()));
      sessionPnl = s.sessionPnl ?? 0;
      ownedEntries = s.ownedEntries ?? {};
      ownMargin = Array.isArray(s.ownMargin) ? s.ownMargin : [];
      running = true;
      saveState();
      addLog(`Auto-resume po restarcie${positions.length ? ` — przywrócono ${positions.length} pozycji` : ""}`, "info");
      // Reconcile restored positions against the exchange — drop phantoms — then adopt
      // any other coins the account holds (up to maxPositions) from the real balance.
      // On spot (1x) also auto-close any leftover margin positions (orphan shorts that
      // keep paying rollover fees) — best-effort, needs Query Open Positions permission.
      (async () => {
        await reconcilePosition();
        if (config && Math.max(1, config.leverage ?? 1) <= 1) {
          await closeOrphanMarginPositions();
        }
        await recoverPositionFromBalance();
      })();
      engineTick();
      intervalId = setInterval(engineTick, 60_000);
      priceIntervalId = setInterval(priceCheck, 5_000);
    }
  } catch { /* ignore */ }
}

// ── Dynamic Kraken symbol discovery ──────────────────────────────────────────
// Fetches all tradeable pairs from Kraken's public API so we never need to
// manually add new coins. Cache refreshes every 24h.

type KrakenSymbolInfo = {
  symbol: string;     // our internal name, e.g. "BTCUSDT"
  name: string;       // friendly display name, e.g. "BTC"
  pairUSD: string;    // Kraken pair for USD, e.g. "XBTUSD"
  pairEUR: string;    // Kraken pair for EUR, e.g. "XBTEUR" (may be "")
  balanceKey: string; // Kraken balance API key, e.g. "XXBT"
  dec: number;        // qty decimal places
  min: number;        // minimum order qty
};

// XBT → BTC (Kraken uses XBT, the world uses BTC; show BTC in UI)
const ALTNAME_OVERRIDE: Record<string, string> = { XBT: "BTC", XDG: "DOGE", XLM: "XLM", XMR: "XMR", XRP: "XRP", XTZ: "XTZ", ZEC: "ZEC", LTC: "LTC", ETC: "ETC" };

// Fiat currencies and stablecoins must NEVER be traded as "coins" — they don't pump,
// and buying EUR/USDC "long" just converts cash pointlessly. Excluded from discovery.
const NON_TRADEABLE_ASSETS = new Set<string>([
  // Fiat
  "EUR", "USD", "GBP", "JPY", "CHF", "CAD", "AUD", "AED",
  // Stablecoins (USD- and EUR-pegged)
  "USDC", "USDT", "DAI", "USDG", "PYUSD", "RLUSD", "USDR", "USDS", "TUSD", "BUSD",
  "USDD", "GUSD", "FDUSD", "EURT", "EURR", "EURQ", "USDQ", "STUSD", "USTC",
]);

let krakenSymbolCache: KrakenSymbolInfo[] | null = null;
let krakenSymbolCacheAt = 0;

async function loadKrakenSymbols(): Promise<KrakenSymbolInfo[]> {
  if (krakenSymbolCache && Date.now() - krakenSymbolCacheAt < 24 * 3600_000) return krakenSymbolCache;
  try {
    const [pairsRes, assetsRes] = await Promise.all([
      fetch("https://api.kraken.com/0/public/AssetPairs", { signal: AbortSignal.timeout(10000) }),
      fetch("https://api.kraken.com/0/public/Assets",     { signal: AbortSignal.timeout(10000) }),
    ]);
    const pairs  = ((await pairsRes.json())  as any).result ?? {};
    const assets = ((await assetsRes.json()) as any).result ?? {};

    // asset ID → friendly altname (e.g. XXBT → XBT → BTC)
    const altname: Record<string, string> = {};
    for (const [id, a] of Object.entries(assets as Record<string, any>)) {
      const an = (a.altname as string) ?? id;
      altname[id] = ALTNAME_OVERRIDE[an] ?? an;
    }

    // Group USD and EUR pairs by base asset
    const byBase: Record<string, { usd?: string; eur?: string; dec: number; min: number }> = {};
    for (const [pairName, p] of Object.entries(pairs as Record<string, any>)) {
      if (p.status && p.status !== "online") continue; // skip delisted/suspended
      const base = p.base as string;
      const quote = p.quote as string;
      if (!byBase[base]) byBase[base] = { dec: p.lot_decimals ?? 2, min: parseFloat(p.ordermin ?? "0.01") };
      if (quote === "ZUSD") byBase[base].usd = pairName;
      if (quote === "ZEUR") byBase[base].eur = pairName;
    }

    const result: KrakenSymbolInfo[] = [];
    for (const [base, info] of Object.entries(byBase)) {
      if (!info.usd) continue; // skip pairs without a USD leg
      const name = altname[base] ?? base;
      if (!name || name.length > 10) continue;            // skip strangely-named assets
      if (NON_TRADEABLE_ASSETS.has(name.toUpperCase())) continue; // skip fiat & stablecoins (EUR, USDC…)
      result.push({
        symbol: `${name}USDT`,
        name,
        pairUSD: info.usd,
        pairEUR: info.eur ?? "",
        balanceKey: base,
        dec: info.dec,
        min: info.min,
      });
    }
    result.sort((a, b) => a.name.localeCompare(b.name));
    krakenSymbolCache = result;
    krakenSymbolCacheAt = Date.now();
    return result;
  } catch {
    return krakenSymbolCache ?? []; // return stale cache on error
  }
}

// Lookup helpers — fall back to static maps if cache not yet loaded
function krakenSymbolInfo(symbol: string): KrakenSymbolInfo | undefined {
  return krakenSymbolCache?.find(s => s.symbol === symbol);
}

// Dynamic equivalents of the old static maps
function getKrakenPairName(symbol: string, fiat: KrakenFiat): string {
  const info = krakenSymbolInfo(symbol);
  if (info) return fiat === "EUR" && info.pairEUR ? info.pairEUR : info.pairUSD;
  return (fiat === "EUR" ? SYMBOL_MAP_EUR : SYMBOL_MAP_USD)[symbol] ?? "XBTUSD";
}

function getKrakenBalanceKey(symbol: string): string {
  return krakenSymbolInfo(symbol)?.balanceKey ?? KRAKEN_BALANCE_ASSET_FALLBACK[symbol] ?? "";
}

function getKrakenSpec(symbol: string): { dec: number; min: number } {
  const info = krakenSymbolInfo(symbol);
  if (info) return { dec: info.dec, min: info.min };
  return KRAKEN_SPEC_FALLBACK[symbol] ?? { dec: 2, min: 0.01 };
}

// Fallback static maps (used before first API load completes)
const KRAKEN_BALANCE_ASSET_FALLBACK: Record<string, string> = {
  BTCUSDT: "XXBT",  ETHUSDT: "XETH",  SOLUSDT: "SOL",   DOGEUSDT: "XXDG",
  XRPUSDT: "XXRP",  ADAUSDT: "ADA",   AVAXUSDT: "AVAX", LINKUSDT: "LINK",
  DOTUSDT: "DOT",   LTCUSDT: "XLTC",  BCHUSDT: "BCH",   ATOMUSDT: "ATOM",
  UNIUSDT: "UNI",   SHIBUSDT: "SHIB", PEPEUSDT: "PEPE", SUIUSDT: "SUI",
  TONUSDT: "TON",   TRXUSDT: "TRX",   MATICUSDT: "MATIC",
};
const KRAKEN_SPEC_FALLBACK: Record<string, { dec: number; min: number }> = {
  BTCUSDT:  { dec: 4, min: 0.0001 }, ETHUSDT:  { dec: 3, min: 0.004 },
  SOLUSDT:  { dec: 2, min: 0.01 },   DOGEUSDT: { dec: 0, min: 50 },
  XRPUSDT:  { dec: 2, min: 10 },     ADAUSDT:  { dec: 1, min: 10 },
};

// Keep old names as aliases so existing call-sites still compile
const KRAKEN_BALANCE_ASSET = KRAKEN_BALANCE_ASSET_FALLBACK;
const KRAKEN_SPEC           = KRAKEN_SPEC_FALLBACK;

// Verify a restored position actually exists on the exchange; clear it if it's a phantom.
// IMPORTANT: spot trades (leverage ≤ 1) do NOT appear in OpenPositions — they are just a
// coin balance. Only margin/leveraged trades show up as Kraken "positions". So we check the
// right place depending on how the position was opened.
async function reconcilePosition() {
  if (!config || positions.length === 0 || config.platform !== "kraken") return;
  if (config.paperMode) return; // virtual positions — nothing to reconcile on the exchange
  const effLev = Math.max(1, config.leverage ?? 1);

  // Spot SHORT positions are impossible — drop them immediately (leftover phantoms).
  if (effLev <= 1) {
    const shorts = positions.filter(p => p.direction === "short");
    if (shorts.length) {
      addLog(`🧹 ${shorts.length} pozycji SHORT niemożliwych na spocie 1x — usuwam fantomy`, "warn");
      positions = positions.filter(p => p.direction !== "short");
      saveState();
    }
  }

  try {
    if (effLev > 1) {
      // ── Margin → verify against OpenPositions (best-effort; keep on read failure) ──
      const open = await krakenPrivate("/0/private/OpenPositions");
      const krakenPos = open ? Object.values(open) as any[] : [];
      if (krakenPos.length === 0) {
        addLog(`⚠️ Brak pozycji margin na Krakenie — usuwam ${positions.length} fantomów`, "warn");
        positions = []; saveState();
      }
      return;
    }
    // ── Spot (1x) → verify each LONG against the real coin balance ─────────────
    const bal = await krakenPrivate("/0/private/Balance") as Record<string, string>;
    const before = positions.length;
    positions = positions.filter(p => {
      const sym = p.symbol ?? config!.symbol;
      const asset = getKrakenBalanceKey(sym);
      if (!asset) return true; // unknown asset — keep
      const coinBal = parseFloat(bal?.[asset] ?? "0");
      if (coinBal >= p.qty * 0.7) return true; // still held
      addLog(`⚠️ Brak salda ${asset} — pozycja ${sym} już zamknięta, usuwam`, "warn");
      return false;
    });
    if (positions.length !== before) saveState();
  } catch (e: any) {
    addLog(`⚠️ Nie udało się zweryfikować pozycji na Krakenie: ${e.message} — zachowuję`, "warn");
  }
}

// Minimum USD value of a coin balance to count as a real open position (ignore dust).
const RECOVER_MIN_USD = 3;

// Format a price with decimals that suit its magnitude — sub-dollar coins (AIO ~$0.095)
// need more decimals; toFixed(0) would wrongly show them as "$0".
function fmtPrice(p: number): string {
  if (p >= 1000) return p.toFixed(0);
  if (p >= 1)    return p.toFixed(2);
  if (p >= 0.01) return p.toFixed(4);
  return p.toFixed(8);
}

// Close ALL open margin positions on Kraken (the orphaned shorts that keep paying
// rollover fees). Reads OpenPositions, then places an opposite market order for each.
// Requires the API key's "Query Open Positions" permission; otherwise reports that.
//
// allowMemoryClose: the memory fallback (close what WE remember opening) is only safe
// when a human just pressed the button. If it ran automatically at startup with stale
// memory (position already closed manually), the "closing" order would OPEN a fresh
// margin position in the opposite direction. So: auto-runs may read-and-close, but
// only an explicit button press may close from memory.
async function closeOrphanMarginPositions(allowMemoryClose = false): Promise<{ closed: number; found: number; error?: string }> {
  if (!config || config.platform !== "kraken") return { closed: 0, found: 0 };
  if (config.paperMode) return { closed: 0, found: 0 }; // no real positions in paper mode

  // ── Path 1: read OpenPositions (authoritative — needs Query Open Positions) ────
  let open: Record<string, any> | null = null;
  let readErr = "";
  try {
    open = await krakenPrivate("/0/private/OpenPositions") as Record<string, any>;
  } catch (e: any) {
    readErr = e.message;
  }

  if (open) {
    const list = Object.entries(open);
    if (list.length === 0 && ownMargin.length === 0) {
      addLog(`✅ Brak otwartych pozycji margin — czysto`, "info");
      return { closed: 0, found: 0 };
    }
    let closed = 0;
    for (const [txid, p] of list) {
      const pair = p.pair as string;
      const type = String(p.type ?? "").toLowerCase();
      const vol  = parseFloat(p.vol ?? "0") - parseFloat(p.vol_closed ?? "0");
      if (!pair || vol <= 0) continue;
      const closeSide = type === "sell" ? "buy" : "sell";
      const lev = Math.max(2, Math.round(parseFloat(p.leverage ?? "2")) || 2);
      try {
        await krakenPrivate("/0/private/AddOrder", { pair, type: closeSide, ordertype: "market", volume: String(vol), leverage: String(lev) });
        addLog(`🧹 Zamknięto pozycję margin ${type.toUpperCase()} ${pair} vol=${vol} (txid ${txid.slice(0, 8)})`, "sell");
        closed++;
      } catch (e: any) {
        addLog(`⚠️ Nie udało się zamknąć ${pair}: ${e.message}`, "warn");
      }
    }
    ownMargin = []; saveState(); // exchange is the source of truth — memory now stale
    addLog(`🧹 Sprzątanie margin: zamknięto ${closed}/${list.length} pozycji`, closed > 0 ? "sell" : "warn");
    return { closed, found: list.length };
  }

  // ── Path 2: can't read positions → close from MEMORY of what we opened ─────────
  // Needs no read permission: just place the opposite order for each remembered margin pos.
  if (ownMargin.length > 0 && !allowMemoryClose) {
    addLog(`ℹ️ ${ownMargin.length} pozycji margin w pamięci, ale odczyt niedostępny (${readErr}) — automatycznie NIE zamykam (pamięć może być nieaktualna). Użyj przycisku „Zamknij sieroty margin".`, "warn");
    return { closed: 0, found: ownMargin.length, error: readErr };
  }
  if (ownMargin.length > 0) {
    addLog(`ℹ️ Brak odczytu pozycji (${readErr}) — zamykam ${ownMargin.length} z pamięci bota`, "info");
    let closed = 0;
    const remaining: OwnMargin[] = [];
    for (const m of ownMargin) {
      const closeSide = m.side === "sell" ? "buy" : "sell"; // opposite of what we opened
      try {
        await krakenPrivate("/0/private/AddOrder", { pair: m.pair, type: closeSide, ordertype: "market", volume: String(m.vol), leverage: String(m.lev) });
        addLog(`🧹 Zamknięto z pamięci: ${m.side.toUpperCase()} ${m.pair} vol=${m.vol} → ${closeSide}`, "sell");
        closed++;
      } catch (e: any) {
        addLog(`⚠️ Nie udało się zamknąć ${m.pair} z pamięci: ${e.message}`, "warn");
        remaining.push(m); // keep for retry
      }
    }
    ownMargin = remaining; saveState();
    return { closed, found: closed + remaining.length };
  }

  // ── Neither read nor memory ───────────────────────────────────────────────────
  addLog(`⚠️ Nie mogę odczytać pozycji margin (${readErr}) i brak ich w pamięci. Dodaj uprawnienie „Query Open Positions" lub zamknij ręcznie w Kraken Pro → Pozycje.`, "warn");
  return { closed: 0, found: 0, error: readErr };
}

// If the bot starts with NO tracked position but the Kraken account already holds the
// traded coin (e.g. a spot LONG bought before a restart that wiped bot-state.json),
// rebuild the position from the real balance so SL/TP monitoring resumes. Entry price is
// pulled from the most recent buy in TradesHistory; falls back to the current price.
async function recoverPositionFromBalance(): Promise<void> {
  if (!config || config.platform !== "kraken") return;
  if (config.paperMode) return; // no real balance to adopt in paper mode
  if (positions.length >= maxPos()) return; // already at capacity
  const effLev = Math.max(1, config.leverage ?? 1);
  if (effLev > 1) return; // margin positions are handled by OpenPositions / reconcile

  // CRITICAL: fetch the full balance ONCE (one private API call). Never call /Balance
  // per-symbol — with a 650-coin watch-list that's 650 calls = instant rate limit.
  let bal: Record<string, string> | null = null;
  try {
    bal = await krakenPrivate("/0/private/Balance") as Record<string, string>;
  } catch (e: any) {
    addLog(`⚠️ Nie udało się pobrać salda do odtworzenia: ${e.message}`, "warn");
    return;
  }
  if (!bal) return;

  // Prune purchase memory for coins we no longer hold (sold elsewhere / dust).
  for (const sym of Object.keys(ownedEntries)) {
    const a = getKrakenBalanceKey(sym);
    const held = a ? parseFloat(bal[a] ?? "0") : 0;
    if (held <= 0) delete ownedEntries[sym];
  }
  saveState();

  // Adopt every held coin (up to maxPositions) — skip the ~99% with no balance
  // and any symbol already tracked, BEFORE making price/history API calls.
  const symbolsToScan = Array.from(new Set([config.symbol, ...(config.symbols ?? [])]));
  for (const scanSym of symbolsToScan) {
    if (positions.length >= maxPos()) return; // filled up
    if (holdsSymbol(scanSym)) continue;       // already tracked
    const asset = getKrakenBalanceKey(scanSym);
    if (!asset) continue;
    const coinBal = parseFloat(bal[asset] ?? "0");
    if (coinBal <= 0) continue; // no holding — no API call needed
    await recoverSingleSymbol(scanSym, coinBal);
  }
}

async function recoverSingleSymbol(scanSym: string, coinBal: number): Promise<void> {
  if (!config || positions.length >= maxPos() || holdsSymbol(scanSym)) return;
  const asset = getKrakenBalanceKey(scanSym);
  if (!asset) return;
  try {
    if (coinBal <= 0) return;

    const price = await fetchCurrentPrice(scanSym);
    if (!price) { addLog(`ℹ️ Wykryto saldo ${asset}=${coinBal}, ale brak ceny — pomijam odtwarzanie`, "info"); return; }

    const valueUsd = coinBal * price;
    if (valueUsd < RECOVER_MIN_USD) return; // dust — not a tradeable position

    // ── Bot's own purchase memory — most accurate source ─────────────────────
    // If the bot itself bought this coin, it knows the real entry price + exit rules,
    // even when the API key can't read TradesHistory. Use that directly.
    const mem = ownedEntries[scanSym];
    if (mem && mem.entryPrice > 0) {
      const spec0 = getKrakenSpec(scanSym);
      const qty0 = parseFloat(coinBal.toFixed(spec0.dec));
      if (qty0 <= 0) return;
      positions.push({
        direction: "long",
        entryPrice: mem.entryPrice,
        qty: qty0,
        entryTime: mem.entryTime,
        trailRef: Math.max(mem.entryPrice, price),
        slPct: mem.slPct,
        tpPct: mem.tpPct,
        trailPct: mem.trailPct,
        breakEvenSet: false,
        signal: "recovered_own_memory",
        symbol: scanSym,
        leverage: mem.leverage ?? 1,
        fiat: mem.fiat, // price checks stay in the fiat the entry was recorded in
      });
      lastEntryTime = new Date(mem.entryTime).getTime();
      saveState();
      const pnlPct = ((price - mem.entryPrice) / mem.entryPrice) * 100;
      addLog(`♻️ Odtworzono pozycję LONG z własnej pamięci: ${asset}=${coinBal} wejście=$${fmtPrice(mem.entryPrice)} teraz=$${fmtPrice(price)} P&L=${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}% SL=${mem.slPct}% TP=${mem.tpPct}%`, "buy");
      return;
    }

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
      addLog(`⚠️ Nie znaleziono historii zakupu ${asset} — jako wejście przyjęta cena bieżąca $${fmtPrice(price)}, SL ${Math.max(config.stopLoss, 3.0)}% od tego poziomu. Prawdziwy zysk: sprawdź Krakena.`, "warn");
    }

    const spec = getKrakenSpec(scanSym);
    const qty = parseFloat(coinBal.toFixed(spec.dec));
    if (qty <= 0) return;

    // Unknown-entry SL: a modest 3% floor from the adoption price. Tight enough to cut
    // real losses fast, loose enough to absorb the uncertainty of the unknown entry
    // (was 8%, which let losing positions like ALKIMI bleed too far).
    const recoveredSlPct = entryKnown ? config.stopLoss : Math.max(config.stopLoss, 3.0);

    positions.push({
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
      leverage: 1, // adopted spot holding (recover only runs for spot 1x)
      fiat: config.krakenFiat ?? "USD", // adoption price fetched in current fiat — pin it
    });
    lastEntryTime = new Date(entryTime).getTime();
    // Persist this adoption to memory so the next restart recovers it with the SAME
    // entryTime — otherwise the max-hold clock would reset to "now" on every restart
    // and a frequently-restarting bot would never reach the time limit.
    rememberBuy(scanSym, { entryPrice, entryTime, qty, slPct: recoveredSlPct, tpPct: config.takeProfit, trailPct: config.trailPct, leverage: 1, fiat: config.krakenFiat ?? "USD" });
    saveState();
    addLog(`♻️ Odtworzono pozycję LONG z salda Krakena: ${asset}=${coinBal} (~$${valueUsd.toFixed(2)}) wejście${entryKnown ? "" : "≈bieżąca"}=$${fmtPrice(entryPrice)} SL=${recoveredSlPct}% TP=${config.takeProfit}%${entryKnown ? "" : " [szeroki SL — historia kupna nieznana]"}`, "buy");
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
  // Paper trading — real price, virtual fill, NO order sent to the exchange
  if (config.paperMode) {
    const px = await fetchCurrentPrice(tradeSym) ?? 0;
    if (px <= 0) throw new Error("Brak ceny do symulacji");
    addLog(`📝 PAPIER ${side.toUpperCase()} ${tradeSym} qty=${qty} @ $${fmtPrice(px)} (wirtualnie)`, "buy");
    return { txid: "PAPER-" + Date.now(), fillPrice: px };
  }
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
    // Remember margin positions we open so we can close them later WITHOUT read permission
    if (effLev > 1) {
      ownMargin.push({ pair, side: side === "long" ? "buy" : "sell", vol: qty, lev: effLev, time: new Date().toISOString() });
      saveState();
    }
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
async function closePosition(reason: string, pos: Position): Promise<boolean> {
  if (!config || !pos) return false;
  const closeSym = pos.symbol ?? config.symbol;
  // Paper trading — virtual close, no real order
  if (config.paperMode) {
    addLog(`📝 PAPIER CLOSE ${pos.direction.toUpperCase()} ${closeSym} — ${reason}`, "sell");
    return true;
  }
  try {
    if (config.platform === "kraken") {
      // Close on the pair in the SAME fiat the position was opened in
      const pair = pos.fiat ? getKrakenPairName(closeSym, pos.fiat) : krakenPair(closeSym);
      const closeSide = pos.direction === "long" ? "sell" : "buy";
      // Close with the SAME leverage the position was opened with (not the current config)
      const effLev = Math.max(1, pos.leverage ?? config.leverage ?? 1);
      // For a spot LONG, sell the ACTUAL coin balance (floored to precision) — fees
      // and rounding mean the real balance is often a hair below the recorded qty,
      // which would make "sell qty" fail with "Insufficient funds".
      let volume = pos.qty;
      if (effLev <= 1 && closeSide === "sell") {
        try {
          const bal = await krakenPrivate("/0/private/Balance") as Record<string, string>;
          const asset = getKrakenBalanceKey(closeSym);
          const real = asset ? parseFloat(bal?.[asset] ?? "0") : pos.qty;
          if (real > 0) {
            const spec = getKrakenSpec(closeSym);
            const f = Math.pow(10, spec.dec);
            volume = Math.floor(Math.min(pos.qty, real) * f) / f; // floor → never exceed balance
          }
        } catch { /* fall back to recorded qty */ }
      }
      if (volume <= 0) { addLog(`ℹ️ ${closeSym}: brak salda do sprzedania — uznaję za zamknięte`, "info"); return true; }
      // Remainder below Kraken's minimum order size = unsellable dust. Retrying only
      // spams "volume minimum not met" — drop tracking and move on.
      const specMin = getKrakenSpec(closeSym).min;
      if (effLev <= 1 && closeSide === "sell" && volume < specMin) {
        addLog(`ℹ️ ${closeSym}: saldo ${volume} poniżej minimum zlecenia (${specMin}) — NIE DA SIĘ sprzedać przez API. Moneta ZOSTAJE w portfelu: sprzedaj ręcznie (Konwertuj) albo dokup ułamek do minimum. Przestaję śledzić.`, "warn");
        return true;
      }
      const closeParams: Record<string, string> = {
        pair, type: closeSide, ordertype: "market", volume: String(volume),
      };
      if (effLev > 1) closeParams.leverage = String(effLev);
      await krakenPrivate("/0/private/AddOrder", closeParams);
      addLog(`🔴 LIVE CLOSE ${pos.direction.toUpperCase()} ${closeSym} vol=${volume} — ${reason}`, "sell");
      return true;
    }
    const closeSide = pos.direction === "long" ? "Sell" : "Buy";
    const params: Record<string, any> = config.platform === "eu"
      ? { category: "spot", symbol: closeSym, side: closeSide,
          orderType: "Market", qty: String(pos.qty), marketUnit: "baseCoin", isLeverage: 1 }
      : { category: "linear", symbol: closeSym, side: closeSide,
          orderType: "Market", qty: String(pos.qty), positionIdx: 0, reduceOnly: true };
    await bybitFetch("POST", "/v5/order/create", params);
    addLog(`🔴 LIVE CLOSE ${pos.direction.toUpperCase()} ${closeSym} — ${reason}`, "sell");
    return true;
  } catch (e: any) {
    addLog(`🔴 Close error: ${e.message}`, "warn");
    return false;
  }
}

// Finalize a triggered exit: book P&L, record the trade, forget the buy, remove from array.
async function finalizeClose(pos: Position, exitPrice: number, pct: number, reason: string): Promise<boolean> {
  if (!config) return false;
  const closed = await closePosition(reason, pos);
  if (!closed) return false;
  const KRAKEN_FEE_RT = 0.0052; // 0.26% taker × 2 (open + close)
  // P&L on the ACTUAL size of THIS position (entryPrice × qty), not the full capital.
  // With multiple positions each is ~capital/N, so using full capital overstated P&L Nx.
  const notional = pos.entryPrice * pos.qty;
  const feeCost = config.platform === "kraken" ? notional * KRAKEN_FEE_RT : 0;
  const pnlUsdt = pct / 100 * notional - feeCost;
  sessionPnl += pnlUsdt;
  recordTrade(pos, exitPrice, pnlUsdt, pct, reason);
  addLog(`CLOSE ${pos.direction.toUpperCase()} ${pos.symbol ?? config.symbol} — ${reason} | ${pnlUsdt >= 0 ? "+" : ""}${pnlUsdt.toFixed(2)} USDT`, pnlUsdt >= 0 ? "sell" : "warn");
  // Learning journal — record the trade context + outcome (evidence for later analysis).
  // "win" is NET of fees (pnlUsdt includes them) — a +0.3% move that loses to the 0.52%
  // round-trip fee is a loss, and the journal must learn it as one.
  learningLog.push({
    time: new Date().toISOString(), symbol: pos.symbol ?? config.symbol, dir: pos.direction,
    pnlPct: parseFloat(pct.toFixed(3)), win: pnlUsdt > 0,
    hour: pos.ctx?.hour ?? new Date().getUTCHours(), human: pos.ctx?.human ?? 0.5,
    bb: pos.ctx?.bb ?? 50, regime: pos.ctx?.regime ?? "?", reason,
    paper: !!config.paperMode,
  });
  saveLearning();
  forgetBuy(pos.symbol ?? config.symbol);
  positions = positions.filter(p => p !== pos);
  saveState();
  return true;
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
  return getKrakenPairName(symbol, fiat);
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

async function fetchCurrentPrice(symbol: string, fiatOverride?: KrakenFiat): Promise<number | null> {
  const pair = fiatOverride ? getKrakenPairName(symbol, fiatOverride) : krakenPair(symbol);
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
  // Win/loss counted NET of fees (pnlUsdt includes them) — gross pnlPct would call a
  // +0.3% move a "win" even though the 0.52% fee makes it a real loss.
  if (pnlUsdt > 0) {
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

// ── Fast exit check (every 5s) — checks every open position ───────────────────
async function priceCheck() {
  if (!config || !running || positions.length === 0) return;
  // Snapshot so closes mid-loop don't disturb iteration
  for (const position of [...positions]) {
    if (!positions.includes(position)) continue;          // already closed this pass
    const sym = position.symbol ?? config.symbol;
    if (closingSymbols.has(sym)) continue;                 // close already in flight

    // Fetch the price in the SAME fiat the entry was recorded in — a mid-session
    // USD→EUR auto-flip must never fake a "-8%" move on an open position.
    const live = await fetchCurrentPrice(sym, position.fiat);
    if (!live && lastPrice <= 0) continue;
    const price = live ?? position.entryPrice;             // fall back to entry if no price
    if (live) lastPrice = live;

    const rawPct = (price - position.entryPrice) / position.entryPrice * 100;
    const pct    = position.direction === "short" ? -rawPct : rawPct;

    // Update trailing high/low reference
    if (position.direction === "long")  position.trailRef = Math.max(position.trailRef, price);
    if (position.direction === "short") position.trailRef = Math.min(position.trailRef, price);

    // Break-even: once profit reaches 50% of TP, lock trail at entry + tighten trail (TP1)
    if (!position.breakEvenSet && pct >= position.tpPct * 0.5) {
      position.breakEvenSet = true;
      position.trailPct = Math.max(position.trailPct * 0.5, 0.08);
      if (position.direction === "long") {
        position.trailRef = Math.max(position.trailRef, position.entryPrice / (1 - position.trailPct / 100));
      } else {
        position.trailRef = Math.min(position.trailRef, position.entryPrice / (1 + position.trailPct / 100));
      }
      addLog(`🎯 TP1 ${sym} +${pct.toFixed(2)}% — break-even + trail ${position.trailPct.toFixed(2)}%`, "info");
    }

    const trailSL = position.direction === "long"
      ? position.trailRef * (1 - position.trailPct / 100)
      : position.trailRef * (1 + position.trailPct / 100);
    const initSL = position.direction === "long"
      ? position.entryPrice * (1 - position.slPct / 100)
      : position.entryPrice * (1 + position.slPct / 100);

    const holdMin = (Date.now() - new Date(position.entryTime).getTime()) / 60_000;
    const maxHoldMin = (config.maxHoldMin && config.maxHoldMin > 0) ? config.maxHoldMin : 48 * 60;
    const timeLabel = maxHoldMin >= 60 ? `${(maxHoldMin / 60).toFixed(0)}h` : `${maxHoldMin}m`;

    let reason: string | null = null;
    if (pct >= position.tpPct) reason = `TP +${pct.toFixed(2)}%`;
    else if (position.direction === "long"  && price <= Math.max(trailSL, initSL)) reason = `SL/Trail ${pct.toFixed(2)}%`;
    else if (position.direction === "short" && price >= Math.min(trailSL, initSL)) reason = `SL/Trail ${pct.toFixed(2)}%`;
    else if (holdMin >= maxHoldMin) reason = `Limit czasu ${timeLabel} (${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%)`;

    if (reason) {
      closingSymbols.add(sym);
      try { await finalizeClose(position, price, pct, reason); }
      finally { closingSymbols.delete(sym); }
    }
  }
}

// ── Lightweight multi-symbol signal scanner ───────────────────────────────────
// Fetches candles + indicators for a single symbol and returns signal data.
// Used to scan alternative symbols when the primary has no signal.

// Kraken public API rate limits hard, so we never scan more than MAX_SCAN_PER_TICK
// symbols per tick. With a long watch-list we rotate through it across ticks so
// every coin is checked over time. Concurrency is batched to avoid bursts.
const MAX_SCAN_PER_TICK = 20;
const SCAN_BATCH_SIZE = 5;
let scanCursor = 0;

// Run quickScanSymbol over a list with limited concurrency (batches of SCAN_BATCH_SIZE).
// cfgIn lets a second engine (paper) scan with ITS config while the real bot runs its own.
async function scanInBatches(symbols: string[], cfgIn?: BotConfig): Promise<QuickSignal[]> {
  const out: QuickSignal[] = [];
  for (let i = 0; i < symbols.length; i += SCAN_BATCH_SIZE) {
    const batch = symbols.slice(i, i + SCAN_BATCH_SIZE);
    const res = (await Promise.all(batch.map(s => quickScanSymbol(s, cfgIn)))).filter(Boolean) as QuickSignal[];
    out.push(...res);
  }
  return out;
}

type QuickSignal = {
  sym: string; bbPercB: number; isLong: boolean; isShort: boolean;
  score: number; price: number; atrPct: number;
  effSL: number; effTP: number; effTrail: number; qty: number;
  spec: { dec: number; min: number };
};

// Approximate 24h turnover (in quote currency) from the 5m candle volumes the bot
// already fetched. 150 candles × 5m = 12.5h of data; scale up to a 24h estimate.
function estimate24hTurnover(volumes: number[], price: number): number {
  const baseVol = volumes.reduce((s, v) => s + v, 0);          // base-asset volume over window
  const windowMin = volumes.length * 5;                         // 5m candles
  const scaleTo24h = windowMin > 0 ? (24 * 60) / windowMin : 1;
  return baseVol * scaleTo24h * price;                          // quote-currency turnover
}

async function quickScanSymbol(sym: string, cfgIn?: BotConfig): Promise<QuickSignal | null> {
  const cfg = cfgIn ?? config;
  if (!cfg) return null;
  try {
    const candles = await fetchCandles(sym);
    if (!candles) return null;
    const { closes, opens, volumes, vwaps, highs, lows } = candles;
    // Use the last candle close as price — avoids a second API call per symbol
    // (halves scan traffic; tick-precise price isn't needed just to detect a signal).
    const price = candles.price;
    if (!price) return null;

    // Liquidity filter — skip illiquid coins where the chart price isn't really tradeable
    if (cfg.minVolume && cfg.minVolume > 0) {
      const turnover24h = estimate24hTurnover(volumes.slice(0, -1), price);
      if (turnover24h < cfg.minVolume) return null;
    }

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

    // ── Bounce confirmation + trend filter (Law 2: don't catch a falling knife) ─
    // For a LONG we need TWO things:
    //  a) bounce started — last candle green AND its close ≥ the prior close (2-bar up)
    //  b) NOT in a steep downtrend — EMA9 not far below EMA21 (else oversold keeps
    //     getting more oversold; that's how ENA was bought into a falling market).
    const lastClose  = closedCloses[closedCloses.length - 1];
    const ema9s      = calcEma(closedCloses, 9);
    const ema21s     = calcEma(closedCloses, 21);
    const notSteepDown = ema9s >= ema21s * 0.985; // ema9 < 1.5% below ema21 = clear downtrend → skip
    // CONFIRMED bottom/top — only buy once the dip/peak already formed and price turned
    const recent5s = closedCloses.slice(-5);
    const los = Math.min(...recent5s), his = Math.max(...recent5s);
    const bottomConfirmed = recent5s.indexOf(los) < recent5s.length - 1 && lastClose > los;
    const topConfirmed    = recent5s.indexOf(his) < recent5s.length - 1 && lastClose < his;

    const effLev = Math.max(1, cfg.leverage ?? 1);
    const spotOnly = cfg.platform === "kraken" && effLev <= 1;
    // Entry depth: cfg.bbMax lets the paper engine demand DEEPER dips (e.g. 25)
    // while the real bot (no bbMax set) keeps the default 40 — A/B experiment.
    // Both get the reversal-map tilt (±5) — statistically hot/cold reversal hours.
    const bbEntry = Math.max(10, Math.min(45, (cfg.bbMax ?? 40) + reversalTiltNow));
    const isLong  = bbPercB < bbEntry && price < vwap && !inCrashSym && bottomConfirmed && notSteepDown;
    const isShort = cfg.allowShorts && !spotOnly && bbPercB > (100 - bbEntry) && price > vwap && topConfirmed;
    const score   = isLong ? (50 - bbPercB) : isShort ? (bbPercB - 50) : 0;

    const effSL    = Math.max(cfg.stopLoss,   atrPct * 1.5);
    const effTP    = Math.max(cfg.takeProfit,  atrPct * 2.5);
    const effTrail = Math.max(cfg.trailPct,    atrPct * 0.8);

    const spec = getKrakenSpec(sym);

    const riskFraction = Math.min(100, Math.max(1, cfg.riskPct ?? 100)) / 100;
    // Cap per-position size at capital / maxPositions so N positions all fit the capital.
    const perPosFraction = Math.min(riskFraction, 1 / Math.max(1, cfg.maxPositions ?? 1));
    const slForSizing  = effSL / 100;
    const atrScale     = slForSizing > 0 ? Math.min(1, (cfg.stopLoss / 100) / slForSizing) : 1;
    const positionUsdt = cfg.capital * perPosFraction * atrScale * effLev;
    // Fee buffer over the exchange minimum — fee is taken in coin; buying exactly the
    // minimum leaves a balance just under it = unsellable (see AKT lesson in engineTick).
    const minBufS = Math.ceil(spec.min * 1.02 * Math.pow(10, spec.dec)) / Math.pow(10, spec.dec);
    const qty = Math.max(parseFloat((positionUsdt / price).toFixed(spec.dec)), minBufS);

    return { sym, bbPercB, isLong, isShort, score, price, atrPct, effSL, effTP, effTrail, qty, spec };
  } catch { return null; }
}

// ── Human-activity curve (people ARE the market) ──────────────────────────────
// Weight 0..1 per UTC hour: how many humans are awake & trading across the 3 big
// money centers (Asia/Europe/US). Peaks at the EU+US overlap (13-16 UTC), troughs
// when the world sleeps (02-06 UTC). Used by the "watch the people" mode.
const HUMAN_ACTIVITY: number[] = [
  /*00*/ 0.45, /*01*/ 0.40, /*02*/ 0.28, /*03*/ 0.22, /*04*/ 0.22, /*05*/ 0.28,
  /*06*/ 0.42, /*07*/ 0.62, /*08*/ 0.75, /*09*/ 0.80, /*10*/ 0.82, /*11*/ 0.78,
  /*12*/ 0.70, /*13*/ 0.90, /*14*/ 0.97, /*15*/ 1.00, /*16*/ 0.92, /*17*/ 0.82,
  /*18*/ 0.75, /*19*/ 0.68, /*20*/ 0.58, /*21*/ 0.50, /*22*/ 0.45, /*23*/ 0.48,
];
function humanActivity(utcHour: number): number { return HUMAN_ACTIVITY[utcHour % 24] ?? 0.5; }
function humanActivityLabel(w: number): string {
  return w >= 0.85 ? "🔥 szczyt" : w >= 0.6 ? "💼 praca" : w >= 0.4 ? "🌆 luz" : "😴 śpi";
}
const HUMAN_MIN_ACTIVITY = 0.40; // below this = world asleep → skip entries in human-rhythm mode

// ── Reversal map (honest version of "when do dips turn into rises") ──────────
// From REAL history we measure, per UTC hour and per weekday, how often a decline
// flipped into a rise. No fortune-telling — just measured frequencies. The bot uses
// it as a SOFT tilt: in statistically reversal-prone hours the BB%B entry threshold
// loosens a little (+5), in reversal-poor hours it tightens (-5). Never a hard gate.
type ReversalMap = {
  byHour: (number | null)[];   // P(flip down→up) per UTC hour, from 30d of 1h candles
  byDay: (number | null)[];    // P(down-day → up-day) per weekday, from ~2y of daily candles
  avgHour: number;             // mean hourly flip rate (baseline)
  at: number;                  // cache timestamp
};
let _reversalMap: ReversalMap | null = null;
let reversalNowPct: number | null = null; // set each tick for logs/status
let reversalTiltNow = 0;                  // -5 / 0 / +5 applied to BB entry threshold

async function loadReversalMap(): Promise<ReversalMap | null> {
  if (_reversalMap && Date.now() - _reversalMap.at < 12 * 3600_000) return _reversalMap;
  try {
    const pair = krakenPair(config?.symbol ?? "BTCUSDT"); // market proxy
    // Hourly: flip = previous 3h net down AND next 3h net up, bucketed by hour
    const hRaw = (await krakenOhlcFetch(pair, 60, Math.floor(Date.now() / 1000) - 30 * 24 * 3600)) ?? [];
    const hc = hRaw.map((c: any) => parseFloat(c[4]));
    const flips: number[] = Array(24).fill(0), opps: number[] = Array(24).fill(0);
    for (let i = 3; i < hc.length - 3; i++) {
      const prevDown = hc[i] < hc[i - 3];
      if (!prevDown) continue;
      const h = new Date(hRaw[i][0] * 1000).getUTCHours();
      opps[h]++;
      if (hc[i + 3] > hc[i]) flips[h]++;
    }
    const byHour = opps.map((n, h) => n >= 8 ? flips[h] / n : null);
    // Daily: flip = down day followed by up day, bucketed by weekday
    const dRaw = (await krakenOhlcFetch(pair, 1440, Math.floor(Date.now() / 1000) - 720 * 24 * 3600)) ?? [];
    const dFlips: number[] = Array(7).fill(0), dOpps: number[] = Array(7).fill(0);
    for (let i = 1; i < dRaw.length - 1; i++) {
      const down = parseFloat(dRaw[i][4]) < parseFloat(dRaw[i][1]);
      if (!down) continue;
      const dow = new Date(dRaw[i + 1][0] * 1000).getUTCDay(); // weekday of the POTENTIAL flip day
      dOpps[dow]++;
      if (parseFloat(dRaw[i + 1][4]) > parseFloat(dRaw[i + 1][1])) dFlips[dow]++;
    }
    const byDay = dOpps.map((n, d) => n >= 10 ? dFlips[d] / n : null);
    const hourVals = byHour.filter((v): v is number => v !== null);
    const avgHour = hourVals.length ? hourVals.reduce((s, v) => s + v, 0) / hourVals.length : 0.5;
    _reversalMap = { byHour, byDay, avgHour, at: Date.now() };
    return _reversalMap;
  } catch { return _reversalMap; }
}

// ── BTC guard ("gravity watch") ───────────────────────────────────────────────
// BTC leads the whole market: when BTC dumps, alts follow within minutes and fall
// HARDER (beta > 1), then keep bleeding after BTC stops. So while BTC is down ≥2%
// over the last hour, we pause ALL new entries (bot + paper) — the knives are
// falling everywhere. Exits are never blocked.
let _btcHist: { t: number; p: number }[] = [];
let btcGuardActive = false;
let btcChg1h: number | null = null;

async function updateBtcGuard(): Promise<void> {
  try {
    const p = await fetchCurrentPrice("BTCUSDT", config?.krakenFiat ?? "USD");
    if (!p) return;
    const now = Date.now();
    _btcHist.push({ t: now, p });
    _btcHist = _btcHist.filter(x => now - x.t <= 75 * 60_000); // keep ~75 min
    const cutoff = now - 60 * 60_000;
    const ref = _btcHist.find(x => x.t <= cutoff) ?? _btcHist[0];
    if (now - ref.t < 30 * 60_000) { btcGuardActive = false; btcChg1h = null; return; } // need ≥30 min of history
    btcChg1h = (p - ref.p) / ref.p * 100;
    btcGuardActive = btcChg1h <= -2.0;
  } catch { /* keep last state on transient errors */ }
}

// Refresh the "now" tilt from the map — called each engine tick.
async function updateReversalTilt(utcHour: number) {
  const m = await loadReversalMap();
  if (!m) { reversalNowPct = null; reversalTiltNow = 0; return; }
  const now = m.byHour[utcHour];
  reversalNowPct = now !== null ? Math.round(now * 100) : null;
  if (now === null) { reversalTiltNow = 0; return; }
  reversalTiltNow = now >= m.avgHour + 0.10 ? 5 : now <= m.avgHour - 0.10 ? -5 : 0;
}

// Learned expectancy for a given context (human band + BB band), from the journal.
// Returns null if too few samples to trust. Used by "learn & adapt" mode to skip
// conditions the bot has PROVEN to lose in (evidence-based, needs a real sample).
const LEARN_MIN_SAMPLE = 8; // need ≥8 trades in a bucket before trusting its E
function humanBandKey(w: number): string { return w >= 0.85 ? "peak" : w >= 0.6 ? "work" : w >= 0.4 ? "chill" : "sleep"; }
function bbBandKey(b: number): string { return b < 0 ? "x" : b < 15 ? "0-15" : b < 30 ? "15-30" : b < 40 ? "30-40" : "40+"; }
function learnedContextE(human: number, bb: number): { n: number; E: number } | null {
  const hk = humanBandKey(human), bk = bbBandKey(bb);
  const recs = learningLog.filter(r => humanBandKey(r.human) === hk && bbBandKey(r.bb) === bk);
  if (recs.length < LEARN_MIN_SAMPLE) return null;
  const wins = recs.filter(r => r.win);
  const avgWin  = wins.length ? wins.reduce((s, r) => s + r.pnlPct, 0) / wins.length : 0;
  const losses = recs.filter(r => !r.win);
  const avgLoss = losses.length ? losses.reduce((s, r) => s + r.pnlPct, 0) / losses.length : 0;
  const wr = wins.length / recs.length;
  const E = wr * avgWin + (1 - wr) * avgLoss - 0.52; // net after fees
  return { n: recs.length, E };
}

// ── STANDALONE PAPER ENGINE ───────────────────────────────────────────────────
// A second, fully independent engine trading VIRTUAL money on live prices.
// Runs in parallel with the real bot (own config, positions, P&L, intervals) so
// you can compare them side by side. Shares: price/candle cache, signal logic
// (quickScanSymbol) and the learning journal (records marked paper:true).
const PAPER_FILE = path.resolve(process.cwd(), "data", "paper_state.json");

let paperRunning = false;
let paperCfg: BotConfig | null = null;
let paperPositions: Position[] = [];
let paperPnl = 0;
let paperWins = 0;
let paperLosses = 0;
let paperLastEntry = 0;
let paperScanCursor = 0;
let paperTickBusy = false;
let paperClosing = new Set<string>();
let paperIntervalId: ReturnType<typeof setInterval> | null = null;
let paperPriceIntervalId: ReturnType<typeof setInterval> | null = null;

function savePaper() {
  try {
    const dir = path.dirname(PAPER_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const safeCfg = paperCfg ? { ...paperCfg, apiKey: "", secret: "" } : null;
    fs.writeFileSync(PAPER_FILE, JSON.stringify({ running: paperRunning, config: safeCfg, positions: paperPositions, pnl: paperPnl, wins: paperWins, losses: paperLosses }));
  } catch { /* ignore */ }
}

function startPaperIntervals() {
  if (paperIntervalId) clearInterval(paperIntervalId);
  if (paperPriceIntervalId) clearInterval(paperPriceIntervalId);
  paperIntervalId = setInterval(paperTick, 60_000);
  paperPriceIntervalId = setInterval(paperPriceCheck, 5_000);
  paperTick();
}

function stopPaper() {
  paperRunning = false;
  if (paperIntervalId) { clearInterval(paperIntervalId); paperIntervalId = null; }
  if (paperPriceIntervalId) { clearInterval(paperPriceIntervalId); paperPriceIntervalId = null; }
  savePaper();
  addLog(`📝 Symulacja zatrzymana — P&L ${paperPnl >= 0 ? "+" : ""}$${paperPnl.toFixed(2)} (${paperWins}W/${paperLosses}L)`, "info");
}

function loadPaper() {
  try {
    if (!fs.existsSync(PAPER_FILE)) return;
    const s = JSON.parse(fs.readFileSync(PAPER_FILE, "utf8"));
    if (s.running && s.config) {
      paperCfg = { ...s.config, apiKey: "", secret: "" };
      paperPositions = Array.isArray(s.positions) ? s.positions : [];
      paperPnl = s.pnl ?? 0; paperWins = s.wins ?? 0; paperLosses = s.losses ?? 0;
      paperRunning = true;
      addLog(`📝 Symulacja wznowiona po restarcie — ${paperPositions.length} pozycji, P&L ${paperPnl >= 0 ? "+" : ""}$${paperPnl.toFixed(2)}`, "info");
      startPaperIntervals();
    }
  } catch { /* ignore */ }
}

// Entry tick — same gates and signal as the real engine, but fully virtual.
async function paperTick() {
  if (!paperRunning || !paperCfg || paperTickBusy) return;
  paperTickBusy = true;
  try {
    const maxP = Math.max(1, paperCfg.maxPositions ?? 1);
    if (paperPositions.length >= maxP) return;
    const utcHour = new Date().getUTCHours();
    if (utcHour >= TREND.LOW_LIQ_START && utcHour < TREND.LOW_LIQ_END) return;
    if (paperCfg.humanRhythm && humanActivity(utcHour) < HUMAN_MIN_ACTIVITY) return;
    // 🛡️ BTC guard — same gravity rule as the real bot (update ourselves in case
    // the real engine is stopped and nobody else refreshes the measurement)
    await updateBtcGuard().catch(() => {});
    if (btcGuardActive) return;
    const cooldownMs = (paperCfg.cooldownMin ?? 20) * 60_000;
    if (Date.now() - paperLastEntry <= cooldownMs) return;

    // Rotate through the full watch-list (primary + alts), skipping held coins
    const all = Array.from(new Set([paperCfg.symbol, ...(paperCfg.symbols ?? [])]))
      .filter(s => !paperPositions.some(p => p.symbol === s));
    if (all.length === 0) return;
    if (paperScanCursor >= all.length) paperScanCursor = 0;
    const batch = all.slice(paperScanCursor, paperScanCursor + MAX_SCAN_PER_TICK);
    if (batch.length < MAX_SCAN_PER_TICK && all.length > MAX_SCAN_PER_TICK) {
      batch.push(...all.slice(0, MAX_SCAN_PER_TICK - batch.length));
    }
    paperScanCursor += MAX_SCAN_PER_TICK;

    const scans = await scanInBatches(batch, paperCfg);
    const best = scans.filter(s => s.isLong || s.isShort).sort((a, b) => b.score - a.score)[0];
    if (!best) return;

    // 🧠 learn & adapt — same journal as the real bot, judged on THIS coin's context
    if (paperCfg.learnAdapt) {
      const learned = learnedContextE(humanActivity(utcHour), best.bbPercB);
      if (learned && learned.E < 0) {
        addLog(`📝🧠 SYM: warunek ${best.sym} traci (E ${learned.E.toFixed(2)}% z ${learned.n}) — pomijam`, "info");
        return;
      }
    }

    const px = await fetchCurrentPrice(best.sym) ?? best.price;
    const dir: Direction = best.isLong ? "long" : "short";
    paperPositions.push({
      direction: dir, entryPrice: px, qty: best.qty,
      entryTime: new Date().toISOString(), trailRef: px,
      slPct: best.effSL, tpPct: best.effTP, trailPct: best.effTrail,
      breakEvenSet: false, signal: "paper_scan", symbol: best.sym, leverage: 1,
      fiat: config?.krakenFiat ?? "USD", // pin entry fiat (fetch above used the same via krakenPair)
      ctx: { hour: utcHour, human: humanActivity(utcHour), bb: parseFloat(best.bbPercB.toFixed(1)), regime: marketRegime },
    });
    paperLastEntry = Date.now();
    savePaper();
    addLog(`📝 SYM ${dir.toUpperCase()} ${best.sym} @ $${fmtPrice(px)} qty=${best.qty} BB%B=${best.bbPercB.toFixed(0)} (${paperPositions.length}/${maxP})`, "buy");
  } catch (e: any) {
    addLog(`📝 SYM tick error: ${e.message}`, "warn");
  } finally { paperTickBusy = false; }
}

// Exit check — identical SL/TP/trail/time rules, virtual close, shared learning journal.
async function paperPriceCheck() {
  if (!paperRunning || !paperCfg || paperPositions.length === 0) return;
  for (const pos of [...paperPositions]) {
    if (!paperPositions.includes(pos)) continue;
    const sym = pos.symbol ?? paperCfg.symbol;
    if (paperClosing.has(sym)) continue;

    const price = await fetchCurrentPrice(sym, pos.fiat); // same fiat as entry (see priceCheck)
    if (!price) continue;

    const rawPct = (price - pos.entryPrice) / pos.entryPrice * 100;
    const pct    = pos.direction === "short" ? -rawPct : rawPct;

    if (pos.direction === "long")  pos.trailRef = Math.max(pos.trailRef, price);
    if (pos.direction === "short") pos.trailRef = Math.min(pos.trailRef, price);

    if (!pos.breakEvenSet && pct >= pos.tpPct * 0.5) {
      pos.breakEvenSet = true;
      pos.trailPct = Math.max(pos.trailPct * 0.5, 0.08);
      if (pos.direction === "long") pos.trailRef = Math.max(pos.trailRef, pos.entryPrice / (1 - pos.trailPct / 100));
      else pos.trailRef = Math.min(pos.trailRef, pos.entryPrice / (1 + pos.trailPct / 100));
    }

    const trailSL = pos.direction === "long" ? pos.trailRef * (1 - pos.trailPct / 100) : pos.trailRef * (1 + pos.trailPct / 100);
    const initSL  = pos.direction === "long" ? pos.entryPrice * (1 - pos.slPct / 100)  : pos.entryPrice * (1 + pos.slPct / 100);
    const holdMin = (Date.now() - new Date(pos.entryTime).getTime()) / 60_000;
    const maxHold = (paperCfg.maxHoldMin && paperCfg.maxHoldMin > 0) ? paperCfg.maxHoldMin : 48 * 60;
    const timeLabel = maxHold >= 60 ? `${(maxHold / 60).toFixed(0)}h` : `${maxHold}m`;

    let reason: string | null = null;
    if (pct >= pos.tpPct) reason = `TP +${pct.toFixed(2)}%`;
    else if (pos.direction === "long"  && price <= Math.max(trailSL, initSL)) reason = `SL/Trail ${pct.toFixed(2)}%`;
    else if (pos.direction === "short" && price >= Math.min(trailSL, initSL)) reason = `SL/Trail ${pct.toFixed(2)}%`;
    else if (holdMin >= maxHold) reason = `Limit czasu ${timeLabel} (${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%)`;

    if (reason) {
      paperClosing.add(sym);
      try {
        const notional = pos.entryPrice * pos.qty;
        const fee = notional * 0.0052; // same fee model as live
        const pnl = pct / 100 * notional - fee;
        paperPnl += pnl;
        if (pnl > 0) paperWins++; else paperLosses++;
        learningLog.push({
          time: new Date().toISOString(), symbol: sym, dir: pos.direction,
          pnlPct: parseFloat(pct.toFixed(3)), win: pnl > 0,
          hour: pos.ctx?.hour ?? new Date().getUTCHours(), human: pos.ctx?.human ?? 0.5,
          bb: pos.ctx?.bb ?? 50, regime: pos.ctx?.regime ?? "?", reason, paper: true,
        });
        saveLearning();
        paperPositions = paperPositions.filter(p => p !== pos);
        savePaper();
        addLog(`📝 SYM CLOSE ${pos.direction.toUpperCase()} ${sym} — ${reason} | ${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)} (razem ${paperPnl >= 0 ? "+" : ""}$${paperPnl.toFixed(2)})`, pnl >= 0 ? "sell" : "warn");
      } finally { paperClosing.delete(sym); }
    }
  }
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
    // Reversal map — refresh the soft BB-threshold tilt for this hour (cached 12h)
    await updateReversalTilt(utcHour).catch(() => {});
    // BTC guard — measure BTC's 1h change (gravity source for all alts)
    await updateBtcGuard().catch(() => {});
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
    const humanTag = config.humanRhythm ? ` 👁️${humanActivityLabel(humanActivity(utcHour))}(${(humanActivity(utcHour) * 100).toFixed(0)}%)` : "";
    const revTag = reversalNowPct !== null ? ` 🔄${reversalNowPct}%${reversalTiltNow > 0 ? "↑" : reversalTiltNow < 0 ? "↓" : ""}` : "";
    const guardTag = btcGuardActive ? ` 🛡️BTC${btcChg1h!.toFixed(1)}%` : "";
    addLog(`Tick: ${config.symbol} $${price.toFixed(0)} RSI=${rsi.toFixed(1)}${rsiRecovering?"↑":rsiDivBull?"⬆":""}(prev=${prevRsi.toFixed(1)}) MACD=${macdLine.toFixed(1)} ADX=${adx.toFixed(0)}${rangeMode?"[range]":""} Trend[${stackLog}]=${trendScore >= 0 ? "+" : ""}${trendScore.toFixed(2)} ATR=${atrPct.toFixed(2)}% StochRSI=${stochRsi.toFixed(0)} BB%B=${bbPercB.toFixed(0)} VWAP=$${vwap.toFixed(0)}${belowVwap?"↓":aboveVwap?"↑":""} Dip=${dipFromHigh.toFixed(1)}% Reżim=${marketRegime}(${regimeCandidateCount}/${TREND.REGIME_HYSTERESIS})${humanTag}${revTag}${guardTag}`);
    prevRsi = rsi; // update after log so (prev=) shows last tick's RSI

    // ── Open position management ─────────────────────────────────────────────
    // ── Manage positions ──────────────────────────────────────────────────────
    // priceCheck() (every 5s) already handles SL/TP/trail/time for EVERY position
    // using each coin's own price. Here we only add the RSI-extreme exit, and only
    // for a position on the primary symbol (the one whose RSI we computed this tick).
    const primaryPos = positions.find(p => (p.symbol ?? config!.symbol) === config!.symbol);
    if (primaryPos && !closingSymbols.has(config.symbol)) {
      const rsiOverbought = primaryPos.direction === "long"  && rsi > Math.max(config.rsiMax + 8, 78);
      const rsiOversold   = primaryPos.direction === "short" && rsi < Math.min(config.rsiMin - 8, 22);
      if (rsiOverbought || rsiOversold) {
        const rawPct = (price - primaryPos.entryPrice) / primaryPos.entryPrice * 100;
        const pct    = primaryPos.direction === "short" ? -rawPct : rawPct;
        addLog(`📊 RSI exit ${config.symbol} — RSI ${rsi.toFixed(1)} | P&L ${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`, pct >= 0 ? "sell" : "warn");
        closingSymbols.add(config.symbol);
        try { await finalizeClose(primaryPos, price, pct, `RSI extreme ${rsi.toFixed(1)}`); }
        finally { closingSymbols.delete(config.symbol); }
      }
    }

    // Already holding the max number of positions → don't open anything new.
    if (positions.length >= maxPos()) return;

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
    // ── "Watch the people" — rest when the world sleeps ─────────────────────
    if (config.humanRhythm) {
      const act = humanActivity(utcHour);
      if (act < HUMAN_MIN_ACTIVITY) {
        addLog(`😴 Ludzie śpią (UTC ${utcHour}:xx, aktywność ${(act * 100).toFixed(0)}%) — bot odpoczywa z nimi`, "info");
        return;
      }
    }
    // ── 🛡️ BTC guard — while BTC is dumping, EVERYTHING falls harder; no new buys ──
    if (btcGuardActive) {
      addLog(`🛡️ Straż BTC: ${btcChg1h!.toFixed(1)}% w 1h — grawitacja w dół, wstrzymuję nowe zakupy (wyjścia działają normalnie)`, "info");
      return;
    }
    // (🧠 learn-&-adapt gate is applied per-entry below, with EACH coin's own BB%B —
    //  a global gate here would judge alt entries by the primary symbol's context.)

    // ── Entry logic — simplified single mode ─────────────────────────────────
    // Long:  BB%B < 40 + price below VWAP + no crash
    // Short: BB%B > 60 + price above VWAP
    const effLev = Math.max(1, config.leverage ?? 1);
    const macdBull = macdLine > macdSignal; // kept for display/log only

    const spotOnly = config.platform === "kraken" && effLev <= 1;
    // Liquidity filter on the primary symbol — if too illiquid, skip its signal
    // (the alt-scan below will still look for a tradeable, liquid mover).
    const primaryLiquid = !config.minVolume || config.minVolume <= 0
      || estimate24hTurnover(volumes.slice(0, -1), price) >= config.minVolume;
    const primaryFree = !holdsSymbol(config.symbol); // don't double up on a coin we already hold
    const notSteepDown = ema9 >= ema21 * 0.985; // ema9 < 1.5% below ema21 = clear downtrend → skip longs
    // CONFIRMED bottom/top (uczeń: kupuj dopiero gdy dołek/górka już BYŁ, nie w trakcie).
    // Bottom is confirmed when the lowest of the last 5 closes is BEHIND us (≥1 candle ago)
    // and price has turned up off it. Top is the mirror image.
    const recent5 = closedCloses.slice(-5);
    const lo = Math.min(...recent5), hi = Math.max(...recent5);
    const loBehind = recent5.indexOf(lo) < recent5.length - 1; // the dip already formed
    const hiBehind = recent5.indexOf(hi) < recent5.length - 1;  // the peak already formed
    const bottomConfirmed = loBehind && lastClose > lo;  // turned UP off a past low
    const topConfirmed    = hiBehind && lastClose < hi;  // turned DOWN off a past high
    // Reversal-map tilt: loosen the entry threshold a bit in hours where declines
    // HISTORICALLY flipped to rises more often, tighten where they didn't.
    const bbEntryLive = Math.max(10, Math.min(45, 40 + reversalTiltNow));
    const isLong  = primaryFree && primaryLiquid && bbPercB < bbEntryLive && belowVwap && !inCrash && bottomConfirmed && notSteepDown;
    const isShort = primaryFree && primaryLiquid && config.allowShorts && !spotOnly && bbPercB > (100 - bbEntryLive) && aboveVwap && topConfirmed;

    const cooldownMs = (config.cooldownMin ?? 60) * 60 * 1000;
    const cooldownOk = Date.now() - lastEntryTime > cooldownMs;
    const doLong  = isLong  && cooldownOk;
    const doShort = isShort && cooldownOk;

    if (!doLong && !doShort) {
      const coolLeft = cooldownOk ? "✓" : `${Math.ceil((cooldownMs - (Date.now() - lastEntryTime)) / 60000)}m`;
      // Scan alternative symbols when primary has no signal and cooldown is OK.
      // Rotate through the watch-list in chunks of MAX_SCAN_PER_TICK so a huge list
      // (e.g. all 650 Kraken coins) gets fully covered over several ticks without
      // flooding the API in one burst.
      // Exclude the primary symbol and any coin we already hold from the scan list.
      const allAlts = (config.symbols ?? []).filter(s => s !== config!.symbol && !holdsSymbol(s));
      if (allAlts.length > 0 && cooldownOk) {
        if (scanCursor >= allAlts.length) scanCursor = 0;
        const altSymbols = allAlts.slice(scanCursor, scanCursor + MAX_SCAN_PER_TICK);
        // Wrap around to the start if the slice is short
        if (altSymbols.length < MAX_SCAN_PER_TICK && allAlts.length > MAX_SCAN_PER_TICK) {
          altSymbols.push(...allAlts.slice(0, MAX_SCAN_PER_TICK - altSymbols.length));
        }
        scanCursor += MAX_SCAN_PER_TICK;
        if (allAlts.length > MAX_SCAN_PER_TICK) {
          addLog(`🔎 Skan ${altSymbols.length}/${allAlts.length} monet (rotacja ${scanCursor > allAlts.length ? allAlts.length : scanCursor}/${allAlts.length})`);
        }
        const scans = await scanInBatches(altSymbols);
        // Pick the best signal among coins we don't already hold
        const best = scans.filter(s => (s.isLong || s.isShort) && !holdsSymbol(s.sym)).sort((a, b) => b.score - a.score)[0];
        if (best) {
          const altDir: Direction = best.isLong ? "long" : "short";
          // 🧠 Learn & adapt — judge THIS coin's context (its own BB%B), not the primary's
          if (config.learnAdapt) {
            const learned = learnedContextE(humanActivity(new Date().getUTCHours()), best.bbPercB);
            if (learned && learned.E < 0) {
              addLog(`🧠 Dziennik: warunek ${best.sym} traci (E ${learned.E.toFixed(2)}% z ${learned.n} transakcji) — pomijam`, "info");
              return;
            }
          }
          // Free-balance check — skip the buy if there isn't enough spare fiat (real mode only)
          const needUsd = best.qty * best.price;
          if (!config.paperMode) try {
            const balR = await krakenPrivate("/0/private/Balance") as Record<string, string>;
            const usd = parseFloat(balR.ZUSD ?? "0");
            const eur = parseFloat(balR.ZEUR ?? "0");
            config.krakenFiat = eur > usd ? "EUR" : "USD";
            const availUsd = config.krakenFiat === "EUR" ? eur * 1.08 : usd;
            if (availUsd < needUsd * 1.05) {
              addLog(`⏭ ${best.sym}: za mało wolnego ${config.krakenFiat} ($${availUsd.toFixed(2)} < $${(needUsd * 1.05).toFixed(2)}) — pomijam (kapitał w innych pozycjach)`, "info");
              return;
            }
          } catch { /* proceed — order will fail gracefully if truly short */ }
          addLog(`🎯 SYGNAŁ ${altDir.toUpperCase()} [multi:${best.sym}] BB%B=${best.bbPercB.toFixed(0)} ATR=${best.atrPct.toFixed(2)}% → SL=${best.effSL.toFixed(2)}% TP=${best.effTP.toFixed(2)}% qty=${best.qty} (${positions.length + 1}/${maxPos()})`, "info");
          try {
            const { fillPrice } = await placeOrder(altDir, best.qty, best.sym);
            const entryPrice = fillPrice > 0 ? fillPrice : best.price;
            const entryTime = new Date().toISOString();
            const altLev = Math.max(1, config.leverage ?? 1);
            const altFiat: KrakenFiat = config.krakenFiat ?? "USD";
            positions.push({
              direction: altDir, entryPrice, qty: best.qty,
              entryTime, trailRef: entryPrice,
              slPct: best.effSL, tpPct: best.effTP, trailPct: best.effTrail,
              breakEvenSet: false, signal: "multi_scan", symbol: best.sym, leverage: altLev, fiat: altFiat,
              ctx: { hour: new Date().getUTCHours(), human: humanActivity(new Date().getUTCHours()), bb: parseFloat(best.bbPercB.toFixed(1)), regime: marketRegime },
            });
            lastEntryTime = Date.now();
            rememberBuy(best.sym, { entryPrice, entryTime, qty: best.qty, slPct: best.effSL, tpPct: best.effTP, trailPct: best.effTrail, leverage: altLev, fiat: altFiat });
            saveState();
          } catch (e: any) {
            addLog(`🔴 ZLECENIE ${best.sym} NIEUDANE: ${e.message}`, "warn");
          }
          return;
        }
      }
      addLog(`Brak sygnału — BB%B=${bbPercB.toFixed(0)}(long<40,short>60) vwap=${belowVwap?"↓":aboveVwap?"↑":"="} RSI=${rsi.toFixed(1)} dołek=${bottomConfirmed?"✓":"✗"} cool=${coolLeft} crash=${inCrash}`);
      return;
    }
    // 🧠 Learn & adapt — primary entry judged by the PRIMARY symbol's own context
    if (config.learnAdapt) {
      const learned = learnedContextE(humanActivity(utcHour), bbPercB);
      if (learned && learned.E < 0) {
        addLog(`🧠 Dziennik: warunek ${config.symbol} traci (E ${learned.E.toFixed(2)}% z ${learned.n} transakcji) — pomijam`, "info");
        return;
      }
    }
    lastEntrySignal = isLong ? (bbPercB < 0 ? "BB_extreme_long" : "BB_dip_long") : "BB_top_short";

    const direction: Direction = doLong ? "long" : "short";

    // ATR-based dynamic TP/SL — use whichever is wider to avoid being stopped by noise
    // 1h BTC ATR is typically 0.5–1.5%; fixed 0.6% TP would be too tight
    const effSL    = Math.max(config.stopLoss,   atrPct * 1.5);
    const effTP    = Math.max(config.takeProfit,  atrPct * 2.5);
    const effTrail = Math.max(config.trailPct,    atrPct * 0.8);

    const spec = getKrakenSpec(config.symbol);

    // Risk-based position sizing: invest only riskPct% of capital per trade.
    // Further scaled down when ATR-based SL is larger than the fixed SL setting
    // so that dollar risk stays constant regardless of volatility.
    const riskFraction = Math.min(100, Math.max(1, config.riskPct ?? 100)) / 100;
    // Cap per-position size at capital / maxPositions so N positions all fit the capital.
    const perPosFraction = Math.min(riskFraction, 1 / maxPos());
    const slForSizing  = Math.max(config.stopLoss, atrPct * 1.5) / 100;  // as decimal
    const baseRisk     = config.capital * perPosFraction;                 // USDT at risk
    // ATR scaling: if actual SL is 2× the configured SL, halve the size
    const atrScale     = slForSizing > 0 ? Math.min(1, (config.stopLoss / 100) / slForSizing) : 1;
    const positionUsdt = baseRisk * atrScale * effLev;
    // Fee buffer: Kraken takes the fee IN THE COIN, so buying exactly spec.min leaves
    // (min − fee) — below the minimum SELL size → unsellable position (AKT lesson).
    // Buy at least min × 1.02 so the post-fee balance still clears the minimum.
    const minBuf = Math.ceil(spec.min * 1.02 * Math.pow(10, spec.dec)) / Math.pow(10, spec.dec);
    const qty = Math.max(parseFloat((positionUsdt / price).toFixed(spec.dec)), minBuf);
    addLog(`📐 Rozmiar: ${(perPosFraction * 100).toFixed(0)}% (×1/${maxPos()}) × ATR-scale ${atrScale.toFixed(2)} = $${positionUsdt.toFixed(2)} → qty=${qty}`);

    // Balance check (skipped in paper mode — virtual balance always sufficient)
    try {
      if (config.paperMode) {
        // virtual balance — no real check
      } else if (config.platform === "kraken") {
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
      const entryTime = new Date().toISOString();
      const entryFiat: KrakenFiat = config.krakenFiat ?? "USD";
      positions.push({
        direction, entryPrice, qty, entryTime, trailRef: entryPrice,
        slPct: effSL, tpPct: effTP, trailPct: effTrail, breakEvenSet: false,
        signal: lastEntrySignal, symbol: config.symbol, leverage: effLev, fiat: entryFiat,
        ctx: { hour: utcHour, human: humanActivity(utcHour), bb: parseFloat(bbPercB.toFixed(1)), regime: marketRegime },
      });
      lastEntryTime = Date.now();
      rememberBuy(config.symbol, { entryPrice, entryTime, qty, slPct: effSL, tpPct: effTP, trailPct: effTrail, leverage: effLev, fiat: entryFiat });
      saveState();
    } catch (e: any) {
      addLog(`🔴 ZLECENIE NIEUDANE: ${e.message}`, "warn");
    }

  } catch (e: any) { addLog(`Tick error: ${e.message}`, "warn"); }
  finally { isTickRunning = false; }
}

// Pre-load Kraken symbols in background so cache is ready when bot starts
loadKrakenSymbols().catch(() => {});

// ── HTTP endpoints ────────────────────────────────────────────────────────────

// All-pairs ticker cache (Kraken returns EVERY pair when no ?pair= given) — 10 min TTL.
// Used to sort the symbol list by price without 650 separate calls.
let _allTickers: { at: number; prices: Record<string, number> } | null = null;
async function loadAllTickers(): Promise<Record<string, number>> {
  if (_allTickers && Date.now() - _allTickers.at < 10 * 60_000) return _allTickers.prices;
  try {
    const r = await fetch("https://api.kraken.com/0/public/Ticker", { signal: AbortSignal.timeout(15000) });
    const d = await r.json() as any;
    const prices: Record<string, number> = {};
    for (const [pair, t] of Object.entries((d.result ?? {}) as Record<string, any>)) {
      const p = parseFloat(t?.c?.[0] ?? "0");
      if (p > 0) prices[pair] = p;
    }
    _allTickers = { at: Date.now(), prices };
    return prices;
  } catch { return _allTickers?.prices ?? {}; }
}

// GET /api/bot/symbols — all Kraken tradeable symbols + price, sorted most-expensive first
router.get("/symbols", async (_req, res) => {
  const [syms, prices] = await Promise.all([loadKrakenSymbols(), loadAllTickers()]);
  const list = syms
    .map(s => ({ symbol: s.symbol, name: s.name, price: prices[s.pairUSD] ?? 0 }))
    .sort((a, b) => b.price - a.price);
  res.json(list);
});

// POST /api/bot/seasonality — analyze repeatability: day-of-week & hour-of-day returns,
// plus trend-run statistics (how long trends persist, how often they flip).
router.post("/seasonality", async (req, res) => {
  try {
    const symbol = (req.body?.symbol as string) || "BTCUSDT";
    const pair = krakenPair(symbol);

    // Daily candles (interval 1440) — ~720 = ~2 years for weekday seasonality + trend runs
    const dSince = Math.floor(Date.now() / 1000) - 720 * 24 * 3600;
    let daily: any[] = (await krakenOhlcFetch(pair, 1440, dSince)) ?? [];
    daily = daily.slice().sort((a, b) => a[0] - b[0]);
    if (daily.length < 30) throw new Error(`Za mało danych dziennych (${daily.length})`);

    // Day-of-week: avg return % and win rate, grouped by UTC weekday
    const dayNames = ["Niedz", "Pon", "Wt", "Śr", "Czw", "Pt", "Sob"];
    const byDay: { day: string; avgRet: number; winRate: number; n: number }[] = [];
    const buckets: Record<number, number[]> = {};
    for (const c of daily) {
      const o = parseFloat(c[1]), cl = parseFloat(c[4]);
      if (o <= 0) continue;
      const ret = (cl - o) / o * 100;
      const d = new Date(c[0] * 1000).getUTCDay();
      (buckets[d] ??= []).push(ret);
    }
    for (let d = 0; d < 7; d++) {
      const arr = buckets[d] ?? [];
      const avg = arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
      const wins = arr.filter(v => v > 0).length;
      byDay.push({ day: dayNames[d], avgRet: parseFloat(avg.toFixed(3)), winRate: arr.length ? Math.round(wins / arr.length * 100) : 0, n: arr.length });
    }

    // Trend runs: consecutive up-days / down-days based on daily close-to-close
    const closes = daily.map(c => parseFloat(c[4]));
    const dirs: number[] = [];
    for (let i = 1; i < closes.length; i++) dirs.push(Math.sign(closes[i] - closes[i - 1]));
    const upRuns: number[] = [], downRuns: number[] = [];
    let run = 0, cur = 0;
    for (const s of dirs) {
      if (s === 0) continue;
      if (s === cur) run++;
      else { if (cur > 0 && run > 0) upRuns.push(run); if (cur < 0 && run > 0) downRuns.push(run); cur = s; run = 1; }
    }
    if (cur > 0 && run > 0) upRuns.push(run); if (cur < 0 && run > 0) downRuns.push(run);
    const avg = (a: number[]) => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
    const flips = upRuns.length + downRuns.length;
    const trend = {
      avgUpDays:   parseFloat(avg(upRuns).toFixed(1)),
      avgDownDays: parseFloat(avg(downRuns).toFixed(1)),
      maxUpDays:   upRuns.length ? Math.max(...upRuns) : 0,
      maxDownDays: downRuns.length ? Math.max(...downRuns) : 0,
      flipsPerMonth: dirs.length ? parseFloat((flips / (dirs.length / 30)).toFixed(1)) : 0,
      currentRun: run, currentDir: cur > 0 ? "up" : cur < 0 ? "down" : "flat",
    };

    // ── Human rhythm: hour-of-day return + VOLUME (= human activity) ───────────
    // People ARE the market — volume peaks when humans are awake & working.
    const hSince = Math.floor(Date.now() / 1000) - 30 * 24 * 3600;
    let hourly: any[] = (await krakenOhlcFetch(pair, 60, hSince)) ?? [];
    const hRet: Record<number, number[]> = {};
    const hVol: Record<number, number[]> = {};
    // Human-activity label per UTC hour (across the 3 big money centers: Asia/EU/US)
    const HUMAN: Record<number, string> = {
      0: "🌏 Azja praca", 1: "🌏 Azja praca", 2: "🌏 Azja praca", 3: "🌏 Azja lunch",
      4: "🌏 Azja praca", 5: "🌏 Azja popoł.", 6: "🌅 EU budzi się", 7: "🇪🇺 EU praca",
      8: "🇪🇺 EU praca", 9: "🇪🇺 EU praca", 10: "🇪🇺 EU praca", 11: "🇪🇺 EU lunch",
      12: "🇪🇺 EU lunch", 13: "🇺🇸🇪🇺 EU+US start", 14: "🇺🇸 US giełda open", 15: "🇺🇸🇪🇺 SZCZYT",
      16: "🇺🇸 US praca", 17: "🇺🇸 US lunch", 18: "🇺🇸 US popoł.", 19: "🇺🇸 US popoł.",
      20: "🇺🇸 US koniec", 21: "🌆 US wieczór", 22: "🌙 świat luzuje", 23: "😴 świat śpi",
    };
    for (const c of hourly) {
      const o = parseFloat(c[1]), cl = parseFloat(c[4]), vol = parseFloat(c[6] ?? "0");
      if (o <= 0) continue;
      const h = new Date(c[0] * 1000).getUTCHours();
      (hRet[h] ??= []).push((cl - o) / o * 100);
      (hVol[h] ??= []).push(vol);
    }
    const avgArr = (a: number[]) => a?.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
    const meanVol = avgArr(Object.values(hVol).flat());
    const byHour = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      avgRet: parseFloat(avgArr(hRet[h]).toFixed(3)),
      volRel: meanVol > 0 ? parseFloat((avgArr(hVol[h]) / meanVol).toFixed(2)) : 0, // 1.0 = średnia
      human: HUMAN[h],
      n: hRet[h]?.length ?? 0,
    }));

    // ── World trading sessions (UTC) — return + activity ───────────────────────
    const sessionStat = (from: number, to: number) => {
      const rets: number[] = [], vols: number[] = [];
      for (let h = from; h < to; h++) { rets.push(...(hRet[h] ?? [])); vols.push(...(hVol[h] ?? [])); }
      return { avgRet: parseFloat(avgArr(rets).toFixed(3)), volRel: meanVol > 0 ? parseFloat((avgArr(vols) / meanVol).toFixed(2)) : 0 };
    };
    const sessions = {
      asia:    { label: "🌏 Azja (00-08)",   ...sessionStat(0, 8) },
      europe:  { label: "🇪🇺 Europa (07-16)", ...sessionStat(7, 16) },
      us:      { label: "🇺🇸 USA (13-22)",    ...sessionStat(13, 22) },
      overlap: { label: "🔥 EU+US szczyt (13-16)", ...sessionStat(13, 16) },
      asleep:  { label: "😴 Świat śpi (22-06)", ...sessionStat(22, 24) },
    };

    // ── Weekday vs weekend (work vs rest) ──────────────────────────────────────
    const wd = byDay.filter(d => !["Sob", "Niedz"].includes(d.day));
    const we = byDay.filter(d => ["Sob", "Niedz"].includes(d.day));
    const workVsRest = {
      workday: parseFloat((avgArr(wd.map(d => d.avgRet))).toFixed(3)),
      weekend: parseFloat((avgArr(we.map(d => d.avgRet))).toFixed(3)),
    };

    res.json({ ok: true, symbol, days: daily.length, byDay, trend, byHour, sessions, workVsRest });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/bot/learning — analyze the learning journal: which conditions have +E.
router.get("/learning", (_req, res) => {
  const FEE = 0.52;
  // Expectancy stats for a set of trade records
  const stat = (recs: LearnRecord[]) => {
    const n = recs.length;
    if (n === 0) return { n: 0, winRate: 0, avgWin: 0, avgLoss: 0, E: 0 };
    const wins = recs.filter(r => r.win), losses = recs.filter(r => !r.win);
    const avgWin  = wins.length   ? wins.reduce((s, r) => s + r.pnlPct, 0) / wins.length : 0;
    const avgLoss = losses.length ? losses.reduce((s, r) => s + r.pnlPct, 0) / losses.length : 0;
    const wr = wins.length / n;
    const E = wr * avgWin + (1 - wr) * avgLoss - FEE; // net expectancy per trade after fees
    return { n, winRate: Math.round(wr * 100), avgWin: parseFloat(avgWin.toFixed(2)), avgLoss: parseFloat(avgLoss.toFixed(2)), E: parseFloat(E.toFixed(2)) };
  };
  const L = learningLog;
  // Human-activity bands
  const humanBand = (w: number) => w >= 0.85 ? "🔥 szczyt" : w >= 0.6 ? "💼 praca" : w >= 0.4 ? "🌆 luz" : "😴 śpi";
  const byHuman: Record<string, LearnRecord[]> = {};
  for (const r of L) (byHuman[humanBand(r.human)] ??= []).push(r);
  // BB%B bands at entry
  const bbBand = (b: number) => b < 0 ? "BB<0 (ekstrem)" : b < 15 ? "BB 0-15" : b < 30 ? "BB 15-30" : b < 40 ? "BB 30-40" : "BB 40+";
  const byBb: Record<string, LearnRecord[]> = {};
  for (const r of L) (byBb[bbBand(r.bb)] ??= []).push(r);
  // By symbol
  const bySym: Record<string, LearnRecord[]> = {};
  for (const r of L) (bySym[r.symbol] ??= []).push(r);

  const paperCount = L.filter(r => r.paper).length;
  res.json({
    ok: true,
    total: L.length,
    paperCount,
    realCount: L.length - paperCount,
    overall: stat(L),
    overallReal: stat(L.filter(r => !r.paper)),
    byHuman: Object.entries(byHuman).map(([k, v]) => ({ key: k, ...stat(v) })).sort((a, b) => b.E - a.E),
    byBb:    Object.entries(byBb).map(([k, v]) => ({ key: k, ...stat(v) })).sort((a, b) => b.E - a.E),
    bySymbol: Object.entries(bySym).map(([k, v]) => ({ key: k.replace("USDT", ""), ...stat(v) })).sort((a, b) => b.n - a.n).slice(0, 8),
    byDir: [
      { key: "LONG", ...stat(L.filter(r => r.dir === "long")) },
      { key: "SHORT", ...stat(L.filter(r => r.dir === "short")) },
    ].filter(x => x.n > 0),
  });
});

// POST /api/bot/clear-position — manually wipe phantom/stuck positions (no order sent).
// Body { symbol } clears just that one; no body clears all.
router.post("/clear-position", (req, res) => {
  if (positions.length === 0) return res.json({ ok: true, message: "Brak pozycji do wyczyszczenia" });
  const sym = req.body?.symbol as string | undefined;
  if (sym) {
    const before = positions.length;
    positions = positions.filter(p => (p.symbol ?? config?.symbol) !== sym);
    forgetBuy(sym);
    saveState();
    const removed = before - positions.length;
    addLog(`🧹 Wyczyszczono ${removed} pozycji ${sym} (bez zlecenia na Krakenie)`, "warn");
    return res.json({ ok: true, message: `Wyczyszczono ${sym}` });
  }
  const count = positions.length;
  for (const p of positions) forgetBuy(p.symbol ?? config?.symbol ?? "");
  positions = [];
  saveState();
  addLog(`🧹 Wyczyszczono wszystkie ${count} pozycji (bez zlecenia na Krakenie)`, "warn");
  res.json({ ok: true, message: `Wyczyszczono ${count} pozycji` });
});

// POST /api/bot/close-margin — close ALL open margin positions on Kraken (orphan shorts).
// Sends real closing orders; needs the API key's "Query Open Positions" permission to see them.
router.post("/close-margin", async (_req, res) => {
  if (!config) {
    const saved = decryptApiKeys();
    if (!saved) return res.status(400).json({ error: "Brak kluczy API" });
    config = { symbol: "BTCUSDT", rsiMin: 40, rsiMax: 70, trailPct: 1.5, stopLoss: 1.5, takeProfit: 3,
      leverage: 1, allowShorts: false, capital: 12, riskPct: 20, adxMin: 18, confluenceMin: 1,
      volMultMin: 0.8, cooldownMin: 20, apiKey: saved.apiKey, secret: saved.secret,
      testnet: saved.testnet, platform: saved.platform ?? "kraken" } as BotConfig;
  }
  const r = await closeOrphanMarginPositions(true); // human pressed the button → memory close allowed
  res.json({ ok: true, ...r });
});

// ── Standalone paper engine endpoints (runs ALONGSIDE the real bot) ───────────

// POST /api/bot/paper/start — start the parallel live simulation (virtual money)
router.post("/paper/start", (req, res) => {
  const b = req.body ?? {};
  paperCfg = {
    symbol: b.symbol || "BTCUSDT",
    symbols: Array.isArray(b.symbols) && b.symbols.length > 0
      ? b.symbols.filter((s: string) => !NON_TRADEABLE_ASSETS.has(String(s).replace(/USDT$/, "").toUpperCase()))
      : undefined,
    rsiMin: b.rsiMin ?? 35, rsiMax: b.rsiMax ?? 70,
    trailPct: b.trailPct ?? 0.6,
    stopLoss: b.stopLoss ?? 1.5, takeProfit: b.takeProfit ?? 3.0,
    leverage: 1, allowShorts: false, // paper = spot longs (mirrors the real strategy under test)
    capital: Math.max(1, Number(b.capital) || 100),
    riskPct: b.riskPct ?? 20,
    adxMin: b.adxMin ?? 15, confluenceMin: b.confluenceMin ?? 2,
    volMultMin: b.volMultMin ?? 1.0, cooldownMin: b.cooldownMin ?? 30,
    maxHoldMin: b.maxHoldMin ?? 0, minVolume: b.minVolume ?? 0,
    maxPositions: Math.max(1, Math.min(5, Number(b.maxPositions) || 5)),
    bbMax: Math.max(10, Math.min(40, Number(b.bbMax) || 40)), // sim-only entry depth (25 = master's deep dips)
    paperMode: true, humanRhythm: b.humanRhythm === true, learnAdapt: b.learnAdapt === true,
    apiKey: "", secret: "", testnet: false, platform: "kraken",
  };
  paperRunning = true;
  paperPositions = [];
  paperPnl = 0; paperWins = 0; paperLosses = 0;
  paperLastEntry = 0; paperScanCursor = 0;
  savePaper();
  addLog(`📝 Symulacja START — kapitał $${paperCfg.capital} (wirtualnie), ${(paperCfg.symbols?.length ?? 0) + 1} monet, max ${paperCfg.maxPositions} pozycji, głębokość BB%B<${paperCfg.bbMax} — działa RÓWNOLEGLE z botem`, "info");
  startPaperIntervals();
  res.json({ ok: true });
});

// POST /api/bot/paper/stop — stop the parallel simulation
router.post("/paper/stop", (_req, res) => {
  stopPaper();
  res.json({ ok: true, pnl: paperPnl, wins: paperWins, losses: paperLosses });
});

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
          confluenceMin, volMultMin, cooldownMin, maxHoldMin, minVolume, maxPositions, paperMode, humanRhythm, learnAdapt } = req.body;

  // If keys not provided, try to load saved encrypted keys.
  // Paper mode needs only PUBLIC data (prices/candles) → runs even without keys.
  if (!apiKey || !secret) {
    const saved = decryptApiKeys();
    if (saved) { apiKey = saved.apiKey; secret = saved.secret; testnet = saved.testnet; platform = platform ?? saved.platform; }
    else if (!paperMode) return res.status(400).json({ error: "Missing exchange keys" });
    else { apiKey = apiKey || ""; secret = secret || ""; platform = platform ?? "kraken"; }
  }

  if (intervalId) { clearInterval(intervalId); intervalId = null; }
  if (priceIntervalId) { clearInterval(priceIntervalId); priceIntervalId = null; }

  config = {
    symbol: symbol || "BTCUSDT",
    // Filter out fiat/stablecoin symbols (EURUSDT, USDCUSDT…) — never trade those
    symbols: Array.isArray(symbols) && symbols.length > 0
      ? symbols.filter((s: string) => !NON_TRADEABLE_ASSETS.has(String(s).replace(/USDT$/, "").toUpperCase()))
      : undefined,
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
    maxHoldMin:    maxHoldMin    ?? 0,   // 0 = domyślne 48h; >0 = limit czasu trzymania (scalping)
    minVolume:     minVolume     ?? 0,   // 0 = filtr płynności wyłączony; >0 = min. obrót 24h
    maxPositions:  Math.max(1, Math.min(5, Number(maxPositions) || 5)), // 1-5 pozycji naraz (domyślnie 5)
    paperMode:     paperMode === true, // symulacja na żywo — wirtualne pieniądze
    humanRhythm:   humanRhythm === true, // patrz na ludzi — handluj gdy aktywni
    learnAdapt:    learnAdapt === true,  // działaj na dzienniku — omijaj przegrywające warunki
    apiKey, secret, testnet: testnet === true,
    platform: platform === "eu" ? "eu" : platform === "kraken" ? "kraken" : "global",
  };

  // Save keys encrypted for auto-resume after restarts (skip if paper mode w/o keys)
  if (apiKey && secret) encryptApiKeys(apiKey, secret, testnet === true, config.platform);

  running = true;
  positions = [];
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
  addLog(`Bot started — ${config.paperMode ? "📝 SYMULACJA NA ŻYWO (wirtualne $)" : platformLabel} ${config.symbol} capital=${config.capital} ${capitalLabel} | TP=${config.takeProfit}% SL=${config.stopLoss}%`, "info");
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
    running,
    position: positions[0] ?? null, // back-compat: first position
    positions,                       // full list (up to maxPositions)
    maxPositions: config?.maxPositions ?? 1,
    paperMode: config?.paperMode ?? false,
    humanRhythm: config?.humanRhythm ?? false,
    learnAdapt: config?.learnAdapt ?? false,
    // Reversal map — honest "when do declines flip to rises" frequencies
    reversal: (() => {
      const m = _reversalMap;
      if (!m) return null;
      const dayNames = ["Niedz", "Pon", "Wt", "Śr", "Czw", "Pt", "Sob"];
      const hours = m.byHour.map((v, h) => v !== null ? { hour: h, pct: Math.round(v * 100) } : null)
        .filter(Boolean).sort((a: any, b: any) => b.pct - a.pct).slice(0, 3);
      const days = m.byDay.map((v, d) => v !== null ? { day: dayNames[d], pct: Math.round(v * 100) } : null)
        .filter(Boolean).sort((a: any, b: any) => b.pct - a.pct).slice(0, 3);
      return { nowPct: reversalNowPct, tilt: reversalTiltNow, avgPct: Math.round(m.avgHour * 100), bestHours: hours, bestDays: days };
    })(),
    // BTC guard — gravity watch (pauses new buys while BTC dumps ≥2%/1h)
    btcGuard: { active: btcGuardActive, chg1h: btcChg1h !== null ? parseFloat(btcChg1h.toFixed(2)) : null },
    // Parallel paper engine (independent from the real bot above)
    paper: {
      running: paperRunning,
      capital: paperCfg?.capital ?? 0,
      pnl: parseFloat(paperPnl.toFixed(2)),
      wins: paperWins,
      losses: paperLosses,
      positions: paperPositions,
      maxPositions: paperCfg?.maxPositions ?? 0,
    },
    sessionPnl,
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

// Pick the candle interval (minutes) that fits a given window into Kraken's ~720-candle
// fetch limit. 5m covers ~2.5 days; 1h covers 30 days.
function intervalForDays(days: number): number {
  if (days <= 4)  return 5;
  if (days <= 10) return 15;
  if (days <= 21) return 30;
  return 60; // 1h → 720 candles ≈ 30 days
}

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
    // Window in days → candle interval. Kraken caps each fetch at ~720 candles, so a
    // longer window needs a coarser interval (30 days only fits at 1h).
    const days = Math.max(1, Math.min(30, Number(req.body?.days) || 3));
    const interval = intervalForDays(days);

    const pair = krakenPair(symbol);

    const since = Math.floor(Date.now() / 1000) - days * 24 * 3600;
    let raw: any[] = (await krakenOhlcFetch(pair, interval, since)) ?? [];
    const seen = new Set<number>();
    raw = raw.filter(c => { if (seen.has(c[0])) return false; seen.add(c[0]); return true; }).sort((a, b) => a[0] - b[0]);
    if (raw.length < 100) throw new Error(`Za mało danych (${raw.length} świec ${interval}m, wymagane 100)`);

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
      filters, baseMin: interval,
      bbMax: Math.max(10, Math.min(40, Number(req.body?.bbMax) || 40)),
    });

    res.json({
      ok: true,
      days: Math.round(raw.length * interval / 60 / 24),
      interval,
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
  volMultMin: number; cooldownMin: number; leverage: number; allowShorts: boolean; days?: number;
}): Promise<{ result: OptCombo; days: number; combosTested: number }> {
  const { symbol, adxMin, confluenceMin, volMultMin, cooldownMin, leverage, allowShorts } = params;
  const days = Math.max(1, Math.min(30, Number(params.days) || 3));
  const interval = intervalForDays(days);
  const pair = krakenPair(symbol);

  const since = Math.floor(Date.now() / 1000) - days * 24 * 3600;
  let raw: any[] = (await krakenOhlcFetch(pair, interval, since)) ?? [];
  const seen = new Set<number>();
  raw = raw.filter(c => { if (seen.has(c[0])) return false; seen.add(c[0]); return true; }).sort((a, b) => a[0] - b[0]);
  if (raw.length < 200) throw new Error(`Za mało danych (${raw.length} świec ${interval}m, wymagane 200) [${pair}]`);

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
    const p = { rsiMin, rsiMax, adxMin, confluenceMin: 1, volMultMin: 1.0, cooldownMin: 30, stopLoss, takeProfit, trailPct, leverage, allowShorts, baseMin: interval };
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
  return { result: best, days: Math.round(raw.length * interval / 60 / 24), combosTested: grid.length };
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
      leverage = 1, allowShorts = false, days = 3,
    } = req.body ?? {};

    const { result, days: actualDays, combosTested } = await runOptimize({
      symbol, adxMin, confluenceMin, volMultMin, cooldownMin, leverage, allowShorts, days,
    });

    res.json({ ok: true, ...result, days: actualDays, combosTested });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Auto-resume bot + paper simulation if they were running before server restart
setTimeout(loadState, 3000);
setTimeout(loadPaper, 4000);

export default router;
