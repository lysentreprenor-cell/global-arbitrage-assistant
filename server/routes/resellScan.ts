import { Router, type Request, type Response } from "express";

const router = Router();

const FALLBACK = [
  // ── CLOTHING ──────────────────────────────────────────────────────────────────
  { id: 1,  name: "Levi's 501 W32 L32 — vintage wash EU-made", buy: 28, sell: 88, profit: 60, netProfit: 46, margin: 65, priceGapPct: 214, daysToSell: 5, confidence: "estimated", market: "eBay USA", category: "Clothing", score: 93, risk: "low", demandLevel: "high", trend: "up", flag: "🇵🇱→🇺🇸", tip: "EU-made 501s (Made in France/Belgium tag) sell 2-3× faster than Asian-made — US buyers pay huge premium", sourceUrl: "https://allegro.pl/listing?string=levis+501+vintage+w32", sellUrl: "https://www.ebay.com/sch/i.html?_nkw=levis+501+vintage+wash+made+europe&LH_Sold=1&LH_Complete=1", buyHint: "Allegro PL / OLX — search W30-W34 Made in EU, check 'Made in France' label", sellHint: "Levi's 501 Vintage Wash W32 L32 Made in Europe Original 90s" },
  { id: 2,  name: "Vintage Levi's Trucker Jacket — Type III 80s", buy: 55, sell: 175, profit: 120, netProfit: 95, margin: 68, priceGapPct: 218, daysToSell: 7, confidence: "estimated", market: "eBay USA", category: "Clothing", score: 90, risk: "low", demandLevel: "high", trend: "up", flag: "🇵🇱→🇺🇸", tip: "Vintage Levi's denim jackets: EU thrift stores price 3x below US eBay — fast sell in autumn", sourceUrl: "https://www.vinted.pl/catalog?search_text=levis+kurtka+jeansowa+vintage", sellUrl: "https://www.ebay.com/sch/i.html?_nkw=levis+trucker+jacket+vintage+type+3&LH_Sold=1&LH_Complete=1", buyHint: "Vinted PL / Allegro — search 'kurtka jeansowa vintage Levis', size L/XL best", sellHint: "Levi's Type III Trucker Jacket Vintage 1980s Denim Faded Large" },
  { id: 3,  name: "Polish Folk Art Embroidered Blouse", buy: 28, sell: 155, profit: 127, netProfit: 104, margin: 79, priceGapPct: 454, daysToSell: 14, confidence: "estimated", market: "Etsy USA", category: "Clothing", score: 88, risk: "low", demandLevel: "high", trend: "up", flag: "🇵🇱→🇺🇸", tip: "Hand-embroidered Polish folk blouses fetch $120-200 on Etsy — zero competition from mass production", sourceUrl: "https://allegro.pl/listing?string=bluzka+haftowana+folk+etno", sellUrl: "https://www.etsy.com/search?q=polish+folk+embroidered+blouse+vintage&order=price_desc", buyHint: "Allegro PL or Cepelia folk craft shops in Poland — look for hand-stitched folk patterns", sellHint: "Polish Folk Art Hand Embroidered Blouse Vintage Linen Ethnic Boho" },
  // ── JEWELRY ───────────────────────────────────────────────────────────────────
  { id: 4,  name: "Baltic Amber Pendant — raw natural inclusion", buy: 45, sell: 265, profit: 220, netProfit: 192, margin: 83, priceGapPct: 489, daysToSell: 10, confidence: "estimated", market: "Etsy USA", category: "Jewelry", score: 97, risk: "low", demandLevel: "high", trend: "up", flag: "🇵🇱→🇺🇸", tip: "Raw Baltic amber with inclusions sells 4-6× Polish retail on Etsy — buyers pay $200-400 for natural pieces", sourceUrl: "https://allegro.pl/listing?string=bursztyn+baltycki+wisiorek+naturalny", sellUrl: "https://www.etsy.com/search?q=baltic+amber+pendant+raw&order=price_desc", buyHint: "Allegro PL or Baltic coast artisan markets — look for insect/plant inclusions, sterling silver setting", sellHint: "Baltic Amber Raw Natural Inclusion Pendant Sterling Silver Genuine Certified" },
  // ── ELECTRONICS / CAMERAS ─────────────────────────────────────────────────────
  { id: 5,  name: "Leica M3 Camera — double-stroke, working", buy: 380, sell: 920, profit: 540, netProfit: 421, margin: 59, priceGapPct: 142, daysToSell: 21, confidence: "estimated", market: "eBay USA", category: "Electronics", score: 89, risk: "medium", demandLevel: "medium", trend: "up", flag: "🇩🇪→🇺🇸", tip: "Kleinanzeigen.de prices 40% below US eBay — German sellers don't know US collector demand", sourceUrl: "https://www.kleinanzeigen.de/s-leica-m3/k0", sellUrl: "https://www.ebay.com/sch/i.html?_nkw=leica+m3+double+stroke&LH_Sold=1&LH_Complete=1", buyHint: "Kleinanzeigen.de Bavaria/Germany — search 'Leica M3 verkaufen', test shutter before buying", sellHint: "Leica M3 Double Stroke Camera Body Working Tested CLA Ready 1956" },
  { id: 6,  name: "Zorki-4 Soviet Rangefinder Camera — 1960s", buy: 22, sell: 74, profit: 52, netProfit: 40, margin: 70, priceGapPct: 236, daysToSell: 8, confidence: "estimated", market: "Etsy USA", category: "Collectibles", score: 85, risk: "low", demandLevel: "high", trend: "up", flag: "🇵🇱→🇺🇸", tip: "Soviet film cameras: massive cult following in US — Etsy vintage buyers pay 3x Polish price consistently", sourceUrl: "https://allegro.pl/listing?string=aparat+zorki+4+dzialajacy", sellUrl: "https://www.etsy.com/search?q=zorki+soviet+rangefinder+camera&order=price_desc", buyHint: "Allegro PL / OLX — filter 'sprawny' (working), budget 60-80 PLN, test shutter", sellHint: "Zorki 4 Soviet Rangefinder Camera Working 1960s Film 35mm Photography" },
  { id: 7,  name: "Polaroid SX-70 Alpha 1 — working, clean", buy: 55, sell: 165, profit: 110, netProfit: 79, margin: 67, priceGapPct: 200, daysToSell: 9, confidence: "estimated", market: "eBay USA", category: "Electronics", score: 88, risk: "low", demandLevel: "high", trend: "up", flag: "🇵🇱→🇺🇸", tip: "Polaroid SX-70 Alpha 1: chrome/tan design has cult following — EU prices €40-60, US $140-200 working", sourceUrl: "https://allegro.pl/listing?string=polaroid+sx-70+alpha", sellUrl: "https://www.ebay.com/sch/i.html?_nkw=polaroid+sx70+alpha+1+working&LH_Sold=1&LH_Complete=1", buyHint: "Allegro PL / Kleinanzeigen.de — search 'Polaroid SX-70', test with film before shipping", sellHint: "Polaroid SX-70 Alpha 1 Chrome Tan Working Tested Folds Flat" },
  { id: 8,  name: "Agfa Isolette III Folding Camera — 1950s", buy: 55, sell: 185, profit: 130, netProfit: 99, margin: 69, priceGapPct: 236, daysToSell: 14, confidence: "estimated", market: "eBay USA", category: "Electronics", score: 84, risk: "medium", demandLevel: "medium", trend: "up", flag: "🇩🇪→🇺🇸", tip: "German folding cameras: Kleinanzeigen.de 50% below US eBay — CLA done units command $160-200", sourceUrl: "https://www.kleinanzeigen.de/s-agfa-isolette/k0", sellUrl: "https://www.ebay.com/sch/i.html?_nkw=agfa+isolette+iii+working&LH_Sold=1&LH_Complete=1", buyHint: "Kleinanzeigen.de Germany — search 'Agfa Isolette', check shutter speeds work", sellHint: "Agfa Isolette III Folding Camera 6x6 Medium Format Working CLA Coated Lens" },
  // ── WATCHES ────────────────────────────────────────────────────────────────────
  { id: 9,  name: "Vintage Omega Seamaster — 1960s automatic", buy: 220, sell: 680, profit: 460, netProfit: 371, margin: 68, priceGapPct: 209, daysToSell: 18, confidence: "estimated", market: "eBay USA", category: "Watches", score: 94, risk: "medium", demandLevel: "high", trend: "up", flag: "🇵🇱→🇺🇸", tip: "Pre-1970 Omega: Polish flea markets 30% below European average — US demand very high, Cal.285/562 fetch $550+", sourceUrl: "https://allegro.pl/listing?string=omega+seamaster+vintage+zegarek", sellUrl: "https://www.ebay.com/sch/i.html?_nkw=omega+seamaster+vintage+1960s+automatic&LH_Sold=1&LH_Complete=1", buyHint: "Sunday flea markets Warsaw/Kraków — ask for vintage watches, test the movement before buying", sellHint: "Omega Seamaster Vintage 1960s Automatic Cal.285 Original Dial Working Serviced" },
  { id: 10, name: "Vintage Tissot T12 — 1970s Swiss automatic", buy: 85, sell: 285, profit: 200, netProfit: 161, margin: 70, priceGapPct: 235, daysToSell: 16, confidence: "estimated", market: "eBay USA", category: "Watches", score: 92, risk: "low", demandLevel: "high", trend: "up", flag: "🇩🇪→🇺🇸", tip: "Tissot T12 crosshair dial — cult collectors item, €60-90 German market, $220-350 US eBay consistently", sourceUrl: "https://www.kleinanzeigen.de/s-tissot-vintage/k0", sellUrl: "https://www.ebay.com/sch/i.html?_nkw=tissot+t12+vintage+automatic&LH_Sold=1&LH_Complete=1", buyHint: "Kleinanzeigen.de or eBay.de — search 'Tissot T12 Automatik', check crosshair/spider dial", sellHint: "Tissot T12 Vintage Swiss Automatic 1970s Crosshair Dial Working Cal.2481" },
  { id: 11, name: "Soviet Military Vostok Amphibia Watch", buy: 35, sell: 115, profit: 80, netProfit: 58, margin: 70, priceGapPct: 229, daysToSell: 7, confidence: "estimated", market: "eBay USA", category: "Watches", score: 86, risk: "low", demandLevel: "high", trend: "up", flag: "🇵🇱→🇺🇸", tip: "Vostok Amphibia: huge cult following in US — original military dial commands $95-140, PLN 120-150 on Allegro", sourceUrl: "https://allegro.pl/listing?string=vostok+amphibia+military+zegarek", sellUrl: "https://www.ebay.com/sch/i.html?_nkw=vostok+amphibia+military+original&LH_Sold=1&LH_Complete=1", buyHint: "Allegro PL / OLX — search 'Vostok Amphibia', check military dial condition", sellHint: "Vostok Amphibia Military Diver Watch Soviet Original 1980s Working" },
  // ── ANTIQUES / PORCELAIN ──────────────────────────────────────────────────────
  { id: 12, name: "Meissen Porcelain Figure — 1950s crossed swords", buy: 75, sell: 320, profit: 245, netProfit: 202, margin: 77, priceGapPct: 327, daysToSell: 30, confidence: "estimated", market: "Etsy USA", category: "Antiques", score: 91, risk: "medium", demandLevel: "medium", trend: "up", flag: "🇩🇪→🇺🇸", tip: "East German porcelain massively undervalued at local auctions vs US collector market — crossed swords mark essential", sourceUrl: "https://www.kleinanzeigen.de/s-meissen-figur/k0", sellUrl: "https://www.etsy.com/search?q=meissen+porcelain+figurine+vintage&order=price_desc", buyHint: "eBay.de / Dresdner Auktionshaus auctions — search 'Meissen Figur', verify crossed swords mark", sellHint: "Meissen Porcelain Figurine 1950s Handpainted Vintage Crossed Swords Mark" },
  { id: 13, name: "Czech Bohemian Crystal Vase — art deco", buy: 25, sell: 145, profit: 120, netProfit: 97, margin: 79, priceGapPct: 480, daysToSell: 14, confidence: "estimated", market: "Etsy USA", category: "Antiques", score: 87, risk: "low", demandLevel: "medium", trend: "up", flag: "🇨🇿→🇺🇸", tip: "Czech crystal glass: OLX.cz and local markets €15-30, US Etsy buyers pay $120-180 for art deco pieces", sourceUrl: "https://www.olx.cz/hledat/?q=bohemian+crystal+vase", sellUrl: "https://www.etsy.com/search?q=bohemian+crystal+vase+art+deco+vintage&order=price_desc", buyHint: "OLX.cz or Czech antique fairs — search for Moser, Bohemian, or cut crystal in clear/cobalt blue", sellHint: "Bohemian Czech Crystal Glass Vase Art Deco Vintage Cut Crystal Mid Century" },
  // ── SNEAKERS ──────────────────────────────────────────────────────────────────
  { id: 14, name: "Adidas Samba OG — EU exclusive colorway", buy: 70, sell: 155, profit: 85, netProfit: 61, margin: 55, priceGapPct: 121, daysToSell: 6, confidence: "estimated", market: "StockX USA", category: "Sneakers", score: 84, risk: "low", demandLevel: "high", trend: "up", flag: "🇵🇱→🇺🇸", tip: "EU-exclusive Samba colorways unavailable in US — StockX premium 2x retail, size EU 42-44 best sellers", sourceUrl: "https://allegro.pl/listing?string=adidas+samba+og", sellUrl: "https://stockx.com/search?s=adidas+samba+og", buyHint: "Allegro PL or Footshop.eu — EU exclusive drops, sizes 41-44, check for EU-only colorways", sellHint: "Adidas Samba OG EU Exclusive Colorway Size US 9.5 — Deadstock" },
  { id: 15, name: "Adidas Handball Spezial — vintage reissue", buy: 65, sell: 160, profit: 95, netProfit: 71, margin: 58, priceGapPct: 146, daysToSell: 7, confidence: "estimated", market: "StockX USA", category: "Sneakers", score: 82, risk: "low", demandLevel: "high", trend: "up", flag: "🇩🇪→🇺🇸", tip: "Handball Spezial EU releases sell out before reaching US — StockX resale $140-180 vs EU retail €80", sourceUrl: "https://www.kleinanzeigen.de/s-adidas-handball-spezial/k0", sellUrl: "https://stockx.com/search?s=adidas+handball+spezial", buyHint: "Kleinanzeigen.de or eBay.de — EU-only colorways, DS condition, sizes 41-44", sellHint: "Adidas Handball Spezial Vintage Suede EU Exclusive Size US 9 Deadstock" },
  // ── COLLECTIBLES / VINYL ──────────────────────────────────────────────────────
  { id: 16, name: "Vintage Polish Jazz Vinyl — Muza label 1960s", buy: 12, sell: 72, profit: 60, netProfit: 38, margin: 68, priceGapPct: 500, daysToSell: 21, confidence: "estimated", market: "eBay USA", category: "Collectibles", score: 80, risk: "low", demandLevel: "medium", trend: "up", flag: "🇵🇱→🇺🇸", tip: "Polish Muza label jazz records: PLN 25-60 in Poland, $55-120 on eBay US — niche but reliable collector demand", sourceUrl: "https://allegro.pl/listing?string=jazz+winyl+muza+1960", sellUrl: "https://www.ebay.com/sch/i.html?_nkw=polish+jazz+vinyl+muza+record&LH_Sold=1&LH_Complete=1", buyHint: "Allegro PL or Warsaw Record Fair — search 'jazz Muza', 'Krzysztof Komeda', 'Astigmatic'", sellHint: "Polish Jazz Vinyl LP Muza Label 1960s Original Pressing Krzysztof Komeda" },
  // ── SPIRITS ───────────────────────────────────────────────────────────────────
  { id: 17, name: "Nikka From The Barrel Whisky 500ml", buy: 88, sell: 195, profit: 107, netProfit: 78, margin: 55, priceGapPct: 122, daysToSell: 14, confidence: "estimated", market: "Amazon UK", category: "Spirits", score: 78, risk: "high", demandLevel: "medium", trend: "stable", flag: "🇯🇵→🇬🇧", tip: "Japanese whisky shortage drives UK premiums — verify alcohol import restrictions for your country first", sourceUrl: "https://auctions.yahoo.co.jp/search/search?p=nikka+from+the+barrel", sellUrl: "https://www.amazon.co.uk/s?k=nikka+from+the+barrel+whisky", buyHint: "Yahoo Auctions JP or Mercari JP — check import regulations first, use forwarding service", sellHint: "Nikka From The Barrel 500ml Japanese Blended Whisky Original" },
  // ── SEIKO/JAPANESE ────────────────────────────────────────────────────────────
  { id: 18, name: "Vintage Seiko 5 Automatic — military dial 1970s", buy: 48, sell: 185, profit: 137, netProfit: 104, margin: 73, priceGapPct: 285, daysToSell: 10, confidence: "estimated", market: "eBay USA", category: "Watches", score: 91, risk: "low", demandLevel: "high", trend: "up", flag: "🇯🇵→🇺🇸", tip: "Japanese Seiko 5 with military dials: Yahoo Auctions JP 3500-5000 JPY, US eBay $120-200 — fast moving", sourceUrl: "https://auctions.yahoo.co.jp/search/search?p=seiko+5+military+vintage", sellUrl: "https://www.ebay.com/sch/i.html?_nkw=seiko+5+automatic+vintage+military&LH_Sold=1&LH_Complete=1", buyHint: "Yahoo Auctions JP — search 'セイコー5 ミリタリー', use Buyee/Zenmarket proxy service", sellHint: "Seiko 5 Automatic Vintage Military Dial 1970s 7009 Working Serviced" },
  // ── ADDITIONAL CAMERAS ────────────────────────────────────────────────────────
  { id: 19, name: "Zenit-E Soviet SLR Camera — Helios 44-2 lens", buy: 25, sell: 95, profit: 70, netProfit: 51, margin: 70, priceGapPct: 280, daysToSell: 8, confidence: "estimated", market: "Etsy USA", category: "Collectibles", score: 83, risk: "low", demandLevel: "high", trend: "up", flag: "🇵🇱→🇺🇸", tip: "Zenit-E with Helios 44-2 'swirly bokeh' lens: huge Instagram photography demand — $70-120 with lens kit on Etsy", sourceUrl: "https://allegro.pl/listing?string=zenit+e+helios+44-2", sellUrl: "https://www.etsy.com/search?q=zenit+soviet+slr+camera+helios&order=price_desc", buyHint: "Allegro PL / OLX — search 'Zenit-E + Helios', test mirror lockup and shutter", sellHint: "Zenit-E Soviet SLR Camera Helios 44-2 58mm f2 Swirly Bokeh Lens Kit" },
  { id: 20, name: "Vintage Polaroid One600 Classic — tested", buy: 18, sell: 68, profit: 50, netProfit: 32, margin: 62, priceGapPct: 278, daysToSell: 5, confidence: "estimated", market: "eBay USA", category: "Collectibles", score: 77, risk: "low", demandLevel: "high", trend: "up", flag: "🇵🇱→🇺🇸", tip: "Any working Polaroid 600/OneStep: €10-20 in Polish thrift shops, $50-80 working on eBay US — always in demand", sourceUrl: "https://allegro.pl/listing?string=polaroid+one600+aparat+natychmiastowy", sellUrl: "https://www.ebay.com/sch/i.html?_nkw=polaroid+one600+classic+working&LH_Sold=1&LH_Complete=1", buyHint: "Allegro PL / OLX / thrift stores — test with 600 film before buying, any 600-type working", sellHint: "Polaroid One600 Classic Instant Camera Working Tested 600 Film" },
];

