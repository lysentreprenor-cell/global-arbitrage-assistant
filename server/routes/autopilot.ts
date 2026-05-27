import { Router, type Request, type Response } from "express";
import { emitNotification } from "./notifications";

const router = Router();

// ── Autopilot state ───────────────────────────────────────────────────────────
export interface AutopilotConfig {
  enabled: boolean;
  intervalMinutes: number;      // scan interval (5-120 min)
  minProfit: number;            // minimum net profit ($)
  minMargin: number;            // minimum margin (%)
  maxBuyPrice: number;          // max buy price ($)
  minBuyPrice: number;          // min buy price ($)
  categories: string[];         // empty = all
  riskLevels: string[];         // ["low"] or ["low","medium"] or all
  sellPlatform: string;         // default platform for auto-listings
  autoCreate: boolean;          // auto-create listings (not just scan)
  anthropicKey: string;
  userLocation: { country: string; label: string; currency: string; flag: string };
}

interface AutopilotLogEntry {
  ts: string;
  type: "scan" | "listing_created" | "error" | "info";
  message: string;
  data?: any;
}

let config: AutopilotConfig = {
  enabled: false,
  intervalMinutes: 30,
  minProfit: 30,
  minMargin: 25,
  maxBuyPrice: 300,
  minBuyPrice: 5,
  categories: [],
  riskLevels: ["low", "medium"],
  sellPlatform: "eBay USA",
  autoCreate: true,
  anthropicKey: "",
  userLocation: { country: "PL", label: "Poland", currency: "PLN", flag: "🇵🇱" },
};

const log: AutopilotLogEntry[] = [];
let timer: NodeJS.Timeout | null = null;
let isScanning = false;
let lastScanAt: string | null = null;
let totalCreated = 0;
let totalProfit = 0;

function addLog(type: AutopilotLogEntry["type"], message: string, data?: any) {
  log.unshift({ ts: new Date().toISOString(), type, message, data });
  if (log.length > 100) log.splice(100);
}

// ── Core autopilot scan loop ───────────────────────────────────────────────────
async function runScan() {
  if (isScanning) return;
  isScanning = true;
  lastScanAt = new Date().toISOString();
  addLog("scan", `Auto-scan started (looking for profit ≥ $${config.minProfit}, buy $${config.minBuyPrice}-$${config.maxBuyPrice})`);

  try {
    const baseUrl = `http://localhost:${process.env.PORT || 3000}`;

    // 1. Run scan to find opportunities
    const scanRes = await fetch(`${baseUrl}/api/resell/scan`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        anthropicKey: config.anthropicKey || process.env.ANTHROPIC_API_KEY,
        userLocation: config.userLocation,
      }),
    });

    if (!scanRes.ok) throw new Error(`Scan API returned ${scanRes.status}`);
    const scanData = await scanRes.json() as any;
    const opportunities: any[] = scanData.opportunities ?? [];

    addLog("info", `Scan complete: ${opportunities.length} opportunities found (source: ${scanData.source})`);

    // 2. Filter by criteria
    const filtered = opportunities.filter(o => {
      const np = o.netProfit ?? o.profit ?? 0;
      const buy = o.buy ?? 0;
      const margin = o.margin ?? 0;
      const risk = o.risk ?? "medium";
      const category = o.category ?? "General";

      if (np < config.minProfit) return false;
      if (margin < config.minMargin) return false;
      if (buy < config.minBuyPrice || buy > config.maxBuyPrice) return false;
      if (config.riskLevels.length && !config.riskLevels.includes(risk)) return false;
      if (config.categories.length && !config.categories.includes(category)) return false;
      return true;
    });

    addLog("info", `${filtered.length} opportunities match criteria`);

    if (filtered.length === 0) {
      emitNotification({
        type: "info",
        title: "Autopilot: No matches",
        body: `Scanned ${opportunities.length} opportunities, none met criteria (min profit $${config.minProfit}, buy $${config.minBuyPrice}-$${config.maxBuyPrice})`,
      });
      return;
    }

    if (!config.autoCreate) {
      // Just notify about found opportunities without creating listings
      emitNotification({
        type: "info",
        title: `Autopilot: ${filtered.length} opportunity${filtered.length > 1 ? "ies" : "y"} found`,
        body: filtered.slice(0, 3).map(o => `• ${o.name} — +$${o.netProfit ?? o.profit}`).join("\n"),
      });
      return;
    }

    // 3. Auto-create listings (max 5 per scan to avoid spam)
    const toCreate = filtered.slice(0, 5);
    let created = 0;

    for (const opp of toCreate) {
      try {
        const listRes = await fetch(`${baseUrl}/api/dropship/listings`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            productName: opp.name,
            sellPrice: opp.sell,
            sourcePriceUSD: opp.buy,
            platform: opp.market ?? config.sellPlatform,
            category: opp.category ?? "General",
            stockQuantity: 1,
            sourceUrl: opp.sourceUrl ?? "",
            buyHint: opp.buyHint ?? "",
            sellHint: opp.sellHint ?? "",
            sourceMarket: opp.buyMarket ?? "",
            description: opp.tip ?? "",
            anthropicKey: config.anthropicKey || process.env.ANTHROPIC_API_KEY,
          }),
        });

        if (listRes.ok) {
          const listData = await listRes.json() as any;
          created++;
          totalCreated++;
          totalProfit += opp.netProfit ?? opp.profit ?? 0;

          addLog("listing_created", `Created: "${opp.name}" — profit +$${opp.netProfit ?? opp.profit} on ${opp.market}`, { id: listData.listing?.id });

          emitNotification({
            type: "autopilot",
            title: `🤖 Listing Created: ${opp.name.slice(0, 50)}`,
            body: `Platform: ${opp.market ?? config.sellPlatform} · Buy: $${opp.buy} → Sell: $${opp.sell} · Net: +$${opp.netProfit ?? opp.profit}`,
            profit: opp.netProfit ?? opp.profit,
            productName: opp.name,
            listingId: listData.listing?.id,
          });

          // Small delay between creates
          await new Promise(r => setTimeout(r, 500));
        }
      } catch (err: any) {
        addLog("error", `Failed to create listing for "${opp.name}": ${err.message}`);
      }
    }

    addLog("info", `Autopilot run complete: ${created}/${toCreate.length} listings created`);

  } catch (err: any) {
    addLog("error", `Scan failed: ${err.message}`);
    emitNotification({
      type: "info",
      title: "Autopilot: Scan error",
      body: err.message,
    });
  } finally {
    isScanning = false;
  }
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/autopilot/status
router.get("/status", (_req: Request, res: Response) => {
  res.json({
    enabled: config.enabled,
    isScanning,
    lastScanAt,
    nextScanIn: timer ? config.intervalMinutes * 60 : null,
    config: { ...config, anthropicKey: config.anthropicKey ? "***" : "" },
    log: log.slice(0, 30),
    stats: { totalCreated, totalProfit: Math.round(totalProfit * 100) / 100 },
  });
});

