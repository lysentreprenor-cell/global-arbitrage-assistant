import { useMemo } from "react";
import { useAppStore } from "@/lib/store";

export function useSupportSummary() {
  const { supportTickets } = useAppStore();

  return useMemo(() => {
    const openCount = supportTickets.filter(t => t.status === "open" || t.status === "pending").length;
    const recentTickets = [...supportTickets].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
    const latestTicket = recentTickets[0] ?? null;

    return {
      tickets: supportTickets,
      recentTickets,
      latestTicket,
      openCount,
      total: supportTickets.length,
      hasOpen: openCount > 0,
    };
  }, [supportTickets]);
}
