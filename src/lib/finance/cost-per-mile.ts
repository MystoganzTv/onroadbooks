/**
 * ACTUAL AND NORMALIZED COST PER MILE -- methodology
 * ==================================================
 *
 * One rule, applied everywhere:
 *
 *     Actual Cost Per Mile = Operating Expenses dated inside the window
 *                            ---------------------------------------------
 *                            loaded + deadhead miles inside the window
 *
 * Consequences that are deliberate, not accidental:
 *
 *  1. Nothing is prorated. A 1-15 settlement is NOT "half the month's costs".
 *     If insurance posts on the 1st, the first half of the month really did
 *     carry it, and the second half did not. Debt Service is shown separately.
 *  2. Expenses come from the expense ledger only. Trip-level costs that the
 *     owner posts are mirrored into linked ledger rows. Detailed Fuel entries
 *     replace the load's generated fuel row, so one purchase is counted once.
 *  3. Deadhead miles are in the denominator. A mile is a mile; the empty ones
 *     still burn fuel and still wear the truck.
 *  4. Fixed vs variable is the business's own classification, taken from
 *     FinancialSettings.categoryBehavior, so an owner who leases parking by
 *     the month can say so.
 *
 * Because a short window can be distorted by a single annual bill, anything
 * that needs a STABLE cost per mile (the load calculator, the target rate
 * tool, deadhead costing) uses `trailingCostBasis`, not the selected period.
 */

import { div, roundMoney, sum } from "../calculations";
import { behaviorOf, getCategory } from "../categories";
import { isLoadExpenseId } from "../load-expenses";
import { addDays, inRange, type DateRange } from "../periods";
import type {
  Expense,
  ExpenseBehavior,
  ExpenseCategoryId,
  FinancialSettings,
  Load,
} from "../types";
import {
  financialTreatmentOf,
} from "./terminology";

export interface CostLine {
  category: ExpenseCategoryId;
  label: string;
  behavior: ExpenseBehavior;
  amount: number;
  perMile: number;
  /** Share of Actual Cost Per Mile, 0-100. */
  share: number;
}

export interface CostPerMile {
  totalMiles: number;
  loadedMiles: number;
  deadheadMiles: number;
  fixedTotal: number;
  variableTotal: number;
  totalCost: number;
  /** Financing cash burden, excluded from Actual Cost Per Mile. */
  debtServiceTotal: number;
  /** Operating costs plus debt service paid in the same window. */
  cashCostTotal: number;
  /**
   * Dollars the trip itself caused: everything in the four direct categories
   * PLUS every ledger row posted automatically from a load (which includes
   * the load's "Other trip cost" row, filed under OTHER). This is what the
   * load calculator asks the driver for explicitly, so it is what
   * `overheadCostPerMile` must exclude.
   */
  directTripTotal: number;
  fixedCostPerMile: number;
  variableCostPerMile: number;
  trueCostPerMile: number;
  /** Canonical name for the legacy trueCostPerMile alias. */
  actualCostPerMile: number;
  debtServicePerMile: number;
  cashCostPerMile: number;
  fixed: CostLine[];
  variable: CostLine[];
  /** Every line, biggest first, for the "where does a dollar go" breakdown. */
  lines: CostLine[];
  /**
   * False when the window holds no miles. Every per-mile figure is then 0 and
   * must be presented as "not enough data", never as a cost of zero.
   */
  sufficient: boolean;
  basisLabel: string;
  /** Days the window spans, for the basis footnote. */
  days: number;
  /** Exact evidence window, reused by Fleet overhead allocation. */
  rangeStart?: string;
  rangeEnd?: string;
}

/** Categories the load calculator asks the driver to enter directly. */
export const DIRECT_TRIP_CATEGORIES: ExpenseCategoryId[] = [
  "FUEL",
  "TOLLS",
  "DISPATCH",
  "FACTORING",
];

function emptyCostPerMile(basisLabel: string, days: number): CostPerMile {
  return {
    totalMiles: 0,
    loadedMiles: 0,
    deadheadMiles: 0,
    fixedTotal: 0,
    variableTotal: 0,
    totalCost: 0,
    debtServiceTotal: 0,
    cashCostTotal: 0,
    directTripTotal: 0,
    fixedCostPerMile: 0,
    variableCostPerMile: 0,
    trueCostPerMile: 0,
    actualCostPerMile: 0,
    debtServicePerMile: 0,
    cashCostPerMile: 0,
    fixed: [],
    variable: [],
    lines: [],
    sufficient: false,
    basisLabel,
    days,
  };
}

