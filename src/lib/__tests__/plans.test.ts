import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  PLANS,
  PLAN_IDS,
  canWrite,
  cheapestPlanWith,
  evaluatePlanChange,
  getPlan,
  hasFleetAccess,
  isComplimentaryAccess,
  planAllows,
  planOf,
  trialEndsOn,
  trialState,
  truckAllowance,
} from "../plans";
import { defaultSubscription } from "../defaults";
import type { Subscription } from "../types";

function sub(over: Partial<Subscription> = {}): Subscription {
  return { ...defaultSubscription("biz"), ...over };
}

function paidFleet(over: Partial<Subscription> = {}): Subscription {
  return sub({
    plan: "FLEET",
    status: "ACTIVE",
    providerSubscriptionId: "sub_fleet_001",
    ...over,
  });
}

function complimentaryFleet(over: Partial<Subscription> = {}): Subscription {
  return sub({
    plan: "FLEET",
    status: "ACTIVE",
    currentPeriodEnd: null,
    providerSubscriptionId: null,
    ...over,
  });
}

describe("the plan catalogue", () => {
  it("prices and limits match what is sold", () => {
    assert.equal(PLANS.SOLO.priceMonthly, 19);
    assert.equal(PLANS.SOLO.truckLimit, 1);
    assert.equal(PLANS.OWNER.priceMonthly, 39);
    assert.equal(PLANS.OWNER.truckLimit, 1);
    assert.equal(PLANS.FLEET.priceMonthly, 89);
    assert.equal(PLANS.FLEET.truckLimit, 8);
  });

  it("is offered cheapest first, and the ranks agree with the prices", () => {
    assert.deepEqual(PLAN_IDS, ["SOLO", "OWNER", "FLEET"]);
    const byRank = PLAN_IDS.map((id) => PLANS[id]);
    for (let i = 1; i < byRank.length; i += 1) {
      assert.ok(byRank[i].rank > byRank[i - 1].rank, "ranks ascend");
      assert.ok(byRank[i].priceMonthly > byRank[i - 1].priceMonthly, "prices ascend");
    }
  });

  it("sells nothing on the cheap tier that the dear one lacks", () => {
    // Each tier is the one below plus something. A capability that appears
    // lower down and vanishes higher up would make an upgrade a downgrade.
    assert.ok(PLANS.SOLO.capabilities.every((c) => PLANS.OWNER.capabilities.includes(c)));
    assert.ok(PLANS.OWNER.capabilities.every((c) => PLANS.FLEET.capabilities.includes(c)));
  });

  it("falls back to the default plan rather than throwing on an unknown one", () => {
    assert.equal(getPlan("SOMETHING_ELSE").id, "OWNER");
    assert.equal(getPlan(null).id, "OWNER");
    assert.equal(planOf(undefined).id, "OWNER");
  });

  it("carries a business on the old Individual plan up to OnRoad Pro", () => {
    // Individual was the single-truck plan before the tiers were split by
    // depth. It included the cockpit, so it must not land on Solo Starter.
    const carried = getPlan("INDIVIDUAL");
    assert.equal(carried.id, "OWNER");
    assert.equal(planAllows(sub({ plan: "INDIVIDUAL" as Subscription["plan"] }), "cockpit"), true);
  });
});

