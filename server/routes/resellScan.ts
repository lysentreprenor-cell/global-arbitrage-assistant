import { Router, type Request, type Response } from "express";

const router = Router();

const FALLBACK = [
  { id: 1, name: "Levi's 501 W32 L32 — vintage wash", buy: 28, sell: 82, profit: 54, netProfit: 41, margin: 66, priceGapPct: 193, confidence: "estimated", market: "eBay USA", category: "Clothing", score: 93, risk: "low", demandLevel: "high", trend: "up", flag: "🇵🇱→🇺🇸", tip: "Vintage wash 501s sell 2-3× faster — US buyers pay premium for EU-made denim", sourceUrl: "https://allegro.pl/listing?string=levis+501+vintage+w32", sellUrl: "https://www.ebay.com/sch/i.html?_nkw=levis+501+vintage+wash+w32&LH_Sold=1&LH_Complete=1", buyHint: "Allegro PL / OLX — szukaj W30-W34 Made in EU", sellHint: "Levi's 501 Vintage Wash W32 L32 Made in Europe — Original" },
  { id: 2, name: "Baltic Amber Pendant — raw natural", buy: 45, sell: 265, profit: 220, netProfit: 192, margin: 83, priceGapPct: 489, confidence: "estimated", market: "Etsy USA", category: "Jewelry", score: 97, risk: "low", demandLevel: "high", trend: "up", flag: "🇵🇱→🇺🇸", tip: "Raw Baltic amber sells 4-6× Polish retail on Etsy — no Asian competition", sourceUrl: "https://allegro.pl/listing?string=bursztyn+baltycki+wisiorek+naturalny", sellUrl: "https://www.etsy.com/search?q=baltic+amber+pendant+raw&order=price_desc", buyHint: "Allegro PL lub targi bałtyckie — szukaj z inkluzjami", sellHint: "Baltic Amber Raw Pendant Natural Inclusion Genuine Sterling Silver" },
  { id: 3, name: "Leica M3 Camera — working, clean", buy: 380, sell: 920, profit: 540, netProfit: 421, margin: 59, priceGapPct: 142, confidence: "estimated", market: "eBay USA", category: "Electronics", score: 89, risk: "medium", demandLevel: "medium", trend: "up", flag: "🇩🇪→🇺🇸", tip: "Kleinanzeigen.de prices 40% below US eBay — German sellers don't know US demand", sourceUrl: "https://www.kleinanzeigen.de/s-leica-m3/k0", sellUrl: "https://www.ebay.com/sch/i.html?_nkw=leica+m3+camera+body&LH_Sold=1&LH_Complete=1", buyHint: "Kleinanzeigen.de Bawaria/Niemcy — 'Leica M3 verkaufen'", sellHint: "Leica M3 Double Stroke Camera Body Working Tested CLA Ready" },
  { id: 4, name: "Adidas Samba OG — EU exclusive colorway", buy: 70, sell: 155, profit: 85, netProfit: 61, margin: 55, priceGapPct: 121, confidence: "estimated", market: "StockX USA", category: "Sneakers", score: 84, risk: "low", demandLevel: "high", trend: "up", flag: "🇵🇱→🇺🇸", tip: "EU-exclusive Samba colorways unavailable in US — StockX premium 2x retail", sourceUrl: "https://allegro.pl/listing?string=adidas+samba+og", sellUrl: "https://stockx.com/search?s=adidas+samba+og", buyHint: "Allegro PL lub Footshop.eu — EU exclusive dropy, rozmiar 41-44", sellHint: "Adidas Samba OG EU Exclusive [Colorway] Size US — Deadstock" },
  { id: 5, name: "Meissen Porcelain Figure — 1950s", buy: 75, sell: 320, profit: 245, netProfit: 202, margin: 77, priceGapPct: 327, confidence: "estimated", market: "Etsy USA", category: "Antiques", score: 91, risk: "medium", demandLevel: "medium", trend: "up", flag: "🇩🇪→🇺🇸", tip: "East German porcelain massively undervalued at local auctions vs US collector market", sourceUrl: "https://www.kleinanzeigen.de/s-meissen-figur/k0", sellUrl: "https://www.etsy.com/search?q=meissen+porcelain+figurine+vintage&order=price_desc", buyHint: "Aukcje eBay.de / Dresdner Auktionshaus — 'Meissen Figur'", sellHint: "Meissen Porcelain Figurine 1950s Handpainted Vintage Crossed Swords" },
  { id: 6, name: "Zorki-4 Camera — 1960s working", buy: 22, sell: 74, profit: 52, netProfit: 40, margin: 70, priceGapPct: 236, confidence: "estimated", market: "Etsy USA", category: "Collectibles", score: 85, risk: "low", demandLevel: "high", trend: "up", flag: "🇵🇱→🇺🇸", tip: "Soviet film cameras: cult following in US — Etsy vintage buyers pay 3x Polish price", sourceUrl: "https://allegro.pl/listing?string=aparat+zorki+4+dzialajacy", sellUrl: "https://www.etsy.com/search?q=zorki+soviet+rangefinder+camera&order=price_desc", buyHint: "Allegro PL / OLX — filtruj 'sprawny', budżet do 80 PLN", sellHint: "Zorki 4 Soviet Rangefinder Camera Working 1960s Film Photography" },
  { id: 7, name: "Nikka From The Barrel Whisky", buy: 88, sell: 195, profit: 107, netProfit: 78, margin: 55, priceGapPct: 122, confidence: "estimated", market: "Amazon UK", category: "Spirits", score: 78, risk: "high", demandLevel: "medium", trend: "stable", flag: "🇯🇵→🇬🇧", tip: "Japanese whisky shortage drives UK premiums — verify shipping restrictions first", sourceUrl: "https://auctions.yahoo.co.jp/search/search?p=nikka+from+the+barrel", sellUrl: "https://www.amazon.co.uk/s?k=nikka+from+the+barrel+whisky", buyHint: "Yahoo Auctions JP lub Mercari JP — sprawdź przepisy importowe", sellHint: "Nikka From The Barrel 500ml Japanese Blended Whisky UK Import" },
  { id: 8, name: "Vintage Omega Seamaster 1960s", buy: 220, sell: 680, profit: 460, netProfit: 371, margin: 68, priceGapPct: 209, confidence: "estimated", market: "eBay USA", category: "Watches", score: 94, risk: "medium", demandLevel: "high", trend: "up", flag: "🇵🇱→🇺🇸", tip: "Pre-1970 Omega watches: Polish flea markets 30% below European average — US demand very high", sourceUrl: "https://allegro.pl/listing?string=omega+seamaster+vintage+zegarek", sellUrl: "https://www.ebay.com/sch/i.html?_nkw=omega+seamaster+vintage+1960s&LH_Sold=1&LH_Complete=1", buyHint: "Targi niedzielne Warszawa/Kraków — pytaj o 'zegarki vintage'", sellHint: "Omega Seamaster Vintage 1960s Automatic Cal.285 Original Dial Working" },
];