// POST /api/autopilot/start
router.post("/start", async (req: Request, res: Response) => {
  const body = req.body ?? {};

  // Update config from request
  if (body.intervalMinutes) config.intervalMinutes = Math.max(5, Math.min(120, parseInt(body.intervalMinutes)));
  if (typeof body.minProfit === "number") config.minProfit = body.minProfit;
  if (typeof body.minMargin === "number") config.minMargin = body.minMargin;
  if (typeof body.maxBuyPrice === "number") config.maxBuyPrice = body.maxBuyPrice;
  if (typeof body.minBuyPrice === "number") config.minBuyPrice = body.minBuyPrice;
  if (Array.isArray(body.categories)) config.categories = body.categories;
  if (Array.isArray(body.riskLevels)) config.riskLevels = body.riskLevels;
  if (body.sellPlatform) config.sellPlatform = body.sellPlatform;
  if (typeof body.autoCreate === "boolean") config.autoCreate = body.autoCreate;
  if (body.anthropicKey) config.anthropicKey = body.anthropicKey;
  if (body.userLocation) config.userLocation = body.userLocation;

  const aiKey = config.anthropicKey || process.env.ANTHROPIC_API_KEY || "";
  if (!aiKey) {
    return res.status(400).json({ error: "Anthropic API key required for autopilot" });
  }

  config.enabled = true;

  // Stop existing timer
  if (timer) clearInterval(timer);

  // Run immediately + schedule
  runScan().catch(err => addLog("error", err.message));
  timer = setInterval(() => runScan().catch(err => addLog("error", err.message)), config.intervalMinutes * 60 * 1000);

  addLog("info", `Autopilot started — scanning every ${config.intervalMinutes} min, min profit $${config.minProfit}`);
  emitNotification({
    type: "info",
    title: "🤖 Autopilot Started",
    body: `Scanning every ${config.intervalMinutes} min · Min profit $${config.minProfit} · Buy $${config.minBuyPrice}-$${config.maxBuyPrice}`,
  });

  res.json({ ok: true, config: { ...config, anthropicKey: "***" } });
});

// POST /api/autopilot/stop
router.post("/stop", (_req: Request, res: Response) => {
  if (timer) { clearInterval(timer); timer = null; }
  config.enabled = false;
  addLog("info", "Autopilot stopped");
  emitNotification({ type: "info", title: "🤖 Autopilot Stopped", body: "Auto-scanning disabled" });
  res.json({ ok: true });
});

// POST /api/autopilot/scan-now
router.post("/scan-now", (_req: Request, res: Response) => {
  if (isScanning) return res.json({ ok: false, message: "Already scanning" });
  runScan().catch(err => addLog("error", err.message));
  res.json({ ok: true, message: "Scan started" });
});

// GET /api/autopilot/log
router.get("/log", (_req: Request, res: Response) => {
  res.json({ log });
});

export default router;
