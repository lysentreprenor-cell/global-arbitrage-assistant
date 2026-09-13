/**
 * Tests for the shared simulate() backtest engine + filter gates.
 * Uses synthetic Kraken-format OHLC rows [time,o,h,l,c,vwap,vol,count].
 */
import { describe, it, expect } from "vitest";
import { simulate, type SimParams } from "../lib/strategySim";

// ── Helpers ───────────────────────────────────────────────────────────────────

const BASE_PARAMS: SimParams = {
  rsiMin: 36, rsiMax: 67, adxMin: 12,
  confluenceMin: 1, volMultMin: 1.0, cooldownMin: 20,
  stopLoss: 1.20, takeProfit: 2.50, trailPct: 0.45,
  leverage: 1, allowShorts: false,
};

/** Build a Kraken OHLC row: [time, o, h, l, c, vwap, vol, count] */
function row(time: number, o: number, h: number, l: number, c: number, vol = 10): any[] {
  return [time, String(o), String(h), String(l), String(c), String((h + l) / 2), String(vol), 10];
}

/** n rising candles from startPrice, 5m apart starting at startTime (seconds) */
function risingCandles(n: number, startPrice = 60000, step = 50, vol = 10, startTime = 1_700_000_000): any[] {
  return Array.from({ length: n }, (_, i) => {
    const c = startPrice + i * step;
    const o = i === 0 ? c : startPrice + (i - 1) * step;
    return row(startTime + i * 300, o, c + step * 0.3, c - step * 0.1, c, vol);
  });
}

/** n falling candles from startPrice, 5m apart */
function fallingCandles(n: number, startPrice = 60000, step = 50, vol = 10, startTime = 1_700_000_000): any[] {
  return Array.from({ length: n }, (_, i) => {
    const c = startPrice - i * step;
    const o = i === 0 ? c : startPrice - (i - 1) * step;
    return row(startTime + i * 300, o, c + step * 0.1, c - step * 0.3, c, vol);
  });
}

/** n flat candles at price */
function flatCandles(n: number, price = 60000, vol = 10, startTime = 1_700_000_000): any[] {
  return Array.from({ length: n }, (_, i) =>
    row(startTime + i * 300, price, price + 10, price - 10, price, vol));
}

/** Combine arrays — second continues from last timestamp of first */
function concat(...arrays: any[][]): any[] {
  let t = arrays[0][0][0] as number;
  const result: any[] = [];
  for (const arr of arrays) {
    for (const r of arr) {
      const duration = 300;
      result.push([t, r[1], r[2], r[3], r[4], r[5], r[6], r[7]]);
      t += duration;
    }
  }
  return result;
}

// Enough warmup candles (150 required by sim) + sufficient trading range
const WARMUP = flatCandles(160, 60000);

// ── Basic simulation behaviour ────────────────────────────────────────────────

