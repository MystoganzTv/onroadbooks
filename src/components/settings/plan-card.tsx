"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, CreditCard, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { changePlanAction } from "@/lib/actions/subscription";
import { PLANS, PLAN_IDS, evaluatePlanChange, planOf } from "@/lib/plans";
import type { PlanId, Subscription } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATUS_COPY: Record<Subscription["status"], { label: string; tone: "positive" | "warning" | "info" | "outline" }> = {
  TRIALING: { label: "Trial", tone: "info" },
  ACTIVE: { label: "Active", tone: "positive" },
  PAST_DUE: { label: "Past due", tone: "warning" },
  CANCELED: { label: "Canceled", tone: "outline" },
};

/**
 * The plan, and moving between plans.
 *
 * The button is disabled when the change is not allowed, but the refusal is
 * decided again on the server: the limit is a rule about the data, not a
 * state of this component.
 */
export function PlanCard({
  subscription,
  activeTruckCount,
}: {
  subscription: Subscription;
  activeTruckCount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const current = planOf(subscription);
  const status = STATUS_COPY[subscription.status];

  function change(plan: PlanId) {
    startTransition(async () => {
      const result = await changePlanAction({ plan });
      if (result.ok) {
        toast.success(`Switched to ${PLANS[plan].name}`);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CreditCard className="size-3.5 text-muted-foreground" />
          <CardTitle>Plan</CardTitle>
        </div>
        <Badge variant={status.tone}>{status.label}</Badge>
      </CardHeader>

      <CardContent className="space-y-3 p-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {PLAN_IDS.map((id) => {
            const plan = PLANS[id];
            const isCurrent = current.id === id;
            const decision = evaluatePlanChange(subscription, id, activeTruckCount);

            return (
              <div
                key={id}
                className={cn(
                  "rounded-lg border p-3.5",
                  isCurrent ? "border-primary bg-primary/5" : "border-border",
                )}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold">{plan.name}</span>
                  {isCurrent ? (
                    <span className="text-2xs font-medium uppercase tracking-wide text-primary">
                      Current
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 tnum text-xl font-semibold tracking-tight">
                  ${plan.priceMonthly}
                  <span className="text-2xs font-normal text-muted-foreground"> / month</span>
                </p>
                <p className="mt-1 text-2xs text-muted-foreground">
                  {plan.truckLimit === 1 ? "One truck" : `Up to ${plan.truckLimit} trucks`}
                </p>

                <ul className="mt-2.5 space-y-1">
                  {plan.features.slice(0, 4).map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-1.5 text-2xs text-muted-foreground"
                    >
                      <Check className="mt-0.5 size-3 shrink-0 text-pos" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                {!isCurrent ? (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      variant={decision.direction === "upgrade" ? "default" : "outline"}
                      className="mt-3 w-full"
                      disabled={pending || !decision.allowed}
                      onClick={() => change(id)}
                    >
                      {pending ? <Loader2 className="animate-spin" /> : null}
                      {decision.direction === "upgrade"
                        ? `Move to ${plan.name}`
                        : `Go back to ${plan.name}`}
                    </Button>
                    {decision.reason ? (
                      <p className="mt-1.5 text-2xs leading-relaxed text-warn">
                        {decision.reason}
                      </p>
                    ) : null}
                  </>
                ) : null}
              </div>
            );
          })}
        </div>

        <p className="text-2xs leading-relaxed text-muted-foreground">
          No payment is set up on this installation, so switching plans is free and immediate.
          Your books are yours either way: if a subscription ever lapses, reading and exporting
          stay open and only writing closes.{" "}
          <Link href="/welcome" className="text-primary underline-offset-2 hover:underline">
            Run through setup again
          </Link>
          .
        </p>
      </CardContent>
    </Card>
  );
}
