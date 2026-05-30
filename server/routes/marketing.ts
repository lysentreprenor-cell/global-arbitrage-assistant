import { Router, type Request, type Response } from "express";

const router = Router();

// ── YouTube metadata fetch ───────────────────────────────────────────────────
router.get("/fetch-yt", async (req: Request, res: Response) => {
  const url = String(req.query.url ?? "").trim();
  if (!url) return res.status(400).json({ error: "url required" });

  // Validate it's a YouTube URL
  const ytPattern = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\/)/i;
  if (!ytPattern.test(url)) return res.status(400).json({ error: "Not a YouTube URL" });

  try {
    // 1. oEmbed — title, thumbnail, channel
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const oembed = await fetch(oembedUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!oembed.ok) return res.status(502).json({ error: "Could not fetch YouTube metadata" });
    const meta = await oembed.json() as any;

    // 2. Fetch the video page to extract description from og:description
    let videoDescription = "";
    let keywords = "";
    try {
      const page = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });
      if (page.ok) {
        const html = await page.text();
        // Extract og:description
        const descMatch = html.match(/<meta\s+(?:name|property)=["'](?:og:description|description)["']\s+content=["']([^"']*?)["']/i)
          ?? html.match(/content=["']([^"']*?)["']\s+(?:name|property)=["'](?:og:description|description)["']/i);
        if (descMatch) videoDescription = descMatch[1].replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n)).replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim();

        // Extract keywords
        const kwMatch = html.match(/<meta\s+name=["']keywords["']\s+content=["']([^"']*?)["']/i);
        if (kwMatch) keywords = kwMatch[1];
      }
    } catch { /* ignore — oEmbed data is sufficient */ }

    return res.json({
      title: meta.title ?? "",
      channelName: meta.author_name ?? "",
      thumbnail: meta.thumbnail_url ?? "",
      description: videoDescription,
      keywords,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Failed to fetch YouTube data" });
  }
});

const MARKET_LANGUAGE: Record<string, string> = {
  "Poland": "Polish", "Germany": "German", "France": "French",
  "Italy": "Italian", "Spain": "Spanish", "Netherlands": "Dutch",
  "Sweden": "Swedish", "Norway": "Norwegian", "Denmark": "Danish",
  "Czech Republic": "Czech", "Romania": "Romanian", "Hungary": "Hungarian",
  "Portugal": "Portuguese", "Greece": "Greek", "Finland": "Finnish",
  "Japan": "Japanese", "China": "Chinese (Simplified)",
  "South Korea": "Korean", "Brazil": "Portuguese (Brazil)",
  "Russia": "Russian", "Ukraine": "Ukrainian", "Turkey": "Turkish",
  "Saudi Arabia": "Arabic", "UAE": "Arabic",
};

const MARKET_CURRENCY: Record<string, string> = {
  "Poland": "PLN", "Germany": "EUR", "France": "EUR", "Italy": "EUR",
  "Spain": "EUR", "Netherlands": "EUR", "Sweden": "SEK",
  "UK": "GBP", "USA": "USD", "Canada": "CAD", "Australia": "AUD",
  "Japan": "JPY", "South Korea": "KRW", "China": "CNY",
  "Brazil": "BRL", "India": "INR", "Nigeria": "NGN",
  "South Africa": "ZAR", "Egypt": "EGP", "Kenya": "KES",
};

const CONTINENT_CONTEXT: Record<string, string> = {
  "Europe": "Focus on EU markets: Germany, Poland, France, Italy, Spain, Netherlands. High purchasing power, strict GDPR/consumer laws, strong e-commerce infrastructure. Platforms: Facebook, Instagram, Google, Allegro (PL), Zalando (fashion), Amazon.de.",
  "North America": "USA + Canada: Largest e-commerce market. Platforms: Amazon, eBay, Etsy, Facebook, Instagram, TikTok, Google Shopping. High competition, strong brand loyalty.",
  "Asia": "Diverse markets: Japan (quality-driven), China (Taobao/WeChat), SE Asia (Shopee/Lazada), India (Flipkart). Mobile-first. Strong social commerce.",
  "Africa": "Fast-growing mobile-commerce. Nigeria (Jumia/Jiji), South Africa (Takealot), Kenya, Egypt. WhatsApp commerce important. Price-sensitive.",
  "South America": "Brazil dominant (Mercado Libre). Instagram/TikTok driven. Price sensitive, installment payments common.",
  "Oceania": "Australia/NZ: High purchasing power. Amazon AU, eBay AU, Gumtree. Seasonal (reversed from Northern hemisphere).",
  "Worldwide": "Global campaign — adapt for top markets simultaneously: US (English), Germany (German), Poland (Polish), Japan (Japanese). Focus on universal value propositions.",
};

router.post("/generate", async (req: Request, res: Response) => {
  const {
    product, category = "General", priceUSD = 0,
    description = "", targetMarket, marketType = "country",
    campaignType = "launch", anthropicKey,
  } = req.body;

  if (!product) return res.status(400).json({ error: "product required" });
  const key: string = anthropicKey || process.env.ANTHROPIC_API_KEY || "";
  if (!key) return res.status(400).json({ error: "Anthropic API key required" });

  const language = marketType === "country"
    ? (MARKET_LANGUAGE[targetMarket] ?? "English")
    : "English";
  const currency = marketType === "country"
    ? (MARKET_CURRENCY[targetMarket] ?? "USD")
    : "USD";
  const continentCtx = marketType === "continent"
    ? (CONTINENT_CONTEXT[targetMarket] ?? "")
    : marketType === "world"
    ? CONTINENT_CONTEXT["Worldwide"]
    : "";

  const campaignLabels: Record<string, string> = {
    launch: "New Product Launch",
    seasonal: "Seasonal/Holiday Promotion",
    clearance: "Clearance / Fire Sale",
    brand: "Brand Awareness",
    retargeting: "Retargeting / Win-back",
  };

  const prompt = `You are a world-class performance marketing strategist specializing in international e-commerce, cross-border reselling, and digital advertising. Your campaigns consistently achieve 4-8x ROAS.

CAMPAIGN BRIEF:
- Product: ${product}
- Category: ${category}
- Price: $${priceUSD} USD
- Description: ${description || "Not provided"}
- Target Market: ${targetMarket} (type: ${marketType})
- Campaign Type: ${campaignLabels[campaignType] ?? campaignType}
- Primary Language for Content: ${language}
- Currency: ${currency}
${continentCtx ? `- Market Context: ${continentCtx}` : ""}

Create a COMPLETE, ACTIONABLE marketing campaign kit. All ad copy and social content MUST be written in ${language}. If the language is not English, still keep JSON keys in English.

Return ONLY a valid JSON object (no markdown, no explanation):
{
  "summary": {
    "marketOverview": "2-3 sentences about the market opportunity for this product in ${targetMarket}",
    "uniqueSellingPoint": "The single most powerful selling angle for ${targetMarket}",
    "expectedROAS": "e.g. 3-5x",
    "seasonality": "best months/seasons to advertise this product in ${targetMarket}",
    "complianceNote": "any legal/regulatory notes for selling in ${targetMarket} (taxes, certifications, bans)"
  },
  "audience": {
    "ageRange": "e.g. 25-44",
    "gender": "Male / Female / All",
    "income": "Lower / Middle / Upper-Middle / Affluent",
    "interests": ["interest1", "interest2", "interest3", "interest4", "interest5"],
    "psychographics": "1-2 sentences describing buyer mindset and motivations",
    "painPoints": ["pain1", "pain2", "pain3"],
    "buyingTriggers": ["trigger1", "trigger2", "trigger3"]
  },
  "platforms": [
    {
      "platform": "platform name",
      "priority": 1,
      "reason": "why this platform works for this product + market",
      "expectedCPM": "estimated CPM in ${currency}",
      "bestFormat": "e.g. Video Reel / Carousel / Story"
    }
  ],
  "budget": {
    "monthly_min": number (${currency}),
    "monthly_max": number (${currency}),
    "allocation": { "paid_social": "40%", "google": "35%", "influencer": "15%", "email": "10%" },
    "tip": "practical budget advice for ${targetMarket}"
  },
  "social": {
    "instagram": {
      "caption": "full Instagram caption in ${language} (max 2200 chars, include emojis)",
      "hashtags": ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5", "#tag6", "#tag7", "#tag8", "#tag9", "#tag10"],
      "cta": "call to action text",
      "format": "Reel / Carousel / Single Post / Story",
      "visualIdea": "describe the ideal visual/video concept"
    },
    "facebook": {
      "headline": "Facebook ad headline (max 40 chars) in ${language}",
      "primaryText": "Facebook primary text in ${language} (150-300 chars)",
      "linkDescription": "link description in ${language} (max 30 chars)",
      "audienceNote": "specific Facebook audience targeting suggestion"
    },
    "tiktok": {
      "hook": "first 3 seconds hook in ${language} — must stop the scroll",
      "script": "full TikTok video script in ${language} (15-30 seconds)",
      "hashtags": ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5"],
      "musicMood": "describe the ideal background music style",
      "trendSuggestion": "current TikTok trend to leverage"
    },
    "youtube": {
      "title": "YouTube video title in ${language}",
      "description": "YouTube description in ${language} (first 200 chars shown)",
      "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"]
    }
  },
  "ads": {
    "google": {
      "headlines": ["headline 1 (max 30 chars)", "headline 2", "headline 3", "headline 4", "headline 5"],
      "descriptions": ["description 1 (max 90 chars)", "description 2"],
      "displayUrl": "example.com/product-keyword",
      "exactKeywords": ["keyword1", "keyword2", "keyword3", "keyword4"],
      "broadKeywords": ["broad kw 1", "broad kw 2", "broad kw 3"],
      "negativeKeywords": ["neg1", "neg2", "neg3"],
      "bidStrategy": "Target CPA / Maximize Conversions / etc.",
      "shoppingFeedTitle": "optimized product title for Google Shopping"
    },
    "meta": {
      "primaryText": "Meta Ads primary text in ${language}",
      "headline": "Meta Ads headline in ${language} (max 40 chars)",
      "description": "Meta Ads description in ${language} (max 30 chars)",
      "cta": "Shop Now / Learn More / Buy Now / etc.",
      "audienceTargeting": "detailed interests + behaviors to target",
      "lookalike": "what customer profile to use for lookalike audience"
    }
  },
  "email": {
    "subject": "email subject line in ${language} (A/B test: write 2 variations separated by | )",
    "preheader": "email preheader in ${language}",
    "body": "full promotional email body in ${language} (HTML-ready, 150-250 words)",
    "cta": "email CTA button text in ${language}"
  },
  "seo": {
    "pageTitle": "SEO page title in ${language} (max 60 chars)",
    "metaDescription": "SEO meta description in ${language} (max 155 chars)",
    "h1": "main heading in ${language}",
    "primaryKeywords": ["keyword1", "keyword2", "keyword3"],
    "longTailKeywords": ["long tail 1", "long tail 2", "long tail 3"],
    "contentIdeas": ["blog post idea 1", "blog post idea 2", "video idea 1"]
  },
  "localInsights": "3-5 cultural and market-specific insights for ${targetMarket} — what resonates, what to avoid, local trends, trusted payment methods, preferred delivery expectations",
  "launchPlan": [
    { "week": 1, "focus": "...", "actions": ["action1", "action2"], "platforms": ["platform1"], "budget_pct": "30%" },
    { "week": 2, "focus": "...", "actions": ["action1", "action2"], "platforms": ["platform1", "platform2"], "budget_pct": "25%" },
    { "week": 3, "focus": "...", "actions": ["action1"], "platforms": ["platform1", "platform2"], "budget_pct": "25%" },
    { "week": 4, "focus": "...", "actions": ["action1", "action2"], "platforms": ["platform1"], "budget_pct": "20%" }
  ]
}`;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 6000,
        system: "You are a world-class international performance marketing strategist. Generate complete, ready-to-use marketing campaigns. Always respond with valid JSON only.",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!r.ok) {
      const err = await r.json().catch(() => ({})) as any;
      return res.status(502).json({ error: err.error?.message || `Claude API error ${r.status}` });
    }
    const data = await r.json() as any;
    const text: string = data.content?.[0]?.text ?? "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return res.status(502).json({ error: "No JSON in response", raw: text.slice(0, 400) });

    const campaign = JSON.parse(match[0]);
    return res.json({
      campaign,
      meta: { product, targetMarket, marketType, campaignType, language, currency },
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Internal error" });
  }
});

export default router;
