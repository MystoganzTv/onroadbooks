import { z } from "zod";
import { brokerNameKey } from "./brokers";
import { roundMoney, tripExpenseLines } from "./calculations";
import type { Dataset, Dispatcher, Load } from "./types";

export const dispatcherSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(60).nullable(),
  email: z.union([z.string().trim().email().max(254), z.literal("")]).nullable(),
  notes: z.string().trim().max(2000).nullable(),
});

export function dispatcherDirectory(dataset: Pick<Dataset, "dispatchers" | "loads" | "expenses">) {
  const expensesByLoad = new Map<string, Dataset["expenses"]>();
  for (const expense of dataset.expenses) {
    if (!expense.loadId) continue;
    const entries = expensesByLoad.get(expense.loadId) ?? [];
    entries.push(expense);
    expensesByLoad.set(expense.loadId, entries);
  }
  type Row = { name: string; profile?: Dispatcher; loads: Load[]; fees: number; paid: number; owed: number; loadFees: Record<string, number> };
  const rows = new Map<string, Row>();
  const empty = (name: string, profile?: Dispatcher): Row => ({ name, profile, loads: [], fees: 0, paid: 0, owed: 0, loadFees: {} });
  for (const profile of dataset.dispatchers ?? []) rows.set(profile.nameKey, empty(profile.name, profile));
  for (const load of dataset.loads) {
    if (load.sourceKind !== "DISPATCHER" || !load.sourceName?.trim()) continue;
    const key = brokerNameKey(load.sourceName);
    const row = rows.get(key) ?? empty(load.sourceName.trim());
    const fee = tripExpenseLines(load, expensesByLoad.get(load.id) ?? []).find(line => line.key === "dispatch")?.amount ?? 0;
    row.loads.push(load);
    row.loadFees[load.id] = fee;
    row.fees += fee;
    if (load.dispatchPaidDate) row.paid += fee;
    else row.owed += fee;
    rows.set(key, row);
  }
  return [...rows.values()]
    .map(row => ({ ...row, fees: roundMoney(row.fees), paid: roundMoney(row.paid), owed: roundMoney(row.owed) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
