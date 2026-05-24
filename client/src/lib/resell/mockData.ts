import type { Product, Analysis, OfferDraft, ComplianceCheck, ExchangeRate, MarketPrice } from "./types";

export const MOCK_EXCHANGE_RATES: ExchangeRate[] = [
  { from: "USD", to: "PLN", rate: 3.92, updatedAt: "2026-05-24T08:00:00Z" },
  { from: "EUR", to: "PLN", rate: 4.27, updatedAt: "2026-05-24T08:00:00Z" },
  { from: "NOK", to: "PLN", rate: 0.37, updatedAt: "2026-05-24T08:00:00Z" },
  { from: "GBP", to: "PLN", rate: 5.01, updatedAt: "2026-05-24T08:00:00Z" },
  { from: "PLN", to: "USD", rate: 0.255, updatedAt: "2026-05-24T08:00:00Z" },
  { from: "PLN", to: "EUR", rate: 0.234, updatedAt: "2026-05-24T08:00:00Z" },
  { from: "PLN", to: "NOK", rate: 2.70, updatedAt: "2026-05-24T08:00:00Z" },
];

export const MOCK_PRODUCTS: Product[] = [
  {
    id: "prod-001",
    name: "Vintage Levi's 501 Jeans W32 L32",
    category: "Clothing & Apparel",
    buyCountry: "Poland",
    sellCountry: "USA",
    buyPrice: 45,
    buyCurrency: "PLN",
    condition: "good",
    quantity: 3,
    sourceUrl: "",
    images: [],
    description: "Classic denim jeans in great condition",
    brand: "Levi's",
    status: "profitable",
    score: 78,
    createdAt: "2026-05-20T10:30:00Z",
    analysisId: "anal-001",
  },
  {
    id: "prod-002",
    name: "Meissen Porcelain Figurine 18cm",
    category: "Collectibles & Art",
    buyCountry: "Poland",
    sellCountry: "USA",
    buyPrice: 280,
    buyCurrency: "PLN",
    condition: "like_new",
    quantity: 1,
    sourceUrl: "",
    images: [],
    description: "Authentic Meissen porcelain figurine",
    brand: "Meissen",
    status: "draft_ready",
    score: 91,
    createdAt: "2026-05-22T14:15:00Z",
    analysisId: "anal-002",
  },
  {
    id: "prod-003",
    name: "Nokia 3310 Original 2000",
    category: "Electronics",
    buyCountry: "Poland",
    sellCountry: "USA",
    buyPrice: 60,
    buyCurrency: "PLN",
    condition: "fair",
    quantity: 2,
    sourceUrl: "",
    images: [],
    description: "Original Nokia 3310 from year 2000",
    brand: "Nokia",
    status: "analyzing",
    score: 55,
    createdAt: "2026-05-23T09:00:00Z",
    analysisId: "anal-003",
  },
  {
    id: "prod-004",
    name: "Amber Necklace Handmade Baltic",
    category: "Jewelry",
    buyCountry: "Poland",
    sellCountry: "USA",
    buyPrice: 120,
    buyCurrency: "PLN",
    condition: "new",
    quantity: 5,
    sourceUrl: "",
    images: [],
    description: "Handcrafted Baltic amber necklace",
    brand: "",
    status: "profitable",
    score: 84,
    createdAt: "2026-05-21T16:45:00Z",
    analysisId: "anal-004",
  },
  {
    id: "prod-005",
    name: "Generic USB-C Hub 7-Port",
    category: "Electronics",
    buyCountry: "Poland",
    sellCountry: "USA",
    buyPrice: 89,
    buyCurrency: "PLN",
    condition: "new",
    quantity: 10,
    sourceUrl: "",
    images: [],
    status: "rejected",
    score: 28,
    createdAt: "2026-05-19T11:00:00Z",
    analysisId: "anal-005",
  },
];

