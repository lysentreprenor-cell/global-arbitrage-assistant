import { Router, type Request, type Response } from "express";

const router = Router();

// ── Fee calculators ───────────────────────────────────────────────────────────
function calcFees(sellPrice: number, category: string) {
  const fvfRates: Record<string, number> = {
    Watches: 0.095, Jewelry: 0.135, Sneakers: 0.08, Electronics: 0.1235,
  };
  const fvf = Math.min(sellPrice * (fvfRates[category] ?? 0.1235), 2500);
  const paypal = sellPrice * 0.029 + 0.30;
  const shippingEst: Record<string, number> = {
    Clothing: 8, Electronics: 14, Watches: 18, Jewelry: 10, Sneakers: 12,
  };
  const shipping = shippingEst[category] ?? 10;
  return {
    total: Math.round((fvf + paypal + shipping) * 100) / 100,
    breakdown: {
      ebayFVF: Math.round(fvf * 100) / 100,
      paypal: Math.round(paypal * 100) / 100,
      shipping,
    },
  };
}

// ── Tool executor ─────────────────────────────────────────────────────────────
function runTool(name: string, input: any): any {
  if (name === "calculate_profit_detail") {
    const { buyPrice = 0, sellPrice = 0, category = "General" } = input;
    const fees = calcFees(sellPrice, category);
    const net = sellPrice - buyPrice - fees.total;
    const roi = buyPrice > 0 ? (net / buyPrice) * 100 : 0;
    return {
      buyPrice, sellPrice,
      totalFees: fees.total,
      feeBreakdown: fees.breakdown,
      netProfit: Math.round(net * 100) / 100,
      roi: Math.round(roi * 10) / 10,
      margin: sellPrice > 0 ? Math.round((net / sellPrice) * 1000) / 10 : 0,
      worthIt: net > 12 && roi > 8,
    };
  }

  if (name === "estimate_monthly_earnings") {
    const { items = [] } = input;
    const volumeByCategory: Record<string, number> = {
      Clothing: 10, Electronics: 4, Watches: 3, Jewelry: 6, Sneakers: 5, General: 6,
    };
    const rows = items.map((o: any) => {
      const vol = volumeByCategory[o.category] ?? 6;
      return { product: o.product, unitsPerMonth: vol, monthlyNet: Math.round(o.netProfit * vol) };
    });
    const total = rows.reduce((s: number, r: any) => s + r.monthlyNet, 0);
    return { estimatedMonthly: total, breakdown: rows };
  }

  if (name === "lookup_platforms") {
    const { category = "General", market = "Poland" } = input;
    const byCategory: Record<string, string[]> = {
      Clothing:    ["Vinted", "Depop", "eBay", "Facebook Marketplace"],
      Electronics: ["eBay", "Back Market", "Amazon", "OLX"],
      Watches:     ["Chrono24", "eBay", "WatchBox", "Allegro"],
      Jewelry:     ["Etsy", "eBay", "Vinted", "Allegro"],
      Sneakers:    ["StockX", "GOAT", "eBay", "Vinted"],
      Spirits:     ["eBay", "WhiskyX", "Facebook Groups"],
      Antiques:    ["Etsy", "eBay", "1stDibs", "Allegro"],
      General:     ["eBay", "OLX", "Allegro", "Amazon"],
    };
    const tips: Record<string, string> = {
      Poland: "Allegro dominuje — konto firmowe + VAT-UE po 42 000 PLN/rok. Vinted bez VAT do 2000 PLN.",
      Germany: "eBay.de + Amazon.de — wymagaj VAT-ID (Kleinunternehmerregelung do €22k/rok).",
      USA: "eBay.com + Mercari — duży rynek, wysoka konkurencja. PayPal wbudowany.",
      UK: "eBay.co.uk + Depop + Vinted.co.uk. MTD VAT po £85k/rok.",
    };
    return {
      platforms: byCategory[category] ?? byCategory.General,
      marketTip: tips[market] ?? "Sprawdź lokalne limity podatkowe przed skalowaniem.",
      primary: (byCategory[category] ?? byCategory.General)[0],
    };
  }

  return { error: `Unknown tool: ${name}` };
}

