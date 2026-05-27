import React, { useState, useEffect } from "react";
import { Zap, Play, Square, RefreshCw, Clock, CheckCircle, AlertCircle, List, Settings2, BarChart2, ChevronRight } from "lucide-react";
import { ResellLayout } from "@/components/resell/ResellLayout";
import { getAnthropicKey, getUserLocation } from "@/lib/apiKeys";

const CATEGORIES = ["Clothing", "Jewelry", "Electronics", "Collectibles", "Sneakers", "Spirits", "Antiques", "Watches"];
const PLATFORMS = ["eBay USA", "Etsy USA", "StockX USA", "Amazon UK", "Amazon DE", "eBay DE", "Vinted EU", "Depop"];

interface StatusData {
  enabled: boolean;
  isScanning: boolean;
  lastScanAt: string | null;
  config: {
    intervalMinutes: number;
    minProfit: number;
    minMargin: number;
    maxBuyPrice: number;
    minBuyPrice: number;
    categories: string[];
    riskLevels: string[];
    sellPlatform: string;
    autoCreate: boolean;
  };
  log: Array<{ ts: string; type: string; message: string }>;
  stats: { totalCreated: number; totalProfit: number };
}

export default function AutopilotPage() {
  const [status, setStatus] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(false);
  const [scanNowLoading, setScanNowLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "config" | "log">("overview");

  // Config state (editable)
  const [intervalMinutes, setIntervalMinutes] = useState(30);
  const [minProfit, setMinProfit] = useState(30);
  const [minMargin, setMinMargin] = useState(25);
  const [minBuyPrice, setMinBuyPrice] = useState(5);
  const [maxBuyPrice, setMaxBuyPrice] = useState(300);
  const [selCategories, setSelCategories] = useState<string[]>([]);
  const [riskLevels, setRiskLevels] = useState<string[]>(["low", "medium"]);
  const [sellPlatform, setSellPlatform] = useState("eBay USA");
  const [autoCreate, setAutoCreate] = useState(true);

  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/autopilot/status");
      if (!res.ok) return;
      const data = await res.json() as StatusData;
      setStatus(data);
      // Sync config from server
      setIntervalMinutes(data.config.intervalMinutes);
      setMinProfit(data.config.minProfit);
      setMinMargin(data.config.minMargin);
      setMinBuyPrice(data.config.minBuyPrice);
      setMaxBuyPrice(data.config.maxBuyPrice);
      setSelCategories(data.config.categories);
      setRiskLevels(data.config.riskLevels);
      setSellPlatform(data.config.sellPlatform);
      setAutoCreate(data.config.autoCreate);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleStart = async () => {
    const aiKey = getAnthropicKey();
    if (!aiKey) { alert("Add Anthropic API key in Settings first"); return; }
    setLoading(true);
    try {
      await fetch("/api/autopilot/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          intervalMinutes, minProfit, minMargin, minBuyPrice, maxBuyPrice,
          categories: selCategories, riskLevels, sellPlatform, autoCreate,
          anthropicKey: aiKey,
          userLocation: getUserLocation(),
        }),
      });
      await fetchStatus();
    } finally { setLoading(false); }
  };

  const handleStop = async () => {
    setLoading(true);
    try {
      await fetch("/api/autopilot/stop", { method: "POST" });
      await fetchStatus();
    } finally { setLoading(false); }
  };

  const handleScanNow = async () => {
    setScanNowLoading(true);
    try {
      await fetch("/api/autopilot/scan-now", { method: "POST" });
      setTimeout(fetchStatus, 2000);
    } finally { setTimeout(() => setScanNowLoading(false), 2000); }
  };

  const toggleCategory = (cat: string) => {
    setSelCategories(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]);
  };
  const toggleRisk = (r: string) => {
    setRiskLevels(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]);
  };

  const logTypeColor = (type: string) => {
    if (type === "listing_created") return "#4ade80";
    if (type === "error") return "#f87171";
    if (type === "scan") return "#a78bfa";
    return "rgba(255,255,255,0.4)";
  };

  const inputStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 9, color: "#fff", fontSize: 13, padding: "8px 12px", outline: "none",
    width: "100%", boxSizing: "border-box",
  };
  const labelStyle: React.CSSProperties = { color: "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: 700, letterSpacing: 0.6, marginBottom: 5, display: "block" };

  const isRunning = status?.enabled ?? false;
  const isScanning = status?.isScanning ?? false;

  return (
    <ResellLayout>
      <div style={{ padding: "32px 28px 60px", maxWidth: 860 }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: isRunning ? "linear-gradient(135deg, #4ade80, #22c55e)" : "linear-gradient(135deg, #7c3aed, #8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Zap size={18} color="#fff" style={{ animation: isRunning ? "pulse 1.5s infinite" : "none" }} />
              </div>
              <div>
                <h1 style={{ color: "#fff", fontSize: 22, fontWeight: 900, margin: 0 }}>Autopilot</h1>
                <div style={{ color: isRunning ? "#4ade80" : "rgba(255,255,255,0.35)", fontSize: 12, fontWeight: 700 }}>
                  {isScanning ? "⚡ Scanning..." : isRunning ? `● Running — every ${intervalMinutes}min` : "○ Stopped"}
                </div>
              </div>
            </div>
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, margin: 0 }}>
              Auto-finds arbitrage opportunities, creates listings, and notifies you when orders arrive.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {isRunning && (
              <button onClick={handleScanNow} disabled={isScanning || scanNowLoading}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 10, border: "1px solid rgba(139,92,246,0.3)", background: "rgba(139,92,246,0.12)", color: "#a78bfa", fontWeight: 700, fontSize: 12, cursor: isScanning ? "not-allowed" : "pointer" }}>
                <RefreshCw size={13} style={{ animation: (isScanning || scanNowLoading) ? "spin 1s linear infinite" : "none" }} />
                Scan Now
              </button>
            )}
            <button
              onClick={isRunning ? handleStop : handleStart}
              disabled={loading || isScanning}
              style={{
                display: "flex", alignItems: "center", gap: 7, padding: "9px 18px", borderRadius: 10, border: "none", fontWeight: 800, fontSize: 13, cursor: "pointer",
                background: isRunning ? "rgba(248,113,113,0.15)" : "linear-gradient(135deg, #4ade80, #22c55e)",
                color: isRunning ? "#f87171" : "#000",
              }}
            >
              {isRunning ? <><Square size={13} /> Stop</> : <><Play size={13} /> Start Autopilot</>}
            </button>
          </div>
        </div>

        {/* Stats */}
        {status && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 24 }}>
            {[
              { label: "LISTINGS CREATED", val: status.stats.totalCreated, color: "#a78bfa" },
              { label: "ESTIMATED PROFIT", val: `+$${status.stats.totalProfit}`, color: "#4ade80" },
              { label: "LAST SCAN", val: status.lastScanAt ? new Date(status.lastScanAt).toLocaleTimeString() : "Never", color: "#f5c842" },
            ].map(s => (
              <div key={s.label} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "12px 16px" }}>
                <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 9, fontWeight: 700, letterSpacing: 0.8, marginBottom: 4 }}>{s.label}</div>
                <div style={{ color: s.color, fontSize: 20, fontWeight: 900 }}>{s.val}</div>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20, background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: 4 }}>
          {(["overview", "config", "log"] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700,
                background: activeTab === tab ? "rgba(139,92,246,0.25)" : "transparent",
                color: activeTab === tab ? "#c4b5fd" : "rgba(255,255,255,0.4)" }}>
              {tab === "overview" ? "Overview" : tab === "config" ? "⚙ Settings" : "📋 Log"}
            </button>
          ))}
        </div>

        {/* Overview tab */}
        {activeTab === "overview" && (
          <div>
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: 20, marginBottom: 16 }}>
              <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, fontWeight: 700, letterSpacing: 0.6, marginBottom: 12 }}>HOW IT WORKS</div>
              {[
                { icon: "🔍", title: "Auto-Scan", desc: `Every ${intervalMinutes} minutes, scans ${selCategories.length ? selCategories.join(", ") : "all categories"} for price gaps` },
                { icon: "📋", title: "Auto-List", desc: autoCreate ? `Automatically creates dropship listings for items with ≥$${minProfit} profit` : "Notifies you of opportunities without creating listings" },
                { icon: "💰", title: "Order Alert", desc: "When a customer orders, you get instant notification with buy instructions" },
                { icon: "🛒", title: "Fulfillment", desc: "Notification shows exactly what to buy and where to ship it" },
              ].map(step => (
                <div key={step.title} style={{ display: "flex", gap: 12, marginBottom: 14, alignItems: "flex-start" }}>
                  <div style={{ fontSize: 20, flexShrink: 0 }}>{step.icon}</div>
                  <div>
                    <div style={{ color: "#fff", fontWeight: 700, fontSize: 13 }}>{step.title}</div>
                    <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>{step.desc}</div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ background: "rgba(245,200,66,0.06)", border: "1px solid rgba(245,200,66,0.2)", borderRadius: 12, padding: 16 }}>
              <div style={{ color: "#f5c842", fontWeight: 700, fontSize: 12, marginBottom: 6 }}>⚡ Quick config</div>
              <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>
                Min profit: <strong style={{ color: "#fff" }}>${minProfit}</strong> ·
                Buy range: <strong style={{ color: "#fff" }}>${minBuyPrice}–${maxBuyPrice}</strong> ·
                Scan: <strong style={{ color: "#fff" }}>every {intervalMinutes}min</strong> ·
                {autoCreate ? " auto-creates listings" : " notify only"}
              </div>
              <button onClick={() => setActiveTab("config")} style={{ marginTop: 8, background: "none", border: "none", color: "#f5c842", fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 4 }}>
                Edit Settings <ChevronRight size={12} />
              </button>
            </div>
          </div>
        )}

        {/* Config tab */}
        {activeTab === "config" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Scan interval */}
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: 16 }}>
              <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: 700, marginBottom: 12 }}>SCAN SETTINGS</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                <div>
                  <label style={labelStyle}>INTERVAL (MIN)</label>
                  <input style={inputStyle} type="number" min="5" max="120" value={intervalMinutes} onChange={e => setIntervalMinutes(parseInt(e.target.value) || 30)} />
                </div>
                <div>
                  <label style={labelStyle}>MIN PROFIT ($)</label>
                  <input style={inputStyle} type="number" min="0" step="5" value={minProfit} onChange={e => setMinProfit(parseFloat(e.target.value) || 0)} />
                </div>
                <div>
                  <label style={labelStyle}>MIN MARGIN (%)</label>
                  <input style={inputStyle} type="number" min="0" max="100" value={minMargin} onChange={e => setMinMargin(parseFloat(e.target.value) || 0)} />
                </div>
              </div>
            </div>

            {/* Price range */}
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: 16 }}>
              <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: 700, marginBottom: 12 }}>PRICE RANGE (BUY PRICE)</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={labelStyle}>MIN BUY ($)</label>
                  <input style={inputStyle} type="number" min="0" value={minBuyPrice} onChange={e => setMinBuyPrice(parseFloat(e.target.value) || 0)} />
                </div>
                <div>
                  <label style={labelStyle}>MAX BUY ($)</label>
                  <input style={inputStyle} type="number" min="0" value={maxBuyPrice} onChange={e => setMaxBuyPrice(parseFloat(e.target.value) || 0)} />
                </div>
              </div>
            </div>

            {/* Categories */}
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: 16 }}>
              <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: 700, marginBottom: 10 }}>CATEGORIES (empty = all)</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                {CATEGORIES.map(cat => (
                  <button key={cat} onClick={() => toggleCategory(cat)}
                    style={{ padding: "5px 12px", borderRadius: 99, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600,
                      background: selCategories.includes(cat) ? "rgba(139,92,246,0.25)" : "rgba(255,255,255,0.06)",
                      color: selCategories.includes(cat) ? "#c4b5fd" : "rgba(255,255,255,0.4)" }}>
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Risk + Platform */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: 16 }}>
                <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: 700, marginBottom: 10 }}>RISK LEVEL</div>
                {["low", "medium", "high"].map(r => (
                  <button key={r} onClick={() => toggleRisk(r)}
                    style={{ display: "block", width: "100%", textAlign: "left", padding: "6px 10px", marginBottom: 4, borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600,
                      background: riskLevels.includes(r) ? (r === "low" ? "rgba(74,222,128,0.15)" : r === "medium" ? "rgba(245,200,66,0.1)" : "rgba(248,113,113,0.1)") : "rgba(255,255,255,0.04)",
                      color: riskLevels.includes(r) ? (r === "low" ? "#4ade80" : r === "medium" ? "#f5c842" : "#f87171") : "rgba(255,255,255,0.35)" }}>
                    {r === "low" ? "✓ Low" : r === "medium" ? "◆ Medium" : "⚠ High"}
                  </button>
                ))}
              </div>
              <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: 16 }}>
                <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: 700, marginBottom: 10 }}>SELL PLATFORM</div>
                <select value={sellPlatform} onChange={e => setSellPlatform(e.target.value)}
                  style={{ ...inputStyle, appearance: "none" as any, marginBottom: 12 }}>
                  {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                  <input type="checkbox" checked={autoCreate} onChange={e => setAutoCreate(e.target.checked)}
                    style={{ width: 16, height: 16, accentColor: "#8b5cf6" }} />
                  <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>Auto-create listings</span>
                </label>
              </div>
            </div>

            {/* Save button */}
            {isRunning && (
              <button onClick={handleStart}
                style={{ padding: "12px", borderRadius: 11, border: "none", background: "linear-gradient(135deg, #8b5cf6, #7c3aed)", color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
                Apply & Restart
              </button>
            )}
          </div>
        )}

        {/* Log tab */}
        {activeTab === "log" && (
          <div style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: 16, fontFamily: "monospace" }}>
            {!status?.log?.length ? (
              <div style={{ color: "rgba(255,255,255,0.2)", textAlign: "center", padding: "32px 0", fontSize: 13 }}>No activity yet — start autopilot to begin</div>
            ) : status.log.map((entry, i) => (
              <div key={i} style={{ display: "flex", gap: 12, marginBottom: 8, alignItems: "flex-start" }}>
                <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 10, flexShrink: 0, paddingTop: 1 }}>{new Date(entry.ts).toLocaleTimeString()}</span>
                <span style={{ color: logTypeColor(entry.type), fontSize: 11, flexShrink: 0 }}>
                  {entry.type === "listing_created" ? "✓" : entry.type === "error" ? "✗" : entry.type === "scan" ? "↻" : "·"}
                </span>
                <span style={{ color: logTypeColor(entry.type), fontSize: 12, lineHeight: 1.4 }}>{entry.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes spin { to { transform: rotate(360deg); } }
        input::placeholder { color: rgba(255,255,255,0.2); }
      `}</style>
    </ResellLayout>
  );
}
