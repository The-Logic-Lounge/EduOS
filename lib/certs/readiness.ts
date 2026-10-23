import type { Certification } from "./catalog";

/** One skill as the Skill Passport holds it. */
export type SkillEvidence = { name: string; score: number; verified: boolean };

export const READY = 70;          // the exam's own pass mark
export const CLOSE = 50;
/** A viva-verified skill is worth more than one inferred from marks alone (capped at 100). */
export const VERIFIED_BONUS = 1.15;

export type DomainReadiness = { id: string; name: string; weight: number; score: number; evidence: string[]; missing: string[]; verified: string[] };
export type Readiness = { certId: string; score: number; band: "ready" | "close" | "building"; domains: DomainReadiness[]; weakest: DomainReadiness[] };

/**
 * Weighted readiness, 0–100. A domain scores 70% from its STRONGEST mapped skill (one solid
 * prerequisite is a real foundation for an associate exam) plus 30% from coverage of all its
 * mapped skills (a missing one counts 0, a verified one ×1.15, capped at 100). A domain with no
 * mapped skills scores 0 and is flagged "study needed" rather than guessed. The overall score
 * weights domains by the exam outline.
 */
export function readinessFor(cert: Certification, skills: SkillEvidence[]): Readiness {
  const byName = new Map(skills.map((s) => [s.name, s]));
  const domains = cert.domains.map((d): DomainReadiness => {
    const have = d.skills.map((n) => byName.get(n)).filter((s): s is SkillEvidence => !!s);
    const values = d.skills.map((n) => {
      const s = byName.get(n);
      return s ? Math.min(100, s.score * (s.verified ? VERIFIED_BONUS : 1)) : 0;
    });
    const mean = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    const score = values.length ? Math.round(0.7 * Math.max(...values) + 0.3 * mean) : 0;
    return {
      id: d.id, name: d.name, weight: d.weight, score,
      evidence: have.map((s) => s.name),
      verified: have.filter((s) => s.verified).map((s) => s.name),
      missing: d.skills.filter((n) => !byName.has(n)),
    };
  });
  const total = cert.domains.reduce((s, d) => s + d.weight, 0);
  const score = Math.round(domains.reduce((s, d) => s + d.score * d.weight, 0) / total);
  return {
    certId: cert.id,
    score,
    band: score >= READY ? "ready" : score >= CLOSE ? "close" : "building",
    domains,
    weakest: [...domains].sort((a, b) => a.score - b.score || b.weight - a.weight).slice(0, 2),
  };
}
