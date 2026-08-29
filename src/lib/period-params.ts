import {
  currentMonth,
  isISODate,
  resolvePeriod,
  type Period,
  type PeriodKey,
} from "./periods";

export type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const VALID: PeriodKey[] = [
  "today",
  "week",
  "first",
  "second",
  "full",
  "quarter",
  "ytd",
  "custom",
];

/**
 * Reads the period out of the URL. State lives there so every server
 * component on a page computes from the same range, and any view is
 * shareable, bookmarkable and directly exportable.
 *
 *   ?month=2026-08&period=second
 *   ?period=custom&from=2026-08-04&to=2026-08-19
 */
export function periodFromSearchParams(params: SearchParams): Period {
  const monthRaw = first(params.month);
  const month = monthRaw && /^\d{4}-\d{2}$/.test(monthRaw) ? monthRaw : currentMonth();
  const keyRaw = first(params.period) as PeriodKey | undefined;
  const key = keyRaw && VALID.includes(keyRaw) ? keyRaw : "full";
  const from = first(params.from);
  const to = first(params.to);

  return resolvePeriod(month, key, {
    from: isISODate(from) ? from : undefined,
    to: isISODate(to) ? to : undefined,
  });
}

/** Rebuilds the query string that reproduces a period, for links and exports. */
export function periodQuery(period: Period): string {
  const params = new URLSearchParams({ month: period.month, period: period.key });
  if (period.key === "custom" || period.key === "today" || period.key === "week") {
    params.set("from", period.start);
    params.set("to", period.end);
  }
  return params.toString();
}

export function param(params: SearchParams, name: string, fallback = ""): string {
  return first(params[name]) ?? fallback;
}
