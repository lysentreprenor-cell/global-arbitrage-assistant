/**
 * 📧 MINIMALNY KLIENT POCZTY — bez żadnych zewnętrznych bibliotek (na wbudowanym
 * module TLS Node). Dwie rzeczy: CZYTANIE skrzynki (IMAP) i WYSYŁKA (SMTP).
 * Domyślnie skrojony pod Gmaila (imap.gmail.com / smtp.gmail.com), działa z HASŁEM
 * APLIKACJI Gmaila (nie zwykłym hasłem). Świadomie prosty — dla Gadacza liczy się
 * przeczytać nadawcę, temat i treść na głos oraz wysłać krótki mail po potwierdzeniu.
 */
import tls from "tls";

export type MailCfg = {
  user: string;
  pass: string;
  imapHost?: string;
  imapPort?: number;
  smtpHost?: string;
  smtpPort?: number;
};

export type MailHeader = { seq: number; from: string; subject: string; date: string };

function b64(s: string): string { return Buffer.from(s, "utf8").toString("base64"); }

// ── Wspólny wątek: połącz TLS, wysyłaj komendy, czytaj odpowiedź do markera. ──────
function connectTls(host: string, port: number): Promise<tls.TLSSocket> {
  return new Promise((resolve, reject) => {
    const sock = tls.connect({ host, port, servername: host }, () => resolve(sock));
    sock.setMaxListeners(0); // wiele komend = wiele chwilowych nasłuchów; bez ostrzeżeń
    sock.setTimeout(30_000);
    sock.once("timeout", () => { sock.destroy(); reject(new Error("Przekroczono czas połączenia z serwerem poczty.")); });
    sock.once("error", reject);
  });
}

// ══════════════════════════════ IMAP (czytanie) ══════════════════════════════════
export async function imapListRecent(cfg: MailCfg, count = 8): Promise<MailHeader[]> {
  const host = cfg.imapHost || "imap.gmail.com";
  const port = cfg.imapPort || 993;
  const sock = await connectTls(host, port);
  try {
    let buf = "";
    const onData = (d: Buffer) => { buf += d.toString("utf8"); };
    sock.on("data", onData);

    // Czekaj na powitanie serwera.
    await waitFor(() => buf.includes("\r\n"), sock);
    let tag = 0;
    const cmd = (line: string, done: (b: string) => boolean) => {
      const t = "a" + (++tag);
      buf = "";
      sock.write(t + " " + line + "\r\n");
      return waitFor(() => done(buf), sock).then(() => buf);
    };
    const tagged = (t: string) => (b: string) => new RegExp("^" + t + " (OK|NO|BAD)", "m").test(b) || b.includes("\r\n" + t + " ");

    // LOGIN
    let t = "a" + (tag + 1);
    let out = await cmd(`LOGIN "${cfg.user}" "${cfg.pass.replace(/"/g, '\\"')}"`, tagged(t));
    if (/^a\d+ (NO|BAD)/m.test(out)) throw new Error("Logowanie do skrzynki nie powiodło się (sprawdź adres i HASŁO APLIKACJI Gmaila).");

    // SELECT INBOX — z odpowiedzi wyłuskaj liczbę wiadomości (* N EXISTS)
    t = "a" + (tag + 1);
    out = await cmd(`SELECT INBOX`, tagged(t));
    const exists = Number((out.match(/\*\s+(\d+)\s+EXISTS/i) || [])[1] || 0);
    if (!exists) return [];

    const start = Math.max(1, exists - count + 1);
    t = "a" + (tag + 1);
    out = await cmd(`FETCH ${start}:${exists} (BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE)])`, tagged(t));

    // Rozbij po blokach „* N FETCH …" i wyciągnij nagłówki.
    const heads: MailHeader[] = [];
    const parts = out.split(/\*\s+(\d+)\s+FETCH/i);
    for (let i = 1; i < parts.length; i += 2) {
      const seq = Number(parts[i]);
      const block = parts[i + 1] || "";
      const from = decodeHeader((block.match(/From:\s*(.*)/i) || [])[1] || "");
      const subject = decodeHeader((block.match(/Subject:\s*(.*)/i) || [])[1] || "(bez tematu)");
      const date = (block.match(/Date:\s*(.*)/i) || [])[1]?.trim() || "";
      heads.push({ seq, from: from.trim(), subject: subject.trim(), date });
    }
    heads.sort((a, b) => b.seq - a.seq); // najnowsze na górze
    sock.write("a999 LOGOUT\r\n");
    sock.off("data", onData);
    return heads;
  } finally { try { sock.destroy(); } catch {} }
}

