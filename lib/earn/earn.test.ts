import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { groundedAgainst } from "@/lib/ai/guard";
import { GIGS, PKR_PER_USD, gigById, toPkr } from "./gigs";
import { matchGig, rankGigs, type OwnedSkill } from "./match";
import { PlanSchema, buildPlanContext, credentialClaims, evidenceBlock, fallbackPlan, guardedParts, reviewAiPlan, type Evidence, type Plan } from "./plan";

const sk = (name: string, score: number, verified = false, level = "ADVANCED"): OwnedSkill => ({ name, level, score, verified });
const ali: OwnedSkill[] = [sk("Python Basics", 94), sk("Problem Solving", 94), sk("Git & GitHub", 95), sk("Algorithms", 94)];

describe("gig catalog", () => {
  it("only names skills that exist in the seed", () => {
    const seed = readFileSync("prisma/seed.mjs", "utf8");
    const block = seed.slice(seed.indexOf("const SKILLS = ["), seed.indexOf("];", seed.indexOf("const SKILLS = [")));
    const names = new Set([...block.matchAll(/\["([^"]+)",\s*"[^"]+"\]/g)].map((m) => m[1]));
    expect(names.size).toBeGreaterThan(20);
    for (const g of GIGS) for (const [n] of g.skills) expect(names, `${g.id}: ${n}`).toContain(n);
    expect(new Set(GIGS.map((g) => g.id)).size).toBe(GIGS.length);
  });
  it("converts with the one assumed rate", () => {
    expect(toPkr(10)).toBe(10 * PKR_PER_USD);
    expect(toPkr(15)).toBe(4200);
  });
});

describe("matchGig", () => {
  const gig = gigById("python-automation")!; // Python 3, Problem Solving 2, Git 1, OOP 1

  it("weights verified skills higher and reports the lift", () => {
    const unver = matchGig(gig, ali);
    const ver = matchGig(gig, ali.map((s) => (s.name === "Python Basics" ? { ...s, verified: true } : s)));
    expect(ver.readiness).toBeGreaterThan(unver.readiness);
    const lift = unver.unverified.find((u) => u.name === "Python Basics")!.lift;
    expect(ver.readiness - unver.readiness).toBeGreaterThanOrEqual(lift - 1);
    expect(ver.readiness - unver.readiness).toBeLessThanOrEqual(lift + 1);
    expect(ver.unverified.map((u) => u.name)).not.toContain("Python Basics");
  });

  it("lists missing skills, heaviest first, and caps readiness at 100", () => {
    const m = matchGig(gig, ali);
    expect(m.missing).toEqual([{ name: "Object-Oriented Programming", weight: 1 }]);
    const full = matchGig(gig, gig.skills.map(([n]) => sk(n, 150, true)));
    expect(full.readiness).toBe(100);
    expect(full.missing).toEqual([]);
  });

  it("is 0 with no matching skills", () => {
    expect(matchGig(gig, [sk("SEO", 90)]).readiness).toBe(0);
  });
});

describe("rankGigs", () => {
  it("returns the 3 best gigs the student has evidence for", () => {
    const top = rankGigs(GIGS, ali);
    expect(top).toHaveLength(3);
    expect(top[0]!.gigId).toBe("python-automation");
    expect(top.map((t) => t.readiness)).toEqual([...top.map((t) => t.readiness)].sort((a, b) => b - a));
  });
  it("is empty for a student with no skills", () => {
    expect(rankGigs(GIGS, [])).toEqual([]);
  });
});

describe("fallback plan", () => {
  const ev: Evidence = {
    firstName: "Ali",
    institute: "Bano Qabil",
    courses: [{ title: "Python Programming", status: "ACTIVE" }],
    attendancePct: 87.5,
    skills: [sk("Python Basics", 94, true), ...ali.slice(1, 3), sk("Algorithms", 94, true), sk("SEO", 70, true), sk("Excel", 50)],
  };

  for (const gig of GIGS) {
    it(`${gig.id}: valid shape, grounded, honest`, () => {
      const match = matchGig(gig, ev.skills);
      const plan = fallbackPlan(ev, gig, match);
      expect(PlanSchema.safeParse(plan).success).toBe(true);
      const g = groundedAgainst(guardedParts(plan), buildPlanContext(ev, gig, match));
      expect(g.ungrounded).toEqual([]);
      // The template's own pitch makes no credential claim; only the stamped block does.
      const pitch = plan.listing.description.replace(evidenceBlock(ev, match), "");
      expect(credentialClaims({ ...plan.listing, description: pitch })).toEqual([]);
      expect(plan.project.brief).not.toMatch(/a real [a-z]/);
      expect(plan.listing.platform).toBe(gig.platforms[0]);
      if (match.missing[0]) expect(plan.project.closesGap).toContain(match.missing[0].name);
      // "verified" only for skills that really were verified
      for (const s of ev.skills.filter((x) => !x.verified)) {
        expect(plan.listing.description).not.toContain(`${s.name} (Advanced, verified`);
      }
    });
  }

  it("flags an invented number", () => {
    const gig = GIGS[0]!;
    const match = matchGig(gig, ev.skills);
    const plan = fallbackPlan(ev, gig, match);
    plan.listing.description += " I have completed 250 orders.";
    expect(groundedAgainst(guardedParts(plan), buildPlanContext(ev, gig, match)).ungrounded).toContain(250);
  });
});

