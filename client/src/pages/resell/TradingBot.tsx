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
  rsiMin: number; rsiMax: number; trailPct: number;
  sharpe: number; winRate: number; totalReturn: number; numTrades: number;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const PRESETS: Preset[] = [
  { id: "cautious",        label: "Ostrożny",       icon: "🐢", desc: "Mało transakcji, wysoka pewność",          freq: "1–3 / tydzień",
    rsiMin: 34, rsiMax: 68, adxMin: 20, confluenceMin: 3, volMultMin: 1.5, cooldownMin: 90, stopLoss: 0.40, takeProfit: 1.2, trailPct: 0.20 },
  { id: "normal",          label: "Normalny",        icon: "⚖️", desc: "Balans między ilością a jakością",         freq: "3–7 / tydzień",
    rsiMin: 37, rsiMax: 65, adxMin: 15, confluenceMin: 2, volMultMin: 1.2, cooldownMin: 45, stopLoss: 0.35, takeProfit: 0.9, trailPct: 0.15 },
  { id: "aggressive",      label: "Agresywny",       icon: "🚀", desc: "Dużo transakcji, wyższe ryzyko",          freq: "5–15 / dzień",
    rsiMin: 42, rsiMax: 62, adxMin: 10, confluenceMin: 1, volMultMin: 1.0, cooldownMin: 15, stopLoss: 0.50, takeProfit: 1.3, trailPct: 0.12 },
  { id: "superaggressive", label: "Super Agresywny", icon: "⚡", desc: "Maksymalna ilość transakcji — scalping", freq: "15–40 / dzień",
    rsiMin: 45, rsiMax: 55, adxMin: 5,  confluenceMin: 1, volMultMin: 1.0, cooldownMin: 5,  stopLoss: 0.55, takeProfit: 1.1, trailPct: 0.10 },
];

const SYMBOLS:    Symbol[] = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
const LEVERAGES:  number[] = [1, 2, 3, 5];
const TRADES_KEY   = "kraken_trades_v2";
const SETTINGS_KEY = "bot_settings_v2";

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

const fmtP   = (p: number) => p >= 1000 ? p.toLocaleString("en-US", { maximumFractionDigits: 0 }) : p.toFixed(2);
const fmtPct = (p: number) => (p >= 0 ? "+" : "") + p.toFixed(2) + "%";
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
  const [optResult,  setOptResult]  = useState<OptResult | null>(null);
  const [optRunning, setOptRunning] = useState(false);

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
    } catch (e: any) {
      setSimError(e.message);
    } finally {
      setOptRunning(false);
    }
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
              <div className="text-xs text-gray-500 mt-0.5">SL {position.slPct.toFixed(2)}% · TP {position.tpPct.toFixed(2)}%</div>
            </div>
          )}

          {/* session strip */}
          {running && (
            <div className="flex gap-4 text-xs text-gray-400 flex-wrap">
              <span>P&L: <span className={botStatus!.sessionPnl >= 0 ? "text-green-400 font-semibold" : "text-red-400 font-semibold"}>{fmtPct(botStatus!.sessionPnl)}</span></span>
              {sess && sess.wins + sess.losses > 0 && (
                <span>Win {sess.winRate.toFixed(0)}% · {sess.wins}W/{sess.losses}L</span>
              )}
              {dipStats && (
                <span>4H: <span className={dipStats.fourHourTrend === "bull" ? "text-green-400" : dipStats.fourHourTrend === "bear" ? "text-red-400" : "text-gray-400"}>{dipStats.fourHourTrend}</span></span>
              )}
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
          <div className="flex gap-2">
            <button onClick={runSim} disabled={simRunning || optRunning}
              className="flex-1 flex items-center justify-center gap-1.5 bg-[#1a2e1f] hover:bg-[#243d28] border border-green-800/60 text-green-400 py-2.5 rounded-lg text-sm disabled:opacity-50">
              <FlaskConical className="w-4 h-4" />
              {simRunning ? "Symulacja…" : "🔬 Symulacja"}
            </button>
            <button onClick={runOpt} disabled={simRunning || optRunning}
              className="flex-1 flex items-center justify-center gap-1.5 bg-[#1a2e1f] hover:bg-[#243d28] border border-yellow-800/60 text-yellow-400 py-2.5 rounded-lg text-sm disabled:opacity-50">
              <Zap className="w-4 h-4" />
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
                  { lbl: "WIN RATE",  val: simResult.winRate.toFixed(1) + "%",       ok: simResult.winRate >= 50 },
                  { lbl: "ZWROT",     val: fmtPct(simResult.totalReturn),              ok: simResult.totalReturn >= 0 },
                  { lbl: "DRAWDOWN",  val: "-" + simResult.maxDrawdown.toFixed(1) + "%", ok: false },
                  { lbl: "KAPITAŁ",   val: simResult.finalEquity.toFixed(1),           ok: simResult.finalEquity >= 100 },
                ].map(m => (
                  <div key={m.lbl}>
                    <div className="text-[9px] text-gray-500 uppercase">{m.lbl}</div>
                    <div className={`text-sm font-bold ${m.ok ? "text-green-400" : "text-red-400"}`}>{m.val}</div>
                  </div>
                ))}
              </div>
              <div className="text-xs text-gray-500">Avg Win: {fmtPct(simResult.avgWin)} · Avg Loss: {fmtPct(simResult.avgLoss)}</div>
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
            <div className="bg-[#111f16] border border-[#2a4a30] rounded-lg p-3 space-y-1.5">
              <div className="text-yellow-400 text-xs font-semibold">⚡ Optymalne parametry</div>
              <div className="text-sm text-white">RSI [{optResult.rsiMin}–{optResult.rsiMax}] · Trail {optResult.trailPct}%</div>
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  { lbl: "WIN RATE",   val: optResult.winRate.toFixed(1) + "%",  ok: optResult.winRate >= 50 },
                  { lbl: "ZWROT",      val: fmtPct(optResult.totalReturn),        ok: optResult.totalReturn >= 0 },
                  { lbl: "TRANSAKCJI", val: String(optResult.numTrades),           ok: optResult.numTrades >= 8 },
                ].map(m => (
                  <div key={m.lbl}>
                    <div className="text-[9px] text-gray-500 uppercase">{m.lbl}</div>
                    <div className={`text-sm font-bold ${m.ok ? "text-green-400" : "text-red-400"}`}>{m.val}</div>
                  </div>
                ))}
              </div>
              <div className="text-xs text-gray-500">Sharpe: {optResult.sharpe.toFixed(2)}</div>
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
