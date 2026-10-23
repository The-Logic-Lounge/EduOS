/**
 * Peer Circles — pure matching. One trainer cannot re-teach 100 students one by one, but in
 * every batch some classmates have already mastered the concept others are missing. This pairs
 * them from the same per-question evidence Gap Finder uses. No I/O here, so it is unit-tested.
 */

export const MENTOR_MIN = 80;        // mastery a mentor must have on the concept
export const LEARNER_MAX = 60;       // below this is a gap (same as GAP_THRESHOLD)
export const PER_MENTOR = 2;         // learners per mentor per concept
export const MENTOR_LOAD = 3;        // learners per mentor across all concepts

export type Mastery = { studentId: string; concept: string; mastery: number };
export type Person = { studentId: string; name: string; rollNo: string; phone: string | null };
export type Circle = {
  concept: string;
  mentor: Person & { mastery: number };
  learners: (Person & { mastery: number })[];
};
export type PeerPlan = { circles: Circle[]; unmatched: { concept: string; learners: (Person & { mastery: number })[] }[] };

/**
 * Greedy, fair matching per concept: the weakest learner gets the strongest free mentor; a
 * mentor takes at most PER_MENTOR learners on one concept and MENTOR_LOAD in total; a student
 * never mentors a concept they are themselves missing. Concepts with the most learners go first,
 * so the biggest gaps get the best mentors. Learners left over stay with the trainer.
 */
export function matchPeers(rows: Mastery[], people: Map<string, Person>): PeerPlan {
  const byConcept = new Map<string, Mastery[]>();
  for (const r of rows) {
    if (!people.has(r.studentId)) continue;
    if (!byConcept.has(r.concept)) byConcept.set(r.concept, []);
    byConcept.get(r.concept)!.push(r);
  }
  const concepts = [...byConcept.entries()]
    .map(([concept, rs]) => ({ concept, learners: rs.filter((r) => r.mastery < LEARNER_MAX).sort((a, b) => a.mastery - b.mastery), mentors: rs.filter((r) => r.mastery >= MENTOR_MIN).sort((a, b) => b.mastery - a.mastery) }))
    .filter((c) => c.learners.length > 0)
    .sort((a, b) => b.learners.length - a.learners.length || a.concept.localeCompare(b.concept));

  const load = new Map<string, number>();
  const circles: Circle[] = [];
  const unmatched: PeerPlan["unmatched"] = [];
  for (const c of concepts) {
    const open = new Map<string, Circle>();
    const left: (Person & { mastery: number })[] = [];
    for (const l of c.learners) {
      const learner = { ...people.get(l.studentId)!, mastery: l.mastery };
      const mentor = c.mentors.find((m) => {
        const circle = open.get(m.studentId);
        return (load.get(m.studentId) ?? 0) < MENTOR_LOAD && (circle ? circle.learners.length < PER_MENTOR : true);
      });
      if (!mentor) { left.push(learner); continue; }
      let circle = open.get(mentor.studentId);
      if (!circle) {
        circle = { concept: c.concept, mentor: { ...people.get(mentor.studentId)!, mastery: mentor.mastery }, learners: [] };
        open.set(mentor.studentId, circle);
        circles.push(circle);
      }
      circle.learners.push(learner);
      load.set(mentor.studentId, (load.get(mentor.studentId) ?? 0) + 1);
    }
    if (left.length) unmatched.push({ concept: c.concept, learners: left });
  }
  return { circles, unmatched };
}

/** wa.me wants digits only, country code first. Pakistani numbers: "0300…" -> "92300…". */
export function waNumber(phone: string | null): string | null {
  if (!phone) return null;
  let d = phone.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("0")) d = "92" + d.slice(1);
  // Pakistani mobiles are 92 + 10 digits; other countries 11–15 digits in total.
  if (d.startsWith("92")) return d.length === 12 ? d : null;
  return d.length >= 11 && d.length <= 15 ? d : null;
}

/** A WhatsApp deep link with a prefilled message. Nothing is sent until the trainer taps send. */
export const waLink = (phone: string | null, text: string): string => {
  const n = waNumber(phone);
  // No usable number: WhatsApp's share link opens the contact picker with the message ready.
  return `https://wa.me/${n ?? ""}?text=${encodeURIComponent(text)}`;
};
