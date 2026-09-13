/**
 * Pure indicator math functions — used by both botEngine and tests.
 * No side-effects, no external dependencies.
 */

/** Wilder's smoothed RSI (industry-standard, matches TradingView) */
export function calcRsi(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  // Initial average gain/loss from first `period` bars
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) avgGain += d; else avgLoss -= d;
  }
  avgGain /= period;
  avgLoss /= period;
  // Wilder smoothing for remaining bars
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    const gain = d > 0 ? d : 0;
    const loss = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  if (avgLoss === 0) return 100;
  if (avgGain === 0) return 0;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

export function calcEma(values: number[], period: number): number {
  if (values.length === 0) return 0;
  if (values.length < period) return values[values.length - 1];
  const k = 2 / (period + 1);
  let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) ema = values[i] * k + ema * (1 - k);
  return ema;
}

/** Proper MACD: single continuous EMA-12 and EMA-26 series, then EMA-9 signal */
export function calcMacd(closes: number[]): { macd: number; signal: number } {
  if (closes.length < 26) return { macd: 0, signal: 0 };
  const k12 = 2 / 13, k26 = 2 / 27, k9 = 2 / 10;
  // Seed EMAs from first bars
  let ema12 = closes.slice(0, 12).reduce((a, b) => a + b, 0) / 12;
  let ema26 = closes.slice(0, 26).reduce((a, b) => a + b, 0) / 26;
  for (let i = 12; i < 26; i++) ema12 = closes[i] * k12 + ema12 * (1 - k12);
  // Build MACD series from bar 26 onward
  const macdSeries: number[] = [];
  for (let i = 26; i < closes.length; i++) {
    ema12 = closes[i] * k12 + ema12 * (1 - k12);
    ema26 = closes[i] * k26 + ema26 * (1 - k26);
    macdSeries.push(ema12 - ema26);
  }
  const macdLine = macdSeries[macdSeries.length - 1];
  if (macdSeries.length < 9) return { macd: macdLine, signal: macdLine };
  // EMA-9 signal line over proper MACD series
  let signal = macdSeries.slice(0, 9).reduce((a, b) => a + b, 0) / 9;
  for (let i = 9; i < macdSeries.length; i++) signal = macdSeries[i] * k9 + signal * (1 - k9);
  return { macd: macdLine, signal };
}

/** True ADX: Wilder-smoothed DX over period bars (matches TradingView) */
export function calcAdx(highs: number[], lows: number[], closes: number[], period = 14): number {
  if (closes.length < period * 2 + 1) return 20;
  const trArr: number[] = [], plusDmArr: number[] = [], minusDmArr: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const h = highs[i], l = lows[i], pc = closes[i - 1];
    trArr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
    const upMove = h - highs[i - 1], downMove = lows[i - 1] - l;
    plusDmArr.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDmArr.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }
  // Wilder-smoothed TR, +DM, -DM
  let smTr  = trArr.slice(0, period).reduce((a, b) => a + b, 0);
  let smPlus = plusDmArr.slice(0, period).reduce((a, b) => a + b, 0);
  let smMinus = minusDmArr.slice(0, period).reduce((a, b) => a + b, 0);
  const dx0 = smTr === 0 ? 0 : 100 * Math.abs(smPlus - smMinus) / (smPlus + smMinus || 1);
  let adx = dx0;
  for (let i = period; i < trArr.length; i++) {
    smTr    = smTr    - smTr    / period + trArr[i];
    smPlus  = smPlus  - smPlus  / period + plusDmArr[i];
    smMinus = smMinus - smMinus / period + minusDmArr[i];
    const plusDi  = 100 * smPlus  / (smTr || 1);
    const minusDi = 100 * smMinus / (smTr || 1);
    const dx = plusDi + minusDi === 0 ? 0 : 100 * Math.abs(plusDi - minusDi) / (plusDi + minusDi);
    adx = (adx * (period - 1) + dx) / period;
  }
  return adx;
}

