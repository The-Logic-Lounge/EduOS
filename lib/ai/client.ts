import type { ZodType } from "zod";
import { createProvider, type ChatMessage, type LLMProvider } from "./providers";

/**
 * The ONLY place that talks to an LLM.
 *
 * Two hard rules live here:
 *  1. Nothing ever throws. Every caller gets a discriminated result and can fall back.
 *  2. The model only ever sees a JSON context built by lib/ai/context/* — never the DB.
 */

export const MODEL = () => process.env.LLM_MODEL || "qwen-plus";

const TIMEOUT_MS = 45_000;
const MAX_TOOL_ROUNDS = 3;

function safeCreateProvider(): LLMProvider | null {
  try {
    return createProvider();
  } catch {
    return null;
  }
}

let _provider: LLMProvider | null = null;
let _lastKey = "";

export function getProvider(): LLMProvider | null {
  if (process.env.AI_ENABLED === "false") return null;
  const key = (process.env.LLM_API_KEY || "").trim();
  if (!key) {
    _provider = null;
    _lastKey = "";
    return null;
  }
  if (key === _lastKey && _provider) return _provider;
  _lastKey = key;
  _provider = safeCreateProvider();
  return _provider;
}

export function aiEnabled(): boolean {
  return getProvider() !== null;
}

export type AiResult<T> = { ok: true; data: T } | { ok: false; reason: string };

const JSON_RULE =
  "\n\nOUTPUT FORMAT: reply with exactly ONE JSON object and nothing else. " +
  "No markdown fences, no commentary before or after.";

/** Strip ``` fences, then return the first balanced {...} block. */
export function extractJSON(raw: string): string | null {
  const text = raw.replace(/```(?:json)?/gi, "").trim();
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

export async function chatJSON<T>(args: {
  system: string;
  user: string;
  schema: ZodType<T, any, any>;
  temperature?: number;
}): Promise<AiResult<T>> {
  const provider = getProvider();
  if (!provider) return { ok: false, reason: "ai_disabled" };
  try {
    const res = await provider.chat({
      model: MODEL(),
      temperature: args.temperature ?? 0.2,
      messages: [
        { role: "system", content: args.system + JSON_RULE },
        { role: "user", content: args.user },
      ],
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const raw = res.content ?? "";
    const block = extractJSON(raw);
    if (!block) return { ok: false, reason: "no_json_in_response" };

    let parsed: unknown;
    try {
      parsed = JSON.parse(block);
    } catch {
      return { ok: false, reason: "unparseable_json" };
    }

    const check = args.schema.safeParse(parsed);
    if (!check.success) {
      return { ok: false, reason: "schema_mismatch: " + check.error.issues.map((i) => i.path.join(".")).join(", ") };
    }
    return { ok: true, data: check.data };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "llm_error" };
  }
}

export type ToolSpec = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

/**
 * Tool-calling loop over the allowlist: model picks tools -> we execute them -> results go back.
 * Bounded at 3 rounds because the model routinely needs a second one (list the courses, THEN
 * ask about the codes it just learned); after that it must answer with what it has.
 */
export async function chatWithTools(args: {
  system: string;
  user: string;
  tools: ToolSpec[];
  exec: (name: string, input: Record<string, unknown>) => Promise<unknown>;
}): Promise<AiResult<{ answer: string; used: { name: string; input: unknown; result: unknown }[] }>> {
  const provider = getProvider();
  if (!provider) return { ok: false, reason: "ai_disabled" };
  try {
    const messages: ChatMessage[] = [
      { role: "system", content: args.system },
      { role: "user", content: args.user },
    ];
    const used: { name: string; input: unknown; result: unknown }[] = [];

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const res = await provider.chat({
        model: MODEL(),
        temperature: 0,
        messages,
        tools: args.tools,
        tool_choice: "auto",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      messages.push({ role: "assistant", content: res.content ?? null, tool_calls: res.tool_calls });
      const calls = res.tool_calls ?? [];

      if (calls.length === 0) {
        // No tool wanted on the first pass means the question is not answerable from analytics.
        if (used.length === 0) return { ok: false, reason: "no_tool_selected" };
        const answer = (res.content ?? "").trim();
        return answer ? { ok: true, data: { answer, used } } : { ok: false, reason: "empty_answer" };
      }

      for (const call of calls) {
        let input: Record<string, unknown> = {};
        try {
          input = JSON.parse(call.function.arguments || "{}");
        } catch {
          /* a malformed argument blob is an empty call, not a crash */
        }
        const result = await args.exec(call.function.name, input);
        used.push({ name: call.function.name, input, result });
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result ?? null) });
      }
    }

    if (used.length === 0) return { ok: false, reason: "no_tool_selected" };

    // Out of rounds: make it answer with what the tools already returned.
    const final = await provider.chat({
      model: MODEL(),
      temperature: 0.1,
      messages,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const answer = (final.content ?? "").trim();
    return answer ? { ok: true, data: { answer, used } } : { ok: false, reason: "empty_answer" };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "llm_error" };
  }
}