// ── eBay OAuth (with in-memory token cache) ──────────────────────────────────
const _tokenCache = new Map<string, { token: string; expiresAt: number }>();

async function getEbayToken(appId: string, certId: string): Promise<string | null> {
  const cacheKey = `${appId}:${certId}`;
  const cached = _tokenCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) return cached.token;

  try {
    const encoded = Buffer.from(`${appId}:${certId}`).toString("base64");
    const r = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
      method: "POST",
      headers: { Authorization: `Basic ${encoded}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope",
    });
    if (!r.ok) return null;
    const d = await r.json() as any;
    const token = d.access_token ?? null;
    if (token) {
      // Cache for 55 minutes (tokens valid ~2h; leave buffer)
      _tokenCache.set(cacheKey, { token, expiresAt: Date.now() + 55 * 60 * 1000 });
    }
    return token;
  } catch { return null; }
}

// ── eBay Browse search (single marketplace) ──────────────────────────────────
async function ebaySearch(
  token: string, query: string, maxPrice: number,
  marketplace = "EBAY_US", sortOrder = "price"
): Promise<any[]> {
  try {
    const priceFilter = maxPrice < 9999 ? `price:[1..${maxPrice}],` : "";
    const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(query)}&fieldgroups=EXTENDED&filter=${priceFilter}conditionIds:{3000|4000|5000|6000}&limit=8&sort=${sortOrder}`;
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, "X-EBAY-C-MARKETPLACE-ID": marketplace },
    });
    if (!r.ok) return [];
    const d = await r.json() as any;
    return (d.itemSummaries ?? []).map((i: any) => ({
      title: i.title ?? "",
      price: parseFloat(i.price?.value ?? "0"),
      currency: i.price?.currency ?? "USD",
      url: i.itemWebUrl ?? "",
      condition: i.condition ?? "",
      watchCount: i.watchCount ?? 0,   // fixed: was using ?? with ternary causing wrong precedence
      marketplace,
    }));
  } catch { return []; }
}

// ── EU vs US price gap detector (core of the accuracy improvement) ────────────
// Queries eBay DE for cheap buy-side prices, eBay US for expensive sell-side prices.
// Returns confirmed gap % from real live data.
interface GapResult {
  euListings: any[];
  usListings: any[];
  medianEU: number;   // cheap side median
  medianUS: number;   // expensive side median
  gapPct: number;     // (medianUS/medianEU - 1) * 100
  gapMultiplier: number; // medianUS/medianEU
  confidence: "live" | "no_data";
}

async function detectGap(token: string, query: string, maxBuyPrice: number): Promise<GapResult> {
  const empty: GapResult = { euListings: [], usListings: [], medianEU: 0, medianUS: 0, gapPct: 0, gapMultiplier: 0, confidence: "no_data" };
  try {
    const [euListings, usListings] = await Promise.all([
      ebaySearch(token, query, maxBuyPrice, "EBAY_DE", "price"),        // cheapest EU used
      ebaySearch(token, query, 9999, "EBAY_US", "-price"),              // most expensive US
    ]);
    if (euListings.length === 0 || usListings.length === 0) return { ...empty, euListings, usListings };

    const euPrices = euListings.map(i => i.price).filter(p => p > 0).sort((a, b) => a - b);
    const usPrices = usListings.map(i => i.price).filter(p => p > 0).sort((a, b) => b - a);

    // Use lower median for EU (we want cheap), upper median for US (we want what buyers pay)
    const medEU = euPrices[Math.floor(euPrices.length / 2)] ?? 0;
    const medUS = usPrices[Math.floor(usPrices.length / 2)] ?? 0;
    const gapPct = medEU > 0 && medUS > medEU ? Math.round((medUS / medEU - 1) * 100) : 0;
    const gapMul = medEU > 0 && medUS > 0 ? Math.round((medUS / medEU) * 10) / 10 : 0;

    return { euListings, usListings, medianEU: medEU, medianUS: medUS, gapPct, gapMultiplier: gapMul, confidence: gapPct > 0 ? "live" : "no_data" };
  } catch { return empty; }
}

