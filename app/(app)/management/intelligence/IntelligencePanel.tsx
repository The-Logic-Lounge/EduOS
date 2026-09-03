"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import StatTile from "@/components/ui/StatTile";
import Table, { THead, TR, TH, TD } from "@/components/ui/Table";
import AiAnswer, { SourceBadge } from "../AiAnswer";

const PRESETS = [
  "Which course is performing best?",
  "Which batch is performing lowest?",
  "Compare Python and Data Science",
  "What are the common skill gaps?",
  "Generate a performance report",
];

const CHART_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

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

type Feature = {
  source: "ai" | "fallback";
  data: ManagementData;
  ungrounded?: number[];
};

type ManagementData = {
  insufficient_data: boolean;
  kind: "overview" | "ranking" | "entity" | "comparison" | "skill-gaps" | "report" | "instructor";
  answer: string;
  report: string;
  missing: string;
  bestCourse: { code: string; title: string; overall: number } | null;
  worstCourse: { code: string; title: string; overall: number } | null;
  bestBatch: { code: string; name: string; overall: number } | null;
  instructorStandings: { name: string; overall: number; conductRate: number }[];
  commonSkillGaps: { skill: string; studentsShort: number }[];
  comparison: {
    title: string;
    entities: {
      code: string;
      name: string;
      kind: string;
      overall: number;
      assessmentPct: number;
      assignmentPct: number;
      attendancePct: number;
      sampleSize: number;
      detail: string;
    }[];
    winner: string;
    winnerReason: string;
  } | null;
  ranking: {
    title: string;
    direction: "top" | "bottom";
    rows: { label: string; value: number; detail: string }[];
  } | null;
  entity: {
    kind: string;
    code: string;
    name: string;
    metrics: { label: string; value: number; suffix: string; hint: string }[];
    summary: string;
  } | null;
};

type State = {
  loading: boolean;
  feature: Feature | null;
  question?: string;
  error?: string;
};

export default function IntelligencePanel() {
  const [state, setState] = useState<State>({ loading: true, feature: null });
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const run = useCallback(async (question?: string) => {
    setState({ loading: true, feature: null, question });
    try {
      const res = await fetch("/api/ai/management", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(question ? { question } : {}),
      });
      const json = await res.json();
      const feature: Feature | undefined =
        json && typeof json === "object" && "data" in json ? json.data : undefined;
      setState({ loading: false, feature: feature ?? null, question });
    } catch {
      setState({ loading: false, feature: null, question, error: "Request failed" });
    }
  }, []);

  useEffect(() => {
    void run();
  }, [run]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = input.trim();
    if (q) void run(q);
  }

  const d = state.feature?.data;
  const ungrounded = state.feature?.ungrounded;
  const hasUngrounded = ungrounded && ungrounded.length > 0;

  return (
    <Card
      label="Management Intelligence"
      right={
        state.loading ? (
          <span className="mono text-xs text-ink-3">analysing…</span>
        ) : (
          <SourceBadge source={state.feature?.source} />
        )
      }
    >
      <div className="mb-5 flex flex-wrap gap-2">
        {PRESETS.map((q) => (
          <Button
            key={q}
            size="sm"
            variant={state.question === q ? "primary" : "secondary"}
            disabled={state.loading}
            onClick={() => {
              setInput(q);
              void run(q);
            }}
          >
            {q}
          </Button>
        ))}
        <Button size="sm" variant="ghost" disabled={state.loading} onClick={() => { setInput(""); void run(); }}>
          Reset
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="mb-5 flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask anything about courses, batches, instructors, skills…"
          disabled={state.loading}
          className="flex-1 border border-hairline bg-surface px-3 py-2 text-[0.9375rem] text-ink placeholder:text-ink-3 rounded-md focus:border-accent focus:outline-none disabled:opacity-50"
        />
        <Button size="sm" variant="primary" disabled={state.loading || !input.trim()}>
          Ask
        </Button>
      </form>

      <hr className="rule mb-5" />

      {hasUngrounded && <UngroundedBanner />}

      {state.loading ? (
        <Skeleton />
      ) : state.error || !state.feature ? (
        <p className="text-[0.9375rem] leading-relaxed text-ink-2">
          AI unavailable — the computed rankings above are the source of truth.
        </p>
      ) : d?.insufficient_data && d.missing ? (
        <MissingDataCard message={d.missing} />
      ) : !d ? (
        <p className="text-[0.9375rem] leading-relaxed text-ink-2">No data returned.</p>
      ) : (
        <KindRenderer data={d} />
      )}
    </Card>
  );
}

