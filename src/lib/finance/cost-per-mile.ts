/**
 * TRUE COST PER MILE -- methodology
 * =================================
 *
 * One rule, applied everywhere:
 *
 *     true cost per mile = every operating expense dated inside the window
 *                          -------------------------------------------------
 *                          every mile driven inside the window (loaded + deadhead)
 *
 * Consequences that are deliberate, not accidental:
 *
 *  1. Nothing is prorated. A 1-15 settlement is NOT "half the month's costs".
 *     If the truck note posts on the 1st, the first half of the month really
 *     did carry it, and the second half really did not. Splitting a monthly
 *     total in half would invent a number that never happened.
 *  2. Expenses come from the expense ledger only. Trip-level fuel, tolls,
 *     dispatch and factoring recorded on a Load feed per-load profitability
 *     and never enter a period total -- see the double-counting rule in
 *     README / lib/calculations.ts.
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
import { addDays, inRange, type DateRange } from "../periods";
import type {
  Expense,
  ExpenseBehavior,
  ExpenseCategoryId,
  FinancialSettings,
  Load,
} from "../types";

export interface CostLine {
  category: ExpenseCategoryId;
  label: string;
  behavior: ExpenseBehavior;
  amount: number;
  perMile: number;
  /** Share of the true cost per mile, 0-100. */
  share: number;
}

export interface CostPerMile {
  totalMiles: number;
  loadedMiles: number;
  deadheadMiles: number;
  fixedTotal: number;
  variableTotal: number;
  totalCost: number;
  fixedCostPerMile: number;
  variableCostPerMile: number;
  trueCostPerMile: number;
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
    fixedCostPerMile: 0,
    variableCostPerMile: 0,
    trueCostPerMile: 0,
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

  const loadedMiles = sum(periodLoads, (l) => l.loadedMiles);
  const deadheadMiles = sum(periodLoads, (l) => l.deadheadMiles);
  const totalMiles = loadedMiles + deadheadMiles;
  const days = dayCountOf(range);

  if (totalMiles <= 0) return { ...emptyCostPerMile(basisLabel, days) };

  const overrides = settings?.categoryBehavior;
  const buckets = new Map<ExpenseCategoryId, number>();
  for (const expense of periodExpenses) {
    buckets.set(expense.category, (buckets.get(expense.category) ?? 0) + expense.amount);
  }

  const totalCost = roundMoney(sum(periodExpenses, (e) => e.amount));

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
    fixedCostPerMile: div(fixedTotal, totalMiles),
    variableCostPerMile: div(variableTotal, totalMiles),
    trueCostPerMile: div(totalCost, totalMiles),
    fixed,
    variable,
    lines,
    sufficient: true,
    basisLabel,
    days,
  };
}

/** Miles the calculator should be shown before its numbers mean anything. */
export const MIN_BASIS_MILES = 500;
export const TRAILING_COST_DAYS = 90;

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
 * Cost per mile with fuel, tolls, dispatch and factoring taken out.
 *
 * The load calculator asks for those four explicitly (they change load by
 * load), so charging the full true cost per mile on top would count them
 * twice. What is left -- the truck note, insurance, parking, permits,
 * maintenance, repairs, phone, accounting -- is the overhead every mile has
 * to carry whatever the load pays.
 */
export function overheadCostPerMile(basis: CostPerMile): number {
  if (!basis.sufficient || basis.totalMiles <= 0) return 0;
  // Subtract the dollars, then divide once. Subtracting four already-divided
  // per-mile rates accumulates float noise into a number that is then
  // multiplied back up by hundreds of miles.
  const direct = basis.lines
    .filter((l) => DIRECT_TRIP_CATEGORIES.includes(l.category))
    .reduce((total, l) => total + l.amount, 0);
  const overhead = Math.max(basis.totalCost - direct, 0);
  return Math.round(div(overhead, basis.totalMiles) * 10_000) / 10_000;
}

function dayCountOf(range: DateRange): number {
  const start = Date.parse(`${range.start}T12:00:00`);
  const end = Date.parse(`${range.end}T12:00:00`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 1;
  return Math.max(1, Math.round((end - start) / 86_400_000) + 1);
}