describe("credentialClaims", () => {
  const L = (description: string, title = "I will automate your tasks"): Plan["listing"] => ({ platform: "Fiverr", title, description });
  it.each([
    "I am verified in Python Basics.",
    "I passed a live viva in Python Basics.",
    "Certified in Object-Oriented Programming by my institute.",
    "My python basics skills are verified by my institute.",
    "Verified OOP and Python skills.",
    "Both my Python and Git skills passed live vivas.",
    "My skills were assessed and proven by Bano Qabil.",
  ])("fails closed on: %s", (text) => {
    expect(credentialClaims(L(text)).length).toBeGreaterThan(0);
  });
  it("checks the title too", () => {
    expect(credentialClaims(L("Hi.", "I will write viva-verified Python scripts"))).not.toEqual([]);
  });
  it("lets plain work descriptions through", () => {
    expect(credentialClaims(L("I write clean, tested code. I will assess your site and send an example report."))).toEqual([]);
  });
});

describe("reviewAiPlan", () => {
  const ev: Evidence = {
    firstName: "Ali",
    institute: "Bano Qabil",
    courses: [{ title: "Python Programming", status: "ACTIVE" }],
    attendancePct: 87.5,
    skills: [sk("Python Basics", 94, true), ...ali.slice(1)],
  };
  const gig = gigById("python-automation")!;
  const match = matchGig(gig, ev.skills);
  const ai = (over: Partial<Plan> = {}): Plan => ({
    project: { title: "Invoice renamer", brief: "Rename invoices.", closesGap: "OOP: classes.", deliverables: ["Repo"] },
    listing: { platform: "Fiverr", title: "I will automate your files with Python", description: "Hi, I'm Ali. I keep orders small." },
    plan: [{ day: "Day 1-2", task: "a" }, { day: "Day 3-6", task: "b" }, { day: "Day 7-14", task: "c" }],
    expectations: ["Start at $15 to $50.", "A first order can take weeks."],
    ...over,
  });

  it("stamps the record under a clean pitch and rebuilds nothing", () => {
    const { plan, rebuilt } = reviewAiPlan(ai(), ev, gig, match);
    expect(rebuilt).toEqual([]);
    expect(plan.listing.description).toBe(`Hi, I'm Ali. I keep orders small.\n\n${evidenceBlock(ev, match)}`);
    expect(plan.expectations).toEqual(ai().expectations);
  });

  it("rebuilds a pitch that claims a viva, keeping what the model wrote", () => {
    const raw = ai({ listing: { platform: "Fiverr", title: "I will automate", description: "I passed a live viva in OOP." } });
    const { plan, rebuilt } = reviewAiPlan(raw, ev, gig, match);
    expect(plan.listing).toEqual(fallbackPlan(ev, gig, match).listing);
    expect(rebuilt).toEqual([expect.objectContaining({ part: "listing", rejected: expect.stringContaining("passed a live viva") })]);
  });

  it("replaces expectations carrying an invented statistic, and the result is grounded", () => {
    const raw = ai({ expectations: ["Most students land one between day 10 and day 30.", "Start at $15."] });
    const { plan, rebuilt } = reviewAiPlan(raw, ev, gig, match);
    expect(plan.expectations).toEqual(fallbackPlan(ev, gig, match).expectations);
    expect(rebuilt).toEqual([expect.objectContaining({ part: "expectations", why: expect.stringContaining("30") })]);
    expect(groundedAgainst(guardedParts(plan), buildPlanContext(ev, gig, match)).ungrounded).toEqual([]);
  });

  it("rebuilds a pitch with an invented number", () => {
    const raw = ai({ listing: { platform: "Fiverr", title: "I will automate", description: "I have completed 250 orders." } });
    expect(reviewAiPlan(raw, ev, gig, match).rebuilt[0]).toMatchObject({ part: "listing", why: expect.stringContaining("250") });
  });
});
