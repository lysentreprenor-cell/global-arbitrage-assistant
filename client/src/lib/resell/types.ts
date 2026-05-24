export type Currency = "PLN" | "USD" | "EUR" | "NOK" | "GBP";
export type ProductCondition = "new" | "like_new" | "good" | "fair" | "poor";
export type ProductStatus = "analyzing" | "profitable" | "rejected" | "draft_ready" | "sold";
export type ProfitabilityRating = "very_good" | "average" | "risky" | "unprofitable";
export type Marketplace = "ebay" | "amazon" | "etsy" | "shopify" | "manual";

export interface Product {
  id: string;
  name: string;
  category: string;
  buyCountry: string;
  sellCountry: string;
  buyPrice: number;
  buyCurrency: Currency;
  condition: ProductCondition;
  quantity: number;
  sourceUrl?: string;
  images: string[];
  description?: string;
  brand?: string;
  status: ProductStatus;
  score: number;
  createdAt: string;
  analysisId?: string;
}

export interface MarketPrice {
  marketplace: Marketplace;
  minPrice: number;
  avgPrice: number;
  maxPrice: number;
  currency: Currency;
  popularity: "low" | "medium" | "high";
  competition: "low" | "medium" | "high";
  listingsCount: number;
}

export interface Analysis {
  id: string;
  productId: string;
  marketPrices: MarketPrice[];
  profitabilityRating: ProfitabilityRating;
  score: number;
  aiSuggestion: string;
  aiCategory: string;
  risks: string[];
  opportunities: string[];
  createdAt: string;
}

export interface CostBreakdown {
  buyPrice: number;
  shippingCost: number;
  customsDuty: number;
  tax: number;
  marketplaceFee: number;
  returnRisk: number;
  damagRisk: number;
  platformFee: number;
  otherCosts: number;
  currency: Currency;
  exchangeRate: number;
  targetCurrency: Currency;
}

export interface ProfitResult {
  grossProfit: number;
  netProfit: number;
  marginPercent: number;
  inPLN: number;
  inUSD: number;
  inEUR: number;
  inNOK: number;
  targetSellPrice: number;
  isViable: boolean;
}

export interface OfferDraft {
  id: string;
  productId: string;
  titleEN: string;
  descriptionShortEN: string;
  descriptionLongEN: string;
  titlePL?: string;
  descriptionPL?: string;
  titleNO?: string;
  descriptionNO?: string;
  suggestedPrice: number;
  currency: Currency;
  suggestedCategory: string;
  parameters: Record<string, string>;
  warnings: string[];
  isApproved: boolean;
  createdAt: string;
}

export interface ComplianceCheck {
  id: string;
  productId: string;
  checks: {
    hasOwnPhotos: boolean;
    hasOwnDescription: boolean;
    isLegalInTarget: boolean;
    hasDutyCalculated: boolean;
    hasReturnsCalculated: boolean;
    noRestrictedBrand: boolean;
    hasPhysicalAccess: boolean;
  };
  isComplete: boolean;
  createdAt: string;
}

export interface ExchangeRate {
  from: Currency;
  to: Currency;
  rate: number;
  updatedAt: string;
}
