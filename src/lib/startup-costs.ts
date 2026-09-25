import { roundMoney } from "./calculations";
import type { DateRange } from "./periods";
import type { Expense, Load } from "./types";

/**
 * Money spent before the first load is the cost of getting the business on
 * the road -- insurance down payments, registration, the first repairs,
 * financing payments while the truck sat -- not the cost of running it.
 *
 * Counted inside operating results it turns a truck that has only just
 * started into a large loss and a cost per mile no load could ever cover.
 * So every operating view (profit, cost per mile, the load calculator, a
 * load's allocated cost) reads the ledger from the first load on, and the
 * earlier spend is reported on its own as the startup investment. Nothing is
 * deleted or re-dated: Expenses, Reports, exports and tax totals still carry
 * every row.
 *
 * The start is per truck: a unit added to a running fleet has its own setup
 * period before its first load. Business-level overhead, and a truck with no
 * load yet, fall back to the business's first load.
 *
 * A setup period exists only when spending clearly ran ahead of the work --
 * the earliest expense at least SETUP_GAP_DAYS before the first load. A
 * business whose first load is on the 2nd and whose monthly insurance posts
 * on the 1st has no setup period: that insurance is the first month's cost.
 */
export const SETUP_GAP_DAYS = 7;

export interface OperatingStart {
  /** First operating day for business-level costs; null = no setup period. */
  business: string | null;
  /** Per truck: its first operating day, or null when it had no setup period. */
  trucks: Map<string, string | null>;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function withSetupPeriod(firstLoad: string | undefined, earliestExpense: string | undefined): string | null {
  if (!firstLoad || !earliestExpense) return null;
  return daysBetween(earliestExpense, firstLoad) >= SETUP_GAP_DAYS ? firstLoad : null;
}

export function operatingStart(
  loads: Pick<Load, "date" | "truckId">[],
  expenses: Pick<Expense, "date" | "scope" | "truckId">[],
): OperatingStart {
  let firstLoad: string | undefined;
  const firstTruckLoad = new Map<string, string>();
  for (const load of loads) {
    if (!load.date) continue;
    if (!firstLoad || load.date < firstLoad) firstLoad = load.date;
    const current = firstTruckLoad.get(load.truckId);
    if (!current || load.date < current) firstTruckLoad.set(load.truckId, load.date);
  }

  let earliest: string | undefined;
  const earliestTruck = new Map<string, string>();
  for (const expense of expenses) {
    if (!expense.date) continue;
    if (!earliest || expense.date < earliest) earliest = expense.date;
    if (expense.scope === "TRUCK" && expense.truckId) {
      const current = earliestTruck.get(expense.truckId);
      if (!current || expense.date < current) earliestTruck.set(expense.truckId, expense.date);
    }
  }

  const trucks = new Map<string, string | null>();
  for (const [truckId, date] of firstTruckLoad) {
    trucks.set(truckId, withSetupPeriod(date, earliestTruck.get(truckId)));
  }
  return { business: withSetupPeriod(firstLoad, earliest), trucks };
}

/** The first operating day that applies to this expense, when it had a setup period. */
export function operatingSinceFor(
  expense: Pick<Expense, "scope" | "truckId">,
  start: OperatingStart,
): string | null {
  if (expense.scope === "TRUCK" && expense.truckId && start.trucks.has(expense.truckId)) {
    return start.trucks.get(expense.truckId) ?? null;
  }
  return start.business;
}

export function isStartupExpense(
  expense: Pick<Expense, "date" | "scope" | "truckId">,
  start: OperatingStart,
): boolean {
  const since = operatingSinceFor(expense, start);
  return since !== null && expense.date < since;
}

/**
 * The ledger as operating views should read it. `loads` must be every load in
 * the business, not a period or truck slice, or the start moves with the
 * filter.
 */
export function operatingLedger<T extends Expense>(loads: Load[], expenses: T[]): T[] {
  const start = operatingStart(loads, expenses);
  if (start.business === null && ![...start.trucks.values()].some(Boolean)) return expenses;
  return expenses.filter((expense) => !isStartupExpense(expense, start));
}

export interface StartupCosts {
  /** The business's first load date, when it had a setup period. */
  operatingSince: string | null;
  total: number;
  count: number;
}

/** What was spent before operations began, optionally within one period. */
export function startupCosts(
  loads: Load[],
  expenses: Expense[],
  range?: DateRange,
  /** Count only this truck's own costs; the start is still read from the whole ledger. */
  truckId?: string | null,
): StartupCosts {
  const start = operatingStart(loads, expenses);
  let total = 0;
  let count = 0;
  for (const expense of expenses) {
    if (range && (expense.date < range.start || expense.date > range.end)) continue;
    if (truckId && (expense.scope !== "TRUCK" || expense.truckId !== truckId)) continue;
    if (!isStartupExpense(expense, start)) continue;
    total += expense.amount;
    count += 1;
  }
  return { operatingSince: start.business, total: roundMoney(total), count };
}
