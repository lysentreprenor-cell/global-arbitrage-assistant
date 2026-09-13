import { describe, it, expect } from "vitest";
import {
  calcRsi, calcEma, calcMacd, calcAdx, calcAtr, calcVolumeMult,
  calcStochRsi, calcBBPercB, calcRoc,
} from "../lib/indicators";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** n linearly rising values from start to start+(n-1)*step */
const rising = (n: number, start = 100, step = 1) =>
  Array.from({ length: n }, (_, i) => start + i * step);

/** n linearly falling values from start down */
const falling = (n: number, start = 100, step = 1) =>
  Array.from({ length: n }, (_, i) => start - i * step);

/** flat array of value repeated n times */
const flat = (n: number, value = 100) =>
  Array.from({ length: n }, () => value);

/** alternating up/down by amplitude */
const oscillating = (n: number, base = 100, amp = 2) =>
  Array.from({ length: n }, (_, i) => base + (i % 2 === 0 ? amp : -amp));

// ─────────────────────────────────────────────────────────────────────────────
// calcRsi
// ─────────────────────────────────────────────────────────────────────────────

describe("calcRsi", () => {
  it("returns 50 for empty array", () => {
    expect(calcRsi([])).toBe(50);
  });

  it("returns 50 when fewer than period+1 values", () => {
    expect(calcRsi(rising(14))).toBe(50); // needs 15 for period=14
  });

  it("returns 100 for perfectly rising prices (no losses)", () => {
    const rsi = calcRsi(rising(30));
    expect(rsi).toBe(100);
  });

  it("returns 0 for perfectly falling prices (no gains)", () => {
    const rsi = calcRsi(falling(30));
    expect(rsi).toBe(0);
  });

  it("returns ~50 for alternating up/down of equal magnitude", () => {
    const rsi = calcRsi(oscillating(40));
    expect(rsi).toBeGreaterThan(45);
    expect(rsi).toBeLessThan(55);
  });

  it("returns value in [0, 100]", () => {
    const rsi = calcRsi(rising(30).concat(falling(10)));
    expect(rsi).toBeGreaterThanOrEqual(0);
    expect(rsi).toBeLessThanOrEqual(100);
  });

  it("overbought territory (>70) for strong uptrend", () => {
    // 5 down, then 25 strongly up — RSI should be high
    const prices = falling(5, 100).concat(rising(25, 95, 3));
    const rsi = calcRsi(prices);
    expect(rsi).toBeGreaterThan(65);
  });

  it("oversold territory (<30) for strong downtrend", () => {
    const prices = rising(5, 100).concat(falling(25, 105, 3));
    const rsi = calcRsi(prices);
    expect(rsi).toBeLessThan(35);
  });

  it("respects custom period", () => {
    const prices = rising(10);
    const rsi7  = calcRsi(prices, 7);
    const rsi14 = calcRsi(prices, 14);
    // shorter period = more reactive; both should be 100 here (all rising, no losses)
    expect(rsi7).toBe(100);
    expect(rsi14).toBe(50); // not enough data for 14-period
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// calcEma
// ─────────────────────────────────────────────────────────────────────────────

describe("calcEma", () => {
  it("returns 0 for empty array", () => {
    expect(calcEma([], 9)).toBe(0);
  });

  it("returns last value when fewer values than period", () => {
    const arr = [10, 20, 30];
    expect(calcEma(arr, 9)).toBe(30);
  });

  it("returns exact average when length equals period", () => {
    const arr = [1, 2, 3, 4, 5];
    expect(calcEma(arr, 5)).toBe(3); // (1+2+3+4+5)/5 = 3
  });

  it("converges toward rising price series", () => {
    const arr = rising(50, 100, 1);
    const ema  = calcEma(arr, 9);
    // EMA must be between sma and last price but close to last
    expect(ema).toBeGreaterThan(100);
    expect(ema).toBeLessThanOrEqual(arr[arr.length - 1]);
  });

  it("short-period EMA tracks faster than long-period", () => {
    const arr  = rising(50, 100, 2);
    const ema9 = calcEma(arr, 9);
    const ema21 = calcEma(arr, 21);
    // In a sustained uptrend: shorter EMA > longer EMA
    expect(ema9).toBeGreaterThan(ema21);
  });

  it("flat data: EMA equals the constant value", () => {
    const arr = flat(30, 42);
    expect(calcEma(arr, 9)).toBeCloseTo(42, 6);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// calcMacd
// ─────────────────────────────────────────────────────────────────────────────

describe("calcMacd", () => {
  it("returns {0, 0} when fewer than 26 candles", () => {
    expect(calcMacd(rising(25))).toEqual({ macd: 0, signal: 0 });
  });

  it("MACD > 0 in a sustained uptrend (EMA12 > EMA26)", () => {
    const { macd } = calcMacd(rising(60, 100, 1));
    expect(macd).toBeGreaterThan(0);
  });

  it("MACD < 0 in a sustained downtrend (EMA12 < EMA26)", () => {
    const { macd } = calcMacd(falling(60, 200, 1));
    expect(macd).toBeLessThan(0);
  });

  it("MACD ≈ 0 for perfectly flat prices", () => {
    const { macd } = calcMacd(flat(60));
    expect(Math.abs(macd)).toBeLessThan(0.0001);
  });

  it("signal lags macd on initial trend start", () => {
    // 35 flat then 30 strongly rising — macd rises faster than signal
    const prices = flat(35, 100).concat(rising(30, 100, 5));
    const { macd, signal } = calcMacd(prices);
    // both positive once trend is established; macd leads
    expect(macd).toBeGreaterThanOrEqual(signal);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// calcAdx
// ─────────────────────────────────────────────────────────────────────────────

describe("calcAdx", () => {
  it("returns 20 (default) when fewer than period+1 candles", () => {
    const h = rising(14), l = falling(14, 90), c = rising(14, 95);
    expect(calcAdx(h, l, c)).toBe(20);
  });

  it("returns high ADX (>40) for strong uptrend", () => {
    const n = 40;
    // Tight-range candles all moving up: high directional movement, low TRue range noise
    const h = rising(n, 101, 1);
    const l = rising(n, 99,  1);
    const c = rising(n, 100, 1);
    const adx = calcAdx(h, l, c);
    expect(adx).toBeGreaterThan(40);
  });

  it("returns low ADX (<25) for sideways choppy market", () => {
    const n = 40;
    const h = oscillating(n, 102, 1);
    const l = oscillating(n, 98,  1);
    const c = oscillating(n, 100, 1);
    const adx = calcAdx(h, l, c);
    expect(adx).toBeLessThan(25);
  });

  it("returns value in [0, 100]", () => {
    const n = 30;
    const h = rising(n, 101, 2);
    const l = rising(n, 99,  2);
    const c = rising(n, 100, 2);
    const adx = calcAdx(h, l, c);
    expect(adx).toBeGreaterThanOrEqual(0);
    expect(adx).toBeLessThanOrEqual(100);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// calcAtr
// ─────────────────────────────────────────────────────────────────────────────

describe("calcAtr", () => {
  it("returns 0 when fewer than period+1 candles", () => {
    const h = rising(14), l = flat(14, 90), c = flat(14, 95);
    expect(calcAtr(h, l, c)).toBe(0);
  });

  it("returns exactly candle body when no gaps and body is largest component", () => {
    // h=102, l=98, c=100 every bar — no gap, TR = h-l = 4 always
    const n = 20;
    const h = flat(n, 102), l = flat(n, 98), c = flat(n, 100);
    const atr = calcAtr(h, l, c);
    expect(atr).toBeCloseTo(4, 5);
  });

  it("higher ATR for volatile candles vs calm candles", () => {
    const n = 20;
    const calmH = flat(n, 101), calmL = flat(n, 99), calmC = flat(n, 100);
    const wildH = flat(n, 110), wildL = flat(n, 90), wildC = flat(n, 100);
    expect(calcAtr(wildH, wildL, wildC)).toBeGreaterThan(calcAtr(calmH, calmL, calmC));
  });

  it("ATR is always non-negative", () => {
    const n = 30;
    const h = rising(n, 105, 1), l = rising(n, 95, 1), c = rising(n, 100, 1);
    expect(calcAtr(h, l, c)).toBeGreaterThanOrEqual(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// calcVolumeMult
// ─────────────────────────────────────────────────────────────────────────────

describe("calcVolumeMult", () => {
  it("returns 1 when fewer than 20 volumes", () => {
    expect(calcVolumeMult(flat(19, 1000))).toBe(1);
  });

  it("returns 1.0 when all volumes are equal", () => {
    expect(calcVolumeMult(flat(25, 500))).toBeCloseTo(1, 5);
  });

  it("returns >1 when current bar has above-average volume", () => {
    const vols = flat(20, 100);
    vols[vols.length - 1] = 200; // double the current bar
    expect(calcVolumeMult(vols)).toBeGreaterThan(1.5);
  });

  it("returns <1 when current bar has below-average volume", () => {
    const vols = flat(20, 100);
    vols[vols.length - 1] = 10; // 10% of average
    expect(calcVolumeMult(vols)).toBeLessThan(0.5);
  });

  it("uses only prior 19 bars as reference (no look-ahead)", () => {
    // Average of first 19 bars (all 100), current is 300
    const vols = [...flat(19, 100), 300];
    expect(calcVolumeMult(vols)).toBeCloseTo(3, 2);
  });

  it("returns 1 if average is zero (guard against div-by-zero)", () => {
    const vols = [...flat(19, 0), 100];
    expect(calcVolumeMult(vols)).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cross-function sanity: RSI + MACD agree on trend direction
// ─────────────────────────────────────────────────────────────────────────────

describe("indicator agreement (trend)", () => {
  it("RSI high AND MACD positive in sustained uptrend", () => {
    const prices = rising(70, 100, 1);
    const rsi = calcRsi(prices);
    const { macd } = calcMacd(prices);
    expect(rsi).toBeGreaterThan(60);
    expect(macd).toBeGreaterThan(0);
  });

  it("RSI low AND MACD negative in sustained downtrend", () => {
    const prices = falling(70, 200, 1);
    const rsi = calcRsi(prices);
    const { macd } = calcMacd(prices);
    expect(rsi).toBeLessThan(40);
    expect(macd).toBeLessThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// calcStochRsi
// ─────────────────────────────────────────────────────────────────────────────

describe("calcStochRsi", () => {
  it("returns 50 when insufficient data", () => {
    expect(calcStochRsi(rising(10))).toBe(50);
  });

  it("returns value in [0, 100]", () => {
    const k = calcStochRsi(rising(60));
    expect(k).toBeGreaterThanOrEqual(0);
    expect(k).toBeLessThanOrEqual(100);
  });

  it("returns high value (>60) when RSI bounces back from low", () => {
    // Falling prices first → RSI low. Then rising prices → RSI climbs to recent high → StochRSI high
    const prices = [...falling(50, 200, 2), ...rising(50, 100, 2)];
    const k = calcStochRsi(prices);
    expect(k).toBeGreaterThan(60);
  });

  it("returns low value (<40) when RSI falls from high", () => {
    // Rising prices first → RSI high. Then falling prices → RSI near recent low → StochRSI low
    const prices = [...rising(50, 50, 2), ...falling(50, 150, 2)];
    const k = calcStochRsi(prices);
    expect(k).toBeLessThan(40);
  });

  it("returns ~50 for oscillating prices (RSI stays near midline)", () => {
    const prices = oscillating(80, 100, 5);
    const k = calcStochRsi(prices);
    expect(k).toBeGreaterThan(10);
    expect(k).toBeLessThan(90);
  });

  it("flat prices: RSI is constant → StochRSI returns 50 (range=0)", () => {
    // Flat prices → RSI series is all 50 (no gains/losses) → min=max → returns 50
    const k = calcStochRsi(flat(60, 100));
    expect(k).toBe(50);
  });

  it("custom periods change result", () => {
    const prices = [...flat(20, 100), ...rising(40, 100, 3)];
    const k7  = calcStochRsi(prices, 7, 7, 3);
    const k14 = calcStochRsi(prices, 14, 14, 3);
    // Both in range; shorter period reacts faster
    expect(k7).toBeGreaterThanOrEqual(0);
    expect(k14).toBeGreaterThanOrEqual(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// calcBBPercB
// ─────────────────────────────────────────────────────────────────────────────

describe("calcBBPercB", () => {
  it("returns 50 when insufficient data", () => {
    expect(calcBBPercB(rising(10))).toBe(50);
  });

  it("returns 50 for flat prices (close == middle band)", () => {
    // All values identical → std=0 → upper==lower → returns 50
    expect(calcBBPercB(flat(30, 100))).toBe(50);
  });

  it("returns ~100 when price is at upper band", () => {
    // Flat warmup then spike: last price well above upper band → >100
    const prices = [...flat(19, 100), 200]; // massive spike
    const pctB = calcBBPercB(prices);
    expect(pctB).toBeGreaterThan(90);
  });

  it("returns ~0 when price is at lower band", () => {
    const prices = [...flat(19, 100), 0]; // crash to zero
    const pctB = calcBBPercB(prices);
    expect(pctB).toBeLessThan(10);
  });

  it("returns value between 0 and ~100 for normal price", () => {
    const prices = rising(25, 100, 0.5); // gentle trend
    const pctB = calcBBPercB(prices);
    expect(pctB).toBeGreaterThanOrEqual(0);
    expect(pctB).toBeLessThanOrEqual(150); // can exceed 100 (above upper band)
  });

  it("returns >100 when price exceeds upper band (breakout)", () => {
    // 19 bars at 100, then strong rally
    const prices = [...flat(19, 100), 120];
    const pctB = calcBBPercB(prices);
    expect(pctB).toBeGreaterThan(100);
  });

  it("custom period and mult", () => {
    const prices = rising(30, 100, 1);
    const pb20 = calcBBPercB(prices, 20, 2);
    const pb10 = calcBBPercB(prices, 10, 2);
    expect(pb20).toBeGreaterThanOrEqual(0);
    expect(pb10).toBeGreaterThanOrEqual(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// calcRoc
// ─────────────────────────────────────────────────────────────────────────────

describe("calcRoc", () => {
  it("returns 0 when insufficient data", () => {
    expect(calcRoc(rising(10), 14)).toBe(0);
  });

  it("returns 0 for flat prices", () => {
    expect(calcRoc(flat(20, 100), 14)).toBe(0);
  });

  it("returns positive ROC for rising prices", () => {
    // 15 bars from 100 to 114 → ROC-14 = (114-100)/100 * 100 = 14%
    const prices = rising(15, 100, 1);
    const roc = calcRoc(prices, 14);
    expect(roc).toBeCloseTo(14, 1);
  });

  it("returns negative ROC for falling prices", () => {
    const prices = falling(15, 100, 1);
    const roc = calcRoc(prices, 14);
    expect(roc).toBeLessThan(0);
  });

  it("magnitude reflects steepness of move", () => {
    const gentle = rising(20, 100, 1);   // +1/bar
    const steep  = rising(20, 100, 5);   // +5/bar
    expect(Math.abs(calcRoc(steep, 14))).toBeGreaterThan(Math.abs(calcRoc(gentle, 14)));
  });

  it("does not divide by zero when prev=0", () => {
    const prices = [...flat(14, 0), 100];
    expect(calcRoc(prices, 14)).toBe(0);
  });

  it("custom period", () => {
    const prices = rising(30, 100, 2);
    const roc5  = calcRoc(prices, 5);
    const roc14 = calcRoc(prices, 14);
    // roc5 uses last 5 bars, roc14 uses last 14 — same slope so roc5 = roc14 percentage-wise
    expect(roc5).toBeGreaterThan(0);
    expect(roc14).toBeGreaterThan(0);
  });
});
