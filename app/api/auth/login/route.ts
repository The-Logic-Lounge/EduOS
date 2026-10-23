import { z } from "zod";
import { createSession, homeFor, verifyLogin } from "@/lib/auth";
import { fail, handleApiError, ok } from "@/lib/api";
import { route } from "@/lib/ops-route";
import { emailField } from "@/lib/schemas/email";

export const dynamic = "force-dynamic";

// emailField trims + lowercases BEFORE validating: "admin@eduos.pk " from a phone keyboard signs in.
const schema = z.object({
  email: emailField,
  password: z.string({ required_error: "Password is required" }).min(1, "Password is required").max(200),
});

async function POST_(req: Request) {
  try {
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return fail(issue?.path.length ? issue.message : "Email and password are required", 400);
    }
    const { email, password } = parsed.data;
    // x-forwarded-for is set by Vercel's edge; first hop is the client.
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const user = await verifyLogin(email, password, ip);
    await createSession(user);
    return ok({ home: homeFor(user.role) });
  } catch (error) {
    return handleApiError(error);
  }
}

export const POST = route("/api/auth/login", POST_);
