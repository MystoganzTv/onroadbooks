/**
 * The period model -- one resolver for the whole app.
 *
 * Every screen filters through `resolvePeriod`, so "16-End" means the same
 * thing on the dashboard, the loads table, reports and the CSV exports.
 * A period is always an inclusive pair of calendar dates; nothing is ever
 * prorated or divided out of a larger total.
 */

export type PeriodKey =
  | "today"
  | "week"
  | "first"
  | "second"
  | "full"
  | "quarter"
  | "ytd"
  | "custom";

export interface DateRange {
  /** inclusive, "YYYY-MM-DD" */
  start: string;
  /** inclusive, "YYYY-MM-DD" */
  end: string;
}

export interface Period extends DateRange {
  key: PeriodKey;
  /** The anchor month the selector is sitting on, "2026-08". */
  month: string;
  label: string;
  shortLabel: string;
  /** Inclusive day count, used to pick chart granularity. */
  days: number;
}

export const PERIOD_OPTIONS: { key: PeriodKey; label: string; short: string; group: "quick" | "month" | "long" }[] = [
  { key: "today", label: "Today", short: "Today", group: "quick" },
  { key: "week", label: "This Week", short: "This Week", group: "quick" },
  { key: "first", label: "1 - 15", short: "1-15", group: "month" },
  { key: "second", label: "16 - End", short: "16-End", group: "month" },
  { key: "full", label: "Full Month", short: "Month", group: "month" },
  { key: "quarter", label: "Quarter", short: "Quarter", group: "long" },
  { key: "ytd", label: "Year to Date", short: "YTD", group: "long" },
  { key: "custom", label: "Custom", short: "Custom", group: "long" },
];

/** Period keys whose range does not depend on the month selector. */
export const FLOATING_PERIODS: PeriodKey[] = ["today", "week", "custom"];

export function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Today in the user's local calendar, as "YYYY-MM-DD". */
export function todayISO(): string {
  return toISODate(new Date());
}

export function currentMonth(): string {
  return todayISO().slice(0, 7);
}

