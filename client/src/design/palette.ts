/**
 * ══════════════════════════════════════════════════════════════════════════
 *  ResellAssist — paleta
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  Jedyne miejsce, w którym mieszkają wartości kolorów. Ekrany trzymały je
 *  wpisane na sztywno: 1773 wystąpienia `#hex` w 36 plikach, 171 różnych
 *  odcieni. Zmiana jednego odcienia zieleni znaczyła przejrzenie 1773 miejsc.
 *
 *  Punkt wyjścia: system „Meridian" z gałęzi claude/sprawdzenie-bledow-l2p30n.
 *  Przeniesiona została struktura — kolor musi coś znaczyć, inaczej nie ma go
 *  na ekranie. Same wartości są nasze: Meridian malował aplikację bankową
 *  (granat + mosiądz), ResellAssist stoi na ciemnej zieleni ze złotem.
 *
 *  Zakres: to jest rdzeń, czyli odcienie, które niosą znaczenie i powtarzają
 *  się w całej aplikacji. Długi ogon kolorów użytych raz albo dwa (54 sztuki)
 *  celowo tu nie trafił — każdy z nich to decyzja do podjęcia przy migracji
 *  konkretnego ekranu, a nie coś, co warto utrwalać.
 *
 *  Zmigrowane: 27 z 36 plików — cały `components/resell/` i dziewiętnaście
 *  ekranów. Zostało dziewięć: Settings, AgentPage, UpdatePage, Dashboard,
 *  VideoPage, AdsPage, TradingBot, AssistantPage, MarketingPage.
 *
 *  GRANICA, KTÓRA DECYDUJE, CO TU WCHODZI
 *
 *  Kolejny stopień rodziny, która już ma znaczenie — wchodzi. `#dc2626` to
 *  ciemniejsza czerwień straty, `#059669` ciemniejsza zieleń zysku; domykają
 *  istniejące skale i nie wnoszą nowego sensu do nauczenia.
 *
 *  Nowa rodzina barw — nie wchodzi bez decyzji, co ma znaczyć. Pozostałe
 *  ekrany czekają na sześć takich: pomarańcz (#f97316), purpura (#a855f7),
 *  róż (#ec4899), indygo (#6366f1), cyjan (#06b6d4) i malina (#f43f5e).
 *  Dopisanie ich „bo są w kodzie" zamieniłoby paletę w katalog odcieni, czyli
 *  w dokładnie ten stan, z którego wychodzimy.
 *
 *  Barwy firmowe platform (eBay, TikTok…) nie należą tu wcale — mieszkają
 *  w `platforms.ts`, bo nie są rolą w naszym systemie, tylko cudzą własnością.
 *
 *  Wstawki CSS w `<style>` i klasy Tailwind z kolorem w nawiasach
 *  (np. `bg-[#0a1a0f]`) zostają poza paletą: pierwsze to tekst, nie wyrażenia,
 *  drugie nie przyjmują wartości z JS.
 *
 *  UŻYCIE — zawsze przez przestrzeń nazw:
 *
 *      import * as palette from "@/design/palette";
 *      color: palette.profit.base
 *      border: `1px solid ${palette.alpha(palette.ai.strong, 0.28)}`
 *
 *  Nie importuj tych grup po nazwie. `profit`, `loss`, `info` i `brand` to
 *  w aplikacji o odsprzedaży podstawowe pojęcia biznesowe — importowane wprost
 *  przesłaniają lokalne zmienne o tych nazwach. Tak właśnie wyszło w
 *  QuickCreateOfferModal, gdzie `const profit = calcProfit(...)` zderzył się
 *  z grupą kolorów. Przestrzeń nazw wyklucza tę kolizję raz na zawsze.
 */

/* ─────────────────────────────────────────────────────────────────────────
   PŁÓTNO — ciemna zieleń, na której stoi cała aplikacja
   ───────────────────────────────────────────────────────────────────────── */
export const surface = {
  /** Pasek górny i punkt wyjścia gradientu tła */
  canvas: "#001a0a",
  /** Środek gradientu tła */
  canvasMid: "#002210",
  /** Koniec gradientu tła */
  canvasDeep: "#001508",
  /** Karta leżąca na płótnie */
  raised: "#0d1b12",
  /** Karta wyżej w hierarchii */
  high: "#1a2e1f",
  /** Karta najwyżej / wyróżniona */
  higher: "#1e3a28",
  /** Krawędź karty, delikatna linia podziału */
  edge: "#2a4a30",
} as const;

/* ─────────────────────────────────────────────────────────────────────────
   FIOLETOWY ATRAMENT — powierzchnie skanera AI (boczny pasek, modale)
   ───────────────────────────────────────────────────────────────────────── */
