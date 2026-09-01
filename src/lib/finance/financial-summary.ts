/**
 * The canonical period-level financial answer.
 *
 * Performance uses Booked Revenue. Liquidity uses Payment Events (with a
 * read-only legacy fallback). Reserves use their configured performance base,
 * while Safe to Pay Yourself is always capped by collected cash.
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
