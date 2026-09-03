/**
 * Question classifier for the Management Intelligence feature.
 *
 * A rule-based first pass extracts the *kind* of analysis the user is asking
 * for and any referenced entities (courses, batches). The classified shape is
 * sent to the AI along with the context so the model only has to narrate —
 * it never has to pick the question type itself, which is where small models
 * drift. The classifier is also the input to the deterministic fallback, so
 * when the AI is off or fails the same question types still produce the same
 * shapes of answer.
 */

export type Kind =
  | "overview"
  | "ranking"
  | "entity"
  | "comparison"
  | "skill-gaps"
  | "report"
  | "instructor";

export type Classification = {
  kind: Kind;
  /** Optional pre-resolved entity names (course / batch codes or instructor names). */
  entities?: string[];
  /** For ranking: whether to sort ascending ("lowest") or descending ("best"). */
  rankTop?: boolean;
  /** For ranking: which dimension to rank on. */
  rankSubject?: "course" | "batch" | "instructor";
  /** For report: optional focus area. */
  focus?: "courses" | "batches" | "instructors" | "institute";
  /** Free-form hint passed to the AI — e.g. a specific batch code. */
  hint?: string;
};

type Ref = { code: string; title: string };

const CONNECTOR = /\s+(?:and|&|vs\.?|versus|with)\s+/i;

/**
 * Best-effort classification. Falls back to "overview" when nothing else
 * matches — the AI is then free to answer open-ended questions directly.
 */
export function classify(
  raw: string | undefined,
  courses: Ref[] = [],
  batches: Ref[] = [],
  instructors: { name: string }[] = [],
): Classification {
  const q = (raw || "").trim();
  if (!q) return { kind: "overview" };
  const low = q.toLowerCase();

  // ---------- comparison (compare X and Y) ----------
  if (/\bcompare\b|comparison\b/.test(low) || /\bvs\.?\b/.test(low)) {
    const parts = q.split(CONNECTOR).map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const resolved = resolveComparison(parts, courses, batches);
      if (resolved) return { kind: "comparison", entities: resolved };
    }
    return { kind: "comparison" };
  }

  // ---------- report ----------
  if (/\b(report|summary|brief|overview)\b/.test(low) && /\b(generate|produce|create|give|build|write|show)\b/.test(low)) {
    return { kind: "report", focus: detectFocus(low) };
  }
  if (/\bperformance report\b/.test(low)) {
    return { kind: "report", focus: detectFocus(low) };
  }

  // ---------- skill gaps ----------
  if (/\b(skill\s*gap|skill\s*shortage|missing\s*skill|unmet\s*skill|common\s*skill)\b/.test(low)) {
    return { kind: "skill-gaps" };
  }

  // ---------- ranking: best / lowest course or batch ----------
  const bestMatch = low.match(/\b(best|top|highest|leading|top[- ]?performing)\b/);
  const worstMatch = low.match(/\b(lowest|worst|bottom|weakest|poorest|lowest[- ]?performing|trailing)\b/);
  if (bestMatch || worstMatch) {
    const rankTop = Boolean(bestMatch);
    const rankSubject: Classification["rankSubject"] =
      /\bbatch\b/.test(low) ? "batch" : /\binstructor\b/.test(low) ? "instructor" : "course";
    return { kind: "ranking", rankTop, rankSubject };
  }

  // ---------- instructor analysis ----------
  if (/\binstructor\b|\bteacher\b|\bsir\b|\bmadam\b/.test(low)) {
    const name = findInstructor(q, instructors);
    return { kind: "instructor", hint: name ?? undefined };
  }

  // ---------- entity: specific course / batch ----------
  // Batches first — their codes (e.g. "PY-12") contain the course code as prefix,
  // so matching courses first would swallow batch-specific queries.
  const batch = findBatch(q, batches);
  if (batch) return { kind: "entity", entities: [batch] };
  const course = findCourse(q, courses);
  if (course) return { kind: "entity", entities: [course] };

  return { kind: "overview" };
}

// ---------------------------------------------------------------- helpers

function resolveComparison(parts: string[], courses: Ref[], batches: Ref[]): string[] | null {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();

  const score = (needle: string, haystack: Ref[]): { code: string; score: number } | null => {
    const n = norm(needle);
    let best: { code: string; score: number } | null = null;
    for (const c of haystack) {
      const code = c.code.toLowerCase();
      const title = norm(c.title);
      let s = 0;
      if (code === n || title === n) s = 100;
      else if (title && n.includes(title) && title.length > 3) s = 80;
      else if (title && title.includes(n) && n.length > 3) s = 70;
      else if (code && n.includes(code)) s = 60;
      if (s > 0 && (!best || s > best.score)) best = { code: c.code, score: s };
    }
    return best;
  };

  const out = parts
    .map((p) => score(p, courses) ?? score(p, batches))
    .filter((x): x is { code: string; score: number } => Boolean(x));
  if (out.length >= 2) return out.slice(0, 2).map((o) => o.code);
  return null;
}

function detectFocus(low: string): Classification["focus"] {
  if (/\bcourse\b|\bcourses\b/.test(low)) return "courses";
  if (/\bbatch\b|\bbatches\b/.test(low)) return "batches";
  if (/\binstructor\b|\binstructors\b|\bteacher\b|\bteachers\b/.test(low)) return "instructors";
  return "institute";
}

function findCourse(q: string, courses: Ref[]): string | null {
  const low = q.toLowerCase();
  let best: { code: string; len: number } | null = null;
  for (const c of courses) {
    if (low.includes(c.code.toLowerCase())) {
      if (!best || c.code.length > best.len) best = { code: c.code, len: c.code.length };
      continue;
    }
    if (c.title.length >= 4 && low.includes(c.title.toLowerCase())) {
      if (!best || c.title.length > best.len) best = { code: c.code, len: c.title.length };
    }
  }
  return best?.code ?? null;
}

function findBatch(q: string, batches: Ref[]): string | null {
  const low = q.toLowerCase();
  let best: { code: string; len: number } | null = null;
  for (const b of batches) {
    if (low.includes(b.code.toLowerCase())) {
      if (!best || b.code.length > best.len) best = { code: b.code, len: b.code.length };
    }
  }
  return best?.code ?? null;
}

function findInstructor(q: string, instructors: { name: string }[]): string | null {
  const low = q.toLowerCase();
  let best: string | null = null;
  for (const i of instructors) {
    if (low.includes(i.name.toLowerCase())) {
      if (!best || i.name.length > best.length) best = i.name;
    }
  }
  return best;
}
