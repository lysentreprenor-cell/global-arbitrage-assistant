import { useMemo } from "react";
import { useBankingModules } from "@/hooks/useBankingModules";
import { useBankingReleaseChecklist } from "@/hooks/useBankingReleaseChecklist";
import { useRouteWorkspace } from "@/hooks/useRouteWorkspace";

export function useBankingWorkspaceSnapshot() {
  const modules = useBankingModules();
  const checklist = useBankingReleaseChecklist();
  const route = useRouteWorkspace();

  return useMemo(
    () => ({
      route,
      modules,
      checklist,
      summary: {
        currentWorkspace: route.workspace,
        hasCurrentModule: Boolean(modules.currentModule),
        enabledModules: modules.enabledCount,
        disabledModules: modules.disabledCount,
        releasePercentage: checklist.percentage,
      },
    }),
    [route, modules, checklist],
  );
}
