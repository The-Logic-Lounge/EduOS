import { z } from "zod";
import { groundedAgainst } from "@/lib/ai/guard";
import { CATALOG_NOTE, PKR_NOTE, toPkr, type Gig } from "./gigs";
import type { GigMatch, OwnedSkill } from "./match";

/**
 * Pure half of the First-Earning Copilot: the context the model sees, the shape it must
 * return, and the deterministic fallback built from the same context. No DB, no network.
 */

export const PLAN_DAYS = 14;

const text = z.coerce.string().transform((s) => s.trim());

export const PlanSchema = z.object({
  project: z.object({
    title: text,
    brief: text,
    closesGap: text,
    deliverables: z.array(text).min(1).max(6),
  }),
  listing: z.object({
    platform: z.enum(["Fiverr", "Upwork"]),
    title: text,
    description: text,
  }),
  plan: z.array(z.object({ day: text, task: text })).min(3).max(10),
  expectations: z.array(text).min(1).max(6),
});
export type Plan = z.infer<typeof PlanSchema>;

export type Evidence = {
  firstName: string;
  institute: string;
  courses: { title: string; status: string }[];
  attendancePct: number | null;
  skills: OwnedSkill[];
};

/** Everything the model may know. Every number in its answer must appear here. */
export function buildPlanContext(ev: Evidence, gig: Gig, match: GigMatch) {
  return {
    student: {
      firstName: ev.firstName,
      institute: ev.institute,
      courses: ev.courses,
      attendancePct: ev.attendancePct,
      skills: ev.skills.map((s) => ({ name: s.name, level: s.level, score: s.score, vivaVerified: s.verified })),
      vivaVerifiedSkills: ev.skills.filter((s) => s.verified).map((s) => s.name),
    },
    gig: {
      title: gig.title,
      pitch: gig.pitch,
      platform: gig.platforms[0],
      otherPlatforms: gig.platforms.slice(1),
      clientAsk: gig.clientAsk,
      starterPriceUsd: { low: gig.priceUsd[0], high: gig.priceUsd[1] },
      starterPricePkr: { low: toPkr(gig.priceUsd[0]), high: toPkr(gig.priceUsd[1]) },
      typicalDeliveryDays: gig.deliveryDays,
      priceNote: `${CATALOG_NOTE}. ${PKR_NOTE}.`,
    },
    readiness: {
      percent: match.readiness,
      matchedSkills: match.matched.map((s) => s.name),
      missingSkills: match.missing.map((s) => s.name),
      unverifiedSkills: match.unverified.map((s) => ({ name: s.name, readinessLiftIfVerified: s.lift })),
    },
    planDays: PLAN_DAYS,
  };
}
export type PlanContext = ReturnType<typeof buildPlanContext>;

export const PLAN_PROMPT = `You are the First-Earning Copilot at a Pakistani skills institute. You help one student win
their FIRST paid freelance order for the gig in the context.

Return JSON exactly in this shape:
{"project":{"title":"","brief":"","closesGap":"","deliverables":[""]},
 "listing":{"platform":"Fiverr|Upwork","title":"","description":""},
 "plan":[{"day":"Day 1-2","task":""}],
 "expectations":[""]}

Rules:
- project: ONE small portfolio project a real client of this gig would recognise. It MUST also exercise
  readiness.missingSkills[0] if there is one ("closesGap" says which skill and how); if nothing is missing,
  say so in closesGap. 3-5 concrete deliverables.
- listing: write for gig.platform. Fiverr -> title starts "I will" (max 80 chars) + gig description.
  Upwork -> title is a profile headline + a short proposal reply to a typical client post.
  The description is the PITCH ONLY (60-120 words): who they are (first name, course, institute), what the
  buyer gets, how they work, typical delivery days. Do NOT list skills or levels and do NOT mention attendance.
  NEVER mention verification, vivas, certificates, assessments, exams or anything they "passed": an evidence
  block stamped from the institute's records is appended below your text automatically and is the only place
  such claims may appear. NEVER invent experience, past clients, reviews, years, ratings, tools they did not
  study, or any number not present in the context. Do not mention scores or readiness to buyers.
- plan: 5-7 steps covering planDays days, in order, each with a day range label. Build the project in the
  first week, PUBLISH the gig/profile by about day 8 at the low starter price, then outreach and replies to buyers.
  The goal is a first paid order, not a finished course.
- expectations: 3-4 honest lines: starter price range (use the context numbers only), that a first order can
  take weeks, that the ranges are indicative reference data, and what to do if no order comes. No statistics
  about how long other students take or how many succeed: the context has none.
- Write number ranges as "X to Y", never "X-Y".
- Plain English a 19-year-old reads easily. No hype, no emojis.`;

