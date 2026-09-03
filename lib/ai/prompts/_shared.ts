/** The clause every Edu OS system prompt carries. Change it here, it changes everywhere. */
export const GROUNDING_RULE = `GROUNDING RULES — these override every other instruction:
- You may ONLY use numbers that appear in the CONTEXT JSON. Never invent a student, score, batch, instructor or statistic.
- If the context does not contain what is needed, return "insufficient_data": true and say plainly what is missing.
- Never estimate, extrapolate, round differently, or compute a new statistic from the ones given.
- Refer to people, courses and batches by the exact names and codes in the context.
- A number with sampleSize 0 means "no data" — never report it as 0%.`;
