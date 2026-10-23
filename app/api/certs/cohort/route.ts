import { requireRole } from "@/lib/auth";
import { handleApiError, ok } from "@/lib/api";
import { cohortReadiness } from "@/lib/certs/server";
import { route } from "@/lib/ops-route";

export const dynamic = "force-dynamic";

/** GET /api/certs/cohort — institute-wide ACA readiness (management only, tenant-scoped).
 *  ?format=csv returns the exam-ready list for voucher nomination. */
async function GET_(req: Request) {
  try {
    await requireRole("MANAGEMENT");
    const c = await cohortReadiness();
    if (new URL(req.url).searchParams.get("format") === "csv") {
      const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
      const lines = ["name,roll_no,batches,readiness,weakest_domain", ...c.ready.map((r) => [esc(r.name), esc(r.rollNo), esc(r.batches.join(" ")), r.score, esc(r.weakest ?? "")].join(","))];
      return new Response(lines.join("\n") + "\n", { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="aca-genai-ready.csv"' } });
    }
    return ok(c);
  } catch (error) {
    return handleApiError(error);
  }
}

export const GET = route("/api/certs/cohort", GET_);
