/**
 * Shared backtest/simulation engine — mirrors the LIVE trading engine (engineTick).
 * Extracted VERBATIM from the /backtest handler so that simulation, optimizer and
 * the live bot all behave identically. No side-effects, no network, no secrets.
 */
import { calcRsi, calcEma, calcMacd, calcAdx, calcAtr, calcVolumeMult, calcStochRsi, calcBBPercB, calcRoc, TREND, calc4HTrend, calcRegime, MTF_WEIGHTS, MTF_STRONG_BEAR, trendStackScore, trendStackLabel } from "./indicators";

export type SimParams = {
  rsiMin: number; rsiMax: number; adxMin: number; confluenceMin: number;
  volMultMin: number; cooldownMin: number; stopLoss: number; takeProfit: number;
  trailPct: number; leverage: number; allowShorts: boolean;
  baseMin?: number; // base candle interval in minutes (default 5); enables longer windows at 1h
  filters?: {
    stochRsi80?: boolean;  bbPercB80?: boolean;  bodyQuality?: boolean;
    emaSlope?: boolean;    candleConfirm?: boolean; adxRising?: boolean;
    volTrend?: boolean;    wickRej?: boolean;    roc14?: boolean;
    ichimoku?: boolean;    heikinAshi?: boolean; bbSqueeze?: boolean;
  };
};

export type SimTrade = {
  dir: string; entry: number; exit: number; pnlPct: number;
  reason: string; signal: string; time: string;
};

export type SimResult = {
  trades: SimTrade[]; numTrades: number; longs: number; shorts: number;
  winRate: number; totalReturn: number; maxDrawdown: number; avgWin: number;
  avgLoss: number; finalEquity: number; sharpe: number;
};

/**
 * Pure backtest. `raw` = 5m Kraken OHLC rows [time,o,h,l,c,vwap,vol,count];
 * `raw4` = 4h OHLC rows. Logic is identical to the live engineTick path.
 */
