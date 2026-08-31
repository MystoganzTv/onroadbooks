"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Check, CreditCard, Loader2, Sparkles, Truck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

const STATUS_COPY: Record<
  Subscription["status"],
  { label: string; tone: "positive" | "warning" | "info" | "outline" }
> = {
  TRIALING: { label: "Trial", tone: "info" },
  ACTIVE: { label: "Active", tone: "positive" },
  PAST_DUE: { label: "Past due", tone: "warning" },
  CANCELED: { label: "Canceled", tone: "outline" },
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
      className="w-full"
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
 * One plan, presented the same way wherever it is offered -- the one-truck
 * plans and Fleet all render through this so a real, purchasable tier never
 * looks like a lesser or disabled option next to the others.
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
  return (
    <div
      id={anchorId}
      className={cn(
        "rounded-lg border p-3.5",
        highlighted ? "border-primary bg-primary/5" : "border-border",
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold">{plan.name}</span>
        {statusLabel ? (
          <span className="text-2xs font-medium uppercase tracking-wide text-primary">
            {statusLabel}
          </span>
        ) : null}
      </div>
      <p className="mt-1 tnum text-xl font-semibold tracking-tight">
        ${plan.priceMonthly}
        <span className="text-2xs font-normal text-muted-foreground"> / month</span>
      </p>
      <p className="mt-1 text-2xs font-medium text-foreground">{truckLabel}</p>
      <p className="mt-0.5 text-2xs text-muted-foreground">{plan.tagline}</p>

      <ul className="mt-2.5 space-y-1">
        {plan.features.slice(0, featureLimit).map((feature) => (
          <li key={feature} className="flex items-start gap-1.5 text-2xs text-muted-foreground">
            <Check className="mt-0.5 size-3 shrink-0 text-pos" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      {plan.note ? (
        <p className="mt-2 text-2xs italic leading-relaxed text-muted-foreground">{plan.note}</p>
      ) : null}

      {action ? <div className="mt-3">{action}</div> : null}
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
  const plan = PLANS[id];
  const current = planOf(subscription);
  const isCurrent = current.id === id;
  const showAction = managedBilling ? !isCurrent : subscription.status !== "ACTIVE" || !isCurrent;

  return (
    <PlanTile
      anchorId={id === "OWNER" ? "plan-pro" : undefined}
      plan={plan}
      truckLabel="One truck"
      highlighted={isCurrent}
      statusLabel={isCurrent ? "Current" : undefined}
      action={
        showAction ? (
          managedBilling ? (
            <PortalForm>Change in billing portal</PortalForm>
          ) : (
            <CheckoutForm plan={id} disabled={!billingReady} variant={isCurrent ? "default" : "outline"}>
              {isCurrent ? `Keep ${plan.name}` : `Choose ${plan.name}`}
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
  const current = planOf(subscription);
  const status = STATUS_COPY[subscription.status];
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
          <CardTitle>Plan &amp; billing</CardTitle>
        </div>
        <Badge variant={status.tone}>{status.label}</Badge>
      </CardHeader>

      <CardContent className="space-y-4 p-4">
        {checkoutState === "success" ? (
          <div className="rounded-lg border border-pos/30 bg-pos-soft p-3 text-xs text-pos">
            Stripe received your subscription. Your plan updates automatically as soon as the
            signed billing event arrives.
          </div>
        ) : checkoutState === "canceled" ? (
          <div className="rounded-lg border border-border bg-surface-sunken p-3 text-xs text-muted-foreground">
            Checkout was canceled. Nothing was charged and your current access did not change.
          </div>
        ) : billingState === "managed" ? (
          <div className="rounded-lg border border-warn/30 bg-warn-soft p-3 text-xs text-warn">
            This account already has a Stripe subscription. Use the billing portal to change it
            without creating a duplicate.
          </div>
        ) : null}

        {managedBilling ? (
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-sunken p-3.5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold">{current.name}</p>
              <p className="mt-0.5 text-2xs text-muted-foreground">
                Update the card, switch plans, download invoices or cancel securely in Stripe.
              </p>
            </div>
            <div className="w-full shrink-0 sm:w-44">
              <PortalForm>Manage billing</PortalForm>
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
            <div className="mt-3">
              <CheckoutForm plan="OWNER" disabled={!billingReady}>
                Keep OnRoad Pro
              </CheckoutForm>
            </div>
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
                billingReady={billingReady}
                managedBilling={managedBilling}
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
              <h4 id="fleet-service" className="text-xs font-semibold">
                Fleet service
              </h4>
              <p className="mt-0.5 text-2xs leading-relaxed text-muted-foreground">
                A separate workspace, activated by a Fleet subscription or a complimentary admin
                grant. Its navigation, truck switcher and reports stay hidden until access is
                active.
              </p>
            </div>
          </div>

          <PlanTile
            plan={fleet}
            truckLabel={`Up to ${fleet.truckLimit} trucks`}
            highlighted={fleetActive}
            statusLabel={fleetActive ? "Active" : undefined}
            featureLimit={5}
            action={
              !fleetActive ? (
                managedBilling ? (
                  <PortalForm>Change to OnRoad Fleet</PortalForm>
                ) : (
                  <CheckoutForm plan="FLEET" disabled={!billingReady} variant="outline">
                    Choose OnRoad Fleet
                  </CheckoutForm>
                )
              ) : undefined
            }
          />
        </section>

        <p className="text-2xs leading-relaxed text-muted-foreground">
          {billingReady
            ? "Checkout and billing management are secured by Stripe. "
            : "Online billing is being configured; checkout is temporarily unavailable. "}
          Your books remain yours if a subscription lapses: reading and exporting stay open while
          writing closes.{" "}
          <Link href="/welcome" className="text-primary underline-offset-2 hover:underline">
            Run through setup again
          </Link>
          .
        </p>
      </CardContent>
    </Card>
  );
}
