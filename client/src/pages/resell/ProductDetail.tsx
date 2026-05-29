import React, { useState } from "react";
import { useLocation, useRoute } from "wouter";
import { ArrowLeft, ChevronRight, ShoppingCart, Tag, ExternalLink, Link2, Info, TrendingUp, AlertTriangle } from "lucide-react";
import { ResellLayout } from "@/components/resell/ResellLayout";

type Opportunity = {
  id: number; name: string; buy: number; sell: number; profit: number;
  netProfit?: number; margin: number; market: string; category: string; score: number;
  trend: string; flag: string; tip?: string;
  risk?: "low" | "medium" | "high";
  demandLevel?: "high" | "medium" | "low";
  buyHint?: string; sellHint?: string; sourceUrl?: string;
  priceGapPct?: number; confidence?: "live" | "estimated";
};

const PLATFORM_FEES: Record<string, number> = {
  "eBay USA": 13.25, "Etsy USA": 9.5, "Amazon UK": 15, "Amazon DE": 15,
  "eBay DE": 12, "StockX USA": 9.5, "Vinted EU": 5, "Depop": 10,
};

const BUY_SOURCES: Record<string, { name: string; url: string; hint: string }[]> = {
  "🇵🇱": [
    { name: "Allegro.pl", url: "https://allegro.pl/listing?string=", hint: "Largest Polish marketplace — best for used goods" },
    { name: "OLX.pl", url: "https://www.olx.pl/oferty/q-", hint: "Private classified ads — lowest prices" },
    { name: "Vinted.pl", url: "https://www.vinted.pl/catalog?search_text=", hint: "Used clothing — great for vintage denim & fashion" },
  ],
  "🇩🇪": [
    { name: "Kleinanzeigen.de", url: "https://www.kleinanzeigen.de/s-", hint: "Largest German classifieds — private sellers, low prices" },
    { name: "eBay.de", url: "https://www.ebay.de/sch/i.html?_nkw=", hint: "Auctions + Buy It Now — sort by ending soon" },
  ],
  "🇯🇵": [
    { name: "Mercari Japan", url: "https://jp.mercari.com/search?keyword=", hint: "Japanese second-hand app — lowest prices for electronics" },
    { name: "Yahoo Auctions JP", url: "https://auctions.yahoo.co.jp/search/search?p=", hint: "Largest Japanese auction site — source for vintage items" },
  ],
  "🇨🇿": [
    { name: "Bazoš.cz", url: "https://www.bazos.cz/search.php?hledat=", hint: "Czech classifieds — low competition from other resellers" },
  ],
  "🇭🇺": [
    { name: "Hardverapro.hu", url: "https://hardverapro.hu/aprok/keres?keres=", hint: "Hungarian classifieds — underpriced electronics" },
  ],
};

const SELL_PLATFORMS: Record<string, { name: string; sellUrl: string; searchUrl: string; color: string }> = {
  "eBay USA":    { name: "eBay USA",    sellUrl: "https://www.ebay.com/sell",       searchUrl: "https://www.ebay.com/sch/i.html?_nkw=",  color: "#f5c842" },
  "Etsy USA":    { name: "Etsy USA",    sellUrl: "https://www.etsy.com/sell",       searchUrl: "https://www.etsy.com/search?q=",          color: "#f97316" },
  "Amazon UK":   { name: "Amazon UK",   sellUrl: "https://sell.amazon.co.uk",       searchUrl: "https://www.amazon.co.uk/s?k=",           color: "#34d399" },
  "Amazon DE":   { name: "Amazon DE",   sellUrl: "https://sell.amazon.de",          searchUrl: "https://www.amazon.de/s?k=",              color: "#34d399" },
  "eBay DE":     { name: "eBay DE",     sellUrl: "https://www.ebay.de/sell",        searchUrl: "https://www.ebay.de/sch/i.html?_nkw=",   color: "#60a5fa" },
  "StockX USA":  { name: "StockX USA",  sellUrl: "https://stockx.com/sell",         searchUrl: "https://stockx.com/search?s=",           color: "#a78bfa" },
  "Vinted EU":   { name: "Vinted EU",   sellUrl: "https://www.vinted.com/sell-now", searchUrl: "https://www.vinted.com/catalog?search_text=", color: "#c084fc" },
};

