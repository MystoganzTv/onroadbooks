"use client";

import type { ComponentType, ReactNode } from "react";
import { useFormStatus } from "react-dom";
import {
  BookOpen,
  Check,
  CreditCard,
  Gauge,
  Loader2,
  Sparkles,
  Truck,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/components/shell/language-provider";
import {
  createCheckoutAction,
  openBillingPortalAction,
} from "@/lib/actions/billing";
import {
  PLANS,
  hasFleetAccess,
  planOf,
  trialState,
} from "@/lib/plans";
import type { Plan } from "@/lib/plans";
import type { PlanId, Subscription } from "@/lib/types";
import { cn } from "@/lib/utils";

const ONE_TRUCK_PLANS: PlanId[] = ["SOLO", "OWNER"];

/** SOLO is the book, OWNER is the cockpit, FLEET is the units -- see plans.ts. */
const PLAN_ICONS: Record<PlanId, ComponentType<{ className?: string; "aria-hidden"?: boolean }>> = {
  SOLO: BookOpen,
  OWNER: Gauge,
  FLEET: Truck,
};

function BillingSubmit({
  children,
  disabled = false,
  variant = "default",
}: {
  children: ReactNode;
  disabled?: boolean;
  variant?: "default" | "outline";
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="sm"
      variant={variant}
      className="w-full rounded-full"
      disabled={disabled || pending}
    >
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
      {children}
    </Button>
  );
}

function CheckoutForm({
  plan,
  children,
  disabled = false,
  variant = "default",
}: {
  plan: PlanId;
  children: ReactNode;
  disabled?: boolean;
  variant?: "default" | "outline";
}) {
  return (
    <form action={createCheckoutAction.bind(null, plan)}>
      <BillingSubmit disabled={disabled} variant={variant}>
        {children}
      </BillingSubmit>
    </form>
  );
}

function PortalForm({
  children = "Manage billing",
  variant = "outline",
}: {
  children?: ReactNode;
  variant?: "default" | "outline";
}) {
  return (
    <form action={openBillingPortalAction}>
      <BillingSubmit variant={variant}>{children}</BillingSubmit>
    </form>
  );
}

/**
 * One plan, presented the same way wherever it is offered. A slim accent bar
 * on top, a pill for what it covers and (when relevant) a pill for its
 * status, an icon tile, circled checkmarks, and a full-width pill CTA --
 * so a real, purchasable tier never looks like a lesser or disabled option
 * next to the others, and the current/active one reads as clearly ahead of
 * the rest rather than merely outlined.
 */
function PlanTile({
  anchorId,
  plan,
  truckLabel,
  highlighted,
  statusLabel,
  featureLimit = 4,
  action,
}: {
  anchorId?: string;
  plan: Plan;
  truckLabel: string;
  highlighted: boolean;
  statusLabel?: string;
  featureLimit?: number;
  action?: ReactNode;
}) {
  const { dictionary } = useLanguage();
  const copy = dictionary.plans;
  const Icon = PLAN_ICONS[plan.id];
  const localized = {
    SOLO: { tagline: copy.soloTagline, features: copy.soloFeatures.split("|"), note: null },
    OWNER: { tagline: copy.proTagline, features: copy.proFeatures.split("|"), note: null },
    FLEET: { tagline: copy.fleetTagline, features: copy.fleetFeatures.split("|"), note: copy.fleetNote },
  } as const;
  const planCopy = localized[plan.id];

  return (
    <div
      id={anchorId}
      className={cn(
        "relative overflow-hidden rounded-xl border pt-4",
        highlighted ? "border-primary bg-primary/[0.06]" : "border-border bg-card",
      )}
    >
      <div className={cn("absolute inset-x-0 top-0 h-1", highlighted ? "bg-primary" : "bg-border")} />

      <div className="px-4">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center rounded-full border border-border bg-surface-sunken px-2.5 py-0.5 text-2xs font-medium text-muted-foreground">
            {truckLabel}
          </span>
          {statusLabel ? (
            <span className="inline-flex items-center rounded-full bg-primary px-2.5 py-0.5 text-2xs font-semibold text-primary-foreground">
              {statusLabel}
            </span>
          ) : null}
        </div>

        <span
          className={cn(
            "mt-3 flex size-9 items-center justify-center rounded-lg",
            highlighted ? "bg-primary text-primary-foreground" : "bg-surface-sunken text-muted-foreground",
          )}
        >
          <Icon className="size-4.5" aria-hidden />
        </span>

        <p className="mt-3 text-sm font-semibold">{plan.name}</p>
        <p className="mt-1 tnum text-2xl font-bold tracking-tight">
          ${plan.priceMonthly}
          <span className="text-2xs font-normal text-muted-foreground"> {copy.perMonth}</span>
        </p>
        <p className="mt-1 text-2xs text-muted-foreground">{planCopy.tagline}</p>

        <ul className="mt-3 space-y-1.5">
          {planCopy.features.slice(0, featureLimit).map((feature) => (
            <li key={feature} className="flex items-start gap-2 text-2xs text-muted-foreground">
              <span
                className={cn(
                  "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full",
                  highlighted ? "bg-primary/15 text-primary" : "bg-pos-soft text-pos",
                )}
              >
                <Check className="size-2.5" aria-hidden />
              </span>
              <span>{feature}</span>
            </li>
          ))}
        </ul>

        {planCopy.note ? (
          <p className="mt-2.5 text-2xs italic leading-relaxed text-muted-foreground">{planCopy.note}</p>
        ) : null}
      </div>

      {action ? <div className="mt-4 px-4 pb-4">{action}</div> : <div className="pb-4" />}
    </div>
  );
}

interface OneTruckPlanProps {
  id: PlanId;
  subscription: Subscription;
  billingReady: boolean;
  managedBilling: boolean;
}

function OneTruckPlan({
  id,
  subscription,
  billingReady,
  managedBilling,
}: OneTruckPlanProps) {
  const { dictionary } = useLanguage();
  const copy = dictionary.plans;
  const plan = PLANS[id];
  const current = planOf(subscription);
  const isCurrent = current.id === id;
  const showAction = managedBilling ? !isCurrent : subscription.status !== "ACTIVE" || !isCurrent;

  return (
    <PlanTile
      anchorId={id === "OWNER" ? "plan-pro" : undefined}
      plan={plan}
      truckLabel={copy.oneTruck}
      highlighted={isCurrent}
      statusLabel={isCurrent ? copy.current : undefined}
      action={
        showAction ? (
          managedBilling ? (
            <PortalForm>{copy.changePortal}</PortalForm>
          ) : (
            <CheckoutForm plan={id} disabled={!billingReady} variant={isCurrent ? "default" : "outline"}>
              {(isCurrent ? copy.keepPlan : copy.choosePlan).replace("{plan}", plan.name)}
            </CheckoutForm>
          )
        ) : undefined
      }
    />
  );
}

/** Plan conversion stays visible while Fleet remains a genuinely separate service. */
export function PlanCard({
  subscription,
  today,
  billingReady,
  checkoutState,
  billingState,
}: {
  subscription: Subscription;
  today: string;
  billingReady: boolean;
  checkoutState?: string;
  billingState?: string;
}) {
  const { dictionary } = useLanguage();
  const copy = dictionary.plans;
  const current = planOf(subscription);
  const status = ({
    TRIALING: { label: copy.trial, tone: "info" },
    ACTIVE: { label: copy.active, tone: "positive" },
    PAST_DUE: { label: copy.pastDue, tone: "warning" },
    CANCELED: { label: copy.canceled, tone: "outline" },
  } as const)[subscription.status];
  const trial = current.id === "OWNER" ? trialState(subscription, today) : null;
  const fleet = PLANS.FLEET;
  const fleetActive = hasFleetAccess(subscription);
  const managedBilling = Boolean(
    subscription.providerCustomerId &&
      subscription.providerSubscriptionId &&
      subscription.status !== "CANCELED",
  );

  return (
    <Card id="plan" className="scroll-mt-20">
      <CardHeader>
        <div className="flex items-center gap-2">
          <CreditCard className="size-3.5 text-muted-foreground" />
          <CardTitle>{copy.planBilling}</CardTitle>
        </div>
        <Badge variant={status.tone}>{status.label}</Badge>
      </CardHeader>

      <CardContent className="space-y-4 p-4">
        {checkoutState === "success" ? (
          <div className="rounded-lg border border-pos/30 bg-pos-soft p-3 text-xs text-pos">
            {copy.checkoutSuccess}
          </div>
        ) : checkoutState === "canceled" ? (
          <div className="rounded-lg border border-border bg-surface-sunken p-3 text-xs text-muted-foreground">
            {copy.checkoutCanceled}
          </div>
        ) : billingState === "managed" ? (
          <div className="rounded-lg border border-warn/30 bg-warn-soft p-3 text-xs text-warn">
            {copy.alreadyManaged}
          </div>
        ) : null}

        {managedBilling ? (
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-sunken p-3.5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold">{current.name}</p>
              <p className="mt-0.5 text-2xs text-muted-foreground">
                {copy.portalDescription}
              </p>
            </div>
            <div className="w-full shrink-0 sm:w-44">
              <PortalForm>{copy.manageBilling}</PortalForm>
            </div>
          </div>
        ) : null}

        {trial ? (
          <div className="rounded-lg border border-primary/30 bg-primary/10 p-3.5">
            <div className="flex items-start gap-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Sparkles className="size-4" aria-hidden />
              </span>
              <div>
                <p className="text-sm font-semibold">{copy.trialTitle}</p>
                <p className="mt-0.5 text-2xs leading-relaxed text-muted-foreground">
                  {trial.expired
                    ? copy.trialEnded
                    : trial.daysRemaining === 0
                      ? copy.trialEndsToday
                      : copy.trialDays
                          .replace("{count}", String(trial.daysRemaining))
                          .replace("{unit}", trial.daysRemaining === 1 ? copy.day : copy.days)}{" "}
                  {copy.keepProPrice.replace("{price}", `$${PLANS.OWNER.priceMonthly}`)}
                </p>
              </div>
            </div>
            <div className="mt-3">
              <CheckoutForm plan="OWNER" disabled={!billingReady}>
                {copy.keepPro}
              </CheckoutForm>
            </div>
          </div>
        ) : null}

        <section aria-labelledby="plans">
          <div className="mb-2.5">
            <h4 id="plans" className="text-xs font-semibold">
              {copy.plans}
            </h4>
            <p className="mt-0.5 text-2xs leading-relaxed text-muted-foreground">
              {copy.plansDescription}
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {ONE_TRUCK_PLANS.map((id) => (
              <OneTruckPlan
                key={id}
                id={id}
                subscription={subscription}
                billingReady={billingReady}
                managedBilling={managedBilling}
              />
            ))}
            <PlanTile
              plan={fleet}
              truckLabel={copy.upToTrucks.replace("{count}", String(fleet.truckLimit))}
              highlighted={fleetActive}
              statusLabel={fleetActive ? copy.active : undefined}
              action={
                !fleetActive ? (
                  managedBilling ? (
                    <PortalForm>{copy.changeFleet}</PortalForm>
                  ) : (
                    <CheckoutForm plan="FLEET" disabled={!billingReady} variant="outline">
                      {copy.chooseFleet}
                    </CheckoutForm>
                  )
                ) : undefined
              }
            />
          </div>
        </section>

        <p className="text-2xs leading-relaxed text-muted-foreground">
          {billingReady
            ? `${copy.billingReady} `
            : `${copy.billingConfiguring} `}
          {copy.booksRemain}
        </p>
      </CardContent>
    </Card>
  );
}
