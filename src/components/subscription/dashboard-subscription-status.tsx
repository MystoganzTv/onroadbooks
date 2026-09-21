import Link from "next/link";
import { AlertTriangle, ArrowRight, Clock3, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { planOf, trialState } from "@/lib/plans";
import type { Subscription } from "@/lib/types";
import type { AppLocale } from "@/lib/i18n";
import { getWebDictionary, interpolate } from "@/lib/i18n/dictionaries";

/** Active subscriptions stay in Settings; the dashboard only shows billing notices. */
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
  if (subscription.status === "ACTIVE") return null;

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

  const pastDue = subscription.status === "PAST_DUE";
  const message = pastDue ? copy.paymentAttention : copy.subscriptionEnded;
  const actionLabel = pastDue ? copy.fixBilling : copy.chooseAPlan;

  return (
    <Card className={pastDue ? "overflow-hidden border-warn/40 bg-warn-soft" : "overflow-hidden"}>
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3 sm:items-center">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-warn-soft text-warn">
            {pastDue ? (
              <AlertTriangle className="size-5" aria-hidden />
            ) : (
              <Sparkles className="size-5" aria-hidden />
            )}
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold">{plan.name}</p>
              <Badge variant="warning">
                {pastDue ? copy.pastDue : copy.canceled}
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
