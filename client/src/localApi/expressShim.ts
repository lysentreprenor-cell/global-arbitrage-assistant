// Minimal in-browser stand-in for the parts of Express used by server/routes/*.
// Lets the mobile (serverless) build run the same route handlers on the device.

type Handler = (req: LocalRequest, res: LocalResponse) => unknown;

interface Route {
  method: string;
  keys: string[];
  pattern: RegExp;
  handler: Handler;
}

export interface LocalRequest {
  method: string;
  path: string;
  url: string;
  body: any;
  params: Record<string, string>;
  query: Record<string, string>;
  headers: Record<string, string>;
  on: (event: string, cb: () => void) => void;
}

export class LocalResponse {
  statusCode = 200;
  headers: Record<string, string> = {};
  headersSent = false;
  private finished = false;
  private resolveDone!: () => void;
  readonly done = new Promise<void>(r => (this.resolveDone = r));
  body: string | null = null;
  onWrite: ((chunk: string) => void) | null = null;

  status(code: number) { this.statusCode = code; return this; }
  setHeader(name: string, value: string) { this.headers[name.toLowerCase()] = String(value); return this; }
  set(name: string, value: string) { return this.setHeader(name, value); }
  flushHeaders() { this.headersSent = true; }
  json(data: unknown) {
    this.setHeader("content-type", "application/json");
    return this.end(JSON.stringify(data ?? null));
  }
  send(data: unknown) {
    if (data !== null && typeof data === "object") return this.json(data);
    return this.end(data == null ? "" : String(data));
  }
  sendStatus(code: number) { this.statusCode = code; return this.end(""); }
  write(chunk: string) { this.headersSent = true; this.onWrite?.(String(chunk)); return true; }
  end(data?: string) {
    if (this.finished) return this;
    this.finished = true;
    this.headersSent = true;
    this.body = data ?? this.body ?? "";
    this.resolveDone();
    return this;
  }
}

class LocalRouter {
  routes: Route[] = [];

  private add(method: string, path: string, handler: Handler) {
    const keys: string[] = [];
    const src = path
      .replace(/\/+$/, "")
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/:(\w+)/g, (_m, k) => { keys.push(k); return "([^/]+)"; });
    this.routes.push({ method, keys, pattern: new RegExp(`^${src}/?$`), handler });
    return this;
  }

  get(path: string, h: Handler) { return this.add("GET", path, h); }
  post(path: string, h: Handler) { return this.add("POST", path, h); }
  put(path: string, h: Handler) { return this.add("PUT", path, h); }
  patch(path: string, h: Handler) { return this.add("PATCH", path, h); }
  delete(path: string, h: Handler) { return this.add("DELETE", path, h); }
  use() { return this; }

  match(method: string, path: string) {
    for (const r of this.routes) {
      if (r.method !== method) continue;
      const m = r.pattern.exec(path);
      if (!m) continue;
      const params: Record<string, string> = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      return { route: r, params };
    }
    return null;
  }
}

export function Router() {
  return new LocalRouter();
}

export type { LocalRouter };
export type Request = LocalRequest;
export type Response = LocalResponse;
export default { Router };
