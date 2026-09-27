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
  const rows = new Map<string, { name: string; profile?: Dispatcher; loads: Load[]; fees: number }>();
  for (const profile of dataset.dispatchers ?? []) rows.set(profile.nameKey, { name: profile.name, profile, loads: [], fees: 0 });
  for (const load of dataset.loads) {
    if (load.sourceKind !== "DISPATCHER" || !load.sourceName?.trim()) continue;
    const key = brokerNameKey(load.sourceName);
    const row = rows.get(key) ?? { name: load.sourceName.trim(), loads: [], fees: 0 };
    row.loads.push(load);
    row.fees += tripExpenseLines(load, expensesByLoad.get(load.id) ?? []).find(line => line.key === "dispatch")?.amount ?? 0;
    rows.set(key, row);
  }
  return [...rows.values()].map(row => ({ ...row, fees: roundMoney(row.fees) })).sort((a, b) => a.name.localeCompare(b.name));
}
