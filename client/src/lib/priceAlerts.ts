export type PriceAlert = {
  id: string;
  name: string;
  query: string;
  marketplace: string;
  targetPrice: number;
  createdAt: number;
  lastCheckedAt?: number;
  lastFoundPrice?: number;
  triggered: boolean;
  triggeredAt?: number;
  foundUrl?: string;
  foundTitle?: string;
};

const KEY = "resell_price_alerts";

export function loadAlerts(): PriceAlert[] {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}
export function saveAlerts(alerts: PriceAlert[]): void {
  localStorage.setItem(KEY, JSON.stringify(alerts));
}
export function addAlert(a: Omit<PriceAlert, "id" | "createdAt" | "triggered">): PriceAlert[] {
  const alert: PriceAlert = { ...a, id: String(Date.now()), createdAt: Date.now(), triggered: false };
  const next = [alert, ...loadAlerts()];
  saveAlerts(next);
  return next;
}
export function updateAlert(id: string, patch: Partial<PriceAlert>): PriceAlert[] {
  const next = loadAlerts().map(a => a.id === id ? { ...a, ...patch } : a);
  saveAlerts(next);
  return next;
}
export function removeAlert(id: string): PriceAlert[] {
  const next = loadAlerts().filter(a => a.id !== id);
  saveAlerts(next);
  return next;
}
export function triggeredAlertsCount(): number {
  return loadAlerts().filter(a => a.triggered).length;
}
