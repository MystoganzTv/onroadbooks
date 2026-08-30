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
import { APP_NAME } from "@/lib/utils";

/**
 * Sign in, or create the owner account on first run. One component because
 * the two differ only by which fields are collected.
 */
export function AuthCard({
  mode,
  initialError = null,
}: {
  mode: "login" | "setup";
  initialError?: string | null;
}) {
  const router = useRouter();
  const isSetup = mode === "setup";

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
        setError(data?.error ?? "Something went wrong. Try again.");
        return;
      }

      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("Could not reach the server. Check that it is running.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
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
            {isSetup ? "Set up your account" : "Sign in to your books"}
          </p>
        </div>

        <form
          onSubmit={submit}
          noValidate
          className="space-y-4 rounded-lg border border-border bg-card p-5"
        >
          <AuthOptions showDemo={!isSetup} />

          {isSetup ? (
            <>
              <Field label="Business name" htmlFor="auth-business" required>
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
              <Field label="Your name" htmlFor="auth-name">
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

          <Field label="Email" htmlFor="auth-email" required>
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
            label="Password"
            htmlFor="auth-password"
            required
            hint={isSetup ? "At least 10 characters" : undefined}
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

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            {isSetup ? "Create account" : "Sign in"}
          </Button>
        </form>

        <p className="mt-4 text-center text-2xs leading-relaxed text-muted-foreground">
          {isSetup ? "Already have an account?" : "New to OnRoad Books?"}{" "}
          <Link
            href={isSetup ? "/login" : "/setup"}
            className="font-medium text-primary hover:underline"
          >
            {isSetup ? "Log in" : "Create an account"}
          </Link>
        </p>
      </div>
    </div>
  );
}