/**
 * Actual expenses over actual miles for one window. See the file header for
 * the methodology this commits to.
 */
export function calculateTrueCostPerMile(
  loads: Load[],
  expenses: Expense[],
  range: DateRange,
  settings: FinancialSettings | undefined,
  basisLabel: string,
): CostPerMile {
  const periodLoads = loads.filter((l) => inRange(l.date, range));
  const periodExpenses = expenses.filter((e) => inRange(e.date, range));
  const operatingExpenses = periodExpenses.filter((expense) =>
    financialTreatmentOf(expense) === "OPERATING",
  );
  const debtExpenses = periodExpenses.filter((expense) =>
    financialTreatmentOf(expense) !== "OPERATING",
  );

  const loadedMiles = sum(periodLoads, (l) => l.loadedMiles);
  const deadheadMiles = sum(periodLoads, (l) => l.deadheadMiles);
  const totalMiles = loadedMiles + deadheadMiles;
  const days = dayCountOf(range);

  if (totalMiles <= 0) {
    return {
      ...emptyCostPerMile(basisLabel, days),
      rangeStart: range.start,
      rangeEnd: range.end,
    };
  }

  const overrides = settings?.categoryBehavior;
  const buckets = new Map<ExpenseCategoryId, number>();
  for (const expense of operatingExpenses) {
    buckets.set(expense.category, (buckets.get(expense.category) ?? 0) + expense.amount);
  }

  const totalCost = roundMoney(sum(operatingExpenses, (e) => e.amount));
  const debtServiceTotal = roundMoney(sum(debtExpenses, (expense) => expense.amount));
  const cashCostTotal = roundMoney(totalCost + debtServiceTotal);
  // One filter, so a load-posted FUEL row (both a direct category AND a
  // derived id) is never subtracted twice.
  const directTripTotal = roundMoney(
    sum(
      operatingExpenses.filter(
        (e) => DIRECT_TRIP_CATEGORIES.includes(e.category) || isLoadExpenseId(e.id),
      ),
      (e) => e.amount,
    ),
  );

  const lines: CostLine[] = [...buckets.entries()]
    .map(([category, amount]) => {
      const def = getCategory(category);
      return {
        category: def.id,
        label: def.label,
        behavior: behaviorOf(category, overrides),
        amount: roundMoney(amount),
        perMile: div(amount, totalMiles),
        share: div(amount, totalCost) * 100,
      } satisfies CostLine;
    })
    .sort((a, b) => b.amount - a.amount);

  const fixed = lines.filter((l) => l.behavior === "FIXED");
  const variable = lines.filter((l) => l.behavior === "VARIABLE");
  const fixedTotal = roundMoney(sum(fixed, (l) => l.amount));
  const variableTotal = roundMoney(totalCost - fixedTotal);

  return {
    totalMiles,
    loadedMiles,
    deadheadMiles,
    fixedTotal,
    variableTotal,
    totalCost,
    debtServiceTotal,
    cashCostTotal,
    directTripTotal,
    fixedCostPerMile: div(fixedTotal, totalMiles),
    variableCostPerMile: div(variableTotal, totalMiles),
    trueCostPerMile: div(totalCost, totalMiles),
    actualCostPerMile: div(totalCost, totalMiles),
    debtServicePerMile: div(debtServiceTotal, totalMiles),
    cashCostPerMile: div(cashCostTotal, totalMiles),
    fixed,
    variable,
    lines,
    sufficient: true,
    basisLabel,
    days,
    rangeStart: range.start,
    rangeEnd: range.end,
  };
}

/** Miles the calculator should be shown before its numbers mean anything. */
export const MIN_BASIS_MILES = 500;
export const TRAILING_COST_DAYS = 90;

/**
 * Whether the calculator has enough evidence to allocate real operating
 * overhead to a proposed load.
 *
 * Miles alone are not evidence that insurance, maintenance and the rest of
 * the business's indirect operating costs were recorded. Require both the
 * minimum mileage sample and at least one operating dollar that is not a
 * direct trip cost. This is deliberately conservative: an incomplete ledger
 * stays unavailable instead of presenting a deceptively low break-even.
 */
export function hasSufficientOperatingCostBasis(basis: CostPerMile): boolean {
  if (!basis.sufficient || basis.totalMiles < MIN_BASIS_MILES) return false;
  return roundMoney(basis.totalCost - basis.directTripTotal) > 0;
}

/**
 * Whether a per-truck basis omits shared fleet costs from the same evidence
 * window. Until the owner chooses an allocation rule, those dollars cannot be
 * attributed to one unit without turning an accounting fact into a guess.
 */
