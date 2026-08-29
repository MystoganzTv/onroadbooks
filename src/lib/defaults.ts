import type { FinancialGoal, ReserveAccount, Subscription } from "./types";

/**
 * Defaults for records added after the first release.
 *
 * Both the seed and the JSON store's `migrate()` build them from here, so an
 * existing local ledger gains the new concepts with exactly the same shape a
 * fresh install gets.
 */

export const CREATED_FALLBACK = "2026-01-15T12:00:00.000Z";

export function defaultGoals(businessId: string, updatedAt = CREATED_FALLBACK): FinancialGoal {
  return {
    id: "goal_001",
    businessId,
    monthlyRevenueTarget: 15000,
    monthlyProfitTarget: 7500,
    targetProfitPerMile: 1.5,
    maxDeadheadPct: 15,
    targetLoads: 32,
    workingDaysPerWeek: 6,
    updatedAt,
  };
}

/**
 * The two built-in buckets. `contributionPct` is null on purpose: their rates
 * live in FinancialSettings so a reserve percentage is stored once.
 */
export function defaultReserveAccounts(
  businessId: string,
  createdAt = CREATED_FALLBACK,
): ReserveAccount[] {
  return [
    {
      id: "res_tax",
      businessId,
      kind: "TAX",
      name: "Tax Reserve",
      basis: "OPERATING_PROFIT",
      contributionPct: null,
      targetBalance: null,
      active: true,
      sortOrder: 0,
      createdAt,
    },
    {
      id: "res_maintenance",
      businessId,
      kind: "MAINTENANCE",
      name: "Maintenance Reserve",
      basis: "GROSS_REVENUE",
      contributionPct: null,
      targetBalance: 6000,
      active: true,
      sortOrder: 1,
      createdAt,
    },
  ];
}

/**
 * A business with no subscription row yet is treated as Individual and
 * trialing, never as lapsed: an existing install must not wake up locked out
 * of its own books because a new concept was added underneath it.
 */
export function defaultSubscription(
  businessId: string,
  startedAt = CREATED_FALLBACK,
): Subscription {
  return {
    id: "sub_001",
    businessId,
    plan: "INDIVIDUAL",
    status: "TRIALING",
    currentPeriodEnd: null,
    providerCustomerId: null,
    providerSubscriptionId: null,
    startedAt,
    updatedAt: startedAt,
  };
}
