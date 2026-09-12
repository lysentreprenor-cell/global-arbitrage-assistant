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
 *  Zmigrowane na paletę: TopNav, AppSidebar, ResellLayout (powłoka aplikacji).
 *  Reszta ekranów nadal ma kolory wpisane na sztywno.
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
} as const;

/* ─────────────────────────────────────────────────────────────────────────
   MARKA — złoto wordmarku RESELLASSIST
   ───────────────────────────────────────────────────────────────────────── */
export const brand = {
  gold: "#f5c842",
  goldSoft: "#fde68a",
  goldStrong: "#fbbf24",
  /** Złoto przechodzące w bursztyn — gradienty przycisków */
  amber: "#f59e0b",
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
} as const;

/** Strata, błąd, akcja niszcząca. */
export const loss = {
  base: "#f87171",
  soft: "#fca5a5",
  strong: "#ef4444",
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
  soft: "#93c5fd",
  indigo: "#818cf8",
  indigoSoft: "#c7d2fe",
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
