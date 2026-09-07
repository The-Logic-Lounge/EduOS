"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type Notification = {
  id: string;
  title: string;
  body: string;
  type: string;
  read: boolean;
  link: string | null;
  createdAt: string;
};

type FetchResult = {
  success: boolean;
  data?: {
    notifications: Notification[];
    unreadCount: number;
    nextCursor: string | null;
  };
  error?: string;
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diff = Math.max(0, now - d.getTime());
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      cancelled = true;
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/notifications?limit=10", {
        credentials: "include",
      });
      const json: FetchResult = await res.json();
      if (json.success && json.data) {
        setItems(json.data.notifications);
        setUnread(json.data.unreadCount);
      } else {
        setError(json.error ?? "Failed to load notifications");
      }
    } catch (err) {
      setError("Failed to load notifications");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) refresh();
  }, [open]);

  const markRead = async (id: string) => {
    try {
      const res = await fetch(`/api/notifications/${id}/read`, {
        method: "PATCH",
        credentials: "include",
      });
      if (res.ok) {
        setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
        setUnread((c) => Math.max(0, c - 1));
      }
    } catch {
      /* ignore */
    }
  };

  const markAllRead = async () => {
    try {
      const res = await fetch(`/api/notifications/read-all`, {
        method: "PATCH",
        credentials: "include",
      });
      if (res.ok) {
        setItems((prev) => prev.map((n) => ({ ...n, read: true })));
        setUnread(0);
      }
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ""}`}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="relative grid h-9 w-9 place-items-center rounded-sm border border-hairline text-ink-2 transition-colors hover:border-accent hover:text-accent"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="square"
          aria-hidden
        >
          <path d="M6 8a6 6 0 0 1 12 0c0 4 2 5 2 7H4c0-2 2-3 2-7Z" />
          <path d="M10 19a2 2 0 0 0 4 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[0.625rem] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-40 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-sm border border-hairline bg-paper shadow-xl sm:w-[26rem]"
        >
          <div className="flex items-center justify-between border-b border-hairline px-3 py-2.5">
            <span className="text-[0.75rem] font-semibold uppercase tracking-[0.12em] text-ink-2">
              Notifications
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={refresh}
                disabled={loading}
                className="text-[0.75rem] text-ink-3 underline-offset-4 transition-colors hover:text-ink disabled:opacity-50"
              >
                {loading ? "Loading…" : "Refresh"}
              </button>
              {unread > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="text-[0.75rem] text-accent underline-offset-4 transition-colors hover:underline"
                >
                  Mark all read
                </button>
              )}
            </div>
          </div>

          <div className="max-h-[22rem] overflow-y-auto">
            {error && (
              <div className="px-3 py-4 text-center text-[0.8125rem] text-danger">{error}</div>
            )}
            {!error && items.length === 0 && !loading && (
              <div className="px-3 py-8 text-center text-[0.8125rem] text-ink-3">
                No notifications yet.
              </div>
            )}
            {items.map((n) => {
              const Wrapper = n.link ? Link : "div";
              return (
                <Wrapper
                  key={n.id}
                  href={n.link ?? "#"}
                  onClick={() => {
                    if (!n.read) markRead(n.id);
                  }}
                  className={`group block border-b border-hairline px-3 py-3 text-[0.8125rem] transition-colors last:border-b-0 ${
                    n.read ? "bg-paper" : "bg-accent-soft/40"
                  } hover:bg-surface-2`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span
                          className={`truncate ${n.read ? "text-ink" : "font-medium text-ink"}`}
                        >
                          {n.title}
                        </span>
                        <span className="stat shrink-0 text-[0.625rem] uppercase tracking-[0.12em] text-ink-3">
                          {n.type}
                        </span>
                      </div>
                      <div className="mt-0.5 line-clamp-2 text-[0.8125rem] text-ink-2">
                        {n.body}
                      </div>
                      <div className="stat mt-1 text-[0.6875rem] text-ink-3">
                        {formatWhen(n.createdAt)}
                      </div>
                    </div>
                    {!n.read && (
                      <span
                        aria-hidden
                        className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent"
                      />
                    )}
                  </div>
                </Wrapper>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
