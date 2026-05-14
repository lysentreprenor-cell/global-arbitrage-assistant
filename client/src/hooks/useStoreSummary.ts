import { useMemo } from "react";
import { useAppStore } from "@/lib/store";

export function useStoreSummary() {
  const { transactions } = useAppStore();

  return useMemo(() => {
    const latestTransactions = [...transactions]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 20);

    const inflow = transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const outflow = transactions.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
    const recentCashflow = inflow - outflow;

    const latestTransaction = latestTransactions[0] ?? null;

    return {
      transactions,
      latestTransactions,
      latestTransaction,
      recentCashflow,
      inflow,
      outflow,
      total: transactions.length,
    };
  }, [transactions]);
}
