import type { ZodType } from "zod";
import { createProvider, type ChatMessage, type LLMProvider } from "./providers";
import { recordEvent } from "../ops";

/**
 * The ONLY place that talks to an LLM.
 *
 * Two hard rules live here:
 *  1. Nothing ever throws. Every caller gets a discriminated result and can fall back.
 *  2. The model only ever sees a JSON context built by lib/ai/context/* — never the DB.
 */

export const MODEL = () => process.env.LLM_MODEL || "qwen-plus";
/** Reads answer-sheet photos: vision + reasoning in one call (Alibaba Model Studio, intl). */
export const VISION_MODEL = () => process.env.LLM_VISION_MODEL || "qwen3-vl-plus";
/** Urdu output: Qwen-MT lists Urdu as a supported target language. */
export const TRANSLATE_MODEL = () => process.env.LLM_TRANSLATE_MODEL || "qwen-mt-flash";

const TIMEOUT_MS = 45_000;
const MAX_TOOL_ROUNDS = 3;

/** A fixed code for a provider failure. Raw messages can echo request details, so they never
 *  leave this file: callers, the UI and telemetry all see one of these codes. */
export function aiErrorCode(e: unknown): string {
  const status = (e as { status?: unknown })?.status;
  const name = e instanceof Error ? e.name : "";
  if (status === 401 || status === 403) return "provider_auth";
  if (status === 429) return "rate_limited";
  if (typeof status === "number" && status >= 500) return "provider_5xx";
  if (name === "TimeoutError" || name === "AbortError" || /timed? ?out/i.test(String((e as Error)?.message))) return "timeout";
  if (typeof status === "number") return `provider_${status}`;
  return "provider_error";
}

/** Records every upstream call — outcome, latency, tokens — for the System Health dashboard.
 *  Never the prompt or the answer. */
function instrumented(p: LLMProvider): LLMProvider {
  const timed = async <T>(name: string, run: () => Promise<T>, tokens: (r: T) => number | undefined) => {
    const t0 = performance.now();
    try {
      const r = await run();
      recordEvent({ kind: "ai", name, ok: true, ms: Math.round(performance.now() - t0), tokens: tokens(r) });
      return r;
    } catch (e) {
      const status = (e as { status?: unknown })?.status;
      recordEvent({
        kind: "ai", name, ok: false, ms: Math.round(performance.now() - t0),
        status: typeof status === "number" ? status : undefined, detail: aiErrorCode(e),
      });
      throw e;
    }
  };
  return {
    chat: (opts) => timed(`${opts.tools?.length ? "tools" : "chat"} · ${opts.model}`, () => p.chat(opts), (r) => r.tokens),
    embed: (opts) => timed(`embed · ${opts.model}`, () => p.embed(opts), () => undefined),
  };
}

function safeCreateProvider(): LLMProvider | null {
  try {
    const p = createProvider();
    return p ? instrumented(p) : null;
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
  /** Override the model (e.g. VISION_MODEL()). */
  model?: string;
  /** Images as data: URLs, sent alongside the text (requires a vision model). */
  images?: string[];
  maxTokens?: number;
}): Promise<AiResult<T>> {
  const provider = getProvider();
  if (!provider) return { ok: false, reason: "ai_disabled" };
  try {
    const userContent = args.images?.length
      ? [
          ...args.images.map((url) => ({ type: "image_url" as const, image_url: { url } })),
          { type: "text" as const, text: args.user },
        ]
      : args.user;
    const res = await provider.chat({
      model: args.model ?? MODEL(),
      temperature: args.temperature ?? 0.2,
      messages: [
        { role: "system", content: args.system + JSON_RULE },
        { role: "user", content: userContent },
      ],
      maxTokens: args.maxTokens,
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
    return { ok: false, reason: aiErrorCode(e) };
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
    return { ok: false, reason: aiErrorCode(e) };
  }
}

/**
 * Translate to Urdu with Qwen-MT. Course vocabulary ("loop", "API", "React") stays in English
 * via the glossary, the way Pakistani trainers actually teach. Qwen-MT takes exactly one user
 * message and no system prompt. Never throws.
 */
export async function translateToUrdu(text: string, keepTerms: string[] = []): Promise<AiResult<string>> {
  const provider = getProvider();
  if (!provider) return { ok: false, reason: "ai_disabled" };
  try {
    const res = await provider.chat({
      model: TRANSLATE_MODEL(),
      temperature: 0,
      messages: [{ role: "user", content: text.slice(0, 6000) }],
      extraBody: {
        translation_options: {
          source_lang: "auto",
          target_lang: process.env.LLM_URDU_TARGET || "Urdu",
          ...(keepTerms.length ? { terms: keepTerms.map((t) => ({ source: t, target: t })) } : {}),
        },
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const out = (res.content ?? "").trim();
    return out ? { ok: true, data: out } : { ok: false, reason: "empty_answer" };
  } catch (e) {
    return { ok: false, reason: aiErrorCode(e) };
  }
}
