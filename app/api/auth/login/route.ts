import { z } from "zod";
import { createSession, homeFor, verifyLogin } from "@/lib/auth";
import { fail, handleApiError, ok } from "@/lib/api";
import { route } from "@/lib/ops-route";

export const dynamic = "force-dynamic";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

async function POST_(req: Request) {
  try {
    const { email, password } = schema.parse(await req.json());
    // x-forwarded-for is set by Vercel's edge; first hop is the client.
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const user = await verifyLogin(email, password, ip);
    await createSession(user);
    return ok({ home: homeFor(user.role) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return fail("Email and password are required", 400);
    }
    return handleApiError(error);
  }
}

export const POST = route("/api/auth/login", POST_);
