import { useMemo } from "react";
import { useCurrentUser } from "@/hooks/useCurrentUser";

export function useMoneyOverview() {
  const user = useCurrentUser();

  return useMemo(
    () => ({
      isAuthenticated: user.isAuthenticated,
      availableBalance: user.balance,
      transferDailyLimit: user.transferLimits.daily,
      transferMonthlyLimit: user.transferLimits.monthly,
      cardDailyLimit: user.cardLimits.daily,
      cardMonthlyLimit: user.cardLimits.monthly,
      cardAtmLimit: user.cardLimits.atm,
    }),
    [user],
  );
}