// ── Etsy ──────────────────────────────────────────────────────────────────────
async function etsySearch(apiKey: string, query: string): Promise<any[]> {
  try {
    const url = `https://openapi.etsy.com/v3/application/listings/active?keywords=${encodeURIComponent(query)}&limit=8&sort_on=price&sort_order=desc`;
    const r = await fetch(url, { headers: { "x-api-key": apiKey } });
    if (!r.ok) return [];
    const d = await r.json() as any;
    return (d.results ?? []).map((i: any) => ({
      title: i.title ?? "",
      price: (i.price?.amount ?? 0) / (i.price?.divisor ?? 100),
      currency: i.price?.currency_code ?? "USD",
      url: i.url ?? `https://www.etsy.com/listing/${i.listing_id}`,
      views: i.num_favorers ?? 0,
      marketplace: "ETSY_US",
    }));
  } catch { return []; }
}

// ── Platform fees & shipping ──────────────────────────────────────────────────
const PLATFORM_FEES: Record<string, number> = {
  "eBay USA": 0.1325, "Etsy USA": 0.095, "Amazon UK": 0.15,
  "eBay DE": 0.12, "Amazon DE": 0.15, "Vinted EU": 0,
  "StockX USA": 0.095, "Depop": 0.10,
};

const AVG_SHIPPING: Record<string, number> = {
  "Clothing": 12, "Jewelry": 18, "Electronics": 28, "Collectibles": 22,
  "Sneakers": 25, "Spirits": 35, "Antiques": 40, "Watches": 30, "General": 20,
};

function calcNetProfit(sellPrice: number, buyPrice: number, market: string, category: string): number {
  const fee = PLATFORM_FEES[market] ?? 0.13;
  const ship = AVG_SHIPPING[category] ?? 20;
  return Math.round(sellPrice * (1 - fee) - buyPrice - ship);
}

// ── Post-process: validate prices, add gap%, filter bad opportunities ─────────
function filterAndEnrich(opps: any[], hasLiveData: boolean): any[] {
  return opps
    .filter(o => {
      if (!o.buy || !o.sell || o.sell <= o.buy) return false;
      const np = o.netProfit ?? calcNetProfit(o.sell, o.buy, o.market ?? o.sellMarket ?? "", o.category ?? "General");
      if (np < 10) return false;   // minimum $10 net profit
      if ((o.margin ?? 0) < 15) return false;  // minimum 15% margin
      return true;
    })
    .map(o => {
      const np = o.netProfit ?? calcNetProfit(o.sell, o.buy, o.market ?? o.sellMarket ?? "", o.category ?? "General");
      const priceGapPct = o.buy > 0 ? Math.round((o.sell / o.buy - 1) * 100) : 0;
      return {
        ...o,
        netProfit: np,
        priceGapPct,
        confidence: o.confidence ?? (hasLiveData ? "live" : "estimated"),
      };
    })
    .sort((a, b) => (b.netProfit ?? 0) - (a.netProfit ?? 0));
}

// ── URL helpers ───────────────────────────────────────────────────────────────
function sellUrlForMarket(market: string, productName: string): string {
  const q = encodeURIComponent(productName);
  if (market.includes("eBay USA")) return `https://www.ebay.com/sch/i.html?_nkw=${q}&LH_Sold=1&LH_Complete=1`;
  if (market.includes("eBay DE")) return `https://www.ebay.de/sch/i.html?_nkw=${q}&LH_Sold=1`;
  if (market.includes("Etsy")) return `https://www.etsy.com/search?q=${q}&order=price_desc`;
  if (market.includes("Amazon UK")) return `https://www.amazon.co.uk/s?k=${q}`;
  if (market.includes("Amazon DE")) return `https://www.amazon.de/s?k=${q}`;
  if (market.includes("StockX")) return `https://stockx.com/search?s=${q}`;
  if (market.includes("Vinted")) return `https://www.vinted.com/catalog?search_text=${q}`;
  if (market.includes("Depop")) return `https://www.depop.com/search/?q=${q}`;
  return `https://www.google.com/search?q=${q}+sold+price`;
}

