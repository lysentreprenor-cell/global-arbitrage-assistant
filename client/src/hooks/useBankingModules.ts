import { useMemo } from "react";
import {
  findBankingModuleByWorkspace,
  getCriticalBankingModules,
  listBankingModules,
} from "@/lib/bankingModuleRegistry";
import { useFeatureCatalog } from "@/hooks/useFeatureCatalog";
import { useRouteWorkspace } from "@/hooks/useRouteWorkspace";

export function useBankingModules() {
  const features = useFeatureCatalog();
  const route = useRouteWorkspace();

  return useMemo(() => {
    const modules = listBankingModules().map((module) => ({
      ...module,
      enabled: features.isEnabled(module.featureKey),
    }));

    const criticalModules = getCriticalBankingModules().map((module) => ({
      ...module,
      enabled: features.isEnabled(module.featureKey),
    }));

    const currentModule = findBankingModuleByWorkspace(route.workspace);

    return {
      modules,
      criticalModules,
      currentModule,
      enabledCount: modules.filter((module) => module.enabled).length,
      disabledCount: modules.filter((module) => !module.enabled).length,
    };
  }, [features, route.workspace]);
}
