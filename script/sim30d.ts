/**
 * Offline 30-day backtest — fetches real Kraken 5m OHLC and runs simulate().
 * Usage: npx tsx script/sim30d.ts
 */
import { simulate } from "../server/lib/strategySim";

async function fetchPage(pair: string, interval: number, since: number): Promise<any[]> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r = await fetch(
        `https://api.kraken.com/0/public/OHLC?pair=${pair}&interval=${interval}&since=${since}`,
        { signal: AbortSignal.timeout(15000) },
      );
      if (r.status === 429 || r.status >= 500) {
        await new Promise(res => setTimeout(res, 2000 * (attempt + 1)));
        continue;
      }
      if (!r.ok) return [];
      const d = await r.json() as any;
      if (d.error?.length) {
        if (d.error[0]?.includes?.("Rate limit")) {
          await new Promise(res => setTimeout(res, 3000 * (attempt + 1)));
          continue;
        }
        return [];
      }
      const key = Object.keys(d.result ?? {}).find(k => k !== "last");
      return key ? (d.result[key] ?? []) : [];
    } catch {
      if (attempt < 3) await new Promise(res => setTimeout(res, 1000 * (attempt + 1)));
    }
  }
  return [];
}

async function main() {
  const pair     = "XBTUSD";
  const FIVE     = 5 * 60;
  const wantDays = 30;
  const pages    = Math.ceil(wantDays * 24 * 60 / 5 / 720); // 720 candles/page

  let sinceP = Math.floor(Date.now() / 1000) - wantDays * 24 * 3600;
  let raw: any[] = [];

  console.log(`\nPobieranie ${wantDays} dni danych BTC 5m (${pages} stron × 720 świec)...\n`);

  for (let pg = 0; pg < pages; pg++) {
    const page = await fetchPage(pair, 5, sinceP);
    if (!page.length) { console.log(`  Strona ${pg + 1}: brak danych — przerywam`); break; }
    raw.push(...page);
    sinceP = page[page.length - 1][0] + FIVE;
    process.stdout.write(`  Strona ${pg + 1}/${pages}: +${page.length} świec (łącznie ${raw.length})\n`);
    if (pg < pages - 1) await new Promise(r => setTimeout(r, 700));
  }

  const seen = new Set<number>();
  raw = raw.filter(c => { if (seen.has(c[0])) return false; seen.add(c[0]); return true; })
           .sort((a: any, b: any) => a[0] - b[0]);
  const actualDays = Math.round(raw.length * 5 / 60 / 24);
  console.log(`\nŁącznie: ${raw.length} świec 5m (~${actualDays} dni)\n`);

  // 4H candles for trend filter
  const h4since = Math.floor(Date.now() / 1000) - 200 * 4 * 3600;
  const raw4 = await fetchPage(pair, 240, h4since);
  console.log(`4H świece: ${raw4.length}`);

  // ── Run ALL 3 configs for comparison ──────────────────────────────────────

  const configs = [
    {
      label: "Standardowy (przed zmianami)",
      p: { rsiMin: 36, rsiMax: 67, adxMin: 12, confluenceMin: 1, volMultMin: 1.0, cooldownMin: 20, stopLoss: 1.20, takeProfit: 2.50, trailPct: 0.45, leverage: 1, allowShorts: false },
    },
    {
      label: "Super agresywny (1×)",
      p: { rsiMin: 50, rsiMax: 58, adxMin: 5,  confluenceMin: 0, volMultMin: 0.5, cooldownMin: 5,  stopLoss: 0.80, takeProfit: 1.50, trailPct: 0.25, leverage: 1, allowShorts: false },
    },
    {
      label: "2× agresywny (obecny)",
      p: { rsiMin: 62, rsiMax: 52, adxMin: 2,  confluenceMin: 0, volMultMin: 0.2, cooldownMin: 2,  stopLoss: 0.40, takeProfit: 0.75, trailPct: 0.10, leverage: 1, allowShorts: false },
    },
  ];

  console.log(`\n${"═".repeat(65)}`);
  console.log(`SYMULACJA BTC/USD — ostatnie ${actualDays} dni (Kraken, bez dźwigni)`);
  console.log(`${"═".repeat(65)}\n`);

  for (const cfg of configs) {
    const r = simulate(raw, raw4, cfg.p as any);
    const pnl9 = (r.totalReturn / 100 * 9).toFixed(2); // na $9 kapitału

    console.log(`┌─ ${cfg.label}`);
    console.log(`│  Transakcji:    ${r.numTrades}  (${r.longs}L / ${r.shorts}S)`);
    console.log(`│  Win Rate:      ${r.winRate.toFixed(1)}%`);
    console.log(`│  Zwrot łączny:  ${r.totalReturn >= 0 ? "+" : ""}${r.totalReturn.toFixed(2)}%  (${"$"}9 → ${r.totalReturn >= 0 ? "+" : ""}${pnl9} USD)`);
    console.log(`│  Max Drawdown:  -${r.maxDrawdown.toFixed(2)}%`);
    console.log(`│  Avg Win:       +${r.avgWin.toFixed(3)}%  |  Avg Loss: ${r.avgLoss.toFixed(3)}%`);
    console.log(`│  Sharpe:        ${r.sharpe.toFixed(2)}`);
    if (r.trades.length > 0) {
      console.log(`│  Ostatnie 5:`);
      for (const t of r.trades.slice(-5)) {
        const icon = t.pnlPct >= 0 ? "✅" : "❌";
        console.log(`│    ${icon} ${t.dir.toUpperCase()} ${t.entry}→${t.exit}  ${t.pnlPct >= 0 ? "+" : ""}${t.pnlPct.toFixed(3)}%  [${t.reason}]  ${t.time.slice(5,10)}`);
      }
    }
    console.log(`└${"─".repeat(63)}\n`);
  }
}

main().catch(e => { console.error("Błąd:", e.message); process.exit(1); });
