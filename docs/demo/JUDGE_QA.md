# Judge Q&A — one prepared answer per rubric question

Rules for the whole team: **answer in two sentences, then stop**. If you don't know, say
"we haven't measured that". Every number below has a source; don't round up.

---

### Q1 · What exact problem are you solving, and who faces it?
**Trainers in free IT training programmes like Bano Qabil** mark paper tests for batches of
up to 100 students. A total score never tells them *which concept* each student is missing, so
the whole class gets re-taught everything, or nothing. Their **students** then leave with a
certificate employers don't trust.

*Evidence:* Bano Qabil reports 1.6M+ **registered** learners in 70 cities, about 40% women
(say "registered", never "trained"). Only 10–12% of Pakistani IT graduates are immediately
employable (Pakistan Business Council).

### Q2 · Why does this need a solution built for Pakistan?
Point to three design choices on screen:
1. **Paper first.** Gap Finder reads photographed handwritten answer sheets, because that is how
   these classrooms work. No student devices are needed.
2. **Urdu with English terms.** Qwen-MT translates to Urdu while a glossary keeps "Python",
   "loops" and "API" in English, the way trainers actually teach.
3. **Low bandwidth and low cost.** Photos are downscaled on the phone before upload. A student
   chat costs about **Rs 0.5** on qwen-plus.

### Q3 · Walk us through how a user goes from start to result.
One concept, one journey, three roles:
1. **Trainer** photographs answer sheets.
2. Qwen-VL reads and marks each question, and the trainer confirms.
3. EDUOS shows the re-teach group: the 9 students missing "async/await".
4. **Student** sees the gap, practises it, and passes a **viva**. The skill is now *Verified*
   on their passport.
5. The **First-Earning Copilot** turns verified skills into a first freelance gig and proposal.
6. **Management** sees the same gap on the institute-wide map.

### Q4 · Show it working, live.
Live at **eduos.vercel.app**, on Alibaba Model Studio (Singapore region).
*Backup:* if the network or the model fails, every AI screen still completes on a labelled
computed fallback, and System Health shows the failure. That's the design, not an excuse.

### Q5 · What exactly does the AI do here, and why is it needed?
Name the models:
- **qwen3-vl-plus** reads handwriting and marks each answer against the key. Doing that by hand
  is days of a trainer's time.
- **qwen-plus** generates targeted practice, runs the adaptive viva (it asks follow-ups until
  it's confident) and drafts the gig proposal from real evidence only.
- **qwen-mt-flash** produces the Urdu.

Why AI: reading handwriting and judging free-text understanding can't be done with rules.

Two honest limits worth saying out loud:
- **The AI never decides alone.** The trainer confirms every scanned mark. A viva can only
  stamp "Verified" when Qwen actually ran; the fallback gives "provisional, needs trainer
  review".
- **The grounding guard flags any number the AI writes that isn't in the student's data.**

### Q6 · Explain how one important part of your code works. (pick ONE, rehearse it)
- **Option A, tenant isolation (`lib/tenant.ts`).** One Prisma extension adds the
  institute filter to every database query. It covers the 6 root tables directly and reaches
  the other 19 through their parent relation, and it refuses foreign keys into another
  institute. A new screen can't forget it, because it never has to remember it.
- **Option B, the marks invariant.** Per-question marks must always sum to the stored test
  score. The scan-confirm step writes both in the same request. `npm run check` proves the
  invariant on every row, including production.

### Q7 · What is new compared with what already exists?
- **Google Classroom and Moodle** store grades but can't read paper, find concept gaps or
  verify skills.
- **AI tutors** (chatbots, Taleemabad- or Maqsad-style apps) teach students but never close the
  loop back to the trainer or the institute.
- **ClassMind**, which won Alibaba's Abu Dhabi hackathon, finds gaps from assessments, and that
  is where it stops.

EDUOS goes the whole way: **gap → re-teach group → practice → viva-verified skill → first
paid work**, inside a multi-tenant institute OS.

### Q8 · Who benefits first, and how many people could this reach?
- **First:** Bano Qabil trainers and students, plus the **Alibaba Cloud training centres that
  Alibaba and Bano Qabil are setting up in Karachi and Lahore** (Alibaba x Alkhidmat MoU).
- **Then:** Alkhidmat's **99 skills centres**. Each one is a tenant, and tenant isolation is
  already live and tested with two institutes.

### Q9 · What would it take to keep this running after the hackathon?
- **Cost:** about $0.40 / $1.20 per million tokens on qwen-plus. A student chat turn costs about
  **Rs 0.5**, and 20 a month is about **Rs 9.5 per learner**. qwen3.7-flash is about 12× cheaper
  for bulk work.
- **Measuring cost:** System Health records every AI call's tokens, so the cost is a
  measurement, not a guess.
- **Upkeep:** one small team, synthetic data today.
- **Hosting:** the move to Alibaba Cloud (Function Compute + ApsaraDB for PostgreSQL) is
  **planned, not done**. Say exactly that.

### Q10 · Clarity and honesty
Built vs planned, said plainly:

| Built and tested | Planned |
|---|---|
| Multi-tenant OS | Hosting on Alibaba Cloud (the AI already runs on Model Studio) |
| Gap Finder, Viva, First-Earning Copilot | Urdu speech: Alibaba's ASR doesn't list Urdu yet, so we didn't fake it |
| 141+ unit tests | Urdu handwriting OCR: unverified |
| Isolation, security and smoke suites | Real placement data: none yet; all data is synthetic |
| Live on Vercel in Singapore | |

---

**Numbers you may quote** (all measured or sourced):
- 7.8× faster end-to-end after the region fix: 380.7 s → 48.5 s, both runs 56/56 PASS.
- Warm public API: 1.83 s → 179 ms.
- 15 of 16 audit findings confirmed and fixed. 3 late bugs caught by tests that failed first.
- 2,745 per-question answers in the demo data. Every split sums exactly to its test score (invariant-checked).
