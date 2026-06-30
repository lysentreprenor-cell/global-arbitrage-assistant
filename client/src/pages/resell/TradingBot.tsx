import { useState, useEffect, useRef, useCallback } from "react";
import { Activity, FlaskConical, Zap } from "lucide-react";
import { ResellLayout } from "@/components/resell/ResellLayout";
import { hasKrakenKeys, getKrakenKeys } from "@/lib/apiKeys";

// ── Types ─────────────────────────────────────────────────────────────────────

type Symbol    = "BTCUSDT" | "ETHUSDT" | "SOLUSDT" | "DOGEUSDT" | "XRPUSDT" | "ADAUSDT" | "AVAXUSDT" | "LINKUSDT" | "DOTUSDT" | "LTCUSDT" | "BCHUSDT" | "ATOMUSDT" | "UNIUSDT" | "SHIBUSDT" | "PEPEUSDT" | "SUIUSDT" | "TONUSDT" | "TRXUSDT" | "MATICUSDT";
type RiskLevel = "master" | "cautious" | "normal" | "aggressive" | "superaggressive";
type Direction = "long" | "short";
type Tab       = "main" | "advanced";

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
    entryTime: string; slPct: number; tpPct: number; symbol?: string;
  } | null;
  positions?: {
    direction: Direction; entryPrice: number; qty: number;
    entryTime: string; slPct: number; tpPct: number; symbol?: string;
  }[];
  maxPositions?: number;
  logs: { time: string; msg: string; type: string }[];
  dipStats?: {
    fourHourTrend: string; rangeMode: boolean;
    prevRsi: number; marketRegime: string; crashActive: boolean;
    trendScore?: number;
    trendStack?: Record<string, "bull" | "bear" | "neutral">;
    marketOpinion?: { text: string; color: "green" | "red" | "yellow" | "gray"; emoji: string };
  };
  sessionStats?: {
    wins: number; losses: number; winRate: number;
    avgWin: number; avgLoss: number; maxDrawdown: number;
    tradeHistory: TradeRecord[];
  };
  fearGreed?: { value: number; label: string } | null;
  liveIndicators?: { rsi: number; stochRsi: number; bbPercB: number; vwap: number; adx: number };
  circuitBreaker?: { active: boolean; consecutiveLosses: number; pauseUntil: string | null };
  riskPct?: number;
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
  winRate?: number; totalReturn?: number; sharpe?: number; numTrades?: number;
};

type TrainEntry = {
  ts: string; rsiMin: number; rsiMax: number; trailPct: number;
  stopLoss: number; takeProfit: number;
  trainWinRate: number; validWinRate: number; confidence: number; applied: boolean;
};

type IndOpts = {
  stochRsi80: boolean; bbPercB80: boolean; bodyQuality: boolean;
  emaSlope: boolean;   candleConfirm: boolean; adxRising: boolean;
  volTrend: boolean;   wickRej: boolean;   roc14: boolean;
  ichimoku: boolean;   heikinAshi: boolean; bbSqueeze: boolean;
};

type AutoIndResult = {
  baseline: { winRate: number; totalReturn: number; numTrades: number };
  scores: Record<string, { winRate: number; totalReturn: number; numTrades: number; delta: number }>;
  recommended: string[];
};

// ── Constants ─────────────────────────────────────────────────────────────────

const PRESETS: Preset[] = [
  { id: "master",          label: "🥋 Mistrz",      icon: "🥋", desc: "Wzór mistrza — R/R 2.5:1, wybredne wejścia, dodatnia E",  freq: "~3-5 / dzień",
    rsiMin: 35, rsiMax: 70, adxMin: 15, confluenceMin: 2, volMultMin: 1.0, cooldownMin: 30,  stopLoss: 1.50, takeProfit: 3.75, trailPct: 0.60 },
  { id: "cautious",        label: "Ostrożny",       icon: "🐢", desc: "Bardzo wysoki R/R 4:1 — min. WR 20%",     freq: "~2 / dzień",
    rsiMin: 40, rsiMax: 68, adxMin: 18, confluenceMin: 2, volMultMin: 1.1, cooldownMin: 90,  stopLoss: 2.00, takeProfit: 8.00, trailPct: 1.50 },
  { id: "normal",          label: "Normalny",        icon: "⚖️", desc: "Optymalny backtest — R/R 3:1, WR≥25%",   freq: "~4 / dzień",
    rsiMin: 38, rsiMax: 70, adxMin: 15, confluenceMin: 2, volMultMin: 1.0, cooldownMin: 45,  stopLoss: 2.00, takeProfit: 6.00, trailPct: 1.20 },
  { id: "aggressive",      label: "Agresywny",       icon: "🚀", desc: "Więcej transakcji, R/R 2.25:1",          freq: "~7 / dzień",
    rsiMin: 38, rsiMax: 70, adxMin: 12, confluenceMin: 1, volMultMin: 0.8, cooldownMin: 20,  stopLoss: 2.00, takeProfit: 4.50, trailPct: 1.00 },
  { id: "superaggressive", label: "Super Agresywny", icon: "⚡", desc: "Najczęstsze wejścia, R/R 2:1",           freq: "~14 / dzień",
    rsiMin: 42, rsiMax: 70, adxMin: 10, confluenceMin: 1, volMultMin: 0.8, cooldownMin: 10,  stopLoss: 1.50, takeProfit: 3.00, trailPct: 0.70 },
];

// Fallback list shown before the server responds with the full dynamic list
const SYMBOLS_FALLBACK: Symbol[] = [
  "BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "ADAUSDT", "DOGEUSDT",
  "AVAXUSDT", "LINKUSDT", "DOTUSDT", "LTCUSDT",
];
const LEVERAGES:  number[] = [1, 2, 3, 5];
const TRADES_KEY   = "kraken_trades_v2";
const SETTINGS_KEY = "bot_settings_v2";
const TRAIN_KEY    = "bot_train_history";
const IND_KEY      = "bot_ind_opts_v1";

const DEF_IND: IndOpts = {
  stochRsi80: false, bbPercB80: false, bodyQuality: false,
  emaSlope: false,   candleConfirm: false, adxRising: false,
  volTrend: false,   wickRej: false,   roc14: false,
  ichimoku: false,   heikinAshi: false, bbSqueeze: false,
};

const IND_COLORS = [
  "#a855f7","#3b82f6","#f97316","#14b8a6",
  "#06b6d4","#eab308","#f97316","#ef4444",
  "#84cc16","#6366f1","#8b5cf6","#ec4899",
];

type IndCard = {
  key: keyof IndOpts; num: number; name: string; desc: string;
  liveFn: (s: Record<string, number>) => string;
  isBlocking: (s: Record<string, number>) => boolean;
};