/** The facts half of every listing — stamped from the record, never written by the model, so it
 *  cannot claim a verification the student did not earn. */
export function evidenceBlock(ev: Evidence, match: GigMatch): string {
  const strong = ev.skills.filter((s) => match.matched.some((m) => m.name === s.name));
  const lines = strong.map((s) => `- ${fmtSkill(s)}`);
  const course = ev.courses.map((c) => c.title).join(", ");
  const meta = [course && `Course: ${course}`, ev.attendancePct !== null && `Attendance: ${ev.attendancePct}%`].filter(Boolean).join(" | ");
  const body = lines.length ? lines.join("\n") : "- None for this gig yet (in training)";
  return `Skills assessed by ${ev.institute}:\n${body}${meta ? `\n${meta}` : ""}`;
}

const fmtSkill = (s: OwnedSkill) =>
  `${s.name} (${s.level.charAt(0) + s.level.slice(1).toLowerCase()}${s.verified ? ", verified in a live viva" : ""})`;

/** The deterministic answer: same structure, built only from the context. */
export function fallbackPlan(ev: Evidence, gig: Gig, match: GigMatch): Plan {
  const platform = gig.platforms[0];
  const gap = match.missing[0]?.name;
  const strong = ev.skills.filter((s) => match.matched.some((m) => m.name === s.name));
  const strongNames = strong.slice(0, 3).map((s) => s.name).join(", ") || "your course skills";
  const course = ev.courses.map((c) => c.title).join(" and ") || "my course";
  const [lo, hi] = gig.priceUsd;
  const toVerify = match.unverified[0];
  const isCode = strong.some((s) => /Python|JavaScript|React|Dart|SQL|Pandas|Git/.test(s.name));

  const description =
    platform === "Fiverr"
      ? `Hi, I'm ${ev.firstName}, a ${course} student at ${ev.institute}. I will ${gig.pitch}.\n\n` +
        `What you get: ${gig.clientAsk} Typical delivery: ${gig.deliveryDays} days.\n\n` +
        `I am new on Fiverr, so I keep orders small, confirm the details with you before I start, and revise until it works.`
      : `Hello, I read your post. I'm ${ev.firstName}, a ${course} student at ${ev.institute}, and this is the kind of work I train for: ${gig.clientAsk}\n\n` +
        `I suggest starting with one small milestone so you can judge the quality before committing more. ` +
        `I can deliver the first version in ${gig.deliveryDays} days and will message you before starting.`;

  return {
    project: {
      title: `${gig.title}: portfolio sample`,
      brief:
        `Build one small, finished sample of a "${gig.title}" job: ${gig.clientAsk} ` +
        `Use ${strongNames}` +
        (gap ? `, and learn enough ${gap} to include it in the project.` : `, and present it the way a client would receive it.`),
      closesGap: gap
        ? `${gap}: this gig asks for it and it is not on your record yet. Building it into the project is how you close that gap.`
        : "No required skill is missing. The project is your proof for buyers.",
      deliverables: [
        isCode ? "A public GitHub repository with a clear README (problem, what you built, how to run it)" : "A public Behance or Google Drive portfolio page with the finished work",
        "Before / after screenshots for your gig gallery",
        `A short write-up in the client's words: "${gig.clientAsk}"`,
      ],
    },
    listing: {
      platform,
      title: platform === "Fiverr" ? `I will ${gig.pitch}` : `${gig.title} | ${course} student at ${ev.institute}`,
      description: `${description}\n\n${evidenceBlock(ev, match)}`,
    },
    plan: [
      { day: "Day 1-2", task: `Scope the portfolio project and set up your ${platform} profile with your real name, photo and the skills listed above.` },
      { day: "Day 3-6", task: gap ? `Build the project. Start with the ${gap} part, because it is the gap.` : "Build the project end to end." },
      { day: "Day 7", task: "Publish the project and take clean screenshots for the gallery." },
      { day: "Day 8", task: `Publish the ${platform === "Fiverr" ? "gig" : "profile"} at the starter price of $${lo}.` },
      { day: "Day 9-12", task: platform === "Fiverr" ? "Answer every buyer message within an hour and share the gig with local shops and your network." : "Send a few tailored proposals a day to small, recent posts. Quality over quantity." },
      { day: "Day 13-14", task: toVerify ? `Review what got clicks, improve the title and thumbnail, and verify ${toVerify.name} in an EDUOS viva.` : "Review what got clicks and improve the title, thumbnail and first line." },
    ],
    expectations: [
      `Indicative starter range: $${lo} to $${hi} (about PKR ${toPkr(lo).toLocaleString("en-US")} to ${toPkr(hi).toLocaleString("en-US")}). New sellers usually start at the bottom.`,
      "A first order can take several weeks. Fast replies and a small first job matter more than price.",
      "These are reference ranges compiled for this course, not live marketplace data.",
      "No order by the end of the plan? Change the title and thumbnail, not the price, and keep building the portfolio.",
    ],
  };
}

