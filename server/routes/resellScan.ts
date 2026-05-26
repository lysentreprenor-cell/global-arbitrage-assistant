import { Router, type Request, type Response } from "express";

const router = Router();

const FALLBACK = [
  { id: 1, name: "Levi's 501 W32 L32 — vintage wash", buy: 28, sell: 82, profit: 54, netProfit: 41, margin: 66, market: "eBay USA", category: "Clothing", score: 93, risk: "low", demandLevel: "high", trend: "up", flag: "🇵🇱→🇺🇸", tip: "Vintage wash 501s sell 2-3× faster than regular — US buyers pay premium", sourceUrl: "https://allegro.pl/listing?string=levis+501+vintage+w32", buyHint: "Allegro PL / OLX — szukaj W30-W34 Made in EU", sellHint: "Levi's 501 Vintage Wash W32 L32 Made in Europe — Original", imageUrl: "" },
  { id: 2, name: "Baltic Amber Pendant — raw natural", buy: 45, sell: 265, profit: 220, netProfit: 192, margin: 83, market: "Etsy USA", category: "Jewelry", score: 97, risk: "low", demandLevel: "high", trend: "up", flag: "🇵🇱→🇺🇸", tip: "Raw Baltic amber sells for 4-6× Polish retail price on Etsy — no competition from Asia", sourceUrl: "https://allegro.pl/listing?string=bursztyn+baltycki+wisiorek+naturalny", buyHint: "Allegro PL lub targi bałtyckie — szukaj z inkluzjami", sellHint: "Baltic Amber Raw Pendant Natural Inclusion Genuine Sterling Silver", imageUrl: "" },
  { id: 3, name: "Leica M3 Camera — working, clean", buy: 380, sell: 920, profit: 540, netProfit: 421, margin: 59, market: "eBay USA", category: "Electronics", score: 89, risk: "medium", demandLevel: "medium", trend: "up", flag: "🇩🇪→🇺🇸", tip: "Kleinanzeigen.de prices 40% below US eBay — German sellers don't know US demand", sourceUrl: "https://www.kleinanzeigen.de/s-leica-m3/k0", buyHint: "Kleinanzeigen.de Bawaria/Niemcy — 'Leica M3 verkaufen'", sellHint: "Leica M3 Double Stroke Camera Body Working Tested CLA Ready", imageUrl: "" },
  { id: 4, name: "Adidas Samba OG — EU exclusive colorway", buy: 70, sell: 155, profit: 85, netProfit: 61, margin: 55, market: "StockX USA", category: "Sneakers", score: 84, risk: "low", demandLevel: "high", trend: "up", flag: "🇵🇱→🇺🇸", tip: "EU-exclusive Samba colorways unavailable in US — StockX premium 2x retail", sourceUrl: "https://allegro.pl/listing?string=adidas+samba+og", buyHint: "Allegro PL lub Footshop.eu — EU exclusive dropy, rozmiar 41-44", sellHint: "Adidas Samba OG EU Exclusive [Colorway] Size US — Deadstock", imageUrl: "" },
  { id: 5, name: "Meissen Porcelain Figure — 1950s", buy: 75, sell: 320, profit: 245, netProfit: 202, margin: 77, market: "Etsy USA", category: "Antiques", score: 91, risk: "medium", demandLevel: "medium", trend: "up", flag: "🇩🇪→🇺🇸", tip: "East German porcelain massively undervalued at local auctions vs US collector market", sourceUrl: "https://www.kleinanzeigen.de/s-meissen-figur/k0", buyHint: "Aukcje eBay.de / Dresdner Auktionshaus — 'Meissen Figur'", sellHint: "Meissen Porcelain Figurine 1950s Handpainted Vintage Crossed Swords", imageUrl: "" },
  { id: 6, name: "Zorki-4 Camera — 1960s working", buy: 22, sell: 74, profit: 52, netProfit: 40, margin: 70, market: "Etsy USA", category: "Collectibles", score: 85, risk: "low", demandLevel: "high", trend: "up", flag: "🇵🇱→🇺🇸", tip: "Soviet film cameras: cult following in US — Etsy vintage buyers pay 3x Polish price", sourceUrl: "https://allegro.pl/listing?string=aparat+zorki+4+dzialajacy", buyHint: "Allegro PL / OLX — filtruj 'sprawny', budżet do 80 PLN", sellHint: "Zorki 4 Soviet Rangefinder Camera Working 1960s Film Photography", imageUrl: "" },
  { id: 7, name: "Nikka From The Barrel Whisky", buy: 88, sell: 195, profit: 107, netProfit: 78, margin: 55, market: "Amazon UK", category: "Spirits", score: 78, risk: "high", demandLevel: "medium", trend: "stable", flag: "🇯🇵→🇬🇧", tip: "Japanese whisky shortage drives UK premiums — verify shipping restrictions first", sourceUrl: "https://www.amazon.co.jp/s?k=nikka+from+the+barrel", buyHint: "Yahoo Auctions JP lub Mercari JP — sprawdź przepisy importowe", sellHint: "Nikka From The Barrel 500ml Japanese Blended Whisky UK Import", imageUrl: "" },
  { id: 8, name: "Vintage Omega Seamaster 1960s", buy: 220, sell: 680, profit: 460, netProfit: 371, margin: 68, market: "eBay USA", category: "Watches", score: 94, risk: "medium", demandLevel: "high", trend: "up", flag: "🇵🇱→🇺🇸", tip: "Pre-1970 Omega watches: Polish flea markets 30% below European average — US demand very high", sourceUrl: "https://allegro.pl/listing?string=omega+seamaster+vintage+zegarek", buyHint: "Targi niedzielne Warszawa/Kraków — pytaj o 'zegarki vintage'", sellHint: "Omega Seamaster Vintage 1960s Automatic Cal.285 Original Dial Working", imageUrl: "" },
];

