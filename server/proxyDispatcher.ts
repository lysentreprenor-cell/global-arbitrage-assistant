import { ProxyAgent } from "undici";

let _dispatcher: ProxyAgent | undefined;

export function getBybitDispatcher(): ProxyAgent | undefined {
  if (_dispatcher === undefined) {
    const proxyUrl = process.env.BYBIT_PROXY;
    _dispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : undefined;
  }
  return _dispatcher;
}
