// Serverless mobile build: runs the ResellAssist API routes inside the app.
// Every fetch()/EventSource to /api/* is answered by the same handlers the
// Express server uses (server/routes/*), with "express" aliased to expressShim.
import "./polyfills";
import { Router, LocalResponse, type LocalRequest, type LocalRouter } from "./expressShim";
import resellScanRouter from "../../../server/routes/resellScan";
import marketScanRouter from "../../../server/routes/marketScan";
import dropshipRouter from "../../../server/routes/dropship";
import compareRouter from "../../../server/routes/compare";
import settingsRouter from "../../../server/routes/settings";
import autopilotRouter from "../../../server/routes/autopilot";
import notificationsRouter from "../../../server/routes/notifications";

const FX_CURRENCIES = ["NOK", "EUR", "GBP", "CHF", "PLN", "SEK", "DKK", "CAD", "AUD", "JPY"];
const FX_FALLBACK: Record<string, number> = {
  USD: 1, NOK: 10.74, EUR: 0.923, GBP: 0.793, CHF: 0.894, PLN: 4.06,
  SEK: 10.52, DKK: 6.89, CAD: 1.36, AUD: 1.55, JPY: 149.5,
};
let fxCache: { rates: Record<string, number>; source: string; fetchedAt: string; expires: number } | null = null;

const misc = Router();
misc.get("/version", (_req, res) => res.json({ version: "mobile-local" }));
misc.get("/me/access", (_req, res) => res.json({ isAdmin: false, permissions: {} }));
misc.get("/exchange-rates", async (req, res) => {
  const now = Date.now();
  if (!fxCache || fxCache.expires < now) {
    try {
      const r = await nativeFetch(`https://api.frankfurter.app/latest?from=USD&to=${FX_CURRENCIES.join(",")}`);
      const j = await r.json();
      fxCache = {
        rates: { ...FX_FALLBACK, ...j.rates, USD: 1 },
        source: `frankfurter.app (ECB · ${j.date})`,
        fetchedAt: new Date().toISOString(),
        expires: now + 60 * 60 * 1000,
      };
    } catch {
      fxCache = { rates: FX_FALLBACK, source: "fallback", fetchedAt: new Date().toISOString(), expires: now + 5 * 60 * 1000 };
    }
  }
  const base = String(req.query.base || "USD").toUpperCase();
  const div = fxCache.rates[base];
  if (!div) return res.status(400).json({ message: "Invalid base currency" });
  const rates: Record<string, number> = {};
  for (const [k, v] of Object.entries(fxCache.rates)) rates[k] = +(v / div).toFixed(6);
  res.json({ base, rates, source: fxCache.source, fetchedAt: fxCache.fetchedAt, stale: false });
});

const mounts: [string, LocalRouter][] = [
  ["/api/resell", resellScanRouter as unknown as LocalRouter],
  ["/api/market", marketScanRouter as unknown as LocalRouter],
  ["/api/dropship", dropshipRouter as unknown as LocalRouter],
  ["/api/compare", compareRouter as unknown as LocalRouter],
  ["/api/settings", settingsRouter as unknown as LocalRouter],
  ["/api/autopilot", autopilotRouter as unknown as LocalRouter],
  ["/api/notifications", notificationsRouter as unknown as LocalRouter],
  ["/api", misc],
];

const nativeFetch: typeof fetch = window.fetch.bind(window);

function localUrl(input: string): URL | null {
  const url = new URL(input, window.location.href);
  const sameHost = url.hostname === window.location.hostname || url.hostname === "localhost";
  return sameHost && url.pathname.startsWith("/api/") ? url : null;
}

function dispatch(method: string, url: URL, body: any, headers: Record<string, string>, res: LocalResponse) {
  const closeHandlers: (() => void)[] = [];
  for (const [prefix, router] of mounts) {
    if (url.pathname !== prefix && !url.pathname.startsWith(prefix + "/")) continue;
    const sub = url.pathname.slice(prefix.length) || "/";
    const hit = router.match(method, sub);
    if (!hit) continue;
    const req: LocalRequest = {
      method,
      path: sub,
      url: sub + url.search,
      body,
      params: hit.params,
      query: Object.fromEntries(url.searchParams),
      headers,
      on: (event, cb) => { if (event === "close") closeHandlers.push(cb); },
    };
    Promise.resolve()
      .then(() => hit.route.handler(req, res))
      .catch((err: any) => {
        console.error("[localApi]", method, url.pathname, err);
        if (!res.headersSent) res.status(500).json({ error: err?.message || "Internal error" });
      });
    return () => closeHandlers.forEach(cb => cb());
  }
  res.status(404).json({ error: "Ta funkcja nie jest dostępna w wersji offline aplikacji." });
  return () => {};
}

function headersToObject(h?: HeadersInit): Record<string, string> {
  const out: Record<string, string> = {};
  new Headers(h || {}).forEach((v, k) => (out[k] = v));
  return out;
}

async function readBody(input: RequestInfo | URL, init?: RequestInit): Promise<any> {
  let raw: unknown = init?.body;
  if (raw == null && input instanceof Request) raw = await input.clone().text();
  if (raw == null || raw === "") return {};
  if (typeof raw !== "string") return raw;
  try { return JSON.parse(raw); } catch { return raw; }
}

window.fetch = async function localFetch(input: RequestInfo | URL, init?: RequestInit) {
  const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const url = localUrl(href);
  if (!url) return nativeFetch(input as RequestInfo, init);

  const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
  const headers = headersToObject(init?.headers || (input instanceof Request ? input.headers : undefined));
  const body = await readBody(input, init);
  const res = new LocalResponse();
  dispatch(method, url, body, headers, res);
  await res.done;
  return new Response(res.statusCode === 204 ? null : res.body, {
    status: res.statusCode,
    headers: res.headers,
  });
} as typeof fetch;

// EventSource replacement for the local SSE endpoint (/api/notifications/stream).
const NativeEventSource = window.EventSource;
class LocalEventSource extends EventTarget {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  readyState = 0;
  url: string;
  withCredentials = false;
  onopen: ((e: Event) => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  private stop: () => void = () => {};

  constructor(href: string | URL) {
    super();
    const url = localUrl(String(href))!;
    this.url = url.href;
    const res = new LocalResponse();
    let buffer = "";
    res.onWrite = chunk => {
      buffer += chunk;
      let idx;
      while ((idx = buffer.indexOf("\n\n")) >= 0) {
        const block = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const data = block.split("\n").filter(l => l.startsWith("data:")).map(l => l.slice(5).trimStart()).join("\n");
        if (data) this.emit(new MessageEvent("message", { data }));
      }
    };
    queueMicrotask(() => {
      this.readyState = 1;
      this.emit(new Event("open"));
      this.stop = dispatch("GET", url, {}, {}, res);
    });
  }

  private emit(e: Event) {
    this.dispatchEvent(e);
    const handler = (this as any)["on" + e.type];
    if (typeof handler === "function") handler.call(this, e);
  }

  close() {
    if (this.readyState === 2) return;
    this.readyState = 2;
    this.stop();
  }
}

window.EventSource = function (href: string | URL, init?: EventSourceInit) {
  if (localUrl(String(href))) return new LocalEventSource(href);
  return new NativeEventSource(href, init);
} as unknown as typeof EventSource;
