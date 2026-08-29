/**
 * SAFE TO PAY YOURSELF
 * ====================
 *
 *     Gross revenue
 *   - Operating expenses
 *   -------------------------
 *   = Operating profit
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
  grossRevenue: number;
  operatingExpenses: number;
  operatingProfit: number;
  reserves: ReserveLine[];
  reserveTotal: number;
  safeToPay: number;
  /** Safe-to-pay as a share of gross revenue, 0-100. */
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
 * A reserve is charged against operating profit or against gross revenue,
 * whichever the bucket is configured for.
 *
 * Tax defaults to operating profit because tax follows profit, and a loss
 * reserves nothing (the base is floored at zero rather than going negative).
 * Maintenance defaults to gross revenue because the truck wears out whether
 * or not the month was profitable.
 */
export function calculateSafeOwnerPay(
  summary: Pick<PeriodSummary, "grossRevenue" | "operatingExpenses">,
  rules: ReserveRule[],
): OwnerPay {
  const grossRevenue = roundMoney(summary.grossRevenue);
  const operatingExpenses = roundMoney(summary.operatingExpenses);
  const operatingProfit = roundMoney(grossRevenue - operatingExpenses);

  const reserves: ReserveLine[] = rules.map((rule) => {
    const base = rule.basis === "OPERATING_PROFIT" ? Math.max(operatingProfit, 0) : grossRevenue;
    return { ...rule, amount: roundMoney(base * (rule.pct / 100)) };
  });

  const reserveTotal = roundMoney(reserves.reduce((total, r) => total + r.amount, 0));
  const safeToPay = roundMoney(operatingProfit - reserveTotal);

  return {
    grossRevenue,
    operatingExpenses,
    operatingProfit,
    reserves,
    reserveTotal,
    safeToPay,
    takeHomeRate: div(safeToPay, grossRevenue) * 100,
  };
}
