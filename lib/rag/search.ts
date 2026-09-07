import { z } from "zod";
import { db } from "@/lib/db";
import { embed, embeddingsEnabled, vectorLiteral } from "@/lib/ai/embed";

const SearchOpts = z.object({
  courseId: z.string().min(1),
  query: z.string().trim().min(1).max(500),
  k: z.number().int().min(1).max(20).default(6),
});
export type SearchOpts = z.infer<typeof SearchOpts>;

export type RetrievedChunk = {
  id: string;
  text: string;
  score: number;
  source: {
    topic: string;
    url: string;
    courseCode: string;
  };
};

export async function searchKnowledge(opts: SearchOpts): Promise<{
  ok: boolean;
  mode: "vector" | "text" | "empty";
  chunks: RetrievedChunk[];
  reason?: string;
}> {
  const parsed = SearchOpts.safeParse(opts);
  if (!parsed.success) {
    return { ok: false, mode: "empty", chunks: [], reason: "invalid_input" };
  }
  const { courseId, query, k } = parsed.data;

  if (embeddingsEnabled()) {
    const vectors = await embed([query]);
    if (vectors && vectors[0]) {
      const lit = vectorLiteral(vectors[0]);
      try {
        const rows = await db.$queryRawUnsafe<
          { id: string; text: string; score: number; topic: string; url: string; courseCode: string }[]
        >(
          `SELECT
             kc.id,
             kc.text,
             1 - (kc.embedding <=> $1::vector) AS score,
             ks.topic,
             ks.url,
             c.code AS "courseCode"
           FROM "KnowledgeChunk" kc
           JOIN "KnowledgeDocument" kd ON kd.id = kc."documentId"
           JOIN "KnowledgeSource" ks ON ks.id = kd."sourceId"
           JOIN "Course" c ON c.id = ks."courseId"
           WHERE ks."courseId" = $2
           ORDER BY kc.embedding <=> $1::vector
           LIMIT $3;`,
          lit,
          courseId,
          k,
        );
        if (rows.length === 0) return { ok: true, mode: "empty", chunks: [] };
        return {
          ok: true,
          mode: "vector",
          chunks: rows.map((r) => ({
            id: r.id,
            text: r.text,
            score: Number(r.score),
            source: { topic: r.topic, url: r.url, courseCode: r.courseCode },
          })),
        };
      } catch (e) {
        console.warn("[searchKnowledge] vector query failed, falling back to text:", e instanceof Error ? e.message : e);
      }
    }
  }

  try {
    const terms = query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 2)
      .slice(0, 6);
    const rows = await db.knowledgeChunk.findMany({
      where: terms.length > 0
        ? {
            document: { source: { courseId } },
            AND: terms.map((t) => ({ text: { contains: t, mode: "insensitive" } })),
          }
        : { document: { source: { courseId } } },
      take: k,
      select: {
        id: true,
        text: true,
        document: {
          select: {
            source: { select: { topic: true, url: true, course: { select: { code: true } } } },
          },
        },
      },
    });
    if (rows.length === 0) return { ok: true, mode: "empty", chunks: [] };
    return {
      ok: true,
      mode: "text",
      chunks: rows.map((r) => ({
        id: r.id,
        text: r.text,
        score: 0,
        source: {
          topic: r.document.source.topic,
          url: r.document.source.url,
          courseCode: r.document.source.course.code,
        },
      })),
    };
  } catch (e) {
    return {
      ok: false,
      mode: "empty",
      chunks: [],
      reason: e instanceof Error ? e.message : "text_search_failed",
    };
  }
}
