import { useMemo } from "react";
import { useOperationsOverview } from "@/hooks/useOperationsOverview";
import { useTransferWorkspace } from "@/hooks/useTransferWorkspace";
import { useHistoryWorkspace } from "@/hooks/useHistoryWorkspace";

export function useBankingOperationsReadiness() {
  const overview = useOperationsOverview();
  const transfer = useTransferWorkspace();
  const history = useHistoryWorkspace();

  return useMemo(
    () => ({
      canTransfer: transfer.canTransfer,
      hasContacts: transfer.contacts.length > 0,
      hasRecentContacts: transfer.recentContacts.length > 0,
      hasTransactions: history.total > 0,
      hasLatestTransaction: Boolean(history.latestTransaction),
      hasWalletActions:
        Boolean(overview.depositToWallet) && Boolean(overview.exchangeCurrency),
      ready:
        transfer.isAuthenticated &&
        Boolean(overview.depositToWallet) &&
        Boolean(overview.exchangeCurrency),
    }),
    [overview, transfer, history],
  );
}
