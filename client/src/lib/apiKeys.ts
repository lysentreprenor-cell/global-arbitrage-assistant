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
