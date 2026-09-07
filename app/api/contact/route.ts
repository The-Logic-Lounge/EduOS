import { z } from "zod";
import { db } from "@/lib/db";
import { ok, fail, handleApiError } from "@/lib/api";

const ContactIn = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.string().trim().email("Valid email is required").max(120),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  message: z.string().trim().min(1, "Message is required").max(4000),
});

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = ContactIn.safeParse(body);
    if (!parsed.success) {
      return fail(
        parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "),
        422
      );
    }

    const { phone, ...rest } = parsed.data;
    await db.contactSubmission.create({
      data: { ...rest, phone: phone || null },
    });

    return ok({ received: true });
  } catch (error) {
    return handleApiError(error);
  }
}
