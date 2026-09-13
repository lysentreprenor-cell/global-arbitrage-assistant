const TOKEN_KEY = "ebay_oauth_token";

export type EbayToken = {
  accessToken: string;
  refreshToken: string;
  expiry: number; // ms timestamp
};

export function loadEbayToken(): EbayToken | null {
  try { return JSON.parse(localStorage.getItem(TOKEN_KEY) || "null"); } catch { return null; }
}

export function saveEbayToken(t: EbayToken): void {
  localStorage.setItem(TOKEN_KEY, JSON.stringify(t));
}

export function clearEbayToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function isEbayConnected(): boolean {
  const t = loadEbayToken();
  return !!t?.refreshToken;
}

export async function getValidAccessToken(clientId: string, certId: string): Promise<string | null> {
  const t = loadEbayToken();
  if (!t) return null;

  // Return existing token if still valid (5 min buffer)
  if (Date.now() < t.expiry - 5 * 60 * 1000) return t.accessToken;

  // Refresh
  if (!t.refreshToken || !clientId || !certId) return null;
  try {
    const r = await fetch("/api/ebay/refresh-token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: t.refreshToken, clientId, certId }),
    });
    if (!r.ok) { clearEbayToken(); return null; }
    const d = await r.json() as any;
    const updated: EbayToken = { ...t, accessToken: d.accessToken, expiry: Date.now() + d.expiresIn * 1000 };
    saveEbayToken(updated);
    return updated.accessToken;
  } catch { return null; }
}
