"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";

export type StudentFormValues = {
  id: string;
  name: string;
  email: string;
  rollNo: string;
  phone: string;
  city: string;
  education: string;
};

export type BatchChoice = { id: string; code: string; name: string; capacity: number; enrolled: number };

const field =
  "w-full border border-hairline-2 rounded-sm bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none";

function Label({ children }: { children: React.ReactNode }) {
  return <span className="stat mb-1.5 block">{children}</span>;
}

/**
 * One form for both registration and update. Create POSTs every field;
 * edit PATCHes only the boxes that were filled in, so a blank password keeps the old one.
 */
export default function StudentForm({
  student,
  batches = [],
}: {
  student?: StudentFormValues;
  batches?: BatchChoice[];
}) {
  const router = useRouter();
  const editing = Boolean(student);

  const [form, setForm] = useState({
    name: student?.name ?? "",
    email: student?.email ?? "",
    password: "",
    rollNo: student?.rollNo ?? "",
    phone: student?.phone ?? "",
    city: student?.city ?? "",
    education: student?.education ?? "",
    batchId: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set =
    (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const { batchId, ...rest } = form;
      // JSON.stringify drops undefined keys — that is how "leave it alone" is sent.
      const body = editing
        ? Object.fromEntries(Object.entries(rest).filter(([, v]) => v.trim() !== ""))
        : { ...rest, rollNo: rest.rollNo.trim() || undefined, batchId: batchId || undefined };

      const res = await fetch(editing ? `/api/students/${student!.id}` : "/api/students", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? `Failed (${res.status})`);

      router.push(`/management/students/${editing ? student!.id : json.data.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the student");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-8">
      <Card label={editing ? "Student record" : "New student"}>
        <div className="grid gap-5 md:grid-cols-2">
          <label>
            <Label>Full name</Label>
            <input
              required={!editing}
              minLength={2}
              maxLength={80}
              value={form.name}
              onChange={set("name")}
              placeholder="Ayesha Khan"
              className={field}
            />
          </label>
          <label>
            <Label>Email</Label>
            <input
              required={!editing}
              type="email"
              value={form.email}
              onChange={set("email")}
              placeholder="ayesha@eduos.pk"
              className={field}
            />
          </label>
          <label>
            <Label>{editing ? "New password (blank = unchanged)" : "Password"}</Label>
            <input
              required={!editing}
              type="password"
              minLength={6}
              value={form.password}
              onChange={set("password")}
              placeholder="At least 6 characters"
              className={field}
            />
          </label>
          <label>
            <Label>{editing ? "Roll number" : "Roll number (blank = auto)"}</Label>
            <input
              value={form.rollNo}
              onChange={set("rollNo")}
              placeholder="BQ-2026-0241"
              className={`${field} mono uppercase`}
            />
          </label>
          <label>
            <Label>Phone</Label>
            <input
              required={!editing}
              value={form.phone}
              onChange={set("phone")}
              placeholder="0300-1234567"
              className={`${field} mono`}
            />
          </label>
          <label>
            <Label>City</Label>
            <input
              required={!editing}
              value={form.city}
              onChange={set("city")}
              placeholder="Karachi"
              className={field}
            />
          </label>
          <label className="md:col-span-2">
            <Label>Education</Label>
            <input
              required={!editing}
              value={form.education}
              onChange={set("education")}
              placeholder="BSc Computer Science"
              className={field}
            />
          </label>
        </div>
      </Card>

      {!editing && batches.length > 0 && (
        <Card label="Enrol immediately (optional)">
          <label className="block max-w-md">
            <Label>Batch</Label>
            <select value={form.batchId} onChange={set("batchId")} className={field}>
              <option value="">Do not enrol yet</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id} disabled={b.enrolled >= b.capacity}>
                  {b.code} — {b.name} ({b.enrolled}/{b.capacity})
                </option>
              ))}
            </select>
          </label>
        </Card>
      )}

      {error && (
        <p className="border-l-2 border-danger bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>
      )}

      <div className="flex items-center gap-4">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : editing ? "Save changes" : "Register student"}
        </Button>
        <span className="text-xs text-ink-3">
          {editing
            ? "Only the fields you change are written."
            : "Login and student record are written in one transaction."}
        </span>
      </div>
    </form>
  );
}
