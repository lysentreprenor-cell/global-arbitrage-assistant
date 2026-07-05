// PIN lock for the bot API. Once a PIN is set on the server, every /api/bot
// call must carry it in the x-bot-pin header — this module patches fetch so
// every existing call site gets the header for free. The PIN is kept in
// localStorage, so you type it once per device.

export const BOT_PIN_KEY = "bot_pin_v1";

export function getBotPin(): string {
  try { return localStorage.getItem(BOT_PIN_KEY) ?? ""; } catch { return ""; }
}

export function setBotPin(pin: string) {
  try { localStorage.setItem(BOT_PIN_KEY, pin); } catch { /* ignore */ }
}

export function installPinFetch() {
  const w = window as any;
  if (w.__botPinFetchInstalled) return;
  w.__botPinFetchInstalled = true;
  const raw = window.fetch.bind(window);
  window.fetch = ((input: any, init: any = {}) => {
    const url = typeof input === "string" ? input : (input?.url ?? "");
    if (typeof url === "string" && url.startsWith("/api/bot")) {
      init = { ...init, headers: { ...(init.headers || {}), "x-bot-pin": getBotPin() } };
    }
    return raw(input, init);
  }) as typeof window.fetch;
}