export const MOCK_MARKET_PRICES: Record<string, MarketPrice[]> = {
  "prod-001": [
    { marketplace: "ebay", minPrice: 35, avgPrice: 68, maxPrice: 145, currency: "USD", popularity: "high", competition: "high", listingsCount: 4200 },
    { marketplace: "etsy", minPrice: 55, avgPrice: 89, maxPrice: 180, currency: "USD", popularity: "medium", competition: "medium", listingsCount: 890 },
  ],
  "prod-002": [
    { marketplace: "ebay", minPrice: 180, avgPrice: 320, maxPrice: 750, currency: "USD", popularity: "medium", competition: "low", listingsCount: 145 },
    { marketplace: "etsy", minPrice: 200, avgPrice: 380, maxPrice: 900, currency: "USD", popularity: "low", competition: "low", listingsCount: 62 },
  ],
  "prod-003": [
    { marketplace: "ebay", minPrice: 15, avgPrice: 28, maxPrice: 55, currency: "USD", popularity: "medium", competition: "high", listingsCount: 3100 },
  ],
  "prod-004": [
    { marketplace: "ebay", minPrice: 22, avgPrice: 48, maxPrice: 110, currency: "USD", popularity: "medium", competition: "medium", listingsCount: 2400 },
    { marketplace: "etsy", minPrice: 35, avgPrice: 72, maxPrice: 160, currency: "USD", popularity: "high", competition: "medium", listingsCount: 5800 },
    { marketplace: "amazon", minPrice: 28, avgPrice: 55, maxPrice: 120, currency: "USD", popularity: "medium", competition: "medium", listingsCount: 1200 },
  ],
  "prod-005": [
    { marketplace: "amazon", minPrice: 12, avgPrice: 18, maxPrice: 28, currency: "USD", popularity: "high", competition: "high", listingsCount: 18400 },
    { marketplace: "ebay", minPrice: 8, avgPrice: 14, maxPrice: 22, currency: "USD", popularity: "high", competition: "high", listingsCount: 9200 },
  ],
};

export const MOCK_ANALYSES: Analysis[] = [
  {
    id: "anal-001",
    productId: "prod-001",
    marketPrices: MOCK_MARKET_PRICES["prod-001"],
    profitabilityRating: "average",
    score: 78,
    aiSuggestion: "Vintage Levi's jeans have strong demand on eBay and Etsy. Focus on W32-W36 sizes which sell fastest. Authentic vintage pieces with original tag fetch premium prices. Consider listing on Depop for younger audience.",
    aiCategory: "Vintage Clothing",
    risks: ["High competition from other sellers", "Return rate ~12% on clothing", "Size inconsistencies may cause returns"],
    opportunities: ["Etsy vintage niche is growing", "Japanese buyers pay premium for authentic US denim", "Bundle sets fetch 40% more"],
    createdAt: "2026-05-20T10:35:00Z",
  },
  {
    id: "anal-002",
    productId: "prod-002",
    marketPrices: MOCK_MARKET_PRICES["prod-002"],
    profitabilityRating: "very_good",
    score: 91,
    aiSuggestion: "Meissen porcelain is highly collectible with dedicated buyers in the US. Low competition and high margins make this an excellent arbitrage opportunity. Authenticate and photograph from multiple angles.",
    aiCategory: "Antique Porcelain",
    risks: ["Fragile — shipping insurance required", "Authentication verification needed by buyers", "Customs may require certificate of origin"],
    opportunities: ["US auction houses pay 200-400% above EU retail", "Collector community is active and loyal", "Very low competition on eBay"],
    createdAt: "2026-05-22T14:20:00Z",
  },
  {
    id: "anal-003",
    productId: "prod-003",
    marketPrices: MOCK_MARKET_PRICES["prod-003"],
    profitabilityRating: "average",
    score: 55,
    aiSuggestion: "Original Nokia 3310 has nostalgic value but market is saturated. Margins are thin after shipping. Consider only if you have bulk supply at lower prices.",
    aiCategory: "Vintage Mobile Phones",
    risks: ["Saturated market", "Thin margins after $15-20 shipping", "Many counterfeits reduce trust"],
    opportunities: ["Nostalgia market still active", "Working condition units are rare"],
    createdAt: "2026-05-23T09:05:00Z",
  },
  {
    id: "anal-004",
    productId: "prod-004",
    marketPrices: MOCK_MARKET_PRICES["prod-004"],
    profitabilityRating: "very_good",
    score: 84,
    aiSuggestion: "Baltic amber jewelry has excellent margins on Etsy. Handcrafted items with natural materials are trending. Include certificate of authenticity for premium pricing.",
    aiCategory: "Handmade Jewelry",
    risks: ["Buyers may question authenticity", "Fragile packaging required", "Etsy algorithm favors established shops"],
    opportunities: ["Etsy is ideal marketplace for this product", "5x margin potential vs. buy price", "Niche but loyal buyer base"],
    createdAt: "2026-05-21T16:50:00Z",
  },
  {
    id: "anal-005",
    productId: "prod-005",
    marketPrices: MOCK_MARKET_PRICES["prod-005"],
    profitabilityRating: "unprofitable",
    score: 28,
    aiSuggestion: "Generic USB hubs are extremely oversaturated on Amazon. Chinese suppliers undercut at $8-12. This product is not viable for resale arbitrage.",
    aiCategory: "Computer Accessories",
    risks: ["Extreme price competition", "Amazon FBA sellers dominate", "No brand differentiation"],
    opportunities: [],
    createdAt: "2026-05-19T11:05:00Z",
  },
];

