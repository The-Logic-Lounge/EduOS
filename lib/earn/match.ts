import type { Gig } from "./gigs";

/**
 * Pure gig readiness. No DB, no AI — the same inputs always give the same ranking.
 *
 * A required skill earns credit = score/100, scaled by UNVERIFIED_FACTOR unless a
 * Proof-of-Skill viva verified it. Readiness = weighted credit / total weight.
 * So a verified skill counts in full and an unverified one at 80% — verifying is the
 * cheapest way to lift readiness, and `verifyLift` says by exactly how much.
 */

export const UNVERIFIED_FACTOR = 0.8;

export type OwnedSkill = { name: string; level: string; score: number; verified: boolean };

export type MatchedSkill = OwnedSkill & { weight: number };
export type MissingSkill = { name: string; weight: number };
export type UnverifiedSkill = { name: string; level: string; lift: number };

export type GigMatch = {
  gigId: string;
  readiness: number;
  matched: MatchedSkill[];
  missing: MissingSkill[];
  /** Attained but not viva-verified, with the readiness points verifying would add. */
  unverified: UnverifiedSkill[];
};

const round = (n: number) => Math.round(n);

export function matchGig(gig: Gig, owned: OwnedSkill[]): GigMatch {
  const byName = new Map(owned.map((s) => [s.name, s]));
  const total = gig.skills.reduce((a, [, w]) => a + w, 0);
  let credit = 0;
  const matched: MatchedSkill[] = [];
  const missing: MissingSkill[] = [];
  const unverified: UnverifiedSkill[] = [];

  for (const [name, weight] of gig.skills) {
    const s = byName.get(name);
    if (!s) {
      missing.push({ name, weight });
      continue;
    }
    const base = Math.max(0, Math.min(100, s.score)) / 100;
    credit += weight * base * (s.verified ? 1 : UNVERIFIED_FACTOR);
    matched.push({ ...s, weight });
    if (!s.verified) {
      unverified.push({ name, level: s.level, lift: round(((weight * base * (1 - UNVERIFIED_FACTOR)) / total) * 100) });
    }
  }

  const byWeight = (a: { weight: number }, b: { weight: number }) => b.weight - a.weight;
  return {
    gigId: gig.id,
    readiness: total > 0 ? round((credit / total) * 100) : 0,
    matched: matched.sort(byWeight),
    missing: missing.sort(byWeight),
    unverified: unverified.sort((a, b) => b.lift - a.lift),
  };
}

/** Top N gigs the student has at least one skill for, best first. Ties: fewer missing, then catalog order. */
export function rankGigs(gigs: Gig[], owned: OwnedSkill[], n = 3): GigMatch[] {
  return gigs
    .map((g, i) => ({ m: matchGig(g, owned), i }))
    .filter(({ m }) => m.matched.length > 0)
    .sort((a, b) => b.m.readiness - a.m.readiness || a.m.missing.length - b.m.missing.length || a.i - b.i)
    .slice(0, n)
    .map(({ m }) => m);
}
