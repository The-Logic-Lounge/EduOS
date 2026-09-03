"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";

export type EnrollOption = {
  id: string;
  code: string;
  name: string;
  capacity: number;
  enrolled: number;
  status: string;
};

const field =
  "w-full border border-hairline-2 rounded-sm bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none";

export default function EnrollForm({
  studentId,
  batches,
}: {
  studentId: string;
  batches: EnrollOption[];
}) {
  const router = useRouter();
  const [batchId, setBatchId] = useState(batches[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (batches.length === 0) {
    return <p className="text-sm text-ink-3">Already enrolled in every batch.</p>;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/students/${studentId}/enroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? `Failed (${res.status})`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not enrol the student");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label>
        <span className="stat mb-1.5 block">Batch</span>
        <select value={batchId} onChange={(e) => setBatchId(e.target.value)} className={field}>
          {batches.map((b) => (
            <option key={b.id} value={b.id} disabled={b.enrolled >= b.capacity}>
              {b.code} — {b.name} ({b.enrolled}/{b.capacity})
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p className="border-l-2 border-danger bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>
      )}
      <Button type="submit" size="sm" disabled={saving || !batchId}>
        {saving ? "Enrolling…" : "Enrol in batch"}
      </Button>
    </form>
  );
}
