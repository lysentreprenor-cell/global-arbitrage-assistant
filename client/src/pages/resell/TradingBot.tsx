import { useState, useEffect, useCallback, useRef } from "react";
import {
  TrendingUp, TrendingDown, Clock, RefreshCw, Settings,
  ChevronDown, ChevronUp, Play, Pause, AlertCircle, Activity,
  FlaskConical, Radio, Zap, ArrowUpCircle, ArrowDownCircle, BarChart2,
} from "lucide-react";
import { ResellLayout } from "@/components/resell/ResellLayout";
import { hasBybitKeys, getBybitKeys } from "@/lib/apiKeys";

// ─── Types ────────────────────────────────────────────────────────────────────

type Symbol    = "BTCUSDT" | "ETHUSDT" | "SOLUSDT";
type TradeReason = "session_end" | "stop_loss" | "take_profit" | "trail_stop" | "rsi_extreme";
type Direction = "long" | "short";

// #57 — snapshot of market conditions at entry
type TradeMeta = { rsi: number; adx: number; volumeMult: number; atrPercentile: number; ribbonBull: boolean };

type PaperTrade = {
  id: number; symbol: Symbol; direction: Direction;
  entryTime: string; entryPrice: number; size: number; status: "open" | "closed";
  exitTime?: string; exitPrice?: number; pnl?: number; pnlPct?: number; reason?: TradeReason;
  slPct?: number; tpPct?: number; // actual SL/TP used (may be ATR-based)
  trailRef?: number;              // current trailing high/low for live trade
  peakGainPct?: number;           // #81/#91 highest unrealized gain reached
  meta?: TradeMeta;               // #57 conditions at entry
};

type BotConfig = {
  enabled: boolean; autoMode: boolean; allowShorts: boolean; symbol: Symbol;
  capital: number; riskPct: number; stopLoss: number; takeProfit: number;
  useAdx: boolean; adxMin: number;
  dynamicExits: boolean; atrSlMul: number; atrTpMul: number;
  trailStop: boolean; trailPct: number; trailActivation: number;
  rsiMin: number; rsiMax: number; emaMaxDist: number; requirePrevBull: boolean;
  allow24h: boolean; maxHoldCandles: number;
  volumeFilter: boolean; volumeMinMult: number; // #1 volume confirmation
  macdFilter: boolean; // #2 MACD momentum confirmation
  emaRibbonFilter: boolean; // #3 EMA8>13>21 alignment
  drawdownProtection: boolean; // #4 halve size after 2 consecutive losses
  breakEvenStop: boolean; breakEvenTriggerPct: number; // #5 move SL to entry after X% gain
  learningEnabled: boolean;
  // #6-#10 signal filters
  stochRsiFilter: boolean;
  bbFilter: boolean; bbMaxPct: number;
  bodyFilter: boolean; bodyMinRatio: number;
  emaSlopeFilter: boolean;
  candleConfirm: boolean; candleConfirmN: number;
  // #11-#15 exit & risk
  rsiExitFilter: boolean; rsiExitHigh: number; rsiExitLow: number;
  feeSimulation: boolean; feePct: number;
  maxConsecLosses: number; autoPauseOnLosses: boolean;
  compoundMode: boolean; startingCapital: number;
  recoveryMode: boolean; recoveryDrawdownPct: number;
  // #23-#27 sizing
  kellyEnabled: boolean; kellyFraction: number;
  volScaling: boolean;
  dailyLossLimit: number; dailyCircuitBreaker: boolean; dailyStartCapital: number; dailyStartDate: string;
  equityCurveFilter: boolean;
  signalConfirmation: boolean;
  // #31-#35 advanced signal
  adxSlope: boolean;
  volumeTrend: boolean;
  revengeCooldown: boolean;
  wickFilter: boolean;
  multiSymbol: boolean;
  // #48,#51-#55 refinements
  rocFilter: boolean;
  rsiRising: boolean;
  dynamicEmaDist: boolean;
  srFilter: boolean;
  closePosFilter: boolean;
  prevBullCandles: number;
  // #66-#70 final signal
  ichimokuFilter: boolean;
  pvsEmaFilter: boolean; pvsEmaMin: number;
  bbSqueezeFilter: boolean;
  haFilter: boolean;
  higherLowFilter: boolean;
  // #71-#75 optimizer
  deepTrainWindows: number;
  optimizeFor: "sharpe" | "calmar" | "winRate";
  // #82-#83 gates
  sessionScoreGate: boolean; minSessionScore: number;
  reoptInterval: number;
  // #91 profit lock
  profitLock: boolean; profitLockPct: number;
  // #92 custom session
  sessionStart: number; sessionEnd: number;
  // #95 auto-disable
  autoDisableAfterSession: boolean;
  // leverage
  leverage: number; // 1=brak, 2=2x, 3=3x, 5=5x, 10=10x
  leverageAuto: boolean; // system sam dobiera dźwignię na podstawie Deep Train
  // auto filters
  filterAutoMode: boolean; // system sam włącza/wyłącza filtry na podstawie Deep Train + rynku
  // auto strategy
  strategyAutoMode: boolean; // system sam dobiera RSI/Trail/SL/TP z Deep Train
  trades: PaperTrade[];
};

type LogEntry  = { time: string; msg: string; type: "buy" | "sell" | "info" | "warn" };
type Ticker    = { price: number; change24h: number; high24h: number; low24h: number };
type SessionInfo = { inSession: boolean; label: string; countdown: string };
type MarketData  = { rsi: number; ema21: number; priceVsEma: number; momentum: number; volatility: number; atr: number; adx: number; prevBull: boolean; volumeMult: number; macd: number; macdSignal: number; macdHist: number; ema8: number; ema13: number; ribbonBull: boolean; ribbonBear: boolean;
  stochRsi: number;        // #6
  bbPct: number; bbUpper: number; bbLower: number; bbWidth: number; bbSqueeze: boolean; // #7,#68
  bodyRatio: number;       // #8
  emaSlope: number;        // #9
  atrPercentile: number;   // #21
  roc: number;             // #48
  tenkan: number; kijun: number; // #66
  haGreen: boolean;        // #69
  adxRising: boolean;      // #31
  rsiRising: boolean;      // #51
  volumeRising: boolean;   // #32
  upperWickRatio: number;  // #34
  rsi4h: number;           // #86
};

type BtTrade  = { date: string; direction: Direction; entryPrice: number; exitPrice: number; pnlPct: number; reason: TradeReason };
type BtResult = { symbol: string; days: number; periodLabel: string; trades: BtTrade[]; winRate: number; totalReturn: number; maxDrawdown: number; avgWin: number; avgLoss: number; sharpe: number; equity: number[]; longs: number; shorts: number };

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

type CandleData = { time: number; open: number; high: number; low: number; close: number; volume: number; utcH: number };
type BtCfg = {
  symbol: Symbol; stopLoss: number; takeProfit: number; allowShorts: boolean;
  useAdx: boolean; adxMin: number; dynamicExits: boolean; atrSlMul: number; atrTpMul: number;
  trailStop: boolean; trailPct: number; trailActivation: number;
  rsiMin: number; rsiMax: number; emaMaxDist: number; requirePrevBull: boolean;
  allow24h: boolean; maxHoldCandles: number;
  volumeFilter: boolean; volumeMinMult: number;
  macdFilter: boolean;
  emaRibbonFilter: boolean;
  // batch filters applicable to backtest
  stochRsiFilter: boolean;
  bbFilter: boolean; bbMaxPct: number;
  bodyFilter: boolean; bodyMinRatio: number;
  emaSlopeFilter: boolean;
  candleConfirm: boolean; candleConfirmN: number;
  rsiExitFilter: boolean; rsiExitHigh: number; rsiExitLow: number;
  feeSimulation: boolean; feePct: number;
  atrSlMulOpt?: number;
  adxSlope: boolean;
  volumeTrend: boolean;
  wickFilter: boolean;
  rocFilter: boolean;
  rsiRising: boolean;
  dynamicEmaDist: boolean;
  srFilter: boolean;
  closePosFilter: boolean;
  prevBullCandles: number;
  ichimokuFilter: boolean;
  pvsEmaFilter: boolean; pvsEmaMin: number;
  bbSqueezeFilter: boolean;
  haFilter: boolean;
  higherLowFilter: boolean;
  sessionScoreGate: boolean; minSessionScore: number;
  optimizeFor: "sharpe" | "calmar" | "winRate";
  deepTrainWindows: number;
  leverage: number;
  leverageAuto: boolean;
};

function calcBtStats(trades: BtTrade[], symbol: Symbol, candles: CandleData[], periodLabel: string): BtResult {
  if (!trades.length) return { symbol, days:Math.round(candles.length/24), periodLabel, trades:[], winRate:0, totalReturn:0, maxDrawdown:0, avgWin:0, avgLoss:0, sharpe:0, equity:[], longs:0, shorts:0 };
  const wins=trades.filter(t=>t.pnlPct>0), losses=trades.filter(t=>t.pnlPct<=0);
  const winRate=wins.length/trades.length*100;
  const avgWin=wins.length?wins.reduce((s,t)=>s+t.pnlPct,0)/wins.length:0;
  const avgLoss=losses.length?losses.reduce((s,t)=>s+t.pnlPct,0)/losses.length:0;
  let eq=100, peak=100, maxDD=0; const equity: number[]=[];
  for (const t of trades) { eq*=(1+t.pnlPct/100); equity.push(parseFloat((eq-100).toFixed(2))); if(eq>peak)peak=eq; const dd=(peak-eq)/peak*100; if(dd>maxDD)maxDD=dd; }
  const rets=trades.map(t=>t.pnlPct), mean=rets.reduce((a,b)=>a+b,0)/rets.length;
  const variance=rets.reduce((s,r)=>s+(r-mean)**2,0)/rets.length;
  const sharpe=variance>0?parseFloat((mean/Math.sqrt(variance)*Math.sqrt(252/24)).toFixed(2)):0;
  return { symbol, days:Math.round(candles.length/24), periodLabel, trades, winRate, totalReturn:eq-100, maxDrawdown:maxDD, avgWin, avgLoss, sharpe, equity, longs:trades.filter(t=>t.direction==="long").length, shorts:trades.filter(t=>t.direction==="short").length };
}

function runBacktestSync(candles: CandleData[], cfg: BtCfg): BtResult {
  const periodLabel = candles.length>0 ? `${new Date(candles[0].time).toLocaleDateString("pl",{day:"2-digit",month:"2-digit"})} – ${new Date(candles[candles.length-1].time).toLocaleDateString("pl",{day:"2-digit",month:"2-digit"})}` : "";
  const trades: BtTrade[] = [];
  const holdLen = cfg.allow24h ? cfg.maxHoldCandles : 1;
  let skipUntil = -1;

  for (let i = 30; i < candles.length - holdLen - 1; i++) {
    if (i <= skipUntil) continue;
    const c = candles[i];
    if (!cfg.allow24h && (c.utcH < 21 || c.utcH > 22)) continue; // session 21:00-22:59 UTC

    // wider slice so newer indicators (StochRSI, BB squeeze percentile, Ichimoku) have history
    const wide  = candles.slice(Math.max(0,i-79), i+1);
    const slice = candles.slice(Math.max(0,i-29), i+1);
    const cls=slice.map(x=>x.close), hhs=slice.map(x=>x.high), lls=slice.map(x=>x.low);
    const wcls=wide.map(x=>x.close), whhs=wide.map(x=>x.high), wlls=wide.map(x=>x.low);
    const ema=calcEMA21(cls), rsi=calcRSI(cls);
    const adx=(cfg.useAdx||cfg.adxSlope)?calcADX(hhs,lls,cls):999;
    const atr=cfg.dynamicExits?calcATR(hhs,lls,cls):calcATR(hhs,lls,cls);
    if (cfg.useAdx && adx < cfg.adxMin) continue;
    // #1 volume filter — skip low-volume candles
    if (cfg.volumeFilter && calcVolumeMult(candles, i) < cfg.volumeMinMult) continue;
    // #2 MACD (needs ≥35 candles — use wider 80-candle slice), #3 EMA ribbon
    const macdV   = cfg.macdFilter ? calcMACD(wcls) : { macd:1, signal:0, hist:1 };
    const ribbonV = cfg.emaRibbonFilter ? calcEMARibbon(cls) : { bullish:true, bearish:true };

    const prevC=i>0?candles[i-1]:null;
    const prevBull=prevC?prevC.close>prevC.open:true, prevBear=prevC?prevC.close<prevC.open:true;
    // #52 dynamic EMA distance based on ATR
    const effEmaMaxDist = cfg.dynamicEmaDist && atr>0 ? Math.max(0.5, atr/c.open*100*2) : cfg.emaMaxDist;
    const emaDist=Math.abs((c.open-ema)/ema*100);

    // ── new filter computations ──
    const stoch = cfg.stochRsiFilter ? calcStochRSI(wcls) : 50;            // #6
    const bb    = (cfg.bbFilter||cfg.bbSqueezeFilter) ? calcBollingerBands(cls) : null; // #7,#68
    const bodyR = cfg.bodyFilter ? calcBodyRatio(c) : 1;                   // #8
    const slope = cfg.emaSlopeFilter ? calcEMASlope(cls) : 1;             // #9
    const roc   = cfg.rocFilter ? calcROC(cls) : 1;                       // #48
    const ich   = cfg.ichimokuFilter ? calcIchimoku(whhs,wlls) : null;   // #66
    const ha    = cfg.haFilter ? calcHA(candles,i) : null;               // #69
    const adxRising = !cfg.adxSlope || (i>=33 && adx > calcADX(candles.slice(Math.max(0,i-32),i-2).map(x=>x.high),candles.slice(Math.max(0,i-32),i-2).map(x=>x.low),candles.slice(Math.max(0,i-32),i-2).map(x=>x.close))); // #31
    const rsiRise = !cfg.rsiRising || (cls.length>=3 && rsi > calcRSI(cls.slice(0,-2))); // #51
    // #32 volume increasing 3 candles
    const volTrendOk = !cfg.volumeTrend || (i>=2 && candles[i].volume>candles[i-1].volume && candles[i-1].volume>candles[i-2].volume);
    // #34 wick rejection
    const upperWick = c.high - Math.max(c.open,c.close), bodyAbs = Math.abs(c.close-c.open)||1e-9;
    const wickOk = !cfg.wickFilter || upperWick/bodyAbs <= 2;
    // #53 swing support
    const sr = cfg.srFilter ? calcSwingLevels(candles,i) : null;
    // #54 close in upper half
    const closePosOk = !cfg.closePosFilter || (c.high>c.low ? (c.close-c.low)/(c.high-c.low) > 0.5 : true);
    // #55 N previous candles bullish
    let prevBullN = true;
    if (cfg.prevBullCandles>1) { for(let k=1;k<=cfg.prevBullCandles;k++){ const pc=candles[i-k]; if(!pc||pc.close<=pc.open){prevBullN=false;break;} } }
    else prevBullN = prevBull;
    // #70 higher-low structure
    const higherLowOk = !cfg.higherLowFilter || (i>=4 && candles[i-1].low > candles[i-3].low);
    // #82 session score
    const ribbonForScore = calcEMARibbon(cls);
    let score=0;
    if (adx>=25) score+=2;
    if (calcVolumeMult(candles,i)>=1.2) score+=2;
    if (ribbonForScore.bullish) score+=2;
    if (calcMACD(wcls).macd>calcMACD(wcls).signal) score+=2;
    if (rsi>=50 && rsi<=65) score+=2;
    const scoreOk = !cfg.sessionScoreGate || score>=cfg.minSessionScore;

    const stochOkL = !cfg.stochRsiFilter || stoch < 80;
    const stochOkS = !cfg.stochRsiFilter || stoch > 20;
    const bbOkL = !cfg.bbFilter || !bb || bb.pct <= cfg.bbMaxPct;
    const bbOkS = !cfg.bbFilter || !bb || bb.pct >= (100 - cfg.bbMaxPct);
    const bodyOk = !cfg.bodyFilter || bodyR >= cfg.bodyMinRatio;
    const slopeOkL = !cfg.emaSlopeFilter || slope > 0;
    const slopeOkS = !cfg.emaSlopeFilter || slope < 0;
    const candleConfirmOkL = !cfg.candleConfirm || (() => { for(let k=0;k<cfg.candleConfirmN;k++){ const pc=candles[i-k]; if(!pc)return false; const e=calcEMA21(candles.slice(Math.max(0,i-k-29),i-k+1).map(x=>x.close)); if(pc.close<=e)return false;} return true; })();
    const rocOkL = !cfg.rocFilter || roc > 0;
    const ichOkL = !cfg.ichimokuFilter || !ich || ich.tenkan > ich.kijun;
    const ichOkS = !cfg.ichimokuFilter || !ich || ich.tenkan < ich.kijun;
    const pvsEma = (c.open-ema)/ema*100;
    const pvsOkL = !cfg.pvsEmaFilter || pvsEma >= cfg.pvsEmaMin;
    const pvsOkS = !cfg.pvsEmaFilter || pvsEma <= -cfg.pvsEmaMin;
    const haOkL = !cfg.haFilter || !ha || ha.green;
    const haOkS = !cfg.haFilter || !ha || !ha.green;
    const srOkL = !cfg.srFilter || !sr || c.open >= sr.support;
    // #68 BB squeeze breakout
    let squeezeOk = true;
    if (cfg.bbSqueezeFilter && bb) {
      const widths:number[]=[];
      for(let k=i-50;k<i;k++){ if(k<20)continue; widths.push(calcBollingerBands(candles.slice(Math.max(0,k-19),k+1).map(x=>x.close)).width); }
      if(widths.length>=10){ const sorted=[...widths].sort((a,b)=>a-b); const p20=sorted[Math.floor(sorted.length*0.2)]; squeezeOk = bb.width <= p20 || c.close > bb.upper; }
    }

    const commonL = emaDist<=effEmaMaxDist && (!cfg.requirePrevBull||prevBullN) && (!cfg.macdFilter||macdV.macd>macdV.signal) && (!cfg.emaRibbonFilter||ribbonV.bullish)
      && stochOkL && bbOkL && bodyOk && slopeOkL && candleConfirmOkL && rocOkL && ichOkL && pvsOkL && haOkL && srOkL && adxRising && rsiRise && volTrendOk && wickOk && closePosOk && higherLowOk && scoreOk && squeezeOk;
    const commonS = emaDist<=effEmaMaxDist && (!cfg.requirePrevBull||prevBear) && (!cfg.macdFilter||macdV.macd<macdV.signal) && (!cfg.emaRibbonFilter||ribbonV.bearish)
      && stochOkS && bbOkS && bodyOk && slopeOkS && rocOkL && ichOkS && pvsOkS && haOkS && adxRising && volTrendOk && scoreOk;

    const isLong=c.open>ema&&rsi>=cfg.rsiMin&&rsi<=cfg.rsiMax&&commonL;
    const isShort=cfg.allowShorts&&c.open<ema&&rsi<40&&commonS;
    if (!isLong && !isShort) continue;

    const dir: Direction = isLong?"long":"short";
    const entry=c.open;
    const slMul=cfg.atrSlMulOpt ?? cfg.atrSlMul; // #72 SL mult optimization
    const slPct=cfg.dynamicExits&&atr>0?(atr/entry*100*slMul):cfg.stopLoss;
    const tpPct=cfg.dynamicExits&&atr>0?(atr/entry*100*cfg.atrTpMul):cfg.takeProfit;

    let exit=c.close, reason: TradeReason="session_end", exitIdx=i+holdLen;
    let trailRef=entry, trailOn=false;
    let effSL=dir==="long"?entry*(1-slPct/100):entry*(1+slPct/100);

    for (let j=i; j<=i+holdLen&&j<candles.length; j++) {
      const cn=candles[j];
      // #11 RSI extreme exit (computed at candle close)
      if (cfg.rsiExitFilter) {
        const rsiJ=calcRSI(candles.slice(Math.max(0,j-29),j+1).map(x=>x.close));
        if (dir==="long" && rsiJ>=cfg.rsiExitHigh) { exit=cn.close; reason="rsi_extreme"; exitIdx=j; break; }
        if (dir==="short" && rsiJ<=cfg.rsiExitLow) { exit=cn.close; reason="rsi_extreme"; exitIdx=j; break; }
      }
      if (dir==="long") {
        if (cfg.trailStop&&(cn.high-entry)/entry*100>=cfg.trailActivation) trailOn=true;
        if (cfg.trailStop&&trailOn&&cn.high>trailRef) { trailRef=cn.high; const ts=trailRef*(1-cfg.trailPct/100); if(ts>effSL)effSL=ts; }
        if (cn.low<=effSL) { exit=effSL; reason=effSL<entry?"stop_loss":"trail_stop"; exitIdx=j; break; }
        if ((cn.high-entry)/entry*100>=tpPct) { exit=entry*(1+tpPct/100); reason="take_profit"; exitIdx=j; break; }
      } else {
        if (cfg.trailStop&&(entry-cn.low)/entry*100>=cfg.trailActivation) trailOn=true;
        if (cfg.trailStop&&trailOn&&cn.low<trailRef) { trailRef=cn.low; const ts=trailRef*(1+cfg.trailPct/100); if(ts<effSL)effSL=ts; }
        if (cn.high>=effSL) { exit=effSL; reason=effSL>entry?"stop_loss":"trail_stop"; exitIdx=j; break; }
        if ((entry-cn.low)/entry*100>=tpPct) { exit=entry*(1-tpPct/100); reason="take_profit"; exitIdx=j; break; }
      }
      exit=cn.close; exitIdx=j;
    }
    skipUntil=exitIdx;
    let pnlPct=dir==="long"?(exit-entry)/entry*100:(entry-exit)/entry*100;
    // #12/#36 fee-adjusted returns
    if (cfg.feeSimulation) pnlPct -= cfg.feePct;
    // leverage: fixed or smart-auto (per-trade signal quality gate)
    let tradeLev = cfg.leverage;
    if (cfg.leverageAuto && cfg.leverage > 1) {
      // signal quality score 0-10: adx, volume, macd, ribbon, rsi center
      let sigScore = 0;
      if (adx >= 30) sigScore += 3; else if (adx >= 20) sigScore += 1;
      if (calcVolumeMult(candles, i) >= 1.5) sigScore += 2; else if (calcVolumeMult(candles, i) >= 1.2) sigScore += 1;
      if (macdV.macd !== 0 && (dir==="long" ? macdV.macd > macdV.signal : macdV.macd < macdV.signal)) sigScore += 2;
      if (dir==="long" ? ribbonV.bullish : ribbonV.bearish) sigScore += 1;
      const rsiCenter = cfg.rsiMin + (cfg.rsiMax - cfg.rsiMin) / 2;
      if (Math.abs(rsi - rsiCenter) <= 5) sigScore += 2;
      // map score to leverage: need ≥7 for full, ≥4 for half-step, else 1x
      if (sigScore >= 7) tradeLev = cfg.leverage;
      else if (sigScore >= 4) tradeLev = Math.max(1, Math.floor((cfg.leverage + 1) / 2));
      else tradeLev = 1;
    }
    if (tradeLev > 1) {
      const liquidation = -(100 / tradeLev);
      pnlPct = pnlPct <= liquidation ? -100 : pnlPct * tradeLev;
    }
    trades.push({ date:new Date(c.time).toLocaleDateString("pl",{day:"2-digit",month:"2-digit"}), direction:dir, entryPrice:entry, exitPrice:exit, pnlPct, reason });
  }
  return calcBtStats(trades, cfg.symbol, candles, periodLabel);
}

async function fetchCandleData(symbol: Symbol): Promise<CandleData[]> {
  const res = await fetch(`/api/trading/klines?symbol=${symbol}&interval=1h&limit=2400`);
  if (!res.ok) throw new Error(`Klines ${res.status}`);
  const raw: any[] = await res.json();
  if (raw.error) throw new Error(raw.error);
  return raw.map(k=>({ time: k.time as number, open: k.open, high: k.high, low: k.low, close: k.close, volume: k.volume, utcH: new Date(k.time as number).getUTCHours() }));
}

