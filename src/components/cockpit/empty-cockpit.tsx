"use client";

import type { ReactNode } from "react";
import { BarChart3, CheckCircle2, Gauge, Receipt, Route } from "lucide-react";

import { useLanguage } from "@/components/shell/language-provider";
import { interpolate } from "@/lib/i18n/dictionaries";

export function EmptyCockpit({
  businessName,
  loadAction,
  expenseAction,
}: {
  businessName: string;
  loadAction: ReactNode;
  expenseAction: ReactNode;
}) {
  const { dictionary } = useLanguage();
  const copy = dictionary.dashboard;
  const steps = [
    { icon: Route, number: "01", title: copy.firstLoadStep, description: copy.firstLoadStepDescription },
    { icon: Receipt, number: "02", title: copy.trackCostStep, description: copy.trackCostStepDescription },
    { icon: Gauge, number: "03", title: copy.knowKeptStep, description: copy.knowKeptStepDescription },
  ] as const;

  return (
    <section
      className="overflow-hidden rounded-xl border border-border bg-card"
      aria-labelledby="empty-cockpit-title"
    >
      <div className="bg-[radial-gradient(circle_at_12%_0%,hsl(var(--primary)/0.14),transparent_38%),radial-gradient(circle_at_88%_0%,hsl(var(--info)/0.08),transparent_34%)] px-5 py-8 sm:px-8 sm:py-10 lg:px-10">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-[0.14em] text-primary">
              <BarChart3 className="size-3.5" />
              {copy.gettingStarted}
            </span>
            <h2
              id="empty-cockpit-title"
              className="mt-3 max-w-2xl text-2xl font-semibold tracking-tight sm:text-3xl"
            >
              {copy.firstLoadOverview}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {interpolate(copy.workspaceReady, { business: businessName })}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center lg:justify-end [&_button]:w-full sm:[&_button]:w-auto">
            {loadAction}
            {expenseAction}
          </div>
        </div>

        <div className="mt-8 grid gap-3 border-t border-border/70 pt-6 md:grid-cols-3">
          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <div
                key={step.number}
                className="rounded-lg border border-border/80 bg-background/70 p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="flex size-8 items-center justify-center rounded-md border border-border bg-surface-sunken text-primary">
                    <Icon className="size-4" />
                  </span>
                  <span className="text-2xs font-semibold tnum tracking-[0.14em] text-muted-foreground/60">
                    {step.number}
                  </span>
                </div>
                <h3 className="mt-4 text-sm font-semibold">{step.title}</h3>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {step.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-start gap-2 border-t border-border bg-surface-sunken/45 px-5 py-3 text-xs text-muted-foreground sm:px-8 lg:px-10">
        <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-pos" />
        <p>
          {copy.privateWorkspace}
        </p>
      </div>
    </section>
  );
}
