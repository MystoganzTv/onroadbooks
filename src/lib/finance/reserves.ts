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
import type { ReserveAccount, ReserveBalance, ReserveTransaction } from "../types";

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
