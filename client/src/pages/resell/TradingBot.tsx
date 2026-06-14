import { useState, useEffect, useRef, useCallback } from "react";
import { Activity, Radio, FlaskConical, Zap } from "lucide-react";
import { ResellLayout } from "@/components/resell/ResellLayout";
import { hasKrakenKeys, getKrakenKeys } from "@/lib/apiKeys";

// ── Types ─────────────────────────────────────────────────────────────────────

type Symbol   = "BTCUSDT" | "ETHUSDT" | "SOLUSDT";
type RiskLevel = "cautious" | "normal" | "aggressive" | "superaggressive";
type Direction = "long" | "short";

type Preset = {
  id: RiskLevel; label: string; icon: string; desc: string; freq: string;
  rsiMin: number; rsiMax: number; adxMin: number;
  confluenceMin: number; volMultMin: number; cooldownMin: number;
  stopLoss: number; takeProfit: number; trailPct: number;
};

type BotStatus = {
  running: boolean;
  sessionPnl: number;
  position: {
    direction: Direction; entryPrice: number; qty: number;
    entryTime: string; slPct: number; tpPct: number;
  } | null;
  logs: { time: string; msg: string; type: string }[];
  dipStats?: {
    fourHourTrend: string; rangeMode: boolean;
    prevRsi: number; marketRegime: string; crashActive: boolean;
  };
  sessionStats?: {
    wins: number; losses: number; winRate: number;
    avgWin: number; avgLoss: number; maxDrawdown: number;
    tradeHistory: TradeRecord[];
  };
};

type TradeRecord = {
  dir: Direction; entry: number; exit: number;
  pnlUsdt?: number; pnlPct: number; reason: string;
  signal?: string; time: string; durationH?: number;
};

type SimResult = {
  days: number; symbol: string; numTrades: number;
  winRate: number; totalReturn: number; maxDrawdown: number;
  avgWin: number; avgLoss: number; finalEquity: number;
  trades: TradeRecord[];
};

type OptResult = {
  rsiMin: number; rsiMax: number; trailPct: number; stopLoss: number; takeProfit: number;
  trainWinRate: number; trainReturn: number; trainSharpe: number; trainTrades: number;
  validWinRate: number; validReturn: number; validSharpe: number; validTrades: number;
  confidence: number; days: number; combosTested: number;
  // legacy fields for compatibility
  winRate?: number; totalReturn?: number; sharpe?: number; numTrades?: number;
};

