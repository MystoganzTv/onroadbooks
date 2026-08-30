import "server-only";

import type Stripe from "stripe";

import { getRepository } from "@/lib/db";
import { planForStripePrice } from "@/lib/stripe";
import type { PlanId, SubscriptionStatus } from "@/lib/types";

const PLAN_IDS = new Set<PlanId>(["SOLO", "OWNER", "FLEET"]);

function customerId(customer: string | Stripe.Customer | Stripe.DeletedCustomer): string {
  return typeof customer === "string" ? customer : customer.id;
}

function periodEnd(subscription: Stripe.Subscription): string | null {
  const timestamps = subscription.items.data
    .map((item) => item.current_period_end)
    .filter((value): value is number => typeof value === "number");
  const timestamp =
    subscription.status === "trialing" && subscription.trial_end
      ? subscription.trial_end
      : timestamps.length > 0
        ? Math.max(...timestamps)
        : null;
  return timestamp ? new Date(timestamp * 1000).toISOString().slice(0, 10) : null;
}

export function onRoadStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  switch (status) {
    case "active":
      return "ACTIVE";
    case "trialing":
      return "TRIALING";
    case "canceled":
    case "paused":
      return "CANCELED";
    default:
      return "PAST_DUE";
  }
}

function subscriptionPlan(subscription: Stripe.Subscription): PlanId | null {
  const pricePlan = subscription.items.data
    .map((item) => planForStripePrice(item.price.id))
    .find((plan): plan is PlanId => Boolean(plan));
  if (pricePlan) return pricePlan;

  const metadataPlan = subscription.metadata.onRoadPlan as PlanId | undefined;
  return metadataPlan && PLAN_IDS.has(metadataPlan) ? metadataPlan : null;
}

/**
 * Synchronize one verified Stripe subscription into its isolated workspace.
 * The business id is accepted only from Stripe-signed subscription metadata.
 */
export async function syncStripeSubscription(
  stripeSubscription: Stripe.Subscription,
): Promise<void> {
  const businessId = stripeSubscription.metadata.onRoadBusinessId?.trim();
  if (!businessId) throw new Error("Stripe subscription is missing its OnRoad business id.");

  const plan = subscriptionPlan(stripeSubscription);
  if (!plan) throw new Error("Stripe subscription does not use an OnRoad Books price.");

  const repository = getRepository(businessId);
  const current = (await repository.getDataset()).subscription;
  const providerCustomerId = customerId(stripeSubscription.customer);
  if (
    current.providerCustomerId &&
    current.providerCustomerId !== providerCustomerId
  ) {
    throw new Error("Stripe customer does not match this OnRoad Books workspace.");
  }

  await repository.updateSubscription({
    plan,
    status: onRoadStatus(stripeSubscription.status),
    currentPeriodEnd: periodEnd(stripeSubscription),
    providerCustomerId,
    providerSubscriptionId: stripeSubscription.id,
  });
}
