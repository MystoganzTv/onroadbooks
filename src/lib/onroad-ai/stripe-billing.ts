import "server-only";

/**
 * STRIPE FOR ONROAD AI
 * ====================
 *
 * Same Stripe account as OnRoad Books, separate product. Everything created
 * here is tagged `metadata.product = "onroad-ai"` -- the session, and the
 * subscription it creates -- so:
 *
 *   - /api/whatsapp/stripe (its own endpoint and signing secret) acts on it;
 *   - /api/stripe/webhook (OnRoad Books workspaces) skips it, instead of
 *     failing on a subscription with no workspace id and retrying for days.
 *
 * A driver has no email or password with us. Checkout collects the email;
 * the subscription is tied to the driver by `assistantUserId` in metadata,
 * never by anything the driver typed.
 *
 * Plan state is always re-read from Stripe before it is written, so a
 * replayed or out-of-order event cannot set a stale status.
 */

import { randomUUID } from "node:crypto";

import type Stripe from "stripe";

import { applicationUrl, getStripe } from "@/lib/stripe";

import type { BillingPort } from "./plans";
import type { AssistantStore, AssistantUser, Billing } from "./store/types";

export const ONROAD_AI_PRODUCT = "onroad-ai";

export function onroadAiPriceId(): string | null {
  return process.env.STRIPE_PRICE_ONROAD_AI_MONTHLY?.trim() || null;
}

export function onroadAiWebhookSecret(): string | null {
  return process.env.STRIPE_ONROAD_AI_WEBHOOK_SECRET?.trim() || null;
}

function returnUrl(): string {
  return process.env.ONROAD_AI_CHECKOUT_RETURN_URL?.trim() || applicationUrl();
}

export function isOnroadAiObject(object: { metadata?: Stripe.Metadata | null } | null | undefined): boolean {
  return object?.metadata?.product === ONROAD_AI_PRODUCT;
}

export const stripeBillingPort: BillingPort = {
  async checkoutUrl(user) {
    const price = onroadAiPriceId();
    if (!price) return null;
    const metadata = { product: ONROAD_AI_PRODUCT, assistantUserId: user.id };
    const session = await getStripe().checkout.sessions.create(
      {
        mode: "subscription",
        line_items: [{ price, quantity: 1 }],
        client_reference_id: user.id,
        customer: user.billing.stripeCustomerId ?? undefined,
        metadata,
        subscription_data: { metadata },
        allow_promotion_codes: true,
        success_url: returnUrl(),
        cancel_url: returnUrl(),
      },
      { idempotencyKey: `onroad-ai-checkout-${randomUUID()}` },
    );
    return session.url ?? null;
  },
  async portalUrl(user) {
    if (!user.billing.stripeCustomerId) return null;
    const session = await getStripe().billingPortal.sessions.create({ customer: user.billing.stripeCustomerId, return_url: returnUrl() });
    return session.url;
  },
};

function periodEnd(subscription: Stripe.Subscription): Date | null {
  const ends = subscription.items.data.map((item) => item.current_period_end).filter((value): value is number => typeof value === "number");
  const timestamp = subscription.status === "trialing" && subscription.trial_end ? subscription.trial_end : ends.length ? Math.max(...ends) : null;
  return timestamp ? new Date(timestamp * 1000) : null;
}

/** Stripe subscription -> the driver's billing record. Pure, tested. */
export function billingFromSubscription(subscription: Stripe.Subscription, expectedPrice: string | null): Billing {
  const item = subscription.items.data.find((entry) => !expectedPrice || entry.price.id === expectedPrice) ?? subscription.items.data[0];
  const terminal = subscription.status === "canceled" || subscription.status === "incomplete_expired" || subscription.status === "unpaid";
  return {
    plan: terminal || !item ? "FREE" : "PRO",
    status: subscription.status,
    currentPeriodEnd: periodEnd(subscription),
    amountCents: item?.price.unit_amount ?? null,
    stripeCustomerId: typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id,
    stripeSubscriptionId: subscription.id,
  };
}

export type SyncOutcome = { kind: "IGNORED"; reason: string } | { kind: "UPDATED"; user: AssistantUser; before: Billing; after: Billing };

/** Re-read the subscription from Stripe and store it on the right driver. */
export async function syncOnroadAiSubscription(
  store: AssistantStore,
  subscriptionId: string,
  retrieve: (id: string) => Promise<Stripe.Subscription> = (id) => getStripe().subscriptions.retrieve(id, {}, { timeout: 10_000, maxNetworkRetries: 0 }),
): Promise<SyncOutcome> {
  const subscription = await retrieve(subscriptionId);
  if (!isOnroadAiObject(subscription)) return { kind: "IGNORED", reason: "not an OnRoad AI subscription" };
  const userId = subscription.metadata.assistantUserId?.trim();
  const user = (userId ? await store.getUserById(userId) : null) ?? (await store.findUserByStripeSubscription(subscription.id));
  if (!user) return { kind: "IGNORED", reason: "driver not found (deleted?)" };
  // A driver who already has a different, newer subscription keeps it.
  if (user.billing.stripeSubscriptionId && user.billing.stripeSubscriptionId !== subscription.id) {
    const terminal = ["canceled", "incomplete_expired", "unpaid"].includes(subscription.status);
    if (terminal) return { kind: "IGNORED", reason: "ended subscription is not the driver's current one" };
  }
  const after = billingFromSubscription(subscription, process.env.STRIPE_PRICE_ONROAD_AI_MONTHLY?.trim() || null);
  await store.updateUser(user.id, { billing: after });
  return { kind: "UPDATED", user, before: user.billing, after };
}
