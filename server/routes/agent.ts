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

  if (name === "get_market_trend") {
    const { category = "General" } = input;
    const month = new Date().getMonth();
    const seasons: Record<string, { peak: number[]; low: number[]; growing: boolean }> = {
      Watches:      { peak: [9,10,11,0], low: [5,6,7],    growing: true  },
      Jewelry:      { peak: [0,1,10,11], low: [6,7,8],    growing: false },
      Sneakers:     { peak: [2,3,7,8],   low: [11,0,1],   growing: true  },
      Electronics:  { peak: [10,11,0],   low: [4,5,6,7],  growing: false },
      Clothing:     { peak: [2,3,8,9],   low: [11,0,6,7], growing: false },
      Spirits:      { peak: [10,11,0],   low: [3,4,5,6],  growing: false },
      Antiques:     { peak: [3,4,5],     low: [11,0,1],   growing: false },
      Collectibles: { peak: [9,10,11],   low: [5,6,7],    growing: true  },
    };
    const s = seasons[category] ?? { peak: [], low: [], growing: false };
    const isPeak = s.peak.includes(month);
    const isLow = s.low.includes(month);
    const mName = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][month];
    return {
      category, month: mName,
      phase: isPeak ? "peak" : isLow ? "low" : "normal",
      demandMultiplier: isPeak ? 1.3 : isLow ? 0.7 : 1.0,
      priceMultiplier: isPeak ? 1.15 : isLow ? 0.88 : 1.0,
      longTermTrend: s.growing ? "growing" : "stable",
      advice: isPeak
        ? `🔥 Peak season for ${category} — list immediately, buyers active, price at top of range`
        : isLow
        ? `❄️ Low season for ${category} — source cheap now, hold until peak or discount 10-15% to move fast`
        : `📊 Normal season for ${category} — standard strategy applies`,
    };
  }

  if (name === "find_supply_source") {
    const { category = "General", productName = "" } = input;
    const sources: Record<string, { sites: string[]; tips: string[]; priceHint: string }> = {
      Watches:      { sites: ["Kleinanzeigen.de","Allegro.pl","LeBonCoin.fr","Wallapop.es","Marktplaats.nl"], tips: ["Search exact model number","Filter 'Privatverkäufer' for 40-60% lower prices","Non-watch sellers list cheapest — search 'Uhren' in general categories"], priceHint: "Target 25-35% below eBay.com median. Estate/non-collector sellers price 50%+ lower." },
      Clothing:     { sites: ["Vinted.pl","Vinted.de","Depop.com","Allegro.pl","LeBonCoin.fr"], tips: ["Search exact waist+length for jeans","Filter 'Vintage/Retro'","Vinted has best condition variety at lowest prices"], priceHint: "€5-25 for vintage pieces selling $40-120 on eBay USA. Margin 3-5×." },
      Electronics:  { sites: ["Allegro.pl","Kleinanzeigen.de","Rebuy.de","LeBonCoin.fr","Marktplaats.nl"], tips: ["Search 'defekt' for repair flips","Check seller ratings 99%+","Compare refurb vs used — refurb often cheaper"], priceHint: "EU sources 30-40% below eBay USA. Polish Allegro 20-30% cheaper than Germany." },
      Jewelry:      { sites: ["Allegro.pl","OLX.pl","Kleinanzeigen.de","Vinted.pl","LeBonCoin.fr"], tips: ["Search Polish: 'bursztyn' for Baltic amber","Check hallmarks (925, 750)","Artisan estate pieces 60-80% below Etsy USA"], priceHint: "Allegro amber €15-40 → Etsy USA $80-200. Best margin category." },
      Sneakers:     { sites: ["Vinted.pl","Vinted.de","Depop.com","Kleinanzeigen.de","Wallapop.es"], tips: ["Search exact colorway name + size","Filter 'like new/worn once'","EU sellers price in EUR — favorable exchange rate"], priceHint: "EU Vinted 30-50% below StockX. Best margins on Nike SB, Air Jordan, Adidas." },
      Antiques:     { sites: ["Allegro.pl","LeBonCoin.fr","Catawiki.com","Marktplaats.nl","Kleinanzeigen.de"], tips: ["Estate sales post Tue-Thu","Search Polish: 'antyk stary vintage'","Check provenance for premium pricing"], priceHint: "Polish antiques 40-70% below US/UK. Focus on pre-1950 European items." },
      Spirits:      { sites: ["Allegro.pl","OLX.pl","Facebook Groups PL","Catawiki.com"], tips: ["Search distillery + year","Facebook 'whisky kolekcja' groups","Verify seal integrity"], priceHint: "Polish collectibles 50-70% below US eBay/Facebook groups." },
    };
    const src = sources[category] ?? { sites: ["Allegro.pl","Kleinanzeigen.de","Vinted.pl","OLX.pl","LeBonCoin.fr"], tips: ["Search in local language","Filter private sellers","Check recently listed"], priceHint: "EU sources 30-50% below US resell prices." };
    const searchQ = productName
      ? `"${productName.split(" ").slice(0,4).join(" ")}" on ${src.sites[0]}`
      : `Browse ${category} on ${src.sites[0]}`;
    return {
      category, primarySource: src.sites[0], allSources: src.sites,
      searchTips: src.tips, priceHint: src.priceHint, firstSearch: searchQ,
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
    monthlyGoal = 500,
  } = req.body;

  const key: string = anthropicKey || process.env.ANTHROPIC_API_KEY || "";
  if (!key) { res.status(400).json({ error: "Anthropic API key required" }); return; }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const send = (event: string, data: any) =>
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  // keepalive ping every 10s so mobile/proxy doesn't drop the connection
  const ping = setInterval(() => { try { res.write(": ping\n\n"); } catch {} }, 10_000);

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
    {
      name: "get_market_trend",
      description: "Check seasonal demand trend for a category — is it peak, low, or normal season right now? Affects pricing and urgency.",
      input_schema: {
        type: "object",
        properties: { category: { type: "string" } },
        required: ["category"],
      },
    },
    {
      name: "find_supply_source",
      description: "Get specific EU sourcing sites, exact search tips, and price targets for a product to buy AFTER a sale.",
      input_schema: {
        type: "object",
        properties: {
          category: { type: "string" },
          productName: { type: "string", description: "Exact product name or model to search for" },
        },
        required: ["category"],
      },
    },
  ];

  const SYSTEM = `You are ARIA (Automated Resell Intelligence Agent). Dropship model — zero upfront capital.

HOW IT WORKS: List at SELL price first → buyer pays → buy from EU source → ship directly to buyer. You never hold inventory.

USER'S MONTHLY EARNING GOAL: $${monthlyGoal}
STRATEGY: ${goal === "profit" ? "Maximize net profit per deal — highest margin items first" : goal === "safety" ? "Minimize risk — low-risk, fast-selling items with stable demand" : "High volume — many transactions, fast turnover, lower margin ok"}

WORKFLOW (use ALL tools in order):
1. calculate_profit_detail for the top 3 opportunities (real fees subtracted)
2. get_market_trend for the #1 pick — is this peak/low season?
3. lookup_platforms for the #1 pick — where to LIST and SOURCE
4. find_supply_source for the #1 pick — exact EU sourcing sites and search terms
5. estimate_monthly_earnings — how many sales to hit the goal
6. Return ONLY a valid JSON object (no markdown, no explanation):

{
  "top3": [
    {"rank":1,"product":"...","buy":0,"sell":0,"netProfit":0,"roi":0,"category":"...","market":"...","reason":"one sentence why"}
  ],
  "champion": {
    "product":"...", "category":"...",
    "listAt":"platform name + exact listing price e.g. eBay USA at $285",
    "sourceAt":"site name + price range e.g. Kleinanzeigen.de €55-75",
    "searchTerms":["exact search query 1","exact search query 2","exact search query 3"],
    "netProfit":0, "roi":0,
    "season":"peak|normal|low — one word",
    "steps":["1. List on [platform] at $X — write title: [exact title]","2. When sold, search [query] on [site]","3. Order for €Y using buyer address at checkout","4. ...","5. ..."],
    "platforms":["sell platform 1","sell platform 2"],
    "buySource":"primary EU sourcing site",
    "timeToSell":"e.g. 7-14 days"
  },
  "goalPlan":{
    "monthlyTarget":${monthlyGoal},
    "unitsNeeded":0,
    "daysPerUnit":0,
    "feasibility":"easy|realistic|stretch|very hard",
    "note":"one sentence — e.g. sell 3 watches/month to hit goal"
  },
  "monthlyEstimate":{"low":0,"target":0,"high":0},
  "quickWins":["concrete action 1 — specific site/search","concrete action 2","concrete action 3"],
  "warnings":["..."],
  "summary":"2-3 sentences — dropship plan, no capital needed, path to $${monthlyGoal}/month"
}`;

  send("status", { step: 0, message: "🤖 ARIA startuje — analizuję okazje rynkowe..." });

  let messages: any[] = [{
    role: "user",
    content: `Here are the current arbitrage opportunities (${oppsSlice.length} items):\n${JSON.stringify(oppsSlice)}\n\nBuild the best earning plan now.`,
  }];

  // step messages keyed by tool name (used in SSE labels)


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
        clearInterval(ping);
        send("error", { message: e.error?.message || `Claude API error ${r.status}` });
        res.end(); return;
      }

      const data = await r.json() as any;

      if (data.stop_reason === "end_turn") {
        const text: string = data.content?.find((b: any) => b.type === "text")?.text ?? "";
        const match = text.match(/\{[\s\S]*\}/);
        let report: any = null;
        if (match) { try { report = JSON.parse(match[0]); } catch {} }
        clearInterval(ping);
        send("done", { report, raw: report ? undefined : text.slice(0, 500) });
        res.end(); return;
      }

      if (data.stop_reason === "tool_use") {
        messages.push({ role: "assistant", content: data.content });
        const results: any[] = [];
        for (const block of data.content) {
          if (block.type !== "tool_use") continue;
          const label =
            block.name === "calculate_profit_detail" ? `💰 Liczę zysk dla „${block.input?.product}"...`
            : block.name === "estimate_monthly_earnings" ? "📊 Szacuję miesięczne zarobki..."
            : block.name === "get_market_trend" ? `📅 Sprawdzam sezonowość dla ${block.input?.category}...`
            : block.name === "find_supply_source" ? `🔍 Szukam źródeł zakupu dla „${block.input?.productName || block.input?.category}"...`
            : `🛒 Szukam platform dla ${block.input?.market}...`;
          send("status", { step: i + 1, message: label });
          results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(runTool(block.name, block.input)) });
        }
        messages.push({ role: "user", content: results });
        continue;
      }

      break;
    }
    clearInterval(ping);
    send("error", { message: "Agent przekroczył limit iteracji — spróbuj ponownie" });
    res.end();
  } catch (err: any) {
    clearInterval(ping);
    send("error", { message: err.message || "Błąd wewnętrzny agenta" });
    res.end();
  }
});

export default router;
