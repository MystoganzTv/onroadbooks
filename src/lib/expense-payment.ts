import type { ExpenseInput } from "./db/repository";
import { requireExactDebtPaymentSplit } from "./finance/debt-payment";

/** Build the ledger rows for one payment before any write occurs. */
export function expensePaymentRows(input: ExpenseInput, splitGroupId: string): ExpenseInput[] {
  if (!input.loanSplit) return [input];
  if (input.category !== "TRUCK_PAYMENT") throw new Error("Only loan payments support a principal and interest breakdown.");
  const { principal, interest } = requireExactDebtPaymentSplit(
    input.amount, input.loanSplit.principalAmount, input.loanSplit.interestAmount,
  );
  if (principal + interest <= 0) throw new Error("Amount is required");
  const base = { ...input, loanSplit: undefined };
  const rows: ExpenseInput[] = [];
  if (principal > 0) rows.push({ ...base, splitGroupId, category: "PRINCIPAL_PAYMENT", financialTreatment: "PRINCIPAL", amount: principal });
  if (interest > 0) rows.push({ ...base, splitGroupId, category: "INTEREST_EXPENSE", financialTreatment: "INTEREST", amount: interest, description: `${base.description.trim()} · interest` });
  return rows;
}
