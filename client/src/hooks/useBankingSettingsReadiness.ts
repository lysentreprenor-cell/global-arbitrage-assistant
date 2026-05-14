import { useMemo } from "react";
import { usePreferencesWorkspace } from "@/hooks/usePreferencesWorkspace";
import { useSecurityWorkspace } from "@/hooks/useSecurityWorkspace";
import { useProfileWorkspace } from "@/hooks/useProfileWorkspace";
import { useAccountCompleteness } from "@/hooks/useAccountCompleteness";

export function useBankingSettingsReadiness() {
  const preferences = usePreferencesWorkspace();
  const security = useSecurityWorkspace();
  const profile = useProfileWorkspace();
  const completeness = useAccountCompleteness();

  return useMemo(
    () => ({
      preferencesReady: preferences.isAuthenticated,
      securityReady: security.isAuthenticated,
      profileReady: profile.isAuthenticated,
      hasIdentity: Boolean(profile.userName || profile.userEmail),
      completenessPercentage: completeness.percentage,
      hasPrivacyControls:
        preferences.hideBalances ||
        preferences.biometricLogin ||
        preferences.pushNotifications,
      ready:
        preferences.isAuthenticated &&
        security.isAuthenticated &&
        profile.isAuthenticated,
    }),
    [preferences, security, profile, completeness],
  );
}