export const violetInk = {
  /** Tło bocznego paska */
  deepest: "#0a0014",
  deep: "#130d22",
  mid: "#1a1030",
  high: "#1e1b4b",
  /** Przygaszenie tła pod modalem */
  overlay: "#1e0a3c",
  /** Tło karty modala i rozwijanej listy <option> */
  card: "#0d0d1a",
  /** Tło dymka nad treścią (dropdown, podpowiedź) */
  popover: "#1a1a2e",
} as const;

/* ─────────────────────────────────────────────────────────────────────────
   MARKA — złoto wordmarku RESELLASSIST
   ───────────────────────────────────────────────────────────────────────── */
export const brand = {
  gold: "#f5c842",
  goldSoft: "#fde68a",
  goldStrong: "#fbbf24",
  goldLight: "#fcd34d",
  yellow: "#eab308",
  /** Złoto przechodzące w bursztyn — gradienty przycisków */
  amber: "#f59e0b",
  amberDeep: "#d97706",
  /** Ciemny tekst na bursztynowym tle (powiadomienie) */
  amberInk: "#1a0a00",
} as const;

/* ─────────────────────────────────────────────────────────────────────────
   ZNACZENIA — kolor bez znaczenia nie ma prawa być na ekranie
   ───────────────────────────────────────────────────────────────────────── */

/** Zysk, stan aktywny, akcja główna. */
export const profit = {
  base: "#4ade80",
  strong: "#22c55e",
  deep: "#16a34a",
  deeper: "#15803d",
  soft: "#86efac",
  mint: "#34d399",
  mintSoft: "#6ee7b7",
  mintDeep: "#059669",
  wash: "#d1fae5",
} as const;

/** Strata, błąd, akcja niszcząca. */
export const loss = {
  base: "#f87171",
  soft: "#fca5a5",
  strong: "#ef4444",
  deep: "#dc2626",
} as const;

/** AI i skanowanie rynku. */
export const ai = {
  base: "#a78bfa",
  strong: "#8b5cf6",
  deep: "#7c3aed",
  deeper: "#6d28d9",
  soft: "#c4b5fd",
} as const;

/** Informacja, stan neutralny. */
export const info = {
  base: "#60a5fa",
  strong: "#3b82f6",
  deep: "#2563eb",
  soft: "#93c5fd",
  indigo: "#818cf8",
  indigoSoft: "#c7d2fe",
} as const;

/* ─────────────────────────────────────────────────────────────────────────
   AKCENTY SEKCJI

   Odcienie, które istnieją wyłącznie po to, żeby dało się odróżnić jedną
   sekcję aplikacji od drugiej: kafelek ikony w nagłówku, obwódka kart,
   podświetlenie stanu aktywnego. Nie kodują żadnego stanu — cyjan w Dostawcach
   nie znaczy „lepiej" ani „gorzej" niż malina w Rywalach.

   Te są nazwane barwą, a nie rolą, i to celowo. Ich jedyną rolą jest bycie
   różnymi od siebie, a każda obsługuje po dwie sekcje, więc nazwa wzięta od
   jednej z nich (`suppliers`) kłamałaby w drugiej (Alerty). Grupa niesie rolę,
   człon ją tylko rozróżnia.

   ⚠ `orange.base` ma tę samą wartość co barwa Etsy w `platforms.ts`. To zbieg
   okoliczności, nie powielenie — Etsy może zmienić logo, akcent Trendów nie.
   Nie scalać.
   ───────────────────────────────────────────────────────────────────────── */
export const sectionAccent = {
  /** Dostawcy, Alerty */
  cyan: { base: "#06b6d4", deep: "#0891b2", soft: "#67e8f9" },
  /** Rywale */
  rose: { base: "#f43f5e", deep: "#e11d48", soft: "#fda4af" },
  /** Trendy, Pipeline */
  orange: {
    base: "#f97316", light: "#fb923c", soft: "#fed7aa",
    deep: "#ea580c", deeper: "#c2410c", deepest: "#b45309",
  },
} as const;

/** Ekran PIN-u — jedyne miejsce w stali zamiast zieleni. */
export const steel = {
  ink: "#0f172a",
  line: "#475569",
} as const;

/* ─────────────────────────────────────────────────────────────────────────
   NEUTRALNE
   ───────────────────────────────────────────────────────────────────────── */
export const ink = {
  white: "#fff",
  black: "#000",
  /** Szarość awaryjna — wartość dla stanu, którego nie ma w mapie */
  grey: "#888",
} as const;

/* ─────────────────────────────────────────────────────────────────────────
   PRZEZROCZYSTOŚĆ

   Tekst drugoplanowy, obwódki i delikatne tła to nie osobne kolory, tylko
   kolor bazowy z kanałem alfa. `alpha` liczy je z palety, więc zmiana
   odcienia bazowego pociąga za sobą wszystkie jego półprzezroczyste użycia.

   Zwraca dokładnie ten sam zapis, który był wpisany w ekranach
   (`rgba(74,222,128,0.15)`), żeby migracja nie zmieniła ani jednego piksela.
   ───────────────────────────────────────────────────────────────────────── */
export function alpha(hex: string, a: number): string {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
