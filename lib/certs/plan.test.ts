import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/ai/client", () => ({ MODEL: () => "qwen-plus", chatText: vi.fn(), translateToUrdu: vi.fn() }));
import { parsePlan } from "./server";

describe("parsePlan", () => {
  it("reads WEEK headers, dash tasks and the TIP line", () => {
    const p = parsePlan(`WEEK 1: LLM concepts
- Read the Model Studio docs on tokens
- Summarise attention in 5 bullets
WEEK 2: RAG
- Build a small RAG demo
WEEK 3: Agents
- Write a tool-calling agent
TIP: Skip and return to hard questions.`);
    expect(p.weeks.map((w) => w.focus)).toEqual(["LLM concepts", "RAG", "Agents"]);
    expect(p.weeks[0].tasks).toHaveLength(2);
    expect(p.tip).toBe("Skip and return to hard questions.");
  });
  it("tolerates markdown bold, numbered tasks and 'Week 1 -' headers; caps at 4 weeks x 4 tasks", () => {
    const text = [1, 2, 3, 4, 5].map((n) => `**Week ${n} - Focus ${n}**\n1. a\n2. b\n3. c\n4. d\n5. e`).join("\n");
    const p = parsePlan(text);
    expect(p.weeks).toHaveLength(4);
    expect(p.weeks[0].focus).toBe("Focus 1");
    expect(p.weeks[0].tasks).toHaveLength(4);
    expect(p.tip).toBeNull();
  });
  it("drops weeks without tasks", () => {
    expect(parsePlan("WEEK 1: A\nWEEK 2: B\n- t").weeks.map((w) => w.focus)).toEqual(["B"]);
  });
});
