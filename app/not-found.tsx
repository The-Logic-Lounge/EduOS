export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-6">
      <div className="max-w-md text-center">
        <div className="mono text-[4rem] leading-none font-medium text-ink-3">404</div>
        <h1 className="mt-4 font-display text-2xl font-bold tracking-tight text-ink">
          Page not found
        </h1>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-2">
          The page you are looking for does not exist or has been moved.
        </p>
        <a
          href="/"
          className="mt-6 inline-flex h-10 items-center justify-center rounded-sm border border-hairline-2 bg-surface px-5 text-sm font-medium tracking-tight text-ink transition-all duration-150 hover:border-accent hover:text-accent active:translate-y-px"
        >
          Back to home
        </a>
      </div>
    </div>
  );
}
