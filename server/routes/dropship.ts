import { Router, type Request, type Response } from "express";
import { emitNotification } from "./notifications";

const router = Router();

const listings: any[] = [];
const orders: any[] = [];
let nextId = 1;

const PLATFORM_FEES: Record<string, number> = {
  "eBay USA": 0.1325,
  "Etsy USA": 0.095,
  "Amazon UK": 0.15,
  "eBay DE": 0.12,
  "Amazon DE": 0.15,
  "Vinted EU": 0,
  "StockX USA": 0.095,
  "Depop": 0.10,
};

const AVG_SHIPPING: Record<string, number> = {
  "Clothing": 12, "Jewelry": 18, "Electronics": 28, "Collectibles": 22,
  "Sneakers": 25, "Spirits": 35, "Antiques": 40, "Watches": 30,
};

async function generateListing(
  product: string, description: string, sellPrice: number, platform: string,
  apiKey: string, category = "", buyHint = "", sellHint = ""
): Promise<any> {
  if (!apiKey) return null;

  const isEtsy = platform.toLowerCase().includes("etsy");
  const platformNote = isEtsy
    ? "Etsy: max 140 chars, storytelling, vintage/handmade tone"
    : "eBay: max 80 chars, keyword-dense, include condition";

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1200,
        system: `Expert marketplace listing copywriter. Platform: ${platform}. ${platformNote}.`,
        messages: [{
          role: "user",
          content: `Write a ${platform} listing for: "${product}"
Price: $${sellPrice}
Category: ${category || "General"}
${description ? `Notes: ${description}` : ""}
${buyHint ? `Buy hint: ${buyHint}` : ""}
${sellHint ? `SEO hint: ${sellHint}` : ""}

Return ONLY valid JSON:
{
  "title": "platform-optimised listing title",
  "description": "3-5 sentence persuasive description with key features",
  "tags": ["tag1","tag2","tag3","tag4","tag5","tag6","tag7"],
  "category": "best matching platform category",
  "shippingNote": "recommended shipping method",
  "highlights": ["selling point 1","selling point 2","selling point 3"],
  "seoKeywords": ["keyword1","keyword2","keyword3"]
}`,
        }],
      }),
    });

    if (!res.ok) return null;
    const data = await res.json() as any;
    const raw: string = data?.content?.[0]?.text ?? "";
    const clean = raw.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim();
    const match = clean.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]);
  } catch { return null; }
}