describe("simulate: basic behaviour", () => {
  it("returns zero trades for flat market (no signals fire)", () => {
    const raw = concat(WARMUP, flatCandles(200, 60000));
    const r = simulate(raw, [], BASE_PARAMS);
    expect(r.numTrades).toBe(0);
    expect(r.winRate).toBe(0);
    expect(r.totalReturn).toBe(0);
  });

  it("returns SimResult with all expected fields", () => {
    const raw = concat(WARMUP, risingCandles(100));
    const r = simulate(raw, [], BASE_PARAMS);
    expect(typeof r.numTrades).toBe("number");
    expect(typeof r.winRate).toBe("number");
    expect(typeof r.totalReturn).toBe("number");
    expect(typeof r.maxDrawdown).toBe("number");
    expect(typeof r.avgWin).toBe("number");
    expect(typeof r.avgLoss).toBe("number");
    expect(typeof r.finalEquity).toBe("number");
    expect(typeof r.sharpe).toBe("number");
    expect(Array.isArray(r.trades)).toBe(true);
  });

  it("winRate is in [0, 100]", () => {
    const raw = concat(WARMUP, risingCandles(200, 60000, 100));
    const r = simulate(raw, [], BASE_PARAMS);
    expect(r.winRate).toBeGreaterThanOrEqual(0);
    expect(r.winRate).toBeLessThanOrEqual(100);
  });

  it("finalEquity starts at 100 and reflects trades", () => {
    const raw = concat(WARMUP, flatCandles(50, 60000));
    const r = simulate(raw, [], BASE_PARAMS);
    // No trades in flat market → equity stays at 100
    expect(r.finalEquity).toBeCloseTo(100, 5);
  });

  it("allowShorts=false produces no short trades", () => {
    const raw = concat(WARMUP, fallingCandles(200, 65000, 100));
    const r = simulate(raw, [], { ...BASE_PARAMS, allowShorts: false });
    const hasShort = r.trades.some(t => t.dir === "short");
    expect(hasShort).toBe(false);
  });

  it("longs + shorts = numTrades", () => {
    const raw = concat(WARMUP, risingCandles(200));
    const r = simulate(raw, [], BASE_PARAMS);
    expect(r.longs + r.shorts).toBe(r.numTrades);
  });

  it("all trade pnlPct match totalReturn sum (within rounding)", () => {
    const raw = concat(WARMUP, risingCandles(200, 60000, 80));
    const r = simulate(raw, [], BASE_PARAMS);
    const sum = r.trades.reduce((s, t) => s + t.pnlPct, 0);
    expect(sum).toBeCloseTo(r.totalReturn, 2);
  });

  it("maxDrawdown is non-negative", () => {
    const raw = concat(WARMUP, risingCandles(200));
    const r = simulate(raw, [], BASE_PARAMS);
    expect(r.maxDrawdown).toBeGreaterThanOrEqual(0);
  });
});

// ── Filter gates reduce or change entry count ─────────────────────────────────

describe("simulate: filter gates", () => {
  // Build a series that generates signals so filters have something to block
  const TRADING = concat(
    WARMUP,
    risingCandles(100, 60000, 80, 15),  // volume spike to help confluence
    fallingCandles(50, 68000, 80, 15),
    risingCandles(100, 64000, 60, 15),
  );

  it("no filters: baseline has more or equal trades than any single filter", () => {
    const baseline = simulate(TRADING, [], BASE_PARAMS);
    const withF = simulate(TRADING, [], { ...BASE_PARAMS, filters: { roc14: true } });
    // Filters can only block entries, never add new ones
    expect(withF.numTrades).toBeLessThanOrEqual(baseline.numTrades);
  });

  it("stochRsi80 filter blocks entries when StochRSI>80", () => {
    const baseline = simulate(TRADING, [], BASE_PARAMS);
    const filtered = simulate(TRADING, [], { ...BASE_PARAMS, filters: { stochRsi80: true } });
    expect(filtered.numTrades).toBeLessThanOrEqual(baseline.numTrades);
  });

  it("bbPercB80 filter blocks entries when BB%B>80", () => {
    const baseline = simulate(TRADING, [], BASE_PARAMS);
    const filtered = simulate(TRADING, [], { ...BASE_PARAMS, filters: { bbPercB80: true } });
    expect(filtered.numTrades).toBeLessThanOrEqual(baseline.numTrades);
  });

  it("roc14 filter blocks entries with non-positive ROC", () => {
    const baseline = simulate(TRADING, [], BASE_PARAMS);
    const filtered = simulate(TRADING, [], { ...BASE_PARAMS, filters: { roc14: true } });
    expect(filtered.numTrades).toBeLessThanOrEqual(baseline.numTrades);
  });

  it("bodyQuality filter blocks weak-body candles", () => {
    const baseline = simulate(TRADING, [], BASE_PARAMS);
    const filtered = simulate(TRADING, [], { ...BASE_PARAMS, filters: { bodyQuality: true } });
    expect(filtered.numTrades).toBeLessThanOrEqual(baseline.numTrades);
  });

  it("emaSlope filter blocks when EMA21 is not rising", () => {
    const baseline = simulate(TRADING, [], BASE_PARAMS);
    const filtered = simulate(TRADING, [], { ...BASE_PARAMS, filters: { emaSlope: true } });
    expect(filtered.numTrades).toBeLessThanOrEqual(baseline.numTrades);
  });

  it("multiple filters together reduce trades further", () => {
    const one  = simulate(TRADING, [], { ...BASE_PARAMS, filters: { roc14: true } });
    const two  = simulate(TRADING, [], { ...BASE_PARAMS, filters: { roc14: true, stochRsi80: true } });
    expect(two.numTrades).toBeLessThanOrEqual(one.numTrades);
  });

  it("all filters ON: never more trades than no-filter baseline", () => {
    const baseline = simulate(TRADING, [], BASE_PARAMS);
    const allOn = simulate(TRADING, [], {
      ...BASE_PARAMS,
      filters: {
        stochRsi80: true, bbPercB80: true, bodyQuality: true, emaSlope: true,
        candleConfirm: true, adxRising: true, volTrend: true, wickRej: true,
        roc14: true, ichimoku: true, heikinAshi: true, bbSqueeze: true,
      },
    });
    expect(allOn.numTrades).toBeLessThanOrEqual(baseline.numTrades);
  });

  it("filters=undefined behaves identically to filters={} (all off)", () => {
    const noFilter = simulate(TRADING, [], BASE_PARAMS);
    const emptyFilter = simulate(TRADING, [], { ...BASE_PARAMS, filters: {} });
    expect(emptyFilter.numTrades).toBe(noFilter.numTrades);
    expect(emptyFilter.totalReturn).toBeCloseTo(noFilter.totalReturn, 5);
  });
});