// ── eBay OAuth ────────────────────────────────────────────────────────────────
async function getEbayToken(appId: string, certId: string): Promise<string | null> {
  try {
    const encoded = Buffer.from(`${appId}:${certId}`).toString("base64");
    const r = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
      method: "POST",
      headers: { Authorization: `Basic ${encoded}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope",
    });
    if (!r.ok) return null;
    const d = await r.json() as any;
    return d.access_token ?? null;
  } catch { return null; }
}

// ── eBay Browse ───────────────────────────────────────────────────────────────
async function ebaySearch(token: string, query: string, maxPrice: number, marketplace = "EBAY_US"): Promise<any[]> {
  try {
    // fieldgroups=EXTENDED unlocks watchCount (requires eBay app permission for watchCount data)
    const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(query)}&fieldgroups=EXTENDED&filter=price:[1..${maxPrice}],conditionIds:{3000|4000|5000|6000}&limit=8&sort=price`;
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, "X-EBAY-C-MARKETPLACE-ID": marketplace },
    });
    if (!r.ok) {
      console.error(`[eBay] HTTP ${r.status} for query="${query}"`);
      return [];
    }
    const d = await r.json() as any;
    return (d.itemSummaries ?? []).map((i: any) => ({
      title: i.title,
      price: parseFloat(i.price?.value ?? "0"),
      currency: i.price?.currency ?? "USD",
      url: i.itemWebUrl ?? "",
      image: i.image?.imageUrl ?? "",
      condition: i.condition ?? "",
      watchCount: i.watchCount ?? i.legacyItemId ? 1 : 0,
      marketplace,
    }));
  } catch (err) {
    console.error("[eBay] fetch error:", err);
    return [];
  }
}

