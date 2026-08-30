import type { ReactNode } from "react";
import { BarChart3, CheckCircle2, Gauge, Receipt, Route } from "lucide-react";

const STEPS = [
  {
    icon: Route,
    number: "01",
    title: "Log your first load",
    description: "Add the route, miles and gross rate. It only takes a minute.",
  },
  {
    icon: Receipt,
    number: "02",
    title: "Track what it cost",
    description: "Fuel, tolls and operating expenses turn revenue into a real profit number.",
  },
  {
    icon: Gauge,
    number: "03",
    title: "Know what you kept",
    description: "Cost per mile, reserves and safe owner pay calculate automatically.",
  },
] as const;

export function EmptyCockpit({
  businessName,
  loadAction,
  expenseAction,
}: {
  businessName: string;
  loadAction: ReactNode;
  expenseAction: ReactNode;
}) {
  return (
    <section
      className="relative isolate overflow-hidden rounded-xl border border-border bg-card"
      aria-labelledby="empty-cockpit-title"
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-52 bg-[radial-gradient(circle_at_18%_0%,hsl(var(--primary)/0.14),transparent_48%),radial-gradient(circle_at_82%_0%,hsl(var(--info)/0.10),transparent_45%)]"
        aria-hidden
      />

      <div className="px-5 py-8 sm:px-8 sm:py-10 lg:px-10">
        <div className="max-w-2xl">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-2xs font-semibold uppercase tracking-[0.12em] text-primary">
            <BarChart3 className="size-3.5" />
            Fresh workspace
          </span>
          <h2
            id="empty-cockpit-title"
            className="mt-4 max-w-xl text-2xl font-semibold tracking-tight sm:text-3xl"
          >
            Your numbers start with the first load.
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
            {businessName} is ready. Add real activity and this page will become your financial
            cockpit—not a wall of meaningless zeroes.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-2">
            {loadAction}
            {expenseAction}
          </div>
        </div>

        <div className="mt-9 grid gap-3 md:grid-cols-3">
          {STEPS.map((step) => {
            const Icon = step.icon;
            return (
              <div
                key={step.number}
                className="rounded-lg border border-border/80 bg-background/65 p-4 backdrop-blur-sm"
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
          This workspace is private to your account. Demo records are never mixed into your books.
        </p>
      </div>
    </section>
  );
}
