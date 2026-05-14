import { useMemo } from "react";
import { useDashboardWorkspace } from "@/hooks/useDashboardWorkspace";
import { useDashboardInsightsSummary } from "@/hooks/useDashboardInsightsSummary";

export function useBankingDashboardReadiness() {
  const dashboard = useDashboardWorkspace();
  const insights = useDashboardInsightsSummary();

  return useMemo(
    () => ({
      dashboardReady: dashboard.dashboardReady,
      hasWalletData: dashboard.wallets.totalWallets > 0,
      hasTransactionData: dashboard.transactions.total > 0,
      hasNotificationData: dashboard.notifications.notifications.length > 0,
      moduleHealthPercentage: insights.modules.health.percentage,
      ready: dashboard.account.isAuthenticated,
    }),
    [dashboard, insights],
  );
}
