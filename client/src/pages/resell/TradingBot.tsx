import { useState, useEffect, useCallback, useRef } from "react";
import {
  TrendingUp, TrendingDown, Clock, RefreshCw, Settings,
  ChevronDown, ChevronUp, Play, Pause, AlertCircle, Activity,
  FlaskConical, Radio, Zap, ArrowUpCircle, ArrowDownCircle,
} from "lucide-react";
import { ResellLayout } from "@/components/resell/ResellLayout";

type Symbol = "BTCUSDT" | "ETHUSDT" | "SOLUSDT";
type TradeReason = "session_end" | "stop_loss" | "take_profit";
type Direction = "long" | "short";

type PaperTrade = {
  id: number; symbol: Symbol; direction: Direction;
  entryTime: string; entryPrice: number; size: number; status: "open" | "closed";
  exitTime?: string; exitPrice?: number; pnl?: number; pnlPct?: number; reason?: TradeReason;
};

type BotConfig = {
  enabled: boolean; autoMode: boolean; allowShorts: boolean; symbol: Symbol;
  capital: number; riskPct: number; stopLoss: number; takeProfit: number; trades: PaperTrade[];
};

type LogEntry = { time: string; msg: string; type: "buy" | "sell" | "info" | "warn" };

type Ticker = { price: number; change24h: number; high24h: number; low24h: number };

type SessionInfo = { inSession: boolean; label: string; countdown: string };

type MarketData = { rsi: number; ema21: number; priceVsEma: number; momentum: number; volatility: number };

type BtTrade = { date: string; direction: Direction; entryPrice: number; exitPrice: number; pnlPct: number; reason: TradeReason };
type BtResult = { symbol: string; days: number; trades: BtTrade[]; winRate: number; totalReturn: number; maxDrawdown: number; avgWin: number; avgLoss: number; sharpe: number; equity: number[]; longs: number; shorts: number };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcEMA21(closes: number[]): number {
  if (!closes.length) return 0;
  const k = 2 / 22;
  let ema = closes.slice(0, 21).reduce((a, b) => a + b, 0) / 21;
  for (let i = 21; i < closes.length; i++) ema = closes[i] * k + ema * (1 - k);
  return ema;
}

function calcRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gains += d; else losses -= d;
  }
  const ag = gains / period, al = losses / period;
  if (al === 0) return 100;
  return parseFloat((100 - 100 / (1 + ag / al)).toFixed(1));
}

function getSessionInfo(now: Date): SessionInfo {
  const h = now.getUTCHours(), m = now.getUTCMinutes(), s = now.getUTCSeconds();
  const inSession = h === 21 || h === 22;
  if (inSession) {
    const sl = (23 - h) * 3600 - m * 60 - s;
    return { inSession: true, label: "SESJA AKTYWNA", countdown: `Koniec za ${Math.floor(sl/3600)>0?Math.floor(sl/3600)+"h ":""}${Math.floor((sl%3600)/60)}m ${sl%60}s` };
  }
  const ns = 21*3600, cs = h*3600+m*60+s;
  let ts = ns - cs; if (ts < 0) ts += 86400;
  return { inSession: false, label: "POZA SESJĄ", countdown: `Start za ${Math.floor(ts/3600)}h ${Math.floor((ts%3600)/60)}m` };
}

