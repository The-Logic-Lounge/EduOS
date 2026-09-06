"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";

export type InstructorFormValues = {
  id: string;
  name: string;
  email: string;
  employeeNo: string;
  specialization: string;
  bio: string;
};

const field =
  "w-full border border-hairline-2 rounded-sm bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none";

function Label({ children }: { children: React.ReactNode }) {
  return <span className="stat mb-1.5 block">{children}</span>;
}

/**
 * One form for both create and update. Create POSTs every field;
 * edit PATCHes only the boxes that were filled in, so a blank password keeps the old one.
 */
export default function InstructorForm({ instructor }: { instructor?: InstructorFormValues }) {
  const router = useRouter();
  const editing = Boolean(instructor);

  const [form, setForm] = useState({
    name: instructor?.name ?? "",
    email: instructor?.email ?? "",
    password: "",
    employeeNo: instructor?.employeeNo ?? "",
    specialization: instructor?.specialization ?? "",
    bio: instructor?.bio ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set =
    (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body = editing
        ? Object.fromEntries(Object.entries(form).filter(([, v]) => v.trim() !== ""))
        : form;

      const res = await fetch(
        editing ? `/api/instructors/${instructor!.id}` : "/api/instructors",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? `Failed (${res.status})`);

      router.push(`/management/instructors/${editing ? instructor!.id : json.data.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the instructor");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-8">
      <Card label={editing ? "Instructor record" : "New instructor"}>
        <div className="grid gap-5 md:grid-cols-2">
          <label>
            <Label>Full name</Label>
            <input
              required={!editing}
              minLength={2}
              maxLength={80}
              value={form.name}
              onChange={set("name")}
              placeholder="Dr. Ayesha Khan"
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
            <Label>Employee number</Label>
            <input
              required={!editing}
              minLength={3}
              maxLength={24}
              value={form.employeeNo}
              onChange={set("employeeNo")}
              placeholder="INST-001"
              className={`${field} mono uppercase`}
            />
          </label>
          <label className="md:col-span-2">
            <Label>Specialization</Label>
            <input
              required={!editing}
              minLength={2}
              maxLength={120}
              value={form.specialization}
              onChange={set("specialization")}
              placeholder="Machine Learning, Software Engineering"
              className={field}
            />
          </label>
          <label className="md:col-span-2">
            <Label>Bio</Label>
            <textarea
              required={!editing}
              minLength={2}
              maxLength={500}
              rows={4}
              value={form.bio}
              onChange={set("bio")}
              placeholder="Short biography and teaching background"
              className={field}
            />
          </label>
        </div>
      </Card>

      {error && (
        <p className="border-l-2 border-danger bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>
      )}

      <div className="flex items-center gap-4">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : editing ? "Save changes" : "Register instructor"}
        </Button>
        <span className="text-xs text-ink-3">
          {editing
            ? "Only the fields you change are written."
            : "Login and instructor profile are written in one transaction."}
        </span>
      </div>
    </form>
  );
}
