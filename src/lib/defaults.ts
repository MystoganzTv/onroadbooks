import type { Expense, FinancialGoal, ReserveAccount, Subscription, Truck } from "./types";

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

/**
 * Brings a truck written before the fleet existed up to shape.
 * A unit with no recorded acquisition date is not "acquired today" -- it is
 * simply unknown, so both dates stay null rather than being invented.
 */
export function migrateTruck(truck: Truck): Truck {
  truck.acquiredOn ??= null;
  truck.soldOn ??= null;
  truck.active ??= true;
  return truck;
}

/**
 * Every expense that predates the scope column belonged to the one truck the
 * business had, so it maps to TRUCK. That is what keeps every previously
 * reported figure identical after the migration -- see the August 2026
 * invariant in the test suite.
 */
export function migrateExpense(expense: Expense, fallbackTruckId: string): Expense {
  if (!expense.scope) {
    expense.scope = "TRUCK";
    expense.truckId ??= fallbackTruckId;
  }
  if (expense.scope === "BUSINESS") expense.truckId = null;
  return expense;
}
