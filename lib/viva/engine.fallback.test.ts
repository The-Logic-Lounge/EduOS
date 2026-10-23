import { describe, it, expect, vi } from "vitest";

/**
 * The AI-down path, end to end against a SCRATCH database (it writes a VivaSession):
 *   VIVA_DB_TEST=1 DATABASE_URL=postgresql://postgres@localhost:54329/eduos npx vitest run lib/viva
 * Skipped by default so `npx vitest run` never needs a database.
 */
vi.mock("@/lib/ai/client", () => ({
  MODEL: () => "qwen-plus",
  TRANSLATE_MODEL: () => "qwen-mt-flash",
  chatJSON: async () => ({ ok: false, reason: "provider_auth" }),
  translateToUrdu: async () => ({ ok: false, reason: "provider_auth" }),
}));

describe.skipIf(!process.env.VIVA_DB_TEST)("viva on the computed fallback", () => {
  it("completes, is provisional, and never stamps the passport", async () => {
    const { db } = await import("@/lib/db");
    const { startViva, answerViva, publicVerification } = await import("./engine");
    const studentId = "stu_016";
    const skill = await db.studentSkill.findFirstOrThrow({ where: { studentId }, select: { skillId: true, verifiedAt: true } });

    const started = await startViva(studentId, { skillId: skill.skillId, language: "ur" });
    expect(started.source).toBe("fallback");
    expect(started.data.current?.qModel).toBe("fallback");
    expect(started.data.current?.translatedBy).toBeUndefined(); // Urdu unavailable -> English shown
    expect(started.data.current).not.toHaveProperty("key");

    let view = started.data;
    for (let i = 0; i < 4; i++) {
      // Answer with the stored key itself: the keyword grader must give it full marks.
      const row = await db.vivaSession.findUniqueOrThrow({ where: { id: view.id }, select: { transcript: true } });
      const open = (row.transcript as { key?: string; score?: number }[]).find((t) => typeof t.score !== "number")!;
      const r = await answerViva(view.id, studentId, { answer: `In my project: ${open.key}`, msToAnswer: 20000, pasted: false });
      expect(r.source).toBe("fallback");
      view = r.data;
    }

    expect(view.status).toBe("passed");
    expect(view.provisional).toBe(true);
    expect(view.verdict).toMatch(/^Provisional pass — needs trainer review/);
    expect(view.answered.every((t) => t.model === "fallback")).toBe(true);

    const after = await db.studentSkill.findFirstOrThrow({ where: { studentId, skillId: skill.skillId }, select: { verifiedBy: true } });
    expect(after.verifiedBy).not.toBe(view.id);
    expect(await publicVerification(view.id)).toBeNull();
    await expect(answerViva(view.id, studentId, { answer: "more", msToAnswer: 1, pasted: false })).rejects.toMatchObject({ status: 409 });
  }, 60_000);
});
