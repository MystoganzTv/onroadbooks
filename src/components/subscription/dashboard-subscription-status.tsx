import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { planOf, trialState } from "@/lib/plans";
import type { Subscription } from "@/lib/types";
import type { AppLocale } from "@/lib/i18n";
import { getWebDictionary, interpolate } from "@/lib/i18n/dictionaries";

/** Account status belongs in the cockpit, where owners begin their day. */
export function DashboardSubscriptionStatus({
  subscription,
  today,
  canManage = true,
  locale = "en",
}: {
  subscription: Subscription;
  today: string;
  canManage?: boolean;
  locale?: AppLocale;
}) {
  const copy = getWebDictionary(locale).plans;
  const plan = planOf(subscription);
  const trial = trialState(subscription, today);

  if (trial) {
    const timeLabel = trial.expired
      ? copy.trialEnded
      : trial.daysRemaining === 0
        ? copy.trialEndsToday
        : interpolate(copy.trialDays, { count: trial.daysRemaining, unit: trial.daysRemaining === 1 ? copy.day : copy.days });

    return (
      <Card className="overflow-hidden border-primary/30 bg-primary/5">
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3 sm:items-center">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Clock3 className="size-5" aria-hidden />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold">{copy.trialTitle}</p>
                <Badge variant="info">{timeLabel}</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {copy.trialTools}
              </p>
            </div>
          </div>
          {canManage ? (
            <Button asChild size="sm" className="shrink-0">
              <Link href="/plans">
                {copy.keepPro}
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          ) : null}
        </div>
      </Card>
    );
  }

  const active = subscription.status === "ACTIVE";
  const pastDue = subscription.status === "PAST_DUE";
  const canceled = subscription.status === "CANCELED";
  const message = pastDue
    ? copy.paymentAttention
    : canceled
      ? copy.subscriptionEnded
      : plan.id === "OWNER"
        ? copy.currentOneTruck
        : plan.id === "FLEET"
          ? interpolate(copy.fleetService, { count: plan.truckLimit })
          : copy.oneTruck;
  const actionLabel = pastDue
    ? copy.fixBilling
    : canceled
      ? copy.chooseAPlan
      : plan.id === "SOLO"
        ? copy.upgradePro
        : copy.manageBilling;

  return (
    <Card className={pastDue ? "overflow-hidden border-warn/40 bg-warn-soft" : "overflow-hidden"}>
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3 sm:items-center">
          <span
            className={`flex size-10 shrink-0 items-center justify-center rounded-full ${
              active ? "bg-pos-soft text-pos" : "bg-warn-soft text-warn"
            }`}
          >
            {active ? (
              <CheckCircle2 className="size-5" aria-hidden />
            ) : pastDue ? (
              <AlertTriangle className="size-5" aria-hidden />
            ) : (
              <Sparkles className="size-5" aria-hidden />
            )}
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold">{plan.name}</p>
              <Badge variant={active ? "positive" : "warning"}>
                {active ? copy.active : pastDue ? copy.pastDue : copy.canceled}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {message}
            </p>
          </div>
        </div>
        {canManage ? (
          <Button asChild size="sm" variant="outline" className="shrink-0">
            <Link href="/plans">
              {actionLabel}
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
