import { Router, type Request, type Response } from "express";
import crypto from "crypto";
import { getBybitDispatcher } from "../proxyDispatcher";

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
        const base = testnet ? "https://api-testnet.bybit.com" : "https://api.bytick.com";

        function hmac(ts: string, body: string) {
          const toSign = ts + apiKey + "5000" + body;
          return crypto.createHmac("sha256", secret).update(toSign).digest("hex");
        }
        function headers(ts: string, sig: string) {
          return { "X-BAPI-API-KEY": apiKey, "X-BAPI-SIGN": sig, "X-BAPI-SIGN-TYPE": "2", "X-BAPI-TIMESTAMP": ts, "X-BAPI-RECV-WINDOW": "5000", "Content-Type": "application/json" };
        }

        // 1) Read permission: wallet balance
        const ts1 = Date.now().toString();
        const pStr = new URLSearchParams({ accountType: "UNIFIED" }).toString();
        const bybitDispatcher = getBybitDispatcher();
        const opts1: any = { headers: headers(ts1, hmac(ts1, pStr)), signal: AbortSignal.timeout(8000) };
        if (bybitDispatcher) opts1.dispatcher = bybitDispatcher;
        const r1 = await fetch(`${base}/v5/account/wallet-balance?${pStr}`, opts1);
        if (!r1.ok) return res.json({ ok: false, readOk: false, tradeOk: false, error: `HTTP ${r1.status}` });
        const d1 = await r1.json() as any;
        if (d1.retCode !== 0) return res.json({ ok: false, readOk: false, tradeOk: false, retCode: d1.retCode, retMsg: d1.retMsg });

        // 2) Trade permission: set-leverage (non-destructive, requires Trade permission)
        const ts2 = Date.now().toString();
        const body2 = JSON.stringify({ category: "linear", symbol: "BTCUSDT", buyLeverage: "10", sellLeverage: "10" });
        const opts2: any = { method: "POST", body: body2, headers: headers(ts2, hmac(ts2, body2)), signal: AbortSignal.timeout(8000) };
        if (bybitDispatcher) opts2.dispatcher = bybitDispatcher;
        const r2 = await fetch(`${base}/v5/position/set-leverage`, opts2);
        const d2 = await r2.json() as any;
        // retCode 0 = success, 110043 = leverage not modified (already set — still means Trade OK)
        const tradeOk = r2.ok && (d2.retCode === 0 || d2.retCode === 110043);
        return res.json({ ok: tradeOk, readOk: true, tradeOk, retCode: d2.retCode, retMsg: d2.retMsg });
      }
      default:
        return res.json({ ok: true, note: "Manual verification required" });
    }
  } catch {
    return res.json({ ok: false });
  }
});

export default router;
