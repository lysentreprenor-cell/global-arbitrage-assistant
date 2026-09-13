/**
 * 📧 ASYSTENT E-MAIL GADACZA — czyta skrzynkę i pisze maile NA GŁOS. Dla osoby
 * niewidomej: „przeczytaj pocztę", „przeczytaj pierwszą wiadomość", „napisz maila
 * do… o…". Wysyłka ZAWSZE z potwierdzeniem — Gadacz najpierw czyta odbiorcę, temat
 * i treść, i czeka na „wyślij", nigdy nie wysyła sam z siebie (jak przy płatnościach).
 *
 * Konfiguracja przez sekrety serwera (Replit → Secrets):
 *   GADACZ_EMAIL_USER  — adres Gmail (np. jan.kowalski@gmail.com)
 *   GADACZ_EMAIL_PASS  — HASŁO APLIKACJI Gmaila (16 znaków, NIE zwykłe hasło)
 *   (opcjonalnie GADACZ_IMAP_HOST / GADACZ_SMTP_HOST dla poczty innej niż Gmail)
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { imapListRecent, imapReadOne, smtpSend, type MailCfg } from "../lib/mailClient";

const router = Router();

// ── PIN — ten sam zamek co reszta Gadacza (0905). ────────────────────────────────
const PIN_FILE = path.resolve(process.cwd(), "data", "pin.json");
function pinHash(pin: string): string { return crypto.createHash("sha256").update("bot-pin-v1:" + pin).digest("hex"); }
function loadPinHash(): string | null { try { return JSON.parse(fs.readFileSync(PIN_FILE, "utf8")).hash ?? null; } catch { return null; } }
function pinOk(given: unknown, storedHash: string): boolean {
  try {
    const a = Buffer.from(pinHash(String(given ?? "")), "hex");
    const b = Buffer.from(storedHash, "hex");
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch { return false; }
}
router.use((req: Request, res: Response, next: NextFunction) => {
  const cur = loadPinHash();
  if (!cur) return next();
  if (pinOk(req.headers["x-bot-pin"], cur)) return next();
  res.status(401).json({ error: "Wymagany PIN aplikacji" });
});

function cfg(): MailCfg | null {
  const user = (process.env.GADACZ_EMAIL_USER ?? "").trim();
  const pass = (process.env.GADACZ_EMAIL_PASS ?? "").trim();
  if (!user || !pass) return null;
  return {
    user, pass,
    imapHost: (process.env.GADACZ_IMAP_HOST ?? "").trim() || undefined,
    smtpHost: (process.env.GADACZ_SMTP_HOST ?? "").trim() || undefined,
  };
}

// Czy poczta w ogóle skonfigurowana (dla apki — pokazać status/instrukcję).
router.get("/config", (_req, res) => {
  const c = cfg();
  res.json({ configured: !!c, user: c ? c.user : "" });
});

const NOT_SET = "Poczta nie jest jeszcze podłączona. W ustawieniach serwera (Replit → Secrets) dodaj GADACZ_EMAIL_USER (adres Gmail) i GADACZ_EMAIL_PASS (hasło aplikacji Gmaila).";

// 📥 Lista ostatnich wiadomości — krótkie streszczenie do przeczytania na głos.
router.get("/list", async (req, res) => {
  const c = cfg();
  if (!c) return res.status(400).json({ error: NOT_SET, say: NOT_SET });
  try {
    const count = Math.min(15, Math.max(1, Number(req.query.count) || 8));
    const emails = (await imapListRecent(c, count)).map(e => ({ ...e, email: bareEmail(e.from) }));
    if (!emails.length) return res.json({ emails: [], say: "Skrzynka jest pusta — nie masz żadnych wiadomości." });
    const say = `Masz ${emails.length} ostatnich wiadomości. ` +
      emails.map((e, i) => `${i + 1}. Od ${shortFrom(e.from)}, temat: ${e.subject}.`).join(" ") +
      " Powiedz numer, żebym przeczytał całą wiadomość.";
    res.json({ emails, say });
  } catch (e: any) {
    const msg = "Nie mogę odczytać skrzynki: " + (e?.message ?? "błąd");
    res.status(502).json({ error: msg, say: msg });
  }
});

// 📖 Przeczytaj jedną wiadomość (po numerze porządkowym z listy IMAP — seq).
router.post("/read", async (req, res) => {
  const c = cfg();
  if (!c) return res.status(400).json({ error: NOT_SET, say: NOT_SET });
  const seq = Number(req.body?.seq);
  if (!seq || seq < 1) return res.status(400).json({ error: "Podaj numer wiadomości (seq).", say: "Nie wiem, którą wiadomość przeczytać." });
  try {
    const { header, body } = await imapReadOne(c, seq);
    const say = `Wiadomość od ${shortFrom(header.from)}. Temat: ${header.subject}. Treść: ${body || "(pusta treść)"}`;
    res.json({ header: { ...header, email: bareEmail(header.from) }, body, say });
  } catch (e: any) {
    const msg = "Nie mogę przeczytać tej wiadomości: " + (e?.message ?? "błąd");
    res.status(502).json({ error: msg, say: msg });
  }
});

// ✉️ Wyślij maila — DWUETAPOWO. Bez confirm:true tylko PODGLĄD do przeczytania na
// głos i pytanie o zgodę. Dopiero confirm:true naprawdę wysyła. Bezpieczeństwo jak
// przy płatnościach: Gadacz nie wysyła nic z własnej inicjatywy.
router.post("/send", async (req, res) => {
  const c = cfg();
  if (!c) return res.status(400).json({ error: NOT_SET, say: NOT_SET });
  const to = String(req.body?.to ?? "").trim();
  const subject = String(req.body?.subject ?? "").trim() || "(bez tematu)";
  const text = String(req.body?.text ?? "").trim();
  const confirm = req.body?.confirm === true;

  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to))
    return res.status(400).json({ error: "Zły adres odbiorcy.", say: "Podaj poprawny adres e-mail odbiorcy." });
  if (!text) return res.status(400).json({ error: "Pusta treść.", say: "Nie mam treści do wysłania." });

  if (!confirm) {
    const say = `Przygotowałem maila. Do: ${to}. Temat: ${subject}. Treść: ${text}. Czy wysłać? Powiedz „wyślij", żeby potwierdzić.`;
    return res.json({ preview: { to, subject, text }, needsConfirm: true, say });
  }
  try {
    await smtpSend(c, to, subject, text);
    const say = `Wysłane do ${to}.`;
    res.json({ ok: true, say });
  } catch (e: any) {
    const msg = "Nie udało się wysłać: " + (e?.message ?? "błąd");
    res.status(502).json({ error: msg, say: msg });
  }
});

// „Jan Kowalski <jan@x.pl>" → „Jan Kowalski" (albo sam adres) — czytelniej na głos.
function shortFrom(from: string): string {
  const m = from.match(/^\s*"?([^"<]+?)"?\s*<([^>]+)>/);
  if (m) return m[1].trim() || m[2].trim();
  return from.replace(/[<>]/g, "").trim();
}

// Sam adres e-mail z nagłówka From (do odpowiadania) — „Jan <jan@x.pl>" → „jan@x.pl".
function bareEmail(from: string): string {
  const m = from.match(/<([^>]+)>/) || from.match(/([^\s<>]+@[^\s<>]+)/);
  return m ? m[1].trim() : "";
}

export default router;
