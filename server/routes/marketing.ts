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

// ── Imagen 3 — marketing image generation ────────────────────────────────────
router.post("/gen-image", async (req: Request, res: Response) => {
  const { prompt, geminiKey } = req.body;
  const key: string = geminiKey || process.env.GEMINI_API_KEY || "";
  if (!key) return res.status(400).json({ error: "Gemini API key required" });
  if (!prompt) return res.status(400).json({ error: "prompt required" });

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${key}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          instances: [{ prompt }],
          parameters: { sampleCount: 1, aspectRatio: "16:9" },
        }),
      }
    );
    if (!r.ok) {
      const err = await r.json().catch(() => ({})) as any;
      return res.status(502).json({ error: err.error?.message || `Imagen API error ${r.status}` });
    }
    const data = await r.json() as any;
    const b64 = data.predictions?.[0]?.bytesBase64Encoded;
    if (!b64) return res.status(502).json({ error: "No image in response" });
    return res.json({ image: `data:image/png;base64,${b64}` });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Image generation failed" });
  }
});

// ── Veo — start video generation ─────────────────────────────────────────────
router.post("/gen-video", async (req: Request, res: Response) => {
  const { prompt, geminiKey, withAudio = true } = req.body;
  const key: string = geminiKey || process.env.GEMINI_API_KEY || "";
  if (!key) return res.status(400).json({ error: "Gemini API key required" });
  if (!prompt) return res.status(400).json({ error: "prompt required" });

  // Try Veo 3 (with audio) first, fall back to Veo 2
  const models = withAudio
    ? ["veo-3.0-generate-preview", "veo-2.0-generate-001"]
    : ["veo-2.0-generate-001"];

  for (const model of models) {
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateVideos?key=${key}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            prompt: { text: prompt },
            generationConfig: {
              durationSeconds: 8,
              aspectRatio: "16:9",
              ...(withAudio && model.includes("veo-3") ? { generateAudio: true } : {}),
            },
          }),
        }
      );
      if (r.status === 404 || r.status === 400) continue; // model not available, try next
      if (!r.ok) {
        const err = await r.json().catch(() => ({})) as any;
        return res.status(502).json({ error: err.error?.message || `Veo API error ${r.status}` });
      }
      const data = await r.json() as any;
      return res.json({ operationName: data.name, model });
    } catch { continue; }
  }
  return res.status(502).json({ error: "Veo model not available for your API key. Check Google AI Studio for Veo access." });
});

