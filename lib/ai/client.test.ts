import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { extractJSON, aiEnabled } from "./client";

describe("extractJSON", () => {
  it("extracts simple JSON object", () => {
    expect(extractJSON('{"answer": "hello"}')).toBe('{"answer": "hello"}');
  });

  it("strips markdown fences", () => {
    expect(extractJSON('```json\n{"a": 1}\n```')).toBe('{"a": 1}');
  });

  it("handles nested objects", () => {
    const input = '{"outer": {"inner": "value"}}';
    expect(extractJSON(input)).toBe(input);
  });

  it("handles strings with braces", () => {
    const input = '{"msg": "use { and } carefully"}';
    expect(extractJSON(input)).toBe(input);
  });

  it("handles escaped quotes", () => {
    const input = '{"msg": "she said \\"hello\\""}';
    expect(extractJSON(input)).toBe(input);
  });

  it("returns null for no JSON", () => {
    expect(extractJSON("no json here")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extractJSON("")).toBeNull();
  });

  it("handles leading text before JSON", () => {
    expect(extractJSON('Here is the answer: {"ok": true}')).toBe('{"ok": true}');
  });

  it("handles trailing text after JSON", () => {
    expect(extractJSON('{"ok": true} and more text')).toBe('{"ok": true}');
  });

  it("returns null for unbalanced braces", () => {
    expect(extractJSON('{"unclosed": true')).toBeNull();
  });
});

describe("aiEnabled", () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.AI_ENABLED;
    delete process.env.LLM_API_KEY;
  });

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it("returns false when AI_ENABLED is false", () => {
    process.env.AI_ENABLED = "false";
    process.env.LLM_API_KEY = "some-key";
    expect(aiEnabled()).toBe(false);
  });

  it("returns false when LLM_API_KEY is missing", () => {
    expect(aiEnabled()).toBe(false);
  });

  it("returns false when LLM_API_KEY is empty", () => {
    process.env.LLM_API_KEY = "   ";
    expect(aiEnabled()).toBe(false);
  });

  it("returns true when key is present and not disabled", () => {
    process.env.LLM_API_KEY = "valid-key";
    expect(aiEnabled()).toBe(true);
  });

  it("returns true when AI_ENABLED is true and key exists", () => {
    process.env.AI_ENABLED = "true";
    process.env.LLM_API_KEY = "key";
    expect(aiEnabled()).toBe(true);
  });
});
