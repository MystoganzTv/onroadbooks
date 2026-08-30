"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, CreditCard, Loader2, Sparkles, Truck } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { changePlanAction } from "@/lib/actions/subscription";
import {
  PLANS,
  evaluatePlanChange,
  hasFleetAccess,
  planOf,
  trialState,
} from "@/lib/plans";
import type { PlanId, Subscription } from "@/lib/types";
import { cn } from "@/lib/utils";

const SUPPORT_EMAIL = "enrique.padron853@gmail.com";
const ONE_TRUCK_PLANS: PlanId[] = ["SOLO", "OWNER"];

const STATUS_COPY: Record<
  Subscription["status"],
  { label: string; tone: "positive" | "warning" | "info" | "outline" }
> = {
  TRIALING: { label: "Trial", tone: "info" },
  ACTIVE: { label: "Active", tone: "positive" },
  PAST_DUE: { label: "Past due", tone: "warning" },
  CANCELED: { label: "Canceled", tone: "outline" },
};

function activationEmail(service: string): string {
  const subject = encodeURIComponent(`Activate ${service}`);
  const body = encodeURIComponent(
    `Hi, I would like to activate ${service} for my OnRoad Books account.`,
  );
  return `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
}

interface OneTruckPlanProps {
  id: PlanId;
  subscription: Subscription;
  activeTruckCount: number;
  pending: boolean;
  onChange: (plan: PlanId) => void;
}

function OneTruckPlan({
  id,
  subscription,
  activeTruckCount,
  pending,
  onChange,
}: OneTruckPlanProps) {
  const plan = PLANS[id];
  const current = planOf(subscription);
  const isCurrent = current.id === id;
  const decision = evaluatePlanChange(subscription, id, activeTruckCount);
  const requiresActivation = id === "OWNER" && decision.direction === "upgrade";

  return (
    <div
      id={id === "OWNER" ? "plan-pro" : undefined}
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
      <p className="mt-1 text-2xs font-medium text-foreground">One truck</p>
      <p className="mt-0.5 text-2xs text-muted-foreground">{plan.tagline}</p>

      <ul className="mt-2.5 space-y-1">
        {plan.features.slice(0, 4).map((feature) => (
          <li key={feature} className="flex items-start gap-1.5 text-2xs text-muted-foreground">
            <Check className="mt-0.5 size-3 shrink-0 text-pos" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      {!isCurrent ? (
        <>
          {requiresActivation ? (
            <Button asChild type="button" size="sm" className="mt-3 w-full">
              <a href={activationEmail("OnRoad Pro")}>Upgrade to OnRoad Pro</a>
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-3 w-full"
              disabled={pending || !decision.allowed}
              onClick={() => onChange(id)}
            >
              {pending ? <Loader2 className="animate-spin" /> : null}
              Go back to {plan.name}
            </Button>
          )}
          {decision.reason ? (
            <p className="mt-1.5 text-2xs leading-relaxed text-warn">{decision.reason}</p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/** Plan conversion stays visible while Fleet remains a genuinely separate service. */
export function PlanCard({
  subscription,
  activeTruckCount,
  today,
}: {
  subscription: Subscription;
  activeTruckCount: number;
  today: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const current = planOf(subscription);
  const status = STATUS_COPY[subscription.status];
  const trial = current.id === "OWNER" ? trialState(subscription, today) : null;
  const fleet = PLANS.FLEET;
  const fleetActive = hasFleetAccess(subscription);

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
    <Card id="plan" className="scroll-mt-20">
      <CardHeader>
        <div className="flex items-center gap-2">
          <CreditCard className="size-3.5 text-muted-foreground" />
          <CardTitle>Plan &amp; billing</CardTitle>
        </div>
        <Badge variant={status.tone}>{status.label}</Badge>
      </CardHeader>

      <CardContent className="space-y-4 p-4">
        {trial ? (
          <div className="rounded-lg border border-primary/30 bg-primary/10 p-3.5">
            <div className="flex items-start gap-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Sparkles className="size-4" aria-hidden />
              </span>
              <div>
                <p className="text-sm font-semibold">Your 7-day OnRoad Pro trial</p>
                <p className="mt-0.5 text-2xs leading-relaxed text-muted-foreground">
                  {trial.expired
                    ? "Your trial has ended."
                    : trial.daysRemaining === 0
                      ? "Your trial ends today."
                      : `${trial.daysRemaining} ${trial.daysRemaining === 1 ? "day" : "days"} left.`}{" "}
                  Keep Pro for one truck at ${PLANS.OWNER.priceMonthly}/month.
                </p>
              </div>
            </div>
            <Button asChild size="sm" className="mt-3 w-full">
              <a href={activationEmail("OnRoad Pro")}>Activate OnRoad Pro</a>
            </Button>
          </div>
        ) : null}

        <section aria-labelledby="one-truck-plans">
          <div className="mb-2.5">
            <h4 id="one-truck-plans" className="text-xs font-semibold">
              One-truck plans
            </h4>
            <p className="mt-0.5 text-2xs text-muted-foreground">
              Your account stays centered on one truck. Fleet tools do not appear here.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {ONE_TRUCK_PLANS.map((id) => (
              <OneTruckPlan
                key={id}
                id={id}
                subscription={subscription}
                activeTruckCount={activeTruckCount}
                pending={pending}
                onChange={change}
              />
            ))}
          </div>
        </section>

        <section aria-labelledby="fleet-service" className="border-t border-border pt-4">
          <div className="mb-2.5 flex items-start gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-surface-sunken text-muted-foreground">
              <Truck className="size-4" aria-hidden />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h4 id="fleet-service" className="text-xs font-semibold">
                  Separate Fleet service
                </h4>
                <Badge variant={fleetActive ? "positive" : "outline"}>
                  {fleetActive ? "Active" : "Paid add-on"}
                </Badge>
              </div>
              <p className="mt-0.5 text-2xs leading-relaxed text-muted-foreground">
                Fleet is only for businesses paying to manage multiple trucks. Its navigation,
                truck switcher and reports stay hidden until Fleet is activated.
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-dashed border-border p-3.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-semibold">{fleet.name}</span>
              <span className="tnum text-sm font-semibold">
                ${fleet.priceMonthly}
                <span className="text-2xs font-normal text-muted-foreground"> / month</span>
              </span>
            </div>
            <p className="mt-1 text-2xs text-muted-foreground">
              Up to {fleet.truckLimit} trucks with separate economics for every unit.
            </p>
            {!fleetActive ? (
              <Button asChild type="button" size="sm" variant="outline" className="mt-3 w-full">
                <a href={activationEmail("OnRoad Fleet")}>Request Fleet access</a>
              </Button>
            ) : null}
          </div>
        </section>

        <p className="text-2xs leading-relaxed text-muted-foreground">
          Online checkout is not connected yet, so activation requests open an email and no card
          is charged automatically. Your books remain yours if a subscription lapses: reading and
          exporting stay open while writing closes.{" "}
          <Link href="/welcome" className="text-primary underline-offset-2 hover:underline">
            Run through setup again
          </Link>
          .
        </p>
      </CardContent>
    </Card>
  );
}
