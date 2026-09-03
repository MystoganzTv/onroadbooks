import { roundMoney } from "@/lib/calculations";
import type { Expense, FinancialObligation } from "@/lib/types";

export interface DebtBalanceSummary {
  startingBalance: number | null;
  principalPaid: number;
  currentBalance: number | null;
}

/**
 * The remaining principal is ledger-derived. Interest and unclassified debt
 * payments are real cash out, but neither may silently reduce the balance.
 */
export function summarizeDebtBalance(
  obligation: FinancialObligation,
  expenses: Expense[],
  throughDate?: string,
): DebtBalanceSummary {
  const principalPaid = roundMoney(expenses.reduce((total, expense) => {
    if (
      expense.obligationId !== obligation.id
      || expense.financialTreatment !== "PRINCIPAL"
      || (throughDate && expense.date > throughDate)
    ) {
      return total;
    }
    return total + expense.amount;
  }, 0));

  return {
    startingBalance: obligation.startingBalance,
    principalPaid,
    currentBalance: obligation.startingBalance == null
      ? null
      : Math.max(0, roundMoney(obligation.startingBalance - principalPaid)),
  };
}

function scheduledDate(year: number, monthIndex: number, dueDay: number): Date {
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, monthIndex, Math.min(dueDay, lastDay)));
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Returns the next scheduled monthly due date. A payment already recorded in
 * the current month advances the schedule, so the UI never asks for the same
 * monthly payment twice. Day 29-31 contracts use the month's final day.
 */
export function nextScheduledPaymentDate(
  dueDay: number | null,
  today: string,
  recordedPaymentDates: string[] = [],
): string | null {
  if (!dueDay || dueDay < 1 || dueDay > 31 || !/^\d{4}-\d{2}-\d{2}$/.test(today)) {
    return null;
  }
  const [year, month] = today.split("-").map(Number);
  const monthIndex = month - 1;
  const currentMonth = today.slice(0, 7);
  const paidThisMonth = recordedPaymentDates.some(
    (date) => date.slice(0, 7) === currentMonth && date <= today,
  );
  const candidate = scheduledDate(year, monthIndex, dueDay);
  if (isoDate(candidate) < today || paidThisMonth) {
    return isoDate(scheduledDate(year, monthIndex + 1, dueDay));
  }
  return isoDate(candidate);
}
