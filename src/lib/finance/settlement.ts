/**
 * SETTLEMENTS
 * ===========
 *
 * The owner reviews the business twice a month: the 1st-15th and the 16th to
 * the end of the month. A settlement is that review made permanent.
 *
 * While it is OPEN the figures are live -- add a load, the settlement moves.
 * CLOSING it freezes a snapshot. That snapshot is the one place in the app
 * where a calculated value is stored, and it is stored on purpose: a
 * settlement the owner already paid themselves on must not silently rewrite
 * itself six weeks later because a reserve percentage changed. Reopening
 * clears the snapshot and reverses the reserve contributions the close
 * posted -- nothing else.
 *
 * Half-month cost per mile uses the miles and the expenses that actually fell
 * in that half. Monthly totals are never halved.
 */

import { div, summarizePeriod } from "../calculations";
import { daysInMonth, monthLabel, parseMonth, type DateRange } from "../periods";
import type {
  Expense,
  FinancialSettings,
  Load,
  ReserveAccount,
  Settlement,
  SettlementHalf,
  SettlementSnapshot,
} from "../types";
import { calculateTrueCostPerMile } from "./cost-per-mile";
import { calculateSafeOwnerPay, resolveReserveRules } from "./owner-pay";

export function settlementBounds(month: string, half: SettlementHalf): DateRange {
  const { year, monthIndex } = parseMonth(month);
  const last = daysInMonth(year, monthIndex);
  return half === "FIRST"
    ? { start: `${month}-01`, end: `${month}-15` }
    : { start: `${month}-16`, end: `${month}-${String(last).padStart(2, "0")}` };
}

export function settlementLabel(month: string, half: SettlementHalf): string {
  const { year, monthIndex } = parseMonth(month);
  const last = daysInMonth(year, monthIndex);
  return half === "FIRST"
    ? `${monthLabel(month)} - 1 to 15 Settlement`
    : `${monthLabel(month)} - 16 to ${last} Settlement`;
}

export function settlementShortLabel(month: string, half: SettlementHalf): string {
  const { year, monthIndex } = parseMonth(month);
  const last = daysInMonth(year, monthIndex);
  const name = monthLabel(month).split(" ")[0].slice(0, 3);
  return half === "FIRST" ? `${name} 1-15` : `${name} 16-${last}`;
}

export function settlementId(month: string, half: SettlementHalf): string {
  return `stl_${month}_${half === "FIRST" ? "a" : "b"}`;
}

/** Every settlement window from `from` (inclusive) through `to`, newest first. */
export function settlementWindows(
  fromMonth: string,
  toMonth: string,
): { month: string; half: SettlementHalf }[] {
  const out: { month: string; half: SettlementHalf }[] = [];
  const from = parseMonth(fromMonth);
  const to = parseMonth(toMonth);
  let year = from.year;
  let index = from.monthIndex;
  let guard = 0;

  while ((year < to.year || (year === to.year && index <= to.monthIndex)) && guard++ < 240) {
    const month = `${year}-${String(index + 1).padStart(2, "0")}`;
    out.push({ month, half: "FIRST" }, { month, half: "SECOND" });
    index += 1;
    if (index > 11) {
      index = 0;
      year += 1;
    }
  }
  return out.reverse();
}

/** The numbers a settlement is closed on, computed from live rows. */
export function buildSettlementSnapshot(
  loads: Load[],
  expenses: Expense[],
  range: DateRange,
  settings: FinancialSettings,
  accounts: ReserveAccount[],
): SettlementSnapshot {
  const summary = summarizePeriod(loads, expenses, range, settings);
  const rules = resolveReserveRules(settings, accounts);
  const pay = calculateSafeOwnerPay(summary, rules);
  const cost = calculateTrueCostPerMile(loads, expenses, range, settings, "Settlement window");

  return {
    grossRevenue: pay.grossRevenue,
    operatingExpenses: pay.operatingExpenses,
    operatingProfit: pay.operatingProfit,
    reserves: pay.reserves.map((r) => ({
      accountId: r.accountId,
      name: r.name,
      kind: r.kind,
      pct: r.pct,
      basis: r.basis,
      amount: r.amount,
    })),
    reserveTotal: pay.reserveTotal,
    safeToPay: pay.safeToPay,
    loadCount: summary.loadCount,
    totalMiles: summary.totalMiles,
    loadedMiles: summary.loadedMiles,
    deadheadMiles: summary.deadheadMiles,
    deadheadPct: summary.deadheadPct,
    fixedCostPerMile: cost.fixedCostPerMile,
    variableCostPerMile: cost.variableCostPerMile,
    trueCostPerMile: cost.trueCostPerMile,
    revenuePerMile: summary.revenuePerMile,
    profitPerMile: summary.profitPerMile,
  };
}

export interface SettlementView {
  id: string;
  month: string;
  half: SettlementHalf;
  label: string;
  shortLabel: string;
  range: DateRange;
  status: "OPEN" | "CLOSED";
  closedAt: string | null;
  notes: string | null;
  /** What the settlement reports: the frozen snapshot once closed, live otherwise. */
  figures: SettlementSnapshot;
  /** Always the live recomputation, for the drift comparison. */
  live: SettlementSnapshot;
  /**
   * True when a CLOSED settlement no longer matches the current data -- a
   * backdated expense, an edited load, a changed reserve rate. Surfaced, never
   * auto-applied.
   */
  drifted: boolean;
  driftAmount: number;
  /** Whether the window has finished, so it can legitimately be closed. */
  complete: boolean;
}

export function calculateSettlement(
  month: string,
  half: SettlementHalf,
  loads: Load[],
  expenses: Expense[],
  settings: FinancialSettings,
  accounts: ReserveAccount[],
  stored: Settlement | undefined,
  today: string,
): SettlementView {
  const range = settlementBounds(month, half);
  const live = buildSettlementSnapshot(loads, expenses, range, settings, accounts);
  const closed = stored?.status === "CLOSED" && stored.snapshot;
  const figures = closed ? stored.snapshot! : live;
  const driftAmount = closed ? Math.round((live.safeToPay - figures.safeToPay) * 100) / 100 : 0;

  return {
    id: stored?.id ?? settlementId(month, half),
    month,
    half,
    label: settlementLabel(month, half),
    shortLabel: settlementShortLabel(month, half),
    range,
    status: closed ? "CLOSED" : "OPEN",
    closedAt: stored?.closedAt ?? null,
    notes: stored?.notes ?? null,
    figures,
    live,
    drifted: Boolean(closed) && Math.abs(driftAmount) >= 0.01,
    driftAmount,
    complete: today > range.end,
  };
}

/** Change in safe-to-pay against the settlement before it. */
export function settlementDelta(current: SettlementView, previous?: SettlementView): number {
  if (!previous) return 0;
  return div(
    current.figures.safeToPay - previous.figures.safeToPay,
    Math.abs(previous.figures.safeToPay),
  ) * 100;
}