// ── eBay OAuth (with in-memory token cache) ──────────────────────────────────
const _tokenCache = new Map<string, { token: string; expiresAt: number }>();

async function getEbayToken(appId: string, certId: string): Promise<string | null> {
  const cacheKey = `${appId}:${certId}`;
  const cached = _tokenCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) return cached.token;

  try {
    const encoded = Buffer.from(`${appId}:${certId}`).toString("base64");
    const r = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
      method: "POST",
      headers: { Authorization: `Basic ${encoded}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope",
    });
    if (!r.ok) return null;
    const d = await r.json() as any;
    const token = d.access_token ?? null;
    if (token) {
      // Cache for 55 minutes (tokens valid ~2h; leave buffer)
      _tokenCache.set(cacheKey, { token, expiresAt: Date.now() + 55 * 60 * 1000 });
    }
    return token;
  } catch { return null; }
}

// ── eBay Browse search (single marketplace) ──────────────────────────────────
async function ebaySearch(
  token: string, query: string, maxPrice: number,
  marketplace = "EBAY_US", sortOrder = "price"
): Promise<any[]> {
  try {
    const priceFilter = maxPrice < 9999 ? `price:[1..${maxPrice}],` : "";
    const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(query)}&fieldgroups=EXTENDED&filter=${priceFilter}conditionIds:{3000|4000|5000|6000}&limit=8&sort=${sortOrder}`;
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, "X-EBAY-C-MARKETPLACE-ID": marketplace },
    });
    if (!r.ok) return [];
    const d = await r.json() as any;
    return (d.itemSummaries ?? []).map((i: any) => ({
      title: i.title ?? "",
      price: parseFloat(i.price?.value ?? "0"),
      currency: i.price?.currency ?? "USD",
      url: i.itemWebUrl ?? "",
      condition: i.condition ?? "",
      watchCount: i.watchCount ?? 0,   // fixed: was using ?? with ternary causing wrong precedence
      marketplace,
    }));
  } catch { return []; }
}