// Fetch paginated history via server proxy (Kraken, ~90 days max in hourly)
async function fetchFullHistory(symbol: Symbol, onProgress: (pct: number) => void): Promise<CandleData[]> {
  const all: CandleData[] = [];
  const maxDays = 90;
  const totalCandles = maxDays * 24;
  const pages = Math.ceil(totalCandles / 720);
  const candleSec = 3600;
  let pageSince = Math.floor(Date.now() / 1000) - (pages * 720 * candleSec);
  let failedPages = 0;

  for (let p = 0; p < pages; p++) {
    try {
      const res = await fetch(`/api/trading/klines?symbol=${symbol}&interval=1h&limit=720&since=${pageSince}`, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) { failedPages++; if (failedPages >= 3) break; continue; }
      const raw: any[] = await res.json();
      if (!Array.isArray(raw) || raw.length === 0) break;
      all.push(...raw.map(k=>({ time: k.time as number, open: k.open, high: k.high, low: k.low, close: k.close, volume: k.volume, utcH: new Date(k.time as number).getUTCHours() })));
      pageSince = Math.floor((raw[raw.length - 1].time as number) / 1000) + candleSec;
      failedPages = 0;
    } catch { failedPages++; if (failedPages >= 3) break; }
    onProgress(Math.min(99, ((p + 1) / pages) * 100));
    await new Promise(r => setTimeout(r, 300));
  }
  // Deduplicate and sort
  const seen = new Set<number>();
  const deduped = all.filter(c => { if (seen.has(c.time)) return false; seen.add(c.time); return true; });
  const sorted = deduped.sort((a, b) => a.time - b.time);
  if (sorted.length < 800) throw new Error(`Za mało danych historycznych (${sorted.length} świec) — Kraken API niedostępny lub zablokowany. Spróbuj za kilka minut.`);
  return sorted;
}

async function runBacktest(cfg: BtCfg): Promise<BtResult> {
  const all = await fetchCandleData(cfg.symbol);
  const windowSize = cfg.allow24h ? 300 : 500 + Math.floor(Math.random() * 200);
  const minS=30, maxS=all.length-windowSize-2;
  const start = maxS>minS ? minS+Math.floor(Math.random()*(maxS-minS)) : minS;
  return runBacktestSync(all.slice(start, start+windowSize), cfg);
}

type OptResult = { rsiMin: number; rsiMax: number; trailPct: number; sharpe: number; winRate: number; totalReturn: number; windows?: number };

async function runOptimize(cfg: BtCfg): Promise<OptResult> {
  const all = await fetchCandleData(cfg.symbol);
  const testCandles = all.slice(-800); // fixed recent window for fair comparison
  const combos: [number, number, number][] = [
    [40,60,0.15],[40,60,0.25],[40,60,0.35],
    [45,65,0.15],[45,65,0.25],[45,65,0.35],
    [50,70,0.15],[50,70,0.25],[50,70,0.35],
  ];
  let best: OptResult = { rsiMin:45, rsiMax:65, trailPct:0.25, sharpe:-999, winRate:0, totalReturn:0 };
  for (const [rsiMin, rsiMax, trailPct] of combos) {
    const r = runBacktestSync(testCandles, {...cfg, rsiMin, rsiMax, trailPct});
    if (r.trades.length >= 6 && r.sharpe > best.sharpe) {
      best = { rsiMin, rsiMax, trailPct, sharpe:r.sharpe, winRate:r.winRate, totalReturn:r.totalReturn };
    }
  }
  return best;
}

// Deep optimizer: test all combos across many random windows of full history
// async version with real per-combo progress reporting — avoids UI freeze on mobile
// onBestSoFar: called whenever a better result is found mid-run, so partial results survive page refresh
async function runDeepOptimizeAsync(
  allCandles: CandleData[],
  cfg: BtCfg,
  onProgress: (pct: number) => void,
  onBestSoFar?: (r: OptResult) => void
): Promise<OptResult> {
  const combos: [number, number, number][] = [
    [40,60,0.10],[40,60,0.15],[40,60,0.25],[40,60,0.35],
    [45,65,0.10],[45,65,0.15],[45,65,0.25],[45,65,0.35],
    [50,70,0.10],[50,70,0.15],[50,70,0.25],[50,70,0.35],
    [42,62,0.15],[42,62,0.25],[48,68,0.15],[48,68,0.25],
  ];
  const WINDOW = 800;
  const N_WINDOWS = Math.min(cfg.deepTrainWindows ?? 30, Math.floor(allCandles.length / WINDOW));
  const windows: CandleData[][] = [];
  const step = Math.floor((allCandles.length - WINDOW) / Math.max(1, N_WINDOWS));
  for (let i = 0; i < N_WINDOWS; i++) {
    windows.push(allCandles.slice(i * step, i * step + WINDOW));
  }

  let best: OptResult = { rsiMin:45, rsiMax:65, trailPct:0.25, sharpe:-999, winRate:0, totalReturn:0, windows:0 };
  for (let ci = 0; ci < combos.length; ci++) {
    const [rsiMin, rsiMax, trailPct] = combos[ci];
    let sumSharpe=0, sumWR=0, sumRet=0, valid=0;
    for (const w of windows) {
      const r = runBacktestSync(w, {...cfg, rsiMin, rsiMax, trailPct});
      if (r.trades.length >= 4) { sumSharpe+=r.sharpe; sumWR+=r.winRate; sumRet+=r.totalReturn; valid++; }
    }
    if (valid >= Math.floor(N_WINDOWS * 0.5) && sumSharpe/valid > best.sharpe) {
      best = { rsiMin, rsiMax, trailPct, sharpe:parseFloat((sumSharpe/valid).toFixed(2)), winRate:sumWR/valid, totalReturn:sumRet/valid, windows:valid };
      // save best-so-far immediately — if browser closes mid-run, partial result survives
      onBestSoFar?.(best);
    }
    // yield to browser between combos: UI stays responsive + progress bar updates
    onProgress(65 + Math.round((ci + 1) / combos.length * 35));
    await new Promise(r => setTimeout(r, 4)); // 4ms > 0ms — more reliable on mobile browsers
  }
  return best;
}

// #4 — Consecutive loss streak: returns current streak (negative = losses, positive = wins)
function calcStreak(closed: PaperTrade[]): number {
  if (!closed.length) return 0;
  let streak = 0;
  for (let i = closed.length - 1; i >= 0; i--) {
    const win = (closed[i].pnlPct ?? 0) > 0;
    if (i === closed.length - 1) { streak = win ? 1 : -1; continue; }
    if (win && streak > 0) streak++;
    else if (!win && streak < 0) streak--;
    else break;
  }
  return streak;
}

// #3 — EMA ribbon: EMA8 > EMA13 > EMA21 for bullish alignment
function calcEMARibbon(closes: number[]): { ema8: number; ema13: number; ema21: number; bullish: boolean; bearish: boolean } {
  const ema = (p: number) => {
    if (closes.length < p) return closes[closes.length-1] ?? 0;
    const k = 2/(p+1); let e = closes.slice(0,p).reduce((a,b)=>a+b,0)/p;
    for (let i=p; i<closes.length; i++) e = closes[i]*k + e*(1-k);
    return e;
  };
  const ema8 = ema(8), ema13 = ema(13), ema21 = ema(21);
  return { ema8, ema13, ema21, bullish: ema8>ema13 && ema13>ema21, bearish: ema8<ema13 && ema13<ema21 };
}

// #2 — MACD(12,26,9): returns { macd, signal, hist }
function calcMACD(closes: number[]): { macd: number; signal: number; hist: number } {
  const ema = (arr: number[], p: number) => {
    if (arr.length < p) return arr[arr.length-1] ?? 0;
    const k = 2/(p+1); let e = arr.slice(0,p).reduce((a,b)=>a+b,0)/p;
    for (let i=p; i<arr.length; i++) e = arr[i]*k + e*(1-k);
    return e;
  };
  if (closes.length < 35) return { macd:0, signal:0, hist:0 };
  // build MACD line values for last 9 bars (needed for signal EMA)
  const macdLine: number[] = [];
  for (let i = closes.length - 9; i <= closes.length; i++) {
    const sl = closes.slice(0, i);
    if (sl.length < 26) { macdLine.push(0); continue; }
    macdLine.push(ema(sl, 12) - ema(sl, 26));
  }
  const macd   = macdLine[macdLine.length-1];
  const signal = macdLine.length >= 9 ? ema(macdLine, 9) : macd;
  return { macd: parseFloat(macd.toFixed(6)), signal: parseFloat(signal.toFixed(6)), hist: parseFloat((macd-signal).toFixed(6)) };
}

// #1 — Volume confirmation: returns current candle volume / avg(last N candles)
function calcVolumeMult(candles: CandleData[], idx: number, period = 20): number {
  if (idx < period) return 1;
  const avg = candles.slice(idx - period, idx).reduce((s, c) => s + c.volume, 0) / period;
  return avg > 0 ? candles[idx].volume / avg : 1;
}

// generic EMA on an array
function emaArr(arr: number[], p: number): number {
  if (arr.length < p) return arr[arr.length - 1] ?? 0;
  const k = 2 / (p + 1); let e = arr.slice(0, p).reduce((a, b) => a + b, 0) / p;
  for (let i = p; i < arr.length; i++) e = arr[i] * k + e * (1 - k);
  return e;
}

// #6 — Stochastic RSI K (RSI normalized vs its own range, smoothed by SMA-k)
function calcStochRSI(closes: number[], period = 14, k = 3): number {
  if (closes.length < period * 2 + k) {
    // best-effort with available data
    if (closes.length < period + 2) return 50;
  }
  const series: number[] = [];
  for (let i = period + 1; i <= closes.length; i++) series.push(calcRSI(closes.slice(0, i), period));
  if (series.length < period) return 50;
  const kVals: number[] = [];
  for (let j = Math.max(period - 1, series.length - k); j < series.length; j++) {
    const window = series.slice(Math.max(0, j - period + 1), j + 1);
    const cur = series[j];
    const mn = Math.min(...window), mx = Math.max(...window);
    kVals.push(mx > mn ? (cur - mn) / (mx - mn) * 100 : 50);
  }
  const smoothed = kVals.length ? kVals.reduce((a, b) => a + b, 0) / kVals.length : 50;
  return parseFloat(smoothed.toFixed(1));
}

// #7 — Bollinger Bands. pct = position within band (0-100); width = (upper-lower)/middle %
function calcBollingerBands(closes: number[], period = 20, mult = 2): { upper: number; middle: number; lower: number; pct: number; width: number } {
  if (closes.length < period) { const p = closes[closes.length - 1] ?? 0; return { upper: p, middle: p, lower: p, pct: 50, width: 0 }; }
  const window = closes.slice(-period);
  const middle = window.reduce((a, b) => a + b, 0) / period;
  const variance = window.reduce((s, v) => s + (v - middle) ** 2, 0) / period;
  const sd = Math.sqrt(variance);
  const upper = middle + mult * sd, lower = middle - mult * sd;
  const price = closes[closes.length - 1];
  const pct = upper > lower ? (price - lower) / (upper - lower) * 100 : 50;
  const width = middle > 0 ? (upper - lower) / middle * 100 : 0;
  return { upper, middle, lower, pct: parseFloat(pct.toFixed(1)), width: parseFloat(width.toFixed(3)) };
}

// #8 — Candle body ratio: |close-open| / (high-low). doji ~0
function calcBodyRatio(c: { open: number; high: number; low: number; close: number }): number {
  const range = c.high - c.low;
  return range > 0 ? parseFloat((Math.abs(c.close - c.open) / range).toFixed(3)) : 0;
}

// #9 — EMA21 slope over last 3 bars (% change)
function calcEMASlope(closes: number[]): number {
  if (closes.length < 25) return 0;
  const now = calcEMA21(closes);
  const past = calcEMA21(closes.slice(0, -3));
  return past > 0 ? parseFloat(((now - past) / past * 100).toFixed(3)) : 0;
}

// #21 — ATR percentile vs last `period` candles
function calcATRPercentile(candles: CandleData[], currentATR: number, period = 50): number {
  if (candles.length < period + 15) return 50;
  const atrs: number[] = [];
  for (let i = candles.length - period; i < candles.length; i++) {
    const sl = candles.slice(Math.max(0, i - 14), i + 1);
    atrs.push(calcATR(sl.map(x => x.high), sl.map(x => x.low), sl.map(x => x.close)));
  }
  const below = atrs.filter(a => a < currentATR).length;
  return parseFloat((below / atrs.length * 100).toFixed(0));
}

// #48 — Rate of Change
function calcROC(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 0;
  const prev = closes[closes.length - 1 - period];
  return prev > 0 ? parseFloat(((closes[closes.length - 1] - prev) / prev * 100).toFixed(2)) : 0;
}

// #66 — Ichimoku Tenkan(9)/Kijun(26)
function calcIchimoku(highs: number[], lows: number[]): { tenkan: number; kijun: number } {
  const mid = (n: number) => {
    if (highs.length < n) return (highs[highs.length - 1] + lows[lows.length - 1]) / 2;
    const hh = Math.max(...highs.slice(-n)), ll = Math.min(...lows.slice(-n));
    return (hh + ll) / 2;
  };
  return { tenkan: mid(9), kijun: mid(26) };
}

// #69 — Heikin-Ashi: is current HA candle green?
function calcHA(candles: CandleData[], i: number): { open: number; close: number; green: boolean } {
  if (i < 1) { const c = candles[i]; return { open: c.open, close: c.close, green: c.close >= c.open }; }
  // build HA recursively over a short window for stability
  const start = Math.max(0, i - 20);
  let haOpen = (candles[start].open + candles[start].close) / 2;
  let haClose = (candles[start].open + candles[start].high + candles[start].low + candles[start].close) / 4;
  for (let j = start + 1; j <= i; j++) {
    const c = candles[j];
    haOpen = (haOpen + haClose) / 2;
    haClose = (c.open + c.high + c.low + c.close) / 4;
  }
  return { open: haOpen, close: haClose, green: haClose >= haOpen };
}

// #53 — nearest swing low (support) from recent local minima
function calcSwingLevels(candles: CandleData[], i: number): { support: number; resistance: number } {
  const lookback = Math.min(20, i);
  let support = candles[i].low, resistance = candles[i].high;
  for (let j = i - 2; j >= i - lookback && j >= 2; j--) {
    const c = candles[j];
    const isLow = c.low < candles[j - 1].low && c.low < candles[j - 2].low && c.low < candles[j + 1].low && c.low < candles[j + 2].low;
    const isHigh = c.high > candles[j - 1].high && c.high > candles[j - 2].high && c.high > candles[j + 1].high && c.high > candles[j + 2].high;
    if (isLow && c.low < candles[i].low) support = Math.max(support === candles[i].low ? 0 : support, c.low);
    if (isHigh && c.high > candles[i].high) resistance = resistance === candles[i].high ? c.high : Math.min(resistance, c.high);
  }
  return { support, resistance };
}

// ── Live filter evaluation for entry signal + confidence meter (#20) ──
type FilterResult = { label: string; pass: boolean };
function evalFilters(md: MarketData, price: number, cfg: BotConfig, dir: Direction): { filters: FilterResult[]; allPass: boolean } {
  const aboveEMA = price > md.ema21;
  const emaDist = Math.abs((price - md.ema21) / md.ema21 * 100);
  const effEmaMaxDist = cfg.dynamicEmaDist && md.atr>0 ? Math.max(0.5, md.atr/price*100*2) : cfg.emaMaxDist;
  const long = dir === "long";
  const f: FilterResult[] = [];
  f.push({ label:"EMA", pass: long ? aboveEMA : !aboveEMA });
  f.push({ label:"RSI", pass: long ? (md.rsi>=cfg.rsiMin && md.rsi<=cfg.rsiMax) : md.rsi<40 });
  f.push({ label:"EMAdist", pass: emaDist<=effEmaMaxDist });
  if (cfg.useAdx) f.push({ label:"ADX", pass: md.adx>=cfg.adxMin });
  if (cfg.volumeFilter) f.push({ label:"VOL", pass: md.volumeMult>=cfg.volumeMinMult });
  if (cfg.macdFilter) f.push({ label:"MACD", pass: long ? md.macd>md.macdSignal : md.macd<md.macdSignal });
  if (cfg.emaRibbonFilter) f.push({ label:"Ribbon", pass: long ? md.ribbonBull : md.ribbonBear });
  if (cfg.stochRsiFilter) f.push({ label:"StochRSI", pass: long ? md.stochRsi<80 : md.stochRsi>20 });
  if (cfg.bbFilter) f.push({ label:"BB", pass: long ? md.bbPct<=cfg.bbMaxPct : md.bbPct>=(100-cfg.bbMaxPct) });
  if (cfg.bodyFilter) f.push({ label:"Body", pass: md.bodyRatio>=cfg.bodyMinRatio });
  if (cfg.emaSlopeFilter) f.push({ label:"Slope", pass: long ? md.emaSlope>0 : md.emaSlope<0 });
  if (cfg.rocFilter) f.push({ label:"ROC", pass: long ? md.roc>0 : md.roc<0 });
  if (cfg.ichimokuFilter) f.push({ label:"Ichi", pass: long ? md.tenkan>md.kijun : md.tenkan<md.kijun });
  if (cfg.pvsEmaFilter) f.push({ label:"PVS", pass: long ? md.priceVsEma>=cfg.pvsEmaMin : md.priceVsEma<=-cfg.pvsEmaMin });
  if (cfg.haFilter) f.push({ label:"HA", pass: long ? md.haGreen : !md.haGreen });
  if (cfg.adxSlope) f.push({ label:"ADX↑", pass: md.adxRising });
  if (cfg.rsiRising) f.push({ label:"RSI↑", pass: md.rsiRising });
  if (cfg.volumeTrend) f.push({ label:"VOL↑", pass: md.volumeRising });
  if (cfg.wickFilter && long) f.push({ label:"Wick", pass: md.upperWickRatio<=2 });
  if (cfg.requirePrevBull) f.push({ label:"PrevBull", pass: long ? md.prevBull : !md.prevBull });
  if (cfg.bbSqueezeFilter) f.push({ label:"Squeeze", pass: md.bbSqueeze || (long?price>md.bbUpper:price<md.bbLower) });
  return { filters: f, allPass: f.every(x => x.pass) };
}

// #82 — composite session quality score (0-10)
function sessionScore(md: MarketData): number {
  let s = 0;
  if (md.adx >= 25) s += 2;
  if (md.volumeMult >= 1.2) s += 2;
  if (md.ribbonBull) s += 2;
  if (md.macd > md.macdSignal) s += 2;
  if (md.rsi >= 50 && md.rsi <= 65) s += 2;
  return s;
}

// ── analytics over closed trades (#16-#19,#22,#28-#30,#46,#47) ──
function tradeAnalytics(closed: PaperTrade[]) {
  const pcts = closed.map(t => t.pnlPct ?? 0);
  const wins = closed.filter(t => (t.pnlPct ?? 0) > 0);
  const losses = closed.filter(t => (t.pnlPct ?? 0) <= 0);
  const wr = closed.length ? wins.length / closed.length * 100 : 0;
  const avgWin = wins.length ? wins.reduce((s,t)=>s+(t.pnlPct??0),0)/wins.length : 0;
  const avgLoss = losses.length ? losses.reduce((s,t)=>s+(t.pnlPct??0),0)/losses.length : 0;
  const ev = wr/100*avgWin - (1-wr/100)*Math.abs(avgLoss); // #16
  const sumWins = wins.reduce((s,t)=>s+(t.pnlPct??0),0);
  const sumLoss = Math.abs(losses.reduce((s,t)=>s+(t.pnlPct??0),0));
  const pf = sumLoss>0 ? sumWins/sumLoss : (sumWins>0?99:0); // #17
  const wlRatio = Math.abs(avgLoss)>0 ? avgWin/Math.abs(avgLoss) : 0; // #18
  const rolling = closed.slice(-20); // #19
  const rollWr = rolling.length ? rolling.filter(t=>(t.pnlPct??0)>0).length/rolling.length*100 : 0;
  // equity curve / max DD / sharpe (#46,#47)
  let eq=100, peak=100, maxDD=0;
  for (const t of closed) { eq*=(1+(t.pnlPct??0)/100); if(eq>peak)peak=eq; const dd=(peak-eq)/peak*100; if(dd>maxDD)maxDD=dd; }
  const totalReturn = eq-100;
  const mean = pcts.length ? pcts.reduce((a,b)=>a+b,0)/pcts.length : 0;
  const variance = pcts.length ? pcts.reduce((s,r)=>s+(r-mean)**2,0)/pcts.length : 0;
  const sharpe = variance>0 ? mean/Math.sqrt(variance)*Math.sqrt(252) : 0;
  const calmar = maxDD>0 ? totalReturn/maxDD : (totalReturn>0?99:0); // #29
  // direction split (#28)
  const longs = closed.filter(t=>t.direction==="long");
  const shorts = closed.filter(t=>t.direction==="short");
  const longWr = longs.length ? longs.filter(t=>(t.pnlPct??0)>0).length/longs.length*100 : 0;
  const shortWr = shorts.length ? shorts.filter(t=>(t.pnlPct??0)>0).length/shorts.length*100 : 0;
  // avg hold (#30)
  const durs = closed.filter(t=>t.exitTime).map(t=>(new Date(t.exitTime!).getTime()-new Date(t.entryTime).getTime())/3600000);
  const avgHold = durs.length ? durs.reduce((a,b)=>a+b,0)/durs.length : 0;
  return { wr, avgWin, avgLoss, ev, pf, wlRatio, rollWr, maxDD, sharpe, totalReturn, calmar, longWr, shortWr, longs:longs.length, shorts:shorts.length, avgHold,
    longW:longs.filter(t=>(t.pnlPct??0)>0).length, longL:longs.filter(t=>(t.pnlPct??0)<=0).length,
    shortW:shorts.filter(t=>(t.pnlPct??0)>0).length, shortL:shorts.filter(t=>(t.pnlPct??0)<=0).length };
}

// #22 performance grade A-F
function performanceGrade(sharpe: number, wr: number, pf: number): string {
  if (sharpe>1.5 && wr>60 && pf>1.5) return "A";
  if (sharpe>1 && wr>55 && pf>1.2) return "B";
  if (sharpe>0.5 && wr>45 && pf>1) return "C";
  if (sharpe>0 && wr>40) return "D";
  return "F";
}

// #23/#96 Kelly criterion
function kellyFraction(wr: number, avgWin: number, avgLoss: number): number {
  const p = wr/100, q = 1-p, b = Math.abs(avgLoss)>0 ? avgWin/Math.abs(avgLoss) : 0;
  if (b<=0) return 0;
  return (p*b - q)/b * 100;
}

// #93 ASCII sparkline
function sparkline(vals: number[]): string {
  if (!vals.length) return "";
  const blocks = "▁▂▃▄▅▆▇█";
  const mn = Math.min(...vals), mx = Math.max(...vals), range = mx-mn || 1;
  return vals.map(v => blocks[Math.min(7, Math.floor((v-mn)/range*7))]).join("");
}

