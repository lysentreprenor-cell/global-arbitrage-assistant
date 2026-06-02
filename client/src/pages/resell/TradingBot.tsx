import { useState, useEffect, useCallback } from "react";
import {
  Bot, TrendingUp, TrendingDown, Clock, RefreshCw, Settings,
  ChevronDown, ChevronUp, Play, Pause, AlertCircle, Activity,
} from "lucide-react";
import { ResellLayout } from "@/components/resell/ResellLayout";

// ─── Types ───────────────────────────────────────────────────────────────────

type Symbol = "BTCUSDT" | "ETHUSDT" | "SOLUSDT";
type TradeReason = "session_end" | "stop_loss" | "take_profit";

type PaperTrade = {
  id: number;
  symbol: Symbol;
  entryTime: string;
  entryPrice: number;
  size: number;
  status: "open" | "closed";
  exitTime?: string;
  exitPrice?: number;
  pnl?: number;
  pnlPct?: number;
  reason?: TradeReason;
};

type BotConfig = {
  enabled: boolean;
  symbol: Symbol;
  capital: number;
  riskPct: number;
  stopLoss: number;
  takeProfit: number;
  trades: PaperTrade[];
};

type Ticker = {
  price: number;
  change24h: number;
  high24h: number;
  low24h: number;
};

type SessionInfo = {
  inSession: boolean;
  label: string;
  countdown: string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function calcEMA21(closes: number[]): number {
  if (!closes.length) return 0;
  const period = 21;
  if (closes.length < period) return closes[closes.length - 1];
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < closes.length; i++) ema = closes[i] * k + ema * (1 - k);
  return ema;
}

function getSessionInfo(now: Date): SessionInfo {
  const h = now.getUTCHours();
  const m = now.getUTCMinutes();
  const s = now.getUTCSeconds();
  const inSession = h === 21 || h === 22;

  if (inSession) {
    const secsLeft = (23 - h) * 3600 - m * 60 - s;
    const hL = Math.floor(secsLeft / 3600);
    const mL = Math.floor((secsLeft % 3600) / 60);
    const sL = secsLeft % 60;
    return {
      inSession: true,
      label: "SESJA AKTYWNA",
      countdown: `Koniec za ${hL > 0 ? hL + "h " : ""}${mL}m ${sL}s`,
    };
  }

  const nowSecs = h * 3600 + m * 60 + s;
  const startSecs = 21 * 3600;
  let toStart = startSecs - nowSecs;
  if (toStart < 0) toStart += 86400;
  const hT = Math.floor(toStart / 3600);
  const mT = Math.floor((toStart % 3600) / 60);
  return {
    inSession: false,
    label: "POZA SESJĄ",
    countdown: `Start za ${hT}h ${mT}m`,
  };
}

function fmt(p: number): string {
  if (p >= 1000) return p.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (p >= 1) return p.toFixed(2);
  return p.toFixed(4);
}

function fmtPct(p: number): string {
  return (p >= 0 ? "+" : "") + p.toFixed(2) + "%";
}

function fmtUsd(p: number): string {
  return (p >= 0 ? "+" : "-") + "$" + Math.abs(p).toFixed(2);
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pl", { day: "2-digit", month: "2-digit" });
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("pl", { hour: "2-digit", minute: "2-digit" });
}

// ─── localStorage ─────────────────────────────────────────────────────────────

const KEY = "resell_trading_bot_v1";

function loadConfig(): BotConfig {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as BotConfig;
  } catch {}
  return { enabled: false, symbol: "BTCUSDT", capital: 1000, riskPct: 10, stopLoss: 4, takeProfit: 15, trades: [] };
}

function saveConfig(c: BotConfig) {
  localStorage.setItem(KEY, JSON.stringify(c));
}

// ─── Reason labels ────────────────────────────────────────────────────────────

