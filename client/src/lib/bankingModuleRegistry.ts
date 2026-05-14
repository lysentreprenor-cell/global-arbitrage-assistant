import type { FeatureKey } from "@/lib/features";

export type BankingModuleKey =
  | "dashboard"
  | "wallets"
  | "operations"
  | "history"
  | "cards"
  | "invest"
  | "budget"
  | "messages"
  | "notifications"
  | "support"
  | "profile"
  | "security"
  | "preferences"
  | "admin";

export type BankingWorkspaceKey =
  | "dashboard"
  | "wallets"
  | "operations"
  | "history"
  | "cards"
  | "invest"
  | "budget"
  | "messages"
  | "notifications"
  | "support"
  | "profile"
  | "security"
  | "preferences"
  | "admin";

export type BankingModuleConfig = {
  key: BankingModuleKey;
  label: string;
  workspace: BankingWorkspaceKey;
  featureKey: FeatureKey;
  primaryRoute: string;
  critical: boolean;
};

export const BANKING_MODULE_REGISTRY: Record<BankingModuleKey, BankingModuleConfig> = {
  dashboard: {
    key: "dashboard",
    label: "Dashboard",
    workspace: "dashboard",
    featureKey: "dashboard",
    primaryRoute: "/",
    critical: true,
  },
  wallets: {
    key: "wallets",
    label: "Wallets",
    workspace: "wallets",
    featureKey: "wallets",
    primaryRoute: "/cards",
    critical: true,
  },
  operations: {
    key: "operations",
    label: "Operations",
    workspace: "operations",
    featureKey: "transfer",
    primaryRoute: "/transfer",
    critical: true,
  },
  history: {
    key: "history",
    label: "History",
    workspace: "history",
    featureKey: "transactions",
    primaryRoute: "/history",
    critical: true,
  },
  cards: {
    key: "cards",
    label: "Cards",
    workspace: "cards",
    featureKey: "cards",
    primaryRoute: "/cards",
    critical: true,
  },
  invest: {
    key: "invest",
    label: "Invest",
    workspace: "invest",
    featureKey: "investments",
    primaryRoute: "/invest",
    critical: false,
  },
  budget: {
    key: "budget",
    label: "Budget",
    workspace: "budget",
    featureKey: "budget-forecast",
    primaryRoute: "/budget",
    critical: false,
  },
  messages: {
    key: "messages",
    label: "Messages",
    workspace: "messages",
    featureKey: "messages",
    primaryRoute: "/messages",
    critical: true,
  },
  notifications: {
    key: "notifications",
    label: "Notifications",
    workspace: "notifications",
    featureKey: "notifications",
    primaryRoute: "/notifications",
    critical: true,
  },
  support: {
    key: "support",
    label: "Support",
    workspace: "support",
    featureKey: "support",
    primaryRoute: "/profile/support",
    critical: true,
  },
  profile: {
    key: "profile",
    label: "Profile",
    workspace: "profile",
    featureKey: "profile",
    primaryRoute: "/profile",
    critical: true,
  },
  security: {
    key: "security",
    label: "Security",
    workspace: "security",
    featureKey: "security",
    primaryRoute: "/profile/security",
    critical: true,
  },
  preferences: {
    key: "preferences",
    label: "Preferences",
    workspace: "preferences",
    featureKey: "preferences",
    primaryRoute: "/profile/preferences",
    critical: true,
  },
  admin: {
    key: "admin",
    label: "Admin",
    workspace: "admin",
    featureKey: "admin",
    primaryRoute: "/admin",
    critical: false,
  },
};

export function listBankingModules(): BankingModuleConfig[] {
  return Object.values(BANKING_MODULE_REGISTRY);
}

export function getBankingModule(
  key: BankingModuleKey,
): BankingModuleConfig {
  return BANKING_MODULE_REGISTRY[key];
}

export function getCriticalBankingModules(): BankingModuleConfig[] {
  return listBankingModules().filter((module) => module.critical);
}

export function findBankingModuleByWorkspace(
  workspace: string | null,
): BankingModuleConfig | null {
  if (!workspace) return null;
  return (
    listBankingModules().find((module) => module.workspace === workspace) ?? null
  );
}
