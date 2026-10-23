# EDUOS — Grand Finale Demo Script (6 minutes)

**Rule for the whole demo:** one institute, one story, one student. Never a feature tour.
Every number on screen is computed from the database by `lib/analytics.ts`; the AI only
explains numbers it was handed. Say that once, early, and let the screens prove it.

Logins (password `password`): `student@eduos.pk` · `instructor@eduos.pk` · `admin@eduos.pk`
(Bano Qabil) and `admin@alkhidmat.pk` (second institute, used once to prove isolation).

Open these tabs before going on stage, each already signed in, so no typing happens live:
1. Student — Ali Hassan · 2. Instructor — Sir Kamran · 3. Management — Dr. Shahid
4. Alkhidmat admin (private window) · 5. Management → **System Health**

---

## 0:00 — The problem (30 s, no screen)

> "Free IT training institutes like Bano Qabil train thousands of students a year with a
> handful of staff. Attendance lives in one sheet, marks in another, and nobody can answer
> *which students are ready for a job, and which instructor needs help* until the batch is
> over. EDUOS is the operating system that answers it while the batch is still running."

## 0:30 — Student: evidence, not opinions (75 s) · tab 1

- **Dashboard**: Ali's attendance, assessment and assignment percentages. *"All computed,
  none typed in."*
- **Skill Passport**: skills with levels, each backed by an evidence count. *"The level
  comes from his assessment results. Qwen writes the summary, but it can only cite these
  numbers. If it makes up a figure, the guard rejects the answer and we show the computed
  version."*
- **Ask Edu OS** (student chat): ask *"How is my attendance in Python and what should I
  revise?"* The answer cites his real attendance and pulls course material through RAG.
  *"Every tool is bound to Ali's own session. He can't ask about another student,
  because no tool accepts a student id."*

## 1:45 — Instructor: the copilot (60 s) · tab 2

- **My Batches → PY-12**: module weakness and the students who need attention.
- **AI Copilot**: *"Which module should I re-teach this week?"* Grounded in PY-12's data only.
- One line on safety: *"If Sir Kamran asks about a batch he doesn't teach, he gets a 403.
  We test that in an automated suite on every change."*

## 2:45 — Management: the Command Center (60 s) · tab 3

- **Dashboard**: course and batch performance, skill gaps across the institute.
- **Ask Edu OS**: *"Which batch is struggling most, and who teaches it?"* Then show the
  answer's tool trail. *"No text-to-SQL. The model can only call nine allowlisted
  analytics functions, so it can't invent a query or a statistic."*

## 3:45 — Multi-tenant, proven live (40 s) · tab 4

- Switch to the **Alkhidmat** admin. Students list: six Lahore students, none of Bano
  Qabil's 240.
- Paste a Bano Qabil student URL (`/management/students/stu_000`): **Not found**.
  *"Isolation isn't a filter on each screen. Every database query in the app goes through
  one tenant-scoped client, including the AI tools and the analytics. A new screen can't
  forget it."*

## 4:25 — It's measurable: System Health (60 s) · tab 5

- **Health strip**: database, pgvector, AI provider, telemetry, each with an honest state.
  Background jobs say *Not instrumented*. *"We'd rather show Unknown than fake a green
  light."*
- **Latency**: p50/p95/p99 from real requests, the slowest endpoints, and DB queries per
  request.
- **The before/after**: *"Production ran its functions in Washington against a database in
  Singapore, so every query crossed the Pacific. Pinning the region took the warm public
  API from ~1.8 s to `<AFTER>` and the full smoke run from 7.5 minutes to `<AFTER>`."*
  (Fill both from `docs/audits/EDUOS_PERFORMANCE_REPORT.md` after the deploy.)
- **Access denied** counter: the cross-tenant attempt from the last step shows up here.

## 5:25 — Close (35 s)

> "People, learning and operations in one system, with AI that explains real numbers
> instead of inventing them, isolated per institute, and measured in production. It's
> built on Alibaba Cloud's Qwen through Model Studio. EDUOS is ready for the next
> institute tomorrow."

---

## If something fails on stage

| Failure | What the audience sees | What you say / do |
|---|---|---|
| Qwen unreachable or key invalid | Every AI panel shows its **computed fallback**, labelled as such | *"This is the fallback path working: the model is unreachable, so EDUOS shows the computed analysis instead of a fabricated one."* Then open System Health, where AI provider shows **Degraded/Unavailable**. That proves the monitoring is real. |
| Venue Wi-Fi down | Nothing loads | Switch to phone hotspot. If still down, show the **recorded walkthrough** and say it is a recording. Never pass off a recording as live. |
| Database cold start (first request slow) | One slow page | Warm every tab 5 minutes before going on stage. |
| An API call fails | The page's error state | Open System Health → Recent errors: the failed request is listed with its route and correlation id, which is also in the response's `x-correlation-id` header. That turns the failure into a demo of the observability. (Page render errors are not yet in telemetry, so don't promise that.) |

**Pre-flight (T-30 min):** run `node scripts/smoke.mjs https://eduos.vercel.app` and confirm
it prints PASS. Open System Health and confirm AI provider is not *Unavailable*. Warm all tabs.