// ── Veo — poll video status ───────────────────────────────────────────────────
router.get("/video-status", async (req: Request, res: Response) => {
  const operationName = String(req.query.op ?? "").trim();
  const key: string = String(req.query.geminiKey ?? "").trim();
  if (!operationName || !key) return res.status(400).json({ error: "op and geminiKey required" });

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${operationName}?key=${key}`
    );
    if (!r.ok) {
      const err = await r.json().catch(() => ({})) as any;
      return res.status(502).json({ error: err.error?.message || "Status check failed" });
    }
    const data = await r.json() as any;
    if (!data.done) return res.json({ done: false });

    const samples = data.response?.generateVideoResponse?.generatedSamples ?? [];
    const first = samples[0]?.video ?? {};
    return res.json({
      done: true,
      videoUri: first.uri ?? null,
      videoB64: first.encodedVideo ?? null,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Status check failed" });
  }
});

// ── YouTube comments fetch (requires YouTube Data API v3 key) ────────────────
router.get("/yt-comments", async (req: Request, res: Response) => {
  const videoId = String(req.query.videoId ?? "").trim();
  const ytKey   = String(req.query.ytKey   ?? "").trim();
  if (!videoId || !ytKey) return res.status(400).json({ error: "videoId and ytKey required" });

  try {
    const url = `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${videoId}&maxResults=20&order=relevance&textFormat=plainText&key=${ytKey}`;
    const r = await fetch(url, { headers: { "Accept": "application/json" } });
    const data = await r.json() as any;
    if (!r.ok) return res.status(502).json({ error: data.error?.message || "YouTube API error" });

    const comments = (data.items ?? []).map((item: any) => ({
      text:   item.snippet.topLevelComment.snippet.textDisplay,
      likes:  item.snippet.topLevelComment.snippet.likeCount ?? 0,
      author: item.snippet.topLevelComment.snippet.authorDisplayName ?? "User",
    }));
    return res.json({ comments });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Failed to fetch comments" });
  }
});

// ── AI comment marketing generator ──────────────────────────────────────────
router.post("/gen-comments", async (req: Request, res: Response) => {
  const {
    product, description = "", targetMarket = "Poland",
    campaignType = "launch", anthropicKey,
    realComments = [],
  } = req.body;
  if (!product) return res.status(400).json({ error: "product required" });
  const key: string = anthropicKey || process.env.ANTHROPIC_API_KEY || "";
  if (!key) return res.status(400).json({ error: "Anthropic API key required" });

  const hasReal = Array.isArray(realComments) && realComments.length > 0;
  const realCtx = hasReal
    ? `\nREAL YOUTUBE COMMENTS TO ANALYZE:\n${realComments.slice(0, 15).map((c: any, i: number) => `${i + 1}. [👍${c.likes}] "${c.text}"`).join("\n")}`
    : "";

  const prompt = `You are a social-media comment marketing strategist. Generate strategic marketing comments for YouTube and TikTok.

Product: ${product}
Description: ${description || "N/A"}
Target Market: ${targetMarket}
Campaign Type: ${campaignType}${realCtx}

Return ONLY valid JSON (no markdown):
{
  ${hasReal ? `"insights": {
    "sentiment": "positive | mixed | negative",
    "topPhrases": ["phrase1", "phrase2", "phrase3"],
    "audienceDesires": ["desire1", "desire2", "desire3"],
    "audiencePainPoints": ["pain1", "pain2"],
    "opportunity": "2-3 sentences: what resonates with this audience and how to position the product"
  },` : ""}
  "youtube": {
    "pinned": "best comment to pin under your own video — adds value, soft CTA",
    "engagement": [
      "engaging comment 1 — question that sparks discussion",
      "engaging comment 2 — relatable observation + social proof",
      "engaging comment 3 — helpful tip related to product",
      "engaging comment 4 — share experience naturally",
      "engaging comment 5 — soft mention of where to get it"
    ],
    "replies": [
      "reply template: someone asks 'where can I buy this?'",
      "reply template: negative/skeptical comment — turn it around",
      "reply template: enthusiastic comment — amplify and redirect"
    ],
    "viral": "the single comment most likely to get pinned by the channel or go viral"
  },
  "tiktok": {
    "hooks": [
      "hook comment 1 — stops the scroll in first line",
      "hook comment 2 — curiosity gap",
      "hook comment 3 — relatable POV",
      "hook comment 4 — value proposition",
      "hook comment 5 — social proof style"
    ],
    "duetStitch": "describe which type of TikTok video to duet/stitch and what to say in the comment",
    "trending": [
      "trending format comment 1 — current TikTok language, Gen Z tone",
      "trending format comment 2",
      "trending format comment 3"
    ],
    "replies": [
      "reply when someone asks 'what's the link?'",
      "reply to skeptical/dismissive comment"
    ]
  }
}`;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 3000,
        system: "You are a social-media comment marketing expert. Always respond with valid JSON only.",
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
    return res.json(JSON.parse(match[0]));
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Internal error" });
  }
});

router.post("/generate", async (req: Request, res: Response) => {
  const {
    product, category = "General", priceUSD = 0,
    description = "", targetMarket, marketType = "country",
    campaignType = "launch", anthropicKey, voice = "professional",
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
- Voice/Tone: ${voice}
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
  ],
  "influencer": {
    "idealProfile": "description of ideal influencer type for this product+market",
    "outreachSubject": "email subject line for influencer outreach",
    "outreachBody": "full outreach email body (150-200 words) in ${language}",
    "brief": "content brief: key messages to include, things to avoid, format recommendation",
    "compensation": "suggested deal structure (barter/paid/affiliate commission %)"
  }
}`;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 8000,
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

    let campaign: any;
    try {
      campaign = JSON.parse(match[0]);
    } catch {
      // JSON truncated — try to salvage by closing open structures
      let partial = match[0];
      // Count unclosed braces/brackets and close them
      let opens = 0;
      for (const ch of partial) { if (ch === "{" || ch === "[") opens++; else if (ch === "}" || ch === "]") opens--; }
      // Remove trailing incomplete key/value
      partial = partial.replace(/,\s*"[^"]*"\s*:\s*[^,}\]]*$/, "").replace(/,\s*$/, "");
      // Close remaining open structures
      const stack: string[] = [];
      for (const ch of partial) { if (ch === "{") stack.push("}"); else if (ch === "[") stack.push("]"); else if (ch === "}" || ch === "]") stack.pop(); }
      partial += stack.reverse().join("");
      try { campaign = JSON.parse(partial); } catch {
        return res.status(502).json({ error: "JSON truncated — try again or shorten the description", raw: text.slice(0, 200) });
      }
    }
    return res.json({
      campaign,
      meta: { product, targetMarket, marketType, campaignType, language, currency },
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Internal error" });
  }
});

// ── 5-email drip sequence ─────────────────────────────────────────────────────
router.post("/gen-sequence", async (req: Request, res: Response) => {
  const {
    product, description = "", targetMarket = "Poland",
    campaignType = "launch", voice = "professional", anthropicKey,
  } = req.body;
  if (!product) return res.status(400).json({ error: "product required" });
  const key: string = anthropicKey || process.env.ANTHROPIC_API_KEY || "";
  if (!key) return res.status(400).json({ error: "Anthropic API key required" });

  const language = MARKET_LANGUAGE[targetMarket] ?? "English";

  const prompt = `You are an email marketing expert. Create a 5-email drip sequence for:
Product: ${product}
Description: ${description || "N/A"}
Target Market: ${targetMarket}
Campaign Type: ${campaignType}
Voice/Tone: ${voice}
Language: ${language}

Return ONLY a valid JSON array of 5 email objects (no markdown):
[
  {
    "timing": "Dzień 0 — od razu",
    "goal": "Powitanie i pierwsza wartość",
    "subject": "email subject in ${language}",
    "preheader": "email preheader in ${language}",
    "body": "full email body 200-300 words in ${language}",
    "cta": "button text in ${language}"
  }
]
Write all content (subject, preheader, body, cta) in ${language}. Keep JSON keys in English.`;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4000,
        system: "You are an email marketing expert. Always respond with valid JSON only.",
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({})) as any;
      return res.status(502).json({ error: err.error?.message || `Claude API error ${r.status}` });
    }
    const data = await r.json() as any;
    const text: string = data.content?.[0]?.text ?? "";
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return res.status(502).json({ error: "No JSON array in response", raw: text.slice(0, 400) });
    return res.json(JSON.parse(match[0]));
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Internal error" });
  }
});

