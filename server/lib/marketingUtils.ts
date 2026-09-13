/** Shared utilities for marketing routes — pure, no side-effects, fully testable. */

/** Clamp and clean user-supplied string to prevent prompt injection and over-length inputs. */
export function sanitize(str: unknown, maxLen: number): string {
  return String(str ?? "").trim().slice(0, maxLen);
}

/**
 * Try to extract valid JSON from Claude's response text.
 * Handles: markdown fences, leading/trailing text, truncated JSON (missing closing delimiters).
 * Returns null when nothing salvageable is found.
 *
 * Key rule: always anchor on the LEFTMOST container opener (`{` or `[`) so that
 * inner objects inside a truncated array don't shadow the outer container.
 */
export function parseJsonSalvage(text: string): any {
  // Find the leftmost JSON container opener to determine type
  const bi = text.indexOf("{");
  const ai = text.indexOf("[");

  if (bi === -1 && ai === -1) return null;

  // Whichever opener appears first in the text defines the container type
  const useArray = ai !== -1 && (bi === -1 || ai < bi);
  const startIdx = useArray ? ai : bi;
  const re = useArray ? /\[[\s\S]*\]/ : /\{[\s\S]*\}/;
  const slice = text.slice(startIdx);

  // Try complete delimited block first (fast path)
  const m = slice.match(re);
  if (m) {
    try { return JSON.parse(m[0]); } catch { /* try repair */ }
    const fixed = repairJson(m[0]);
    try { return JSON.parse(fixed); } catch { /* fall through to full-slice repair */ }
  }

  // Truncated text — no closing delimiter; repair from opener
  const fixed = repairJson(slice);
  try { return JSON.parse(fixed); } catch { return null; }
}

/** Strip trailing incomplete key/value, close unclosed braces/brackets. */
function repairJson(s: string): string {
  let out = s
    .replace(/,\s*"[^"]*"\s*:\s*[^,}\]"]*$/, "") // strip incomplete `,"key": value`
    .replace(/,\s*$/, "");                          // strip trailing comma
  const stack: string[] = [];
  for (const ch of out) {
    if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if ((ch === "}" || ch === "]") && stack.length) stack.pop();
  }
  return out + stack.reverse().join("");
}

/** Select Claude model: Haiku for short/simple requests, Sonnet for long ones. */
export function selectModel(
  sections: string[],
  sectionDetail: Record<string, string>,
): { model: string; maxTokens: number } {
  const det = (s: string): "s" | "m" | "l" => {
    const v = sectionDetail?.[s];
    return v === "s" || v === "m" || v === "l" ? v : "m";
  };
  const tokenPerDetail: Record<string, number> = { s: 600, m: 1600, l: 3200 };
  const totalEst = sections.reduce((sum, s) => sum + (tokenPerDetail[det(s)] ?? 1600), 0);
  const hasLong = sections.some(s => det(s) === "l");
  const useHaiku = sections.length <= 3 && !hasLong;
  const model = useHaiku ? "claude-haiku-4-5-20251001" : "claude-sonnet-4-6";
  const maxTokens = Math.min(useHaiku ? 6000 : 16000, Math.max(2000, totalEst + 600));
  return { model, maxTokens };
}