// POST /api/dropship/listings
router.post("/listings", async (req: Request, res: Response) => {
  const {
    productName, sourceUrl, sourcePricePLN, sourcePriceUSD, sellPrice,
    platform, description, category, anthropicKey,
    buyHint, sellHint, sourceMarket, stockQuantity,
  } = req.body;

  if (!productName || !sellPrice || !platform) {
    return res.status(400).json({ error: "productName, sellPrice, platform required" });
  }

  const buy = parseFloat(sourcePriceUSD || 0);
  const sell = parseFloat(sellPrice);
  const qty = parseInt(String(stockQuantity || "1")) || 1;
  const fee = PLATFORM_FEES[platform] ?? 0.13;
  const ship = AVG_SHIPPING[category] ?? 15;
  const feeAmt = sell * fee;
  const profit = Math.round((sell - feeAmt - buy - ship) * 100) / 100;
  const margin = sell > 0 ? Math.round((profit / sell) * 100) : 0;

  const aiKey: string = anthropicKey || process.env.ANTHROPIC_API_KEY || "";
  const aiContent = await generateListing(
    productName, description || "", sell, platform, aiKey,
    category || "", buyHint || "", sellHint || ""
  ).catch(() => null);

  const listing = {
    id: nextId++,
    productName, sourceUrl: sourceUrl || "",
    sourcePricePLN: parseFloat(sourcePricePLN || 0),
    sourcePriceUSD: buy,
    sellPrice: sell,
    feePercent: Math.round(fee * 1000) / 10,
    shippingEst: ship,
    profit,
    margin,
    platform,
    description: description || "",
    category: category || "",
    buyHint: buyHint || "",
    sellHint: sellHint || "",
    sourceMarket: sourceMarket || "",
    stockQuantity: qty,     // ← stock management
    totalSold: 0,
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

// DELETE /api/dropship/listings/:id
router.delete("/listings/:id", (req: Request, res: Response) => {
  const idx = listings.findIndex(l => l.id === parseInt(String(req.params.id)));
  if (idx === -1) return res.status(404).json({ error: "Not found" });
  listings.splice(idx, 1);
  return res.json({ ok: true });
});

// POST /api/dropship/orders
router.post("/orders", (req: Request, res: Response) => {
  const { listingId, buyerName, buyerAddress, buyerEmail, quantity = 1, notes } = req.body;
  const listing = listings.find(l => l.id === parseInt(listingId));
  if (!listing) return res.status(404).json({ error: "Listing not found" });

  const qty = parseInt(String(quantity)) || 1;
  const order = {
    id: nextId++,
    listingId: listing.id,
    productName: listing.productName,
    sourceUrl: listing.sourceUrl,
    sourceMarket: listing.sourceMarket || "",
    buyerName, buyerAddress, buyerEmail,
    quantity: qty,
    sellPrice: listing.sellPrice,
    sourcePriceUSD: listing.sourcePriceUSD,
    profit: Math.round(listing.profit * qty * 100) / 100,
    platform: listing.platform,
    notes: notes || "",
    trackingNumber: "",
    status: "pending",
    createdAt: new Date().toISOString(),
    processedAt: null,
  };

  orders.push(order);

  // Stock management: decrement stock and auto-archive when sold out
  if (typeof listing.stockQuantity === "number") {
    listing.stockQuantity = Math.max(0, listing.stockQuantity - qty);
    listing.totalSold = (listing.totalSold || 0) + qty;
    if (listing.stockQuantity <= 0) {
      listing.status = "sold"; // auto-archive — no stock left
    } else {
      listing.status = "active";
    }
  } else {
    listing.status = "active";
  }

  // Emit fulfillment notification to owner
  emitNotification({
    type: "order",
    title: `💰 New Order: ${listing.productName.slice(0, 45)}`,
    body: `Buyer: ${buyerName} · Qty: ${qty} · Profit: +$${order.profit}`,
    profit: order.profit,
    productName: listing.productName,
    buyerName,
    buyerAddress,
    sourceUrl: listing.sourceUrl,
    buyPrice: listing.sourcePriceUSD,
    sellPrice: listing.sellPrice,
    listingId: listing.id,
    orderId: order.id,
  });

  // Emit fulfillment instruction
  if (listing.sourceUrl) {
    emitNotification({
      type: "fulfillment",
      title: `🛒 ACTION: Buy & Ship "${listing.productName.slice(0, 40)}"`,
      body: `1. Buy from source: ${listing.sourceUrl}\n2. Ship to: ${buyerName}, ${buyerAddress}\n3. Profit: +$${order.profit}`,
      profit: order.profit,
      productName: listing.productName,
      buyerName,
      buyerAddress,
      sourceUrl: listing.sourceUrl,
      buyPrice: listing.sourcePriceUSD,
      sellPrice: listing.sellPrice,
      orderId: order.id,
    });
  }

  return res.json({ order, stockRemaining: listing.stockQuantity ?? null, autoArchived: listing.status === "sold" });
});

// GET /api/dropship/orders
router.get("/orders", (_req: Request, res: Response) => {
  res.json({ orders: [...orders].reverse() });
});

// PATCH /api/dropship/orders/:id/process
router.patch("/orders/:id/process", (req: Request, res: Response) => {
  const order = orders.find(o => o.id === parseInt(String(req.params.id)));
  if (!order) return res.status(404).json({ error: "Not found" });
  order.status = "processed";
  order.processedAt = new Date().toISOString();
  if (req.body.trackingNumber) order.trackingNumber = req.body.trackingNumber;
  if (req.body.notes) order.notes = req.body.notes;
  return res.json({ order });
});

// GET /api/dropship/stats
router.get("/stats", (_req: Request, res: Response) => {
  const processed = orders.filter(o => o.status === "processed");
  const totalProfit = processed.reduce((s, o) => s + o.profit, 0);
  const pendingOrders = orders.filter(o => o.status === "pending").length;
  res.json({
    totalListings: listings.length,
    activeListings: listings.filter(l => l.status === "active").length,
    soldListings: listings.filter(l => l.status === "sold").length,
    totalOrders: orders.length,
    pendingOrders,
    processedOrders: processed.length,
    totalProfit: Math.round(totalProfit * 100) / 100,
  });
});

export default router;
