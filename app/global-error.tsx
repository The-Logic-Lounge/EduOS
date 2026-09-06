"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, -apple-system, sans-serif",
          background: "#fafaf9",
          color: "#1a1a1a",
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.5rem",
        }}
      >
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <div
            style={{
              fontFamily: "ui-monospace, monospace",
              fontSize: "4rem",
              fontWeight: 500,
              lineHeight: 1,
              color: "#c0392b",
            }}
          >
            Error
          </div>
          <h1 style={{ marginTop: 16, fontSize: "1.5rem", fontWeight: 700 }}>
            Application error
          </h1>
          <p style={{ marginTop: 12, fontSize: "0.9375rem", lineHeight: 1.6, color: "#555" }}>
            {error.message || "A critical error prevented this page from loading."}
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 24,
              height: 40,
              padding: "0 20px",
              border: "1px solid #ddd",
              borderRadius: 2,
              background: "#fff",
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
