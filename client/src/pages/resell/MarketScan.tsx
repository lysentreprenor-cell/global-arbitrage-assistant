import React, { useState } from "react";
import { Globe, Package, Scale, RefreshCw, ChevronDown, ExternalLink, AlertTriangle, CheckCircle, Truck, ShieldCheck, Zap } from "lucide-react";
import { ResellLayout } from "@/components/resell/ResellLayout";
import { getAnthropicKey } from "@/lib/apiKeys";
import * as palette from "@/design/palette";

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
    <div style={{ background: palette.alpha(palette.ink.white, 0.03), border: `1px solid ${color}25`, borderRadius: 16, padding: 20, marginBottom: 16 }}>
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
  const [error, setError] = useState<string | null>(null);

  const runScan = async () => {
    if (scanning) return;
    setScanning(true);
    setResult(null);
    setError(null);

    for (let i = 0; i < SCAN_STEPS.length; i++) {
      setScanStep(SCAN_STEPS[i]);
      await new Promise(r => setTimeout(r, 500));
    }

    try {
      const res = await fetch("/api/market/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fromCountry, toCountry, category, budget: Number(budget) || 100, anthropicKey: getAnthropicKey() }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setResult(data);
      }
    } catch {
      setError("Connection error — check your internet connection.");
    }

    setScanStep("");
    setScanning(false);
  };

  return (
    <ResellLayout>
      <div style={{ padding: "28px 24px 60px", maxWidth: 900 }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: `linear-gradient(135deg, ${palette.info.base}, ${palette.info.strong})`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Globe size={18} color={palette.ink.white} />
            </div>
            <h1 style={{ color: palette.ink.white, fontSize: 24, fontWeight: 900, margin: 0, letterSpacing: -0.5 }}>
              Market Scanner
            </h1>
          </div>
          <p style={{ color: palette.alpha(palette.ink.white, 0.45), fontSize: 13, margin: 0 }}>
            Choose buy/sell countries and category — AI checks marketplaces, shipping, customs law, and returns policy.
          </p>
        </div>

        {/* Filters */}
        <div style={{ background: palette.alpha(palette.ink.white, 0.04), border: `1px solid ${palette.alpha(palette.ink.white, 0.08)}`, borderRadius: 16, padding: 20, marginBottom: 24 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 120px", gap: 12, marginBottom: 16 }}>
            {/* From */}
            <div>
              <div style={{ color: palette.alpha(palette.ink.white, 0.5), fontSize: 10, fontWeight: 700, letterSpacing: 0.8, marginBottom: 6 }}>BUY FROM</div>
              <div style={{ position: "relative" }}>
                <select
                  value={fromCountry}
                  onChange={e => setFromCountry(e.target.value)}
                  style={{
                    width: "100%", background: palette.alpha(palette.ink.black, 0.3), border: `1px solid ${palette.alpha(palette.ink.white, 0.12)}`,
                    borderRadius: 8, padding: "9px 32px 9px 12px", color: palette.ink.white, fontSize: 13,
                    appearance: "none", cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <ChevronDown size={14} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: palette.alpha(palette.ink.white, 0.3), pointerEvents: "none" }} />
              </div>
            </div>

            {/* To */}
            <div>
              <div style={{ color: palette.alpha(palette.ink.white, 0.5), fontSize: 10, fontWeight: 700, letterSpacing: 0.8, marginBottom: 6 }}>SELL TO</div>
              <div style={{ position: "relative" }}>
                <select
                  value={toCountry}
                  onChange={e => setToCountry(e.target.value)}
                  style={{
                    width: "100%", background: palette.alpha(palette.ink.black, 0.3), border: `1px solid ${palette.alpha(palette.ink.white, 0.12)}`,
                    borderRadius: 8, padding: "9px 32px 9px 12px", color: palette.ink.white, fontSize: 13,
                    appearance: "none", cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <ChevronDown size={14} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: palette.alpha(palette.ink.white, 0.3), pointerEvents: "none" }} />
              </div>
            </div>

            {/* Category */}
            <div>
              <div style={{ color: palette.alpha(palette.ink.white, 0.5), fontSize: 10, fontWeight: 700, letterSpacing: 0.8, marginBottom: 6 }}>CATEGORY</div>
              <div style={{ position: "relative" }}>
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  style={{
                    width: "100%", background: palette.alpha(palette.ink.black, 0.3), border: `1px solid ${palette.alpha(palette.ink.white, 0.12)}`,
                    borderRadius: 8, padding: "9px 32px 9px 12px", color: palette.ink.white, fontSize: 13,
                    appearance: "none", cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <ChevronDown size={14} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: palette.alpha(palette.ink.white, 0.3), pointerEvents: "none" }} />
              </div>
            </div>

            {/* Budget */}
            <div>
              <div style={{ color: palette.alpha(palette.ink.white, 0.5), fontSize: 10, fontWeight: 700, letterSpacing: 0.8, marginBottom: 6 }}>BUDGET ($)</div>
              <input
                type="number"
                value={budget}
                onChange={e => setBudget(e.target.value)}
                style={{
                  width: "100%", background: palette.alpha(palette.ink.black, 0.3), border: `1px solid ${palette.alpha(palette.ink.white, 0.12)}`,
                  borderRadius: 8, padding: "9px 12px", color: palette.ink.white, fontSize: 13,
                  fontFamily: "inherit", boxSizing: "border-box",
                }}
              />
            </div>
          </div>

          {/* Route preview */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <div style={{ background: palette.alpha(palette.ai.strong, 0.15), border: `1px solid ${palette.alpha(palette.ai.strong, 0.3)}`, borderRadius: 8, padding: "6px 14px", color: palette.ai.base, fontSize: 13, fontWeight: 700 }}>{fromCountry}</div>
            <div style={{ color: palette.alpha(palette.ink.white, 0.3), fontSize: 18 }}>→</div>
            <div style={{ background: palette.alpha(palette.profit.base, 0.15), border: `1px solid ${palette.alpha(palette.profit.base, 0.3)}`, borderRadius: 8, padding: "6px 14px", color: palette.profit.base, fontSize: 13, fontWeight: 700 }}>{toCountry}</div>
            <div style={{ color: palette.alpha(palette.ink.white, 0.3), fontSize: 12 }}>· {category} · budget ${budget}</div>
          </div>

          <button
            onClick={runScan}
            disabled={scanning}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "11px 24px", borderRadius: 10, border: "none", cursor: scanning ? "not-allowed" : "pointer",
              background: scanning ? palette.alpha(palette.brand.gold, 0.15) : `linear-gradient(135deg, ${palette.ai.strong}, ${palette.ai.deep})`,
              color: scanning ? palette.brand.goldSoft : palette.ink.white, fontWeight: 800, fontSize: 14,
              boxShadow: scanning ? "none" : `0 4px 18px ${palette.alpha(palette.ai.strong, 0.35)}`,
            }}
          >
            <RefreshCw size={15} style={{ animation: scanning ? "spin 1s linear infinite" : "none" }} />
            {scanning ? scanStep : "🔍 Scan Markets"}
          </button>
        </div>

        {/* Loading */}
        {scanning && (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <div style={{ color: palette.brand.gold, fontSize: 14, fontWeight: 700, marginBottom: 12 }}>{scanStep}</div>
            <div style={{ display: "flex", justifyContent: "center", gap: 6 }}>
              {[0, 1, 2, 3, 4].map(i => (
                <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: palette.ai.strong, animation: `bounce 1s ${i * 0.15}s infinite` }} />
              ))}
            </div>
          </div>
        )}

        {/* Error */}
        {error && !scanning && (
          <div style={{ background: palette.alpha(palette.loss.base, 0.08), border: `1px solid ${palette.alpha(palette.loss.base, 0.25)}`, borderRadius: 12, padding: "14px 18px", display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 16 }}>
            <AlertTriangle size={15} color={palette.loss.base} style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ color: palette.loss.soft, fontSize: 13 }}>{error}</div>
          </div>
        )}

        {/* Results */}
        {result && !scanning && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
              <CheckCircle size={16} color={palette.profit.base} />
              <span style={{ color: palette.profit.base, fontWeight: 700, fontSize: 14 }}>
                Results for {result.fromCountry} → {result.toCountry} · {result.category}
              </span>
              {result.source === "ai" && <span style={{ background: palette.alpha(palette.ai.strong, 0.2), border: `1px solid ${palette.alpha(palette.ai.strong, 0.4)}`, borderRadius: 99, padding: "2px 10px", color: palette.ai.base, fontSize: 11, fontWeight: 700 }}>AI</span>}
            </div>

            {/* TL;DR summary strip */}
            <div style={{ background: palette.alpha(palette.profit.base, 0.07), border: `1px solid ${palette.alpha(palette.profit.base, 0.2)}`, borderRadius: 14, padding: "14px 18px", marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
                <Zap size={13} color={palette.profit.base} />
                <span style={{ color: palette.profit.soft, fontSize: 11, fontWeight: 800, letterSpacing: 0.7 }}>QUICK SUMMARY</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
                <div style={{ background: palette.alpha(palette.ink.black, 0.2), borderRadius: 10, padding: "10px 14px" }}>
                  <div style={{ color: palette.alpha(palette.ink.white, 0.4), fontSize: 10, marginBottom: 3 }}>BEST PLATFORM</div>
                  <div style={{ color: palette.brand.goldSoft, fontWeight: 700, fontSize: 13 }}>{result.marketplaces[0]?.name ?? "—"}</div>
                  <div style={{ color: palette.alpha(palette.ink.white, 0.35), fontSize: 11 }}>Fee: {result.marketplaces[0]?.fee ?? "—"}</div>
                </div>
                <div style={{ background: palette.alpha(palette.ink.black, 0.2), borderRadius: 10, padding: "10px 14px" }}>
                  <div style={{ color: palette.alpha(palette.ink.white, 0.4), fontSize: 10, marginBottom: 3 }}>FASTEST SHIPPING</div>
                  <div style={{ color: palette.info.soft, fontWeight: 700, fontSize: 13 }}>{result.shipping.services[0]?.name ?? "—"}</div>
                  <div style={{ color: palette.alpha(palette.ink.white, 0.35), fontSize: 11 }}>{result.shipping.services[0]?.time ?? "—"} · {result.shipping.services[0]?.cost ?? "—"}</div>
                </div>
                <div style={{ background: palette.alpha(palette.ink.black, 0.2), borderRadius: 10, padding: "10px 14px" }}>
                  <div style={{ color: palette.alpha(palette.ink.white, 0.4), fontSize: 10, marginBottom: 3 }}>IMPORT DUTY</div>
                  <div style={{ color: palette.loss.soft, fontWeight: 700, fontSize: 13 }}>{result.legal.importDuty}</div>
                  <div style={{ color: palette.alpha(palette.ink.white, 0.35), fontSize: 11 }}>{result.legal.vatNote}</div>
                </div>
                <div style={{ background: palette.alpha(palette.ink.black, 0.2), borderRadius: 10, padding: "10px 14px" }}>
                  <div style={{ color: palette.alpha(palette.ink.white, 0.4), fontSize: 10, marginBottom: 3 }}>SHIPPING OK?</div>
                  <div style={{ color: result.shipping.feasible ? palette.profit.base : palette.loss.base, fontWeight: 700, fontSize: 13 }}>
                    {result.shipping.feasible ? "✓ Feasible" : "✗ Restricted"}
                  </div>
                  <div style={{ color: palette.alpha(palette.ink.white, 0.35), fontSize: 11 }}>
                    {result.shipping.restrictions.length > 0 ? `${result.shipping.restrictions.length} restriction(s)` : "No restrictions"}
                  </div>
                </div>
              </div>
            </div>

            {/* Marketplaces */}
            <Section icon={<Globe size={15} color={palette.brand.gold} />} title="MARKETPLACES &amp; SELLING PLATFORMS" color={palette.brand.gold}>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {result.marketplaces.map((m, i) => (
                  <a key={i} href={m.url} target="_blank" rel="noopener noreferrer" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: palette.alpha(palette.ink.black, 0.2), borderRadius: 10, padding: "12px 14px", textDecoration: "none" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ color: palette.brand.goldSoft, fontWeight: 700, fontSize: 14 }}>{m.name}</span>
                        <span style={{ background: palette.alpha(palette.profit.base, 0.15), border: `1px solid ${palette.alpha(palette.profit.base, 0.25)}`, borderRadius: 99, padding: "1px 8px", color: palette.profit.soft, fontSize: 10, fontWeight: 700 }}>Fee: {m.fee}</span>
                        <span style={{ background: palette.alpha(palette.info.base, 0.15), border: `1px solid ${palette.alpha(palette.info.base, 0.25)}`, borderRadius: 99, padding: "1px 8px", color: palette.info.soft, fontSize: 10 }}>Traffic: {m.traffic}</span>
                      </div>
                      <div style={{ color: palette.alpha(palette.ink.white, 0.55), fontSize: 12, marginTop: 4 }}>{m.note}</div>
                    </div>
                    <ExternalLink size={13} color={palette.alpha(palette.ink.white, 0.3)} style={{ flexShrink: 0, marginLeft: 10 }} />
                  </a>
                ))}
              </div>
            </Section>

            {/* Shipping */}
            <Section icon={<Truck size={15} color={palette.info.base} />} title="SHIPPING &amp; POSTAL SERVICES" color={palette.info.base}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <div style={{
                  padding: "4px 12px", borderRadius: 99,
                  background: result.shipping.feasible ? palette.alpha(palette.profit.base, 0.15) : palette.alpha(palette.loss.base, 0.15),
                  border: `1px solid ${result.shipping.feasible ? palette.alpha(palette.profit.base, 0.3) : palette.alpha(palette.loss.base, 0.3)}`,
                  color: result.shipping.feasible ? palette.profit.base : palette.loss.base, fontWeight: 700, fontSize: 12,
                }}>
                  {result.shipping.feasible ? "✓ Shipping feasible" : "✗ Shipping impossible or heavily restricted"}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
                {result.shipping.services.map((s, i) => (
                  <div key={i} style={{ background: palette.alpha(palette.ink.black, 0.2), borderRadius: 10, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <span style={{ color: palette.info.soft, fontWeight: 700, fontSize: 13 }}>{s.name}</span>
                      <span style={{ color: palette.alpha(palette.ink.white, 0.5), fontSize: 12, marginLeft: 10 }}>{s.note}</span>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 12 }}>
                      <div style={{ color: palette.profit.base, fontWeight: 700, fontSize: 13 }}>{s.cost}</div>
                      <div style={{ color: palette.alpha(palette.ink.white, 0.4), fontSize: 11 }}>{s.time}</div>
                    </div>
                  </div>
                ))}
              </div>
              {result.shipping.restrictions.length > 0 && (
                <div>
                  <div style={{ color: palette.alpha(palette.ink.white, 0.5), fontSize: 10, fontWeight: 700, letterSpacing: 0.8, marginBottom: 8 }}>SHIPPING RESTRICTIONS</div>
                  {result.shipping.restrictions.map((r, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, color: palette.brand.goldLight, fontSize: 12, marginBottom: 5 }}>
                      <AlertTriangle size={12} style={{ flexShrink: 0, marginTop: 2 }} /> {r}
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* Legal */}
            <Section icon={<Scale size={15} color={palette.loss.base} />} title="CUSTOMS &amp; LEGAL" color={palette.loss.base}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                <div style={{ background: palette.alpha(palette.ink.black, 0.2), borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ color: palette.alpha(palette.ink.white, 0.5), fontSize: 10, marginBottom: 4 }}>IMPORT DUTY</div>
                  <div style={{ color: palette.loss.soft, fontWeight: 700, fontSize: 14 }}>{result.legal.importDuty}</div>
                </div>
                <div style={{ background: palette.alpha(palette.ink.black, 0.2), borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ color: palette.alpha(palette.ink.white, 0.5), fontSize: 10, marginBottom: 4 }}>VAT / TAXES</div>
                  <div style={{ color: palette.loss.soft, fontWeight: 700, fontSize: 13 }}>{result.legal.vatNote}</div>
                </div>
              </div>
              <div style={{ background: palette.alpha(palette.ink.black, 0.2), borderRadius: 10, padding: "12px 14px", marginBottom: 10 }}>
                <div style={{ color: palette.alpha(palette.ink.white, 0.5), fontSize: 10, marginBottom: 6 }}>REQUIRED DOCUMENTS</div>
                <div style={{ display: "flex", flexWrap: "wrap" }}>
                  {result.legal.documentation.map((d, i) => <Pill key={i} text={d} color={palette.loss.base} />)}
                </div>
              </div>
              <div style={{ background: palette.alpha(palette.ink.black, 0.2), borderRadius: 10, padding: "12px 14px", marginBottom: 10 }}>
                <div style={{ color: palette.alpha(palette.ink.white, 0.5), fontSize: 10, marginBottom: 6 }}>BANNED / RESTRICTED ITEMS</div>
                <div style={{ display: "flex", flexWrap: "wrap" }}>
                  {result.legal.banned.map((b, i) => <Pill key={i} text={b} color={palette.brand.amber} />)}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8, color: palette.alpha(palette.ink.white, 0.7), fontSize: 12, background: palette.alpha(palette.loss.base, 0.08), borderRadius: 10, padding: "10px 14px" }}>
                <AlertTriangle size={13} color={palette.loss.base} style={{ flexShrink: 0, marginTop: 1 }} />
                {result.legal.customs}
              </div>
            </Section>

            {/* Returns */}
            <Section icon={<ShieldCheck size={15} color={palette.profit.mint} />} title="RETURNS &amp; BUYER PROTECTION" color={palette.profit.mint}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                {[
                  { label: "Seller obligation", val: result.returns.sellerObligation },
                  { label: "Buyer protection", val: result.returns.buyerProtection },
                  { label: "Warranty",          val: result.returns.warranty },
                ].map(x => (
                  <div key={x.label} style={{ background: palette.alpha(palette.ink.black, 0.2), borderRadius: 10, padding: "10px 14px" }}>
                    <div style={{ color: palette.alpha(palette.ink.white, 0.5), fontSize: 10, marginBottom: 4 }}>{x.label.toUpperCase()}</div>
                    <div style={{ color: palette.alpha(palette.ink.white, 0.85), fontSize: 13 }}>{x.val}</div>
                  </div>
                ))}
              </div>
              <div>
                <div style={{ color: palette.alpha(palette.ink.white, 0.5), fontSize: 10, fontWeight: 700, letterSpacing: 0.8, marginBottom: 8 }}>PRACTICAL TIPS</div>
                {result.returns.tips.map((t, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, color: palette.profit.mintSoft, fontSize: 12, marginBottom: 6 }}>
                    <CheckCircle size={12} style={{ flexShrink: 0, marginTop: 2 }} /> {t}
                  </div>
                ))}
              </div>
            </Section>
          </>
        )}

        {!result && !scanning && !error && (
          <div style={{ textAlign: "center", padding: "60px 0", color: palette.alpha(palette.ink.white, 0.25), fontSize: 14 }}>
            Select countries and click "Scan Markets" to analyse the route
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
        select option { background: #1a1a2e; color: #fff; }
        input::placeholder { color: rgba(255,255,255,0.2); }
      `}</style>
    </ResellLayout>
  );
}
