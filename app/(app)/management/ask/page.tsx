import { requirePageRole } from "@/lib/page-auth";
import { instituteSummary } from "@/lib/analytics";
import PageHeader from "@/components/ui/PageHeader";
import AskPanel from "./AskPanel";

export const dynamic = "force-dynamic";

export default async function AskCommandCenter() {
  await requirePageRole("MANAGEMENT");
  const summary = await instituteSummary();

  return (
    <div className="pb-16">
      <PageHeader
        title="Ask Edu OS"
        subtitle="Natural-language command centre. Every answer is computed from live records — students, batches, attendance, assessments — and rendered as structured blocks, not chat text."
        right={
          <div className="grid grid-cols-3 gap-6 text-right">
            <div>
              <div className="stat">Students</div>
              <div className="mono mt-1 text-xl text-ink">{summary.students}</div>
            </div>
            <div>
              <div className="stat">Batches</div>
              <div className="mono mt-1 text-xl text-ink">{summary.batches}</div>
            </div>
            <div>
              <div className="stat">Courses</div>
              <div className="mono mt-1 text-xl text-ink">{summary.courses}</div>
            </div>
          </div>
        }
      />
      <AskPanel />
    </div>
  );
}
