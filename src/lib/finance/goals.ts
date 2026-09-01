/**
 * GOALS, PACE AND PROJECTIONS
 * ===========================
 *
 * Targets are stored monthly and nothing else is stored at all. A half-month
 * or a week compares against a PRO-RATED share of the monthly target, scaled
 * by working days -- and it is always labelled as pro-rated, because the
 * target the owner set was a monthly one.
 *
 * Note the difference from cost per mile, where prorating is forbidden: a
 * target is a plan and can legitimately be spread; an expense is a fact and
 * cannot. Facts are never prorated, intentions are.
 *
 * A projection is an arithmetic extension of the pace so far, nothing more.
 * It is labelled a projection everywhere it appears and never presented as a
 * number the owner has.
 */

import { div, roundMoney, sum } from "../calculations";
import { addDays, dayCount, inRange, parseMonth, daysInMonth, type DateRange, type Period } from "../periods";
import type { Expense, FinancialGoal, Load, PeriodSummary } from "../types";
import { isOperatingExpenseCategory } from "./terminology";

/** Monday-start working week: 6 means Mon-Sat, 5 means Mon-Fri, 7 means every day. */
export function isWorkingDay(iso: string, workingDaysPerWeek: number): boolean {
  const day = new Date(`${iso}T12:00:00`).getDay(); // 0 Sun .. 6 Sat
  const index = day === 0 ? 6 : day - 1; // 0 Mon .. 6 Sun
  return index < Math.max(1, Math.min(7, Math.round(workingDaysPerWeek)));
}

export function workingDaysIn(range: DateRange, workingDaysPerWeek: number): number {
  let count = 0;
  let cursor = range.start;
  let guard = 0;
  while (cursor <= range.end && guard++ < 400) {
    if (isWorkingDay(cursor, workingDaysPerWeek)) count += 1;
    cursor = addDays(cursor, 1);
  }
  return count;
}

/** Share of a monthly target that belongs to this window, by working days. */
export function monthlyTargetShare(period: Period, goals: FinancialGoal): number {
  const { year, monthIndex } = parseMonth(period.month);
  const last = daysInMonth(year, monthIndex);
  const monthRange: DateRange = {
    start: `${period.month}-01`,
    end: `${period.month}-${String(last).padStart(2, "0")}`,
  };
  const monthDays = workingDaysIn(monthRange, goals.workingDaysPerWeek);
  if (monthDays === 0) return 1;

  if (period.key === "quarter") return 3;
  if (period.key === "ytd") return Math.max(1, monthIndex + 1);
  if (period.key === "full") return 1;

  // Deliberately NOT capped at 1: a custom range can span several months,
  // and its target is that many months' worth of the monthly figure. Windows
  // inside one month come out below 1 on their own.
  return div(workingDaysIn(period, goals.workingDaysPerWeek), monthDays);
}

export type GoalFormat = "money" | "rate" | "percent" | "count";

export interface GoalProgress {
  key: "revenue" | "profit" | "profitPerMile" | "deadhead" | "loads";
  label: string;
  current: number;
  target: number;
  /** 0-100+, clamped for the bar but reported raw here. */
  pct: number;
  format: GoalFormat;
  /** Deadhead is a ceiling: being under it is success. */
  lowerIsBetter: boolean;
  onTrack: boolean;
  /** True when the target shown was scaled down from a monthly figure. */
  prorated: boolean;
  note: string;
}

export function calculateGoalProgress(
  summary: PeriodSummary,
  goals: FinancialGoal,
  period: Period,
): GoalProgress[] {
  const share = monthlyTargetShare(period, goals);
  const prorated = Math.abs(share - 1) > 0.001;
  const scaleNote = prorated
    ? `${Math.round(share * 100)}% of your monthly target`
    : "Monthly target";

  const out: GoalProgress[] = [];

  if (goals.monthlyRevenueTarget > 0) {
    const target = roundMoney(goals.monthlyRevenueTarget * share);
    const pct = div(summary.bookedRevenue, target) * 100;
    out.push({
      key: "revenue",
      label: "You earned",
      current: summary.bookedRevenue,
      target,
      pct,
      format: "money",
      lowerIsBetter: false,
      onTrack: pct >= 100,
      prorated,
      note: scaleNote,
    });
  }

  if (goals.monthlyProfitTarget > 0) {
    const target = roundMoney(goals.monthlyProfitTarget * share);
    const pct = div(summary.operatingProfit, target) * 100;
    out.push({
      key: "profit",
      label: "Your business made",
      current: summary.operatingProfit,
      target,
      pct,
      format: "money",
      lowerIsBetter: false,
      onTrack: pct >= 100,
      prorated,
      note: scaleNote,
    });
  }

  if (goals.targetProfitPerMile > 0) {
    const pct = div(summary.profitPerMile, goals.targetProfitPerMile) * 100;
    out.push({
      key: "profitPerMile",
      label: "Profit / mile",
      current: summary.profitPerMile,
      target: goals.targetProfitPerMile,
      pct,
      format: "rate",
      lowerIsBetter: false,
      onTrack: summary.profitPerMile >= goals.targetProfitPerMile,
      prorated: false,
      // A rate does not scale with the length of the window.
      note: "Target rate, any period",
    });
  }

  if (goals.maxDeadheadPct > 0) {
    out.push({
      key: "deadhead",
      label: "Deadhead",
      current: summary.deadheadPct,
      target: goals.maxDeadheadPct,
      pct: div(summary.deadheadPct, goals.maxDeadheadPct) * 100,
      format: "percent",
      lowerIsBetter: true,
      onTrack: summary.deadheadPct <= goals.maxDeadheadPct,
      prorated: false,
      note: "Ceiling, any period",
    });
  }

  if (goals.targetLoads && goals.targetLoads > 0) {
    const target = Math.max(1, Math.round(goals.targetLoads * share));
    const pct = div(summary.loadCount, target) * 100;
    out.push({
      key: "loads",
      label: "Loads",
      current: summary.loadCount,
      target,
      pct,
      format: "count",
      lowerIsBetter: false,
      onTrack: pct >= 100,
      prorated,
      note: scaleNote,
    });
  }

  return out;
}

