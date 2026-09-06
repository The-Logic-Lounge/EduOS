"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Button from "@/components/ui/Button";

export default function BatchActions({ id, enrolled }: { id: string; enrolled: number }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (
      !confirm(
        "Delete this batch and all its enrolments, sessions, assignments and assessments? This cannot be undone.",
      )
    )
      return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/batches/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? `Failed (${res.status})`);
      router.push("/management/batches");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the batch");
      setDeleting(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Link
        href={`/management/batches/${id}/edit`}
        className="inline-flex h-10 items-center rounded-sm border border-hairline-2 bg-surface px-5 text-sm font-medium text-ink transition-colors hover:border-accent hover:text-accent"
      >
        Edit
      </Link>
      <Button
        variant="secondary"
        onClick={remove}
        disabled={deleting || enrolled > 0}
        title={
          enrolled > 0
            ? "Remove all students from this batch before deleting it"
            : "Delete this batch permanently"
        }
      >
        {deleting ? "Deleting…" : "Delete"}
      </Button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
