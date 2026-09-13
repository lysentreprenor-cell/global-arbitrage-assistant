import { describe, it, expect } from "vitest";
import { sanitize, parseJsonSalvage, selectModel } from "../lib/marketingUtils";

// ── sanitize ──────────────────────────────────────────────────────────────────

describe("sanitize", () => {
  it("trims whitespace", () => {
    expect(sanitize("  hello  ", 100)).toBe("hello");
  });

  it("truncates to maxLen", () => {
    expect(sanitize("abcdef", 3)).toBe("abc");
  });

  it("handles null → empty string", () => {
    expect(sanitize(null, 100)).toBe("");
  });

  it("handles undefined → empty string", () => {
    expect(sanitize(undefined, 100)).toBe("");
  });

  it("handles empty string", () => {
    expect(sanitize("", 100)).toBe("");
  });

  it("coerces numbers to string", () => {
    expect(sanitize(42, 100)).toBe("42");
  });

  it("maxLen=0 returns empty", () => {
    expect(sanitize("hello", 0)).toBe("");
  });

  it("returns value as-is when shorter than maxLen", () => {
    expect(sanitize("hi", 100)).toBe("hi");
  });
});

// ── parseJsonSalvage ──────────────────────────────────────────────────────────

describe("parseJsonSalvage", () => {
  it("parses clean JSON object", () => {
    const result = parseJsonSalvage('{"a":1,"b":"two"}');
    expect(result).toEqual({ a: 1, b: "two" });
  });

  it("parses clean JSON array", () => {
    const result = parseJsonSalvage('[{"x":1},{"x":2}]');
    expect(result).toEqual([{ x: 1 }, { x: 2 }]);
  });

  it("extracts JSON from markdown fences", () => {
    const text = "Here is the result:\n```json\n{\"a\":1}\n```";
    expect(parseJsonSalvage(text)).toEqual({ a: 1 });
  });

  it("extracts JSON surrounded by explanation text", () => {
    const text = "Sure! Here you go: {\"key\":\"value\"} — enjoy!";
    expect(parseJsonSalvage(text)).toEqual({ key: "value" });
  });

  it("returns null for plain text with no JSON", () => {
    expect(parseJsonSalvage("no json here at all")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseJsonSalvage("")).toBeNull();
  });

  it("salvages truncated object — missing closing brace", () => {
    const truncated = '{"a":1,"b":"two"';
    const result = parseJsonSalvage(truncated);
    expect(result).not.toBeNull();
    expect(result.a).toBe(1);
  });

  it("salvages truncated object — dangling comma after last value", () => {
    const truncated = '{"a":1,"b":"two",';
    const result = parseJsonSalvage(truncated);
    expect(result).not.toBeNull();
    expect(result.a).toBe(1);
  });

  it("salvages truncated array", () => {
    const truncated = '[{"day":1,"hook":"test"},{"day":2,"hook":"test2"';
    const result = parseJsonSalvage(truncated);
    expect(Array.isArray(result)).toBe(true);
    expect(result[0].day).toBe(1);
  });

  it("prefers object over array when both appear", () => {
    // The regex tries object pattern first
    const text = '{"items":[1,2,3]}';
    const result = parseJsonSalvage(text);
    expect(result).toEqual({ items: [1, 2, 3] });
  });

  it("handles nested structures", () => {
    const text = '{"a":{"b":{"c":42}}}';
    expect(parseJsonSalvage(text)).toEqual({ a: { b: { c: 42 } } });
  });

  it("salvages nested truncation", () => {
    // Missing closing braces for nested object
    const truncated = '{"summary":{"title":"foo","desc":"bar"';
    const result = parseJsonSalvage(truncated);
    expect(result).not.toBeNull();
    expect(result.summary?.title).toBe("foo");
  });
});

// ── selectModel ───────────────────────────────────────────────────────────────

describe("selectModel", () => {
  it("uses Haiku for ≤3 sections with no large detail", () => {
    const { model } = selectModel(["strategy", "social"], {});
    expect(model).toBe("claude-haiku-4-5-20251001");
  });

  it("uses Sonnet for >3 sections", () => {
    const { model } = selectModel(["strategy", "social", "ads", "email"], {});
    expect(model).toBe("claude-sonnet-4-6");
  });

  it("uses Sonnet when any section has detail='l'", () => {
    const { model } = selectModel(["strategy", "social"], { strategy: "l" });
    expect(model).toBe("claude-sonnet-4-6");
  });

  it("caps maxTokens at 6000 for Haiku", () => {
    const { maxTokens } = selectModel(["strategy"], {});
    expect(maxTokens).toBeLessThanOrEqual(6000);
  });

  it("caps maxTokens at 16000 for Sonnet", () => {
    const { maxTokens } = selectModel(
      ["strategy", "social", "ads", "email", "seo", "plan"],
      {},
    );
    expect(maxTokens).toBeLessThanOrEqual(16000);
  });

  it("uses minimum of 2000 tokens even for tiny request", () => {
    const { maxTokens } = selectModel(["strategy"], { strategy: "s" });
    expect(maxTokens).toBeGreaterThanOrEqual(2000);
  });

  it("detail defaults to 'm' when unspecified", () => {
    // medium = 1600 tokens per section; with 1 section: min(6000, max(2000, 1600+600)) = 2200
    const { maxTokens } = selectModel(["strategy"], {});
    expect(maxTokens).toBe(2200);
  });

  it("detail 's' → smaller token estimate than 'l'", () => {
    const { maxTokens: small } = selectModel(["strategy"], { strategy: "s" });
    const { maxTokens: large } = selectModel(["strategy"], { strategy: "l" });
    // large forces Sonnet, small stays Haiku — but regardless large should be >= small
    expect(large).toBeGreaterThanOrEqual(small);
  });
});
