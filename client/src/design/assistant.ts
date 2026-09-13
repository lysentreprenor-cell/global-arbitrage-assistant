/**
 * ══════════════════════════════════════════════════════════════════════════
 *  Gadacz — barwy ekranu asystenta
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  Osobny plik od `palette.ts`, z tego samego powodu co `platforms.ts`:
 *  te odcienie nie pracują nigdzie indziej w aplikacji. 42 barwy na jednym
 *  ekranie, żadna nieużywana poza nim. Wciągnięcie ich do palety semantycznej
 *  podwoiłoby ją wpisami używanymi raz i zamieniło w katalog odcieni.
 *
 *  DLACZEGO TEN EKRAN WYGLĄDA INACZEJ NIŻ RESZTA
 *
 *  Gadacz jest głosowym asystentem dla osób niewidomych i słabowidzących.
 *  Stąd obwódki `3px` i `4px` zamiast `1px`, mocny kontrast tła do tekstu
 *  i osobna barwa dla każdej funkcji — żeby dało się je rozróżnić resztkami
 *  wzroku, nie samym kształtem. To nie jest niespójność do naprawienia:
 *  reszta aplikacji jest projektowana dla oka, ten ekran dla oka słabego.
 *
 *  STRUKTURA
 *
 *  Każda funkcja ma swój komplet: `panel` (tło), `edge` (obwódka), `text`.
 *  Ciemniejsze warianty to `panelDeep` i `panelInk`, jaśniejszy tekst to
 *  `textSoft`. Barwa nazywa grupę, bo — jak w `sectionAccent` — jedyną rolą
 *  tych odcieni jest odróżnianie funkcji od siebie.
 *
 *  UŻYCIE — przez przestrzeń nazw, jak paleta:
 *
 *      import * as assistant from "@/design/assistant";
 *      background: assistant.teal.panel
 */

/** Dyktowanie i nasłuch */
export const teal = {
  panel: "#0b3d47",
  panelDeep: "#08313a",
  edge: "#155e63",
  text: "#e0f7fa",
  textSoft: "#a5f3fc",
} as const;

/** Persona asystenta — wybór głosu i charakteru */
export const amber = {
  panel: "#78350f",
  panelDeep: "#713f12",
  panelInk: "#292013",
  edge: "#facc15",
  text: "#fef3c7",
  tan: "#d6b98c",
} as const;

/** Stan pracy ciągłej — nasłuch włączony */
export const green = {
  panel: "#052e16",
  panelDeep: "#14532d",
  edge: "#166534",
  text: "#dcfce7",
  textSoft: "#bbf7d0",
} as const;

/** Wiadomości i kontakty */
export const pink = {
  edge: "#db2777",
  edgeDeep: "#be185d",
  panel: "#831843",
  panelDeep: "#4a1033",
  panelInk: "#3f0d29",
  panelInkDeep: "#31081f",
  text: "#fce7f3",
  textSoft: "#fbcfe8",
} as const;

/** Pamięć i nauka asystenta */
export const indigo = {
  edge: "#4338ca",
  panel: "#1e1633",
  text: "#ddd6fe",
} as const;

/** Neutralne zimne — stany wyłączone i tła list */
export const zinc = {
  ink: "#0a0a0a",
  inkDeep: "#111",
  panel: "#18181b",
  panelHigh: "#3f3f46",
  edge: "#52525b",
  mid: "#71717a",
  soft: "#a1a1aa",
  text: "#e4e4e7",
} as const;

/** Neutralne ciepłe — karty person */
export const stone = {
  panel: "#1c1917",
  edge: "#44403c",
  soft: "#a8a29e",
  text: "#e7e5e4",
} as const;

/** Panel informacyjny */
export const blue = {
  panel: "#082f49",
} as const;

/** Tekst na panelu błędu */
export const red = {
  wash: "#fee2e2",
} as const;
