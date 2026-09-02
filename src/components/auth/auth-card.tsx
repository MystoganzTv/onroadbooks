"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";

import { BrandLogo } from "@/components/shell/brand-logo";
import { AuthOptions } from "@/components/auth/auth-options";

import { Field } from "@/components/shared/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AppLocale } from "@/lib/i18n";
import { getWebDictionary, interpolate } from "@/lib/i18n/dictionaries";
import { localizeError } from "@/lib/i18n/errors";
import { APP_NAME } from "@/lib/utils";

/**
 * Sign in, or create the owner account on first run. One component because
 * the two differ only by which fields are collected.
 */
export function AuthCard({
  mode,
  initialError = null,
  initialNotice = null,
  next = null,
  locale,
}: {
  mode: "login" | "setup";
  initialError?: string | null;
  initialNotice?: string | null;
  /** Already validated as a path on this site by `safeNextPath`. */
  next?: string | null;
  locale: AppLocale;
}) {
  const router = useRouter();
  const isSetup = mode === "setup";
  const copy = getWebDictionary(locale).auth;

  const [values, setValues] = React.useState({
    businessName: "",
    name: "",
    email: "",
    password: "",
  });
  const [error, setError] = React.useState<string | null>(initialError);
  const [pending, setPending] = React.useState(false);

  const set = (key: keyof typeof values, value: string) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const response = await fetch(isSetup ? "/api/auth/setup" : "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isSetup ? values : { email: values.email, password: values.password },
        ),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(localizeError(data?.error, locale));
        return;
      }

      if (next) {
        // A full navigation, not a router push: `next` can be a route handler
        // that redirects out of the browser entirely (the iOS handoff), which
        // client-side routing cannot follow.
        window.location.assign(next);
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError(copy.serverError);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="relative isolate flex min-h-dvh items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-80 bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.12),transparent_68%)]"
        aria-hidden
      />
      <div className="w-full max-w-md">
        <Link
          href="/"
          className="mb-4 inline-flex items-center gap-1.5 text-2xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          {interpolate(copy.backTo, { app: APP_NAME })}
        </Link>

        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-2xl shadow-black/15">
          <header className="border-b border-border px-6 py-5">
            <BrandLogo className="w-44" priority />
            <h1 className="mt-4 text-lg font-semibold tracking-tight text-foreground">
              {isSetup ? copy.setupAccount : copy.signInBooks}
            </h1>
          </header>

        <form
          onSubmit={submit}
          noValidate
          className="space-y-4 px-6 py-5"
        >
          <AuthOptions next={next} locale={locale} />

          {isSetup ? (
            <>
              <Field label={copy.businessName} htmlFor="auth-business" required>
                <Input
                  id="auth-business"
                  value={values.businessName}
                  onChange={(e) => set("businessName", e.target.value)}
                  placeholder="Padron Freight LLC"
                  maxLength={120}
                  required
                  autoFocus
                />
              </Field>
              <Field label={copy.yourName} htmlFor="auth-name">
                <Input
                  id="auth-name"
                  value={values.name}
                  onChange={(e) => set("name", e.target.value)}
                  maxLength={120}
                  autoComplete="name"
                />
              </Field>
            </>
          ) : null}

          <Field label={copy.email} htmlFor="auth-email" required>
            <Input
              id="auth-email"
              type="email"
              value={values.email}
              onChange={(e) => set("email", e.target.value)}
              autoComplete={isSetup ? "email" : "username"}
              required
              autoFocus={!isSetup}
            />
          </Field>

          <Field
            label={copy.password}
            htmlFor="auth-password"
            required
            hint={isSetup ? copy.passwordHint : undefined}
          >
            <Input
              id="auth-password"
              type="password"
              value={values.password}
              onChange={(e) => set("password", e.target.value)}
              autoComplete={isSetup ? "new-password" : "current-password"}
              minLength={isSetup ? 10 : undefined}
              required
            />
          </Field>

          {error ? (
            <p
              className="rounded-md border border-neg/30 bg-neg-soft px-3 py-2 text-xs text-neg"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          {!error && initialNotice ? (
            <p
              className="rounded-md border border-pos/30 bg-pos-soft px-3 py-2 text-xs text-pos"
              role="status"
            >
              {initialNotice}
            </p>
          ) : null}

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            {isSetup ? copy.createAccount : copy.signIn}
          </Button>

          <p className="text-center text-[10px] leading-relaxed text-muted-foreground">
            {copy.termsPrefix}{" "}
            <Link href="/terms" className="underline underline-offset-2 hover:text-foreground">
              {copy.terms}
            </Link>{" "}
            {copy.privacyPrefix}{" "}
            <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground">
              {copy.privacy}
            </Link>
            .
          </p>
        </form>
        </div>

        <p className="mt-4 text-center text-2xs leading-relaxed text-muted-foreground">
          {isSetup ? copy.alreadyAccount : copy.newToApp}{" "}
          <Link
            href={isSetup ? "/login" : "/setup"}
            className="font-medium text-primary hover:underline"
          >
            {isSetup ? copy.logIn : copy.createAccount}
          </Link>
        </p>
      </div>
    </div>
  );
}
