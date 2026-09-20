"use client";

import * as React from "react";
import Link from "next/link";
import { KeyRound, Loader2, XCircle } from "lucide-react";

import { BrandLogo } from "@/components/shell/brand-logo";
import { Button } from "@/components/ui/button";
import type { AppLocale } from "@/lib/i18n";
import { getWebDictionary } from "@/lib/i18n/dictionaries";
import { localizeError } from "@/lib/i18n/errors";

type State =
  | { kind: "password"; message: string }
  | { kind: "working"; message: string }
  | { kind: "error"; message: string };

export function InviteAcceptance({ locale }: { locale: AppLocale }) {
  const copy = getWebDictionary(locale).auth;
  const [invitationToken, setInvitationToken] = React.useState<string | null>(
    null,
  );
  const [password, setPassword] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const initialized = React.useRef(false);
  const spanish = locale === "es";
  const [state, setState] = React.useState<State>({
    kind: "working",
    message: copy.inviteVerifying,
  });

  React.useEffect(() => {
    if (initialized.current) return;
    const token = new URLSearchParams(window.location.hash.slice(1)).get(
      "token",
    );
    if (token) {
      initialized.current = true;
      setInvitationToken(token);
      window.history.replaceState(null, "", window.location.pathname);
      setState({
        kind: "password",
        message: spanish
          ? "Crea una contraseña para aceptar la invitación."
          : "Choose a password to accept your invitation.",
      });
      return;
    }
    initialized.current = true;
    window.history.replaceState(null, "", window.location.pathname);
    setState({
      kind: "error",
      message: spanish
        ? "La invitación no es válida. Pide al dueño del negocio una nueva invitación."
        : "This invitation is invalid. Ask the workspace owner for a new invitation.",
    });
  }, [spanish]);

  async function acceptWithPassword(event: React.FormEvent) {
    event.preventDefault();
    if (!invitationToken || submitting) return;
    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/invite/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: invitationToken, password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || copy.inviteFailed);
      setInvitationToken(null);
      setPassword("");
      window.location.replace("/dashboard?team=joined");
    } catch (error) {
      setState({
        kind: "password",
        message:
          error instanceof Error
            ? localizeError(error.message, locale)
            : copy.inviteFailed,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 text-center">
        <BrandLogo className="mx-auto w-44" priority />
        <div className="mx-auto mt-6 flex size-12 items-center justify-center rounded-full bg-surface-sunken">
          {state.kind === "working" ? (
            <Loader2 className="size-6 animate-spin text-primary" />
          ) : state.kind === "password" ? (
            <KeyRound className="size-6 text-primary" />
          ) : (
            <XCircle className="size-6 text-neg" />
          )}
        </div>
        <h1 className="mt-4 text-xl font-semibold">{copy.joinWorkspace}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {state.message}
        </p>
        {state.kind === "password" ? (
          <form
            onSubmit={acceptWithPassword}
            className="mt-5 space-y-4 text-left"
          >
            <label className="block text-sm" htmlFor="invite-password">
              {spanish ? "Contraseña" : "Password"}
            </label>
            <input
              id="invite-password"
              type="password"
              autoComplete="new-password"
              minLength={10}
              maxLength={200}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-10 w-full rounded-md border bg-background px-3"
            />
            <p className="text-xs text-muted-foreground">
              {spanish
                ? "Usa al menos 10 caracteres."
                : "Use at least 10 characters."}
            </p>
            <Button type="submit" disabled={submitting} className="w-full">
              {spanish ? "Aceptar invitación" : "Accept invitation"}
            </Button>
          </form>
        ) : null}
        {state.kind === "error" ? (
          <Button asChild variant="outline" className="mt-5">
            <Link href="/login">{copy.returnSignIn}</Link>
          </Button>
        ) : null}
      </div>
    </main>
  );
}
