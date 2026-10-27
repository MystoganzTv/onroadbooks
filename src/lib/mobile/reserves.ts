import { summarizePeriod } from "@/lib/calculations";
import { orderedTrucks } from "@/lib/fleet";
import { calculateSafeOwnerPay, resolveReserveRules } from "@/lib/finance/owner-pay";
import { calculateReserveBalances, calculateTruckMaintenanceReserves, totalReserved } from "@/lib/finance/reserves";
import { FINANCIAL_MODEL_VERSION } from "@/lib/finance/terminology";
import type { Period } from "@/lib/periods";
import type { Dataset } from "@/lib/types";

/** Keep the web's calculated set-asides separate from posted reserve movements. */
export function mobileReserveLedger(dataset: Dataset, period: Period) {
  const { loads, expenses, settings, reserveAccounts, reserveTransactions, paymentEvents } = dataset;
  const balances = calculateReserveBalances(reserveAccounts, reserveTransactions, period);
  const rules = resolveReserveRules(settings, reserveAccounts);
  const ownerPay = calculateSafeOwnerPay(
    summarizePeriod(loads, expenses, period, settings, paymentEvents),
    rules,
  );

  return {
    periodLabel: period.label,
    calculationVersion: FINANCIAL_MODEL_VERSION,
    total: totalReserved(balances),
    suggestedTotal: ownerPay.reserveTotal,
    periodContributions: balances.reduce((sum, b) => sum + b.periodContributions, 0),
    periodWithdrawals: balances.reduce((sum, b) => sum + b.periodWithdrawals, 0),
    safeToPay: ownerPay.safeToPay,
    bookedRevenue: ownerPay.bookedRevenue,
    collectedRevenue: ownerPay.collectedRevenue,
    accountsReceivable: ownerPay.accountsReceivable,
    cashAfterDebtService: ownerPay.cashAfterDebtService,
    debtService: ownerPay.debtService,
    accounts: balances.map((entry) => {
      const rule = rules.find((r) => r.accountId === entry.account.id);
      return {
        id: entry.account.id,
        name: entry.account.name,
        balance: entry.balance,
        suggestedContribution: ownerPay.reserves.find((reserve) => reserve.accountId === entry.account.id)?.amount ?? 0,
        maintenanceByTruck: entry.account.kind === "MAINTENANCE" && rule?.basis === "GROSS_REVENUE"
          ? calculateTruckMaintenanceReserves(orderedTrucks(dataset.trucks), loads, period, rule.pct)
          : [],
        periodContributions: entry.periodContributions,
        periodWithdrawals: entry.periodWithdrawals,
        targetBalance: entry.account.targetBalance ?? null,
        // Percent of the target, or null when no target is set. Unlike the
        // money-flow bars, a target here is real, so a progress bar means
        // what it looks like.
        targetProgress: entry.targetProgress,
        rulePct: rule?.pct ?? null,
        ruleBasis: rule?.basis ?? null,
      };
    }),
    // The most recent movements across every account, so the screen can show
    // what actually happened rather than only where things stand.
    movements: balances
      .flatMap((entry) =>
        entry.transactions.map((transaction) => ({
          id: transaction.id,
          accountName: entry.account.name,
          date: transaction.date,
          amount: transaction.amount,
          description: transaction.description,
          // Movements a settlement close posted by itself read differently
          // from ones he entered by hand, so the app can say which is which.
          automatic: transaction.settlementId !== null,
        })),
      )
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
      .slice(0, 12),
  };
}
