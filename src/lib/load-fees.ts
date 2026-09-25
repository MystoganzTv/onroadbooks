import { roundMoney } from "./calculations";
import type { Load } from "./types";

/**
 * Dispatch and factoring are charged as a share of the load's rate (6 % and
 * 3.5 % are typical), so the load form lets the owner type either the
 * percentage or the dollar amount. Only dollars are stored; these helpers
 * convert both ways without drifting a cent.
 */
export type FeeMode = "pct" | "amount";

export interface FeeDefaults {
  dispatchPct: number | null;
  factoringPct: number | null;
}

/** Dollars owed for `pct` percent of `grossRate`. */
export function feeFromPercent(grossRate: number, pct: number): number {
  if (!Number.isFinite(grossRate) || !Number.isFinite(pct)) return 0;
  return roundMoney((grossRate * pct) / 100);
}

/** `fee` as a percentage of `grossRate`, rounded to two decimals. */
export function percentOfRate(fee: number, grossRate: number): number | null {
  if (!(grossRate > 0) || !(fee >= 0)) return null;
  return Math.round((fee / grossRate) * 10_000) / 100;
}

/**
 * The percentage a stored fee was entered at, when it is one: the rounded
 * percentage has to reproduce the stored dollars exactly, otherwise the
 * amount was typed as dollars and is shown as dollars.
 */
export function exactPercentOfRate(fee: number, grossRate: number): number | null {
  if (!(fee > 0)) return null;
  const pct = percentOfRate(fee, grossRate);
  if (pct === null) return null;
  return feeFromPercent(grossRate, pct) === roundMoney(fee) ? pct : null;
}

/**
 * The owner's current dispatch and factoring rates, read from the most
 * recent load that carried each fee. The latest load wins over an average so
 * a rate change takes effect on the very next load.
 */
export function latestFeeDefaults(
  loads: Pick<Load, "date" | "createdAt" | "grossRate" | "dispatchFee" | "factoringFee">[],
): FeeDefaults {
  const newest = [...loads].sort(
    (a, b) => b.date.localeCompare(a.date) || (b.createdAt ?? "").localeCompare(a.createdAt ?? ""),
  );
  const pick = (field: "dispatchFee" | "factoringFee") => {
    const load = newest.find((row) => row.grossRate > 0 && row[field] > 0);
    return load ? percentOfRate(load[field], load.grossRate) : null;
  };
  return { dispatchPct: pick("dispatchFee"), factoringPct: pick("factoringFee") };
}
