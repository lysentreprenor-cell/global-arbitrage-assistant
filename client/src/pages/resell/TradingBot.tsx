import { useState, useEffect, useCallback, useRef } from "react";
import {
  TrendingUp, TrendingDown, Clock, RefreshCw, Settings,
  ChevronDown, ChevronUp, Play, Pause, AlertCircle, Activity,
  FlaskConical, Radio, Zap, ArrowUpCircle, ArrowDownCircle, BarChart2,
} from "lucide-react";
import { ResellLayout } from "@/components/resell/ResellLayout";

// ─── Types ────────────────────────────────────────────────────────────────────

type Symbol    = "BTCUSDT" | "ETHUSDT" | "SOLUSDT";
type TradeReason = "session_end" | "stop_loss" | "take_profit" | "trail_stop";
type Direction = "long" | "short";

type PaperTrade = {
  id: number; symbol: Symbol; direction: Direction;
  entryTime: string; entryPrice: number; size: number; status: "open" | "closed";
  exitTime?: string; exitPrice?: number; pnl?: number; pnlPct?: number; reason?: TradeReason;
  slPct?: number; tpPct?: number; // actual SL/TP used (may be ATR-based)
  trailRef?: number;              // current trailing high/low for live trade
};

type BotConfig = {
  enabled: boolean; autoMode: boolean; allowShorts: boolean; symbol: Symbol;
  capital: number; riskPct: number; stopLoss: number; takeProfit: number;
  useAdx: boolean; adxMin: number;
  dynamicExits: boolean; atrSlMul: number; atrTpMul: number;
  trailStop: boolean; trailPct: number; trailActivation: number; // trail activates after this % profit
  rsiMin: number; rsiMax: number;
  emaMaxDist: number;
  requirePrevBull: boolean; // 20:00 candle must be bullish before LONG entry
  trades: PaperTrade[];
};

type LogEntry  = { time: string; msg: string; type: "buy" | "sell" | "info" | "warn" };
type Ticker    = { price: number; change24h: number; high24h: number; low24h: number };
type SessionInfo = { inSession: boolean; label: string; countdown: string };
type MarketData  = { rsi: number; ema21: number; priceVsEma: number; momentum: number; volatility: number; atr: number; adx: number; prevBull: boolean };

type BtTrade  = { date: string; direction: Direction; entryPrice: number; exitPrice: number; pnlPct: number; reason: TradeReason };
type BtResult = { symbol: string; days: number; trades: BtTrade[]; winRate: number; totalReturn: number; maxDrawdown: number; avgWin: number; avgLoss: number; sharpe: number; equity: number[]; longs: number; shorts: number };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function calcEMA21(closes: number[]): number {
  if (closes.length < 21) return closes[closes.length - 1] ?? 0;
  const k = 2 / 22;
  let ema = closes.slice(0, 21).reduce((a, b) => a + b, 0) / 21;
  for (let i = 21; i < closes.length; i++) ema = closes[i] * k + ema * (1 - k);
  return ema;
}

function calcRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let g = 0, l = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1]; if (d > 0) g += d; else l -= d;
  }
  const ag = g / period, al = l / period;
  return al === 0 ? 100 : parseFloat((100 - 100 / (1 + ag / al)).toFixed(1));
}

function calcATR(highs: number[], lows: number[], closes: number[], period = 14): number {
  if (highs.length < period + 1) return 0;
  const trs: number[] = [];
  for (let i = 1; i < highs.length; i++)
    trs.push(Math.max(highs[i]-lows[i], Math.abs(highs[i]-closes[i-1]), Math.abs(lows[i]-closes[i-1])));
  let atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trs.length; i++) atr = (atr * (period - 1) + trs[i]) / period;
  return atr;
}

// Wilder's ADX-14 — #1 indicator for BTC trend filtering per BreakoutOS study
function calcADX(highs: number[], lows: number[], closes: number[], period = 14): number {
  if (highs.length < period * 2 + 1) return 0;
  const trs: number[] = [], pdms: number[] = [], mdms: number[] = [];
  for (let i = 1; i < highs.length; i++) {
    const h=highs[i], l=lows[i], ph=highs[i-1], pl=lows[i-1], pc=closes[i-1];
    trs.push(Math.max(h-l, Math.abs(h-pc), Math.abs(l-pc)));
    const up = h-ph, dn = pl-l;
    pdms.push(up > dn && up > 0 ? up : 0);
    mdms.push(dn > up && dn > 0 ? dn : 0);
  }
  let str = trs.slice(0,period).reduce((a,b)=>a+b,0);
  let spdm = pdms.slice(0,period).reduce((a,b)=>a+b,0);
  let smdm = mdms.slice(0,period).reduce((a,b)=>a+b,0);
  const dxs: number[] = [];
  for (let i = period; i < trs.length; i++) {
    str = str-str/period+trs[i]; spdm = spdm-spdm/period+pdms[i]; smdm = smdm-smdm/period+mdms[i];
    const pdi=str>0?spdm/str*100:0, mdi=str>0?smdm/str*100:0;
    dxs.push((pdi+mdi)>0 ? Math.abs(pdi-mdi)/(pdi+mdi)*100 : 0);
  }
  if (dxs.length < period) return 0;
  let adx = dxs.slice(0,period).reduce((a,b)=>a+b,0)/period;
  for (let i = period; i < dxs.length; i++) adx = (adx*(period-1)+dxs[i])/period;
  return parseFloat(adx.toFixed(1));
}

function getSessionInfo(now: Date): SessionInfo {
  const h=now.getUTCHours(), m=now.getUTCMinutes(), s=now.getUTCSeconds();
  const inSession = h===21 || h===22;
  if (inSession) {
    const sl=(23-h)*3600-m*60-s;
    return { inSession:true, label:"SESJA AKTYWNA", countdown:`Koniec za ${Math.floor(sl/3600)>0?Math.floor(sl/3600)+"h ":""}${Math.floor((sl%3600)/60)}m ${sl%60}s` };
  }
  let ts=21*3600-(h*3600+m*60+s); if(ts<0) ts+=86400;
  return { inSession:false, label:"POZA SESJĄ", countdown:`Start za ${Math.floor(ts/3600)}h ${Math.floor((ts%3600)/60)}m` };
}

const fmt    = (p: number) => p>=1000 ? p.toLocaleString("en-US",{maximumFractionDigits:0}) : p>=1 ? p.toFixed(2) : p.toFixed(4);
const fmtPct = (p: number) => (p>=0?"+":"")+p.toFixed(2)+"%";
const fmtUsd = (p: number) => (p>=0?"+":"-")+"$"+Math.abs(p).toFixed(2);
const fmtDate= (iso: string) => new Date(iso).toLocaleDateString("pl",{day:"2-digit",month:"2-digit"});
const fmtTime= (iso: string) => new Date(iso).toLocaleTimeString("pl",{hour:"2-digit",minute:"2-digit"});
const logTime= () => new Date().toLocaleTimeString("pl",{hour:"2-digit",minute:"2-digit",second:"2-digit"});

// ─── Backtest ─────────────────────────────────────────────────────────────────

