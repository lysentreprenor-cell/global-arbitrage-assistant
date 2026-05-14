import { useMemo } from "react";
import { useBankingOperationsReadiness } from "@/hooks/useBankingOperationsReadiness";
import { useBankingCommunicationReadiness } from "@/hooks/useBankingCommunicationReadiness";
import { useBankingSettingsReadiness } from "@/hooks/useBankingSettingsReadiness";
import { useBankingCardsReadiness } from "@/hooks/useBankingCardsReadiness";
import { useBankingAdminReadiness } from "@/hooks/useBankingAdminReadiness";
import { useBankingDashboardReadiness } from "@/hooks/useBankingDashboardReadiness";

export function useBankingReleaseChecklist() {
  const operations = useBankingOperationsReadiness();
  const communication = useBankingCommunicationReadiness();
  const settings = useBankingSettingsReadiness();
  const cards = useBankingCardsReadiness();
  const admin = useBankingAdminReadiness();
  const dashboard = useBankingDashboardReadiness();

  return useMemo(() => {
    const items = [
      { key: "dashboard", label: "Dashboard", done: dashboard.ready },
      { key: "operations", label: "Operations", done: operations.ready },
      { key: "communication", label: "Communication", done: communication.ready },
      { key: "settings", label: "Settings", done: settings.ready },
      { key: "cards", label: "Cards", done: cards.ready },
      { key: "admin", label: "Admin", done: admin.ready },
    ];

    const completedCount = items.filter((item) => item.done).length;

    return {
      items,
      completedCount,
      totalCount: items.length,
      percentage:
        items.length === 0 ? 0 : Math.round((completedCount / items.length) * 100),
      isReleaseReady: completedCount === items.length,
    };
  }, [operations, communication, settings, cards, admin, dashboard]);
}
