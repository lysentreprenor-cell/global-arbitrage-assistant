import { Router, type Request, type Response } from "express";

const router = Router();

const FALLBACK = [
  { id: 1, name: "Levi's 501 W32 — Poland", buy: 30, sell: 78, profit: 48, margin: 62, market: "eBay USA", category: "Clothing", score: 92, trend: "up", flag: "🇵🇱→🇺🇸", tip: "Vintage denim commands 2-3x premium in US vs EU", sourceUrl: "https://www.ebay.com/sch/i.html?_nkw=levis+501+vintage+w32", imageUrl: "" },
  { id: 2, name: "Baltic Amber Pendant", buy: 50, sell: 260, profit: 210, margin: 80, market: "Etsy USA", category: "Jewelry", score: 96, trend: "up", flag: "🇵🇱→🇺🇸", tip: "Baltic amber is rare in US — handmade jewelry sells fast on Etsy", sourceUrl: "https://www.etsy.com/search?q=baltic+amber+pendant", imageUrl: "" },
  { id: 3, name: "Vintage Leica M3 Camera", buy: 420, sell: 890, profit: 470, margin: 53, market: "eBay DE", category: "Electronics", score: 88, trend: "up", flag: "🇩🇪→🇺🇸", tip: "German camera market underprices Leica vs US collectors", sourceUrl: "https://www.kleinanzeigen.de/s-leica-m3/k0", imageUrl: "" },
  { id: 4, name: "Japanese Whisky Nikka 12y", buy: 95, sell: 210, profit: 115, margin: 55, market: "Amazon UK", category: "Spirits", score: 79, trend: "up", flag: "🇯🇵→🇬🇧", tip: "Japanese whisky scarcity drives premium pricing in UK", sourceUrl: "https://www.amazon.co.uk/s?k=nikka+whisky+12", imageUrl: "" },
  { id: 5, name: "Soviet Zorki-4 Camera", buy: 25, sell: 68, profit: 43, margin: 63, market: "Etsy USA", category: "Collectibles", score: 84, trend: "up", flag: "🇵🇱→🇺🇸", tip: "Soviet cameras are nostalgic items for US photography enthusiasts", sourceUrl: "https://allegro.pl/listing?string=zorki+4+aparat", imageUrl: "" },
  { id: 6, name: "Adidas Handball Spezial PL", buy: 65, sell: 140, profit: 75, margin: 54, market: "eBay USA", category: "Sneakers", score: 77, trend: "stable", flag: "🇵🇱→🇺🇸", tip: "Limited EU colorways unavailable in North America", sourceUrl: "https://allegro.pl/listing?string=adidas+handball+spezial", imageUrl: "" },
  { id: 7, name: "Meissen Porcelain Figurine", buy: 80, sell: 310, profit: 230, margin: 74, market: "Etsy USA", category: "Collectibles", score: 91, trend: "up", flag: "🇩🇪→🇺🇸", tip: "Antique German porcelain undervalued at EU flea markets", sourceUrl: "https://www.kleinanzeigen.de/s-meissen-figur/k0", imageUrl: "" },
  { id: 8, name: "Nokia 3310 2017 NIB", buy: 21, sell: 33, profit: 12, margin: 36, market: "Amazon DE", category: "Electronics", score: 41, trend: "down", flag: "🇵🇱→🇩🇪", tip: "Demand declining — sell remaining stock quickly", sourceUrl: "https://allegro.pl/listing?string=nokia+3310+2017", imageUrl: "" },
];

// ── eBay OAuth token ──────────────────────────────────────────────────────────
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

// ── eBay Browse API search ────────────────────────────────────────────────────
async function ebaySearch(token: string, query: string, maxPrice: number, marketplace = "EBAY_US"): Promise<any[]> {
  try {
    const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(query)}&filter=price:[1..${maxPrice}]&limit=5&sort=price`;
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, "X-EBAY-C-MARKETPLACE-ID": marketplace },
    });
    if (!r.ok) return [];
    const d = await r.json() as any;
    return (d.itemSummaries ?? []).map((i: any) => ({
      title: i.title,
      price: parseFloat(i.price?.value ?? "0"),
      currency: i.price?.currency ?? "USD",
      url: i.itemWebUrl ?? "",
      image: i.image?.imageUrl ?? "",
      condition: i.condition ?? "",
      marketplace,
    }));
  } catch { return []; }
}

// ── Etsy API search ───────────────────────────────────────────────────────────
async function etsySearch(apiKey: string, query: string): Promise<any[]> {
  try {
    const url = `https://openapi.etsy.com/v3/application/listings/active?keywords=${encodeURIComponent(query)}&limit=5&sort_on=price&sort_order=desc`;
    const r = await fetch(url, { headers: { "x-api-key": apiKey } });
    if (!r.ok) return [];
    const d = await r.json() as any;
    return (d.results ?? []).map((i: any) => ({
      title: i.title,
      price: (i.price?.amount ?? 0) / (i.price?.divisor ?? 100),
      currency: i.price?.currency_code ?? "USD",
      url: i.url ?? "",
      image: i.images?.[0]?.url_570xN ?? "",
      marketplace: "ETSY_US",
    }));
  } catch { return []; }
}

