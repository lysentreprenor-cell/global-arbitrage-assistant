import React from "react";
import { useLocation, useRoute } from "wouter";
import { ArrowLeft, ChevronRight, ShoppingCart, Tag, ExternalLink, Link2 } from "lucide-react";
import { ResellLayout } from "@/components/resell/ResellLayout";

type Opportunity = {
  id: number; name: string; buy: number; sell: number; profit: number;
  margin: number; market: string; category: string; score: number;
  trend: string; flag: string; tip?: string;
};

const BUY_SOURCES: Record<string, { name: string; url: string; hint: string }[]> = {
  "🇵🇱": [
    { name: "Allegro.pl", url: "https://allegro.pl/listing?string=", hint: "Największy rynek w Polsce" },
    { name: "OLX.pl", url: "https://www.olx.pl/oferty/q-", hint: "Ogłoszenia prywatne, niskie ceny" },
    { name: "Vinted.pl", url: "https://www.vinted.pl/catalog?search_text=", hint: "Odzież używana" },
  ],
  "🇩🇪": [
    { name: "Kleinanzeigen.de", url: "https://www.kleinanzeigen.de/s-", hint: "Największe ogłoszenia w Niemczech" },
    { name: "eBay.de", url: "https://www.ebay.de/sch/i.html?_nkw=", hint: "Aukcje i kup teraz" },
  ],
  "🇯🇵": [
    { name: "Mercari Japan", url: "https://jp.mercari.com/search?keyword=", hint: "Aplikacja second-hand Japan" },
    { name: "Yahoo Auctions JP", url: "https://auctions.yahoo.co.jp/search/search?p=", hint: "Największe aukcje w Japonii" },
  ],
  "🇨🇿": [
    { name: "Bazoš.cz", url: "https://www.bazos.cz/search.php?hledat=", hint: "Ogłoszenia Czechy" },
  ],
  "🇭🇺": [
    { name: "Hardverapro.hu", url: "https://hardverapro.hu/aprok/keres?keres=", hint: "Ogłoszenia Węgry" },
  ],
};

const SELL_PLATFORMS: Record<string, { name: string; sellUrl: string; searchUrl: string; color: string }> = {
  "eBay USA":    { name: "eBay USA",    sellUrl: "https://www.ebay.com/sell",          searchUrl: "https://www.ebay.com/sch/i.html?_nkw=",             color: "#f5c842" },
  "Etsy USA":    { name: "Etsy USA",    sellUrl: "https://www.etsy.com/sell",          searchUrl: "https://www.etsy.com/search?q=",                    color: "#f97316" },
  "Amazon UK":   { name: "Amazon UK",   sellUrl: "https://sell.amazon.co.uk",          searchUrl: "https://www.amazon.co.uk/s?k=",                     color: "#34d399" },
  "Amazon DE":   { name: "Amazon DE",   sellUrl: "https://sell.amazon.de",             searchUrl: "https://www.amazon.de/s?k=",                        color: "#34d399" },
  "eBay DE":     { name: "eBay DE",     sellUrl: "https://www.ebay.de/sell",           searchUrl: "https://www.ebay.de/sch/i.html?_nkw=",              color: "#60a5fa" },
  "Vinted EU":   { name: "Vinted EU",   sellUrl: "https://www.vinted.com/sell-now",    searchUrl: "https://www.vinted.com/catalog?search_text=",       color: "#a78bfa" },
};

function getBuyFlag(flag: string) {
  const match = flag.match(/^([\u{1F1E0}-\u{1F1FF}]{2})/u);
  return match ? match[1] : "🇵🇱";
}

function getBuySources(flag: string) {
  const buyFlag = getBuyFlag(flag);
  return BUY_SOURCES[buyFlag] ?? BUY_SOURCES["🇵🇱"];
}

const FALLBACK_PRODUCTS: Record<string, Opportunity> = {
  "1": { id: 1, name: "Levi's 501 W32 — Poland", buy: 30, sell: 78, profit: 48, margin: 62, market: "eBay USA", category: "Clothing", score: 92, trend: "up", flag: "🇵🇱→🇺🇸", tip: "Vintage denim sells for 2-3x more in US than EU" },
  "2": { id: 2, name: "Baltic Amber Pendant", buy: 50, sell: 260, profit: 210, margin: 80, market: "Etsy USA", category: "Jewelry", score: 96, trend: "up", flag: "🇵🇱→🇺🇸", tip: "Baltic amber is rare in US — handmade jewelry sells fast on Etsy" },
  "3": { id: 3, name: "Vintage Leica M3 Camera", buy: 420, sell: 890, profit: 470, margin: 53, market: "eBay DE", category: "Electronics", score: 88, trend: "up", flag: "🇩🇪→🇺🇸", tip: "German camera market underprices Leica vs US collectors" },
};

