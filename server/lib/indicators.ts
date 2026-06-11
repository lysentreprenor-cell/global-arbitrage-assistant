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

/** Average True Range as absolute price value */
export function calcAtr(highs: number[], lows: number[], closes: number[], period = 14): number {
  if (closes.length < period + 1) return 0;
  const trs: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const h = highs[i], l = lows[i], pc = closes[i - 1];
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
}

/** Returns current bar volume relative to 19-bar average (prior bars only — no look-ahead) */
export function calcVolumeMult(volumes: number[]): number {
  if (volumes.length < 20) return 1;
  const avg = volumes.slice(-20, -1).reduce((a, b) => a + b, 0) / 19;
  return avg === 0 ? 1 : volumes[volumes.length - 1] / avg;
}
