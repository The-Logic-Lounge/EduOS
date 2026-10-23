import { requirePageRole } from "@/lib/page-auth";
import { instituteGapMap } from "@/lib/analytics";
import { masteryBand } from "@/lib/gaps/core";
import { BAND_CELL, BandBadge, BandLegend, MasteryBar } from "@/lib/gaps/ui";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";

export const dynamic = "force-dynamic";

export default async function InstituteGapsPage() {
  await requirePageRole("MANAGEMENT");
  const { threshold, cells } = await instituteGapMap();

  // Courses teach different concepts, so the map is one row per course, its concepts as cells.
  const courses = new Map<string, { code: string; title: string; cells: typeof cells }>();
  for (const c of cells) {
    const row = courses.get(c.courseId) ?? { code: c.courseCode, title: c.courseTitle, cells: [] };
    row.cells.push(c);
    courses.set(c.courseId, row);
  }
  const rows = [...courses.values()]
    .map((r) => ({ ...r, cells: [...r.cells].sort((a, b) => a.mastery - b.mastery), gaps: r.cells.filter((c) => c.isGap).length }))
    .sort((a, b) => b.gaps - a.gaps || a.code.localeCompare(b.code));
  const top = cells.filter((c) => c.studentsBelow > 0).slice(0, 8);

  return (
    <>
      <PageHeader
        title="Institute gap map"
        subtitle={`Every course's concepts, from per-question marks. A cell under ${threshold}% is a concept the course is not landing — the number in it is how many students are below the line.`}
      />

      {cells.length === 0 ? (
        <EmptyState title="No marked answers yet" description="The map fills in as trainers mark answer sheets in Gap Finder." />
      ) : (
        <div className="grid gap-12 xl:grid-cols-[1fr_22rem]">
          <section aria-labelledby="map">
            <div className="flex flex-wrap items-end justify-between gap-4 border-b border-ink pb-3">
              <h2 id="map" className="font-display text-[1.6rem] leading-tight tracking-tight">Courses × concepts</h2>
              <BandLegend threshold={threshold} />
            </div>
            <div className="divide-y divide-hairline">
              {rows.map((r) => (
                <div key={r.code} className="grid gap-3 py-5 md:grid-cols-[10rem_1fr] md:gap-6">
                  <div>
                    <p className="mono text-sm font-medium text-ink">{r.code}</p>
                    <p className="text-xs leading-snug text-ink-3">{r.title}</p>
                    <p className="mt-1 text-[0.6875rem] text-ink-3">{r.gaps} of {r.cells.length} concepts below {threshold}%</p>
                  </div>
                  <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
                    {r.cells.map((c) => {
                      const b = masteryBand(c.mastery, threshold);
                      return (
                        <li
                          key={c.concept}
                          className={`flex min-h-[5.5rem] flex-col justify-between border rounded-xs p-2.5 ${BAND_CELL[b.tone]}`}
                          title={`${c.concept}: ${c.mastery}% · ${b.label} · ${c.studentsBelow} below ${threshold}%`}
                        >
                          <span className="line-clamp-2 text-[0.75rem] leading-snug">{c.concept}</span>
                          <span className="mt-2 flex items-end justify-between gap-2">
                            <span className="mono text-base leading-none">{Math.round(c.mastery)}%</span>
                            <span className="text-[0.6875rem] text-ink-2">
                              <span className="mono">{c.studentsBelow}</span> below
                            </span>
                          </span>
                          <span className="sr-only">{b.label}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          <aside aria-labelledby="top" className="xl:sticky xl:top-6 xl:self-start">
            <h2 id="top" className="stat border-b border-ink pb-3">Top institute gaps</h2>
            {top.length === 0 ? (
              <p className="mt-4 text-sm text-ink-2">No concept has students below {threshold}%.</p>
            ) : (
              <ol className="divide-y divide-hairline">
                {top.map((c, i) => (
                  <li key={`${c.courseId}-${c.concept}`} className="grid grid-cols-[2rem_1fr] gap-3 py-4">
                    <span className="mono text-lg leading-none text-ink-3">{i + 1}</span>
                    <div className="min-w-0">
                      <p className="text-sm leading-snug text-ink">{c.concept}</p>
                      <p className="mt-0.5 text-xs text-ink-3">
                        <span className="mono">{c.courseCode}</span> · <span className="mono text-ink-2">{c.studentsBelow}</span> {c.studentsBelow === 1 ? "student" : "students"} below {threshold}%
                      </p>
                      <div className="mt-2 flex items-center gap-3">
                        <div className="flex-1"><MasteryBar mastery={c.mastery} threshold={threshold} label={c.concept} /></div>
                        <span className="w-[5.5rem] shrink-0 text-right"><BandBadge mastery={c.mastery} threshold={threshold} /></span>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </aside>
        </div>
      )}
    </>
  );
}