export default function ProductDetail() {
  const [, params] = useRoute("/resell/product/:id");
  const [, setLocation] = useLocation();
  const id = params?.id ?? "1";

  // Try to load from sessionStorage (set when clicking from Dashboard)
  let opportunity: Opportunity | null = null;
  try {
    const stored = sessionStorage.getItem("resell_opportunity");
    if (stored) {
      const parsed = JSON.parse(stored) as Opportunity;
      if (String(parsed.id) === id) opportunity = parsed;
    }
  } catch {}
  if (!opportunity) opportunity = FALLBACK_PRODUCTS[id] ?? FALLBACK_PRODUCTS["1"];

  const p = opportunity;
  const scoreColor = p.score >= 70 ? "#4ade80" : p.score >= 50 ? "#f5c842" : "#f87171";
  const buySources = getBuySources(p.flag);
  const sellPlatform = SELL_PLATFORMS[p.market] ?? SELL_PLATFORMS["eBay USA"];
  const searchQuery = encodeURIComponent(p.name.split("—")[0].trim());

  return (
    <ResellLayout>
      <div style={{ padding: "28px 24px 60px", maxWidth: 820 }}>
        <button onClick={() => setLocation("/resell")} style={{ display: "flex", alignItems: "center", gap: 6, color: "rgba(255,255,255,0.75)", background: "none", border: "none", cursor: "pointer", fontSize: 13, marginBottom: 24 }}>
          <ArrowLeft size={15} /> Powrót do listy
        </button>

        {/* Score card */}
        <div style={{ background: `${scoreColor}10`, border: `1px solid ${scoreColor}30`, borderRadius: 18, padding: 22, marginBottom: 20 }}>
          <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 11, fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>PROFITABILITY SCORE</div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ color: scoreColor, fontSize: 22, fontWeight: 900 }}>{p.score >= 70 ? "Profitable" : p.score >= 50 ? "Moderate" : "Low Return"}</div>
              <div style={{ color: "rgba(255,255,255,0.85)", fontSize: 14, marginTop: 4, fontWeight: 600 }}>{p.name}</div>
              {p.tip && <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 12, marginTop: 4 }}>{p.tip}</div>}
              {/* Source link */}
              <a
                href={buySources[0].url + searchQuery}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  marginTop: 10, padding: "5px 10px", borderRadius: 7,
                  background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)",
                  textDecoration: "none", color: "rgba(255,255,255,0.75)", fontSize: 11, fontWeight: 600,
                }}
              >
                <Link2 size={11} />
                Znaleziono na: {buySources[0].name}
                <ExternalLink size={10} style={{ opacity: 0.5 }} />
              </a>
            </div>
            <div style={{ width: 72, height: 72, borderRadius: "50%", border: `3px solid ${scoreColor}60`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: `${scoreColor}12`, flexShrink: 0 }}>
              <div style={{ color: scoreColor, fontSize: 24, fontWeight: 900 }}>{p.score}</div>
              <div style={{ color: "rgba(255,255,255,0.65)", fontSize: 9 }}>/100</div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 18 }}>
            {[
              { label: "Kupujesz za", val: `$${p.buy}`, c: "#fff" },
              { label: "Sprzedajesz za", val: `$${p.sell}`, c: "#4ade80" },
              { label: "Zysk", val: `+$${p.profit}`, c: "#4ade80" },
            ].map(x => (
              <div key={x.label} style={{ background: "rgba(0,0,0,0.25)", borderRadius: 10, padding: "10px 12px" }}>
                <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 10, marginBottom: 4 }}>{x.label}</div>
                <div style={{ color: x.c, fontWeight: 800, fontSize: 15 }}>{x.val}</div>
              </div>
            ))}
          </div>
        </div>

        {/* BUY section */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <ShoppingCart size={15} color="#f5c842" />
            <span style={{ color: "#f5c842", fontSize: 12, fontWeight: 800, letterSpacing: 0.8 }}>GDZIE KUPIĆ</span>
            <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>— szukaj tego produktu tutaj:</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {buySources.map(src => (
              <a
                key={src.name}
                href={src.url + searchQuery}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  background: "rgba(245,200,66,0.08)", border: "1px solid rgba(245,200,66,0.2)",
                  borderRadius: 10, padding: "12px 16px", textDecoration: "none",
                }}
              >
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
            <span style={{ color: "#4ade80", fontSize: 12, fontWeight: 800, letterSpacing: 0.8 }}>GDZIE SPRZEDAĆ</span>
            <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>— utwórz ogłoszenie tutaj:</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {/* Search similar listings */}
            <a
              href={sellPlatform.searchUrl + searchQuery}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                background: `rgba(74,222,128,0.08)`, border: `1px solid rgba(74,222,128,0.2)`,
                borderRadius: 10, padding: "12px 16px", textDecoration: "none",
              }}
            >
              <div>
                <div style={{ color: "#86efac", fontWeight: 700, fontSize: 14 }}>🔍 Sprawdź ceny na {sellPlatform.name}</div>
                <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, marginTop: 2 }}>Zobacz po ile inni sprzedają ten produkt</div>
              </div>
              <ExternalLink size={14} color="rgba(74,222,128,0.6)" />
            </a>
            {/* Create listing */}
            <a
              href={sellPlatform.sellUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                background: `rgba(74,222,128,0.14)`, border: `1px solid rgba(74,222,128,0.35)`,
                borderRadius: 10, padding: "12px 16px", textDecoration: "none",
              }}
            >
              <div>
                <div style={{ color: "#4ade80", fontWeight: 800, fontSize: 14 }}>✚ Utwórz ogłoszenie na {sellPlatform.name}</div>
                <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, marginTop: 2 }}>Docelowa cena sprzedaży: <strong style={{ color: "#4ade80" }}>${p.sell}</strong></div>
              </div>
              <ExternalLink size={14} color="rgba(74,222,128,0.8)" />
            </a>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            { label: "📊 Porównaj gdzie sprzedać", href: `/resell/compare`, color: "#f5c842" },
            { label: "Kalkulator zysku", href: `/resell/profit/${id}`, color: "#34d399" },
            { label: "Sprawdź zgodność (Compliance)", href: `/resell/compliance/${id}`, color: "#60a5fa" },
            { label: "Generuj ofertę sprzedaży", href: `/resell/offer/${id}`, color: "#a78bfa" },
          ].map(btn => (
            <button key={btn.label} onClick={() => setLocation(btn.href)} style={{
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
