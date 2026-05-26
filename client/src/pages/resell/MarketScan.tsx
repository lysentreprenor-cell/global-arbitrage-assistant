import React, { useState } from "react";
import { Globe, Package, Scale, RefreshCw, ChevronDown, ExternalLink, AlertTriangle, CheckCircle, Truck, ShieldCheck } from "lucide-react";
import { ResellLayout } from "@/components/resell/ResellLayout";

const COUNTRIES = [
  "Poland", "USA", "UK", "Germany", "France", "Canada", "Australia",
  "Japan", "UAE", "Kenya", "Nigeria", "South Africa", "India", "Brazil",
  "Netherlands", "Sweden", "Switzerland", "Mexico",
];

const CATEGORIES = ["General", "Clothing", "Electronics", "Jewelry", "Collectibles", "Sneakers", "Spirits", "Antiques", "Watches"];

const SCAN_STEPS = [
  "Connecting to marketplaces…",
  "Checking postal routes…",
  "Analysing customs laws…",
  "Checking return policies…",
  "Verifying shipping restrictions…",
  "Building report…",
];

type MarketResult = {
  source: string;
  fromCountry: string;
  toCountry: string;
  category: string;
  marketplaces: { name: string; url: string; fee: string; traffic: string; note: string }[];
  shipping: {
    feasible: boolean;
    services: { name: string; time: string; cost: string; note: string }[];
    restrictions: string[];
  };
  legal: {
    importDuty: string;
    vatNote: string;
    banned: string[];
    customs: string;
    documentation: string[];
  };
  returns: {
    sellerObligation: string;
    buyerProtection: string;
    warranty: string;
    tips: string[];
  };
};