/* ---- Projection -------------------------------------------------------- */

export interface Projection {
  /** Whether a projection is meaningful: the window is live and has data. */
  applicable: boolean;
  elapsedDays: number;
  remainingDays: number;
  workingDaysElapsed: number;
  workingDaysRemaining: number;
  revenuePerWorkingDay: number;
  profitPerWorkingDay: number;
  projectedRevenue: number;
  projectedProfit: number;
  projectedLoads: number;
  /** Distance from the period's revenue target once projected out. */
  revenueTarget: number;
  revenueGap: number;
}

export function calculateProjection(
  summary: PeriodSummary,
  period: Period,
  goals: FinancialGoal,
  today: string,
): Projection {
  const inside = today >= period.start && today <= period.end;
  const elapsedEnd = inside ? today : period.end;
  const elapsedDays = dayCount({ start: period.start, end: elapsedEnd });
  const remainingDays = inside ? dayCount({ start: today, end: period.end }) - 1 : 0;

  const workingDaysElapsed = workingDaysIn(
    { start: period.start, end: elapsedEnd },
    goals.workingDaysPerWeek,
  );
  const workingDaysRemaining = inside
    ? workingDaysIn({ start: addDays(today, 1), end: period.end }, goals.workingDaysPerWeek)
    : 0;

  const revenuePerWorkingDay = div(summary.bookedRevenue, workingDaysElapsed);
  const profitPerWorkingDay = div(summary.operatingProfit, workingDaysElapsed);
  const revenueTarget = roundMoney(goals.monthlyRevenueTarget * monthlyTargetShare(period, goals));
  const projectedRevenue = roundMoney(
    summary.bookedRevenue + revenuePerWorkingDay * workingDaysRemaining,
  );

  return {
    applicable: inside && workingDaysElapsed > 0 && summary.loadCount > 0,
    elapsedDays,
    remainingDays,
    workingDaysElapsed,
    workingDaysRemaining,
    revenuePerWorkingDay,
    profitPerWorkingDay,
    projectedRevenue,
    projectedProfit: roundMoney(summary.operatingProfit + profitPerWorkingDay * workingDaysRemaining),
    projectedLoads: Math.round(
      summary.loadCount + div(summary.loadCount, workingDaysElapsed) * workingDaysRemaining,
    ),
    revenueTarget,
    revenueGap: roundMoney(revenueTarget - summary.bookedRevenue),
  };
}

/* ---- Today ------------------------------------------------------------- */

export type DayVerdict = "GOOD" | "ON_TRACK" | "BEHIND" | "NO_DATA";

export interface DaySnapshot {
  date: string;
  revenue: number;
  expenses: number;
  profit: number;
  miles: number;
  profitPerMile: number;
  loadCount: number;
  /** Daily profit target: the monthly target spread over working days. */
  target: number;
  delta: number;
  verdict: DayVerdict;
  statement: string;
}

export function dailyProfitTarget(month: string, goals: FinancialGoal): number {
  const { year, monthIndex } = parseMonth(month);
  const last = daysInMonth(year, monthIndex);
  const days = workingDaysIn(
    { start: `${month}-01`, end: `${month}-${String(last).padStart(2, "0")}` },
    goals.workingDaysPerWeek,
  );
  return roundMoney(div(goals.monthlyProfitTarget, days));
}

export function calculateDaySnapshot(
  loads: Load[],
  expenses: Expense[],
  date: string,
  goals: FinancialGoal,
): DaySnapshot {
  const range: DateRange = { start: date, end: date };
  const dayLoads = loads.filter((l) => inRange(l.date, range));
  const dayExpenses = expenses.filter((e) => inRange(e.date, range));

  const revenue = roundMoney(sum(dayLoads, (l) => l.grossRate));
  const spend = roundMoney(
    sum(dayExpenses.filter((expense) => isOperatingExpenseCategory(expense.category)), (e) => e.amount),
  );
  const profit = roundMoney(revenue - spend);
  const miles = sum(dayLoads, (l) => l.loadedMiles + l.deadheadMiles);
  const target = dailyProfitTarget(date.slice(0, 7), goals);
  const delta = roundMoney(profit - target);

  const empty = dayLoads.length === 0 && dayExpenses.length === 0;
  const verdict: DayVerdict = empty
    ? "NO_DATA"
    : target <= 0
      ? profit > 0
        ? "GOOD"
        : "BEHIND"
      : delta >= 0
        ? "GOOD"
        : delta >= -target * 0.25
          ? "ON_TRACK"
          : "BEHIND";

  const money = (value: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(Math.abs(value));

  const statement = empty
    ? "Nothing recorded yet today."
    : target <= 0
      ? `${money(profit)} of business profit today across ${dayLoads.length} ${dayLoads.length === 1 ? "load" : "loads"}. Set a monthly profit target to see a daily pace.`
      : delta >= 0
        ? `You are ${money(delta)} above your daily profit target of ${money(target)}.`
        : `You are ${money(delta)} below your daily profit target of ${money(target)}.`;

  return {
    date,
    revenue,
    expenses: spend,
    profit,
    miles,
    profitPerMile: div(profit, miles),
    loadCount: dayLoads.length,
    target,
    delta,
    verdict,
    statement,
  };
}