function adaptFromTrades(closed: PaperTrade[], cfg: BotConfig): Partial<BotConfig> | null {
  // Need at least 15 trades for meaningful signal; use last 15 for context
  const recent = closed.slice(-15);
  if (recent.length < 10) return null;
  const wr = recent.filter(t=>(t.pnlPct??0)>0).length / recent.length;
  // Only adapt when there's a clear problem: WR < 40% over 10+ trades
  if (wr >= 0.42) return null;

  const slCount    = recent.filter(t=>t.reason==="stop_loss").length;
  const trailCount = recent.filter(t=>t.reason==="trail_stop").length;
  const wins   = recent.filter(t=>(t.pnlPct??0)>0);
  const losses = recent.filter(t=>(t.pnlPct??0)<=0);
  const avgWin  = wins.length   ? wins.reduce((s,t)=>s+(t.pnlPct??0),0)/wins.length   : 0;
  const avgLoss = losses.length ? Math.abs(losses.reduce((s,t)=>s+(t.pnlPct??0),0)/losses.length) : 0.001;
  const patch: Partial<BotConfig> = {};

  // Trail fires too often → loosen by tiny step, min 0.15%
  if (trailCount/recent.length > 0.65)
    patch.trailPct = parseFloat(Math.min(cfg.trailPct + 0.03, 0.8).toFixed(2));
  // R:R clearly bad AND trail rarely fires → tighten slightly, floor 0.15%
  else if (trailCount/recent.length < 0.15 && avgLoss > avgWin * 2 && cfg.trailPct > 0.15)
    patch.trailPct = parseFloat(Math.max(cfg.trailPct - 0.03, 0.15).toFixed(2));

  // Many direct SL hits (>60%) → entry quality poor → tighten RSI by 1pt
  // Hard floor: RSI window never narrower than [44, 66] (22pt minimum range)
  if (slCount/recent.length > 0.6) {
    const newMin = Math.min(cfg.rsiMin + 1, 52);
    const newMax = Math.max(cfg.rsiMax - 1, newMin + 14); // keep ≥14pt window
    if (newMin !== cfg.rsiMin || newMax !== cfg.rsiMax) { patch.rsiMin = newMin; patch.rsiMax = newMax; }
  }

  return Object.keys(patch).length > 0 ? patch : null;
}

// ─── Storage ──────────────────────────────────────────────────────────────────

const KEY = "resell_trading_bot_v1";
const DEFAULTS: BotConfig = { enabled:false, autoMode:false, allowShorts:true, symbol:"BTCUSDT", capital:1000, riskPct:10, stopLoss:0.4, takeProfit:0.6, useAdx:false, adxMin:20, dynamicExits:false, atrSlMul:1.5, atrTpMul:2.0, trailStop:true, trailPct:0.25, trailActivation:0, rsiMin:45, rsiMax:65, emaMaxDist:2.0, requirePrevBull:false, allow24h:false, maxHoldCandles:3, volumeFilter:true, volumeMinMult:1.2, macdFilter:true, emaRibbonFilter:false, drawdownProtection:true, breakEvenStop:true, breakEvenTriggerPct:50, learningEnabled:true,
  stochRsiFilter:false,
  bbFilter:false, bbMaxPct:80,
  bodyFilter:false, bodyMinRatio:0.3,
  emaSlopeFilter:false,
  candleConfirm:false, candleConfirmN:2,
  rsiExitFilter:false, rsiExitHigh:78, rsiExitLow:22,
  feeSimulation:false, feePct:0.05,
  maxConsecLosses:3, autoPauseOnLosses:true,
  compoundMode:false, startingCapital:1000,
  recoveryMode:true, recoveryDrawdownPct:5.0,
  kellyEnabled:false, kellyFraction:0.25,
  volScaling:true,
  dailyLossLimit:3.0, dailyCircuitBreaker:true, dailyStartCapital:1000, dailyStartDate:"",
  equityCurveFilter:false,
  signalConfirmation:false,
  adxSlope:false,
  volumeTrend:false,
  revengeCooldown:true,
  wickFilter:false,
  multiSymbol:false,
  rocFilter:false,
  rsiRising:false,
  dynamicEmaDist:false,
  srFilter:false,
  closePosFilter:false,
  prevBullCandles:1,
  ichimokuFilter:false,
  pvsEmaFilter:false, pvsEmaMin:0.1,
  bbSqueezeFilter:false,
  haFilter:false,
  higherLowFilter:false,
  deepTrainWindows:30,
  optimizeFor:"sharpe",
  sessionScoreGate:false, minSessionScore:4,
  reoptInterval:20,
  profitLock:false, profitLockPct:50,
  sessionStart:21, sessionEnd:23,
  autoDisableAfterSession:true,
  leverage:1,
  leverageAuto:false,
  filterAutoMode:false,
  strategyAutoMode:false,
  trades:[] };

function loadConfig(): BotConfig {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw) as BotConfig;
      // Guard: if micro-adaptation over-narrowed RSI window, restore to sensible range
      if (saved.rsiMax - saved.rsiMin < 14) {
        saved.rsiMin = DEFAULTS.rsiMin;
        saved.rsiMax = DEFAULTS.rsiMax;
      }
      // Guard: trail too tight from over-adaptation
      if (saved.trailPct < 0.15) saved.trailPct = 0.15;
      return { ...DEFAULTS, ...saved };
    }
  } catch {}
  return { ...DEFAULTS };
}
function saveConfig(c: BotConfig) { localStorage.setItem(KEY, JSON.stringify(c)); }
const REASON_LABEL: Record<TradeReason,string> = { session_end:"Koniec sesji", stop_loss:"Stop Loss", take_profit:"Take Profit", trail_stop:"Trailing Stop", rsi_extreme:"RSI Exit" };

// ─── Learning memory — persists across restarts ───────────────────────────────

type LearningAdaptation = { time: string; change: string; tradeCount: number };

type LearningMemory = {
  adaptCount: number;
  autoOptCount: number;
  deepResult: OptResult | null;
  optResult: OptResult | null;
  // ensemble: history of last 5 Deep Train runs + consensus
  deepHistory: OptResult[];      // up to 5 past Deep Train results
  optHistory: OptResult[];       // up to 5 past Auto-Opt results
  ensembleResult: OptResult | null; // Sharpe-weighted consensus across all runs
  activityLog: LogEntry[];
  adaptations: LearningAdaptation[];
};

const LEARN_KEY = "resell_trading_bot_learning_v1";

// Sharpe-weighted consensus across multiple optimization runs.
// More runs = more stable params; if runs disagree, lower-Sharpe ones are down-weighted.
function calcEnsemble(results: OptResult[]): OptResult | null {
  if (!results.length) return null;
  const pos = results.filter(r => r.sharpe > 0);
  const pool = pos.length >= 1 ? pos : results; // fall back to all if all sharpe<=0
  const totalW = pool.reduce((s, r) => s + Math.max(r.sharpe, 0.01), 0);
  let rsiMin=0, rsiMax=0, trailPct=0, sharpe=0, winRate=0, totalReturn=0;
  for (const r of pool) {
    const w = Math.max(r.sharpe, 0.01) / totalW;
    rsiMin     += r.rsiMin     * w;
    rsiMax     += r.rsiMax     * w;
    trailPct   += r.trailPct   * w;
    sharpe     += r.sharpe     * w;
    winRate    += r.winRate    * w;
    totalReturn+= r.totalReturn* w;
  }
  return {
    rsiMin:    Math.round(rsiMin),
    rsiMax:    Math.round(rsiMax),
    trailPct:  parseFloat(trailPct.toFixed(2)),
    sharpe:    parseFloat(sharpe.toFixed(2)),
    winRate,
    totalReturn,
    windows:   pool.reduce((s,r)=>s+(r.windows??0),0),
  };
}

function loadLearning(): LearningMemory {
  const empty: LearningMemory = { adaptCount:0, autoOptCount:0, deepResult:null, optResult:null,
    deepHistory:[], optHistory:[], ensembleResult:null, activityLog:[], adaptations:[] };
  try {
    const raw = localStorage.getItem(LEARN_KEY);
    if (raw) {
      const m = JSON.parse(raw) as LearningMemory;
      if (!m.deepHistory) m.deepHistory = m.deepResult ? [m.deepResult] : [];
      if (!m.optHistory)  m.optHistory  = m.optResult  ? [m.optResult]  : [];
      // auto-heal: filter out individual -999 results (0-window broken runs)
      const cleaned = m.deepHistory.filter(r => r.sharpe > -900);
      if (cleaned.length !== m.deepHistory.length) {
        m.deepHistory = cleaned;
        m.deepResult = cleaned.length > 0 ? cleaned[cleaned.length - 1] : null;
        m.ensembleResult = null;
        localStorage.setItem(LEARN_KEY, JSON.stringify(m));
      }
      if (!m.ensembleResult) m.ensembleResult = calcEnsemble(m.deepHistory);
      return m;
    }
  } catch {}
  return empty;
}

function saveLearning(m: LearningMemory) {
  try { localStorage.setItem(LEARN_KEY, JSON.stringify(m)); } catch {}
}

// Auto-filters: decide which filters to enable based on Deep Train quality + market
type AutoFilterSet = {
  volumeFilter: boolean; macdFilter: boolean; emaRibbonFilter: boolean;
  stochRsiFilter: boolean; bbFilter: boolean; emaSlopeFilter: boolean;
  adxSlope: boolean; volumeTrend: boolean; wickFilter: boolean;
  ichimokuFilter: boolean; haFilter: boolean; rocFilter: boolean;
  rsiRising: boolean; sessionScoreGate: boolean;
};
function calcAutoFilters(deepHistory: OptResult[], md: MarketData | null): AutoFilterSet {
  const valid = deepHistory.filter(r => r.sharpe > 0 && r.winRate > 0 && r.windows && r.windows >= 5);
  const avgSharpe = valid.length ? valid.reduce((s,r)=>s+r.sharpe,0)/valid.length : 0;
  const avgWR     = valid.length ? valid.reduce((s,r)=>s+r.winRate,0)/valid.length : 0;
  // tier based on Deep Train quality
  const tier = avgSharpe >= 3.5 && avgWR >= 78 ? 3 : avgSharpe >= 2.5 && avgWR >= 68 ? 2 : avgSharpe >= 1.5 ? 1 : 0;
  // market conditions
  const strongVol  = md ? md.volumeMult >= 1.5 : false;
  const goodADX    = md ? md.adx >= 25 : false;
  const macdBull   = md ? md.macd > md.macdSignal : false;
  const ribbonOk   = md ? md.ribbonBull || md.ribbonBear : false;
  return {
    volumeFilter:    tier >= 1,                        // zawsze przy choć trochę danych
    macdFilter:      tier >= 1,                        // zawsze
    emaRibbonFilter: tier >= 2 && ribbonOk,            // przy dobrych wynikach
    stochRsiFilter:  tier >= 2,                        // filtruje wykupienie
    bbFilter:        tier >= 3,                        // tylko przy świetnych wynikach
    emaSlopeFilter:  tier >= 2 && goodADX,             // trend musi rosnąć
    adxSlope:        tier >= 2 && goodADX,             // ADX rośnie = trend się wzmacnia
    volumeTrend:     tier >= 2 && strongVol,           // rosnący wolumen
    wickFilter:      tier >= 1,                        // podstawowy filtr jakości świecy
    ichimokuFilter:  tier >= 3,                        // zaawansowany — tylko top wyniki
    haFilter:        tier >= 2 && (macdBull || ribbonOk),
    rocFilter:       tier >= 2,
    rsiRising:       tier >= 3,
    sessionScoreGate:tier >= 2,
  };
}

