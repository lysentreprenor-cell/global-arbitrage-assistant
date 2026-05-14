/**
 * Typed localStorage helpers.
 * All storage key strings live here — no more magic strings scattered through the codebase.
 * Use StorageKeys.* to read/write/remove; use typed helpers for JSON payloads.
 */

// ─── Key definitions ────────────────────────────────────────────────────────

export const StorageKeys = {
  CURRENT_USER: "fintech_current_user",
  THEME:        "fintech_theme",
  LANG:         "fintech_lang",

  userCache:   (userId: string) => `fintech_user_${userId}`,
  userWallets: (userId: string) => `fintech_wallets_${userId}`,
  linkedCards: (userId: string) => `fintech_linked_cards_${userId}`,

  /** Legacy keys kept for backwards-compatibility */
  LEGACY_WALLETS:      "fintech_wallets",
  LEGACY_LINKED_CARDS: "fintech_linked_cards",
  LEGACY_USER:         "fintech_user",
  LEGACY_TX:           "fintech_tx",
  LEGACY_NOTIFS:       "fintech_notifs",
  LEGACY_CONVOS:       "fintech_convos",
  LEGACY_TICKETS:      "fintech_tickets",
} as const;

// ─── Generic helpers ─────────────────────────────────────────────────────────

export function lsGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function lsSet<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export function lsRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {}
}

export function lsGetString(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function lsSetString(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

// ─── Typed domain helpers ─────────────────────────────────────────────────────

export function getCurrentUserId(): string | null {
  return lsGetString(StorageKeys.CURRENT_USER);
}

export function setCurrentUserId(userId: string): void {
  lsSetString(StorageKeys.CURRENT_USER, userId);
}

export function clearCurrentUserId(): void {
  lsRemove(StorageKeys.CURRENT_USER);
}

export function getStoredTheme(): string | null {
  return lsGetString(StorageKeys.THEME);
}

export function setStoredTheme(theme: string): void {
  lsSetString(StorageKeys.THEME, theme);
}

export function getStoredLang(): string | null {
  return lsGetString(StorageKeys.LANG);
}

export function setStoredLang(lang: string): void {
  lsSetString(StorageKeys.LANG, lang);
}
