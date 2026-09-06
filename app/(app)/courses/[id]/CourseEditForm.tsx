"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";

type ModuleRow = {
  id?: string;
  title: string;
  description: string;
  objectives: string;
  durationHours: string;
};

type CourseData = {
  id: string;
  code: string;
  title: string;
  description: string;
  level: string;
  durationWeeks: number;
  modules: {
    id: string;
    order: number;
    title: string;
    description: string;
    objectives: string[];
    durationHours: number;
  }[];
};

const LEVELS = ["Beginner", "Intermediate", "Advanced"];
const EMPTY_MODULE: ModuleRow = { title: "", description: "", objectives: "", durationHours: "8" };

const field =
  "w-full border border-hairline-2 rounded-sm bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none";

function Label({ children }: { children: React.ReactNode }) {
  return <span className="stat mb-1.5 block">{children}</span>;
}

export default function CourseEditForm({ course }: { course: CourseData }) {
  const router = useRouter();
  const [form, setForm] = useState({
    code: course.code,
    title: course.title,
    description: course.description,
    level: course.level,
    durationWeeks: String(course.durationWeeks),
  });
  const [modules, setModules] = useState<ModuleRow[]>(
    course.modules.map((m) => ({
      id: m.id,
      title: m.title,
      description: m.description,
      objectives: m.objectives.join("\n"),
      durationHours: String(m.durationHours),
    })),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const setModule = (i: number, k: keyof ModuleRow, v: string) =>
    setModules((ms) => ms.map((m, j) => (j === i ? { ...m, [k]: v } : m)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await fetch(`/api/courses/${course.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          durationWeeks: Number(form.durationWeeks),
          modules: modules.map((m) => ({
            id: m.id,
            title: m.title.trim(),
            description: m.description.trim(),
            durationHours: Number(m.durationHours),
            objectives: m.objectives
              .split("\n")
              .map((o) => o.trim())
              .filter(Boolean),
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? `Failed (${res.status})`);
      setSuccess(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save changes");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-8">
      <Card label="Course details">
        <div className="grid gap-5 md:grid-cols-[10rem_1fr]">
          <label>
            <Label>Code</Label>
            <input required value={form.code} onChange={set("code")} className={`${field} mono uppercase`} />
          </label>
          <label>
            <Label>Title</Label>
            <input required value={form.title} onChange={set("title")} className={field} />
          </label>
          <label className="md:col-span-2">
            <Label>Description</Label>
            <textarea required rows={3} value={form.description} onChange={set("description")} className={field} />
          </label>
          <label>
            <Label>Level</Label>
            <select value={form.level} onChange={set("level")} className={field}>
              {LEVELS.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </label>
          <label className="max-w-[12rem]">
            <Label>Duration (weeks)</Label>
            <input
              required
              type="number"
              min={1}
              max={104}
              value={form.durationWeeks}
              onChange={set("durationWeeks")}
              className={`${field} mono`}
            />
          </label>
        </div>
      </Card>

      <Card
        label="Curriculum modules"
        right={<span className="mono text-xs text-ink-3">{modules.length}</span>}
      >
        <div className="flex flex-col gap-8">
          {modules.map((m, i) => (
            <div key={`${m.id ?? "new"}-${i}`} className="grid gap-4 border-l-2 border-hairline-2 pl-5 md:grid-cols-[1fr_1fr]">
              <div className="flex items-baseline justify-between md:col-span-2">
                <span className="mono text-sm text-ink-3">Module {String(i + 1).padStart(2, "0")}</span>
                {modules.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    onClick={() => setModules((ms) => ms.filter((_, j) => j !== i))}
                  >
                    Remove
                  </Button>
                )}
              </div>
              <label>
                <Label>Title</Label>
                <input required value={m.title} onChange={(e) => setModule(i, "title", e.target.value)} className={field} />
              </label>
              <label className="max-w-[12rem]">
                <Label>Hours</Label>
                <input
                  required
                  type="number"
                  min={1}
                  value={m.durationHours}
                  onChange={(e) => setModule(i, "durationHours", e.target.value)}
                  className={`${field} mono`}
                />
              </label>
              <label className="md:col-span-2">
                <Label>Description</Label>
                <input required value={m.description} onChange={(e) => setModule(i, "description", e.target.value)} className={field} />
              </label>
              <label className="md:col-span-2">
                <Label>Learning objectives (one per line)</Label>
                <textarea
                  rows={3}
                  value={m.objectives}
                  onChange={(e) => setModule(i, "objectives", e.target.value)}
                  placeholder={"Build a REST endpoint\nExplain HTTP status codes"}
                  className={field}
                />
              </label>
            </div>
          ))}
        </div>
        <Button
          variant="secondary"
          size="sm"
          type="button"
          className="mt-6"
          onClick={() => setModules((ms) => [...ms, { ...EMPTY_MODULE }])}
        >
          + Add module
        </Button>
      </Card>

      {error && <p className="border-l-2 border-danger bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>}
      {success && <p className="border-l-2 border-success bg-success-soft px-4 py-3 text-sm text-success">Changes saved successfully.</p>}

      <div className="flex items-center gap-4">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
        <Button
          variant="secondary"
          type="button"
          onClick={() => router.push(`/courses/${course.id}`)}
        >
          Cancel
        </Button>
        <span className="text-xs text-ink-3">Course and every module are updated in one transaction.</span>
      </div>
    </form>
  );
}