describe("planAllows", () => {
  it("keeps the decision tools out of the ledger tier", () => {
    assert.equal(planAllows(sub({ plan: "SOLO" }), "cockpit"), false);
    assert.equal(planAllows(sub({ plan: "SOLO" }), "fleet"), false);
  });

  it("opens the cockpit on OnRoad Pro, but not per-unit economics", () => {
    assert.equal(planAllows(sub({ plan: "OWNER" }), "cockpit"), true);
    assert.equal(planAllows(sub({ plan: "OWNER" }), "fleet"), false);
  });

  it("opens Fleet only for active Stripe billing or an explicit complimentary grant", () => {
    assert.equal(planAllows(sub({ plan: "FLEET" }), "cockpit"), true);
    assert.equal(hasFleetAccess(sub({ plan: "FLEET" })), false);
    assert.equal(planAllows(sub({ plan: "FLEET" }), "fleet"), false);
    assert.equal(hasFleetAccess(paidFleet()), true);
    assert.equal(planAllows(paidFleet(), "fleet"), true);
    assert.equal(hasFleetAccess(paidFleet({ status: "PAST_DUE" })), false);
    assert.equal(hasFleetAccess(paidFleet({ providerSubscriptionId: null })), false);
    assert.equal(isComplimentaryAccess(complimentaryFleet()), true);
    assert.equal(hasFleetAccess(complimentaryFleet()), true);
    assert.equal(planAllows(complimentaryFleet(), "fleet"), true);
    assert.equal(hasFleetAccess(complimentaryFleet({ currentPeriodEnd: "2026-09-30" })), false);
  });

  it("treats a business with no subscription row as being on the default plan", () => {
    assert.equal(planAllows(undefined, "cockpit"), true);
  });

  it("points an upsell at the cheapest plan that carries the capability", () => {
    assert.equal(cheapestPlanWith("cockpit").id, "OWNER");
    assert.equal(cheapestPlanWith("fleet").id, "FLEET");
  });
});

describe("truckAllowance", () => {
  it("lets a single-truck business have its one truck", () => {
    const allowance = truckAllowance(sub(), 0);
    assert.equal(allowance.limit, 1);
    assert.equal(allowance.canAdd, true);
    assert.equal(allowance.reason, null);
  });

  it("refuses the second truck on a single-truck plan, and says how to fix it", () => {
    for (const plan of ["SOLO", "OWNER"] as const) {
      const allowance = truckAllowance(sub({ plan }), 1);
      assert.equal(allowance.canAdd, false, plan);
      assert.match(allowance.reason ?? "", /OnRoad Fleet/);
    }
  });

  it("allows up to eight on Fleet and refuses the ninth", () => {
    assert.equal(truckAllowance(paidFleet(), 7).canAdd, true);
    const full = truckAllowance(paidFleet(), 8);
    assert.equal(full.canAdd, false);
    assert.equal(full.remaining, 0);
    assert.match(full.reason ?? "", /larger plan/);
  });

  it("gives a complimentary Fleet grant the same truck allowance", () => {
    assert.equal(truckAllowance(complimentaryFleet(), 7).canAdd, true);
    assert.equal(truckAllowance(complimentaryFleet(), 8).canAdd, false);
  });

  it("never reports negative headroom when somehow over the limit", () => {
    assert.equal(truckAllowance(paidFleet(), 12).remaining, 0);
  });

  it("keeps an unpaid Fleet label at one truck", () => {
    const allowance = truckAllowance(sub({ plan: "FLEET" }), 1);
    assert.equal(allowance.limit, 1);
    assert.equal(allowance.canAdd, false);
    // It must say why, and it must not sell Fleet to someone already on it.
    assert.match(allowance.reason ?? "", /subscription is active/);
    assert.doesNotMatch(allowance.reason ?? "", /separate paid service/);
  });

  it("still offers Fleet to a one-truck plan that is not Fleet", () => {
    const allowance = truckAllowance(sub({ plan: "OWNER", status: "ACTIVE" }), 1);
    assert.equal(allowance.canAdd, false);
    assert.match(allowance.reason ?? "", /separate paid service/);
  });
});

