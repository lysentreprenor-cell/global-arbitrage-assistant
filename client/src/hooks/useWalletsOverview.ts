import { useMemo } from "react";
import { useAppStore, CURRENCY_SYMBOLS, type CurrencyCode } from "@/lib/store";

export function useWalletsOverview() {
  const { wallets, fxRates } = useAppStore();

  return useMemo(() => {
    const currencies = Object.keys(wallets) as CurrencyCode[];
    const activeWallets = currencies.filter(c => wallets[c] > 0);
    const activeCount = activeWallets.length;

    const totalWealthUSD = currencies.reduce(
      (sum, code) => {
        const rate = fxRates[code];
        if (!rate || rate <= 0) return sum;
        return sum + wallets[code] / rate;
      },
      0,
    );

    const largestEntry = currencies.reduce(
      (best, code) => {
        const rate = fxRates[code];
        const usd = rate && rate > 0 ? wallets[code] / rate : 0;
        return usd > (best?.usd ?? 0) ? { code, usd, amount: wallets[code] } : best;
      },
      null as { code: CurrencyCode; usd: number; amount: number } | null,
    );

    const formattedLargestWallet = largestEntry
      ? `${CURRENCY_SYMBOLS[largestEntry.code]}${largestEntry.amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : "—";

    return {
      balances: wallets,
      activeCount,
      totalWallets: currencies.length,
      totalWealthUSD,
      formattedLargestWallet,
      largestWallet: largestEntry,
    };
  }, [wallets, fxRates]);
}
