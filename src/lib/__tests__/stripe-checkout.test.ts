import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { subscriptionCheckoutParameters } from "../stripe-checkout";

describe("Stripe subscription checkout", () => {
  it("routes a Fleet purchase back to the correct OnRoad workspace", () => {
    const checkout = subscriptionCheckoutParameters({
      baseUrl: "https://onroadbooks.com/",
      businessId: "biz_fleet_001",
      customerId: "cus_fleet_001",
      plan: "FLEET",
      priceId: "price_fleet_monthly",
    });

    assert.equal(checkout.mode, "subscription");
    assert.equal(checkout.customer, "cus_fleet_001");
    assert.equal(checkout.client_reference_id, "biz_fleet_001");
    assert.deepEqual(checkout.line_items, [
      { price: "price_fleet_monthly", quantity: 1 },
    ]);
    assert.equal(checkout.success_url, "https://onroadbooks.com/plans?checkout=success");
    assert.equal(checkout.cancel_url, "https://onroadbooks.com/plans?checkout=canceled");
    assert.deepEqual(checkout.metadata, {
      onRoadBusinessId: "biz_fleet_001",
      onRoadPlan: "FLEET",
    });
    assert.deepEqual(checkout.subscription_data?.metadata, checkout.metadata);
    assert.equal(checkout.subscription_data?.trial_end, undefined);
  });

  it("preserves an eligible trial on the resulting Stripe subscription", () => {
    const trialEnd = 1_800_000_000;
    const checkout = subscriptionCheckoutParameters({
      baseUrl: "https://onroadbooks.com",
      businessId: "biz_trial_001",
      customerId: "cus_trial_001",
      plan: "OWNER",
      priceId: "price_pro_monthly",
      trialEnd,
    });

    assert.equal(checkout.subscription_data?.trial_end, trialEnd);
  });
});
