import { simulate } from "../server/lib/strategySim";

function buildBtcSeries(days = 30, startPrice = 60_000, seed = 42): any[] {
  let s = seed;
  const rand = () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };
  const randn = () => { const u = rand() + 1e-10, v = rand() + 1e-10; return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const totalCandles = days * 24 * 12;
  const startTs = Math.floor(Date.now() / 1000) - days * 24 * 3600;
  const regimeLen = () => Math.floor(12 * 4 + rand() * 12 * 8);
  const regimes: { drift: number; vol: number; len: number }[] = [];
  let totalLen = 0;
  while (totalLen < totalCandles) {
    const r = rand();
    let drift = 0, vol = 0.0008;
    if (r < 0.25) { drift = 0.0004; vol = 0.0010; } else if (r < 0.40) { drift = -0.0003; vol = 0.0012; } else { drift = 0.0000; vol = 0.0007; }
    const len = regimeLen();
    regimes.push({ drift, vol, len });
    totalLen += len;
  }
  const rows: any[] = [];
  let price = startPrice;
  let regIdx = 0, regPos = 0;
  for (let i = 0; i < totalCandles; i++) {
    const regime = regimes[regIdx];
    const ret = regime.drift + randn() * regime.vol;
    const open = price;
    price = Math.max(price * (1 + ret), 1);
    const spread = price * (0.0010 + rand() * 0.0015);
    const high = Math.max(open, price) + spread * rand();
    const low  = Math.min(open, price) - spread * rand();
    const vol5m = 8 + rand() * 15 + (rand() > 0.92 ? rand() * 50 : 0);
    rows.push([startTs + i * 300, open.toFixed(1), high.toFixed(1), low.toFixed(1), price.toFixed(1), ((high + low) / 2).toFixed(1), vol5m.toFixed(3), Math.floor(50 + rand() * 200)]);
    if (++regPos >= regime.len) { regIdx = Math.min(regIdx + 1, regimes.length - 1); regPos = 0; }
  }
  return rows;
}

function build4hSeries(raw5m: any[]): any[] {
  const rows4h: any[] = [];
  for (let i = 0; i < raw5m.length - 47; i += 48) {
    const block = raw5m.slice(i, i + 48);
    const o = block[0][1], c = block[47][4];
    const h = Math.max(...block.map((r: any) => parseFloat(r[2])));
    const l = Math.min(...block.map((r: any) => parseFloat(r[3])));
    const v = block.reduce((s: number, r: any) => s + parseFloat(r[6]), 0);
    rows4h.push([block[0][0], o, String(h), String(l), c, String((h + l) / 2), String(v), 48]);
  }
  return rows4h;
}

const raw = buildBtcSeries(30, 60_000);
const raw4 = build4hSeries(raw);

const configs = [
  { label: "Aktualny (SL 1%, TP 2%, trail 0.4%)", p: { rsiMin: 55, rsiMax: 60, adxMin: 5, confluenceMin: 0, volMultMin: 0.2, cooldownMin: 2, stopLoss: 1.00, takeProfit: 2.00, trailPct: 0.40, leverage: 1, allowShorts: false } },
  { label: "Szeroki (SL 2%, TP 5%, trail 0.8%)", p: { rsiMin: 55, rsiMax: 60, adxMin: 5, confluenceMin: 0, volMultMin: 0.2, cooldownMin: 2, stopLoss: 2.00, takeProfit: 5.00, trailPct: 0.80, leverage: 1, allowShorts: false } },
  { label: "Hold dłużej (SL 3%, TP 8%, trail 1.5%)", p: { rsiMin: 55, rsiMax: 60, adxMin: 5, confluenceMin: 0, volMultMin: 0.2, cooldownMin: 5, stopLoss: 3.00, takeProfit: 8.00, trailPct: 1.50, leverage: 1, allowShorts: false } },
  { label: "Selektywny (konfluencja=1, cooldown 30min, SL 2%, TP 5%)", p: { rsiMin: 40, rsiMax: 65, adxMin: 10, confluenceMin: 1, volMultMin: 0.8, cooldownMin: 30, stopLoss: 2.00, takeProfit: 5.00, trailPct: 1.00, leverage: 1, allowShorts: false } },
  { label: "Bardzo selektywny (konfluencja=2, cooldown 1h, SL 2%, TP 6%)", p: { rsiMin: 35, rsiMax: 68, adxMin: 15, confluenceMin: 2, volMultMin: 1.0, cooldownMin: 60, stopLoss: 2.00, takeProfit: 6.00, trailPct: 1.20, leverage: 1, allowShorts: false } },
  { label: "Mega selektywny (ADX 25, konfluencja=2, cooldown 2h)", p: { rsiMin: 30, rsiMax: 70, adxMin: 25, confluenceMin: 2, volMultMin: 1.5, cooldownMin: 120, stopLoss: 2.00, takeProfit: 6.00, trailPct: 1.50, leverage: 1, allowShorts: false } },
];

console.log("\nBTC syntetyczny: $60K → $107K (+80%) | 30 dni | 8640 świec 5m\n");
console.log("─".repeat(70));
for (const cfg of configs) {
  const r = simulate(raw, raw4, cfg.p as any);
  const pnl9 = (r.totalReturn / 100 * 9);
  const icon = r.totalReturn >= 0 ? "✅" : "❌";
  const rr = r.avgWin > 0 && r.avgLoss < 0 ? (r.avgWin / Math.abs(r.avgLoss)).toFixed(2) : "—";
  console.log(`${icon} ${cfg.label}`);
  console.log(`   Transakcji: ${r.numTrades}  |  Win Rate: ${r.winRate.toFixed(1)}%  |  Max DD: -${r.maxDrawdown.toFixed(1)}%`);
  console.log(`   Zwrot: ${r.totalReturn >= 0 ? "+" : ""}${r.totalReturn.toFixed(2)}%  (${pnl9 >= 0 ? "+" : ""}$${pnl9.toFixed(2)} na $9 kapitału)`);
  console.log(`   Avg Win: +${r.avgWin.toFixed(3)}%  |  Avg Loss: ${r.avgLoss.toFixed(3)}%  |  R/R: ${rr}  |  Sharpe: ${r.sharpe.toFixed(2)}`);
  console.log("─".repeat(70));
}
