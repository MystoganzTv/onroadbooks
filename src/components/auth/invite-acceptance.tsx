"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2, XCircle } from "lucide-react";

import { BrandLogo } from "@/components/shell/brand-logo";
import { Button } from "@/components/ui/button";
import { invitationSessionFromUrl } from "@/lib/invitation-session";

type State = { kind: "working"; message: string } | { kind: "error"; message: string };

export function InviteAcceptance() {
  const [state, setState] = React.useState<State>({
    kind: "working",
    message: "Verifying your invitation...",
  });

  React.useEffect(() => {
    let active = true;

    async function accept() {
      try {
        const invitation = invitationSessionFromUrl(window.location.search, window.location.hash);
        if (!invitation.ok) throw new Error(invitation.error);

        // Keep the browser on our own origin. The route exchanges/verifies the
        // Supabase credentials server-side, so the strict CSP can stay intact.
        const response = await fetch("/api/auth/invite/accept", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(invitation.session),
        });
        const result = (await response.json().catch(() => null)) as { error?: string } | null;
        if (!response.ok) throw new Error(result?.error ?? "The invitation could not be accepted.");
        window.location.replace("/dashboard?team=joined");
      } catch (error) {
        if (active) {
          setState({
            kind: "error",
            message: error instanceof Error ? error.message : "The invitation could not be accepted.",
          });
        }
      }
    }

    void accept();
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 text-center">
        <BrandLogo className="mx-auto w-44" priority />
        <div className="mx-auto mt-6 flex size-12 items-center justify-center rounded-full bg-surface-sunken">
          {state.kind === "working" ? (
            <Loader2 className="size-6 animate-spin text-primary" />
          ) : (
            <XCircle className="size-6 text-neg" />
          )}
        </div>
        <h1 className="mt-4 text-xl font-semibold">Join this OnRoad workspace</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{state.message}</p>
        {state.kind === "error" ? (
          <Button asChild variant="outline" className="mt-5">
            <Link href="/login">Return to sign in</Link>
          </Button>
        ) : null}
      </div>
    </main>
  );
}
