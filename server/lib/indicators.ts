/**
 * Pure indicator math functions — used by both botEngine and tests.
 * No side-effects, no external dependencies.
 */

export function calcRsi(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gains += d; else losses -= d;
  }
  if (losses === 0) return 100;
  if (gains  === 0) return 0;
  return 100 - 100 / (1 + gains / losses);
}

export function calcEma(values: number[], period: number): number {
  if (values.length === 0) return 0;
  if (values.length < period) return values[values.length - 1];
  const k = 2 / (period + 1);
  let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) ema = values[i] * k + ema * (1 - k);
  return ema;
}

export function calcMacd(closes: number[]): { macd: number; signal: number } {
  if (closes.length < 26) return { macd: 0, signal: 0 };
  const ema12 = calcEma(closes, 12);
  const ema26 = calcEma(closes, 26);
  const macdLine = ema12 - ema26;
  const macdValues: number[] = [];
  for (let i = Math.max(0, closes.length - 35); i < closes.length; i++) {
    const slice = closes.slice(0, i + 1);
    if (slice.length >= 26) macdValues.push(calcEma(slice, 12) - calcEma(slice, 26));
  }
  const signal = macdValues.length >= 9 ? calcEma(macdValues, 9) : macdLine;
  return { macd: macdLine, signal };
}

export function calcAdx(highs: number[], lows: number[], closes: number[], period = 14): number {
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
  const plusDi  = 100 * sumPlusDm  / sumTr;
  const minusDi = 100 * sumMinusDm / sumTr;
  const dx = plusDi + minusDi === 0 ? 0 : 100 * Math.abs(plusDi - minusDi) / (plusDi + minusDi);
  return dx;
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
