export function getApiKeys(): Record<string, Record<string, string>> {
  try {
    const saved = localStorage.getItem("resell_api_keys");
    return saved ? JSON.parse(saved) : {};
  } catch { return {}; }
}

export function getAnthropicKey(): string {
  return getApiKeys().anthropic?.apiKey ?? "";
}

export function getEbayKeys(): { appId: string; certId: string } {
  const k = getApiKeys().ebay ?? {};
  return { appId: k.appId ?? "", certId: k.certId ?? "" };
}

export function getEtsyKey(): string {
  return getApiKeys().etsy?.apiKey ?? "";
}

export function getAllegroKeys(): { clientId: string; clientSecret: string } {
  const k = getApiKeys().allegro ?? {};
  return { clientId: k.clientId ?? "", clientSecret: k.clientSecret ?? "" };
}

export function hasAnyKey(): boolean {
  const k = getApiKeys();
  return !!(k.anthropic?.apiKey || k.ebay?.appId || k.etsy?.apiKey);
}

// ── User location ─────────────────────────────────────────────────────────────
const LOCATION_KEY = "resell_user_location";

export type UserLocation = {
  country: string;    // ISO 3166-1 alpha-2: "PL", "DE", "FR", "GB", "CZ", "US", "JP", ...
  label: string;      // Human-readable: "Poland 🇵🇱"
  currency: string;   // "EUR", "GBP", "PLN", "USD", "JPY"
  flag: string;
};

export const SUPPORTED_LOCATIONS: UserLocation[] = [
  { country: "PL", label: "Poland",       currency: "PLN", flag: "🇵🇱" },
  { country: "DE", label: "Germany",      currency: "EUR", flag: "🇩🇪" },
  { country: "FR", label: "France",       currency: "EUR", flag: "🇫🇷" },
  { country: "CZ", label: "Czech Rep.",   currency: "CZK", flag: "🇨🇿" },
  { country: "GB", label: "UK",           currency: "GBP", flag: "🇬🇧" },
  { country: "ES", label: "Spain",        currency: "EUR", flag: "🇪🇸" },
  { country: "IT", label: "Italy",        currency: "EUR", flag: "🇮🇹" },
  { country: "NL", label: "Netherlands",  currency: "EUR", flag: "🇳🇱" },
  { country: "JP", label: "Japan",        currency: "JPY", flag: "🇯🇵" },
  { country: "US", label: "USA",          currency: "USD", flag: "🇺🇸" },
];

export function getUserLocation(): UserLocation {
  try {
    const saved = localStorage.getItem(LOCATION_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as UserLocation;
      if (parsed.country) return parsed;
    }
  } catch { /* ignore */ }
  return SUPPORTED_LOCATIONS[0]; // Default: Poland
}

export function setUserLocation(loc: UserLocation): void {
  localStorage.setItem(LOCATION_KEY, JSON.stringify(loc));
}