// ── Etsy ──────────────────────────────────────────────────────────────────────
async function etsySearch(apiKey: string, query: string): Promise<any[]> {
  try {
    const url = `https://openapi.etsy.com/v3/application/listings/active?keywords=${encodeURIComponent(query)}&limit=8&sort_on=price&sort_order=desc`;
    const r = await fetch(url, { headers: { "x-api-key": apiKey } });
    if (!r.ok) {
      console.error(`[Etsy] HTTP ${r.status} for query="${query}"`);
      return [];
    }
    const d = await r.json() as any;
    return (d.results ?? []).map((i: any) => ({
      title: i.title,
      price: (i.price?.amount ?? 0) / (i.price?.divisor ?? 100),
      currency: i.price?.currency_code ?? "USD",
      url: i.url ?? `https://www.etsy.com/listing/${i.listing_id}`,
      image: i.images?.[0]?.url_570xN ?? "",
      views: i.num_favorers ?? i.views ?? 0,  // num_favorers = current v3 field
      marketplace: "ETSY_US",
    }));
  } catch (err) {
    console.error("[Etsy] fetch error:", err);
    return [];
  }
}

// ── Platform fees & shipping estimates ───────────────────────────────────────
const PLATFORM_FEES: Record<string, number> = {
  "eBay USA": 0.1325,
  "Etsy USA": 0.065 + 0.03,   // listing + payment
  "Amazon UK": 0.15,
  "eBay DE": 0.12,
  "Amazon DE": 0.15,
  "Vinted EU": 0,
  "StockX USA": 0.095,
  "Depop": 0.10,
};

const AVG_SHIPPING: Record<string, number> = {
  "Clothing": 12,
  "Jewelry": 18,
  "Electronics": 28,
  "Collectibles": 22,
  "Sneakers": 25,
  "Spirits": 35,
  "Antiques": 40,
  "Watches": 30,
  "General": 20,
};

function calcNetProfit(sellPrice: number, buyPrice: number, market: string, category: string): number {
  const fee = PLATFORM_FEES[market] ?? 0.13;
  const ship = AVG_SHIPPING[category] ?? 20;
  return Math.round(sellPrice * (1 - fee) - buyPrice - ship);
}