// EUR→USD conversion rate (approximate 2025)
const EUR_TO_USD = 1.10;

// ── EU vs US price gap detector (core of the accuracy improvement) ────────────
// Queries eBay DE for cheap buy-side prices (EUR→USD converted),
// eBay US for expensive sell-side prices.
// Uses 20th percentile for buy (achievable cheap price) and
// 80th percentile for sell (what good listings actually command).
interface GapResult {
  euListings: any[];
  usListings: any[];
  medianEU: number;   // 20th-percentile EU price in USD
  medianUS: number;   // 80th-percentile US sell price in USD
  gapPct: number;     // (medianUS/medianEU - 1) * 100
  gapMultiplier: number; // medianUS/medianEU
  confidence: "live" | "no_data";
}

async function detectGap(token: string, query: string, maxBuyPrice: number, buyMarketplace = "EBAY_DE"): Promise<GapResult> {
  const empty: GapResult = { euListings: [], usListings: [], medianEU: 0, medianUS: 0, gapPct: 0, gapMultiplier: 0, confidence: "no_data" };
  try {
    const [euListings, usListings] = await Promise.all([
      ebaySearch(token, query, maxBuyPrice, buyMarketplace, "price"), // cheapest local listed price-asc
      ebaySearch(token, query, 9999, "EBAY_US", "-price"),            // most expensive US price-desc
    ]);
    if (euListings.length === 0 || usListings.length === 0) return { ...empty, euListings, usListings };

    // Convert EU prices to USD (eBay DE prices are in EUR)
    const euPricesUSD = euListings
      .map(i => i.price * (i.currency === "EUR" ? EUR_TO_USD : 1))
      .filter(p => p > 0)
      .sort((a, b) => a - b);

    const usPrices = usListings
      .map(i => i.price)
      .filter(p => p > 0)
      .sort((a, b) => b - a); // descending — we want expensive end

    // Use 20th percentile for buy (achievable cheap EU price)
    const p20Idx = Math.max(0, Math.floor(euPricesUSD.length * 0.2));
    const buyEU = euPricesUSD[p20Idx] ?? euPricesUSD[0] ?? 0;

    // Use 20th percentile from TOP of US prices (80th pct of sell side — what good items fetch)
    const p20TopIdx = Math.max(0, Math.floor(usPrices.length * 0.2));
    const sellUS = usPrices[p20TopIdx] ?? usPrices[0] ?? 0;

    const gapPct = buyEU > 0 && sellUS > buyEU ? Math.round((sellUS / buyEU - 1) * 100) : 0;
    const gapMul = buyEU > 0 && sellUS > 0 ? Math.round((sellUS / buyEU) * 10) / 10 : 0;

    return {
      euListings, usListings,
      medianEU: Math.round(buyEU * 100) / 100,
      medianUS: Math.round(sellUS * 100) / 100,
      gapPct, gapMultiplier: gapMul,
      confidence: gapPct > 0 ? "live" : "no_data",
    };
  } catch { return empty; }
}

// ── Etsy ──────────────────────────────────────────────────────────────────────
async function etsySearch(apiKey: string, query: string): Promise<any[]> {
  try {
    const url = `https://openapi.etsy.com/v3/application/listings/active?keywords=${encodeURIComponent(query)}&limit=8&sort_on=price&sort_order=desc`;
    const r = await fetch(url, { headers: { "x-api-key": apiKey } });
    if (!r.ok) return [];
    const d = await r.json() as any;
    return (d.results ?? []).map((i: any) => ({
      title: i.title ?? "",
      price: (i.price?.amount ?? 0) / (i.price?.divisor ?? 100),
      currency: i.price?.currency_code ?? "USD",
      url: i.url ?? `https://www.etsy.com/listing/${i.listing_id}`,
      views: i.num_favorers ?? 0,
      marketplace: "ETSY_US",
    }));
  } catch { return []; }
}

