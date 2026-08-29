"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Check, Loader2 } from "lucide-react";

import { BrandLogo } from "@/components/shell/brand-logo";

import { Field } from "@/components/shared/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PLANS, PLAN_IDS } from "@/lib/plans";
import { setupSchema } from "@/lib/schemas";
import type { PlanId } from "@/lib/types";
import { APP_NAME, cn } from "@/lib/utils";
import { fieldErrors, validationMessage } from "@/lib/form";

const FIELD_LABELS: Record<string, string> = {
  businessName: "Business name",
  name: "Your name",
  email: "Email",
  password: "Password",
};

/**
 * Creating the owner account.
 *
 * Two questions on one screen rather than a wizard: who you are, and how many
 * trucks you run. The second one decides which version of the product you
 * get, and it is asked here because asking later means every screen has to
 * decide for itself whether to show the fleet features.
 *
 * The rest of the setup -- the truck, the reserve percentages, the targets --
 * happens after the account exists, at /welcome, where the normal server
 * actions can be used and every step is skippable.
 */
export function SetupFlow() {
  const router = useRouter();

  const [values, setValues] = React.useState({
    businessName: "",
    name: "",
    email: "",
    password: "",
  });
  const [plan, setPlan] = React.useState<PlanId>("INDIVIDUAL");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const set = (key: keyof typeof values, value: string) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const payload = { ...values, name: values.name || null, plan };

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
      <div className="w-full max-w-3xl">
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

        <form onSubmit={submit} noValidate className="grid gap-4 lg:grid-cols-[1fr_1.15fr]">
          <div className="space-y-4 rounded-lg border border-border bg-card p-5">
            <div>
              <h1 className="text-md font-semibold tracking-tight">Create your account</h1>
              <p className="mt-0.5 text-2xs text-muted-foreground">
                This is the owner account for this installation.
              </p>
            </div>

            <Field label="Business name" htmlFor="setup-business" required error={errors.businessName}>
              <Input
                id="setup-business"
                value={values.businessName}
                onChange={(e) => set("businessName", e.target.value)}
                placeholder="Padron Freight LLC"
                maxLength={120}
                autoFocus
              />
            </Field>

            <Field label="Your name" htmlFor="setup-name" error={errors.name}>
              <Input
                id="setup-name"
                value={values.name}
                onChange={(e) => set("name", e.target.value)}
                maxLength={120}
                autoComplete="name"
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

          <div className="space-y-4">
            <div>
              <h2 className="text-md font-semibold tracking-tight">How many trucks?</h2>
              <p className="mt-0.5 text-2xs text-muted-foreground">
                You can move up later without losing anything.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {PLAN_IDS.map((id) => {
                const option = PLANS[id];
                const selected = plan === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setPlan(id)}
                    aria-pressed={selected}
                    className={cn(
                      "rounded-lg border p-4 text-left transition-colors focus-ring",
                      selected
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border bg-card hover:border-primary/40",
                    )}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-semibold">{option.name}</span>
                      {selected ? <Check className="size-4 shrink-0 text-primary" /> : null}
                    </div>
                    <p className="mt-1 tnum text-2xl font-semibold tracking-tight">
                      ${option.priceMonthly}
                      <span className="text-2xs font-normal text-muted-foreground"> / month</span>
                    </p>
                    <p className="mt-1 text-2xs text-muted-foreground">{option.tagline}</p>
                    <ul className="mt-3 space-y-1">
                      {option.features.map((feature) => (
                        <li
                          key={feature}
                          className="flex items-start gap-1.5 text-2xs text-muted-foreground"
                        >
                          <Check className="mt-0.5 size-3 shrink-0 text-pos" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </button>
                );
              })}
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

            <p className="text-2xs leading-relaxed text-muted-foreground">
              Nothing is charged yet — there is no payment set up on this installation. The demo
              data already in the app stays, so you can look around straight away.
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
