"use client";

import * as React from "react";
import Link from "next/link";
import { Eye, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.91h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.4Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.97-.9 6.62-2.43l-3.24-2.54c-.9.6-2.05.96-3.38.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.62A10 10 0 0 0 12 22Z"
      />
      <path
        fill="#FBBC05"
        d="M6.39 13.86A6.02 6.02 0 0 1 6.08 12c0-.65.11-1.28.31-1.86V7.52H3.04A10 10 0 0 0 2 12c0 1.61.38 3.14 1.04 4.48l3.35-2.62Z"
      />
      <path
        fill="#EA4335"
        d="M12 6.01c1.47 0 2.79.51 3.83 1.5l2.87-2.87A9.64 9.64 0 0 0 12 2a10 10 0 0 0-8.96 5.52l3.35 2.62C7.18 7.77 9.39 6.01 12 6.01Z"
      />
    </svg>
  );
}

export function AuthOptions({ showDemo = false }: { showDemo?: boolean }) {
  const [demoPending, setDemoPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function openDemo() {
    setDemoPending(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/demo", { method: "POST" });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "The demo is unavailable.");
        return;
      }
      window.location.href = "/dashboard";
    } catch {
      setError("Could not open the demo. Try again.");
    } finally {
      setDemoPending(false);
    }
  }

  return (
    <div className="space-y-3">
      <Button asChild variant="outline" className="w-full">
        <a href="/api/auth/google">
          <GoogleIcon />
          Continue with Google
        </a>
      </Button>
      <p className="text-center text-[10px] leading-relaxed text-muted-foreground">
        By continuing, you agree to the{" "}
        <Link href="/terms" className="underline underline-offset-2 hover:text-foreground">Terms</Link>
        {" "}and acknowledge the{" "}
        <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground">Privacy Policy</Link>.
      </p>

      {showDemo ? (
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          disabled={demoPending}
          onClick={openDemo}
        >
          {demoPending ? <Loader2 className="animate-spin" /> : <Eye />}
          View demo account
        </Button>
      ) : null}

      {error ? <p className="text-center text-2xs text-neg">{error}</p> : null}

      <div className="flex items-center gap-3 text-2xs uppercase tracking-[0.12em] text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        Or continue with email
        <span className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}