const RISK_DETAILS: Record<string, { label: string; color: string; bg: string; border: string; explanation: string }> = {
  low:    { label: "LOW RISK",    color: "#4ade80", bg: "rgba(74,222,128,0.15)",    border: "rgba(74,222,128,0.3)",    explanation: "High certainty of sale — consistent demand, clear price gap, low competition" },
  medium: { label: "MEDIUM RISK", color: "#f5c842", bg: "rgba(245,200,66,0.15)",   border: "rgba(245,200,66,0.3)",    explanation: "Moderate uncertainty — demand exists but may take longer to sell; verify condition carefully" },
  high:   { label: "HIGH RISK",   color: "#f87171", bg: "rgba(248,113,113,0.15)",  border: "rgba(248,113,113,0.3)",   explanation: "High difficulty — regulatory issues, fragile items, seasonal demand, or very high competition" },
};

const DEMAND_DETAILS: Record<string, { icon: string; color: string; explanation: string }> = {
  high:   { icon: "▲", color: "#4ade80", explanation: "High demand — items in this category sell within days on target market" },
  medium: { icon: "◆", color: "#60a5fa", explanation: "Medium demand — typical sell time 1-3 weeks depending on condition and listing quality" },
  low:    { icon: "▼", color: "rgba(255,255,255,0.35)", explanation: "Lower demand — may sit for weeks; ensure competitive pricing" },
};

function getBuyFlag(flag: string) {
  const match = flag.match(/^([\u{1F1E0}-\u{1F1FF}]{2})/u);
  return match ? match[1] : "🇵🇱";
}

function getBuySources(flag: string) {
  const buyFlag = getBuyFlag(flag);
  return BUY_SOURCES[buyFlag] ?? BUY_SOURCES["🇵🇱"];
}

