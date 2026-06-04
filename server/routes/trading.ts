import express from "express";

const router = express.Router();

const KRAKEN = "https://api.kraken.com/0/public";

// Map USDT pairs → Kraken pair names
const SYMBOL_MAP: Record<string, string> = {
  BTCUSDT: "XBTUSD",
  ETHUSDT: "ETHUSD",
  SOLUSDT: "SOLUSD",
  BNBUSDT: "BNBUSD",
  ADAUSDT: "ADAUSD",
};

const VALID_SYMBOLS = new Set(Object.keys(SYMBOL_MAP));
const VALID_INTERVALS = new Set(["1m", "5m", "15m", "1h", "4h", "1d"]);

// Kraken OHLC interval in minutes
const INTERVAL_MAP: Record<string, number> = {
  "1m": 1, "5m": 5, "15m": 15, "1h": 60, "4h": 240, "1d": 1440,
};

router.get("/ticker", async (req, res) => {
  const symbol = String(req.query.symbol ?? "BTCUSDT").toUpperCase();
  if (!VALID_SYMBOLS.has(symbol)) return res.status(400).json({ error: "Invalid symbol" });
  const pair = SYMBOL_MAP[symbol];
  try {
    const [tickerRes, ohlcRes] = await Promise.all([
      fetch(`${KRAKEN}/Ticker?pair=${pair}`, { signal: AbortSignal.timeout(8000) }),
      fetch(`${KRAKEN}/OHLC?pair=${pair}&interval=1440`, { signal: AbortSignal.timeout(8000) }),
    ]);
    if (!tickerRes.ok) throw new Error(`Kraken HTTP ${tickerRes.status}`);
    const tickerData = await tickerRes.json() as any;
    const pairKey = Object.keys(tickerData.result ?? {})[0];
    if (!pairKey) throw new Error("No ticker data");
    const t = tickerData.result[pairKey];
    const price = parseFloat(t.c[0]);
    const open24h = parseFloat(t.o);
    const high24h = parseFloat(t.h[1]);
    const low24h = parseFloat(t.l[1]);
    const volume24h = parseFloat(t.v[1]);
    const change24h = open24h > 0 ? ((price - open24h) / open24h) * 100 : 0;
    res.json({ symbol, price, change24h, high24h, low24h, volume24h });
  } catch (e: any) {
    res.status(502).json({ error: e.message });
  }
});

// Fetch one page of Kraken OHLC candles, return array
async function krakenOhlcPage(pair: string, intervalMin: number, since?: number): Promise<any[]> {
  const url = since
    ? `${KRAKEN}/OHLC?pair=${pair}&interval=${intervalMin}&since=${since}`
    : `${KRAKEN}/OHLC?pair=${pair}&interval=${intervalMin}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`Kraken HTTP ${r.status}`);
  const data = await r.json() as any;
  if (data.error?.length) throw new Error(`Kraken: ${data.error[0]}`);
  const pairKey = Object.keys(data.result ?? {}).find(k => k !== "last");
  if (!pairKey) throw new Error("No kline data");
  return data.result[pairKey] as any[];
}

router.get("/klines", async (req, res) => {
  const symbol = String(req.query.symbol ?? "BTCUSDT").toUpperCase();
  const interval = String(req.query.interval ?? "1h");
  const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? "50")), 1), 2400);
  const since = req.query.since ? parseInt(String(req.query.since)) : undefined; // Unix seconds
  if (!VALID_SYMBOLS.has(symbol)) return res.status(400).json({ error: "Invalid symbol" });
  if (!VALID_INTERVALS.has(interval)) return res.status(400).json({ error: "Invalid interval" });
  const pair = SYMBOL_MAP[symbol];
  const krakenInterval = INTERVAL_MAP[interval];
  try {
    let allCandles: any[] = [];
    if (limit <= 720) {
      // Single call suffices
      allCandles = await krakenOhlcPage(pair, krakenInterval, since);
      allCandles = allCandles.slice(-limit);
    } else {
      // Paginate: fetch multiple pages going back in time
      // Kraken returns 720 candles per call. For 2400 we need ~4 calls.
      const pages = Math.ceil(limit / 720);
      // Start from now, step back by 720 candles at a time
      const candleSec = krakenInterval * 60; // interval in seconds
      let pageSince = Math.floor(Date.now() / 1000) - (pages * 720 * candleSec);
      for (let p = 0; p < pages; p++) {
        const page = await krakenOhlcPage(pair, krakenInterval, pageSince);
        if (!page.length) break;
        allCandles.push(...page);
        pageSince = (page[page.length - 1][0] as number) + candleSec;
        if (pageSince * 1000 > Date.now()) break;
      }
      // Deduplicate by timestamp and sort
      const seen = new Set<number>();
      allCandles = allCandles.filter(k => { const t = k[0]; if (seen.has(t)) return false; seen.add(t); return true; });
      allCandles.sort((a, b) => a[0] - b[0]);
      allCandles = allCandles.slice(-limit);
    }
    // Kraken OHLC: [time, open, high, low, close, vwap, volume, count]
    res.json(allCandles.map((k: any) => ({
      time: k[0] * 1000,
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[6]),
    })));
  } catch (e: any) {
    res.status(502).json({ error: e.message });
  }
});

export default router;
