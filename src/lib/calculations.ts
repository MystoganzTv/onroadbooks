/**
 * Every financial formula in OnRoad Books lives here.
 *
 * Components never divide two numbers themselves -- they call these
 * helpers so a change to a definition (e.g. what counts as an operating
 * expense) propagates everywhere at once.
 *
 * All ratios go through `div`, which returns 0 instead of Infinity/NaN.
 */

import { behaviorOf, EXPENSE_CATEGORIES, getCategory } from "./categories";
import { inRange, type DateRange, type Period } from "./periods";
import type {
  CategoryTotal,
  ProfitabilityRating,
  Dataset,
  Expense,
  ExpenseBehavior,
  FinancialSettings,
  FuelEntry,
  Insight,
  Load,
  LoadMetrics,
  LoadWithMetrics,
  MoneyBreakdown,
  PeriodSummary,
  Truck,
} from "./types";

/* ---- Primitives ----------------------------------------------------- */

/** Divide-by-zero safe division. Returns 0 for any non-finite result. */
export function div(numerator: number, denominator: number): number {
  if (!denominator || !Number.isFinite(denominator) || !Number.isFinite(numerator)) return 0;
  const result = numerator / denominator;
  return Number.isFinite(result) ? result : 0;
}

export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  // Round half away from zero so +2.675 and -2.675 are treated alike, and
  // normalise -0 to 0 so a rounded-away loss never prints as "-$0.00".
  // The scaled value is re-quantised through 12 significant digits first:
  // 1.005 * 100 is 100.49999999999999 in binary floating point, and adding
  // Number.EPSILON cannot rescue a number that size, so without this step
  // the half-cent case silently rounded DOWN at most magnitudes.
  const scaled = Number((Math.abs(value) * 100).toPrecision(12));
  const rounded = Math.sign(value) * Math.round(scaled);
  const result = rounded / 100;
  return result === 0 ? 0 : result;
}

