import { ProxyAgent } from "undici";
import fs from "fs";
import path from "path";

let _dispatcher: ProxyAgent | undefined;

export function getBybitDispatcher(): ProxyAgent | undefined {
  if (_dispatcher === undefined) {
    let proxyUrl = process.env.BYBIT_PROXY;
    if (!proxyUrl) {
      const f = path.resolve(process.cwd(), ".bybit_proxy");
      if (fs.existsSync(f)) proxyUrl = fs.readFileSync(f, "utf8").trim();
    }
    _dispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : undefined;
  }
  return _dispatcher;
}
