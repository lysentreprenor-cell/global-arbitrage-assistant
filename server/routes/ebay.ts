import { Router, type Request, type Response } from "express";

const router = Router();
const EBAY = "https://api.ebay.com";
const AUTH = "https://auth.ebay.com";

const CATEGORY: Record<string, string> = {
  Watches: "31387", Jewelry: "10968", Electronics: "293",
  Clothing: "11450", Sneakers: "15709", Antiques: "20081",
  Collectibles: "20081", Spirits: "3812", General: "99",
};

// GET /api/ebay/auth-url
router.get("/auth-url", (req: Request, res: Response) => {
  const clientId = (req.query.clientId as string) || "";
  const ruName   = (req.query.ruName   as string) || "";
  if (!clientId || !ruName) { res.status(400).json({ error: "clientId and ruName required" }); return; }

  const scope = [
    "https://api.ebay.com/oauth/api_scope",
    "https://api.ebay.com/oauth/api_scope/sell.inventory",
    "https://api.ebay.com/oauth/api_scope/sell.account",
    "https://api.ebay.com/oauth/api_scope/sell.fulfillment",
  ].join(" ");

  res.json({
    url: `${AUTH}/oauth2/authorize?client_id=${encodeURIComponent(clientId)}&response_type=code&redirect_uri=${encodeURIComponent(ruName)}&scope=${encodeURIComponent(scope)}&prompt=login`,
  });
});

// GET /api/ebay/callback — OAuth popup callback
router.get("/callback", (req: Request, res: Response) => {
  const { code, error } = req.query;
  const msg = error
    ? `{ type: 'EBAY_ERROR', error: ${JSON.stringify(String(error))} }`
    : `{ type: 'EBAY_CODE', code: ${JSON.stringify(String(code))} }`;
  res.setHeader("Content-Type", "text/html");
  res.send(`<!DOCTYPE html><html><body style="background:#001a0a;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
    <div style="text-align:center">
      <div style="font-size:32px;margin-bottom:12px">${error ? "❌" : "✅"}</div>
      <div style="font-size:16px;opacity:0.7">${error ? "Błąd autoryzacji" : "Autoryzacja udana — zamykam okno..."}</div>
    </div>
    <script>
      try { window.opener.postMessage(${msg}, '*'); } catch(e) {}
      setTimeout(() => window.close(), 1500);
    </script>
  </body></html>`);
});

// POST /api/ebay/exchange-token
router.post("/exchange-token", async (req: Request, res: Response) => {
  const { code, clientId, certId, ruName } = req.body;
  if (!code || !clientId || !certId || !ruName) {
    res.status(400).json({ error: "code, clientId, certId, ruName required" }); return;
  }
  try {
    const r = await fetch(`${EBAY}/identity/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${certId}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: ruName }),
    });
    const d = await r.json() as any;
    if (!r.ok) { res.status(400).json({ error: d.error_description || "Token exchange failed" }); return; }
    res.json({ accessToken: d.access_token, refreshToken: d.refresh_token, expiresIn: d.expires_in });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// POST /api/ebay/refresh-token
router.post("/refresh-token", async (req: Request, res: Response) => {
  const { refreshToken, clientId, certId } = req.body;
  if (!refreshToken || !clientId || !certId) { res.status(400).json({ error: "refreshToken, clientId, certId required" }); return; }
  try {
    const r = await fetch(`${EBAY}/identity/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${certId}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        scope: "https://api.ebay.com/oauth/api_scope/sell.inventory https://api.ebay.com/oauth/api_scope/sell.account",
      }),
    });
    const d = await r.json() as any;
    if (!r.ok) { res.status(400).json({ error: d.error_description || "Refresh failed" }); return; }
    res.json({ accessToken: d.access_token, expiresIn: d.expires_in });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Helper — get or auto-create eBay listing policies