const IND_CARDS: IndCard[] = [
  { key: "stochRsi80",    num:  1, name: "StochRSI > 80",    desc: "Blokuj gdy K>80 (overbought)",
    liveFn: s => `K ${s.stochRsi ?? "?"}`,              isBlocking: s => (s.stochRsi ?? 0) > 80 },
  { key: "bbPercB80",     num:  2, name: "BB%B > 80",        desc: "Cena przy górnej wstędze BB",
    liveFn: s => `%B ${s.bbPercB ?? "?"}`,              isBlocking: s => (s.bbPercB ?? 0) > 80 },
  { key: "bodyQuality",   num:  3, name: "Body Quality",     desc: "Ciało świecy ≥ 30% range",
    liveFn: s => `Body ${((s.bodyQuality ?? 0.5)*100).toFixed(0)}%`, isBlocking: s => (s.bodyQuality ?? 1) < 0.30 },
  { key: "emaSlope",      num:  4, name: "EMA Slope ↑",      desc: "EMA21 musi rosnąć",
    liveFn: s => s.emaSlope ? "↑ rośnie" : "↓ spada",  isBlocking: s => !s.emaSlope },
  { key: "candleConfirm", num:  5, name: "Candle Confirm ×2",desc: "2 świece ponad EMA21",
    liveFn: s => `${s.candleConfirm ?? 0}/2 nad EMA`,  isBlocking: s => (s.candleConfirm ?? 0) < 2 },
  { key: "adxRising",     num:  6, name: "ADX Rising ↑",     desc: "ADX rośnie (wzmacnia trend)",
    liveFn: s => s.adxRising ? "↑ rośnie" : "↓ spada", isBlocking: s => !s.adxRising },
  { key: "volTrend",      num:  7, name: "Vol Trend ↑↑↑",   desc: "Wolumen rośnie 3 świece z rzędu",
    liveFn: s => s.volTrend ? "↑ rośnie" : "płaski",   isBlocking: s => !s.volTrend },
  { key: "wickRej",       num:  8, name: "Wick Rejection",   desc: "Górny knot ≤ 1.5× ciało",
    liveFn: s => `Knot ${s.wickRej ?? "?"}×`,           isBlocking: s => (s.wickRej ?? 0) > 1.5 },
  { key: "roc14",         num:  9, name: "ROC-14 > 0%",      desc: "Momentum dodatnie 14 świec",
    liveFn: s => `${(s.roc14 ?? 0) >= 0 ? "+" : ""}${(s.roc14 ?? 0).toFixed(2)}%`, isBlocking: s => (s.roc14 ?? 0) <= 0 },
  { key: "ichimoku",      num: 10, name: "Ichimoku TK",      desc: "Tenkan > Kijun (byczy sygnał)",
    liveFn: s => s.ichimokuOk ? "Ten>Kij ✓" : "Ten<Kij",isBlocking: s => !s.ichimokuOk },
  { key: "heikinAshi",    num: 11, name: "Heikin-Ashi ↑",   desc: "Świeca HA byczyca",
    liveFn: s => s.heikinAshi ? "byczy ✓" : "niedźwiedzi",isBlocking: s => !s.heikinAshi },
  { key: "bbSqueeze",     num: 12, name: "BB Squeeze",       desc: "Kupno po wyjściu ze ścisku BB",
    liveFn: s => s.bbSqueeze ? "squeeze ✓" : "brak squeeze",isBlocking: s => !s.bbSqueeze },
];

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
  return `${d.getDate().toString().padStart(2, "0")}.${(d.getMonth()+1).toString().padStart(2,"0")} `
       + `${d.getHours().toString().padStart(2,"0")}:${d.getMinutes().toString().padStart(2,"0")}`;
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function TradingBot() {
  const saved = (() => { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}"); } catch { return {}; } })();

  const [preset,      setPreset]      = useState<RiskLevel>(saved.preset      ?? "aggressive");
  const [capital,     setCapital]     = useState<number>   (saved.capital     ?? 18);
  const [riskPct,     setRiskPct]     = useState<number>   (saved.riskPct     ?? 20);
  const [leverage,    setLeverage]    = useState<number>   (saved.leverage    ?? 1);
  const [allowShorts, setAllowShorts] = useState<boolean>  (saved.allowShorts ?? false);
  const [symbol,       setSymbol]       = useState<Symbol>   (saved.symbol      ?? "BTCUSDT");
  const [extraSymbols, setExtraSymbols] = useState<Symbol[]> (saved.extraSymbols ?? []);
  const [availSymbols, setAvailSymbols] = useState<{ symbol: string; name: string }[]>(
    SYMBOLS_FALLBACK.map(s => ({ symbol: s, name: s.replace("USDT", "") }))
  );
  const [maxHoldMin, setMaxHoldMin] = useState<number>(saved.maxHoldMin ?? 0);
  const [customTP,   setCustomTP]   = useState<number>(saved.customTP ?? 0); // 0 = użyj presetu
  const [customSL,   setCustomSL]   = useState<number>(saved.customSL ?? 0); // 0 = użyj presetu
  const [minVolume,  setMinVolume]  = useState<number>(saved.minVolume ?? 0); // 0 = filtr wyłączony
  const [maxPositions, setMaxPositions] = useState<number>(saved.maxPositions ?? 5);
  const [simDays,    setSimDays]    = useState<number>(saved.simDays ?? 3); // okno symulacji w dniach

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

  // ── Advanced tab state ─────────────────────────────────────────────────────
  const [tab,           setTab]           = useState<Tab>("main");
  const [indOpts,       setIndOpts]       = useState<IndOpts>(() => {
    try { return { ...DEF_IND, ...JSON.parse(localStorage.getItem(IND_KEY) ?? "{}") }; }
    catch { return DEF_IND; }
  });
  const [indSnap,       setIndSnap]       = useState<Record<string, number>>({});
  const [autoSelecting, setAutoSelecting] = useState(false);
  const [autoResult,    setAutoResult]    = useState<AutoIndResult | null>(null);

  const p = PRESETS.find(x => x.id === preset)!;

  useEffect(() => {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ preset, capital, riskPct, leverage, allowShorts, symbol, extraSymbols, maxHoldMin, customTP, customSL, minVolume, maxPositions, simDays })); }
    catch { /* ignore */ }
  }, [preset, capital, riskPct, leverage, allowShorts, symbol, extraSymbols, maxHoldMin, customTP, customSL, minVolume, maxPositions, simDays]);

  useEffect(() => {
    try { localStorage.setItem(IND_KEY, JSON.stringify(indOpts)); } catch { /* ignore */ }
  }, [indOpts]);

  useEffect(() => {
    fetch("/api/bot/symbols").then(r => r.json()).then(data => {
      if (Array.isArray(data) && data.length > 0) setAvailSymbols(data);
    }).catch(() => {});
  }, []);

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

  // ── Indicator snap ─────────────────────────────────────────────────────────

  const fetchIndSnap = useCallback(async () => {
    try {
      const r = await fetch(`/api/bot/indicators?symbol=${symbol}`);
      if (!r.ok) return;
      const d = await r.json();
      if (d.ok) {
        const { ok: _ok, ...snap } = d;
        setIndSnap(snap as Record<string, number>);
      }
    } catch { /* ignore */ }
  }, [symbol]);

  useEffect(() => {
    fetchTicker();
    fetchStatus();
    fetchIndSnap();
    const t1 = setInterval(fetchTicker, 10_000);
    const t2 = setInterval(fetchStatus, 3_000);
    const t3 = setInterval(fetchIndSnap, 120_000);
    return () => { clearInterval(t1); clearInterval(t2); clearInterval(t3); };
  }, [fetchTicker, fetchStatus, fetchIndSnap]);

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
          symbol, symbols: Array.from(new Set([symbol, ...extraSymbols])),
          capital, riskPct, leverage, allowShorts, maxHoldMin, minVolume, maxPositions,
          rsiMin: p.rsiMin, rsiMax: p.rsiMax, adxMin: p.adxMin,
          confluenceMin: p.confluenceMin, volMultMin: p.volMultMin,
          cooldownMin: p.cooldownMin,
          stopLoss:   customSL > 0 ? customSL : p.stopLoss,
          takeProfit: customTP > 0 ? customTP : p.takeProfit,
          trailPct: p.trailPct,
          filters: indOpts,
        }),
      });
      if (!r.ok) { const e = await r.json(); alert(e.error ?? "Błąd startu bota"); return; }
    } else {
      await fetch("/api/bot/stop", { method: "POST" });
    }
    await fetchStatus();
  };

  const clearPosition = async () => {
    if (!confirm("Wyczyścić pozycję z bota? (NIE wysyła zlecenia na Krakena — tylko usuwa lokalny zapis fantomowej pozycji)")) return;
    try {
      await fetch("/api/bot/clear-position", { method: "POST" });
      await fetchStatus();
    } catch { /* ignore */ }
  };

  const [seasonality, setSeasonality] = useState<any>(null);
  const [seasonBusy, setSeasonBusy] = useState(false);
  const runSeasonality = async () => {
    setSeasonBusy(true);
    try {
      const r = await fetch("/api/bot/seasonality", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol }),
      });
      const d = await r.json();
      if (d.error) alert("Błąd: " + d.error);
      else setSeasonality(d);
    } catch (e: any) { alert("Błąd: " + e.message); }
    finally { setSeasonBusy(false); }
  };

  const [marginBusy, setMarginBusy] = useState(false);
  const closeMargin = async () => {
    if (!confirm("Zamknąć WSZYSTKIE pozycje margin na Krakenie? (wysyła prawdziwe zlecenia zamykające — kończy sieroty short i opłaty rollover)")) return;
    setMarginBusy(true);
    try {
      const r = await fetch("/api/bot/close-margin", { method: "POST" });
      const d = await r.json();
      if (d.error) alert(`Nie udało się odczytać pozycji margin:\n${d.error}\n\nDodaj uprawnienie „Query Open Positions" do klucza API na Krakenie, albo zamknij ręcznie w Kraken Pro → Pozycje.`);
      else alert(d.found === 0 ? "Brak otwartych pozycji margin — czysto ✅" : `Zamknięto ${d.closed}/${d.found} pozycji margin 🧹`);
      await fetchStatus();
    } catch (e: any) {
      alert("Błąd: " + e.message);
    } finally {
      setMarginBusy(false);
    }
  };

  const runSim = async () => {
    setSimRunning(true); setSimError(null); setSimResult(null); setOptResult(null);
    try {
      const r = await fetch("/api/bot/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol, leverage, allowShorts, days: simDays,
          rsiMin: p.rsiMin, rsiMax: p.rsiMax, adxMin: p.adxMin,
          confluenceMin: p.confluenceMin, volMultMin: p.volMultMin,
          cooldownMin: p.cooldownMin, stopLoss: p.stopLoss,
          takeProfit: p.takeProfit, trailPct: p.trailPct,
          filters: indOpts,
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
          symbol, leverage, allowShorts, days: simDays,
          adxMin: p.adxMin, confluenceMin: p.confluenceMin,
          volMultMin: p.volMultMin, cooldownMin: p.cooldownMin,
          stopLoss: p.stopLoss, takeProfit: p.takeProfit,
        }),
      });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error ?? "Błąd optymalizacji");
      setOptResult(d);
      try { localStorage.setItem("bot_opt_result", JSON.stringify(d)); } catch { /* ignore */ }
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
      const ro = await fetch("/api/bot/optimize", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol, leverage, allowShorts, days: simDays,
          adxMin: p.adxMin, confluenceMin: p.confluenceMin,
          volMultMin: p.volMultMin, cooldownMin: p.cooldownMin,
          stopLoss: p.stopLoss, takeProfit: p.takeProfit,
        }),
      });
      const opt = await ro.json();
      if (!ro.ok || opt.error) throw new Error(opt.error ?? "Błąd optymalizacji");
      setOptResult(opt);
      try { localStorage.setItem("bot_opt_result", JSON.stringify(opt)); } catch { /* ignore */ }

      const useOpt = (opt.confidence ?? 0) >= 40 && (opt.trainWinRate ?? 0) >= 45;
      const rs = await fetch("/api/bot/backtest", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol, leverage, allowShorts, days: simDays,
          rsiMin:   useOpt ? opt.rsiMin   : p.rsiMin,
          rsiMax:   useOpt ? opt.rsiMax   : p.rsiMax,
          trailPct: useOpt ? opt.trailPct : p.trailPct,
          stopLoss: useOpt ? opt.stopLoss : p.stopLoss,
          takeProfit: useOpt ? opt.takeProfit : p.takeProfit,
          adxMin: p.adxMin, confluenceMin: p.confluenceMin,
          volMultMin: p.volMultMin, cooldownMin: p.cooldownMin,
          filters: indOpts,
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

  const autoSelectFilters = async () => {
    setAutoSelecting(true);
    try {
      const r = await fetch("/api/bot/auto-indicators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol, leverage, allowShorts,
          rsiMin:   optResult?.rsiMin   ?? p.rsiMin,
          rsiMax:   optResult?.rsiMax   ?? p.rsiMax,
          adxMin:   p.adxMin,
          confluenceMin: 1, volMultMin: 1.0, cooldownMin: 30,
          stopLoss:   optResult?.stopLoss   ?? p.stopLoss,
          takeProfit: optResult?.takeProfit ?? p.takeProfit,
          trailPct:   optResult?.trailPct   ?? p.trailPct,
        }),
      });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error ?? "Błąd auto-doboru");
      setAutoResult(d);
      if (d.recommended?.length > 0) {
        const next = { ...DEF_IND };
        for (const k of d.recommended) { if (k in next) (next as any)[k] = true; }
        setIndOpts(next);
      }
    } catch (e: any) {
      setSimError(e.message);
    } finally {
      setAutoSelecting(false);
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
  const openPositions = botStatus?.positions ?? (position ? [position] : []);
  const dipStats = botStatus?.dipStats;
  const sess     = botStatus?.sessionStats;
  const keysOk   = hasKrakenKeys();
  const hasSnap  = Object.keys(indSnap).length > 0;
  const activeFilters = (Object.values(indOpts) as boolean[]).filter(Boolean).length;

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

        {/* ── Tab switcher ─────────────────────────────────────────────────── */}
        <div className="flex bg-[#0d1b12] border border-[#1e3a28] rounded-xl overflow-hidden">
          <button onClick={() => setTab("main")}
            className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${tab === "main" ? "bg-green-900/40 text-green-400" : "text-gray-500 hover:text-gray-300"}`}>
            Podstawowe
          </button>
          <button onClick={() => setTab("advanced")}
            className={`flex-1 py-2.5 text-xs font-semibold transition-colors flex items-center justify-center gap-1 ${tab === "advanced" ? "bg-green-900/40 text-green-400" : "text-gray-500 hover:text-gray-300"}`}>
            <span>Zaawansowane</span>
            {activeFilters > 0 && (
              <span className="bg-purple-600 text-white text-[9px] rounded-full px-1.5 py-0.5 font-bold">{activeFilters}</span>
            )}
          </button>
        </div>

        {/* ════════════════════ MAIN TAB ════════════════════ */}
        {tab === "main" && (<>

          {/* ── Live Trading ─────────────────────────────────────────────── */}
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

            {/* symbol — primary + optional extras, compact grid */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-400">Monitoruj</span>
                <button onClick={() => setExtraSymbols(availSymbols.map(s => s.symbol as Symbol).filter(s => s !== symbol))}
                  className="text-[10px] text-blue-400 hover:text-blue-300">wszystkie +</button>
              </div>
              <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto">
                {availSymbols.map(({ symbol: s, name }) => {
                  const isPrimary = s === symbol;
                  const isExtra = extraSymbols.includes(s as Symbol);
                  return (
                    <button key={s} onClick={() => {
                      if (isPrimary) {
                        const others = availSymbols.map(x => x.symbol as Symbol).filter(x => x !== s && !extraSymbols.includes(x));
                        if (others.length > 0) setSymbol(others[0]);
                      } else if (isExtra) {
                        setExtraSymbols(prev => prev.filter(x => x !== s));
                      } else {
                        setExtraSymbols(prev => [...prev, s as Symbol]);
                      }
                    }}
                      className={`text-[10px] px-1.5 py-1 rounded font-medium relative ${isPrimary ? "bg-green-700 text-white" : isExtra ? "bg-blue-800 text-white" : "bg-[#1a2e1f] text-gray-500"}`}>
                      {name}
                      {isPrimary && <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-green-400 rounded-full" />}
                      {isExtra && <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-blue-400 rounded-full" />}
                    </button>
                  );
                })}
              </div>
              <div className="text-[10px] text-gray-600 mt-0.5">
                {extraSymbols.length > 0 ? `● główny  ● +${extraSymbols.length} skanowanych` : "kliknij aby dodać do skanu"}
              </div>
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

            {/* risk per trade */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs text-gray-400">Ryzyko / transakcję</label>
                <span className="text-xs font-bold text-green-400">{riskPct}%
                  <span className="text-gray-500 font-normal ml-1">≈ ${(capital * riskPct / 100).toFixed(2)} USDT</span>
                </span>
              </div>
              <input type="range" min={5} max={100} step={5} value={riskPct}
                onChange={e => setRiskPct(Number(e.target.value))}
                className="w-full accent-green-500 cursor-pointer" />
              <div className="flex justify-between text-[10px] text-gray-600 mt-0.5">
                <span>5% (bezpieczny)</span><span>50% (normalny)</span><span>100% (all-in)</span>
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

            {/* close orphan margin positions */}
            <button onClick={closeMargin} disabled={marginBusy}
              className="w-full text-xs py-2 rounded-lg bg-red-900/30 border border-red-700/50 text-red-300 hover:bg-red-900/50 disabled:opacity-50">
              {marginBusy ? "Zamykam pozycje margin…" : "🧹 Zamknij sieroty margin (shorty + rollover)"}
            </button>

            {/* max hold time */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-400">Max czas trzymania pozycji</span>
                <span className="text-xs text-green-400">
                  {maxHoldMin === 0 ? "bez limitu (48h)" : maxHoldMin >= 60 ? `${maxHoldMin / 60}h` : `${maxHoldMin}min`}
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                {[
                  { v: 0, l: "∞" }, { v: 5, l: "5m" }, { v: 10, l: "10m" }, { v: 15, l: "15m" },
                  { v: 30, l: "30m" }, { v: 60, l: "1h" }, { v: 240, l: "4h" }, { v: 720, l: "12h" },
                ].map(({ v, l }) => (
                  <button key={v} onClick={() => setMaxHoldMin(v)}
                    className={`text-xs px-2.5 py-1 rounded font-medium ${maxHoldMin === v ? "bg-green-700 text-white" : "bg-[#1a2e1f] text-gray-400"}`}>
                    {l}
                  </button>
                ))}
              </div>
              <div className="text-[10px] text-gray-600 mt-0.5">
                Po tym czasie bot zamknie pozycję niezależnie od zysku/straty (scalping)
              </div>
            </div>

            {/* take profit selector */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-400">Cel zysku (sprzedaj przy +%)</span>
                <span className="text-xs text-green-400">
                  {customTP === 0 ? `auto (${p.takeProfit}%)` : `+${customTP}%`}
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                {[
                  { v: 0, l: "auto" }, { v: 1, l: "1%" }, { v: 2, l: "2%" }, { v: 3, l: "3%" },
                  { v: 5, l: "5%" }, { v: 8, l: "8%" }, { v: 10, l: "10%" },
                ].map(({ v, l }) => (
                  <button key={v} onClick={() => setCustomTP(v)}
                    className={`text-xs px-2.5 py-1 rounded font-medium ${customTP === v ? "bg-green-700 text-white" : "bg-[#1a2e1f] text-gray-400"}`}>
                    {l}
                  </button>
                ))}
              </div>
            </div>

            {/* stop loss selector */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-400">Limit straty (sprzedaj przy −%)</span>
                <span className="text-xs text-red-400">
                  {customSL === 0 ? `auto (${p.stopLoss}%)` : `−${customSL}%`}
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                {[
                  { v: 0, l: "auto" }, { v: 1, l: "1%" }, { v: 1.5, l: "1.5%" }, { v: 2, l: "2%" },
                  { v: 3, l: "3%" }, { v: 5, l: "5%" },
                ].map(({ v, l }) => (
                  <button key={v} onClick={() => setCustomSL(v)}
                    className={`text-xs px-2.5 py-1 rounded font-medium ${customSL === v ? "bg-red-800 text-white" : "bg-[#1a2e1f] text-gray-400"}`}>
                    {l}
                  </button>
                ))}
              </div>
              <div className="text-[10px] text-gray-600 mt-0.5">
                TP musi być &gt; 0.6% żeby pokryć opłaty (0.52% za transakcję)
              </div>
            </div>

            {/* liquidity filter */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-400">Filtr płynności (min. obrót 24h)</span>
                <span className="text-xs text-blue-400">
                  {minVolume === 0 ? "wył." : minVolume >= 1_000_000 ? `$${minVolume / 1_000_000}M` : `$${minVolume / 1000}k`}
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                {[
                  { v: 0, l: "wył." }, { v: 100_000, l: "$100k" }, { v: 500_000, l: "$500k" },
                  { v: 1_000_000, l: "$1M" }, { v: 5_000_000, l: "$5M" },
                ].map(({ v, l }) => (
                  <button key={v} onClick={() => setMinVolume(v)}
                    className={`text-xs px-2.5 py-1 rounded font-medium ${minVolume === v ? "bg-blue-700 text-white" : "bg-[#1a2e1f] text-gray-400"}`}>
                    {l}
                  </button>
                ))}
              </div>
              <div className="text-[10px] text-gray-600 mt-0.5">
                Bot pomija monety o małym obrocie (na nich „3%" z wykresu nie trafia do kieszeni)
              </div>
            </div>

            {/* max simultaneous positions */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-400">Pozycje naraz</span>
                <span className="text-xs text-green-400">{maxPositions} {maxPositions === 1 ? "pozycja" : "pozycje"}</span>
              </div>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} onClick={() => setMaxPositions(n)}
                    className={`flex-1 text-xs py-1.5 rounded font-medium ${maxPositions === n ? "bg-green-700 text-white" : "bg-[#1a2e1f] text-gray-400"}`}>
                    {n}
                  </button>
                ))}
              </div>
              <div className="text-[10px] text-gray-600 mt-0.5">
                Ile różnych monet bot trzyma jednocześnie. Kapitał dzieli się między nie.
              </div>
            </div>

            {/* open positions */}
            {openPositions.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-gray-500">OTWARTE POZYCJE ({openPositions.length}{botStatus?.maxPositions ? `/${botStatus.maxPositions}` : ""})</span>
                  <button onClick={() => clearPosition()}
                    className="text-[10px] px-2 py-0.5 rounded bg-red-900/40 border border-red-700/50 text-red-300 hover:bg-red-900/60">
                    🧹 wyczyść wszystkie
                  </button>
                </div>
                {openPositions.map((pos, i) => (
                  <div key={(pos.symbol ?? "") + i} className={`rounded-lg p-2.5 border ${pos.direction === "long" ? "bg-green-900/20 border-green-700/50" : "bg-red-900/20 border-red-700/50"}`}>
                    <div className="flex justify-between items-center">
                      <span className={`text-sm font-bold ${pos.direction === "long" ? "text-green-400" : "text-red-400"}`}>
                        {pos.symbol ? pos.symbol.replace("USDT", "") : "?"} {pos.direction.toUpperCase()}
                      </span>
                      <span className="text-sm text-white">@ ${fmtP(pos.entryPrice)}</span>
                      <span className="text-xs text-gray-400">qty {pos.qty}</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">SL {safe(pos.slPct)}% · TP {safe(pos.tpPct)}%</div>
                  </div>
                ))}
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

            {/* ── Student scoreboard (master's verdict) ── */}
            {running && sess && (() => {
              const n = (sess.wins ?? 0) + (sess.losses ?? 0);
              const wr = sess.winRate ?? 0;
              // Master's verdict: needs sample size AND edge to declare the student ready.
              let verdict: { text: string; color: string; emoji: string };
              if (n < 10)      verdict = { text: `Nauka trwa — ${n}/10 transakcji do pierwszej oceny`, color: "text-gray-300", emoji: "🥋" };
              else if (wr >= 55 && sess.avgWin + sess.avgLoss > 0) verdict = { text: "Uczeń ma przewagę — czas myśleć o skali", color: "text-emerald-300", emoji: "🏆" };
              else if (wr >= 45) verdict = { text: "Obiecująco — trzymaj kurs, zbieraj dane", color: "text-green-400", emoji: "📈" };
              else               verdict = { text: "Przewaga niepotwierdzona — nie dokładaj kapitału", color: "text-orange-400", emoji: "⚠️" };
              return (
                <div className="border border-[#2a4a30] rounded-lg p-2.5 space-y-2 bg-[#0d1a0f]">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500 font-semibold uppercase tracking-wide">🥋 Tablica Ucznia</span>
                    <span className={`text-xs font-bold ${botStatus!.sessionPnl >= 0 ? "text-green-400" : "text-red-400"}`}>{fmtPct(botStatus!.sessionPnl)} sesja</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5 text-center">
                    <div className="bg-[#1a2e1f] rounded p-1.5">
                      <div className="text-[9px] text-gray-500">WIN RATE</div>
                      <div className={`text-sm font-bold ${wr >= 50 ? "text-green-400" : "text-orange-400"}`}>{safe(wr, 0)}%</div>
                    </div>
                    <div className="bg-[#1a2e1f] rounded p-1.5">
                      <div className="text-[9px] text-gray-500">W / L</div>
                      <div className="text-sm font-bold text-white">{sess.wins ?? 0}/{sess.losses ?? 0}</div>
                    </div>
                    <div className="bg-[#1a2e1f] rounded p-1.5">
                      <div className="text-[9px] text-gray-500">ŚR. ZYSK</div>
                      <div className="text-sm font-bold text-green-400">+{safe(sess.avgWin, 1)}%</div>
                    </div>
                    <div className="bg-[#1a2e1f] rounded p-1.5">
                      <div className="text-[9px] text-gray-500">ŚR. STRATA</div>
                      <div className="text-sm font-bold text-red-400">{safe(sess.avgLoss, 1)}%</div>
                    </div>
                  </div>
                  {/* ── WZÓR MISTRZA: oczekiwana wartość (expectancy) ── */}
                  {(() => {
                    const lossRate = 100 - wr;
                    // E = Win% × ŚrZysk + Strata% × ŚrStrata (avgLoss już ujemny)
                    const E = (wr / 100) * (sess.avgWin ?? 0) + (lossRate / 100) * (sess.avgLoss ?? 0);
                    const Enet = E - 0.52; // po opłatach (0.52% round-trip)
                    return (
                      <div className="bg-[#0a140d] border border-[#1e3a28] rounded p-2">
                        <div className="text-[9px] text-gray-500 mb-0.5">🥋 WZÓR MISTRZA — oczekiwana wartość na transakcję</div>
                        <div className="text-[10px] text-gray-400 font-mono">
                          E = {safe(wr,0)}%×{safe(sess.avgWin,1)} {(sess.avgLoss ?? 0) < 0 ? "−" : "+"} {safe(100-wr,0)}%×{safe(Math.abs(sess.avgLoss ?? 0),1)}
                        </div>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-[10px] text-gray-500">E netto (po opłatach):</span>
                          <span className={`text-sm font-bold ${Enet > 0 ? "text-emerald-300" : "text-red-400"}`}>
                            {Enet >= 0 ? "+" : ""}{safe(Enet, 2)}% / trans.
                          </span>
                        </div>
                        <div className={`text-[10px] mt-0.5 ${Enet > 0 ? "text-emerald-400" : "text-orange-400"}`}>
                          {n < 10 ? "⏳ za mało danych — wzór nabiera sensu od 10+ transakcji"
                            : Enet > 0 ? "✅ Dodatnia E — matematyka pracuje DLA ciebie. Skaluj."
                            : "⚠️ Ujemna E — każda transakcja traci średnio. Zmień strategię, NIE kapitał."}
                        </div>
                      </div>
                    );
                  })()}
                  <div className={`text-[11px] ${verdict.color} flex items-start gap-1`}>
                    <span>{verdict.emoji}</span>
                    <span>{verdict.text}</span>
                  </div>
                  {n >= 10 && (
                    <div className="text-[10px] text-gray-600">
                      Max obsunięcie: -{safe(sess.maxDrawdown, 1)}% · próbka: {n} transakcji
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ── Market vision panel ── */}
            {running && (botStatus?.fearGreed || botStatus?.liveIndicators) && (() => {
              const fg  = botStatus?.fearGreed;
              const ind = botStatus?.liveIndicators;
              const cb  = botStatus?.circuitBreaker;
              const fgColor = !fg ? "text-gray-400"
                : fg.value <= 24 ? "text-red-500"
                : fg.value <= 44 ? "text-orange-400"
                : fg.value <= 55 ? "text-yellow-300"
                : fg.value <= 74 ? "text-green-400"
                : "text-emerald-300";
              const fgBar = !fg ? 0 : Math.round(fg.value);
              return (
                <div className="border border-[#2a4a30] rounded-lg p-2.5 space-y-2 bg-[#0d1a0f]">
                  <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Obraz rynku</div>
                  {/* Fear & Greed */}
                  {fg && (
                    <div className="space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-gray-400">Fear &amp; Greed</span>
                        <span className={`text-xs font-bold ${fgColor}`}>{fg.value} — {fg.label}</span>
                      </div>
                      <div className="w-full h-1.5 rounded bg-[#1a2e1f] overflow-hidden">
                        <div
                          className="h-full rounded transition-all"
                          style={{
                            width: `${fgBar}%`,
                            background: fgBar <= 24 ? "#ef4444" : fgBar <= 44 ? "#f97316" : fgBar <= 55 ? "#eab308" : fgBar <= 74 ? "#22c55e" : "#10b981",
                          }}
                        />
                      </div>
                    </div>
                  )}
                  {/* Layer 1 — multi-timeframe trend stack */}
                  {dipStats?.trendStack && Object.keys(dipStats.trendStack).length > 0 && (() => {
                    const score = dipStats.trendScore ?? 0;
                    const order: { k: string; label: string }[] = [
                      { k: "1", label: "1m" }, { k: "5", label: "5m" }, { k: "15", label: "15m" },
                      { k: "30", label: "30m" }, { k: "60", label: "1h" }, { k: "240", label: "4h" },
                    ];
                    const arrow = (t?: string) => t === "bull" ? "↑" : t === "bear" ? "↓" : "=";
                    const col = (t?: string) => t === "bull" ? "text-green-400" : t === "bear" ? "text-red-400" : "text-gray-500";
                    const scoreCol = score > 0.3 ? "text-green-400" : score < -0.3 ? "text-red-400" : "text-gray-400";
                    return (
                      <div className="space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-gray-400">Trend (multi-TF)</span>
                          <span className={`text-xs font-bold ${scoreCol}`}>{score >= 0 ? "+" : ""}{score.toFixed(2)}</span>
                        </div>
                        <div className="grid grid-cols-6 gap-1 text-center">
                          {order.map(({ k, label }) => (
                            <div key={k} className="bg-[#111f10] rounded p-1">
                              <div className="text-gray-500 text-[9px]">{label}</div>
                              <div className={`font-bold text-sm leading-none ${col(dipStats.trendStack?.[k])}`}>{arrow(dipStats.trendStack?.[k])}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                  {/* Live indicators grid */}
                  {ind && ind.rsi > 0 && (
                    <div className="grid grid-cols-3 gap-1 text-xs">
                      <div className="bg-[#111f10] rounded p-1.5 text-center">
                        <div className="text-gray-500 text-[10px]">RSI</div>
                        <div className={`font-bold ${ind.rsi < 35 ? "text-orange-400" : ind.rsi > 65 ? "text-red-400" : "text-white"}`}>{ind.rsi.toFixed(1)}</div>
                      </div>
                      <div className="bg-[#111f10] rounded p-1.5 text-center">
                        <div className="text-gray-500 text-[10px]">StochRSI</div>
                        <div className={`font-bold ${ind.stochRsi < 25 ? "text-orange-400" : ind.stochRsi > 75 ? "text-red-400" : "text-white"}`}>{ind.stochRsi.toFixed(0)}</div>
                      </div>
                      <div className="bg-[#111f10] rounded p-1.5 text-center">
                        <div className="text-gray-500 text-[10px]">BB %B</div>
                        <div className={`font-bold ${ind.bbPercB < 20 ? "text-green-400" : ind.bbPercB > 80 ? "text-red-400" : "text-white"}`}>{ind.bbPercB.toFixed(0)}</div>
                      </div>
                      <div className="bg-[#111f10] rounded p-1.5 text-center">
                        <div className="text-gray-500 text-[10px]">ADX</div>
                        <div className={`font-bold ${ind.adx >= 25 ? "text-green-400" : "text-gray-400"}`}>{ind.adx.toFixed(0)}</div>
                      </div>
                      <div className="bg-[#111f10] rounded p-1.5 text-center col-span-2">
                        <div className="text-gray-500 text-[10px]">VWAP 4h</div>
                        <div className="font-bold text-white">${ind.vwap > 0 ? ind.vwap.toFixed(0) : "—"}</div>
                      </div>
                    </div>
                  )}
                  {/* Market opinion */}
                  {dipStats?.marketOpinion && (
                    <div className="text-xs text-gray-400">
                      <span className="text-gray-500">Opinia: </span>{dipStats.marketOpinion.emoji} {dipStats.marketOpinion.text}
                    </div>
                  )}
                  {/* Circuit breaker */}
                  {cb?.active && (
                    <div className="text-xs text-red-400 font-medium">
                      🛑 Circuit breaker — {cb.consecutiveLosses} straty z rzędu · pauza do {cb.pauseUntil ? new Date(cb.pauseUntil).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" }) : "—"}
                    </div>
                  )}
                  {!cb?.active && cb && cb.consecutiveLosses > 0 && (
                    <div className="text-xs text-yellow-500">{cb.consecutiveLosses} stra{cb.consecutiveLosses === 1 ? "ta" : "ty"} z rzędu</div>
                  )}
                </div>
              );
            })()}

            {activeFilters > 0 && (
              <div className="text-xs text-purple-400">
                {activeFilters} filtrów aktywnych — <button onClick={() => setTab("advanced")} className="underline">Zaawansowane</button>
              </div>
            )}

            {optResult && optResult.trainWinRate >= 45 && optResult.trainReturn >= 0 && (
              <div className="text-xs text-green-400 font-medium">
                ✓ Wytrenowany — RSI [{optResult.rsiMin}–{optResult.rsiMax}] Trail {optResult.trailPct}%
              </div>
            )}

            {dipStats?.rangeMode   && running && <div className="text-xs text-yellow-400">⚠ Range mode</div>}
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

          {/* ── Risk presets ─────────────────────────────────────────────── */}
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

          {/* ── Seasonality / repeatability analysis ─────────────────────── */}
          <div className="bg-[#0d1b12] border border-[#1e3a28] rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">📅 Powtarzalność {symbol.replace("USDT", "")}</span>
              <button onClick={runSeasonality} disabled={seasonBusy}
                className="text-xs px-3 py-1.5 rounded-lg bg-blue-900/40 border border-blue-700/50 text-blue-300 hover:bg-blue-900/60 disabled:opacity-50">
                {seasonBusy ? "Analizuję…" : "Analizuj 2 lata"}
              </button>
            </div>
            {seasonality && (
              <div className="space-y-3">
                {/* day of week */}
                <div>
                  <div className="text-[10px] text-gray-500 mb-1">ŚREDNI ZWROT WG DNIA TYGODNIA ({seasonality.days} dni)</div>
                  <div className="grid grid-cols-7 gap-1">
                    {seasonality.byDay.map((d: any) => (
                      <div key={d.day} className="text-center">
                        <div className="text-[9px] text-gray-500">{d.day}</div>
                        <div className={`text-[11px] font-bold ${d.avgRet >= 0 ? "text-green-400" : "text-red-400"}`}>
                          {d.avgRet >= 0 ? "+" : ""}{d.avgRet}%
                        </div>
                        <div className="text-[8px] text-gray-600">{d.winRate}%↑</div>
                      </div>
                    ))}
                  </div>
                </div>
                {/* trend persistence */}
                <div className="bg-[#0a140d] border border-[#1e3a28] rounded p-2">
                  <div className="text-[10px] text-gray-500 mb-1">JAK DŁUGO TRZYMA SIĘ TREND (dni)</div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div className="text-[9px] text-gray-500">ŚR. WZROST</div>
                      <div className="text-sm font-bold text-green-400">{seasonality.trend.avgUpDays}d</div>
                      <div className="text-[8px] text-gray-600">max {seasonality.trend.maxUpDays}d</div>
                    </div>
                    <div>
                      <div className="text-[9px] text-gray-500">ŚR. SPADEK</div>
                      <div className="text-sm font-bold text-red-400">{seasonality.trend.avgDownDays}d</div>
                      <div className="text-[8px] text-gray-600">max {seasonality.trend.maxDownDays}d</div>
                    </div>
                    <div>
                      <div className="text-[9px] text-gray-500">ZMIAN/MIES</div>
                      <div className="text-sm font-bold text-yellow-400">{seasonality.trend.flipsPerMonth}</div>
                      <div className="text-[8px] text-gray-600">teraz {seasonality.trend.currentRun}d {seasonality.trend.currentDir === "up" ? "↑" : "↓"}</div>
                    </div>
                  </div>
                </div>
                {/* best/worst hours */}
                {(() => {
                  const sorted = [...seasonality.byHour].filter((h: any) => h.n > 0).sort((a: any, b: any) => b.avgRet - a.avgRet);
                  const best = sorted.slice(0, 3), worst = sorted.slice(-3).reverse();
                  return (
                    <div className="text-[10px] text-gray-500">
                      <span className="text-green-400">Najlepsze godz (UTC):</span> {best.map((h: any) => `${h.hour}:00`).join(", ")} ·{" "}
                      <span className="text-red-400">Najgorsze:</span> {worst.map((h: any) => `${h.hour}:00`).join(", ")}
                    </div>
                  );
                })()}
                <div className="text-[10px] text-orange-400/80 leading-tight">
                  ⚠️ Sezonowość to SŁABY sygnał — używaj jako kontekst, nie jako jedyny powód wejścia.
                </div>
              </div>
            )}
          </div>

          {/* ── Simulation & Optimization ─────────────────────────────────── */}
          <div className="bg-[#0d1b12] border border-[#1e3a28] rounded-xl p-4 space-y-3">
            {/* simulation window selector */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-400">Okno symulacji</span>
                <span className="text-xs text-green-400">{simDays}d {simDays <= 4 ? "(5m)" : simDays <= 10 ? "(15m)" : simDays <= 21 ? "(30m)" : "(1h)"}</span>
              </div>
              <div className="flex gap-1">
                {[3, 7, 14, 30].map(d => (
                  <button key={d} onClick={() => setSimDays(d)}
                    className={`flex-1 text-xs py-1.5 rounded font-medium ${simDays === d ? "bg-green-700 text-white" : "bg-[#1a2e1f] text-gray-400"}`}>
                    {d}d
                  </button>
                ))}
              </div>
              <div className="text-[10px] text-gray-600 mt-0.5">
                Dłuższe okno = grubsze świece (Kraken daje max ~720 świec na raz). 30d testuje na 1h.
              </div>
            </div>
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
                    { lbl: "WIN RATE", val: safe(simResult.winRate, 1) + "%",           ok: (simResult.winRate ?? 0) >= 50 },
                    { lbl: "ZWROT",    val: fmtPct(simResult.totalReturn),             ok: (simResult.totalReturn ?? 0) >= 0 },
                    { lbl: "DRAWDOWN", val: "-" + safe(simResult.maxDrawdown, 1) + "%",ok: false },
                    { lbl: "KAPITAŁ",  val: safe(simResult.finalEquity, 1),            ok: (simResult.finalEquity ?? 0) >= 100 },
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

                <label className="flex items-center justify-between cursor-pointer select-none pt-1 border-t border-[#1e3a28]">
                  <span className="text-xs text-gray-400">🧠 Auto-retrain co 24h (serwer)</span>
                  <div onClick={autoRetrainBusy ? undefined : toggleAutoRetrain}
                    className={`w-8 h-4 rounded-full transition-colors cursor-pointer ${autoRetrain ? "bg-green-500" : "bg-gray-600"} ${autoRetrainBusy ? "opacity-50" : ""}`}>
                    <span className={`block w-3.5 h-3.5 bg-white rounded-full m-0.5 shadow transition-transform ${autoRetrain ? "translate-x-4" : ""}`} />
                  </div>
                </label>

                {trainHistory.length > 0 && (
                  <button onClick={() => setShowHistory(x => !x)}
                    className="w-full text-xs text-gray-500 hover:text-gray-300 text-left">
                    {showHistory ? "▲ Ukryj historię treningów" : `▼ Historia treningów (${trainHistory.length})`}
                  </button>
                )}
              </div>
            )}

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

          {/* ── Activity Log ─────────────────────────────────────────────── */}
          <div className="bg-[#0d1b12] border border-[#1e3a28] rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-green-400" />
                <span className="text-sm font-semibold text-white">Activity Log</span>
                {running && <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const text = logs.map(l => `[${l.time}] ${l.msg}`).join("\n");
                    navigator.clipboard.writeText(text).then(() => alert("Skopiowano " + logs.length + " linii logu!"));
                  }}
                  className="text-xs text-green-500 hover:text-green-300 border border-green-800 rounded px-2 py-0.5"
                >
                  📋 Kopiuj
                </button>
                <button onClick={() => setShowLogs(x => !x)} className="text-xs text-gray-500 hover:text-gray-300">
                  {showLogs ? "Zwiń" : "Rozwiń"}
                </button>
              </div>
            </div>
            {showLogs && (
              <div ref={logsRef} className="space-y-1 max-h-52 overflow-y-auto">
                {!logs.length
                  ? <div className="text-xs text-gray-600">Brak logów — uruchom bota</div>
                  : logs.map((l, i) => (
                    <div key={i} className="text-xs flex gap-2 select-text">
                      <span className="text-gray-600 shrink-0 font-mono">{l.time}</span>
                      <span className={l.type === "buy" ? "text-green-400" : l.type === "sell" ? "text-red-400" : l.type === "warn" ? "text-yellow-400" : "text-gray-300"}>{l.msg}</span>
                    </div>
                  ))
                }
              </div>
            )}
          </div>

          {/* ── Trade History ─────────────────────────────────────────────── */}
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

        </>)}

        {/* ════════════════════ ADVANCED TAB ════════════════════ */}
        {tab === "advanced" && (<>

          {/* ── Auto-select ──────────────────────────────────────────────── */}
          <div className="bg-[#0d1b12] border border-[#1e3a28] rounded-xl p-4 space-y-3">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Auto-dobór filtrów</div>
            <div className="text-xs text-gray-500">
              Bot testuje każdy wskaźnik na ~18 dniach historii i wybiera te, które poprawiają wyniki.
            </div>
            <button onClick={autoSelectFilters} disabled={autoSelecting}
              className="w-full flex items-center justify-center gap-2 bg-purple-900/40 hover:bg-purple-900/60 border border-purple-600/60 text-purple-300 py-3 rounded-lg text-sm font-semibold disabled:opacity-50 transition-colors">
              <Zap className="w-4 h-4" />
              {autoSelecting ? "Analizuję wskaźniki…" : "🤖 Auto-dobór najlepszych filtrów"}
            </button>
            {autoResult && (
              <div className="text-xs space-y-1">
                <div className="text-gray-400">
                  Baseline: WR <span className={autoResult.baseline.winRate >= 50 ? "text-green-400" : "text-red-400"}>{autoResult.baseline.winRate}%</span>
                  {" "}· Zwrot {fmtPct(autoResult.baseline.totalReturn)} · {autoResult.baseline.numTrades} transakcji
                </div>
                {autoResult.recommended.length > 0 ? (
                  <div className="text-green-400">✓ Zastosowano {autoResult.recommended.length} filtrów poprawiających wyniki</div>
                ) : (
                  <div className="text-yellow-400">Brak filtrów z wyraźną poprawą na tych danych</div>
                )}
              </div>
            )}
            {activeFilters > 0 && (
              <button onClick={() => setIndOpts(DEF_IND)} className="text-xs text-gray-500 hover:text-red-400 underline">
                Wyłącz wszystkie filtry ({activeFilters})
              </button>
            )}
          </div>

          {/* ── 12 Indicator filter cards ────────────────────────────────── */}
          <div className="bg-[#0d1b12] border border-[#1e3a28] rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Filtry wskaźników wejścia</div>
              {hasSnap && <div className="text-[10px] text-gray-600">dane live</div>}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {IND_CARDS.map((card, idx) => {
                const isOn     = indOpts[card.key];
                const blocking = isOn && hasSnap && card.isBlocking(indSnap);
                const score    = autoResult?.scores[card.key];
                const isRec    = autoResult?.recommended.includes(card.key) ?? false;
                const borderCol = blocking ? "#ef4444" : isOn ? IND_COLORS[idx] : "#2a4a30";
                return (
                  <div key={card.key}
                    style={{ borderColor: borderCol }}
                    className={`rounded-xl border p-3 bg-[#0a1a0f] transition-all ${!isOn ? "opacity-60" : ""}`}>
                    <div className="flex justify-between items-start mb-1">
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] font-bold" style={{ color: IND_COLORS[idx] }}>#{card.num}</span>
                        {isRec && <span className="text-[9px] text-green-400 font-bold">★</span>}
                      </div>
                      <div onClick={() => setIndOpts(o => ({ ...o, [card.key]: !o[card.key] }))}
                        className={`w-7 h-3.5 rounded-full cursor-pointer shrink-0 transition-colors ${isOn ? "bg-green-500" : "bg-gray-600"}`}>
                        <span className={`block w-3 h-3 bg-white rounded-full m-0.5 shadow transition-transform ${isOn ? "translate-x-3.5" : ""}`} />
                      </div>
                    </div>
                    <div className="text-[11px] font-semibold text-white leading-tight">{card.name}</div>
                    <div className="text-[10px] text-gray-500 leading-tight mt-0.5">{card.desc}</div>
                    <div className={`text-[10px] font-mono mt-1 ${blocking ? "text-red-400" : "text-gray-400"}`}>
                      {hasSnap ? card.liveFn(indSnap) : "—"}
                    </div>
                    {score && (
                      <div className={`text-[9px] mt-0.5 ${score.delta > 0 ? "text-green-400" : "text-red-400"}`}>
                        {score.delta > 0 ? "+" : ""}{score.delta.toFixed(1)} · WR {score.winRate}%
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Risk management info ─────────────────────────────────────── */}
          <div className="bg-[#0d1b12] border border-[#1e3a28] rounded-xl p-4 space-y-3">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Zarządzanie ryzykiem</div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { num: 13, name: "RSI Exit", desc: `RSI>${(PRESETS.find(x => x.id === preset)?.rsiMax ?? 67) + 8} lub <${(PRESETS.find(x => x.id === preset)?.rsiMin ?? 36) - 8}`, on: true, color: "#14b8a6" },
                { num: 14, name: "Opłaty 0.52%", desc: "Kraken RT fee w symulacji", on: true, color: "#3b82f6" },
                { num: 15, name: "Stop Dzienny", desc: "Pauza przy -3% dziennej straty", on: true, color: "#eab308" },
                { num: 16, name: "Break-Even", desc: "SL → entry po 50% TP", on: true, color: "#a855f7" },
              ].map(card => (
                <div key={card.num} style={{ borderColor: card.color }}
                  className="rounded-xl border p-3 bg-[#0a1a0f]">
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-[10px] font-bold" style={{ color: card.color }}>#{card.num}</span>
                    <span className="text-[9px] text-green-400 font-bold px-1 bg-green-900/30 rounded">ON</span>
                  </div>
                  <div className="text-[11px] font-semibold text-white leading-tight">{card.name}</div>
                  <div className="text-[10px] text-gray-500 leading-tight mt-0.5">{card.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Run sim with current filters ─────────────────────────────── */}
          <button onClick={() => { setTab("main"); runSim(); }} disabled={simRunning}
            className="w-full flex items-center justify-center gap-2 bg-green-800/40 hover:bg-green-800/60 border border-green-600/60 text-green-300 py-3 rounded-lg text-sm font-semibold disabled:opacity-50">
            <FlaskConical className="w-4 h-4" />
            {simRunning ? "Symulacja…" : `🔬 Symuluj z ${activeFilters} filtrami`}
          </button>

        </>)}

      </div>
    </ResellLayout>
  );
}
