import { ok, handleApiError } from "@/lib/api";
import { requireStudentAccess, studentAssignments } from "@/lib/students";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireStudentAccess(id);
    return ok(await studentAssignments(id));
  } catch (error) {
    return handleApiError(error);
  }
}
