export default function Loading() {
  return (
    <div className="pb-16">
      <div className="mb-8 animate-pulse">
        <div className="h-8 w-64 rounded bg-surface-2" />
        <div className="mt-3 h-4 w-96 rounded bg-surface-2" />
      </div>
      <div className="grid gap-px overflow-hidden rounded-md border border-hairline bg-hairline sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="animate-pulse bg-surface px-5 pt-4 pb-5">
            <div className="h-3 w-16 rounded bg-surface-2" />
            <div className="mt-3 h-8 w-12 rounded bg-surface-2" />
          </div>
        ))}
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="animate-pulse rounded-md border border-hairline bg-surface p-5">
            <div className="h-3 w-32 rounded bg-surface-2" />
            <div className="mt-4 space-y-3">
              <div className="h-3 w-full rounded bg-surface-2" />
              <div className="h-3 w-4/5 rounded bg-surface-2" />
              <div className="h-3 w-3/5 rounded bg-surface-2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
