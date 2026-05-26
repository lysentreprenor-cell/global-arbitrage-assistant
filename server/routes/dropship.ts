import { Router, type Request, type Response } from "express";

const router = Router();

// In-memory store (replace with DB when available)
const listings: any[] = [];
const orders: any[] = [];
let nextId = 1;

// Generate listing content via AI
async function generateListing(product: string, description: string, sellPrice: number, platform: string): Promise<any> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
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
      max_tokens: 1000,
      messages: [{
        role: "user",
        content: `Write a compelling ${platform} product listing for: "${product}"
Price: $${sellPrice}
Notes: ${description}

Return ONLY valid JSON:
{
  "title": "SEO-optimised listing title (max 80 chars)",
  "description": "Full HTML-free product description, 3-4 sentences, persuasive",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "category": "best matching platform category",
  "shippingNote": "suggested shipping description"
}`,
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

// POST /api/dropship/listings — create listing
router.post("/listings", async (req: Request, res: Response) => {
  const { productName, sourceUrl, sourcePricePLN, sourcePriceUSD, sellPrice, platform, description, category } = req.body;
  if (!productName || !sellPrice || !platform) {
    return res.status(400).json({ error: "productName, sellPrice, platform required" });
  }

  const profit = parseFloat(sellPrice) - parseFloat(sourcePriceUSD || 0);
  const margin = sellPrice > 0 ? Math.round((profit / parseFloat(sellPrice)) * 100) : 0;

  const aiContent = await generateListing(productName, description || "", parseFloat(sellPrice), platform).catch(() => null);

  const listing = {
    id: nextId++,
    productName,
    sourceUrl: sourceUrl || "",
    sourcePricePLN: parseFloat(sourcePricePLN || 0),
    sourcePriceUSD: parseFloat(sourcePriceUSD || 0),
    sellPrice: parseFloat(sellPrice),
    profit: Math.round(profit * 100) / 100,
    margin,
    platform,
    description: description || "",
    category: category || "",
    status: "draft",
    createdAt: new Date().toISOString(),
    aiContent,
  };

  listings.push(listing);
  return res.json({ listing });
});

// GET /api/dropship/listings
router.get("/listings", (_req: Request, res: Response) => {
  res.json({ listings: [...listings].reverse() });
});

// PATCH /api/dropship/listings/:id/status
router.patch("/listings/:id/status", (req: Request, res: Response) => {
  const listing = listings.find(l => l.id === parseInt(String(req.params.id)));
  if (!listing) return res.status(404).json({ error: "Not found" });
  listing.status = req.body.status;
  return res.json({ listing });
});

// POST /api/dropship/orders — simulate incoming order
router.post("/orders", (req: Request, res: Response) => {
  const { listingId, buyerName, buyerAddress, buyerEmail, quantity = 1 } = req.body;
  const listing = listings.find(l => l.id === parseInt(listingId));
  if (!listing) return res.status(404).json({ error: "Listing not found" });

  const order = {
    id: nextId++,
    listingId: parseInt(listingId),
    productName: listing.productName,
    sourceUrl: listing.sourceUrl,
    buyerName,
    buyerAddress,
    buyerEmail,
    quantity,
    sellPrice: listing.sellPrice,
    sourcePriceUSD: listing.sourcePriceUSD,
    profit: listing.profit * quantity,
    status: "pending",
    createdAt: new Date().toISOString(),
    processedAt: null,
    platform: listing.platform,
  };

  orders.push(order);
  listing.status = "active";
  return res.json({ order });
});

// GET /api/dropship/orders
router.get("/orders", (_req: Request, res: Response) => {
  res.json({ orders: [...orders].reverse() });
});

// PATCH /api/dropship/orders/:id/process — mark as processed
router.patch("/orders/:id/process", (req: Request, res: Response) => {
  const order = orders.find(o => o.id === parseInt(String(req.params.id)));
  if (!order) return res.status(404).json({ error: "Not found" });
  order.status = "processed";
  order.processedAt = new Date().toISOString();
  return res.json({ order });
});

// GET /api/dropship/stats
router.get("/stats", (_req: Request, res: Response) => {
  const totalProfit = orders.filter(o => o.status === "processed").reduce((s, o) => s + o.profit, 0);
  const pendingOrders = orders.filter(o => o.status === "pending").length;
  res.json({
    totalListings: listings.length,
    activeListings: listings.filter(l => l.status === "active").length,
    totalOrders: orders.length,
    pendingOrders,
    totalProfit: Math.round(totalProfit * 100) / 100,
  });
});

export default router;