// ── AI analysis ───────────────────────────────────────────────────────────────
async function scanWithAI(apiKey: string, realEbay: any[] = [], realEtsy: any[] = []): Promise<any[]> {
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  let contextBlock = "";
  if (realEbay.length > 0) {
    contextBlock += `\n\nReal eBay listings (cheap sources):\n${realEbay.slice(0, 10).map(i =>
      `- "${i.title}" at $${i.price.toFixed(2)} | URL: ${i.url}`
    ).join("\n")}`;
  }
  if (realEtsy.length > 0) {
    contextBlock += `\n\nReal Etsy listings (expensive target market):\n${realEtsy.slice(0, 10).map(i =>
      `- "${i.title}" at $${i.price.toFixed(2)} | URL: ${i.url}`
    ).join("\n")}`;
  }

  const hasReal = realEbay.length > 0 || realEtsy.length > 0;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 3000,
      messages: [{
        role: "user",
        content: `You are a global cross-border arbitrage expert. Today is ${today}.${contextBlock}

${hasReal
  ? "Analyze the REAL listings above and identify arbitrage opportunities. Use real URLs when available."
  : "Generate 8 realistic, specific arbitrage opportunities with plausible eBay/Allegro/Kleinanzeigen search URLs."
}

Return ONLY a valid JSON array (no markdown, no text outside brackets):
[
  {
    "id": 1,
    "name": "specific product name with variant/size/year",
    "buy": 45,
    "sell": 120,
    "profit": 75,
    "margin": 62,
    "market": "eBay USA",
    "category": "Electronics",
    "score": 88,
    "trend": "up",
    "flag": "🇵🇱→🇺🇸",
    "tip": "one sentence why this opportunity exists",
    "sourceUrl": "${hasReal ? "real URL from above if available, else realistic search URL" : "realistic search URL e.g. https://allegro.pl/listing?string=..."}",
    "imageUrl": "${hasReal ? "real image URL if available, else empty string" : ""}"
  }
]

Rules:
- sourceUrl: real listing URL if available, otherwise realistic search URL on source marketplace
- imageUrl: real image URL if available, otherwise ""
- prices realistic USD values
- margin = round((profit/sell)*100)
- score 40-98
- trend: "up", "stable", or "down"
- Vary: Clothing, Jewelry, Electronics, Collectibles, Sneakers, Spirits, Antiques, Watches
- Vary markets: eBay USA, Etsy USA, Amazon UK, eBay DE, Amazon DE, Vinted EU`,
      }],
    }),
  });

  if (!res.ok) return [];
  const data = await res.json() as any;
  const text: string = data?.content?.[0]?.text ?? "";
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  const parsed = JSON.parse(match[0]) as any[];
  return parsed.map((o, i) => ({ ...o, id: i + 1 }));
}

// ── SCAN CATEGORIES ───────────────────────────────────────────────────────────
const SCAN_QUERIES = [
  { query: "vintage levis 501 jeans", maxPrice: 40 },
  { query: "vintage camera film", maxPrice: 80 },
  { query: "amber jewelry pendant", maxPrice: 60 },
  { query: "porcelain figurine vintage", maxPrice: 120 },
  { query: "adidas vintage sneakers", maxPrice: 70 },
  { query: "antique watch mechanical", maxPrice: 200 },
];

router.post("/scan", async (req: Request, res: Response) => {
  const {
    anthropicKey,
    ebayAppId, ebayCertId,
    etsyApiKey,
  } = req.body ?? {};

  // Resolve keys: request body first, then env vars
  const aiKey: string = anthropicKey || process.env.ANTHROPIC_API_KEY || "";
  const ebayApp: string = ebayAppId || process.env.EBAY_APP_ID || "";
  const ebayCert: string = ebayCertId || process.env.EBAY_CERT_ID || "";
  const etsyKey: string = etsyApiKey || process.env.ETSY_API_KEY || "";

  let realEbay: any[] = [];
  let realEtsy: any[] = [];

  // Try real eBay
  if (ebayApp && ebayCert) {
    try {
      const token = await getEbayToken(ebayApp, ebayCert);
      if (token) {
        const results = await Promise.all(
          SCAN_QUERIES.map(q => ebaySearch(token, q.query, q.maxPrice))
        );
        realEbay = results.flat().filter(i => i.price > 0);
        console.log(`[resell/scan] eBay: ${realEbay.length} real listings`);
      }
    } catch (err) {
      console.error("[resell/scan] eBay error:", err);
    }
  }

  // Try real Etsy
  if (etsyKey) {
    try {
      const results = await Promise.all([
        etsySearch(etsyKey, "vintage levis jeans"),
        etsySearch(etsyKey, "amber jewelry handmade"),
        etsySearch(etsyKey, "vintage camera film"),
      ]);
      realEtsy = results.flat().filter(i => i.price > 0);
      console.log(`[resell/scan] Etsy: ${realEtsy.length} real listings`);
    } catch (err) {
      console.error("[resell/scan] Etsy error:", err);
    }
  }

  // Try AI (with or without real data)
  if (aiKey) {
    try {
      const aiResults = await scanWithAI(aiKey, realEbay, realEtsy);
      if (aiResults.length > 0) {
        const source = realEbay.length > 0 || realEtsy.length > 0 ? "live" : "ai";
        return res.json({ opportunities: aiResults, source, scannedAt: new Date().toISOString() });
      }
    } catch (err) {
      console.error("[resell/scan] AI error:", err);
    }
  }

  // Fallback: mock data
  const shuffled = [...FALLBACK].sort(() => Math.random() - 0.5);
  return res.json({ opportunities: shuffled, source: "cache", scannedAt: new Date().toISOString() });
});

export default router;