function fmt(p: number): string {
  if (p >= 1000) return p.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return p >= 1 ? p.toFixed(2) : p.toFixed(4);
}
const fmtPct = (p: number) => (p >= 0 ? "+" : "") + p.toFixed(2) + "%";
const fmtUsd = (p: number) => (p >= 0 ? "+" : "-") + "$" + Math.abs(p).toFixed(2);
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("pl", { day: "2-digit", month: "2-digit" });
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("pl", { hour: "2-digit", minute: "2-digit" });
const logTime = () => new Date().toLocaleTimeString("pl", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

// ─── Backtest ─────────────────────────────────────────────────────────────────

async function runBacktest(symbol: Symbol, sl: number, tp: number, allowShorts: boolean): Promise<BtResult> {
  const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1h&limit=1000`);
  if (!res.ok) throw new Error(`Binance ${res.status}`);
  const raw: any[][] = await res.json();
  const candles = raw.map(k => ({ time: k[0] as number, open: +k[1], high: +k[2], low: +k[3], close: +k[4], utcH: new Date(k[0]).getUTCHours() }));
  const trades: BtTrade[] = [];

  for (let i = 22; i < candles.length - 2; i++) {
    const c = candles[i];
    if (c.utcH !== 21) continue;
    const closes = candles.slice(i - 21, i).map(x => x.close);
    const ema = calcEMA21(closes);
    const rsi = calcRSI(candles.slice(Math.max(0, i - 15), i).map(x => x.close));
    const isLong = c.open > ema && rsi >= 50;
    const isShort = allowShorts && c.open < ema && rsi < 50;
    if (!isLong && !isShort) continue;
    const dir: Direction = isLong ? "long" : "short";
    let exit = c.close, reason: TradeReason = "session_end";
    for (let j = i; j <= i + 1 && j < candles.length; j++) {
      const cn = candles[j];
      if (dir === "long") {
        if ((cn.low  - c.open) / c.open * 100 <= -sl) { exit = c.open * (1 - sl/100); reason = "stop_loss"; break; }
        if ((cn.high - c.open) / c.open * 100 >=  tp) { exit = c.open * (1 + tp/100); reason = "take_profit"; break; }
      } else {
        if ((cn.high - c.open) / c.open * 100 >=  sl) { exit = c.open * (1 + sl/100); reason = "stop_loss"; break; }
        if ((cn.low  - c.open) / c.open * 100 <= -tp) { exit = c.open * (1 - tp/100); reason = "take_profit"; break; }
      }
      exit = cn.close;
    }
    const pnlPct = dir === "long" ? (exit - c.open) / c.open * 100 : (c.open - exit) / c.open * 100;
    trades.push({ date: new Date(c.time).toLocaleDateString("pl", { day:"2-digit", month:"2-digit" }), direction: dir, entryPrice: c.open, exitPrice: exit, pnlPct, reason });
  }

  if (!trades.length) return { symbol, days: Math.round(candles.length/24), trades:[], winRate:0, totalReturn:0, maxDrawdown:0, avgWin:0, avgLoss:0, sharpe:0, equity:[], longs:0, shorts:0 };

  const wins = trades.filter(t => t.pnlPct > 0), losses = trades.filter(t => t.pnlPct <= 0);
  const winRate = wins.length / trades.length * 100;
  const avgWin  = wins.length   ? wins.reduce((s,t)=>s+t.pnlPct,0)   / wins.length   : 0;
  const avgLoss = losses.length ? losses.reduce((s,t)=>s+t.pnlPct,0) / losses.length : 0;
  let eq = 100, peak = 100, maxDD = 0;
  const equity: number[] = [];
  for (const t of trades) {
    eq *= (1 + t.pnlPct / 100); equity.push(parseFloat((eq-100).toFixed(2)));
    if (eq > peak) peak = eq;
    const dd = (peak - eq) / peak * 100; if (dd > maxDD) maxDD = dd;
  }
  const returns = trades.map(t => t.pnlPct);
  const mean = returns.reduce((a,b)=>a+b,0)/returns.length;
  const variance = returns.reduce((s,r)=>s+(r-mean)**2,0)/returns.length;
  const sharpe = variance > 0 ? parseFloat((mean/Math.sqrt(variance)*Math.sqrt(252/24)).toFixed(2)) : 0;
  return { symbol, days: Math.round(candles.length/24), trades, winRate, totalReturn: eq-100, maxDrawdown: maxDD, avgWin, avgLoss, sharpe, equity, longs: trades.filter(t=>t.direction==="long").length, shorts: trades.filter(t=>t.direction==="short").length };
}

// ─── Storage ──────────────────────────────────────────────────────────────────

const KEY = "resell_trading_bot_v1";
function loadConfig(): BotConfig {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { allowShorts: false, autoMode: false, ...JSON.parse(raw) as BotConfig };
  } catch {}
  return { enabled: false, autoMode: false, allowShorts: false, symbol: "BTCUSDT", capital: 1000, riskPct: 10, stopLoss: 4, takeProfit: 15, trades: [] };
}
function saveConfig(c: BotConfig) { localStorage.setItem(KEY, JSON.stringify(c)); }
const REASON_LABEL: Record<TradeReason, string> = { session_end: "Koniec sesji", stop_loss: "Stop Loss", take_profit: "Take Profit" };

// ─── Component ────────────────────────────────────────────────────────────────

export default function TradingBot() {
  const [config, setConfig] = useState<BotConfig>(loadConfig);
  const [ticker, setTicker] = useState<Ticker | null>(null);
  const [marketData, setMarketData] = useState<MarketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(new Date());
  const [showSettings, setShowSettings] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [btResult, setBtResult] = useState<BtResult | null>(null);
  const [btLoading, setBtLoading] = useState(false);
  const [btError, setBtError] = useState<string | null>(null);
  const [showBtTrades, setShowBtTrades] = useState(false);
  const [activityLog, setActivityLog] = useState<LogEntry[]>([]);
  const logRef = useRef<HTMLDivElement>(null);
  const prevSessionRef = useRef<boolean | null>(null);
  const [tmpCapital, setTmpCapital] = useState(String(config.capital));
  const [tmpRisk, setTmpRisk]       = useState(String(config.riskPct));
  const [tmpSL, setTmpSL]           = useState(String(config.stopLoss));
  const [tmpTP, setTmpTP]           = useState(String(config.takeProfit));

  const update = useCallback((patch: Partial<BotConfig>) => {
    setConfig(prev => { const next = { ...prev, ...patch }; saveConfig(next); return next; });
  }, []);

  const addLog = useCallback((msg: string, type: LogEntry["type"]) => {
    setActivityLog(prev => [...prev.slice(-199), { time: logTime(), msg, type }]);
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const [tRes, kRes] = await Promise.all([
        fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${config.symbol}`),
        fetch(`https://api.binance.com/api/v3/klines?symbol=${config.symbol}&interval=1h&limit=50`),
      ]);
      if (!tRes.ok || !kRes.ok) throw new Error(`Binance ${tRes.status}`);
      const td = await tRes.json();
      const klines: any[] = await kRes.json();
      const closes = klines.map(k => parseFloat(k[4]));
      const opens  = klines.map(k => parseFloat(k[1]));
      const highs  = klines.map(k => parseFloat(k[2]));
      const lows   = klines.map(k => parseFloat(k[3]));
      const ema = calcEMA21(closes);
      const last = closes.length - 1;
      setTicker({ price: parseFloat(td.lastPrice), change24h: parseFloat(td.priceChangePercent), high24h: parseFloat(td.highPrice), low24h: parseFloat(td.lowPrice) });
      setMarketData({ rsi: calcRSI(closes), ema21: ema, priceVsEma: (closes[last] - ema) / ema * 100, momentum: (closes[last] - opens[last]) / opens[last] * 100, volatility: (highs[last] - lows[last]) / opens[last] * 100 });
      setLastRefresh(new Date()); setError(null);
    } catch (e: any) { setError("Błąd danych: " + e.message); }
    finally { setLoading(false); }
  }, [config.symbol]);

  const runEngine = useCallback(() => {
    if (!ticker || !marketData || !config.enabled) return;
    const sess = getSessionInfo(new Date());
    const { rsi, ema21 } = marketData;
    const aboveEMA = ticker.price > ema21;
    const openTrade = config.trades.find(t => t.status === "open");

    if (!openTrade) {
      if (!sess.inSession) return;
      const isLong  = aboveEMA && rsi >= 50;
      const isShort = config.allowShorts && !aboveEMA && rsi < 50;
      if (!isLong && !isShort) {
        setActivityLog(prev => {
          const msg = `⧖ Skan — $${fmt(ticker.price)} | RSI ${rsi} | EMA ${aboveEMA?"▲":"▼"} — brak sygnału`;
          const last = prev[prev.length-1];
          const e: LogEntry = { time: logTime(), msg, type: "info" };
          if (last?.type === "info" && last.msg.startsWith("⧖ Skan")) return [...prev.slice(0,-1), e];
          return [...prev.slice(-199), e];
        });
        return;
      }
      const direction: Direction = isLong ? "long" : "short";
      const size = config.capital * (config.riskPct / 100);
      update({ trades: [...config.trades, { id: Date.now(), symbol: config.symbol, direction, entryTime: new Date().toISOString(), entryPrice: ticker.price, size, status: "open" }] });
      addLog(`▶ ${direction.toUpperCase()} ${config.symbol.replace("USDT","")} @ $${fmt(ticker.price)} | RSI ${rsi} | $${size.toFixed(0)} | SL ${config.stopLoss}% TP ${config.takeProfit}%`, "buy");
      return;
    }

    const rawPct = (ticker.price - openTrade.entryPrice) / openTrade.entryPrice * 100;
    const pct = openTrade.direction === "short" ? -rawPct : rawPct;
    let reason: TradeReason | null = null;
    if (!sess.inSession) reason = "session_end";
    else if (pct <= -config.stopLoss) reason = "stop_loss";
    else if (pct >= config.takeProfit) reason = "take_profit";

    if (reason) {
      const pnl = pct / 100 * openTrade.size;
      update({ trades: config.trades.map(t => t.id === openTrade.id ? { ...t, status: "closed", exitTime: new Date().toISOString(), exitPrice: ticker.price, pnl, pnlPct: pct, reason } : t) });
      addLog(`■ CLOSE ${openTrade.direction.toUpperCase()} ${openTrade.symbol.replace("USDT","")} @ $${fmt(ticker.price)} | ${fmtUsd(pnl)} (${fmtPct(pct)}) — ${REASON_LABEL[reason]}`, pnl >= 0 ? "sell" : "warn");
    } else {
      setActivityLog(prev => {
        const msg = `◉ Monitoring ${openTrade.direction.toUpperCase()} ${openTrade.symbol.replace("USDT","")} @ $${fmt(ticker.price)} | ${fmtPct(pct)}`;
        const e: LogEntry = { time: logTime(), msg, type: "info" };
        const last = prev[prev.length-1];
        if (last?.type === "info" && last.msg.startsWith("◉ Monitoring")) return [...prev.slice(0,-1), e];
        return [...prev.slice(-199), e];
      });
    }
  }, [ticker, marketData, config, update, addLog]);

  useEffect(() => { fetchData(); const id = setInterval(fetchData, 30_000); return () => clearInterval(id); }, [fetchData]);
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);
  useEffect(() => { runEngine(); }, [ticker, marketData]); // eslint-disable-line

  useEffect(() => {
    if (!config.autoMode) return;
    const s = getSessionInfo(now);
    if (prevSessionRef.current === null) { prevSessionRef.current = s.inSession; return; }
    if (!prevSessionRef.current && s.inSession)  { prevSessionRef.current = true;  update({ enabled: true  }); addLog("AUTO: Sesja 21:00 UTC — bot uruchomiony ✓", "info"); }
    else if (prevSessionRef.current && !s.inSession) { prevSessionRef.current = false; update({ enabled: false }); addLog("AUTO: Sesja zakończona 23:00 UTC — bot zatrzymany", "warn"); }
  }, [now]); // eslint-disable-line

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [activityLog]);

  const openTrade  = config.trades.find(t => t.status === "open");
  const closed     = config.trades.filter(t => t.status === "closed");
  const wins       = closed.filter(t => (t.pnl ?? 0) > 0).length;
  const winRate    = closed.length ? Math.round(wins / closed.length * 100) : null;
  const totalPnl   = closed.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const totalRet   = (totalPnl / config.capital) * 100;
  const bestTrade  = closed.length ? Math.max(...closed.map(t => t.pnlPct ?? 0)) : null;
  const sess       = getSessionInfo(now);

  const G = "#4ade80", R = "#f87171", M = "rgba(255,255,255,0.4)", T = "rgba(255,255,255,0.88)";
  const card = { background: "rgba(0,28,14,0.7)", border: "1px solid rgba(34,197,94,0.13)", borderRadius: 12, padding: "16px 18px" } as const;
  const inputStyle = (): React.CSSProperties => ({ width: "100%", background: "rgba(0,0,0,0.35)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 8, padding: "8px 12px", color: T, fontSize: 14, boxSizing: "border-box", outline: "none" });
  const rsiColor = (r: number) => r >= 70 ? R : r >= 50 ? G : r >= 30 ? "#f59e0b" : R;

  return (
    <ResellLayout>
      <div style={{ maxWidth: 980, margin: "0 auto", padding: "20px 16px", color: T, fontFamily: "system-ui, sans-serif" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: "linear-gradient(135deg,#16a34a,#4ade80)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 18px rgba(74,222,128,0.3)" }}>
              <Activity size={20} color="#fff" />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 20 }}>Trading Bot</div>
              <div style={{ fontSize: 12, color: M }}>📄 Paper mode · Long + Short · RSI+EMA · Live scan</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {lastRefresh && <span style={{ fontSize: 11, color: M }}>Dane: {fmtTime(lastRefresh.toISOString())}</span>}
            <button onClick={fetchData} style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: 8, padding: "6px 14px", color: G, cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}>
              <RefreshCw size={12} /> Odśwież
            </button>
          </div>
        </div>

        {/* Controls */}
        <div style={{ ...card, display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {(["BTCUSDT","ETHUSDT","SOLUSDT"] as const).map(sym => {
              const active = config.symbol === sym;
              return <button key={sym} onClick={() => update({ symbol: sym })} style={{ background: active ? "rgba(34,197,94,0.18)" : "transparent", border: `1px solid ${active ? "rgba(34,197,94,0.45)" : "rgba(255,255,255,0.1)"}`, borderRadius: 8, padding: "8px 18px", color: active ? G : M, cursor: "pointer", fontWeight: active ? 700 : 500, fontSize: 14 }}>{sym.replace("USDT","")}</button>;
            })}
            <button
              onClick={() => { update({ allowShorts: !config.allowShorts }); addLog(!config.allowShorts ? "Tryb: LONG + SHORT włączony" : "Tryb: tylko LONG", "info"); }}
              title="Zezwól botowi na short gdy trend spada"
              style={{ background: config.allowShorts ? "rgba(248,113,113,0.12)" : "rgba(255,255,255,0.04)", border: `1px solid ${config.allowShorts ? "rgba(248,113,113,0.4)" : "rgba(255,255,255,0.1)"}`, borderRadius: 8, padding: "8px 16px", color: config.allowShorts ? "#fca5a5" : M, cursor: "pointer", fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
              {config.allowShorts ? <><ArrowDownCircle size={13} /> L+S</> : <><ArrowUpCircle size={13} /> LONG</>}
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={() => { const n = !config.autoMode; update({ autoMode: n }); prevSessionRef.current = null; addLog(n ? "AUTO MODE włączony — bot uruchomi się o 21:00 UTC" : "AUTO MODE wyłączony", n ? "info" : "warn"); }}
              style={{ display: "flex", alignItems: "center", gap: 7, background: config.autoMode ? "rgba(245,158,11,0.15)" : "rgba(255,255,255,0.04)", border: `1px solid ${config.autoMode ? "rgba(245,158,11,0.45)" : "rgba(255,255,255,0.12)"}`, borderRadius: 8, padding: "9px 16px", color: config.autoMode ? "#fbbf24" : M, cursor: "pointer", fontWeight: 700, fontSize: 13 }}>
              <Zap size={13} /> AUTO {config.autoMode ? "ON" : "OFF"}
            </button>
            {config.enabled && sess.inSession && (
              <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: G, background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 20, padding: "4px 10px", fontWeight: 700 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: G, animation: "pulse 1.5s ease-in-out infinite", display: "inline-block" }} /> LIVE
              </span>
            )}
            <button onClick={() => update({ enabled: !config.enabled })} style={{ display: "flex", alignItems: "center", gap: 8, background: config.enabled ? "rgba(34,197,94,0.18)" : "rgba(255,255,255,0.04)", border: `1px solid ${config.enabled ? "rgba(34,197,94,0.4)" : "rgba(255,255,255,0.12)"}`, borderRadius: 8, padding: "9px 20px", color: config.enabled ? G : M, cursor: "pointer", fontWeight: 700, fontSize: 14 }}>
              {config.enabled ? <><Play size={14} /> AKTYWNY</> : <><Pause size={14} /> ZATRZYMANY</>}
            </button>
          </div>
        </div>

        {error && <div style={{ ...card, border: "1px solid rgba(248,113,113,0.3)", background: "rgba(248,113,113,0.06)", color: R, marginBottom: 14, display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}><AlertCircle size={15} /> {error}</div>}

        {/* 4 info cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 14 }}>
          <div style={card}>
            <div style={{ fontSize: 10, color: M, letterSpacing: 1, marginBottom: 8 }}>CENA</div>
            {loading ? <div style={{ color: M }}>Ładowanie…</div> : ticker ? (
              <>
                <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>${fmt(ticker.price)}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: ticker.change24h >= 0 ? G : R }}>{fmtPct(ticker.change24h)} 24h</div>
                <div style={{ fontSize: 11, color: M, marginTop: 6 }}>H ${fmt(ticker.high24h)} · L ${fmt(ticker.low24h)}</div>
              </>
            ) : <div style={{ color: M }}>—</div>}
          </div>

          <div style={card}>
            <div style={{ fontSize: 10, color: M, letterSpacing: 1, marginBottom: 8 }}>RSI-14</div>
            {marketData ? (
              <>
                <div style={{ fontSize: 28, fontWeight: 900, color: rsiColor(marketData.rsi), marginBottom: 6 }}>{marketData.rsi}</div>
                <div style={{ height: 5, background: "rgba(255,255,255,0.08)", borderRadius: 3, marginBottom: 5 }}>
                  <div style={{ width: `${marketData.rsi}%`, height: "100%", background: rsiColor(marketData.rsi), borderRadius: 3, transition: "width 0.5s" }} />
                </div>
                <div style={{ fontSize: 11, color: rsiColor(marketData.rsi), fontWeight: 600 }}>
                  {marketData.rsi >= 70 ? "Wykupienie" : marketData.rsi >= 55 ? "Byczek ▲" : marketData.rsi >= 45 ? "Neutralny" : marketData.rsi >= 30 ? "Niedźwiedź ▼" : "Wyprzedanie"}
                </div>
              </>
            ) : <div style={{ color: M }}>Ładowanie…</div>}
          </div>

          <div style={{ ...card, background: sess.inSession ? "rgba(34,197,94,0.07)" : "rgba(0,28,14,0.7)", border: `1px solid ${sess.inSession ? "rgba(34,197,94,0.35)" : "rgba(34,197,94,0.13)"}` }}>
            <div style={{ fontSize: 10, color: M, letterSpacing: 1, marginBottom: 8 }}>SESJA (21–23 UTC)</div>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
              <div style={{ width: 9, height: 9, borderRadius: "50%", background: sess.inSession ? G : "#4b5563", flexShrink: 0 }} />
              <span style={{ fontWeight: 700, fontSize: 12, color: sess.inSession ? G : M }}>{sess.label}</span>
            </div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{sess.countdown}</div>
            <div style={{ fontSize: 11, color: M, marginTop: 6, display: "flex", alignItems: "center", gap: 5 }}><Clock size={10} /> UTC {now.toUTCString().split(" ")[4]}</div>
          </div>

          <div style={card}>
            <div style={{ fontSize: 10, color: M, letterSpacing: 1, marginBottom: 8 }}>SYGNAŁ</div>
            {marketData && ticker ? (() => {
              const ab = ticker.price > marketData.ema21;
              const longSig = ab && marketData.rsi >= 50;
              const shortSig = !ab && marketData.rsi < 50;
              const col = longSig ? G : shortSig ? R : "#f59e0b";
              return (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    {longSig ? <TrendingUp size={18} color={G} /> : shortSig ? <TrendingDown size={18} color={R} /> : null}
                    <span style={{ fontSize: 22, fontWeight: 900, color: col }}>{longSig ? "LONG ▲" : shortSig ? "SHORT ▼" : "NEUTRAL"}</span>
                  </div>
                  <div style={{ fontSize: 11, color: M }}>EMA-21: <span style={{ color: T }}>${fmt(marketData.ema21)}</span></div>
                  <div style={{ fontSize: 11, color: M, marginTop: 2 }}>{fmtPct(marketData.priceVsEma)} od EMA</div>
                </>
              );
            })() : <div style={{ color: M }}>Ładowanie…</div>}
          </div>
        </div>

        {/* Live Market Scan */}
        {marketData && ticker && (
          <div style={{ ...card, marginBottom: 14 }}>
            <div style={{ fontSize: 10, color: M, letterSpacing: 1, marginBottom: 12 }}>LIVE MARKET SCAN — {config.symbol.replace("USDT","")} / USDT</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 10 }}>
              {([
                { label: "RSI-14",      value: marketData.rsi.toFixed(1),                                       bar: marketData.rsi/100,                                   color: rsiColor(marketData.rsi),                         sub: marketData.rsi>=70?"↑ Wykup.":marketData.rsi<30?"↓ Wyprz.":"neutral" },
                { label: "EMA-21 dist", value: fmtPct(marketData.priceVsEma),                                   bar: Math.min(1, Math.abs(marketData.priceVsEma)/3),        color: marketData.priceVsEma>=0?G:R,                     sub: marketData.priceVsEma>=0?"Powyżej EMA":"Poniżej EMA" },
                { label: "Momentum",    value: (marketData.momentum>=0?"+":"")+marketData.momentum.toFixed(2)+"%", bar: Math.min(1, Math.abs(marketData.momentum)/2),       color: marketData.momentum>=0?G:R,                       sub: "ostatnia świeca 1h" },
                { label: "Volatility",  value: marketData.volatility.toFixed(2)+"%",                             bar: Math.min(1, marketData.volatility/4),                  color: marketData.volatility>2?"#f59e0b":G,              sub: "zakres H-L" },
                { label: "Trend 24h",   value: fmtPct(ticker.change24h),                                        bar: Math.min(1, Math.abs(ticker.change24h)/5),             color: ticker.change24h>=0?G:R,                          sub: ticker.change24h>=0?"Wzrost":"Spadek" },
              ] as {label:string;value:string;bar:number;color:string;sub:string}[]).map(({ label, value, bar, color, sub }) => (
                <div key={label} style={{ background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: "10px 12px" }}>
                  <div style={{ fontSize: 9, color: M, letterSpacing: 0.8, marginBottom: 4 }}>{label.toUpperCase()}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color, marginBottom: 5 }}>{value}</div>
                  <div style={{ height: 3, background: "rgba(255,255,255,0.07)", borderRadius: 2, marginBottom: 4 }}>
                    <div style={{ width: `${bar*100}%`, height: "100%", background: color, borderRadius: 2, transition: "width 0.5s", opacity: 0.8 }} />
                  </div>
                  <div style={{ fontSize: 10, color: M }}>{sub}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Open position */}
        <div style={{ ...card, marginBottom: 14 }}>
          <div style={{ fontSize: 10, color: M, letterSpacing: 1, marginBottom: 10 }}>OTWARTA POZYCJA (PAPER)</div>
          {openTrade && ticker ? (() => {
            const rawPct = (ticker.price - openTrade.entryPrice) / openTrade.entryPrice * 100;
            const pct = openTrade.direction === "short" ? -rawPct : rawPct;
            const pnl = pct / 100 * openTrade.size;
            return (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                    <span style={{ fontWeight: 800, fontSize: 17 }}>{openTrade.symbol.replace("USDT","")}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, background: openTrade.direction==="short"?"rgba(248,113,113,0.15)":"rgba(74,222,128,0.15)", color: openTrade.direction==="short"?R:G, borderRadius: 6, padding: "2px 8px" }}>{openTrade.direction.toUpperCase()}</span>
                  </div>
                  <div style={{ fontSize: 12, color: M }}>Wejście: <span style={{ color: T }}>${fmt(openTrade.entryPrice)}</span> · Rozmiar: <span style={{ color: T }}>${openTrade.size.toFixed(0)}</span> · Od: <span style={{ color: T }}>{fmtTime(openTrade.entryTime)}</span></div>
                  <div style={{ fontSize: 11, color: M, marginTop: 4 }}>SL −{config.stopLoss}% · TP +{config.takeProfit}%</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 26, fontWeight: 900, color: pnl>=0?G:R }}>{fmtUsd(pnl)}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: pct>=0?G:R }}>{fmtPct(pct)}</div>
                  <div style={{ fontSize: 11, color: M, marginTop: 3 }}>Live PnL</div>
                </div>
              </div>
            );
          })() : (
            <div style={{ color: M, fontSize: 14 }}>
              {!config.enabled ? "Bot zatrzymany — kliknij AKTYWNY aby uruchomić" : sess.inSession ? "Sesja aktywna — skanowanie sygnałów RSI+EMA…" : "Brak pozycji — bot czeka na okno 21:00–23:00 UTC"}
            </div>
          )}
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 10, marginBottom: 14 }}>
          {([
            { label: "WIN RATE",    value: winRate!==null?`${winRate}%`:"—",       sub: `${wins}/${closed.length}`,                       color: winRate!==null?(winRate>=55?G:winRate>=40?"#f59e0b":R):M },
            { label: "TRANSAKCJE", value: String(closed.length),                  sub: openTrade?"+1 otwarta":"wszystkie zamknięte" },
            { label: "TOTAL PnL",  value: closed.length?fmtUsd(totalPnl):"—",     sub: closed.length?fmtPct(totalRet):"brak danych",      color: totalPnl>=0?G:R },
            { label: "NAJLEPSZY",  value: bestTrade!==null?fmtPct(bestTrade):"—",  sub: "pojedyncza transakcja",                           color: G },
            { label: "KAPITAŁ",    value: `$${config.capital.toLocaleString()}`,   sub: "paper USD" },
          ] as {label:string;value:string;sub?:string;color?:string}[]).map(({ label, value, sub, color }) => (
            <div key={label} style={{ ...card, textAlign: "center" as const }}>
              <div style={{ fontSize: 9, color: M, letterSpacing: 0.8, marginBottom: 5 }}>{label}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: color??T }}>{value}</div>
              {sub && <div style={{ fontSize: 10, color: M, marginTop: 4 }}>{sub}</div>}
            </div>
          ))}
        </div>

        {/* Settings */}
        <div style={{ ...card, marginBottom: 14 }}>
          <button onClick={() => setShowSettings(s => !s)} style={{ width: "100%", background: "none", border: "none", color: T, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", padding: 0, fontSize: 14, fontWeight: 700 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}><Settings size={14} /> Konfiguracja strategii</span>
            {showSettings ? <ChevronUp size={15} color={M} /> : <ChevronDown size={15} color={M} />}
          </button>
          {showSettings && (
            <div style={{ marginTop: 18 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 14, marginBottom: 16 }}>
                {([
                  { label: "Kapitał startowy ($)", tmp: tmpCapital, setTmp: setTmpCapital, key: "capital"   as const, min: 100,    max: 100_000 },
                  { label: "Ryzyko na transakcję (%)", tmp: tmpRisk, setTmp: setTmpRisk,   key: "riskPct"   as const, min: 1,      max: 50 },
                  { label: "Stop Loss (%)",          tmp: tmpSL,     setTmp: setTmpSL,     key: "stopLoss"  as const, min: 1,      max: 20 },
                  { label: "Take Profit (%)",        tmp: tmpTP,     setTmp: setTmpTP,     key: "takeProfit"as const, min: 2,      max: 100 },
                ] as const).map(({ label, tmp, setTmp, key, min, max }) => (
                  <div key={key}>
                    <div style={{ fontSize: 11, color: M, marginBottom: 6 }}>{label}</div>
                    <input type="number" value={tmp} min={min} max={max} onChange={e => setTmp(e.target.value)}
                      onBlur={() => { const n = parseFloat(tmp); if (!isNaN(n) && n>=min && n<=max) update({ [key]: n } as Partial<BotConfig>); }} style={inputStyle()} />
                  </div>
                ))}
              </div>
              <div style={{ background: "rgba(34,197,94,0.05)", border: "1px solid rgba(34,197,94,0.15)", borderRadius: 8, padding: "12px 14px", fontSize: 12, color: M, lineHeight: 1.7, marginBottom: 14 }}>
                <strong style={{ color: G }}>Strategia sesyjna RSI+EMA (21:00–23:00 UTC):</strong><br />
                LONG gdy: cena &gt; EMA-21 AND RSI ≥ 50<br />
                {config.allowShorts && <>SHORT gdy: cena &lt; EMA-21 AND RSI &lt; 50<br /></>}
                Wyjście: koniec sesji · SL {config.stopLoss}% · TP {config.takeProfit}%<br />
                Pozycja: {config.riskPct}% = <strong style={{ color: T }}>${(config.capital*config.riskPct/100).toFixed(0)}</strong> per trade
              </div>
              {closed.length > 0 && (
                <button onClick={() => { if (confirm("Wyczyścić historię?")) update({ trades: [], enabled: false }); }}
                  style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: "8px 18px", color: R, cursor: "pointer", fontSize: 13 }}>
                  Wyczyść historię
                </button>
              )}
            </div>
          )}
        </div>

        {/* Trade history */}
        <div style={card}>
          <div style={{ fontSize: 10, color: M, letterSpacing: 1, marginBottom: 14 }}>HISTORIA TRANSAKCJI ({closed.length})</div>
          {closed.length === 0 ? (
            <div style={{ color: M, fontSize: 14, lineHeight: 1.8 }}>
              Brak transakcji. Bot wchodzi gdy RSI+EMA potwierdzają kierunek podczas sesji 21–23 UTC.<br />
              <span style={{ fontSize: 12 }}>Włącz L+S aby bot grał też w dół gdy rynek spada.</span>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr>{["DATA","SYM","DIR","WEJŚCIE","WYJŚCIE","PnL ($)","PnL (%)","POWÓD"].map(h => (
                    <th key={h} style={{ textAlign: ["DATA","SYM","DIR","POWÓD"].includes(h)?"left":"right" as any, padding: "5px 8px", color: M, fontSize: 10, letterSpacing: 0.5, fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {[...closed].reverse().slice(0, 40).map(t => {
                    const pos = (t.pnl??0) >= 0;
                    return (
                      <tr key={t.id} style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                        <td style={{ padding: "9px 8px", color: M, whiteSpace: "nowrap" }}>{fmtDate(t.entryTime)} {fmtTime(t.entryTime)}</td>
                        <td style={{ padding: "9px 8px", fontWeight: 700 }}>{t.symbol.replace("USDT","")}</td>
                        <td style={{ padding: "9px 8px" }}><span style={{ fontSize: 10, fontWeight: 700, color: (t.direction??"long")==="short"?R:G, background: (t.direction??"long")==="short"?"rgba(248,113,113,0.1)":"rgba(74,222,128,0.1)", borderRadius: 4, padding: "2px 6px" }}>{(t.direction??"LONG").toUpperCase()}</span></td>
                        <td style={{ padding: "9px 8px", textAlign: "right" }}>${fmt(t.entryPrice)}</td>
                        <td style={{ padding: "9px 8px", textAlign: "right" }}>${fmt(t.exitPrice??0)}</td>
                        <td style={{ padding: "9px 8px", textAlign: "right", color: pos?G:R, fontWeight: 700 }}>{fmtUsd(t.pnl??0)}</td>
                        <td style={{ padding: "9px 8px", textAlign: "right", color: pos?G:R }}>{fmtPct(t.pnlPct??0)}</td>
                        <td style={{ padding: "9px 8px", color: M, fontSize: 11 }}>{REASON_LABEL[t.reason??"session_end"]}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Backtest */}
        <div style={{ ...card, marginTop: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: btResult ? 16 : 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <FlaskConical size={15} color={G} />
              <span style={{ fontWeight: 700, fontSize: 14 }}>Backtest strategii</span>
              <span style={{ fontSize: 11, color: M, background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 6, padding: "2px 8px" }}>~41 dni · RSI+EMA · {config.allowShorts?"L+S":"Long"}</span>
            </div>
            <button
              onClick={async () => { setBtLoading(true); setBtError(null); setBtResult(null); try { setBtResult(await runBacktest(config.symbol, config.stopLoss, config.takeProfit, config.allowShorts)); } catch(e:any) { setBtError(e.message); } finally { setBtLoading(false); } }}
              disabled={btLoading}
              style={{ background: btLoading?"rgba(34,197,94,0.05)":"rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.35)", borderRadius: 8, padding: "8px 18px", color: btLoading?M:G, cursor: btLoading?"default":"pointer", fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
              {btLoading ? <><RefreshCw size={13} style={{ animation: "spin 1s linear infinite" }} /> Pobieranie…</> : <><FlaskConical size={13} /> Uruchom</>}
            </button>
          </div>

          {!btResult && !btLoading && !btError && (
            <div style={{ fontSize: 13, color: M, lineHeight: 1.7 }}>
              Symuluje strategię na ~1000 świecach 1h z Binance. Filtr RSI+EMA — wchodzi LONG lub SHORT tylko gdy oba wskaźniki potwierdzają kierunek.
            </div>
          )}
          {btError && <div style={{ color: R, fontSize: 13, marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}><AlertCircle size={14}/> {btError}</div>}

          {btResult && (() => {
            const r = btResult;
            const eqMin = Math.min(0, ...r.equity), eqMax = Math.max(0.01, ...r.equity), range = eqMax - eqMin;
            return (
              <div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 14 }}>
                  {([
                    { label: "Win Rate",     value: `${r.winRate.toFixed(0)}%`,                                        color: r.winRate>=55?G:r.winRate>=45?"#f59e0b":R,           sub: `${r.trades.filter(t=>t.pnlPct>0).length}W / ${r.trades.filter(t=>t.pnlPct<=0).length}L` },
                    { label: "Łączny zwrot", value: (r.totalReturn>=0?"+":"")+r.totalReturn.toFixed(1)+"%",            color: r.totalReturn>=0?G:R,                                sub: `${r.trades.length} transakcji / ${r.days} dni` },
                    { label: "Max Drawdown", value: `-${r.maxDrawdown.toFixed(1)}%`,                                   color: r.maxDrawdown>15?R:r.maxDrawdown>8?"#f59e0b":G,      sub: "max obsunięcie" },
                    { label: "Śr. zysk",     value: `+${r.avgWin.toFixed(2)}%`,                                        color: G,                                                   sub: "na wygranej" },
                    { label: "Śr. strata",   value: `${r.avgLoss.toFixed(2)}%`,                                        color: R,                                                   sub: "na przegranej" },
                    { label: "Sharpe",       value: r.sharpe.toFixed(2),                                               color: r.sharpe>=1.5?G:r.sharpe>=0.8?"#f59e0b":R,          sub: r.sharpe>=1.5?"dobry":r.sharpe>=0.8?"akceptowalny":"słaby" },
                  ] as {label:string;value:string;color:string;sub:string}[]).map(({ label, value, color, sub }) => (
                    <div key={label} style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: "12px 14px", textAlign: "center" as const }}>
                      <div style={{ fontSize: 10, color: M, letterSpacing: 0.8, marginBottom: 4 }}>{label.toUpperCase()}</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color }}>{value}</div>
                      <div style={{ fontSize: 10, color: M, marginTop: 3 }}>{sub}</div>
                    </div>
                  ))}
                </div>

                {/* Long/Short breakdown */}
                <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
                  <div style={{ flex: 1, background: "rgba(74,222,128,0.06)", border: "1px solid rgba(74,222,128,0.15)", borderRadius: 8, padding: "10px 14px", textAlign: "center" as const }}>
                    <div style={{ fontSize: 10, color: M, marginBottom: 3 }}>LONG TRADES</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: G }}>{r.longs}</div>
                  </div>
                  <div style={{ flex: 1, background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.15)", borderRadius: 8, padding: "10px 14px", textAlign: "center" as const }}>
                    <div style={{ fontSize: 10, color: M, marginBottom: 3 }}>SHORT TRADES</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: r.shorts>0?"#fca5a5":M }}>{r.shorts}</div>
                  </div>
                  <div style={{ flex: 2, background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: "10px 14px" }}>
                    <div style={{ fontSize: 10, color: M, marginBottom: 6 }}>PODZIAŁ L/S</div>
                    <div style={{ height: 8, background: "rgba(255,255,255,0.07)", borderRadius: 4, overflow: "hidden" }}>
                      <div style={{ width: `${r.trades.length?r.longs/r.trades.length*100:0}%`, height: "100%", background: G, borderRadius: 4 }} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: M, marginTop: 4 }}>
                      <span style={{ color: G }}>{r.trades.length?Math.round(r.longs/r.trades.length*100):0}% Long</span>
                      <span style={{ color: "#fca5a5" }}>{r.trades.length?Math.round(r.shorts/r.trades.length*100):0}% Short</span>
                    </div>
                  </div>
                </div>

                {/* Equity curve */}
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 10, color: M, letterSpacing: 0.8, marginBottom: 8 }}>KRZYWA KAPITAŁU</div>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 60, background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: "8px 10px" }}>
                    {r.equity.map((eq, i) => {
                      const h = range>0?Math.max(2,Math.abs(eq-eqMin)/range*44):2;
                      return <div key={i} title={`${eq>=0?"+":""}${eq.toFixed(1)}%`} style={{ flex:1, height:h, background:eq>=0?G:R, borderRadius:2, opacity:0.8, minWidth:2 }} />;
                    })}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: M, marginTop: 4 }}>
                    <span>{r.trades[0]?.date}</span>
                    <span style={{ color: r.totalReturn>=0?G:R, fontWeight: 700 }}>{r.totalReturn>=0?"+":""}{r.totalReturn.toFixed(1)}% końcowy</span>
                    <span>{r.trades[r.trades.length-1]?.date}</span>
                  </div>
                </div>

                <div style={{ background: r.winRate>=55&&r.totalReturn>0?"rgba(34,197,94,0.08)":r.winRate>=45?"rgba(245,158,11,0.08)":"rgba(248,113,113,0.08)", border: `1px solid ${r.winRate>=55&&r.totalReturn>0?"rgba(34,197,94,0.25)":r.winRate>=45?"rgba(245,158,11,0.25)":"rgba(248,113,113,0.25)"}`, borderRadius: 10, padding: "12px 14px", marginBottom: 12, fontSize: 13 }}>
                  <strong style={{ color: r.winRate>=55&&r.totalReturn>0?G:r.winRate>=45?"#f59e0b":R }}>
                    {r.winRate>=55&&r.totalReturn>0?"✅ Strategia byłaby zyskowna":r.winRate>=45?"⚠️ Wyniki mieszane":"❌ Strategia byłaby nierentowna"}
                  </strong>
                  {" "}w tym okresie. Win rate {r.winRate.toFixed(0)}% przy {r.trades.length} transakcjach ({r.longs}L / {r.shorts}S). Wyniki historyczne nie gwarantują przyszłych.
                </div>

                <button onClick={() => setShowBtTrades(s=>!s)} style={{ background: "none", border: "none", color: M, cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", gap: 5, padding: 0, marginBottom: showBtTrades?10:0 }}>
                  {showBtTrades?<ChevronUp size={13}/>:<ChevronDown size={13}/>} {showBtTrades?"Ukryj":"Pokaż"} {r.trades.length} transakcji
                </button>

                {showBtTrades && (
                  <div style={{ overflowX: "auto", maxHeight: 300, overflowY: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead style={{ position: "sticky", top: 0, background: "#001a0a" }}>
                        <tr>{["DATA","DIR","WEJŚCIE","WYJŚCIE","WYNIK","POWÓD"].map(h => (
                          <th key={h} style={{ padding: "5px 8px", color: M, fontSize: 10, textAlign: ["DATA","DIR","POWÓD"].includes(h)?"left" as const:"right" as const, whiteSpace: "nowrap" as const }}>{h}</th>
                        ))}</tr>
                      </thead>
                      <tbody>
                        {r.trades.map((t, i) => (
                          <tr key={i} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                            <td style={{ padding: "6px 8px", color: M }}>{t.date}</td>
                            <td style={{ padding: "6px 8px" }}><span style={{ fontSize: 10, fontWeight: 700, color: t.direction==="short"?R:G }}>{t.direction.toUpperCase()}</span></td>
                            <td style={{ padding: "6px 8px", textAlign: "right" as const }}>${fmt(t.entryPrice)}</td>
                            <td style={{ padding: "6px 8px", textAlign: "right" as const }}>${fmt(t.exitPrice)}</td>
                            <td style={{ padding: "6px 8px", textAlign: "right" as const, color: t.pnlPct>0?G:R, fontWeight: 700 }}>{t.pnlPct>=0?"+":""}{t.pnlPct.toFixed(2)}%</td>
                            <td style={{ padding: "6px 8px", color: M, fontSize: 11 }}>{t.reason==="take_profit"?<span style={{color:G}}>TP ✓</span>:t.reason==="stop_loss"?<span style={{color:R}}>SL ✗</span>:"sesja"}</td>
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
        <div style={{ ...card, marginTop: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: activityLog.length>0?12:0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Radio size={13} color={config.enabled&&sess.inSession?G:M} />
              <span style={{ fontWeight: 700, fontSize: 14 }}>Activity Log</span>
              {config.autoMode && <span style={{ fontSize: 10, background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 6, padding: "2px 7px", color: "#fbbf24" }}>AUTO</span>}
              {config.enabled && sess.inSession && (
                <span style={{ fontSize: 10, background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: 6, padding: "2px 7px", color: G, display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: G, animation: "pulse 1.5s ease-in-out infinite", display: "inline-block" }} /> LIVE
                </span>
              )}
            </div>
            {activityLog.length>0 && <button onClick={() => setActivityLog([])} style={{ background: "none", border: "none", color: M, cursor: "pointer", fontSize: 11 }}>Wyczyść</button>}
          </div>
          {activityLog.length===0 ? (
            <div style={{ fontSize: 12, color: M, lineHeight: 1.7 }}>
              Log decyzji bota pojawi się tutaj — każdy skan rynku, sygnał Long/Short, wejście i wyjście.<br />
              <span style={{ color: "#fbbf24", fontSize: 11 }}>AUTO MODE</span><span style={{ fontSize: 11 }}> uruchamia bota automatycznie o 21:00 UTC i zatrzymuje o 23:00 UTC.</span>
            </div>
          ) : (
            <div ref={logRef} style={{ maxHeight: 260, overflowY: "auto", fontFamily: "monospace", fontSize: 12, lineHeight: 1.7 }}>
              {activityLog.map((entry, i) => (
                <div key={i} style={{ display: "flex", gap: 12, padding: "3px 0", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                  <span style={{ color: "rgba(255,255,255,0.25)", flexShrink: 0, minWidth: 72, fontSize: 11 }}>{entry.time}</span>
                  <span style={{ color: entry.type==="buy"?G:entry.type==="sell"?"#86efac":entry.type==="warn"?"#f59e0b":"rgba(255,255,255,0.55)" }}>{entry.msg}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}} @keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.5;transform:scale(0.85)}}`}</style>
        <div style={{ marginTop: 18, fontSize: 11, color: "rgba(255,255,255,0.2)", textAlign: "center" }}>
          Paper trading — wyłącznie symulacja edukacyjna. Nie jest to porada inwestycyjna. Krypto = wysokie ryzyko.
        </div>
      </div>
    </ResellLayout>
  );
}
