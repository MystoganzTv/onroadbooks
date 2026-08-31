import "server-only";

import type Stripe from "stripe";

import type { PlanId } from "@/lib/types";

interface SubscriptionCheckoutInput {
  baseUrl: string;
  businessId: string;
  customerId: string;
  plan: PlanId;
  priceId: string;
  trialEnd?: number;
}

/**
 * The complete Stripe contract for a hosted subscription checkout.
 *
 * Keeping it outside the Server Action makes the security-critical mapping
 * testable without a browser or a live Stripe request. The business and plan
 * are copied to both the Checkout Session and the resulting Subscription so
 * the signed webhook can always route the purchase to the right workspace.
 */
export function subscriptionCheckoutParameters({
  baseUrl,
  businessId,
  customerId,
  plan,
  priceId,
  trialEnd,
}: SubscriptionCheckoutInput): Stripe.Checkout.SessionCreateParams {
  const normalizedBaseUrl = baseUrl.replace(/\/$/, "");
  const metadata = {
    onRoadBusinessId: businessId,
    onRoadPlan: plan,
  };

  return {
    mode: "subscription",
    customer: customerId,
    client_reference_id: businessId,
    line_items: [{ price: priceId, quantity: 1 }],
    allow_promotion_codes: true,
    billing_address_collection: "auto",
    success_url: `${normalizedBaseUrl}/plans?checkout=success`,
    cancel_url: `${normalizedBaseUrl}/plans?checkout=canceled`,
    metadata,
    subscription_data: {
      metadata,
      ...(trialEnd ? { trial_end: trialEnd } : {}),
    },
  };
}
