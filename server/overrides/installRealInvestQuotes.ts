import type { Express, Request, Response } from "express";
import { fetchInvestQuotes } from "../lib/coingeckoInvestQuotes";

export function installRealInvestQuotes(app: Express) {
  app.get("/api/invest/quotes", async (req: Request, res: Response) => {
    try {
      const rawSymbols =
        typeof req.query.symbols === "string"
          ? req.query.symbols
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined;

      const payload = await fetchInvestQuotes(rawSymbols);

      return res.json({
        ok: true,
        source: payload.source,
        live: payload.live,
        updatedAt: payload.updatedAt,
        quotes: payload.quotes,
      });
    } catch (error: any) {
      return res.status(502).json({
        ok: false,
        error: error?.message || "Live quotes fetch failed.",
      });
    }
  });
}
