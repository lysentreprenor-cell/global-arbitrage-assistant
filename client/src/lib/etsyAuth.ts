const TOKEN_KEY = "etsy_oauth_token";

export type EtsyToken = {
  accessToken: string;
  refreshToken: string;
  expiry: number; // ms timestamp
  clientId: string;
};

export function loadEtsyToken(): EtsyToken | null {
  try { return JSON.parse(localStorage.getItem(TOKEN_KEY) || "null"); } catch { return null; }
}

export function saveEtsyToken(t: EtsyToken): void {
  localStorage.setItem(TOKEN_KEY, JSON.stringify(t));
}

export function clearEtsyToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function isEtsyConnected(): boolean {
  const t = loadEtsyToken();
  return !!t?.refreshToken;
}

export async function getValidEtsyToken(): Promise<{ accessToken: string; clientId: string } | null> {
  const t = loadEtsyToken();
  if (!t) return null;

  // Return existing token if still valid (5 min buffer)
  if (Date.now() < t.expiry - 5 * 60 * 1000) {
    return { accessToken: t.accessToken, clientId: t.clientId };
  }

  // Refresh — Etsy PKCE refresh requires only client_id (no client_secret)
  if (!t.refreshToken || !t.clientId) return null;
  try {
    const r = await fetch("/api/etsy/refresh-token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: t.refreshToken, clientId: t.clientId }),
    });
    if (!r.ok) { clearEtsyToken(); return null; }
    const d = await r.json() as { accessToken: string; expiresIn: number };
    const updated: EtsyToken = {
      ...t,
      accessToken: d.accessToken,
      expiry: Date.now() + d.expiresIn * 1000,
    };
    saveEtsyToken(updated);
    return { accessToken: updated.accessToken, clientId: updated.clientId };
  } catch { return null; }
}
