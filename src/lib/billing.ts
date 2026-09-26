import "server-only";

import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@/db/schema";
import { DrizzleRepository } from "@/lib/db/drizzle-store";
import type Stripe from "stripe";

import { getRepository } from "@/lib/db";
import { withSecurityLock } from "@/lib/auth/security-store";
import { getStripe, planForStripePrice } from "@/lib/stripe";
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
  eventSubscription: Stripe.Subscription,
  retrieve: (id: string) => Promise<Stripe.Subscription> = id => getStripe().subscriptions.retrieve(id, {}, { timeout: 10_000, maxNetworkRetries: 0 }),
): Promise<void> {
  const businessId = eventSubscription.metadata.onRoadBusinessId?.trim();
  if (!businessId) throw new Error("Stripe subscription is missing its OnRoad business id.");

  await withSecurityLock(`stripe:${businessId}`, async (client) => {
    const repository = client
      ? new DrizzleRepository(businessId, async () => drizzle(client, { schema }))
      : getRepository(businessId);
    const current = (await repository.getDataset()).subscription;
    // Event payloads are historical snapshots. Re-read Stripe while holding the
    // workspace lock, including for deletions and repeated events.
    const stripeSubscription = await retrieve(eventSubscription.id);
    if (stripeSubscription.metadata.onRoadBusinessId?.trim() !== businessId) throw new Error("Stripe workspace metadata changed");
    const plan = subscriptionPlan(stripeSubscription);
    if (!plan) throw new Error("Stripe subscription does not use an OnRoad Books price.");

    const providerCustomerId = customerId(stripeSubscription.customer);
    if (
      current.providerCustomerId &&
      current.providerCustomerId !== providerCustomerId
    ) {
      throw new Error("Stripe customer does not match this OnRoad Books workspace.");
    }

    if (current.providerSubscriptionId && current.providerSubscriptionId !== stripeSubscription.id) {
      const previous = await retrieve(current.providerSubscriptionId);
      const terminal = previous.status === "canceled" || previous.status === "incomplete_expired";
      const incomingTerminal = stripeSubscription.status === "canceled" || stripeSubscription.status === "incomplete_expired";
      if (!terminal || stripeSubscription.created < previous.created ||
        (stripeSubscription.created === previous.created && incomingTerminal)) return;
    }

    await repository.updateSubscription({
      plan,
      status: onRoadStatus(stripeSubscription.status),
      currentPeriodEnd: periodEnd(stripeSubscription),
      providerCustomerId,
      providerSubscriptionId: stripeSubscription.id,
    });
  });
}