function UngroundedBanner() {
  return (
    <div className="mb-5 border border-warning/35 bg-warning-soft rounded-md px-4 py-3">
      <div className="flex items-center gap-2">
        <Badge variant="warning">Caution</Badge>
        <span className="text-[0.8125rem] text-warning">
          Some figures in this response could not be verified against source data. Cross-check before acting.
        </span>
      </div>
    </div>
  );
}

function MissingDataCard({ message }: { message: string }) {
  return (
    <div className="border border-warning/35 bg-warning-soft rounded-md px-5 py-4">
      <div className="mb-2 flex items-center gap-2">
        <Badge variant="warning">Insufficient data</Badge>
      </div>
      <p className="text-[0.9375rem] leading-relaxed text-ink-2">{message}</p>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-3" aria-busy>
      <div className="h-3 w-2/3 animate-pulse rounded-xs bg-surface-2" />
      <div className="h-3 w-full animate-pulse rounded-xs bg-surface-2" />
      <div className="h-3 w-4/5 animate-pulse rounded-xs bg-surface-2" />
    </div>
  );
}

function KindRenderer({ data: d }: { data: ManagementData }) {
  switch (d.kind) {
    case "comparison":
      return d.comparison ? <ComparisonView cmp={d.comparison} report={d.report} /> : <OverviewFallback d={d} />;
    case "ranking":
      return d.ranking ? <RankingView ranking={d.ranking} report={d.report} /> : <OverviewFallback d={d} />;
    case "entity":
    case "instructor":
      return d.entity ? <EntityView entity={d.entity} report={d.report} /> : <OverviewFallback d={d} />;
    case "skill-gaps":
      return <SkillGapsView gaps={d.commonSkillGaps} answer={d.answer} report={d.report} />;
    case "report":
      return <ReportView report={d.report} answer={d.answer} d={d} />;
    case "overview":
    default:
      return <OverviewFallback d={d} />;
  }
}

