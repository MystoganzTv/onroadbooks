/**
 * FLEET ECONOMICS
 * ===============
 *
 * The question a one-truck business asks is "did I make money". A fleet asks
 * two questions that sound like one and are not:
 *
 *   Per unit    Does THIS truck pay for itself? Decides keep, sell, replace.
 *   Fleet       Does the BUSINESS make money?   Decides what you can take out.
 *
 * They differ by overhead, and how overhead is handled is the whole design:
 *
 *   revenue - the unit's own costs        = CONTRIBUTION   (per truck)
 *   sum of contributions - overhead       = OPERATING PROFIT (fleet)
 *
 * A unit is never charged a share of the phone bill. Imputing overhead to
 * trucks invents a cost per unit and makes the number an opinion about how to
 * divide rather than a fact about what happened. Leaving overhead out
 * entirely is the opposite lie -- every truck looks profitable while the
 * business loses money -- so it is subtracted once, visibly, at the bottom.
 *
 * `overheadPerMile` exists because quoting work does need a fully loaded
 * number. It is reported separately and labelled as allocated, never folded
 * into a unit's own figures.
 *
 * The reconciliation this guarantees, and which the tests assert:
 *
 *   sum(contributions) - overhead === revenue - every expense
 *
 * which is exactly `summarizePeriod().netProfit`. A fleet view that did not
 * tie back to the single number on the dashboard would be worse than none.
 */

import { div, roundMoney, sum, summarizePeriod } from "../calculations";
import { expensesForTruck, loadsForTruck, overheadExpenses } from "../fleet";
import { inRange, type DateRange } from "../periods";
import type { Expense, FinancialSettings, Load, Truck } from "../types";
import { calculateTrueCostPerMile, type CostPerMile } from "./cost-per-mile";
import { isDebtServiceCategory, isOperatingExpenseCategory } from "./terminology";

export interface TruckContribution {
  truck: Truck;
  loadCount: number;
  revenue: number;
  /** Only what this unit caused. Never a share of overhead. */
  directCosts: number;
  debtService: number;
  contribution: number;
  totalMiles: number;
  loadedMiles: number;
  deadheadMiles: number;
  deadheadPct: number;
  revenuePerMile: number;
  directCostPerMile: number;
  contributionPerMile: number;
  /** Share of the fleet's total contribution, 0-100. */
  shareOfContribution: number;
  cost: CostPerMile;
}

export interface FleetSummary {
  units: TruckContribution[];
  revenue: number;
  collectedRevenue: number;
  accountsReceivable: number;
  unallocatedCollectedRevenue: number;
  directCosts: number;
  contribution: number;
  /** Business overhead: real spend that belongs to no single unit. */
  overhead: number;
  operatingProfit: number;
  debtService: number;
  cashAfterDebtService: number;
  totalMiles: number;
  /**
   * Overhead spread across every mile the fleet drove. An ALLOCATION, and
   * labelled as one wherever it is shown -- it is a way of pricing work, not
   * a cost any single unit incurred.
   */
  overheadPerMile: number;
  /** Contribution per mile after that allocation. */
  fullyLoadedProfitPerMile: number;
  /** True once more than one unit actually ran in the window. */
  meaningful: boolean;
}

function contributionFor(
  truck: Truck,
  loads: Load[],
  expenses: Expense[],
  range: DateRange,
  settings: FinancialSettings,
): Omit<TruckContribution, "shareOfContribution"> {
  const unitLoads = loadsForTruck(loads, truck.id).filter((l) => inRange(l.date, range));
  const unitExpenses = expensesForTruck(expenses, truck.id).filter((e) => inRange(e.date, range));

  const revenue = roundMoney(sum(unitLoads, (l) => l.grossRate));
  const directCosts = roundMoney(
    sum(
      unitExpenses.filter((expense) => isOperatingExpenseCategory(expense.category)),
      (expense) => expense.amount,
    ),
  );
  const debtService = roundMoney(
    sum(
      unitExpenses.filter((expense) => isDebtServiceCategory(expense.category)),
      (expense) => expense.amount,
    ),
  );
  const loadedMiles = sum(unitLoads, (l) => l.loadedMiles);
  const deadheadMiles = sum(unitLoads, (l) => l.deadheadMiles);
  const totalMiles = loadedMiles + deadheadMiles;

  return {
    truck,
    loadCount: unitLoads.length,
    revenue,
    directCosts,
    debtService,
    contribution: roundMoney(revenue - directCosts),
    totalMiles,
    loadedMiles,
    deadheadMiles,
    deadheadPct: div(deadheadMiles, totalMiles) * 100,
    revenuePerMile: div(revenue, totalMiles),
    directCostPerMile: div(directCosts, totalMiles),
    contributionPerMile: div(revenue - directCosts, totalMiles),
    cost: calculateTrueCostPerMile(unitLoads, unitExpenses, range, settings, truck.name),
  };
}

export function calculateFleetSummary(
  trucks: Truck[],
  loads: Load[],
  expenses: Expense[],
  range: DateRange,
  settings: FinancialSettings,
): FleetSummary {
  const units = trucks.map((truck) => contributionFor(truck, loads, expenses, range, settings));

  const revenue = roundMoney(sum(units, (u) => u.revenue));
  const directCosts = roundMoney(sum(units, (u) => u.directCosts));
  const contribution = roundMoney(revenue - directCosts);
  const overhead = roundMoney(
    sum(
      overheadExpenses(expenses).filter(
        (e) => inRange(e.date, range) && isOperatingExpenseCategory(e.category),
      ),
      (e) => e.amount,
    ),
  );
  const financial = summarizePeriod(loads, expenses, range, settings);
  const debtService = financial.debtService;
  const totalMiles = sum(units, (u) => u.totalMiles);
  const overheadPerMile = div(overhead, totalMiles);

  return {
    units: units
      .map((unit) => ({
        ...unit,
        shareOfContribution: div(unit.contribution, contribution) * 100,
      }))
      .sort((a, b) => b.contribution - a.contribution),
    revenue,
    collectedRevenue: financial.collectedRevenue,
    accountsReceivable: financial.accountsReceivable,
    unallocatedCollectedRevenue: financial.unallocatedCollectedRevenue,
    directCosts,
    contribution,
    overhead,
    operatingProfit: roundMoney(contribution - overhead),
    debtService,
    cashAfterDebtService: financial.cashAfterDebtService,
    totalMiles,
    overheadPerMile,
    fullyLoadedProfitPerMile: div(contribution, totalMiles) - overheadPerMile,
    meaningful: units.filter((u) => u.loadCount > 0).length > 1,
  };
}

/** The unit carrying the fleet, and the one it is carrying. */
export function fleetExtremes(summary: FleetSummary): {
  best: TruckContribution | undefined;
  weakest: TruckContribution | undefined;
} {
  const ran = summary.units.filter((u) => u.loadCount > 0);
  if (ran.length < 2) return { best: ran[0], weakest: undefined };
  return { best: ran[0], weakest: ran[ran.length - 1] };
}