type TrainEntry = {
  ts: string; rsiMin: number; rsiMax: number; trailPct: number;
  stopLoss: number; takeProfit: number;
  trainWinRate: number; validWinRate: number; confidence: number; applied: boolean;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const PRESETS: Preset[] = [
  { id: "cautious",        label: "Ostrożny",       icon: "🐢", desc: "Mało transakcji, wysoka pewność",          freq: "1–3 / tydzień",
    rsiMin: 33, rsiMax: 70, adxMin: 22, confluenceMin: 3, volMultMin: 1.5, cooldownMin: 720, stopLoss: 1.50, takeProfit: 3.50, trailPct: 0.60 },
  { id: "normal",          label: "Normalny",        icon: "⚖️", desc: "Balans między ilością a jakością",         freq: "3–7 / tydzień",
    rsiMin: 36, rsiMax: 67, adxMin: 16, confluenceMin: 2, volMultMin: 1.2, cooldownMin: 120, stopLoss: 1.20, takeProfit: 2.50, trailPct: 0.45 },
  { id: "aggressive",      label: "Agresywny",       icon: "🚀", desc: "Dużo transakcji, wyższe ryzyko",          freq: "5–15 / dzień",
    rsiMin: 40, rsiMax: 65, adxMin: 12, confluenceMin: 1, volMultMin: 1.0, cooldownMin: 30,  stopLoss: 1.00, takeProfit: 2.00, trailPct: 0.35 },
  { id: "superaggressive", label: "Super Agresywny", icon: "⚡", desc: "Częstsze wejścia, min. TP po opłatach",  freq: "10–25 / tydzień",
    rsiMin: 38, rsiMax: 65, adxMin: 8,  confluenceMin: 1, volMultMin: 1.0, cooldownMin: 15,  stopLoss: 0.80, takeProfit: 1.60, trailPct: 0.25 },
];

const SYMBOLS:    Symbol[] = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
const LEVERAGES:  number[] = [1, 2, 3, 5];
const TRADES_KEY   = "kraken_trades_v2";
const SETTINGS_KEY = "bot_settings_v2";
const TRAIN_KEY    = "bot_train_history";

// ── Helpers ───────────────────────────────────────────────────────────────────

function saveKrakenKeys(apiKey: string, secret: string): void {
  try {
    const all = JSON.parse(localStorage.getItem("resell_api_keys") ?? "{}");
    all.kraken = { apiKey, secret };
    localStorage.setItem("resell_api_keys", JSON.stringify(all));
  } catch { /* ignore */ }
}

function loadLocalTrades(): TradeRecord[] {
  try { return JSON.parse(localStorage.getItem(TRADES_KEY) ?? "[]"); } catch { return []; }
}

function mergeLocalTrades(incoming: TradeRecord[]): TradeRecord[] {
  try {
    const prev = loadLocalTrades();
    const map = new Map<string, TradeRecord>();
    [...prev, ...incoming].forEach(t => map.set(`${t.time}_${t.entry}`, t));
    const merged = Array.from(map.values()).sort((a, b) => a.time.localeCompare(b.time)).slice(-50);
    localStorage.setItem(TRADES_KEY, JSON.stringify(merged));
    return merged;
  } catch { return incoming; }
}

const fmtP   = (p: number | undefined | null) => { const n = p ?? 0; return n >= 1000 ? n.toLocaleString("en-US", { maximumFractionDigits: 0 }) : n.toFixed(2); };
const fmtPct = (p: number | undefined | null) => { const n = p ?? 0; return (n >= 0 ? "+" : "") + n.toFixed(2) + "%"; };
const safe   = (p: number | undefined | null, dec = 2) => (p ?? 0).toFixed(dec);
const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getDate().toString().padStart(2, "0")}.${(d.getMonth() + 1).toString().padStart(2, "0")} `
       + `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function TradingBot() {
  const saved = (() => { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}"); } catch { return {}; } })();

  const [preset,      setPreset]      = useState<RiskLevel>(saved.preset      ?? "aggressive");
  const [capital,     setCapital]     = useState<number>   (saved.capital     ?? 18);
  const [leverage,    setLeverage]    = useState<number>   (saved.leverage    ?? 1);
  const [allowShorts, setAllowShorts] = useState<boolean>  (saved.allowShorts ?? false);
  const [symbol,      setSymbol]      = useState<Symbol>   (saved.symbol      ?? "BTCUSDT");

  const [price,    setPrice]    = useState(0);
  const [change24h,setChange24h]= useState(0);
  const [high24h,  setHigh24h]  = useState(0);
  const [low24h,   setLow24h]   = useState(0);

  const [botStatus,  setBotStatus]  = useState<BotStatus | null>(null);
  const [logs,       setLogs]       = useState<{ time: string; msg: string; type: string }[]>([]);
  const [showLogs,   setShowLogs]   = useState(true);
  const logsRef = useRef<HTMLDivElement>(null);

  const [simResult,  setSimResult]  = useState<SimResult | null>(null);
  const [simError,   setSimError]   = useState<string | null>(null);
  const [simRunning, setSimRunning] = useState(false);
  const [optResult,  setOptResult]  = useState<OptResult | null>(() => {
    try {
      const cached = JSON.parse(localStorage.getItem("bot_opt_result") ?? "null");
      // Discard old format (pre-walk-forward) — missing trainWinRate field
      if (cached && cached.trainWinRate === undefined) return null;
      return cached;
    } catch { return null; }
  });
  const [optRunning,    setOptRunning]    = useState(false);
  const [optApplied,    setOptApplied]    = useState(false);
  const [trainAndSim,   setTrainAndSim]   = useState(false);
  const [trainHistory, setTrainHistory] = useState<TrainEntry[]>(() => {
    try { return JSON.parse(localStorage.getItem(TRAIN_KEY) ?? "[]"); } catch { return []; }
  });
  const [showHistory, setShowHistory] = useState(false);
  const [autoRetrain, setAutoRetrain] = useState(false);
  const [autoRetrainBusy, setAutoRetrainBusy] = useState(false);

  const [krakenOk,  setKrakenOk]  = useState<boolean | null>(null);
  const [krakenMsg, setKrakenMsg] = useState("");
  const [testBusy,  setTestBusy]  = useState(false);

  const [showKeys, setShowKeys] = useState(false);
  const [keyIn,    setKeyIn]    = useState({ apiKey: "", secret: "" });
  const [keySaved, setKeySaved] = useState(false);

  const [tradeHistory, setTradeHistory] = useState<TradeRecord[]>(() => loadLocalTrades());

  const p = PRESETS.find(x => x.id === preset)!;

  useEffect(() => {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ preset, capital, leverage, allowShorts, symbol })); }
    catch { /* ignore */ }
  }, [preset, capital, leverage, allowShorts, symbol]);

  // ── Ticker ─────────────────────────────────────────────────────────────────

  const fetchTicker = useCallback(async () => {
    try {
      const r = await fetch(`/api/trading/klines?symbol=${symbol}&interval=5m&limit=288`);
      if (!r.ok) return;
      const data: any[] = await r.json();
      if (!Array.isArray(data) || !data.length) return;
      const last = data[data.length - 1];
      setPrice(last.close);
      setChange24h(((last.close - data[0].open) / data[0].open) * 100);
      setHigh24h(Math.max(...data.map((d: any) => d.high)));
      setLow24h(Math.min(...data.map((d: any) => d.low)));
    } catch { /* ignore */ }
  }, [symbol]);

  // ── Status ─────────────────────────────────────────────────────────────────

  const fetchStatus = useCallback(async () => {
    try {
      const r = await fetch("/api/bot/status");
      if (!r.ok) return;
      const s: BotStatus = await r.json();
      setBotStatus(s);
      if (s.logs?.length) setLogs(s.logs.slice(-40).reverse());
      if (s.sessionStats?.tradeHistory?.length) {
        setTradeHistory(mergeLocalTrades(s.sessionStats.tradeHistory));
      }
      if ((s as any).autoRetrain?.enabled !== undefined) {
        setAutoRetrain((s as any).autoRetrain.enabled);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchTicker();
    fetchStatus();
    const t1 = setInterval(fetchTicker, 10_000);
    const t2 = setInterval(fetchStatus, 3_000);
    return () => { clearInterval(t1); clearInterval(t2); };
  }, [fetchTicker, fetchStatus]);

  useEffect(() => {
    if (logsRef.current) logsRef.current.scrollTop = 0;
  }, [logs]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const toggleBot = async () => {
    if (!botStatus?.running) {
      if (!hasKrakenKeys()) { setShowKeys(true); return; }
      const { apiKey, secret } = getKrakenKeys();
      const r = await fetch("/api/bot/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey, secret, platform: "kraken",
          symbol, capital, leverage, allowShorts,
          rsiMin: p.rsiMin, rsiMax: p.rsiMax, adxMin: p.adxMin,
          confluenceMin: p.confluenceMin, volMultMin: p.volMultMin,
          cooldownMin: p.cooldownMin, stopLoss: p.stopLoss,
          takeProfit: p.takeProfit, trailPct: p.trailPct,
        }),
      });
      if (!r.ok) { const e = await r.json(); alert(e.error ?? "Błąd startu bota"); return; }
    } else {
      await fetch("/api/bot/stop", { method: "POST" });
    }
    await fetchStatus();
  };

  const runSim = async () => {
    setSimRunning(true); setSimError(null); setSimResult(null); setOptResult(null);
    try {
      const r = await fetch("/api/bot/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol, leverage, allowShorts,
          rsiMin: p.rsiMin, rsiMax: p.rsiMax, adxMin: p.adxMin,
          confluenceMin: p.confluenceMin, volMultMin: p.volMultMin,
          cooldownMin: p.cooldownMin, stopLoss: p.stopLoss,
          takeProfit: p.takeProfit, trailPct: p.trailPct,
        }),
      });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error ?? "Błąd symulacji");
      setSimResult(d);
    } catch (e: any) {
      setSimError(e.message);
    } finally {
      setSimRunning(false);
    }
  };

  const runOpt = async () => {
    setOptRunning(true); setOptResult(null); setSimResult(null); setSimError(null);
    try {
      const r = await fetch("/api/bot/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol, leverage, allowShorts,
          adxMin: p.adxMin, confluenceMin: p.confluenceMin,
          volMultMin: p.volMultMin, cooldownMin: p.cooldownMin,
          stopLoss: p.stopLoss, takeProfit: p.takeProfit,
        }),
      });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error ?? "Błąd optymalizacji");
      setOptResult(d);
      try { localStorage.setItem("bot_opt_result", JSON.stringify(d)); } catch { /* ignore */ }
      // save to training history
      const entry: TrainEntry = {
        ts: new Date().toISOString(), rsiMin: d.rsiMin, rsiMax: d.rsiMax,
        trailPct: d.trailPct, stopLoss: d.stopLoss ?? 0, takeProfit: d.takeProfit ?? 0,
        trainWinRate: d.trainWinRate ?? d.winRate ?? 0,
        validWinRate: d.validWinRate ?? 0, confidence: d.confidence ?? 0, applied: false,
      };
      const hist = [entry, ...trainHistory].slice(0, 10);
      setTrainHistory(hist);
      try { localStorage.setItem(TRAIN_KEY, JSON.stringify(hist)); } catch { /* ignore */ }
    } catch (e: any) {
      setSimError(e.message);
    } finally {
      setOptRunning(false);
    }
  };

  const runTrainAndSim = async () => {
    setTrainAndSim(true);
    setSimError(null); setSimResult(null); setOptResult(null);
    try {
      // 1. Optimize
      const ro = await fetch("/api/bot/optimize", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol, leverage, allowShorts,
          adxMin: p.adxMin, confluenceMin: p.confluenceMin,
          volMultMin: p.volMultMin, cooldownMin: p.cooldownMin,
          stopLoss: p.stopLoss, takeProfit: p.takeProfit,
        }),
      });
      const opt = await ro.json();
      if (!ro.ok || opt.error) throw new Error(opt.error ?? "Błąd optymalizacji");
      setOptResult(opt);
      try { localStorage.setItem("bot_opt_result", JSON.stringify(opt)); } catch { /* ignore */ }

      // 2. Simulate with optimized RSI/trail (if result is good, use those; otherwise preset)
      const useOpt = (opt.confidence ?? 0) >= 40 && (opt.trainWinRate ?? 0) >= 45;
      const rs = await fetch("/api/bot/backtest", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol, leverage, allowShorts,
          rsiMin:   useOpt ? opt.rsiMin   : p.rsiMin,
          rsiMax:   useOpt ? opt.rsiMax   : p.rsiMax,
          trailPct: useOpt ? opt.trailPct : p.trailPct,
          stopLoss: useOpt ? opt.stopLoss : p.stopLoss,
          takeProfit: useOpt ? opt.takeProfit : p.takeProfit,
          adxMin: p.adxMin, confluenceMin: p.confluenceMin,
          volMultMin: p.volMultMin, cooldownMin: p.cooldownMin,
        }),
      });
      const sim = await rs.json();
      if (!rs.ok || sim.error) throw new Error(sim.error ?? "Błąd symulacji");
      setSimResult(sim);
    } catch (e: any) {
      setSimError(e.message);
    } finally {
      setTrainAndSim(false);
    }
  };

  const applyOpt = async () => {
    if (!optResult) return;
    setOptApplied(false);
    const r = await fetch("/api/bot/params", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rsiMin: optResult.rsiMin, rsiMax: optResult.rsiMax, trailPct: optResult.trailPct,
        stopLoss: optResult.stopLoss, takeProfit: optResult.takeProfit,
      }),
    });
    if (r.ok) {
      setOptApplied(true);
      setTimeout(() => setOptApplied(false), 4000);
      // mark latest history entry as applied
      const hist = trainHistory.map((e, i) => i === 0 ? { ...e, applied: true } : e);
      setTrainHistory(hist);
      try { localStorage.setItem(TRAIN_KEY, JSON.stringify(hist)); } catch { /* ignore */ }
    } else {
      const e = await r.json(); alert(e.error ?? "Błąd zastosowania");
    }
  };

  const toggleAutoRetrain = async () => {
    setAutoRetrainBusy(true);
    const newVal = !autoRetrain;
    try {
      const r = await fetch("/api/bot/autotrain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: newVal, intervalH: 24 }),
      });
      if (r.ok) setAutoRetrain(newVal);
    } catch { /* ignore */ }
    setAutoRetrainBusy(false);
  };

  const testKraken = async () => {
    if (!hasKrakenKeys()) { setShowKeys(true); return; }
    setTestBusy(true); setKrakenOk(null); setKrakenMsg("");
    const { apiKey, secret } = getKrakenKeys();
    try {
      const r = await fetch("/api/kraken/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, secret }),
      });
      const d = await r.json();
      setKrakenOk(!!d.readOk);
      setKrakenMsg(d.readOk
        ? `✓ OK · USD ${(d.balance?.USD ?? 0).toFixed(2)} · EUR ${(d.balance?.EUR ?? 0).toFixed(2)} · BTC ${d.balance?.BTC ?? 0}`
        : `✗ ${d.error ?? "Błąd"}`);
    } catch { setKrakenOk(false); setKrakenMsg("✗ Błąd połączenia"); }
    finally { setTestBusy(false); }
  };

  const saveKeys = () => {
    if (!keyIn.apiKey.trim() || !keyIn.secret.trim()) return;
    saveKrakenKeys(keyIn.apiKey.trim(), keyIn.secret.trim());
    setKeySaved(true); setShowKeys(false); setKeyIn({ apiKey: "", secret: "" });
    setTimeout(() => setKeySaved(false), 3000);
  };

  // ── Derived ────────────────────────────────────────────────────────────────

  const running  = botStatus?.running ?? false;
  const position = botStatus?.position ?? null;
  const dipStats = botStatus?.dipStats;
  const sess     = botStatus?.sessionStats;
  const keysOk   = hasKrakenKeys();

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <ResellLayout>
      <div className="p-3 space-y-3 max-w-lg mx-auto pb-8">

        {/* ── Ticker ──────────────────────────────────────────────────────── */}
        <div className="bg-[#0d1b12] border border-[#1e3a28] rounded-xl p-4">
          <div className="text-xs text-gray-400 mb-1">{symbol} · LIVE</div>
          <div className="flex items-center gap-3">
            <span className="text-3xl font-bold text-white">${fmtP(price)}</span>
            <span className={`text-sm font-semibold px-2 py-0.5 rounded ${change24h >= 0 ? "bg-green-900/60 text-green-400" : "bg-red-900/60 text-red-400"}`}>
              {fmtPct(change24h)}
            </span>
          </div>
          <div className="flex gap-4 mt-1 text-xs text-gray-400">
            <span>24H MAX <span className="text-white">${fmtP(high24h)}</span></span>
            <span>24H MIN <span className="text-white">${fmtP(low24h)}</span></span>
          </div>
        </div>

        {/* ── Live Trading ─────────────────────────────────────────────────── */}
        <div className="bg-[#0d1b12] border border-[#1e3a28] rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${running ? "bg-red-500 animate-pulse" : "bg-gray-600"}`} />
              <span className="font-semibold text-white text-sm">LIVE TRADING — Kraken 🦑</span>
            </div>
            <button onClick={toggleBot}
              className={`relative w-12 h-6 rounded-full transition-colors ${running ? "bg-green-500" : "bg-gray-600"}`}>
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${running ? "translate-x-6" : "translate-x-0.5"}`} />
            </button>
          </div>

          {running && <div className="text-xs text-gray-500">działa nawet po zamknięciu aplikacji</div>}

          {/* symbol */}
          <div className="flex gap-1">
            {SYMBOLS.map(s => (
              <button key={s} onClick={() => setSymbol(s)}
                className={`flex-1 text-xs py-1.5 rounded font-medium ${symbol === s ? "bg-green-700 text-white" : "bg-[#1a2e1f] text-gray-400"}`}>
                {s.replace("USDT", "")}
              </button>
            ))}
          </div>

          {/* capital + leverage */}
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="text-xs text-gray-400">Kapitał (USDT)</label>
              <input type="number" min={1} value={capital}
                onChange={e => setCapital(Number(e.target.value))}
                className="w-full bg-[#1a2e1f] border border-[#2a4a30] rounded-lg px-3 py-1.5 text-white text-sm mt-0.5" />
            </div>
            <div>
              <label className="text-xs text-gray-400">Dźwignia</label>
              <div className="flex gap-1 mt-0.5">
                {LEVERAGES.map(lv => (
                  <button key={lv} onClick={() => setLeverage(lv)}
                    className={`px-2 py-1.5 text-xs rounded font-medium ${leverage === lv ? "bg-green-700 text-white" : "bg-[#1a2e1f] text-gray-400"}`}>
                    {lv}×
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* shorts */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <div onClick={() => setAllowShorts(!allowShorts)}
              className={`w-8 h-4 rounded-full transition-colors cursor-pointer ${allowShorts ? "bg-green-500" : "bg-gray-600"}`}>
              <span className={`block w-3.5 h-3.5 bg-white rounded-full m-0.5 shadow transition-transform ${allowShorts ? "translate-x-4" : ""}`} />
            </div>
            <span className="text-sm text-gray-300">Zezwól na shorty</span>
          </label>

          {/* open position */}
          {position && (
            <div className={`rounded-lg p-3 border ${position.direction === "long" ? "bg-green-900/20 border-green-700/50" : "bg-red-900/20 border-red-700/50"}`}>
              <div className="text-[10px] text-gray-500 mb-1">OTWARTA POZYCJA</div>
              <div className="flex justify-between items-center">
                <span className={`text-sm font-bold ${position.direction === "long" ? "text-green-400" : "text-red-400"}`}>
                  {position.direction.toUpperCase()}
                </span>
                <span className="text-sm text-white">@ ${fmtP(position.entryPrice)}</span>
                <span className="text-xs text-gray-400">qty {position.qty}</span>
              </div>
              <div className="text-xs text-gray-500 mt-0.5">SL {safe(position.slPct)}% · TP {safe(position.tpPct)}%</div>
            </div>
          )}

          {/* session strip */}
          {running && (
            <div className="flex gap-4 text-xs text-gray-400 flex-wrap">
              <span>P&L: <span className={botStatus!.sessionPnl >= 0 ? "text-green-400 font-semibold" : "text-red-400 font-semibold"}>{fmtPct(botStatus!.sessionPnl)}</span></span>
              {sess && sess.wins + sess.losses > 0 && (
                <span>Win {safe(sess.winRate, 0)}% · {sess.wins ?? 0}W/{sess.losses ?? 0}L</span>
              )}
              {dipStats && (
                <span>4H: <span className={dipStats.fourHourTrend === "bull" ? "text-green-400" : dipStats.fourHourTrend === "bear" ? "text-red-400" : "text-gray-400"}>{dipStats.fourHourTrend}</span></span>
              )}
            </div>
          )}

          {optResult && optResult.winRate >= 45 && optResult.totalReturn >= 0 && (
            <div className="text-xs text-green-400 font-medium">
              ✓ Wytrenowany — RSI [{optResult.rsiMin}–{optResult.rsiMax}] Trail {optResult.trailPct}%
            </div>
          )}
          {optResult && (optResult.winRate < 45 || optResult.totalReturn < 0) && (
            <div className="text-xs text-yellow-500">
              ⚠ Trening bez dobrego wyniku — rynek niekorzystny
            </div>
          )}

          {dipStats?.rangeMode  && running && <div className="text-xs text-yellow-400">⚠ Range mode</div>}
          {dipStats?.crashActive && running && <div className="text-xs text-red-400">🔴 Crash protection aktywny</div>}

          {/* keys form */}
          {showKeys && (
            <div className="border border-yellow-700/40 rounded-lg p-3 space-y-2 bg-[#111f10]">
              <div className="text-xs text-yellow-400 font-semibold">Klucze Kraken API</div>
              <input type="text" placeholder="API Key"
                value={keyIn.apiKey} onChange={e => setKeyIn(k => ({ ...k, apiKey: e.target.value }))}
                className="w-full bg-[#0d1b12] border border-[#2a4a30] rounded px-2 py-1.5 text-white text-xs" />
              <input type="password" placeholder="API Secret"
                value={keyIn.secret} onChange={e => setKeyIn(k => ({ ...k, secret: e.target.value }))}
                className="w-full bg-[#0d1b12] border border-[#2a4a30] rounded px-2 py-1.5 text-white text-xs" />
              <div className="flex gap-2">
                <button onClick={saveKeys} className="flex-1 bg-green-700 hover:bg-green-600 text-white text-xs py-1.5 rounded font-medium">Zapisz</button>
                <button onClick={() => setShowKeys(false)} className="px-3 bg-[#1a2e1f] text-gray-400 text-xs py-1.5 rounded">Anuluj</button>
              </div>
            </div>
          )}

          {keySaved && <div className="text-xs text-green-400 font-medium">✓ Klucze zapisane</div>}

          <div className="flex gap-2">
            <button onClick={testKraken} disabled={testBusy}
              className="flex-1 bg-[#1a2e1f] hover:bg-[#243d28] border border-[#2a4a30] text-yellow-400 text-xs py-2 rounded-lg disabled:opacity-50">
              {testBusy ? "Sprawdzam…" : "🔍 Test połączenia Kraken"}
            </button>
            {keysOk && !showKeys && (
              <button onClick={() => setShowKeys(true)}
                className="px-3 bg-[#1a2e1f] text-gray-500 text-xs py-2 rounded-lg border border-[#2a4a30]">
                Zmień klucze
              </button>
            )}
          </div>

          {krakenMsg && (
            <div className={`text-xs p-2 rounded border ${krakenOk ? "bg-green-900/20 border-green-700/40 text-green-400" : "bg-red-900/20 border-red-700/40 text-red-400"}`}>
              {krakenMsg}
            </div>
          )}

          {!keysOk && !showKeys && (
            <button onClick={() => setShowKeys(true)} className="w-full text-xs text-yellow-500 underline py-1">
              Ustaw klucze Kraken API →
            </button>
          )}
        </div>

        {/* ── Risk presets ─────────────────────────────────────────────────── */}
        <div className="bg-[#0d1b12] border border-[#1e3a28] rounded-xl p-4 space-y-3">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Poziom Ryzyka</div>
          <div className="grid grid-cols-2 gap-2">
            {PRESETS.map(pr => (
              <button key={pr.id} onClick={() => setPreset(pr.id)}
                className={`p-3 rounded-xl border text-left transition-all ${
                  preset === pr.id ? "border-green-500 bg-green-900/25" : "border-[#2a4a30] bg-[#111f16] hover:border-green-700/50"
                }`}>
                <div className="text-xl mb-1">{pr.icon}</div>
                <div className="text-sm font-semibold text-white">{pr.label}</div>
                <div className="text-xs text-gray-400 leading-tight">{pr.desc}</div>
                <div className={`text-xs mt-1 font-medium ${preset === pr.id ? "text-green-400" : "text-gray-600"}`}>{pr.freq}</div>
              </button>
            ))}
          </div>
          <div className="text-xs text-gray-600">
            RSI [{p.rsiMin}–{p.rsiMax}] · ADX≥{p.adxMin} · SL {p.stopLoss}% · TP {p.takeProfit}% · Trail {p.trailPct}% · Cooldown {p.cooldownMin}min
          </div>
        </div>

        {/* ── Simulation & Optimization ─────────────────────────────────────── */}
        <div className="bg-[#0d1b12] border border-[#1e3a28] rounded-xl p-4 space-y-3">
          {/* Main: Train + Simulate together */}
          <button onClick={runTrainAndSim} disabled={simRunning || optRunning || trainAndSim}
            className="w-full flex items-center justify-center gap-2 bg-green-800/40 hover:bg-green-800/60 border border-green-600/60 text-green-300 py-3 rounded-lg text-sm font-semibold disabled:opacity-50">
            <Zap className="w-4 h-4" />
            {trainAndSim ? "Trenuje i symuluje…" : "🧠 Trenuj i Symuluj"}
          </button>
          <div className="flex gap-2">
            <button onClick={runSim} disabled={simRunning || optRunning || trainAndSim}
              className="flex-1 flex items-center justify-center gap-1.5 bg-[#1a2e1f] hover:bg-[#243d28] border border-green-800/60 text-green-400 py-2 rounded-lg text-xs disabled:opacity-50">
              <FlaskConical className="w-3 h-3" />
              {simRunning ? "Symulacja…" : "🔬 Symulacja"}
            </button>
            <button onClick={runOpt} disabled={simRunning || optRunning || trainAndSim}
              className="flex-1 flex items-center justify-center gap-1.5 bg-[#1a2e1f] hover:bg-[#243d28] border border-yellow-800/60 text-yellow-400 py-2 rounded-lg text-xs disabled:opacity-50">
              <Zap className="w-3 h-3" />
              {optRunning ? "Optymalizuję…" : "⚡ Optymalizacja"}
            </button>
          </div>

          {simError && (
            <div className="text-xs text-red-400 flex gap-1 items-start">
              <span className="shrink-0">⚠</span><span>{simError}</span>
            </div>
          )}

          {simResult && (
            <div className="bg-[#111f16] border border-[#2a4a30] rounded-lg p-3 space-y-2">
              <div className="text-xs text-gray-400">SYMULACJA — {simResult.symbol} · {simResult.days}d · {simResult.numTrades} transakcji</div>
              <div className="grid grid-cols-4 gap-1 text-center">
                {[
                  { lbl: "WIN RATE",  val: safe(simResult.winRate, 1) + "%",              ok: (simResult.winRate ?? 0) >= 50 },
                  { lbl: "ZWROT",     val: fmtPct(simResult.totalReturn),               ok: (simResult.totalReturn ?? 0) >= 0 },
                  { lbl: "DRAWDOWN",  val: "-" + safe(simResult.maxDrawdown, 1) + "%",  ok: false },
                  { lbl: "KAPITAŁ",   val: safe(simResult.finalEquity, 1),              ok: (simResult.finalEquity ?? 0) >= 100 },
                ].map(m => (
                  <div key={m.lbl}>
                    <div className="text-[9px] text-gray-500 uppercase">{m.lbl}</div>
                    <div className={`text-sm font-bold ${m.ok ? "text-green-400" : "text-red-400"}`}>{m.val}</div>
                  </div>
                ))}
              </div>
              <div className="text-xs text-gray-500">Avg Win: {fmtPct(simResult.avgWin ?? 0)} · Avg Loss: {fmtPct(simResult.avgLoss ?? 0)}</div>
              {simResult.trades.length > 0 && (
                <div className="space-y-0.5 max-h-36 overflow-y-auto">
                  {simResult.trades.slice(-8).reverse().map((t, i) => (
                    <div key={i} className="flex justify-between text-xs py-0.5 border-b border-[#1a2e1f]">
                      <span className={t.dir === "long" ? "text-green-400" : "text-red-400"}>{t.dir.toUpperCase()}</span>
                      <span className="text-gray-500">${fmtP(t.entry)} → ${fmtP(t.exit)}</span>
                      <span className={t.pnlPct >= 0 ? "text-green-400" : "text-red-400"}>{fmtPct(t.pnlPct)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {optResult && (
            <div className="bg-[#111f16] border border-[#2a4a30] rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-yellow-400 text-xs font-semibold">⚡ Wynik treningu</span>
                <span className="text-xs text-gray-500">{optResult.days ?? "?"}d · {optResult.combosTested ?? 20} kombinacji</span>
              </div>
              <div className="text-sm text-white font-medium">
                RSI [{optResult.rsiMin}–{optResult.rsiMax}] · Trail {optResult.trailPct}% · SL {optResult.stopLoss}% · TP {optResult.takeProfit}%
              </div>

              {/* Confidence bar */}
              <div>
                <div className="flex justify-between text-[10px] text-gray-500 mb-1">
                  <span>PEWNOŚĆ MODELU</span>
                  <span className={optResult.confidence >= 60 ? "text-green-400" : optResult.confidence >= 40 ? "text-yellow-400" : "text-red-400"}>
                    {optResult.confidence}%
                  </span>
                </div>
                <div className="w-full h-2 bg-[#1a2e1f] rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${optResult.confidence >= 60 ? "bg-green-500" : optResult.confidence >= 40 ? "bg-yellow-500" : "bg-red-500"}`}
                    style={{ width: `${optResult.confidence}%` }} />
                </div>
              </div>

              {/* Train vs Validate */}
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-[#0d1b12] rounded p-2">
                  <div className="text-[9px] text-gray-500 mb-1">TRENING (70%)</div>
                  <div className="text-xs space-y-0.5">
                    <div>Win <span className={(optResult.trainWinRate ?? 0) >= 50 ? "text-green-400 font-semibold" : "text-red-400 font-semibold"}>{safe(optResult.trainWinRate, 1)}%</span></div>
                    <div>Zwrot <span className={(optResult.trainReturn ?? 0) >= 0 ? "text-green-400" : "text-red-400"}>{fmtPct(optResult.trainReturn)}</span></div>
                    <div className="text-gray-500">{optResult.trainTrades ?? 0} transakcji</div>
                  </div>
                </div>
                <div className="bg-[#0d1b12] rounded p-2">
                  <div className="text-[9px] text-gray-500 mb-1">WALIDACJA (30%)</div>
                  <div className="text-xs space-y-0.5">
                    <div>Win <span className={(optResult.validWinRate ?? 0) >= 50 ? "text-green-400 font-semibold" : "text-red-400 font-semibold"}>{safe(optResult.validWinRate, 1)}%</span></div>
                    <div>Zwrot <span className={(optResult.validReturn ?? 0) >= 0 ? "text-green-400" : "text-red-400"}>{fmtPct(optResult.validReturn)}</span></div>
                    <div className="text-gray-500">{optResult.validTrades ?? 0} transakcji</div>
                  </div>
                </div>
              </div>

              {optResult.trainWinRate >= 45 && optResult.trainReturn >= 0 && optResult.confidence >= 40 ? (
                <button onClick={applyOpt}
                  className="w-full bg-green-700 hover:bg-green-600 text-white text-xs py-2 rounded-lg font-medium">
                  {optApplied ? "✓ Zastosowano do bota!" : "Zastosuj do bota →"}
                </button>
              ) : (
                <div className="text-xs text-red-400 bg-red-900/20 border border-red-800/40 rounded-lg px-3 py-2">
                  ⚠ Wynik zbyt słaby — rynek nie sprzyja tej strategii teraz.
                </div>
              )}

              {/* Auto-retrain toggle */}
              <label className="flex items-center justify-between cursor-pointer select-none pt-1 border-t border-[#1e3a28]">
                <span className="text-xs text-gray-400">🧠 Auto-retrain co 24h (serwer)</span>
                <div onClick={autoRetrainBusy ? undefined : toggleAutoRetrain}
                  className={`w-8 h-4 rounded-full transition-colors cursor-pointer ${autoRetrain ? "bg-green-500" : "bg-gray-600"} ${autoRetrainBusy ? "opacity-50" : ""}`}>
                  <span className={`block w-3.5 h-3.5 bg-white rounded-full m-0.5 shadow transition-transform ${autoRetrain ? "translate-x-4" : ""}`} />
                </div>
              </label>

              {/* History toggle */}
              {trainHistory.length > 0 && (
                <button onClick={() => setShowHistory(x => !x)}
                  className="w-full text-xs text-gray-500 hover:text-gray-300 text-left">
                  {showHistory ? "▲ Ukryj historię treningów" : `▼ Historia treningów (${trainHistory.length})`}
                </button>
              )}
            </div>
          )}

          {/* Training history */}
          {showHistory && trainHistory.length > 0 && (
            <div className="bg-[#111f16] border border-[#2a4a30] rounded-lg p-3 space-y-1.5">
              <div className="text-xs font-semibold text-gray-400 mb-2">Historia treningów</div>
              {trainHistory.map((e, i) => (
                <div key={i} className="flex justify-between items-center text-xs py-1 border-b border-[#1a2e1f]">
                  <span className="text-gray-500 font-mono">{fmtDate(e.ts)}</span>
                  <span className="text-gray-300">RSI [{e.rsiMin}–{e.rsiMax}]</span>
                  <span className={e.confidence >= 60 ? "text-green-400" : e.confidence >= 40 ? "text-yellow-400" : "text-red-400"}>
                    {e.confidence}%
                  </span>
                  {e.applied && <span className="text-green-400 text-[10px]">✓</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Activity Log ─────────────────────────────────────────────────── */}
        <div className="bg-[#0d1b12] border border-[#1e3a28] rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-green-400" />
              <span className="text-sm font-semibold text-white">Activity Log</span>
              {running && <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />}
            </div>
            <button onClick={() => setShowLogs(x => !x)} className="text-xs text-gray-500 hover:text-gray-300">
              {showLogs ? "Zwiń" : "Rozwiń"}
            </button>
          </div>
          {showLogs && (
            <div ref={logsRef} className="space-y-1 max-h-52 overflow-y-auto">
              {!logs.length
                ? <div className="text-xs text-gray-600">Brak logów — uruchom bota</div>
                : logs.map((l, i) => (
                  <div key={i} className="text-xs flex gap-2">
                    <span className="text-gray-600 shrink-0 font-mono">{l.time}</span>
                    <span className={l.type === "buy" ? "text-green-400" : l.type === "sell" ? "text-red-400" : l.type === "warn" ? "text-yellow-400" : "text-gray-300"}>{l.msg}</span>
                  </div>
                ))
              }
            </div>
          )}
        </div>

        {/* ── Trade History ─────────────────────────────────────────────────── */}
        {tradeHistory.length > 0 && (
          <div className="bg-[#0d1b12] border border-[#1e3a28] rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-white">Historia transakcji ({tradeHistory.length})</span>
              <button onClick={() => { localStorage.removeItem(TRADES_KEY); setTradeHistory([]); }}
                className="text-xs text-gray-700 hover:text-red-400">Wyczyść</button>
            </div>
            <div className="space-y-0.5 max-h-64 overflow-y-auto">
              {tradeHistory.slice().reverse().map((t, i) => (
                <div key={i} className="flex justify-between items-center text-xs py-1 border-b border-[#1a2e1f]">
                  <span className="text-gray-500 font-mono">{fmtDate(t.time)}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${t.dir === "long" ? "bg-green-900/50 text-green-400" : "bg-red-900/50 text-red-400"}`}>
                    {t.dir.toUpperCase()}
                  </span>
                  <span className="text-gray-300">${fmtP(t.entry)}</span>
                  <span className="text-gray-600">→</span>
                  <span className="text-gray-300">${fmtP(t.exit)}</span>
                  <span className={`font-semibold ${t.pnlPct >= 0 ? "text-green-400" : "text-red-400"}`}>{fmtPct(t.pnlPct)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </ResellLayout>
  );
}
