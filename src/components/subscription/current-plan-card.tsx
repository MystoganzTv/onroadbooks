import Link from "next/link";
import { ArrowRight, CreditCard } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { planOf, trialState } from "@/lib/plans";
import type { Subscription } from "@/lib/types";

/** A settings summary, deliberately not a plan selector. */
export function CurrentPlanCard({
  subscription,
  today,
}: {
  subscription: Subscription;
  today: string;
}) {
  const plan = planOf(subscription);
  const trial = trialState(subscription, today);
  const isProTrial = plan.id === "OWNER" && trial;
  const statusLabel =
    subscription.status === "ACTIVE"
      ? "Active"
      : subscription.status === "TRIALING"
        ? "Trial"
        : subscription.status === "PAST_DUE"
          ? "Past due"
          : "Canceled";
  const statusTone =
    subscription.status === "ACTIVE"
      ? "positive"
      : subscription.status === "TRIALING"
        ? "info"
        : subscription.status === "PAST_DUE"
          ? "warning"
          : "outline";
  const actionLabel = isProTrial
    ? "Keep OnRoad Pro"
    : subscription.status === "PAST_DUE"
      ? "Fix billing"
      : subscription.status === "CANCELED"
        ? "Choose a plan"
        : plan.id === "SOLO"
          ? "Upgrade to Pro"
          : "View plans & billing";
  const statusMessage = trial
    ? trial.expired
      ? "Your trial has ended. Choose a monthly plan to keep using paid tools."
      : trial.daysRemaining === 0
        ? "Your free trial ends today."
        : `${trial.daysRemaining} ${trial.daysRemaining === 1 ? "day" : "days"} left in your free trial.`
    : subscription.status === "PAST_DUE"
      ? "Your payment needs attention. Reading and exporting stay open while new entries are paused."
      : subscription.status === "CANCELED"
        ? "Your subscription has ended. Your existing books remain available to read and export."
        : plan.id === "FLEET"
          ? `Paid Fleet service for up to ${plan.truckLimit} trucks.`
          : "Your current monthly plan for one truck.";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CreditCard className="size-3.5 text-muted-foreground" />
          <CardTitle>Subscription</CardTitle>
        </div>
        <Badge variant={statusTone}>{statusLabel}</Badge>
      </CardHeader>
      <CardContent className="space-y-3 p-4">
        <div>
          <p className="text-sm font-semibold">{plan.name}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {statusMessage}
          </p>
        </div>
        <Button asChild className="w-full" size="sm">
          <Link href="/plans">
            {actionLabel}
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
