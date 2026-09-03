import Card from "@/components/ui/Card";
import Table, { THead, TR, TH, TD } from "@/components/ui/Table";

/** One score renderer for the whole management surface — 0 samples is never "0%". */
export function Score({ value, sampleSize }: { value: number; sampleSize: number }) {
  if (sampleSize === 0) return <span className="mono text-ink-3">—</span>;
  const tone = value >= 75 ? "text-success" : value >= 55 ? "text-ink" : "text-danger";
  return <span className={`mono font-medium ${tone}`}>{value.toFixed(1)}</span>;
}

export type RankRow = { code: string; name: string; score: number; meta?: string };

export function RankTable({
  label,
  rows,
  tone = "neutral",
}: {
  label: string;
  rows: RankRow[];
  tone?: "neutral" | "danger";
}) {
  return (
    <Card label={label} right={<span className={`mono text-xs ${tone === "danger" ? "text-danger" : "text-accent"}`}>{rows.length}</span>}>
      <Table className="min-w-0">
        <THead>
          <TR>
            <TH>Code</TH>
            <TH>Name</TH>
            <TH className="text-right">Score</TH>
          </TR>
        </THead>
        <tbody>
          {rows.map((r) => (
            <TR key={r.code}>
              <TD className="mono text-ink">{r.code}</TD>
              <TD>
                <span className="text-ink">{r.name}</span>
                {r.meta && <span className="block text-xs text-ink-3">{r.meta}</span>}
              </TD>
              <TD className="text-right">
                <Score value={r.score} sampleSize={1} />
              </TD>
            </TR>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}
