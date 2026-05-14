/**
 * Wallet state hook with derived values.
 * Wraps wallet state + operations from the store and adds computed helpers:
 * total portfolio value in USD, sorted currency list, per-wallet USD values, etc.
 */

import { useMemo } from "react";
import { useAppStore, CURRENCY_SYMBOLS, type CurrencyCode, type Wallets } from "@/lib/store";

export type WalletEntry = {
  currency: CurrencyCode;
  symbol: string;
  balance: number;
  balanceUSD: number;
  fxRate: number;
};

export type WalletsInfo = {
  wallets:         Wallets;
  entries:         WalletEntry[];
  totalUSD:        number;
  activeCurrencies: CurrencyCode[];
  zeroCurrencies:  CurrencyCode[];
  exchangeCurrency: (from: CurrencyCode, to: CurrencyCode, amount: number) => Promise<{ success: boolean; error?: string; received?: number }>;
  depositToWallet:  (currency: CurrencyCode, amount: number) => void;
};

const CURRENCY_ORDER: CurrencyCode[] = ["USD", "EUR", "GBP", "CHF", "PLN"];

export function useWallets(): WalletsInfo {
  const { wallets, exchangeCurrency, depositToWallet, fxRates } = useAppStore();

  const entries = useMemo<WalletEntry[]>(() => {
    return CURRENCY_ORDER.map((currency) => {
      const balance   = wallets[currency] ?? 0;
      const fxRate    = fxRates[currency] ?? 1;
      const balanceUSD = fxRate > 0 ? parseFloat((balance / fxRate).toFixed(2)) : 0;
      return {
        currency,
        symbol:     CURRENCY_SYMBOLS[currency],
        balance,
        balanceUSD,
        fxRate,
      };
    });
  }, [wallets, fxRates]);

  const totalUSD = useMemo(
    () => parseFloat(entries.reduce((sum, e) => sum + e.balanceUSD, 0).toFixed(2)),
    [entries],
  );

  const activeCurrencies = useMemo(
    () => entries.filter((e) => e.balance > 0).map((e) => e.currency),
    [entries],
  );

  const zeroCurrencies = useMemo(
    () => entries.filter((e) => e.balance === 0).map((e) => e.currency),
    [entries],
  );

  return {
    wallets,
    entries,
    totalUSD,
    activeCurrencies,
    zeroCurrencies,
    exchangeCurrency,
    depositToWallet,
  };
}
