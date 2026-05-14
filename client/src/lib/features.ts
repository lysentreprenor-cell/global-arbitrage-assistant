/**
 * Central feature registry.
 *
 * Every major module the app supports is listed here with its metadata.
 * This is the single source of truth for:
 *   - which features exist
 *   - whether they require auth
 *   - whether they are currently enabled
 *   - their canonical route (for link generation)
 *
 * To add a new feature:
 *   1. Add a key to FeatureKey below
 *   2. Add a matching FeatureConfig entry in FEATURE_REGISTRY
 *   3. Use isFeatureEnabled() or useFeatures() in any component
 *
 * No UI is rendered here — this is pure config.
 */

// ─── Feature keys ─────────────────────────────────────────────────────────────

export type FeatureKey =
  | "dashboard"
  | "wallets"
  | "transfer"
  | "transactions"
  | "cards"
  | "investments"
  | "messages"
  | "notifications"
  | "support"
  | "budget-forecast"
  | "profile"
  | "security"
  | "preferences"
  | "admin"
  | "agreements";

// ─── Per-feature config ────────────────────────────────────────────────────────

export type FeatureConfig = {
  /** Human-readable module label (EN).  Keep short — used in future admin/debug UI. */
  label: string;
  /** Canonical client-side route for this module (matches App.tsx routes). */
  route: string;
  /** If true, the feature is inaccessible to unauthenticated users. */
  requiresAuth: boolean;
  /** Feature is on by default (can be overridden via overrides map). */
  defaultEnabled: boolean;
  /** Short description for tooling / future admin panels. */
  description: string;
};

// ─── Registry ──────────────────────────────────────────────────────────────────

export const FEATURE_REGISTRY: Record<FeatureKey, FeatureConfig> = {
  dashboard: {
    label:          "Dashboard",
    route:          "/",
    requiresAuth:   true,
    defaultEnabled: true,
    description:    "Main overview screen showing balances, quick actions and recent activity.",
  },
  wallets: {
    label:          "Multi-currency Wallets",
    route:          "/",          // surfaced on dashboard & transfer flows
    requiresAuth:   true,
    defaultEnabled: true,
    description:    "Separate per-currency balance accounts (USD, EUR, GBP, CHF, PLN).",
  },
  transfer: {
    label:          "Transfer",
    route:          "/transfer",
    requiresAuth:   true,
    defaultEnabled: true,
    description:    "Send money to contacts or external accounts.",
  },
  transactions: {
    label:          "Transaction History",
    route:          "/history",
    requiresAuth:   true,
    defaultEnabled: true,
    description:    "Full transaction log with search and filtering.",
  },
  cards: {
    label:          "Cards",
    route:          "/cards",
    requiresAuth:   true,
    defaultEnabled: true,
    description:    "Virtual and physical card management, spend limits, freeze/unfreeze.",
  },
  investments: {
    label:          "Investments",
    route:          "/invest",
    requiresAuth:   true,
    defaultEnabled: true,
    description:    "Investment portfolio overview and market data.",
  },
  messages: {
    label:          "Messages",
    route:          "/messages",
    requiresAuth:   true,
    defaultEnabled: true,
    description:    "P2P conversations and payment-linked chat threads.",
  },
  notifications: {
    label:          "Notifications",
    route:          "/notifications",
    requiresAuth:   true,
    defaultEnabled: true,
    description:    "In-app notification centre for system alerts and activity updates.",
  },
  support: {
    label:          "Support",
    route:          "/profile/support",
    requiresAuth:   true,
    defaultEnabled: true,
    description:    "Customer support ticket system with threaded replies.",
  },
  "budget-forecast": {
    label:          "Budget Forecast",
    route:          "/budget",
    requiresAuth:   true,
    defaultEnabled: true,
    description:    "AI-assisted spending forecast and budgeting tools.",
  },
  profile: {
    label:          "Profile",
    route:          "/profile",
    requiresAuth:   true,
    defaultEnabled: true,
    description:    "User account management and personal information.",
  },
  security: {
    label:          "Security",
    route:          "/profile/security",
    requiresAuth:   true,
    defaultEnabled: true,
    description:    "Password, biometric login, and security settings.",
  },
  preferences: {
    label:          "Preferences",
    route:          "/profile/preferences",
    requiresAuth:   true,
    defaultEnabled: true,
    description:    "Theme, language, and notification preferences.",
  },
  admin: {
    label:          "Admin Console",
    route:          "/admin",
    requiresAuth:   true,
    defaultEnabled: true,
    description:    "Internal admin dashboard for user and system management.",
  },
  agreements: {
    label:          "Agreements",
    route:          "/agreements",
    requiresAuth:   true,
    defaultEnabled: true,
    description:    "P2P service agreements with sandbox fund holds and release.",
  },
};

// ─── Pure helper (no React) ────────────────────────────────────────────────────

/**
 * Check whether a feature is enabled without a React hook.
 *
 * @param key       - FeatureKey to check
 * @param overrides - optional map of per-key overrides (useful in tests or SSR)
 * @returns true if the feature is enabled
 */
export function isFeatureEnabled(
  key: FeatureKey,
  overrides: Partial<Record<FeatureKey, boolean>> = {},
): boolean {
  const config = FEATURE_REGISTRY[key];
  if (!config) return false;
  if (key in overrides) return overrides[key]!;
  return config.defaultEnabled;
}

/**
 * Return the route for a feature key, or "/" if not found.
 */
export function featureRoute(key: FeatureKey): string {
  return FEATURE_REGISTRY[key]?.route ?? "/";
}

/**
 * Return all features that match a given predicate.
 */
export function filterFeatures(
  predicate: (key: FeatureKey, config: FeatureConfig) => boolean,
): Array<{ key: FeatureKey; config: FeatureConfig }> {
  return (Object.keys(FEATURE_REGISTRY) as FeatureKey[])
    .filter((key) => predicate(key, FEATURE_REGISTRY[key]))
    .map((key) => ({ key, config: FEATURE_REGISTRY[key] }));
}

/**
 * Return all features that require authentication.
 */
export function authGatedFeatures(): FeatureKey[] {
  return filterFeatures((_, c) => c.requiresAuth).map((f) => f.key);
}
