import { db } from "@/lib/db";
import {
  studentBatchPerformance,
  studentOverallPerformance,
  studentBatchPerformanceMany,
} from "@/lib/analytics";
import { getScheduleForStudent } from "@/lib/scheduling/engine";
import type { ToolSpec } from "./client";

/**
 * Student-scoped tool registry.
 *
 * Every tool below is bound to a single studentId resolved from the session at the
 * API layer. The model cannot see, query, or name another student's data through
 * these functions — they never accept an identifier as input.
 */

type Impl = (input: Record<string, unknown>) => Promise<unknown>;

const str = (description: string) => ({ type: "string", description });
const NO_ARGS = { type: "object", properties: {}, additionalProperties: false } as const;

function makeTools(studentId: string) {
  async function myPerformance(input: { batchCode?: string }) {
    if (input.batchCode) {
      const batch = await db.batch.findFirst({
        where: {
          code: { equals: input.batchCode.trim(), mode: "insensitive" },
          enrollments: { some: { studentId, status: "ACTIVE" } },
        },
        select: { id: true, code: true, name: true },
      });
      if (!batch) return { error: `You are not enrolled in batch "${input.batchCode}".` };
      const perf = await studentBatchPerformance(studentId, batch.id);
      return { batchCode: batch.code, batchName: batch.name, ...perf };
    }
    const perf = await studentOverallPerformance(studentId);
    const enrollments = await db.enrollment.findMany({
      where: { studentId, status: "ACTIVE" },
      select: { batch: { select: { code: true, name: true } } },
    });
    return {
      enrolledBatches: enrollments.map((e) => ({ code: e.batch.code, name: e.batch.name })),
      ...perf,
    };
  }

  async function myAttendance() {
    const [enrollments, sessions] = await Promise.all([
      db.enrollment.findMany({
        where: { studentId, status: "ACTIVE" },
        select: { batch: { select: { code: true, name: true } } },
      }),
      db.attendance.findMany({
        where: { studentId },
        select: { status: true, session: { select: { batchId: true } } },
      }),
    ]);

    const byBatch = new Map<string, { present: number; absent: number; late: number; excused: number; total: number }>();
    for (const a of sessions) {
      const row = byBatch.get(a.session.batchId) ?? { present: 0, absent: 0, late: 0, excused: 0, total: 0 };
      row.total += 1;
      if (a.status === "PRESENT") row.present += 1;
      else if (a.status === "ABSENT") row.absent += 1;
      else if (a.status === "LATE") row.late += 1;
      else if (a.status === "EXCUSED") row.excused += 1;
      byBatch.set(a.session.batchId, row);
    }

    return enrollments.map((e) => {
      const row = byBatch.get(e.batch.code) ?? { present: 0, absent: 0, late: 0, excused: 0, total: 0 };
      const rate = row.total > 0 ? Math.round(((row.present + row.late) / row.total) * 1000) / 10 : 0;
      return {
        batchCode: e.batch.code,
        batchName: e.batch.name,
        ...row,
        attendanceRatePct: rate,
      };
    });
  }

  async function myAssessments() {
    const results = await db.assessmentResult.findMany({
      where: { studentId },
      orderBy: { assessment: { scheduledAt: "desc" } },
      take: 20,
      select: {
        score: true,
        assessment: {
          select: {
            title: true,
            type: true,
            maxScore: true,
            scheduledAt: true,
            batch: { select: { code: true, name: true } },
          },
        },
      },
    });
    return results.map((r) => ({
      title: r.assessment.title,
      type: r.assessment.type,
      score: r.score,
      maxScore: r.assessment.maxScore,
      percent: r.assessment.maxScore > 0 ? Math.round((r.score / r.assessment.maxScore) * 100) : 0,
      batchCode: r.assessment.batch.code,
      batchName: r.assessment.batch.name,
      scheduledAt: r.assessment.scheduledAt.toISOString(),
    }));
  }

  async function myAssignments() {
    const subs = await db.submission.findMany({
      where: { studentId },
      orderBy: { assignment: { dueDate: "desc" } },
      take: 20,
      select: {
        score: true,
        status: true,
        assignment: {
          select: {
            title: true,
            maxScore: true,
            dueDate: true,
            batch: { select: { code: true, name: true } },
          },
        },
      },
    });
    return subs.map((s) => ({
      title: s.assignment.title,
      status: s.status,
      score: s.score,
      maxScore: s.assignment.maxScore,
      batchCode: s.assignment.batch.code,
      dueDate: s.assignment.dueDate.toISOString(),
    }));
  }

  async function mySchedule() {
    const rows = await getScheduleForStudent(studentId);
    return rows.map((r) => ({
      day: r.day,
      startTime: r.startTime,
      endTime: r.endTime,
      batchCode: r.batch.code,
      batchName: r.batch.name,
      courseTitle: r.batch.course.title,
      instructor: r.instructor.user.name,
      classroom: r.classroom.name,
      building: r.classroom.building,
    }));
  }

  async function mySkillPassport() {
    const student = await db.student.findUnique({
      where: { id: studentId },
      select: {
        skills: {
          orderBy: { score: "desc" },
          take: 15,
          select: {
            level: true,
            score: true,
            evidenceCount: true,
            skill: { select: { name: true, category: true } },
          },
        },
      },
    });
    if (!student) return { error: "Student record not found." };
    return {
      skills: student.skills.map((s) => ({
        name: s.skill.name,
        category: s.skill.category,
        level: s.level,
        score: s.score,
        evidenceCount: s.evidenceCount,
      })),
    };
  }

  async function myBatchComparison() {
    const enrollments = await db.enrollment.findMany({
      where: { studentId, status: "ACTIVE" },
      select: {
        batchId: true,
        batch: { select: { code: true, name: true } },
      },
    });
    if (enrollments.length === 0) return { message: "You are not enrolled in any batches." };

    const perfMap = await studentBatchPerformanceMany(
      enrollments.map((e) => ({ studentId, batchId: e.batchId })),
    );

    return enrollments.map((e) => {
      const p = perfMap.get(`${studentId}:${e.batchId}`) ?? {
        overall: 0,
        assessmentPct: 0,
        assignmentPct: 0,
        attendancePct: 0,
        sampleSize: 0,
      };
      return { batchCode: e.batch.code, batchName: e.batch.name, ...p };
    });
  }

  const REGISTRY: Record<string, { spec: ToolSpec; run: Impl }> = {
    myPerformance: {
      spec: {
        name: "myPerformance",
        description:
          "Your own performance (assessments 50%, assignments 30%, attendance 20%). Optional batchCode restricts to one batch; omit for overall.",
        parameters: {
          type: "object",
          properties: { batchCode: str("Optional batch code, e.g. DS-05.") },
        },
      },
      run: myPerformance,
    },
    myAttendance: {
      spec: {
        name: "myAttendance",
        description: "Your attendance counts and rate for each enrolled batch: present, absent, late, excused, total.",
        parameters: NO_ARGS,
      },
      run: myAttendance,
    },
    myAssessments: {
      spec: {
        name: "myAssessments",
        description: "Your last 20 assessments with score, max score, percentage, batch and type.",
        parameters: NO_ARGS,
      },
      run: myAssessments,
    },
    myAssignments: {
      spec: {
        name: "myAssignments",
        description: "Your last 20 assignment submissions with status, score and due date.",
        parameters: NO_ARGS,
      },
      run: myAssignments,
    },
    mySchedule: {
      spec: {
        name: "mySchedule",
        description: "Your class timetable: day, time, batch, course, instructor, classroom, building.",
        parameters: NO_ARGS,
      },
      run: mySchedule,
    },
    mySkillPassport: {
      spec: {
        name: "mySkillPassport",
        description: "Your top skills with level, score and evidence count.",
        parameters: NO_ARGS,
      },
      run: mySkillPassport,
    },
    myBatchComparison: {
      spec: {
        name: "myBatchComparison",
        description: "Compare your performance across all the batches you're enrolled in.",
        parameters: NO_ARGS,
      },
      run: myBatchComparison,
    },
  };

  return REGISTRY;
}

export const STUDENT_TOOL_NAMES = [
  "myPerformance",
  "myAttendance",
  "myAssessments",
  "myAssignments",
  "mySchedule",
  "mySkillPassport",
  "myBatchComparison",
];

export function studentToolSpecs(): ToolSpec[] {
  // Specs do not depend on studentId; safe to build once.
  const reg = makeTools("_stub_");
  return Object.values(reg).map((r) => r.spec);
}

export async function runStudentTool(
  studentId: string,
  name: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  const reg = makeTools(studentId);
  const tool = reg[name];
  if (!tool) return { error: `Unknown tool "${name}".` };
  try {
    return await tool.run(input ?? {});
  } catch (e) {
    return { error: e instanceof Error ? e.message : "tool_failed" };
  }
}