// Auto-leverage: analyze Deep Train history and pick safe leverage
function calcAutoLeverage(deepHistory: OptResult[]): number {
  const valid = deepHistory.filter(r => r.sharpe > 0 && r.winRate > 0 && r.windows && r.windows >= 5);
  if (valid.length < 2) return 1; // need at least 2 solid runs
  const avgSharpe = valid.reduce((s, r) => s + r.sharpe, 0) / valid.length;
  const avgWR     = valid.reduce((s, r) => s + r.winRate, 0) / valid.length;
  const minSharpe = Math.min(...valid.map(r => r.sharpe)); // worst run safety check
  if (avgSharpe >= 4.0 && avgWR >= 82 && minSharpe >= 2.0) return 3;
  if (avgSharpe >= 2.8 && avgWR >= 72 && minSharpe >= 1.5) return 2;
  return 1;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TradingBot() {
  const [config, setConfig] = useState<BotConfig>(loadConfig);

  // Learning memory — load from localStorage on mount
  const learningRef = useRef<LearningMemory>(loadLearning());
  const saveLearningDebounced = useCallback(() => {
    saveLearning(learningRef.current);
  }, []);

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
  const [optLoading, setOptLoading] = useState(false);
  const [optResult, setOptResult]   = useState<OptResult | null>(() => loadLearning().optResult);
  const [deepLoading, setDeepLoading]   = useState(false);
  const [deepProgress, setDeepProgress] = useState(0);
  const [deepResult, setDeepResult]     = useState<OptResult | null>(() => loadLearning().deepResult);
  const fullHistoryRef = useRef<{ symbol: Symbol; candles: CandleData[] } | null>(null);
  const [activityLog, setActivityLog]   = useState<LogEntry[]>(() => loadLearning().activityLog);
  const logRef         = useRef<HTMLDivElement>(null);
  const prevSessionRef = useRef<boolean | null>(null);
  // Restore learning counters from memory so bot continues from where it left off
  const adaptCountRef  = useRef(loadLearning().adaptCount);
  const autoOptRef     = useRef(loadLearning().autoOptCount);
  const rsiSparkRef    = useRef<number[]>([]);      // #93 last 20 RSI readings
  const signalConfirmRef = useRef<{dir:Direction|null;count:number}>({dir:null,count:0}); // #27
  const lastSLTimeRef  = useRef<number>(0);          // #33 anti-revenge cooldown
  const [multiScan, setMultiScan] = useState<Record<string,number>|null>(null); // #35 confidence per symbol
  const [wfResult, setWfResult] = useState<{train:OptResult;test:BtResult}|null>(null); // #37
  const [multiBtResult, setMultiBtResult] = useState<BtResult[]|null>(null); // #40
  const [resetConfirm, setResetConfirm] = useState(false); // #43
  const [usingDeepParams, setUsingDeepParams] = useState(false); // #97

  // Live trading state
  const [liveMode, setLiveMode] = useState(false);
  const [liveUsdt, setLiveUsdt] = useState("9");
  const liveQtyRef = useRef<number>(0);
  const liveModeRef = useRef(false);
  const liveUsdtRef = useRef(9);
  const [liveBalance, setLiveBalance] = useState<number | null>(null);
  const [liveBalanceCoin, setLiveBalanceCoin] = useState<string>("USDT");
  const [liveSessionPnl, setLiveSessionPnl] = useState(0);
  const liveSessionPnlRef = useRef(0);
  // Live BTC price ticker
  const [liveTicker, setLiveTicker] = useState<{price:number;change24h:number;high24h:number;low24h:number}|null>(null);
  // Server-side bot state
  const [serverBotRunning, setServerBotRunning] = useState(false);
  const [serverBotLogs, setServerBotLogs] = useState<{time:string;msg:string;type:string}[]>([]);
  const [serverPosition, setServerPosition] = useState<{direction:string;entryPrice:number;qty:number;entryTime:string}|null>(null);
  const [serverPnl, setServerPnl] = useState(0);
  const [serverBotLoading, setServerBotLoading] = useState(false);
  const [serverBotError, setServerBotError] = useState<string|null>(null);

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
    setActivityLog(prev => {
      const entry: LogEntry = { time:logTime(), msg, type };
      const next = [...prev.slice(-149), entry];
      // persist last 150 log entries
      learningRef.current = { ...learningRef.current, activityLog: next };
      saveLearning(learningRef.current);
      return next;
    });
  }, [saveLearningDebounced]);

  const fetchLiveBalance = useCallback(async () => {
    if (!hasBybitKeys()) return;
    const { apiKey, secret, testnet } = getBybitKeys();
    try {
      const r = await fetch("/api/bybit/balance", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ apiKey, secret, testnet }) });
      const d = await r.json();
      if (d.error) { setLiveBalance(-1); }
      else { setLiveBalance(d.balance ?? 0); setLiveBalanceCoin(d.coin ?? "USDT"); }
    } catch (e: any) { setLiveBalance(-1); }
  }, []);

  const placeLiveOrder = useCallback(async (side: "long"|"short", price: number) => {
    if (!hasBybitKeys()) return;
    const { apiKey, secret, testnet } = getBybitKeys();
    const usdt = liveUsdtRef.current;
    const effLev = config.leverageAuto ? calcAutoLeverage(learningRef.current.deepHistory) : config.leverage;
    const rawQty = (usdt * effLev) / price;
    const decimals = config.symbol === "BTCUSDT" ? 3 : 2;
    const qty = Math.max(parseFloat(rawQty.toFixed(decimals)), config.symbol === "BTCUSDT" ? 0.001 : 0.01);
    liveQtyRef.current = qty;
    try {
      const r = await fetch("/api/bybit/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, secret, testnet, symbol: config.symbol, side, qty, leverage: effLev }),
      });
      const d = await r.json();
      if (d.error) addLog(`🔴 LIVE błąd zlecenia: ${d.error}`, "warn");
      else addLog(`🟢 LIVE ${side.toUpperCase()} ${config.symbol.replace("USDT","")} qty=${qty} @ $${fmt(price)} | ID: ${d.orderId}`, "buy");
      fetchLiveBalance();
    } catch (e: any) { addLog(`🔴 LIVE błąd: ${e.message}`, "warn"); }
  }, [config.symbol, config.leverage, config.leverageAuto, addLog, fetchLiveBalance]);

  const closeLiveOrder = useCallback(async (side: "long"|"short", price: number, reason: string, pnlPct?: number) => {
    if (!hasBybitKeys()) return;
    const { apiKey, secret, testnet } = getBybitKeys();
    const qty = liveQtyRef.current;
    if (qty <= 0) return;
    try {
      const r = await fetch("/api/bybit/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, secret, testnet, symbol: config.symbol, side, qty }),
      });
      const d = await r.json();
      if (d.error) addLog(`🔴 LIVE błąd zamknięcia: ${d.error}`, "warn");
      else {
        const pnlUsdt = pnlPct != null ? (liveUsdtRef.current * pnlPct / 100) : 0;
        liveSessionPnlRef.current += pnlUsdt;
        setLiveSessionPnl(liveSessionPnlRef.current);
        addLog(`🔴 LIVE CLOSE ${side.toUpperCase()} @ $${fmt(price)} — ${reason}${pnlPct != null ? ` | ${pnlPct>=0?"+":""}${pnlPct.toFixed(2)}% (${pnlUsdt>=0?"+":""}${pnlUsdt.toFixed(2)} USDT)` : ""}`, "sell");
      }
      liveQtyRef.current = 0;
      setTimeout(fetchLiveBalance, 2000);
    } catch (e: any) { addLog(`🔴 LIVE błąd zamknięcia: ${e.message}`, "warn"); }
  }, [config.symbol, addLog, fetchLiveBalance]);

  const fetchData = useCallback(async () => {
    try {
      const [tRes, kRes, k4Res] = await Promise.all([
        fetch(`/api/trading/ticker?symbol=${config.symbol}`),
        fetch(`/api/trading/klines?symbol=${config.symbol}&interval=1h&limit=200`),
        fetch(`/api/trading/klines?symbol=${config.symbol}&interval=4h&limit=60`),
      ]);
      if (!tRes.ok || !kRes.ok) throw new Error(`Błąd danych ${tRes.status}`);
      const td = await tRes.json();
      if (td.error) throw new Error(td.error);
      const klines: any[] = await kRes.json();
      if (!Array.isArray(klines) || klines.length === 0) throw new Error("Brak danych świec");
      const closes  = klines.map(k=>parseFloat(k.close ?? k[4]));
      const opens   = klines.map(k=>parseFloat(k.open  ?? k[1]));
      const highs   = klines.map(k=>parseFloat(k.high  ?? k[2]));
      const lows    = klines.map(k=>parseFloat(k.low   ?? k[3]));
      const volumes = klines.map(k=>parseFloat(k.volume ?? k[5]));
      const candleArr: CandleData[] = klines.map(k=>({ time:k.time??k[0], open:parseFloat(k.open??k[1]), high:parseFloat(k.high??k[2]), low:parseFloat(k.low??k[3]), close:parseFloat(k.close??k[4]), volume:parseFloat(k.volume??k[5]), utcH:new Date(k.time??k[0]).getUTCHours() }));
      const last = closes.length-1;
      setTicker({ price: td.price, change24h: td.change24h, high24h: td.high24h, low24h: td.low24h });
      const ema21val = calcEMA21(closes);
      const avgVol = volumes.slice(-21, -1).reduce((a,b)=>a+b,0) / 20;
      const volMult = avgVol > 0 ? volumes[last] / avgVol : 1;
      const macdVals = calcMACD(closes);
      const ribbon = calcEMARibbon(closes);
      const rsiNow = calcRSI(closes);
      const atrNow = calcATR(highs, lows, closes);
      const adxNow = calcADX(highs, lows, closes);
      const bb = calcBollingerBands(closes);
      const ich = calcIchimoku(highs, lows);
      const ha = calcHA(candleArr, candleArr.length-1);
      // #31 ADX rising vs 3 bars ago
      const adxPast = closes.length>=33 ? calcADX(highs.slice(0,-3), lows.slice(0,-3), closes.slice(0,-3)) : adxNow;
      // #51 RSI rising vs 2 bars ago
      const rsiPast = closes.length>=3 ? calcRSI(closes.slice(0,-2)) : rsiNow;
      // #68 BB squeeze
      const bbWidths:number[]=[];
      for(let k=closes.length-50;k<closes.length;k++){ if(k<20)continue; bbWidths.push(calcBollingerBands(closes.slice(0,k+1)).width); }
      const sortedW=[...bbWidths].sort((a,b)=>a-b); const p20W=sortedW.length?sortedW[Math.floor(sortedW.length*0.2)]:0;
      const upperWick=highs[last]-Math.max(opens[last],closes[last]); const bodyAbs=Math.abs(closes[last]-opens[last])||1e-9;
      // #86 4H RSI
      let rsi4h=50; try { const k4:any[]=await k4Res.json(); if(Array.isArray(k4)) rsi4h=calcRSI(k4.map((k:any)=>parseFloat(k.close??k[4]))); } catch {}
      // #93 sparkline
      rsiSparkRef.current = [...rsiSparkRef.current.slice(-19), rsiNow];
      setMd({
        rsi: rsiNow, ema21: ema21val,
        priceVsEma: (closes[last]-ema21val)/ema21val*100,
        momentum: (closes[last]-opens[last])/opens[last]*100,
        volatility: (highs[last]-lows[last])/opens[last]*100,
        atr: atrNow,
        adx: adxNow,
        prevBull: last >= 1 && closes[last-1] > opens[last-1],
        volumeMult: parseFloat(volMult.toFixed(2)),
        macd: macdVals.macd, macdSignal: macdVals.signal, macdHist: macdVals.hist,
        ema8: ribbon.ema8, ema13: ribbon.ema13, ribbonBull: ribbon.bullish, ribbonBear: ribbon.bearish,
        stochRsi: calcStochRSI(closes),
        bbPct: bb.pct, bbUpper: bb.upper, bbLower: bb.lower, bbWidth: bb.width, bbSqueeze: bbWidths.length>=10 ? (bb.width<=p20W) : false,
        bodyRatio: calcBodyRatio({open:opens[last],high:highs[last],low:lows[last],close:closes[last]}),
        emaSlope: calcEMASlope(closes),
        atrPercentile: calcATRPercentile(candleArr, atrNow),
        roc: calcROC(closes),
        tenkan: ich.tenkan, kijun: ich.kijun,
        haGreen: ha.green,
        adxRising: adxNow > adxPast,
        rsiRising: rsiNow > rsiPast,
        volumeRising: volumes.length>=3 && volumes[last]>volumes[last-1] && volumes[last-1]>volumes[last-2],
        upperWickRatio: parseFloat((upperWick/bodyAbs).toFixed(2)),
        rsi4h,
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
      if (!config.allow24h && !sess.inSession) return;

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
      const closedNow = config.trades.filter(t=>t.status==="closed");
      // #13 auto-pause after maxConsecLosses
      if (config.autoPauseOnLosses) {
        const st = calcStreak(closedNow);
        if (st <= -config.maxConsecLosses) { update({enabled:false}); addLog(`⛔ Auto-pauza: ${Math.abs(st)} strat z rzędu (limit ${config.maxConsecLosses}) — bot zatrzymany, włącz ręcznie`, "warn"); return; }
      }
      // #25 daily circuit breaker
      if (config.dailyCircuitBreaker) {
        const today = new Date().toISOString().slice(0,10);
        if (config.dailyStartDate !== today) { update({dailyStartDate:today, dailyStartCapital:config.capital}); }
        else {
          const todayTrades = closedNow.filter(t=>t.exitTime && t.exitTime.slice(0,10)===today);
          const todayPnl = todayTrades.reduce((s,t)=>s+(t.pnl??0),0);
          const dailyPct = config.dailyStartCapital>0 ? todayPnl/config.dailyStartCapital*100 : 0;
          if (dailyPct <= -config.dailyLossLimit) { update({enabled:false}); addLog(`⛔ Dzienny circuit breaker: ${dailyPct.toFixed(1)}% < -${config.dailyLossLimit}% — bot zatrzymany`, "warn"); return; }
        }
      }
      // #33 anti-revenge cooldown — 1h after a stop_loss
      if (config.revengeCooldown && lastSLTimeRef.current>0 && Date.now()-lastSLTimeRef.current < 3600_000) return;

      const evalL = evalFilters(md, ticker.price, config, "long");
      const evalS = evalFilters(md, ticker.price, config, "short");
      // #82 session score gate
      const scoreOk = !config.sessionScoreGate || sessionScore(md) >= config.minSessionScore;
      const isLong  = aboveEMA && rsi >= config.rsiMin && rsi <= config.rsiMax && evalL.allPass && scoreOk;
      const isShort = config.allowShorts && !aboveEMA && rsi < 40 && evalS.allPass && scoreOk;

      // #27 signal confirmation — require 2 consecutive ticks
      if (config.signalConfirmation) {
        const dir: Direction|null = isLong ? "long" : isShort ? "short" : null;
        if (!dir) { signalConfirmRef.current = {dir:null,count:0}; }
        else if (signalConfirmRef.current.dir === dir) { signalConfirmRef.current.count++; }
        else { signalConfirmRef.current = {dir,count:1}; }
        if (dir && signalConfirmRef.current.count < 2) {
          addLog(`⧖ Sygnał ${dir.toUpperCase()} — potwierdzenie ${signalConfirmRef.current.count}/2`, "info");
          return;
        }
      }

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
      // #4 drawdown protection: halve size after ≥2 consecutive losses
      const streak = config.drawdownProtection ? calcStreak(closedNow) : 0;
      let sizeMultiplier = streak <= -2 ? 0.5 : 1.0;
      // #15 recovery mode — half risk while in drawdown from peak equity
      let recoveryActive = false;
      if (config.recoveryMode) {
        let eq=config.startingCapital||config.capital, peak=eq;
        for (const t of closedNow) { eq+=(t.pnl??0); if(eq>peak)peak=eq; }
        const dd = peak>0 ? (peak-eq)/peak*100 : 0;
        if (dd > config.recoveryDrawdownPct) { sizeMultiplier *= 0.5; recoveryActive = true; }
      }
      // #24 volatility-scaled sizing
      if (config.volScaling) {
        if (md.atrPercentile > 70) sizeMultiplier *= 0.6;
        else if (md.atrPercentile < 30) sizeMultiplier *= 1.2;
      }
      // #26 equity-curve filter — reduce risk when below EMA10 of equity returns
      if (config.equityCurveFilter && closedNow.length >= 10) {
        const rets:number[]=[]; let cum=0;
        for (const t of closedNow) { cum+=(t.pnlPct??0); rets.push(cum); }
        const ema10 = emaArr(rets, 10);
        if (rets[rets.length-1] < ema10) sizeMultiplier *= 0.7;
      }
      // #23 Kelly sizing override
      let effRisk = config.riskPct;
      if (config.kellyEnabled && closedNow.length >= 10) {
        const a = tradeAnalytics(closedNow);
        const kelly = kellyFraction(a.wr, a.avgWin, a.avgLoss) * config.kellyFraction;
        effRisk = Math.max(1, Math.min(20, kelly));
      }
      const size = config.capital * (effRisk/100) * sizeMultiplier;
      if (streak <= -2) addLog(`⚠️ Drawdown protection: ${Math.abs(streak)} straty z rzędu → rozmiar ×0.5`, "warn");
      if (recoveryActive) addLog(`🔧 RECOVERY MODE — obsunięcie > ${config.recoveryDrawdownPct}%, rozmiar zmniejszony`, "warn");
      const slPct = config.dynamicExits && atr > 0 ? atr/ticker.price*100*config.atrSlMul : config.stopLoss;
      const tpPct = config.dynamicExits && atr > 0 ? atr/ticker.price*100*config.atrTpMul : config.takeProfit;
      // #57 trade meta snapshot
      const meta: TradeMeta = { rsi: md.rsi, adx: md.adx, volumeMult: md.volumeMult, atrPercentile: md.atrPercentile, ribbonBull: md.ribbonBull };
      update({ trades:[...config.trades, { id:Date.now(), symbol:config.symbol, direction, entryTime:new Date().toISOString(), entryPrice:ticker.price, size, status:"open", slPct, tpPct, trailRef:ticker.price, peakGainPct:0, meta }] });
      addLog(`▶ ${direction.toUpperCase()} ${config.symbol.replace("USDT","")} @ $${fmt(ticker.price)} | RSI ${rsi} | ADX ${adx}${config.dynamicExits?" | ATR exits":""}${config.trailStop?" | Trail":""}  | SL ${slPct.toFixed(1)}% / TP ${tpPct.toFixed(1)}%`, "buy");
      if (liveModeRef.current) placeLiveOrder(direction, ticker.price);
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
    // #5 break-even: once pct >= breakEvenTriggerPct% of TP, SL moves to entry
    const beTrigger = tpPct * (config.breakEvenTriggerPct / 100);
    const beActive  = config.breakEvenStop && pct >= beTrigger;
    const beSLPrice = beActive ? openTrade.entryPrice : initSLPrice;
    // #81/#91 peak gain tracking + profit lock
    const peakGainPct = Math.max(openTrade.peakGainPct ?? 0, pct);
    let lockSLPrice = openTrade.direction === "long" ? initSLPrice : initSLPrice;
    if (config.profitLock && peakGainPct > 0) {
      const floorGain = peakGainPct * (1 - config.profitLockPct/100);
      lockSLPrice = openTrade.direction === "long"
        ? openTrade.entryPrice * (1 + floorGain/100)
        : openTrade.entryPrice * (1 - floorGain/100);
    }
    const effectiveSLPrice = openTrade.direction === "long"
      ? Math.max(initSLPrice, trailSLPrice, beSLPrice, lockSLPrice)
      : Math.min(initSLPrice, trailSLPrice, beSLPrice, lockSLPrice);

    // Time-based exit for 24h mode
    const tradeAgeH = (Date.now() - new Date(openTrade.entryTime).getTime()) / 3600000;
    let reason: TradeReason | null = null;
    if (config.allow24h ? tradeAgeH >= config.maxHoldCandles : !sess.inSession) reason = "session_end";
    // #11 RSI extreme exit (before SL/TP)
    else if (config.rsiExitFilter && openTrade.direction === "long" && rsi >= config.rsiExitHigh) reason = "rsi_extreme";
    else if (config.rsiExitFilter && openTrade.direction === "short" && rsi <= config.rsiExitLow) reason = "rsi_extreme";
    else if (openTrade.direction === "long"  && ticker.price <= effectiveSLPrice)
      reason = effectiveSLPrice > openTrade.entryPrice ? "trail_stop" : "stop_loss";
    else if (openTrade.direction === "short" && ticker.price >= effectiveSLPrice)
      reason = effectiveSLPrice < openTrade.entryPrice ? "trail_stop" : "stop_loss";
    else if (pct >= tpPct) reason = "take_profit";

    if (!reason && (updatedTrailRef !== openTrade.trailRef || peakGainPct !== (openTrade.peakGainPct ?? 0))) {
      // persist updated trail ref & peak gain
      update({ trades:config.trades.map(t=>t.id===openTrade.id ? {...t, trailRef:updatedTrailRef, peakGainPct} : t) });
    }

    if (reason) {
      const pnl = pct/100*openTrade.size;
      const justClosed: PaperTrade = { ...openTrade, status:"closed" as const, exitTime:new Date().toISOString(), exitPrice:ticker.price, pnl, pnlPct:pct, reason, trailRef:updatedTrailRef };
      update({ trades:config.trades.map(t=>t.id===openTrade.id ? justClosed : t) });
      addLog(`■ CLOSE ${openTrade.direction.toUpperCase()} ${openTrade.symbol.replace("USDT","")} @ $${fmt(ticker.price)} | ${fmtUsd(pnl)} (${fmtPct(pct)}) — ${REASON_LABEL[reason]}`, pnl>=0?"sell":"warn");
      if (liveModeRef.current) closeLiveOrder(openTrade.direction, ticker.price, REASON_LABEL[reason], pct);

      if (config.learningEnabled) {
        const prevClosed = config.trades.filter(t=>t.status==="closed");
        const newCount   = prevClosed.length + 1;
        // Every 5 trades: micro-adaptation of trail and RSI
        if (newCount >= 5 && newCount - adaptCountRef.current >= 5) {
          adaptCountRef.current = newCount;
          const patch = adaptFromTrades([...prevClosed, justClosed], config);
          if (patch) {
            const parts: string[] = [];
            if (patch.trailPct !== undefined) parts.push(`Trail ${config.trailPct.toFixed(2)}%→${patch.trailPct.toFixed(2)}%`);
            if (patch.rsiMin !== undefined || patch.rsiMax !== undefined) parts.push(`RSI[${config.rsiMin}-${config.rsiMax}]→[${patch.rsiMin??config.rsiMin}-${patch.rsiMax??config.rsiMax}]`);
            addLog(`🧠 Uczenie (${newCount} tr): ${parts.join(" | ")}`, "info");
            update(patch);
            if (patch.rsiMin   !== undefined) setTmpRsiMin(String(patch.rsiMin));
            if (patch.rsiMax   !== undefined) setTmpRsiMax(String(patch.rsiMax));
            if (patch.trailPct !== undefined) setTmpTrailPct(String(patch.trailPct));
            // persist adaptation to learning memory
            const adapt: LearningAdaptation = { time: new Date().toISOString(), change: parts.join(" | "), tradeCount: newCount };
            learningRef.current = { ...learningRef.current, adaptCount: newCount, adaptations: [...learningRef.current.adaptations.slice(-99), adapt] };
            saveLearning(learningRef.current);
          } else {
            learningRef.current = { ...learningRef.current, adaptCount: newCount };
            saveLearning(learningRef.current);
          }
        }
        // Every 20 trades: full re-optimization
        if (newCount - autoOptRef.current >= 20) {
          autoOptRef.current = newCount;
          runOptimize({...config}).then(r => {
            update({rsiMin:r.rsiMin, rsiMax:r.rsiMax, trailPct:r.trailPct});
            setTmpRsiMin(String(r.rsiMin)); setTmpRsiMax(String(r.rsiMax)); setTmpTrailPct(String(r.trailPct));
            setOptResult(r);
            addLog(`🧠 Auto-Reopt (${newCount} tr): RSI[${r.rsiMin}-${r.rsiMax}] Trail${r.trailPct}% → Sharpe ${r.sharpe.toFixed(2)} WR ${r.winRate.toFixed(0)}%`, "info");
            // persist re-opt result and counter
            learningRef.current = { ...learningRef.current, autoOptCount: newCount, optResult: r };
            saveLearning(learningRef.current);
          }).catch((e:any) => addLog(`🧠 Reopt błąd: ${e.message}`, "warn"));
        }
      }
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

  // Check if server has saved keys (for cross-device: bot can start without local keys)
  const [serverHasKeys, setServerHasKeys] = useState(false);
  useEffect(() => {
    fetch("/api/bot/keys").then(r => r.json()).then(data => {
      setServerHasKeys(!!data.hasKeys);
    }).catch(() => {});
  }, []);

  useEffect(() => { fetchData(); const id=setInterval(fetchData,30_000); return ()=>clearInterval(id); }, [fetchData]);
  useEffect(() => { const id=setInterval(()=>setNow(new Date()),1000); return ()=>clearInterval(id); }, []);
  useEffect(() => { runEngine(); }, [ticker, md]); // eslint-disable-line
  useEffect(() => {
    liveModeRef.current = liveMode;
    if (liveMode) { fetchLiveBalance(); liveSessionPnlRef.current = 0; setLiveSessionPnl(0); }
  }, [liveMode, fetchLiveBalance]);
  useEffect(() => { liveUsdtRef.current = parseFloat(liveUsdt) || 9; }, [liveUsdt]);

  // Live BTC price — every 5s
  useEffect(() => {
    const fetchTicker = async () => {
      try {
        const r = await fetch("/api/trading/ticker?symbol=BTCUSDT");
        if (r.ok) { const d = await r.json(); setLiveTicker(d); }
      } catch { /* ignore */ }
    };
    fetchTicker();
    const id = setInterval(fetchTicker, 5_000);
    return () => clearInterval(id);
  }, []);

  // Poll server-side bot status every 15s; also refresh balance every 30s while running
  const pollCountRef = useRef(0);
  useEffect(() => {
    const poll = async () => {
      try {
        const r = await fetch("/api/bot/status");
        if (r.ok) {
          const d = await r.json();
          const wasRunning = serverBotRunning;
          setServerBotRunning(d.running);
          setServerBotLogs(d.logs ?? []);
          setServerPosition(d.position);
          setServerPnl(d.sessionPnl ?? 0);
          // Fetch balance when bot just started, or every 2nd poll (~30s) while running
          pollCountRef.current += 1;
          if (d.running && (!wasRunning || pollCountRef.current % 2 === 0)) {
            fetchLiveBalance();
          }
        }
      } catch { /* ignore */ }
    };
    poll();
    const id = setInterval(poll, 15_000);
    return () => clearInterval(id);
  }, [fetchLiveBalance]); // eslint-disable-line react-hooks/exhaustive-deps

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
  // #100 active improvement counter
  const activeImprovements = [
    config.volumeFilter, config.macdFilter, config.emaRibbonFilter, config.drawdownProtection, config.breakEvenStop,
    config.stochRsiFilter, config.bbFilter, config.bodyFilter, config.emaSlopeFilter, config.candleConfirm,
    config.rsiExitFilter, config.feeSimulation, config.autoPauseOnLosses, config.compoundMode, config.recoveryMode,
    config.kellyEnabled, config.volScaling, config.dailyCircuitBreaker, config.revengeCooldown, config.signalConfirmation,
    config.adxSlope, config.volumeTrend, config.wickFilter, config.rocFilter, config.ichimokuFilter,
    config.haFilter, config.bbSqueezeFilter, config.profitLock, config.sessionScoreGate, config.learningEnabled,
    config.trailStop, config.dynamicExits, config.useAdx, config.allowShorts, config.requirePrevBull,
  ].filter(Boolean).length;
  const closed    = config.trades.filter(t=>t.status==="closed");
  const wins      = closed.filter(t=>(t.pnl??0)>0).length;
  const winRate   = closed.length ? Math.round(wins/closed.length*100) : null;
  const streak    = calcStreak(closed); // #4
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
  const volSigOk   = md ? !config.volumeFilter || md.volumeMult >= config.volumeMinMult : true;
  const macdSigOk  = md ? !config.macdFilter || md.macd > md.macdSignal : true;
  const macdSigOkS = md ? !config.macdFilter || md.macd < md.macdSignal : true;
  const ribbonSigOk  = md ? !config.emaRibbonFilter || md.ribbonBull : true;
  const ribbonSigOkS = md ? !config.emaRibbonFilter || md.ribbonBear : true;
  const longSig  = md && ticker ? ticker.price > md.ema21 && md.rsi >= config.rsiMin && md.rsi <= config.rsiMax && emaDist_ <= config.emaMaxDist && (!config.useAdx || md.adx >= config.adxMin) && (!config.requirePrevBull || md.prevBull) && volSigOk && macdSigOk && ribbonSigOk : false;
  const shortSig = md && ticker ? ticker.price < md.ema21 && md.rsi < 40 && emaDist_ <= config.emaMaxDist && (!config.useAdx || md.adx >= config.adxMin) && (!config.requirePrevBull || !md.prevBull) && volSigOk && macdSigOkS && ribbonSigOkS : false;
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
              <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                <span style={{ fontSize:12, color:M }}>📄 Paper mode · RSI+EMA{config.useAdx?" + ADX":""}{config.dynamicExits?" + ATR":""}{config.trailStop?" + Trail":""}{config.learningEnabled?" + 🧠":""} · Long{config.allowShorts?"+Short":""}</span>
                {/* #100 improvement counter */}
                <span style={{ fontSize:10, background:"rgba(99,102,241,0.12)", border:"1px solid rgba(99,102,241,0.3)", borderRadius:6, padding:"2px 8px", color:"#818cf8", fontWeight:700 }}>{activeImprovements}/35 filtrów ON · 100 ulepszeń</span>
              </div>
            </div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
            {lastRefresh && <span style={{ fontSize:11, color:M }}>Dane: {fmtTime(lastRefresh.toISOString())}</span>}
            {(hasBybitKeys() || serverHasKeys)
              ? <span style={{ fontSize:11, background:"rgba(247,147,26,0.15)", border:"1px solid rgba(247,147,26,0.4)", borderRadius:6, padding:"4px 10px", color:"#fb923c", fontWeight:700, display:"flex", alignItems:"center", gap:5 }}>
                  🟡 Bybit {hasBybitKeys() ? (getBybitKeys().testnet ? "Testnet" : "Live") : "Live"} skonfigurowany{serverHasKeys && !hasBybitKeys() ? " (serwer)" : ""}
                </span>
              : <a href="/resell/settings" style={{ fontSize:11, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.15)", borderRadius:6, padding:"4px 10px", color:M, textDecoration:"none", display:"flex", alignItems:"center", gap:5 }}>
                  ⚙️ Dodaj klucze Bybit →
                </a>
            }
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
            <button onClick={()=>{update({allow24h:!config.allow24h}); addLog(!config.allow24h?"24H MODE — bot aktywny całą dobę":"24H OFF — powrót do sesji 21-23 UTC","info");}}
              style={{ background:config.allow24h?"rgba(167,139,250,0.15)":"rgba(255,255,255,0.04)", border:`1px solid ${config.allow24h?"rgba(167,139,250,0.45)":"rgba(255,255,255,0.1)"}`, borderRadius:8, padding:"8px 16px", color:config.allow24h?"#a78bfa":M, cursor:"pointer", fontWeight:700, fontSize:13, display:"flex", alignItems:"center", gap:6 }}>
              <Clock size={13}/> {config.allow24h?"24H":"SESJA"}
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

        {/* Leverage card — separate row, always visible */}
        {(() => {
          const autoLev = calcAutoLeverage(learningRef.current.deepHistory);
          const effectiveLev = config.leverageAuto ? autoLev : config.leverage;
          const needsTraining = config.leverageAuto && learningRef.current.deepHistory.filter(r=>r.sharpe>0&&r.winRate>0&&r.windows&&r.windows>=5).length < 2;
          return (
            <div style={{ ...card, display:"flex", alignItems:"center", gap:8, marginBottom:14, flexWrap:"wrap" }}>
              <span style={{ fontSize:12, color:M, fontWeight:700 }}>⚡ DŹWIGNIA:</span>
              <button onClick={()=>{ const n=!config.leverageAuto; update({leverageAuto:n}); addLog(n?`AUTO dźwignia włączona (max: ${autoLev}x) — system sam dobiera przy mocnym sygnale`:"AUTO dźwignia wyłączona","info"); }}
                style={{ background:config.leverageAuto?"rgba(167,139,250,0.2)":"rgba(255,255,255,0.06)", border:`1px solid ${config.leverageAuto?"#a78bfa":"rgba(255,255,255,0.2)"}`, borderRadius:8, padding:"7px 16px", color:config.leverageAuto?"#a78bfa":M, cursor:"pointer", fontWeight:700, fontSize:13 }}>
                🤖 AUTO{config.leverageAuto?(needsTraining?" (ucz się…)":`·${autoLev}x`):""}
              </button>
              {([1,2,3,5,10] as const).map(lv => {
                const active = !config.leverageAuto && effectiveLev===lv;
                const color = lv===1?"#94a3b8":lv<=3?"#fbbf24":"#f87171";
                return (
                  <button key={lv} onClick={()=>{ update({leverage:lv,leverageAuto:false}); addLog(`Dźwignia: ${lv}x${lv>1?` · likwidacja przy -${(100/lv).toFixed(0)}%`:""}`, lv>3?"warn":"info"); }}
                    style={{ background:active?`rgba(${lv===1?"148,163,184":lv<=3?"251,191,36":"248,113,113"},0.18)`:"rgba(255,255,255,0.04)", border:`1px solid ${active?color:"rgba(255,255,255,0.12)"}`, borderRadius:8, padding:"7px 14px", color:active?color:M, cursor:"pointer", fontWeight:active?800:500, fontSize:13, opacity:config.leverageAuto?0.35:1 }}>
                    {lv}x
                  </button>
                );
              })}
              {config.leverageAuto && !needsTraining && <span style={{ fontSize:11, color:"#a78bfa", marginLeft:4 }}>· dźwignia wg siły sygnału per transakcja</span>}
              {needsTraining && <span style={{ fontSize:11, color:M, marginLeft:4 }}>· uruchom Deep Train ≥2× żeby aktywować</span>}
            </div>
          );
        })()}

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
          <div style={{ ...card, background:config.allow24h?"rgba(167,139,250,0.07)":sess.inSession?"rgba(34,197,94,0.07)":"rgba(0,28,14,0.7)", border:`1px solid ${config.allow24h?"rgba(167,139,250,0.35)":sess.inSession?"rgba(34,197,94,0.35)":"rgba(34,197,94,0.13)"}` }}>
            <div style={{ fontSize:10, color:M, letterSpacing:1, marginBottom:8 }}>{config.allow24h?"TRYB 24H":"SESJA + SYGNAŁ"}</div>
            {config.allow24h ? (
              <>
                <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:6 }}>
                  <div style={{ width:8, height:8, borderRadius:"50%", background:"#a78bfa", flexShrink:0 }}/>
                  <span style={{ fontSize:11, color:"#a78bfa", fontWeight:700 }}>AKTYWNY 24/7</span>
                </div>
                <div style={{ fontSize:12, color:M, marginBottom:6 }}>Max hold: {config.maxHoldCandles}h / trade</div>
              </>
            ) : (
              <>
                <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:6 }}>
                  <div style={{ width:8, height:8, borderRadius:"50%", background:sess.inSession?G:"#4b5563", flexShrink:0 }}/>
                  <span style={{ fontSize:11, color:sess.inSession?G:M, fontWeight:700 }}>{sess.label}</span>
                </div>
                <div style={{ fontSize:14, fontWeight:700, marginBottom:6 }}>{sess.countdown}</div>
              </>
            )}
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
            { label:"SERIA",      value:streak===0?"—":`${streak>0?"🟢":"🔴"} ${Math.abs(streak)}`, sub:streak>0?"wygranych":"strat z rzędu", color:streak<=-2?R:streak>=3?G:T },
          ] as {label:string;value:string;sub?:string;color?:string}[]).map(({label,value,sub,color})=>(
            <div key={label} style={{ ...card, textAlign:"center" as const }}>
              <div style={{ fontSize:9, color:M, letterSpacing:0.8, marginBottom:5 }}>{label}</div>
              <div style={{ fontSize:20, fontWeight:800, color:color??T }}>{value}</div>
              {sub && <div style={{ fontSize:10, color:M, marginTop:4 }}>{sub}</div>}
            </div>
          ))}
        </div>

        {/* #16-#22 #29-#30 #46-#47 — Advanced Analytics Panel */}
        {closed.length >= 3 && (() => {
          const an = tradeAnalytics(closed);
          const grade = performanceGrade(an.sharpe, an.wr, an.pf);
          const gradeColor = grade==="A"?G:grade==="B"?"#86efac":grade==="C"?"#f59e0b":grade==="D"?"#fb923c":R;
          const gradeDesc = grade==="A"?"Doskonały":grade==="B"?"Dobry":grade==="C"?"Średni":grade==="D"?"Słaby":"Nierentowny";
          const confPassing = [
            !config.volumeFilter || (md && md.volumeMult >= config.volumeMinMult),
            !config.macdFilter   || (md && md.macd > md.macdSignal),
            !config.emaRibbonFilter || (md && md.ribbonBull),
            !config.stochRsiFilter  || (md && md.stochRsi < 80),
            !config.bbFilter     || (md && md.bbPct <= config.bbMaxPct),
            !config.emaSlopeFilter  || (md && md.emaSlope > 0),
            !config.adxSlope     || (md && md.adxRising),
            !config.ichimokuFilter  || (md && md.tenkan > md.kijun),
            !config.haFilter     || (md && md.haGreen),
            !config.sessionScoreGate || (md && sessionScore(md) >= config.minSessionScore),
          ].filter(x => x !== false).length;
          const confTotal = [config.volumeFilter, config.macdFilter, config.emaRibbonFilter, config.stochRsiFilter,
            config.bbFilter, config.emaSlopeFilter, config.adxSlope, config.ichimokuFilter, config.haFilter, config.sessionScoreGate].filter(Boolean).length;
          const confPct = confTotal > 0 ? confPassing / confTotal * 100 : 100;
          const spark = sparkline(closed.slice(-20).map(t => t.pnlPct ?? 0));
          return (
            <div style={{ ...card, marginBottom:14 }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
                <div style={{ fontSize:10, color:M, letterSpacing:1 }}>ZAAWANSOWANA ANALITYKA</div>
                <div style={{ fontSize:12, fontFamily:"monospace", color:M, letterSpacing:1 }}>{spark}</div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:12 }}>
                {/* #16 EV */}
                <div style={{ background:"rgba(0,0,0,0.2)", borderRadius:10, padding:"10px 12px", textAlign:"center" as const }}>
                  <div style={{ fontSize:9, color:M, letterSpacing:0.8, marginBottom:3 }}>WARTOŚĆ OCZEKIWANA</div>
                  <div style={{ fontSize:18, fontWeight:800, color:an.ev>=0?G:R }}>{an.ev>=0?"+":""}{an.ev.toFixed(2)}%</div>
                  <div style={{ fontSize:10, color:M, marginTop:2 }}>EV / transakcję</div>
                </div>
                {/* #17 PF */}
                <div style={{ background:"rgba(0,0,0,0.2)", borderRadius:10, padding:"10px 12px", textAlign:"center" as const }}>
                  <div style={{ fontSize:9, color:M, letterSpacing:0.8, marginBottom:3 }}>PROFIT FACTOR</div>
                  <div style={{ fontSize:18, fontWeight:800, color:an.pf>=1.5?G:an.pf>=1?"#f59e0b":R }}>{an.pf.toFixed(2)}</div>
                  <div style={{ fontSize:10, color:M, marginTop:2 }}>{an.pf>=1.5?"dobry":an.pf>=1?"akceptowalny":"ujemny"}</div>
                </div>
                {/* #29 Calmar */}
                <div style={{ background:"rgba(0,0,0,0.2)", borderRadius:10, padding:"10px 12px", textAlign:"center" as const }}>
                  <div style={{ fontSize:9, color:M, letterSpacing:0.8, marginBottom:3 }}>CALMAR RATIO</div>
                  <div style={{ fontSize:18, fontWeight:800, color:an.calmar>=1?G:an.calmar>=0.5?"#f59e0b":R }}>{an.calmar.toFixed(2)}</div>
                  <div style={{ fontSize:10, color:M, marginTop:2 }}>zwrot / max DD</div>
                </div>
                {/* #19 Rolling WR */}
                <div style={{ background:"rgba(0,0,0,0.2)", borderRadius:10, padding:"10px 12px", textAlign:"center" as const }}>
                  <div style={{ fontSize:9, color:M, letterSpacing:0.8, marginBottom:3 }}>WR ROLLING-20</div>
                  <div style={{ fontSize:18, fontWeight:800, color:an.rollWr>=55?G:an.rollWr>=45?"#f59e0b":R }}>{an.rollWr.toFixed(0)}%</div>
                  <div style={{ fontSize:10, color:M, marginTop:2 }}>ostatnie 20 tr.</div>
                </div>
              </div>
              <div style={{ display:"flex", gap:10, alignItems:"stretch" }}>
                {/* #22 Grade */}
                <div style={{ background:"rgba(0,0,0,0.2)", borderRadius:10, padding:"10px 16px", display:"flex", flexDirection:"column" as const, alignItems:"center", justifyContent:"center", minWidth:80 }}>
                  <div style={{ fontSize:9, color:M, letterSpacing:0.8, marginBottom:4 }}>OCENA</div>
                  <div style={{ fontSize:36, fontWeight:900, color:gradeColor }}>{grade}</div>
                  <div style={{ fontSize:10, color:gradeColor, marginTop:2 }}>{gradeDesc}</div>
                </div>
                {/* #82 Confidence meter */}
                <div style={{ flex:1, background:"rgba(0,0,0,0.2)", borderRadius:10, padding:"10px 14px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                    <div style={{ fontSize:9, color:M, letterSpacing:0.8 }}>PEWNOŚĆ SYGNAŁU (aktywne filtry)</div>
                    <div style={{ fontSize:11, fontWeight:700, color:confPct>=80?G:confPct>=60?"#f59e0b":R }}>{confPassing}/{confTotal}</div>
                  </div>
                  <div style={{ height:8, background:"rgba(255,255,255,0.07)", borderRadius:4, marginBottom:6 }}>
                    <div style={{ width:`${confPct}%`, height:"100%", background:confPct>=80?G:confPct>=60?"#f59e0b":R, borderRadius:4, transition:"width 0.5s" }}/>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:6, marginTop:6 }}>
                    {[
                      { label:"#30 Avg Hold", value:`${an.avgHold.toFixed(1)}h` },
                      { label:"#18 W:L ratio", value:an.wlRatio.toFixed(2) },
                      { label:"L WR", value:`${an.longWr.toFixed(0)}%`, color:an.longWr>=55?G:an.longWr>=45?"#f59e0b":R },
                      { label:"S WR", value:an.shorts>0?`${an.shortWr.toFixed(0)}%`:"—", color:an.shortWr>=55?G:an.shortWr>=45?"#f59e0b":R },
                    ].map(({label,value,color})=>(
                      <div key={label} style={{ background:"rgba(255,255,255,0.03)", borderRadius:6, padding:"5px 8px", textAlign:"center" as const }}>
                        <div style={{ fontSize:9, color:M, marginBottom:2 }}>{label}</div>
                        <div style={{ fontSize:13, fontWeight:700, color:color??T }}>{value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Settings */}
        <div style={{ ...card, marginBottom:14 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, flexWrap:"wrap" }}>
            <button onClick={()=>setShowSettings(s=>!s)} style={{ flex:1, background:"none", border:"none", color:T, display:"flex", alignItems:"center", gap:8, cursor:"pointer", padding:0, fontSize:14, fontWeight:700 }}>
              <Settings size={14}/> Konfiguracja strategii
              {showSettings ? <ChevronUp size={15} color={M}/> : <ChevronDown size={15} color={M}/>}
            </button>
            {/* AUTO Strategia */}
            {(() => {
              const ens = learningRef.current.ensembleResult;
              const hasData = !!ens && ens.sharpe > 0;
              return (
                <button onClick={()=>{
                  const n = !config.strategyAutoMode;
                  update({strategyAutoMode:n});
                  if (n && hasData && ens) {
                    update({rsiMin:ens.rsiMin, rsiMax:ens.rsiMax, trailPct:ens.trailPct});
                    setTmpRsiMin(String(ens.rsiMin)); setTmpRsiMax(String(ens.rsiMax)); setTmpTrailPct(String(ens.trailPct));
                    addLog(`🤖 AUTO strategia: RSI[${ens.rsiMin}-${ens.rsiMax}] Trail${ens.trailPct}% (z ${learningRef.current.deepHistory.length} sesji Deep Train)`,"info");
                  } else if (n && !hasData) {
                    addLog("AUTO strategia: brak danych Deep Train — uruchom Deep Train najpierw","warn");
                  } else {
                    addLog("AUTO strategia wyłączona — ręczna konfiguracja","info");
                  }
                }}
                  style={{ background:config.strategyAutoMode?"rgba(167,139,250,0.2)":"rgba(255,255,255,0.06)", border:`1px solid ${config.strategyAutoMode?"#a78bfa":"rgba(255,255,255,0.2)"}`, borderRadius:8, padding:"6px 14px", color:config.strategyAutoMode?"#a78bfa":M, cursor:"pointer", fontWeight:700, fontSize:12, display:"flex", alignItems:"center", gap:6, flexShrink:0 }}>
                  🤖 AUTO{config.strategyAutoMode?(hasData?` · RSI[${ens!.rsiMin}-${ens!.rsiMax}] Trail${ens!.trailPct}%`:" (brak danych)"):""}
                </button>
              );
            })()}
          </div>
          {config.strategyAutoMode && (
            <div style={{ marginTop:8, padding:"8px 12px", background:"rgba(167,139,250,0.06)", borderRadius:8, border:"1px solid rgba(167,139,250,0.2)", fontSize:11, color:"#a78bfa" }}>
              🤖 Parametry zarządzane przez Deep Train — po każdym treningu system aktualizuje RSI, Trail i SL/TP automatycznie
            </div>
          )}
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
                    {/* #5 break-even */}
                    <div style={{ marginTop:10, paddingTop:10, borderTop:"1px solid rgba(255,255,255,0.07)", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                      <div>
                        <div style={{ fontSize:12, fontWeight:700, color:"#38bdf8" }}>🔒 Break-even stop <span style={{ fontSize:10, color:M, fontWeight:400 }}>(#5 ulepszenie)</span></div>
                        <div style={{ fontSize:11, color:M, marginTop:2 }}>Gdy zysk ≥ {config.breakEvenTriggerPct}% TP ({(config.takeProfit*config.breakEvenTriggerPct/100).toFixed(2)}%) → SL przesuwa się na cenę wejścia (breakeven)</div>
                      </div>
                      <button onClick={()=>update({breakEvenStop:!config.breakEvenStop})}
                        style={{ background:config.breakEvenStop?"rgba(56,189,248,0.2)":"rgba(255,255,255,0.06)", border:`1px solid ${config.breakEvenStop?"rgba(56,189,248,0.5)":"rgba(255,255,255,0.2)"}`, borderRadius:8, padding:"6px 12px", color:config.breakEvenStop?"#38bdf8":M, cursor:"pointer", fontWeight:700, fontSize:11, flexShrink:0, marginLeft:10 }}>
                        {config.breakEvenStop?"BE ON":"BE OFF"}
                      </button>
                    </div>
                    {config.allow24h && (
                      <div style={{ marginTop:10 }}>
                        <div style={{ fontSize:11, color:M, marginBottom:5 }}>Max hold w trybie 24H (godziny, def: 3)</div>
                        <input type="number" value={config.maxHoldCandles} min={1} max={12} onChange={e=>{const n=parseInt(e.target.value); if(!isNaN(n)&&n>=1&&n<=12) update({maxHoldCandles:n});}} style={{...inputStyle(),width:"50%"}}/>
                      </div>
                    )}
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

              {/* #1 Volume filter */}
              <div style={{ background:"rgba(6,182,212,0.05)", border:"1px solid rgba(6,182,212,0.2)", borderRadius:10, padding:"14px 16px", marginBottom:14 }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:700, color:"#22d3ee" }}>Filtr wolumenu <span style={{ fontSize:10, color:M, fontWeight:400 }}>(#1 ulepszenie)</span></div>
                    <div style={{ fontSize:11, color:M, marginTop:2 }}>Wejście tylko gdy wolumen świeczki &gt; N× średniej 20 świeczek — eliminuje fałszywe sygnały na słabym rynku</div>
                    {md && <div style={{ fontSize:11, color: md.volumeMult >= config.volumeMinMult ? "#4ade80" : "#f87171", marginTop:4 }}>
                      Aktualny wolumen: {md.volumeMult.toFixed(2)}× avg {config.volumeFilter ? (md.volumeMult >= config.volumeMinMult ? "✓ wystarczający" : `✗ za niski (min ${config.volumeMinMult}×)`) : ""}
                    </div>}
                  </div>
                  <button onClick={()=>update({volumeFilter:!config.volumeFilter})}
                    style={{ background:config.volumeFilter?"rgba(6,182,212,0.2)":"rgba(255,255,255,0.06)", border:`1px solid ${config.volumeFilter?"rgba(6,182,212,0.5)":"rgba(255,255,255,0.2)"}`, borderRadius:8, padding:"7px 14px", color:config.volumeFilter?"#22d3ee":M, cursor:"pointer", fontWeight:700, fontSize:12, flexShrink:0 }}>
                    {config.volumeFilter?"VOL ON":"VOL OFF"}
                  </button>
                </div>
                {config.volumeFilter && <div style={{ marginTop:8 }}>
                  <div style={{ fontSize:11, color:M, marginBottom:5 }}>Min wolumen mult (def: 1.2×)</div>
                  <input type="number" value={config.volumeMinMult} step={0.1} min={0.8} max={3.0}
                    onChange={e=>{ const n=parseFloat(e.target.value); if(!isNaN(n)&&n>=0.8&&n<=3) update({volumeMinMult:n}); }}
                    style={{...inputStyle(), maxWidth:120}} />
                </div>}
              </div>

              {/* #2 MACD filter */}
              <div style={{ background:"rgba(168,85,247,0.05)", border:"1px solid rgba(168,85,247,0.2)", borderRadius:10, padding:"14px 16px", marginBottom:14 }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:700, color:"#c084fc" }}>MACD (12,26,9) <span style={{ fontSize:10, color:M, fontWeight:400 }}>(#2 ulepszenie)</span></div>
                    <div style={{ fontSize:11, color:M, marginTop:2 }}>LONG tylko gdy MACD &gt; Signal line — potwierdza że momentum rośnie</div>
                    {md && <div style={{ fontSize:11, marginTop:4, color: md.macd > md.macdSignal ? "#4ade80" : "#f87171" }}>
                      MACD {md.macd > 0 ? "+" : ""}{md.macd.toFixed(1)} | Signal {md.macdSignal > 0 ? "+" : ""}{md.macdSignal.toFixed(1)} | Hist {md.macdHist > 0 ? "+" : ""}{md.macdHist.toFixed(1)} {md.macd > md.macdSignal ? "↑ bullish" : "↓ bearish"}
                    </div>}
                  </div>
                  <button onClick={()=>update({macdFilter:!config.macdFilter})}
                    style={{ background:config.macdFilter?"rgba(168,85,247,0.2)":"rgba(255,255,255,0.06)", border:`1px solid ${config.macdFilter?"rgba(168,85,247,0.5)":"rgba(255,255,255,0.2)"}`, borderRadius:8, padding:"7px 14px", color:config.macdFilter?"#c084fc":M, cursor:"pointer", fontWeight:700, fontSize:12, flexShrink:0 }}>
                    {config.macdFilter?"MACD ON":"MACD OFF"}
                  </button>
                </div>
              </div>

              {/* #3 EMA Ribbon filter */}
              <div style={{ background:"rgba(52,211,153,0.05)", border:"1px solid rgba(52,211,153,0.2)", borderRadius:10, padding:"14px 16px", marginBottom:14 }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:700, color:"#34d399" }}>EMA Ribbon (8/13/21) <span style={{ fontSize:10, color:M, fontWeight:400 }}>(#3 ulepszenie)</span></div>
                    <div style={{ fontSize:11, color:M, marginTop:2 }}>EMA8 &gt; EMA13 &gt; EMA21 = silny uptrend — eliminuje słabe sygnały w bocznym rynku</div>
                    {md && <div style={{ fontSize:11, marginTop:4, color: md.ribbonBull ? "#4ade80" : md.ribbonBear ? "#f87171" : "#f59e0b" }}>
                      EMA8 {fmt(md.ema8)} | EMA13 {fmt(md.ema13)} | EMA21 {fmt(md.ema21)} — {md.ribbonBull ? "🟢 pełny uptrend" : md.ribbonBear ? "🔴 pełny downtrend" : "🟡 mieszany"}
                    </div>}
                  </div>
                  <button onClick={()=>update({emaRibbonFilter:!config.emaRibbonFilter})}
                    style={{ background:config.emaRibbonFilter?"rgba(52,211,153,0.2)":"rgba(255,255,255,0.06)", border:`1px solid ${config.emaRibbonFilter?"rgba(52,211,153,0.5)":"rgba(255,255,255,0.2)"}`, borderRadius:8, padding:"7px 14px", color:config.emaRibbonFilter?"#34d399":M, cursor:"pointer", fontWeight:700, fontSize:12, flexShrink:0 }}>
                    {config.emaRibbonFilter?"RIBBON ON":"RIBBON OFF"}
                  </button>
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

              {/* Self-learning */}
              <div style={{ background:"rgba(99,102,241,0.05)", border:"1px solid rgba(99,102,241,0.2)", borderRadius:10, padding:"14px 16px", marginBottom:14 }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:700, color:"#818cf8" }}>🧠 Algorytm Uczenia <span style={{ fontSize:10, color:M, fontWeight:400 }}>(samoadaptacja)</span></div>
                    <div style={{ fontSize:11, color:M, marginTop:3, lineHeight:1.6 }}>Co 5 transakcji bot analizuje wyniki i koryguje Trail/RSI. Co 20 transakcji uruchamia pełną optymalizację na żywych danych Binance.</div>
                  </div>
                  <button onClick={()=>{update({learningEnabled:!config.learningEnabled}); addLog(config.learningEnabled?"🧠 Uczenie wyłączone":"🧠 Uczenie włączone — bot będzie się adaptować","info");}}
                    style={{ background:config.learningEnabled?"rgba(99,102,241,0.2)":"rgba(255,255,255,0.06)", border:`1px solid ${config.learningEnabled?"rgba(99,102,241,0.5)":"rgba(255,255,255,0.2)"}`, borderRadius:8, padding:"8px 16px", color:config.learningEnabled?"#818cf8":M, cursor:"pointer", fontWeight:700, fontSize:13, flexShrink:0, marginLeft:16 }}>
                    {config.learningEnabled?"UCZENIE ON":"UCZENIE OFF"}
                  </button>
                </div>
                {/* #4 drawdown protection toggle inside learning section */}
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginTop:10, paddingTop:10, borderTop:"1px solid rgba(255,255,255,0.07)" }}>
                  <div>
                    <div style={{ fontSize:12, fontWeight:700, color:"#fb923c" }}>🛡️ Ochrona przed drawdown <span style={{ fontSize:10, color:M, fontWeight:400 }}>(#4 ulepszenie)</span></div>
                    <div style={{ fontSize:11, color:M, marginTop:2 }}>Po 2+ stratach z rzędu: rozmiar pozycji ×0.5 aż do odbudowy serii wygranych</div>
                    {streak < 0 && <div style={{ fontSize:11, color: streak<=-2 ? R : "#f59e0b", marginTop:3 }}>⚠️ Aktualnie: {Math.abs(streak)} strat — rozmiar {streak<=-2?"×0.5 (aktywne)":"×1.0 (jeszcze OK)"}</div>}
                  </div>
                  <button onClick={()=>update({drawdownProtection:!config.drawdownProtection})}
                    style={{ background:config.drawdownProtection?"rgba(251,146,60,0.2)":"rgba(255,255,255,0.06)", border:`1px solid ${config.drawdownProtection?"rgba(251,146,60,0.5)":"rgba(255,255,255,0.2)"}`, borderRadius:8, padding:"7px 14px", color:config.drawdownProtection?"#fb923c":M, cursor:"pointer", fontWeight:700, fontSize:12, flexShrink:0, marginLeft:12 }}>
                    {config.drawdownProtection?"DD PROT ON":"DD PROT OFF"}
                  </button>
                </div>
              </div>

              {/* ══ IMPROVEMENTS #6-#100 SETTINGS ══════════════════════════════ */}

              {/* AUTO FILTRY banner */}
              {(() => {
                const af = calcAutoFilters(learningRef.current.deepHistory, md);
                const autoCount = Object.values(af).filter(Boolean).length;
                const valid = learningRef.current.deepHistory.filter(r=>r.sharpe>0&&r.winRate>0&&r.windows&&r.windows>=5);
                const tier = valid.length ? (valid.reduce((s,r)=>s+r.sharpe,0)/valid.length >= 3.5 ? 3 : valid.reduce((s,r)=>s+r.sharpe,0)/valid.length >= 2.5 ? 2 : 1) : 0;
                return (
                  <div style={{ background:config.filterAutoMode?"rgba(167,139,250,0.08)":"rgba(255,255,255,0.03)", border:`1px solid ${config.filterAutoMode?"rgba(167,139,250,0.35)":"rgba(255,255,255,0.1)"}`, borderRadius:10, padding:"12px 16px", marginBottom:14, display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:10 }}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:700, color:config.filterAutoMode?"#a78bfa":M }}>🤖 AUTO FILTRY</div>
                      <div style={{ fontSize:11, color:M, marginTop:3 }}>
                        {tier===0?"Uruchom Deep Train żeby system nauczył się które filtry pomagają":
                         config.filterAutoMode?`Tier ${tier} — system włącza ${autoCount} filtrów na podstawie Deep Train + rynku`:
                         "System sam dobiera filtry na podstawie jakości Deep Train i warunków rynkowych"}
                      </div>
                      {config.filterAutoMode && tier>0 && (
                        <div style={{ fontSize:10, color:"#a78bfa", marginTop:4 }}>
                          Aktywne: {[
                            af.volumeFilter&&"VOL", af.macdFilter&&"MACD", af.emaRibbonFilter&&"Ribbon",
                            af.stochRsiFilter&&"StochRSI", af.emaSlopeFilter&&"Slope", af.adxSlope&&"ADXSlope",
                            af.volumeTrend&&"VolTrend", af.wickFilter&&"Wick", af.ichimokuFilter&&"Ichimoku",
                            af.haFilter&&"HA", af.rocFilter&&"ROC", af.sessionScoreGate&&"Score"
                          ].filter(Boolean).join(" · ")}
                        </div>
                      )}
                    </div>
                    <button onClick={()=>{ const n=!config.filterAutoMode; update({filterAutoMode:n}); if(n&&tier>0){ const af2=calcAutoFilters(learningRef.current.deepHistory,md); update({volumeFilter:af2.volumeFilter,macdFilter:af2.macdFilter,emaRibbonFilter:af2.emaRibbonFilter,stochRsiFilter:af2.stochRsiFilter,bbFilter:af2.bbFilter,emaSlopeFilter:af2.emaSlopeFilter,adxSlope:af2.adxSlope,volumeTrend:af2.volumeTrend,wickFilter:af2.wickFilter,ichimokuFilter:af2.ichimokuFilter,haFilter:af2.haFilter,rocFilter:af2.rocFilter,rsiRising:af2.rsiRising,sessionScoreGate:af2.sessionScoreGate}); addLog(`AUTO FILTRY włączone (Tier ${tier}) — ${autoCount} filtrów aktywnych`,"info"); } else if(!n){ addLog("AUTO FILTRY wyłączone — ręczne sterowanie","info"); } }}
                      style={{ background:config.filterAutoMode?"rgba(167,139,250,0.2)":"rgba(255,255,255,0.06)", border:`1px solid ${config.filterAutoMode?"#a78bfa":"rgba(255,255,255,0.2)"}`, borderRadius:8, padding:"8px 16px", color:config.filterAutoMode?"#a78bfa":M, cursor:"pointer", fontWeight:700, fontSize:13, flexShrink:0 }}>
                      {config.filterAutoMode?"AUTO ON":"AUTO OFF"}
                    </button>
                  </div>
                );
              })()}

              {/* #6-#10: Advanced signal filters */}
              <div style={{ fontSize:11, color:M, marginBottom:8, fontWeight:700, marginTop:4 }}>FILTRY SYGNAŁÓW #6–#10</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14 }}>
                {/* #6 StochRSI */}
                <div style={{ background:"rgba(99,102,241,0.05)", border:`1px solid rgba(99,102,241,${config.stochRsiFilter?0.4:0.15})`, borderRadius:10, padding:"12px 14px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div><div style={{ fontSize:12, fontWeight:700, color:"#818cf8" }}>#6 StochRSI</div><div style={{ fontSize:10, color:M, marginTop:2 }}>Nie wchodź gdy StochRSI &gt;80 (wykupienie)</div>{md&&<div style={{ fontSize:10, color:md.stochRsi>80?R:md.stochRsi<20?G:"#f59e0b", marginTop:2 }}>K: {md.stochRsi.toFixed(0)}</div>}</div>
                    <button onClick={()=>update({stochRsiFilter:!config.stochRsiFilter})} style={{ background:config.stochRsiFilter?"rgba(99,102,241,0.2)":"rgba(255,255,255,0.06)", border:`1px solid ${config.stochRsiFilter?"#818cf8":"rgba(255,255,255,0.2)"}`, borderRadius:7, padding:"5px 10px", color:config.stochRsiFilter?"#818cf8":M, cursor:"pointer", fontWeight:700, fontSize:11 }}>{config.stochRsiFilter?"ON":"OFF"}</button>
                  </div>
                </div>
                {/* #7 Bollinger Bands */}
                <div style={{ background:"rgba(6,182,212,0.05)", border:`1px solid rgba(6,182,212,${config.bbFilter?0.4:0.15})`, borderRadius:10, padding:"12px 14px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div><div style={{ fontSize:12, fontWeight:700, color:"#22d3ee" }}>#7 Bollinger BB%B</div><div style={{ fontSize:10, color:M, marginTop:2 }}>LONG gdy BB%B &lt; {config.bbMaxPct}% (nie na szczycie)</div>{md&&<div style={{ fontSize:10, color:md.bbPct>80?R:G, marginTop:2 }}>BB%B: {md.bbPct.toFixed(0)}%</div>}</div>
                    <button onClick={()=>update({bbFilter:!config.bbFilter})} style={{ background:config.bbFilter?"rgba(6,182,212,0.2)":"rgba(255,255,255,0.06)", border:`1px solid ${config.bbFilter?"#22d3ee":"rgba(255,255,255,0.2)"}`, borderRadius:7, padding:"5px 10px", color:config.bbFilter?"#22d3ee":M, cursor:"pointer", fontWeight:700, fontSize:11 }}>{config.bbFilter?"ON":"OFF"}</button>
                  </div>
                </div>
                {/* #8 Candle body */}
                <div style={{ background:"rgba(251,191,36,0.05)", border:`1px solid rgba(251,191,36,${config.bodyFilter?0.4:0.15})`, borderRadius:10, padding:"12px 14px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div><div style={{ fontSize:12, fontWeight:700, color:"#fbbf24" }}>#8 Body Quality</div><div style={{ fontSize:10, color:M, marginTop:2 }}>Pomijaj doji — body &gt; {(config.bodyMinRatio*100).toFixed(0)}% zakresu świecy</div>{md&&<div style={{ fontSize:10, color:md.bodyRatio>=config.bodyMinRatio?G:R, marginTop:2 }}>Body: {(md.bodyRatio*100).toFixed(0)}%</div>}</div>
                    <button onClick={()=>update({bodyFilter:!config.bodyFilter})} style={{ background:config.bodyFilter?"rgba(251,191,36,0.2)":"rgba(255,255,255,0.06)", border:`1px solid ${config.bodyFilter?"#fbbf24":"rgba(255,255,255,0.2)"}`, borderRadius:7, padding:"5px 10px", color:config.bodyFilter?"#fbbf24":M, cursor:"pointer", fontWeight:700, fontSize:11 }}>{config.bodyFilter?"ON":"OFF"}</button>
                  </div>
                </div>
                {/* #9 EMA slope */}
                <div style={{ background:"rgba(52,211,153,0.05)", border:`1px solid rgba(52,211,153,${config.emaSlopeFilter?0.4:0.15})`, borderRadius:10, padding:"12px 14px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div><div style={{ fontSize:12, fontWeight:700, color:"#34d399" }}>#9 EMA Slope ▲</div><div style={{ fontSize:10, color:M, marginTop:2 }}>LONG tylko gdy EMA21 rośnie (trend potwierdza)</div>{md&&<div style={{ fontSize:10, color:md.emaSlope>0?G:R, marginTop:2 }}>{md.emaSlope>0?"▲":"▼"} {md.emaSlope.toFixed(3)}%</div>}</div>
                    <button onClick={()=>update({emaSlopeFilter:!config.emaSlopeFilter})} style={{ background:config.emaSlopeFilter?"rgba(52,211,153,0.2)":"rgba(255,255,255,0.06)", border:`1px solid ${config.emaSlopeFilter?"#34d399":"rgba(255,255,255,0.2)"}`, borderRadius:7, padding:"5px 10px", color:config.emaSlopeFilter?"#34d399":M, cursor:"pointer", fontWeight:700, fontSize:11 }}>{config.emaSlopeFilter?"ON":"OFF"}</button>
                  </div>
                </div>
                {/* #10 Candle confirm */}
                <div style={{ background:"rgba(248,113,113,0.05)", border:`1px solid rgba(248,113,113,${config.candleConfirm?0.4:0.15})`, borderRadius:10, padding:"12px 14px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div><div style={{ fontSize:12, fontWeight:700, color:"#f87171" }}>#10 Candle Confirm ×{config.candleConfirmN}</div><div style={{ fontSize:10, color:M, marginTop:2 }}>Ostatnie {config.candleConfirmN} świece nad EMA21 (seria byków)</div></div>
                    <button onClick={()=>update({candleConfirm:!config.candleConfirm})} style={{ background:config.candleConfirm?"rgba(248,113,113,0.2)":"rgba(255,255,255,0.06)", border:`1px solid ${config.candleConfirm?"#f87171":"rgba(255,255,255,0.2)"}`, borderRadius:7, padding:"5px 10px", color:config.candleConfirm?"#f87171":M, cursor:"pointer", fontWeight:700, fontSize:11 }}>{config.candleConfirm?"ON":"OFF"}</button>
                  </div>
                </div>
                {/* #31 ADX slope */}
                <div style={{ background:"rgba(245,158,11,0.05)", border:`1px solid rgba(245,158,11,${config.adxSlope?0.4:0.15})`, borderRadius:10, padding:"12px 14px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div><div style={{ fontSize:12, fontWeight:700, color:"#f59e0b" }}>#31 ADX Rising ▲</div><div style={{ fontSize:10, color:M, marginTop:2 }}>Wchódź tylko gdy ADX rośnie (trend się wzmacnia)</div>{md&&<div style={{ fontSize:10, color:md.adxRising?G:"#f59e0b", marginTop:2 }}>{md.adxRising?"▲ rośnie":"▼ spada"}</div>}</div>
                    <button onClick={()=>update({adxSlope:!config.adxSlope})} style={{ background:config.adxSlope?"rgba(245,158,11,0.2)":"rgba(255,255,255,0.06)", border:`1px solid ${config.adxSlope?"#f59e0b":"rgba(255,255,255,0.2)"}`, borderRadius:7, padding:"5px 10px", color:config.adxSlope?"#f59e0b":M, cursor:"pointer", fontWeight:700, fontSize:11 }}>{config.adxSlope?"ON":"OFF"}</button>
                  </div>
                </div>
                {/* #32 Volume trend */}
                <div style={{ background:"rgba(20,184,166,0.05)", border:`1px solid rgba(20,184,166,${config.volumeTrend?0.4:0.15})`, borderRadius:10, padding:"12px 14px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div><div style={{ fontSize:12, fontWeight:700, color:"#2dd4bf" }}>#32 Vol Trend ▲</div><div style={{ fontSize:10, color:M, marginTop:2 }}>Rosnący wolumen przez 3 świece (silne momentum)</div>{md&&<div style={{ fontSize:10, color:md.volumeRising?G:"#f59e0b", marginTop:2 }}>{md.volumeRising?"▲ rośnie":"— płaski/spada"}</div>}</div>
                    <button onClick={()=>update({volumeTrend:!config.volumeTrend})} style={{ background:config.volumeTrend?"rgba(20,184,166,0.2)":"rgba(255,255,255,0.06)", border:`1px solid ${config.volumeTrend?"#2dd4bf":"rgba(255,255,255,0.2)"}`, borderRadius:7, padding:"5px 10px", color:config.volumeTrend?"#2dd4bf":M, cursor:"pointer", fontWeight:700, fontSize:11 }}>{config.volumeTrend?"ON":"OFF"}</button>
                  </div>
                </div>
                {/* #34 Wick filter */}
                <div style={{ background:"rgba(239,68,68,0.05)", border:`1px solid rgba(239,68,68,${config.wickFilter?0.4:0.15})`, borderRadius:10, padding:"12px 14px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div><div style={{ fontSize:12, fontWeight:700, color:"#f87171" }}>#34 Wick Rejection</div><div style={{ fontSize:10, color:M, marginTop:2 }}>Pomijaj świece z dużym górnym knotem (odrzucenie)</div>{md&&<div style={{ fontSize:10, color:md.upperWickRatio>2?R:G, marginTop:2 }}>Górny knot: {md.upperWickRatio.toFixed(1)}× body</div>}</div>
                    <button onClick={()=>update({wickFilter:!config.wickFilter})} style={{ background:config.wickFilter?"rgba(239,68,68,0.2)":"rgba(255,255,255,0.06)", border:`1px solid ${config.wickFilter?"#f87171":"rgba(255,255,255,0.2)"}`, borderRadius:7, padding:"5px 10px", color:config.wickFilter?"#f87171":M, cursor:"pointer", fontWeight:700, fontSize:11 }}>{config.wickFilter?"ON":"OFF"}</button>
                  </div>
                </div>
                {/* #48 ROC */}
                <div style={{ background:"rgba(168,85,247,0.05)", border:`1px solid rgba(168,85,247,${config.rocFilter?0.4:0.15})`, borderRadius:10, padding:"12px 14px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div><div style={{ fontSize:12, fontWeight:700, color:"#c084fc" }}>#48 ROC-14 &gt; 0</div><div style={{ fontSize:10, color:M, marginTop:2 }}>Rate of Change — cena wyżej niż 14 świec temu</div>{md&&<div style={{ fontSize:10, color:md.roc>0?G:R, marginTop:2 }}>ROC: {md.roc.toFixed(2)}%</div>}</div>
                    <button onClick={()=>update({rocFilter:!config.rocFilter})} style={{ background:config.rocFilter?"rgba(168,85,247,0.2)":"rgba(255,255,255,0.06)", border:`1px solid ${config.rocFilter?"#c084fc":"rgba(255,255,255,0.2)"}`, borderRadius:7, padding:"5px 10px", color:config.rocFilter?"#c084fc":M, cursor:"pointer", fontWeight:700, fontSize:11 }}>{config.rocFilter?"ON":"OFF"}</button>
                  </div>
                </div>
                {/* #66 Ichimoku */}
                <div style={{ background:"rgba(251,146,60,0.05)", border:`1px solid rgba(251,146,60,${config.ichimokuFilter?0.4:0.15})`, borderRadius:10, padding:"12px 14px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div><div style={{ fontSize:12, fontWeight:700, color:"#fb923c" }}>#66 Ichimoku TK</div><div style={{ fontSize:10, color:M, marginTop:2 }}>LONG gdy Tenkan &gt; Kijun (TK cross bullish)</div>{md&&<div style={{ fontSize:10, color:md.tenkan>md.kijun?G:R, marginTop:2 }}>T:{fmt(md.tenkan)} K:{fmt(md.kijun)}</div>}</div>
                    <button onClick={()=>update({ichimokuFilter:!config.ichimokuFilter})} style={{ background:config.ichimokuFilter?"rgba(251,146,60,0.2)":"rgba(255,255,255,0.06)", border:`1px solid ${config.ichimokuFilter?"#fb923c":"rgba(255,255,255,0.2)"}`, borderRadius:7, padding:"5px 10px", color:config.ichimokuFilter?"#fb923c":M, cursor:"pointer", fontWeight:700, fontSize:11 }}>{config.ichimokuFilter?"ON":"OFF"}</button>
                  </div>
                </div>
                {/* #69 Heikin-Ashi */}
                <div style={{ background:"rgba(16,185,129,0.05)", border:`1px solid rgba(16,185,129,${config.haFilter?0.4:0.15})`, borderRadius:10, padding:"12px 14px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div><div style={{ fontSize:12, fontWeight:700, color:"#10b981" }}>#69 Heikin-Ashi</div><div style={{ fontSize:10, color:M, marginTop:2 }}>LONG gdy świeca HA jest zielona (trend wygładzony)</div>{md&&<div style={{ fontSize:10, color:md.haGreen?G:R, marginTop:2 }}>{md.haGreen?"🟢 HA zielona":"🔴 HA czerwona"}</div>}</div>
                    <button onClick={()=>update({haFilter:!config.haFilter})} style={{ background:config.haFilter?"rgba(16,185,129,0.2)":"rgba(255,255,255,0.06)", border:`1px solid ${config.haFilter?"#10b981":"rgba(255,255,255,0.2)"}`, borderRadius:7, padding:"5px 10px", color:config.haFilter?"#10b981":M, cursor:"pointer", fontWeight:700, fontSize:11 }}>{config.haFilter?"ON":"OFF"}</button>
                  </div>
                </div>
                {/* #68 BB Squeeze */}
                <div style={{ background:"rgba(56,189,248,0.05)", border:`1px solid rgba(56,189,248,${config.bbSqueezeFilter?0.4:0.15})`, borderRadius:10, padding:"12px 14px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div><div style={{ fontSize:12, fontWeight:700, color:"#38bdf8" }}>#68 BB Squeeze</div><div style={{ fontSize:10, color:M, marginTop:2 }}>Wejście tylko po ściskaniu wstęgi (breakout)</div>{md&&<div style={{ fontSize:10, color:md.bbSqueeze?G:"#f59e0b", marginTop:2 }}>{md.bbSqueeze?"🎯 Squeeze aktywne":"— brak squeeze"}</div>}</div>
                    <button onClick={()=>update({bbSqueezeFilter:!config.bbSqueezeFilter})} style={{ background:config.bbSqueezeFilter?"rgba(56,189,248,0.2)":"rgba(255,255,255,0.06)", border:`1px solid ${config.bbSqueezeFilter?"#38bdf8":"rgba(255,255,255,0.2)"}`, borderRadius:7, padding:"5px 10px", color:config.bbSqueezeFilter?"#38bdf8":M, cursor:"pointer", fontWeight:700, fontSize:11 }}>{config.bbSqueezeFilter?"ON":"OFF"}</button>
                  </div>
                </div>
              </div>

              {/* #11-#15: Exit & risk improvements */}
              <div style={{ fontSize:11, color:M, marginBottom:8, fontWeight:700 }}>ZARZĄDZANIE RYZYKIEM #11–#15</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14 }}>
                {/* #11 RSI extreme exit */}
                <div style={{ background:"rgba(239,68,68,0.05)", border:`1px solid rgba(239,68,68,${config.rsiExitFilter?0.4:0.15})`, borderRadius:10, padding:"12px 14px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div><div style={{ fontSize:12, fontWeight:700, color:"#f87171" }}>#11 RSI Exit (&gt;{config.rsiExitHigh})</div><div style={{ fontSize:10, color:M, marginTop:2 }}>Zamknij LONG gdy RSI &gt;{config.rsiExitHigh} — wykupienie</div></div>
                    <button onClick={()=>update({rsiExitFilter:!config.rsiExitFilter})} style={{ background:config.rsiExitFilter?"rgba(239,68,68,0.2)":"rgba(255,255,255,0.06)", border:`1px solid ${config.rsiExitFilter?"#f87171":"rgba(255,255,255,0.2)"}`, borderRadius:7, padding:"5px 10px", color:config.rsiExitFilter?"#f87171":M, cursor:"pointer", fontWeight:700, fontSize:11 }}>{config.rsiExitFilter?"ON":"OFF"}</button>
                  </div>
                </div>
                {/* #12 Fee simulation */}
                <div style={{ background:"rgba(244,63,94,0.05)", border:`1px solid rgba(244,63,94,${config.feeSimulation?0.4:0.15})`, borderRadius:10, padding:"12px 14px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div><div style={{ fontSize:12, fontWeight:700, color:"#fb7185" }}>#12 Symulacja opłat</div><div style={{ fontSize:10, color:M, marginTop:2 }}>Odejmij {config.feePct}% RT od każdej transakcji (Bybit)</div></div>
                    <button onClick={()=>update({feeSimulation:!config.feeSimulation})} style={{ background:config.feeSimulation?"rgba(244,63,94,0.2)":"rgba(255,255,255,0.06)", border:`1px solid ${config.feeSimulation?"#fb7185":"rgba(255,255,255,0.2)"}`, borderRadius:7, padding:"5px 10px", color:config.feeSimulation?"#fb7185":M, cursor:"pointer", fontWeight:700, fontSize:11 }}>{config.feeSimulation?"ON":"OFF"}</button>
                  </div>
                </div>
                {/* #13 Auto-pause */}
                <div style={{ background:"rgba(239,68,68,0.05)", border:`1px solid rgba(239,68,68,${config.autoPauseOnLosses?0.4:0.15})`, borderRadius:10, padding:"12px 14px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div><div style={{ fontSize:12, fontWeight:700, color:"#f87171" }}>#13 Auto-pauza ({config.maxConsecLosses} strat)</div><div style={{ fontSize:10, color:M, marginTop:2 }}>Zatrzymaj bota po {config.maxConsecLosses} stratach z rzędu</div></div>
                    <button onClick={()=>update({autoPauseOnLosses:!config.autoPauseOnLosses})} style={{ background:config.autoPauseOnLosses?"rgba(239,68,68,0.2)":"rgba(255,255,255,0.06)", border:`1px solid ${config.autoPauseOnLosses?"#f87171":"rgba(255,255,255,0.2)"}`, borderRadius:7, padding:"5px 10px", color:config.autoPauseOnLosses?"#f87171":M, cursor:"pointer", fontWeight:700, fontSize:11 }}>{config.autoPauseOnLosses?"ON":"OFF"}</button>
                  </div>
                </div>
                {/* #14 Compound mode */}
                <div style={{ background:"rgba(34,197,94,0.05)", border:`1px solid rgba(34,197,94,${config.compoundMode?0.4:0.15})`, borderRadius:10, padding:"12px 14px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div><div style={{ fontSize:12, fontWeight:700, color:G }}>#14 Składanie kapitału</div><div style={{ fontSize:10, color:M, marginTop:2 }}>Kapitał rośnie/maleje razem z P&L zamkniętych pozycji</div>{config.compoundMode&&<div style={{ fontSize:10, color:G, marginTop:2 }}>Start: ${config.startingCapital} → teraz: ${config.capital.toFixed(0)}</div>}</div>
                    <button onClick={()=>update({compoundMode:!config.compoundMode, startingCapital:config.compoundMode?config.capital:config.capital})} style={{ background:config.compoundMode?"rgba(34,197,94,0.2)":"rgba(255,255,255,0.06)", border:`1px solid ${config.compoundMode?G:"rgba(255,255,255,0.2)"}`, borderRadius:7, padding:"5px 10px", color:config.compoundMode?G:M, cursor:"pointer", fontWeight:700, fontSize:11 }}>{config.compoundMode?"ON":"OFF"}</button>
                  </div>
                </div>
                {/* #15 Recovery mode */}
                <div style={{ background:"rgba(251,146,60,0.05)", border:`1px solid rgba(251,146,60,${config.recoveryMode?0.4:0.15})`, borderRadius:10, padding:"12px 14px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div><div style={{ fontSize:12, fontWeight:700, color:"#fb923c" }}>#15 Recovery Mode (-{config.recoveryDrawdownPct}%)</div><div style={{ fontSize:10, color:M, marginTop:2 }}>Po DD &gt;{config.recoveryDrawdownPct}%: ryzyko ×0.5 aż do powrotu</div></div>
                    <button onClick={()=>update({recoveryMode:!config.recoveryMode})} style={{ background:config.recoveryMode?"rgba(251,146,60,0.2)":"rgba(255,255,255,0.06)", border:`1px solid ${config.recoveryMode?"#fb923c":"rgba(255,255,255,0.2)"}`, borderRadius:7, padding:"5px 10px", color:config.recoveryMode?"#fb923c":M, cursor:"pointer", fontWeight:700, fontSize:11 }}>{config.recoveryMode?"ON":"OFF"}</button>
                  </div>
                </div>
                {/* #25 Daily circuit breaker */}
                <div style={{ background:"rgba(239,68,68,0.05)", border:`1px solid rgba(239,68,68,${config.dailyCircuitBreaker?0.4:0.15})`, borderRadius:10, padding:"12px 14px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div><div style={{ fontSize:12, fontWeight:700, color:"#f87171" }}>#25 Daily Stop -{config.dailyLossLimit}%</div><div style={{ fontSize:10, color:M, marginTop:2 }}>Zatrzymaj po stracie {config.dailyLossLimit}% kapitału dziennie</div></div>
                    <button onClick={()=>update({dailyCircuitBreaker:!config.dailyCircuitBreaker})} style={{ background:config.dailyCircuitBreaker?"rgba(239,68,68,0.2)":"rgba(255,255,255,0.06)", border:`1px solid ${config.dailyCircuitBreaker?"#f87171":"rgba(255,255,255,0.2)"}`, borderRadius:7, padding:"5px 10px", color:config.dailyCircuitBreaker?"#f87171":M, cursor:"pointer", fontWeight:700, fontSize:11 }}>{config.dailyCircuitBreaker?"ON":"OFF"}</button>
                  </div>
                </div>
                {/* #33 Revenge cooldown */}
                <div style={{ background:"rgba(156,163,175,0.05)", border:`1px solid rgba(156,163,175,${config.revengeCooldown?0.4:0.15})`, borderRadius:10, padding:"12px 14px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div><div style={{ fontSize:12, fontWeight:700, color:"#9ca3af" }}>#33 Cooldown po SL</div><div style={{ fontSize:10, color:M, marginTop:2 }}>1h przerwy po stop loss (brak handlu z zemsty)</div></div>
                    <button onClick={()=>update({revengeCooldown:!config.revengeCooldown})} style={{ background:config.revengeCooldown?"rgba(156,163,175,0.2)":"rgba(255,255,255,0.06)", border:`1px solid ${config.revengeCooldown?"#9ca3af":"rgba(255,255,255,0.2)"}`, borderRadius:7, padding:"5px 10px", color:config.revengeCooldown?"#9ca3af":M, cursor:"pointer", fontWeight:700, fontSize:11 }}>{config.revengeCooldown?"ON":"OFF"}</button>
                  </div>
                </div>
                {/* #27 Signal confirmation */}
                <div style={{ background:"rgba(99,102,241,0.05)", border:`1px solid rgba(99,102,241,${config.signalConfirmation?0.4:0.15})`, borderRadius:10, padding:"12px 14px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div><div style={{ fontSize:12, fontWeight:700, color:"#818cf8" }}>#27 Potwierdzenie ×2</div><div style={{ fontSize:10, color:M, marginTop:2 }}>Sygnał musi pojawić się 2× z rzędu zanim wejście</div></div>
                    <button onClick={()=>update({signalConfirmation:!config.signalConfirmation})} style={{ background:config.signalConfirmation?"rgba(99,102,241,0.2)":"rgba(255,255,255,0.06)", border:`1px solid ${config.signalConfirmation?"#818cf8":"rgba(255,255,255,0.2)"}`, borderRadius:7, padding:"5px 10px", color:config.signalConfirmation?"#818cf8":M, cursor:"pointer", fontWeight:700, fontSize:11 }}>{config.signalConfirmation?"ON":"OFF"}</button>
                  </div>
                </div>
                {/* #23 Kelly sizing */}
                <div style={{ background:"rgba(16,185,129,0.05)", border:`1px solid rgba(16,185,129,${config.kellyEnabled?0.4:0.15})`, borderRadius:10, padding:"12px 14px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div><div style={{ fontSize:12, fontWeight:700, color:"#10b981" }}>#23 Kelly Sizing ×{config.kellyFraction}</div><div style={{ fontSize:10, color:M, marginTop:2 }}>Optymalne ryzyko wg Kelly (po 10+ transakcjach)</div>{closed.length>=10&&<div style={{ fontSize:10, color:"#10b981", marginTop:2 }}>Kelly sugeruje: {(kellyFraction(tradeAnalytics(closed).wr, tradeAnalytics(closed).avgWin, tradeAnalytics(closed).avgLoss)*config.kellyFraction/100).toFixed(1)}%</div>}</div>
                    <button onClick={()=>update({kellyEnabled:!config.kellyEnabled})} style={{ background:config.kellyEnabled?"rgba(16,185,129,0.2)":"rgba(255,255,255,0.06)", border:`1px solid ${config.kellyEnabled?"#10b981":"rgba(255,255,255,0.2)"}`, borderRadius:7, padding:"5px 10px", color:config.kellyEnabled?"#10b981":M, cursor:"pointer", fontWeight:700, fontSize:11 }}>{config.kellyEnabled?"ON":"OFF"}</button>
                  </div>
                </div>
                {/* #24 Vol scaling */}
                <div style={{ background:"rgba(245,158,11,0.05)", border:`1px solid rgba(245,158,11,${config.volScaling?0.4:0.15})`, borderRadius:10, padding:"12px 14px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div><div style={{ fontSize:12, fontWeight:700, color:"#f59e0b" }}>#24 Vol Scaling</div><div style={{ fontSize:10, color:M, marginTop:2 }}>Mniejsza pozycja w wysokiej zmienności (ATR &gt;70%ile)</div>{md&&<div style={{ fontSize:10, color:md.atrPercentile>70?R:md.atrPercentile<30?G:"#f59e0b", marginTop:2 }}>ATR percentyl: {md.atrPercentile.toFixed(0)}%</div>}</div>
                    <button onClick={()=>update({volScaling:!config.volScaling})} style={{ background:config.volScaling?"rgba(245,158,11,0.2)":"rgba(255,255,255,0.06)", border:`1px solid ${config.volScaling?"#f59e0b":"rgba(255,255,255,0.2)"}`, borderRadius:7, padding:"5px 10px", color:config.volScaling?"#f59e0b":M, cursor:"pointer", fontWeight:700, fontSize:11 }}>{config.volScaling?"ON":"OFF"}</button>
                  </div>
                </div>
                {/* #91 Profit lock */}
                <div style={{ background:"rgba(56,189,248,0.05)", border:`1px solid rgba(56,189,248,${config.profitLock?0.4:0.15})`, borderRadius:10, padding:"12px 14px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div><div style={{ fontSize:12, fontWeight:700, color:"#38bdf8" }}>#91 Profit Lock {config.profitLockPct}%</div><div style={{ fontSize:10, color:M, marginTop:2 }}>Nie oddaj więcej niż {100-config.profitLockPct}% szczytowego zysku</div></div>
                    <button onClick={()=>update({profitLock:!config.profitLock})} style={{ background:config.profitLock?"rgba(56,189,248,0.2)":"rgba(255,255,255,0.06)", border:`1px solid ${config.profitLock?"#38bdf8":"rgba(255,255,255,0.2)"}`, borderRadius:7, padding:"5px 10px", color:config.profitLock?"#38bdf8":M, cursor:"pointer", fontWeight:700, fontSize:11 }}>{config.profitLock?"ON":"OFF"}</button>
                  </div>
                </div>
                {/* #41 Strategy presets */}
                <div style={{ background:"rgba(99,102,241,0.05)", border:"1px solid rgba(99,102,241,0.2)", borderRadius:10, padding:"12px 14px", gridColumn:"span 2" }}>
                  <div style={{ fontSize:12, fontWeight:700, color:"#818cf8", marginBottom:8 }}>#41 Presety strategii</div>
                  <div style={{ display:"flex", gap:8 }}>
                    {[
                      { name:"🐢 Konserwatywny", cfg:{ riskPct:5, trailPct:0.35, rsiMin:50, rsiMax:65, macdFilter:true, volumeFilter:true, drawdownProtection:true, recoveryMode:true, breakEvenStop:true } },
                      { name:"⚖️ Zbalansowany",  cfg:{ riskPct:10, trailPct:0.25, rsiMin:45, rsiMax:65, macdFilter:true, volumeFilter:true, drawdownProtection:true } },
                      { name:"🚀 Agresywny",     cfg:{ riskPct:15, trailPct:0.15, rsiMin:48, rsiMax:68, macdFilter:true, volumeFilter:true, drawdownProtection:false } },
                    ].map(p=>(
                      <button key={p.name} onClick={()=>{ update(p.cfg as Partial<BotConfig>); addLog(`Preset: ${p.name}`,"info"); }}
                        style={{ flex:1, background:"rgba(99,102,241,0.1)", border:"1px solid rgba(99,102,241,0.3)", borderRadius:7, padding:"7px 6px", color:"#818cf8", cursor:"pointer", fontSize:11, fontWeight:700 }}>{p.name}</button>
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ background:"rgba(34,197,94,0.05)", border:"1px solid rgba(34,197,94,0.15)", borderRadius:8, padding:"10px 14px", fontSize:11, color:M, lineHeight:1.7, marginBottom:14 }}>
                <strong style={{color:G}}>Aktywna konfiguracja:</strong> LONG gdy cena &gt; EMA±{config.emaMaxDist}% AND RSI [{config.rsiMin}-{config.rsiMax}]{config.useAdx ? ` AND ADX ≥ ${config.adxMin}` : ""}
                {config.allowShorts ? ` · SHORT gdy cena < EMA AND RSI < 40${config.useAdx?` AND ADX ≥ ${config.adxMin}`:""}` : ""}
                {` · Wyjście: ${config.dynamicExits?`ATR×${config.atrSlMul}SL / ATR×${config.atrTpMul}TP`:`SL ${config.stopLoss}% / TP ${config.takeProfit}%`}${config.trailStop?` + Trail ${config.trailPct}%`:""} + koniec sesji`}
              </div>

              <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                <button onClick={()=>{const best={...DEFAULTS, symbol:config.symbol, capital:config.capital, trades:config.trades}; setConfig(best); saveConfig(best); setTmpSL(String(best.stopLoss)); setTmpTP(String(best.takeProfit)); setTmpTrailPct(String(best.trailPct)); setTmpTrailAct(String(best.trailActivation)); setTmpRsiMin(String(best.rsiMin)); setTmpRsiMax(String(best.rsiMax)); setTmpEmaDist(String(best.emaMaxDist)); setTmpAdxMin(String(best.adxMin)); addLog("Reset do optymalnych ustawień (62% WR formula)","info");}}
                  style={{ background:"rgba(34,197,94,0.08)", border:"1px solid rgba(34,197,94,0.3)", borderRadius:8, padding:"8px 18px", color:G, cursor:"pointer", fontSize:13 }}>
                  Reset do najlepszych ustawień
                </button>
                {closed.length > 0 && (
                  <button onClick={()=>{if(confirm("Wyczyścić historię?")) update({trades:[],enabled:false});}}
                    style={{ background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:8, padding:"8px 18px", color:R, cursor:"pointer", fontSize:13 }}>
                    Wyczyść historię
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Trade history */}
        <div style={card}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
            <div style={{ fontSize:10, color:M, letterSpacing:1 }}>HISTORIA TRANSAKCJI ({closed.length})</div>
            {/* #88 CSV export */}
            {closed.length > 0 && (
              <button onClick={()=>{
                const rows = ["Data,Symbol,Kierunek,Wejście,Wyjście,PnL ($),PnL (%),Powód",
                  ...closed.map(t=>[
                    fmtDate(t.entryTime)+" "+fmtTime(t.entryTime),
                    t.symbol,
                    (t.direction??"long").toUpperCase(),
                    (t.entryPrice??0).toFixed(2),
                    (t.exitPrice??0).toFixed(2),
                    (t.pnl??0).toFixed(2),
                    (t.pnlPct??0).toFixed(2),
                    t.reason??"session_end"
                  ].join(","))
                ].join("\n");
                const a = document.createElement("a");
                a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(rows);
                a.download = `trades_${config.symbol}_${fmtDate(new Date().toISOString())}.csv`;
                a.click();
              }} style={{ background:"rgba(34,197,94,0.08)", border:"1px solid rgba(34,197,94,0.25)", borderRadius:7, padding:"4px 12px", color:G, cursor:"pointer", fontSize:11, fontWeight:700, display:"flex", alignItems:"center", gap:5 }}>
                ⬇ CSV
              </button>
            )}
          </div>
          {/* #99 Performance summary one-liner */}
          {closed.length >= 5 && (() => {
            const an = tradeAnalytics(closed);
            const grade = performanceGrade(an.sharpe, an.wr, an.pf);
            const gradeColor = grade==="A"?G:grade==="B"?"#86efac":grade==="C"?"#f59e0b":grade==="D"?"#fb923c":R;
            const status = an.wr>=55&&an.ev>0&&an.pf>=1.2 ? "✅ Strategia zyskowna" : an.wr>=45&&an.pf>=1 ? "⚠️ Wyniki mieszane" : "❌ Wymaga optymalizacji";
            const statusColor = an.wr>=55&&an.ev>0&&an.pf>=1.2?G:an.wr>=45&&an.pf>=1?"#f59e0b":R;
            return (
              <div style={{ background:"rgba(0,0,0,0.2)", borderRadius:8, padding:"8px 14px", marginBottom:14, fontSize:12, display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" as const }}>
                <span style={{ fontWeight:700, color:statusColor }}>{status}</span>
                <span style={{ color:M }}>·</span>
                <span style={{ color:an.wr>=55?G:"#f59e0b" }}>WR {an.wr.toFixed(0)}%</span>
                <span style={{ color:M }}>·</span>
                <span style={{ color:an.ev>=0?G:R }}>EV {an.ev>=0?"+":""}{an.ev.toFixed(2)}%</span>
                <span style={{ color:M }}>·</span>
                <span style={{ color:an.pf>=1.2?G:"#f59e0b" }}>PF {an.pf.toFixed(2)}</span>
                <span style={{ color:M }}>·</span>
                <span style={{ color:an.sharpe>=1?G:"#f59e0b" }}>Sharpe {an.sharpe.toFixed(2)}</span>
                <span style={{ color:M }}>·</span>
                <span style={{ color:gradeColor }}>Ocena {grade}</span>
                <span style={{ color:M }}>·</span>
                <span style={{ color:M }}>{closed.length} tr. · DD {an.maxDD.toFixed(1)}%</span>
              </div>
            );
          })()}
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

        {/* Live Trading */}
        {(hasBybitKeys() || serverHasKeys) && (() => {
          const srvPnlPct = serverPosition && ticker
            ? (serverPosition.direction==="long" ? (ticker.price - serverPosition.entryPrice)/serverPosition.entryPrice*100 : (serverPosition.entryPrice - ticker.price)/serverPosition.entryPrice*100)
            : null;
          const effLev = config.leverageAuto ? calcAutoLeverage(learningRef.current.deepHistory) : config.leverage;
          const isOn = serverBotRunning;
          return (<>
          {/* Live BTC price widget */}
          <div style={{ ...card, marginTop:14, background:"rgba(251,191,36,0.04)", border:"1px solid rgba(251,191,36,0.2)", padding:"12px 16px" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap" as const, gap:8 }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <span style={{ fontSize:20 }}>₿</span>
                <div>
                  <div style={{ fontSize:11, color:M, marginBottom:2 }}>BTC/USDT • LIVE</div>
                  <div style={{ fontSize:26, fontWeight:800, color:"#fff", letterSpacing:-1 }}>
                    {liveTicker ? `$${liveTicker.price.toLocaleString("en-US", {minimumFractionDigits:0, maximumFractionDigits:0})}` : "—"}
                  </div>
                </div>
                {liveTicker && (
                  <div style={{ background: liveTicker.change24h >= 0 ? "rgba(34,197,94,0.15)" : "rgba(248,113,113,0.15)", border:`1px solid ${liveTicker.change24h >= 0 ? "rgba(34,197,94,0.4)" : "rgba(248,113,113,0.4)"}`, borderRadius:8, padding:"4px 10px", fontSize:15, fontWeight:700, color: liveTicker.change24h >= 0 ? G : R }}>
                    {liveTicker.change24h >= 0 ? "+" : ""}{liveTicker.change24h.toFixed(2)}%
                  </div>
                )}
              </div>
              {liveTicker && (
                <div style={{ display:"flex", gap:16, fontSize:11, color:M }}>
                  <div><div style={{ color:"rgba(255,255,255,0.4)", marginBottom:1 }}>24H MAX</div><div style={{ color:"#fff", fontWeight:600 }}>${liveTicker.high24h.toLocaleString("en-US", {maximumFractionDigits:0})}</div></div>
                  <div><div style={{ color:"rgba(255,255,255,0.4)", marginBottom:1 }}>24H MIN</div><div style={{ color:"#fff", fontWeight:600 }}>${liveTicker.low24h.toLocaleString("en-US", {maximumFractionDigits:0})}</div></div>
                </div>
              )}
              {!liveTicker && <div style={{ fontSize:11, color:M }}>Ładowanie...</div>}
            </div>
          </div>

          <div style={{ ...card, marginTop:10, border: isOn ? "1px solid rgba(248,113,113,0.5)" : "1px solid rgba(255,255,255,0.08)" }}>
            {/* Header */}
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap" as const, gap:10 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <span style={{ fontSize:16 }}>🔴</span>
                <span style={{ fontWeight:700, fontSize:14 }}>LIVE TRADING — Bybit</span>
                {isOn
                  ? <span style={{ fontSize:10, background:"rgba(248,113,113,0.15)", border:"1px solid rgba(248,113,113,0.4)", borderRadius:6, padding:"2px 8px", color:"#f87171", display:"flex", alignItems:"center", gap:4 }}>
                      <span style={{ width:6, height:6, borderRadius:"50%", background:"#f87171", animation:"pulse 1.5s ease-in-out infinite", display:"inline-block" }}/> SERWER AKTYWNY
                    </span>
                  : <span style={{ fontSize:10, color:M }}>OFF — działa nawet po zamknięciu aplikacji</span>
                }
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                  <span style={{ fontSize:12, color:M }}>USDT:</span>
                  <input type="number" min="1" step="1" value={liveUsdt}
                    onChange={e => setLiveUsdt(e.target.value)} disabled={isOn}
                    style={{ width:65, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.15)", borderRadius:6, padding:"6px 8px", color:"#fff", fontSize:13, textAlign:"center" as const }}
                  />
                </div>
                <button
                  disabled={serverBotLoading}
                  onClick={() => {
                    setServerBotError(null);
                    setServerBotLoading(true);
                    const localKeys = hasBybitKeys() ? getBybitKeys() : { apiKey: "", secret: "", testnet: false };
                    const url = isOn ? "/api/bot/stop" : "/api/bot/start";
                    const body = isOn ? {} : { ...localKeys, symbol: config.symbol, rsiMin: config.rsiMin, rsiMax: config.rsiMax, trailPct: config.trailPct, stopLoss: config.stopLoss, takeProfit: config.takeProfit, leverage: effLev, allowShorts: config.allowShorts, capital: parseFloat(liveUsdt)||9, adxMin: config.adxMin };
                    fetch(url, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(body) })
                      .then(r => r.json())
                      .then(d => {
                        if (isOn) {
                          setServerBotRunning(false);
                          addLog("⬛ Serwer bot zatrzymany", "info");
                        } else if (d.ok) {
                          setServerBotRunning(true);
                          addLog(`🔴 BOT START — ${liveUsdt} USDT ${config.symbol} lev=${effLev}x`, "warn");
                        } else {
                          setServerBotError(d.error ?? "Błąd startu bota");
                          addLog(`🔴 Bot start error: ${d.error}`, "warn");
                        }
                      })
                      .catch(e => { setServerBotError(e.message); addLog(`🔴 Błąd: ${e.message}`, "warn"); })
                      .finally(() => setServerBotLoading(false));
                  }}
                  style={{ background: isOn ? "rgba(248,113,113,0.2)" : "rgba(34,197,94,0.15)", border:`1px solid ${isOn?"rgba(248,113,113,0.5)":"rgba(34,197,94,0.4)"}`, borderRadius:8, padding:"10px 20px", color: isOn ? "#f87171" : G, cursor: serverBotLoading ? "default" : "pointer", fontWeight:700, fontSize:14, opacity: serverBotLoading ? 0.6 : 1 }}>
                  {serverBotLoading ? "⏳ …" : isOn ? "⬛ STOP" : "▶ START LIVE"}
                </button>
              </div>
            </div>

            {serverBotError && (
              <div style={{ marginTop:8, fontSize:12, color:"#f87171", background:"rgba(248,113,113,0.1)", border:"1px solid rgba(248,113,113,0.3)", borderRadius:6, padding:"6px 10px" }}>
                ❌ {serverBotError}
              </div>
            )}

            {/* Test API connection button */}
            {!isOn && (
              <div style={{ marginTop:8 }}>
                <button onClick={async () => {
                  const { apiKey, secret, testnet } = getBybitKeys();
                  if (!apiKey || !secret) { alert("Najpierw wpisz klucze API w Settings"); return; }
                  try {
                    const r = await fetch("/api/bybit/test", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ apiKey, secret, testnet }) });
                    const d = await r.json();
                    alert("Wynik testu Bybit API:\n" + JSON.stringify(d, null, 2));
                  } catch(e: any) { alert("Błąd: " + e.message); }
                }} style={{ background:"rgba(251,191,36,0.15)", border:"1px solid rgba(251,191,36,0.4)", borderRadius:6, padding:"6px 14px", color:"#fbbf24", cursor:"pointer", fontSize:12, fontWeight:600 }}>
                  🔍 Test połączenia Bybit
                </button>
              </div>
            )}

            {/* Stats */}
            {isOn && (
              <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginTop:12 }}>
                <div style={{ background:"rgba(255,255,255,0.04)", borderRadius:8, padding:"10px 12px", textAlign:"center" as const }}>
                  <div style={{ fontSize:10, color:M, marginBottom:4 }}>SALDO {liveBalanceCoin}</div>
                  <div style={{ fontSize:18, fontWeight:700, color: liveBalance === -1 ? R : "#fff" }}>
                    {liveBalance === null ? "—" : liveBalance === -1 ? "Błąd" : liveBalance.toFixed(2)}
                  </div>
                  <button onClick={fetchLiveBalance} style={{ marginTop:6, background:"rgba(255,255,255,0.08)", border:"1px solid rgba(255,255,255,0.15)", borderRadius:6, color:"#fff", cursor:"pointer", fontSize:12, padding:"4px 10px", display:"inline-flex", alignItems:"center", gap:4 }}>↻ odśwież</button>
                </div>
                <div style={{ background: serverPosition ? (srvPnlPct != null && srvPnlPct >= 0 ? "rgba(34,197,94,0.07)" : "rgba(248,113,113,0.07)") : "rgba(255,255,255,0.04)", borderRadius:8, padding:"10px 12px", textAlign:"center" as const }}>
                  <div style={{ fontSize:10, color:M, marginBottom:4 }}>POZYCJA</div>
                  {serverPosition
                    ? <><div style={{ fontSize:13, fontWeight:700, color: serverPosition.direction==="long"?G:R }}>{serverPosition.direction.toUpperCase()} @ ${fmt(serverPosition.entryPrice)}</div>
                        <div style={{ fontSize:16, fontWeight:700, color: srvPnlPct != null && srvPnlPct >= 0 ? G : R, marginTop:2 }}>{srvPnlPct != null ? `${srvPnlPct >= 0?"+":""}${srvPnlPct.toFixed(2)}%` : "—"}</div></>
                    : <div style={{ fontSize:13, color:M, marginTop:4 }}>brak pozycji</div>}
                </div>
                <div style={{ background: serverPnl >= 0 ? "rgba(34,197,94,0.07)" : "rgba(248,113,113,0.07)", borderRadius:8, padding:"10px 12px", textAlign:"center" as const }}>
                  <div style={{ fontSize:10, color:M, marginBottom:4 }}>WYNIK SESJI</div>
                  <div style={{ fontSize:18, fontWeight:700, color: serverPnl >= 0 ? G : R }}>{serverPnl >= 0?"+":""}{serverPnl.toFixed(2)}</div>
                  <div style={{ fontSize:10, color:M }}>USDT</div>
                </div>
              </div>
            )}

            {/* Server logs */}
            {isOn && serverBotLogs.length > 0 && (
              <div style={{ marginTop:10, maxHeight:100, overflowY:"auto" as const, fontSize:11, color:M, background:"rgba(0,0,0,0.2)", borderRadius:6, padding:"6px 10px" }}>
                {serverBotLogs.slice(-8).reverse().map((l,i) => (
                  <div key={i} style={{ color: l.type==="buy"?G:l.type==="sell"?R:l.type==="warn"?"#f87171":M, marginBottom:2 }}>
                    {new Date(l.time).toLocaleTimeString("pl")} — {l.msg}
                  </div>
                ))}
              </div>
            )}
          </div>
          </>);
        })()}

        {/* Backtest */}
        <div style={{ ...card, marginTop:14 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:btResult?16:0 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
              <FlaskConical size={15} color={G}/>
              <span style={{ fontWeight:700, fontSize:14 }}>Backtest strategii</span>
              <span style={{ fontSize:11, color:M, background:config.allow24h?"rgba(167,139,250,0.1)":"rgba(34,197,94,0.1)", border:`1px solid ${config.allow24h?"rgba(167,139,250,0.2)":"rgba(34,197,94,0.2)"}`, borderRadius:6, padding:"2px 8px" }}>
                {btResult ? `${btResult.days}d · ${btResult.periodLabel}` : config.allow24h?"24H mode ~12 dni":"losowy okres ~25 dni"} · RSI[{config.rsiMin}-{config.rsiMax}]{config.allow24h?` · 24H hold${config.maxHoldCandles}h`:""}{config.trailStop?` · Trail${config.trailPct}%`:""} · {config.allowShorts?"L+S":"Long"}
              </span>
            </div>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
              <button
                onClick={async()=>{
                  setDeepLoading(true); setDeepProgress(0); setDeepResult(null);
                  addLog(`🧠 Deep Train start — pobieranie historii ${config.symbol} od 2017…`,"info");
                  try {
                    let candles: CandleData[];
                    if (fullHistoryRef.current?.symbol === config.symbol) {
                      candles = fullHistoryRef.current.candles;
                      setDeepProgress(50);
                    } else {
                      candles = await fetchFullHistory(config.symbol, p => setDeepProgress(p * 0.6));
                      fullHistoryRef.current = { symbol: config.symbol, candles };
                    }
                    addLog(`🧠 Pobrano ${candles.length} świec (${Math.round(candles.length/24/365*10)/10} lat). Optymalizacja 16 kombinacji×${Math.min(config.deepTrainWindows,30)} okien…`,"info");
                    setDeepProgress(65);
                    // async — yields 4ms between each combo, UI stays responsive + real progress
                    // onBestSoFar saves partial result immediately so closing browser mid-run preserves learning
                    const r = await runDeepOptimizeAsync(candles, {...config}, p => setDeepProgress(p), (partial) => {
                      // save partial best immediately to localStorage — survives page close
                      const mem = { ...learningRef.current, deepResult: partial };
                      learningRef.current = mem;
                      saveLearning(mem);
                      setDeepResult(partial);
                      update({rsiMin:partial.rsiMin, rsiMax:partial.rsiMax, trailPct:partial.trailPct});
                      setTmpRsiMin(String(partial.rsiMin)); setTmpRsiMax(String(partial.rsiMax)); setTmpTrailPct(String(partial.trailPct));
                    });
                    setDeepProgress(100);
                    // add to history (keep last 5), recompute ensemble
                    const newHistory = [...learningRef.current.deepHistory.slice(-4), r];
                    const ensemble = calcEnsemble(newHistory);
                    // apply ensemble params (not just this run) if we have ≥2 runs
                    const apply = newHistory.length >= 2 && ensemble ? ensemble : r;
                    setDeepResult(r);
                    update({rsiMin:apply.rsiMin, rsiMax:apply.rsiMax, trailPct:apply.trailPct});
                    setTmpRsiMin(String(apply.rsiMin)); setTmpRsiMax(String(apply.rsiMax)); setTmpTrailPct(String(apply.trailPct));
                    const ensembleNote = newHistory.length >= 2 ? ` · 🎯 konsensus ${newHistory.length} treningów: RSI[${apply.rsiMin}-${apply.rsiMax}] Trail${apply.trailPct}%` : "";
                    addLog(`🧠 Deep Train #${newHistory.length} (${r.windows} okien): RSI[${r.rsiMin}-${r.rsiMax}] Trail${r.trailPct}% Sharpe ${r.sharpe.toFixed(2)} WR ${r.winRate.toFixed(0)}%${ensembleNote}`,"info");
                    learningRef.current = { ...learningRef.current, deepResult: r, deepHistory: newHistory, ensembleResult: ensemble };
                    saveLearning(learningRef.current);
                    // AUTO strategia: apply updated filters + leverage after each Deep Train
                    if (config.filterAutoMode) {
                      const af = calcAutoFilters(newHistory, md);
                      update({volumeFilter:af.volumeFilter,macdFilter:af.macdFilter,emaRibbonFilter:af.emaRibbonFilter,stochRsiFilter:af.stochRsiFilter,bbFilter:af.bbFilter,emaSlopeFilter:af.emaSlopeFilter,adxSlope:af.adxSlope,volumeTrend:af.volumeTrend,wickFilter:af.wickFilter,ichimokuFilter:af.ichimokuFilter,haFilter:af.haFilter,rocFilter:af.rocFilter,rsiRising:af.rsiRising,sessionScoreGate:af.sessionScoreGate});
                    }
                  } catch(e:any) { addLog("Deep Train błąd: "+e.message,"warn"); }
                  finally { setDeepLoading(false); }
                }}
                disabled={deepLoading||optLoading||btLoading}
                style={{ background:deepLoading?"rgba(251,146,60,0.05)":"rgba(251,146,60,0.12)", border:"1px solid rgba(251,146,60,0.4)", borderRadius:8, padding:"8px 14px", color:deepLoading?M:"#fb923c", cursor:deepLoading?"default":"pointer", fontWeight:700, fontSize:12, display:"flex", alignItems:"center", gap:5 }}>
                {deepLoading
                  ? <><RefreshCw size={12} style={{animation:"spin 1s linear infinite"}}/> {deepProgress < 62 ? `Pobieranie ${deepProgress.toFixed(0)}%` : `Optymalizacja ${deepProgress.toFixed(0)}%`}</>
                  : <><BarChart2 size={12}/> Deep Train</>}
              </button>
              <button
                onClick={async()=>{ setOptLoading(true); setOptResult(null); try { const r=await runOptimize({...config}); const newOptHist=[...learningRef.current.optHistory.slice(-4), r]; const optEns=calcEnsemble(newOptHist); const applyOpt=newOptHist.length>=2&&optEns?optEns:r; setOptResult(r); update({rsiMin:applyOpt.rsiMin,rsiMax:applyOpt.rsiMax,trailPct:applyOpt.trailPct}); setTmpRsiMin(String(applyOpt.rsiMin)); setTmpRsiMax(String(applyOpt.rsiMax)); setTmpTrailPct(String(applyOpt.trailPct)); const optNote=newOptHist.length>=2?` · konsensus ${newOptHist.length}×: RSI[${applyOpt.rsiMin}-${applyOpt.rsiMax}]`:""; addLog(`🧠 Auto-opt #${newOptHist.length}: RSI[${r.rsiMin}-${r.rsiMax}] Trail${r.trailPct}% Sharpe ${r.sharpe.toFixed(2)} WR ${r.winRate.toFixed(0)}%${optNote}`,"info"); learningRef.current={...learningRef.current,optResult:r,optHistory:newOptHist}; saveLearning(learningRef.current); } catch(e:any){ addLog("Auto-opt błąd: "+e.message,"warn"); } finally{ setOptLoading(false); } }}
                disabled={optLoading||btLoading||deepLoading}
                style={{ background:optLoading?"rgba(251,191,36,0.05)":"rgba(251,191,36,0.12)", border:"1px solid rgba(251,191,36,0.35)", borderRadius:8, padding:"8px 14px", color:optLoading?M:"#fbbf24", cursor:optLoading?"default":"pointer", fontWeight:700, fontSize:12, display:"flex", alignItems:"center", gap:5 }}>
                {optLoading?<><RefreshCw size={12} style={{animation:"spin 1s linear infinite"}}/> Optymalizuję…</>:<><BarChart2 size={12}/> Auto-Opt</>}
              </button>
              <button
                onClick={async()=>{ setBtLoading(true); setBtError(null); setBtResult(null); try { const effLev=config.leverageAuto?calcAutoLeverage(learningRef.current.deepHistory):config.leverage; setBtResult(await runBacktest({...config,leverage:effLev,leverageAuto:config.leverageAuto})); } catch(e:any){ setBtError(e.message); } finally{ setBtLoading(false); } }}
                disabled={btLoading||deepLoading}
                style={{ background:btLoading?"rgba(34,197,94,0.05)":"rgba(34,197,94,0.15)", border:"1px solid rgba(34,197,94,0.35)", borderRadius:8, padding:"8px 18px", color:btLoading?M:G, cursor:btLoading?"default":"pointer", fontWeight:700, fontSize:13, display:"flex", alignItems:"center", gap:6 }}>
                {btLoading?<><RefreshCw size={13} style={{animation:"spin 1s linear infinite"}}/> Pobieranie…</>:<><FlaskConical size={13}/> Uruchom</>}
              </button>
            </div>
          </div>

          {/* Deep Train progress bar */}
          {deepLoading && (
            <div style={{ marginBottom:10 }}>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:"#fb923c", marginBottom:4 }}>
                <span>🧠 Deep Train — {deepProgress < 62 ? `pobieranie historii ${config.symbol} od 2017` : `optymalizacja ${Math.round((deepProgress-65)/35*16)}/16 kombinacji`}</span>
                <span>{deepProgress.toFixed(0)}%</span>
              </div>
              <div style={{ height:4, background:"rgba(255,255,255,0.07)", borderRadius:2 }}>
                <div style={{ width:`${deepProgress}%`, height:"100%", background:"#fb923c", borderRadius:2, transition:"width 0.3s" }}/>
              </div>
            </div>
          )}

          {deepResult && !deepLoading && (() => {
            const hist = learningRef.current.deepHistory;
            const ens  = learningRef.current.ensembleResult;
            return (
              <div style={{ background:"rgba(251,146,60,0.07)", border:"1px solid rgba(251,146,60,0.3)", borderRadius:8, padding:"10px 14px", marginBottom:10, fontSize:12 }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:hist.length>1?6:0 }}>
                  <span><span style={{color:"#fb923c",fontWeight:700}}>🧠 Deep Train #{hist.length} ({deepResult.windows} okien):</span>
                  {" "}RSI [{deepResult.rsiMin}-{deepResult.rsiMax}] · Trail {deepResult.trailPct}% · Sharpe <span style={{color:deepResult.sharpe>=1?G:"#f59e0b"}}>{deepResult.sharpe.toFixed(2)}</span> · WR <span style={{color:G}}>{deepResult.winRate.toFixed(0)}%</span></span>
                </div>
                {hist.length >= 2 && ens && (
                  <div style={{ background:"rgba(251,146,60,0.08)", borderRadius:6, padding:"5px 10px", fontSize:11 }}>
                    <span style={{color:"#fb923c",fontWeight:700}}>🎯 Konsensus {hist.length} treningów:</span>
                    {" "}RSI [{ens.rsiMin}-{ens.rsiMax}] · Trail {ens.trailPct}%
                    {" "}· avg Sharpe <span style={{color:ens.sharpe>=1?G:"#f59e0b"}}>{ens.sharpe.toFixed(2)}</span>
                    <span style={{color:M}}> — Sharpe-weighted z {hist.length} niezależnych treningów · aktywne parametry</span>
                  </div>
                )}
                {hist.length === 1 && <span style={{color:M}}> — uruchom jeszcze raz żeby bot zbudował konsensus</span>}
                {(() => {
                  const activeSharpe = ens ? ens.sharpe : deepResult.sharpe;
                  const activeWR = ens ? ens.winRate : deepResult.winRate;
                  if (activeSharpe <= -900) return null;
                  const sharpeScore = Math.min(Math.max(activeSharpe, 0), 4) / 4 * 65;
                  const runsScore   = Math.min(hist.filter(r=>r.sharpe>0).length, 5) / 5 * 20;
                  const wrScore     = Math.max(0, Math.min((activeWR - 40) / 20, 1)) * 15;
                  const pct = Math.round(Math.min(sharpeScore + runsScore + wrScore, 100));
                  const stars = pct >= 80 ? 5 : pct >= 60 ? 4 : pct >= 40 ? 3 : pct >= 20 ? 2 : 1;
                  const label = pct >= 80 ? "Ekspert" : pct >= 60 ? "Zaawansowany" : pct >= 40 ? "Średni" : pct >= 20 ? "Początkujący" : "Słaby";
                  const color = pct >= 80 ? "#4ade80" : pct >= 60 ? "#86efac" : pct >= 40 ? "#fbbf24" : pct >= 20 ? "#fb923c" : "#f87171";
                  return (
                    <div style={{ marginTop:8, padding:"6px 10px", background:"rgba(0,0,0,0.2)", borderRadius:6 }}>
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:4 }}>
                        <span style={{ color:"rgba(255,255,255,0.6)", fontSize:11 }}>🎓 Poziom wytrenowania</span>
                        <span style={{ color, fontWeight:700, fontSize:11 }}>{"★".repeat(stars)}{"☆".repeat(5-stars)} {label} ({pct}%)</span>
                      </div>
                      <div style={{ height:5, background:"rgba(255,255,255,0.1)", borderRadius:3, overflow:"hidden" }}>
                        <div style={{ height:"100%", width:`${pct}%`, background:`linear-gradient(90deg, #fb923c, ${color})`, borderRadius:3, transition:"width 0.5s" }}/>
                      </div>
                      <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, color:"rgba(255,255,255,0.3)", marginTop:2 }}>
                        <span>Sharpe {activeSharpe.toFixed(2)}</span>
                        <span>WR {activeWR.toFixed(0)}%</span>
                        <span>{hist.filter(r=>r.sharpe>0).length}/{hist.length} treningów OK</span>
                      </div>
                    </div>
                  );
                })()}
                {deepResult.sharpe <= -900 && (
                  <div style={{ marginTop:6 }}>
                    <button onClick={()=>{ const m={...learningRef.current,deepHistory:[],optHistory:[],ensembleResult:null,deepResult:null,optResult:null}; learningRef.current=m; saveLearning(m); setDeepResult(null); setOptResult(null); addLog("Historia Deep Train wyczyszczona — uruchom ponownie","info"); }} style={{ background:"rgba(248,113,113,0.15)", border:"1px solid rgba(248,113,113,0.4)", borderRadius:6, padding:"4px 10px", color:"#f87171", cursor:"pointer", fontSize:11, fontWeight:700 }}>🗑 Wyczyść złą historię i zacznij od nowa</button>
                  </div>
                )}
              </div>
            );
          })()}

          {optResult && !deepResult && (() => {
            const hist = learningRef.current.optHistory;
            const ens  = calcEnsemble(hist);
            const activeSharpe = ens ? ens.sharpe : optResult.sharpe;
            const activeWR = ens ? ens.winRate : optResult.winRate;
            const sharpeScore = Math.min(Math.max(activeSharpe, 0), 4) / 4 * 65;
            const runsScore   = Math.min(hist.filter(r=>r.sharpe>0).length, 5) / 5 * 20;
            const wrScore     = Math.max(0, Math.min((activeWR - 40) / 20, 1)) * 15;
            const pct = Math.round(Math.min(sharpeScore + runsScore + wrScore, 100));
            const stars = pct >= 80 ? 5 : pct >= 60 ? 4 : pct >= 40 ? 3 : pct >= 20 ? 2 : 1;
            const label = pct >= 80 ? "Ekspert" : pct >= 60 ? "Zaawansowany" : pct >= 40 ? "Średni" : pct >= 20 ? "Początkujący" : "Słaby";
            const color = pct >= 80 ? "#4ade80" : pct >= 60 ? "#86efac" : pct >= 40 ? "#fbbf24" : pct >= 20 ? "#fb923c" : "#f87171";
            return (
              <div style={{ background:"rgba(251,191,36,0.07)", border:"1px solid rgba(251,191,36,0.25)", borderRadius:8, padding:"10px 14px", marginBottom:10, fontSize:12 }}>
                <span style={{color:"#fbbf24",fontWeight:700}}>🧠 Auto-Opt #{hist.length}:</span>
                {" "}RSI [{optResult.rsiMin}-{optResult.rsiMax}] · Trail {optResult.trailPct}% · Sharpe <span style={{color:optResult.sharpe>=1?G:"#f59e0b"}}>{optResult.sharpe.toFixed(2)}</span> · WR <span style={{color:G}}>{optResult.winRate.toFixed(0)}%</span>
                {hist.length >= 2 && ens && <span style={{color:"#fbbf24"}}> · 🎯 konsensus {hist.length}×: RSI [{ens.rsiMin}-{ens.rsiMax}] Trail {ens.trailPct}%</span>}
                {activeSharpe > -900 && (
                  <div style={{ marginTop:8, padding:"6px 10px", background:"rgba(0,0,0,0.2)", borderRadius:6 }}>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:4 }}>
                      <span style={{ color:"rgba(255,255,255,0.6)", fontSize:11 }}>🎓 Poziom wytrenowania</span>
                      <span style={{ color, fontWeight:700, fontSize:11 }}>{"★".repeat(stars)}{"☆".repeat(5-stars)} {label} ({pct}%)</span>
                    </div>
                    <div style={{ height:5, background:"rgba(255,255,255,0.1)", borderRadius:3, overflow:"hidden" }}>
                      <div style={{ height:"100%", width:`${pct}%`, background:`linear-gradient(90deg, #fbbf24, ${color})`, borderRadius:3, transition:"width 0.5s" }}/>
                    </div>
                    <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, color:"rgba(255,255,255,0.3)", marginTop:2 }}>
                      <span>Sharpe {activeSharpe.toFixed(2)}</span>
                      <span>WR {activeWR.toFixed(0)}%</span>
                      <span>{hist.filter(r=>r.sharpe>0).length}/{hist.length} treningów OK</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
          {!btResult && !btLoading && !btError && !deepLoading && (
            <div style={{ fontSize:13, color:M, lineHeight:1.7 }}>
              {config.allow24h?"Tryb 24H: bot szuka sygnałów przez całą dobę, trzyma pozycję max "+config.maxHoldCandles+"h.":"Tryb sesja: bot handluje w oknie 21:00–23:00 UTC."} Kliknij <strong style={{color:"#fb923c"}}>Deep Train</strong> żeby wytrenować na całej historii Binance (2017–dziś) lub <strong style={{color:"#fbbf24"}}>Auto-Opt</strong> na ostatnich 800 świecach.
            </div>
          )}
          {btError && <div style={{ color:R, fontSize:13, marginTop:8, display:"flex", alignItems:"center", gap:6 }}><AlertCircle size={14}/> {btError}</div>}

          {btResult && (() => {
            const r=btResult;
            const lev=config.leverageAuto?calcAutoLeverage(learningRef.current.deepHistory):config.leverage;
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
                    <span>{r.periodLabel.split(" – ")[0]}</span>
                    <span style={{ color:r.totalReturn>=0?G:R, fontWeight:700 }}>{r.totalReturn>=0?"+":""}{r.totalReturn.toFixed(1)}% końcowy</span>
                    <span>{r.periodLabel.split(" – ")[1]}</span>
                  </div>
                </div>

                {lev > 1 && (
                  <div style={{ background:config.leverageAuto?"rgba(167,139,250,0.08)":"rgba(251,191,36,0.08)", border:`1px solid ${config.leverageAuto?"rgba(167,139,250,0.3)":"rgba(251,191,36,0.3)"}`, borderRadius:10, padding:"10px 14px", marginBottom:10, fontSize:12, display:"flex", alignItems:"center", gap:8 }}>
                    <span style={{ fontSize:16 }}>{config.leverageAuto?"🤖":"⚡"}</span>
                    <span>
                      {config.leverageAuto
                        ? <><strong style={{ color:"#a78bfa" }}>AUTO dźwignia: max {lev}x</strong> — każda transakcja dostaje dźwignię wg jakości sygnału (ADX+vol+MACD+RSI): score≥7→{lev}x, score≥4→{Math.max(1,Math.floor((lev+1)/2))}x, score&lt;4→1x. Likwidacja przy -{(100/lev).toFixed(0)}% ruchu.</>
                        : <><strong style={{ color:"#fbbf24" }}>{lev}x dźwignia ręczna</strong> — wyniki uwzględniają mnożnik ×{lev}. Likwidacja przy -{(100/lev).toFixed(0)}% ruchu. {lev>=5?"Wysokie ryzyko — używaj ostrożnie!":""}</>
                      }
                    </span>
                  </div>
                )}
                {config.leverageAuto && lev === 1 && (
                  <div style={{ background:"rgba(167,139,250,0.06)", border:"1px solid rgba(167,139,250,0.2)", borderRadius:10, padding:"10px 14px", marginBottom:10, fontSize:12, display:"flex", alignItems:"center", gap:8 }}>
                    <span style={{ fontSize:16 }}>🤖</span>
                    <span style={{ color:"#a78bfa" }}>AUTO dźwignia: 1x (brak dźwigni) — potrzeba min. 2 sesji Deep Train z Sharpe &gt;2.8 i WR &gt;72% żeby system włączył dźwignię.</span>
                  </div>
                )}
                <div style={{ background:r.winRate>=55&&r.totalReturn>0?"rgba(34,197,94,0.08)":r.winRate>=45?"rgba(245,158,11,0.08)":"rgba(248,113,113,0.08)", border:`1px solid ${r.winRate>=55&&r.totalReturn>0?"rgba(34,197,94,0.25)":r.winRate>=45?"rgba(245,158,11,0.25)":"rgba(248,113,113,0.25)"}`, borderRadius:10, padding:"12px 14px", marginBottom:12, fontSize:13 }}>
                  <strong style={{ color:r.winRate>=55&&r.totalReturn>0?G:r.winRate>=45?"#f59e0b":R }}>{r.winRate>=55&&r.totalReturn>0?"✅ Strategia byłaby zyskowna":r.winRate>=45?"⚠️ Wyniki mieszane":"❌ Strategia nierentowna"}</strong>
                  {" "}Win rate {r.winRate.toFixed(0)}% przy {r.trades.length} transakcjach ({r.longs}L/{r.shorts}S) w okresie {r.periodLabel}{lev>1?` · ${lev}x dźwignia`:""}.
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
              {config.learningEnabled && <span style={{ fontSize:10, background:"rgba(99,102,241,0.1)", border:"1px solid rgba(99,102,241,0.25)", borderRadius:6, padding:"2px 7px", color:"#818cf8" }}>🧠 UCZENIE</span>}
              {config.enabled && sess.inSession && <span style={{ fontSize:10, background:"rgba(34,197,94,0.1)", border:"1px solid rgba(34,197,94,0.25)", borderRadius:6, padding:"2px 7px", color:G, display:"flex", alignItems:"center", gap:4 }}><span style={{ width:6, height:6, borderRadius:"50%", background:G, animation:"pulse 1.5s ease-in-out infinite", display:"inline-block" }}/> LIVE</span>}
            </div>
            {activityLog.length>0 && <button onClick={()=>{ setActivityLog([]); learningRef.current={...learningRef.current,activityLog:[]}; saveLearning(learningRef.current); }} style={{ background:"none", border:"none", color:M, cursor:"pointer", fontSize:11 }}>Wyczyść</button>}
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

        {/* Learning history — persisted across restarts */}
        {(learningRef.current.adaptations.length > 0 || learningRef.current.deepHistory.length > 0) && (
          <div style={{ ...card, marginTop:14 }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" as const }}>
                <span style={{ fontSize:16 }}>🧠</span>
                <span style={{ fontWeight:700, fontSize:14 }}>Historia uczenia</span>
                <span style={{ fontSize:10, background:"rgba(99,102,241,0.08)", border:"1px solid rgba(99,102,241,0.2)", borderRadius:6, padding:"2px 7px", color:"#818cf8" }}>
                  {learningRef.current.adaptations.length} adaptacji · {learningRef.current.adaptCount} tr.
                </span>
                {learningRef.current.deepHistory.length > 0 && (
                  <span style={{ fontSize:10, background:"rgba(251,146,60,0.08)", border:"1px solid rgba(251,146,60,0.2)", borderRadius:6, padding:"2px 7px", color:"#fb923c" }}>
                    {learningRef.current.deepHistory.length}× Deep Train
                    {learningRef.current.ensembleResult && ` · konsensus RSI[${learningRef.current.ensembleResult.rsiMin}-${learningRef.current.ensembleResult.rsiMax}]`}
                  </span>
                )}
                {learningRef.current.optHistory.length > 0 && (
                  <span style={{ fontSize:10, background:"rgba(251,191,36,0.08)", border:"1px solid rgba(251,191,36,0.2)", borderRadius:6, padding:"2px 7px", color:"#fbbf24" }}>
                    {learningRef.current.optHistory.length}× Auto-Opt
                  </span>
                )}
              </div>
              <button onClick={()=>{ learningRef.current={...learningRef.current,adaptations:[],adaptCount:0,autoOptCount:0,deepHistory:[],optHistory:[],ensembleResult:null,deepResult:null,optResult:null}; saveLearning(learningRef.current); adaptCountRef.current=0; autoOptRef.current=0; setDeepResult(null); setOptResult(null); }} style={{ background:"none", border:"none", color:M, cursor:"pointer", fontSize:11 }}>Resetuj pamięć</button>
            </div>
            <div style={{ maxHeight:160, overflowY:"auto", fontFamily:"monospace", fontSize:11, lineHeight:1.8 }}>
              {[...learningRef.current.adaptations].reverse().map((a,i)=>(
                <div key={i} style={{ display:"flex", gap:10, borderBottom:"1px solid rgba(255,255,255,0.04)", padding:"3px 0" }}>
                  <span style={{ color:"rgba(255,255,255,0.25)", flexShrink:0, minWidth:90 }}>{new Date(a.time).toLocaleDateString("pl",{day:"2-digit",month:"2-digit"})} {new Date(a.time).toLocaleTimeString("pl",{hour:"2-digit",minute:"2-digit"})}</span>
                  <span style={{ color:"#818cf8" }}>tr#{a.tradeCount}</span>
                  <span style={{ color:"rgba(255,255,255,0.7)" }}>{a.change}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}} @keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.5;transform:scale(0.85)}}`}</style>
        <div style={{ marginTop:18, fontSize:11, color:"rgba(255,255,255,0.2)", textAlign:"center" }}>
          Paper trading — symulacja edukacyjna. Nie jest to porada inwestycyjna. Krypto = wysokie ryzyko.
        </div>
      </div>
    </ResellLayout>
  );
}
