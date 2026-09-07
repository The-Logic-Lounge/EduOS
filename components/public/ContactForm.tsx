"use client";

import { useState } from "react";

export function ContactForm() {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("loading");
    setError("");

    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form));

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success) {
        throw new Error(body.error || "Something went wrong");
      }
      setStatus("success");
      form.reset();
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Something went wrong");
    }
  }

  if (status === "success") {
    return (
      <div className="card flex flex-col items-start justify-center gap-4 p-8">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success-soft text-success">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </div>
        <h3 className="font-display text-xl text-ink">Message received</h3>
        <p className="text-ink-2">Thank you for reaching out. We will get back to you within 48 hours.</p>
        <button
          type="button"
          onClick={() => setStatus("idle")}
          className="mt-2 text-sm font-medium text-accent hover:text-accent-ink"
        >
          Send another message
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-5 p-6 sm:p-8">
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.1em] text-ink-3">
            Name
          </label>
          <input
            id="name"
            name="name"
            required
            maxLength={120}
            className="w-full rounded-sm border border-hairline bg-paper px-3 py-2.5 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
            placeholder="Your full name"
          />
        </div>
        <div>
          <label htmlFor="email" className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.1em] text-ink-3">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            maxLength={120}
            className="w-full rounded-sm border border-hairline bg-paper px-3 py-2.5 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
            placeholder="you@example.com"
          />
        </div>
      </div>
      <div>
        <label htmlFor="phone" className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.1em] text-ink-3">
          Phone <span className="font-normal normal-case text-ink-3">(optional)</span>
        </label>
        <input
          id="phone"
          name="phone"
          maxLength={30}
          className="w-full rounded-sm border border-hairline bg-paper px-3 py-2.5 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
          placeholder="+92 300 1234567"
        />
      </div>
      <div>
        <label htmlFor="message" className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.1em] text-ink-3">
          Message
        </label>
        <textarea
          id="message"
          name="message"
          required
          maxLength={4000}
          rows={4}
          className="w-full resize-none rounded-sm border border-hairline bg-paper px-3 py-2.5 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
          placeholder="How can we help you?"
        />
      </div>
      {status === "error" && <p className="text-sm text-danger">{error}</p>}
      <button
        type="submit"
        disabled={status === "loading"}
        className="w-full rounded-sm bg-accent px-6 py-3 text-sm font-semibold text-surface transition-colors hover:bg-accent-ink disabled:opacity-60"
      >
        {status === "loading" ? "Sending..." : "Send message"}
      </button>
    </form>
  );
}
