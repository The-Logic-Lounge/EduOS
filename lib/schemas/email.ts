import { z } from "zod";

/** The one canonical form of an email: phone keyboards append a space after autocomplete,
 *  and people type capitals. Applied at every boundary that accepts or looks up an email. */
export const normalizeEmail = (raw: string) => raw.trim().toLowerCase();

/** Trims and lowercases BEFORE `.email()` runs, so "Ali@X.pk " validates as "ali@x.pk". */
export const emailField = z
  .string({ required_error: "Email is required" })
  .trim()
  .toLowerCase()
  .email("Enter a valid email address")
  .max(160);
