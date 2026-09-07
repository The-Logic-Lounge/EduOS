const DEFAULT_CHUNK_CHARS = 3200;
const DEFAULT_OVERLAP_CHARS = 400;

export interface Chunk {
  text: string;
  index: number;
}

export function chunkText(
  text: string,
  opts: { chunkChars?: number; overlapChars?: number } = {},
): Chunk[] {
  const chunkChars = opts.chunkChars ?? DEFAULT_CHUNK_CHARS;
  const overlapChars = Math.min(opts.overlapChars ?? DEFAULT_OVERLAP_CHARS, chunkChars - 1);

  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length === 0) return [];

  if (clean.length <= chunkChars) return [{ text: clean, index: 0 }];

  const chunks: Chunk[] = [];
  let start = 0;
  let idx = 0;

  while (start < clean.length) {
    const end = Math.min(start + chunkChars, clean.length);

    let cut = end;
    if (end < clean.length) {
      const boundary = clean.lastIndexOf(". ", end);
      const nl = clean.lastIndexOf("\n", end);
      const best = Math.max(boundary, nl);
      if (best > start + chunkChars * 0.5) cut = best + 1;
    }

    chunks.push({ text: clean.slice(start, cut).trim(), index: idx++ });

    if (cut >= clean.length) break;
    start = Math.max(cut - overlapChars, start + 1);
  }

  return chunks.filter((c) => c.text.length > 0);
}
