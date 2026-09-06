"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <div className="max-w-md text-center">
        <div className="mono text-[4rem] leading-none font-medium text-danger">500</div>
        <h1 className="mt-4 font-display text-2xl font-bold tracking-tight text-ink">
          Something went wrong
        </h1>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-2">
          {error.message || "An unexpected error occurred while loading this page."}
        </p>
        {error.digest && (
          <p className="mono mt-2 text-xs text-ink-3">Digest: {error.digest}</p>
        )}
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-10 items-center justify-center rounded-sm border border-hairline-2 bg-surface px-5 text-sm font-medium tracking-tight text-ink transition-all duration-150 hover:border-accent hover:text-accent active:translate-y-px"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex h-10 items-center justify-center rounded-sm border border-transparent bg-transparent px-5 text-sm font-medium tracking-tight text-ink-2 transition-all duration-150 hover:bg-surface-2 hover:text-ink"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}
