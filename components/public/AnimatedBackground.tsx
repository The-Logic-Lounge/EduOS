export function AnimatedBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div
        aria-hidden
        className="absolute -left-[25%] -top-[25%] h-[150%] w-[150%] animate-gradient-shift opacity-40"
        style={{
          background:
            "radial-gradient(circle at 30% 20%, var(--color-accent) 0%, transparent 45%), " +
            "radial-gradient(circle at 70% 80%, var(--color-signal) 0%, transparent 40%), " +
            "radial-gradient(circle at 50% 50%, var(--color-accent-ink) 0%, transparent 60%)",
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage:
            "linear-gradient(to right, var(--color-hairline) 1px, transparent 1px), " +
            "linear-gradient(to bottom, var(--color-hairline) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, transparent 0%, var(--color-paper) 100%)",
        }}
      />
    </div>
  );
}
