import { useMemo } from "react";
import { useAppStore, type CurrencyCode } from "@/lib/store";
import { useCurrentUser } from "@/hooks/useCurrentUser";

export function useHomeOverview() {
  const { wallets, notifications, conversations, fxRates } = useAppStore();
  const { balance, isAuthenticated } = useCurrentUser();

  return useMemo(() => {
    const activeWallets = Object.values(wallets).filter((v) => v > 0);
    const activeCount = activeWallets.length;

    const totalWealthUSD = (Object.keys(wallets) as CurrencyCode[]).reduce(
      (sum, code) => {
        const rate = fxRates[code];
        if (!rate || rate <= 0) return sum;
        return sum + wallets[code] / rate;
      },
      0,
    );

    const unreadNotifications = notifications.filter((n) => !n.read).length;
    const unreadMessages = conversations.reduce(
      (sum, c) => sum + (c.unreadCount ?? 0),
      0,
    );

    return {
      isAuthenticated,
      money: {
        availableBalance: balance,
        totalWealthUSD,
      },
      wallets: {
        balances: wallets,
        activeCount,
        totalWealthUSD,
      },
      inbox: {
        unreadNotifications,
        unreadMessages,
        totalUnread: unreadNotifications + unreadMessages,
      },
    };
  }, [balance, wallets, notifications, conversations, isAuthenticated, fxRates]);
}