export default function ProductDetail() {
  const [, params] = useRoute("/resell/product/:id");
  const [, setLocation] = useLocation();
  const id = params?.id ?? "1";
  const [showRiskTooltip, setShowRiskTooltip] = useState(false);
  const [showDemandTooltip, setShowDemandTooltip] = useState(false);

  let opportunity: Opportunity | null = null;
  try {
    const stored = sessionStorage.getItem("resell_opportunity");
    if (stored) {
      const parsed = JSON.parse(stored) as Opportunity;
      if (String(parsed.id) === id) opportunity = parsed;
    }
  } catch {}

  // No real opportunity in session — show an honest empty state instead of fake data
  if (!opportunity) {
    return (
      <ResellLayout>
        <div style={{ padding: "60px 24px", maxWidth: 560, margin: "0 auto", textAlign: "center" }}>
          <div style={{ fontSize: 44, marginBottom: 16 }}>🔍</div>
          <h2 style={{ color: "#fff", fontSize: 20, fontWeight: 800, margin: "0 0 8px" }}>Nie wybrano okazji</h2>
          <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 14, margin: "0 0 24px", lineHeight: 1.5 }}>
            Otwórz okazję z Dashboardu, żeby zobaczyć szczegóły, źródła zakupu i kalkulację zysku.
          </p>
          <button
            onClick={() => setLocation("/resell")}
            style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "linear-gradient(135deg,#8b5cf6,#7c3aed)", border: "none", borderRadius: 10, padding: "12px 24px", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}
          >
            <ArrowLeft size={15} /> Wróć do Dashboardu
          </button>
        </div>
      </ResellLayout>
    );
  }

  const p = opportunity;
  const scoreColor = p.score >= 70 ? "#4ade80" : p.score >= 50 ? "#f5c842" : "#f87171";
  const buySources = getBuySources(p.flag);
  const sellPlatform = SELL_PLATFORMS[p.market] ?? SELL_PLATFORMS["eBay USA"];
  const searchQuery = encodeURIComponent(p.name.split("—")[0].trim());
  const feePercent = PLATFORM_FEES[p.market] ?? 13.25;
  const netP = p.netProfit ?? p.profit;
  const riskInfo = p.risk ? RISK_DETAILS[p.risk] : null;
  const demandInfo = p.demandLevel ? DEMAND_DETAILS[p.demandLevel] : null;

  return (
    <ResellLayout>
      <div style={{ padding: "28px 24px 60px", maxWidth: 820 }}>
        <button onClick={() => setLocation("/resell")} style={{ display: "flex", alignItems: "center", gap: 6, color: "rgba(255,255,255,0.45)", background: "none", border: "none", cursor: "pointer", fontSize: 13, marginBottom: 24 }}>
          <ArrowLeft size={15} /> Back to opportunities
        </button>

        {/* Score card */}
        <div style={{ background: `${scoreColor}10`, border: `1px solid ${scoreColor}30`, borderRadius: 18, padding: 22, marginBottom: 20 }}>
          <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>PROFITABILITY SCORE</div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                <div style={{ color: scoreColor, fontSize: 20, fontWeight: 900 }}>
                  {p.score >= 70 ? "Profitable" : p.score >= 50 ? "Moderate" : "Low Return"}
                </div>
                {riskInfo && (
                  <div style={{ position: "relative" }}>
                    <span
                      style={{ background: riskInfo.bg, border: `1px solid ${riskInfo.border}`, borderRadius: 99, padding: "2px 9px", color: riskInfo.color, fontSize: 10, fontWeight: 800, cursor: "help", display: "inline-flex", alignItems: "center", gap: 4 }}
                      onMouseEnter={() => setShowRiskTooltip(true)}
                      onMouseLeave={() => setShowRiskTooltip(false)}
                    >
                      {riskInfo.label} <Info size={9} />
                    </span>
                    {showRiskTooltip && (
                      <div style={{ position: "absolute", top: 28, left: 0, zIndex: 10, background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10, padding: "8px 12px", width: 260, fontSize: 11, color: "rgba(255,255,255,0.7)", lineHeight: 1.5 }}>
                        {riskInfo.explanation}
                      </div>
                    )}
                  </div>
                )}
                {demandInfo && (
                  <div style={{ position: "relative" }}>
                    <span
                      style={{ color: demandInfo.color, fontSize: 11, fontWeight: 700, cursor: "help", display: "inline-flex", alignItems: "center", gap: 4 }}
                      onMouseEnter={() => setShowDemandTooltip(true)}
                      onMouseLeave={() => setShowDemandTooltip(false)}
                    >
                      {demandInfo.icon} {p.demandLevel?.toUpperCase()} DEMAND <Info size={9} />
                    </span>
                    {showDemandTooltip && (
                      <div style={{ position: "absolute", top: 22, left: 0, zIndex: 10, background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10, padding: "8px 12px", width: 260, fontSize: 11, color: "rgba(255,255,255,0.7)", lineHeight: 1.5 }}>
                        {demandInfo.explanation}
                      </div>
                    )}
                  </div>
                )}
                {p.confidence && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: p.confidence === "live" ? "#4ade80" : "rgba(255,255,255,0.25)" }}>
                    {p.confidence === "live" ? "🟢 LIVE DATA" : "~ ESTIMATED"}
                  </span>
                )}
              </div>
              <div style={{ color: "rgba(255,255,255,0.9)", fontSize: 14, marginTop: 2, fontWeight: 600 }}>{p.name}</div>
              {p.tip && <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, marginTop: 4, lineHeight: 1.4 }}>{p.tip}</div>}
              <a
                href={(p.sourceUrl) || (buySources[0].url + searchQuery)}
                target="_blank" rel="noopener noreferrer"
                style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 10, padding: "5px 10px", borderRadius: 7, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", textDecoration: "none", color: "rgba(255,255,255,0.65)", fontSize: 11, fontWeight: 600 }}
              >
                <Link2 size={11} /> Find on: {buySources[0].name} <ExternalLink size={10} style={{ opacity: 0.5 }} />
              </a>
            </div>
            <div style={{ width: 72, height: 72, borderRadius: "50%", border: `3px solid ${scoreColor}60`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: `${scoreColor}12`, flexShrink: 0, marginLeft: 14 }}>
              <div style={{ color: scoreColor, fontSize: 24, fontWeight: 900 }}>{p.score}</div>
              <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 9 }}>/100</div>
            </div>
          </div>

          {/* Finance grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginTop: 16 }}>
            {[
              { label: "Purchase price", val: `$${p.buy}`, c: "#fff", sub: "buy cost" },
              { label: "Target sell price", val: `$${p.sell}`, c: "#86efac", sub: "sell price" },
              { label: "Gross profit", val: `+$${p.profit}`, c: "#4ade80", sub: "before fees" },
              { label: "Net profit", val: `+$${netP}`, c: "#22c55e", sub: `after ${feePercent}% fee + ship` },
            ].map(x => (
              <div key={x.label} style={{ background: "rgba(0,0,0,0.25)", borderRadius: 10, padding: "10px 12px" }}>
                <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 9, marginBottom: 3, textTransform: "uppercase", letterSpacing: 0.4 }}>{x.sub}</div>
                <div style={{ color: x.c, fontWeight: 900, fontSize: 16 }}>{x.val}</div>
                <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 9, marginTop: 1 }}>{x.label}</div>
              </div>
            ))}
          </div>

          {/* Price gap badge */}
          {p.priceGapPct && p.priceGapPct > 0 && (
            <div style={{ marginTop: 10, display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.2)", borderRadius: 10, padding: "6px 12px" }}>
              <TrendingUp size={12} color="#4ade80" />
              <span style={{ color: "#86efac", fontSize: 11, fontWeight: 700 }}>+{p.priceGapPct}% EU→US price gap</span>
              <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 10 }}>· {p.margin}% margin</span>
            </div>
          )}

          {/* Buy/Sell hints */}
          {(p.buyHint || p.sellHint) && (
            <div style={{ display: "grid", gridTemplateColumns: p.buyHint && p.sellHint ? "1fr 1fr" : "1fr", gap: 8, marginTop: 12 }}>
              {p.buyHint && (
                <div style={{ background: "rgba(245,200,66,0.07)", border: "1px solid rgba(245,200,66,0.2)", borderRadius: 8, padding: "8px 12px" }}>
                  <div style={{ color: "#f5c842", fontSize: 10, fontWeight: 700, marginBottom: 3 }}>🛒 WHERE TO BUY</div>
                  <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 11 }}>{p.buyHint}</div>
                </div>
              )}
              {p.sellHint && (
                <div style={{ background: "rgba(74,222,128,0.07)", border: "1px solid rgba(74,222,128,0.2)", borderRadius: 8, padding: "8px 12px" }}>
                  <div style={{ color: "#4ade80", fontSize: 10, fontWeight: 700, marginBottom: 3 }}>📝 SUGGESTED LISTING TITLE</div>
                  <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 11, fontStyle: "italic" }}>{p.sellHint}</div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Platform fee breakdown */}
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "14px 18px", marginBottom: 20 }}>
          <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, fontWeight: 700, letterSpacing: 0.8, marginBottom: 10 }}>FEE BREAKDOWN — {p.market}</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[
              { label: "Platform fee", val: `${feePercent}%  = -$${(p.sell * feePercent / 100).toFixed(2)}` },
              { label: "Gross profit", val: `$${p.profit}` },
              { label: "Net profit est.", val: `$${netP}` },
              { label: "Margin", val: `${p.margin}%` },
            ].map(x => (
              <div key={x.label} style={{ background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: "8px 12px", minWidth: 120 }}>
                <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 9, marginBottom: 2 }}>{x.label.toUpperCase()}</div>
                <div style={{ color: "#c4b5fd", fontWeight: 700, fontSize: 13 }}>{x.val}</div>
              </div>
            ))}
          </div>
        </div>

        {/* BUY section */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <ShoppingCart size={15} color="#f5c842" />
            <span style={{ color: "#f5c842", fontSize: 12, fontWeight: 800, letterSpacing: 0.8 }}>WHERE TO BUY</span>
            <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>— search for this product here</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {buySources.map(src => (
              <a key={src.name} href={src.url + searchQuery} target="_blank" rel="noopener noreferrer"
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(245,200,66,0.08)", border: "1px solid rgba(245,200,66,0.2)", borderRadius: 10, padding: "12px 16px", textDecoration: "none" }}>
                <div>
                  <div style={{ color: "#fde68a", fontWeight: 700, fontSize: 14 }}>{src.name}</div>
                  <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, marginTop: 2 }}>{src.hint}</div>
                </div>
                <ExternalLink size={14} color="rgba(245,200,66,0.6)" />
              </a>
            ))}
          </div>
        </div>

        {/* SELL section */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <Tag size={15} color="#4ade80" />
            <span style={{ color: "#4ade80", fontSize: 12, fontWeight: 800, letterSpacing: 0.8 }}>WHERE TO SELL</span>
            <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>— create your listing here</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <a href={sellPlatform.searchUrl + searchQuery} target="_blank" rel="noopener noreferrer"
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.2)", borderRadius: 10, padding: "12px 16px", textDecoration: "none" }}>
              <div>
                <div style={{ color: "#86efac", fontWeight: 700, fontSize: 14 }}>🔍 Check prices on {sellPlatform.name}</div>
                <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, marginTop: 2 }}>See what similar items are selling for</div>
              </div>
              <ExternalLink size={14} color="rgba(74,222,128,0.6)" />
            </a>
            <a href={sellPlatform.sellUrl} target="_blank" rel="noopener noreferrer"
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(74,222,128,0.14)", border: "1px solid rgba(74,222,128,0.35)", borderRadius: 10, padding: "12px 16px", textDecoration: "none" }}>
              <div>
                <div style={{ color: "#4ade80", fontWeight: 800, fontSize: 14 }}>✚ List on {sellPlatform.name}</div>
                <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, marginTop: 2 }}>
                  Target sell price: <strong style={{ color: "#4ade80" }}>${p.sell}</strong>
                  <span style={{ color: "rgba(255,255,255,0.3)", marginLeft: 8 }}>· {feePercent}% platform fee</span>
                </div>
              </div>
              <ExternalLink size={14} color="rgba(74,222,128,0.8)" />
            </a>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            { label: "🤖 Generate AI Offer", href: `/resell/offer/${id}`, color: "#a78bfa" },
            { label: "📊 Compare Platforms", href: `/resell/compare`, color: "#f5c842" },
            { label: "💰 Profit Calculator", href: `/resell/profit/${id}`, color: "#34d399" },
            { label: "📦 Add to Dropship Manager", href: null, color: "#60a5fa" },
          ].map(btn => (
            <button key={btn.label} onClick={() => {
              if (!btn.href) {
                sessionStorage.setItem("dropship_import", JSON.stringify({
                  name: p.name, buy: p.buy, sell: p.sell, market: p.market,
                  category: p.category, sourceUrl: p.sourceUrl ?? "", buyHint: p.buyHint ?? "", sellHint: p.sellHint ?? "",
                }));
                setLocation("/resell/dropship");
              } else {
                setLocation(btn.href);
              }
            }} style={{
              padding: "13px 16px", borderRadius: 12, cursor: "pointer",
              background: `${btn.color}12`, border: `1px solid ${btn.color}30`,
              color: btn.color, fontWeight: 700, fontSize: 13,
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              {btn.label} <ChevronRight size={15} />
            </button>
          ))}
        </div>
      </div>
    </ResellLayout>
  );
}