function Section({ icon, title, color, children }: { icon: React.ReactNode; title: string; color: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${color}25`, borderRadius: 16, padding: 20, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        {icon}
        <span style={{ color, fontSize: 12, fontWeight: 800, letterSpacing: 0.8 }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

function Pill({ text, color }: { text: string; color: string }) {
  return (
    <span style={{
      display: "inline-block", padding: "3px 10px", borderRadius: 99,
      background: `${color}15`, border: `1px solid ${color}30`,
      color, fontSize: 11, fontWeight: 600, margin: "2px 4px 2px 0",
    }}>{text}</span>
  );
}

export default function MarketScan() {
  const [fromCountry, setFromCountry] = useState("Poland");
  const [toCountry, setToCountry] = useState("USA");
  const [category, setCategory] = useState("General");
  const [budget, setBudget] = useState("100");
  const [scanning, setScanning] = useState(false);
  const [scanStep, setScanStep] = useState("");
  const [result, setResult] = useState<MarketResult | null>(null);

  const runScan = async () => {
    if (scanning) return;
    setScanning(true);
    setResult(null);

    for (let i = 0; i < SCAN_STEPS.length; i++) {
      setScanStep(SCAN_STEPS[i]);
      await new Promise(r => setTimeout(r, 500));
    }

    try {
      const res = await fetch("/api/market/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fromCountry, toCountry, category, budget: Number(budget) || 100 }),
      });
      const data = await res.json();
      setResult(data);
    } catch {
      // keep null
    }

    setScanStep("");
    setScanning(false);
  };

  return (
    <ResellLayout>
      <div style={{ padding: "28px 24px 60px", maxWidth: 900 }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ color: "#fff", fontSize: 24, fontWeight: 900, margin: "0 0 6px", letterSpacing: -0.5 }}>
            Skanuj Rynki
          </h1>
          <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 13, margin: 0 }}>
            Wybierz kraj i kategorię — AI sprawdzi sklepy, wysyłkę, prawo i politykę zwrotów
          </p>
        </div>

        {/* Filters */}
        <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 20, marginBottom: 24 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 120px", gap: 12, marginBottom: 16 }}>
            {/* From */}
            <div>
              <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, fontWeight: 700, letterSpacing: 0.8, marginBottom: 6 }}>KRAJ ZAKUPU</div>
              <div style={{ position: "relative" }}>
                <select
                  value={fromCountry}
                  onChange={e => setFromCountry(e.target.value)}
                  style={{
                    width: "100%", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 8, padding: "9px 32px 9px 12px", color: "#fff", fontSize: 13,
                    appearance: "none", cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <ChevronDown size={14} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.3)", pointerEvents: "none" }} />
              </div>
            </div>

            {/* To */}
            <div>
              <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, fontWeight: 700, letterSpacing: 0.8, marginBottom: 6 }}>KRAJ SPRZEDAŻY</div>
              <div style={{ position: "relative" }}>
                <select
                  value={toCountry}
                  onChange={e => setToCountry(e.target.value)}
                  style={{
                    width: "100%", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 8, padding: "9px 32px 9px 12px", color: "#fff", fontSize: 13,
                    appearance: "none", cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <ChevronDown size={14} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.3)", pointerEvents: "none" }} />
              </div>
            </div>

            {/* Category */}
            <div>
              <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, fontWeight: 700, letterSpacing: 0.8, marginBottom: 6 }}>KATEGORIA</div>
              <div style={{ position: "relative" }}>
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  style={{
                    width: "100%", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 8, padding: "9px 32px 9px 12px", color: "#fff", fontSize: 13,
                    appearance: "none", cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <ChevronDown size={14} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.3)", pointerEvents: "none" }} />
              </div>
            </div>

            {/* Budget */}
            <div>
              <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, fontWeight: 700, letterSpacing: 0.8, marginBottom: 6 }}>BUDŻET ($)</div>
              <input
                type="number"
                value={budget}
                onChange={e => setBudget(e.target.value)}
                style={{
                  width: "100%", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 8, padding: "9px 12px", color: "#fff", fontSize: 13,
                  fontFamily: "inherit", boxSizing: "border-box",
                }}
              />
            </div>
          </div>

          {/* Route preview */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <div style={{ background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)", borderRadius: 8, padding: "6px 14px", color: "#a78bfa", fontSize: 13, fontWeight: 700 }}>{fromCountry}</div>
            <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 18 }}>→</div>
            <div style={{ background: "rgba(74,222,128,0.15)", border: "1px solid rgba(74,222,128,0.3)", borderRadius: 8, padding: "6px 14px", color: "#4ade80", fontSize: 13, fontWeight: 700 }}>{toCountry}</div>
            <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 12 }}>· {category}</div>
          </div>

          <button
            onClick={runScan}
            disabled={scanning}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "11px 24px", borderRadius: 10, border: "none", cursor: scanning ? "not-allowed" : "pointer",
              background: scanning ? "rgba(245,200,66,0.15)" : "linear-gradient(135deg, #8b5cf6, #7c3aed)",
              color: scanning ? "#fde68a" : "#fff", fontWeight: 800, fontSize: 14,
              boxShadow: scanning ? "none" : "0 4px 18px rgba(139,92,246,0.35)",
            }}
          >
            <RefreshCw size={15} style={{ animation: scanning ? "spin 1s linear infinite" : "none" }} />
            {scanning ? scanStep : "🔍 Sprawdź nowe sklepy"}
          </button>
        </div>

        {/* Loading dots */}
        {scanning && (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <div style={{ color: "#f5c842", fontSize: 14, fontWeight: 700, marginBottom: 12 }}>{scanStep}</div>
            <div style={{ display: "flex", justifyContent: "center", gap: 6 }}>
              {[0, 1, 2, 3, 4].map(i => (
                <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: "#8b5cf6", animation: `bounce 1s ${i * 0.15}s infinite` }} />
              ))}
            </div>
          </div>
        )}

        {/* Results */}
        {result && !scanning && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
              <CheckCircle size={16} color="#4ade80" />
              <span style={{ color: "#4ade80", fontWeight: 700, fontSize: 14 }}>
                Wyniki dla {result.fromCountry} → {result.toCountry} · {result.category}
              </span>
              {result.source === "ai" && <span style={{ background: "rgba(139,92,246,0.2)", border: "1px solid rgba(139,92,246,0.4)", borderRadius: 99, padding: "2px 10px", color: "#a78bfa", fontSize: 11, fontWeight: 700 }}>AI</span>}
            </div>

            {/* Marketplaces */}
            <Section icon={<Globe size={15} color="#f5c842" />} title="SKLEPY I PLATFORMY SPRZEDAŻY" color="#f5c842">
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {result.marketplaces.map((m, i) => (
                  <a key={i} href={m.url} target="_blank" rel="noopener noreferrer" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: "12px 14px", textDecoration: "none" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ color: "#fde68a", fontWeight: 700, fontSize: 14 }}>{m.name}</span>
                        <span style={{ background: "rgba(74,222,128,0.15)", border: "1px solid rgba(74,222,128,0.25)", borderRadius: 99, padding: "1px 8px", color: "#86efac", fontSize: 10, fontWeight: 700 }}>Prowizja: {m.fee}</span>
                        <span style={{ background: "rgba(96,165,250,0.15)", border: "1px solid rgba(96,165,250,0.25)", borderRadius: 99, padding: "1px 8px", color: "#93c5fd", fontSize: 10 }}>Ruch: {m.traffic}</span>
                      </div>
                      <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 12, marginTop: 4 }}>{m.note}</div>
                    </div>
                    <ExternalLink size={13} color="rgba(255,255,255,0.3)" style={{ flexShrink: 0, marginLeft: 10 }} />
                  </a>
                ))}
              </div>
            </Section>

            {/* Shipping */}
            <Section icon={<Truck size={15} color="#60a5fa" />} title="WYSYŁKA I POCZTA" color="#60a5fa">
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <div style={{
                  padding: "4px 12px", borderRadius: 99,
                  background: result.shipping.feasible ? "rgba(74,222,128,0.15)" : "rgba(248,113,113,0.15)",
                  border: `1px solid ${result.shipping.feasible ? "rgba(74,222,128,0.3)" : "rgba(248,113,113,0.3)"}`,
                  color: result.shipping.feasible ? "#4ade80" : "#f87171", fontWeight: 700, fontSize: 12,
                }}>
                  {result.shipping.feasible ? "✓ Wysyłka możliwa" : "✗ Wysyłka niemożliwa lub ograniczona"}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
                {result.shipping.services.map((s, i) => (
                  <div key={i} style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <span style={{ color: "#93c5fd", fontWeight: 700, fontSize: 13 }}>{s.name}</span>
                      <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, marginLeft: 10 }}>{s.note}</span>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 12 }}>
                      <div style={{ color: "#4ade80", fontWeight: 700, fontSize: 13 }}>{s.cost}</div>
                      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>{s.time}</div>
                    </div>
                  </div>
                ))}
              </div>
              {result.shipping.restrictions.length > 0 && (
                <div>
                  <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, fontWeight: 700, letterSpacing: 0.8, marginBottom: 8 }}>OGRANICZENIA WYSYŁKI</div>
                  {result.shipping.restrictions.map((r, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, color: "#fcd34d", fontSize: 12, marginBottom: 5 }}>
                      <AlertTriangle size={12} style={{ flexShrink: 0, marginTop: 2 }} /> {r}
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* Legal */}
            <Section icon={<Scale size={15} color="#f87171" />} title="PRAWO I CELNINA" color="#f87171">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, marginBottom: 4 }}>CŁO IMPORTOWE</div>
                  <div style={{ color: "#fca5a5", fontWeight: 700, fontSize: 14 }}>{result.legal.importDuty}</div>
                </div>
                <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, marginBottom: 4 }}>VAT / PODATKI</div>
                  <div style={{ color: "#fca5a5", fontWeight: 700, fontSize: 13 }}>{result.legal.vatNote}</div>
                </div>
              </div>
              <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: "12px 14px", marginBottom: 10 }}>
                <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, marginBottom: 6 }}>DOKUMENTY WYMAGANE</div>
                <div style={{ display: "flex", flexWrap: "wrap" }}>
                  {result.legal.documentation.map((d, i) => <Pill key={i} text={d} color="#f87171" />)}
                </div>
              </div>
              <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: "12px 14px", marginBottom: 10 }}>
                <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, marginBottom: 6 }}>PRZEDMIOTY ZAKAZANE</div>
                <div style={{ display: "flex", flexWrap: "wrap" }}>
                  {result.legal.banned.map((b, i) => <Pill key={i} text={b} color="#f59e0b" />)}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8, color: "rgba(255,255,255,0.7)", fontSize: 12, background: "rgba(248,113,113,0.08)", borderRadius: 10, padding: "10px 14px" }}>
                <AlertTriangle size={13} color="#f87171" style={{ flexShrink: 0, marginTop: 1 }} />
                {result.legal.customs}
              </div>
            </Section>

            {/* Returns */}
            <Section icon={<ShieldCheck size={15} color="#34d399" />} title="GWARANCJA I ZWROTY" color="#34d399">
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                {[
                  { label: "Obowiązek sprzedawcy", val: result.returns.sellerObligation },
                  { label: "Ochrona kupującego", val: result.returns.buyerProtection },
                  { label: "Gwarancja", val: result.returns.warranty },
                ].map(x => (
                  <div key={x.label} style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: "10px 14px" }}>
                    <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, marginBottom: 4 }}>{x.label.toUpperCase()}</div>
                    <div style={{ color: "rgba(255,255,255,0.85)", fontSize: 13 }}>{x.val}</div>
                  </div>
                ))}
              </div>
              <div>
                <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, fontWeight: 700, letterSpacing: 0.8, marginBottom: 8 }}>PORADY PRAKTYCZNE</div>
                {result.returns.tips.map((t, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, color: "#6ee7b7", fontSize: 12, marginBottom: 6 }}>
                    <CheckCircle size={12} style={{ flexShrink: 0, marginTop: 2 }} /> {t}
                  </div>
                ))}
              </div>
            </Section>
          </>
        )}

        {!result && !scanning && (
          <div style={{ textAlign: "center", padding: "60px 0", color: "rgba(255,255,255,0.25)", fontSize: 14 }}>
            Wybierz kraje i kliknij „Sprawdź nowe sklepy"
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
      `}</style>
    </ResellLayout>
  );
}
