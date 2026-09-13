import fs from "fs";
import path from "path";

let _proxyUrl: string | undefined | null = null;
let _dispatcher: any | undefined;
let _undici: any | null | undefined; // undefined = not tried, null = unavailable

// Lazy-load undici only when a proxy is actually needed. undici may be absent
// from node_modules (Replit firewall blocks some installs); when there's no
// proxy we use Node's built-in global fetch and never touch undici, so the
// app boots fine without it.
function loadUndici(): any | null {
  if (_undici === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      _undici = require("undici");
    } catch {
      _undici = null;
      console.warn("[proxy] undici not available — proxy support disabled, using global fetch");
    }
  }
  return _undici;
}

function getProxyUrl(): string | undefined {
  if (_proxyUrl === null) {
    _proxyUrl = process.env.BYBIT_PROXY;
    if (!_proxyUrl) {
      const f = path.resolve(process.cwd(), ".bybit_proxy");
      if (fs.existsSync(f)) _proxyUrl = fs.readFileSync(f, "utf8").trim();
    }
    if (_proxyUrl) console.log("[proxy] Using Bybit proxy:", _proxyUrl.replace(/:([^:@]+)@/, ":***@"));
    else console.log("[proxy] No proxy configured — direct connection");
  }
  return _proxyUrl || undefined;
}

export function getBybitDispatcher(): any | undefined {
  const url = getProxyUrl();
  if (!url) return undefined;
  const undici = loadUndici();
  if (!undici) return undefined;
  if (!_dispatcher) _dispatcher = new undici.ProxyAgent(url);
  return _dispatcher;
}

export async function bybitFetch(fetchUrl: string, init: RequestInit & { dispatcher?: any }): Promise<Response> {
  const dispatcher = getBybitDispatcher();
  if (dispatcher) {
    const undici = loadUndici();
    const res = await undici.fetch(fetchUrl, { ...init, dispatcher } as any);
    return res as unknown as Response;
  }
  return fetch(fetchUrl, init);
}
