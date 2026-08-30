import Link from "next/link";
import { Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cheapestPlanWith, type PlanCapability } from "@/lib/plans";

/**
 * What a screen shows when the plan does not cover it.
 *
 * It is a panel, not a redirect: the owner should see what the tool is for and
 * what it would cost, on the page they went looking for it. The gate itself is
 * not here -- pages check `planAllows` and actions go through
 * `repositoryWith`, because a component is presentation, not a rule.
 *
 * No alarm colours. A plan boundary is not a financial loss.
 */
export function PlanGate({
  capability,
  what,
}: {
  capability: PlanCapability;
  /** One line: what this screen would do for them. */
  what: string;
}) {
  const plan = cheapestPlanWith(capability);

  return (
    <Card className="mx-auto max-w-2xl">
      <CardContent className="space-y-5 p-6 sm:p-8">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-muted-foreground">
            <Lock className="size-4" aria-hidden />
          </span>
          <div className="space-y-1">
            <h2 className="text-base font-semibold">Part of {plan.name}</h2>
            <p className="text-sm text-muted-foreground">{what}</p>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface-sunken/60 p-4">
          <p className="text-sm font-medium">
            {plan.name} — ${plan.priceMonthly}
            <span className="font-normal text-muted-foreground">/month</span>
          </p>
          <ul className="mt-3 space-y-1.5">
            {plan.features.map((feature) => (
              <li key={feature} className="flex gap-2 text-sm text-muted-foreground">
                <span aria-hidden className="text-muted-foreground/60">
                  •
                </span>
                {feature}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button asChild>
            <Link href="/settings#plan">Change plan</Link>
          </Button>
          <p className="text-xs text-muted-foreground">
            Your books stay exactly as they are, on any plan.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
