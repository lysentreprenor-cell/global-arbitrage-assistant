import { Router, type Request, type Response } from "express";

const router = Router();

async function compareWithAI(product: string, category: string, buyPrice: number): Promise<any[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return [];

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      messages: [{
        role: "user",
        content: `You are a global e-commerce expert. Compare selling platforms for this product:

Product: "${product}"
Category: ${category}
Buy price: $${buyPrice}

For each platform below, give realistic market data based on actual 2024-2025 prices:
eBay USA, Etsy USA, Amazon USA, Amazon UK, eBay DE, Vinted EU, Facebook Marketplace, Depop, Poshmark, Mercari USA

Return ONLY valid JSON array:
[
  {
    "platform": "eBay USA",
    "flag": "🇺🇸",
    "avgSellPrice": 85,
    "feePercent": 13,
    "netProfit": 44,
    "netMargin": 52,
    "competition": "Medium",
    "avgDaysToSell": 7,
    "score": 88,
    "pros": "Large buyer base, global reach",
    "cons": "13% fees, high competition",
    "bestFor": "Electronics, vintage, collectibles"
  }
]

Rules:
- avgSellPrice: realistic price for "${product}" on that platform
- feePercent: real platform fee %
- netProfit = avgSellPrice - (avgSellPrice * feePercent/100) - ${buyPrice}
- netMargin = round((netProfit / avgSellPrice) * 100)
- competition: "Low" / "Medium" / "High"
- avgDaysToSell: realistic estimate
- score: 0-100 overall opportunity score
- Only include platforms where this product makes sense
- Skip platforms with netProfit <= 0`,
      }],
    }),
  });

  if (!res.ok) return [];
  const data = await res.json() as any;
  const text: string = data?.content?.[0]?.text ?? "";
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  return JSON.parse(match[0]);
}

function mockCompare(product: string, buyPrice: number): any[] {
  const b = buyPrice || 20;
  return [
    { platform: "eBay USA", flag: "🇺🇸", avgSellPrice: b * 3.2, feePercent: 13, netProfit: Math.round(b * 3.2 * 0.87 - b), netMargin: 58, competition: "Medium", avgDaysToSell: 7, score: 87, pros: "Duża baza kupujących, wysyłka globalna", cons: "13% prowizja, duża konkurencja", bestFor: "Elektronika, vintage, kolekcje" },
    { platform: "Etsy USA", flag: "🇺🇸", avgSellPrice: b * 4.1, feePercent: 6.5, netProfit: Math.round(b * 4.1 * 0.935 - b), netMargin: 68, competition: "Low", avgDaysToSell: 14, score: 92, pros: "Niska prowizja, premium ceny", cons: "Tylko vintage/handmade, wolniejsza sprzedaż", bestFor: "Biżuteria, odzież vintage, unikaty" },
    { platform: "Amazon UK", flag: "🇬🇧", avgSellPrice: b * 2.8, feePercent: 15, netProfit: Math.round(b * 2.8 * 0.85 - b), netMargin: 50, competition: "High", avgDaysToSell: 3, score: 72, pros: "Szybka sprzedaż, Prime buyers", cons: "15% prowizja + FBA fees", bestFor: "Nowe produkty, elektronika" },
    { platform: "eBay DE", flag: "🇩🇪", avgSellPrice: b * 2.5, feePercent: 12, netProfit: Math.round(b * 2.5 * 0.88 - b), netMargin: 44, competition: "Medium", avgDaysToSell: 10, score: 68, pros: "Rynek niemiecki — wysokie ceny", cons: "Mniejszy zasięg niż eBay USA", bestFor: "Vintage, kamery, antyki" },
    { platform: "Vinted EU", flag: "🇪🇺", avgSellPrice: b * 1.8, feePercent: 0, netProfit: Math.round(b * 1.8 - b), netMargin: 44, competition: "High", avgDaysToSell: 5, score: 61, pros: "0% prowizji dla sprzedawcy!", cons: "Tylko odzież, niskie ceny", bestFor: "Odzież, buty, akcesoria" },
  ].map(p => ({ ...p, avgSellPrice: Math.round(p.avgSellPrice) })).sort((a, b) => b.score - a.score);
}

router.post("/", async (req: Request, res: Response) => {
  const { product, category = "General", buyPrice = 20 } = req.body;
  if (!product) return res.status(400).json({ error: "product required" });

  try {
    const aiResults = await compareWithAI(product, category, parseFloat(buyPrice));
    if (aiResults.length > 0) {
      return res.json({ platforms: aiResults.sort((a: any, b: any) => b.score - a.score), source: "ai" });
    }
  } catch (err) {
    console.error("[compare] AI error:", err);
  }

  return res.json({ platforms: mockCompare(product, parseFloat(buyPrice)), source: "cache" });
});

export default router;
