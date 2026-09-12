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
 *  Zmigrowane: 34 z 36 plików — cały `components/resell/` i dwadzieścia sześć
 *  ekranów. Zostały dwa, oba z powodów, których nie rozwiąże dopisanie wpisów:
 *  TradingBot trzyma 112 ze 135 kolorów w klasach Tailwinda (patrz ostrzeżenie
 *  niżej), a AssistantPage ma 42 własne odcienie na jednym ekranie, nigdzie
 *  indziej nieużywane — to osobny świat barw, nie brakujące stopnie skal.
 *
 *  GRANICA, KTÓRA DECYDUJE, CO TU WCHODZI
 *
 *  Kolejny stopień rodziny, która już ma znaczenie — wchodzi. `#dc2626` to
 *  ciemniejsza czerwień straty, `#059669` ciemniejsza zieleń zysku; domykają
 *  istniejące skale i nie wnoszą nowego sensu do nauczenia.
 *
 *  Nowa rodzina barw — nie wchodzi, dopóki nie wiadomo, co ma znaczyć.
 *  Sześć takich rodzin przeszło tę próbę i wylądowało w `sectionAccent`: nie
 *  kodowały stanu, tylko odróżniały sekcje. Dopisanie czegokolwiek „bo jest
 *  w kodzie" zamieniłoby paletę w katalog odcieni, czyli w dokładnie ten stan,
 *  z którego wychodzimy.
 *
 *  Barwy firmowe platform (eBay, TikTok…) nie należą tu wcale — mieszkają
 *  w `platforms.ts`, bo nie są rolą w naszym systemie, tylko cudzą własnością.
 *
 *  ⚠ CZEGO NIE WOLNO TU WCIĄGAĆ
 *
 *  Wstawki CSS w `<style>` to tekst, nie wyrażenia — wartość z JS nic tam nie
 *  zrobi.
 *
 *  Klasy Tailwinda z kolorem w nawiasach (`bg-[#0a1a0f]`) są gorszym
 *  przypadkiem, bo psują się cicho. Tailwind generuje taką klasę skanując
 *  źródło, więc po zamianie na `bg-[${palette.x}]` klasa nie powstaje wcale
 *  i kolor znika bez żadnego błędu — ani tsc, ani build tego nie zgłosi.
 *  Wszystkie 112 takich wystąpień siedzi w TradingBot.tsx i dlatego ten ekran
 *  nie jest migrowany. Właściwe rozwiązanie dla niego to nie paleta, a kolory
 *  motywu w `@theme` w index.css (projekt używa Tailwinda 4) — osobna zmiana,
 *  bo dotyka 112 ciągów klas.
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
  /** Przygaszenie tła pod modalem na płótnie zielonym */
  canvasInk: "#000a03",
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
  /**
   * Druga karta, o 5 jaśniejsza w kanale niebieskim od `card`. Różnica jest
   * niewidoczna dla oka i najpewniej powstała przez przypadek. Zostaje, bo
   * scalenie zmieniłoby piksele — ale jeśli kiedyś ktoś je ujednolici,
   * to jest ten wpis do usunięcia.
   */
  cardAlt: "#0d0d1f",
  /** Tło dymka nad treścią (dropdown, podpowiedź) */
  popover: "#1a1a2e",
  /* Panele ekranu Filmiki, od najciemniejszego */
  panelInk: "#1c1233",
  panelDeep: "#241245",
  panel: "#2e1065",
  panelHigh: "#4c1d95",
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
  /**
   * Złoto o 10 wyżej w czerwonym i 14 wyżej w niebieskim niż `gold`. Jak
   * `profit.deepAlt` — różnica niewidoczna, jedno użycie, najpewniej literówka.
   */
  goldAlt: "#ffc850",
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
  washMint: "#a7f3d0",
  /** Ciemny tekst na zielonym tle (przycisk główny) */
  ink: "#0d1a0d",
  /** Ciemny tekst na miętowym przycisku */
  inkMint: "#022c22",
  /**
   * Odcień o 6 niższy w kanale czerwonym od `deep` (#16a34a). Dla oka nie do
   * odróżnienia i prawie na pewno literówka w jednym z ekranów. Zostaje, bo
   * scalenie zmieniłoby piksele — ale jeśli ktoś to ujednolici, ten wpis
   * znika razem z dwoma użyciami w MarketingPage.
   */
  deepAlt: "#10a34a",
  /** Obwódka wyboru nieaktywnego (filtry kamery) */
  edgeDeep: "#065f46",
  inkDeep: "#052e22",
  inkDeeper: "#04291e",
} as const;

