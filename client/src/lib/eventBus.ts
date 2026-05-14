/**
 * Lightweight typed event bus for cross-module communication.
 * Emit and subscribe to named events anywhere in the app without prop-drilling or tight coupling.
 *
 * Usage:
 *   eventBus.on("user:loggedIn", ({ userId }) => { ... });
 *   eventBus.emit("user:loggedIn", { userId: "abc" });
 *   eventBus.off("user:loggedIn", handler);
 */

// ─── Event map (add new events here as the app grows) ─────────────────────────

export type AppEventMap = {
  "user:loggedIn":       { userId: string };
  "user:loggedOut":      Record<string, never>;
  "user:profileUpdated": { userId: string };

  "wallet:deposited":  { currency: string; amount: number };
  "wallet:exchanged":  { from: string; to: string; amount: number; received: number };

  "tx:created":        { id: string; type: string; amount: number };
  "tx:failed":         { error: string };

  "notification:new":  { id: string; title: string; type: string };
  "notification:read": { id: string };

  "support:ticketCreated": { ticketId: string; title: string };
  "support:messageSent":   { ticketId: string };

  "theme:changed": { theme: string };
  "lang:changed":  { lang: string };
};

export type AppEventName = keyof AppEventMap;
export type AppEventPayload<E extends AppEventName> = AppEventMap[E];

// ─── Handler type ─────────────────────────────────────────────────────────────

type Handler<E extends AppEventName> = (payload: AppEventPayload<E>) => void;

// ─── Internal registry ────────────────────────────────────────────────────────

const registry = new Map<string, Set<Function>>();

// ─── Public API ───────────────────────────────────────────────────────────────

function on<E extends AppEventName>(event: E, handler: Handler<E>): () => void {
  if (!registry.has(event)) {
    registry.set(event, new Set());
  }
  registry.get(event)!.add(handler);
  return () => off(event, handler);
}

function off<E extends AppEventName>(event: E, handler: Handler<E>): void {
  registry.get(event)?.delete(handler);
}

function emit<E extends AppEventName>(event: E, payload: AppEventPayload<E>): void {
  registry.get(event)?.forEach((handler) => {
    try {
      (handler as Handler<E>)(payload);
    } catch (err) {
      console.error(`[eventBus] Error in handler for "${event}":`, err);
    }
  });
}

function once<E extends AppEventName>(event: E, handler: Handler<E>): () => void {
  const wrapper = (payload: AppEventPayload<E>) => {
    off(event, wrapper as Handler<E>);
    handler(payload);
  };
  return on(event, wrapper as Handler<E>);
}

function clear(event?: AppEventName): void {
  if (event) {
    registry.delete(event);
  } else {
    registry.clear();
  }
}

export const eventBus = { on, off, emit, once, clear };
export default eventBus;
