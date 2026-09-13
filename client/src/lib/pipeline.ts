export type PipelineStatus = "planned" | "bought" | "listed" | "sold" | "abandoned";

export type PipelineItem = {
  id: number;
  name: string;
  buy: number;
  sell: number;
  profit: number;
  netProfit?: number;
  margin: number;
  market: string;
  markets?: string[];
  sellUrls?: Record<string, string>;
  category: string;
  score: number;
  flag: string;
  risk?: string;
  tip?: string;
  buyHint?: string;
  sellHint?: string;
  sourceUrl?: string;
  sellUrl?: string;
  imageUrl?: string;
  daysToSell?: number;
  // Pipeline-specific fields:
  status: PipelineStatus;
  note: string;
  listedOn: string[];      // platforms where user has already listed
  soldOn?: string;         // platform where sold
  savedAt: number;         // timestamp
  boughtAt?: number;
  soldAt?: number;
  soldPrice?: number;      // actual sell price achieved
  realBuyPrice?: number;   // actual buy price paid
  listedAt?: number;       // timestamp when status changed to "listed"
};

const KEY = "resell_pipeline";

export function loadPipeline(): PipelineItem[] {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}

export function savePipeline(items: PipelineItem[]): void {
  localStorage.setItem(KEY, JSON.stringify(items));
}

export function addToPipeline(opp: Omit<PipelineItem, "status" | "note" | "listedOn" | "savedAt">): PipelineItem[] {
  const existing = loadPipeline();
  if (existing.some(i => i.id === opp.id && i.name === opp.name)) return existing;
  const item: PipelineItem = { ...opp, status: "planned", note: "", listedOn: [], savedAt: Date.now() };
  const next = [item, ...existing];
  savePipeline(next);
  return next;
}

export function updatePipelineItem(id: number, name: string, patch: Partial<PipelineItem>): PipelineItem[] {
  const items = loadPipeline().map(i =>
    i.id === id && i.name === name ? { ...i, ...patch } : i
  );
  savePipeline(items);
  return items;
}

export function removeFromPipeline(id: number, name: string): PipelineItem[] {
  const items = loadPipeline().filter(i => !(i.id === id && i.name === name));
  savePipeline(items);
  return items;
}

export function isPipelineSaved(id: number, name: string): boolean {
  return loadPipeline().some(i => i.id === id && i.name === name);
}