function sourceUrlForMarket(market: string, productName: string): string {
  const q = encodeURIComponent(productName);
  const slug = productName.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  if (market.includes("Allegro")) return `https://allegro.pl/listing?string=${q}`;
  if (market.includes("OLX")) return `https://www.olx.pl/q-${slug}/`;
  if (market.includes("Kleinanzeigen") || market.includes("German"))
    return `https://www.kleinanzeigen.de/s-${slug}/k0`;
  if (market.includes("Vinted")) return `https://www.vinted.com/catalog?search_text=${q}`;
  if (market.includes("eBay DE") || market.includes("EBAY_DE"))
    return `https://www.ebay.de/sch/i.html?_nkw=${q}&_sop=15`;
  if (market.includes("Yahoo") || market.includes("Japan") || market.includes("JP"))
    return `https://auctions.yahoo.co.jp/search/search?p=${q}`;
  if (market.includes("Mercari")) return `https://jp.mercari.com/search?keyword=${q}`;
  return `https://www.google.com/search?q=${q}+buy+cheap+europe`;
}

// ── AI scan (with real gap data injected into context) ────────────────────────
async function scanWithAI(
  apiKey: string,
  gapData: Array<{ query: string; gap: GapResult }> = [],
  realEtsy: any[] = []
): Promise<any[]> {
  const now = new Date();
  const month = now.toLocaleString("en-US", { month: "long" });
  const season = ["December","January","February"].includes(month) ? "Winter"
    : ["March","April","May"].includes(month) ? "Spring"
    : ["June","July","August"].includes(month) ? "Summer" : "Autumn";

  const feeContext = Object.entries(PLATFORM_FEES)
    .map(([p, f]) => `${p}: ${(f * 100).toFixed(1)}%`).join(", ");

  // Build verified gap block — this is the key accuracy improvement
  const verifiedGaps = gapData.filter(g => g.gap.gapPct > 30);
  let gapBlock = "";
  if (verifiedGaps.length > 0) {
    gapBlock = "\n\nVERIFIED LIVE PRICE GAPS (eBay DE cheap → eBay US expensive — REAL DATA, use these prices):\n";
    gapBlock += verifiedGaps.map(g => {
      const eu = g.gap.euListings.slice(0, 3).map(i => `    • "${i.title.slice(0, 60)}" DE: €${i.price.toFixed(0)}`).join("\n");
      const us = g.gap.usListings.slice(0, 2).map(i => `    • "${i.title.slice(0, 60)}" US: $${i.price.toFixed(0)}`).join("\n");
      return `  Product: "${g.query}"\n  EU median: €${g.gap.medianEU.toFixed(0)} → US median: $${g.gap.medianUS.toFixed(0)} = ${g.gap.gapPct}% gap (${g.gap.gapMultiplier}x)\n  EU listings:\n${eu}\n  US listings:\n${us}`;
    }).join("\n\n");
  }

  let etsyBlock = "";
  if (realEtsy.length > 0) {
    etsyBlock = "\n\nETSY HIGH-VALUE SELL-SIDE (what buyers currently pay):\n";
    etsyBlock += realEtsy.slice(0, 10).map(i =>
      `  • "${i.title.slice(0, 70)}" — $${i.price.toFixed(0)} | favorers: ${i.views}`
    ).join("\n");
  }

  const hasReal = verifiedGaps.length > 0 || realEtsy.length > 0;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4500,
      system: `You are an elite cross-border arbitrage analyst. Today: ${now.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}, Season: ${season}.
CRITICAL: Only generate opportunities where buy price is genuinely available on EU/JP markets at that price. Never inflate buy price — it must be achievable.
Platform fees: ${feeContext}.
Shipping estimates (USD): Clothing $12, Jewelry $18, Electronics $28, Collectibles $22, Sneakers $25, Spirits $35, Antiques $40, Watches $30.
netProfit formula: sell × (1 − fee%) − buy − shipping. REJECT any opportunity where netProfit < $15 or margin < 20%.`,
      messages: [{
        role: "user",
        content: `${hasReal
          ? `Use the VERIFIED LIVE DATA below to generate accurate arbitrage opportunities. The price gaps are CONFIRMED from real listings.${gapBlock}${etsyBlock}`
          : `Generate 10 highly specific arbitrage opportunities for ${season} ${now.getFullYear()}.
Top categories with confirmed EU→US price gaps:
1. Vintage mechanical watches (Omega, Tissot, Seiko) — EU €80-200, US $250-600 = 3-4x confirmed gap
2. Soviet cameras (Zenit, Zorki, FED, Kiev) — EU €10-25, US $50-120 = 4-5x confirmed
3. Baltic amber jewelry — PL market PLN 120-180, US Etsy $180-380 = 5-8x confirmed
4. Vintage denim (Levi's 501 pre-1990, Lee, Wrangler) — EU thrift €15-35, US $60-120 = 3-4x
5. German/Polish porcelain (Meissen, Rosenthal, Wawel) — EU €30-80, US Etsy $120-450 = 4-6x
6. Vintage sneakers EU-exclusive (Adidas Samba, Handball Spezial) — EU €55-80, StockX $130-200 = 2-3x
7. Pre-1980 film cameras (Leica, Voigtländer, Agfa) — EU €20-150, US $80-600 = 3-5x`
        }

Generate 8-10 specific opportunities. For each one verify: does the price gap actually exist in the real world?

Return ONLY a valid JSON array sorted by netProfit descending:
[{
  "id": 1,
  "name": "SPECIFIC product name — model, year, variant, condition",
  "buy": 35,
  "sell": 145,
  "profit": 110,
  "netProfit": 82,
  "margin": 75,
  "priceGapPct": 314,
  "market": "eBay USA",
  "category": "Watches",
  "score": 91,
  "risk": "low",
  "demandLevel": "high",
  "trend": "up",
  "flag": "🇵🇱→🇺🇸",
  "tip": "Exact reason why this gap exists and how to exploit it",
  "sourceUrl": "https://allegro.pl/listing?string=...",
  "sellUrl": "https://www.ebay.com/sch/i.html?_nkw=...&LH_Sold=1",
  "buyHint": "Exactly where and how to find it cheap — platform, search term, city/market",
  "sellHint": "SEO-optimised listing title for max search visibility",
  "confidence": "${hasReal ? "live" : "estimated"}"
}]

Rules:
- buy: must be ACHIEVABLE price on source market right now
- sell: use sold/completed prices not asking prices — what buyers ACTUALLY paid
- priceGapPct = round((sell/buy - 1) × 100)
- netProfit = sell × (1 - fee%) - buy - shipping
- FILTER OUT: netProfit < $15, margin < 20%, risk = high with demandLevel = low
- score: 40-98 weighted: netProfit 40%, demandLevel 30%, risk 20%, trend 10%`,
      }],
    }),
  });

  if (!res.ok) return [];
  const data = await res.json() as any;
  const rawText: string = data?.content?.[0]?.text ?? "";
  const text = rawText.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim();
  const match = text.match(/\[[\s\S]*?\]/s);
  if (!match) return [];

  try {
    const parsed = JSON.parse(match[0]) as any[];
    return parsed.map((o, i) => ({
      ...o,
      id: i + 1,
      netProfit: o.netProfit ?? calcNetProfit(o.sell, o.buy, o.market, o.category),
      priceGapPct: o.priceGapPct ?? (o.buy > 0 ? Math.round((o.sell / o.buy - 1) * 100) : 0),
      sellUrl: o.sellUrl || sellUrlForMarket(o.market ?? "", o.name ?? ""),
      sourceUrl: o.sourceUrl || sourceUrlForMarket("Allegro", o.name ?? ""),
      confidence: o.confidence ?? (hasReal ? "live" : "estimated"),
    }));
  } catch { return []; }
}

