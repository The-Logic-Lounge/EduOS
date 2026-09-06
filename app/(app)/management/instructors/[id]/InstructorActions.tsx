"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Button from "@/components/ui/Button";

export default function InstructorActions({ id, hasBatches }: { id: string; hasBatches: boolean }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!confirm("Delete this instructor and their login permanently?")) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/instructors/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? `Failed (${res.status})`);
      router.push("/management/instructors");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the instructor");
      setDeleting(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Link
        href={`/management/instructors/${id}/edit`}
        className="inline-flex h-10 items-center rounded-sm border border-hairline-2 bg-surface px-5 text-sm font-medium text-ink transition-colors hover:border-accent hover:text-accent"
      >
        Edit
      </Link>
      <Button
        variant="secondary"
        onClick={remove}
        disabled={deleting || hasBatches}
        title={
          hasBatches
            ? "Reassign or delete the instructor's batches first"
            : "Delete instructor and login"
        }
      >
        {deleting ? "Deleting…" : "Delete"}
      </Button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
