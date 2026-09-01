/**
 * SAFE TO PAY YOURSELF
 * ====================
 *
 *     Collected revenue
 *   - Operating expenses
 *   - Debt service
 *   -------------------------
 *   = Cash after debt service
 *   - Tax reserve
 *   - Maintenance reserve
 *   - Any other configured reserve
 *   -------------------------
 *   = SAFE TO PAY YOURSELF
 *
 * This is a planning figure, not a bank balance and not tax advice. It says:
 * of the profit this window produced, this much is not already spoken for by
 * the reserves the owner configured.
 *
 * Reserve rates are stored in exactly one place each. The two built-in
 * buckets read their rate from FinancialSettings (taxReservePct,
 * maintenanceReservePct, both edited on the Settings page); any bucket the
 * owner adds carries its own. `resolveReserveRules` is the single reader that
 * merges the two, so no other module needs to know the difference.
 */

import { div, roundMoney } from "../calculations";
import type {
  FinancialSettings,
  PeriodSummary,
  ReserveAccount,
  ReserveBasis,
  ReserveKind,
} from "../types";

export interface ReserveRule {
  accountId: string;
  name: string;
  kind: ReserveKind;
  basis: ReserveBasis;
  /** Percent, e.g. 20 = 20%. */
  pct: number;
}

export interface ReserveLine extends ReserveRule {
  amount: number;
}

export interface OwnerPay {
  calculationVersion: number;
  bookedRevenue: number;
  collectedRevenue: number;
  accountsReceivable: number;
  unallocatedCollectedRevenue: number;
  interestExpense: number;
  principalPayment: number;
  unallocatedDebtService: number;
  debtService: number;
  cashAfterDebtService: number;
  /** @deprecated Use bookedRevenue. */
  grossRevenue: number;
  operatingExpenses: number;
  operatingProfit: number;
  reserves: ReserveLine[];
  reserveTotal: number;
  safeToPay: number;
  /** Safe-to-pay as a share of collected revenue, 0-100. */
  takeHomeRate: number;
}

export function resolveReserveRules(
  settings: Pick<FinancialSettings, "taxReservePct" | "maintenanceReservePct">,
  accounts: ReserveAccount[],
): ReserveRule[] {
  return accounts
    .filter((account) => account.active)
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
    .map((account) => ({
      accountId: account.id,
      name: account.name,
      kind: account.kind,
      basis: account.basis,
      pct:
        account.kind === "TAX"
          ? (settings.taxReservePct ?? 0)
          : account.kind === "MAINTENANCE"
            ? (settings.maintenanceReservePct ?? 0)
            : (account.contributionPct ?? 0),
    }));
}

/**
 * A reserve is charged against operating profit or against booked revenue,
 * whichever the bucket is configured for.
 *
 * Tax defaults to operating profit because tax follows profit, and a loss
 * reserves nothing (the base is floored at zero rather than going negative).
 * Maintenance defaults to booked revenue because the truck wears out whether
 * or not the month was profitable.
 */
export function calculateSafeOwnerPay(
  summary: Pick<
    PeriodSummary,
    | "calculationVersion"
    | "bookedRevenue"
    | "collectedRevenue"
    | "accountsReceivable"
    | "unallocatedCollectedRevenue"
    | "operatingExpenses"
    | "operatingProfit"
    | "interestExpense"
    | "principalPayment"
    | "unallocatedDebtService"
    | "debtService"
    | "cashAfterDebtService"
  >,
  rules: ReserveRule[],
): OwnerPay {
  const bookedRevenue = roundMoney(summary.bookedRevenue);
  const collectedRevenue = roundMoney(summary.collectedRevenue);
  const operatingExpenses = roundMoney(summary.operatingExpenses);
  const operatingProfit = roundMoney(summary.operatingProfit);
  const cashAfterDebtService = roundMoney(summary.cashAfterDebtService);

  const reserves: ReserveLine[] = rules.map((rule) => {
    const base =
      rule.basis === "OPERATING_PROFIT" ? Math.max(operatingProfit, 0) : bookedRevenue;
    return { ...rule, amount: roundMoney(base * (rule.pct / 100)) };
  });

  const reserveTotal = roundMoney(reserves.reduce((total, r) => total + r.amount, 0));
  // Cash is the hard ceiling. Booked but unpaid revenue can increase business
  // performance and reserve requirements, never the amount free to withdraw.
  const safeToPay = roundMoney(cashAfterDebtService - reserveTotal);

  return {
    calculationVersion: summary.calculationVersion,
    bookedRevenue,
    collectedRevenue,
    accountsReceivable: roundMoney(summary.accountsReceivable),
    unallocatedCollectedRevenue: roundMoney(summary.unallocatedCollectedRevenue),
    interestExpense: roundMoney(summary.interestExpense),
    principalPayment: roundMoney(summary.principalPayment),
    unallocatedDebtService: roundMoney(summary.unallocatedDebtService),
    debtService: roundMoney(summary.debtService),
    cashAfterDebtService,
    grossRevenue: bookedRevenue,
    operatingExpenses,
    operatingProfit,
    reserves,
    reserveTotal,
    safeToPay,
    takeHomeRate: div(safeToPay, collectedRevenue) * 100,
  };
}
