import { Router, type Request, type Response } from "express";
import crypto from "crypto";

const router = Router();
const ETSY_BASE = "https://api.etsy.com/v3";
const ETSY_AUTH = "https://www.etsy.com/oauth/connect";
const ETSY_TOKEN = "https://api.etsy.com/v3/public/oauth/token";

const TAXONOMY: Record<string, number> = {
  Watches: 2078, Jewelry: 164, Clothing: 1975, Sneakers: 1992,
  Electronics: 1229, Antiques: 4, Collectibles: 4, General: 6327,
};

// PKCE store: state → { verifier, expiry }
const pkceStore = new Map<string, { verifier: string; expiry: number }>();

// Clean up expired entries every minute
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of pkceStore) {
    if (v.expiry < now) pkceStore.delete(k);
  }
}, 60_000);

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function generatePKCE(): { verifier: string; challenge: string } {
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(
    crypto.createHash("sha256").update(verifier).digest()
  );
  return { verifier, challenge };
}

// GET /api/etsy/auth-url?clientId=&redirectUri=
router.get("/auth-url", (req: Request, res: Response) => {
  const clientId   = (req.query.clientId   as string) || "";
  const redirectUri = (req.query.redirectUri as string) || "";
  if (!clientId || !redirectUri) {
    res.status(400).json({ error: "clientId and redirectUri required" }); return;
  }

  const { verifier, challenge } = generatePKCE();
  const state = base64url(crypto.randomBytes(16));

  pkceStore.set(state, { verifier, expiry: Date.now() + 10 * 60 * 1000 });

  const scope = [
    "listings_w",
    "listings_r",
    "shops_r",
    "profile_r",
  ].join("%20");

  const url =
    `${ETSY_AUTH}?response_type=code` +
    `&client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${scope}` +
    `&state=${state}` +
    `&code_challenge=${challenge}` +
    `&code_challenge_method=S256`;

  res.json({ url, state });
});

// GET /api/etsy/callback — OAuth popup callback
router.get("/callback", (req: Request, res: Response) => {
  const { code, state, error } = req.query;
  const msg = error
    ? `{ type: 'ETSY_ERROR', error: ${JSON.stringify(String(error))} }`
    : `{ type: 'ETSY_CODE', code: ${JSON.stringify(String(code))}, state: ${JSON.stringify(String(state))} }`;

  res.setHeader("Content-Type", "text/html");
  res.send(`<!DOCTYPE html><html><body style="background:#001a0a;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
    <div style="text-align:center">
      <div style="font-size:32px;margin-bottom:12px">${error ? "❌" : "✅"}</div>
      <div style="font-size:16px;opacity:0.7">${error ? "Błąd autoryzacji Etsy" : "Autoryzacja udana — zamykam okno..."}</div>
    </div>
    <script>
      try { window.opener.postMessage(${msg}, '*'); } catch(e) {}
      setTimeout(() => window.close(), 1500);
    </script>
  </body></html>`);
});

// POST /api/etsy/exchange-token
router.post("/exchange-token", async (req: Request, res: Response) => {
  const { code, clientId, redirectUri, state } = req.body as {
    code?: string; clientId?: string; redirectUri?: string; state?: string;
  };
  if (!code || !clientId || !redirectUri || !state) {
    res.status(400).json({ error: "code, clientId, redirectUri, state required" }); return;
  }

  const entry = pkceStore.get(state);
  if (!entry || entry.expiry < Date.now()) {
    res.status(400).json({ error: "Invalid or expired state. Please restart OAuth." }); return;
  }
  const { verifier } = entry;
  pkceStore.delete(state);

  try {
    const r = await fetch(ETSY_TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        redirect_uri: redirectUri,
        code,
        code_verifier: verifier,
      }),
    });
    const d = await r.json() as Record<string, unknown>;
    if (!r.ok) {
      const errMsg = (d.error_description as string) || (d.error as string) || "Token exchange failed";
      res.status(400).json({ error: errMsg }); return;
    }
    res.json({
      accessToken: d.access_token,
      refreshToken: d.refresh_token,
      expiresIn: d.expires_in,
    });
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Unknown error" });
  }
});

