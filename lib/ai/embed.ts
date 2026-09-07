import { getProvider, aiEnabled } from "./client";

const EMBED_MODEL = process.env.LLM_EMBED_MODEL || "text-embedding-v4";
const DIM = 1536;

export function embeddingsEnabled(): boolean {
  return aiEnabled() && (process.env.EMBEDDINGS_ENABLED ?? "true") !== "false";
}

export function embeddingDim(): number {
  return DIM;
}

export async function embed(texts: string[]): Promise<number[][] | null> {
  const provider = getProvider();
  if (!embeddingsEnabled() || !provider || texts.length === 0) return null;
  const cleaned = texts.map((t) => t.replace(/\s+/g, " ").trim().slice(0, 8000));
  try {
    const rows = await provider.embed({ model: EMBED_MODEL, input: cleaned, dimensions: DIM });
    if (!rows || rows.length !== texts.length) return null;
    return rows;
  } catch (e) {
    console.warn("[embed] failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

export function vectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}
