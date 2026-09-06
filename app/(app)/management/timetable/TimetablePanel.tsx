"use client";

import { useCallback, useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import TimetableGrid from "@/components/ui/TimetableGrid";

type ScheduleEntry = {
  id: string;
  day: string;
  startTime: string;
  endTime: string;
  batchCode?: string;
  batchName?: string;
  courseTitle?: string;
  instructor?: string;
  classroom?: string;
  building?: string;
};

type BatchOption = { id: string; code: string; name: string };

export default function TimetablePanel() {
  const [entries, setEntries] = useState<ScheduleEntry[]>([]);
  const [batches, setBatches] = useState<BatchOption[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSchedule = useCallback(async () => {
    try {
      const res = await fetch("/api/schedule");
      const json = await res.json();
      const data = json.data ?? json;
      setEntries(
        (Array.isArray(data) ? data : []).map((s: Record<string, unknown>) => ({
          id: s.id as string,
          day: s.day as string,
          startTime: s.startTime as string,
          endTime: s.endTime as string,
          batchCode: (s.batch as Record<string, unknown>)?.code as string,
          batchName: (s.batch as Record<string, unknown>)?.name as string,
          courseTitle: ((s.batch as Record<string, unknown>)?.course as Record<string, unknown>)?.title as string,
          instructor: ((s.instructor as Record<string, unknown>)?.user as Record<string, unknown>)?.name as string,
          classroom: (s.classroom as Record<string, unknown>)?.name as string,
          building: (s.classroom as Record<string, unknown>)?.building as string,
        })),
      );
    } catch {
      setError("Failed to load schedule");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchBatches = useCallback(async () => {
    try {
      const res = await fetch("/api/schedule");
      const json = await res.json();
      const all = json.data ?? json;
      const codes = new Map<string, BatchOption>();
      if (Array.isArray(all)) {
        for (const s of all as Record<string, unknown>[]) {
          const batch = s.batch as Record<string, unknown>;
          if (batch?.id && !codes.has(batch.id as string)) {
            codes.set(batch.id as string, {
              id: batch.id as string,
              code: batch.code as string,
              name: batch.name as string,
            });
          }
        }
      }
      setBatches([...codes.values()]);
    } catch {
      /* non-critical */
    }
  }, []);

  useEffect(() => {
    fetchSchedule();
    fetchBatches();
  }, [fetchSchedule, fetchBatches]);

  async function generate() {
    if (selected.length === 0) {
      setError("Select at least one batch to generate a timetable for.");
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/schedule/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchIds: selected, replace: true }),
      });
      const json = await res.json();
      const result = json.data ?? json;
      if (result.unplaced?.length > 0) {
        setError(result.unplaced.map((u: { batchCode: string; reason: string }) => `${u.batchCode}: ${u.reason}`).join("; "));
      }
      await fetchSchedule();
    } catch {
      setError("Failed to generate schedule");
    } finally {
      setGenerating(false);
    }
  }

  function toggleBatch(id: string) {
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  function selectAll() {
    setSelected(batches.map((b) => b.id));
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded-xs bg-surface-2" />
        <div className="h-64 animate-pulse rounded-xs bg-surface-2" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card label="Generate timetable" right={<span className="mono text-xs text-ink-3">{entries.length} sessions</span>}>
        <div className="mb-4 flex flex-wrap gap-2">
          {batches.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => toggleBatch(b.id)}
              className={`rounded-xs border px-3 py-1.5 text-[0.8125rem] transition-colors ${
                selected.includes(b.id)
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-hairline-2 bg-surface text-ink-2 hover:border-accent hover:text-accent"
              }`}
            >
              {b.code}
            </button>
          ))}
          {batches.length > 1 && (
            <button
              type="button"
              onClick={selectAll}
              className="rounded-xs border border-dashed border-hairline-2 px-3 py-1.5 text-[0.8125rem] text-ink-3 transition-colors hover:border-accent hover:text-accent"
            >
              Select all
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={generate} disabled={generating || selected.length === 0}>
            {generating ? "Generating…" : `Generate for ${selected.length} batch${selected.length !== 1 ? "es" : ""}`}
          </Button>
          {selected.length > 0 && (
            <span className="text-sm text-ink-3">{selected.length} selected</span>
          )}
        </div>
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      </Card>

      <Card label="Weekly timetable">
        <TimetableGrid entries={entries} />
      </Card>
    </div>
  );
}
