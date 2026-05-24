import type { CostBreakdown, ProfitResult, Currency, MarketPrice } from "./types";
import { MOCK_EXCHANGE_RATES } from "./mockData";

export function getExchangeRate(from: Currency, to: Currency): number {
  if (from === to) return 1;
  const rate = MOCK_EXCHANGE_RATES.find(r => r.from === from && r.to === to);
  return rate?.rate ?? 1;
}

export function convertCurrency(amount: number, from: Currency, to: Currency): number {
  return amount * getExchangeRate(from, to);
}

export function calculateProfit(
  costs: CostBreakdown,
  sellPrice: number,
  sellCurrency: Currency
): ProfitResult {
  const totalCostsInBuyCurrency =
    costs.buyPrice +
    costs.shippingCost +
    costs.customsDuty +
    costs.tax +
    costs.marketplaceFee +
    costs.returnRisk +
    costs.damagRisk +
    costs.platformFee +
    costs.otherCosts;

  const sellPriceInBuyCurrency = convertCurrency(sellPrice, sellCurrency, costs.currency);
  const grossProfit = sellPriceInBuyCurrency - costs.buyPrice;
  const netProfit = sellPriceInBuyCurrency - totalCostsInBuyCurrency;
  const marginPercent = sellPriceInBuyCurrency > 0 ? (netProfit / sellPriceInBuyCurrency) * 100 : 0;

  const toUSD = convertCurrency(netProfit, costs.currency, "USD");
  const toPLN = convertCurrency(netProfit, costs.currency, "PLN");
  const toEUR = convertCurrency(netProfit, costs.currency, "EUR");
  const toNOK = convertCurrency(netProfit, costs.currency, "NOK");

  return {
    grossProfit,
    netProfit,
    marginPercent,
    inPLN: costs.currency === "PLN" ? netProfit : toPLN,
    inUSD: costs.currency === "USD" ? netProfit : toUSD,
    inEUR: costs.currency === "EUR" ? netProfit : toEUR,
    inNOK: costs.currency === "NOK" ? netProfit : toNOK,
    targetSellPrice: sellPrice,
    isViable: netProfit > 0 && marginPercent > 15,
  };
}

export function calculateScore(
  buyPricePLN: number,
  avgSellPriceUSD: number,
  shippingCost: number,
  competition: "low" | "medium" | "high",
  popularity: "low" | "medium" | "high",
  hasOwnContent: boolean
): number {
  const avgSellPLN = avgSellPriceUSD * 3.92;
  const totalCostPLN = buyPricePLN + shippingCost + buyPricePLN * 0.18;
  const margin = ((avgSellPLN - totalCostPLN) / avgSellPLN) * 100;

  let score = 0;

  // Margin score (0-40)
  if (margin > 50) score += 40;
  else if (margin > 35) score += 32;
  else if (margin > 20) score += 22;
  else if (margin > 10) score += 12;
  else if (margin > 0) score += 5;

  // Competition score (0-20)
  const compScore = { low: 20, medium: 12, high: 5 };
  score += compScore[competition];

  // Popularity score (0-20)
  const popScore = { high: 20, medium: 12, low: 6 };
  score += popScore[popularity];

  // Content compliance (0-10)
  if (hasOwnContent) score += 10;

  // Availability bonus (0-10)
  score += 10;

  return Math.min(100, Math.max(0, Math.round(score)));
}

export function getAverageSellPrice(marketPrices: MarketPrice[]): number {
  if (!marketPrices.length) return 0;
  const sum = marketPrices.reduce((acc, mp) => acc + mp.avgPrice, 0);
  return sum / marketPrices.length;
}

export function getProfitabilityLabel(score: number): {
  label: string;
  color: string;
  bgColor: string;
  rating: "very_good" | "average" | "risky" | "unprofitable";
} {
  if (score >= 81) return { label: "Bardzo dobra okazja", color: "#4ade80", bgColor: "rgba(74,222,128,0.12)", rating: "very_good" };
  if (score >= 66) return { label: "Dobra okazja", color: "#86efac", bgColor: "rgba(134,239,172,0.10)", rating: "average" };
  if (score >= 41) return { label: "Średnia okazja", color: "#fbbf24", bgColor: "rgba(251,191,36,0.12)", rating: "average" };
  if (score >= 20) return { label: "Ryzykowna okazja", color: "#f97316", bgColor: "rgba(249,115,22,0.12)", rating: "risky" };
  return { label: "Nieopłacalne", color: "#f87171", bgColor: "rgba(248,113,113,0.12)", rating: "unprofitable" };
}

export function formatCurrency(amount: number, currency: Currency): string {
  const symbols: Record<Currency, string> = {
    PLN: "zł", USD: "$", EUR: "€", NOK: "kr", GBP: "£",
  };
  const sym = symbols[currency];
  if (currency === "USD" || currency === "EUR" || currency === "GBP") {
    return `${sym}${amount.toFixed(2)}`;
  }
  return `${amount.toFixed(2)} ${sym}`;
}
