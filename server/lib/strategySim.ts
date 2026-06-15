/**
 * Shared backtest/simulation engine — mirrors the LIVE trading engine (engineTick).
 * Extracted VERBATIM from the /backtest handler so that simulation, optimizer and
 * the live bot all behave identically. No side-effects, no network, no secrets.
 */
import { calcRsi, calcEma, calcMacd, calcAdx, calcAtr, calcVolumeMult, calcStochRsi, calcBBPercB, calcRoc } from "./indicators";

export type SimParams = {
  rsiMin: number; rsiMax: number; adxMin: number; confluenceMin: number;
  volMultMin: number; cooldownMin: number; stopLoss: number; takeProfit: number;
  trailPct: number; leverage: number; allowShorts: boolean;
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

  const FEE_RT = 0.0052; // Kraken 0.26% × 2 (open+close) — same as live engine

  // ── 4H trend lookup (mirrors live fetch4HCandles) ────────
  const c4closes = raw4.map((c: any) => parseFloat(c[4]));
  const c4times  = raw4.map((c: any) => c[0] * 1000);
  const trend4hAt = (tMs: number): "bull" | "bear" | "neutral" => {
    let idx = -1;
    for (let q = c4times.length - 1; q >= 0; q--) { if (c4times[q] <= tMs) { idx = q; break; } }
    if (idx < 21) return "neutral";
    const slice = c4closes.slice(0, idx + 1);
    const e9 = calcEma(slice, 9), e21 = calcEma(slice, 21);
    return e9 > e21 * 1.001 ? "bull" : e9 < e21 * 0.999 ? "bear" : "neutral";
  };

  const closes  = raw.map((c: any) => parseFloat(c[4]));
  const highs   = raw.map((c: any) => parseFloat(c[2]));
  const lows    = raw.map((c: any) => parseFloat(c[3]));
  const volumes = raw.map((c: any) => parseFloat(c[6]));

  const trades: SimTrade[] = [];
  const cooldownMs = cooldownMin * 60 * 1000;
  const effLev = Math.max(1, leverage);
  const krakenSpot = effLev === 1; // spot = no shorts (matches live)
  const MAX_HOLD = 576; // 48h / 5min — same as live
  let lastEntry = 0;
  let prevRsiSim = 50;     // RSI recovery tracking across candles (mirrors prevRsi)
  let adxLowCnt = 0;       // range-mode counter (mirrors adxLowCount)
  let skipUntil = -1;      // skip candles inside an open simulated trade
  let dayKey = "";         // daily-loss reset key
  let dayPnlPct = 0;       // cumulative net pnl% for current day

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
    if (adx < 20) adxLowCnt++; else adxLowCnt = 0;
    const rangeMode = adxLowCnt >= 6;
    const rsiRecovering = prevRsiSim < rsiMin && rsi > prevRsiSim + 1.0;
    prevRsiSim = rsi;

    // daily loss reset
    const dStr = new Date(tMs).toISOString().slice(0, 10);
    if (dayKey !== dStr) { dayKey = dStr; dayPnlPct = 0; }

    if (i <= skipUntil) continue;                 // inside an open trade
    if (tMs - lastEntry <= cooldownMs) continue;  // cooldown
    if (dayPnlPct <= -3.0) continue;              // daily -3% circuit breaker
    const utcH = new Date(tMs).getUTCHours();
    if (utcH >= 2 && utcH < 6) continue;          // low-liquidity hours

    // ── signals (identical to engineTick) ──
    const slope5 = wc.length >= 6 ? (wc[wc.length-1] - wc[wc.length-6]) / wc[wc.length-6] * 100 : 0;
    const bearMkt = ema9 < ema21 && slope5 < -1.5;
    const recent24 = wc.slice(-24);
    const recent24High = recent24.length > 0 ? Math.max(...recent24) : price;
    const dipFromHigh = recent24High > 0 ? (recent24High - price) / recent24High * 100 : 0;
    const inCrash = dipFromHigh > 5.0;
    const fourH = trend4hAt(tMs);

    const crossBuy  = ema9 > ema21 && prevE9 <= prevE21;
    const crossSell = ema9 < ema21 && prevE9 >= prevE21;
    const rsiBuy    = rsi < rsiMin || rsiRecovering;
    const rsiSell   = rsi > rsiMax;
    const macdBull  = macdLine > macdSig;
    const macdBear  = macdLine < macdSig;
    const trendOk   = adx >= adxMin;
    const volOk     = volMult >= volMultMin;
    const longConf  = (macdBull ? 1 : 0) + (trendOk ? 1 : 0) + (volOk ? 1 : 0) >= confluenceMin;
    const shortConf = (macdBear ? 1 : 0) + (trendOk ? 1 : 0) + (volOk ? 1 : 0) >= confluenceMin;
    const trendFollow = !rangeMode && rsi >= 50 && rsi <= 63 && macdBull && ema9 > ema21 && adx >= 25 && fourH !== "bear";
    const rsiBuyFiltered = rsiBuy && !bearMkt && fourH !== "bear";
    const trendQuality = adx >= 15;
    const isLong  = (crossBuy || rsiBuyFiltered || trendFollow) && longConf && !inCrash && trendQuality;
    const isShort = !krakenSpot && allowShorts && (crossSell || rsiSell) && shortConf;
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
    const sig = crossBuy ? "EMA_cross" : trendFollow ? "TrendFollow" : rsiRecovering ? "RSI_bounce" : isShort ? (crossSell ? "EMA_cross" : "RSI_pump") : "RSI_dip";
    const effSL   = Math.max(stopLoss,   atrPct * 1.5);
    const effTP   = Math.max(takeProfit, atrPct * 2.5);
    let   trlPct  = Math.max(trailPct,   atrPct * 0.8);
    const long = dir === "long";

    // ── exit scan (mirrors priceCheck + engineTick exits) ──
    let exitPx = price, reason = "max_hold";
    let trailRef = price, breakEvenSet = false;
    let exitIdx = Math.min(i + MAX_HOLD, raw.length - 1);
    for (let j = i + 1; j < Math.min(i + MAX_HOLD, raw.length); j++) {
      const hi = highs[j], lo = lows[j], cl = closes[j];
      exitIdx = j;
      trailRef = long ? Math.max(trailRef, hi) : Math.min(trailRef, lo);
      const favPct = long ? (trailRef - price) / price * 100 : (price - trailRef) / price * 100;
      // break-even at 50% of TP → tighten trail + lock to entry (matches live)
      if (!breakEvenSet && favPct >= effTP * 0.5) {
        breakEvenSet = true;
        trlPct = Math.max(trlPct * 0.5, 0.08);
        const needed = long ? price / (1 - trlPct / 100) : price / (1 + trlPct / 100);
        trailRef = long ? Math.max(trailRef, needed) : Math.min(trailRef, needed);
      }
      const trailSL = long ? trailRef * (1 - trlPct / 100) : trailRef * (1 + trlPct / 100);
      const initSL  = long ? price * (1 - effSL / 100)     : price * (1 + effSL / 100);
      const effSLp  = long ? Math.max(trailSL, initSL)     : Math.min(trailSL, initSL);
      // SL/trail first (pessimistic), then TP, then RSI-extreme at close
      if (long ? lo <= effSLp : hi >= effSLp) { exitPx = effSLp; reason = (long ? effSLp > price : effSLp < price) ? "trail_stop" : "stop_loss"; break; }
      if (long ? hi >= price * (1 + effTP / 100) : lo <= price * (1 - effTP / 100)) { exitPx = long ? price * (1 + effTP / 100) : price * (1 - effTP / 100); reason = "take_profit"; break; }
      const rsiJ = calcRsi(closes.slice(Math.max(0, j - 149), j + 1));
      if (long && rsiJ > Math.max(rsiMax + 8, 78)) { exitPx = cl; reason = "rsi_extreme"; break; }
      if (!long && rsiJ < Math.min(rsiMin - 8, 22)) { exitPx = cl; reason = "rsi_extreme"; break; }
      exitPx = cl;
    }

    const rawPct = long ? (exitPx - price) / price * 100 : (price - exitPx) / price * 100;
    const netPct = rawPct - FEE_RT * 100; // subtract round-trip fee (matches live pnl accounting)
    dayPnlPct += netPct;
    trades.push({ dir, entry: parseFloat(price.toFixed(2)), exit: parseFloat(exitPx.toFixed(2)), pnlPct: parseFloat(netPct.toFixed(3)), reason, signal: sig, time: new Date(tMs).toISOString() });
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
