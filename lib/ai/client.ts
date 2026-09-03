import OpenAI from "openai";
import type { ZodType } from "zod";

/**
 * The ONLY place that talks to an LLM.
 *
 * Two hard rules live here:
 *  1. Nothing ever throws. Every caller gets a discriminated result and can fall back.
 *  2. The model only ever sees a JSON context built by lib/ai/context/* — never the DB.
 */

export const MODEL = () => process.env.LLM_MODEL || "qwen-plus";
const BASE_URL = () =>
  process.env.LLM_BASE_URL || "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";

const TIMEOUT_MS = 45_000;

let client: OpenAI | null = null;

export function aiEnabled(): boolean {
  if (process.env.AI_ENABLED === "false") return false;
  return (process.env.LLM_API_KEY || "").trim().length > 0;
}

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({ apiKey: (process.env.LLM_API_KEY || "").trim(), baseURL: BASE_URL() });
  }
  return client;
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
  if (!aiEnabled()) return { ok: false, reason: "ai_disabled" };
  try {
    const res = await getClient().chat.completions.create(
      {
        model: MODEL(),
        temperature: args.temperature ?? 0.2,
        messages: [
          { role: "system", content: args.system + JSON_RULE },
          { role: "user", content: args.user },
        ],
      },
      { signal: AbortSignal.timeout(TIMEOUT_MS) },
    );

    const raw = res.choices[0]?.message?.content ?? "";
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
 * One tool-call round trip: model picks tools -> we execute them -> results go back ->
 * model writes the answer. Deliberately ONE round: the allowlist is small and flat,
 * and a demo cannot wait on a multi-hop loop.
 */
export async function chatWithTools(args: {
  system: string;
  user: string;
  tools: ToolSpec[];
  exec: (name: string, input: Record<string, unknown>) => Promise<unknown>;
}): Promise<AiResult<{ answer: string; used: { name: string; input: unknown; result: unknown }[] }>> {
  if (!aiEnabled()) return { ok: false, reason: "ai_disabled" };
  try {
    const openai = getClient();
    const tools = args.tools.map((t) => ({
      type: "function" as const,
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: args.system },
      { role: "user", content: args.user },
    ];

    const first = await openai.chat.completions.create(
      { model: MODEL(), temperature: 0, messages, tools, tool_choice: "auto" },
      { signal: AbortSignal.timeout(TIMEOUT_MS) },
    );

    const msg = first.choices[0]?.message;
    const calls = msg?.tool_calls ?? [];
    if (calls.length === 0) return { ok: false, reason: "no_tool_selected" };

    messages.push(msg as OpenAI.Chat.Completions.ChatCompletionMessageParam);

    const used: { name: string; input: unknown; result: unknown }[] = [];
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

    if (used.every((u) => u.result === null || u.result === undefined)) {
      return { ok: false, reason: "tools_returned_nothing" };
    }

    const second = await openai.chat.completions.create(
      { model: MODEL(), temperature: 0.1, messages },
      { signal: AbortSignal.timeout(TIMEOUT_MS) },
    );

    const answer = (second.choices[0]?.message?.content ?? "").trim();
    if (!answer) return { ok: false, reason: "empty_answer" };
    return { ok: true, data: { answer, used } };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "llm_error" };
  }
}