function ComparisonView({ cmp, report }: { cmp: NonNullable<ManagementData["comparison"]>; report: string }) {
  return (
    <div className="space-y-6">
      {cmp.winner && (
        <div className="flex items-center gap-2">
          <Badge variant="success">Winner: {cmp.winner}</Badge>
          <span className="text-[0.8125rem] text-ink-2">{cmp.winnerReason}</span>
        </div>
      )}
      {!cmp.winner && <p className="text-[0.8125rem] text-ink-2">{cmp.winnerReason}</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        {cmp.entities.map((e) => (
          <Card key={e.code} label={`${e.code} — ${e.name}`}>
            <div className="mono mb-3 text-[2rem] leading-none font-medium text-ink">{e.overall.toFixed(1)}%</div>
            <dl className="space-y-2">
              <MetricRow label="Assessments" value={e.assessmentPct} suffix="%" />
              <MetricRow label="Assignments" value={e.assignmentPct} suffix="%" />
              <MetricRow label="Attendance" value={e.attendancePct} suffix="%" />
              <MetricRow label="Sample size" value={e.sampleSize} suffix="" />
            </dl>
            {e.detail && <p className="mt-3 text-[0.8125rem] text-ink-3">{e.detail}</p>}
          </Card>
        ))}
      </div>

      {cmp.entities.length >= 2 && (
        <Card label="Metric comparison">
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={[
                  { metric: "Overall", ...Object.fromEntries(cmp.entities.map((e) => [e.code, e.overall])) },
                  { metric: "Assessments", ...Object.fromEntries(cmp.entities.map((e) => [e.code, e.assessmentPct])) },
                  { metric: "Assignments", ...Object.fromEntries(cmp.entities.map((e) => [e.code, e.assignmentPct])) },
                  { metric: "Attendance", ...Object.fromEntries(cmp.entities.map((e) => [e.code, e.attendancePct])) },
                ]}
                margin={{ top: 4, right: 4, bottom: 0, left: -18 }}
              >
                <CartesianGrid stroke="var(--color-hairline)" vertical={false} />
                <XAxis dataKey="metric" tick={AXIS} axisLine={{ stroke: "var(--color-hairline-2)" }} tickLine={false} />
                <YAxis domain={[0, 100]} tick={AXIS} axisLine={false} tickLine={false} />
                <Tooltip {...TOOLTIP} />
                {cmp.entities.map((e, i) => (
                  <Bar key={e.code} dataKey={e.code} fill={CHART_COLORS[i % CHART_COLORS.length]} radius={[2, 2, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {report && <ProseBlock text={report} />}
    </div>
  );
}

function RankingView({ ranking, report }: { ranking: NonNullable<ManagementData["ranking"]>; report: string }) {
  const chartData = ranking.rows.map((r) => ({ name: r.label.split(" — ")[0], value: r.value, detail: r.detail, full: r.label }));

  return (
    <div className="space-y-6">
      {ranking.rows.length > 0 && (
        <div>
          <div className="mb-2 text-[0.9375rem] text-ink-2">
            {ranking.direction === "top" ? "Highest" : "Lowest"} first — {ranking.rows[0]?.label.split(" — ")[0]} at{" "}
            <span className="mono font-medium text-ink">{ranking.rows[0]?.value.toFixed(1)}%</span>
          </div>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 10 }}>
                <CartesianGrid stroke="var(--color-hairline)" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={AXIS} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={80} tick={AXIS} axisLine={{ stroke: "var(--color-hairline-2)" }} tickLine={false} />
                <Tooltip {...TOOLTIP} formatter={(v: number) => `${v.toFixed(1)}%`} />
                <Bar dataKey="value" name="Overall" fill={ranking.direction === "top" ? "var(--color-chart-3)" : "var(--color-chart-2)"} radius={[0, 2, 2, 0]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {ranking.rows.length > 0 && (
        <Table>
          <THead>
            <TR>
              <TH>#</TH>
              <TH>Name</TH>
              <TH className="text-right">Score</TH>
              <TH>Detail</TH>
            </TR>
          </THead>
          <tbody>
            {ranking.rows.map((r, i) => (
              <TR key={i}>
                <TD className="mono text-ink-3">{String(i + 1).padStart(2, "0")}</TD>
                <TD>{r.label}</TD>
                <TD className="mono text-right text-ink">{r.value.toFixed(1)}%</TD>
                <TD className="text-ink-3">{r.detail}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}

      {report && <ProseBlock text={report} />}
    </div>
  );
}

function EntityView({ entity, report }: { entity: NonNullable<ManagementData["entity"]>; report: string }) {
  return (
    <div className="space-y-6">
      <div>
        <Badge variant="neutral">{entity.kind}</Badge>
        <h3 className="mt-2 text-lg font-medium text-ink">
          {entity.code !== entity.name ? `${entity.code} — ${entity.name}` : entity.name}
        </h3>
      </div>

      <section className="grid gap-px overflow-hidden rounded-md border border-hairline bg-hairline sm:grid-cols-2 lg:grid-cols-3">
        {entity.metrics.map((m) => (
          <StatTile
            key={m.label}
            className="rounded-none border-0"
            label={m.label}
            value={`${m.value}${m.suffix}`}
            hint={m.hint || undefined}
          />
        ))}
      </section>

      {entity.summary && <ProseBlock text={entity.summary} />}
      {report && report !== entity.summary && <ProseBlock text={report} />}
    </div>
  );
}

function SkillGapsView({ gaps, answer, report }: { gaps: ManagementData["commonSkillGaps"]; answer: string; report: string }) {
  const chartData = gaps.map((g) => ({ name: g.skill, studentsShort: g.studentsShort }));

  return (
    <div className="space-y-6">
      {answer && <p className="text-[0.9375rem] leading-relaxed text-ink-2">{answer}</p>}

      {gaps.length > 0 && (
        <>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 42, left: -18 }}>
                <CartesianGrid stroke="var(--color-hairline)" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ ...AXIS, fontSize: 10 }}
                  interval={0}
                  angle={-32}
                  textAnchor="end"
                  height={54}
                  axisLine={{ stroke: "var(--color-hairline-2)" }}
                  tickLine={false}
                />
                <YAxis tick={AXIS} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip {...TOOLTIP} />
                <Bar dataKey="studentsShort" name="Students short" fill="var(--color-chart-2)" radius={[2, 2, 0, 0]}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <Table>
            <THead>
              <TR>
                <TH>Skill</TH>
                <TH className="text-right">Students short</TH>
              </TR>
            </THead>
            <tbody>
              {gaps.map((g, i) => (
                <TR key={i}>
                  <TD>{g.skill}</TD>
                  <TD className="mono text-right text-ink">{g.studentsShort}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </>
      )}

      {report && <ProseBlock text={report} />}
    </div>
  );
}

function ReportView({ report, answer, d }: { report: string; answer: string; d: ManagementData }) {
  return (
    <div className="space-y-6">
      {answer && <p className="text-[0.9375rem] leading-relaxed text-ink font-medium">{answer}</p>}
      {report && <ProseBlock text={report} />}
      {(d.bestCourse || d.worstCourse || d.bestBatch) && (
        <section className="grid gap-px overflow-hidden rounded-md border border-hairline bg-hairline sm:grid-cols-3">
          {d.bestCourse && (
            <StatTile className="rounded-none border-0" label="Best course" value={d.bestCourse.code} hint={`${d.bestCourse.overall.toFixed(1)}% · ${d.bestCourse.title}`} />
          )}
          {d.worstCourse && (
            <StatTile className="rounded-none border-0" label="Lowest course" value={d.worstCourse.code} hint={`${d.worstCourse.overall.toFixed(1)}% · ${d.worstCourse.title}`} />
          )}
          {d.bestBatch && (
            <StatTile className="rounded-none border-0" label="Best batch" value={d.bestBatch.code} hint={`${d.bestBatch.overall.toFixed(1)}% · ${d.bestBatch.name}`} />
          )}
        </section>
      )}
      {d.instructorStandings.length > 0 && (
        <Card label="Instructor standings">
          <Table>
            <THead>
              <TR>
                <TH>#</TH>
                <TH>Instructor</TH>
                <TH className="text-right">Overall</TH>
                <TH className="text-right">Conduct rate</TH>
              </TR>
            </THead>
            <tbody>
              {d.instructorStandings.map((inst, i) => (
                <TR key={i}>
                  <TD className="mono text-ink-3">{String(i + 1).padStart(2, "0")}</TD>
                  <TD>{inst.name}</TD>
                  <TD className="mono text-right text-ink">{inst.overall.toFixed(1)}%</TD>
                  <TD className="mono text-right text-ink">{inst.conductRate.toFixed(1)}%</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}

function OverviewFallback({ d }: { d: ManagementData }) {
  const hasOverviewData = d.bestCourse || d.worstCourse || d.instructorStandings.length > 0 || d.commonSkillGaps.length > 0;

  if (d.answer) {
    return (
      <div className="space-y-6">
        <p className="text-[0.9375rem] leading-relaxed text-ink font-medium">{d.answer}</p>
        {d.report && <ProseBlock text={d.report} />}
        {hasOverviewData && <OverviewPayload d={d} />}
      </div>
    );
  }
  if (d.report) {
    return (
      <div className="space-y-6">
        <ProseBlock text={d.report} />
        {hasOverviewData && <OverviewPayload d={d} />}
      </div>
    );
  }

  return <AiAnswer payload={d} />;
}

function OverviewPayload({ d }: { d: ManagementData }) {
  return (
    <div className="space-y-5">
      {(d.bestCourse || d.worstCourse || d.bestBatch) && (
        <section className="grid gap-px overflow-hidden rounded-md border border-hairline bg-hairline sm:grid-cols-3">
          {d.bestCourse && (
            <StatTile className="rounded-none border-0" label="Best course" value={d.bestCourse.code} hint={`${d.bestCourse.overall.toFixed(1)}% · ${d.bestCourse.title}`} />
          )}
          {d.worstCourse && (
            <StatTile className="rounded-none border-0" label="Lowest course" value={d.worstCourse.code} hint={`${d.worstCourse.overall.toFixed(1)}% · ${d.worstCourse.title}`} />
          )}
          {d.bestBatch && (
            <StatTile className="rounded-none border-0" label="Best batch" value={d.bestBatch.code} hint={`${d.bestBatch.overall.toFixed(1)}% · ${d.bestBatch.name}`} />
          )}
        </section>
      )}
      {d.instructorStandings.length > 0 && (
        <Card label="Instructor standings">
          <Table>
            <THead>
              <TR>
                <TH>#</TH>
                <TH>Instructor</TH>
                <TH className="text-right">Overall</TH>
                <TH className="text-right">Conduct rate</TH>
              </TR>
            </THead>
            <tbody>
              {d.instructorStandings.map((inst, i) => (
                <TR key={i}>
                  <TD className="mono text-ink-3">{String(i + 1).padStart(2, "0")}</TD>
                  <TD>{inst.name}</TD>
                  <TD className="mono text-right text-ink">{inst.overall.toFixed(1)}%</TD>
                  <TD className="mono text-right text-ink">{inst.conductRate.toFixed(1)}%</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
      {d.commonSkillGaps.length > 0 && (
        <Card label="Common skill gaps">
          <Table>
            <THead>
              <TR>
                <TH>Skill</TH>
                <TH className="text-right">Students short</TH>
              </TR>
            </THead>
            <tbody>
              {d.commonSkillGaps.map((g, i) => (
                <TR key={i}>
                  <TD>{g.skill}</TD>
                  <TD className="mono text-right text-ink">{g.studentsShort}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}

function MetricRow({ label, value, suffix }: { label: string; value: number; suffix: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[0.8125rem] text-ink-2">{label}</span>
      <span className="mono text-sm text-ink">
        {typeof value === "number" ? value.toFixed(1) : value}
        {suffix}
      </span>
    </div>
  );
}

function ProseBlock({ text }: { text: string }) {
  return <p className="whitespace-pre-wrap text-[0.9375rem] leading-relaxed text-ink-2">{text}</p>;
}