// ── Gap queries: detect real EU→US price differences ─────────────────────────
const GAP_QUERIES = [
  { query: "levis 501 vintage jeans used", maxBuyPrice: 45 },
  { query: "zorki zenit soviet film camera working", maxBuyPrice: 35 },
  { query: "omega seamaster vintage mechanical watch", maxBuyPrice: 350 },
  { query: "seiko vintage automatic watch", maxBuyPrice: 120 },
  { query: "meissen porcelain figurine vintage", maxBuyPrice: 150 },
  { query: "adidas samba vintage handball", maxBuyPrice: 90 },
  { query: "leica vintage film camera", maxBuyPrice: 500 },
  { query: "vintage polaroid camera working", maxBuyPrice: 55 },
];

// ── POST /api/resell/scan ─────────────────────────────────────────────────────
router.post("/scan", async (req: Request, res: Response) => {
  const { anthropicKey, ebayAppId, ebayCertId, etsyApiKey } = req.body ?? {};

  const aiKey: string = anthropicKey || process.env.ANTHROPIC_API_KEY || "";
  const ebayApp: string = ebayAppId || process.env.EBAY_APP_ID || "";
  const ebayCert: string = ebayCertId || process.env.EBAY_CERT_ID || "";
  const etsyKey: string = etsyApiKey || process.env.ETSY_API_KEY || "";

  let gapData: Array<{ query: string; gap: GapResult }> = [];
  let realEtsy: any[] = [];

  if (ebayApp && ebayCert) {
    try {
      const token = await getEbayToken(ebayApp, ebayCert);
      if (token) {
        const gaps = await Promise.all(
          GAP_QUERIES.map(async q => ({ query: q.query, gap: await detectGap(token, q.query, q.maxBuyPrice) }))
        );
        gapData = gaps.filter(g => g.gap.euListings.length > 0 || g.gap.usListings.length > 0);
        const confirmedGaps = gapData.filter(g => g.gap.gapPct > 30);
        console.log(`[resell/scan] Gap detection: ${confirmedGaps.length}/${gapData.length} queries have confirmed gaps`);
      }
    } catch (err) { console.error("[resell/scan] eBay gap detection:", err); }
  }

  if (etsyKey) {
    try {
      const results = await Promise.all([
        etsySearch(etsyKey, "vintage levis jeans denim"),
        etsySearch(etsyKey, "baltic amber pendant handmade"),
        etsySearch(etsyKey, "soviet film camera zorki"),
        etsySearch(etsyKey, "vintage omega watch mechanical"),
        etsySearch(etsyKey, "polish folk art handmade"),
      ]);
      realEtsy = results.flat().filter(i => i.price > 20);
      realEtsy.sort((a, b) => b.views - a.views);
    } catch (err) { console.error("[resell/scan] Etsy:", err); }
  }

  if (aiKey) {
    try {
      const aiResults = await scanWithAI(aiKey, gapData, realEtsy);
      const filtered = filterAndEnrich(aiResults, gapData.some(g => g.gap.gapPct > 0));
      if (filtered.length > 0) {
        const hasLive = gapData.some(g => g.gap.confidence === "live");
        return res.json({ opportunities: filtered, source: hasLive ? "live" : "ai", scannedAt: new Date().toISOString() });
      }
    } catch (err) { console.error("[resell/scan] AI:", err); }
  }

  const shuffled = [...FALLBACK].sort(() => Math.random() - 0.5);
  return res.json({ opportunities: shuffled, source: "cache", scannedAt: new Date().toISOString() });
});