export function parseMonth(month: string): { year: number; monthIndex: number } {
  const [y, m] = month.split("-").map((v) => Number.parseInt(v, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
    const now = new Date();
    return { year: now.getFullYear(), monthIndex: now.getMonth() };
  }
  return { year: y, monthIndex: m - 1 };
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export function monthLabel(month: string): string {
  const { year, monthIndex } = parseMonth(month);
  return new Date(year, monthIndex, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function monthShort(month: string): string {
  const { year, monthIndex } = parseMonth(month);
  return new Date(year, monthIndex, 1).toLocaleDateString("en-US", { month: "short" });
}

export function monthLabelShort(month: string): string {
  const { year, monthIndex } = parseMonth(month);
  return new Date(year, monthIndex, 1).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}

/** "Aug 24" -- used in range labels. */
function dayLabel(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function addDays(iso: string, delta: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + delta);
  return toISODate(d);
}

export function dayCount(range: DateRange): number {
  const start = Date.parse(`${range.start}T00:00:00Z`);
  const end = Date.parse(`${range.end}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 1;
  return Math.max(1, Math.round((end - start) / 86_400_000) + 1);
}

/** Monday-start week containing the given date. */
export function weekRange(iso: string): DateRange {
  const d = new Date(`${iso}T12:00:00`);
  const offset = (d.getDay() + 6) % 7; // Monday = 0
  const start = addDays(iso, -offset);
  return { start, end: addDays(start, 6) };
}

export function quarterOf(monthIndex: number): number {
  return Math.floor(monthIndex / 3) + 1;
}

export interface ResolveOptions {
  /**
   * Explicit range. Required for "custom"; also honoured for "today" and
   * "week" so the browser's calendar date wins over the server's timezone.
   */
  from?: string;
  to?: string;
  /** Overridable for deterministic tests. */
  today?: string;
}

/**
 * Resolves month + key (+ custom range) into one concrete inclusive range.
 * Unknown or malformed input falls back to the full anchor month rather
 * than throwing, so a hand-edited URL can never break a page.
 */
export function resolvePeriod(
  month: string,
  key: PeriodKey,
  options: ResolveOptions = {},
): Period {
  // "Today" must mean the user's today. Server rendering would otherwise use
  // the host timezone, which can be a day off from the browser that entered
  // the loads. PeriodControls sends the client date as `from`.
  const today =
    options.today ?? (isISODate(options.from) ? options.from! : todayISO());
  const { year, monthIndex } = parseMonth(month);
  const normalized = `${year}-${pad(monthIndex + 1)}`;
  const last = daysInMonth(year, monthIndex);

  const build = (
    k: PeriodKey,
    start: string,
    end: string,
    label: string,
    shortLabel: string,
    anchorMonth = normalized,
  ): Period => ({
    key: k,
    month: anchorMonth,
    start,
    end,
    label,
    shortLabel,
    days: dayCount({ start, end }),
  });

  switch (key) {
    case "today":
      return build(
        "today",
        today,
        today,
        `Today, ${dayLabel(today)}`,
        "Today",
        today.slice(0, 7),
      );

    case "week": {
      const range = weekRange(today);
      return build(
        "week",
        range.start,
        range.end,
        `This week - ${dayLabel(range.start)} to ${dayLabel(range.end)}`,
        "This Week",
        // Anchor on the month the week starts in: anchoring on the end would
        // jump the month selector forward for any week that straddles a
        // month boundary.
        range.start.slice(0, 7),
      );
    }

    case "first":
      return build(
        "first",
        `${normalized}-01`,
        `${normalized}-15`,
        `${monthLabel(normalized)} - 1 to 15`,
        `${monthShort(normalized)} 1-15`,
      );

    case "second":
      return build(
        "second",
        `${normalized}-16`,
        `${normalized}-${pad(last)}`,
        `${monthLabel(normalized)} - 16 to ${last}`,
        `${monthShort(normalized)} 16-${last}`,
      );

    case "quarter": {
      const q = quarterOf(monthIndex);
      const startMonth = (q - 1) * 3;
      const endMonth = startMonth + 2;
      return build(
        "quarter",
        `${year}-${pad(startMonth + 1)}-01`,
        `${year}-${pad(endMonth + 1)}-${pad(daysInMonth(year, endMonth))}`,
        `Q${q} ${year}`,
        `Q${q} ${year}`,
      );
    }

    case "ytd":
      return build(
        "ytd",
        `${year}-01-01`,
        `${normalized}-${pad(last)}`,
        `${year} year to date`,
        `${year} YTD`,
      );

    case "custom": {
      const from = isISODate(options.from) ? options.from! : `${normalized}-01`;
      const to = isISODate(options.to) ? options.to! : `${normalized}-${pad(last)}`;
      const [start, end] = from <= to ? [from, to] : [to, from];
      return build(
        "custom",
        start,
        end,
        `${dayLabel(start)} to ${dayLabel(end)}`,
        `${dayLabel(start)}-${dayLabel(end)}`,
        start.slice(0, 7),
      );
    }

    case "full":
    default:
      return build(
        "full",
        `${normalized}-01`,
        `${normalized}-${pad(last)}`,
        monthLabel(normalized),
        monthShort(normalized),
      );
  }
}

/**
 * True only for a date that exists. The regex alone would accept 2026-02-30,
 * which then rolls forward into March when parsed and makes the chart show
 * days the totals exclude.
 */
export function isISODate(value: string | undefined | null): boolean {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map((part) => Number.parseInt(part, 10));
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= daysInMonth(y, m - 1);
}

/**
 * The comparable period immediately before this one.
 *
 * Half-months compare against the other half rolling backwards, months
 * against the previous month, and floating or custom ranges against the
 * equally sized window that ends the day before they start.
 */
export function previousPeriod(period: Period): Period {
  const { year, monthIndex } = parseMonth(period.month);
  const prevMonthDate = new Date(year, monthIndex - 1, 1);
  const prevMonth = `${prevMonthDate.getFullYear()}-${pad(prevMonthDate.getMonth() + 1)}`;

  switch (period.key) {
    case "second":
      return resolvePeriod(period.month, "first");
    case "first":
      return resolvePeriod(prevMonth, "second");
    case "full":
      return resolvePeriod(prevMonth, "full");
    case "ytd":
      return resolvePeriod(`${year - 1}-${pad(monthIndex + 1)}`, "ytd");
    case "quarter": {
      const q = quarterOf(monthIndex);
      const anchor =
        q === 1 ? `${year - 1}-12` : `${year}-${pad((q - 2) * 3 + 1)}`;
      return resolvePeriod(anchor, "quarter");
    }
    case "today": {
      const yesterday = addDays(period.start, -1);
      return {
        ...resolvePeriod(yesterday.slice(0, 7), "custom", { from: yesterday, to: yesterday }),
        label: `Yesterday, ${dayLabel(yesterday)}`,
        shortLabel: "Yesterday",
      };
    }
    case "week": {
      const start = addDays(period.start, -7);
      const end = addDays(period.end, -7);
      return {
        ...resolvePeriod(start.slice(0, 7), "custom", { from: start, to: end }),
        label: `Previous week - ${dayLabel(start)} to ${dayLabel(end)}`,
        shortLabel: "Last Week",
      };
    }
    case "custom":
    default: {
      const end = addDays(period.start, -1);
      const start = addDays(end, -(period.days - 1));
      return resolvePeriod(start.slice(0, 7), "custom", { from: start, to: end });
    }
  }
}

export function shiftMonth(month: string, delta: number): string {
  const { year, monthIndex } = parseMonth(month);
  const d = new Date(year, monthIndex + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

/**
 * The date a new record should default to for the period on screen.
 *
 * Today when today falls inside the period, otherwise the period's first day.
 * Using period.start unconditionally booked new entries to 1 January on a
 * year-to-date view, and using today unconditionally made a record added
 * while viewing March vanish on save.
 */
export function defaultEntryDate(period: DateRange, today = todayISO()): string {
  if (today >= period.start && today <= period.end) return today;
  return period.start;
}

export function inRange(date: string, range: DateRange): boolean {
  return date >= range.start && date <= range.end;
}

/** Chronological list of months for pickers: 24 back, 1 forward. */
export function monthOptions(anchor: string): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  for (let i = -24; i <= 1; i += 1) {
    const value = shiftMonth(anchor, i);
    out.push({ value, label: monthLabel(value) });
  }
  return out.reverse();
}

/** Day buckets inside a range, for trend charts. */
export function eachDay(range: DateRange): string[] {
  const out: string[] = [];
  const start = new Date(`${range.start}T12:00:00`);
  const end = new Date(`${range.end}T12:00:00`);
  for (let d = start; d <= end; d.setDate(d.getDate() + 1)) {
    out.push(toISODate(d));
  }
  return out;
}

/** Half-month buckets ending with the anchor month's second half. */
export function trailingHalfMonths(month: string, count: number): Period[] {
  const out: Period[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const m = shiftMonth(month, -Math.floor(i / 2));
    out.push(resolvePeriod(m, i % 2 === 1 ? "first" : "second"));
  }
  return out;
}

export function trailingMonths(month: string, count: number): Period[] {
  const out: Period[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    out.push(resolvePeriod(shiftMonth(month, -i), "full"));
  }
  return out;
}

/** Every month a range touches, oldest first. */
export function monthsInRange(range: DateRange): Period[] {
  const out: Period[] = [];
  let cursor = range.start.slice(0, 7);
  const lastMonth = range.end.slice(0, 7);
  let guard = 0;
  while (cursor <= lastMonth && guard < 240) {
    out.push(resolvePeriod(cursor, "full"));
    cursor = shiftMonth(cursor, 1);
    guard += 1;
  }
  return out;
}
