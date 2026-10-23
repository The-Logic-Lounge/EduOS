import { requireRole } from "@/lib/auth";
import { handleApiError, ok } from "@/lib/api";
import { assertPlatformAdmin } from "@/lib/platform";
import { healthChecks } from "@/lib/ops-summary";

export const dynamic = "force-dynamic";

const started = Date.now();

export async function GET() {
  try {
    assertPlatformAdmin(await requireRole("MANAGEMENT"));
    return ok({
      checks: await healthChecks(),
      instance: {
        region: process.env.VERCEL_REGION ?? "local",
        commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
        uptimeSec: Math.round((Date.now() - started) / 1000),
      },
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
