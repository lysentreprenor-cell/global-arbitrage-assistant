/**
 * ══════════════════════════════════════════════════════════════════════════
 *  ResellAssist — barwy platform zewnętrznych
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  Osobny plik od `palette.ts`, i to celowo. Paleta nazywa kolory rolami:
 *  zysk, strata, marka, AI. Kolor eBaya nie jest żadną z tych rzeczy — jest
 *  cudzą barwą firmową, której nie wybieramy i której nie wolno wciągać do
 *  systemu znaczeń. Dlatego róż TikToka stoi tu jako `"rgba(236,72,153,0.8)"`,
 *  a nie jako odwołanie do `palette.loss`, mimo że odcień bywa podobny.
 *
 *  Wartości przepisane 1:1 z ekranów. Migracja jest mechaniczna i nie zmienia
 *  ani jednego piksela.
 *
 *  ⚠ NIESPÓJNOŚĆ, KTÓRA ZOSTAJE NIETKNIĘTA
 *
 *  Ta sama marka ma dziś różne barwy na różnych ekranach:
 *
 *      marka       Dashboard          OfferPage / ProductDetail   ProfitPage
 *      ─────────────────────────────────────────────────────────────────────
 *      Etsy        czerwień #f87171   pomarańcz #f97316           pomarańcz
 *      Amazon      błękit   #60a5fa   mięta     #34d399           DE: #86efac
 *      Vinted      mięta    #34d399   purpura   #c084fc           purpura
 *      StockX      zieleń   #4ade80   fiolet    #a78bfa           fiolet
 *      eBay        złoto    #f5c842   złoto / błękit wg regionu   jak obok
 *
 *  Te same barwy były wpisane w PIĘCIU miejscach: Dashboard, OfferPage,
 *  ProfitPage, ProductDetail i MarketingPage. Stąd rozjazdy — każda kopia
 *  żyła własnym życiem. Teraz źródłem jest ten plik.
 *
 *  Wyciągnięcie tego do jednego pliku niczego nie naprawia — tylko pokazuje.
 *  Ujednolicenie zmieniłoby wygląd kilku ekranów, więc jest decyzją do
 *  podjęcia osobno, nie skutkiem ubocznym refaktoru. Do tego czasu każdy ekran
 *  czyta swoją mapę i wygląda jak dotąd.
 */

/* ─────────────────────────────────────────────────────────────────────────
   PLAKIETKA MARKETPLACE — Dashboard

   Klucz dopasowywany przez `name.includes(k)`, dlatego kolejność ma znaczenie
   i dlatego jest tu wpis "default".
   ───────────────────────────────────────────────────────────────────────── */
export type MarketplaceBadge = { bg: string; border: string; text: string };

export const marketplaceBadge: Record<string, MarketplaceBadge> = {
  "eBay":    { bg: "rgba(245,200,66,0.13)",  border: "rgba(245,200,66,0.3)",  text: "#f5c842" },
  "Etsy":    { bg: "rgba(248,113,113,0.13)", border: "rgba(248,113,113,0.3)", text: "#f87171" },
  "Amazon":  { bg: "rgba(96,165,250,0.13)",  border: "rgba(96,165,250,0.3)",  text: "#60a5fa" },
  "StockX":  { bg: "rgba(74,222,128,0.13)",  border: "rgba(74,222,128,0.3)",  text: "#4ade80" },
  "Vinted":  { bg: "rgba(52,211,153,0.13)",  border: "rgba(52,211,153,0.3)",  text: "#34d399" },
  "Depop":   { bg: "rgba(244,114,182,0.13)", border: "rgba(244,114,182,0.3)", text: "#f472b6" },
  "default": { bg: "rgba(139,92,246,0.13)",  border: "rgba(139,92,246,0.3)",  text: "#a78bfa" },
};

/* ─────────────────────────────────────────────────────────────────────────
   AKCENT MARKETPLACE Z REGIONEM — OfferPage

   Inny zestaw niż powyżej; różnice wypisane w nagłówku. Kluczowane pełną
   nazwą wraz z regionem, bo ten ekran rozróżnia „eBay USA" i „eBay DE".
   ───────────────────────────────────────────────────────────────────────── */
export const marketplaceAccent: Record<string, string> = {
  "eBay USA": "#f5c842", "Etsy USA": "#f97316", "Amazon UK": "#34d399",
  "Amazon DE": "#34d399", "eBay DE": "#60a5fa", "StockX USA": "#a78bfa",
  "Vinted EU": "#c084fc", "Depop": "#f87171",
};

/* ─────────────────────────────────────────────────────────────────────────
   USŁUGI ZEWNĘTRZNE — Settings

   Nie marketplace'y, ale ta sama zasada: cudza barwa firmowa, nie nasza rola.
   Kraken ma fiolet, Bybit pomarańcz, Google swój błękit — nie mamy tu nic do
   decydowania, tylko do odwzorowania.
   ───────────────────────────────────────────────────────────────────────── */
export const serviceBrand: Record<string, string> = {
  /** Cztery barwy Google — narzędzia Gemini, Imagen i Google Ads */
  google: "#4285f4",
  googleRed: "#ea4335",
  googleYellow: "#fbbc04",
  googleGreen: "#34a853",
  /** Meta Ads — Facebook i Instagram */
  meta: "#1877f2",
  metaDeep: "#0a52cc",
  bybit: "#f7931a",
  kraken: "#5741d9",
};

/* ─────────────────────────────────────────────────────────────────────────
   PRESET KALKULATORA — ProfitPage

   Trzeci zestaw barw marek. Pokrywa się z `marketplaceAccent` we wszystkim
   poza Amazonem DE: tutaj jest jasna zieleń #86efac, tam mięta #34d399.
   Różnica zostaje, bo jej usunięcie zmieniłoby wygląd jednego z ekranów.
   ───────────────────────────────────────────────────────────────────────── */
export const marketplacePreset: Record<string, string> = {
  "eBay USA": "#f5c842", "Etsy USA": "#f97316", "Amazon UK": "#34d399",
  "eBay DE": "#60a5fa", "StockX": "#a78bfa", "Vinted": "#c084fc",
  "Amazon DE": "#86efac", "Depop": "#f87171",
};

/* ─────────────────────────────────────────────────────────────────────────
   SERWISY SPOŁECZNOŚCIOWE — MarketingPage

   Barwy firmowe serwisów, w dwóch mocach: akcent na tekst i tło plakietki.
   ───────────────────────────────────────────────────────────────────────── */
export const socialAccent: Record<string, string> = {
  TikTok: "rgba(236,72,153,0.8)", Instagram: "rgba(168,85,247,0.8)",
  Facebook: "rgba(59,130,246,0.8)", YouTube: "rgba(239,68,68,0.8)",
};

export const socialBg: Record<string, string> = {
  TikTok: "rgba(236,72,153,0.15)", Instagram: "rgba(168,85,247,0.15)",
  Facebook: "rgba(59,130,246,0.15)", YouTube: "rgba(239,68,68,0.15)",
};
