const DIACRITICS_MAP: Record<string, string> = {
  ą: "a",
  ć: "c",
  ę: "e",
  ł: "l",
  ń: "n",
  ó: "o",
  ś: "s",
  ż: "z",
  ź: "z",
  Ą: "a",
  Ć: "c",
  Ę: "e",
  Ł: "l",
  Ń: "n",
  Ó: "o",
  Ś: "s",
  Ż: "z",
  Ź: "z",
};

function stripDiacritics(input: string): string {
  return String(input || "")
    .split("")
    .map((char) => DIACRITICS_MAP[char] || char)
    .join("");
}

export function slugifyHandleBase(input: string): string {
  return stripDiacritics(String(input || ""))
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 20) || "user";
}

export function getFirstNameBase(name: string): string {
  const firstPart = String(name || "").trim().split(/\s+/)[0] || "user";
  return slugifyHandleBase(firstPart);
}

export function normalizeHandle(value: string): string {
  const raw = String(value || "").trim().replace(/^@+/, "");
  return slugifyHandleBase(raw);
}

export function ensureAtHandle(value: string): string {
  const normalized = normalizeHandle(value);
  return normalized ? `@${normalized}` : "@user";
}

export function buildDeterministicHandle(name: string, id?: string): string {
  const base = getFirstNameBase(name || "user");
  const safeId = String(id || "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  if (!safeId) return base;
  return `${base}${safeId.slice(-2)}`;
}

export function getDisplayHandle(name?: string | null, handle?: string | null, id?: string | null): string {
  if (handle) return ensureAtHandle(handle);
  return ensureAtHandle(buildDeterministicHandle(name || "user", id || ""));
}

export function normalizeSearchQuery(value: string): string {
  return stripDiacritics(String(value || "")).toLowerCase().trim();
}

export function normalizePhone(value?: string | null): string {
  return String(value || "").replace(/[^0-9+]/g, "");
}

export function matchesUserQuery(user: {
  name?: string | null;
  handle?: string | null;
  email?: string | null;
  phone?: string | null;
  id?: string | null;
}, query: string): boolean {
  const q = normalizeSearchQuery(query);
  if (!q) return true;

  const displayHandle = getDisplayHandle(user.name, user.handle, user.id).toLowerCase();
  const handleWithoutAt = displayHandle.replace(/^@/, "");
  const name = normalizeSearchQuery(user.name || "");
  const email = normalizeSearchQuery(user.email || "");
  const phone = normalizePhone(user.phone || "");

  const qNoAt = q.replace(/^@/, "");
  const qPhone = normalizePhone(q);

  return (
    name.includes(q) ||
    displayHandle.includes(q) ||
    handleWithoutAt.includes(qNoAt) ||
    email.includes(q) ||
    (qPhone ? phone.includes(qPhone) : false)
  );
}