// ── Agent SSE endpoint ────────────────────────────────────────────────────────
router.post("/run", async (req: Request, res: Response) => {
  const {
    opportunities = [],
    anthropicKey,
    goal = "profit",
  } = req.body;

  const key: string = anthropicKey || process.env.ANTHROPIC_API_KEY || "";
  if (!key) { res.status(400).json({ error: "Anthropic API key required" }); return; }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (event: string, data: any) =>
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  const oppsSlice = opportunities.slice(0, 20).map((o: any) => ({
    name: o.name, buy: o.buy, sell: o.sell,
    netProfit: o.netProfit ?? o.profit,
    margin: o.margin, category: o.category ?? "General",
    market: o.market ?? "Poland", risk: o.risk ?? "medium",
  }));

  const TOOLS = [
    {
      name: "calculate_profit_detail",
      description: "Calculate exact net profit after all marketplace fees and shipping for a product",
      input_schema: {
        type: "object",
        properties: {
          product: { type: "string" },
          buyPrice: { type: "number" },
          sellPrice: { type: "number" },
          category: { type: "string", enum: ["Clothing","Electronics","Watches","Jewelry","Sneakers","Spirits","Antiques","General"] },
        },
        required: ["product","buyPrice","sellPrice"],
      },
    },
    {
      name: "estimate_monthly_earnings",
      description: "Estimate total monthly earnings from a set of opportunities given realistic sales volume",
      input_schema: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: { type: "object", properties: { product:{type:"string"}, netProfit:{type:"number"}, category:{type:"string"} } },
          },
        },
        required: ["items"],
      },
    },
    {
      name: "lookup_platforms",
      description: "Find the best selling platforms and market-specific tips for a category and target market",
      input_schema: {
        type: "object",
        properties: {
          category: { type: "string" },
          market: { type: "string", description: "e.g. Poland, Germany, USA" },
        },
        required: ["category","market"],
      },
    },
  ];

  const SYSTEM = `You are ARIA (Automated Resell Intelligence Agent). You analyze arbitrage opportunities for a DROPSHIP model — no upfront capital needed.

HOW IT WORKS: The seller lists at the SELL price first. When a customer pays, the seller then buys from the cheap source and ships directly. Zero inventory risk.

GOAL: ${goal === "profit" ? "Maximize net profit per deal — highest margin items" : goal === "safety" ? "Minimize risk — low-risk, fast-selling items with stable demand" : "High volume — many transactions, fast turnover, lower margin ok"}

WORKFLOW (use tools in this order):
1. calculate_profit_detail for the top 3 opportunities (subtract all fees)
2. lookup_platforms for the #1 pick — where to LIST (sell) and where to SOURCE (buy)
3. estimate_monthly_earnings with realistic dropship volume
4. Return ONLY a valid JSON object (no markdown):

{
  "top3": [
    {"rank":1,"product":"...","buy":0,"sell":0,"netProfit":0,"roi":0,"category":"...","market":"...","reason":"why this one"}
  ],
  "champion": {
    "product":"...", "category":"...",
    "listAt":"where and at what price to LIST (sell)",
    "sourceAt":"where and at what price to BUY after sale",
    "netProfit":0, "roi":0,
    "steps":["1. List on [platform] at $X...","2. When sold, immediately order from [source] at $Y...","3. Ship to buyer...","4. ...","5. ..."],
    "platforms":["sell platform 1","sell platform 2"],
    "buySource":"where to buy after sale",
    "timeToSell":"estimated days to sell"
  },
  "monthlyEstimate":{"low":0,"target":0,"high":0},
  "quickWins":["concrete action 1","concrete action 2","concrete action 3"],
  "warnings":["..."],
  "summary":"2-3 sentences — dropship plan, no capital needed, earning potential"
}`;

  send("status", { step: 0, message: "🤖 ARIA startuje — analizuję okazje rynkowe..." });

  let messages: any[] = [{
    role: "user",
    content: `Here are the current arbitrage opportunities (${oppsSlice.length} items):\n${JSON.stringify(oppsSlice)}\n\nBuild the best earning plan now.`,
  }];

  const STEP_MSGS: Record<string, string> = {
    calculate_profit_detail: (p: string) => `💰 Liczę zysk po opłatach dla „${p}"...`,
    estimate_monthly_earnings: () => "📊 Szacuję miesięczne zarobki...",
    lookup_platforms: (m: string) => `🛒 Szukam platform dla rynku ${m}...`,
  } as any;

  try {
    for (let i = 0; i < 10; i++) {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 4000,
          system: SYSTEM,
          tools: TOOLS,
          messages,
        }),
      });

      if (!r.ok) {
        const e = await r.json().catch(() => ({})) as any;
        send("error", { message: e.error?.message || `Claude API error ${r.status}` });
        res.end(); return;
      }

      const data = await r.json() as any;

      if (data.stop_reason === "end_turn") {
        const text: string = data.content?.find((b: any) => b.type === "text")?.text ?? "";
        const match = text.match(/\{[\s\S]*\}/);
        let report: any = null;
        if (match) { try { report = JSON.parse(match[0]); } catch {} }
        send("done", { report, raw: report ? undefined : text.slice(0, 500) });
        res.end(); return;
      }

      if (data.stop_reason === "tool_use") {
        messages.push({ role: "assistant", content: data.content });
        const results: any[] = [];
        for (const block of data.content) {
          if (block.type !== "tool_use") continue;
          const label = block.name === "calculate_profit_detail"
            ? `💰 Liczę zysk dla „${block.input?.product}"...`
            : block.name === "estimate_monthly_earnings"
            ? "📊 Szacuję miesięczne zarobki..."
            : `🛒 Szukam platform dla ${block.input?.market}...`;
          send("status", { step: i + 1, message: label });
          results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(runTool(block.name, block.input)) });
        }
        messages.push({ role: "user", content: results });
        continue;
      }

      break;
    }
    send("error", { message: "Agent przekroczył limit iteracji — spróbuj ponownie" });
    res.end();
  } catch (err: any) {
    send("error", { message: err.message || "Błąd wewnętrzny agenta" });
    res.end();
  }
});

export default router;
