import { ok, handleApiError } from "@/lib/api";
import { requireStudentAccess, studentAttendance } from "@/lib/students";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireStudentAccess(id);
    return ok(await studentAttendance(id));
  } catch (error) {
    return handleApiError(error);
  }
}