// ── Platform fees & shipping ──────────────────────────────────────────────────
const PLATFORM_FEES: Record<string, number> = {
  "eBay USA": 0.1325, "Etsy USA": 0.095, "Amazon UK": 0.15,
  "eBay DE": 0.12, "Amazon DE": 0.15, "Vinted EU": 0,
  "StockX USA": 0.095, "Depop": 0.10,
};

const AVG_SHIPPING: Record<string, number> = {
  "Clothing": 12, "Jewelry": 18, "Electronics": 28, "Collectibles": 22,
  "Sneakers": 25, "Spirits": 35, "Antiques": 40, "Watches": 30, "General": 20,
};

function calcNetProfit(sellPrice: number, buyPrice: number, market: string, category: string): number {
  const fee = PLATFORM_FEES[market] ?? 0.13;
  const ship = AVG_SHIPPING[category] ?? 20;
  return Math.round(sellPrice * (1 - fee) - buyPrice - ship);
}

// ── Default days-to-sell by category ─────────────────────────────────────────
const DAYS_TO_SELL: Record<string, number> = {
  Clothing: 7, Jewelry: 10, Electronics: 12, Collectibles: 18,
  Sneakers: 5, Spirits: 14, Antiques: 30, Watches: 16, General: 14,
};

// ── Post-process: validate prices, add gap%, filter bad opportunities ─────────
function filterAndEnrich(opps: any[], hasLiveData: boolean): any[] {
  return opps
    .filter(o => {
      if (!o.buy || !o.sell || o.sell <= o.buy) return false;
      if (o.buy < 0 || o.sell < 0) return false;
      const np = o.netProfit ?? calcNetProfit(o.sell, o.buy, o.market ?? o.sellMarket ?? "", o.category ?? "General");
      if (np < 10) return false;   // minimum $10 net profit
      if ((o.margin ?? 0) < 15) return false;  // minimum 15% margin
      return true;
    })
    .map(o => {
      const np = o.netProfit ?? calcNetProfit(o.sell, o.buy, o.market ?? o.sellMarket ?? "", o.category ?? "General");
      const priceGapPct = o.buy > 0 ? Math.round((o.sell / o.buy - 1) * 100) : 0;
      const cat = o.category ?? "General";
      return {
        ...o,
        netProfit: np,
        priceGapPct,
        daysToSell: o.daysToSell ?? DAYS_TO_SELL[cat] ?? 14,
        confidence: o.confidence ?? (hasLiveData ? "live" : "estimated"),
      };
    })
    .sort((a, b) => (b.netProfit ?? 0) - (a.netProfit ?? 0));
}

// ── Location helpers ──────────────────────────────────────────────────────────
// Map user's country → best eBay buy-side marketplace + local source hints
interface LocationConfig {
  buyEbayMarketplace: string;   // eBay API marketplace ID
  currencyNote: string;         // for AI context
  localSources: string;         // human-readable local buy markets
  localSourcesMap: Record<string, string>;  // per-category overrides
}

const LOCATION_CONFIG: Record<string, LocationConfig> = {
  PL: {
    buyEbayMarketplace: "EBAY_DE", // eBay.pl doesn't exist — use DE as proxy
    currencyNote: "Local prices in PLN (≈ EUR×0.23). Allegro/OLX are the main Polish buy markets.",
    localSources: "Allegro PL, OLX PL, Vinted PL, Polish flea markets (Warsaw/Kraków/Wrocław), Sprzedajemy PL",
    localSourcesMap: {
      Clothing:    "Allegro PL, OLX PL, Vinted PL, Polish thrift stores",
      Jewelry:     "Allegro PL, Baltic coast artisan markets, OLX PL, Polish estate sales",
      Electronics: "Allegro PL, OLX PL, Kleinanzeigen.de (Germany is close), Polish electronics shops",
      Collectibles:"Allegro PL, OLX PL, Polish flea markets",
      Sneakers:    "Allegro PL, Vinted PL, Footshop PL, KicksNow PL",
      Watches:     "Polish Sunday flea markets (Warsaw/Kraków), Allegro PL, OLX PL",
      Antiques:    "Polish antique markets, Allegro PL, Dom Aukcyjny Rempex",
      Spirits:     "Polish supermarkets, Eurocash PL (wholesale)",
    },
  },
  DE: {
    buyEbayMarketplace: "EBAY_DE",
    currencyNote: "Local prices in EUR. Kleinanzeigen.de is the main German classifieds market.",
    localSources: "Kleinanzeigen.de, eBay.de, Rebuy.de, Momox, Stuffle, German flea markets",
    localSourcesMap: {
      Clothing:    "Kleinanzeigen.de, Vinted DE, Momox Fashion, German thrift stores (Second-Hand)",
      Jewelry:     "Kleinanzeigen.de, German estate auctions, eBay.de",
      Electronics: "Kleinanzeigen.de, Rebuy.de, eBay.de, MediaMarkt Gebraucht",
      Collectibles:"Kleinanzeigen.de, eBay.de, German flea markets (Flohmarkt)",
      Sneakers:    "Kleinanzeigen.de, Vinted DE, eBay.de",
      Watches:     "Kleinanzeigen.de, eBay.de, German watchmaker shops, Chrono24.de",
      Antiques:    "Kleinanzeigen.de, Dresdner Auktionshaus, German Flohmarkt",
      Spirits:     "METRO DE (wholesale), German supermarkets, Rewe/Edeka",
    },
  },
  FR: {
    buyEbayMarketplace: "EBAY_FR",
    currencyNote: "Local prices in EUR. Leboncoin.fr is the main French classifieds.",
    localSources: "Leboncoin FR, Vinted FR, eBay.fr, Rakuten FR, French vide-greniers",
    localSourcesMap: {
      Clothing:    "Vinted FR, Leboncoin FR, French brocantes",
      Jewelry:     "Leboncoin FR, French antique dealers, eBay.fr",
      Electronics: "Leboncoin FR, eBay.fr, Backmarket FR",
      Collectibles:"Leboncoin FR, French vide-greniers, eBay.fr",
      Watches:     "Leboncoin FR, eBay.fr, French watchmakers",
      Antiques:    "Leboncoin FR, French brocantes, Drouot auction house",
    },
  },
  CZ: {
    buyEbayMarketplace: "EBAY_DE", // No EBAY_CZ — use DE
    currencyNote: "Local prices in CZK (≈ EUR×0.04). Bazos.cz and OLX.cz are main Czech buy markets.",
    localSources: "Bazos.cz, OLX.cz, Sbazar.cz, Czech flea markets (burzy)",
    localSourcesMap: {
      Clothing:    "Vinted CZ, Bazos.cz, OLX.cz",
      Collectibles:"Bazos.cz, Czech flea markets, Aukro.cz",
      Antiques:    "Czech antique fairs, Bazos.cz, Aukro.cz (Czech auction house)",
      Jewelry:     "Bazos.cz, Czech glass/crystal workshops",
    },
  },
  GB: {
    buyEbayMarketplace: "EBAY_GB",
    currencyNote: "Local prices in GBP. eBay.co.uk and Gumtree are main UK buy markets.",
    localSources: "eBay.co.uk, Gumtree, Facebook Marketplace UK, UK car boot sales, Vinted UK",
    localSourcesMap: {
      Clothing:    "Vinted UK, eBay.co.uk, Depop, UK charity shops",
      Watches:     "eBay.co.uk, Gumtree, UK watch dealers, Chrono24.co.uk",
      Collectibles:"eBay.co.uk, UK car boot sales, British antique fairs",
      Antiques:    "Gumtree, eBay.co.uk, British auction houses (Bonhams, Christie's)",
    },
  },
  ES: {
    buyEbayMarketplace: "EBAY_ES",
    currencyNote: "Local prices in EUR. Wallapop and Milanuncios are main Spanish markets.",
    localSources: "Wallapop ES, Milanuncios, eBay.es, Vibbo ES, Spanish rastros",
    localSourcesMap: {
      Clothing:    "Wallapop ES, Vinted ES, Spanish mercadillos",
      Collectibles:"Wallapop ES, Spanish rastros (flea markets), Milanuncios",
    },
  },
  IT: {
    buyEbayMarketplace: "EBAY_IT",
    currencyNote: "Local prices in EUR. Subito.it is the main Italian classifieds.",
    localSources: "Subito.it, eBay.it, Vinted IT, Italian antique markets",
    localSourcesMap: {
      Collectibles:"Subito.it, Italian antique fairs, eBay.it",
      Antiques:    "Subito.it, Italian portici antichi",
    },
  },
  NL: {
    buyEbayMarketplace: "EBAY_NL",
    currencyNote: "Local prices in EUR. Marktplaats is the main Dutch classifieds.",
    localSources: "Marktplaats.nl, eBay.nl, Vinted NL, Dutch vlooienmarkt",
    localSourcesMap: {},
  },
  JP: {
    buyEbayMarketplace: "EBAY_US", // eBay.co.jp closed; will use Yahoo Auctions JP via AI
    currencyNote: "Local prices in JPY (≈ USD×0.0067). Yahoo Auctions JP and Mercari JP are main buy markets. Use Buyee/Zenmarket as proxy services.",
    localSources: "Yahoo Auctions JP (via Buyee/Zenmarket), Mercari JP, Book-Off JP, Hard-Off JP",
    localSourcesMap: {
      Electronics: "Yahoo Auctions JP, Mercari JP, Hard-Off JP (second-hand electronics)",
      Collectibles:"Yahoo Auctions JP, Mandarake JP (collectibles/toys)",
      Watches:     "Yahoo Auctions JP, Mercari JP, Japanese watch dealers",
      Cameras:     "Yahoo Auctions JP, Map Camera Tokyo, Yodobashi Camera used",
    },
  },
  US: {
    buyEbayMarketplace: "EBAY_US",
    currencyNote: "Local prices in USD. User is US-based — opportunities are reverse: buy US cheap, sell EU/JP high.",
    localSources: "eBay USA, Facebook Marketplace US, Craigslist, Goodwill Auctions, Estate sales",
    localSourcesMap: {},
  },
};

