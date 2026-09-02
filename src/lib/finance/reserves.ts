/**
 * RESERVE BUCKETS
 * ===============
 *
 * Virtual buckets, not bank accounts. Nothing here moves real money; they are
 * a planning ledger that answers "am I actually setting enough aside".
 *
 * A balance is always a running sum of signed transactions -- never a stored
 * column that could drift from its own history. Contributions are positive,
 * withdrawals negative, adjustments either way, and the sign is decided once,
 * in the store, when the row is written.
 *
 * Contributions post when a settlement is CLOSED, which is what ties a bucket
 * to a period the owner actually reviewed. Manual contributions, withdrawals
 * (paying for the oil change out of the maintenance bucket) and corrections
 * are always available on top.
 */

import { div, roundMoney } from "../calculations";
import { inRange, type DateRange } from "../periods";
import type { Load, ReserveAccount, ReserveBalance, ReserveTransaction, Truck } from "../types";

export interface TruckMaintenanceReserve {
  truckId: string;
  truckName: string;
  active: boolean;
  bookedRevenue: number;
  revenueSharePct: number;
  suggestedReserve: number;
}

/**
 * Explains a fleet maintenance recommendation unit by unit.
 *
 * The canonical reserve formula remains fleet booked revenue × configured
 * rate. Rounding happens at the fleet level, then any cent difference from
 * rounding the unit rows is assigned to the highest-revenue unit. That keeps
 * the visible unit breakdown exactly reconstructable to the fleet total.
 */
export function calculateTruckMaintenanceReserves(
  trucks: Pick<Truck, "id" | "name" | "active">[],
  loads: Pick<Load, "truckId" | "date" | "grossRate">[],
  period: DateRange,
  contributionPct: number,
): TruckMaintenanceReserve[] {
  const revenueByTruck = new Map<string, number>();
  for (const load of loads) {
    if (!inRange(load.date, period)) continue;
    revenueByTruck.set(
      load.truckId,
      roundMoney((revenueByTruck.get(load.truckId) ?? 0) + load.grossRate),
    );
  }

  const rows = trucks
    .filter((truck) => truck.active || (revenueByTruck.get(truck.id) ?? 0) !== 0)
    .map((truck) => {
      const bookedRevenue = roundMoney(revenueByTruck.get(truck.id) ?? 0);
      return {
        truckId: truck.id,
        truckName: truck.name,
        active: truck.active,
        bookedRevenue,
        revenueSharePct: 0,
        suggestedReserve: roundMoney(bookedRevenue * (contributionPct / 100)),
      };
    });

  const fleetRevenue = roundMoney(rows.reduce((total, row) => total + row.bookedRevenue, 0));
  if (fleetRevenue <= 0 || rows.length === 0) return rows;

  for (const row of rows) {
    row.revenueSharePct = div(row.bookedRevenue, fleetRevenue) * 100;
  }

  const fleetRecommendation = roundMoney(fleetRevenue * (contributionPct / 100));
  const unitRecommendation = roundMoney(
    rows.reduce((total, row) => total + row.suggestedReserve, 0),
  );
  const roundingDifference = roundMoney(fleetRecommendation - unitRecommendation);
  if (roundingDifference !== 0) {
    const largest = rows.reduce((best, row) =>
      row.bookedRevenue > best.bookedRevenue ? row : best,
    );
    largest.suggestedReserve = roundMoney(largest.suggestedReserve + roundingDifference);
  }

  return rows;
}

export function calculateReserveBalances(
  accounts: ReserveAccount[],
  transactions: ReserveTransaction[],
  period?: DateRange,
): ReserveBalance[] {
  return [...accounts]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
    .map((account) => {
      const rows = transactions
        .filter((t) => t.accountId === account.id)
        .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

      const inPeriod = period ? rows.filter((t) => inRange(t.date, period)) : [];
      const positive = (list: ReserveTransaction[]) =>
        roundMoney(list.filter((t) => t.amount > 0).reduce((n, t) => n + t.amount, 0));
      const negative = (list: ReserveTransaction[]) =>
        roundMoney(Math.abs(list.filter((t) => t.amount < 0).reduce((n, t) => n + t.amount, 0)));

      const balance = roundMoney(rows.reduce((n, t) => n + t.amount, 0));

      return {
        account,
        balance,
        contributions: positive(rows),
        withdrawals: negative(rows),
        periodContributions: positive(inPeriod),
        periodWithdrawals: negative(inPeriod),
        transactions: rows,
        targetProgress:
          account.targetBalance && account.targetBalance > 0
            ? Math.min(div(balance, account.targetBalance) * 100, 999)
            : null,
      } satisfies ReserveBalance;
    });
}

export function reserveBalanceFor(
  balances: ReserveBalance[],
  kind: ReserveAccount["kind"],
): ReserveBalance | undefined {
  return balances.find((b) => b.account.kind === kind);
}

export function totalReserved(balances: ReserveBalance[]): number {
  return roundMoney(balances.reduce((total, b) => total + b.balance, 0));
}