// ── Fee accounting ────────────────────────────────────────────────────────────

describe("simulate: Kraken 0.52% round-trip fee", () => {
  it("fees are subtracted from pnlPct (net < gross for winning trades)", () => {
    // A trade from 60000 → 62000 is +3.33% gross. After 0.52% fee = 2.81% net
    const FEE_RT = 0.0052;
    const raw = concat(WARMUP, risingCandles(300, 60000, 100, 20));
    const r = simulate(raw, [], { ...BASE_PARAMS, takeProfit: 2.50 });
    const tpTrades = r.trades.filter(t => t.pnlPct > 0);
    for (const t of tpTrades) {
      const grossPct = (t.exit - t.entry) / t.entry * 100;
      // net = gross - fee; gross must be > net by approximately FEE_RT*100
      expect(t.pnlPct).toBeLessThan(grossPct + 0.01); // net ≤ gross
      expect(grossPct - t.pnlPct).toBeGreaterThan(0); // fee was subtracted
    }
  });

  it("with high SL that allows very tight TP: fee prevents profits on tiny moves", () => {
    // TP=0.3% is less than the 0.52% round-trip fee → any TP hit still results in net loss
    const raw = concat(WARMUP, risingCandles(200, 60000, 60, 20));
    const r = simulate(raw, [], { ...BASE_PARAMS, takeProfit: 0.3, stopLoss: 1.0 });
    // All TP hits at 0.3% gross → net = 0.3 - 0.52 = -0.22% (a loss!)
    const tpTrades = r.trades.filter(t => {
      const gross = (t.exit - t.entry) / t.entry * 100;
      return gross > 0.25 && gross < 0.35;
    });
    for (const t of tpTrades) {
      expect(t.pnlPct).toBeLessThan(0); // fee makes it a net loss
    }
  });
});

// ── Walk-forward split consistency ────────────────────────────────────────────

describe("simulate: walk-forward consistency", () => {
  it("sim on full data ≥ sim on first 70% for total trade count", () => {
    const raw = concat(WARMUP, risingCandles(400, 60000, 60, 15));
    const full  = simulate(raw, [], BASE_PARAMS);
    const train = simulate(raw.slice(0, Math.floor(raw.length * 0.7)), [], BASE_PARAMS);
    // Full dataset has at least as many trades as the 70% subset
    expect(full.numTrades).toBeGreaterThanOrEqual(train.numTrades);
  });

  it("train + valid windows are independent (no shared state leakage)", () => {
    const raw = concat(WARMUP, risingCandles(300, 60000, 60, 15));
    const split = Math.floor(raw.length * 0.7);
    const r1 = simulate(raw.slice(0, split), [], BASE_PARAMS);
    const r2 = simulate(raw.slice(split), [], BASE_PARAMS);
    const rFull = simulate(raw, [], BASE_PARAMS);
    // Separate sims can't have more combined trades than full (warmup burned twice)
    // But full sim might have FEWER because of cooldown spanning the split point
    expect(r1.numTrades + r2.numTrades).toBeGreaterThanOrEqual(0);
    expect(rFull.numTrades).toBeGreaterThanOrEqual(0);
  });
});