// ── Landing page copy generator ───────────────────────────────────────────────
router.post("/gen-landing", async (req: Request, res: Response) => {
  const {
    product, description = "", targetMarket = "Poland",
    priceUSD = 0, voice = "professional", anthropicKey,
  } = req.body;
  if (!product) return res.status(400).json({ error: "product required" });
  const key: string = anthropicKey || process.env.ANTHROPIC_API_KEY || "";
  if (!key) return res.status(400).json({ error: "Anthropic API key required" });

  const language = MARKET_LANGUAGE[targetMarket] ?? "English";

  const prompt = `You are a world-class copywriter specializing in high-converting landing pages. Create full landing page copy for:
Product: ${product}
Description: ${description || "N/A"}
Target Market: ${targetMarket}
Price: $${priceUSD} USD
Voice/Tone: ${voice}
Language: ${language}

Return ONLY a valid JSON object (no markdown):
{
  "hero": {
    "headline": "main headline in ${language}",
    "subheadline": "supporting subheadline in ${language}",
    "cta": "primary CTA button text in ${language}",
    "socialProofLine": "e.g. 2,400+ satisfied customers"
  },
  "problem": {
    "heading": "section heading in ${language}",
    "points": ["pain point 1 in ${language}", "pain point 2", "pain point 3"]
  },
  "solution": {
    "heading": "section heading in ${language}",
    "description": "2-3 sentence solution description in ${language}",
    "bullets": ["feature benefit 1 in ${language}", "feature benefit 2", "feature benefit 3"]
  },
  "features": [
    { "emoji": "🔍", "title": "feature title in ${language}", "desc": "1-2 sentence description in ${language}" },
    { "emoji": "⚡", "title": "feature title in ${language}", "desc": "1-2 sentence description in ${language}" },
    { "emoji": "🎯", "title": "feature title in ${language}", "desc": "1-2 sentence description in ${language}" },
    { "emoji": "💎", "title": "feature title in ${language}", "desc": "1-2 sentence description in ${language}" },
    { "emoji": "🚀", "title": "feature title in ${language}", "desc": "1-2 sentence description in ${language}" }
  ],
  "socialProof": {
    "heading": "section heading in ${language}",
    "testimonials": [
      { "text": "testimonial quote in ${language}", "author": "Name Surname", "role": "Job Title, Company" },
      { "text": "testimonial quote in ${language}", "author": "Name Surname", "role": "Job Title, Company" },
      { "text": "testimonial quote in ${language}", "author": "Name Surname", "role": "Job Title, Company" }
    ]
  },
  "faq": [
    { "q": "question in ${language}", "a": "answer in ${language}" },
    { "q": "question in ${language}", "a": "answer in ${language}" },
    { "q": "question in ${language}", "a": "answer in ${language}" },
    { "q": "question in ${language}", "a": "answer in ${language}" }
  ],
  "finalCta": {
    "headline": "closing headline in ${language}",
    "subtext": "closing subtext in ${language}",
    "cta": "CTA button text in ${language}"
  }
}
Write all user-facing content in ${language}. Keep JSON keys in English.`;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4000,
        system: "You are a world-class conversion copywriter. Always respond with valid JSON only.",
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
    return res.json(JSON.parse(match[0]));
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Internal error" });
  }
});

