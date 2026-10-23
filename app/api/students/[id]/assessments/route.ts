import { ok, handleApiError } from "@/lib/api";
import { requireStudentAccess, studentAssessments } from "@/lib/students";
import { route } from "@/lib/ops-route";

export const dynamic = "force-dynamic";

async function GET_(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireStudentAccess(id);
    return ok(await studentAssessments(id));
  } catch (error) {
    return handleApiError(error);
  }
}

export const GET = route("/api/students/[id]/assessments", GET_);