// POST /api/etsy/refresh-token
router.post("/refresh-token", async (req: Request, res: Response) => {
  const { refreshToken, clientId } = req.body as { refreshToken?: string; clientId?: string };
  if (!refreshToken || !clientId) {
    res.status(400).json({ error: "refreshToken and clientId required" }); return;
  }

  try {
    const r = await fetch(ETSY_TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: clientId,
        refresh_token: refreshToken,
      }),
    });
    const d = await r.json() as Record<string, unknown>;
    if (!r.ok) {
      const errMsg = (d.error_description as string) || (d.error as string) || "Refresh failed";
      res.status(400).json({ error: errMsg }); return;
    }
    res.json({
      accessToken: d.access_token,
      expiresIn: d.expires_in,
    });
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Unknown error" });
  }
});

// POST /api/etsy/list — create listing on Etsy
router.post("/list", async (req: Request, res: Response) => {
  const { accessToken, clientId, title, description, price, category } = req.body as {
    accessToken?: string; clientId?: string; title?: string;
    description?: string; price?: number | string; category?: string;
  };

  if (!accessToken || !clientId || !title || price === undefined) {
    res.status(400).json({ error: "accessToken, clientId, title, price required" }); return;
  }

  const headers: Record<string, string> = {
    "x-api-key": clientId,
    "Authorization": `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  try {
    // Step 1: Get user/shop info
    const meRes = await fetch(`${ETSY_BASE}/application/users/me`, { headers });
    if (!meRes.ok) {
      const e = await meRes.json() as Record<string, unknown>;
      res.status(400).json({ error: `Failed to get user info: ${(e.error as string) ?? meRes.status}` }); return;
    }
    const meData = await meRes.json() as Record<string, unknown>;
    const shopId = (meData.shop_id as number | undefined) ?? ((meData.primary_email as unknown) as undefined);

    // Etsy returns shop_id on the user object if they have a shop
    const rawShopId = meData.shop_id as number | undefined;
    if (!rawShopId) {
      res.status(400).json({ error: "Brak sklepu Etsy. Utwórz sklep na etsy.com najpierw." }); return;
    }
    void shopId; // suppress unused-variable — rawShopId is used below

    // Step 2: Get shipping profiles
    const shipRes = await fetch(`${ETSY_BASE}/application/shops/${rawShopId}/shipping-profiles`, { headers });
    if (!shipRes.ok) {
      res.status(400).json({ error: "Brak profilu wysyłki. Utwórz go w ustawieniach sklepu Etsy." }); return;
    }
    const shipData = await shipRes.json() as { results?: Array<{ shipping_profile_id: number }> };
    const shippingProfileId = shipData.results?.[0]?.shipping_profile_id;
    if (!shippingProfileId) {
      res.status(400).json({ error: "Brak profilu wysyłki. Utwórz go w ustawieniach sklepu Etsy." }); return;
    }

    // Step 3: Get return policy (optional)
    let returnPolicyId: number | undefined;
    try {
      const retRes = await fetch(`${ETSY_BASE}/application/shops/${rawShopId}/policies/return`, { headers });
      if (retRes.ok) {
        const retData = await retRes.json() as { return_policy_id?: number };
        returnPolicyId = retData.return_policy_id;
      }
    } catch {
      // Return policy is optional — ignore errors
    }

    // Step 4: Create listing
    const taxonomyId = TAXONOMY[category ?? "General"] ?? TAXONOMY.General;
    const listingBody: Record<string, unknown> = {
      quantity: 1,
      title: title.slice(0, 140),
      description: description || title,
      price: parseFloat(Number(price).toFixed(2)),
      who_made: "someone_else",
      when_made: "2020_2024",
      taxonomy_id: taxonomyId,
      shipping_profile_id: shippingProfileId,
      type: "physical",
    };
    if (returnPolicyId) listingBody.return_policy_id = returnPolicyId;

    const listRes = await fetch(`${ETSY_BASE}/application/shops/${rawShopId}/listings`, {
      method: "POST",
      headers,
      body: JSON.stringify(listingBody),
    });
    const listData = await listRes.json() as Record<string, unknown>;
    if (!listRes.ok) {
      const errMsg = (listData.error as string)
        ?? ((listData.errors as Array<{ message: string }>)?.[0]?.message)
        ?? `Listing failed: ${listRes.status}`;
      res.status(400).json({ error: errMsg }); return;
    }

    const listingId = listData.listing_id as number;
    res.json({
      success: true,
      listingId,
      listingUrl: `https://www.etsy.com/listing/${listingId}`,
    });
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Unknown error" });
  }
});

export default router;
