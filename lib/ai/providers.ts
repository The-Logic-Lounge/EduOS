import OpenAI from "openai";
import type { ToolSpec } from "./client";

export type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type ChatOptions = {
  model: string;
  temperature: number;
  messages: ChatMessage[];
  tools?: ToolSpec[];
  tool_choice?: "auto" | "none" | { type: "function"; function: { name: string } };
  signal?: AbortSignal;
};

export type ChatResponse = {
  content: string | null;
  tool_calls?: ToolCall[];
};

export type EmbedOptions = {
  model: string;
  input: string[];
  dimensions?: number;
};

export interface LLMProvider {
  chat(opts: ChatOptions): Promise<ChatResponse>;
  embed(opts: EmbedOptions): Promise<number[][] | null>;
}

function toOpenAITools(tools?: ToolSpec[]): OpenAI.Chat.Completions.ChatCompletionTool[] | undefined {
  if (!tools || tools.length === 0) return undefined;
  return tools.map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}

export class OpenAIProvider implements LLMProvider {
  private client: OpenAI;

  constructor(apiKey: string, baseURL: string) {
    this.client = new OpenAI({ apiKey, baseURL });
  }

  async chat(opts: ChatOptions): Promise<ChatResponse> {
    const res = await this.client.chat.completions.create(
      {
        model: opts.model,
        temperature: opts.temperature,
        messages: opts.messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        tools: toOpenAITools(opts.tools),
        tool_choice: opts.tools && opts.tools.length > 0 ? (opts.tool_choice ?? "auto") : undefined,
      },
      opts.signal ? { signal: opts.signal } : undefined,
    );
    const msg = res.choices[0]?.message;
    return {
      content: msg?.content ?? null,
      tool_calls: (msg?.tool_calls as ToolCall[] | undefined) ?? undefined,
    };
  }

  async embed(opts: EmbedOptions): Promise<number[][] | null> {
    const res = await this.client.embeddings.create({
      model: opts.model,
      input: opts.input,
      dimensions: opts.dimensions,
    });
    return res.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
  }
}

export function createProvider(): LLMProvider | null {
  const apiKey = (process.env.LLM_API_KEY || "").trim();
  if (!apiKey) return null;

  const provider = (process.env.LLM_PROVIDER || "openai").toLowerCase();
  const baseURL =
    process.env.LLM_BASE_URL || "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";

  if (provider === "openai" || provider === "openai-compatible" || provider === "dashscope") {
    return new OpenAIProvider(apiKey, baseURL);
  }

  // Anthropic, Google, etc. can be added here as separate implementations.
  throw new Error(`Unsupported LLM_PROVIDER: ${provider}`);
}
