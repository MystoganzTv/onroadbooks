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
import { setupSchema } from "@/lib/schemas";
import { APP_NAME } from "@/lib/utils";
import { fieldErrors, validationMessage } from "@/lib/form";
import type { AppLocale } from "@/lib/i18n";
import { getWebDictionary, interpolate } from "@/lib/i18n/dictionaries";
import { localizeError } from "@/lib/i18n/errors";

/**
 * Creating the owner account.
 *
 * This screen only creates the owner's credentials. Product setup belongs in
 * the welcome flow, and plan pricing belongs on the public pricing page or in
 * settings -- neither should make account creation feel like a checkout.
 */
export function SetupFlow({ locale }: { locale: AppLocale }) {
  const router = useRouter();
  const copy = getWebDictionary(locale).auth;
  const fieldLabels = { name: copy.yourName, email: copy.email, password: copy.password };

  const [values, setValues] = React.useState({
    name: "",
    email: "",
    password: "",
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const set = (key: keyof typeof values, value: string) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const payload = { ...values, name: values.name || null };

    const parsed = setupSchema.safeParse(payload);
    if (!parsed.success) {
      const next = fieldErrors(parsed.error);
      setErrors(next);
      setError(validationMessage(next, fieldLabels));
      return;
    }

    setErrors({});
    setError(null);
    setPending(true);

    try {
      const response = await fetch("/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(localizeError(data?.error, locale));
        return;
      }

      router.replace("/welcome");
      router.refresh();
    } catch {
      setError(copy.serverError);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6">
          <Link
            href="/"
            className="mb-5 inline-flex items-center gap-1.5 text-2xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            {interpolate(copy.backTo, { app: APP_NAME })}
          </Link>
          <BrandLogo className="w-40" priority />
          <p className="mt-2 text-2xs text-muted-foreground">
            {copy.tagline}
          </p>
        </div>

        <form
          onSubmit={submit}
          noValidate
          className="space-y-4 rounded-lg border border-border bg-card p-5"
        >
          <AuthOptions locale={locale} />

          <div className="space-y-4">
            <div>
              <h1 className="text-md font-semibold tracking-tight">{copy.createTitle}</h1>
              <p className="mt-0.5 text-2xs text-muted-foreground">
                {copy.trialDescription}
              </p>
            </div>

            <Field label={copy.yourName} htmlFor="setup-name" error={errors.name}>
              <Input
                id="setup-name"
                value={values.name}
                onChange={(e) => set("name", e.target.value)}
                maxLength={120}
                autoComplete="name"
                autoFocus
              />
            </Field>

            <Field label={copy.email} htmlFor="setup-email" required error={errors.email}>
              <Input
                id="setup-email"
                type="email"
                value={values.email}
                onChange={(e) => set("email", e.target.value)}
                autoComplete="email"
              />
            </Field>

            <Field
              label={copy.password}
              htmlFor="setup-password"
              required
              error={errors.password}
              hint={copy.passwordHint}
            >
              <Input
                id="setup-password"
                type="password"
                value={values.password}
                onChange={(e) => set("password", e.target.value)}
                autoComplete="new-password"
              />
            </Field>
          </div>

          {error ? (
            <p
              className="rounded-md border border-neg/30 bg-neg-soft px-3 py-2 text-xs text-neg"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            {copy.createAccount}
          </Button>
        </form>

        <p className="mt-4 text-center text-2xs leading-relaxed text-muted-foreground">
          {copy.alreadyAccount}{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            {copy.logIn}
          </Link>
        </p>
      </div>
    </div>
  );
}