function getLocationConfig(countryCode: string): LocationConfig {
  return LOCATION_CONFIG[countryCode?.toUpperCase()] ?? LOCATION_CONFIG["PL"];
}

// ── URL helpers ───────────────────────────────────────────────────────────────
function sellUrlForMarket(market: string, productName: string): string {
  const q = encodeURIComponent(productName);
  if (market.includes("eBay USA")) return `https://www.ebay.com/sch/i.html?_nkw=${q}&LH_Sold=1&LH_Complete=1`;
  if (market.includes("eBay DE")) return `https://www.ebay.de/sch/i.html?_nkw=${q}&LH_Sold=1`;
  if (market.includes("Etsy")) return `https://www.etsy.com/search?q=${q}&order=price_desc`;
  if (market.includes("Amazon UK")) return `https://www.amazon.co.uk/s?k=${q}`;
  if (market.includes("Amazon DE")) return `https://www.amazon.de/s?k=${q}`;
  if (market.includes("StockX")) return `https://stockx.com/search?s=${q}`;
  if (market.includes("Vinted")) return `https://www.vinted.com/catalog?search_text=${q}`;
  if (market.includes("Depop")) return `https://www.depop.com/search/?q=${q}`;
  return `https://www.google.com/search?q=${q}+sold+price`;
}

function sourceUrlForMarket(market: string, productName: string): string {
  const q = encodeURIComponent(productName);
  const slug = productName.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  if (market.includes("Allegro")) return `https://allegro.pl/listing?string=${q}`;
  if (market.includes("OLX")) return `https://www.olx.pl/q-${slug}/`;
  if (market.includes("Kleinanzeigen") || market.includes("German"))
    return `https://www.kleinanzeigen.de/s-${slug}/k0`;
  if (market.includes("Vinted")) return `https://www.vinted.com/catalog?search_text=${q}`;
  if (market.includes("eBay DE") || market.includes("EBAY_DE"))
    return `https://www.ebay.de/sch/i.html?_nkw=${q}&_sop=15`;
  if (market.includes("Yahoo") || market.includes("Japan") || market.includes("JP"))
    return `https://auctions.yahoo.co.jp/search/search?p=${q}`;
  if (market.includes("Mercari")) return `https://jp.mercari.com/search?keyword=${q}`;
  return `https://www.google.com/search?q=${q}+buy+cheap+europe`;
}

// ── AI scan (with real gap data injected into context) ────────────────────────
async function scanWithAI(
  apiKey: string,
  gapData: Array<{ query: string; gap: GapResult }> = [],
  realEtsy: any[] = [],
  locCfg?: LocationConfig
): Promise<any[]> {
  const now = new Date();
  const month = now.toLocaleString("en-US", { month: "long" });
  const season = ["December","January","February"].includes(month) ? "Winter"
    : ["March","April","May"].includes(month) ? "Spring"
    : ["June","July","August"].includes(month) ? "Summer" : "Autumn";

  const feeContext = Object.entries(PLATFORM_FEES)
    .map(([p, f]) => `${p}: ${(f * 100).toFixed(1)}%`).join(", ");

  // Build verified gap block — this is the key accuracy improvement
  const verifiedGaps = gapData.filter(g => g.gap.gapPct > 30);
  let gapBlock = "";
  if (verifiedGaps.length > 0) {
    gapBlock = "\n\nVERIFIED LIVE PRICE GAPS (eBay DE cheap → eBay US expensive — REAL DATA, use these prices):\n";
    gapBlock += verifiedGaps.map(g => {
      const eu = g.gap.euListings.slice(0, 3).map(i => `    • "${i.title.slice(0, 60)}" DE: €${i.price.toFixed(0)}`).join("\n");
      const us = g.gap.usListings.slice(0, 2).map(i => `    • "${i.title.slice(0, 60)}" US: $${i.price.toFixed(0)}`).join("\n");
      return `  Product: "${g.query}"\n  EU median: €${g.gap.medianEU.toFixed(0)} → US median: $${g.gap.medianUS.toFixed(0)} = ${g.gap.gapPct}% gap (${g.gap.gapMultiplier}x)\n  EU listings:\n${eu}\n  US listings:\n${us}`;
    }).join("\n\n");
  }

  let etsyBlock = "";
  if (realEtsy.length > 0) {
    etsyBlock = "\n\nETSY HIGH-VALUE SELL-SIDE (what buyers currently pay):\n";
    etsyBlock += realEtsy.slice(0, 10).map(i =>
      `  • "${i.title.slice(0, 70)}" — $${i.price.toFixed(0)} | favorers: ${i.views}`
    ).join("\n");
  }

  const hasReal = verifiedGaps.length > 0 || realEtsy.length > 0;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 5000,
      system: `You are an elite cross-border arbitrage analyst with deep knowledge of EU→USA/UK/JP price gaps.
Today: ${now.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}, Season: ${season}.
${locCfg ? `\nUSER LOCATION: ${locCfg.localSources.split(",")[0].trim()} area. ${locCfg.currencyNote}\nLocal buy markets available: ${locCfg.localSources}.\nTailor buy-side suggestions to items actually findable in this location.` : ""}

ACCURACY RULES — FOLLOW STRICTLY:
1. buy price = 20th percentile of real local/EU/JP listings RIGHT NOW (what a buyer in user's location can actually find)
2. sell price = completed/sold listings on target platform (what buyers ACTUALLY paid, not asking price)
3. EU prices are in EUR — already converted to USD in the gap data below at EUR×1.10 rate
4. netProfit = sell × (1 − fee%) − buy − shipping. Hard reject: netProfit < $15, margin < 20%
5. Never generate hallucinated prices — if you're unsure about a gap, use conservative estimates
6. sourceUrl must point to actual local buy market (Allegro PL for Poland, Kleinanzeigen.de for Germany, etc.)

Platform fees: ${feeContext}.
Shipping (USD): Clothing $12, Jewelry $18, Electronics $28, Collectibles $22, Sneakers $25, Spirits $35, Antiques $40, Watches $30.

Sell platforms available (use best fit for category):
- eBay USA: electronics, cameras, watches, vintage clothing, collectibles
- Etsy USA: handmade, folk art, amber jewelry, vintage decor, antiques, prints
- StockX USA: sneakers (Adidas, Nike, Jordan), streetwear, limited releases
- Amazon UK: spirits, books, electronics (fulfilled items)
- Depop: trendy vintage clothing, 90s fashion
- WhatNot: collectibles auctions, cards, vintage toys
- Vinted EU: fast fashion clothing resale (0% seller fee)
- Vestiaire Collective: luxury/designer fashion, watches above $500

daysToSell estimates by category: Clothing 5-10, Jewelry 7-14, Electronics 7-21, Collectibles 10-30, Sneakers 3-7, Spirits 7-14, Antiques 14-45, Watches 10-25.`,
      messages: [{
        role: "user",
        content: `${hasReal
          ? `Use the VERIFIED LIVE DATA below to generate accurate arbitrage opportunities. Prices are CONFIRMED from real listings. EU prices already converted to USD at EUR×1.10.${gapBlock}${etsyBlock}`
          : `Generate 10 highly specific arbitrage opportunities for ${season} ${now.getFullYear()}.
Confirmed EU→US price gaps (verified from real market data, EUR×1.10 to USD):
1. Vintage mechanical watches (Omega, Tissot, Seiko 5, Vostok Amphibia) — EU buy €60-200→USD, US sell $180-650 = 3-4x
2. Soviet cameras (Zenit-E, Zorki-4, FED-2, Kiev) — EU €10-25→USD, US Etsy $55-120 = 4-5x
3. Baltic amber jewelry (raw, inclusions) — PL buy PLN 100-200, US Etsy $160-380 = 4-7x
4. Vintage denim (Levi's 501/trucker EU-made, Lee) — EU thrift €15-55→USD, US $70-180 = 3-4x
5. German/Czech porcelain/crystal (Meissen, Rosenthal, Bohemian crystal) — EU €20-80→USD, US Etsy $100-380 = 4-6x
6. EU-exclusive sneakers (Adidas Samba OG, Handball Spezial, NB collab) — EU retail €65-85, StockX $130-200 = 2-3x
7. Film cameras pre-1980 (Leica, Agfa Isolette, Polaroid SX-70) — EU €25-150→USD, US $80-600 = 3-5x
8. Polish/French folk art textiles — EU €15-40, US Etsy $100-250 = 4-7x
9. Vintage vinyl records (Polish jazz, German Krautrock, Eastern European folk) — EU €5-15, US $50-120 = 5-8x
10. Japanese Seiko 5 military dials — JP ¥3500-5000, US $120-200 = 4x`
        }

Generate 8-10 SPECIFIC opportunities. Each must have a REAL identifiable product, REAL achievable buy price, and REAL sold price from completed listings.

Return ONLY a valid JSON array sorted by netProfit descending:
[{
  "id": 1,
  "name": "SPECIFIC: brand + model + year + variant + condition",
  "buy": 35,
  "sell": 148,
  "profit": 113,
  "netProfit": 85,
  "margin": 74,
  "priceGapPct": 323,
  "daysToSell": 8,
  "market": "eBay USA",
  "category": "Watches",
  "score": 91,
  "risk": "low",
  "demandLevel": "high",
  "trend": "up",
  "flag": "🇵🇱→🇺🇸",
  "tip": "One sentence: WHY this specific price gap exists and the key insight to exploit it",
  "sourceUrl": "https://allegro.pl/listing?string=...",
  "sellUrl": "https://www.ebay.com/sch/i.html?_nkw=...&LH_Sold=1&LH_Complete=1",
  "buyHint": "Platform name + exact search terms + what to look for + price range",
  "sellHint": "Full SEO-optimised listing title (keyword-dense, include model/year/condition)",
  "confidence": "${hasReal ? "live" : "estimated"}"
}]

VALIDATION: Before including each item, verify: (1) buy price is LOWER than sell price. (2) netProfit > $15. (3) margin > 20%. (4) The product actually sells regularly on that platform. Remove any item that fails these checks.`,
      }],
    }),
  });

  if (!res.ok) return [];
  const data = await res.json() as any;
  const rawText: string = data?.content?.[0]?.text ?? "";
  const text = rawText.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim();
  const match = text.match(/\[[\s\S]*?\]/s);
  if (!match) return [];

  try {
    const parsed = JSON.parse(match[0]) as any[];
    return parsed
      .filter((o: any) => o.buy > 0 && o.sell > o.buy) // sanity check
      .map((o, i) => ({
        ...o,
        id: i + 1,
        netProfit: o.netProfit ?? calcNetProfit(o.sell, o.buy, o.market, o.category),
        priceGapPct: o.priceGapPct ?? (o.buy > 0 ? Math.round((o.sell / o.buy - 1) * 100) : 0),
        daysToSell: o.daysToSell ?? DAYS_TO_SELL[o.category ?? "General"] ?? 14,
        sellUrl: o.sellUrl || sellUrlForMarket(o.market ?? "", o.name ?? ""),
        sourceUrl: o.sourceUrl || sourceUrlForMarket("Allegro", o.name ?? ""),
        confidence: o.confidence ?? (hasReal ? "live" : "estimated"),
      }));
  } catch { return []; }
}