// ── Smart AI scan ─────────────────────────────────────────────────────────────
async function scanWithAI(apiKey: string, realEbay: any[] = [], realEtsy: any[] = []): Promise<any[]> {
  const now = new Date();
  const month = now.toLocaleString("en-US", { month: "long" });
  const season = ["December","January","February"].includes(month) ? "Winter"
    : ["March","April","May"].includes(month) ? "Spring"
    : ["June","July","August"].includes(month) ? "Summer" : "Autumn";

  let contextBlock = "";
  if (realEbay.length > 0) {
    contextBlock += `\n\nREAL cheap source listings from eBay (buy here):\n${realEbay.slice(0, 15).map(i =>
      `  • "${i.title}" — $${i.price.toFixed(2)} | ${i.condition} | watches:${i.watchCount} | URL:${i.url}`
    ).join("\n")}`;
  }
  if (realEtsy.length > 0) {
    contextBlock += `\n\nREAL expensive Etsy listings (sell here):\n${realEtsy.slice(0, 15).map(i =>
      `  • "${i.title}" — $${i.price.toFixed(2)} | views:${i.views} | URL:${i.url}`
    ).join("\n")}`;
  }
  const hasReal = realEbay.length > 0 || realEtsy.length > 0;

  // Platform fees context for accurate net profit
  const feeContext = Object.entries(PLATFORM_FEES)
    .map(([p, f]) => `${p}: ${(f * 100).toFixed(1)}%`).join(", ");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4000,
      system: `You are an elite cross-border arbitrage analyst with 10+ years experience.
You know exactly what sells, at what price, on which platform, and WHY.
You understand platform fees, shipping costs, buyer psychology, and market inefficiencies.
Today: ${now.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}, Season: ${season}.
Platform fees: ${feeContext}.
Estimated shipping per category (USD): Clothing $12, Jewelry $18, Electronics $28, Collectibles $22, Sneakers $25, Spirits $35, Antiques $40, Watches $30.`,
      messages: [{
        role: "user",
        content: `${hasReal
          ? `Analyze these REAL marketplace listings and extract the best arbitrage opportunities. Use the actual URLs and prices from the data.${contextBlock}`
          : `Generate 10 highly specific, realistic arbitrage opportunities for ${season} ${now.getFullYear()}.
Focus on:
- Poland/Czech/Hungary flea markets & Allegro → eBay USA / Etsy USA
- Germany/Austria Kleinanzeigen → US/UK collectors
- Japan Yahoo Auctions → UK/EU
- ${season}-specific demand (what people buy in ${season})

Categories with highest margins right now:
1. Vintage mechanical watches (Omega, Tissot, Seiko) — EU flea markets 50% below US eBay
2. Soviet/Eastern European cameras (Zenit, Zorki, Kiev) — huge Etsy film photography demand
3. Baltic amber jewelry — hand-made, no Asian competition on Etsy
4. Vintage denim (Levi's 501, Lee, Wrangler) pre-1990 — EU thrift shops undervalue
5. German/Polish porcelain (Rosenthal, Wawel) — American collectors pay 3-5x
6. Vintage sneakers EU-only colorways (Adidas, Reebok) — US StockX/eBay premiums
7. Polish hand-made folk art — unique, Etsy USA pays 4-6x local price
8. Pre-1980 electronics (calculators, radios, cameras) — nostalgia market
9. Hunting/military surplus — Eastern Europe has surplus, US collectors demand
10. Vintage sports memorabilia — Polish/Czech football cards underpriced`
        }

Return ONLY a valid JSON array with 8-10 opportunities:
[
  {
    "id": 1,
    "name": "specific product name with model/year/variant",
    "buy": 45,
    "sell": 145,
    "profit": 100,
    "netProfit": 72,
    "margin": 69,
    "market": "eBay USA",
    "category": "Watches",
    "score": 91,
    "risk": "low",
    "demandLevel": "high",
    "trend": "up",
    "flag": "🇵🇱→🇺🇸",
    "tip": "One specific sentence: why this arbitrage exists NOW and how to exploit it",
    "sourceUrl": "https://allegro.pl/listing?string=...",
    "buyHint": "Where exactly to find it cheap (specific flea market, platform, search term)",
    "sellHint": "Best listing title format for max visibility",
    "imageUrl": ""
  }
]

Rules:
- name: VERY specific (model, year, variant, condition) — not generic
- buy: realistic EUR/USD price at source market
- sell: realistic price on target platform (check against known sold listings)
- profit = sell - buy
- netProfit = sell × (1 - platform_fee) - buy - shipping (use the fee and shipping tables)
- margin = round((profit/sell)×100)
- score: 40-98 weighted by: netProfit (40%), demandLevel (30%), risk (20%), trend (10%)
- risk: "low" (common, easy to authenticate), "medium" (needs inspection), "high" (fragile/restricted)
- demandLevel: "high" (sells in <7 days), "medium" (7-21 days), "low" (21+ days)
- trend: "up" (demand increasing), "stable", "down"
- buyHint: actionable — exact search terms, time of year, specific platforms
- sellHint: SEO-optimised listing title format
- sourceUrl: real search URL on source marketplace
- Sort by score descending`,
      }],
    }),
  });

  if (!res.ok) {
    console.error("[resell/scan] AI HTTP error:", res.status, await res.text());
    return [];
  }
  const data = await res.json() as any;
  const rawText: string = data?.content?.[0]?.text ?? "";
  // Strip markdown code fences (```json ... ``` or ``` ... ```)
  const text = rawText.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim();
  const match = text.match(/\[[\s\S]*?\]/s);
  if (!match) {
    console.error("[resell/scan] No JSON array found in AI response");
    return [];
  }

  try {
    const parsed = JSON.parse(match[0]) as any[];
    return parsed.map((o, i) => ({
      ...o,
      id: i + 1,
      // Recalculate netProfit server-side to catch AI mistakes
      netProfit: o.netProfit ?? calcNetProfit(o.sell, o.buy, o.market, o.category),
    }));
  } catch { return []; }
}

