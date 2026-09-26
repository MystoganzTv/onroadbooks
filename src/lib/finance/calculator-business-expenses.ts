import { roundMoney } from "../calculations";
import type { Expense } from "../types";
import { isOperatingExpense } from "./terminology";

export interface CalculatorBusinessExpenses {
  month: string;
  total: number;
  entries: Pick<Expense, "id" | "description" | "category" | "amount" | "scope">[];
}

const TRIP_CATEGORIES = new Set(["FUEL", "TOLLS", "DISPATCH", "FACTORING", "DRIVER_PAY"]);

/** Recorded monthly context, not a per-mile estimate or a proposed-trip deduction. */
export function calculatorBusinessExpenses(
  expenses: readonly Expense[],
  truckId: string,
  today: string,
): CalculatorBusinessExpenses {
  const month = today.slice(0, 7);
  const entries = expenses
    .filter((expense) =>
      expense.date.slice(0, 7) === month
      && (expense.scope === "BUSINESS" || expense.truckId === truckId)
      && isOperatingExpense(expense)
      && !expense.loadId
      && !TRIP_CATEGORIES.has(expense.category),
    )
    .sort((a, b) => b.date.localeCompare(a.date) || a.description.localeCompare(b.description))
    .map(({ id, description, category, amount, scope }) => ({ id, description, category, amount, scope }));
  return { month, total: roundMoney(entries.reduce((sum, expense) => sum + expense.amount, 0)), entries };
}
