import { roundMoney } from "../calculations";
import type { Expense, FinancialObligation } from "../types";
import { financialTreatmentOf } from "./terminology";

export type MobileExpenseEditor = "EXPENSE" | "DEBT_PAYMENT";

export interface MobileExpenseRow {
  id: string;
  date: string;
  category: string;
  categoryLabel: string;
  description: string;
  vendor: string | null;
  amount: number;
  editor: MobileExpenseEditor;
  principalAmount?: number;
  interestAmount?: number;
}

/** A reviewed loan payment is one transaction even though accounting stores two rows. */
export function isReviewedLoanPayment(expense: Expense): boolean {
  const treatment = financialTreatmentOf(expense);
  return Boolean(
    expense.splitGroupId
      && (treatment === "PRINCIPAL" || treatment === "INTEREST"),
  );
}

/**
 * Shapes the mobile ledger so an accounting split can never masquerade as two
 * independent expenses. The id belongs to one real row and is only an opaque
 * handle for the atomic debt-payment endpoint.
 */
export function mobileExpenseRows(
  expenses: Expense[],
  obligations: FinancialObligation[],
  categoryLabel: (category: Expense["category"]) => string,
): MobileExpenseRow[] {
  const obligationById = new Map(obligations.map((obligation) => [obligation.id, obligation]));
  const seenGroups = new Set<string>();
  const rows: MobileExpenseRow[] = [];

  for (const expense of expenses) {
    if (!isReviewedLoanPayment(expense)) {
      rows.push({
        id: expense.id,
        date: expense.date,
        category: expense.category,
        categoryLabel: categoryLabel(expense.category),
        description: expense.description,
        vendor: expense.vendor,
        amount: expense.amount,
        editor: "EXPENSE",
      });
      continue;
    }

    const splitGroupId = expense.splitGroupId!;
    if (seenGroups.has(splitGroupId)) continue;
    seenGroups.add(splitGroupId);

    const grouped = expenses.filter(
      (candidate) => candidate.splitGroupId === splitGroupId && isReviewedLoanPayment(candidate),
    );
    const principal = grouped.find((candidate) => financialTreatmentOf(candidate) === "PRINCIPAL");
    const interest = grouped.find((candidate) => financialTreatmentOf(candidate) === "INTEREST");
    const base = principal ?? interest ?? expense;
    const obligation = base.obligationId ? obligationById.get(base.obligationId) : undefined;
    const principalAmount = roundMoney(
      grouped
        .filter((candidate) => financialTreatmentOf(candidate) === "PRINCIPAL")
        .reduce((total, candidate) => total + candidate.amount, 0),
    );
    const interestAmount = roundMoney(
      grouped
        .filter((candidate) => financialTreatmentOf(candidate) === "INTEREST")
        .reduce((total, candidate) => total + candidate.amount, 0),
    );

    rows.push({
      id: base.id,
      date: base.date,
      category: base.category,
      categoryLabel: obligation?.name || "Financing payment",
      description: base.description.replace(/ · interest$/u, ""),
      vendor: base.vendor ?? obligation?.counterparty ?? null,
      amount: roundMoney(principalAmount + interestAmount),
      editor: "DEBT_PAYMENT",
      principalAmount,
      interestAmount,
    });
  }

  return rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}
