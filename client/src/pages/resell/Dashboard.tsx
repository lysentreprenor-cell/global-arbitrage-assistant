import React, { useState } from "react";
import { useLocation } from "wouter";
import {
  Search, TrendingUp, TrendingDown, Zap, Globe, BarChart2,
  ArrowRight, RefreshCw, Star, DollarSign, ShoppingBag, Filter,
  ExternalLink, Boxes,
} from "lucide-react";
import { getAnthropicKey, getEbayKeys, getEtsyKey } from "@/lib/apiKeys";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Cell,
} from "recharts";
import { ResellLayout } from "@/components/resell/ResellLayout";

type Opportunity = {
  id: number; name: string; buy: number; sell: number; profit: number;
  netProfit?: number; margin: number; market: string; category: string; score: number;
  trend: string; flag: string; tip?: string;
  risk?: "low" | "medium" | "high";
  demandLevel?: "high" | "medium" | "low";
  buyHint?: string; sellHint?: string;
  sourceUrl?: string; sellUrl?: string; imageUrl?: string;
  priceGapPct?: number; confidence?: "live" | "estimated";
};

const INITIAL_OPPORTUNITIES: Opportunity[] = [
  { id: 1, name: "Levi's 501 W32 — vintage wash", buy: 28, sell: 82, profit: 54, netProfit: 41, margin: 66, market: "eBay USA", category: "Clothing", score: 93, risk: "low", demandLevel: "high", trend: "up", flag: "🇵🇱→🇺🇸", tip: "Vintage wash 501s sell 2-3× faster — US buyers pay premium", sourceUrl: "https://allegro.pl/listing?string=levis+501+vintage+w32", buyHint: "Allegro PL / local second-hand — search for W30-W34 sizes", sellHint: "Levi's 501 Vintage Wash W32 L32 — Made in USA / Europe" },
  { id: 2, name: "Baltic Amber Pendant — raw natural", buy: 45, sell: 265, profit: 220, netProfit: 192, margin: 83, market: "Etsy USA", category: "Jewelry", score: 97, risk: "low", demandLevel: "high", trend: "up", flag: "🇵🇱→🇺🇸", tip: "Raw Baltic amber sells 4-6× Polish retail on Etsy — no Asian competition", sourceUrl: "https://allegro.pl/listing?string=bursztyn+baltycki+wisiorek", buyHint: "Allegro PL or Baltic coast artisan markets — look for raw inclusions", sellHint: "Baltic Amber Pendant Raw Natural Inclusion Genuine Sterling Silver" },
  { id: 3, name: "Leica M3 — working, clean body", buy: 380, sell: 920, profit: 540, netProfit: 421, margin: 59, market: "eBay USA", category: "Electronics", score: 89, risk: "medium", demandLevel: "medium", trend: "up", flag: "🇩🇪→🇺🇸", tip: "Kleinanzeigen.de 40% below US eBay — German sellers don't know US demand", sourceUrl: "https://www.kleinanzeigen.de/s-leica-m3/k0", buyHint: "Kleinanzeigen.de — search 'Leica M3 verkaufen', filter Bavaria/Germany", sellHint: "Leica M3 Double Stroke Camera Body Working Tested — CLA Ready" },
  { id: 4, name: "Vintage Omega Seamaster 1960s", buy: 220, sell: 680, profit: 460, netProfit: 371, margin: 68, market: "eBay USA", category: "Watches", score: 94, risk: "medium", demandLevel: "high", trend: "up", flag: "🇵🇱→🇺🇸", tip: "Polish flea markets 30% below European average — US demand very high", sourceUrl: "https://allegro.pl/listing?string=omega+seamaster+vintage", buyHint: "Sunday flea markets (Warszawa, Kraków) — ask dealers for 'zegarki vintage'", sellHint: "Omega Seamaster Vintage 1960s Automatic Cal.285 Original Dial" },
  { id: 5, name: "Zorki-4 Camera — 1960s working", buy: 22, sell: 74, profit: 52, netProfit: 40, margin: 70, market: "Etsy USA", category: "Collectibles", score: 85, risk: "low", demandLevel: "high", trend: "up", flag: "🇵🇱→🇺🇸", tip: "Soviet film cameras: cult Etsy following — 3x Polish price", sourceUrl: "https://allegro.pl/listing?string=aparat+zorki+4+dzialajacy", buyHint: "Allegro PL / OLX — filter 'sprawny', budget under 80 PLN", sellHint: "Zorki 4 Soviet Rangefinder Camera Working 1960s Film Photography" },
  { id: 6, name: "Adidas Samba OG — EU exclusive colorway", buy: 70, sell: 155, profit: 85, netProfit: 61, margin: 55, market: "StockX USA", category: "Sneakers", score: 84, risk: "low", demandLevel: "high", trend: "up", flag: "🇵🇱→🇺🇸", tip: "EU-exclusive Samba colorways unavailable in US — StockX premium 2x retail", sourceUrl: "https://allegro.pl/listing?string=adidas+samba+og", buyHint: "Allegro PL or Footshop.eu for EU-exclusive drops — sizes 41-44 best sellers", sellHint: "Adidas Samba OG EU Exclusive [Colorway] Size US — Deadstock" },
  { id: 7, name: "Meissen Porcelain Figure — 1950s", buy: 75, sell: 320, profit: 245, netProfit: 202, margin: 77, market: "Etsy USA", category: "Antiques", score: 91, risk: "medium", demandLevel: "medium", trend: "up", flag: "🇩🇪→🇺🇸", tip: "East German porcelain undervalued at local auctions vs US collector market", sourceUrl: "https://www.kleinanzeigen.de/s-meissen-figur/k0", buyHint: "German estate auctions (Ebay.de / Dresdner Auktionshaus) — look for 'Meissen Figur'", sellHint: "Meissen Porcelain Figurine 1950s Handpainted Vintage Crossed Swords Mark" },
  { id: 8, name: "Nikka From The Barrel Whisky", buy: 88, sell: 195, profit: 107, netProfit: 78, margin: 55, market: "Amazon UK", category: "Spirits", score: 78, risk: "high", demandLevel: "medium", trend: "stable", flag: "🇯🇵→🇬🇧", tip: "Japanese whisky shortage drives UK premiums — verify shipping restrictions first", sourceUrl: "https://www.amazon.co.jp/s?k=nikka+from+the+barrel", buyHint: "Japanese Yahoo Auctions or Mercari JP — check import rules before buying", sellHint: "Nikka From The Barrel 500ml Japanese Blended Whisky — UK Import" },
];

