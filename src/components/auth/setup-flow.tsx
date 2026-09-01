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

const FIELD_LABELS: Record<string, string> = {
  name: "Your name",
  email: "Email",
  password: "Password",
};

/**
 * Creating the owner account.
 *
 * This screen only creates the owner's credentials. Product setup belongs in
 * the welcome flow, and plan pricing belongs on the public pricing page or in
 * settings -- neither should make account creation feel like a checkout.
 */
export function SetupFlow() {
  const router = useRouter();

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
      setError(validationMessage(next, FIELD_LABELS));
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
        setError(data?.error ?? "Something went wrong. Try again.");
        return;
      }

      router.replace("/welcome");
      router.refresh();
    } catch {
      setError("Could not reach the server. Check that it is running.");
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
            Back to {APP_NAME}
          </Link>
          <BrandLogo className="w-40" priority />
          <p className="mt-2 text-2xs text-muted-foreground">
            Drive the truck. Know the business.
          </p>
        </div>

        <form
          onSubmit={submit}
          noValidate
          className="space-y-4 rounded-lg border border-border bg-card p-5"
        >
          <AuthOptions />

          <div className="space-y-4">
            <div>
              <h1 className="text-md font-semibold tracking-tight">Create your account</h1>
              <p className="mt-0.5 text-2xs text-muted-foreground">
                Start your 7-day OnRoad Pro trial for one truck. No card required.
              </p>
            </div>

            <Field label="Your name" htmlFor="setup-name" error={errors.name}>
              <Input
                id="setup-name"
                value={values.name}
                onChange={(e) => set("name", e.target.value)}
                maxLength={120}
                autoComplete="name"
                autoFocus
              />
            </Field>

            <Field label="Email" htmlFor="setup-email" required error={errors.email}>
              <Input
                id="setup-email"
                type="email"
                value={values.email}
                onChange={(e) => set("email", e.target.value)}
                autoComplete="email"
              />
            </Field>

            <Field
              label="Password"
              htmlFor="setup-password"
              required
              error={errors.password}
              hint="At least 10 characters"
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
            Create account
          </Button>
        </form>

        <p className="mt-4 text-center text-2xs leading-relaxed text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
