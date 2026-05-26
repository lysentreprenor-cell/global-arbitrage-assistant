import React, { useState } from "react";
import { Search, TrendingUp, RefreshCw, Star, Clock, Users, ChevronDown, ExternalLink } from "lucide-react";
import { ResellLayout } from "@/components/resell/ResellLayout";
import { getAnthropicKey } from "@/lib/apiKeys";

const CATEGORIES = ["General", "Clothing", "Electronics", "Jewelry", "Collectibles", "Sneakers", "Spirits", "Antiques", "Watches", "Books", "Toys"];

const REGIONS = [
  { id: "world",  label: "Cały Świat",     flag: "🌍", desc: "Wszystkie globalne platformy" },
  { id: "europe", label: "Europa",          flag: "🇪🇺", desc: "eBay DE, Vinted, Allegro, Leboncoin…" },
  { id: "usa",    label: "USA / Kanada",    flag: "🇺🇸", desc: "eBay, Etsy, Amazon, Poshmark…" },
  { id: "africa", label: "Afryka",          flag: "🌍", desc: "Jumia, Jiji, OLX Africa, Kilimall…" },
  { id: "china",  label: "Chiny / Azja",   flag: "🇨🇳", desc: "Taobao, JD.com, Pinduoduo, Shopee…" },
  { id: "latam",  label: "Ameryka Łac.",   flag: "🌎", desc: "Mercado Libre, OLX Brazil…" },
];

const PLATFORM_LINKS: Record<string, string> = {
  "eBay USA": "https://www.ebay.com/sl/sell",
  "Etsy USA": "https://www.etsy.com/sell",
  "Amazon USA": "https://sell.amazon.com",
  "Amazon UK": "https://sell.amazon.co.uk",
  "eBay DE": "https://www.ebay.de/sl/sell",
  "Vinted EU": "https://www.vinted.com/sell-now",
  "Facebook Marketplace": "https://www.facebook.com/marketplace/create/item",
  "Depop": "https://www.depop.com/sell",
  "Poshmark": "https://poshmark.com/sell",
  "Mercari USA": "https://www.mercari.com/sell",
  "Jumia": "https://www.jumia.com/seller",
  "Jiji": "https://jiji.ng/post-ad",
  "Taobao": "https://sell.taobao.com",
  "Shopee": "https://seller.shopee.com",
  "Mercado Libre": "https://www.mercadolibre.com/sell",
  "Allegro": "https://allegro.pl/sprzedaj",
  "Leboncoin": "https://www.leboncoin.fr/deposer-une-annonce",
};

const COMPETITION_COLOR: Record<string, string> = { Low: "#4ade80", Medium: "#f5c842", High: "#f87171" };

type Platform = {
  platform: string; flag: string; avgSellPrice: number; feePercent: number;
  netProfit: number; netMargin: number; competition: string; avgDaysToSell: number;
  score: number; pros: string; cons: string; bestFor: string;
};

const SCAN_STEPS = ["Sprawdzam eBay USA…", "Sprawdzam Etsy…", "Sprawdzam Amazon…", "Sprawdzam eBay DE…", "Sprawdzam Vinted…", "Porównuję wyniki…"];