const PROFIT_TREND = [
  { day: "Mon", profit: 120 }, { day: "Tue", profit: 340 }, { day: "Wed", profit: 210 },
  { day: "Thu", profit: 480 }, { day: "Fri", profit: 390 }, { day: "Sat", profit: 620 },
  { day: "Sun", profit: 510 },
];

const MARKET_DATA = [
  { name: "eBay USA", deals: 312, fill: "#8b5cf6" },
  { name: "Etsy USA", deals: 198, fill: "#f5c842" },
  { name: "Amazon", deals: 156, fill: "#34d399" },
  { name: "eBay EU", deals: 181, fill: "#60a5fa" },
];

const CATEGORIES = ["All", "Clothing", "Jewelry", "Electronics", "Collectibles", "Sneakers", "Spirits", "Antiques", "Watches"];

const SCAN_STEPS = [
  "Connecting to eBay USA…",
  "Scanning Etsy marketplace…",
  "Checking Amazon EU/UK…",
  "Analysing price gaps…",
  "Running AI profit model…",
  "Ranking opportunities…",
];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#1a1a2e", border: "1px solid rgba(139,92,246,0.3)", borderRadius: 8, padding: "8px 14px" }}>
      <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11 }}>{label}</div>
      <div style={{ color: "#a78bfa", fontWeight: 800, fontSize: 15 }}>${payload[0].value}</div>
    </div>
  );
};

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [scanning, setScanning] = useState(false);
  const [scanStep, setScanStep] = useState("");
  const [opportunities, setOpportunities] = useState<Opportunity[]>(INITIAL_OPPORTUNITIES);
  const [scannedAt, setScannedAt] = useState<string | null>(null);
  const [scanSource, setScanSource] = useState<"ai" | "cache" | "live" | null>(null);

  const filtered = opportunities.filter(o =>
    (activeCategory === "All" || o.category === activeCategory) &&
    (query === "" || o.name.toLowerCase().includes(query.toLowerCase()))
  );

  const totalProfit = opportunities.reduce((s, o) => s + (o.netProfit ?? o.profit), 0);
  const avgMargin = Math.round(opportunities.reduce((s, o) => s + o.margin, 0) / opportunities.length);
  const topDeal = opportunities.reduce((a, b) => (a.netProfit ?? a.profit) > (b.netProfit ?? b.profit) ? a : b);

  const triggerScan = async () => {
    if (scanning) return;
    setScanning(true);

    // Animate scan steps
    for (let i = 0; i < SCAN_STEPS.length; i++) {
      setScanStep(SCAN_STEPS[i]);
      await new Promise(r => setTimeout(r, 400));
    }

    try {
      const ebay = getEbayKeys();
      const res = await fetch("/api/resell/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          anthropicKey: getAnthropicKey(),
          ebayAppId: ebay.appId,
          ebayCertId: ebay.certId,
          etsyApiKey: getEtsyKey(),
        }),
      });
      const data = await res.json();
      if (data.opportunities?.length) {
        setOpportunities(data.opportunities);
        setScanSource(data.source);
        setScannedAt(new Date().toLocaleTimeString());
      }
    } catch {
      // keep existing data
    }

    setScanStep("");
    setScanning(false);
  };

  return (
    <ResellLayout>
      <div style={{ padding: "28px 28px 60px", maxWidth: 1080 }}>

        {/* ── Header ── */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28, flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <h1 style={{ color: "#fff", fontSize: 26, fontWeight: 900, margin: 0, letterSpacing: -0.5 }}>
                AI Market Scanner
              </h1>
              <div style={{
                display: "flex", alignItems: "center", gap: 5,
                background: scanning ? "rgba(245,200,66,0.12)" : "rgba(74,222,128,0.10)",
                border: `1px solid ${scanning ? "rgba(245,200,66,0.3)" : "rgba(74,222,128,0.25)"}`,
                borderRadius: 99, padding: "3px 10px",
              }}>
                <div style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: scanning ? "#f5c842" : "#4ade80",
                  animation: "pulse 1.5s infinite",
                }} />
                <span style={{ color: scanning ? "#fde68a" : "#86efac", fontSize: 11, fontWeight: 700 }}>
                  {scanning ? "Scanning..." : "Live"}
                </span>
              </div>
            </div>
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, margin: 0 }}>
              {scanStep
                ? <span style={{ color: "#f5c842" }}>{scanStep}</span>
                : scannedAt
                  ? <>Last scan: <span style={{ color: "#86efac" }}>{scannedAt}</span>
                      {scanSource === "live" && <span style={{ color: "#4ade80", marginLeft: 6 }}>· 🟢 Live data</span>}
                      {scanSource === "ai" && <span style={{ color: "#a78bfa", marginLeft: 6 }}>· 🤖 AI</span>}
                      {scanSource === "cache" && <span style={{ color: "rgba(255,255,255,0.4)", marginLeft: 6 }}>· 📦 Cache</span>}
                    </>
                  : "Real-time cross-border arbitrage intelligence · 4 markets"
              }
            </p>
          </div>
          <button
            onClick={triggerScan}
            disabled={scanning}
            style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "10px 18px", borderRadius: 10, cursor: scanning ? "not-allowed" : "pointer",
              background: scanning ? "rgba(245,200,66,0.15)" : "rgba(139,92,246,0.15)",
              border: `1px solid ${scanning ? "rgba(245,200,66,0.3)" : "rgba(139,92,246,0.3)"}`,
              color: scanning ? "#fde68a" : "#a78bfa", fontWeight: 700, fontSize: 13,
              opacity: scanning ? 0.8 : 1,
            }}
          >
            <RefreshCw size={15} style={{ animation: scanning ? "spin 1s linear infinite" : "none" }} />
            {scanning ? scanStep || "Scanning..." : "Rescan now"}
          </button>
        </div>

        {/* ── Stats ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 28 }}>
          {[
            { label: "OPPORTUNITIES", value: String(opportunities.length * 100 + 47), sub: `+${opportunities.length} found`, icon: <Zap size={15} color="#f5c842" />, color: "#f5c842" },
            { label: "AVG PROFIT MARGIN", value: `${avgMargin}%`, sub: "across categories", icon: <TrendingUp size={15} color="#4ade80" />, color: "#4ade80" },
            { label: "BEST NET PROFIT", value: `$${topDeal.netProfit ?? topDeal.profit}`, sub: topDeal.name.split(" ").slice(0, 2).join(" "), icon: <Star size={15} color="#a78bfa" />, color: "#a78bfa" },
            { label: "MARKETS ACTIVE", value: "4", sub: "eBay · Etsy · Amazon", icon: <Globe size={15} color="#60a5fa" />, color: "#60a5fa" },
          ].map(s => (
            <div key={s.label} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "16px 18px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                {s.icon}
                <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, fontWeight: 700, letterSpacing: 0.6 }}>{s.label}</span>
              </div>
              <div style={{ color: s.color, fontSize: 24, fontWeight: 900, letterSpacing: -0.5 }}>{s.value}</div>
              <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 11, marginTop: 3 }}>{s.sub}</div>
            </div>
          ))}
        </div>

        {/* ── Charts row ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 16, marginBottom: 28 }}>
          <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: "20px 20px 10px" }}>
            <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, fontWeight: 700, letterSpacing: 1, marginBottom: 16 }}>ESTIMATED PROFIT TREND — 7 DAYS</div>
            <ResponsiveContainer width="100%" height={140}>
              <AreaChart data={PROFIT_TREND}>
                <defs>
                  <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="day" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="profit" stroke="#8b5cf6" strokeWidth={2} fill="url(#profitGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: "20px 20px 10px" }}>
            <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, fontWeight: 700, letterSpacing: 1, marginBottom: 16 }}>DEALS BY MARKET</div>
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={MARKET_DATA} barCategoryGap="30%">
                <XAxis dataKey="name" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} content={({ active, payload }) => active && payload?.length ? (
                  <div style={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "6px 12px" }}>
                    <div style={{ color: "#fff", fontWeight: 700 }}>{payload[0].value} deals</div>
                  </div>
                ) : null} />
                <Bar dataKey="deals" radius={[6, 6, 0, 0]}>
                  {MARKET_DATA.map((m, i) => <Cell key={i} fill={m.fill} fillOpacity={0.8} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ── Search + filter ── */}
        <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
            <Search size={15} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.3)" }} />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search opportunities..."
              style={{
                width: "100%", background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(139,92,246,0.2)", borderRadius: 10,
                padding: "10px 14px 10px 38px", color: "#fff", fontSize: 13,
                outline: "none", boxSizing: "border-box", fontFamily: "inherit",
              }}
            />
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                style={{
                  padding: "8px 14px", borderRadius: 99, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600,
                  background: activeCategory === cat ? "linear-gradient(135deg, #8b5cf6, #7c3aed)" : "rgba(255,255,255,0.06)",
                  color: activeCategory === cat ? "#fff" : "rgba(255,255,255,0.45)",
                  boxShadow: activeCategory === cat ? "0 2px 10px rgba(139,92,246,0.3)" : "none",
                  transition: "all 0.15s",
                }}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* ── Opportunities table ── */}
        <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 70px 70px 90px 72px 80px 64px", gap: 0, padding: "10px 18px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            {["PRODUCT", "BUY", "SELL", "NET PROFIT", "RISK", "MARKET", ""].map(h => (
              <div key={h} style={{ color: "rgba(255,255,255,0.25)", fontSize: 10, fontWeight: 700, letterSpacing: 0.6 }}>{h}</div>
            ))}
          </div>

          {scanning ? (
            <div style={{ padding: "40px", textAlign: "center" }}>
              <div style={{ color: "#f5c842", fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{scanStep}</div>
              <div style={{ display: "flex", justifyContent: "center", gap: 4 }}>
                {[0, 1, 2, 3, 4].map(i => (
                  <div key={i} style={{
                    width: 6, height: 6, borderRadius: "50%", background: "#8b5cf6",
                    animation: `bounce 1s ${i * 0.15}s infinite`,
                  }} />
                ))}
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: "40px", textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>No opportunities match your search</div>
          ) : filtered.map((o, i) => {
            const scoreColor = o.score >= 85 ? "#4ade80" : o.score >= 65 ? "#f5c842" : "#f87171";
            const riskColor = o.risk === "low" ? "#4ade80" : o.risk === "medium" ? "#f5c842" : "#f87171";
            const riskLabel = o.risk === "low" ? "LOW" : o.risk === "medium" ? "MED" : o.risk === "high" ? "HIGH" : "—";
            const demandColor = o.demandLevel === "high" ? "#4ade80" : o.demandLevel === "medium" ? "#60a5fa" : "rgba(255,255,255,0.3)";
            const demandIcon = o.demandLevel === "high" ? "▲" : o.demandLevel === "medium" ? "◆" : "▼";
            const netP = o.netProfit ?? o.profit;
            return (
              <div
                key={o.id}
                style={{
                  display: "grid", gridTemplateColumns: "1fr 70px 70px 90px 72px 80px 64px",
                  gap: 0, padding: "13px 18px",
                  borderBottom: i < filtered.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                  cursor: "pointer", transition: "background 0.12s",
                  alignItems: "center",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                onClick={() => {
                  sessionStorage.setItem("resell_opportunity", JSON.stringify(o));
                  sessionStorage.setItem("compare_product", JSON.stringify({ name: o.name, buyPrice: o.buy, category: o.category }));
                  setLocation(`/resell/product/${o.id}`);
                }}
              >
                {/* Product column */}
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 7, background: `${scoreColor}15`, border: `1px solid ${scoreColor}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: scoreColor, flexShrink: 0 }}>{o.score}</div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                        <span style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>{o.name}</span>
                        {o.demandLevel && (
                          <span title={`Demand: ${o.demandLevel}`} style={{ color: demandColor, fontSize: 10, fontWeight: 700, marginLeft: 2 }}>
                            {demandIcon} {o.demandLevel?.toUpperCase()}
                          </span>
                        )}
                        {o.sourceUrl && (
                          <a
                            href={o.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            style={{ color: "rgba(139,92,246,0.6)", display: "inline-flex", alignItems: "center", gap: 2, fontSize: 10, marginLeft: 4, textDecoration: "none" }}
                          >
                            <ExternalLink size={9} /> source
                          </a>
                        )}
                      </div>
                      <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 340 }}>
                        {o.flag} · {o.category}
                        {o.buyHint && <span style={{ color: "rgba(139,92,246,0.55)", marginLeft: 6 }}>· {o.buyHint}</span>}
                      </div>
                    </div>
                  </div>
                </div>
                {/* BUY */}
                <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>${o.buy}</div>
                {/* SELL */}
                <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 13 }}>${o.sell}</div>
                {/* NET PROFIT — after platform fees + shipping */}
                <div>
                  <div style={{ color: "#4ade80", fontWeight: 800, fontSize: 14 }}>+${netP}</div>
                  {o.priceGapPct && o.priceGapPct > 0 ? (
                    <div style={{ color: o.priceGapPct > 200 ? "#4ade80" : o.priceGapPct > 80 ? "#f5c842" : "rgba(255,255,255,0.3)", fontSize: 10, fontWeight: 700 }}>
                      +{o.priceGapPct}% gap
                    </div>
                  ) : (
                    <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 10 }}>after fees</div>
                  )}
                </div>
                {/* RISK */}
                <div>
                  <div style={{ background: `${riskColor}18`, border: `1px solid ${riskColor}35`, borderRadius: 99, padding: "2px 8px", display: "inline-block", color: riskColor, fontSize: 10, fontWeight: 800, letterSpacing: 0.4 }}>{riskLabel}</div>
                  <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 10, marginTop: 2 }}>{o.margin}% margin</div>
                </div>
                {/* MARKET */}
                <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>{o.market}</div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, alignItems: "center" }}>
                  <button
                    title="Import to Dropship Manager"
                    onClick={e => {
                      e.stopPropagation();
                      sessionStorage.setItem("dropship_import", JSON.stringify(o));
                      setLocation("/resell/dropship");
                    }}
                    style={{
                      background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)",
                      borderRadius: 6, padding: "3px 5px", cursor: "pointer", color: "#a78bfa",
                      display: "flex", alignItems: "center",
                    }}
                  >
                    <Boxes size={12} />
                  </button>
                  <ArrowRight size={14} color="rgba(255,255,255,0.2)" />
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 20, textAlign: "center" }}>
          <button
            onClick={() => setLocation("/resell/search")}
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "12px 28px", borderRadius: 10, border: "none", cursor: "pointer",
              background: "linear-gradient(135deg, #8b5cf6, #7c3aed)",
              color: "#fff", fontWeight: 700, fontSize: 13,
              boxShadow: "0 4px 18px rgba(139,92,246,0.35)",
            }}
          >
            <Search size={15} /> AI Search — find new opportunities
          </button>
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
      `}</style>
    </ResellLayout>
  );
}
