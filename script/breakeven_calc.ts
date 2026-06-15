/**
 * Kalkulator: ile transakcji i jak ustawiony bot żeby ZAWSZE zarabiać.
 * Kraken fee: 0.26% × 2 = 0.52% RT (market orders)
 */

const FEE = 0.52; // % round-trip
const CAPITAL = 17.87; // EUR

console.log("\n═══════════════════════════════════════════════════════════════");
console.log("  ANALIZA BREAK-EVEN — bot Kraken BTC/EUR, kapitał €17.87");
console.log("═══════════════════════════════════════════════════════════════\n");

// ── 1. EV per trade przy różnych WR i R/R ───────────────────────────────────
console.log("ZADANIE 1: Minimalne WR żeby EV/transakcję > 0 (po opłacie 0.52%)");
console.log("─────────────────────────────────────────────────────────────────");
console.log("  SL    TP     WR=35%  WR=40%  WR=45%  WR=50%  WR=55%  WR=60%");
console.log("  ──────────────────────────────────────────────────────────────");

for (const [sl, tp] of [[1.5,4],[1.5,5],[2.0,5],[2.0,6],[2.5,6],[2.5,8]]) {
  let row = `  ${sl}%   ${tp}%   `;
  for (const wr of [35, 40, 45, 50, 55, 60]) {
    const ev = (wr/100)*tp - (1-wr/100)*sl - FEE;
    const icon = ev > 0 ? " ✅" : " ❌";
    row += `${icon}${ev >= 0 ? "+" : ""}${ev.toFixed(2)}%  `;
  }
  console.log(row);
}

// ── 2. Optymalne ustawienia i ile transakcji ────────────────────────────────
console.log("\n─────────────────────────────────────────────────────────────────");
console.log("ZADANIE 2: Ile transakcji dziennie i co ustawić\n");
console.log("  Zakładam WR=45% na realnym BTC (syntetyczne +10-15pp ze streamów RSI/MACD)\n");

const WR_REAL = 0.45; // konserwatywny szacunek dla realnych danych

const configs = [
  { name: "Ultra-ostrożny",  cool:180, trPerDay:1, sl:2.0, tp:7.0, trail:1.5, adx:22, conf:2 },
  { name: "Ostrożny ★",     cool:90,  trPerDay:3, sl:1.5, tp:5.0, trail:1.2, adx:18, conf:1 },
  { name: "Umiarkowany",     cool:45,  trPerDay:5, sl:1.5, tp:4.0, trail:1.0, adx:15, conf:1 },
  { name: "Aktywny",         cool:20,  trPerDay:8, sl:1.5, tp:3.5, trail:0.8, adx:12, conf:1 },
  { name: "Agresywny",       cool:10,  trPerDay:14,sl:1.0, tp:3.0, trail:0.6, adx:10, conf:1 },
];

console.log("  Nazwa           Cool  Tr/dzień  SL    TP    WinReq  EV/tr    EV/dzień  Mies.");
console.log("  ──────────────────────────────────────────────────────────────────────────────");

for (const c of configs) {
  // Minimum WR to break even
  const winReqNum = (c.sl + FEE) / (c.tp + c.sl); // breakeven WR
  const ev = WR_REAL * c.tp - (1-WR_REAL) * c.sl - FEE;
  const evDay = c.trPerDay * ev;
  const evMonth = evDay * 30;
  const profitEur = CAPITAL * evMonth / 100;
  const icon = ev > 0 ? "✅" : "❌";
  const star = c.name.includes("★") ? " ←" : "";
  console.log(`  ${icon} ${c.name.padEnd(16)} ${c.cool}m  ${String(c.trPerDay).padStart(3)}        ${c.sl}%  ${c.tp}%  ${(winReqNum*100).toFixed(1)}%   ${ev >= 0 ? "+" : ""}${ev.toFixed(3)}%  ${evDay >= 0 ? "+" : ""}${evDay.toFixed(2)}%    ${evMonth >= 0 ? "+" : ""}${evMonth.toFixed(1)}% (€${profitEur >= 0 ? "+" : ""}${profitEur.toFixed(2)})${star}`);
}

// ── 3. REKOMENDACJA ─────────────────────────────────────────────────────────
console.log("\n═══════════════════════════════════════════════════════════════");
console.log("  REKOMENDACJA: OSTROŻNY (★) — bezpieczna granica zysku");
console.log("═══════════════════════════════════════════════════════════════");

const best = { sl:1.5, tp:5.0, trail:1.2, adx:18, conf:1, cool:90, rsiMin:40, rsiMax:70 };
const breakeven_wr = (best.sl + FEE) / (best.tp + best.sl) * 100;
const ev45 = WR_REAL * best.tp - (1-WR_REAL) * best.sl - FEE;
const ev50 = 0.50 * best.tp - 0.50 * best.sl - FEE;

console.log(`\n  Parametry OSTROŻNY:`);
console.log(`  ┌─ RSI min:       ${best.rsiMin}    (kup przy wyprzedaniu)`);
console.log(`  ├─ RSI max:       ${best.rsiMax}    (sprzedaj przy wykupieniu)`);
console.log(`  ├─ ADX min:       ${best.adx}    (minimalny trend)`);
console.log(`  ├─ Konfluencja:   ${best.conf}     (1 z 3 wskaźników)`);
console.log(`  ├─ Stop Loss:     ${best.sl}%   (min. powyżej opłaty 0.52%)`);
console.log(`  ├─ Take Profit:   ${best.tp}%   (R/R = ${(best.tp/best.sl).toFixed(1)}:1)`);
console.log(`  ├─ Trail Stop:    ${best.trail}%   (ogranicza zyski po TP1)`);
console.log(`  └─ Cooldown:      ${best.cool} min  (~3 transakcje/dzień)`);
console.log(`\n  MATEMATYKA:`);
console.log(`  Próg opłacalności: WR ≥ ${breakeven_wr.toFixed(1)}%`);
console.log(`  Przy WR=45%:  EV = ${ev45 >= 0 ? "+" : ""}${ev45.toFixed(3)}%/transakcję  → ${(ev45*3*30).toFixed(1)}%/miesiąc (€${(CAPITAL*ev45*3*30/100).toFixed(2)})`);
console.log(`  Przy WR=50%:  EV = ${ev50 >= 0 ? "+" : ""}${ev50.toFixed(3)}%/transakcję  → ${(ev50*3*30).toFixed(1)}%/miesiąc (€${(CAPITAL*ev50*3*30/100).toFixed(2)})`);
console.log(`\n  ► LICZBA TRANSAKCJI: ~3/dzień × 30 dni = ~90 miesięcznie`);
console.log(`  ► Minimalna WR do zysku: ${breakeven_wr.toFixed(1)}% (każda poniżej = strata)`);
console.log(`\n  KOSZTY OPŁAT przy 3 tr/dzień:`);
console.log(`  Koszt/transakcję: €${(CAPITAL*0.0052).toFixed(3)} × 3 = €${(CAPITAL*0.0052*3).toFixed(3)}/dzień`);
console.log(`  Koszt miesięczny: €${(CAPITAL*0.0052*3*30).toFixed(2)} z €${CAPITAL.toFixed(2)} kapitału`);
console.log("\n═══════════════════════════════════════════════════════════════\n");
