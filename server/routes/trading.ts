import express from "express";

const router = express.Router();
const BINANCE = "https://api.binance.com/api/v3";

const VALID_SYMBOLS = new Set(["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "ADAUSDT"]);
const VALID_INTERVALS = new Set(["1m", "5m", "15m", "1h", "4h", "1d"]);

router.get("/ticker", async (req, res) => {
  const symbol = String(req.query.symbol ?? "BTCUSDT").toUpperCase();
  if (!VALID_SYMBOLS.has(symbol)) return res.status(400).json({ error: "Invalid symbol" });
  try {
    const r = await fetch(`${BINANCE}/ticker/24hr?symbol=${symbol}`, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`Binance HTTP ${r.status}`);
    const d = await r.json() as any;
    res.json({
      symbol: d.symbol,
      price: parseFloat(d.lastPrice),
      change24h: parseFloat(d.priceChangePercent),
      high24h: parseFloat(d.highPrice),
      low24h: parseFloat(d.lowPrice),
      volume24h: parseFloat(d.volume),
    });
  } catch (e: any) {
    res.status(502).json({ error: e.message });
  }
});

router.get("/klines", async (req, res) => {
  const symbol = String(req.query.symbol ?? "BTCUSDT").toUpperCase();
  const interval = String(req.query.interval ?? "1h");
  const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? "50")), 1), 200);
  if (!VALID_SYMBOLS.has(symbol)) return res.status(400).json({ error: "Invalid symbol" });
  if (!VALID_INTERVALS.has(interval)) return res.status(400).json({ error: "Invalid interval" });
  try {
    const r = await fetch(`${BINANCE}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`Binance HTTP ${r.status}`);
    const data = await r.json() as any[];
    res.json(data.map(k => ({
      time: k[0],
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
    })));
  } catch (e: any) {
    res.status(502).json({ error: e.message });
  }
});

export default router;