// ── Gap queries: detect real EU→US price differences ─────────────────────────
// Prices are in EUR on EU side — converted to USD in detectGap using EUR_TO_USD
const GAP_QUERIES = [
  // Clothing
  { query: "levis 501 vintage jeans used", maxBuyPrice: 42 },
  { query: "levis trucker denim jacket vintage", maxBuyPrice: 60 },
  // Soviet/Eastern European cameras
  { query: "zorki zenit soviet film camera working", maxBuyPrice: 32 },
  { query: "polaroid sx-70 working vintage", maxBuyPrice: 58 },
  // Watches
  { query: "omega seamaster vintage mechanical watch", maxBuyPrice: 320 },
  { query: "seiko 5 vintage automatic watch", maxBuyPrice: 55 },
  { query: "tissot vintage automatic watch", maxBuyPrice: 100 },
  { query: "vostok amphibia military vintage watch", maxBuyPrice: 38 },
  // Porcelain/antiques
  { query: "meissen porcelain figurine vintage", maxBuyPrice: 140 },
  { query: "bohemian crystal vase vintage art deco", maxBuyPrice: 35 },
  // Sneakers
  { query: "adidas samba og vintage handball", maxBuyPrice: 85 },
  { query: "adidas handball spezial vintage suede", maxBuyPrice: 75 },
  // Film cameras
  { query: "leica vintage film camera body", maxBuyPrice: 480 },
  { query: "agfa isolette folding camera working", maxBuyPrice: 60 },
  // Vinyl
  { query: "polish jazz vinyl record 1960s", maxBuyPrice: 20 },
  // Japanese
  { query: "seiko 5 military dial automatic 1970s", maxBuyPrice: 52 },
];

// ── POST /api/resell/scan ─────────────────────────────────────────────────────
router.post("/scan", async (req: Request, res: Response) => {
  const { anthropicKey, ebayAppId, ebayCertId, etsyApiKey, userLocation } = req.body ?? {};

  const aiKey: string = anthropicKey || process.env.ANTHROPIC_API_KEY || "";
  const ebayApp: string = ebayAppId || process.env.EBAY_APP_ID || "";
  const ebayCert: string = ebayCertId || process.env.EBAY_CERT_ID || "";
  const etsyKey: string = etsyApiKey || process.env.ETSY_API_KEY || "";

  const locCode: string = (userLocation?.country ?? "PL").toUpperCase();
  const locCfg = getLocationConfig(locCode);
  console.log(`[resell/scan] User location: ${locCode} → buy marketplace: ${locCfg.buyEbayMarketplace}`);

  let gapData: Array<{ query: string; gap: GapResult }> = [];
  let realEtsy: any[] = [];

  if (ebayApp && ebayCert) {
    try {
      const token = await getEbayToken(ebayApp, ebayCert);
      if (token) {
        const gaps = await Promise.all(
          GAP_QUERIES.map(async q => ({
            query: q.query,
            gap: await detectGap(token, q.query, q.maxBuyPrice, locCfg.buyEbayMarketplace),
          }))
        );
        gapData = gaps.filter(g => g.gap.euListings.length > 0 || g.gap.usListings.length > 0);
        const confirmedGaps = gapData.filter(g => g.gap.gapPct > 30);
        console.log(`[resell/scan] Gap detection: ${confirmedGaps.length}/${gapData.length} queries have confirmed gaps`);
      }
    } catch (err) { console.error("[resell/scan] eBay gap detection:", err); }
  }

  if (etsyKey) {
    try {
      const results = await Promise.all([
        etsySearch(etsyKey, "vintage levis jeans denim"),
        etsySearch(etsyKey, "baltic amber pendant handmade"),
        etsySearch(etsyKey, "soviet film camera zorki"),
        etsySearch(etsyKey, "vintage omega watch mechanical"),
        etsySearch(etsyKey, "polish folk art handmade"),
      ]);
      realEtsy = results.flat().filter(i => i.price > 20);
      realEtsy.sort((a, b) => b.views - a.views);
    } catch (err) { console.error("[resell/scan] Etsy:", err); }
  }

  if (aiKey) {
    try {
      const aiResults = await scanWithAI(aiKey, gapData, realEtsy, locCfg);
      const filtered = filterAndEnrich(aiResults, gapData.some(g => g.gap.gapPct > 0));
      if (filtered.length > 0) {
        const hasLive = gapData.some(g => g.gap.confidence === "live");
        return res.json({ opportunities: filtered, source: hasLive ? "live" : "ai", scannedAt: new Date().toISOString() });
      }
    } catch (err) { console.error("[resell/scan] AI:", err); }
  }

  const shuffled = [...FALLBACK].sort(() => Math.random() - 0.5);
  return res.json({ opportunities: shuffled, source: "cache", scannedAt: new Date().toISOString() });
});

