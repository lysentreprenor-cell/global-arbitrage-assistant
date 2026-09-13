/**
 * 30-day backtest on synthetic BTC-like data (realistic volatility + trend regimes).
 * Since Kraken is not reachable from this environment, we generate a price series
 * that matches real BTC 5m characteristics: ~1.5% daily vol, trending + ranging phases.
 */
import { simulate } from "../server/lib/strategySim";

function buildBtcSeries(days = 30, startPrice = 60_000, seed = 42): any[] {
  // Seeded pseudo-random (LCG)
  let s = seed;
  const rand = () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };
  const randn = () => {
    // Box-Muller
    const u = rand() + 1e-10, v = rand() + 1e-10;
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  const totalCandles = days * 24 * 12; // 12 candles per hour at 5m
  const startTs = Math.floor(Date.now() / 1000) - days * 24 * 3600;

  // Regime parameters: 60% ranging, 25% trending up, 15% trending down
  const regimeLen = () => Math.floor(12 * 4 + rand() * 12 * 8); // 4–12h regimes
  const regimes: { drift: number; vol: number; len: number }[] = [];
  let totalLen = 0;
  while (totalLen < totalCandles) {
    const r = rand();
    let drift = 0, vol = 0.0008; // ~1.5% daily vol per 5m candle
    if (r < 0.25)       { drift =  0.0004; vol = 0.0010; } // uptrend
    else if (r < 0.40)  { drift = -0.0003; vol = 0.0012; } // downtrend
    else                { drift =  0.0000; vol = 0.0007; } // range
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

    // Realistic H/L spread: ATR typically 0.15-0.25% per 5m candle
    const spread = price * (0.0010 + rand() * 0.0015);
    const high = Math.max(open, price) + spread * rand();
    const low  = Math.min(open, price) - spread * rand();
    // Volume: base 10 BTC + spikes
    const vol5m = 8 + rand() * 15 + (rand() > 0.92 ? rand() * 50 : 0);

    rows.push([
      startTs + i * 300,
      open.toFixed(1), high.toFixed(1), low.toFixed(1), price.toFixed(1),
      ((high + low) / 2).toFixed(1), vol5m.toFixed(3), Math.floor(50 + rand() * 200),
    ]);

    if (++regPos >= regime.len) { regIdx = Math.min(regIdx + 1, regimes.length - 1); regPos = 0; }
  }
  return rows;
}

function build4hSeries(raw5m: any[]): any[] {
  // Aggregate 5m into 4h candles (48 × 5m = 4h)
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

async function main() {
  console.log("\nGenerowanie 30-dniowej historii BTC 5m (syntetyczne dane)...\n");

  const raw  = buildBtcSeries(30, 60_000);
  const raw4 = build4hSeries(raw);
  const actualDays = Math.round(raw.length * 5 / 60 / 24);

  // Price range of synthetic data
  const closes = raw.map((r: any) => parseFloat(r[4]));
  const pMin = Math.min(...closes).toFixed(0), pMax = Math.max(...closes).toFixed(0);
  const pFirst = parseFloat(raw[0][4]).toFixed(0), pLast = closes[closes.length - 1].toFixed(0);
  console.log(`Świec: ${raw.length} (${actualDays} dni)  |  BTC: $${pFirst} → $${pLast}  |  range: $${pMin}–$${pMax}`);
  console.log(`4H świece: ${raw4.length}\n`);

  const configs = [
    {
      label: "Standardowy (przed zmianami)",
      p: { rsiMin: 36, rsiMax: 67, adxMin: 12, confluenceMin: 1, volMultMin: 1.0, cooldownMin: 20, stopLoss: 1.20, takeProfit: 2.50, trailPct: 0.45, leverage: 1, allowShorts: false },
    },
    {
      label: "Naprawiony (AKTUALNY — SL 1%, TP 2%, agresywne wejścia)",
      p: { rsiMin: 55, rsiMax: 60, adxMin: 5,  confluenceMin: 0, volMultMin: 0.2, cooldownMin: 2,  stopLoss: 1.00, takeProfit: 2.00, trailPct: 0.40, leverage: 1, allowShorts: false },
    },
    {
      label: "Szeroki SL/TP (SL 2%, TP 5%, trail 0.8%)",
      p: { rsiMin: 55, rsiMax: 60, adxMin: 5,  confluenceMin: 0, volMultMin: 0.2, cooldownMin: 5,  stopLoss: 2.00, takeProfit: 5.00, trailPct: 0.80, leverage: 1, allowShorts: false },
    },
    {
      label: "Ostrożny (SL 1.5%, TP 4%, trail 0.6%, cooldown 15min)",
      p: { rsiMin: 40, rsiMax: 65, adxMin: 15, confluenceMin: 1, volMultMin: 0.8, cooldownMin: 15, stopLoss: 1.50, takeProfit: 4.00, trailPct: 0.60, leverage: 1, allowShorts: false },
    },
  ];

  console.log("═".repeat(66));
  console.log(`  SYMULACJA BTC/USD — ${actualDays} dni  |  kapital $9  |  spot Kraken`);
  console.log("═".repeat(66));

  for (const cfg of configs) {
    const r = simulate(raw, raw4, cfg.p as any);
    const pnl = (r.totalReturn / 100 * 9);
    const indicator = r.totalReturn >= 0 ? "✅" : "❌";

    console.log(`\n${indicator} ${cfg.label}`);
    console.log(`   Transakcji:    ${r.numTrades}  (${r.longs}L / ${r.shorts}S)`);
    console.log(`   Win Rate:      ${r.winRate.toFixed(1)}%`);
    console.log(`   Zwrot:         ${r.totalReturn >= 0 ? "+" : ""}${r.totalReturn.toFixed(2)}%  (${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)} na $9 kapitału)`);
    console.log(`   Max Drawdown:  -${r.maxDrawdown.toFixed(2)}%`);
    console.log(`   Avg Win:       +${r.avgWin.toFixed(3)}%  |  Avg Loss: ${r.avgLoss.toFixed(3)}%`);
    console.log(`   Sharpe:        ${r.sharpe.toFixed(2)}`);

    if (r.trades.length > 0) {
      const wins  = r.trades.filter(t => t.pnlPct > 0).length;
      const losss = r.trades.length - wins;
      console.log(`   Wygrane/Straty: ${wins}W / ${losss}L`);
      console.log(`   Ostatnie transakcje:`);
      for (const t of r.trades.slice(-8)) {
        const icon = t.pnlPct >= 0 ? "  ✅" : "  ❌";
        console.log(`${icon}  ${t.dir.toUpperCase()}  $${t.entry}→$${t.exit}  ${t.pnlPct >= 0 ? "+" : ""}${t.pnlPct.toFixed(3)}%  [${t.reason}]`);
      }
    } else {
      console.log(`   Brak transakcji w tym okresie`);
    }
  }

  console.log("\n" + "═".repeat(66));
  console.log("⚠️  UWAGA: Dane syntetyczne — Kraken API niedostępne z tego środowiska.");
  console.log("   Po wdrożeniu kliknij 'Symuluj' w aplikacji — użyje realnych danych.");
  console.log("═".repeat(66) + "\n");
}

main().catch(e => { console.error(e); process.exit(1); });
// This appended code won't run — using inline script below
