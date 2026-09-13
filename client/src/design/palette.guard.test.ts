import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

/**
 * Strażnik palety.
 *
 * Migracja przeniosła ~4600 kolorów z ekranów do `design/`. Bez tego testu
 * pierwszy nowy ekran wpisze `#4ade80` z powrotem na sztywno i po kilku
 * miesiącach będzie tak, jak było: 171 odcieni rozsianych po 36 plikach.
 *
 * Test nie pilnuje, ŻEBY było ładnie — pilnuje, żeby wartość koloru miała
 * jedno miejsce. Jeśli potrzebujesz odcienia, którego nie ma, dopisz go do
 * `palette.ts` (albo `platforms.ts` / `assistant.ts` / `@theme`, zależnie od
 * tego, czym jest) zamiast wklejać go do ekranu.
 */

const DIRS = [
  "client/src/pages/resell",
  "client/src/components/resell",
];

/** Kolor w stringu w cudzysłowach — to właśnie tu wracają twarde wartości. */
const COLOR_IN_STRING = /"[^"\n]*(?:#[0-9a-fA-F]{3}\b|#[0-9a-fA-F]{6}\b|rgba\()[^"\n]*"/;

/** Tailwind z wartością w nawiasach — ma być nazwa z @theme w index.css. */
const TAILWIND_ARBITRARY = /\b(?:bg|border|text|ring|from|to|via|fill|stroke)-\[#[0-9a-fA-F]{3,6}\]/;

function tsxFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter(f => f.endsWith(".tsx"))
    .map(f => join(dir, f));
}

function offenders(re: RegExp): string[] {
  const found: string[] = [];
  for (const dir of DIRS) {
    for (const file of tsxFiles(dir)) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        // Wstawki CSS w <style> są tekstem, nie wyrażeniami — paleta ich nie
        // obsłuży, więc nie mają tu czego szukać.
        if (/@keyframes|::placeholder|::-webkit|^\s*option\s*\{/.test(line)) return;
        if (re.test(line)) found.push(`${file}:${i + 1}  ${line.trim().slice(0, 90)}`);
      });
    }
  }
  return found;
}

describe("paleta jest jedynym źródłem kolorów", () => {
  it("żaden ekran nie wpisuje koloru na sztywno", () => {
    const bad = offenders(COLOR_IN_STRING);
    expect(
      bad,
      `Znaleziono kolor wpisany wprost w ekranie. Użyj wartości z design/palette.ts ` +
        `(albo platforms.ts / assistant.ts), zamiast wklejać hex:\n${bad.join("\n")}`,
    ).toEqual([]);
  });

  it("żadna klasa Tailwinda nie niesie wartości koloru w nawiasach", () => {
    const bad = offenders(TAILWIND_ARBITRARY);
    expect(
      bad,
      `Klasa Tailwinda z kolorem w nawiasach psuje się cicho przy próbie ` +
        `sparametryzowania — dodaj kolor jako --color-* w @theme w index.css ` +
        `i użyj nazwy:\n${bad.join("\n")}`,
    ).toEqual([]);
  });
});