const REASON_LABEL: Record<TradeReason, string> = {
  session_end: "Koniec sesji",
  stop_loss: "Stop Loss",
  take_profit: "Take Profit",
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function TradingBot() {
  const [config, setConfig] = useState<BotConfig>(loadConfig);
  const [ticker, setTicker] = useState<Ticker | null>(null);
  const [ema21, setEma21] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(new Date());
  const [showSettings, setShowSettings] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [tmpCapital, setTmpCapital] = useState(String(config.capital));
  const [tmpRisk, setTmpRisk] = useState(String(config.riskPct));
  const [tmpSL, setTmpSL] = useState(String(config.stopLoss));
  const [tmpTP, setTmpTP] = useState(String(config.takeProfit));

  const update = useCallback((patch: Partial<BotConfig>) => {
    setConfig(prev => {
      const next = { ...prev, ...patch };
      saveConfig(next);
      return next;
    });
  }, []);

  const fetchData = useCallback(async () => {
    // Fetch directly from Binance (public API, CORS enabled)
    const BINANCE = "https://api.binance.com/api/v3";
    try {
      const [tRes, kRes] = await Promise.all([
        fetch(`${BINANCE}/ticker/24hr?symbol=${config.symbol}`),
        fetch(`${BINANCE}/klines?symbol=${config.symbol}&interval=1h&limit=50`),
      ]);
      if (!tRes.ok || !kRes.ok) throw new Error(`Binance API error ${tRes.status}`);
      const td = await tRes.json();
      const klines: any[] = await kRes.json();
      setTicker({
        price: parseFloat(td.lastPrice),
        change24h: parseFloat(td.priceChangePercent),
        high24h: parseFloat(td.highPrice),
        low24h: parseFloat(td.lowPrice),
      });
      // klines: [openTime, open, high, low, close, volume, ...]
      setEma21(calcEMA21(klines.map(k => parseFloat(k[4]))));
      setLastRefresh(new Date());
      setError(null);
    } catch (e: any) {
      setError("Błąd pobierania danych rynkowych: " + e.message);
    } finally {
      setLoading(false);
    }
  }, [config.symbol]);

  const runEngine = useCallback(() => {
    if (!ticker || !ema21 || !config.enabled) return;
    const sess = getSessionInfo(new Date());
    const aboveEMA = ticker.price > ema21;
    const openTrade = config.trades.find(t => t.status === "open");

    // Entry
    if (sess.inSession && aboveEMA && !openTrade) {
      const size = config.capital * (config.riskPct / 100);
      const newTrade: PaperTrade = {
        id: Date.now(), symbol: config.symbol, entryTime: new Date().toISOString(),
        entryPrice: ticker.price, size, status: "open",
      };
      update({ trades: [...config.trades, newTrade] });
      return;
    }

    // Exit
    if (openTrade) {
      const pct = ((ticker.price - openTrade.entryPrice) / openTrade.entryPrice) * 100;
      let reason: TradeReason | null = null;
      if (!sess.inSession) reason = "session_end";
      else if (pct <= -config.stopLoss) reason = "stop_loss";
      else if (pct >= config.takeProfit) reason = "take_profit";
      if (reason) {
        const pnl = (ticker.price - openTrade.entryPrice) * (openTrade.size / openTrade.entryPrice);
        update({
          trades: config.trades.map(t => t.id === openTrade.id
            ? { ...t, status: "closed", exitTime: new Date().toISOString(), exitPrice: ticker.price, pnl, pnlPct: pct, reason }
            : t),
        });
      }
    }
  }, [ticker, ema21, config, update]);

  useEffect(() => { fetchData(); const id = setInterval(fetchData, 30_000); return () => clearInterval(id); }, [fetchData]);
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);
  useEffect(() => { runEngine(); }, [ticker, ema21]); // eslint-disable-line

  // ─── Derived stats ─────────────────────────────────────────────────────────

  const openTrade = config.trades.find(t => t.status === "open");
  const closed = config.trades.filter(t => t.status === "closed");
  const wins = closed.filter(t => (t.pnl ?? 0) > 0).length;
  const winRate = closed.length ? Math.round((wins / closed.length) * 100) : null;
  const totalPnl = closed.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const totalReturn = (totalPnl / config.capital) * 100;
  const bestTrade = closed.length ? Math.max(...closed.map(t => t.pnlPct ?? 0)) : null;
  const sess = getSessionInfo(now);

  // ─── Styles ────────────────────────────────────────────────────────────────

  const G = "#4ade80";
  const R = "#f87171";
  const M = "rgba(255,255,255,0.4)";
  const T = "rgba(255,255,255,0.88)";
  const card = { background: "rgba(0,28,14,0.7)", border: "1px solid rgba(34,197,94,0.13)", borderRadius: 12, padding: "16px 18px" } as const;

  function inputStyle(): React.CSSProperties {
    return { width: "100%", background: "rgba(0,0,0,0.35)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 8, padding: "8px 12px", color: T, fontSize: 14, boxSizing: "border-box" as const, outline: "none" };
  }

  // ─── Render ────────────────────────────────────────────────────────────────

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
              <div style={{ fontSize: 12, color: M }}>📄 Paper mode — symulacja bez realnych pieniędzy</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {lastRefresh && <span style={{ fontSize: 11, color: M }}>Dane: {fmtTime(lastRefresh.toISOString())}</span>}
            <button onClick={fetchData} style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: 8, padding: "6px 14px", color: G, cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}>
              <RefreshCw size={12} /> Odśwież
            </button>
          </div>
        </div>

        {/* Asset selector + Enable toggle */}
        <div style={{ ...card, display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ display: "flex", gap: 8 }}>
            {(["BTCUSDT", "ETHUSDT", "SOLUSDT"] as const).map(sym => {
              const active = config.symbol === sym;
              return (
                <button key={sym} onClick={() => update({ symbol: sym })} style={{ background: active ? "rgba(34,197,94,0.18)" : "transparent", border: `1px solid ${active ? "rgba(34,197,94,0.45)" : "rgba(255,255,255,0.1)"}`, borderRadius: 8, padding: "8px 18px", color: active ? G : M, cursor: "pointer", fontWeight: active ? 700 : 500, fontSize: 14, transition: "all 0.15s" }}>
                  {sym.replace("USDT", "")}
                </button>
              );
            })}
          </div>
          <button onClick={() => update({ enabled: !config.enabled })} style={{ display: "flex", alignItems: "center", gap: 8, background: config.enabled ? "rgba(34,197,94,0.18)" : "rgba(255,255,255,0.04)", border: `1px solid ${config.enabled ? "rgba(34,197,94,0.4)" : "rgba(255,255,255,0.12)"}`, borderRadius: 8, padding: "9px 20px", color: config.enabled ? G : M, cursor: "pointer", fontWeight: 700, fontSize: 14, transition: "all 0.15s" }}>
            {config.enabled ? <><Play size={14} /> BOT AKTYWNY</> : <><Pause size={14} /> BOT ZATRZYMANY</>}
          </button>
        </div>

        {/* Error banner */}
        {error && (
          <div style={{ ...card, border: "1px solid rgba(248,113,113,0.3)", background: "rgba(248,113,113,0.06)", color: R, marginBottom: 14, display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
            <AlertCircle size={15} /> {error}
          </div>
        )}

        {/* 3 info cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 14 }}>

          {/* Price */}
          <div style={card}>
            <div style={{ fontSize: 10, color: M, letterSpacing: 1, marginBottom: 8 }}>CENA RYNKOWA</div>
            {loading ? <div style={{ color: M, fontSize: 14 }}>Ładowanie…</div> : ticker ? (
              <>
                <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>${fmt(ticker.price)}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: ticker.change24h >= 0 ? G : R }}>{fmtPct(ticker.change24h)} 24h</div>
                <div style={{ fontSize: 11, color: M, marginTop: 6 }}>H ${fmt(ticker.high24h)} · L ${fmt(ticker.low24h)}</div>
              </>
            ) : <div style={{ color: M }}>—</div>}
          </div>

          {/* Session */}
          <div style={{ ...card, background: sess.inSession ? "rgba(34,197,94,0.07)" : "rgba(0,28,14,0.7)", border: `1px solid ${sess.inSession ? "rgba(34,197,94,0.35)" : "rgba(34,197,94,0.13)"}` }}>
            <div style={{ fontSize: 10, color: M, letterSpacing: 1, marginBottom: 8 }}>OKNO SESJI (21:00–23:00 UTC)</div>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
              <div style={{ width: 9, height: 9, borderRadius: "50%", background: sess.inSession ? G : "#4b5563", flexShrink: 0 }} />
              <span style={{ fontWeight: 700, fontSize: 13, color: sess.inSession ? G : M }}>{sess.label}</span>
            </div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{sess.countdown}</div>
            <div style={{ fontSize: 11, color: M, marginTop: 6, display: "flex", alignItems: "center", gap: 5 }}>
              <Clock size={10} /> UTC {now.toUTCString().split(" ")[4]}
            </div>
          </div>

          {/* Signal */}
          <div style={card}>
            <div style={{ fontSize: 10, color: M, letterSpacing: 1, marginBottom: 8 }}>SYGNAŁ STRATEGII</div>
            {ema21 && ticker ? (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  {ticker.price > ema21
                    ? <><TrendingUp size={18} color={G} /><span style={{ fontWeight: 800, fontSize: 18, color: G }}>LONG</span></>
                    : <><TrendingDown size={18} color={R} /><span style={{ fontWeight: 800, fontSize: 18, color: R }}>OCZEKUJ</span></>}
                </div>
                <div style={{ fontSize: 12, color: M }}>EMA-21: <span style={{ color: T }}>${fmt(ema21)}</span></div>
                <div style={{ fontSize: 12, color: M, marginTop: 3 }}>
                  Cena {ticker.price > ema21 ? <span style={{ color: G }}>powyżej</span> : <span style={{ color: R }}>poniżej</span>} EMA-21
                </div>
                <div style={{ fontSize: 11, marginTop: 7, fontWeight: 600, color: sess.inSession && ticker.price > ema21 ? G : M }}>
                  {sess.inSession && ticker.price > ema21 ? "✓ Warunki wejścia spełnione" : !sess.inSession ? "Poza oknem sesji" : "⚠ Trend spadkowy — brak sygnału"}
                </div>
              </>
            ) : <div style={{ color: M, fontSize: 14 }}>Ładowanie…</div>}
          </div>
        </div>

        {/* Open position */}
        <div style={{ ...card, marginBottom: 14 }}>
          <div style={{ fontSize: 10, color: M, letterSpacing: 1, marginBottom: 10 }}>OTWARTA POZYCJA (PAPER)</div>
          {openTrade && ticker ? (() => {
            const pct = ((ticker.price - openTrade.entryPrice) / openTrade.entryPrice) * 100;
            const pnl = (ticker.price - openTrade.entryPrice) * (openTrade.size / openTrade.entryPrice);
            return (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 5 }}>{openTrade.symbol.replace("USDT", "")} LONG</div>
                  <div style={{ fontSize: 12, color: M }}>
                    Wejście: <span style={{ color: T }}>${fmt(openTrade.entryPrice)}</span>
                    {" · "}Wielkość: <span style={{ color: T }}>${openTrade.size.toFixed(0)}</span>
                    {" · "}Od: <span style={{ color: T }}>{fmtTime(openTrade.entryTime)}</span>
                  </div>
                  <div style={{ fontSize: 11, color: M, marginTop: 4 }}>SL −{config.stopLoss}% · TP +{config.takeProfit}%</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 26, fontWeight: 900, color: pnl >= 0 ? G : R }}>{fmtUsd(pnl)}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: pct >= 0 ? G : R }}>{fmtPct(pct)}</div>
                  <div style={{ fontSize: 11, color: M, marginTop: 3 }}>Live PnL</div>
                </div>
              </div>
            );
          })() : (
            <div style={{ color: M, fontSize: 14 }}>
              {!config.enabled ? "Bot zatrzymany — kliknij AKTYWNY, aby uruchomić"
                : sess.inSession && ticker && ema21 && ticker.price <= ema21 ? "Sesja aktywna, ale trend spadkowy — bot oczekuje"
                : sess.inSession ? "Sesja aktywna — analizuję rynek…"
                : "Brak pozycji — bot czeka na okno 21:00–23:00 UTC"}
            </div>
          )}
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 10, marginBottom: 14 }}>
          {([
            { label: "WIN RATE", value: winRate !== null ? `${winRate}%` : "—", sub: `${wins}/${closed.length}`, color: winRate !== null ? (winRate >= 55 ? G : winRate >= 40 ? "#f59e0b" : R) : M },
            { label: "TRANSAKCJE", value: String(closed.length), sub: openTrade ? "+1 otwarta" : "wszystkie zamknięte" },
            { label: "TOTAL PnL", value: closed.length ? fmtUsd(totalPnl) : "—", sub: closed.length ? fmtPct(totalReturn) : "brak danych", color: totalPnl >= 0 ? G : R },
            { label: "NAJLEPSZY", value: bestTrade !== null ? fmtPct(bestTrade) : "—", color: G },
            { label: "KAPITAŁ", value: `$${config.capital.toLocaleString()}`, sub: "paper USD" },
          ] as { label: string; value: string; sub?: string; color?: string }[]).map(({ label, value, sub, color }) => (
            <div key={label} style={{ ...card, textAlign: "center" as const }}>
              <div style={{ fontSize: 9, color: M, letterSpacing: 0.8, marginBottom: 5 }}>{label}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: color ?? T }}>{value}</div>
              {sub && <div style={{ fontSize: 10, color: M, marginTop: 4 }}>{sub}</div>}
            </div>
          ))}
        </div>

        {/* Settings accordion */}
        <div style={{ ...card, marginBottom: 14 }}>
          <button onClick={() => setShowSettings(s => !s)} style={{ width: "100%", background: "none", border: "none", color: T, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", padding: 0, fontSize: 14, fontWeight: 700 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}><Settings size={14} /> Konfiguracja strategii</span>
            {showSettings ? <ChevronUp size={15} color={M} /> : <ChevronDown size={15} color={M} />}
          </button>

          {showSettings && (
            <div style={{ marginTop: 18 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 14, marginBottom: 16 }}>
                {([
                  { label: "Kapitał startowy ($)", tmp: tmpCapital, setTmp: setTmpCapital, key: "capital" as const, min: 100, max: 100_000 },
                  { label: "Ryzyko na transakcję (%)", tmp: tmpRisk, setTmp: setTmpRisk, key: "riskPct" as const, min: 1, max: 50 },
                  { label: "Stop Loss (%)", tmp: tmpSL, setTmp: setTmpSL, key: "stopLoss" as const, min: 1, max: 20 },
                  { label: "Take Profit (%)", tmp: tmpTP, setTmp: setTmpTP, key: "takeProfit" as const, min: 2, max: 100 },
                ] as const).map(({ label, tmp, setTmp, key, min, max }) => (
                  <div key={key}>
                    <div style={{ fontSize: 11, color: M, marginBottom: 6 }}>{label}</div>
                    <input
                      type="number" value={tmp} min={min} max={max}
                      onChange={e => setTmp(e.target.value)}
                      onBlur={() => {
                        const n = parseFloat(tmp);
                        if (!isNaN(n) && n >= min && n <= max) update({ [key]: n } as Partial<BotConfig>);
                      }}
                      style={inputStyle()}
                    />
                  </div>
                ))}
              </div>

              <div style={{ background: "rgba(34,197,94,0.05)", border: "1px solid rgba(34,197,94,0.15)", borderRadius: 8, padding: "12px 14px", fontSize: 12, color: M, lineHeight: 1.7, marginBottom: 14 }}>
                <strong style={{ color: G }}>Strategia sesyjna (21:00–23:00 UTC):</strong><br />
                1. Czeka na okno sesji nocnej (najwyższy drift wg badań naukowych)<br />
                2. Wchodzi LONG gdy cena &gt; EMA-21 (potwierdzenie trendu)<br />
                3. Wychodzi przy: końcu sesji · SL {config.stopLoss}% · TP {config.takeProfit}%<br />
                Wielkość pozycji: {config.riskPct}% kapitału = <strong style={{ color: T }}>${(config.capital * config.riskPct / 100).toFixed(0)}</strong> per transakcja
              </div>

              {closed.length > 0 && (
                <button
                  onClick={() => { if (confirm("Wyczyścić całą historię transakcji?")) update({ trades: [], enabled: false }); }}
                  style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: "8px 18px", color: R, cursor: "pointer", fontSize: 13 }}
                >
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
              Brak zamkniętych transakcji.<br />
              <span style={{ fontSize: 12 }}>Bot automatycznie wchodzi podczas sesji 21:00–23:00 UTC gdy cena &gt; EMA-21. Dane odświeżają się co 30 sekund.</span>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr>
                    {["DATA", "SYMBOL", "WEJŚCIE", "WYJŚCIE", "PnL ($)", "PnL (%)", "POWÓD"].map(h => (
                      <th key={h} style={{ textAlign: h === "DATA" || h === "SYMBOL" || h === "POWÓD" ? "left" : "right" as any, padding: "5px 8px", color: M, fontSize: 10, letterSpacing: 0.5, fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...closed].reverse().slice(0, 40).map(t => {
                    const pos = (t.pnl ?? 0) >= 0;
                    return (
                      <tr key={t.id} style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                        <td style={{ padding: "9px 8px", color: M, whiteSpace: "nowrap" }}>{fmtDate(t.entryTime)} {fmtTime(t.entryTime)}</td>
                        <td style={{ padding: "9px 8px", fontWeight: 700 }}>{t.symbol.replace("USDT", "")}</td>
                        <td style={{ padding: "9px 8px", textAlign: "right" }}>${fmt(t.entryPrice)}</td>
                        <td style={{ padding: "9px 8px", textAlign: "right" }}>${fmt(t.exitPrice ?? 0)}</td>
                        <td style={{ padding: "9px 8px", textAlign: "right", color: pos ? G : R, fontWeight: 700 }}>{fmtUsd(t.pnl ?? 0)}</td>
                        <td style={{ padding: "9px 8px", textAlign: "right", color: pos ? G : R }}>{fmtPct(t.pnlPct ?? 0)}</td>
                        <td style={{ padding: "9px 8px", color: M, fontSize: 11 }}>{REASON_LABEL[t.reason ?? "session_end"]}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div style={{ marginTop: 18, fontSize: 11, color: "rgba(255,255,255,0.2)", textAlign: "center" }}>
          Paper trading — wyłącznie symulacja edukacyjna. Nie jest to porada inwestycyjna. Krypto = wysokie ryzyko.
        </div>
      </div>
    </ResellLayout>
  );
}
