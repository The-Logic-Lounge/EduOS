import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { ok, fail, handleApiError } from "@/lib/api";
import { aiEnabled, chatWithTools } from "@/lib/ai/client";
import { studentToolSpecs, runStudentTool, STUDENT_TOOL_NAMES } from "@/lib/ai/student-tools";
import { buildStudentContext } from "@/lib/ai/context/student";

export const dynamic = "force-dynamic";

const ChatIn = z.object({
  message: z.string().trim().min(1).max(2000),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      }),
    )
    .max(20)
    .default([]),
});

const SYSTEM_PROMPT = `You are Edu OS, the personal study assistant for a student at a free IT training
institute in Pakistan. You can only see data the tools return — you never invent
grades, attendance, schedules, or skill levels. When the tools return nothing, say
so plainly and suggest the next step (e.g. "you have no assessments recorded yet
for that batch").

Use the student's own words to decide which tool to call. Call the fewest tools
needed, in order. After every answer, ground your reply in the data you saw:
quote a number, a batch code, a date, or a skill name. Never reveal another
student's data. If asked about anything unrelated to their studies, politely
redirect.

Personal-record tools (myPerformance, myAttendance, myAssessments, mySchedule,
mySkillPassport, myBatchComparison) answer questions about the student's own
grades, attendance, timetable, and skills.

searchCourseKnowledge is different: it answers conceptual course questions
(e.g. "what is a for loop in Python?", "explain dictionaries", "how do
exceptions work?"). When you use it, cite the topic name and URL from each
retrieved chunk so the student can read the full page. If the chunks do not
answer the question, say so and suggest asking the instructor.`;

export async function POST(req: Request) {
  try {
    const user = await requireRole("STUDENT");
    if (!user.studentId) return fail("Student profile not found.", 404);

    const parsed = ChatIn.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return fail(
        parsed.error.issues
          .map((i) => `${i.path.join(".") || "body"}: ${i.message}`)
          .join("; "),
        422,
      );
    }
    const { message, history } = parsed.data;

    if (!aiEnabled()) {
      const ctx = await buildStudentContext(user.studentId).catch(() => null);
      return ok({
        source: "fallback",
        answer:
          "AI is currently disabled. Here is a snapshot of your record instead:\n\n" +
          (ctx
            ? `• Enrolled in ${ctx.courses.length} batch(es): ${ctx.courses.map((c) => c.batchCode).join(", ") || "none"}\n` +
              `• Overall performance: ${ctx.overallPerformance.overall} (assessments ${ctx.overallPerformance.assessmentPct}%, assignments ${ctx.overallPerformance.assignmentPct}%, attendance ${ctx.overallPerformance.attendancePct}%)\n` +
              `• ${ctx.attainedSkills.length} skill(s) recorded; ${ctx.skillGaps.length} skill gap(s)\n` +
              `• ${ctx.recentAssessments.length} recent assessment(s)`
            : "No student data could be loaded."),
        used: [],
      });
    }

    const specs = studentToolSpecs();
    const studentId = user.studentId;

    const combinedUser = [
      ...history.map((h) => `${h.role === "user" ? "Student" : "Assistant"}: ${h.content}`),
      `Student: ${message}`,
    ].join("\n\n");

    const result = await chatWithTools({
      system: SYSTEM_PROMPT,
      user: combinedUser,
      tools: specs,
      exec: (name, input) => {
        if (!STUDENT_TOOL_NAMES.includes(name)) {
          return Promise.resolve({
            error: `Tool "${name}" is not available to students. Use only: ${STUDENT_TOOL_NAMES.join(", ")}.`,
          });
        }
        return runStudentTool(studentId, name, input);
      },
    });

    if (!result.ok) {
      const ctx = await buildStudentContext(studentId).catch(() => null);
      return ok({
        source: "fallback",
        reason: result.reason,
        answer:
          "I couldn't reach the AI service right now. Here is the latest snapshot of your record:\n\n" +
          (ctx
            ? `• Enrolled: ${ctx.courses.map((c) => c.batchCode).join(", ") || "none"}\n` +
              `• Overall: ${ctx.overallPerformance.overall}\n` +
              `• Skill gaps: ${ctx.skillGaps.slice(0, 3).map((g) => g.skill).join(", ") || "none visible"}`
            : "No data could be loaded."),
        used: [],
      });
    }

    return ok({ source: "ai", answer: result.data.answer, used: result.data.used });
  } catch (error) {
    return handleApiError(error);
  }
}
