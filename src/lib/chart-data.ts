import { summarizePeriod } from "./calculations";
import { eachDay, monthsInRange, resolvePeriod, type Period } from "./periods";
import type { Expense, Load } from "./types";

export interface DayBucket {
  label: string;
  revenue: number;
  expenses: number;
  profit: number;
}

/**
 * Booked-revenue/operating-expense buckets across the selected period.
 *
 * Granularity follows the span rather than the period name: up to about two
 * months renders one bar per day, anything longer switches to months so a
 * year-to-date view never tries to draw 300 bars.
 */
export function periodBuckets(loads: Load[], expenses: Expense[], period: Period): DayBucket[] {
  if (period.days > 62) {
    return monthsInRange(period).map((month) => {
      const clamped = {
        start: month.start < period.start ? period.start : month.start,
        end: month.end > period.end ? period.end : month.end,
      };
      const summary = summarizePeriod(loads, expenses, clamped);
      return {
        label: month.shortLabel,
        revenue: summary.bookedRevenue,
        expenses: summary.operatingExpenses,
        profit: summary.operatingProfit,
      };
    });
  }

  const days = eachDay(period);
  const multiMonth = period.start.slice(0, 7) !== period.end.slice(0, 7);

  return days.map((day) => {
    const range = { start: day, end: day };
    const summary = summarizePeriod(loads, expenses, range);
    return {
      label: multiMonth || days.length <= 10 ? shortDay(day) : day.slice(-2),
      revenue: summary.bookedRevenue,
      expenses: summary.operatingExpenses,
      profit: summary.operatingProfit,
    };
  });
}

function shortDay(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/** The two halves of a month, side by side. */
export function halfMonthComparison(loads: Load[], expenses: Expense[], month: string) {
  return (["first", "second"] as const).map((key) => {
    const period = resolvePeriod(month, key);
    const summary = summarizePeriod(loads, expenses, period);
    return { period, summary };
  });
}
