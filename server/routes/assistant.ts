/**
 * 🗣️ Gadacz — voice phone-control assistant for blind users (Etap 1: web).
 *
 * POST /api/assistant/ask
 *   { anthropicKey?, question, history?, imageBase64?, mediaType?, clientTime? }
 * → { say, action, args }
 *
 * The model ALWAYS answers with strict JSON: something to SAY (read aloud by TTS)
 * plus an optional phone ACTION the client executes (call / sms / maps / youtube /
 * search / open / save_contact). Full in-app screen control (clicking inside other
 * apps) needs the native Android AccessibilityService — that is Etap 2; here we
 * launch the system apps the web is allowed to: dialer, SMS, maps, browser.
 */
import { Router, type Request, type Response } from "express";

const router = Router();

const SYSTEM = `Jesteś "Gadacz" — głosowy asystent sterujący telefonem, zbudowany dla osób niewidomych i słabowidzących. Mówisz po polsku.

ZAWSZE odpowiadasz WYŁĄCZNIE poprawnym JSON, bez żadnego tekstu przed ani po, bez markdown:
{"say":"tekst do przeczytania na głos","action":"none","args":{}}

Dostępne akcje i ich args:
- "call":         {"who":"nazwa kontaktu albo numer"} — użytkownik chce zadzwonić
- "sms":          {"who":"nazwa kontaktu albo numer","text":"treść"} — ułóż naturalną, krótką treść SMS z polecenia
- "save_contact": {"name":"nazwa","number":"numer"} — użytkownik dyktuje kontakt do zapisania
- "maps":         {"query":"miejsce lub adres"} — nawigacja / pokaż na mapie / "jak dojść do..."
- "youtube":      {"query":"czego szukać"} — włącz / znajdź muzykę lub film na YouTube
- "search":       {"query":"zapytanie"} — wyszukaj w internecie
- "open":         {"url":"https://pełny.adres"} — otwórz konkretną stronę
- "none":         {} — zwykła rozmowa, pytanie, opis obrazu; całą odpowiedź daj w "say"

Zasady "say":
- Krótki, płynny język mówiony (będzie czytany syntezatorem) — bez emotikonów, gwiazdek, nagłówków.
- Przy akcji potwierdzaj krótko, np. "Dzwonię do mamy." albo "Włączam YouTube z disco polo."
- Numery telefonów wymawiaj cyframi z przerwami, np. "pięćset, sześćset, siedemset".
- Przy opisie obrazu (action "none"): najpierw zagrożenia jeśli są, potem jedno zdanie co to jest, najważniejsze szczegóły, na końcu przeczytaj CAŁY widoczny tekst (nazwy, ceny, godziny, numery).
- Gdy polecenie jest niejasne — dopytaj w "say" (action "none").

Aktualny czas lokalny użytkownika: {CLIENT_TIME}. Korzystaj z niego przy pytaniach o godzinę i datę.`;

router.post("/ask", async (req: Request, res: Response) => {
  try {
    const { anthropicKey, question, history = [], imageBase64, mediaType = "image/jpeg", clientTime = "" } = req.body ?? {};
    const key: string = anthropicKey || process.env.ANTHROPIC_API_KEY || "";
    if (!key) return res.status(400).json({ error: "Brak klucza Anthropic — dodaj go w zakładce API (Ustawienia)" });

    const content: any[] = [];
    if (imageBase64) {
      content.push({ type: "image", source: { type: "base64", media_type: mediaType, data: String(imageBase64) } });
    }
    const q = String(question ?? "").trim() || (imageBase64 ? "Opisz dokładnie, co widzisz na tym obrazie, i przeczytaj cały widoczny tekst." : "");
    if (!q) return res.status(400).json({ error: "Puste polecenie" });
    content.push({ type: "text", text: q.slice(0, 4000) });

    const messages = [
      ...(Array.isArray(history) ? history : []).slice(-8).map((m: any) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content ?? "").slice(0, 2000),
      })),
      { role: "user", content },
    ];

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 700,
        system: SYSTEM.replace("{CLIENT_TIME}", String(clientTime).slice(0, 100) || "nieznany"),
        messages,
      }),
      signal: AbortSignal.timeout(60_000),
    });
    const d = await r.json() as any;
    if (d.error) return res.status(502).json({ error: d.error.message ?? "Błąd AI" });
    const raw = (d.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join(" ").trim();

    // Parse the strict-JSON contract; if the model slipped, degrade to plain speech
    let say = raw, action = "none", args: any = {};
    try {
      const jsonStr = raw.replace(/^```(json)?/m, "").replace(/```$/m, "").trim();
      const start = jsonStr.indexOf("{");
      const end = jsonStr.lastIndexOf("}");
      if (start >= 0 && end > start) {
        const parsed = JSON.parse(jsonStr.slice(start, end + 1));
        if (typeof parsed.say === "string") {
          say = parsed.say;
          action = typeof parsed.action === "string" ? parsed.action : "none";
          args = parsed.args && typeof parsed.args === "object" ? parsed.args : {};
        }
      }
    } catch { /* keep raw as say */ }

    res.json({ say: say || "Przepraszam, nie zrozumiałem.", action, args });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
