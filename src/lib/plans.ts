/**
 * PLANS
 * =====
 *
 * Three plans, and the catalogue lives in code rather than in the database: a
 * price is a product decision that ships with a release, not a row someone
 * can edit into an inconsistent state. What the database holds is which plan
 * a business is on, and the state of its subscription.
 *
 * The tiers are split by DEPTH, not by how much of the same thing you get:
 *
 *   SOLO    the book      what happened. Loads, expenses, fuel, documents,
 *                         profit per load and per mile, true cost per mile.
 *   OWNER   the cockpit   what to do next. The load calculator and target
 *                         rate, brokers and lanes, deadhead, settlements,
 *                         reserves and Safe to Pay Yourself, goals and pace.
 *   FLEET   the units     which truck pays. Contribution per unit, business
 *                         overhead kept separate, up to eight trucks.
 *
 * Two things a plan gates, and both are enforced server-side -- in the action
 * that would perform the write, never by hiding a button:
 *
 *   the truck limit    checked against the units that actually exist;
 *   the capabilities   `cockpit` and `fleet`, checked by `planAllows`.
 *
 * SOLO and OWNER both cover one truck, so the truck limit no longer says
 * which plan is bigger. `rank` does, and it is what upgrade and downgrade are
 * decided against.
 *
 * Fleet access is stricter: its provider reference must be present and the
 * subscription active. That keeps Fleet a paid service instead of letting a
 * plan label or an old truck row turn the workspace on by accident.
 */

import type { PlanId, Subscription, SubscriptionStatus } from "./types";

/**
 * What a plan unlocks beyond the ledger.
 *
 * `cockpit` is the decision layer: anything that answers "what should I do",
 * as opposed to "what did I do". `fleet` is per-unit economics.
 */
export type PlanCapability = "cockpit" | "fleet";

export interface Plan {
  id: PlanId;
  name: string;
  /** US dollars per month. */
  priceMonthly: number;
  truckLimit: number;
  /** Order of the tiers. Bigger is more plan; this decides up versus down. */
  rank: number;
  tagline: string;
  features: string[];
  capabilities: PlanCapability[];
  /** Shown under the plan wherever it is offered. Honest small print. */
  note: string | null;
}

export const PLANS: Record<PlanId, Plan> = {
  SOLO: {
    id: "SOLO",
    name: "Solo Starter",
    priceMonthly: 19,
    truckLimit: 1,
    rank: 0,
    tagline: "One truck, and every number about the miles you already ran.",
    capabilities: [],
    features: [
      "One truck, unlimited loads",
      "Loads, expenses, fuel, receipts and documents",
      "Profit per load and profit per mile",
      "True cost per mile, never prorated",
      "Print-ready reports and CSV export",
    ],
    note: null,
  },
  OWNER: {
    id: "OWNER",
    name: "OnRoad Pro",
    priceMonthly: 39,
    truckLimit: 1,
    rank: 1,
    tagline: "The decisions, not just the record.",
    capabilities: ["cockpit"],
    features: [
      "Everything in Solo Starter",
      "Load calculator and target rate",
      "Broker and lane scorecards",
      "Deadhead analysis, priced at your own cost per mile",
      "1-15 and 16-end settlements, frozen when you close them",
      "Tax and maintenance reserves, and Safe to Pay Yourself",
      "Monthly goals, pace and projection",
    ],
    note: null,
  },
  FLEET: {
    id: "FLEET",
    name: "OnRoad Fleet",
    priceMonthly: 89,
    truckLimit: 8,
    rank: 2,
    tagline: "Two to eight trucks, each with its own economics.",
    capabilities: ["cockpit", "fleet"],
    features: [
      "Everything in OnRoad Pro",
      "Up to eight trucks on one account",
      "Cost per mile and contribution per unit",
      "Business overhead kept separate from truck costs",
      "Fleet-wide settlements",
    ],
    note:
      "Fleet is in early access. Everything listed here works today; a second sign-in for a partner or a bookkeeper does not exist yet, and early access pricing is locked for life.",
  },
};

/** Cheapest first. The order the plans are offered in. */
export const PLAN_IDS: PlanId[] = ["SOLO", "OWNER", "FLEET"];

/**
 * Plans that existed under an older name.
 *
 * The single-truck plan was called Individual before the tiers were split by
 * depth. Anyone on it keeps the cockpit they were sold, so it maps up to
 * OnRoad Pro rather than down to Solo Starter.
 */
const LEGACY_PLAN_IDS: Record<string, PlanId> = {
  INDIVIDUAL: "OWNER",
};

