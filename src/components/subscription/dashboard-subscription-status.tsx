import Link from "next/link";
import { ArrowRight, CheckCircle2, Clock3, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { planOf, trialState } from "@/lib/plans";
import type { Subscription } from "@/lib/types";

/** Account status belongs in the cockpit, where owners begin their day. */
export function DashboardSubscriptionStatus({
  subscription,
  today,
}: {
  subscription: Subscription;
  today: string;
}) {
  const plan = planOf(subscription);
  const trial = trialState(subscription, today);

  if (trial) {
    const timeLabel = trial.expired
      ? "Trial ended"
      : trial.daysRemaining === 0
        ? "Ends today"
        : `${trial.daysRemaining} ${trial.daysRemaining === 1 ? "day" : "days"} left`;

    return (
      <Card className="overflow-hidden border-primary/30 bg-primary/5">
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3 sm:items-center">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Clock3 className="size-5" aria-hidden />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold">Your OnRoad Pro trial</p>
                <Badge variant="info">{timeLabel}</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                You have every Pro tool for one truck during the 7-day trial.
              </p>
            </div>
          </div>
          <Button asChild size="sm" className="shrink-0">
            <Link href="/plans">
              Keep OnRoad Pro
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </Card>
    );
  }

  const active = subscription.status === "ACTIVE";
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3 sm:items-center">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-pos-soft text-pos">
            {active ? (
              <CheckCircle2 className="size-5" aria-hidden />
            ) : (
              <Sparkles className="size-5" aria-hidden />
            )}
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold">{plan.name}</p>
              <Badge variant={active ? "positive" : "warning"}>
                {active ? "Active" : subscription.status.replace("_", " ")}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {plan.id === "OWNER"
                ? "Your Pro subscription is active for one truck."
                : plan.id === "FLEET"
                  ? `Your paid Fleet workspace covers up to ${plan.truckLimit} trucks.`
                  : "Your one-truck ledger plan is active."}
            </p>
          </div>
        </div>
        <Button asChild size="sm" variant="outline" className="shrink-0">
          <Link href="/plans">
            {plan.id === "SOLO" ? "Upgrade to Pro" : "View plan"}
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      </div>
    </Card>
  );
}
