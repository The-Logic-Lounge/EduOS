"use client";

import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import Card from "@/components/ui/Card";
import type { BatchRow, CourseRow, SkillStat } from "@/lib/management";

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

export type DashboardChartsProps = {
  courses: CourseRow[];
  batches: BatchRow[];
  attendance: { status: string; count: number }[];
  skills: SkillStat[];
};

export default function DashboardCharts({ courses, batches, attendance, skills }: DashboardChartsProps) {
  const courseData = courses.map((c) => ({ name: c.code, score: c.perf.overall, title: c.title }));
  const batchData = batches.slice(0, 10).map((b) => ({ name: b.code, score: b.perf.overall }));
  const skillData = [...skills]
    .sort((a, b) => b.attained + b.gaps - (a.attained + a.gaps))
    .slice(0, 8)
    .map((s) => ({ name: s.name, attained: s.attained, gaps: s.gaps }));

  return (
    <div className="grid gap-5 lg:grid-cols-12">
      <Card label="Course performance" className="lg:col-span-7" right={<span className="mono text-xs text-ink-3">weighted 0–100</span>}>
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={courseData} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
              <CartesianGrid stroke="var(--color-hairline)" vertical={false} />
              <XAxis dataKey="name" tick={AXIS} axisLine={{ stroke: "var(--color-hairline-2)" }} tickLine={false} />
              <YAxis domain={[0, 100]} tick={AXIS} axisLine={false} tickLine={false} />
              <Tooltip {...TOOLTIP} />
              <Bar dataKey="score" name="Overall" radius={[2, 2, 0, 0]}>
                {courseData.map((_, i) => (
                  <Cell key={i} fill={C[i % C.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card label="Attendance distribution" className="lg:col-span-5">
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={attendance}
                dataKey="count"
                nameKey="status"
                innerRadius={54}
                outerRadius={88}
                paddingAngle={2}
                stroke="var(--color-surface)"
                strokeWidth={2}
              >
                {attendance.map((_, i) => (
                  <Cell key={i} fill={C[i % C.length]} />
                ))}
              </Pie>
              <Tooltip {...TOOLTIP} cursor={false} />
              <Legend
                verticalAlign="bottom"
                iconType="square"
                iconSize={8}
                formatter={(v) => <span style={{ fontSize: 11, color: "var(--color-ink-2)" }}>{v}</span>}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card label="Batch ranking" className="lg:col-span-6" right={<span className="mono text-xs text-ink-3">top 10</span>}>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={batchData} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 10 }}>
              <CartesianGrid stroke="var(--color-hairline)" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} tick={AXIS} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={72} tick={AXIS} axisLine={{ stroke: "var(--color-hairline-2)" }} tickLine={false} />
              <Tooltip {...TOOLTIP} />
              <Bar dataKey="score" name="Overall" fill="var(--color-chart-1)" radius={[0, 2, 2, 0]} barSize={13} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card label="Skills — attained vs gaps" className="lg:col-span-6">
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={skillData} margin={{ top: 4, right: 4, bottom: 42, left: -18 }}>
              <CartesianGrid stroke="var(--color-hairline)" vertical={false} />
              <XAxis dataKey="name" tick={{ ...AXIS, fontSize: 10 }} interval={0} angle={-32} textAnchor="end" height={54} axisLine={{ stroke: "var(--color-hairline-2)" }} tickLine={false} />
              <YAxis tick={AXIS} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip {...TOOLTIP} />
              <Legend verticalAlign="top" align="right" iconType="square" iconSize={8} formatter={(v) => <span style={{ fontSize: 11, color: "var(--color-ink-2)" }}>{v}</span>} />
              <Bar dataKey="attained" name="Attained" fill="var(--color-chart-3)" radius={[2, 2, 0, 0]} />
              <Bar dataKey="gaps" name="Gaps" fill="var(--color-chart-2)" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}
