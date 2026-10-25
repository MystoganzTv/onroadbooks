import { eachDay, monthsInRange, type DateRange } from "./periods";
import type { Load } from "./types";

/**
 * A trip that "lasts" longer than this is almost certainly a typo in the
 * delivery date (2027 for 2026). Counting it would paint weeks of the
 * calendar as worked, so such a load counts only its pickup day.
 */
export const MAX_TRIP_DAYS = 14;

/**
 * worked   -- a load was on the truck that day (pickup through delivery).
 * off      -- the day is over and no load touched it.
 * booked   -- a future day a load is already scheduled on.
 * upcoming -- today or later with nothing on it yet. Not "off": the day is
 *             not over, and calling it idle would shame a morning.
 * before   -- earlier than the first load ever recorded. The business was not
 *             running yet, so those days are neither worked nor off.
 */
export type WorkDayState = "worked" | "off" | "booked" | "upcoming" | "before";

export interface WorkDay {
  date: string;
  state: WorkDayState;
  loadCount: number;
}

export interface WorkMonth {
  month: string;
  worked: number;
  off: number;
  booked: number;
  upcoming: number;
}

export interface WorkedDaysReport {
  days: WorkDay[];
  months: WorkMonth[];
  worked: number;
  off: number;
  booked: number;
  upcoming: number;
  /** worked / (worked + off), over elapsed days only. Null before any day has elapsed. */
  workedShare: number | null;
  /** The longest run of consecutive "off" days inside the range. */
  longestOffStreak: number;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Every calendar day a load occupied, pickup through delivery. */
export function tripDays(load: Pick<Load, "date" | "deliveryDate">): string[] {
  if (!ISO_DAY.test(load.date)) return [];
  const end =
    load.deliveryDate && ISO_DAY.test(load.deliveryDate) && load.deliveryDate >= load.date
      ? load.deliveryDate
      : load.date;
  const days = eachDay({ start: load.date, end });
  return days.length > MAX_TRIP_DAYS ? [load.date] : days;
}

/**
 * Which days in the range the truck(s) worked.
 *
 * Scope is the caller's: pass one truck's loads for that truck, or the whole
 * fleet's, in which case a day counts when ANY unit had a load.
 */
export function workedDays(
  loads: Pick<Load, "date" | "deliveryDate">[],
  range: DateRange,
  today: string,
): WorkedDaysReport {
  // Pass every load in scope, not just the period's: the first one ever
  // recorded is where "days off" can start counting.
  const counts = new Map<string, number>();
  let firstDay: string | null = null;
  for (const load of loads) {
    for (const day of tripDays(load)) {
      if (firstDay === null || day < firstDay) firstDay = day;
      if (day < range.start || day > range.end) continue;
      counts.set(day, (counts.get(day) ?? 0) + 1);
    }
  }

  const days: WorkDay[] = eachDay(range).map((date) => {
    const loadCount = counts.get(date) ?? 0;
    const state: WorkDayState = firstDay === null || date < firstDay
      ? "before"
      : loadCount > 0
      ? (date <= today ? "worked" : "booked")
      : (date < today ? "off" : "upcoming");
    return { date, state, loadCount };
  });

  const tally = (list: WorkDay[], state: WorkDayState) =>
    list.filter((day) => day.state === state).length;

  const months: WorkMonth[] = monthsInRange(range).flatMap(({ month }) => {
    const inMonth = days.filter((day) => day.date.startsWith(month) && day.state !== "before");
    if (inMonth.length === 0) return [];
    return [{
      month,
      worked: tally(inMonth, "worked"),
      off: tally(inMonth, "off"),
      booked: tally(inMonth, "booked"),
      upcoming: tally(inMonth, "upcoming"),
    }];
  });

  let longestOffStreak = 0;
  let run = 0;
  for (const day of days) {
    run = day.state === "off" ? run + 1 : 0;
    longestOffStreak = Math.max(longestOffStreak, run);
  }

  const worked = tally(days, "worked");
  const off = tally(days, "off");
  return {
    days,
    months,
    worked,
    off,
    booked: tally(days, "booked"),
    upcoming: tally(days, "upcoming"),
    workedShare: worked + off > 0 ? worked / (worked + off) : null,
    longestOffStreak,
  };
}
