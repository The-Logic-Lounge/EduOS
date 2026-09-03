import { z } from "zod";

/** Validation for student registration and updates. The API routes' only trust boundary. */

const name = z.string().trim().min(2, "Name must be 2-80 characters").max(80, "Name must be 2-80 characters");
const email = z.string().trim().toLowerCase().email("Enter a valid email address").max(160);
const password = z.string().min(6, "Password must be at least 6 characters").max(200);
const rollNo = z
  .string()
  .trim()
  .toUpperCase()
  .min(3, "Roll number must be 3-24 characters")
  .max(24, "Roll number must be 3-24 characters");
const phone = z.string().trim().min(7, "Enter a valid phone number").max(24);
const city = z.string().trim().min(2, "City must be 2-60 characters").max(60);
const education = z.string().trim().min(2, "Education must be 2-120 characters").max(120);

export const StudentCreate = z.object({
  name,
  email,
  password,
  rollNo: rollNo.optional(),
  phone,
  city,
  education,
  /** Enrol immediately on registration. */
  batchId: z.string().trim().min(1).optional(),
});

export const StudentUpdate = z
  .object({
    name: name.optional(),
    email: email.optional(),
    password: password.optional(),
    rollNo: rollNo.optional(),
    phone: phone.optional(),
    city: city.optional(),
    education: education.optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: "Nothing to update",
  });

export const EnrollIn = z.object({ batchId: z.string().trim().min(1, "A batch is required") });

export type StudentCreateInput = z.infer<typeof StudentCreate>;
export type StudentUpdateInput = z.infer<typeof StudentUpdate>;

/** Turns a ZodError into the one-line message `fail()` renders. */
export const zodMessage = (error: z.ZodError) =>
  error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ");
