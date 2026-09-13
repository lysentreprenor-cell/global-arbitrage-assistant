/**
 * 🤖 GADACZ NA TELEGRAMIE — piszesz do Gadacza z DOWOLNEGO telefonu/komputera
 * przez zwykły czat Telegram, a odpowiada ten sam „mózg" (serwer + chmura) co
 * apka: te same persony, ta sama pamięć, ta sama nauka. Idealne, gdy nie masz
 * pod ręką apki albo chcesz pisać do Gadacza jak do znajomego.
 *
 * Włącza się TYLKO gdy ustawiony jest sekret TELEGRAM_BOT_TOKEN (od @BotFather).
 * Bez tokenu bot po prostu śpi — reszta serwera działa normalnie.
 *
 * Bezpieczeństwo: obcy nie może używać Twojego klucza Anthropic. Nowy czat musi
 * najpierw podać PIN aplikacji (ten sam 0905). Dopiero autoryzowany czat rozmawia.
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";

const STATE_FILE = path.resolve(process.cwd(), "data", "gadacz_telegram.json");
const PIN_FILE = path.resolve(process.cwd(), "data", "pin.json");

type ChatState = { pin: string; history: { role: string; content: string }[] };
type Persisted = { offset: number; authorized: Record<string, { pin: string }> };

// Pamięć rozmów w RAM (historia), autoryzacja trzymana też na dysku (przetrwa restart).
const chats = new Map<string, ChatState>();

function pinHash(pin: string): string {
  return crypto.createHash("sha256").update("bot-pin-v1:" + pin).digest("hex");
}
function loadPinHash(): string | null {
  try { return JSON.parse(fs.readFileSync(PIN_FILE, "utf8")).hash ?? null; } catch { return null; }
}
function pinMatches(given: string): boolean {
  const stored = loadPinHash();
  if (!stored) return true; // brak skonfigurowanego PIN-u — otwarte (jak reszta apki)
  try {
    const a = Buffer.from(pinHash(given), "hex");
    const b = Buffer.from(stored, "hex");
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch { return false; }
}

function loadState(): Persisted {
  try {
    const d = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    return { offset: Number(d.offset) || 0, authorized: (d.authorized && typeof d.authorized === "object") ? d.authorized : {} };
  } catch { return { offset: 0, authorized: {} }; }
}
function saveState(s: Persisted) {
  try { fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true }); fs.writeFileSync(STATE_FILE, JSON.stringify(s)); } catch {}
}

async function tg(token: string, method: string, body: any): Promise<any> {
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  return r.json();
}

async function sendMessage(token: string, chatId: string | number, text: string) {
  // Telegram tnie wiadomości > 4096 znaków — dzielimy na kawałki.
  const chunks = text.match(/[\s\S]{1,3900}/g) ?? [text];
  for (const c of chunks) {
    try { await tg(token, "sendMessage", { chat_id: chatId, text: c }); } catch {}
  }
}

// Zapytaj mózg Gadacza tym samym endpointem co apka (localhost, z PIN-em w nagłówku).
async function askBrain(port: number, pin: string, question: string, history: { role: string; content: string }[]): Promise<{ say: string; status: number }> {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/assistant/ask`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-bot-pin": pin },
      body: JSON.stringify({
        question,
        history,
        clientTime: new Date().toLocaleString("pl-PL"),
      }),
      signal: AbortSignal.timeout(130_000),
    });
    const d = await r.json().catch(() => ({} as any));
    if (r.status === 401) return { say: "", status: 401 };
    if (d.error) return { say: "Błąd serwera: " + d.error, status: r.status };
    return { say: String(d.say ?? "").trim() || "(brak odpowiedzi)", status: r.status };
  } catch (e: any) {
    return { say: "Nie mogę teraz odpowiedzieć (błąd połączenia z mózgiem): " + (e?.message ?? ""), status: 500 };
  }
}

async function handleUpdate(token: string, port: number, upd: any, state: Persisted) {
  const msg = upd.message ?? upd.edited_message;
  if (!msg || !msg.chat) return;
  const chatId = String(msg.chat.id);
  const text = String(msg.text ?? "").trim();
  if (!text) { await sendMessage(token, chatId, "Napisz do mnie tekstem — słucham."); return; }

  const authed = state.authorized[chatId];

  // /start i /help — powitanie.
  if (/^\/(start|help)\b/i.test(text)) {
    if (authed) await sendMessage(token, chatId, "Cześć! Tu Gadacz. Pisz, o co chcesz zapytać — odpowiada ten sam mózg co w apce (te same twarze i pamięć).");
    else await sendMessage(token, chatId, "Cześć! Tu Gadacz. Zanim zaczniemy — podaj PIN aplikacji (napisz same cyfry), żeby potwierdzić, że to Ty.");
    return;
  }

  // Nieautoryzowany czat: pierwsza wiadomość to próba PIN-u.
  if (!authed) {
    const candidate = text.replace(/\D/g, "");
    if (candidate.length >= 3 && pinMatches(candidate)) {
      state.authorized[chatId] = { pin: candidate };
      saveState(state);
      chats.set(chatId, { pin: candidate, history: [] });
      await sendMessage(token, chatId, "PIN poprawny ✅ Możemy rozmawiać. Napisz, o co chcesz zapytać.");
    } else {
      await sendMessage(token, chatId, "Aby korzystać z Gadacza, podaj najpierw PIN aplikacji (same cyfry).");
    }
    return;
  }

  // Autoryzowany — do mózgu.
  let st = chats.get(chatId);
  if (!st) { st = { pin: authed.pin, history: [] }; chats.set(chatId, st); }

  await tg(token, "sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => {});
  const { say, status } = await askBrain(port, st.pin, text, st.history);
  if (status === 401) {
    // PIN zmieniony na serwerze — wyloguj czat, poproś o nowy.
    delete state.authorized[chatId]; saveState(state); chats.delete(chatId);
    await sendMessage(token, chatId, "PIN aplikacji się zmienił. Podaj nowy PIN (same cyfry), żeby dalej rozmawiać.");
    return;
  }
  st.history.push({ role: "user", content: text });
  st.history.push({ role: "assistant", content: say });
  if (st.history.length > 24) st.history.splice(0, st.history.length - 24);
  await sendMessage(token, chatId, say);
}

/**
 * Uruchom bota (długie odpytywanie Telegrama). Nie rzuca — błędy tylko loguje,
 * żeby nigdy nie wywrócić serwera.
 */
