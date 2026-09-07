"use client";

import { useInView } from "./useInView";

export type PublicCourse = {
  code: string;
  title: string;
  description: string;
  level: string;
  durationWeeks: number;
  _count: { modules: number };
};

export function Courses({ courses }: { courses: PublicCourse[] }) {
  const display = courses.slice(0, 6);

  return (
    <section id="courses" className="px-4 py-24 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <span className="stat text-signal">Catalogue</span>
        <h2 className="mt-4 font-display text-title text-ink">Open courses. Open futures.</h2>
        <p className="mt-4 max-w-2xl text-ink-2">
          Hands-on, beginner-friendly programmes designed to take students from first lesson to first job.
        </p>

        {display.length > 0 ? (
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {display.map((course, index) => (
              <CourseCard key={course.code} course={course} index={index} />
            ))}
          </div>
        ) : (
          <p className="mt-12 text-ink-3">New programmes are being added. Check back soon.</p>
        )}
      </div>
    </section>
  );
}

function CourseCard({ course, index }: { course: PublicCourse; index: number }) {
  const { ref, inView } = useInView();
  return (
    <div
      ref={ref}
      className={`card flex flex-col p-6 reveal ${inView ? "is-visible" : ""}`}
      style={{ transitionDelay: `${index * 100}ms` }}
    >
      <div className="flex items-center justify-between">
        <span className="mono text-[0.6875rem] uppercase tracking-[0.12em] text-accent">{course.code}</span>
        <span className="rounded-xs border border-hairline bg-surface-2 px-1.5 py-0.5 text-[0.625rem] font-semibold uppercase tracking-[0.1em] text-ink-2">
          {course.level}
        </span>
      </div>
      <h3 className="mt-4 font-display text-xl text-ink">{course.title}</h3>
      <p className="mt-2 line-clamp-3 flex-1 text-sm leading-relaxed text-ink-2">{course.description}</p>
      <div className="mt-6 flex items-center gap-4 border-t border-hairline pt-4 text-xs text-ink-3">
        <span>{course.durationWeeks} weeks</span>
        <span className="h-3 w-px bg-hairline-2" aria-hidden />
        <span>{course._count.modules} modules</span>
      </div>
    </div>
  );
}
