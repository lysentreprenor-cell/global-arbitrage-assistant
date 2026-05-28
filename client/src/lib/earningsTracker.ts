const KEY = "resell_earnings_v2";

export interface EarningRecord {
  id: string;
  date: string;
  profit: number;
  platform: string;
  product: string;
  sellPrice?: number;
  buyPrice?: number;
  orderId?: number;
}

export interface EarningsData {
  records: EarningRecord[];
  totalProfit: number;
  totalOrders: number;
}

export function loadEarnings(): EarningsData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as EarningsData;
  } catch {}
  return { records: [], totalProfit: 0, totalOrders: 0 };
}

export function recordEarning(rec: Omit<EarningRecord, "id" | "date">): void {
  const data = loadEarnings();
  const entry: EarningRecord = {
    ...rec,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    date: new Date().toISOString(),
  };
  data.records.unshift(entry);
  data.totalProfit = Math.round((data.totalProfit + rec.profit) * 100) / 100;
  data.totalOrders += 1;
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {}
}

export function getMonthProfit(): number {
  const data = loadEarnings();
  const start = new Date();
  start.setDate(1); start.setHours(0, 0, 0, 0);
  return Math.round(
    data.records
      .filter(r => new Date(r.date) >= start)
      .reduce((s, r) => s + r.profit, 0) * 100
  ) / 100;
}

export function getWeekProfit(): number {
  const data = loadEarnings();
  const start = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  return Math.round(
    data.records
      .filter(r => new Date(r.date) >= start)
      .reduce((s, r) => s + r.profit, 0) * 100
  ) / 100;
}

export function getBestDay(): { date: string; profit: number } | null {
  const data = loadEarnings();
  if (!data.records.length) return null;
  const byDay: Record<string, number> = {};
  for (const r of data.records) {
    const day = r.date.slice(0, 10);
    byDay[day] = (byDay[day] ?? 0) + r.profit;
  }
  const best = Object.entries(byDay).sort((a, b) => b[1] - a[1])[0];
  return best ? { date: best[0], profit: Math.round(best[1] * 100) / 100 } : null;
}
