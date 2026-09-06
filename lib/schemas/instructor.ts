import { z } from "zod";

const name = z.string().trim().min(2, "Name must be 2-80 characters").max(80);
const email = z.string().trim().toLowerCase().email("Enter a valid email address").max(160);
const password = z.string().min(6, "Password must be at least 6 characters").max(200);
const employeeNo = z
  .string()
  .trim()
  .toUpperCase()
  .min(3, "Employee number must be 3-24 characters")
  .max(24);
const specialization = z.string().trim().min(2, "Specialization must be 2-120 characters").max(120);
const bio = z.string().trim().min(2, "Bio must be 2-500 characters").max(500);

export const InstructorCreate = z.object({
  name,
  email,
  password,
  employeeNo,
  specialization,
  bio,
});

export const InstructorUpdate = z
  .object({
    name: name.optional(),
    email: email.optional(),
    password: password.optional(),
    employeeNo: employeeNo.optional(),
    specialization: specialization.optional(),
    bio: bio.optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: "Nothing to update",
  });

export type InstructorCreateInput = z.infer<typeof InstructorCreate>;
export type InstructorUpdateInput = z.infer<typeof InstructorUpdate>;

export const zodMessage = (error: z.ZodError) =>
  error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ");
