import { z } from "zod";

const code = z
  .string()
  .trim()
  .toUpperCase()
  .min(3, "Batch code must be 3-24 characters")
  .max(24);
const name = z.string().trim().min(3, "Name must be 3-120 characters").max(120);
const schedule = z.string().trim().min(2, "Schedule must be 2-160 characters").max(160);
const capacity = z.number().int().min(1, "Capacity must be at least 1").max(500);
const status = z.enum(["UPCOMING", "ACTIVE", "COMPLETED"]);

export const BatchCreate = z.object({
  code,
  name,
  courseId: z.string().trim().min(1, "Select a course"),
  instructorId: z.string().trim().min(1, "Select an instructor"),
  startDate: z.string().trim().min(1, "Start date is required"),
  endDate: z.string().trim().min(1, "End date is required"),
  schedule,
  capacity,
  status,
});

export const BatchUpdate = z
  .object({
    code: code.optional(),
    name: name.optional(),
    courseId: z.string().trim().min(1).optional(),
    instructorId: z.string().trim().min(1).optional(),
    startDate: z.string().trim().min(1).optional(),
    endDate: z.string().trim().min(1).optional(),
    schedule: schedule.optional(),
    capacity: capacity.optional(),
    status: status.optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: "Nothing to update",
  });

export type BatchCreateInput = z.infer<typeof BatchCreate>;
export type BatchUpdateInput = z.infer<typeof BatchUpdate>;

export const zodMessage = (error: z.ZodError) =>
  error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ");
