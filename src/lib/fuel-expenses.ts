import { isLoadExpenseId } from "./load-expenses";
import type { Expense, FuelEntry } from "./types";

/** Amount-only purchases already in the ledger, never additional spending. */
export function fuelExpensesWithoutEntries(expenses: Expense[], entries: FuelEntry[]): Expense[] {
  const linked = new Set(entries.map((entry) => entry.expenseId));
  return expenses.filter((expense) => expense.category === "FUEL" && !linked.has(expense.id) && !isLoadExpenseId(expense.id));
}

export function assertFuelExpenseSource(
  expense: { id: string; category: string; splitGroupId?: string | null; obligationId?: string | null } | null | undefined,
  linked: boolean,
): asserts expense is NonNullable<typeof expense> {
  if (!expense) throw new Error("That expense does not belong to this workspace.");
  if (linked || isLoadExpenseId(expense.id)) {
    throw new Error("This expense is already linked to another record.");
  }
  if (expense.splitGroupId || expense.obligationId || ["TRUCK_PAYMENT", "PRINCIPAL_PAYMENT", "INTEREST_EXPENSE", "OPERATING_LEASE", "DRIVER_PAY"].includes(expense.category)) {
    throw new Error("This payment cannot be converted to a fuel purchase.");
  }
}