export function simulate(raw: any[], raw4: any[], p: SimParams): SimResult {
  const {
    rsiMin, rsiMax, adxMin, confluenceMin, volMultMin, cooldownMin,
    stopLoss, takeProfit, trailPct, leverage, allowShorts,
  } = p;
  const baseMin = Math.max(1, p.baseMin ?? 5); // base candle interval (5m default, 60m for 30-day)

  // Realistic fee model: maker entry (limit order) + taker exit (market at SL/TP)
  // Kraken: maker 0.16%, taker 0.26% → mixed round-trip ≈ 0.42% (better than pure taker 0.52%)
  // + slippage: avg 0.05% per fill on BTC at $60K+ (1-2 ticks spread)
  const FEE_RT = 0.0042 + 0.001; // 0.42% fees + 0.10% slippage = 0.52% total cost

  // ── 4H trend lookup (mirrors live fetch4HCandles) ────────
  const c4closes = raw4.map((c: any) => parseFloat(c[4]));
  const c4times  = raw4.map((c: any) => c[0] * 1000);
  const trend4hAt = (tMs: number): "bull" | "bear" | "neutral" => {
    let idx = -1;
    for (let q = c4times.length - 1; q >= 0; q--) { if (c4times[q] <= tMs) { idx = q; break; } }
    if (idx < 21) return "neutral";
    const slice = c4closes.slice(0, idx + 1);
    const e9 = calcEma(slice, 9), e21 = calcEma(slice, 21);
    return calc4HTrend(e9, e21);
  };

  const closes  = raw.map((c: any) => parseFloat(c[4]));
  const opens   = raw.map((c: any) => parseFloat(c[1]));
  const highs   = raw.map((c: any) => parseFloat(c[2]));
  const lows    = raw.map((c: any) => parseFloat(c[3]));
  const vwapsAll= raw.map((c: any) => parseFloat(c[5]));
  const volumes = raw.map((c: any) => parseFloat(c[6]));
  const c5times = raw.map((c: any) => c[0] * 1000);

  // ── Multi-timeframe stack (Layer 1) — resample 5m into 15m/30m/1h ─────────────
  // Live also reads 1m, which cannot be reconstructed from 5m data; the score
  // renormalises over the present weights so backtest ≈ live (1m has lowest weight).
  const _resample = (factor: number) => {
    const rc: number[] = [], rt: number[] = [];
    for (let q = factor - 1; q < closes.length; q += factor) { rc.push(closes[q]); rt.push(c5times[q]); }
    return { rc, rt };
  };
  // Resample factors scale with the base interval (×3 for 15m on 5m base, ×1 on coarser base)
  const _tf15 = _resample(Math.max(1, Math.round(15 / baseMin)));
  const _tf30 = _resample(Math.max(1, Math.round(30 / baseMin)));
  const _tf60 = _resample(Math.max(1, Math.round(60 / baseMin)));
  const trendTfAt = (tMs: number, tf: { rc: number[]; rt: number[] }): "bull" | "bear" | "neutral" => {
    let idx = -1;
    for (let q = tf.rt.length - 1; q >= 0; q--) { if (tf.rt[q] <= tMs) { idx = q; break; } }
    if (idx < 21) return "neutral";
    const slice = tf.rc.slice(0, idx + 1);
    return calc4HTrend(calcEma(slice, 9), calcEma(slice, 21));
  };

  const trades: SimTrade[] = [];
  const cooldownMs = cooldownMin * 60 * 1000;
  const effLev = Math.max(1, leverage);
  const MAX_HOLD = Math.round(48 * 60 / baseMin); // 48h in candles (576 at 5m, 48 at 1h)
  let lastEntry = 0;
  let prevRsiSim = 50;           // RSI recovery tracking across candles (mirrors prevRsi)
  let adxLowCnt = 0;             // range-mode counter (mirrors adxLowCount)
  let skipUntil = -1;            // skip candles inside an open simulated trade
  let dayKey = "";               // daily-loss reset key
  let dayPnlPct = 0;             // cumulative net pnl% for current day
  let consecLosses = 0;          // circuit breaker: consecutive loss streak
  let lossPauseUntilMs = 0;      // circuit breaker: block entries until this ms
  const warmupTick = 3;          // mirrors live warmedUp guard
  // Regime hysteresis (mirrors live engine)
  let simRegime: "bull" | "bear" | "neutral" = "neutral";
  let simRegimeCandidate: "bull" | "bear" | "neutral" = "neutral";
  let simRegimeCandidateCount = 0;

  for (let i = 150; i < raw.length - 2; i++) {
    const tMs = raw[i][0] * 1000;
    // closed-candle window (drop in-progress) — identical to live closedCloses
    const sc = closes.slice(0, i);     // up to candle i-1 closed
    const sh = highs.slice(0, i);
    const sl = lows.slice(0, i);
    const sv = volumes.slice(0, i);
    const win = Math.max(0, sc.length - 150);
    const wc = sc.slice(win), wh = sh.slice(win), wl = sl.slice(win), wv = sv.slice(win);

    const rsi     = calcRsi(wc);
    const ema9    = calcEma(wc, 9);
    const ema21   = calcEma(wc, 21);
    const prevE9  = calcEma(wc.slice(0, -1), 9);
    const prevE21 = calcEma(wc.slice(0, -1), 21);
    const { macd: macdLine, signal: macdSig } = calcMacd(wc);
    const adx     = calcAdx(wh, wl, wc);
    const volMult = calcVolumeMult(wv);
    const atr     = calcAtr(wh, wl, wc);
    const price   = closes[i]; // enter at this candle's close (≈ live current price)
    const atrPct  = price > 0 ? (atr / price) * 100 : 0;

    // range mode + prevRsi MUST advance every candle (state machine like live)
    if (adx < TREND.ADX_RANGE_THRESH) adxLowCnt++; else adxLowCnt = 0;
    const rangeMode = adxLowCnt >= TREND.ADX_RANGE_TICKS;
    const tickIdx = i - 150; // candle index since start (mirrors tickCount)
    const warmedUp = tickIdx > warmupTick;
    const rsiRecovering = warmedUp && prevRsiSim < rsiMin && rsi > prevRsiSim + 1.0;
    prevRsiSim = rsi;

    // daily loss reset
    const dStr = new Date(tMs).toISOString().slice(0, 10);
    if (dayKey !== dStr) { dayKey = dStr; dayPnlPct = 0; }

    if (i <= skipUntil) continue;                       // inside an open trade
    if (tMs - lastEntry <= cooldownMs) continue;        // cooldown
    if (dayPnlPct <= -3.0) continue;                    // daily -3% circuit breaker
    if (tMs < lossPauseUntilMs) continue;               // circuit breaker: 3 losses in a row
    const utcH = new Date(tMs).getUTCHours();
    if (utcH >= TREND.LOW_LIQ_START && utcH < TREND.LOW_LIQ_END) continue; // low-liquidity hours

    // ── signals (identical to engineTick) ──
    const slope5 = wc.length >= 6 ? (wc[wc.length-1] - wc[wc.length-6]) / wc[wc.length-6] * 100 : 0;
    // ATR-adaptive regime + hysteresis (mirrors live engine)
    const rawRegime = calcRegime(slope5, ema9, ema21, atrPct);
    if (rawRegime === simRegimeCandidate) {
      simRegimeCandidateCount = Math.min(simRegimeCandidateCount + 1, TREND.REGIME_HYSTERESIS + 1);
    } else {
      simRegimeCandidate = rawRegime;
      simRegimeCandidateCount = 1;
    }
    if (simRegimeCandidateCount >= TREND.REGIME_HYSTERESIS) simRegime = simRegimeCandidate;
    // Layer 1 — multi-timeframe trend stack (5m/15m/30m/1h/4h; 1m not available in sim)
    const fourH    = trend4hAt(tMs);
    const tr5      = calc4HTrend(ema9, ema21);
    const tr15     = trendTfAt(tMs, _tf15);
    const tr30     = trendTfAt(tMs, _tf30);
    const tr60     = trendTfAt(tMs, _tf60);
    const stackScore = trendStackScore([
      { w: MTF_WEIGHTS[5],   trend: tr5 },
      { w: MTF_WEIGHTS[15],  trend: tr15 },
      { w: MTF_WEIGHTS[30],  trend: tr30 },
      { w: MTF_WEIGHTS[60],  trend: tr60 },
      { w: MTF_WEIGHTS[240], trend: fourH },
    ]);
    const stackLabel      = trendStackLabel(stackScore);
    const stackBull       = stackLabel === "bull";
    const stackBear       = stackLabel === "bear";
    const stackStrongBear = stackScore < MTF_STRONG_BEAR;
    const m15bear = tr15 !== "bull";   // 15m alignment for bear regime (mirrors live)
    const bearMkt = simRegime === "bear" && m15bear && volMult > TREND.BEAR_MKT_VOL_MULT;
    const recent24 = wc.slice(-24);
    const recent24High = recent24.length > 0 ? Math.max(...recent24) : price;
    const dipFromHigh = recent24High > 0 ? (recent24High - price) / recent24High * 100 : 0;
    const inCrash = dipFromHigh > TREND.CRASH_DIP_PCT;

    // ── Extra quality indicators (mirror live engineTick) ──
    const stochRsi = calcStochRsi(wc);
    const bbPercB  = calcBBPercB(wc);
    const rsi5ago   = wc.length >= 20 ? calcRsi(wc.slice(0, -5)) : rsi;
    const price5ago = wc.length >= 6  ? wc[wc.length - 6] : 0;
    const curClose  = wc[wc.length - 1];
    const rsiDivBull = price5ago > 0 && curClose < price5ago * 0.997 && rsi > rsi5ago + 2;
    const rsiDivBear = price5ago > 0 && curClose > price5ago * 1.003 && rsi < rsi5ago - 2;
    // Rolling 4h VWAP (Kraken per-candle vwap × vol) over closed candles up to i-1
    const cVwaps = vwapsAll.slice(0, i);
    const cVols  = volumes.slice(0, i);
    const vwapN  = Math.min(48, cVwaps.length);
    const vNum   = cVwaps.slice(-vwapN).reduce((s, v, q) => s + v * cVols.slice(-vwapN)[q], 0);
    const vDen   = cVols.slice(-vwapN).reduce((s, v) => s + v, 0);
    const vwap   = vDen > 0 ? vNum / vDen : price;
    const belowVwap = price < vwap;
    const aboveVwap = price > vwap;
    // Candle body confirmation on last closed candle (i-1)
    const lastOpen  = opens[i - 1] ?? curClose;
    const bullCandle = curClose > lastOpen;
    const bearCandle = curClose < lastOpen;

    // Entry: BB%B + VWAP + CONFIRMED bottom/top + trend filter (mirrors live engineTick)
    const notSteepDown = ema9 >= ema21 * 0.985;        // skip clear downtrends (falling knives)
    const recent5 = wc.slice(-5);
    const lo = Math.min(...recent5), hi = Math.max(...recent5);
    const bottomConfirmed = recent5.indexOf(lo) < recent5.length - 1 && curClose > lo; // dip already formed
    const topConfirmed    = recent5.indexOf(hi) < recent5.length - 1 && curClose < hi; // peak already formed
    const isLong  = bbPercB < 40 && belowVwap && !inCrash && bottomConfirmed && notSteepDown;
    const isShort = allowShorts && bbPercB > 60 && aboveVwap && topConfirmed;
    const sig = isLong ? (bbPercB < 0 ? "BB_extreme_long" : "BB_dip_long") : "BB_top_short";
    if (!isLong && !isShort) continue;

    // ── Indicator filter gates (applied when toggles are ON) ──
    const flt = p.filters;
    if (flt && isLong) {
      const opens_i = raw[i][1] ? parseFloat(raw[i][1]) : price;
      const body   = Math.abs(price - opens_i);
      const range  = (highs[i] ?? price) - (lows[i] ?? price);
      const upWick = (highs[i] ?? price) - Math.max(price, opens_i);
      if (flt.stochRsi80   && calcStochRsi(wc)   > 80)          { continue; }
      if (flt.bbPercB80    && calcBBPercB(wc)     > 80)          { continue; }
      if (flt.roc14        && calcRoc(wc, 14)     <= 0)          { continue; }
      if (flt.bodyQuality  && range > 0 && body / range < 0.30)  { continue; }
      if (flt.wickRej      && body > 0  && upWick / body > 1.5)  { continue; }
      if (flt.emaSlope) {
        const ema21p = calcEma(wc.slice(0, -1), 21);
        if (calcEma(wc, 21) <= ema21p)                            { continue; }
      }
      if (flt.candleConfirm) {
        const e21 = calcEma(wc, 21);
        const abv = [wc[wc.length-1], wc[wc.length-2]].filter(v => v > e21).length;
        if (abv < 2)                                              { continue; }
      }
      if (flt.adxRising) {
        const adxPrev = calcAdx(sh.slice(0,-3), sl.slice(0,-3), sc.slice(0,-3));
        if (adx <= adxPrev)                                       { continue; }
      }
      if (flt.volTrend) {
        const vv = sv;
        if (!(vv[vv.length-1] > vv[vv.length-2] && vv[vv.length-2] > vv[vv.length-3])) { continue; }
      }
      if (flt.ichimoku) {
        const tenH = Math.max(...sh.slice(-9)), tenL = Math.min(...sl.slice(-9));
        const kijH = sh.length >= 26 ? Math.max(...sh.slice(-26)) : tenH;
        const kijL = sl.length >= 26 ? Math.min(...sl.slice(-26)) : tenL;
        if ((tenH + tenL) / 2 <= (kijH + kijL) / 2)             { continue; }
      }
      if (flt.heikinAshi && i > 0) {
        const haC = (opens_i + (highs[i]??price) + (lows[i]??price) + price) / 4;
        const haO = (parseFloat(raw[i-1][1]) + parseFloat(raw[i-1][4])) / 2;
        if (haC <= haO)                                           { continue; }
      }
      if (flt.bbSqueeze) {
        const calcBBW = (arr: number[]) => {
          const sma = arr.reduce((s, v) => s + v, 0) / arr.length;
          const std = Math.sqrt(arr.reduce((s, v) => s + (v-sma)**2, 0) / arr.length);
          return sma > 0 ? (4 * std) / sma * 100 : 0;
        };
        const currW = calcBBW(wc.slice(-20));
        const avgW  = [1,2,3,4,5].reduce((s, k) => {
          const sl2 = wc.slice(-20-k, -k); return s + (sl2.length >= 10 ? calcBBW(sl2) : currW);
        }, 0) / 5;
        if (currW >= avgW * 0.8)                                  { continue; }
      }
    }

    const dir: "long" | "short" = isLong ? "long" : "short";
    const effSL   = Math.max(stopLoss,   atrPct * 1.5);
    const effTP   = Math.max(takeProfit, atrPct * 2.5);
    let   trlPct  = Math.max(trailPct,   atrPct * 0.8);
    const long = dir === "long";
    // Slippage on entry: limit order fills 0.05% worse than close price
    const SLIP = 0.0005;
    const entryPx = long ? price * (1 + SLIP) : price * (1 - SLIP);

    // ── exit scan (mirrors priceCheck + engineTick exits) ──
    let exitPx = entryPx, reason = "max_hold";
    let trailRef = entryPx, breakEvenSet = false;
    let exitIdx = Math.min(i + MAX_HOLD, raw.length - 1);
    for (let j = i + 1; j < Math.min(i + MAX_HOLD, raw.length); j++) {
      const hi = highs[j], lo = lows[j], cl = closes[j];
      exitIdx = j;
      trailRef = long ? Math.max(trailRef, hi) : Math.min(trailRef, lo);
      const favPct = long ? (trailRef - entryPx) / entryPx * 100 : (entryPx - trailRef) / entryPx * 100;
      // break-even at 50% of TP → tighten trail + lock to entry (matches live)
      if (!breakEvenSet && favPct >= effTP * 0.5) {
        breakEvenSet = true;
        trlPct = Math.max(trlPct * 0.5, 0.08);
        const needed = long ? entryPx / (1 - trlPct / 100) : entryPx / (1 + trlPct / 100);
        trailRef = long ? Math.max(trailRef, needed) : Math.min(trailRef, needed);
      }
      const trailSL = long ? trailRef * (1 - trlPct / 100) : trailRef * (1 + trlPct / 100);
      const initSL  = long ? entryPx * (1 - effSL / 100)   : entryPx * (1 + effSL / 100);
      const effSLp  = long ? Math.max(trailSL, initSL)     : Math.min(trailSL, initSL);
      // SL/trail first (pessimistic), then TP, then RSI-extreme at close
      if (long ? lo <= effSLp : hi >= effSLp) { exitPx = effSLp; reason = (long ? effSLp > entryPx : effSLp < entryPx) ? "trail_stop" : "stop_loss"; break; }
      if (long ? hi >= entryPx * (1 + effTP / 100) : lo <= entryPx * (1 - effTP / 100)) { exitPx = long ? entryPx * (1 + effTP / 100) : entryPx * (1 - effTP / 100); reason = "take_profit"; break; }
      const rsiJ = calcRsi(closes.slice(Math.max(0, j - 149), j + 1));
      if (long && rsiJ > Math.max(rsiMax + 8, 78)) { exitPx = cl; reason = "rsi_extreme"; break; }
      if (!long && rsiJ < Math.min(rsiMin - 8, 22)) { exitPx = cl; reason = "rsi_extreme"; break; }
      exitPx = cl;
    }

    const rawPct = long ? (exitPx - entryPx) / entryPx * 100 : (entryPx - exitPx) / entryPx * 100;
    const netPct = rawPct - FEE_RT * 100; // subtract round-trip fee (matches live pnl accounting)
    dayPnlPct += netPct;
    // Circuit breaker: mirror live engine (3 consecutive losses → 2h pause)
    if (netPct > 0) { consecLosses = 0; }
    else { consecLosses++; if (consecLosses >= 3) lossPauseUntilMs = raw[exitIdx][0] * 1000 + 2 * 3600 * 1000; }
    trades.push({ dir, entry: parseFloat(entryPx.toFixed(2)), exit: parseFloat(exitPx.toFixed(2)), pnlPct: parseFloat(netPct.toFixed(3)), reason, signal: sig, time: new Date(tMs).toISOString() });
    lastEntry = tMs;
    skipUntil = exitIdx;
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

  // Sharpe = mean(pnlPct)/std(pnlPct)*sqrt(numTrades) — 0 if <2 trades or std=0
  let sharpe = 0;
  if (trades.length >= 2) {
    const mean = totalReturn / trades.length;
    const variance = trades.reduce((s, t) => s + (t.pnlPct - mean) ** 2, 0) / trades.length;
    const std = Math.sqrt(variance);
    if (std > 0) sharpe = (mean / std) * Math.sqrt(trades.length);
  }

  return {
    trades,
    numTrades: trades.length,
    longs: trades.filter(t => t.dir === "long").length,
    shorts: trades.filter(t => t.dir === "short").length,
    winRate: parseFloat(winRate.toFixed(1)),
    totalReturn: parseFloat(totalReturn.toFixed(2)),
    maxDrawdown: parseFloat(maxDD.toFixed(2)),
    avgWin: parseFloat(avgWin.toFixed(2)),
    avgLoss: parseFloat(avgLoss.toFixed(2)),
    finalEquity: parseFloat(equity.toFixed(2)),
    sharpe: parseFloat(sharpe.toFixed(3)),
  };
}
