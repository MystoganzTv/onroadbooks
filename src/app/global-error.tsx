"use client";

/**
 * THE LAST RESORT.
 *
 * This replaces the whole document, so there is no layout, no theme provider
 * and no language provider to read from -- both languages are printed rather
 * than guessed, and the markup is inline so it renders with no stylesheet.
 */

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
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#0b1220",
          color: "#e8eefc",
          fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
          padding: "24px",
        }}
      >
        <div style={{ maxWidth: "28rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.125rem", margin: "0 0 8px" }}>
            Something went wrong · Algo salió mal
          </h1>
          <p style={{ fontSize: "0.875rem", opacity: 0.75, margin: "0 0 20px" }}>
            Your books were not changed · Tus libros no cambiaron
          </p>
          {error.digest ? (
            <p style={{ fontSize: "0.75rem", opacity: 0.5, fontFamily: "monospace" }}>{error.digest}</p>
          ) : null}
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "8px",
              minHeight: "44px",
              padding: "0 20px",
              borderRadius: "999px",
              border: "none",
              background: "#2563eb",
              color: "white",
              fontSize: "0.875rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again · Intentar otra vez
          </button>
        </div>
      </body>
    </html>
  );
}
