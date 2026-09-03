"use client";

import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { CourseRow } from "@/lib/management";

const C = ["var(--color-chart-1)", "var(--color-chart-2)", "var(--color-chart-3)", "var(--color-chart-4)", "var(--color-chart-5)"];
const AXIS = { fontSize: 11, fill: "var(--color-ink-3)", fontFamily: "var(--font-mono)" };
const TOOLTIP = {
  contentStyle: {
    background: "var(--color-surface)",
    border: "1px solid var(--color-hairline-2)",
    borderRadius: 3,
    fontSize: 12,
    fontFamily: "var(--font-mono)",
    color: "var(--color-ink)",
  },
  labelStyle: { color: "var(--color-ink-2)", fontSize: 11 },
  cursor: { fill: "var(--color-surface-2)" },
};

export default function CourseComparison({ courses }: { courses: CourseRow[] }) {
  const data = courses.map((c) => ({
    name: c.code,
    Overall: c.perf.overall,
    Assessments: c.perf.assessmentPct,
    Assignments: c.perf.assignmentPct,
    Attendance: c.perf.attendancePct,
  }));

  return (
    <div className="h-[320px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -18 }} barGap={2}>
          <CartesianGrid stroke="var(--color-hairline)" vertical={false} />
          <XAxis dataKey="name" tick={AXIS} axisLine={{ stroke: "var(--color-hairline-2)" }} tickLine={false} />
          <YAxis domain={[0, 100]} tick={AXIS} axisLine={false} tickLine={false} />
          <Tooltip {...TOOLTIP} />
          <Legend verticalAlign="top" align="right" iconType="square" iconSize={8} formatter={(v) => <span style={{ fontSize: 11, color: "var(--color-ink-2)" }}>{v}</span>} />
          <Bar dataKey="Overall" fill={C[0]} radius={[2, 2, 0, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill={C[0]} />
            ))}
          </Bar>
          <Bar dataKey="Assessments" fill={C[1]} radius={[2, 2, 0, 0]} />
          <Bar dataKey="Assignments" fill={C[2]} radius={[2, 2, 0, 0]} />
          <Bar dataKey="Attendance" fill={C[4]} radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