// ── Many scan queries across categories ──────────────────────────────────────
const SCAN_QUERIES = [
  // Clothing
  { query: "levis 501 vintage jeans used", maxPrice: 45 },
  { query: "wrangler vintage denim jacket", maxPrice: 55 },
  // Cameras / electronics
  { query: "zorki zenit soviet film camera working", maxPrice: 35 },
  { query: "vintage polaroid camera working", maxPrice: 50 },
  { query: "leica vintage camera body", maxPrice: 500 },
  // Jewelry
  { query: "baltic amber pendant silver", maxPrice: 80 },
  { query: "handmade folk jewelry ethnic", maxPrice: 60 },
  // Watches
  { query: "omega seamaster vintage mechanical", maxPrice: 350 },
  { query: "seiko vintage watch automatic", maxPrice: 120 },
  // Collectibles
  { query: "meissen rosenthal porcelain vintage", maxPrice: 150 },
  { query: "polish folk art handmade wood", maxPrice: 50 },
  // Sneakers
  { query: "adidas vintage samba handball", maxPrice: 90 },
];

router.post("/scan", async (req: Request, res: Response) => {
  const { anthropicKey, ebayAppId, ebayCertId, etsyApiKey } = req.body ?? {};

  const aiKey: string = anthropicKey || process.env.ANTHROPIC_API_KEY || "";
  const ebayApp: string = ebayAppId || process.env.EBAY_APP_ID || "";
  const ebayCert: string = ebayCertId || process.env.EBAY_CERT_ID || "";
  const etsyKey: string = etsyApiKey || process.env.ETSY_API_KEY || "";

  let realEbay: any[] = [];
  let realEtsy: any[] = [];

  // Real eBay data
  if (ebayApp && ebayCert) {
    try {
      const token = await getEbayToken(ebayApp, ebayCert);
      if (token) {
        const results = await Promise.all(SCAN_QUERIES.map(q => ebaySearch(token, q.query, q.maxPrice)));
        realEbay = results.flat().filter(i => i.price > 0 && i.watchCount >= 0);
        // Sort by watchCount descending — high watch count = high demand
        realEbay.sort((a, b) => b.watchCount - a.watchCount);
        console.log(`[resell/scan] eBay: ${realEbay.length} listings`);
      }
    } catch (err) { console.error("[resell/scan] eBay:", err); }
  }

  // Real Etsy data — expensive side
  if (etsyKey) {
    try {
      const results = await Promise.all([
        etsySearch(etsyKey, "vintage levis jeans denim"),
        etsySearch(etsyKey, "baltic amber pendant handmade"),
        etsySearch(etsyKey, "soviet film camera zorki zenit"),
        etsySearch(etsyKey, "vintage omega watch mechanical"),
        etsySearch(etsyKey, "polish folk art handmade"),
      ]);
      realEtsy = results.flat().filter(i => i.price > 20);
      realEtsy.sort((a, b) => b.views - a.views);
      console.log(`[resell/scan] Etsy: ${realEtsy.length} listings`);
    } catch (err) { console.error("[resell/scan] Etsy:", err); }
  }

  // AI analysis
  if (aiKey) {
    try {
      const aiResults = await scanWithAI(aiKey, realEbay, realEtsy);
      if (aiResults.length > 0) {
        const source = realEbay.length > 0 || realEtsy.length > 0 ? "live" : "ai";
        return res.json({ opportunities: aiResults, source, scannedAt: new Date().toISOString() });
      }
    } catch (err) { console.error("[resell/scan] AI:", err); }
  }

  // Fallback
  const shuffled = [...FALLBACK].sort(() => Math.random() - 0.5);
  return res.json({ opportunities: shuffled, source: "cache", scannedAt: new Date().toISOString() });
});

