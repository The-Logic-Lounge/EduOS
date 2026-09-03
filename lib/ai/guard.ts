/**
 * Anti-hallucination guard.
 *
 * The model only ever receives a context JSON built from lib/analytics.ts, so any number
 * it emits that is NOT in that context was invented. This flags those numbers — it never
 * deletes them, because a silently edited answer is worse than a visibly suspect one.
 */

/** Numbers written inside prose ("attendance is 84.2%") count too — that is where hallucinations hide. */
export function numbersIn(obj: unknown): Set<number> {
  const out = new Set<number>();
  const walk = (v: unknown) => {
    if (typeof v === "number") {
      if (Number.isFinite(v)) out.add(v);
    } else if (typeof v === "string") {
      for (const m of v.matchAll(/-?\d+(?:\.\d+)?/g)) {
        const n = Number(m[0]);
        if (Number.isFinite(n)) out.add(n);
      }
    } else if (Array.isArray(v)) {
      v.forEach(walk);
    } else if (v && typeof v === "object") {
      Object.values(v as Record<string, unknown>).forEach(walk);
    }
  };
  walk(obj);
  return out;
}

// 0-10 are list positions, step numbers and small counts. Flagging them is all noise.
const NOISE = new Set(Array.from({ length: 11 }, (_, i) => i));

export function groundedAgainst<T>(
  result: T,
  context: unknown,
  tolerance = 0.6,
): { grounded: boolean; ungrounded: number[] } {
  const ctx = [...numbersIn(context)];
  const ungrounded: number[] = [];
  for (const n of numbersIn(result)) {
    if (NOISE.has(n)) continue;
    if (!ctx.some((c) => Math.abs(c - n) <= tolerance)) ungrounded.push(n);
  }
  return { grounded: ungrounded.length === 0, ungrounded };
}
