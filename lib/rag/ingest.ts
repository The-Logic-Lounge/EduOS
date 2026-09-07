import { z } from "zod";
import * as cheerio from "cheerio";
import { db } from "@/lib/db";
import { embed, vectorLiteral } from "@/lib/ai/embed";
import { chunkText } from "@/lib/ai/chunk";

const IngestOpts = z.object({
  courseId: z.string().min(1),
  topic: z.string().trim().min(1).max(200),
  url: z.string().url(),
  selector: z.string().trim().max(500).optional().nullable(),
});
export type IngestOpts = z.infer<typeof IngestOpts>;

export async function ingestUrl(opts: IngestOpts) {
  const { courseId, topic, url, selector } = IngestOpts.parse(opts);

  let source = await db.knowledgeSource.findFirst({ where: { courseId, url } });
  if (source) {
    source = await db.knowledgeSource.update({
      where: { id: source.id },
      data: { topic, selector: selector ?? null, status: "pending", error: null },
    });
  } else {
    source = await db.knowledgeSource.create({
      data: { courseId, topic, url, selector: selector ?? null, status: "pending" },
    });
  }

  let content: string;
  try {
    content = await fetchAndExtract(url, selector ?? null);
  } catch (e) {
    await db.knowledgeSource.update({
      where: { id: source.id },
      data: { status: "failed", error: `fetch_failed: ${e instanceof Error ? e.message : String(e)}` },
    });
    return { ok: false as const, reason: "fetch_failed", sourceId: source.id };
  }

  if (content.length < 100) {
    await db.knowledgeSource.update({
      where: { id: source.id },
      data: { status: "failed", error: "content_too_short" },
    });
    return { ok: false as const, reason: "content_too_short", sourceId: source.id };
  }

  await db.knowledgeDocument.deleteMany({ where: { sourceId: source.id } });

  const doc = await db.knowledgeDocument.create({
    data: { sourceId: source.id, url, content, metadata: { selector: selector ?? null } },
  });

  const pieces = chunkText(content);
  if (pieces.length === 0) {
    await db.knowledgeSource.update({
      where: { id: source.id },
      data: { status: "failed", error: "no_chunks" },
    });
    return { ok: false as const, reason: "no_chunks", sourceId: source.id };
  }

  const vectors: (number[] | null)[] = [];
  for (let i = 0; i < pieces.length; i += 32) {
    const batch = pieces.slice(i, i + 32);
    const embedded = await embed(batch.map((c) => c.text));
    for (let j = 0; j < batch.length; j++) vectors.push(embedded?.[j] ?? null);
  }

  await db.knowledgeChunk.createMany({
    data: pieces.map((p, i) => ({
      documentId: doc.id,
      text: p.text,
      embedding: vectors[i] ? vectorLiteral(vectors[i]!) : undefined,
    })),
  });

  await db.knowledgeSource.update({
    where: { id: source.id },
    data: { status: "ingested", ingestedAt: new Date(), error: null },
  });

  return { ok: true as const, sourceId: source.id, documentId: doc.id, chunks: pieces.length };
}

export async function fetchAndExtract(url: string, selector: string | null): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "EduOS-RAG/1.0 (+edtech)" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const ct = res.headers.get("content-type") ?? "";
  const body = await res.text();

  if (ct.includes("html")) {
    const $ = cheerio.load(body);
    ["script", "style", "nav", "header", "footer", "aside", "iframe", "noscript"].forEach((tag) =>
      $(tag).remove(),
    );
    const target = selector && selector.trim() ? $(selector) : $("#main");
    const raw = target.length > 0 ? target.text() : $("main").text() || $("body").text();
    return raw.replace(/\s+/g, " ").replace(/[\n\r]+/g, "\n").trim();
  }

  return body.replace(/\s+/g, " ").trim();
}