export async function imapReadOne(cfg: MailCfg, seq: number): Promise<{ header: MailHeader; body: string }> {
  const host = cfg.imapHost || "imap.gmail.com";
  const port = cfg.imapPort || 993;
  const sock = await connectTls(host, port);
  try {
    let buf = "";
    const onData = (d: Buffer) => { buf += d.toString("utf8"); };
    sock.on("data", onData);
    await waitFor(() => buf.includes("\r\n"), sock);
    let tag = 0;
    const cmd = (line: string) => {
      const t = "a" + (++tag);
      buf = "";
      sock.write(t + " " + line + "\r\n");
      const done = (b: string) => new RegExp("(^|\\r\\n)" + t + " (OK|NO|BAD)").test(b);
      return waitFor(() => done(buf), sock).then(() => buf);
    };
    let out = await cmd(`LOGIN "${cfg.user}" "${cfg.pass.replace(/"/g, '\\"')}"`);
    if (/^a\d+ (NO|BAD)/m.test(out)) throw new Error("Logowanie do skrzynki nie powiodło się.");
    await cmd(`SELECT INBOX`);
    out = await cmd(`FETCH ${seq} (BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE)] BODY.PEEK[])`);
    sock.write("a999 LOGOUT\r\n");
    sock.off("data", onData);

    const from = decodeHeader((out.match(/From:\s*(.*)/i) || [])[1] || "");
    const subject = decodeHeader((out.match(/Subject:\s*(.*)/i) || [])[1] || "(bez tematu)");
    const date = (out.match(/Date:\s*(.*)/i) || [])[1]?.trim() || "";
    // Pełny surowy mail jest w BODY[] — wyłuskaj czytelny tekst.
    const rawStart = out.indexOf("BODY[]");
    const raw = rawStart >= 0 ? out.slice(out.indexOf("\r\n", rawStart) + 2) : out;
    const body = extractReadableText(raw);
    return { header: { seq, from: from.trim(), subject: subject.trim(), date }, body };
  } finally { try { sock.destroy(); } catch {} }
}

// ══════════════════════════════ SMTP (wysyłka) ══════════════════════════════════
export async function smtpSend(cfg: MailCfg, to: string, subject: string, text: string): Promise<void> {
  const host = cfg.smtpHost || "smtp.gmail.com";
  const port = cfg.smtpPort || 465;
  const sock = await connectTls(host, port);
  try {
    let buf = "";
    const onData = (d: Buffer) => { buf += d.toString("utf8"); };
    sock.on("data", onData);
    const expect = async (code: string, what: string) => {
      // Odpowiedź SMTP jest KOMPLETNA dopiero, gdy pojawi się linia „KOD<spacja>…"
      // (myślnik po kodzie = linia pośrednia, np. wielolinijkowe EHLO). Czekamy na
      // linię finalną, inaczej rozjechalibyśmy się z serwerem.
      await waitFor(() => /^\d{3} /m.test(buf), sock);
      const final = buf.trim().split(/\r\n/).filter(l => /^\d{3} /.test(l)).pop() || "";
      if (!final.startsWith(code)) throw new Error(`${what}: serwer odpowiedział „${final}".`);
      buf = "";
    };
    const say = (line: string) => { buf = ""; sock.write(line + "\r\n"); };

    await expect("220", "Powitanie serwera");
    say("EHLO gadacz"); await expect("250", "EHLO");
    say("AUTH LOGIN"); await expect("334", "AUTH");
    say(b64(cfg.user)); await expect("334", "Login");
    say(b64(cfg.pass)); await expect("235", "Hasło (użyj HASŁA APLIKACJI Gmaila)");
    say(`MAIL FROM:<${cfg.user}>`); await expect("250", "MAIL FROM");
    say(`RCPT TO:<${to}>`); await expect("250", "Adres odbiorcy (sprawdź, czy poprawny)");
    say("DATA"); await expect("354", "DATA");

    const headers =
      `From: ${cfg.user}\r\n` +
      `To: ${to}\r\n` +
      `Subject: ${encodeSubject(subject)}\r\n` +
      `MIME-Version: 1.0\r\n` +
      `Content-Type: text/plain; charset=UTF-8\r\n` +
      `Content-Transfer-Encoding: base64\r\n\r\n`;
    const bodyB64 = Buffer.from(text, "utf8").toString("base64").replace(/(.{76})/g, "$1\r\n");
    sock.write(headers + bodyB64 + "\r\n.\r\n");
    await expect("250", "Wysyłka");
    say("QUIT");
  } finally { try { sock.destroy(); } catch {} }
}

