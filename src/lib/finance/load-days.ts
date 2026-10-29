/**
 * "Was this load worth my time?" -- the per-day view of a load.
 *
 * Per mile says whether the RATE was good; per day says whether the TIME was.
 * A load can pay $2.12/mi and still tie the truck up for a week. This module
 * counts the days a load held the truck and sets what it left per day against
 * what the truck costs per day standing still. It never touches the rating:
 * that stays per mile (see calculations.ts).
 *
 * Days are calendar days, first pickup through last delivery, inclusive. A day
 * between legs with nothing on the truck still counts as busy -- the truck
 * could not take other work and insurance and the note kept running -- and is
 * reported as idle so the owner sees it.
 */
import { calculateDriverPay } from "../driver-pay";
import { addDays, dayCount } from "../periods";
import { activeRecurringExpenses } from "../recurring-expenses";
import { div, roundMoney } from "../calculations";
import type { Driver, Expense, Load } from "../types";

export type LoadDayKind = "PICKUP" | "DELIVERY" | "PICKUP_DELIVERY" | "HANDOFF" | "IN_TRANSIT" | "IDLE";

export interface LoadDay {
  date: string;
  kind: LoadDayKind;
  /** 1-based leg the day belongs to; null when idle. */
  leg: number | null;
}

export interface LoadDays {
  /** False when no leg has a delivery date: the span is unknown. */
  complete: boolean;
  start: string;
  end: string;
  /** Calendar days the truck was held, first pickup to last delivery. */
  busyDays: number;
  /** Days with freight on the truck (or being picked up / delivered). */
  loadedDays: number;
  idleDays: number;
  days: LoadDay[];
}

type LegSpan = { start: string; end: string };

function spans(load: Pick<Load, "date" | "deliveryDate" | "extraLegs">): LegSpan[] {
  const span = (start: string, end: string | null | undefined): LegSpan => ({ start, end: end && end >= start ? end : start });
  return [
    span(load.date, load.deliveryDate),
    ...(load.extraLegs ?? []).filter((leg) => leg.pickupDate).map((leg) => span(leg.pickupDate, leg.deliveryDate)),
  ];
}

export function loadDays(load: Pick<Load, "date" | "deliveryDate" | "extraLegs">): LoadDays {
  const legs = spans(load);
  const complete = Boolean(load.deliveryDate) || (load.extraLegs ?? []).some((leg) => leg.deliveryDate);
  const start = legs.reduce((min, leg) => (leg.start < min ? leg.start : min), legs[0].start);
  const end = legs.reduce((max, leg) => (leg.end > max ? leg.end : max), legs[0].end);
  const busyDays = dayCount({ start, end });

  const days: LoadDay[] = [];
  for (let i = 0, date = start; i < busyDays; i += 1, date = addDays(date, 1)) {
    const ends = legs.findIndex((leg) => leg.end === date && leg.start !== date);
    const starts = legs.findIndex((leg) => leg.start === date);
    const within = legs.findIndex((leg) => leg.start <= date && date <= leg.end);
    let kind: LoadDayKind;
    let leg: number | null;
    if (starts >= 0 && ends >= 0) { kind = "HANDOFF"; leg = starts + 1; }
    else if (starts >= 0) { kind = legs[starts].end === date ? "PICKUP_DELIVERY" : "PICKUP"; leg = starts + 1; }
    else if (ends >= 0) { kind = "DELIVERY"; leg = ends + 1; }
    else if (within >= 0) { kind = "IN_TRANSIT"; leg = within + 1; }
    else { kind = "IDLE"; leg = null; }
    days.push({ date, kind, leg });
  }
  const idleDays = days.filter((day) => day.kind === "IDLE").length;
  return { complete, start, end, busyDays, loadedDays: busyDays - idleDays, idleDays, days };
}

/** What the assigned driver earns on this load: the frozen figure once paid, else their pay rule. */
export function driverPayForLoad(load: Load, drivers: Driver[]): number {
  if (load.driverPay > 0) return roundMoney(load.driverPay);
  const driver = load.driverId ? drivers.find((row) => row.id === load.driverId) : undefined;
  return driver ? calculateDriverPay(driver.payType, driver.payRate, load) : 0;
}

export interface FixedCostPerDay {
  /** Monthly bills the owner marked "repeat every month", for this truck or the business. */
  monthly: number;
  perDay: number;
  bills: string[];
}

/** The truck's monthly fixed bills spread over the days of a year (x12 / 365). */
export function fixedCostPerDay(expenses: Expense[], truckId: string, today: string): FixedCostPerDay {
  const bills = activeRecurringExpenses(expenses, today).filter((bill) => bill.truckId === null || bill.truckId === truckId);
  const monthly = roundMoney(bills.reduce((total, bill) => total + bill.amount, 0));
  return { monthly, perDay: roundMoney((monthly * 12) / 365), bills: bills.map((bill) => bill.description) };
}

export interface LoadPerDay {
  days: LoadDays;
  /** Trip profit (detention included, trip costs and fuel estimate out) less driver pay. */
  profit: number;
  driverPay: number;
  profitPerDay: number;
  fixed: FixedCostPerDay;
  leftPerDay: number;
}

export function loadPerDay(input: {
  load: Load;
  tripProfit: number;
  drivers: Driver[];
  expenses: Expense[];
  today: string;
}): LoadPerDay {
  const days = loadDays(input.load);
  const driverPay = driverPayForLoad(input.load, input.drivers);
  const profit = roundMoney(input.tripProfit - driverPay);
  const profitPerDay = roundMoney(div(profit, days.busyDays));
  const fixed = fixedCostPerDay(input.expenses, input.load.truckId, input.today);
  return { days, profit, driverPay, profitPerDay, fixed, leftPerDay: roundMoney(profitPerDay - fixed.perDay) };
}
