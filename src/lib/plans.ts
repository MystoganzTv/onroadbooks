/**
 * PLANS
 * =====
 *
 * Two plans, and the catalogue lives in code rather than in the database: a
 * price is a product decision that ships with a release, not a row someone
 * can edit into an inconsistent state. What the database holds is which plan
 * a business is on, and the state of its subscription.
 *
 * The truck limit is the only thing a plan actually gates today. It is
 * enforced server-side in the action that would create a truck, never by
 * hiding a button -- the same rule the rest of the app follows, where the
 * businessId comes from the signed session and never from the browser.
 *
 * Nothing here talks to a payment provider. `Subscription` carries empty
 * provider references so that adding one later is a field being filled in
 * rather than a model being reshaped.
 */

import type { PlanId, Subscription, SubscriptionStatus } from "./types";

export interface Plan {
  id: PlanId;
  name: string;
  /** US dollars per month. */
  priceMonthly: number;
  truckLimit: number;
  tagline: string;
  features: string[];
}

export const PLANS: Record<PlanId, Plan> = {
  INDIVIDUAL: {
    id: "INDIVIDUAL",
    name: "Individual",
    priceMonthly: 29,
    truckLimit: 1,
    tagline: "One truck, and every number about it.",
    features: [
      "One truck",
      "Loads, expenses, fuel and documents",
      "True cost per mile and Safe to Pay Yourself",
      "Load calculator and target rate",
      "1–15 and 16–end settlements",
      "Broker and lane intelligence",
    ],
  },
  FLEET: {
    id: "FLEET",
    name: "Fleet",
    priceMonthly: 49,
    truckLimit: 5,
    tagline: "Up to five trucks, each with its own economics.",
    features: [
      "Everything in Individual",
      "Up to five trucks",
      "Contribution and cost per mile per unit",
      "Business overhead kept separate from truck costs",
      "Fleet-wide settlements",
    ],
  },
};

export const PLAN_IDS: PlanId[] = ["INDIVIDUAL", "FLEET"];

export function getPlan(id: string | null | undefined): Plan {
  return PLANS[(id as PlanId) ?? "INDIVIDUAL"] ?? PLANS.INDIVIDUAL;
}

export function planOf(subscription: Subscription | undefined): Plan {
  return getPlan(subscription?.plan);
}

/** Statuses that still allow writing. A lapsed subscription reads, it does not write. */
const WRITABLE: SubscriptionStatus[] = ["TRIALING", "ACTIVE"];

/**
 * A business that stops paying keeps its books.
 *
 * Reading and exporting stay open; only writing closes. A ledger you lose
 * access to is a reason not to trust the product with your books in the first
 * place.
 */
export function canWrite(subscription: Subscription | undefined): boolean {
  if (!subscription) return true;
  return WRITABLE.includes(subscription.status);
}

export interface TruckAllowance {
  limit: number;
  used: number;
  remaining: number;
  canAdd: boolean;
  /** Explains the refusal, in the words the owner should see. */
  reason: string | null;
}

export function truckAllowance(
  subscription: Subscription | undefined,
  activeTruckCount: number,
): TruckAllowance {
  const plan = planOf(subscription);
  const remaining = Math.max(0, plan.truckLimit - activeTruckCount);
  const canAdd = remaining > 0;

  return {
    limit: plan.truckLimit,
    used: activeTruckCount,
    remaining,
    canAdd,
    reason: canAdd
      ? null
      : plan.id === "INDIVIDUAL"
        ? `The Individual plan covers one truck. Switch to Fleet to run up to ${PLANS.FLEET.truckLimit}.`
        : `The Fleet plan covers ${plan.truckLimit} trucks, and you are running ${activeTruckCount}. Get in touch and we will sort out a larger plan.`,
  };
}

export interface PlanChange {
  allowed: boolean;
  direction: "upgrade" | "downgrade" | "same";
  reason: string | null;
}

/**
 * Whether a business can move to another plan right now.
 *
 * Going up is always fine. Going down is refused while the business is
 * running more trucks than the smaller plan covers -- deleting somebody's
 * records to fit a cheaper plan is never the right answer, so they archive a
 * truck first and keep its history.
 */
export function evaluatePlanChange(
  current: Subscription | undefined,
  target: PlanId,
  activeTruckCount: number,
): PlanChange {
  const from = planOf(current);
  const to = getPlan(target);

  if (from.id === to.id) {
    return { allowed: false, direction: "same", reason: `You are already on ${to.name}.` };
  }

  const direction = to.truckLimit > from.truckLimit ? "upgrade" : "downgrade";

  if (direction === "downgrade" && activeTruckCount > to.truckLimit) {
    return {
      allowed: false,
      direction,
      reason: `${to.name} covers ${to.truckLimit} ${
        to.truckLimit === 1 ? "truck" : "trucks"
      } and you are running ${activeTruckCount}. Archive the ones you are not using first — their history stays, and it keeps showing up in past reports.`,
    };
  }

  return { allowed: true, direction, reason: null };
}
