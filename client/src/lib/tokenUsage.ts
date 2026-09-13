const KEY = "ai_token_usage";

const currentMonth = () => new Date().toISOString().slice(0, 7);

export type TokenStats = {
  month: string;
  inputTotal: number;
  outputTotal: number;
  calls: number;
  haikuCalls: number;
  sonnetCalls: number;
};

function empty(): TokenStats {
  return { month: currentMonth(), inputTotal: 0, outputTotal: 0, calls: 0, haikuCalls: 0, sonnetCalls: 0 };
}

export function loadTokenStats(): TokenStats {
  try {
    const d: TokenStats = JSON.parse(localStorage.getItem(KEY) || "{}");
    return d.month === currentMonth() ? d : empty();
  } catch { return empty(); }
}

export function recordTokenUsage(usage: { input_tokens: number; output_tokens: number }, model: string): void {
  const s = loadTokenStats();
  s.inputTotal += usage.input_tokens;
  s.outputTotal += usage.output_tokens;
  s.calls += 1;
  if (model.includes("haiku")) s.haikuCalls += 1; else s.sonnetCalls += 1;
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
}

// Haiku: $0.25/M in, $1.25/M out | Sonnet: $3/M in, $15/M out
export function estimateCostUSD(s: TokenStats): number {
  if (!s.calls) return 0;
  const hF = s.haikuCalls / s.calls;
  const sF = 1 - hF;
  return (s.inputTotal * (hF * 0.25 + sF * 3) + s.outputTotal * (hF * 1.25 + sF * 15)) / 1_000_000;
}