describe("evaluatePlanChange", () => {
  it("always allows moving up", () => {
    const change = evaluatePlanChange(sub({ plan: "SOLO" }), "OWNER", 1);
    assert.equal(change.allowed, true);
    assert.equal(change.direction, "upgrade");
  });

  it("reads Solo to Owner as an upgrade even though both cover one truck", () => {
    // Truck count no longer separates the two cheapest tiers; rank does.
    assert.equal(PLANS.SOLO.truckLimit, PLANS.OWNER.truckLimit);
    assert.equal(evaluatePlanChange(sub({ plan: "SOLO" }), "OWNER", 1).direction, "upgrade");
    assert.equal(evaluatePlanChange(sub({ plan: "OWNER" }), "SOLO", 1).direction, "downgrade");
  });

  it("allows dropping the cockpit, because no row is touched", () => {
    const change = evaluatePlanChange(sub({ plan: "OWNER" }), "SOLO", 1);
    assert.equal(change.allowed, true);
    assert.equal(change.reason, null);
  });

  it("allows moving down when the trucks fit", () => {
    const change = evaluatePlanChange(sub({ plan: "FLEET" }), "OWNER", 1);
    assert.equal(change.allowed, true);
    assert.equal(change.direction, "downgrade");
  });

  it("refuses moving down while more trucks are running than fit", () => {
    const change = evaluatePlanChange(sub({ plan: "FLEET" }), "OWNER", 3);
    assert.equal(change.allowed, false);
    // The refusal has to tell them what to do, and promise the history stays.
    assert.match(change.reason ?? "", /Archive/);
    assert.match(change.reason ?? "", /history stays/);
  });

  it("says so plainly when there is nothing to change", () => {
    const change = evaluatePlanChange(sub(), "OWNER", 1);
    assert.equal(change.allowed, false);
    assert.equal(change.direction, "same");
  });
});

describe("canWrite", () => {
  it("lets a trialing or active business work", () => {
    assert.equal(
      canWrite(
        sub({ status: "TRIALING", currentPeriodEnd: "2026-09-05" }),
        "2026-08-30",
      ),
      true,
    );
    assert.equal(canWrite(sub({ status: "ACTIVE" })), true);
  });

  it("closes writing once a subscription lapses", () => {
    assert.equal(canWrite(sub({ status: "PAST_DUE" })), false);
    assert.equal(canWrite(sub({ status: "CANCELED" })), false);
  });

  it("closes writing the day after a trial ends, but not on its final day", () => {
    const trial = sub({
      status: "TRIALING",
      currentPeriodEnd: "2026-09-05",
    });
    assert.equal(canWrite(trial, "2026-09-05"), true);
    assert.equal(canWrite(trial, "2026-09-06"), false);
  });

  it("treats a business with no subscription row as able to work", () => {
    // An existing install must not wake up locked out of its own books
    // because a new concept was added underneath it.
    assert.equal(canWrite(undefined), true);
  });
});

describe("a business created before subscriptions existed", () => {
  it("defaults to the trial of the full cockpit, never to lapsed", () => {
    const created = defaultSubscription("biz");
    assert.equal(created.plan, "OWNER");
    assert.equal(created.status, "TRIALING");
    assert.equal(canWrite(created, created.startedAt.slice(0, 10)), true);
    assert.equal(planAllows(created, "cockpit"), true);
  });

  it("carries empty provider references, ready for billing later", () => {
    const created = defaultSubscription("biz");
    assert.equal(created.providerCustomerId, null);
    assert.equal(created.providerSubscriptionId, null);
    assert.equal(created.currentPeriodEnd, trialEndsOn(created.startedAt));
  });
});

describe("the 7-day OnRoad Pro trial", () => {
  it("ends seven calendar days after account creation", () => {
    assert.equal(trialEndsOn("2026-08-29T22:00:00.000Z"), "2026-09-05");
  });

  it("reports time left, the final day and expiration without client clock drift", () => {
    const trial = sub({
      startedAt: "2026-08-29T22:00:00.000Z",
      currentPeriodEnd: "2026-09-05",
    });

    assert.deepEqual(trialState(trial, "2026-08-29"), {
      endsOn: "2026-09-05",
      daysRemaining: 7,
      expired: false,
    });
    assert.deepEqual(trialState(trial, "2026-09-05"), {
      endsOn: "2026-09-05",
      daysRemaining: 0,
      expired: false,
    });
    assert.deepEqual(trialState(trial, "2026-09-06"), {
      endsOn: "2026-09-05",
      daysRemaining: 0,
      expired: true,
    });
    assert.equal(trialState({ ...trial, status: "ACTIVE" }, "2026-08-29"), null);
  });
});