/** Average True Range — Wilder's smoothed (matches TradingView default) */
export function calcAtr(highs: number[], lows: number[], closes: number[], period = 14): number {
  if (closes.length < period + 1) return 0;
  const trs: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const h = highs[i], l = lows[i], pc = closes[i - 1];
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  // Seed with SMA of first `period` TRs, then apply Wilder's smoothing
  let atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
  }
  return atr;
}

/** Returns current bar volume relative to 19-bar average (prior bars only — no look-ahead) */
export function calcVolumeMult(volumes: number[]): number {
  if (volumes.length < 20) return 1;
  const avg = volumes.slice(-20, -1).reduce((a, b) => a + b, 0) / 19;
  return avg === 0 ? 1 : volumes[volumes.length - 1] / avg;
}

/** Stochastic RSI: K value (0-100). smoothK=3 applies SMA smoothing */
export function calcStochRsi(closes: number[], rsiPeriod = 14, stochPeriod = 14, smoothK = 3): number {
  const minLen = rsiPeriod + stochPeriod + smoothK;
  if (closes.length < minLen) return 50;
  // Build full RSI series (one value per bar from rsiPeriod onward)
  const rsiSeries: number[] = [];
  for (let i = rsiPeriod; i <= closes.length; i++) {
    rsiSeries.push(calcRsi(closes.slice(0, i), rsiPeriod));
  }
  // Stochastic of RSI
  const rawK: number[] = [];
  for (let i = stochPeriod - 1; i < rsiSeries.length; i++) {
    const sl = rsiSeries.slice(i - stochPeriod + 1, i + 1);
    const mn = Math.min(...sl), mx = Math.max(...sl);
    rawK.push(mx === mn ? 50 : (rsiSeries[i] - mn) / (mx - mn) * 100);
  }
  if (rawK.length < smoothK) return rawK[rawK.length - 1] ?? 50;
  return rawK.slice(-smoothK).reduce((s, v) => s + v, 0) / smoothK;
}

/** Bollinger Band %B: 0=lower band, 50=middle, 100=upper band, >100=above upper */
export function calcBBPercB(closes: number[], period = 20, mult = 2): number {
  if (closes.length < period) return 50;
  const sl = closes.slice(-period);
  const sma = sl.reduce((s, v) => s + v, 0) / period;
  const std = Math.sqrt(sl.reduce((s, v) => s + (v - sma) ** 2, 0) / period);
  const upper = sma + mult * std, lower = sma - mult * std;
  if (upper === lower) return 50;
  return ((closes[closes.length - 1] - lower) / (upper - lower)) * 100;
}

/** Rate of Change over `period` bars (%) */
export function calcRoc(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 0;
  const prev = closes[closes.length - 1 - period];
  return prev === 0 ? 0 : (closes[closes.length - 1] - prev) / prev * 100;
}

// ── Universal trend detection constants ───────────────────────────────────────
// These are FIXED — never change based on preset or aggressiveness.
// Trend is a market fact, not a strategy opinion.

export const TREND = {
  // 4H: EMA9 vs EMA21 with ±0.1% buffer to avoid choppy flipping
  H4_BULL_BUFFER: 1.001,   // ema9 > ema21 * 1.001 → bull
  H4_BEAR_BUFFER: 0.999,   // ema9 < ema21 * 0.999 → bear

  // Short-term regime (5m closes) — ATR-adaptive multipliers
  // bearThresh = -max(BEAR_SLOPE_ATR_MULT × atrPct, 0.5)  → scales with volatility
  // bullThresh = +max(BULL_SLOPE_ATR_MULT × atrPct, 0.15) → scales with volatility
  BEAR_SLOPE_ATR_MULT: 1.0,  // e.g. ATR=0.8% → bear threshold = -0.8%
  BULL_SLOPE_ATR_MULT: 0.4,  // e.g. ATR=0.8% → bull threshold = +0.32%
  BEAR_SLOPE_FLOOR:   -0.5,  // never looser than -0.5% even in calm markets
  BULL_SLOPE_FLOOR:    0.15, // never stricter than +0.15%

  // Regime hysteresis: require this many consecutive matching ticks to switch
  REGIME_HYSTERESIS: 2,

  // Volume confirmation for bear regime (real selling pressure)
  BEAR_MKT_VOL_MULT: 1.1,

  // Range mode: ADX below this for N consecutive ticks → mean-reversion only
  ADX_RANGE_THRESH: 20,
  ADX_RANGE_TICKS:   6,

  // Crash protection: dip from 24h high above this → no new longs
  CRASH_DIP_PCT: 5.0,

  // Capitulation: override 4H bear if market is in extreme fear
  CAPITULAION_FNG:  20,   // Fear & Greed < 20
  CAPITULATION_RSI: 33,   // RSI < 33

  // Low-liquidity hours (UTC) — no new entries
  LOW_LIQ_START: 2,
  LOW_LIQ_END:   6,
} as const;

