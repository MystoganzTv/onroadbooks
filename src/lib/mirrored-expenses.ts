/**
 * MIRRORED LEDGER ROWS
 * ====================
 *
 * Some expenses are written BY the app, not by the owner: the purchase mirrored
 * from a fuel entry, the cost mirrored from a service record, the trip costs a
 * load posts, and a paid driver statement. Their source of truth is the record
 * that produced them, so editing or deleting the mirror is never the right
 * move. Left unguarded it loses money quietly -- delete the mirrored fuel row
 * and the diesel disappears from operating expenses while the fuel entry that
 * paid for it still sits on the Fuel page, unchanged and unreconciled.
 *
 * A mirror is identified by the RELATION, never by the id prefix. The JSON
 * store derives ids like `expfuel_<fuelId>`; Postgres lets the database
 * generate them, so a prefix test is false for every mirror in production --
 * which is exactly where it mattered.
 */

import { isLoadExpenseId } from "./load-expenses";

export type ExpenseMirrorSource = "FUEL" | "SERVICE" | "LOAD";

interface MirrorLookup {
  fuelEntries: readonly { expenseId?: string | null }[];
  maintenanceRecords: readonly { expenseId?: string | null }[];
}

/** What wrote this ledger row, or null if the owner did. */
export function expenseMirrorSource(
  data: MirrorLookup,
  expenseId: string,
): ExpenseMirrorSource | null {
  if (data.fuelEntries.some((entry) => entry.expenseId === expenseId)) return "FUEL";
  if (data.maintenanceRecords.some((record) => record.expenseId === expenseId)) return "SERVICE";
  if (isLoadExpenseId(expenseId)) return "LOAD";
  return null;
}

/** Every mirrored row in one pass -- for a table that must not offer Edit. */
export function expenseMirrorSources(
  data: MirrorLookup & { expenses: readonly { id: string }[] },
): Record<string, ExpenseMirrorSource> {
  const map: Record<string, ExpenseMirrorSource> = {};
  for (const entry of data.fuelEntries) if (entry.expenseId) map[entry.expenseId] = "FUEL";
  for (const record of data.maintenanceRecords) if (record.expenseId) map[record.expenseId] = "SERVICE";
  for (const expense of data.expenses) if (isLoadExpenseId(expense.id)) map[expense.id] = "LOAD";
  return map;
}

/** The refusal, in the words the owner should read. */
export function mirrorRefusal(source: ExpenseMirrorSource): string {
  if (source === "FUEL") {
    return "This row comes from a fuel entry. Change it on the Fuel page and the ledger follows.";
  }
  if (source === "SERVICE") {
    return "This row comes from a service record. Change it in the truck's service history and the ledger follows.";
  }
  return "This row comes from a load's trip costs. Change it on that load and the ledger follows.";
}