async function runBacktest(cfg: {
  symbol: Symbol; stopLoss: number; takeProfit: number; allowShorts: boolean;
  useAdx: boolean; adxMin: number; dynamicExits: boolean; atrSlMul: number; atrTpMul: number;
  trailStop: boolean; trailPct: number; trailActivation: number;
  rsiMin: number; rsiMax: number; emaMaxDist: number; requirePrevBull: boolean;
}): Promise<BtResult> {
  const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${cfg.symbol}&interval=1h&limit=1000`);
  if (!res.ok) throw new Error(`Binance ${res.status}`);
  const raw: any[][] = await res.json();
  const candles = raw.map(k => ({
    time:k[0] as number, open:+k[1], high:+k[2], low:+k[3], close:+k[4],
    utcH: new Date(k[0]).getUTCHours(),
  }));

  const trades: BtTrade[] = [];

  for (let i = 30; i < candles.length - 2; i++) {
    const c = candles[i];
    if (c.utcH !== 21) continue;

    const slice = candles.slice(Math.max(0, i-29), i+1);
    const cls = slice.map(x=>x.close), hhs = slice.map(x=>x.high), lls = slice.map(x=>x.low);

    const ema  = calcEMA21(cls);
    const rsi  = calcRSI(cls);
    const adx  = cfg.useAdx ? calcADX(hhs, lls, cls) : 999;
    const atr  = cfg.dynamicExits ? calcATR(hhs, lls, cls) : 0;

    if (cfg.useAdx && adx < cfg.adxMin) continue; // filter: no trend

    // Pre-session candle: 20:00 UTC must be bullish for LONG (bearish for SHORT)
    const prevC = i > 0 ? candles[i-1] : null;
    const prevBull = prevC ? prevC.close > prevC.open : true;
    const prevBear = prevC ? prevC.close < prevC.open : true;

    // Entry: RSI in window + price near EMA + pre-session confirmation
    const emaDist = Math.abs((c.open - ema) / ema * 100);
    const isLong  = c.open > ema && rsi >= cfg.rsiMin && rsi <= cfg.rsiMax && emaDist <= cfg.emaMaxDist
      && (!cfg.requirePrevBull || prevBull);
    // SHORT: require RSI < 40 + bearish pre-session candle
    const isShort = cfg.allowShorts && c.open < ema && rsi < 40 && emaDist <= cfg.emaMaxDist
      && (!cfg.requirePrevBull || prevBear);
    if (!isLong && !isShort) continue;

    const dir: Direction = isLong ? "long" : "short";
    const entry = c.open;

    // Determine SL/TP %
    const slPct = cfg.dynamicExits && atr > 0 ? (atr/entry*100*cfg.atrSlMul) : cfg.stopLoss;
    const tpPct = cfg.dynamicExits && atr > 0 ? (atr/entry*100*cfg.atrTpMul) : cfg.takeProfit;

    let exit = c.close, reason: TradeReason = "session_end";
    let trailRefPrice = entry;
    let trailActivated = false;
    let effectiveSL = dir === "long" ? entry*(1-slPct/100) : entry*(1+slPct/100);

    for (let j = i; j <= i+1 && j < candles.length; j++) {
      const cn = candles[j];
      if (dir === "long") {
        // Activate trail only after trailActivation% profit
        const profitPct = (cn.high - entry) / entry * 100;
        if (cfg.trailStop && profitPct >= cfg.trailActivation) trailActivated = true;
        if (cfg.trailStop && trailActivated && cn.high > trailRefPrice) {
          trailRefPrice = cn.high;
          const trailSL = trailRefPrice * (1 - cfg.trailPct/100);
          if (trailSL > effectiveSL) effectiveSL = trailSL;
        }
        if (cn.low <= effectiveSL) {
          exit = effectiveSL;
          reason = effectiveSL < entry ? "stop_loss" : "trail_stop";
          break;
        }
        if ((cn.high-entry)/entry*100 >= tpPct) { exit=entry*(1+tpPct/100); reason="take_profit"; break; }
      } else {
        const profitPct = (entry - cn.low) / entry * 100;
        if (cfg.trailStop && profitPct >= cfg.trailActivation) trailActivated = true;
        if (cfg.trailStop && trailActivated && cn.low < trailRefPrice) {
          trailRefPrice = cn.low;
          const trailSL = trailRefPrice * (1 + cfg.trailPct/100);
          if (trailSL < effectiveSL) effectiveSL = trailSL;
        }
        if (cn.high >= effectiveSL) {
          exit = effectiveSL;
          reason = effectiveSL > entry ? "stop_loss" : "trail_stop";
          break;
        }
        if ((entry-cn.low)/entry*100 >= tpPct) { exit=entry*(1-tpPct/100); reason="take_profit"; break; }
      }
      exit = cn.close;
    }

    const pnlPct = dir==="long" ? (exit-entry)/entry*100 : (entry-exit)/entry*100;
    trades.push({ date:new Date(c.time).toLocaleDateString("pl",{day:"2-digit",month:"2-digit"}), direction:dir, entryPrice:entry, exitPrice:exit, pnlPct, reason });
  }

  if (!trades.length) return { symbol:cfg.symbol, days:Math.round(candles.length/24), trades:[], winRate:0, totalReturn:0, maxDrawdown:0, avgWin:0, avgLoss:0, sharpe:0, equity:[], longs:0, shorts:0 };

  const wins=trades.filter(t=>t.pnlPct>0), losses=trades.filter(t=>t.pnlPct<=0);
  const winRate = wins.length/trades.length*100;
  const avgWin  = wins.length   ? wins.reduce((s,t)=>s+t.pnlPct,0)/wins.length   : 0;
  const avgLoss = losses.length ? losses.reduce((s,t)=>s+t.pnlPct,0)/losses.length : 0;
  let eq=100, peak=100, maxDD=0;
  const equity: number[] = [];
  for (const t of trades) {
    eq *= (1+t.pnlPct/100); equity.push(parseFloat((eq-100).toFixed(2)));
    if (eq>peak) peak=eq;
    const dd=(peak-eq)/peak*100; if(dd>maxDD) maxDD=dd;
  }
  const rets=trades.map(t=>t.pnlPct), mean=rets.reduce((a,b)=>a+b,0)/rets.length;
  const variance=rets.reduce((s,r)=>s+(r-mean)**2,0)/rets.length;
  const sharpe=variance>0 ? parseFloat((mean/Math.sqrt(variance)*Math.sqrt(252/24)).toFixed(2)) : 0;
  return { symbol:cfg.symbol, days:Math.round(candles.length/24), trades, winRate, totalReturn:eq-100, maxDrawdown:maxDD, avgWin, avgLoss, sharpe, equity, longs:trades.filter(t=>t.direction==="long").length, shorts:trades.filter(t=>t.direction==="short").length };
}

// ─── Storage ──────────────────────────────────────────────────────────────────

const KEY = "resell_trading_bot_v1";
const DEFAULTS: BotConfig = { enabled:false, autoMode:false, allowShorts:false, symbol:"BTCUSDT", capital:1000, riskPct:10, stopLoss:2, takeProfit:3, useAdx:true, adxMin:20, dynamicExits:false, atrSlMul:1.5, atrTpMul:2.0, trailStop:true, trailPct:0.35, trailActivation:0.3, rsiMin:50, rsiMax:65, emaMaxDist:2.0, requirePrevBull:true, trades:[] };

function loadConfig(): BotConfig {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) as BotConfig };
  } catch {}
  return { ...DEFAULTS };
}
function saveConfig(c: BotConfig) { localStorage.setItem(KEY, JSON.stringify(c)); }
const REASON_LABEL: Record<TradeReason,string> = { session_end:"Koniec sesji", stop_loss:"Stop Loss", take_profit:"Take Profit", trail_stop:"Trailing Stop" };

// ─── Component ────────────────────────────────────────────────────────────────

export default function TradingBot() {
  const [config, setConfig] = useState<BotConfig>(loadConfig);
  const [ticker, setTicker]     = useState<Ticker | null>(null);
  const [md, setMd]             = useState<MarketData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [now, setNow]           = useState(new Date());
  const [showSettings, setShowSettings] = useState(false);
  const [lastRefresh, setLastRefresh]   = useState<Date | null>(null);
  const [btResult, setBtResult]   = useState<BtResult | null>(null);
  const [btLoading, setBtLoading] = useState(false);
  const [btError, setBtError]     = useState<string | null>(null);
  const [showBtTrades, setShowBtTrades] = useState(false);
  const [activityLog, setActivityLog]   = useState<LogEntry[]>([]);
  const logRef         = useRef<HTMLDivElement>(null);
  const prevSessionRef = useRef<boolean | null>(null);

  // Settings temp values
  const [tmpCapital,  setTmpCapital]  = useState(String(config.capital));
  const [tmpRisk,     setTmpRisk]     = useState(String(config.riskPct));
  const [tmpSL,       setTmpSL]       = useState(String(config.stopLoss));
  const [tmpTP,       setTmpTP]       = useState(String(config.takeProfit));
  const [tmpAdxMin,   setTmpAdxMin]   = useState(String(config.adxMin));
  const [tmpAtrSl,    setTmpAtrSl]    = useState(String(config.atrSlMul));
  const [tmpAtrTp,    setTmpAtrTp]    = useState(String(config.atrTpMul));
  const [tmpTrailPct,  setTmpTrailPct]  = useState(String(config.trailPct));
  const [tmpTrailAct,  setTmpTrailAct]  = useState(String(config.trailActivation ?? 0.3));
  const [tmpRsiMin,    setTmpRsiMin]    = useState(String(config.rsiMin));
  const [tmpRsiMax,    setTmpRsiMax]    = useState(String(config.rsiMax));
  const [tmpEmaDist,   setTmpEmaDist]   = useState(String(config.emaMaxDist));

  const update = useCallback((patch: Partial<BotConfig>) => {
    setConfig(prev => { const next={...prev,...patch}; saveConfig(next); return next; });
  }, []);

  const addLog = useCallback((msg: string, type: LogEntry["type"]) => {
    setActivityLog(prev => [...prev.slice(-199), { time:logTime(), msg, type }]);
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const [tRes, kRes] = await Promise.all([
        fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${config.symbol}`),
        fetch(`https://api.binance.com/api/v3/klines?symbol=${config.symbol}&interval=1h&limit=60`),
      ]);
      if (!tRes.ok || !kRes.ok) throw new Error(`Binance ${tRes.status}`);
      const td = await tRes.json();
      const klines: any[] = await kRes.json();
      const closes = klines.map(k=>parseFloat(k[4]));
      const opens  = klines.map(k=>parseFloat(k[1]));
      const highs  = klines.map(k=>parseFloat(k[2]));
      const lows   = klines.map(k=>parseFloat(k[3]));
      const last = closes.length-1;
      setTicker({ price:parseFloat(td.lastPrice), change24h:parseFloat(td.priceChangePercent), high24h:parseFloat(td.highPrice), low24h:parseFloat(td.lowPrice) });
      const ema21val = calcEMA21(closes);
      setMd({
        rsi: calcRSI(closes), ema21: ema21val,
        priceVsEma: (closes[last]-ema21val)/ema21val*100,
        momentum: (closes[last]-opens[last])/opens[last]*100,
        volatility: (highs[last]-lows[last])/opens[last]*100,
        atr: calcATR(highs, lows, closes),
        adx: calcADX(highs, lows, closes),
        prevBull: last >= 1 && closes[last-1] > opens[last-1], // 20:00 UTC candle bullish?
      });
      setLastRefresh(new Date()); setError(null);
    } catch(e:any) { setError("Błąd danych: "+e.message); }
    finally { setLoading(false); }
  }, [config.symbol]);

  const runEngine = useCallback(() => {
    if (!ticker || !md || !config.enabled) return;
    const sess = getSessionInfo(new Date());
    const { rsi, ema21, atr, adx } = md;
    const aboveEMA = ticker.price > ema21;
    const openTrade = config.trades.find(t=>t.status==="open");

    if (!openTrade) {
      if (!sess.inSession) return;

      // ADX filter
      if (config.useAdx && adx < config.adxMin) {
        setActivityLog(prev => {
          const msg = `⊘ ADX ${adx} < ${config.adxMin} — rynek bez trendu, pomijam`;
          const e: LogEntry = { time:logTime(), msg, type:"warn" };
          const last = prev[prev.length-1];
          if (last?.msg.startsWith("⊘ ADX")) return [...prev.slice(0,-1), e];
          return [...prev.slice(-199), e];
        });
        return;
      }

      const emaDist = Math.abs((ticker.price - ema21) / ema21 * 100);
      const isLong  = aboveEMA && rsi >= config.rsiMin && rsi <= config.rsiMax && emaDist <= config.emaMaxDist
        && (!config.requirePrevBull || md.prevBull);
      const isShort = config.allowShorts && !aboveEMA && rsi < 40 && emaDist <= config.emaMaxDist
        && (!config.requirePrevBull || !md.prevBull);
      if (!isLong && !isShort) {
        setActivityLog(prev => {
          const reason = rsi > config.rsiMax ? `RSI ${rsi} > ${config.rsiMax} (wykupienie)` : rsi < config.rsiMin ? `RSI ${rsi} < ${config.rsiMin}` : emaDist > config.emaMaxDist ? `EMA dist ${emaDist.toFixed(1)}% > ${config.emaMaxDist}%` : `${aboveEMA?"▲":"▼"} EMA`;
          const msg = `⧖ Skan — $${fmt(ticker.price)} | RSI ${rsi} | ADX ${adx} | ${reason} — brak sygnału`;
          const e: LogEntry = { time:logTime(), msg, type:"info" };
          const last = prev[prev.length-1];
          if (last?.type==="info" && last.msg.startsWith("⧖ Skan")) return [...prev.slice(0,-1), e];
          return [...prev.slice(-199), e];
        });
        return;
      }

      const direction: Direction = isLong ? "long" : "short";
      const size = config.capital * (config.riskPct/100);
      const slPct = config.dynamicExits && atr > 0 ? atr/ticker.price*100*config.atrSlMul : config.stopLoss;
      const tpPct = config.dynamicExits && atr > 0 ? atr/ticker.price*100*config.atrTpMul : config.takeProfit;
      update({ trades:[...config.trades, { id:Date.now(), symbol:config.symbol, direction, entryTime:new Date().toISOString(), entryPrice:ticker.price, size, status:"open", slPct, tpPct, trailRef:ticker.price }] });
      addLog(`▶ ${direction.toUpperCase()} ${config.symbol.replace("USDT","")} @ $${fmt(ticker.price)} | RSI ${rsi} | ADX ${adx}${config.dynamicExits?" | ATR exits":""}${config.trailStop?" | Trail":""}  | SL ${slPct.toFixed(1)}% / TP ${tpPct.toFixed(1)}%`, "buy");
      return;
    }

    const slPct = openTrade.slPct ?? config.stopLoss;
    const tpPct = openTrade.tpPct ?? config.takeProfit;
    const rawPct = (ticker.price-openTrade.entryPrice)/openTrade.entryPrice*100;
    const pct = openTrade.direction==="short" ? -rawPct : rawPct;

    // Update trailing reference
    let updatedTrailRef = openTrade.trailRef ?? openTrade.entryPrice;
    if (config.trailStop) {
      if (openTrade.direction === "long")  updatedTrailRef = Math.max(updatedTrailRef, ticker.price);
      if (openTrade.direction === "short") updatedTrailRef = Math.min(updatedTrailRef, ticker.price);
    }

    // Trail only activates after trailActivation% profit
    const rawGainPct = openTrade.direction === "long"
      ? (updatedTrailRef - openTrade.entryPrice) / openTrade.entryPrice * 100
      : (openTrade.entryPrice - updatedTrailRef) / openTrade.entryPrice * 100;
    const trailActive = config.trailStop && rawGainPct >= (config.trailActivation ?? 0.3);

    const initSLPrice = openTrade.direction === "long"
      ? openTrade.entryPrice * (1 - slPct/100)
      : openTrade.entryPrice * (1 + slPct/100);
    const trailSLPrice = trailActive
      ? (openTrade.direction === "long"
          ? updatedTrailRef * (1 - config.trailPct/100)
          : updatedTrailRef * (1 + config.trailPct/100))
      : initSLPrice;
    const effectiveSLPrice = openTrade.direction === "long"
      ? Math.max(initSLPrice, trailSLPrice)
      : Math.min(initSLPrice, trailSLPrice);

    let reason: TradeReason | null = null;
    if (!sess.inSession) reason = "session_end";
    else if (openTrade.direction === "long"  && ticker.price <= effectiveSLPrice)
      reason = effectiveSLPrice > openTrade.entryPrice ? "trail_stop" : "stop_loss";
    else if (openTrade.direction === "short" && ticker.price >= effectiveSLPrice)
      reason = effectiveSLPrice < openTrade.entryPrice ? "trail_stop" : "stop_loss";
    else if (pct >= tpPct) reason = "take_profit";

    if (updatedTrailRef !== openTrade.trailRef && !reason) {
      // persist updated trail ref
      update({ trades:config.trades.map(t=>t.id===openTrade.id ? {...t, trailRef:updatedTrailRef} : t) });
    }

    if (reason) {
      const pnl = pct/100*openTrade.size;
      update({ trades:config.trades.map(t=>t.id===openTrade.id ? {...t, status:"closed", exitTime:new Date().toISOString(), exitPrice:ticker.price, pnl, pnlPct:pct, reason, trailRef:updatedTrailRef} : t) });
      addLog(`■ CLOSE ${openTrade.direction.toUpperCase()} ${openTrade.symbol.replace("USDT","")} @ $${fmt(ticker.price)} | ${fmtUsd(pnl)} (${fmtPct(pct)}) — ${REASON_LABEL[reason]}`, pnl>=0?"sell":"warn");
    } else {
      setActivityLog(prev => {
        const trailInfo = config.trailStop ? ` | trail SL $${fmt(effectiveSLPrice)}` : "";
        const msg = `◉ Monitoring ${openTrade.direction.toUpperCase()} ${openTrade.symbol.replace("USDT","")} @ $${fmt(ticker.price)} | ${fmtPct(pct)}${trailInfo}`;
        const e: LogEntry = { time:logTime(), msg, type:"info" };
        const last = prev[prev.length-1];
        if (last?.type==="info" && last.msg.startsWith("◉ Monitoring")) return [...prev.slice(0,-1), e];
        return [...prev.slice(-199), e];
      });
    }
  }, [ticker, md, config, update, addLog]);

  useEffect(() => { fetchData(); const id=setInterval(fetchData,30_000); return ()=>clearInterval(id); }, [fetchData]);
  useEffect(() => { const id=setInterval(()=>setNow(new Date()),1000); return ()=>clearInterval(id); }, []);
  useEffect(() => { runEngine(); }, [ticker, md]); // eslint-disable-line

  useEffect(() => {
    if (!config.autoMode) return;
    const s = getSessionInfo(now);
    if (prevSessionRef.current===null) { prevSessionRef.current=s.inSession; return; }
    if (!prevSessionRef.current && s.inSession)  { prevSessionRef.current=true;  update({enabled:true});  addLog("AUTO: Sesja 21:00 UTC — bot uruchomiony ✓","info"); }
    else if (prevSessionRef.current && !s.inSession) { prevSessionRef.current=false; update({enabled:false}); addLog("AUTO: Sesja zakończona 23:00 UTC — bot zatrzymany","warn"); }
  }, [now]); // eslint-disable-line

  useEffect(() => { if (logRef.current) logRef.current.scrollTop=logRef.current.scrollHeight; }, [activityLog]);

  // ─── Derived ───────────────────────────────────────────────────────────────
  const openTrade = config.trades.find(t=>t.status==="open");
  const closed    = config.trades.filter(t=>t.status==="closed");
  const wins      = closed.filter(t=>(t.pnl??0)>0).length;
  const winRate   = closed.length ? Math.round(wins/closed.length*100) : null;
  const totalPnl  = closed.reduce((s,t)=>s+(t.pnl??0),0);
  const totalRet  = (totalPnl/config.capital)*100;
  const bestTrade = closed.length ? Math.max(...closed.map(t=>t.pnlPct??0)) : null;
  const sess      = getSessionInfo(now);

  const G="#4ade80", R="#f87171", M="rgba(255,255,255,0.4)", T="rgba(255,255,255,0.88)";
  const card = { background:"rgba(0,28,14,0.7)", border:"1px solid rgba(34,197,94,0.13)", borderRadius:12, padding:"16px 18px" } as const;
  const inputStyle = (): React.CSSProperties => ({ width:"100%", background:"rgba(0,0,0,0.35)", border:"1px solid rgba(34,197,94,0.2)", borderRadius:8, padding:"8px 12px", color:T, fontSize:14, boxSizing:"border-box", outline:"none" });
  const rsiColor  = (r: number) => r>=70?R:r>=50?G:r>=30?"#f59e0b":R;
  const adxColor  = (a: number) => a>=40?"#fbbf24":a>=25?G:M;
  const adxLabel  = (a: number) => a>=40?"Silny trend":a>=25?"Trend OK":a>=15?"Słaby trend":"Brak trendu";

  // Signal decision
  const emaDist_ = md && ticker ? Math.abs((ticker.price - md.ema21) / md.ema21 * 100) : 0;
  const longSig  = md && ticker ? ticker.price > md.ema21 && md.rsi >= config.rsiMin && md.rsi <= config.rsiMax && emaDist_ <= config.emaMaxDist && (!config.useAdx || md.adx >= config.adxMin) && (!config.requirePrevBull || md.prevBull) : false;
  const shortSig = md && ticker ? ticker.price < md.ema21 && md.rsi < 40 && emaDist_ <= config.emaMaxDist && (!config.useAdx || md.adx >= config.adxMin) && (!config.requirePrevBull || !md.prevBull) : false;
  const adxBlock = md ? config.useAdx && md.adx < config.adxMin : false;
  const prevBullBlock = md ? config.requirePrevBull && !md.prevBull && ticker ? ticker.price > md.ema21 : false : false;

  return (
    <ResellLayout>
      <div style={{ maxWidth:980, margin:"0 auto", padding:"20px 16px", color:T, fontFamily:"system-ui, sans-serif" }}>

        {/* Header */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ width:42, height:42, borderRadius:12, background:"linear-gradient(135deg,#16a34a,#4ade80)", display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 4px 18px rgba(74,222,128,0.3)" }}>
              <Activity size={20} color="#fff" />
            </div>
            <div>
              <div style={{ fontWeight:800, fontSize:20 }}>Trading Bot</div>
              <div style={{ fontSize:12, color:M }}>📄 Paper mode · RSI+EMA{config.useAdx?" + ADX":""}{config.dynamicExits?" + ATR":""}{config.trailStop?" + Trail":""} · Long{config.allowShorts?"+Short":""}</div>
            </div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            {lastRefresh && <span style={{ fontSize:11, color:M }}>Dane: {fmtTime(lastRefresh.toISOString())}</span>}
            <button onClick={fetchData} style={{ background:"rgba(34,197,94,0.1)", border:"1px solid rgba(34,197,94,0.25)", borderRadius:8, padding:"6px 14px", color:G, cursor:"pointer", fontSize:12, display:"flex", alignItems:"center", gap:5 }}>
              <RefreshCw size={12}/> Odśwież
            </button>
          </div>
        </div>

        {/* Controls */}
        <div style={{ ...card, display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14, flexWrap:"wrap", gap:10 }}>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            {(["BTCUSDT","ETHUSDT","SOLUSDT"] as const).map(sym => {
              const active=config.symbol===sym;
              return <button key={sym} onClick={()=>update({symbol:sym})} style={{ background:active?"rgba(34,197,94,0.18)":"transparent", border:`1px solid ${active?"rgba(34,197,94,0.45)":"rgba(255,255,255,0.1)"}`, borderRadius:8, padding:"8px 18px", color:active?G:M, cursor:"pointer", fontWeight:active?700:500, fontSize:14 }}>{sym.replace("USDT","")}</button>;
            })}
            <button onClick={()=>{update({allowShorts:!config.allowShorts}); addLog(!config.allowShorts?"Tryb: LONG + SHORT":"Tryb: tylko LONG","info");}}
              style={{ background:config.allowShorts?"rgba(248,113,113,0.12)":"rgba(255,255,255,0.04)", border:`1px solid ${config.allowShorts?"rgba(248,113,113,0.4)":"rgba(255,255,255,0.1)"}`, borderRadius:8, padding:"8px 16px", color:config.allowShorts?"#fca5a5":M, cursor:"pointer", fontWeight:700, fontSize:13, display:"flex", alignItems:"center", gap:6 }}>
              {config.allowShorts ? <><ArrowDownCircle size={13}/> L+S</> : <><ArrowUpCircle size={13}/> LONG</>}
            </button>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <button onClick={()=>{const n=!config.autoMode; update({autoMode:n}); prevSessionRef.current=null; addLog(n?"AUTO MODE włączony":"AUTO MODE wyłączony",n?"info":"warn");}}
              style={{ display:"flex", alignItems:"center", gap:7, background:config.autoMode?"rgba(245,158,11,0.15)":"rgba(255,255,255,0.04)", border:`1px solid ${config.autoMode?"rgba(245,158,11,0.45)":"rgba(255,255,255,0.12)"}`, borderRadius:8, padding:"9px 16px", color:config.autoMode?"#fbbf24":M, cursor:"pointer", fontWeight:700, fontSize:13 }}>
              <Zap size={13}/> AUTO {config.autoMode?"ON":"OFF"}
            </button>
            {config.enabled && sess.inSession && (
              <span style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, color:G, background:"rgba(34,197,94,0.1)", border:"1px solid rgba(34,197,94,0.3)", borderRadius:20, padding:"4px 10px", fontWeight:700 }}>
                <span style={{ width:7, height:7, borderRadius:"50%", background:G, animation:"pulse 1.5s ease-in-out infinite", display:"inline-block" }}/> LIVE
              </span>
            )}
            <button onClick={()=>update({enabled:!config.enabled})} style={{ display:"flex", alignItems:"center", gap:8, background:config.enabled?"rgba(34,197,94,0.18)":"rgba(255,255,255,0.04)", border:`1px solid ${config.enabled?"rgba(34,197,94,0.4)":"rgba(255,255,255,0.12)"}`, borderRadius:8, padding:"9px 20px", color:config.enabled?G:M, cursor:"pointer", fontWeight:700, fontSize:14 }}>
              {config.enabled ? <><Play size={14}/> AKTYWNY</> : <><Pause size={14}/> ZATRZYMANY</>}
            </button>
          </div>
        </div>

        {error && <div style={{ ...card, border:"1px solid rgba(248,113,113,0.3)", background:"rgba(248,113,113,0.06)", color:R, marginBottom:14, display:"flex", alignItems:"center", gap:8, fontSize:14 }}><AlertCircle size={15}/> {error}</div>}

        {/* 4 info cards */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:14 }}>

          {/* Price */}
          <div style={card}>
            <div style={{ fontSize:10, color:M, letterSpacing:1, marginBottom:8 }}>CENA</div>
            {loading ? <div style={{color:M}}>Ładowanie…</div> : ticker ? (
              <>
                <div style={{ fontSize:22, fontWeight:800, marginBottom:4 }}>${fmt(ticker.price)}</div>
                <div style={{ fontSize:13, fontWeight:700, color:ticker.change24h>=0?G:R }}>{fmtPct(ticker.change24h)} 24h</div>
                <div style={{ fontSize:11, color:M, marginTop:6 }}>H ${fmt(ticker.high24h)} · L ${fmt(ticker.low24h)}</div>
              </>
            ) : null}
          </div>

          {/* RSI */}
          <div style={card}>
            <div style={{ fontSize:10, color:M, letterSpacing:1, marginBottom:8 }}>RSI-14</div>
            {md ? (
              <>
                <div style={{ fontSize:28, fontWeight:900, color:rsiColor(md.rsi), marginBottom:6 }}>{md.rsi}</div>
                <div style={{ height:5, background:"rgba(255,255,255,0.08)", borderRadius:3, marginBottom:5 }}>
                  <div style={{ width:`${md.rsi}%`, height:"100%", background:rsiColor(md.rsi), borderRadius:3, transition:"width 0.5s" }}/>
                </div>
                <div style={{ fontSize:11, color:rsiColor(md.rsi), fontWeight:600 }}>{md.rsi>=70?"Wykupienie":md.rsi>=55?"Byczek ▲":md.rsi>=45?"Neutralny":md.rsi>=30?"Niedźwiedź ▼":"Wyprzedanie"}</div>
              </>
            ) : <div style={{color:M}}>Ładowanie…</div>}
          </div>

          {/* ADX */}
          <div style={{ ...card, border:`1px solid ${config.useAdx?"rgba(251,191,36,0.3)":"rgba(34,197,94,0.13)"}`, background:config.useAdx?"rgba(251,191,36,0.04)":"rgba(0,28,14,0.7)" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
              <div style={{ fontSize:10, color:M, letterSpacing:1 }}>ADX-14</div>
              <button onClick={()=>{update({useAdx:!config.useAdx}); addLog(!config.useAdx?"Filtr ADX włączony — tylko silne trendy":"Filtr ADX wyłączony","info");}}
                style={{ fontSize:9, fontWeight:700, background:config.useAdx?"rgba(251,191,36,0.15)":"rgba(255,255,255,0.06)", border:`1px solid ${config.useAdx?"rgba(251,191,36,0.4)":"rgba(255,255,255,0.15)"}`, borderRadius:4, padding:"2px 6px", color:config.useAdx?"#fbbf24":M, cursor:"pointer" }}>
                {config.useAdx?"ON":"OFF"}
              </button>
            </div>
            {md ? (
              <>
                <div style={{ fontSize:28, fontWeight:900, color:adxColor(md.adx), marginBottom:6 }}>{md.adx}</div>
                <div style={{ height:5, background:"rgba(255,255,255,0.08)", borderRadius:3, marginBottom:5 }}>
                  <div style={{ width:`${Math.min(100,md.adx*2)}%`, height:"100%", background:adxColor(md.adx), borderRadius:3, transition:"width 0.5s" }}/>
                </div>
                <div style={{ fontSize:11, color:adxColor(md.adx), fontWeight:600 }}>{adxLabel(md.adx)}{config.useAdx && md.adx < config.adxMin ? <span style={{color:R}}> — blokuje</span> : ""}</div>
              </>
            ) : <div style={{color:M}}>Ładowanie…</div>}
          </div>

          {/* Session / Signal */}
          <div style={{ ...card, background:sess.inSession?"rgba(34,197,94,0.07)":"rgba(0,28,14,0.7)", border:`1px solid ${sess.inSession?"rgba(34,197,94,0.35)":"rgba(34,197,94,0.13)"}` }}>
            <div style={{ fontSize:10, color:M, letterSpacing:1, marginBottom:8 }}>SESJA + SYGNAŁ</div>
            <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:6 }}>
              <div style={{ width:8, height:8, borderRadius:"50%", background:sess.inSession?G:"#4b5563", flexShrink:0 }}/>
              <span style={{ fontSize:11, color:sess.inSession?G:M, fontWeight:700 }}>{sess.label}</span>
            </div>
            <div style={{ fontSize:14, fontWeight:700, marginBottom:6 }}>{sess.countdown}</div>
            {md && ticker && (
              <>
                <div style={{ fontSize:13, fontWeight:900, color:longSig?G:shortSig?R:adxBlock?"#f59e0b":M }}>
                  {longSig?"LONG ▲":shortSig?"SHORT ▼":adxBlock?"ADX BLOK":"NEUTRAL"}
                </div>
                {config.requirePrevBull && <div style={{ fontSize:10, color:md.prevBull?"#86efac":"#fca5a5", marginTop:3 }}>{md.prevBull?"✓ 20:00 świeca bycza":"✗ 20:00 świeca niedźwiedzia"}</div>}
              </>
            )}
          </div>
        </div>

        {/* Live Market Scan */}
        {md && ticker && (
          <div style={{ ...card, marginBottom:14 }}>
            <div style={{ fontSize:10, color:M, letterSpacing:1, marginBottom:12 }}>LIVE MARKET SCAN — {config.symbol.replace("USDT","")} / USDT</div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(6,1fr)", gap:8 }}>
              {([
                { label:"RSI-14",      value:md.rsi.toFixed(1),                               bar:md.rsi/100,                        color:rsiColor(md.rsi),                  sub:md.rsi>=70?"Wykup.":md.rsi<30?"Wyprz.":"neutral" },
                { label:"ADX-14",      value:md.adx.toFixed(1),                               bar:Math.min(1,md.adx/50),             color:adxColor(md.adx),                  sub:adxLabel(md.adx) },
                { label:"ATR",         value:"$"+fmt(md.atr),                                  bar:Math.min(1,md.atr/ticker.price*30), color:"#a78bfa",                         sub:`${(md.atr/ticker.price*100).toFixed(2)}% ceny` },
                { label:"EMA dist.",   value:fmtPct(md.priceVsEma),                            bar:Math.min(1,Math.abs(md.priceVsEma)/3), color:md.priceVsEma>=0?G:R,          sub:md.priceVsEma>=0?"Powyżej":"Poniżej" },
                { label:"Momentum",    value:(md.momentum>=0?"+":"")+md.momentum.toFixed(2)+"%", bar:Math.min(1,Math.abs(md.momentum)/2), color:md.momentum>=0?G:R,            sub:"ostatnia świeca" },
                { label:"Trend 24h",   value:fmtPct(ticker.change24h),                         bar:Math.min(1,Math.abs(ticker.change24h)/5), color:ticker.change24h>=0?G:R,    sub:ticker.change24h>=0?"Wzrost":"Spadek" },
              ] as {label:string;value:string;bar:number;color:string;sub:string}[]).map(({label,value,bar,color,sub})=>(
                <div key={label} style={{ background:"rgba(0,0,0,0.2)", borderRadius:8, padding:"8px 10px" }}>
                  <div style={{ fontSize:9, color:M, letterSpacing:0.8, marginBottom:3 }}>{label.toUpperCase()}</div>
                  <div style={{ fontSize:14, fontWeight:800, color, marginBottom:4 }}>{value}</div>
                  <div style={{ height:3, background:"rgba(255,255,255,0.07)", borderRadius:2, marginBottom:3 }}>
                    <div style={{ width:`${bar*100}%`, height:"100%", background:color, borderRadius:2, opacity:0.8 }}/>
                  </div>
                  <div style={{ fontSize:9, color:M }}>{sub}</div>
                </div>
              ))}
            </div>
            {config.dynamicExits && md && <div style={{ marginTop:10, fontSize:11, color:"#a78bfa", background:"rgba(167,139,250,0.06)", borderRadius:6, padding:"6px 10px" }}>ATR exits aktywne — SL: ~${fmt(md.atr*config.atrSlMul)} ({(md.atr/ticker.price*100*config.atrSlMul).toFixed(1)}%) · TP: ~${fmt(md.atr*config.atrTpMul)} ({(md.atr/ticker.price*100*config.atrTpMul).toFixed(1)}%)</div>}
          </div>
        )}

        {/* Open position */}
        <div style={{ ...card, marginBottom:14 }}>
          <div style={{ fontSize:10, color:M, letterSpacing:1, marginBottom:10 }}>OTWARTA POZYCJA (PAPER)</div>
          {openTrade && ticker ? (() => {
            const slPct = openTrade.slPct ?? config.stopLoss;
            const tpPct = openTrade.tpPct ?? config.takeProfit;
            const rawPct=(ticker.price-openTrade.entryPrice)/openTrade.entryPrice*100;
            const pct = openTrade.direction==="short" ? -rawPct : rawPct;
            const pnl = pct/100*openTrade.size;
            return (
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                <div>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:5 }}>
                    <span style={{ fontWeight:800, fontSize:17 }}>{openTrade.symbol.replace("USDT","")}</span>
                    <span style={{ fontSize:11, fontWeight:700, background:openTrade.direction==="short"?"rgba(248,113,113,0.15)":"rgba(74,222,128,0.15)", color:openTrade.direction==="short"?R:G, borderRadius:6, padding:"2px 8px" }}>{openTrade.direction.toUpperCase()}</span>
                  </div>
                  <div style={{ fontSize:12, color:M }}>Wejście: <span style={{color:T}}>${fmt(openTrade.entryPrice)}</span> · Rozmiar: <span style={{color:T}}>${openTrade.size.toFixed(0)}</span> · Od: <span style={{color:T}}>{fmtTime(openTrade.entryTime)}</span></div>
                  <div style={{ fontSize:11, color:M, marginTop:4 }}>SL −{slPct.toFixed(1)}% · TP +{tpPct.toFixed(1)}%{openTrade.slPct ? " (ATR)" : ""}</div>
                </div>
                <div style={{ textAlign:"right" }}>
                  <div style={{ fontSize:26, fontWeight:900, color:pnl>=0?G:R }}>{fmtUsd(pnl)}</div>
                  <div style={{ fontSize:14, fontWeight:700, color:pct>=0?G:R }}>{fmtPct(pct)}</div>
                  <div style={{ fontSize:11, color:M, marginTop:3 }}>Live PnL</div>
                </div>
              </div>
            );
          })() : (
            <div style={{ color:M, fontSize:14 }}>{!config.enabled?"Bot zatrzymany":sess.inSession?"Sesja aktywna — skanowanie sygnałów…":"Bot czeka na okno 21:00–23:00 UTC"}</div>
          )}
        </div>

        {/* Stats */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:10, marginBottom:14 }}>
          {([
            { label:"WIN RATE",    value:winRate!==null?`${winRate}%`:"—",      sub:`${wins}/${closed.length}`,               color:winRate!==null?(winRate>=55?G:winRate>=40?"#f59e0b":R):M },
            { label:"TRANSAKCJE", value:String(closed.length),                 sub:openTrade?"+1 otwarta":"zakończone" },
            { label:"TOTAL PnL",  value:closed.length?fmtUsd(totalPnl):"—",    sub:closed.length?fmtPct(totalRet):"—",        color:totalPnl>=0?G:R },
            { label:"NAJLEPSZY",  value:bestTrade!==null?fmtPct(bestTrade):"—", sub:"pojedyncza",                              color:G },
            { label:"KAPITAŁ",    value:`$${config.capital.toLocaleString()}`,  sub:"paper USD" },
          ] as {label:string;value:string;sub?:string;color?:string}[]).map(({label,value,sub,color})=>(
            <div key={label} style={{ ...card, textAlign:"center" as const }}>
              <div style={{ fontSize:9, color:M, letterSpacing:0.8, marginBottom:5 }}>{label}</div>
              <div style={{ fontSize:20, fontWeight:800, color:color??T }}>{value}</div>
              {sub && <div style={{ fontSize:10, color:M, marginTop:4 }}>{sub}</div>}
            </div>
          ))}
        </div>

        {/* Settings */}
        <div style={{ ...card, marginBottom:14 }}>
          <button onClick={()=>setShowSettings(s=>!s)} style={{ width:"100%", background:"none", border:"none", color:T, display:"flex", alignItems:"center", justifyContent:"space-between", cursor:"pointer", padding:0, fontSize:14, fontWeight:700 }}>
            <span style={{ display:"flex", alignItems:"center", gap:8 }}><Settings size={14}/> Konfiguracja strategii</span>
            {showSettings ? <ChevronUp size={15} color={M}/> : <ChevronDown size={15} color={M}/>}
          </button>
          {showSettings && (
            <div style={{ marginTop:18 }}>
              {/* Base params */}
              <div style={{ fontSize:11, color:M, marginBottom:8, fontWeight:700 }}>PARAMETRY BAZOWE</div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:12, marginBottom:18 }}>
                {([
                  { label:"Kapitał ($)",    tmp:tmpCapital, set:setTmpCapital, key:"capital"    as const, min:100,   max:100_000 },
                  { label:"Ryzyko (%)",     tmp:tmpRisk,    set:setTmpRisk,    key:"riskPct"    as const, min:1,     max:50 },
                  { label:"Stop Loss (%)",  tmp:tmpSL,      set:setTmpSL,      key:"stopLoss"   as const, min:1,     max:20 },
                  { label:"Take Profit (%)",tmp:tmpTP,      set:setTmpTP,      key:"takeProfit" as const, min:2,     max:100 },
                ] as const).map(({label,tmp,set,key,min,max})=>(
                  <div key={key}>
                    <div style={{ fontSize:11, color:M, marginBottom:5 }}>{label} {config.dynamicExits && (key==="stopLoss"||key==="takeProfit") ? <span style={{color:"#a78bfa"}}>(ignorowane — ATR aktywny)</span> : ""}</div>
                    <input type="number" value={tmp} min={min} max={max} onChange={e=>set(e.target.value)}
                      onBlur={()=>{const n=parseFloat(tmp); if(!isNaN(n)&&n>=min&&n<=max) update({[key]:n} as Partial<BotConfig>);}} style={inputStyle()}/>
                  </div>
                ))}
              </div>

              {/* Trailing Stop */}
              <div style={{ background:"rgba(34,197,94,0.05)", border:"1px solid rgba(34,197,94,0.2)", borderRadius:10, padding:"14px 16px", marginBottom:14 }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:700, color:G }}>Trailing Stop <span style={{ fontSize:10, color:M, fontWeight:400 }}>(blokuje zyski — fix R:R)</span></div>
                    <div style={{ fontSize:11, color:M, marginTop:2 }}>SL podąża za ceną — nie traci wypracowanego zysku gdy rynek zawróci</div>
                  </div>
                  <button onClick={()=>{update({trailStop:!config.trailStop}); addLog(config.trailStop?"Trailing stop wyłączony":"Trailing stop włączony — blokowanie zysków aktywne","info");}}
                    style={{ background:config.trailStop?"rgba(34,197,94,0.2)":"rgba(255,255,255,0.06)", border:`1px solid ${config.trailStop?"rgba(34,197,94,0.5)":"rgba(255,255,255,0.2)"}`, borderRadius:8, padding:"8px 16px", color:config.trailStop?G:M, cursor:"pointer", fontWeight:700, fontSize:13, flexShrink:0 }}>
                    {config.trailStop?"TRAIL ON":"TRAIL OFF"}
                  </button>
                </div>
                {config.trailStop && (
                  <div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:6 }}>
                      <div>
                        <div style={{ fontSize:11, color:M, marginBottom:5 }}>Aktywacja traila po +% zysku (def: 0.3)</div>
                        <input type="number" value={tmpTrailAct} step={0.1} min={0} max={2} onChange={e=>setTmpTrailAct(e.target.value)}
                          onBlur={()=>{const n=parseFloat(tmpTrailAct); if(!isNaN(n)&&n>=0&&n<=2) update({trailActivation:n});}} style={inputStyle()}/>
                      </div>
                      <div>
                        <div style={{ fontSize:11, color:M, marginBottom:5 }}>Odległość traila od piku (def: 0.35)</div>
                        <input type="number" value={tmpTrailPct} step={0.05} min={0.1} max={2} onChange={e=>setTmpTrailPct(e.target.value)}
                          onBlur={()=>{const n=parseFloat(tmpTrailPct); if(!isNaN(n)&&n>=0.1&&n<=2) update({trailPct:n});}} style={inputStyle()}/>
                      </div>
                    </div>
                    <div style={{ fontSize:10, color:M }}>Trail włącza się gdy zysk ≥ aktywacja, potem SL goni szczyt z odległością traila</div>
                  </div>
                )}
              </div>

              {/* RSI + EMA filter */}
              <div style={{ background:"rgba(96,165,250,0.05)", border:"1px solid rgba(96,165,250,0.2)", borderRadius:10, padding:"14px 16px", marginBottom:14 }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:700, color:"#60a5fa" }}>Filtr wejścia RSI + EMA + świeca 20:00 <span style={{ fontSize:10, color:M, fontWeight:400 }}>(jakość sygnału)</span></div>
                    <div style={{ fontSize:11, color:M, marginTop:2 }}>Świeca przed sesją musi być zielona dla LONG — potwierdza momentum</div>
                  </div>
                  <button onClick={()=>{update({requirePrevBull:!config.requirePrevBull}); addLog(config.requirePrevBull?"Filtr świecy 20:00 wyłączony":"Filtr świecy 20:00 włączony — potwierdzenie przed sesją","info");}}
                    style={{ background:config.requirePrevBull?"rgba(96,165,250,0.2)":"rgba(255,255,255,0.06)", border:`1px solid ${config.requirePrevBull?"rgba(96,165,250,0.5)":"rgba(255,255,255,0.2)"}`, borderRadius:8, padding:"7px 14px", color:config.requirePrevBull?"#60a5fa":M, cursor:"pointer", fontWeight:700, fontSize:12, flexShrink:0 }}>
                    {config.requirePrevBull?"CANDLE ON":"CANDLE OFF"}
                  </button>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginTop:10 }}>
                  <div>
                    <div style={{ fontSize:11, color:M, marginBottom:5 }}>RSI min (def: 50)</div>
                    <input type="number" value={tmpRsiMin} min={30} max={55} onChange={e=>setTmpRsiMin(e.target.value)}
                      onBlur={()=>{const n=parseFloat(tmpRsiMin); if(!isNaN(n)&&n>=30&&n<=55) update({rsiMin:n});}} style={inputStyle()}/>
                  </div>
                  <div>
                    <div style={{ fontSize:11, color:M, marginBottom:5 }}>RSI max (def: 65)</div>
                    <input type="number" value={tmpRsiMax} min={55} max={80} onChange={e=>setTmpRsiMax(e.target.value)}
                      onBlur={()=>{const n=parseFloat(tmpRsiMax); if(!isNaN(n)&&n>=55&&n<=80) update({rsiMax:n});}} style={inputStyle()}/>
                  </div>
                  <div>
                    <div style={{ fontSize:11, color:M, marginBottom:5 }}>Max dist EMA % (def: 2.0)</div>
                    <input type="number" value={tmpEmaDist} step={0.5} min={0.5} max={5} onChange={e=>setTmpEmaDist(e.target.value)}
                      onBlur={()=>{const n=parseFloat(tmpEmaDist); if(!isNaN(n)&&n>=0.5&&n<=5) update({emaMaxDist:n});}} style={inputStyle()}/>
                  </div>
                </div>
              </div>

              {/* ADX filter */}
              <div style={{ background:"rgba(251,191,36,0.05)", border:"1px solid rgba(251,191,36,0.2)", borderRadius:10, padding:"14px 16px", marginBottom:14 }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:700, color:"#fbbf24" }}>Filtr ADX-14 <span style={{ fontSize:10, color:M, fontWeight:400 }}>(#1 wskaźnik dla BTC wg badań BreakoutOS)</span></div>
                    <div style={{ fontSize:11, color:M, marginTop:2 }}>Blokuje wejście gdy rynek chodzi bokiem — tylko silne trendy</div>
                  </div>
                  <button onClick={()=>{update({useAdx:!config.useAdx}); addLog(config.useAdx?"Filtr ADX wyłączony":"Filtr ADX włączony — tylko ADX ≥ "+config.adxMin,"info");}}
                    style={{ background:config.useAdx?"rgba(251,191,36,0.2)":"rgba(255,255,255,0.06)", border:`1px solid ${config.useAdx?"rgba(251,191,36,0.5)":"rgba(255,255,255,0.2)"}`, borderRadius:8, padding:"8px 16px", color:config.useAdx?"#fbbf24":M, cursor:"pointer", fontWeight:700, fontSize:13, flexShrink:0 }}>
                    {config.useAdx?"ADX ON":"ADX OFF"}
                  </button>
                </div>
                {config.useAdx && (
                  <div>
                    <div style={{ fontSize:11, color:M, marginBottom:5 }}>Minimalne ADX (rekomendowane: 25-30 dla BTC)</div>
                    <input type="number" value={tmpAdxMin} min={15} max={60} onChange={e=>setTmpAdxMin(e.target.value)}
                      onBlur={()=>{const n=parseFloat(tmpAdxMin); if(!isNaN(n)&&n>=15&&n<=60) update({adxMin:n});}} style={{...inputStyle(),width:"50%"}}/>
                  </div>
                )}
              </div>

              {/* Dynamic ATR exits */}
              <div style={{ background:"rgba(167,139,250,0.05)", border:"1px solid rgba(167,139,250,0.2)", borderRadius:10, padding:"14px 16px", marginBottom:14 }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:700, color:"#a78bfa" }}>Dynamiczne zlecenia ATR <span style={{ fontSize:10, color:M, fontWeight:400 }}>(PF +26-48% vs stały TP)</span></div>
                    <div style={{ fontSize:11, color:M, marginTop:2 }}>SL i TP dopasowane do aktualnej zmienności — TP 15% prawie nigdy nie odpala w 2h oknie</div>
                  </div>
                  <button onClick={()=>{update({dynamicExits:!config.dynamicExits}); addLog(config.dynamicExits?"ATR exits wyłączone — stałe SL/TP":"ATR exits włączone — dynamiczne SL/TP","info");}}
                    style={{ background:config.dynamicExits?"rgba(167,139,250,0.2)":"rgba(255,255,255,0.06)", border:`1px solid ${config.dynamicExits?"rgba(167,139,250,0.5)":"rgba(255,255,255,0.2)"}`, borderRadius:8, padding:"8px 16px", color:config.dynamicExits?"#a78bfa":M, cursor:"pointer", fontWeight:700, fontSize:13, flexShrink:0 }}>
                    {config.dynamicExits?"ATR ON":"ATR OFF"}
                  </button>
                </div>
                {config.dynamicExits && (
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                    <div>
                      <div style={{ fontSize:11, color:M, marginBottom:5 }}>Mnożnik SL (rekomend.: 1.5)</div>
                      <input type="number" value={tmpAtrSl} step={0.1} min={0.5} max={4} onChange={e=>setTmpAtrSl(e.target.value)}
                        onBlur={()=>{const n=parseFloat(tmpAtrSl); if(!isNaN(n)&&n>=0.5&&n<=4) update({atrSlMul:n});}} style={inputStyle()}/>
                    </div>
                    <div>
                      <div style={{ fontSize:11, color:M, marginBottom:5 }}>Mnożnik TP (rekomend.: 2.0)</div>
                      <input type="number" value={tmpAtrTp} step={0.1} min={1} max={6} onChange={e=>setTmpAtrTp(e.target.value)}
                        onBlur={()=>{const n=parseFloat(tmpAtrTp); if(!isNaN(n)&&n>=1&&n<=6) update({atrTpMul:n});}} style={inputStyle()}/>
                    </div>
                  </div>
                )}
              </div>

              <div style={{ background:"rgba(34,197,94,0.05)", border:"1px solid rgba(34,197,94,0.15)", borderRadius:8, padding:"10px 14px", fontSize:11, color:M, lineHeight:1.7, marginBottom:14 }}>
                <strong style={{color:G}}>Aktywna konfiguracja:</strong> LONG gdy cena &gt; EMA±{config.emaMaxDist}% AND RSI [{config.rsiMin}-{config.rsiMax}]{config.useAdx ? ` AND ADX ≥ ${config.adxMin}` : ""}
                {config.allowShorts ? ` · SHORT gdy cena < EMA AND RSI < 40${config.useAdx?` AND ADX ≥ ${config.adxMin}`:""}` : ""}
                {` · Wyjście: ${config.dynamicExits?`ATR×${config.atrSlMul}SL / ATR×${config.atrTpMul}TP`:`SL ${config.stopLoss}% / TP ${config.takeProfit}%`}${config.trailStop?` + Trail ${config.trailPct}%`:""} + koniec sesji`}
              </div>

              {closed.length > 0 && (
                <button onClick={()=>{if(confirm("Wyczyścić historię?")) update({trades:[],enabled:false});}}
                  style={{ background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:8, padding:"8px 18px", color:R, cursor:"pointer", fontSize:13 }}>
                  Wyczyść historię
                </button>
              )}
            </div>
          )}
        </div>

        {/* Trade history */}
        <div style={card}>
          <div style={{ fontSize:10, color:M, letterSpacing:1, marginBottom:14 }}>HISTORIA TRANSAKCJI ({closed.length})</div>
          {closed.length===0 ? (
            <div style={{ color:M, fontSize:14, lineHeight:1.8 }}>Brak transakcji. Bot wchodzi gdy RSI+EMA{config.useAdx?`+ADX≥${config.adxMin}`:""} potwierdzą kierunek podczas sesji 21–23 UTC.</div>
          ) : (
            <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                <thead>
                  <tr>{["DATA","SYM","DIR","WEJŚCIE","WYJŚCIE","PnL ($)","PnL (%)","POWÓD"].map(h=>(
                    <th key={h} style={{ textAlign:["DATA","SYM","DIR","POWÓD"].includes(h)?"left":"right" as any, padding:"5px 8px", color:M, fontSize:10, fontWeight:600, whiteSpace:"nowrap" }}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {[...closed].reverse().slice(0,40).map(t=>{
                    const pos=(t.pnl??0)>=0;
                    return (
                      <tr key={t.id} style={{ borderTop:"1px solid rgba(255,255,255,0.05)" }}>
                        <td style={{ padding:"8px 8px", color:M, whiteSpace:"nowrap" }}>{fmtDate(t.entryTime)} {fmtTime(t.entryTime)}</td>
                        <td style={{ padding:"8px 8px", fontWeight:700 }}>{t.symbol.replace("USDT","")}</td>
                        <td style={{ padding:"8px 8px" }}><span style={{ fontSize:10, fontWeight:700, color:(t.direction??"long")==="short"?R:G, background:(t.direction??"long")==="short"?"rgba(248,113,113,0.1)":"rgba(74,222,128,0.1)", borderRadius:4, padding:"2px 6px" }}>{(t.direction??"LONG").toUpperCase()}</span></td>
                        <td style={{ padding:"8px 8px", textAlign:"right" }}>${fmt(t.entryPrice)}</td>
                        <td style={{ padding:"8px 8px", textAlign:"right" }}>${fmt(t.exitPrice??0)}</td>
                        <td style={{ padding:"8px 8px", textAlign:"right", color:pos?G:R, fontWeight:700 }}>{fmtUsd(t.pnl??0)}</td>
                        <td style={{ padding:"8px 8px", textAlign:"right", color:pos?G:R }}>{fmtPct(t.pnlPct??0)}</td>
                        <td style={{ padding:"8px 8px", color:M, fontSize:11 }}>{REASON_LABEL[t.reason??"session_end"]}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Backtest */}
        <div style={{ ...card, marginTop:14 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:btResult?16:0 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
              <FlaskConical size={15} color={G}/>
              <span style={{ fontWeight:700, fontSize:14 }}>Backtest strategii</span>
              <span style={{ fontSize:11, color:M, background:"rgba(34,197,94,0.1)", border:"1px solid rgba(34,197,94,0.2)", borderRadius:6, padding:"2px 8px" }}>
                ~41 dni · RSI[{config.rsiMin}-{config.rsiMax}]+EMA≤{config.emaMaxDist}%{config.useAdx?` · ADX≥${config.adxMin}`:""}{config.dynamicExits?" · ATR":""}{config.trailStop?` · Trail${config.trailPct}%`:""} · {config.allowShorts?"L+S":"Long"}
              </span>
            </div>
            <button
              onClick={async()=>{ setBtLoading(true); setBtError(null); setBtResult(null); try { setBtResult(await runBacktest({ ...config, trailActivation:config.trailActivation??0.3, requirePrevBull:config.requirePrevBull??true })); } catch(e:any){ setBtError(e.message); } finally{ setBtLoading(false); } }}
              disabled={btLoading}
              style={{ background:btLoading?"rgba(34,197,94,0.05)":"rgba(34,197,94,0.15)", border:"1px solid rgba(34,197,94,0.35)", borderRadius:8, padding:"8px 18px", color:btLoading?M:G, cursor:btLoading?"default":"pointer", fontWeight:700, fontSize:13, display:"flex", alignItems:"center", gap:6 }}>
              {btLoading?<><RefreshCw size={13} style={{animation:"spin 1s linear infinite"}}/> Pobieranie…</>:<><FlaskConical size={13}/> Uruchom</>}
            </button>
          </div>

          {!btResult && !btLoading && !btError && (
            <div style={{ fontSize:13, color:M, lineHeight:1.7 }}>
              Symuluje strategię na ~1000 świecach 1h z Binance. Włącz ADX i ATR exits żeby zobaczyć różnicę w wynikach.
            </div>
          )}
          {btError && <div style={{ color:R, fontSize:13, marginTop:8, display:"flex", alignItems:"center", gap:6 }}><AlertCircle size={14}/> {btError}</div>}

          {btResult && (() => {
            const r=btResult;
            const eqMin=Math.min(0,...r.equity), eqMax=Math.max(0.01,...r.equity), range=eqMax-eqMin;
            return (
              <div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:14 }}>
                  {([
                    { label:"Win Rate",     value:`${r.winRate.toFixed(0)}%`,                             color:r.winRate>=55?G:r.winRate>=45?"#f59e0b":R, sub:`${r.trades.filter(t=>t.pnlPct>0).length}W / ${r.trades.filter(t=>t.pnlPct<=0).length}L` },
                    { label:"Łączny zwrot", value:(r.totalReturn>=0?"+":"")+r.totalReturn.toFixed(1)+"%", color:r.totalReturn>=0?G:R,                      sub:`${r.trades.length} transakcji / ${r.days} dni` },
                    { label:"Max Drawdown", value:`-${r.maxDrawdown.toFixed(1)}%`,                        color:r.maxDrawdown>15?R:r.maxDrawdown>8?"#f59e0b":G, sub:"max obsunięcie" },
                    { label:"Śr. zysk",     value:`+${r.avgWin.toFixed(2)}%`,                             color:G,                                          sub:"na wygranej" },
                    { label:"Śr. strata",   value:`${r.avgLoss.toFixed(2)}%`,                             color:R,                                          sub:"na przegranej" },
                    { label:"Sharpe",       value:r.sharpe.toFixed(2),                                    color:r.sharpe>=1.5?G:r.sharpe>=0.8?"#f59e0b":R, sub:r.sharpe>=1.5?"dobry":r.sharpe>=0.8?"akceptowalny":"słaby" },
                  ] as {label:string;value:string;color:string;sub:string}[]).map(({label,value,color,sub})=>(
                    <div key={label} style={{ background:"rgba(0,0,0,0.2)", borderRadius:10, padding:"12px 14px", textAlign:"center" as const }}>
                      <div style={{ fontSize:10, color:M, letterSpacing:0.8, marginBottom:4 }}>{label.toUpperCase()}</div>
                      <div style={{ fontSize:20, fontWeight:800, color }}>{value}</div>
                      <div style={{ fontSize:10, color:M, marginTop:3 }}>{sub}</div>
                    </div>
                  ))}
                </div>

                {/* L/S breakdown */}
                <div style={{ display:"flex", gap:10, marginBottom:14 }}>
                  <div style={{ flex:1, background:"rgba(74,222,128,0.06)", border:"1px solid rgba(74,222,128,0.15)", borderRadius:8, padding:"10px 14px", textAlign:"center" as const }}>
                    <div style={{ fontSize:10, color:M, marginBottom:3 }}>LONG</div>
                    <div style={{ fontSize:22, fontWeight:800, color:G }}>{r.longs}</div>
                  </div>
                  <div style={{ flex:1, background:"rgba(248,113,113,0.06)", border:"1px solid rgba(248,113,113,0.15)", borderRadius:8, padding:"10px 14px", textAlign:"center" as const }}>
                    <div style={{ fontSize:10, color:M, marginBottom:3 }}>SHORT</div>
                    <div style={{ fontSize:22, fontWeight:800, color:r.shorts>0?"#fca5a5":M }}>{r.shorts}</div>
                  </div>
                  <div style={{ flex:2, background:"rgba(0,0,0,0.2)", borderRadius:8, padding:"10px 14px" }}>
                    <div style={{ fontSize:10, color:M, marginBottom:6 }}>PODZIAŁ L/S</div>
                    <div style={{ height:8, background:"rgba(255,255,255,0.07)", borderRadius:4, overflow:"hidden" }}>
                      <div style={{ width:`${r.trades.length?r.longs/r.trades.length*100:0}%`, height:"100%", background:G, borderRadius:4 }}/>
                    </div>
                    <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, color:M, marginTop:4 }}>
                      <span style={{color:G}}>{r.trades.length?Math.round(r.longs/r.trades.length*100):0}% L</span>
                      <span style={{color:"#fca5a5"}}>{r.trades.length?Math.round(r.shorts/r.trades.length*100):0}% S</span>
                    </div>
                  </div>
                </div>

                {/* Equity curve */}
                <div style={{ marginBottom:14 }}>
                  <div style={{ fontSize:10, color:M, letterSpacing:0.8, marginBottom:8 }}>KRZYWA KAPITAŁU</div>
                  <div style={{ display:"flex", alignItems:"flex-end", gap:2, height:60, background:"rgba(0,0,0,0.2)", borderRadius:8, padding:"8px 10px" }}>
                    {r.equity.map((eq,i)=>{
                      const h=range>0?Math.max(2,Math.abs(eq-eqMin)/range*44):2;
                      return <div key={i} title={`${eq>=0?"+":""}${eq.toFixed(1)}%`} style={{ flex:1, height:h, background:eq>=0?G:R, borderRadius:2, opacity:0.8, minWidth:2 }}/>;
                    })}
                  </div>
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, color:M, marginTop:4 }}>
                    <span>{r.trades[0]?.date}</span>
                    <span style={{ color:r.totalReturn>=0?G:R, fontWeight:700 }}>{r.totalReturn>=0?"+":""}{r.totalReturn.toFixed(1)}% końcowy</span>
                    <span>{r.trades[r.trades.length-1]?.date}</span>
                  </div>
                </div>

                <div style={{ background:r.winRate>=55&&r.totalReturn>0?"rgba(34,197,94,0.08)":r.winRate>=45?"rgba(245,158,11,0.08)":"rgba(248,113,113,0.08)", border:`1px solid ${r.winRate>=55&&r.totalReturn>0?"rgba(34,197,94,0.25)":r.winRate>=45?"rgba(245,158,11,0.25)":"rgba(248,113,113,0.25)"}`, borderRadius:10, padding:"12px 14px", marginBottom:12, fontSize:13 }}>
                  <strong style={{ color:r.winRate>=55&&r.totalReturn>0?G:r.winRate>=45?"#f59e0b":R }}>{r.winRate>=55&&r.totalReturn>0?"✅ Strategia byłaby zyskowna":r.winRate>=45?"⚠️ Wyniki mieszane":"❌ Strategia nierentowna"}</strong>
                  {" "}Win rate {r.winRate.toFixed(0)}% przy {r.trades.length} transakcjach ({r.longs}L/{r.shorts}S). Wyniki historyczne ≠ przyszłe.
                </div>

                <button onClick={()=>setShowBtTrades(s=>!s)} style={{ background:"none", border:"none", color:M, cursor:"pointer", fontSize:12, display:"flex", alignItems:"center", gap:5, padding:0, marginBottom:showBtTrades?10:0 }}>
                  {showBtTrades?<ChevronUp size={13}/>:<ChevronDown size={13}/>} {showBtTrades?"Ukryj":"Pokaż"} {r.trades.length} transakcji
                </button>
                {showBtTrades && (
                  <div style={{ overflowX:"auto", maxHeight:280, overflowY:"auto" }}>
                    <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                      <thead style={{ position:"sticky", top:0, background:"#001a0a" }}>
                        <tr>{["DATA","DIR","WEJŚCIE","WYJŚCIE","WYNIK","POWÓD"].map(h=>(
                          <th key={h} style={{ padding:"5px 8px", color:M, fontSize:10, textAlign:["DATA","DIR","POWÓD"].includes(h)?"left" as const:"right" as const, whiteSpace:"nowrap" }}>{h}</th>
                        ))}</tr>
                      </thead>
                      <tbody>
                        {r.trades.map((t,i)=>(
                          <tr key={i} style={{ borderTop:"1px solid rgba(255,255,255,0.04)" }}>
                            <td style={{ padding:"6px 8px", color:M }}>{t.date}</td>
                            <td style={{ padding:"6px 8px" }}><span style={{ fontSize:10, fontWeight:700, color:t.direction==="short"?R:G }}>{t.direction.toUpperCase()}</span></td>
                            <td style={{ padding:"6px 8px", textAlign:"right" as const }}>${fmt(t.entryPrice)}</td>
                            <td style={{ padding:"6px 8px", textAlign:"right" as const }}>${fmt(t.exitPrice)}</td>
                            <td style={{ padding:"6px 8px", textAlign:"right" as const, color:t.pnlPct>0?G:R, fontWeight:700 }}>{t.pnlPct>=0?"+":""}{t.pnlPct.toFixed(2)}%</td>
                            <td style={{ padding:"6px 8px", color:M, fontSize:11 }}>{t.reason==="take_profit"?<span style={{color:G}}>TP ✓</span>:t.reason==="stop_loss"?<span style={{color:R}}>SL ✗</span>:"sesja"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {/* Activity Log */}
        <div style={{ ...card, marginTop:14 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:activityLog.length>0?12:0 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <Radio size={13} color={config.enabled&&sess.inSession?G:M}/>
              <span style={{ fontWeight:700, fontSize:14 }}>Activity Log</span>
              {config.autoMode && <span style={{ fontSize:10, background:"rgba(245,158,11,0.1)", border:"1px solid rgba(245,158,11,0.25)", borderRadius:6, padding:"2px 7px", color:"#fbbf24" }}>AUTO</span>}
              {config.enabled && sess.inSession && <span style={{ fontSize:10, background:"rgba(34,197,94,0.1)", border:"1px solid rgba(34,197,94,0.25)", borderRadius:6, padding:"2px 7px", color:G, display:"flex", alignItems:"center", gap:4 }}><span style={{ width:6, height:6, borderRadius:"50%", background:G, animation:"pulse 1.5s ease-in-out infinite", display:"inline-block" }}/> LIVE</span>}
            </div>
            {activityLog.length>0 && <button onClick={()=>setActivityLog([])} style={{ background:"none", border:"none", color:M, cursor:"pointer", fontSize:11 }}>Wyczyść</button>}
          </div>
          {activityLog.length===0 ? (
            <div style={{ fontSize:12, color:M, lineHeight:1.7 }}>Log decyzji bota — każdy skan, ADX check, sygnał, wejście i wyjście pojawi się tutaj w czasie rzeczywistym.</div>
          ) : (
            <div ref={logRef} style={{ maxHeight:240, overflowY:"auto", fontFamily:"monospace", fontSize:12, lineHeight:1.7 }}>
              {activityLog.map((e,i)=>(
                <div key={i} style={{ display:"flex", gap:12, padding:"3px 0", borderBottom:"1px solid rgba(255,255,255,0.03)" }}>
                  <span style={{ color:"rgba(255,255,255,0.25)", flexShrink:0, minWidth:72, fontSize:11 }}>{e.time}</span>
                  <span style={{ color:e.type==="buy"?G:e.type==="sell"?"#86efac":e.type==="warn"?"#f59e0b":"rgba(255,255,255,0.55)" }}>{e.msg}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}} @keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.5;transform:scale(0.85)}}`}</style>
        <div style={{ marginTop:18, fontSize:11, color:"rgba(255,255,255,0.2)", textAlign:"center" }}>
          Paper trading — symulacja edukacyjna. Nie jest to porada inwestycyjna. Krypto = wysokie ryzyko.
        </div>
      </div>
    </ResellLayout>
  );
}
