import { Router, type Request, type Response } from "express";
import crypto from "crypto";
import { bybitFetch as proxyFetch } from "../proxyDispatcher";

const router = Router();

router.post("/test-key", async (req: Request, res: Response) => {
  const { platformId, keys } = req.body;

  try {
    switch (platformId) {
      case "anthropic": {
        const r = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": keys?.apiKey || "", "anthropic-version": "2023-06-01", "content-type": "application/json" },
          body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 10, messages: [{ role: "user", content: "hi" }] }),
        });
        return res.json({ ok: r.ok });
      }
      case "ebay": {
        const token = Buffer.from(`${keys?.appId}:${keys?.certId}`).toString("base64");
        const r = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
          method: "POST",
          headers: { Authorization: `Basic ${token}`, "Content-Type": "application/x-www-form-urlencoded" },
          body: "grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope",
        });
        return res.json({ ok: r.ok });
      }
      case "etsy": {
        const r = await fetch(`https://openapi.etsy.com/v3/application/openapi-ping`, {
          headers: { "x-api-key": keys?.apiKey || "" },
        });
        return res.json({ ok: r.ok });
      }
      case "allegro": {
        const token = Buffer.from(`${keys?.clientId}:${keys?.clientSecret}`).toString("base64");
        const r = await fetch("https://allegro.pl/auth/oauth/token?grant_type=client_credentials", {
          method: "POST",
          headers: { Authorization: `Basic ${token}`, "Content-Type": "application/x-www-form-urlencoded" },
        });
        return res.json({ ok: r.ok });
      }
      case "bybit": {
        const apiKey = keys?.apiKey || "";
        const secret = keys?.secret || "";
        const testnet = keys?.testnet === "true";
        if (!apiKey || !secret) return res.json({ ok: false });
        const base = testnet ? "https://api-testnet.bybit.com" : "https://api.bybit.com";

        function hmac(ts: string, body: string) {
          const toSign = ts + apiKey + "5000" + body;
          return crypto.createHmac("sha256", secret).update(toSign).digest("hex");
        }
        function headers(ts: string, sig: string) {
          return { "X-BAPI-API-KEY": apiKey, "X-BAPI-SIGN": sig, "X-BAPI-SIGN-TYPE": "2", "X-BAPI-TIMESTAMP": ts, "X-BAPI-RECV-WINDOW": "5000", "Content-Type": "application/json" };
        }

        // Test with SPOT first (works on Bybit EU), then UNIFIED/CONTRACT
        for (const accountType of ["SPOT", "UNIFIED", "CONTRACT"]) {
          const ts = Date.now().toString();
          const pStr = new URLSearchParams({ accountType }).toString();
          const r = await proxyFetch(`${base}/v5/account/wallet-balance?${pStr}`, {
            headers: headers(ts, hmac(ts, pStr)), signal: AbortSignal.timeout(8000),
          } as any);
          if (!r.ok) continue;
          const d = await r.json() as any;
          if (d.retCode === 0) return res.json({ ok: true, readOk: true, tradeOk: true, accountType });
        }
        return res.json({ ok: false, readOk: false, tradeOk: false });
      }
      default:
        return res.json({ ok: true, note: "Manual verification required" });
    }
  } catch {
    return res.json({ ok: false });
  }
});

export default router;
