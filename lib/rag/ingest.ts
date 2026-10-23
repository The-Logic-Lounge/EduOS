import { randomUUID } from "node:crypto";
import { z } from "zod";
import * as cheerio from "cheerio";
import { db } from "@/lib/db";
import { embed, vectorLiteral } from "@/lib/ai/embed";
import { chunkText } from "@/lib/ai/chunk";
import http, { type IncomingMessage } from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import { isBlockedAddress, safeLookup } from "./ip";

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
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[rag] fetch failed", url, msg);
    await db.knowledgeSource.update({
      where: { id: source.id },
      data: { status: "failed", error: `fetch_failed: ${/^[a-z0-9_]+$/.test(msg) ? msg : "error"}` },
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

  // Replace the old document only once the new one is fully built, in one transaction, so a
  // failure part-way never leaves the source with its old chunks deleted and no new ones.
  // `embedding` is Unsupported("vector") in Prisma: createMany rejects it, so rows go in
  // without it and the vectors are written by a parameterised UPDATE on known ids.
  const ids = pieces.map(() => randomUUID());
  const doc = await db.$transaction(
    async (tx) => {
      await tx.knowledgeDocument.deleteMany({ where: { sourceId: source.id } });
      const created = await tx.knowledgeDocument.create({
        data: { sourceId: source.id, url, content, metadata: { selector: selector ?? null } },
      });
      await tx.knowledgeChunk.createMany({
        data: pieces.map((p, i) => ({ id: ids[i], documentId: created.id, text: p.text })),
      });
      for (let i = 0; i < ids.length; i++) {
        const v = vectors[i];
        if (v) await tx.$executeRaw`UPDATE "KnowledgeChunk" SET embedding = ${vectorLiteral(v)}::vector WHERE id = ${ids[i]}`;
      }
      return created;
    },
    { timeout: 60_000 },
  );

  await db.knowledgeSource.update({
    where: { id: source.id },
    data: { status: "ingested", ingestedAt: new Date(), error: null },
  });

  return { ok: true as const, sourceId: source.id, documentId: doc.id, chunks: pieces.length };
}

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_HOPS = 3;

/** Scheme + IP-literal check; hostnames are checked at connect time by safeLookup. */
function assertPublicUrl(raw: string): URL {
  const u = URL.canParse(raw) ? new URL(raw) : null;
  if (!u || (u.protocol !== "http:" && u.protocol !== "https:")) throw new Error("blocked_url");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) && isBlockedAddress(host)) throw new Error("blocked_url");
  return u;
}

function get(u: URL, signal: AbortSignal): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const req = (u.protocol === "https:" ? https : http).request(
      u,
      // agent:false = fresh socket per hop, so every connect goes through safeLookup.
      { headers: { "User-Agent": "EduOS-RAG/1.0 (+edtech)" }, lookup: safeLookup, agent: false, signal },
      resolve,
    );
    req.on("error", reject);
    req.end();
  });
}

async function readCapped(res: IncomingMessage): Promise<string> {
  const parts: Buffer[] = [];
  let size = 0;
  for await (const chunk of res as AsyncIterable<Buffer>) {
    size += chunk.byteLength;
    if (size > MAX_BYTES) {
      res.destroy();
      throw new Error("too_large");
    }
    parts.push(chunk);
  }
  return Buffer.concat(parts).toString("utf8");
}

export async function fetchAndExtract(url: string, selector: string | null): Promise<string> {
  const signal = AbortSignal.timeout(15_000);
  let current = assertPublicUrl(url);
  let res: IncomingMessage;
  for (let hop = 0; ; hop++) {
    res = await get(current, signal);
    const status = res.statusCode ?? 0;
    const location = status >= 300 && status < 400 ? res.headers.location : undefined;
    if (!location) break;
    res.resume();
    if (hop >= MAX_HOPS) throw new Error("too_many_redirects");
    current = assertPublicUrl(new URL(location, current).toString());
  }
  const status = res.statusCode ?? 0;
  if (status < 200 || status >= 300) {
    res.resume();
    throw new Error(`http_${status}`);
  }
  const ct = res.headers["content-type"] ?? "";
  const body = await readCapped(res);

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
