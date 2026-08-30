"use server";

import { redirect } from "next/navigation";

import { requireSession } from "@/lib/auth";
import { getRepository } from "@/lib/db";
import { trialState } from "@/lib/plans";
import {
  applicationUrl,
  getStripe,
  stripePriceId,
} from "@/lib/stripe";
import type { PlanId } from "@/lib/types";

const CHECKOUT_PLANS = new Set<PlanId>(["SOLO", "OWNER", "FLEET"]);

function preservedTrialEnd(currentPeriodEnd: string | null): number | undefined {
  if (!currentPeriodEnd) return undefined;
  const timestamp = Math.floor(Date.parse(`${currentPeriodEnd}T23:59:59.000Z`) / 1000);
  const minimum = Math.floor(Date.now() / 1000) + 48 * 60 * 60;
  return Number.isFinite(timestamp) && timestamp >= minimum ? timestamp : undefined;
}

export async function createCheckoutAction(plan: PlanId): Promise<void> {
  if (!CHECKOUT_PLANS.has(plan)) throw new Error("That billing plan is not available.");

  const session = await requireSession();
  if (session.isDemo) {
    throw new Error("Create your own account before starting a subscription.");
  }

  const repository = getRepository(session.businessId);
  const { business, subscription } = await repository.getDataset();
  if (
    subscription.providerSubscriptionId &&
    subscription.status !== "CANCELED"
  ) {
    redirect("/plans?billing=managed");
  }

  const stripe = getStripe();
  let providerCustomerId = subscription.providerCustomerId;
  if (!providerCustomerId) {
    const customer = await stripe.customers.create(
      {
        email: session.email,
        name: business.name,
        metadata: {
          onRoadBusinessId: session.businessId,
          onRoadUserId: session.userId,
        },
      },
      { idempotencyKey: `onroad-customer-${session.businessId}` },
    );
    providerCustomerId = customer.id;
    await repository.updateSubscription({
      plan: subscription.plan,
      providerCustomerId,
    });
  }

  const today = new Date().toISOString().slice(0, 10);
  const trial = trialState(subscription, today);
  const trialEnd = trial && !trial.expired
    ? preservedTrialEnd(trial.endsOn)
    : undefined;
  const baseUrl = applicationUrl();
  const checkout = await stripe.checkout.sessions.create(
    {
      mode: "subscription",
      customer: providerCustomerId,
      client_reference_id: session.businessId,
      line_items: [{ price: stripePriceId(plan), quantity: 1 }],
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      success_url: `${baseUrl}/plans?checkout=success`,
      cancel_url: `${baseUrl}/plans?checkout=canceled`,
      metadata: {
        onRoadBusinessId: session.businessId,
        onRoadPlan: plan,
      },
      subscription_data: {
        metadata: {
          onRoadBusinessId: session.businessId,
          onRoadPlan: plan,
        },
        ...(trialEnd ? { trial_end: trialEnd } : {}),
      },
    },
    {
      idempotencyKey: [
        "onroad-checkout",
        session.businessId,
        plan,
        providerCustomerId,
        subscription.currentPeriodEnd ?? "no-period",
      ].join("-"),
    },
  );

  if (!checkout.url) throw new Error("Stripe did not return a Checkout URL.");
  redirect(checkout.url);
}

export async function openBillingPortalAction(): Promise<void> {
  const session = await requireSession();
  if (session.isDemo) throw new Error("The demo account has no billing profile.");

  const { subscription } = await getRepository(session.businessId).getDataset();
  if (!subscription.providerCustomerId) redirect("/plans");

  const portal = await getStripe().billingPortal.sessions.create({
    customer: subscription.providerCustomerId,
    return_url: `${applicationUrl()}/plans`,
  });
  redirect(portal.url);
}