export function startTelegramBot(port: number) {
  const token = (process.env.TELEGRAM_BOT_TOKEN ?? "").trim();
  if (!token) {
    console.log("[telegram] TELEGRAM_BOT_TOKEN nie ustawiony — bot Telegram wyłączony (to normalne).");
    return;
  }
  const state = loadState();
  for (const [id, v] of Object.entries(state.authorized)) chats.set(id, { pin: v.pin, history: [] });
  console.log("[telegram] Bot Telegram włączony — nasłuchuję wiadomości.");

  let running = true;
  const loop = async () => {
    while (running) {
      try {
        const data = await tg(token, "getUpdates", { offset: state.offset, timeout: 50, allowed_updates: ["message", "edited_message"] });
        if (data && data.ok && Array.isArray(data.result)) {
          for (const upd of data.result) {
            state.offset = Math.max(state.offset, (Number(upd.update_id) || 0) + 1);
            try { await handleUpdate(token, port, upd, state); } catch (e) { console.error("[telegram] błąd obsługi:", e); }
          }
          if (data.result.length) saveState(state);
        } else if (data && data.ok === false) {
          console.error("[telegram] API:", data.description);
          await new Promise(r => setTimeout(r, 5000)); // np. zły token — nie zalewaj
        }
      } catch (e: any) {
        // timeout długiego pollingu jest normalny — krótka pauza i dalej
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  };
  loop();
}
