"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";

const field =
  "w-full border border-hairline-2 rounded-sm bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none";

function Label({ children }: { children: React.ReactNode }) {
  return <span className="stat mb-1.5 block">{children}</span>;
}

function formatLocalDate(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d;
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 10);
}

export type BatchFormValues = {
  id: string;
  code: string;
  name: string;
  courseId: string;
  instructorId: string;
  startDate: Date | string;
  endDate: Date | string;
  schedule: string;
  capacity: number;
  status: string;
};

export type CourseChoice = { id: string; code: string; title: string };
export type InstructorChoice = { id: string; name: string; employeeNo: string };

export default function BatchForm({
  batch,
  courses,
  instructors,
}: {
  batch?: BatchFormValues;
  courses: CourseChoice[];
  instructors: InstructorChoice[];
}) {
  const router = useRouter();
  const editing = Boolean(batch);

  const [form, setForm] = useState({
    code: batch?.code ?? "",
    name: batch?.name ?? "",
    courseId: batch?.courseId ?? "",
    instructorId: batch?.instructorId ?? "",
    startDate: batch ? formatLocalDate(batch.startDate) : "",
    endDate: batch ? formatLocalDate(batch.endDate) : "",
    schedule: batch?.schedule ?? "",
    capacity: batch?.capacity ?? 20,
    status: (batch?.status as "UPCOMING" | "ACTIVE" | "COMPLETED") ?? "UPCOMING",
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const setString =
    (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const setNumber = (k: "capacity") => (e: React.ChangeEvent<HTMLInputElement>) => {
    const n = Number(e.target.value);
    setForm((f) => ({ ...f, [k]: Number.isFinite(n) && n > 0 ? n : 1 }));
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body = editing
        ? Object.fromEntries(
            Object.entries(form).filter(([, v]) => v !== undefined && String(v).trim() !== ""),
          )
        : form;

      const res = await fetch(
        editing ? `/api/batches/${batch!.id}` : "/api/batches",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? `Failed (${res.status})`);

      router.push(editing ? `/instructor/batches/${batch!.id}` : `/instructor/batches/${json.data.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the batch");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-8">
      <Card label={editing ? "Batch record" : "New batch"}>
        <div className="grid gap-5 md:grid-cols-2">
          <label>
            <Label>Batch code</Label>
            <input
              required={!editing}
              minLength={3}
              maxLength={24}
              value={form.code}
              onChange={setString("code")}
              placeholder="WD-S26-01"
              className={`${field} mono uppercase`}
            />
          </label>
          <label>
            <Label>Batch name</Label>
            <input
              required={!editing}
              minLength={3}
              maxLength={120}
              value={form.name}
              onChange={setString("name")}
              placeholder="Web Development - Spring 2026"
              className={field}
            />
          </label>
          <label>
            <Label>Course</Label>
            <select required={!editing} value={form.courseId} onChange={setString("courseId")} className={field}>
              <option value="">Select a course</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            <Label>Instructor</Label>
            <select
              required={!editing}
              value={form.instructorId}
              onChange={setString("instructorId")}
              className={field}
            >
              <option value="">Select an instructor</option>
              {instructors.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.employeeNo} — {i.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <Label>Start date</Label>
            <input
              required={!editing}
              type="date"
              value={form.startDate}
              onChange={setString("startDate")}
              className={`${field} mono`}
            />
          </label>
          <label>
            <Label>End date</Label>
            <input
              required={!editing}
              type="date"
              value={form.endDate}
              onChange={setString("endDate")}
              className={`${field} mono`}
            />
          </label>
          <label>
            <Label>Schedule</Label>
            <input
              required={!editing}
              minLength={2}
              maxLength={160}
              value={form.schedule}
              onChange={setString("schedule")}
              placeholder="Mon / Wed 18:00-21:00"
              className={field}
            />
          </label>
          <label>
            <Label>Capacity</Label>
            <input
              required={!editing}
              type="number"
              min={1}
              max={500}
              value={form.capacity}
              onChange={setNumber("capacity")}
              className={`${field} mono`}
            />
          </label>
          <label className="md:col-span-2">
            <Label>Status</Label>
            <select required={!editing} value={form.status} onChange={setString("status")} className={field}>
              <option value="UPCOMING">Upcoming</option>
              <option value="ACTIVE">Active</option>
              <option value="COMPLETED">Completed</option>
            </select>
          </label>
        </div>
      </Card>

      {error && (
        <p className="border-l-2 border-danger bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>
      )}

      <div className="flex items-center gap-4">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : editing ? "Save changes" : "Create batch"}
        </Button>
        <span className="text-xs text-ink-3">
          {editing
            ? "Changes are saved immediately."
            : "Creates the cohort; students can be enrolled afterwards."}
        </span>
      </div>
    </form>
  );
}
