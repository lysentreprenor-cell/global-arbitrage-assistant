import { useMemo } from "react";
import { useCardsWorkspace } from "@/hooks/useCardsWorkspace";
import { useWalletOverviewWorkspace } from "@/hooks/useWalletOverviewWorkspace";
import { useCardLimitsSubmission } from "@/hooks/useCardLimitsSubmission";

export function useBankingCardsReadiness() {
  const cards = useCardsWorkspace();
  const wallets = useWalletOverviewWorkspace();
  const limits = useCardLimitsSubmission();

  return useMemo(
    () => ({
      hasCardControls: cards.hasCardControls,
      hasWallets: wallets.totalWallets > 0,
      hasPositiveBalances: wallets.totalPositiveBalances > 0,
      canEditLimits: limits.canSubmit || cards.hasCardControls,
      ready: cards.hasCardControls && wallets.totalWallets > 0,
    }),
    [cards, wallets, limits],
  );
}