// ── Multi-timeframe trend stack (Layer 1) ─────────────────────────────────────
// Each timeframe votes bull/bear/neutral via EMA9 vs EMA21. Higher timeframes
// carry more weight (a 4H trend matters more than a 1m wobble). The weighted
// score ∈ [-1,+1] is the aggregate market direction across all timeframes.
// FIXED weights — universal between live engine and backtest.
export const MTF_WEIGHTS = {
  1: 0.5, 5: 1.0, 15: 1.5, 30: 2.0, 60: 2.5, 240: 3.0,
} as const;

// Score thresholds for aggregate trend label
export const MTF_BULL_SCORE =  0.30; // score >  +0.30 → aligned bull
export const MTF_BEAR_SCORE = -0.30; // score <  -0.30 → aligned bear
export const MTF_STRONG_BEAR = -0.60; // score < -0.60 → hard-block new longs

/** Weighted multi-timeframe trend score ∈ [-1,+1]. Missing TFs are simply omitted (score renormalises). */
export function trendStackScore(votes: { w: number; trend: "bull" | "bear" | "neutral" }[]): number {
  let sum = 0, total = 0;
  for (const v of votes) {
    total += v.w;
    if (v.trend === "bull") sum += v.w;
    else if (v.trend === "bear") sum -= v.w;
  }
  return total > 0 ? sum / total : 0;
}

/** Aggregate label from a stack score */
export function trendStackLabel(score: number): "bull" | "bear" | "neutral" {
  if (score > MTF_BULL_SCORE) return "bull";
  if (score < MTF_BEAR_SCORE) return "bear";
  return "neutral";
}

/** Determine 4H trend from a closes array and EMA buffers */
export function calc4HTrend(ema9: number, ema21: number): "bull" | "bear" | "neutral" {
  if (ema9 > ema21 * TREND.H4_BULL_BUFFER) return "bull";
  if (ema9 < ema21 * TREND.H4_BEAR_BUFFER) return "bear";
  return "neutral";
}

/**
 * Determine short-term market regime from 5m slope and EMAs.
 * atrPct: current ATR as % of price — makes thresholds scale with volatility.
 * When atrPct=0 (not provided) falls back to fixed floor values.
 */
export function calcRegime(slope5: number, ema9: number, ema21: number, atrPct = 0): "bull" | "bear" | "neutral" {
  const bearThresh = atrPct > 0
    ? -Math.max(TREND.BEAR_SLOPE_ATR_MULT * atrPct, -TREND.BEAR_SLOPE_FLOOR)
    : TREND.BEAR_SLOPE_FLOOR;
  const bullThresh = atrPct > 0
    ? Math.max(TREND.BULL_SLOPE_ATR_MULT * atrPct, TREND.BULL_SLOPE_FLOOR)
    : TREND.BULL_SLOPE_FLOOR;
  if (ema9 < ema21 && slope5 < bearThresh) return "bear";
  if (ema9 > ema21 && slope5 > bullThresh)  return "bull";
  return "neutral";
}
