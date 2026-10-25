import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { ok, fail, handleApiError } from "@/lib/api";
import { aiEnabled, chatJSON } from "@/lib/ai/client";
import { buildBatchContext } from "@/lib/ai/context/batch";
import { route } from "@/lib/ops-route";

export const dynamic = "force-dynamic";

const TypeEnum = z.enum(["QUIZ", "MIDTERM", "FINAL", "PROJECT", "LAB"]);
const DifficultyEnum = z.enum(["easy", "medium", "hard", "mixed"]).default("mixed");

const In = z.object({
  batchId: z.string().min(1),
  moduleId: z.string().min(1).optional().nullable(),
  type: TypeEnum,
  questionCount: z.number().int().min(1).max(40),
  difficulty: DifficultyEnum,
  title: z.string().trim().max(200).optional(),
});

const GeneratedSchema = z.object({
  title: z.string().default(""),
  questions: z
    .array(
      // Models often answer with "question"/"answer" keys; accept them rather than fall back.
      z.preprocess(
        (v) => (v && typeof v === "object" ? { q: (v as Record<string, unknown>).question, a: (v as Record<string, unknown>).answer, ...v } : v),
        z.object({
          q: z.string().min(1),
          a: z.coerce.string().default(""),
          marks: z.coerce.number().int().min(0).default(0),
        }),
      ),
    )
    .default([]),
  maxScore: z.number().int().min(0).default(0),
  message: z.string().default(""),
});

const SYSTEM = `You are an instructor assistant at a free IT training institute in Pakistan.
Generate assessment questions grounded in the batch's weak topics and the module content.
Vary question phrasing; avoid boilerplate. Every question must have an answer key.
Marks per question should reflect difficulty (easy ≈ 2-3, medium ≈ 4-5, hard ≈ 6-8).
Return maxScore as the sum of all marks. Never fabricate module names that are not in the context.
Return JSON exactly in this shape:
{"title":"...","questions":[{"q":"question text","a":"answer key","marks":4}],"maxScore":40}`;

async function POST_(req: Request) {
  try {
    const user = await requireRole("MANAGEMENT", "INSTRUCTOR");
    const parsed = In.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return fail(parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "), 422);
    }
    const { batchId, moduleId, type, questionCount, difficulty, title } = parsed.data;

    const batch = await db.batch.findUnique({
      where: { id: batchId },
      select: { id: true, code: true, instructorId: true, course: { select: { title: true } } },
    });
    if (!batch) return fail("Batch not found", 404);
    if (user.role === "INSTRUCTOR" && batch.instructorId !== user.instructorId) {
      return fail("You can only generate assessments for your own batches.", 403);
    }

    let moduleName: string | null = null;
    if (moduleId) {
      const mod = await db.module.findFirst({
        where: { id: moduleId, course: { batches: { some: { id: batchId } } } },
        select: { id: true, title: true },
      });
      if (!mod) return fail("Module not found or does not belong to this batch's course.", 422);
      moduleName = mod.title;
    }

    if (!aiEnabled()) {
      return ok({
        source: "fallback",
        data: GeneratedSchema.parse({
          title: title ?? `${type} — ${batch.code}`,
          message: "AI generation is disabled. Draft your questions manually using the batch analysis on the copilot page.",
          questions: [],
          maxScore: 0,
        }),
      });
    }

    const ctx = await buildBatchContext(batchId).catch(() => null);
    if (!ctx) return fail("Could not load batch analytics context.", 500);

    const userPrompt = [
      `Batch: ${batch.code} (${batch.course.title})`,
      moduleName ? `Focus module: ${moduleName}` : "Focus: batch-wide (use weak topics).",
      `Assessment type: ${type}. Question count: ${questionCount}. Difficulty: ${difficulty}.`,
      title ? `Preferred title: ${title}.` : "Propose a concise title.",
      "",
      "Batch context (JSON):",
      JSON.stringify(ctx),
    ].join("\n");

    const res = await chatJSON({
      system: SYSTEM,
      user: userPrompt,
      schema: GeneratedSchema,
      temperature: 0.55,
    });

    if (!res.ok) {
      return ok({
        source: "fallback",
        reason: res.reason,
        data: GeneratedSchema.parse({
          title: title ?? `${type} — ${batch.code}`,
          message: `AI generation failed (${res.reason}). Draft questions manually.`,
          questions: [],
          maxScore: 0,
        }),
      });
    }

    // maxScore is arithmetic, not the model's job: always the sum of the marks it gave.
    return ok({ source: "ai", data: { ...res.data, maxScore: res.data.questions.reduce((t, q) => t + q.marks, 0) } });
  } catch (error) {
    return handleApiError(error);
  }
}

export const POST = route("/api/instructor/generate-assessment", POST_);
