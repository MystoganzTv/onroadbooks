import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface SectionProps {
  /** Short, uppercase. This is the spine of the cockpit's visual hierarchy. */
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * A band of the dashboard.
 *
 * The cockpit is read top to bottom in named zones -- money, health, flow,
 * loads, intelligence, reserves -- rather than as a grid of interchangeable
 * cards. The rule and the label are what make the zones legible at a glance.
 */
export function Section({ title, description, actions, children, className }: SectionProps) {
  return (
    <section className={cn("space-y-2.5", className)} aria-label={title}>
      <div className="flex items-end justify-between gap-3 border-b border-border/70 pb-1.5">
        <div className="min-w-0">
          <h2 className="text-2xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {title}
          </h2>
          {description ? (
            <p className="mt-0.5 truncate text-2xs text-muted-foreground/80">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}