async function ensurePolicies(token: string): Promise<{ fp: string; pp: string; rp: string } | { error: string }> {
  const h = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const mid = "EBAY_US";
  try {
    const [fpR, ppR, rpR] = await Promise.all([
      fetch(`${EBAY}/sell/account/v1/fulfillment_policy?marketplace_id=${mid}`, { headers: h }),
      fetch(`${EBAY}/sell/account/v1/payment_policy?marketplace_id=${mid}`,   { headers: h }),
      fetch(`${EBAY}/sell/account/v1/return_policy?marketplace_id=${mid}`,    { headers: h }),
    ]);
    const [fp, pp, rp] = await Promise.all([fpR.json(), ppR.json(), rpR.json()]) as any[];

    let fpId = fp.fulfillmentPolicies?.[0]?.fulfillmentPolicyId;
    let ppId = pp.paymentPolicies?.[0]?.paymentPolicyId;
    let rpId = rp.returnPolicies?.[0]?.returnPolicyId;

    if (!fpId) {
      const r = await fetch(`${EBAY}/sell/account/v1/fulfillment_policy`, {
        method: "POST", headers: h,
        body: JSON.stringify({
          name: "ARIA Shipping", marketplaceId: mid,
          categoryTypes: [{ name: "ALL_EXCLUDING_MOTORS_VEHICLES", default: true }],
          handlingTime: { value: 3, unit: "DAY" },
          shippingOptions: [{
            optionType: "DOMESTIC", costType: "FLAT_RATE",
            shippingServices: [{ shippingServiceCode: "USPSPriority", shippingCost: { value: "12.00", currency: "USD" }, sortOrder: 1, freeShipping: false, buyerResponsibleForShipping: false }],
          }],
          shipToLocations: { regionIncluded: [{ regionName: "United States", regionType: "COUNTRY" }] },
        }),
      });
      const d = await r.json() as any;
      fpId = d.fulfillmentPolicyId;
      if (!fpId) return { error: d.errors?.[0]?.message || "Could not create fulfillment policy" };
    }
    if (!ppId) {
      const r = await fetch(`${EBAY}/sell/account/v1/payment_policy`, {
        method: "POST", headers: h,
        body: JSON.stringify({
          name: "ARIA Payment", marketplaceId: mid,
          categoryTypes: [{ name: "ALL_EXCLUDING_MOTORS_VEHICLES", default: true }],
          paymentMethods: [{ paymentMethodType: "EBAY_MANAGED_PAYMENT" }],
          fullPaymentDueIn: { value: 2, unit: "DAY" },
        }),
      });
      const d = await r.json() as any;
      ppId = d.paymentPolicyId;
      if (!ppId) return { error: d.errors?.[0]?.message || "Could not create payment policy" };
    }
    if (!rpId) {
      const r = await fetch(`${EBAY}/sell/account/v1/return_policy`, {
        method: "POST", headers: h,
        body: JSON.stringify({
          name: "ARIA Returns", marketplaceId: mid,
          categoryTypes: [{ name: "ALL_EXCLUDING_MOTORS_VEHICLES", default: true }],
          returnsAccepted: true,
          returnPeriod: { value: 30, unit: "DAY" },
          returnMethod: "MONEY_BACK",
          returnShippingCostPayer: "BUYER",
        }),
      });
      const d = await r.json() as any;
      rpId = d.returnPolicyId;
      if (!rpId) return { error: d.errors?.[0]?.message || "Could not create return policy" };
    }

    return { fp: fpId, pp: ppId, rp: rpId };
  } catch (e: any) {
    return { error: e.message };
  }
}

// POST /api/ebay/list — create and publish eBay listing
router.post("/list", async (req: Request, res: Response) => {
  const { accessToken, title, description, price, category, condition = "USED_EXCELLENT" } = req.body;
  if (!accessToken || !title || !price) {
    res.status(400).json({ error: "accessToken, title, price required" }); return;
  }

  const h = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", "Content-Language": "en-US" };
  const sku = `ARIA-${Date.now()}`;
  const categoryId = CATEGORY[category] ?? "99";

  try {
    const policies = await ensurePolicies(accessToken);
    if ("error" in policies) {
      res.status(400).json({ error: `Brak polityk eBay: ${policies.error}. Aktywuj konto sprzedającego w My eBay → Seller Hub.` });
      return;
    }

    // Step 1: Create inventory item
    const itemRes = await fetch(`${EBAY}/sell/inventory/v1/inventory_item/${sku}`, {
      method: "PUT", headers: h,
      body: JSON.stringify({
        availability: { shipToLocationAvailability: { quantity: 1 } },
        condition,
        product: { title, description },
      }),
    });
    if (!itemRes.ok && itemRes.status !== 204) {
      const e = await itemRes.json() as any;
      res.status(400).json({ error: `Item creation failed: ${e.errors?.[0]?.message ?? itemRes.status}` }); return;
    }

    // Step 2: Create offer
    const offerRes = await fetch(`${EBAY}/sell/inventory/v1/offer`, {
      method: "POST", headers: h,
      body: JSON.stringify({
        sku, marketplaceId: "EBAY_US", format: "FIXED_PRICE",
        listingDescription: description,
        pricingSummary: { price: { value: String(Number(price).toFixed(2)), currency: "USD" } },
        categoryId,
        listingPolicies: {
          fulfillmentPolicyId: policies.fp,
          paymentPolicyId: policies.pp,
          returnPolicyId: policies.rp,
        },
      }),
    });
    const offerData = await offerRes.json() as any;
    if (!offerRes.ok) {
      res.status(400).json({ error: `Offer failed: ${offerData.errors?.[0]?.message ?? JSON.stringify(offerData)}` }); return;
    }

    // Step 3: Publish
    const pubRes = await fetch(`${EBAY}/sell/inventory/v1/offer/${offerData.offerId}/publish`, {
      method: "POST", headers: h,
    });
    const pubData = await pubRes.json() as any;
    if (!pubRes.ok) {
      res.status(400).json({ error: `Publish failed: ${pubData.errors?.[0]?.message ?? JSON.stringify(pubData)}` }); return;
    }

    res.json({
      success: true,
      listingId: pubData.listingId,
      listingUrl: `https://www.ebay.com/itm/${pubData.listingId}`,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