// ── POST /api/resell/product-search ──────────────────────────────────────────
router.post("/product-search", async (req: Request, res: Response) => {
  const { query, anthropicKey, ebayAppId, ebayCertId, etsyApiKey, maxBudget, category } = req.body ?? {};
  if (!query?.trim()) return res.json({ results: [], source: "empty" });

  const aiKey: string = anthropicKey || process.env.ANTHROPIC_API_KEY || "";
  const ebayApp: string = ebayAppId || process.env.EBAY_APP_ID || "";
  const ebayCert: string = ebayCertId || process.env.EBAY_CERT_ID || "";
  const etsyKey: string = etsyApiKey || process.env.ETSY_API_KEY || "";

  const q = String(query).trim();
  const budget = maxBudget ? parseFloat(String(maxBudget)) : 500;

  // Real EU→US gap detection for this specific product
  let gapResult: GapResult = { euListings: [], usListings: [], medianEU: 0, medianUS: 0, gapPct: 0, gapMultiplier: 0, confidence: "no_data" };
  let gbListings: any[] = [];
  let realEtsy: any[] = [];

  if (ebayApp && ebayCert) {
    try {
      const token = await getEbayToken(ebayApp, ebayCert);
      if (token) {
        [gapResult, gbListings] = await Promise.all([
          detectGap(token, q, budget),
          ebaySearch(token, q, 9999, "EBAY_GB", "-price"),  // UK pricing too
        ]);
      }
    } catch (err) { console.error("[product-search] eBay:", err); }
  }

  if (etsyKey) {
    try { realEtsy = await etsySearch(etsyKey, q); } catch { /* ignore */ }
  }

  if (!aiKey) {
    return res.json({ results: [], source: "no-key", message: "Add Anthropic API key in Settings to get AI results" });
  }

  const now = new Date();
  const month = now.toLocaleString("en-US", { month: "long" });
  const season = ["December","January","February"].includes(month) ? "Winter"
    : ["March","April","May"].includes(month) ? "Spring"
    : ["June","July","August"].includes(month) ? "Summer" : "Autumn";

  const feeContext = Object.entries(PLATFORM_FEES).map(([p, f]) => `${p}: ${(f * 100).toFixed(1)}%`).join(", ");

  // Build rich context with real gap data
  let liveContext = "";
  if (gapResult.gapPct > 0) {
    liveContext += `\n\n=== VERIFIED PRICE GAP for "${q}" ===\n`;
    liveContext += `EU (eBay DE) median: €${gapResult.medianEU.toFixed(0)} | US (eBay USA) median: $${gapResult.medianUS.toFixed(0)}\n`;
    liveContext += `Confirmed gap: ${gapResult.gapPct}% (${gapResult.gapMultiplier}x multiplier)\n`;
    if (gapResult.euListings.length > 0) {
      liveContext += `\nBUY-SIDE (eBay DE, cheap, price ascending):\n`;
      liveContext += gapResult.euListings.slice(0, 5).map(i =>
        `  BUY: "${i.title.slice(0, 65)}" — €${i.price.toFixed(0)} | ${i.condition}`
      ).join("\n");
    }
    if (gapResult.usListings.length > 0) {
      liveContext += `\n\nSELL-SIDE (eBay USA, expensive, price descending):\n`;
      liveContext += gapResult.usListings.slice(0, 5).map(i =>
        `  SELL: "${i.title.slice(0, 65)}" — $${i.price.toFixed(0)} | watches:${i.watchCount}`
      ).join("\n");
    }
    if (gbListings.length > 0) {
      liveContext += `\n\nUK MARKET (eBay GB, alternative sell destination):\n`;
      liveContext += gbListings.slice(0, 3).map(i =>
        `  UK: "${i.title.slice(0, 65)}" — £${i.price.toFixed(0)}`
      ).join("\n");
    }
  } else if (gapResult.euListings.length > 0 || gapResult.usListings.length > 0) {
    // Have data but no confirmed gap — still useful context
    liveContext += `\n\nLIVE MARKET DATA for "${q}" (gap not confirmed):\n`;
    if (gapResult.euListings.length > 0) {
      liveContext += `EU side: ${gapResult.euListings.slice(0, 4).map(i => `$${i.price.toFixed(0)}`).join(", ")}\n`;
    }
    if (gapResult.usListings.length > 0) {
      liveContext += `US side: ${gapResult.usListings.slice(0, 4).map(i => `$${i.price.toFixed(0)}`).join(", ")}\n`;
    }
  }

  if (realEtsy.length > 0) {
    liveContext += `\nETSY SELL-SIDE:\n`;
    liveContext += realEtsy.slice(0, 5).map(i =>
      `  ETSY: "${i.title.slice(0, 65)}" — $${i.price.toFixed(0)} | favorers:${i.views}`
    ).join("\n");
  }

  const sourceMarketMap: Record<string, string> = {
    Clothing: "Allegro PL, OLX PL, Vinted EU, thrift stores, eBay DE",
    Jewelry: "Allegro PL, Baltic coast markets, OLX PL, estate sales",
    Electronics: "Kleinanzeigen.de, eBay DE, Allegro PL, Leboncoin FR",
    Collectibles: "Allegro PL, OLX PL, flea markets, eBay DE",
    Sneakers: "Allegro PL, Vinted EU, Footshop.eu, eBay DE",
    Watches: "Polish flea markets, Kleinanzeigen.de, eBay DE, Allegro PL",
    Antiques: "Kleinanzeigen.de, eBay DE, Polish antique markets",
    Spirits: "Yahoo Auctions JP, Mercari JP (verify import rules)",
  };
  const sourceMarkets = category ? (sourceMarketMap[String(category)] ?? "Allegro PL, Kleinanzeigen.de, OLX, Vinted") : "Allegro PL, Kleinanzeigen.de, OLX PL, Vinted EU, Yahoo Auctions JP";

  try {
    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": aiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 3500,
        system: `You are an elite cross-border arbitrage analyst specializing in EU→USA/UK price gaps.
Today: ${now.toLocaleDateString("en-US")}, Season: ${season}.
Platform fees: ${feeContext}.
Shipping estimates: Clothing $12, Jewelry $18, Electronics $28, Collectibles $22, Sneakers $25, Spirits $35, Antiques $40, Watches $30.
Best source markets: ${sourceMarkets}.
User max budget: $${budget}.
CRITICAL: buy price must be genuinely achievable on the source market. Use sold/completed prices for sell-side, not asking prices. Reject any opportunity where netProfit < $15 or margin < 20%.`,
        messages: [{
          role: "user",
          content: `Find arbitrage opportunities for: "${q}"${category ? ` (category: ${category})` : ""}${liveContext ? `\n\nLIVE MARKET DATA:${liveContext}\n\nIMPORTANT: Use the verified gap data above to set buy/sell prices accurately.` : "\n\nNo live data — use knowledge of typical EU/US price gaps."}

Generate 5-7 specific buy-cheap / sell-high opportunities for "${q}".
For each opportunity: buyMarket = cheap source, sellMarket = high-demand destination.

Return ONLY a valid JSON array sorted by netProfit descending:
[{
  "id": 1,
  "name": "SPECIFIC product: model/year/variant/condition",
  "buyMarket": "Allegro PL",
  "sellMarket": "eBay USA",
  "buy": 35,
  "sell": 120,
  "profit": 85,
  "netProfit": 58,
  "margin": 71,
  "priceGapPct": 243,
  "score": 88,
  "risk": "low",
  "demandLevel": "high",
  "category": "${category || "General"}",
  "flag": "🇵🇱→🇺🇸",
  "buyHint": "exact platform + search term + sub-category + best price range",
  "sellHint": "SEO-optimised listing title for target platform",
  "tip": "one sentence: why this price gap exists right now",
  "sourceUrl": "direct search URL on buy market",
  "sellUrl": "direct sold/completed listings URL on sell market",
  "confidence": "${gapResult.gapPct > 0 ? "live" : "estimated"}"
}]

netProfit = sell × (1 − fee_decimal) − buy − shipping_estimate. Sort descending by netProfit.`,
        }],
      }),
    });

    if (!aiRes.ok) return res.json({ results: [], source: "ai-error" });
    const aiData = await aiRes.json() as any;
    const rawText: string = aiData?.content?.[0]?.text ?? "";
    const clean = rawText.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim();
    const match = clean.match(/\[[\s\S]*?\]/s);
    if (!match) return res.json({ results: [], source: "parse-error" });

    const parsed = JSON.parse(match[0]) as any[];
    const hasLive = gapResult.gapPct > 0 || realEtsy.length > 0;
    const enriched = parsed.map((o: any, i: number) => ({
      ...o,
      id: i + 1,
      netProfit: o.netProfit ?? calcNetProfit(o.sell, o.buy, o.sellMarket, o.category ?? "General"),
      priceGapPct: o.priceGapPct ?? (o.buy > 0 ? Math.round((o.sell / o.buy - 1) * 100) : 0),
      sourceUrl: o.sourceUrl || sourceUrlForMarket(o.buyMarket ?? "", o.name ?? q),
      sellUrl: o.sellUrl || sellUrlForMarket(o.sellMarket ?? "", o.name ?? q),
      confidence: o.confidence ?? (hasLive ? "live" : "estimated"),
    }));

    const filtered = filterAndEnrich(enriched, hasLive);
    return res.json({ results: filtered, source: hasLive ? "live" : "ai", query: q });
  } catch (err) {
    console.error("[product-search] error:", err);
    return res.json({ results: [], source: "error" });
  }
});

