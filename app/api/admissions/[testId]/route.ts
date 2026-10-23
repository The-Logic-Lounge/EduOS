import { requireRole } from "@/lib/auth";
import { handleApiError, ok } from "@/lib/api";
import { admissionsSummary } from "@/lib/admissions/server";
import { route } from "@/lib/ops-route";

export const dynamic = "force-dynamic";

/** GET /api/admissions/[testId] — ranked sheets + counts; ?format=csv = the shortlist. */
async function GET_(req: Request, { params }: { params: Promise<{ testId: string }> }) {
  try {
    await requireRole("MANAGEMENT");
    const { testId } = await params;
    const s = await admissionsSummary(testId);
    if (new URL(req.url).searchParams.get("format") === "csv") {
      const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
      const rows = s.sheets.filter((x) => x.status === "shortlisted").map((x) => [esc(x.candidateName), x.score, x.maxScore, x.source].join(","));
      return new Response(["candidate,score,max,source", ...rows].join("\n") + "\n", { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="entry-test-shortlist.csv"' } });
    }
    return ok(s);
  } catch (error) {
    return handleApiError(error);
  }
}

export const GET = route("/api/admissions/[testId]", GET_);