// ── 30-day content calendar ───────────────────────────────────────────────────
router.post("/gen-calendar", async (req: Request, res: Response) => {
  const {
    product, description = "", targetMarket = "Poland",
    campaignType = "launch", voice = "professional", anthropicKey,
  } = req.body;
  if (!product) return res.status(400).json({ error: "product required" });
  const key: string = anthropicKey || process.env.ANTHROPIC_API_KEY || "";
  if (!key) return res.status(400).json({ error: "Anthropic API key required" });

  const language = MARKET_LANGUAGE[targetMarket] ?? "English";

  const prompt = `You are a social media strategist. Create a 30-day content calendar for:
Product: ${product}
Description: ${description || "N/A"}
Target Market: ${targetMarket}
Campaign Type: ${campaignType}
Voice/Tone: ${voice}
Language: ${language}

Return ONLY a valid JSON array of exactly 30 items (no markdown):
[
  {
    "day": 1,
    "label": "Tydzień 1 — Poniedziałek",
    "platform": "TikTok",
    "type": "Reel",
    "hook": "first sentence that stops scroll in ${language}",
    "content": "brief description of what to post in ${language}",
    "hashtags": ["#tag1", "#tag2", "#tag3"],
    "bestTime": "18:00–20:00"
  }
]
Use platforms: TikTok, Instagram, Facebook, YouTube. Vary them across days. Write hook and content in ${language}. Keep JSON keys in English. Return all 30 days.`;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4000,
        system: "You are a social media content strategist. Always respond with valid JSON only.",
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({})) as any;
      return res.status(502).json({ error: err.error?.message || `Claude API error ${r.status}` });
    }
    const data = await r.json() as any;
    const text: string = data.content?.[0]?.text ?? "";
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return res.status(502).json({ error: "No JSON array in response", raw: text.slice(0, 400) });
    return res.json(JSON.parse(match[0]));
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Internal error" });
  }
});

export default router;