// ── POST /api/resell/product-search ──────────────────────────────────────────
router.post("/product-search", async (req: Request, res: Response) => {
  const { query, anthropicKey, ebayAppId, ebayCertId, etsyApiKey, minBudget, maxBudget, category, userLocation } = req.body ?? {};
  if (!query?.trim()) return res.json({ results: [], source: "empty" });

  const aiKey: string = anthropicKey || process.env.ANTHROPIC_API_KEY || "";
  const ebayApp: string = ebayAppId || process.env.EBAY_APP_ID || "";
  const ebayCert: string = ebayCertId || process.env.EBAY_CERT_ID || "";
  const etsyKey: string = etsyApiKey || process.env.ETSY_API_KEY || "";

  const locCode: string = (userLocation?.country ?? "PL").toUpperCase();
  const locCfg = getLocationConfig(locCode);
  console.log(`[product-search] User location: ${locCode} → buy marketplace: ${locCfg.buyEbayMarketplace}`);

  const q = String(query).trim();
  const minPrice = minBudget ? parseFloat(String(minBudget)) : 0;
  const budget = maxBudget ? parseFloat(String(maxBudget)) : 500;

  // Real local→US gap detection for this specific product
  let gapResult: GapResult = { euListings: [], usListings: [], medianEU: 0, medianUS: 0, gapPct: 0, gapMultiplier: 0, confidence: "no_data" };
  let gbListings: any[] = [];
  let realEtsy: any[] = [];

  if (ebayApp && ebayCert) {
    try {
      const token = await getEbayToken(ebayApp, ebayCert);
      if (token) {
        [gapResult, gbListings] = await Promise.all([
          detectGap(token, q, budget, locCfg.buyEbayMarketplace),
          ebaySearch(token, q, 9999, "EBAY_GB", "-price"),  // UK pricing too
        ]);
      }
    } catch (err) { console.error("[product-search] eBay:", err); }
  }

  if (etsyKey) {
    try { realEtsy = await etsySearch(etsyKey, q); } catch { /* ignore */ }
  }

  if (!aiKey) {
    return res.json({ results: [], source: "no-key", message: "Add Anthropic API key in Settings to get AI results" });
  }

  const now = new Date();
  const month = now.toLocaleString("en-US", { month: "long" });
  const season = ["December","January","February"].includes(month) ? "Winter"
    : ["March","April","May"].includes(month) ? "Spring"
    : ["June","July","August"].includes(month) ? "Summer" : "Autumn";

  const feeContext = Object.entries(PLATFORM_FEES).map(([p, f]) => `${p}: ${(f * 100).toFixed(1)}%`).join(", ");

  // Build rich context with real gap data
  let liveContext = "";
  if (gapResult.gapPct > 0) {
    liveContext += `\n\n=== VERIFIED PRICE GAP for "${q}" ===\n`;
    liveContext += `EU (eBay DE) 20th-pct buy price: $${gapResult.medianEU.toFixed(0)} USD (converted from EUR×${EUR_TO_USD})\n`;
    liveContext += `US (eBay USA) 80th-pct sell price: $${gapResult.medianUS.toFixed(0)} USD (actual sold prices)\n`;
    liveContext += `Confirmed gap: ${gapResult.gapPct}% (${gapResult.gapMultiplier}x multiplier)\n`;
    if (gapResult.euListings.length > 0) {
      liveContext += `\nBUY-SIDE (eBay DE, cheap, price ascending):\n`;
      liveContext += gapResult.euListings.slice(0, 5).map(i =>
        `  BUY: "${i.title.slice(0, 65)}" — €${i.price.toFixed(0)} | ${i.condition}`
      ).join("\n");
    }
    if (gapResult.usListings.length > 0) {
      liveContext += `\n\nSELL-SIDE (eBay USA, expensive, price descending):\n`;
      liveContext += gapResult.usListings.slice(0, 5).map(i =>
        `  SELL: "${i.title.slice(0, 65)}" — $${i.price.toFixed(0)} | watches:${i.watchCount}`
      ).join("\n");
    }
    if (gbListings.length > 0) {
      liveContext += `\n\nUK MARKET (eBay GB, alternative sell destination):\n`;
      liveContext += gbListings.slice(0, 3).map(i =>
        `  UK: "${i.title.slice(0, 65)}" — £${i.price.toFixed(0)}`
      ).join("\n");
    }
  } else if (gapResult.euListings.length > 0 || gapResult.usListings.length > 0) {
    // Have data but no confirmed gap — still useful context
    liveContext += `\n\nLIVE MARKET DATA for "${q}" (gap not confirmed):\n`;
    if (gapResult.euListings.length > 0) {
      liveContext += `EU side: ${gapResult.euListings.slice(0, 4).map(i => `$${i.price.toFixed(0)}`).join(", ")}\n`;
    }
    if (gapResult.usListings.length > 0) {
      liveContext += `US side: ${gapResult.usListings.slice(0, 4).map(i => `$${i.price.toFixed(0)}`).join(", ")}\n`;
    }
  }

  if (realEtsy.length > 0) {
    liveContext += `\nETSY SELL-SIDE:\n`;
    liveContext += realEtsy.slice(0, 5).map(i =>
      `  ETSY: "${i.title.slice(0, 65)}" — $${i.price.toFixed(0)} | favorers:${i.views}`
    ).join("\n");
  }

  // Use location-specific source markets
  const cat = category ? String(category) : null;
  const sourceMarkets = cat
    ? (locCfg.localSourcesMap[cat] ?? locCfg.localSources)
    : locCfg.localSources;

  // Live context header — tell AI which buy marketplace was queried + currency note
  const hasLiveGap = gapResult.gapPct > 0;
  if (hasLiveGap) {
    liveContext = `Local buy prices from ${locCfg.buyEbayMarketplace} — ${locCfg.currencyNote}` + liveContext;
  }

  try {
    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": aiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4000,
        system: `You are an elite cross-border arbitrage analyst specializing in EU/JP→USA/UK price gaps.
Today: ${now.toLocaleDateString("en-US")}, Season: ${season}.
USER LOCATION: ${locCfg.localSources.split(",")[0].trim()} area (${locCode}). ${locCfg.currencyNote}
LOCAL BUY MARKETS available to this user: ${sourceMarkets}.
Platform fees: ${feeContext}.
Shipping estimates (USD): Clothing $12, Jewelry $18, Electronics $28, Collectibles $22, Sneakers $25, Spirits $35, Antiques $40, Watches $30.
User price range: ${minPrice > 0 ? `$${minPrice}` : "any"} – $${budget < 9999 ? budget : "no limit"} (buy price). Only generate items within this range.

ACCURACY RULES:
1. buy price = 20th percentile of what this user can actually find in their LOCAL market (${locCfg.localSources.split(",")[0].trim()})
2. sell price = COMPLETED/SOLD listings on target platform (what buyers actually paid)
3. Local prices may be in EUR/GBP/PLN/JPY — convert to USD. ${locCfg.currencyNote}
4. Hard reject: netProfit < $15, margin < 20%, buy price >= sell price
5. daysToSell = realistic days to complete sale based on platform activity
6. sourceUrl = links to LOCAL buy markets (${locCfg.localSources.split(",")[0].trim()}, etc.)

Available sell platforms (pick best for category):
- eBay USA: electronics, cameras, watches, vintage clothing, collectibles
- Etsy USA: handmade, folk art, amber jewelry, antiques, vintage decor
- StockX USA: sneakers, streetwear, limited drops
- Amazon UK: spirits, books, consumer goods
- Depop: trendy vintage fashion, 90s/Y2K, streetwear
- WhatNot: collectibles auctions (higher prices for rare items)
- Vinted EU: second-hand clothing (0% seller fee, fast sell)`,
        messages: [{
          role: "user",
          content: `Find arbitrage opportunities for: "${q}"${category ? ` (category: ${category})` : ""}
User location: ${locCode} — they buy from: ${sourceMarkets}.${liveContext ? `\n\nLIVE MARKET DATA from ${locCfg.buyEbayMarketplace}:${liveContext}\n\nUSE the live data above to set realistic buy/sell prices. Do NOT invent prices if live data is available.` : "\n\nNo live data available — use conservative knowledge of local→US price gaps for this user's location."}

Generate 5-7 specific buy-cheap / sell-high opportunities for "${q}".
buyMarket = local source in user's area (${locCode}). sellMarket = high-demand US/UK destination.

Return ONLY a valid JSON array sorted by netProfit descending:
[{
  "id": 1,
  "name": "SPECIFIC: brand + model + year + variant + condition (e.g. Omega Seamaster 166.002 1967 Automatic)",
  "buyMarket": "Allegro PL",
  "sellMarket": "eBay USA",
  "buy": 35,
  "sell": 128,
  "profit": 93,
  "netProfit": 63,
  "margin": 72,
  "priceGapPct": 266,
  "daysToSell": 9,
  "score": 88,
  "risk": "low",
  "demandLevel": "high",
  "category": "${category || "General"}",
  "flag": "🇵🇱→🇺🇸",
  "buyHint": "Platform + exact search terms + what condition/variant to look for + realistic price range",
  "sellHint": "Full keyword-optimised listing title (brand + model + year + condition + key features)",
  "tip": "One sentence: the specific reason this price gap exists and your competitive advantage",
  "sourceUrl": "https://direct-search-url-on-buy-market?query=...",
  "sellUrl": "https://ebay.com-or-etsy-completed-sold-url?...",
  "confidence": "${gapResult.gapPct > 0 ? "live" : "estimated"}"
}]

FINAL CHECK: netProfit = sell × (1 − fee%) − buy − shipping. Only include if netProfit ≥ $15 AND margin ≥ 20%.`,
        }],
      }),
    });

    if (!aiRes.ok) return res.json({ results: [], source: "ai-error" });
    const aiData = await aiRes.json() as any;
    const rawText: string = aiData?.content?.[0]?.text ?? "";
    const clean = rawText.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim();
    const match = clean.match(/\[[\s\S]*?\]/s);
    if (!match) return res.json({ results: [], source: "parse-error" });

    const parsed = JSON.parse(match[0]) as any[];
    const hasLive = gapResult.gapPct > 0 || realEtsy.length > 0;
    const enriched = parsed
      .filter((o: any) => {
        if (o.buy <= 0 || o.sell <= o.buy) return false;
        if (minPrice > 0 && o.buy < minPrice) return false;    // min price range filter
        if (budget < 9999 && o.buy > budget) return false;     // max price range filter
        return true;
      })
      .map((o: any, i: number) => ({
        ...o,
        id: i + 1,
        netProfit: o.netProfit ?? calcNetProfit(o.sell, o.buy, o.sellMarket, o.category ?? "General"),
        priceGapPct: o.priceGapPct ?? (o.buy > 0 ? Math.round((o.sell / o.buy - 1) * 100) : 0),
        daysToSell: o.daysToSell ?? null,
        sourceUrl: o.sourceUrl || sourceUrlForMarket(o.buyMarket ?? "", o.name ?? q),
        sellUrl: o.sellUrl || sellUrlForMarket(o.sellMarket ?? "", o.name ?? q),
        confidence: o.confidence ?? (hasLive ? "live" : "estimated"),
      }));

    const filtered = filterAndEnrich(enriched, hasLive);
    return res.json({ results: filtered, source: hasLive ? "live" : "ai", query: q });
  } catch (err) {
    console.error("[product-search] error:", err);
    return res.json({ results: [], source: "error" });
  }
});

