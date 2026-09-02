"use client";

import Link from "next/link";
import { ArrowRight, CreditCard } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/components/shell/language-provider";
import { planOf, trialState } from "@/lib/plans";
import type { Subscription } from "@/lib/types";

/** A settings summary, deliberately not a plan selector. */
export function CurrentPlanCard({
  subscription,
  today,
  canManage = true,
}: {
  subscription: Subscription;
  today: string;
  canManage?: boolean;
}) {
  const { dictionary } = useLanguage();
  const copy = dictionary.plans;
  const plan = planOf(subscription);
  const trial = trialState(subscription, today);
  const isProTrial = plan.id === "OWNER" && trial;
  const statusLabel =
    subscription.status === "ACTIVE"
      ? copy.active
      : subscription.status === "TRIALING"
        ? copy.trial
        : subscription.status === "PAST_DUE"
          ? copy.pastDue
          : copy.canceled;
  const statusTone =
    subscription.status === "ACTIVE"
      ? "positive"
      : subscription.status === "TRIALING"
        ? "info"
        : subscription.status === "PAST_DUE"
          ? "warning"
          : "outline";
  const actionLabel = isProTrial
    ? copy.keepCurrentPro
    : subscription.status === "PAST_DUE"
      ? copy.fixBilling
      : subscription.status === "CANCELED"
        ? copy.chooseAPlan
        : plan.id === "SOLO"
          ? copy.upgradePro
          : copy.viewPlans;
  const statusMessage = trial
    ? trial.expired
      ? copy.trialEndedLong
      : trial.daysRemaining === 0
        ? copy.trialEndsTodayLong
        : copy.trialRemaining
            .replace("{count}", String(trial.daysRemaining))
            .replace("{unit}", trial.daysRemaining === 1 ? copy.day : copy.days)
    : subscription.status === "PAST_DUE"
      ? copy.paymentAttention
      : subscription.status === "CANCELED"
        ? copy.subscriptionEnded
        : plan.id === "FLEET"
          ? copy.fleetService.replace("{count}", String(plan.truckLimit))
          : copy.currentOneTruck;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CreditCard className="size-3.5 text-muted-foreground" />
          <CardTitle>{copy.subscription}</CardTitle>
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
        {canManage ? (
          <Button asChild className="w-full" size="sm">
            <Link href="/plans">
              {actionLabel}
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">{copy.ownerManageOnly}</p>
        )}
      </CardContent>
    </Card>
  );
}
