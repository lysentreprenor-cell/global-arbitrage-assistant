type SafeUserPayload = {
  id?: string;
  name?: string;
  email?: string;
  handle?: string;
};

function toSafeHandle(handle?: string) {
  const raw = String(handle || "").trim();
  if (!raw) return "";
  return raw.startsWith("@") ? raw : `@${raw}`;
}

function formatDate(value?: string) {
  const date = value ? new Date(value) : new Date();
  return date.toISOString();
}

function escapeHtml(input?: string) {
  return String(input || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function sendViaResend(params: {
  to: string;
  subject: string;
  html: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    console.log("[account-email-flow] Missing RESEND_API_KEY or EMAIL_FROM. Email preview only.");
    console.log("TO:", params.to);
    console.log("SUBJECT:", params.subject);
    return { ok: false, preview: true };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [params.to],
      subject: params.subject,
      html: params.html,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Resend email failed: ${text}`);
  }

  return { ok: true };
}

export async function sendRegistrationStartedEmail(user: SafeUserPayload) {
  if (!user?.email) return { ok: false, skipped: true };

  const appBaseUrl = process.env.APP_BASE_URL || "";
  const verifyUrl = appBaseUrl ? `${appBaseUrl.replace(/\/$/, "")}/verify-email` : "#";

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5;">
      <h2>Witamy w aplikacji</h2>
      <p>Twoje konto zostało utworzone poprawnie.</p>
      <p><strong>Imię:</strong> ${escapeHtml(user.name)}</p>
      <p><strong>Handle:</strong> ${escapeHtml(toSafeHandle(user.handle))}</p>
      <p><strong>Email:</strong> ${escapeHtml(user.email)}</p>
      <p><strong>Data rejestracji:</strong> ${escapeHtml(formatDate())}</p>
      <p>
        <a href="${verifyUrl}" style="display:inline-block;padding:10px 16px;background:#111827;color:#fff;text-decoration:none;border-radius:8px;">
          Potwierdź email
        </a>
      </p>
      <p>Jeśli to nie Ty, skontaktuj się z supportem.</p>
    </div>
  `;

  return sendViaResend({
    to: user.email,
    subject: "Witamy – potwierdź konto",
    html,
  });
}

export async function sendAccountActivatedEmail(user: SafeUserPayload) {
  if (!user?.email) return { ok: false, skipped: true };

  const appBaseUrl = process.env.APP_BASE_URL || "";
  const loginUrl = appBaseUrl ? `${appBaseUrl.replace(/\/$/, "")}/` : "#";

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5;">
      <h2>Konto aktywne</h2>
      <p>Twoje konto zostało potwierdzone i aktywowane.</p>
      <p><strong>Imię:</strong> ${escapeHtml(user.name)}</p>
      <p><strong>Handle:</strong> ${escapeHtml(toSafeHandle(user.handle))}</p>
      <p><strong>Email:</strong> ${escapeHtml(user.email)}</p>
      <p><strong>Data aktywacji:</strong> ${escapeHtml(formatDate())}</p>
      <p>
        <a href="${loginUrl}" style="display:inline-block;padding:10px 16px;background:#111827;color:#fff;text-decoration:none;border-radius:8px;">
          Przejdź do aplikacji
        </a>
      </p>
    </div>
  `;

  return sendViaResend({
    to: user.email,
    subject: "Konto aktywne",
    html,
  });
}