/** Coerces a possibly missing or non-finite numeric column to 0. */
export function num(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function sum<T>(items: T[], pick: (item: T) => number): number {
  return items.reduce((total, item) => {
    const v = pick(item);
    return total + (Number.isFinite(v) ? v : 0);
  }, 0);
}

/** Percentage change from `previous` to `current`. 0 when there is no base. */
export function pctChange(current: number, previous: number): number {
  if (!previous) return 0;
  return div(current - previous, Math.abs(previous)) * 100;
}

/* ---- Load level ----------------------------------------------------- */

/** Default rating thresholds, used when no settings are supplied. */
export const DEFAULT_RATING_THRESHOLDS: RatingThresholds = {
  great: 2,
  good: 1.5,
  marginal: 1,
};

export interface RatingThresholds {
  great: number;
  good: number;
  marginal: number;
}

export function thresholdsFromSettings(
  settings?: Pick<
    FinancialSettings,
    "ratingGreatPerMile" | "ratingGoodPerMile" | "ratingMarginalPerMile"
  >,
): RatingThresholds {
  if (!settings) return DEFAULT_RATING_THRESHOLDS;
  return {
    great: settings.ratingGreatPerMile ?? DEFAULT_RATING_THRESHOLDS.great,
    good: settings.ratingGoodPerMile ?? DEFAULT_RATING_THRESHOLDS.good,
    marginal: settings.ratingMarginalPerMile ?? DEFAULT_RATING_THRESHOLDS.marginal,
  };
}

/**
 * Rates a load on profit per TOTAL mile.
 *
 * Deliberately not gross rate per mile: a $3.50/mi load with 30% deadhead and
 * a dispatch cut can lose to a $2.90/mi load that runs clean. The rating is
 * only ever fed the number that survives deadhead and every trip cost.
 */
export function rateLoad(
  profitPerTotalMile: number,
  thresholds: RatingThresholds = DEFAULT_RATING_THRESHOLDS,
): ProfitabilityRating {
  if (profitPerTotalMile >= thresholds.great) return "GREAT";
  if (profitPerTotalMile >= thresholds.good) return "GOOD";
  if (profitPerTotalMile >= thresholds.marginal) return "MARGINAL";
  return "BAD";
}

/** Every trip cost on a load, itemised for the waterfall. */
export function tripExpenseLines(load: Load): { key: string; label: string; amount: number }[] {
  return [
    { key: "fuel", label: "Fuel", amount: load.fuelCost },
    { key: "tolls", label: "Tolls", amount: load.tolls },
    { key: "dispatch", label: "Dispatch", amount: load.dispatchFee },
    { key: "factoring", label: "Factoring", amount: load.factoringFee },
    { key: "other", label: "Other", amount: load.otherExpenses },
  ];
}

export function loadMetrics(load: Load, thresholds?: RatingThresholds): LoadMetrics {
  const totalMiles = num(load.loadedMiles) + num(load.deadheadMiles);
  // Summed defensively: a row written by an older build can be missing a fee
  // column, and a raw + would turn the whole waterfall into NaN -> 0.
  const tripExpenses =
    num(load.fuelCost) +
    num(load.tolls) +
    num(load.dispatchFee) +
    num(load.factoringFee) +
    num(load.otherExpenses);
  const tripProfit = num(load.grossRate) - tripExpenses;
  const profitPerMile = div(tripProfit, totalMiles);

  return {
    totalMiles,
    revenuePerLoadedMile: div(num(load.grossRate), num(load.loadedMiles)),
    revenuePerTotalMile: div(num(load.grossRate), totalMiles),
    tripExpenses: roundMoney(tripExpenses),
    tripProfit: roundMoney(tripProfit),
    profitPerMile,
    profitMargin: div(tripProfit, num(load.grossRate)) * 100,
    deadheadPct: div(num(load.deadheadMiles), totalMiles) * 100,
    rating: rateLoad(profitPerMile, thresholds ?? DEFAULT_RATING_THRESHOLDS),
  };
}

export function withMetrics(load: Load, thresholds?: RatingThresholds): LoadWithMetrics {
  return { ...load, metrics: loadMetrics(load, thresholds) };
}

export function withMetricsAll(loads: Load[], thresholds?: RatingThresholds): LoadWithMetrics[] {
  return loads.map((load) => withMetrics(load, thresholds));
}

/* ---- Period filtering ----------------------------------------------- */

export function loadsInPeriod(loads: Load[], range: DateRange): Load[] {
  return loads.filter((l) => inRange(l.date, range));
}

export function expensesInPeriod(expenses: Expense[], range: DateRange): Expense[] {
  return expenses.filter((e) => inRange(e.date, range));
}

export function fuelInPeriod(entries: FuelEntry[], range: DateRange): FuelEntry[] {
  return entries.filter((f) => inRange(f.date, range));
}

/* ---- Period summary -------------------------------------------------- */

/**
 * The single source of truth for "how did the truck do in this window".
 *
 * Revenue comes from loads dated inside the window. Operating expenses come
 * from the expense ledger dated inside the window -- trip-level fuel/tolls
 * recorded on a load are treated as detail for per-load profitability and
 * are NOT double counted here, because real spend is entered once in the
 * expense ledger (see docs in README).
 */
export function summarizePeriod(
  loads: Load[],
  expenses: Expense[],
  range: DateRange,
  settings?: FinancialSettings,
): PeriodSummary {
  const periodLoads = loadsInPeriod(loads, range);
  const periodExpenses = expensesInPeriod(expenses, range);

  const grossRevenue = roundMoney(sum(periodLoads, (l) => l.grossRate));
  const operatingExpenses = roundMoney(sum(periodExpenses, (e) => e.amount));
  const netProfit = roundMoney(grossRevenue - operatingExpenses);

  const loadedMiles = sum(periodLoads, (l) => l.loadedMiles);
  const deadheadMiles = sum(periodLoads, (l) => l.deadheadMiles);
  const totalMiles = loadedMiles + deadheadMiles;

  const overrides = settings?.categoryBehavior;
  const fixedExpenses = roundMoney(
    sum(
      periodExpenses.filter((e) => behaviorOf(e.category, overrides) === "FIXED"),
      (e) => e.amount,
    ),
  );

  return {
    grossRevenue,
    operatingExpenses,
    netProfit,
    netMargin: div(netProfit, grossRevenue) * 100,
    totalMiles,
    loadedMiles,
    deadheadMiles,
    deadheadPct: div(deadheadMiles, totalMiles) * 100,
    revenuePerMile: div(grossRevenue, totalMiles),
    costPerMile: div(operatingExpenses, totalMiles),
    profitPerMile: div(netProfit, totalMiles),
    loadCount: periodLoads.length,
    paidRevenue: roundMoney(
      sum(
        periodLoads.filter((l) => l.status === "PAID"),
        (l) => l.grossRate,
      ),
    ),
    outstandingRevenue: roundMoney(
      sum(
        periodLoads.filter((l) => l.status !== "PAID"),
        (l) => l.grossRate,
      ),
    ),
    fixedExpenses,
    variableExpenses: roundMoney(operatingExpenses - fixedExpenses),
    fuelExpense: roundMoney(
      sum(
        periodExpenses.filter((e) => e.category === "FUEL"),
        (e) => e.amount,
      ),
    ),
    maintenanceExpense: roundMoney(
      sum(
        periodExpenses.filter((e) => e.category === "MAINTENANCE" || e.category === "REPAIRS"),
        (e) => e.amount,
      ),
    ),
    revenuePerLoadedMile: div(grossRevenue, loadedMiles),
    variableCostPerMile: div(roundMoney(operatingExpenses - fixedExpenses), totalMiles),
  };
}

/* ---- Deadhead economics --------------------------------------------- */

export interface DeadheadAnalysis {
  deadheadMiles: number;
  loadedMiles: number;
  totalMiles: number;
  deadheadPct: number;
  /** True once deadhead crosses the configured warning threshold. */
  elevated: boolean;
  warnPct: number;
  /** Variable spend attributable to running empty. */
  deadheadCost: number;
  /** That cost spread over every mile driven -- the drag on the whole period. */
  costPerTotalMile: number;
  /**
   * Revenue per loaded mile minus revenue per total mile: how much rate the
   * deadhead is diluting away.
   */
  revenueDilutionPerMile: number;
  /** Revenue that would have been earned if these miles had been loaded. */
  opportunityRevenue: number;
}

/**
 * Deadhead has two costs: the variable money spent running empty, and the
 * revenue those miles would have earned if they had been loaded. Both are
 * reported because owner-operators trade them off differently.
 *
 * LEGACY: every screen and export now uses finance/deadhead.ts
 * (`calculateDeadheadCost`), which prices empty miles at the TRUE cost per
 * mile so the number matches the dashboard card. Do not wire this variant
 * into new surfaces -- two definitions of "deadhead cost" on screen at once
 * was an audit finding.
 */
export function analyzeDeadhead(
  summary: PeriodSummary,
  settings?: Pick<FinancialSettings, "deadheadWarnPct">,
): DeadheadAnalysis {
  const warnPct = settings?.deadheadWarnPct ?? 20;
  const deadheadCost = roundMoney(summary.deadheadMiles * summary.variableCostPerMile);

  return {
    deadheadMiles: summary.deadheadMiles,
    loadedMiles: summary.loadedMiles,
    totalMiles: summary.totalMiles,
    deadheadPct: summary.deadheadPct,
    elevated: summary.deadheadPct > warnPct,
    warnPct,
    deadheadCost,
    costPerTotalMile: div(deadheadCost, summary.totalMiles),
    revenueDilutionPerMile: summary.revenuePerLoadedMile - summary.revenuePerMile,
    opportunityRevenue: roundMoney(summary.deadheadMiles * summary.revenuePerLoadedMile),
  };
}

/* ---- Broker performance --------------------------------------------- */

export interface BrokerPerformance {
  broker: string;
  loadCount: number;
  revenue: number;
  totalMiles: number;
  loadedMiles: number;
  deadheadPct: number;
  tripExpenses: number;
  tripProfit: number;
  profitPerMile: number;
  revenuePerLoadedMile: number;
  outstanding: number;
  rating: ProfitabilityRating;
}

/**
 * Answers "which brokers are actually making me money" using trip profit per
 * total mile, not the rate they advertise.
 */
export function brokerPerformance(
  loads: LoadWithMetrics[],
  thresholds: RatingThresholds = DEFAULT_RATING_THRESHOLDS,
): BrokerPerformance[] {
  const buckets = new Map<string, LoadWithMetrics[]>();
  for (const load of loads) {
    const key = load.broker?.trim() || "No broker";
    const bucket = buckets.get(key);
    if (bucket) bucket.push(load);
    else buckets.set(key, [load]);
  }

  return [...buckets.entries()]
    .map(([broker, group]) => {
      const revenue = roundMoney(sum(group, (l) => l.grossRate));
      const totalMiles = sum(group, (l) => l.metrics.totalMiles);
      const loadedMiles = sum(group, (l) => l.loadedMiles);
      const tripProfit = roundMoney(sum(group, (l) => l.metrics.tripProfit));
      const profitPerMile = div(tripProfit, totalMiles);

      return {
        broker,
        loadCount: group.length,
        revenue,
        totalMiles,
        loadedMiles,
        deadheadPct: div(totalMiles - loadedMiles, totalMiles) * 100,
        tripExpenses: roundMoney(sum(group, (l) => l.metrics.tripExpenses)),
        tripProfit,
        profitPerMile,
        revenuePerLoadedMile: div(revenue, loadedMiles),
        outstanding: roundMoney(
          sum(
            group.filter((l) => l.status !== "PAID"),
            (l) => l.grossRate,
          ),
        ),
        rating: rateLoad(profitPerMile, thresholds),
      } satisfies BrokerPerformance;
    })
    .sort((a, b) => b.tripProfit - a.tripProfit);
}

/** Rating distribution across a set of loads, for the dashboard summary. */
export function ratingBreakdown(loads: LoadWithMetrics[]): {
  rating: ProfitabilityRating;
  count: number;
  revenue: number;
  share: number;
}[] {
  const order: ProfitabilityRating[] = ["GREAT", "GOOD", "MARGINAL", "BAD"];
  return order.map((rating) => {
    const group = loads.filter((l) => l.metrics.rating === rating);
    return {
      rating,
      count: group.length,
      revenue: roundMoney(sum(group, (l) => l.grossRate)),
      share: div(group.length, loads.length) * 100,
    };
  });
}

export function emptySummary(): PeriodSummary {
  return summarizePeriod([], [], { start: "2000-01-01", end: "2000-01-01" });
}

/* ---- Money breakdown ------------------------------------------------- */

/**
 * Gross revenue - operating expenses = operating profit.
 * Reserves come off operating profit / gross revenue, and what is left is
 * the number the owner can actually spend.
 *
 * LEGACY: only knows the two built-in buckets at their default bases. The
 * app, the exports and the Settings preview all use finance/owner-pay.ts
 * (`resolveReserveRules` + `calculateSafeOwnerPay`), which honours every
 * active bucket -- this one disagreed with Safe to Pay the moment a custom
 * bucket existed. Do not wire it into new surfaces.
 */
export function moneyBreakdown(
  summary: PeriodSummary,
  settings: Pick<FinancialSettings, "taxReservePct" | "maintenanceReservePct">,
): MoneyBreakdown {
  const operatingProfit = roundMoney(summary.grossRevenue - summary.operatingExpenses);
  const taxReserve = roundMoney(Math.max(operatingProfit, 0) * (settings.taxReservePct / 100));
  const maintenanceReserve = roundMoney(
    summary.grossRevenue * (settings.maintenanceReservePct / 100),
  );

  return {
    grossRevenue: summary.grossRevenue,
    operatingExpenses: summary.operatingExpenses,
    operatingProfit,
    taxReserve,
    taxReservePct: settings.taxReservePct,
    maintenanceReserve,
    maintenanceReservePct: settings.maintenanceReservePct,
    availableCash: roundMoney(operatingProfit - taxReserve - maintenanceReserve),
  };
}

/* ---- Expense analytics ---------------------------------------------- */

export function categoryTotals(
  expenses: Expense[],
  settings?: FinancialSettings,
): CategoryTotal[] {
  const total = sum(expenses, (e) => e.amount);
  const buckets = new Map<string, { amount: number; count: number }>();

  for (const expense of expenses) {
    const current = buckets.get(expense.category) ?? { amount: 0, count: 0 };
    current.amount += expense.amount;
    current.count += 1;
    buckets.set(expense.category, current);
  }

  return [...buckets.entries()]
    .map(([category, value]) => {
      const def = getCategory(category);
      return {
        category: def.id,
        label: def.label,
        behavior: behaviorOf(category, settings?.categoryBehavior),
        amount: roundMoney(value.amount),
        share: div(value.amount, total) * 100,
        count: value.count,
      } satisfies CategoryTotal;
    })
    .sort((a, b) => b.amount - a.amount);
}

export function behaviorTotals(
  expenses: Expense[],
  settings?: FinancialSettings,
): Record<ExpenseBehavior, number> {
  const overrides = settings?.categoryBehavior;
  let fixed = 0;
  let variable = 0;
  for (const e of expenses) {
    if (behaviorOf(e.category, overrides) === "FIXED") fixed += e.amount;
    else variable += e.amount;
  }
  return { FIXED: roundMoney(fixed), VARIABLE: roundMoney(variable) };
}

/* ---- Fuel ------------------------------------------------------------ */

export interface FuelSummary {
  totalGallons: number;
  totalCost: number;
  averagePricePerGallon: number;
  fuelCostPerMile: number;
  entryCount: number;
  /** Odometer-derived MPG. Null until two odometer readings exist. */
  milesPerGallon: number | null;
  odometerMiles: number | null;
}

export function summarizeFuel(entries: FuelEntry[], totalMiles: number): FuelSummary {
  const totalGallons = sum(entries, (f) => f.gallons);
  const totalCost = roundMoney(sum(entries, (f) => f.totalCost));

  // MPG architecture: consecutive odometer readings bound the distance
  // covered by the gallons purchased between them. An odometer is a fact
  // about ONE vehicle, so entries are grouped by truck first -- subtracting
  // one truck's reading from another's produced triple-digit "MPG" on any
  // fleet view. The combined figure is total span miles over total gallons
  // burned across each truck's own span.
  const byTruck = new Map<string, FuelEntry[]>();
  for (const entry of entries) {
    if (typeof entry.odometer !== "number" || entry.odometer <= 0) continue;
    const key = entry.truckId ?? "";
    const group = byTruck.get(key);
    if (group) group.push(entry);
    else byTruck.set(key, [entry]);
  }

  let milesPerGallon: number | null = null;
  let odometerMiles: number | null = null;
  let spanMiles = 0;
  let spanGallons = 0;
  let spans = 0;

  for (const group of byTruck.values()) {
    if (group.length < 2) continue;
    const ordered = [...group].sort((a, b) => a.odometer! - b.odometer!);
    spanMiles += ordered[ordered.length - 1].odometer! - ordered[0].odometer!;
    // Gallons that fuelled each span exclude that truck's first fill-up.
    spanGallons += sum(ordered.slice(1), (f) => f.gallons);
    spans += 1;
  }

  if (spans > 0 && spanMiles > 0) {
    odometerMiles = spanMiles;
    const mpg = div(spanMiles, spanGallons);
    milesPerGallon = mpg > 0 ? mpg : null;
  }

  return {
    // Kept at full precision: rounding here made the printed total disagree
    // with the sum of the printed rows.
    totalGallons: Math.round(totalGallons * 1000) / 1000,
    totalCost,
    averagePricePerGallon: div(totalCost, totalGallons),
    fuelCostPerMile: div(totalCost, totalMiles),
    entryCount: entries.length,
    milesPerGallon,
    odometerMiles,
  };
}

/* ---- Truck lifetime -------------------------------------------------- */

export interface TruckLifetime {
  totalRevenue: number;
  totalExpenses: number;
  lifetimeProfit: number;
  totalMiles: number;
  costPerMile: number;
  revenuePerMile: number;
  profitPerMile: number;
  odometerMiles: number;
  loadCount: number;
}

export function truckLifetime(dataset: Dataset, truck: Truck): TruckLifetime {
  const loads = dataset.loads.filter((l) => l.truckId === truck.id);
  // Only what this unit caused. Business overhead is charged once, at the
  // fleet level -- imputing it to a truck would invent a cost per unit, and
  // the shape of that lie is the whole reason expenses carry a scope.
  const expenses = dataset.expenses.filter(
    (e) => e.scope !== "BUSINESS" && e.truckId === truck.id,
  );

  const totalRevenue = roundMoney(sum(loads, (l) => l.grossRate));
  const totalExpenses = roundMoney(sum(expenses, (e) => e.amount));
  const totalMiles = sum(loads, (l) => l.loadedMiles + l.deadheadMiles);
  const lifetimeProfit = roundMoney(totalRevenue - totalExpenses);

  return {
    totalRevenue,
    totalExpenses,
    lifetimeProfit,
    totalMiles,
    costPerMile: div(totalExpenses, totalMiles),
    revenuePerMile: div(totalRevenue, totalMiles),
    profitPerMile: div(lifetimeProfit, totalMiles),
    odometerMiles: Math.max(truck.currentOdometer - truck.startingOdometer, 0),
    loadCount: loads.length,
  };
}

/* ---- Insights -------------------------------------------------------- */

/**
 * Deterministic operational insights. No model calls -- these are ranked
 * observations produced from the same numbers shown on screen.
 */
export interface InsightContext {
  deadhead?: DeadheadAnalysis;
  topBroker?: BrokerPerformance;
}

export function buildInsights(
  current: PeriodSummary,
  previous: PeriodSummary,
  categories: CategoryTotal[],
  fuel: FuelSummary,
  period: Period,
  context: InsightContext = {},
): Insight[] {
  const insights: Insight[] = [];

  if (current.loadCount === 0) {
    return [
      {
        id: "empty",
        tone: "neutral",
        text: `No loads recorded for ${period.label}. Add a load to see how the truck performed.`,
      },
    ];
  }

  if (previous.loadCount > 0 && previous.profitPerMile !== 0) {
    const delta = pctChange(current.profitPerMile, previous.profitPerMile);
    if (Math.abs(delta) >= 1) {
      insights.push({
        id: "ppm-trend",
        tone: delta >= 0 ? "positive" : "negative",
        text: `Your profit per mile ${delta >= 0 ? "improved" : "declined"} ${Math.abs(delta).toFixed(1)}% compared with the previous period.`,
      });
    }
  }

  const fuelCategory = categories.find((c) => c.category === "FUEL");
  if (fuelCategory && fuelCategory.share > 0) {
    insights.push({
      id: "fuel-share",
      tone: fuelCategory.share > 35 ? "warning" : "neutral",
      text: `Fuel represented ${fuelCategory.share.toFixed(1)}% of your total operating expenses.`,
    });
  }

  if (current.totalMiles > 0) {
    const deadhead = context.deadhead;
    insights.push({
      id: "deadhead",
      tone: deadhead?.elevated ? "warning" : "positive",
      text: deadhead
        ? `Deadhead is ${current.deadheadPct.toFixed(1)}% of total miles and is costing approximately ${formatUsd(deadhead.costPerTotalMile)} per total mile this period.`
        : `Deadhead is currently ${current.deadheadPct.toFixed(1)}% of your total miles.`,
    });
  }

  if (context.topBroker && context.topBroker.loadCount > 1) {
    const broker = context.topBroker;
    insights.push({
      id: "top-broker",
      tone: "positive",
      text: `${broker.broker} is your most profitable broker this period: ${formatUsd(broker.tripProfit)} across ${broker.loadCount} loads at ${formatUsd(broker.profitPerMile)} per mile.`,
    });
  }

  if (current.netMargin !== 0) {
    insights.push({
      id: "margin",
      tone: current.netMargin >= 40 ? "positive" : current.netMargin >= 15 ? "neutral" : "negative",
      text: `Net margin is ${current.netMargin.toFixed(1)}% -- you keep ${formatUsd(current.netMargin / 100)} of every revenue dollar before reserves.`,
    });
  }

  if (current.outstandingRevenue > 0) {
    insights.push({
      id: "outstanding",
      tone: "warning",
      text: `${formatUsd(current.outstandingRevenue)} of revenue is still pending or invoiced and has not been collected.`,
    });
  }

  if (fuel.milesPerGallon) {
    insights.push({
      id: "mpg",
      tone: "neutral",
      text: `Odometer readings put the truck at ${fuel.milesPerGallon.toFixed(1)} MPG across ${Math.round(fuel.odometerMiles ?? 0).toLocaleString()} tracked miles.`,
    });
  }

  const topFixed = categories.filter((c) => c.behavior === "FIXED");
  const fixedShare = div(current.fixedExpenses, current.operatingExpenses) * 100;
  if (topFixed.length > 0 && fixedShare > 0) {
    insights.push({
      id: "fixed-share",
      tone: fixedShare > 60 ? "warning" : "neutral",
      text: `Fixed costs are ${fixedShare.toFixed(1)}% of spend, or ${formatUsd(div(current.fixedExpenses, current.totalMiles))} per mile.`,
    });
  }

  return insights;
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

/* ---- Trend series ---------------------------------------------------- */

export interface TrendPoint {
  label: string;
  revenue: number;
  expenses: number;
  profit: number;
  revenuePerMile: number;
  costPerMile: number;
  profitPerMile: number;
  miles: number;
}

export function buildTrend(
  loads: Load[],
  expenses: Expense[],
  periods: Period[],
  /** Drop leading periods with no activity so a chart starts where data does. */
  trimLeadingEmpty = true,
): TrendPoint[] {
  const points = periods.map((period) => {
    const s = summarizePeriod(loads, expenses, period);
    return {
      label: period.shortLabel,
      revenue: s.grossRevenue,
      expenses: s.operatingExpenses,
      profit: s.netProfit,
      revenuePerMile: roundMoney(s.revenuePerMile),
      costPerMile: roundMoney(s.costPerMile),
      profitPerMile: roundMoney(s.profitPerMile),
      miles: s.totalMiles,
    };
  });

  if (!trimLeadingEmpty) return points;
  const firstActive = points.findIndex((p) => p.revenue !== 0 || p.expenses !== 0);
  return firstActive <= 0 ? points : points.slice(firstActive);
}

/** All categories, including zero-value ones, for the settings matrix. */
export function allCategoriesWithBehavior(settings: FinancialSettings) {
  return EXPENSE_CATEGORIES.map((c) => ({
    ...c,
    behavior: behaviorOf(c.id, settings.categoryBehavior),
  }));
}