// ── Pomocnicze ────────────────────────────────────────────────────────────────
function waitFor(cond: () => boolean, sock: tls.TLSSocket, timeoutMs = 30_000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (cond()) return resolve();
    const iv = setInterval(() => { if (cond()) { clearInterval(iv); clearTimeout(to); resolve(); } }, 40);
    const to = setTimeout(() => { clearInterval(iv); reject(new Error("Serwer poczty nie odpowiedział na czas.")); }, timeoutMs);
    sock.once("error", (e) => { clearInterval(iv); clearTimeout(to); reject(e); });
    sock.once("close", () => { clearInterval(iv); clearTimeout(to); cond() ? resolve() : reject(new Error("Połączenie z pocztą zostało zamknięte.")); });
  });
}

function encodeSubject(s: string): string {
  // Temat z polskimi znakami koduj jak każe RFC 2047 (=?UTF-8?B?…?=).
  if (/^[\x00-\x7F]*$/.test(s)) return s;
  return "=?UTF-8?B?" + Buffer.from(s, "utf8").toString("base64") + "?=";
}

// Dekoduj nagłówek zakodowany RFC 2047 (=?UTF-8?B?…?= lub =?…?Q?…?=) — inaczej
// polskie tematy/nadawcy byłyby czytane jako krzaki.
function decodeHeader(s: string): string {
  return s.replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, (_m, cs, enc, data) => {
    try {
      if (enc.toUpperCase() === "B") return Buffer.from(data, "base64").toString("utf8");
      // Q-encoding: _ = spacja, =XX = bajt
      const bytes = data.replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})/g, (_x: string, h: string) => String.fromCharCode(parseInt(h, 16)));
      return Buffer.from(bytes, "binary").toString("utf8");
    } catch { return data; }
  }).replace(/\s+/g, " ");
}

// Z surowego maila (często multipart) wyciągnij czytelny tekst do przeczytania.
function extractReadableText(raw: string): string {
  let text = raw;
  // Znajdź część text/plain w multipart; gdy brak — weź text/html i zdejmij znaczniki.
  const plain = pickPart(raw, "text/plain");
  const html = plain ? "" : pickPart(raw, "text/html");
  if (plain) text = plain;
  else if (html) text = html.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ");
  else {
    // Brak wyraźnych części — spróbuj odciąć nagłówki (pierwsza pusta linia).
    const nl = raw.indexOf("\r\n\r\n");
    if (nl >= 0) text = raw.slice(nl + 4);
  }
  return text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim().slice(0, 6000);
}

// Wytnij treść części o danym typie, dekodując base64/quoted-printable.
function pickPart(raw: string, type: string): string {
  const idx = raw.toLowerCase().indexOf(type);
  if (idx < 0) return "";
  const headEnd = raw.indexOf("\r\n\r\n", idx);
  if (headEnd < 0) return "";
  const partHeaders = raw.slice(idx, headEnd).toLowerCase();
  let body = raw.slice(headEnd + 4);
  // Utnij na granicy MIME (--boundary), jeśli jest.
  const bnd = body.search(/\r\n--[-_A-Za-z0-9]+/);
  if (bnd >= 0) body = body.slice(0, bnd);
  if (/content-transfer-encoding:\s*base64/.test(partHeaders)) {
    try { body = Buffer.from(body.replace(/\s+/g, ""), "base64").toString("utf8"); } catch {}
  } else if (/content-transfer-encoding:\s*quoted-printable/.test(partHeaders)) {
    body = body.replace(/=\r\n/g, "").replace(/=([0-9A-Fa-f]{2})/g, (_m, h) => String.fromCharCode(parseInt(h, 16)));
    try { body = Buffer.from(body, "binary").toString("utf8"); } catch {}
  }
  return body.trim();
}
