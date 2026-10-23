import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { Prisma, type PrismaClient } from "@prisma/client";
import { AuthError } from "./api";
import { authSecret, SESSION_COOKIE } from "./session-secret";

/**
 * Tenant isolation, enforced once for every caller of `db`.
 *
 * Every page, API route, analytics function and AI tool reads through `db`, so scoping
 * the client is the one place that cannot be forgotten by a new route. The tenant comes
 * from the signed session cookie via Next's own request scope:
 *   - system: outside a request (seed, scripts)     -> unscoped, trusted code only
 *   - anon:   no / invalid session (login, public)  -> unscoped; every protected route
 *             already calls requireUser() before touching data
 *   - org:    signed-in user                        -> every query filtered to their org
 * A pre-tenancy session (no org claim) counts as anon: getSessionUser() returns null for it,
 * so requireUser() refuses it on every protected route.
 */

export type TenantCtx = { kind: "system" } | { kind: "anon" } | { kind: "org"; orgId: string };

export async function tenantContext(): Promise<TenantCtx> {
  let store: Awaited<ReturnType<typeof cookies>>;
  try {
    store = await cookies();
  } catch {
    return { kind: "system" };
  }
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return { kind: "anon" };
  let payload: Record<string, unknown>;
  try {
    ({ payload } = await jwtVerify(token, authSecret()));
  } catch {
    return { kind: "anon" };
  }
  const orgId = payload.organizationId;
  // A session minted before tenancy carries no org. getSessionUser() already treats it as
  // signed out, so do the same here: throwing turned every DB read on a public page (the
  // homepage's course list) into a 500 for anyone still holding an old cookie.
  if (typeof orgId !== "string" || !orgId) return { kind: "anon" };
  return { kind: "org", orgId };
}

/** The signed-in user's org, or null outside an org-scoped request. */
export async function currentOrgId(): Promise<string | null> {
  const ctx = await tenantContext();
  return ctx.kind === "org" ? ctx.orgId : null;
}

type Where = Record<string, unknown>;
const byBatch = (o: string): Where => ({ batch: { organizationId: o } });
const byCourse = (o: string): Where => ({ course: { organizationId: o } });

/** How each model reaches its tenant. Models absent here are global by design:
 *  Organization, Skill (shared taxonomy), AiInsight (keyed per org in features.ts),
 *  ContactSubmission (public form), OpsEvent (platform telemetry). */
const SCOPE: Record<string, (o: string) => Where> = {
  user: (o) => ({ organizationId: o }),
  student: (o) => ({ organizationId: o }),
  instructor: (o) => ({ organizationId: o }),
  course: (o) => ({ organizationId: o }),
  batch: (o) => ({ organizationId: o }),
  classroom: (o) => ({ organizationId: o }),
  module: byCourse,
  courseSkill: byCourse,
  moduleSkill: (o) => ({ module: byCourse(o) }),
  knowledgeSource: byCourse,
  knowledgeDocument: (o) => ({ source: byCourse(o) }),
  knowledgeChunk: (o) => ({ document: { source: byCourse(o) } }),
  enrollment: byBatch,
  classSession: byBatch,
  assignment: byBatch,
  assessment: byBatch,
  schedule: byBatch,
  attendance: (o) => ({ session: byBatch(o) }),
  submission: (o) => ({ assignment: byBatch(o) }),
  assessmentResult: (o) => ({ assessment: byBatch(o) }),
  moduleProgress: (o) => ({ enrollment: byBatch(o) }),
  studentSkill: (o) => ({ student: { organizationId: o } }),
  instructorAvailability: (o) => ({ instructor: { organizationId: o } }),
  notification: (o) => ({ user: { organizationId: o } }),
};

const ROOT = new Set(["user", "student", "instructor", "course", "batch", "classroom"]);

/** Foreign keys a write may set, and the model each must belong to (same org). */
const FK: Record<string, string> = {
  courseId: "course",
  batchId: "batch",
  instructorId: "instructor",
  classroomId: "classroom",
  studentId: "student",
  userId: "user",
  moduleId: "module",
  assignmentId: "assignment",
  assessmentId: "assessment",
  sessionId: "classSession",
  enrollmentId: "enrollment",
  sourceId: "knowledgeSource",
  documentId: "knowledgeDocument",
};

const WHERE_OPS = new Set([
  "findUnique", "findUniqueOrThrow", "findFirst", "findFirstOrThrow", "findMany",
  "count", "aggregate", "groupBy", "update", "updateMany", "updateManyAndReturn",
  "delete", "deleteMany", "upsert",
]);
const CREATE_OPS = new Set(["create", "createMany", "createManyAndReturn"]);

export const lc = (model: string) => model[0].toLowerCase() + model.slice(1);

function addFilter(where: Where | undefined, filter: Where): Where {
  const w = where ?? {};
  const and = w.AND === undefined ? [] : Array.isArray(w.AND) ? w.AND : [w.AND];
  // Spread keeps unique fields at the top level, which findUnique/update/delete require.
  return { ...w, AND: [...and, filter] };
}

function fkValue(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && typeof (v as { set?: unknown }).set === "string") return (v as { set: string }).set;
  return null;
}

/** Reject writes that point a foreign key into another tenant, or move a root row across. */
async function checkData(base: PrismaClient, model: string, rows: Where[], orgId: string, stamp: boolean) {
  const wanted = new Map<string, Set<string>>();
  for (const row of rows) {
    if (ROOT.has(model)) {
      const o = fkValue(row.organizationId);
      if (o && o !== orgId) throw new AuthError("Forbidden", 403);
      if (stamp) row.organizationId = orgId;
    }
    for (const [key, target] of Object.entries(FK)) {
      const id = fkValue(row[key]);
      if (!id) continue;
      if (!wanted.has(target)) wanted.set(target, new Set());
      wanted.get(target)!.add(id);
    }
  }
  for (const [target, ids] of wanted) {
    const list = [...ids];
    const delegate = (base as unknown as Record<string, { count: (a: object) => Promise<number> }>)[target];
    // Ask "does any id belong to ANOTHER org?", not "are all ids visible in mine?". The raw
    // client runs outside the caller's $transaction, so a row created earlier in the same
    // transaction (User, then Student pointing at it) is invisible to it and must not fail.
    // Other orgs' rows are committed, hence visible, hence refused. An id that exists nowhere
    // is left to the database's own foreign-key constraint.
    const foreign = await delegate.count({ where: { AND: [{ id: { in: list } }, { NOT: SCOPE[target](orgId) }] } });
    // 404, not 403: never confirm that another org's id exists.
    if (foreign > 0) throw new AuthError("Not found", 404);
  }
}

export function tenantExtension(base: PrismaClient) {
  return Prisma.defineExtension({
    name: "tenant-isolation",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const m = lc(model);
          const scope = SCOPE[m];
          if (!scope) return query(args);
          const ctx = await tenantContext();
          if (ctx.kind !== "org") return query(args);
          const o = ctx.orgId;
          const a = (args ?? {}) as Where;

          if (WHERE_OPS.has(operation)) a.where = addFilter(a.where as Where | undefined, scope(o));
          if (CREATE_OPS.has(operation)) {
            const data = a.data as Where | Where[];
            await checkData(base, m, Array.isArray(data) ? data : [data], o, true);
          }
          if (operation === "update" || operation === "updateMany" || operation === "updateManyAndReturn") {
            await checkData(base, m, [a.data as Where], o, false);
          }
          if (operation === "upsert") {
            await checkData(base, m, [a.create as Where], o, true);
            await checkData(base, m, [a.update as Where], o, false);
          }
          return query(a);
        },
      },
    },
  });
}