export function hasUnallocatedSharedOperatingCosts(
  expenses: Expense[],
  basis: CostPerMile,
  today: string,
  days = TRAILING_COST_DAYS,
): boolean {
  const recentRange = basis.basisLabel === `Trailing ${days} days`
    ? { start: addDays(today, -(days - 1)), end: today }
    : null;

  return expenses.some((expense) =>
    isSharedOperatingOverhead(expense)
    && (!recentRange || inRange(expense.date, recentRange)),
  );
}

/**
 * Deterministically allocate shared operating overhead over every Fleet mile
 * recorded in the selected truck's evidence window. Every unit therefore gets
 * the same shared dollars-per-mile rate; no revenue or vehicle-size guess is
 * introduced. Returns null only when the Fleet mileage denominator is absent.
 */
export function sharedOperatingCostPerFleetMile(
  loads: Load[],
  expenses: Expense[],
  basis: CostPerMile,
): number | null {
  const range = basis.rangeStart && basis.rangeEnd
    ? { start: basis.rangeStart, end: basis.rangeEnd }
    : null;
  const inBasis = (date: string) => !range || inRange(date, range);
  const fleetMiles = sum(
    loads.filter((load) => inBasis(load.date)),
    (load) => load.loadedMiles + load.deadheadMiles,
  );
  if (fleetMiles <= 0) return null;

  const sharedOperatingTotal = sum(
    expenses.filter((expense) =>
      isSharedOperatingOverhead(expense)
      && inBasis(expense.date),
    ),
    (expense) => expense.amount,
  );

  return Math.round(div(sharedOperatingTotal, fleetMiles) * 10_000) / 10_000;
}

function isSharedOperatingOverhead(expense: Expense): boolean {
  return expense.scope === "BUSINESS"
    && financialTreatmentOf(expense) === "OPERATING"
    && !DIRECT_TRIP_CATEGORIES.includes(expense.category)
    && !isLoadExpenseId(expense.id);
}

/**
 * The stable cost basis used by the load calculator and the target rate tool.
 *
 * A rolling 90 days: recent enough to reflect today's fuel and insurance,
 * long enough that one repair or one annual permit does not swing it. Falls
 * back to every mile on record when the recent window is too thin to trust,
 * and reports which one it used through `basisLabel`.
 */
export function trailingCostBasis(
  loads: Load[],
  expenses: Expense[],
  settings: FinancialSettings | undefined,
  today: string,
  days = TRAILING_COST_DAYS,
): CostPerMile {
  const recent = calculateTrueCostPerMile(
    loads,
    expenses,
    { start: addDays(today, -(days - 1)), end: today },
    settings,
    `Trailing ${days} days`,
  );
  if (recent.sufficient && recent.totalMiles >= MIN_BASIS_MILES) return recent;

  const dates = [...loads.map((l) => l.date), ...expenses.map((e) => e.date)].sort();
  if (dates.length === 0) return emptyCostPerMile("No data yet", days);

  return calculateTrueCostPerMile(
    loads,
    expenses,
    { start: dates[0], end: dates[dates.length - 1] },
    settings,
    "All recorded history",
  );
}

/**
 * Normalized operating cost per mile with direct trip costs taken out.
 *
 * The load calculator asks for those four explicitly (they change load by
 * load), so charging the full Actual Cost Per Mile on top would count them
 * twice. What is left -- insurance, parking, permits, maintenance, repairs,
 * phone and accounting -- is operating overhead. Debt Service is never part
 * of this allocation.
 */
export function overheadCostPerMile(basis: CostPerMile): number {
  if (!basis.sufficient || basis.totalMiles <= 0) return 0;
  // Subtract the dollars, then divide once. Subtracting four already-divided
  // per-mile rates accumulates float noise into a number that is then
  // multiplied back up by hundreds of miles.
  //
  // `directTripTotal` (not a category filter) is the amount excluded: since
  // loads post their costs into the ledger, a load's "Other trip cost" row
  // lives under OTHER, and leaving it in the overhead would charge it twice
  // -- once as the calculator's explicit "Other costs" input and once inside
  // this rate.
  const overhead = Math.max(basis.totalCost - basis.directTripTotal, 0);
  return Math.round(div(overhead, basis.totalMiles) * 10_000) / 10_000;
}

function dayCountOf(range: DateRange): number {
  const start = Date.parse(`${range.start}T12:00:00`);
  const end = Date.parse(`${range.end}T12:00:00`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 1;
  return Math.max(1, Math.round((end - start) / 86_400_000) + 1);
}
