import { getAdminDb } from "./lib/firebaseAdmin";

export type CurrencyCode = "NOK" | "USD" | "EUR" | "GBP" | "CHF" | "PLN" | "SEK" | "DKK" | "CAD" | "AUD" | "JPY";

export interface RatesData {
  base: "USD";
  rates: Record<CurrencyCode, number>;
  source: string;
  fetchedAt: string;
  updatedAt: string;
}

const CURRENCIES: CurrencyCode[] = ["NOK", "USD", "EUR", "GBP", "CHF", "PLN", "SEK", "DKK", "CAD", "AUD", "JPY"];

const CACHE_TTL_MS = 60 * 60 * 1000;

let _cachedData: RatesData | null = null;
let _cacheExpiresAt = 0;

const FALLBACK_RATES_USD_BASE: Record<CurrencyCode, number> = {
  USD: 1.0000,
  NOK: 10.7400,
  EUR: 0.9230,
  GBP: 0.7930,
  CHF: 0.8940,
  PLN: 4.0600,
  SEK: 10.5200,
  DKK: 6.8900,
  CAD: 1.3600,
  AUD: 1.5500,
  JPY: 149.50,
};

async function fetchFromFrankfurter(): Promise<RatesData | null> {
  try {
    const others = CURRENCIES.filter(c => c !== "USD").join(",");
    const url = `https://api.frankfurter.app/latest?from=USD&to=${others}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) {
      console.warn(`[exchangeRates] Frankfurter returned ${res.status}`);
      return null;
    }
    const json = await res.json() as { base: string; date: string; rates: Record<string, number> };
    const rates: Record<CurrencyCode, number> = { USD: 1.0 } as Record<CurrencyCode, number>;
    for (const cur of CURRENCIES) {
      if (cur === "USD") continue;
      const v = json.rates[cur];
      if (typeof v === "number" && v > 0) {
        rates[cur] = parseFloat(v.toFixed(6));
      } else {
        rates[cur] = FALLBACK_RATES_USD_BASE[cur];
      }
    }
    const now = new Date().toISOString();
    return { base: "USD", rates, source: `frankfurter.app (ECB · ${json.date})`, fetchedAt: now, updatedAt: now };
  } catch (err) {
    console.warn("[exchangeRates] Frankfurter fetch error:", (err as Error).message);
    return null;
  }
}

async function saveToFirebase(data: RatesData): Promise<void> {
  try {
    const db = getAdminDb();
    if (!db) return;
    await db.ref("exchangeRates/USD").set(data);
  } catch (e) {
    console.warn("[exchangeRates] Firebase write failed:", (e as Error).message);
  }
}

async function loadFromFirebase(): Promise<RatesData | null> {
  try {
    const db = getAdminDb();
    if (!db) return null;
    const snap = await db.ref("exchangeRates/USD").get();
    if (!snap.exists()) return null;
    const val = snap.val() as RatesData;
    if (!val?.rates?.USD) return null;
    return val;
  } catch {
    return null;
  }
}

export async function getExchangeRates(): Promise<{ data: RatesData; stale?: boolean }> {
  const now = Date.now();

  if (_cachedData && _cacheExpiresAt > now) {
    return { data: _cachedData };
  }

  const fresh = await fetchFromFrankfurter();
  if (fresh) {
    _cachedData = fresh;
    _cacheExpiresAt = now + CACHE_TTL_MS;
    saveToFirebase(fresh).catch(() => {});
    return { data: fresh };
  }

  const fromFirebase = await loadFromFirebase();
  if (fromFirebase) {
    _cachedData = fromFirebase;
    _cacheExpiresAt = now + CACHE_TTL_MS;
    console.warn("[exchangeRates] Using Firebase fallback rates");
    return { data: fromFirebase, stale: true };
  }

  const fallback: RatesData = {
    base: "USD",
    rates: { ...FALLBACK_RATES_USD_BASE },
    source: "static-fallback",
    fetchedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  _cachedData = fallback;
  _cacheExpiresAt = now + 5 * 60 * 1000;
  console.warn("[exchangeRates] Using static fallback rates");
  return { data: fallback, stale: true };
}

export function convertRatesToBase(usdRates: Record<CurrencyCode, number>, base: CurrencyCode): Record<CurrencyCode, number> {
  const baseInUSD = usdRates[base];
  const result = {} as Record<CurrencyCode, number>;
  for (const cur of CURRENCIES) {
    result[cur] = parseFloat((usdRates[cur] / baseInUSD).toFixed(6));
  }
  return result;
}
