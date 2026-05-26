import { Router, type Request, type Response } from "express";

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
      default:
        return res.json({ ok: true, note: "Manual verification required" });
    }
  } catch {
    return res.json({ ok: false });
  }
});

export default router;
