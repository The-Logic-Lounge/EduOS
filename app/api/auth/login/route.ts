import { z } from "zod";
import { createSession, homeFor, verifyLogin } from "@/lib/auth";
import { fail, handleApiError, ok } from "@/lib/api";

export const dynamic = "force-dynamic";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const { email, password } = schema.parse(await req.json());
    const user = await verifyLogin(email, password);
    await createSession(user);
    return ok({ home: homeFor(user.role) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return fail("Email and password are required", 400);
    }
    return handleApiError(error);
  }
}