/** The guard checks what makes claims: the text buyers read and the money expectations.
 *  The project brief and plan are instructions ("record a 60-second demo"), not claims. */
export const guardedParts = (p: Plan) => ({ listing: p.listing, expectations: p.expectations });

/** Credential words. Only the stamped evidence block may claim a credential, so ANY of these in the
 *  model's own title or pitch rebuilds the listing. Fail closed: it does not try to work out which skill
 *  a sentence means ("passed a live viva", "Certified in OOP", lowercase names, aliases all count).
 *  "tested" is left out on purpose: "clean, tested code" describes the work, not the student. */
const CREDENTIAL = /verif\w*|\bvivas?\b|certif\w*|accredit\w*|\bassessed\b|\bpassed\b|\bproven\b|\bexam(?:s|ined)?\b/gi;

export function credentialClaims(listing: Plan["listing"]): string[] {
  return [...new Set([...`${listing.title}\n${listing.description}`.matchAll(CREDENTIAL)].map((m) => m[0].toLowerCase()))];
}

export type Rebuilt = { part: "listing" | "expectations"; why: string; rejected: string };

/** The AI plan as shipped: the record is stamped under the pitch, and a buyer-facing part that claims
 *  more than the record (a credential word in the pitch, a number not in the context) is replaced by
 *  the computed one. What the model wrote is returned in `rebuilt`, shown in the UI, never hidden. */
export function reviewAiPlan(raw: Plan, ev: Evidence, gig: Gig, match: GigMatch): { plan: Plan; rebuilt: Rebuilt[] } {
  const ctx = buildPlanContext(ev, gig, match);
  const fb = fallbackPlan(ev, gig, match);
  const invented = (x: unknown) => groundedAgainst(x, ctx).ungrounded;
  const rebuilt: Rebuilt[] = [];

  let listing = { ...raw.listing, description: `${raw.listing.description}\n\n${evidenceBlock(ev, match)}` };
  const claims = credentialClaims(raw.listing);
  const listingNums = invented(raw.listing);
  if (claims.length || listingNums.length) {
    rebuilt.push({
      part: "listing",
      why: claims.length
        ? `used credential words only your record may state (${claims.join(", ")})`
        : `contained numbers not in your record (${listingNums.join(", ")})`,
      rejected: `${raw.listing.title}\n\n${raw.listing.description}`,
    });
    listing = fb.listing;
  }

  let expectations = raw.expectations;
  const expNums = invented(raw.expectations);
  if (expNums.length) {
    rebuilt.push({ part: "expectations", why: `contained numbers not in your record (${expNums.join(", ")})`, rejected: raw.expectations.join("\n") });
    expectations = fb.expectations;
  }
  return { plan: { ...raw, listing, expectations }, rebuilt };
}