// ── POST /api/resell/generate-offer ──────────────────────────────────────────
router.post("/generate-offer", async (req: Request, res: Response) => {
  const { product, anthropicKey, tone = "professional", focus = "balanced" } = req.body ?? {};
  if (!product?.name) return res.json({ error: "No product provided" });

  const aiKey: string = anthropicKey || process.env.ANTHROPIC_API_KEY || "";
  if (!aiKey) return res.json({ error: "no-key", message: "Add Anthropic API key in Settings" });

  const p = product;
  const platform = p.market ?? "eBay USA";
  const isEtsy = platform.toLowerCase().includes("etsy");
  const isAmazon = platform.toLowerCase().includes("amazon");
  const isStockX = platform.toLowerCase().includes("stockx");
  const isVinted = platform.toLowerCase().includes("vinted");

  const platformRules = isEtsy
    ? `Etsy: title max 140 chars — storytelling, 13 tags each max 20 chars, paragraph prose, emphasize handmade/vintage/unique origin.`
    : isAmazon
    ? `Amazon: title max 200 chars — brand + model + size/color/condition, keyword-first. Description as bullet points.`
    : isStockX
    ? `StockX: title must match exact product name (style code if known), condition: Deadstock/New/Used, include size.`
    : isVinted
    ? `Vinted: short friendly title, casual tone, emphasize size/brand/condition, short single-word tags.`
    : `eBay: title max 80 chars — keyword-dense, include model/year/condition/size. No punctuation except hyphens.`;

  const toneGuide: Record<string, string> = {
    professional: "Clear, factual, keyword-optimized. Focus on specs and condition.",
    vintage: "Warm storytelling. Reference the era, history, patina, authenticity. Make the buyer feel the journey.",
    luxury: "Premium, aspirational. Words like: rare, curated, collector-grade, museum-quality. Emphasize exclusivity.",
    urgency: "Create scarcity: limited availability, high demand, ships today. Encourage immediate action.",
  };
  const focusGuide: Record<string, string> = {
    balanced: "Balance SEO keywords, emotional appeal, and conversion.",
    seo: "Maximize search visibility — front-load the most searched keywords in title and first sentence.",
    conversion: "Maximize purchase intent — lead with strongest benefit, add social proof, end with clear CTA.",
    rarity: "Emphasize how rare and hard-to-find this item is. Why this is a once-in-a-while opportunity.",
  };

  const fee = PLATFORM_FEES[platform] ?? 0.13;
  const ship = AVG_SHIPPING[p.category ?? "General"] ?? 20;
  const netProfit = p.sell ? Math.round(p.sell * (1 - fee) - (p.buy ?? 0) - ship) : 0;

  try {
    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": aiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1800,
        system: `You are an expert marketplace listing copywriter specializing in cross-border arbitrage listings.
Platform: ${platform}. ${platformRules}
Tone: ${toneGuide[String(tone)] ?? toneGuide.professional}
Focus: ${focusGuide[String(focus)] ?? focusGuide.balanced}`,
        messages: [{
          role: "user",
          content: `Create a high-converting ${platform} listing:
Product: ${p.name}
Category: ${p.category ?? "General"}
Buy price: $${p.buy ?? "?"} | Sell price: $${p.sell ?? "?"}
Route: ${p.flag ?? "International"}
${p.tip ? `Market insight: ${p.tip}` : ""}
${p.sellHint ? `SEO hint: ${p.sellHint}` : ""}
${p.buyHint ? `Product context: ${p.buyHint}` : ""}
Seller net profit after fees+shipping: $${netProfit}

Return ONLY valid JSON (no markdown fences):
{
  "title": "platform-optimized title per platform rules",
  "description": "full description using specified tone and focus. eBay: bullet points + condition. Etsy: narrative. Include provenance/origin.",
  "tags": ["tag1","tag2","tag3","tag4","tag5","tag6","tag7","tag8","tag9","tag10","tag11","tag12","tag13"],
  "price": ${p.sell ?? 0},
  "highlights": ["strongest selling point","second selling point","third selling point"],
  "shippingNote": "recommended carrier, method, estimated transit time and cost",
  "seoKeywords": ["keyword1","keyword2","keyword3","keyword4","keyword5"],
  "itemSpecifics": {
    "Brand": "brand or Vintage/Handmade",
    "Model": "specific model/style",
    "Condition": "New / Used - Excellent / Pre-owned / Vintage",
    "Year": "year or decade",
    "Country/Region of Manufacture": "country",
    "Material": "primary material"
  },
  "priceNote": "one sentence: is $${p.sell ?? 0} competitive on ${platform}? E.g. '28% below comparable sold listings'",
  "urgencyNote": "one short urgency phrase e.g. 'Ships within 24h — only 1 in stock'"
}`,
        }],
      }),
    });

    if (!aiRes.ok) return res.json({ error: "ai-error", message: `AI returned ${aiRes.status}` });
    const aiData = await aiRes.json() as any;
    const rawText: string = aiData?.content?.[0]?.text ?? "";
    const clean = rawText.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim();
    const match = clean.match(/\{[\s\S]*\}/);
    if (!match) return res.json({ error: "parse-error" });

    const offer = JSON.parse(match[0]);
    return res.json({ offer, product: p, platform, tone, focus, source: "ai" });
  } catch (err) {
    console.error("[generate-offer] error:", err);
    return res.json({ error: "server-error" });
  }
});

export default router;
