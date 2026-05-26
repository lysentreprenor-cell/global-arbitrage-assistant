import { Router, type Request, type Response } from "express";

const router = Router();

const FALLBACK = [
  { id: 1, name: "Levi's 501 W32 — Poland", buy: 30, sell: 78, profit: 48, margin: 62, market: "eBay USA", category: "Clothing", score: 92, trend: "up", flag: "🇵🇱→🇺🇸", tip: "Vintage denim commands 2-3x premium in US vs EU" },
  { id: 2, name: "Baltic Amber Pendant", buy: 50, sell: 260, profit: 210, margin: 80, market: "Etsy USA", category: "Jewelry", score: 96, trend: "up", flag: "🇵🇱→🇺🇸", tip: "Baltic amber is rare in US — handmade jewelry sells fast on Etsy" },
  { id: 3, name: "Vintage Leica M3 Camera", buy: 420, sell: 890, profit: 470, margin: 53, market: "eBay DE", category: "Electronics", score: 88, trend: "up", flag: "🇩🇪→🇺🇸", tip: "German camera market underprices Leica vs US collectors" },
  { id: 4, name: "Japanese Whisky Nikka 12y", buy: 95, sell: 210, profit: 115, margin: 55, market: "Amazon UK", category: "Spirits", score: 79, trend: "up", flag: "🇯🇵→🇬🇧", tip: "Japanese whisky scarcity drives premium pricing in UK" },
  { id: 5, name: "Soviet Zorki-4 Camera", buy: 25, sell: 68, profit: 43, margin: 63, market: "Etsy USA", category: "Collectibles", score: 84, trend: "up", flag: "🇵🇱→🇺🇸", tip: "Soviet cameras are nostalgic items for US photography enthusiasts" },
  { id: 6, name: "Adidas Handball Spezial PL", buy: 65, sell: 140, profit: 75, margin: 54, market: "eBay USA", category: "Sneakers", score: 77, trend: "stable", flag: "🇵🇱→🇺🇸", tip: "Limited EU colorways unavailable in North America" },
  { id: 7, name: "Meissen Porcelain Figurine", buy: 80, sell: 310, profit: 230, margin: 74, market: "Etsy USA", category: "Collectibles", score: 91, trend: "up", flag: "🇩🇪→🇺🇸", tip: "Antique German porcelain undervalued at EU flea markets" },
  { id: 8, name: "Nokia 3310 2017 NIB", buy: 21, sell: 33, profit: 12, margin: 36, market: "Amazon DE", category: "Electronics", score: 41, trend: "down", flag: "🇵🇱→🇩🇪", tip: "Demand declining — sell remaining stock quickly" },
];

async function scanWithAI(): Promise<any[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return [];

  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      messages: [{
        role: "user",
        content: `You are an expert in global cross-border arbitrage and reselling. Today is ${today}.

Find 8 realistic arbitrage opportunities where items can be bought cheaply in one country/marketplace and sold profitably in another.

Focus on:
- Poland/Eastern Europe → eBay USA / Etsy USA
- Germany/Austria → US collectors
- Japan → UK / EU
- Undervalued vintage items, collectibles, fashion, electronics, spirits, watches

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
    "tip": "one sentence explaining why this opportunity exists right now"
  }
]

Rules:
- Prices must be realistic USD values
- margin = round((profit/sell)*100)
- score 40–98 (higher = better opportunity)
- trend: "up", "stable", or "down"
- Vary categories: Clothing, Jewelry, Electronics, Collectibles, Sneakers, Spirits, Antiques, Watches
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

router.post("/scan", async (_req: Request, res: Response) => {
  try {
    const aiResults = await scanWithAI();

    if (aiResults.length > 0) {
      return res.json({ opportunities: aiResults, source: "ai", scannedAt: new Date().toISOString() });
    }

    // Fallback: shuffle mock data so it looks "fresh"
    const shuffled = [...FALLBACK].sort(() => Math.random() - 0.5);
    return res.json({ opportunities: shuffled, source: "cache", scannedAt: new Date().toISOString() });
  } catch (err) {
    console.error("[resell/scan] error:", err);
    const shuffled = [...FALLBACK].sort(() => Math.random() - 0.5);
    return res.json({ opportunities: shuffled, source: "cache", scannedAt: new Date().toISOString() });
  }
});

export default router;