export const DEFAULT_PLAN: PlanId = "OWNER";
export const TRIAL_DAYS = 7;

/** The date a new Pro trial ends, expressed in the same date-only form we store. */
export function trialEndsOn(startedAt: string): string {
  const start = new Date(startedAt);
  const validStart = Number.isNaN(start.getTime()) ? new Date() : start;
  validStart.setUTCDate(validStart.getUTCDate() + TRIAL_DAYS);
  return validStart.toISOString().slice(0, 10);
}

export interface TrialState {
  endsOn: string;
  daysRemaining: number;
  expired: boolean;
}

/** A stable, date-only trial summary. Callers pass today so SSR and hydration agree. */
export function trialState(
  subscription: Subscription | undefined,
  today: string,
): TrialState | null {
  if (!subscription || subscription.status !== "TRIALING") return null;

  const endsOn = subscription.currentPeriodEnd ?? trialEndsOn(subscription.startedAt);
  const end = Date.parse(`${endsOn}T00:00:00.000Z`);
  const now = Date.parse(`${today}T00:00:00.000Z`);
  const day = 24 * 60 * 60 * 1000;
  const daysRemaining =
    Number.isNaN(end) || Number.isNaN(now)
      ? TRIAL_DAYS
      : Math.max(0, Math.ceil((end - now) / day));

  return {
    endsOn,
    daysRemaining,
    expired: !Number.isNaN(end) && !Number.isNaN(now) && now > end,
  };
}

export function getPlan(id: string | null | undefined): Plan {
  if (!id) return PLANS[DEFAULT_PLAN];
  const resolved = LEGACY_PLAN_IDS[id] ?? (id as PlanId);
  return PLANS[resolved] ?? PLANS[DEFAULT_PLAN];
}

export function planOf(subscription: Subscription | undefined): Plan {
  return getPlan(subscription?.plan);
}

/** Fleet is a separate paid service, not a UI mode inferred from truck count. */
export function hasFleetAccess(subscription: Subscription | undefined): boolean {
  return Boolean(
    subscription &&
      planOf(subscription).id === "FLEET" &&
      subscription.status === "ACTIVE" &&
      subscription.providerSubscriptionId,
  );
}

/**
 * Whether this business's plan includes a capability.
 *
 * Call it in the server action or the page that would do the work. A
 * component may also call it to explain the gate, but a component saying no
 * is presentation; this is the rule.
 */
export function planAllows(
  subscription: Subscription | undefined,
  capability: PlanCapability,
): boolean {
  if (capability === "fleet") return hasFleetAccess(subscription);
  return planOf(subscription).capabilities.includes(capability);
}

/** The cheapest plan that includes a capability. What an upsell should offer. */
export function cheapestPlanWith(capability: PlanCapability): Plan {
  return (
    PLAN_IDS.map((id) => PLANS[id])
      .sort((a, b) => a.rank - b.rank)
      .find((plan) => plan.capabilities.includes(capability)) ?? PLANS[DEFAULT_PLAN]
  );
}

/**
 * What to tell someone whose plan does not cover what they just asked for.
 *
 * It names the plan and the price, and it promises the books are untouched --
 * because the fear behind a paywall in a bookkeeping app is that the data is
 * hostage. It is not: dropping a tier puts the tool away, not the ledger.
 */
export function capabilityRefusal(capability: PlanCapability): string {
  const plan = cheapestPlanWith(capability);
  if (capability === "fleet") {
    return `${plan.name} is a separate paid service, $${plan.priceMonthly} a month. Request Fleet access in Settings — nothing in your books moves either way.`;
  }
  return `That is part of ${plan.name}, $${plan.priceMonthly} a month. Switch plans in Settings — nothing in your books moves either way.`;
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
  const limit = hasFleetAccess(subscription) ? plan.truckLimit : 1;
  const remaining = Math.max(0, limit - activeTruckCount);
  const canAdd = remaining > 0;

  return {
    limit,
    used: activeTruckCount,
    remaining,
    canAdd,
    reason: canAdd
      ? null
      : limit === 1
        ? `${plan.name} covers one truck. ${PLANS.FLEET.name} is a separate paid service for up to ${PLANS.FLEET.truckLimit}.`
        : `${plan.name} covers ${plan.truckLimit} trucks, and you are running ${activeTruckCount}. Get in touch and we will sort out a larger plan.`,
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
 *
 * Dropping a capability is NOT refused. Moving from OnRoad Pro to Solo
 * Starter puts the cockpit away; it does not touch a single row, and coming
 * back turns it on again with the history intact.
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

  const direction = to.rank > from.rank ? "upgrade" : "downgrade";

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