export const MOCK_OFFER_DRAFTS: OfferDraft[] = [
  {
    id: "draft-001",
    productId: "prod-002",
    titleEN: "Authentic Meissen Porcelain Figurine 18cm – Rare European Collectible",
    descriptionShortEN: "Rare authentic Meissen porcelain figurine in excellent condition. A premium collectible with rich European heritage, perfect for serious collectors.",
    descriptionLongEN: `Discover this exceptional piece of European craftsmanship — an authentic Meissen porcelain figurine standing 18cm tall. Meissen porcelain, produced in Germany since 1710, is among the world's most prestigious ceramics.

This figurine features the distinctive Meissen crossed-swords mark and displays remarkable detail in its hand-painted finish. The piece is in excellent condition with no chips, cracks, or restoration work.

Perfect for:
• Serious porcelain collectors
• Interior decoration in classical or contemporary settings
• Gifting for special occasions
• Investment in high-value collectibles

Condition: Excellent / Like New
Origin: Poland / Germany
Age: Vintage
Dimensions: 18cm height

Shipped with professional museum-grade packaging including bubble wrap, foam lining, and double-boxed for maximum protection. Full insurance included.`,
    suggestedPrice: 320,
    currency: "USD",
    suggestedCategory: "Pottery & Glass > Porcelain & China",
    parameters: {
      "Brand": "Meissen",
      "Material": "Porcelain",
      "Height": "18 cm",
      "Condition": "Excellent",
      "Country of Origin": "Germany",
      "Type": "Figurine",
    },
    warnings: ["Verify authenticity mark before listing", "Check eBay prohibited items for porcelain imports", "Include original photos — no stock images"],
    isApproved: false,
    createdAt: "2026-05-22T15:00:00Z",
  },
];

export const MOCK_COMPLIANCE: Record<string, ComplianceCheck> = {
  "prod-002": {
    id: "comp-001",
    productId: "prod-002",
    checks: {
      hasOwnPhotos: false,
      hasOwnDescription: true,
      isLegalInTarget: true,
      hasDutyCalculated: true,
      hasReturnsCalculated: false,
      noRestrictedBrand: true,
      hasPhysicalAccess: true,
    },
    isComplete: false,
    createdAt: "2026-05-22T15:00:00Z",
  },
};

export const CATEGORIES = [
  "Clothing & Apparel",
  "Electronics",
  "Collectibles & Art",
  "Jewelry",
  "Books & Media",
  "Sports & Outdoors",
  "Home & Garden",
  "Toys & Games",
  "Automotive",
  "Tools & Hardware",
  "Health & Beauty",
  "Food & Beverage",
  "Musical Instruments",
  "Vintage & Antiques",
  "Handmade Crafts",
  "Other",
];

export const COUNTRIES = [
  "Poland", "Germany", "France", "Italy", "Spain", "Netherlands",
  "Czech Republic", "Hungary", "Romania", "Sweden", "Norway",
  "USA", "UK", "Japan", "China", "Other",
];
