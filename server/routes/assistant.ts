/**
 * 🦯 Asystent — voice assistant for blind and low-vision users (Etap 1).
 *
 * One endpoint: POST /api/assistant/ask
 *   { anthropicKey?, question, history?: [{role, content}], imageBase64?, mediaType? }
 * → { text }  (short, spoken-style Polish — the client reads it aloud via TTS)
 *
 * Uses the same Anthropic key the rest of the app uses (Settings → API),
 * falling back to ANTHROPIC_API_KEY from the environment.
 */
import { Router, type Request, type Response } from "express";

const router = Router();

const SYSTEM = `Jesteś "Asystent" — głosowy pomocnik dla osób niewidomych i słabowidzących. Mówisz po polsku.
Zasady:
- Odpowiadasz KRÓTKO i KONKRETNIE, jak w rozmowie na głos — Twoja odpowiedź zostanie przeczytana syntezatorem mowy.
- Bez markdown, bez gwiazdek, bez emotikonów, bez nagłówków — wyłącznie płynny mówiony tekst.
- Gdy opisujesz obraz: najpierw jedno zdanie co to jest, potem najważniejsze szczegóły przestrzenne (co gdzie się znajduje), a na końcu przeczytaj CAŁY tekst widoczny na obrazie: nazwy, ceny, godziny, numery. Jeśli widzisz zagrożenie (schody, przeszkoda, gorące, ostre) — powiedz o tym NA POCZĄTKU.
- Gdy użytkownik prosi o przeczytanie czegoś — czytaj wiernie, bez streszczania, chyba że poprosi o streszczenie.
- Gdy czegoś nie wiesz albo obraz jest nieczytelny — powiedz to wprost i poproś o lepsze ujęcie.`;

router.post("/ask", async (req: Request, res: Response) => {
  try {
    const { anthropicKey, question, history = [], imageBase64, mediaType = "image/jpeg" } = req.body ?? {};
    const key: string = anthropicKey || process.env.ANTHROPIC_API_KEY || "";
    if (!key) return res.status(400).json({ error: "Brak klucza Anthropic — dodaj go w zakładce API (Ustawienia)" });

    const content: any[] = [];
    if (imageBase64) {
      content.push({ type: "image", source: { type: "base64", media_type: mediaType, data: String(imageBase64) } });
    }
    const q = String(question ?? "").trim() || (imageBase64 ? "Opisz dokładnie, co widzisz na tym obrazie." : "");
    if (!q) return res.status(400).json({ error: "Puste pytanie" });
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
      body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 600, system: SYSTEM, messages }),
      signal: AbortSignal.timeout(60_000),
    });
    const d = await r.json() as any;
    if (d.error) return res.status(502).json({ error: d.error.message ?? "Błąd AI" });
    const text = (d.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join(" ").trim();
    res.json({ text: text || "Przepraszam, nie mam odpowiedzi." });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
