import { useMemo } from "react";
import { useAdminWorkspace } from "@/hooks/useAdminWorkspace";
import { useModuleHealthSnapshot } from "@/hooks/useModuleHealthSnapshot";

export function useBankingAdminReadiness() {
  const admin = useAdminWorkspace();
  const health = useModuleHealthSnapshot();

  return useMemo(
    () => ({
      isAdminRouteAvailable: admin.isAdminRouteAvailable,
      hasSnapshot: Boolean(admin.snapshot),
      moduleHealthPercentage: health.health.percentage,
      ready: admin.isAuthenticated && admin.isAdminRouteAvailable,
    }),
    [admin, health],
  );
}
