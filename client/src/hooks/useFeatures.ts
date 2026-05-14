/**
 * Feature-availability hook.
 *
 * Answers the question "is this feature accessible right now?" by combining:
 *   1. The feature's static config (FEATURE_REGISTRY)
 *   2. The current auth state (useCurrentUser)
 *   3. Optional per-feature runtime overrides
 *
 * Usage:
 *   const { isEnabled, enabledKeys } = useFeatures();
 *   if (!isEnabled("budget-forecast")) return null;
 *
 * To gate a whole component on feature + auth:
 *   const { isEnabled } = useFeatures();
 *   // renders nothing if feature is off or user not authed
 *
 * No UI is rendered here — this is a pure data hook.
 */

import { useMemo } from "react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import {
  FEATURE_REGISTRY,
  isFeatureEnabled,
  type FeatureKey,
  type FeatureConfig,
} from "@/lib/features";

// ─── Return type ──────────────────────────────────────────────────────────────

export type FeatureEntry = {
  key:    FeatureKey;
  config: FeatureConfig;
};

export type FeaturesResult = {
  /**
   * Returns true if the feature is enabled AND all access rules are satisfied
   * (e.g. requiresAuth is met by the current session).
   */
  isEnabled: (key: FeatureKey) => boolean;

  /** All feature keys that are currently accessible. */
  enabledKeys: FeatureKey[];

  /** Full entries (key + config) for every accessible feature. */
  enabledFeatures: FeatureEntry[];

  /** Full entries for all features regardless of current access. */
  allFeatures: FeatureEntry[];

  /** Convenience: is the user currently authenticated? */
  isAuthenticated: boolean;
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * @param overrides - optional map to force individual features on or off at runtime.
 *                    Useful for A/B flags, per-user beta access, or tests.
 */
export function useFeatures(
  overrides: Partial<Record<FeatureKey, boolean>> = {},
): FeaturesResult {
  const { isAuthenticated } = useCurrentUser();

  const allFeatures = useMemo<FeatureEntry[]>(
    () =>
      (Object.keys(FEATURE_REGISTRY) as FeatureKey[]).map((key) => ({
        key,
        config: FEATURE_REGISTRY[key],
      })),
    [],
  );

  const enabledFeatures = useMemo<FeatureEntry[]>(
    () =>
      allFeatures.filter(({ key, config }) => {
        // Auth gate: if feature requires auth, user must be logged in
        if (config.requiresAuth && !isAuthenticated) return false;
        // Check the registry default + any runtime overrides
        return isFeatureEnabled(key, overrides);
      }),
    [allFeatures, isAuthenticated, overrides],
  );

  const enabledKeys = useMemo<FeatureKey[]>(
    () => enabledFeatures.map((f) => f.key),
    [enabledFeatures],
  );

  const isEnabled = useMemo(
    () =>
      (key: FeatureKey): boolean =>
        enabledKeys.includes(key),
    [enabledKeys],
  );

  return {
    isEnabled,
    enabledKeys,
    enabledFeatures,
    allFeatures,
    isAuthenticated,
  };
}
