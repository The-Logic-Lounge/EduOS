import OpenAI from "openai";
import { aiEnabled, MODEL } from "./client";

const EMBED_MODEL = process.env.LLM_EMBED_MODEL || "text-embedding-v4";
const DIM = 1536;

let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({
      apiKey: (process.env.LLM_API_KEY || "").trim(),
      baseURL: process.env.LLM_BASE_URL || "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    });
  }
  return client;
}

export function embeddingsEnabled(): boolean {
  return aiEnabled() && (process.env.EMBEDDINGS_ENABLED ?? "true") !== "false";
}

export function embeddingDim(): number {
  return DIM;
}

export async function embed(texts: string[]): Promise<number[][] | null> {
  if (!embeddingsEnabled() || texts.length === 0) return null;
  const cleaned = texts.map((t) => t.replace(/\s+/g, " ").trim().slice(0, 8000));
  try {
    const res = await getClient().embeddings.create({
      model: EMBED_MODEL,
      input: cleaned,
      dimensions: DIM,
    });
    const rows = res.data
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding);
    if (rows.length !== texts.length) return null;
    return rows;
  } catch (e) {
    console.warn("[embed] failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

export function vectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}
