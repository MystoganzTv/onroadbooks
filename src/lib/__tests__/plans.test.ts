import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  PLANS,
  canWrite,
  evaluatePlanChange,
  getPlan,
  planOf,
  truckAllowance,
} from "../plans";
import { defaultSubscription } from "../defaults";
import type { Subscription } from "../types";

function sub(over: Partial<Subscription> = {}): Subscription {
  return { ...defaultSubscription("biz"), ...over };
}

describe("the plan catalogue", () => {
  it("prices and limits match what is sold", () => {
    assert.equal(PLANS.INDIVIDUAL.priceMonthly, 29);
    assert.equal(PLANS.INDIVIDUAL.truckLimit, 1);
    assert.equal(PLANS.FLEET.priceMonthly, 49);
    assert.equal(PLANS.FLEET.truckLimit, 5);
  });

  it("falls back to Individual rather than throwing on an unknown plan", () => {
    assert.equal(getPlan("SOMETHING_ELSE").id, "INDIVIDUAL");
    assert.equal(getPlan(null).id, "INDIVIDUAL");
    assert.equal(planOf(undefined).id, "INDIVIDUAL");
  });
});

describe("truckAllowance", () => {
  it("lets an Individual business have its one truck", () => {
    const allowance = truckAllowance(sub(), 0);
    assert.equal(allowance.limit, 1);
    assert.equal(allowance.canAdd, true);
    assert.equal(allowance.reason, null);
  });

  it("refuses the second truck on Individual, and says how to fix it", () => {
    const allowance = truckAllowance(sub(), 1);
    assert.equal(allowance.canAdd, false);
    assert.match(allowance.reason ?? "", /Fleet/);
  });

  it("allows up to five on Fleet and refuses the sixth", () => {
    assert.equal(truckAllowance(sub({ plan: "FLEET" }), 4).canAdd, true);
    const full = truckAllowance(sub({ plan: "FLEET" }), 5);
    assert.equal(full.canAdd, false);
    assert.equal(full.remaining, 0);
    assert.match(full.reason ?? "", /larger plan/);
  });

  it("never reports negative headroom when somehow over the limit", () => {
    assert.equal(truckAllowance(sub({ plan: "FLEET" }), 9).remaining, 0);
  });
});

describe("evaluatePlanChange", () => {
  it("always allows moving up", () => {
    const change = evaluatePlanChange(sub(), "FLEET", 1);
    assert.equal(change.allowed, true);
    assert.equal(change.direction, "upgrade");
  });

  it("allows moving down when the trucks fit", () => {
    const change = evaluatePlanChange(sub({ plan: "FLEET" }), "INDIVIDUAL", 1);
    assert.equal(change.allowed, true);
    assert.equal(change.direction, "downgrade");
  });

  it("refuses moving down while more trucks are running than fit", () => {
    const change = evaluatePlanChange(sub({ plan: "FLEET" }), "INDIVIDUAL", 3);
    assert.equal(change.allowed, false);
    // The refusal has to tell them what to do, and promise the history stays.
    assert.match(change.reason ?? "", /Archive/);
    assert.match(change.reason ?? "", /history stays/);
  });

  it("says so plainly when there is nothing to change", () => {
    const change = evaluatePlanChange(sub(), "INDIVIDUAL", 1);
    assert.equal(change.allowed, false);
    assert.equal(change.direction, "same");
  });
});

describe("canWrite", () => {
  it("lets a trialing or active business work", () => {
    assert.equal(canWrite(sub({ status: "TRIALING" })), true);
    assert.equal(canWrite(sub({ status: "ACTIVE" })), true);
  });

  it("closes writing once a subscription lapses", () => {
    assert.equal(canWrite(sub({ status: "PAST_DUE" })), false);
    assert.equal(canWrite(sub({ status: "CANCELED" })), false);
  });

  it("treats a business with no subscription row as able to work", () => {
    // An existing install must not wake up locked out of its own books
    // because a new concept was added underneath it.
    assert.equal(canWrite(undefined), true);
  });
});

describe("a business created before subscriptions existed", () => {
  it("defaults to Individual and trialing, never to lapsed", () => {
    const created = defaultSubscription("biz");
    assert.equal(created.plan, "INDIVIDUAL");
    assert.equal(created.status, "TRIALING");
    assert.equal(canWrite(created), true);
  });

  it("carries empty provider references, ready for billing later", () => {
    const created = defaultSubscription("biz");
    assert.equal(created.providerCustomerId, null);
    assert.equal(created.providerSubscriptionId, null);
    assert.equal(created.currentPeriodEnd, null);
  });
});
