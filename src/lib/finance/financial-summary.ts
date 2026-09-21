/**
 * The canonical period-level financial answer.
 *
 * Each reported load is received income on its load date. Historical payment
 * events remain stored but do not add income. Reserves use their configured
 * base; available money subtracts operating expenses, debt and reserves.
 */
import { summarizePeriod } from "../calculations";
import type {
  Expense,
  FinancialSettings,
  FinancialSummary,
  Load,
  PaymentEvent,
  ReserveAccount,
} from "../types";
import type { DateRange } from "../periods";
import { calculateSafeOwnerPay, resolveReserveRules } from "./owner-pay";

export function buildFinancialSummary(
  loads: Load[],
  expenses: Expense[],
  paymentEvents: PaymentEvent[],
  range: DateRange,
  settings: FinancialSettings,
  reserveAccounts: ReserveAccount[],
): FinancialSummary {
  const period = summarizePeriod(loads, expenses, range, settings, paymentEvents);
  const ownerPay = calculateSafeOwnerPay(
    period,
    resolveReserveRules(settings, reserveAccounts),
  );
  return {
    ...period,
    reserves: ownerPay.reserves,
    reserveTotal: ownerPay.reserveTotal,
    safeToPayYourself: ownerPay.safeToPay,
    safeToPay: ownerPay.safeToPay,
    takeHomeRate: ownerPay.takeHomeRate,
  };
}
