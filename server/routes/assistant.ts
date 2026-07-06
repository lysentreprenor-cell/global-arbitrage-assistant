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

Akcja NAWIGACJI PO NASZEJ APLIKACJI ResellAssist (działa zawsze, także w przeglądarce):
- "navigate": {"tab":"klucz zakładki"} — przełącz na wskazaną zakładkę naszej aplikacji.
Dostępne zakładki (klucz → co robi):
  dashboard — pulpit, skaner rynku
  agent — Agent AI (ARIA), analizuje rynek i tworzy plan zarobku
  marketing — Marketing AI, kampanie dla produktów
  search — Szukaj okazji
  pipeline — Pipeline, zapisane okazje
  pnl — P&L, zyski i straty
  alerts — Alerty cenowe
  trends — Trendy
  competitors — Rywale, śledzenie konkurencji
  compare — Porównaj platformy
  markets — Rynki, skan międzynarodowy
  dropship — Dropshipping
  suppliers — Dostawcy
  photo — Wystawianie ze zdjęcia
  copy — Szybkie kopiowanie ofert
  autopilot — Autopilot
  bot — Trading Bot: bot handlujący krypto na Krakenie, jego pozycje, symulacja, portfel
  api — Ustawienia API i kluczy
  gadacz — ten asystent głosowy
Przykłady: „otwórz trading bota" → navigate bot. „pokaż zyski" → navigate pnl. „przejdź do ustawień" → navigate api. „wróć do pulpitu" → navigate dashboard.
Gdy użytkownik pyta CO potrafi ta aplikacja albo jak coś zrobić — wyjaśnij w "say" po ludzku, wymieniając odpowiednie zakładki.

Akcja STEROWANIA FUNKCJAMI aplikacji (działa zawsze, także w przeglądarce):
- "app_action": {"do":"nazwa"} — wykonaj funkcję. Dostępne "do":
  bot_status — ile bot zarobił/stracił, ile pozycji, wygrane/przegrane ("ile bot zarobił", "jak stoi bot", "ile pozycji")
  sim_status — wynik symulacji ("jak symulacja", "ile symulacja zarobiła")
  wallet — stan portfela Kraken: gotówka i monety ("ile mam pieniędzy", "co jest w portfelu", "stan konta")
  market — obraz rynku: BTC, przegrzanie, trend, straż BTC ("jak rynek", "co z bitcoinem", "obraz rynku")
  shadow — wynik prawie-kupionych i ocena filtrów ("jak filtry", "prawie kupione")
  bot_stop — WYŁĄCZ bota ("wyłącz bota", "zatrzymaj bota", "stop bot")
  sweep_dust — wymieć kurz z portfela ("wymieć kurz", "sprzedaj resztki")
Uwaga: WŁĄCZENIE bota wymaga ustawień z ekranu — na „włącz bota" odpowiedz w "say", że otwierasz zakładkę bota (użyj navigate bot) i użytkownik ma dotknąć dużego przycisku. Nie próbuj włączać bota przez app_action.

Akcje EKRANOWE (działają tylko w aplikacji Android "Gadacz" z włączoną usługą dostępności; w wersji przeglądarkowej odpowiedz w "say", że potrzebna jest aplikacja Gadacz):
- "read_screen":  {} — użytkownik pyta co jest na ekranie / prosi o przeczytanie ekranu
- "tap":          {"text":"napis na przycisku lub elemencie"} — kliknij element o tym tekście
- "type":         {"text":"co wpisać"} — wpisz tekst w aktywne pole
- "open_app":     {"name":"nazwa aplikacji"} — otwórz zainstalowaną aplikację (np. Messenger, WhatsApp)
- "back":         {} — cofnij / "home": {} — ekran główny
Gdy użytkownik przysyła treść zaczynającą się od "EKRAN:", to jest zrzut zawartości ekranu z usługi dostępności — streść go zwięźle dla niewidomego (co to za aplikacja, co można zrobić, jakie są główne elementy), action "none".

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
