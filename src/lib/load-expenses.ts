import { roundMoney } from "./calculations";
import type { Dataset, ExpenseCategoryId, Load } from "./types";

export type LoadExpenseKey = "fuel" | "tolls" | "dispatch" | "factoring" | "other";

export type LoadExpenseField =
  | "fuelCost"
  | "tolls"
  | "dispatchFee"
  | "factoringFee"
  | "otherExpenses";

export const LOAD_EXPENSE_KEYS: LoadExpenseKey[] = [
  "fuel",
  "tolls",
  "dispatch",
  "factoring",
  "other",
];

export interface LoadExpenseSpec {
  key: LoadExpenseKey;
  category: ExpenseCategoryId;
  label: string;
  amount: number;
}

type LoadCostSource = Pick<
  Load,
  "fuelCost" | "tolls" | "dispatchFee" | "factoringFee" | "otherExpenses"
>;

export function loadExpenseId(loadId: string, key: LoadExpenseKey): string {
  return `expload_${loadId}_${key}`;
}

export function isLoadExpenseId(id: string): boolean {
  return id.startsWith("expload_");
}

/** The load field that owns each generated ledger row. */
export function loadExpenseField(key: LoadExpenseKey): LoadExpenseField {
  switch (key) {
    case "fuel":
      return "fuelCost";
    case "tolls":
      return "tolls";
    case "dispatch":
      return "dispatchFee";
    case "factoring":
      return "factoringFee";
    case "other":
      return "otherExpenses";
  }
}

/**
 * Resolves a generated expense id only in the context of its linked load.
 * Comparing deterministic ids avoids parsing load ids, which may themselves
 * contain underscores in imported datasets.
 */
export function loadExpenseKey(id: string, loadId: string): LoadExpenseKey | null {
  return LOAD_EXPENSE_KEYS.find((key) => loadExpenseId(loadId, key) === id) ?? null;
}

export function loadExpenseSpecs(load: LoadCostSource): LoadExpenseSpec[] {
  return [
    { key: "fuel", category: "FUEL", label: "Fuel", amount: roundMoney(load.fuelCost) },
    { key: "tolls", category: "TOLLS", label: "Tolls", amount: roundMoney(load.tolls) },
    {
      key: "dispatch",
      category: "DISPATCH",
      label: "Dispatch",
      amount: roundMoney(load.dispatchFee),
    },
    {
      key: "factoring",
      category: "FACTORING",
      label: "Factoring",
      amount: roundMoney(load.factoringFee),
    },
    {
      key: "other",
      category: "OTHER",
      label: "Other trip cost",
      amount: roundMoney(load.otherExpenses),
    },
  ];
}

export function loadExpenseDescription(
  load: Pick<Load, "loadNumber" | "originState" | "destinationState">,
  label: string,
): string {
  const reference = load.loadNumber
    ? `Load #${load.loadNumber}`
    : `${load.originState}-${load.destinationState}`;
  return `${reference} · ${label}`;
}

/**
 * Treats trip costs as one accounting fact for every load that opted in. The
 * deterministic ids make the derived rows safe to rebuild on every read
 * without double-counting, and `costsPosted` decides which loads take part.
 */
export function reconcileLoadExpenseLedger(
  dataset: Pick<Dataset, "business" | "loads" | "expenses" | "fuelEntries">,
): void {
  for (const load of dataset.loads) {
    // `costsPosted` is the load's own answer to "are my trip costs in the
    // ledger". It is set true for everything the app creates, and false for
    // loads that predate this model (see migrateLoad) and for the bundled
    // reference fixture, whose ledger is already fully populated.
    //
    // It is READ here, never written. Forcing it true would post historical
    // trip costs on top of the spend the owner already entered by hand -- on
    // a real ledger that is the same diesel counted twice.
    if (!load.costsPosted) continue;

    const detailedFuel = dataset.fuelEntries.some((entry) => entry.loadId === load.id);

    for (const spec of loadExpenseSpecs(load)) {
      const id = loadExpenseId(load.id, spec.key);
      const shouldPost = spec.amount > 0 && !(spec.key === "fuel" && detailedFuel);
      const existingIndex = dataset.expenses.findIndex((expense) => expense.id === id);
      const existing = existingIndex >= 0 ? dataset.expenses[existingIndex] : undefined;

      if (!shouldPost) {
        if (existingIndex >= 0) dataset.expenses.splice(existingIndex, 1);
        continue;
      }

      const values = {
        businessId: dataset.business.id,
        truckId: load.truckId,
        scope: "TRUCK" as const,
        loadId: load.id,
        date: load.date,
        category: spec.category,
        description: loadExpenseDescription(load, spec.label),
        vendor: null,
        amount: spec.amount,
        recurring: false,
        receiptNumber: null,
        notes: "Posted automatically from the load. Edit the load to change this amount.",
      };

      if (existing) Object.assign(existing, values);
      else dataset.expenses.push({ id, ...values, createdAt: load.createdAt });
    }
  }
}
