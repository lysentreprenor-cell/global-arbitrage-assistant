import { ProxyAgent, fetch as undiciFetch } from "undici";
import fs from "fs";
import path from "path";

let _proxyUrl: string | undefined | null = null;
let _dispatcher: ProxyAgent | undefined;

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

export function getBybitDispatcher(): ProxyAgent | undefined {
  const url = getProxyUrl();
  if (url && !_dispatcher) _dispatcher = new ProxyAgent(url);
  return _dispatcher;
}

export async function bybitFetch(fetchUrl: string, init: RequestInit & { dispatcher?: ProxyAgent }): Promise<Response> {
  const dispatcher = getBybitDispatcher();
  if (dispatcher) {
    const res = await undiciFetch(fetchUrl, { ...init, dispatcher } as any);
    return res as unknown as Response;
  }
  return fetch(fetchUrl, init);
}
