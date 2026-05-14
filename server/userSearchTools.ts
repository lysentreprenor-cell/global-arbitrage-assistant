type SearchUser = {
  id?: string;
  name?: string;
  handle?: string;
  email?: string;
  phone?: string;
};

const DIACRITICS_MAP: Record<string, string> = {
  ą: "a", ć: "c", ę: "e", ł: "l", ń: "n", ó: "o", ś: "s", ż: "z", ź: "z",
  Ą: "a", Ć: "c", Ę: "e", Ł: "l", Ń: "n", Ó: "o", Ś: "s", Ż: "z", Ź: "z",
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

export function ensureAtHandle(value: string): string {
  const raw = String(value || "").trim().replace(/^@+/, "");
  const normalized = slugifyHandleBase(raw);
  return `@${normalized}`;
}

export function buildDeterministicHandle(name: string, id?: string): string {
  const firstName = String(name || "user").trim().split(/\s+/)[0] || "user";
  const base = slugifyHandleBase(firstName);
  const safeId = String(id || "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  return safeId ? `${base}${safeId.slice(-2)}` : base;
}

export function resolveUserHandle(user: SearchUser): string {
  return ensureAtHandle(user?.handle || buildDeterministicHandle(user?.name || "user", user?.id || ""));
}

function normalizePhone(value?: string) {
  return String(value || "").replace(/[^0-9+]/g, "");
}

function normalizeQuery(value: string) {
  return stripDiacritics(String(value || "")).toLowerCase().trim();
}

export function searchUsersForDiscovery(
  users: SearchUser[],
  query: string,
  excludeUserId?: string,
) {
  const q = normalizeQuery(query);
  if (!q) return [];

  return (users || [])
    .filter((user) => String(user?.id || "") !== String(excludeUserId || ""))
    .map((user) => ({
      id: user?.id,
      name: user?.name,
      email: user?.email,
      phone: user?.phone,
      handle: resolveUserHandle(user),
    }))
    .filter((user) => {
      const name = normalizeQuery(user?.name || "");
      const handle = normalizeQuery(user?.handle || "");
      const handleWithoutAt = handle.replace(/^@/, "");
      const email = normalizeQuery(user?.email || "");
      const phone = normalizePhone(user?.phone || "");
      const qPhone = normalizePhone(q);

      return (
        name.includes(q) ||
        handle.includes(q) ||
        handleWithoutAt.includes(q.replace(/^@/, "")) ||
        email.includes(q) ||
        (qPhone ? phone.includes(qPhone) : false)
      );
    })
    .slice(0, 20);
}