// ── Product-specific search ───────────────────────────────────────────────────
router.post("/product-search", async (req: Request, res: Response) => {
  const { query, anthropicKey, ebayAppId, ebayCertId, etsyApiKey } = req.body ?? {};
  if (!query?.trim()) return res.json({ results: [], source: "empty" });

  const aiKey: string = anthropicKey || process.env.ANTHROPIC_API_KEY || "";
  const ebayApp: string = ebayAppId || process.env.EBAY_APP_ID || "";
  const ebayCert: string = ebayCertId || process.env.EBAY_CERT_ID || "";
  const etsyKey: string = etsyApiKey || process.env.ETSY_API_KEY || "";

  const q = String(query).trim();

  // Try live eBay search for the specific product
  let realEbay: any[] = [];
  if (ebayApp && ebayCert) {
    const token = await getEbayToken(ebayApp, ebayCert);
    if (token) realEbay = await ebaySearch(token, q, 999);
  }

  // Try Etsy
  let realEtsy: any[] = [];
  if (etsyKey) {
    realEtsy = await etsySearch(etsyKey, q);
  }

  if (!aiKey) {
    // Minimal fallback without AI
    return res.json({ results: [], source: "no-key", message: "Add Anthropic API key in Settings to get AI results" });
  }

  const now = new Date();
  const month = now.toLocaleString("en-US", { month: "long" });
  const season = ["December","January","February"].includes(month) ? "Winter"
    : ["March","April","May"].includes(month) ? "Spring"
    : ["June","July","August"].includes(month) ? "Summer" : "Autumn";

  const feeContext = Object.entries(PLATFORM_FEES).map(([p, f]) => `${p}: ${(f * 100).toFixed(1)}%`).join(", ");

  let liveContext = "";
  if (realEbay.length > 0) {
    liveContext += `\nReal eBay listings found for "${q}":\n${realEbay.slice(0, 10).map(i =>
      `  • "${i.title}" — $${i.price.toFixed(2)} | ${i.condition} | watches:${i.watchCount} | ${i.url}`
    ).join("\n")}`;
  }
  if (realEtsy.length > 0) {
    liveContext += `\nReal Etsy listings for "${q}":\n${realEtsy.slice(0, 10).map(i =>
      `  • "${i.title}" — $${i.price.toFixed(2)} | favorers:${i.views} | ${i.url}`
    ).join("\n")}`;
  }

  try {
    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": aiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 3000,
        system: `You are an elite cross-border arbitrage analyst. Today: ${now.toLocaleDateString("en-US")}, Season: ${season}. Platform fees: ${feeContext}. Shipping estimates: Clothing $12, Jewelry $18, Electronics $28, Collectibles $22, Sneakers $25, Spirits $35, Antiques $40, Watches $30.`,
        messages: [{
          role: "user",
          content: `User searches for: "${q}"${liveContext ? `\n${liveContext}` : ""}

Generate 4-6 specific arbitrage opportunities related to "${q}".
${liveContext ? "Use the real listing data above where relevant." : "Use your knowledge of typical market prices."}

Return ONLY a valid JSON array:
[{
  "id": 1, "name": "specific product with model/variant",
  "buyMarket": "Allegro PL", "sellMarket": "eBay USA",
  "buy": 35, "sell": 110,
  "profit": 75, "netProfit": 52, "margin": 68,
  "score": 88, "risk": "low", "demandLevel": "high",
  "flag": "🇵🇱→🇺🇸",
  "buyHint": "where exactly to buy cheap",
  "sellHint": "SEO listing title",
  "tip": "one sentence on why this arbitrage exists",
  "sourceUrl": "https://allegro.pl/listing?string=..."
}]
Rules: netProfit = sell*(1-fee) - buy - shipping. Sort by netProfit desc.`,
        }],
      }),
    });

    if (!aiRes.ok) return res.json({ results: [], source: "ai-error" });
    const aiData = await aiRes.json() as any;
    const rawText: string = aiData?.content?.[0]?.text ?? "";
    const cleanText = rawText.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim();
    const match = cleanText.match(/\[[\s\S]*?\]/s);
    if (!match) return res.json({ results: [], source: "parse-error" });

    const parsed = JSON.parse(match[0]) as any[];
    const results = parsed.map((o: any, i: number) => ({
      ...o,
      id: i + 1,
      netProfit: o.netProfit ?? calcNetProfit(o.sell, o.buy, o.sellMarket, o.category ?? "General"),
    }));
    const source = realEbay.length > 0 || realEtsy.length > 0 ? "live" : "ai";
    return res.json({ results, source, query: q });
  } catch (err) {
    console.error("[product-search] error:", err);
    return res.json({ results: [], source: "error" });
  }
});

export default router;