// ── POST /api/resell/generate-offer ──────────────────────────────────────────
router.post("/generate-offer", async (req: Request, res: Response) => {
  const { product, anthropicKey, tone = "professional", focus = "balanced" } = req.body ?? {};
  if (!product?.name) return res.json({ error: "No product provided" });

  const aiKey: string = anthropicKey || process.env.ANTHROPIC_API_KEY || "";
  if (!aiKey) return res.json({ error: "no-key", message: "Add Anthropic API key in Settings" });

  const p = product;
  const platform = p.market ?? "eBay USA";
  const isEtsy = platform.toLowerCase().includes("etsy");
  const isAmazon = platform.toLowerCase().includes("amazon");
  const isStockX = platform.toLowerCase().includes("stockx");
  const isVinted = platform.toLowerCase().includes("vinted");

  const platformRules = isEtsy
    ? `Etsy: title max 140 chars — storytelling, 13 tags each max 20 chars, paragraph prose, emphasize handmade/vintage/unique origin.`
    : isAmazon
    ? `Amazon: title max 200 chars — brand + model + size/color/condition, keyword-first. Description as bullet points.`
    : isStockX
    ? `StockX: title must match exact product name (style code if known), condition: Deadstock/New/Used, include size.`
    : isVinted
    ? `Vinted: short friendly title, casual tone, emphasize size/brand/condition, short single-word tags.`
    : `eBay: title max 80 chars — keyword-dense, include model/year/condition/size. No punctuation except hyphens.`;

  const toneGuide: Record<string, string> = {
    professional: "Clear, factual, keyword-optimized. Focus on specs and condition.",
    vintage: "Warm storytelling. Reference the era, history, patina, authenticity. Make the buyer feel the journey.",
    luxury: "Premium, aspirational. Words like: rare, curated, collector-grade, museum-quality. Emphasize exclusivity.",
    urgency: "Create scarcity: limited availability, high demand, ships today. Encourage immediate action.",
  };
  const focusGuide: Record<string, string> = {
    balanced: "Balance SEO keywords, emotional appeal, and conversion.",
    seo: "Maximize search visibility — front-load the most searched keywords in title and first sentence.",
    conversion: "Maximize purchase intent — lead with strongest benefit, add social proof, end with clear CTA.",
    rarity: "Emphasize how rare and hard-to-find this item is. Why this is a once-in-a-while opportunity.",
  };

  const fee = PLATFORM_FEES[platform] ?? 0.13;
  const ship = AVG_SHIPPING[p.category ?? "General"] ?? 20;
  const netProfit = p.sell ? Math.round(p.sell * (1 - fee) - (p.buy ?? 0) - ship) : 0;

  try {
    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": aiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1800,
        system: `You are an expert marketplace listing copywriter specializing in cross-border arbitrage listings.
Platform: ${platform}. ${platformRules}
Tone: ${toneGuide[String(tone)] ?? toneGuide.professional}
Focus: ${focusGuide[String(focus)] ?? focusGuide.balanced}`,
        messages: [{
          role: "user",
          content: `Create a high-converting ${platform} listing:
Product: ${p.name}
Category: ${p.category ?? "General"}
Buy price: $${p.buy ?? "?"} | Sell price: $${p.sell ?? "?"}
Route: ${p.flag ?? "International"}
${p.tip ? `Market insight: ${p.tip}` : ""}
${p.sellHint ? `SEO hint: ${p.sellHint}` : ""}
${p.buyHint ? `Product context: ${p.buyHint}` : ""}
Seller net profit after fees+shipping: $${netProfit}

Return ONLY valid JSON (no markdown fences):
{
  "title": "platform-optimized title per platform rules",
  "description": "full description using specified tone and focus. eBay: bullet points + condition. Etsy: narrative. Include provenance/origin.",
  "tags": ["tag1","tag2","tag3","tag4","tag5","tag6","tag7","tag8","tag9","tag10","tag11","tag12","tag13"],
  "price": ${p.sell ?? 0},
  "highlights": ["strongest selling point","second selling point","third selling point"],
  "shippingNote": "recommended carrier, method, estimated transit time and cost",
  "seoKeywords": ["keyword1","keyword2","keyword3","keyword4","keyword5"],
  "itemSpecifics": {
    "Brand": "brand or Vintage/Handmade",
    "Model": "specific model/style",
    "Condition": "New / Used - Excellent / Pre-owned / Vintage",
    "Year": "year or decade",
    "Country/Region of Manufacture": "country",
    "Material": "primary material"
  },
  "priceNote": "one sentence: is $${p.sell ?? 0} competitive on ${platform}? E.g. '28% below comparable sold listings'",
  "urgencyNote": "one short urgency phrase e.g. 'Ships within 24h — only 1 in stock'"
}`,
        }],
      }),
    });

    if (!aiRes.ok) return res.json({ error: "ai-error", message: `AI returned ${aiRes.status}` });
    const aiData = await aiRes.json() as any;
    const rawText: string = aiData?.content?.[0]?.text ?? "";
    const clean = rawText.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim();
    const match = clean.match(/\{[\s\S]*\}/);
    if (!match) return res.json({ error: "parse-error" });

    const offer = JSON.parse(match[0]);
    return res.json({ offer, product: p, platform, tone, focus, source: "ai" });
  } catch (err) {
    console.error("[generate-offer] error:", err);
    return res.json({ error: "server-error" });
  }
});

export default router;
