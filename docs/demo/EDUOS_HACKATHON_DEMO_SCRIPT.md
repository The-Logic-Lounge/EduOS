# EDUOS — Grand Finale Stage Script · Project **P00733**

**6 minutes, one concept, three people.** We follow one gap, *"Choose the right data
structure"*, from a paper answer sheet to a verified skill to a first paid gig. Every section
is labelled with the rubric question it answers. Q&A answers: `docs/demo/JUDGE_QA.md`.

**Roles on stage**
- **Basim**: drives the laptop.
- **Shan**: narrates. He is a Bano Qabil trainer, so the problem is his own (Q1).
- **Muneeb**: architecture, cost and hosting questions (Q6, Q9).

**Tabs open before you walk on.** Each is already signed in on **eduos.vercel.app**, and you
should click through each one in the last 5 minutes so nothing is cold:
1. Trainer, `instructor@eduos.pk` → `/instructor/gaps`, batch PY-12
2. Student, `student@eduos.pk` → `/student/gaps`
3. Management, `admin@eduos.pk` → `/management/gaps`
4. System Health → `/management/system`, window **1h**
5. A phone with the camera ready, plus the **handwritten answer sheet** (PY-12 Mid-Term)

---

## 0:00 — Problem and who (Q1, Q8) · Shan, no screen · 40 s

> "Assalam-o-Alaikum. We are team P00733, and this is EDUOS.
> I'm a trainer at Bano Qabil. Bano Qabil has 1.6 million registered learners in 70 cities.
> My batch has close to 100 students, and their tests come back to me **on paper**.
> When I mark them, I get a total: 31 out of 50. That number doesn't tell me *which concept*
> each student is missing. So I re-teach everything, or nothing.
> Then my students graduate with a free certificate that employers don't trust. In Pakistan,
> only 10 to 12 percent of IT graduates are job-ready on day one.
> EDUOS fixes the whole chain: **find the gap, fix it, prove it, earn from it.**"

## 0:40 — Trainer: paper to gaps (Q2, Q3, Q4, Q5) · tab 1 + phone · 90 s

1. Hold up the paper sheet. *"This is a real answer sheet, handwritten."*
2. Gap Finder → **Scan answer sheets** → pick *Mid-Term Exam* and **Ali Hassan** (the name on the sheet) → photograph it.
   *(Continuity: Ali is the student account in tab 2. Before the scan he has **zero gaps**; the
   gaps you're about to create are the ones the student tab will show next.)*
   > "The photo is shrunk on the phone before upload, because our trainers are on mobile data.
   > **qwen3-vl-plus** on Alibaba Model Studio reads the handwriting and marks each answer against our key."
3. The review screen opens. Point at Q2's transcription: *"I will use a list and loop over it."*
   > "It gave zero, and look at the reason: a set gives instant lookup, a list doesn't.
   > I'm the trainer, so I confirm or change any mark. **The AI never grades alone.**"
4. **Confirm**. Ali's Mid-Term goes from **47/50 to 15/50**, live, and he joins the re-teach
   groups for *"Choose the right structure"* and *"Reason about time cost"*.
   > "His total used to say 47 out of 50, top of the class. His paper says he can't choose a
   > data structure or reason about its cost. A total hides that. A concept view doesn't."

*(Q5 line, if asked: "Reading handwriting and judging a free-text answer can't be done with rules. That's
why we use a vision model.")*

## 2:10 — Student: gap, practice, viva (Q2, Q3, Q5, Q7) · tab 2 · 100 s

1. *My Gaps* → the same concept, with **their own answer** as evidence.
2. **Practice this** → flip to **اردو**:
   > "**Qwen-MT** puts the explanation in Urdu, and keeps *Python, set, list* in English,
   > because that's how we actually teach."
3. **Prove it: take the viva** → answer one question live (have a judge suggest the answer if the mood is right).
   > "Qwen questions the student on **their own** past answers. If the answer is vague, it asks a
   > sharper follow-up, up to 4 questions. A pass stamps the Skill Passport **Verified**. Pasting
   > is flagged, because free certificates only matter if they can't be faked."
4. Show the Passport → **Verified ✓** badge → the **public verification link** an employer can open.

## 3:50 — Student: first earning (Q1, Q8) · tab 2 · 40 s

*First Earning* → top gig matches with readiness % (verified skills count more) → pick one →
a Fiverr gig description written **only from the student's real evidence**, with the
**grounded** badge, plus a 14-day plan.
> "Bano Qabil's goal isn't a certificate. It's a student who earns. This is the step from verified
> skill to first order. The prices are reference ranges, and we label them that way."

## 4:30 — Management: the institute view (Q7, Q8, Q9) · tabs 3 + 4 · 60 s

1. **Gap Map**: courses × concepts across every batch. Point at the Python row:
   > "'Reason about time cost' isn't just Ali. It's a gap for **9 Python students across two
   > batches**. That tells the director to fix the *module*, not just re-teach one student."
   Then point at the top of the list:
   > "Institute-wide, the biggest gap is *async/await* in Web Development: **39 students**."
2. **System Health** (window 1h):
   > "Every AI call you just saw is here, with its latency and tokens. Marking one answer sheet costs about
   > **Rs 0.23**; a student chat about **Rs 0.5**. That's not a guess, it's measured."
3. One line on scale: *"Each institute is a tenant with isolated data. That's already live and tested with two.
   It's ready for Alkhidmat's 99 skills centres and the new Alibaba Cloud training centres in Karachi and Lahore."*

## 5:30 — Close: honesty and ask (Q10) · Basim · 30 s

> "What's built: everything you just saw, live, with 140+ automated tests and isolation and security
> suites. What's planned: moving hosting onto Alibaba Cloud (the AI already runs on Model Studio),
> and Urdu speech, which Alibaba's speech models don't list yet, so we didn't fake it.
> EDUOS: find the gap, fix it, prove it, earn from it. Thank you. We're **P00733**."

---

## If something fails on stage

| Failure | What you do |
|---|---|
| Scan is slow (> 15 s) | Keep talking through Q5's line. It usually lands in 7–10 s. |
| Scan fails or AI is down | The same review screen opens empty: "the trainer types the marks, and the flow still completes". Then show System Health recording the failure. |
| Viva can't reach Qwen | It completes as **"provisional, needs trainer review"** and does NOT stamp Verified. Say exactly that. It's the honesty feature. |
| Wi-Fi down | Phone hotspot. If that's down too, play the recorded walkthrough and **say it is a recording**. |
| First page is slow | Supabase cold start. Warm every tab 5 minutes before. |

## Pre-flight (T-30 min)

- [ ] `node scripts/prod-verify.mjs https://eduos.vercel.app` → PASS
- [ ] System Health: AI provider **Healthy**, telemetry recent
- [ ] Do one scan with the spare sheet. It also warms the vision model.
- [ ] Two handwritten sheets: Q1 right; Q2 "use a list"; Q3 "same speed".
- [ ] **Reset Ali after every rehearsal:** `npx tsx scripts/demo-reset.ts --confirm` → "Mid-Term 47/50 … OK"
- [ ] Phone charged, camera permission granted for the site
