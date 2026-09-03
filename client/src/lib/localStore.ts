/**
 * Typed localStorage helpers.
 * All storage key strings live here — no magic strings scattered through the codebase.
 * Use StorageKeys.* to read/write/remove; use typed helpers for JSON payloads.
 *
 * ── About the three prefixes ────────────────────────────────────────────────
 * The product has been called three things over its life, and each era left a
 * prefix behind: `fintech_`, `finlys_`, `itemprise_`.
 *
 * THE VALUES BELOW MUST NOT BE RENAMED. They are the addresses of data already
 * sitting in real users' browsers — drafts, savings goals, rate alerts, blocked
 * users, the PIN lockout. Renaming a key does not migrate the data, it orphans
 * it: the user opens the app and their contract draft is simply gone.
 *
 * What is fixed here instead is the part that actually hurt: the strings were
 * duplicated across a dozen screens, so a typo in one of them silently wrote to
 * a key nobody reads. Every key now has exactly one definition.
 *
 * If these ever do need unifying under one prefix, it takes a migration pass on
 * startup (read old key → write new → delete old), not a find-and-replace.
 */

// ─── Key definitions ────────────────────────────────────────────────────────

export const StorageKeys = {
  /* ── session & preferences ── */
  CURRENT_USER: "fintech_current_user",
  THEME:        "fintech_theme",
  LANG:         "fintech_lang",
  APP_LOCK:     "finlys_app_lock",
  OFFLINE_MODE: "finlys_offline_mode",
  ROUNDUP:      "finlys_roundup_enabled",

  userCache:   (userId: string) => `fintech_user_${userId}`,
  userWallets: (userId: string) => `fintech_wallets_${userId}`,
  linkedCards: (userId: string) => `fintech_linked_cards_${userId}`,

  /* ── money ── */
  GOALS:           "finlys_goals",
  CURRENCY_ALERTS: "finlys_currency_alerts",
  FX_ALERTS:       "itemprise_fx_alerts",
  SPLIT_BILLS:     "finlys_split_bills",
  REFERRALS:       "finlys_referrals",

  /* ── agreements ── */
  CONTRACTS:    "itemprise_contracts",
  DRAFT:        "itemprise_draft",
  MY_TEMPLATES: "finlys_my_templates",
  RATINGS:      "finlys_ratings",

  /* ── messaging ── */
  BLOCKED_USERS: "finlys_blocked_users",
  FAV_CONVS:     "finlys_fav_convs",

  /* ── security & device ── */
  PIN_ATTEMPTS:         "finlys_pin_attempts",
  PIN_LOCKOUT:          "finlys_pin_lockout",
  DEVICE_FP:            "finlys_device_fp",
  PENDING_VERIFY_EMAIL: "finlys_pending_verify_email",

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
