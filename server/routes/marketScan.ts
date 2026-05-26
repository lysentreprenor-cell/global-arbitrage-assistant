import { Router, type Request, type Response } from "express";

const router = Router();

const COUNTRIES = [
  "USA", "UK", "Germany", "France", "Canada", "Australia", "Japan",
  "UAE", "Kenya", "Nigeria", "South Africa", "India", "Brazil",
  "Poland", "Netherlands", "Sweden", "Switzerland", "Mexico",
];

const MOCK: Record<string, any> = {
  default: {
    marketplaces: [
      { name: "eBay", url: "https://ebay.com", fee: "~13%", traffic: "High", note: "Best for collectibles, vintage, electronics" },
      { name: "Etsy", url: "https://etsy.com", fee: "~6.5%", traffic: "High", note: "Handmade, vintage, unique items — premium prices" },
      { name: "Amazon", url: "https://amazon.com", fee: "~15%", traffic: "Very High", note: "Fast shipping required, high competition" },
      { name: "Facebook Marketplace", url: "https://facebook.com/marketplace", fee: "5%", traffic: "Medium", note: "Local + shipping, no listing fee" },
    ],
    shipping: {
      feasible: true,
      services: [
        { name: "DHL Express", time: "2-5 days", cost: "$25–45", note: "Best for high-value items" },
        { name: "UPS Worldwide", time: "3-7 days", cost: "$18–35", note: "Reliable tracking" },
        { name: "Poczta Polska / EMS", time: "7-14 days", cost: "$8–18", note: "Cheapest option, slower" },
      ],
      restrictions: ["Lithium batteries require special declaration", "Liquids >100ml need documentation"],
    },
    legal: {
      importDuty: "0–20% depending on category",
      vatNote: "Buyer responsible for import VAT",
      banned: ["Replica items", "Counterfeit goods", "Endangered species products"],
      customs: "Declare full value — undervaluing is illegal and can cause seizure",
      documentation: ["Commercial invoice", "Packing list", "Country of origin declaration"],
    },
    returns: {
      sellerObligation: "30-day returns required on most platforms",
      buyerProtection: "eBay/Etsy Money Back Guarantee — seller bears return shipping cost",
      warranty: "EU products sold to US: no mandatory warranty, but platform policies apply",
      tips: ["State clearly: no returns on vintage/used items if described accurately", "Add detailed photos to avoid disputes"],
    },
  },
};

async function analyzeWithAI(fromCountry: string, toCountry: string, category: string, budget: number, apiKey?: string): Promise<any> {
  if (!apiKey) apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 3000,
      messages: [{
        role: "user",
        content: `You are a global trade and e-commerce expert. Analyze this cross-border reselling scenario:

FROM: ${fromCountry}
TO: ${toCountry}
Category: ${category}
Budget: ~$${budget}

Return ONLY valid JSON (no markdown) with this exact structure:
{
  "marketplaces": [
    { "name": "platform name", "url": "https://...", "fee": "~X%", "traffic": "High/Medium/Low", "note": "why good for this category in ${toCountry}" }
  ],
  "shipping": {
    "feasible": true,
    "services": [
      { "name": "carrier name", "time": "X-Y days", "cost": "$X–Y", "note": "when to use" }
    ],
    "restrictions": ["list of restrictions for ${category} from ${fromCountry} to ${toCountry}"]
  },
  "legal": {
    "importDuty": "X% or range",
    "vatNote": "VAT/tax situation in ${toCountry}",
    "banned": ["any banned items relevant to ${category}"],
    "customs": "key customs advice for ${fromCountry}→${toCountry}",
    "documentation": ["required docs list"]
  },
  "returns": {
    "sellerObligation": "return policy requirements on platforms in ${toCountry}",
    "buyerProtection": "buyer protection rules in ${toCountry}",
    "warranty": "warranty laws in ${toCountry} for imported ${category}",
    "tips": ["practical tips for seller"]
  }
}

Be specific to ${toCountry} laws, real carrier names, real platform names operating in ${toCountry}, real import duty rates. For Kenya/Nigeria/Africa use local knowledge.`,
      }],
    }),
  });

  if (!res.ok) return null;
  const data = await res.json() as any;
  const text: string = data?.content?.[0]?.text ?? "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  return JSON.parse(match[0]);
}

router.get("/countries", (_req: Request, res: Response) => {
  res.json({ countries: COUNTRIES });
});

router.post("/scan", async (req: Request, res: Response) => {
  const { fromCountry = "Poland", toCountry = "USA", category = "General", budget = 100, anthropicKey } = req.body;
  const aiKey: string = anthropicKey || process.env.ANTHROPIC_API_KEY || "";

  try {
    const aiResult = await analyzeWithAI(fromCountry, toCountry, category, budget, aiKey);
    if (aiResult) {
      return res.json({ ...aiResult, source: "ai", fromCountry, toCountry, category });
    }
  } catch (err) {
    console.error("[market-scan] AI error:", err);
  }

  return res.json({ ...MOCK.default, source: "cache", fromCountry, toCountry, category });
});

export default router;