export default function PlatformCompare() {
  const [product, setProduct] = useState("");
  const [category, setCategory] = useState("General");
  const [buyPrice, setBuyPrice] = useState("20");
  const [region, setRegion] = useState("world");
  const [scanning, setScanning] = useState(false);
  const [scanStep, setScanStep] = useState("");
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [source, setSource] = useState<string>("");
  const [activeRegionResult, setActiveRegionResult] = useState<string>("");

  const run = async () => {
    if (!product.trim() || scanning) return;
    setScanning(true);
    setPlatforms([]);

    const regionLabel = REGIONS.find(r => r.id === region)?.label || region;
    const steps = [
      `Skanuję platformy — ${regionLabel}…`,
      "Sprawdzam ceny sprzedaży…",
      "Obliczam prowizje i zyski…",
      "Porównuję konkurencję…",
      "Szacuję czas sprzedaży…",
      "Buduję ranking…",
    ];

    for (let i = 0; i < steps.length; i++) {
      setScanStep(steps[i]);
      await new Promise(r => setTimeout(r, 400));
    }

    try {
      const res = await fetch("/api/compare", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ product, category, buyPrice: parseFloat(buyPrice) || 20, region, anthropicKey: getAnthropicKey() }),
      });
      const data = await res.json();
      setPlatforms(data.platforms || []);
      setSource(data.source || "");
      setActiveRegionResult(region);
    } catch {
      setPlatforms([]);
    }

    setScanStep("");
    setScanning(false);
  };

  const best = platforms[0];

  return (
    <ResellLayout>
      <div style={{ padding: "28px 24px 60px", maxWidth: 900 }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ color: "#fff", fontSize: 24, fontWeight: 900, margin: "0 0 4px" }}>Porównaj Platformy</h1>
          <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, margin: 0 }}>
            Wpisz produkt → AI sprawdza wszystkie sklepy i pokazuje gdzie zarobisz najwięcej
          </p>
        </div>

        {/* Region selector */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          {REGIONS.map(r => (
            <button
              key={r.id}
              onClick={() => setRegion(r.id)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "8px 14px", borderRadius: 10, cursor: "pointer", fontSize: 13,
                background: region === r.id ? "rgba(139,92,246,0.2)" : "rgba(255,255,255,0.05)",
                color: region === r.id ? "#a78bfa" : "rgba(255,255,255,0.5)",
                border: `1px solid ${region === r.id ? "rgba(139,92,246,0.4)" : "transparent"}`,
                fontWeight: region === r.id ? 700 : 500,
                transition: "all 0.15s",
              }}
              title={r.desc}
            >
              <span style={{ fontSize: 16 }}>{r.flag}</span>
              {r.label}
            </button>
          ))}
        </div>

        {/* Search form */}
        <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 20, marginBottom: 24 }}>
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, marginBottom: 14 }}>
            Region: <strong style={{ color: "#a78bfa" }}>{REGIONS.find(r => r.id === region)?.label}</strong>
            <span style={{ color: "rgba(255,255,255,0.25)", marginLeft: 8 }}>— {REGIONS.find(r => r.id === region)?.desc}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 160px 120px", gap: 12, marginBottom: 14 }}>
            <div>
              <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, fontWeight: 700, letterSpacing: 0.8, marginBottom: 6 }}>NAZWA PRODUKTU</div>
              <input
                value={product}
                onChange={e => setProduct(e.target.value)}
                onKeyDown={e => e.key === "Enter" && run()}
                placeholder="np. Levi's 501 W32, Leica M3, Baltic Amber…"
                style={{ width: "100%", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "9px 12px", color: "#fff", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }}
              />
            </div>
            <div>
              <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, fontWeight: 700, letterSpacing: 0.8, marginBottom: 6 }}>KATEGORIA</div>
              <div style={{ position: "relative" }}>
                <select value={category} onChange={e => setCategory(e.target.value)} style={{ width: "100%", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "9px 30px 9px 12px", color: "#fff", fontSize: 13, appearance: "none", cursor: "pointer", fontFamily: "inherit" }}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <ChevronDown size={13} style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.3)", pointerEvents: "none" }} />
              </div>
            </div>
            <div>
              <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, fontWeight: 700, letterSpacing: 0.8, marginBottom: 6 }}>KUPUJESZ ZA ($)</div>
              <input
                type="number"
                value={buyPrice}
                onChange={e => setBuyPrice(e.target.value)}
                style={{ width: "100%", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "9px 12px", color: "#fff", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }}
              />
            </div>
          </div>
          <button
            onClick={run}
            disabled={scanning || !product.trim()}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "11px 24px", borderRadius: 10, border: "none",
              cursor: scanning || !product.trim() ? "not-allowed" : "pointer",
              background: scanning ? "rgba(245,200,66,0.15)" : "linear-gradient(135deg, #8b5cf6, #7c3aed)",
              color: scanning ? "#fde68a" : "#fff", fontWeight: 800, fontSize: 14,
              boxShadow: scanning ? "none" : "0 4px 18px rgba(139,92,246,0.35)",
              opacity: !product.trim() ? 0.5 : 1,
            }}
          >
            <RefreshCw size={15} style={{ animation: scanning ? "spin 1s linear infinite" : "none" }} />
            {scanning ? scanStep : "🔍 Porównaj wszystkie platformy"}
          </button>
        </div>

        {/* Loading */}
        {scanning && (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <div style={{ color: "#f5c842", fontSize: 14, fontWeight: 700, marginBottom: 12 }}>{scanStep}</div>
            <div style={{ display: "flex", justifyContent: "center", gap: 6 }}>
              {[0,1,2,3,4].map(i => <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: "#8b5cf6", animation: `bounce 1s ${i*0.15}s infinite` }} />)}
            </div>
          </div>
        )}

        {/* Best pick banner */}
        {best && !scanning && (
          <div style={{ background: "linear-gradient(135deg, rgba(74,222,128,0.12), rgba(139,92,246,0.08))", border: "1px solid rgba(74,222,128,0.3)", borderRadius: 16, padding: "18px 22px", marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <Star size={16} color="#f5c842" fill="#f5c842" />
                <span style={{ color: "#f5c842", fontWeight: 800, fontSize: 13 }}>NAJLEPSZA OPCJA</span>
                {source === "ai" && <span style={{ background: "rgba(139,92,246,0.2)", border: "1px solid rgba(139,92,246,0.4)", borderRadius: 99, padding: "1px 8px", color: "#a78bfa", fontSize: 10, fontWeight: 700 }}>AI</span>}
              </div>
              <div style={{ color: "#fff", fontSize: 20, fontWeight: 900 }}>{best.flag} {best.platform}</div>
              <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, marginTop: 2 }}>
                Sprzedajesz za <strong style={{ color: "#fff" }}>${best.avgSellPrice}</strong> · Zysk: <strong style={{ color: "#4ade80" }}>+${best.netProfit} ({best.netMargin}%)</strong> · Czas: ~{best.avgDaysToSell} dni
              </div>
            </div>
            <a href={PLATFORM_LINKS[best.platform] || "#"} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 7, padding: "10px 18px", borderRadius: 10, background: "rgba(74,222,128,0.2)", border: "1px solid rgba(74,222,128,0.4)", color: "#4ade80", fontWeight: 700, fontSize: 13, textDecoration: "none" }}>
              Wystawiaj teraz <ExternalLink size={13} />
            </a>
          </div>
        )}

        {/* Comparison table */}
        {platforms.length > 0 && !scanning && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {platforms.map((p, idx) => {
              const compColor = COMPETITION_COLOR[p.competition] || "#fff";
              const isFirst = idx === 0;
              return (
                <div key={p.platform} style={{
                  background: isFirst ? "rgba(74,222,128,0.05)" : "rgba(255,255,255,0.02)",
                  border: `1px solid ${isFirst ? "rgba(74,222,128,0.2)" : "rgba(255,255,255,0.07)"}`,
                  borderRadius: 14, padding: "16px 18px",
                }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px 80px 80px 80px", gap: 8, alignItems: "center" }}>
                    {/* Platform name */}
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        {isFirst && <Star size={13} color="#f5c842" fill="#f5c842" />}
                        <span style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{p.flag} {p.platform}</span>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: `${p.score >= 80 ? "#4ade80" : p.score >= 60 ? "#f5c842" : "#f87171"}15`, border: `1px solid ${p.score >= 80 ? "#4ade80" : p.score >= 60 ? "#f5c842" : "#f87171"}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: p.score >= 80 ? "#4ade80" : p.score >= 60 ? "#f5c842" : "#f87171" }}>{p.score}</div>
                      </div>
                      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>{p.bestFor}</div>
                    </div>
                    {/* Avg sell price */}
                    <div>
                      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 9, marginBottom: 3 }}>CENA</div>
                      <div style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>${p.avgSellPrice}</div>
                    </div>
                    {/* Fee */}
                    <div>
                      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 9, marginBottom: 3 }}>PROWIZJA</div>
                      <div style={{ color: p.feePercent === 0 ? "#4ade80" : "rgba(255,255,255,0.7)", fontWeight: 700, fontSize: 14 }}>{p.feePercent}%</div>
                    </div>
                    {/* Net profit */}
                    <div>
                      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 9, marginBottom: 3 }}>ZYSK</div>
                      <div style={{ color: p.netProfit > 0 ? "#4ade80" : "#f87171", fontWeight: 700, fontSize: 14 }}>+${p.netProfit}</div>
                    </div>
                    {/* Days to sell */}
                    <div>
                      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 9, marginBottom: 3 }}>CZAS</div>
                      <div style={{ color: "rgba(255,255,255,0.7)", fontWeight: 700, fontSize: 13 }}>{p.avgDaysToSell}d</div>
                    </div>
                    {/* Competition */}
                    <div>
                      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 9, marginBottom: 3 }}>KONKUR.</div>
                      <span style={{ background: `${compColor}15`, border: `1px solid ${compColor}30`, borderRadius: 99, padding: "2px 8px", color: compColor, fontSize: 11, fontWeight: 700 }}>{p.competition}</span>
                    </div>
                  </div>

                  {/* Pros/cons + action */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.05)", flexWrap: "wrap", gap: 8 }}>
                    <div style={{ display: "flex", gap: 16 }}>
                      <span style={{ color: "#86efac", fontSize: 11 }}>✓ {p.pros}</span>
                      <span style={{ color: "#fca5a5", fontSize: 11 }}>✗ {p.cons}</span>
                    </div>
                    <a href={PLATFORM_LINKS[p.platform] || "#"} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 7, background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.6)", fontSize: 11, fontWeight: 700, textDecoration: "none" }}>
                      Wystawiaj <ExternalLink size={11} />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!scanning && platforms.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 0", color: "rgba(255,255,255,0.25)", fontSize: 14 }}>
            Wpisz nazwę produktu i kliknij „Porównaj wszystkie platformy"
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
        option { background: #0d1f0d; }
      `}</style>
    </ResellLayout>
  );
}
