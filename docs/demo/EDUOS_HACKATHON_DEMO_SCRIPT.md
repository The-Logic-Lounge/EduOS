# EDUOS — Grand Finale Stage Script · Project **P00733**

**About 6½ minutes, one learner's whole journey.** Admitted → taught → gap found → fixed by a
classmate → proven by viva → certified → earning. We follow **Ali Hassan** and one gap:
*"Choose the right structure for a task"*. Every section is tagged with the rubric question it
answers. Prepared answers: `docs/demo/JUDGE_QA.md`.

**Roles on stage**
- **Basim**: drives the laptop.
- **Shan**: narrates. He's a Bano Qabil trainer, so the problem is his own (Q1).
- **Muneeb**: architecture, cost and hosting questions (Q6, Q9).

**Before you walk on.** Each tab is already signed in on **eduos.vercel.app**. Click through each one
5 minutes before, so nothing is cold.
1. Management `admin@eduos.pk` → `/management/admissions`
2. Trainer `instructor@eduos.pk` → `/instructor/gaps` (PY-12)
3. Student `student@eduos.pk` → `/student/gaps`
4. Management (same login as tab 1, second tab) → `/management/gaps`
5. System Health → `/management/system`, window **1h**
6. Phone camera ready. Bring **two printed sheets**: the entry test (`entry-test-sheet.pdf`) and Ali's
   Mid-Term (`answer-sheet-PY12-midterm.pdf`), both filled in by hand.
7. **Reset Ali first:** `npx tsx scripts/demo-reset.ts --confirm` → "Mid-Term 47/50 … OK"

---

## 0:00 — The problem (Q1, Q8) · Shan, no screen · 35 s
> "Assalam-o-Alaikum. We are team P00733, and this is EDUOS.
> I'm a trainer at Bano Qabil. Over a million young people have registered, and about 90,000
> have been certified so far. Entry tests and exams in our classes still come back **on paper**.
> When I mark one, I get a total, 31 out of 50. It doesn't tell me *which concept* a student is missing.
> And in Pakistan only about 18% of IT graduates get hired. EDUOS runs the whole journey:
> **admit, find the gap, fix it, prove it, certify it, earn from it.**"

## 0:35 — Admissions: the entry test (Q2, Q4, Q5) · tab 1 · 35 s
Photograph the **entry-test sheet** → about 8 s → *Hamza Tariq · 25/28 · shortlisted*.
> "A round can bring 45,000 candidates. **qwen3-vl-plus** reads the handwriting. The multiple-choice
> answers are scored **by rule**, the same way for every candidate, and anything uncertain goes to a
> person. That's about **8 seconds and 23 paisa** a sheet, measured, not estimated."

## 1:10 — Trainer: paper to gaps (Q3, Q4, Q5) · tab 2 + phone · 70 s
1. Gap Finder → **Scan answer sheets** → *Mid-Term Exam* + **Ali Hassan** → photograph his sheet.
2. Review screen: point at Q2, *"I will use a list and loop over it"*. It's **0**, and the reason is
   given: a set gives instant lookup, a list doesn't.
   > "I confirm or change any mark. The AI never grades alone."
3. **Confirm.** Ali goes from **47/50 to about 17/50**, live, and joins the re-teach groups.
   > "His total said 47, top of the class. His paper says he can't choose a data structure."

## 2:20 — Peer Circles (Q1, Q2) · tab 2 → Peer Circles · 25 s
PY-12: *a classmate at 80%+ on this concept → Ali*. **Plan a 15-minute session** →
the Qwen plan + the **Urdu WhatsApp** message.
> "One trainer can't re-teach a hundred students one by one. Classmates who've mastered it can.
> The message opens in WhatsApp, in Urdu, with nothing to install."

## 2:45 — Student: gap → practice → viva (Q2, Q5, Q7) · tab 3 · 90 s
1. *My Gaps* → his own answer as evidence → **Practice this** → **اردو**.
   > "Qwen-MT writes it in Urdu, and keeps *Python, list, set* in English, the way we actually teach."
2. **Prove it: take the viva.** Answer once or twice live.
   > "Qwen questions him on **his own** answers and probes when he's vague. A pass stamps the
   > Skill Passport **Verified**. Copy-pasting is flagged, and an answer that tries to talk to the
   > grader scores zero."
3. Passport → **Verified ✓** → open the **public verification link**, the one an employer would open.

## 4:15 — Alibaba Cloud certification (Q8) · tab 3 → Alibaba Cloud Cert · 20 s
> "Alibaba Cloud and Bano Qabil signed an MoU in May to open training centres with Alibaba
> certification pathways. EDUOS reads the Skill Passport and shows Ali's readiness for the
> **ACA Generative AI Engineer** exam, domain by domain, and his verified skills count more."

## 4:35 — First earning (Q1, Q8) · tab 3 → First Earning · 25 s
Top gig match → plan → a Fiverr description written **only from his real evidence** (grounded badge).

## 5:00 — The institute (Q7, Q8, Q9) · tabs 4 + 5 · 50 s
1. **Gap Map:** *"'Reason about time cost' isn't just Ali. It's a gap for 9 Python students
   across two batches. Fix the module, not just the student."*
2. **Cert Pipeline:** *"40 students are one focused month from the Alibaba exam. That's the first
   cohort for the new centres. And Security & compliance isn't taught anywhere yet."*
3. **System Health:** *"Every AI call you just watched is here, with its latency and tokens. That's
   how we know our cost per learner."*

## 5:50 — Close (Q10) · Basim · 30 s
> "What's built: everything you just saw, live, on Alibaba's Qwen models, with 255 automated tests
> and isolation, security and account suites. What's planned: hosting on Alibaba Cloud
> (the AI already runs on Model Studio), and Urdu speech, which Alibaba's speech models don't list
> yet, so we didn't fake it. EDUOS: admit, teach, prove, certify, earn. We're **P00733**. Thank you."

---

## If something fails on stage
| Failure | What you do |
|---|---|
| A scan is slow (> 15 s) | Keep talking through the Q5 line. Scans usually land in 7–14 s. |
| A scan fails, or AI is down | Gap Finder opens the hand-marking screen pre-filled with the saved marks. Admissions has hand entry. Then show System Health recording the failure. |
| The viva can't reach Qwen | It completes as **provisional, needs trainer review**, and never shows Verified. Say exactly that. |
| Wi-Fi is down | Phone hotspot. If that fails too, play the recording and **say it is a recording**. |
| A judge mistypes a demo password 8 times | That email is locked for 15 minutes from that network. Use the one-click demo buttons. |

## Pre-flight (T-30 min)
- [ ] `node scripts/prod-verify.mjs https://eduos.vercel.app` → PASS
- [ ] `npx tsx scripts/demo-reset.ts --confirm` → OK
- [ ] One practice scan of each sheet (this also warms the vision model), then reset Ali again
- [ ] System Health: AI provider **Healthy**
- [ ] Phone charged; camera permission granted for the site