/** Strata, błąd, akcja niszcząca. */
export const loss = {
  base: "#f87171",
  soft: "#fca5a5",
  strong: "#ef4444",
  deep: "#dc2626",
  deepest: "#7f1d1d",
  /** Tło panelu błędu */
  ink: "#450a0a",
  /** Tekst na panelu błędu */
  wash: "#fecaca",
} as const;

/** AI i skanowanie rynku. */
export const ai = {
  base: "#a78bfa",
  strong: "#8b5cf6",
  deep: "#7c3aed",
  deeper: "#6d28d9",
  soft: "#c4b5fd",
  /** Tekst na fioletowym panelu */
  wash: "#ede9fe",
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
   różnymi od siebie, a odcienie wędrują między sekcjami w sposób, którego nie
   da się przewidzieć: cyjan obsługuje Dostawców i Alerty, pomarańcz Trendy
   i Pipeline, purpura Marketing i Agenta AI. Nazwa wzięta od jednej sekcji
   (`suppliers`) kłamałaby w drugiej. Grupa niesie rolę, człon ją rozróżnia,
   a komentarz nad każdym mówi, gdzie dziś pracuje.

   ⚠ `orange.base` ma tę samą wartość co barwa Etsy w `platforms.ts`. To zbieg
   okoliczności, nie powielenie — Etsy może zmienić logo, akcent Trendów nie.
   Nie scalać.
   ───────────────────────────────────────────────────────────────────────── */
export const sectionAccent = {
  /** Dostawcy, Alerty, generatory treści w Marketingu */
  cyan: {
    base: "#06b6d4", light: "#22d3ee", deep: "#0891b2", soft: "#67e8f9",
    /** Ciemny tekst na cyjanowym przycisku */
    ink: "#042f2e",
    /** Jasny tekst w cyjanowej ramce */
    wash: "#e0f2fe",
  },
  /** Rywale */
  rose: { base: "#f43f5e", deep: "#e11d48", soft: "#fda4af" },
  /** Trendy, Pipeline */
  orange: {
    base: "#f97316", light: "#fb923c", tan: "#fdba74", soft: "#fed7aa",
    wash: "#ffedd5",
    deep: "#ea580c", deeper: "#c2410c", deepest: "#b45309",
    /* Brązy ekranu Reklama — tła i tekst stanu nieaktywnego */
    ink: "#7c2d12", inkDeep: "#3b1a08", inkDeeper: "#2a1205",
    mute: "#9a6b4f", muteGold: "#c2833f",
  },
  /** Marketing — karta na Dashboardzie i ekran Marketingu */
  pink: { base: "#ec4899", light: "#f472b6", soft: "#f9a8d4" },
  /** Marketing, Agent AI */
  purple: { base: "#a855f7" },
  /** Marketing — trzeci przystanek gradientu karty */
  indigo: { base: "#6366f1", soft: "#a5b4fc" },
  /** Aktualizacja — jedyny ekran utrzymany w błękicie */
  blue: {
    base: "#1d4ed8", deep: "#1e40af", soft: "#bfdbfe", wash: "#dbeafe",
    ink: "#0b1e3f", inkDeep: "#0a1a33",
    /** Banner „trwa praca" na ekranach Filmiki i Reklama */
    panel: "#1e3a5f", bright: "#38bdf8",
  },
} as const;

/* ─────────────────────────────────────────────────────────────────────────
   PODGLĄD KODU — monospace na ciemnym tle (Agent AI)
   ───────────────────────────────────────────────────────────────────────── */
export const code = {
  text: "#e2e8f0",
  accent: "#a3e635",
} as const;

/** Ekran PIN-u — jedyne miejsce w stali zamiast zieleni. */
export const steel = {
  ink: "#0f172a",
  line: "#475569",
  /** Wpis neutralny — „Własne API" na liście usług */
  soft: "#94a3b8",
  /** Tekst przygaszony na ekranie Aktualizacji */
  mid: "#64748b",
  /** Panel neutralny */
  panel: "#1e293b",
  /** Przycisk drugoplanowy („Zatrzymaj") — jedyny odcień kamienia w aplikacji */
  stone: "#57534e",
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
