import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { publicVerification } from "@/lib/viva/engine";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Skill verification", robots: { index: false } };

const fmt = (d: Date | null) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }) : "—";

/** Public, no login: what an employer sees from the QR/link on a Skill Passport.
 *  Only a viva that stamped the passport resolves; everything else is a 404. */
export default async function VerifyPage({ params }: { params: Promise<{ vivaId: string }> }) {
  const { vivaId } = await params;
  const v = /^[a-z0-9_-]{8,40}$/i.test(vivaId) ? await publicVerification(vivaId) : null;
  if (!v) notFound();

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-4 py-10">
      <article className="card w-full max-w-lg overflow-hidden">
        <header className="relative bg-ink px-6 py-6 text-paper sm:px-8">
          <span
            aria-hidden
            className="absolute inset-0 opacity-[0.1]"
            style={{ backgroundImage: "repeating-linear-gradient(115deg, transparent 0 7px, currentColor 7px 8px)" }}
          />
          <div className="relative flex items-center justify-between gap-4">
            <span className="stat text-paper/55">Edu OS · Proof-of-Skill</span>
            <span className="inline-flex items-center gap-1.5 border border-success/50 bg-success/15 rounded-xs px-2 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-paper">
              Verified ✓
            </span>
          </div>
          <h1 className="relative mt-5 font-display text-[clamp(1.9rem,6vw,2.6rem)] leading-[1] tracking-[-0.03em]">{v.skill}</h1>
          <p className="relative mt-2 text-sm text-paper/65">{v.category}</p>
        </header>

        <dl className="grid grid-cols-2 gap-px bg-hairline">
          {[
            ["Holder", v.name],
            ["Institute", v.institute],
            ["Verified on", fmt(v.verifiedAt)],
            ["Overall score", `${v.score}/100`],
            ["Questions", String(v.questions)],
            ["Examiner", v.models.length ? v.models.join(", ") : "—"],
          ].map(([k, val]) => (
            <div key={k} className="bg-surface px-6 py-4 sm:px-8">
              <dt className="stat">{k}</dt>
              <dd className="mt-1.5 text-[0.95rem] text-ink">{val}</dd>
            </div>
          ))}
        </dl>

        <div className="border-t border-hairline px-6 py-5 sm:px-8">
          <p className="text-sm leading-relaxed text-ink">{v.verdict}</p>
          <p className="mt-3 text-xs leading-relaxed text-ink-3">
            The holder passed a live, adaptive viva: an AI examiner (Alibaba Qwen) questioned them on their own graded
            assessment answers until it was confident, and every answer was scored server-side. Answers are kept private;
            this record shows only the result.
          </p>
          <p className="mono mt-4 break-all text-[0.65rem] text-ink-3">ID {v.id}</p>
        </div>
      </article>
    </main>
  );
}
