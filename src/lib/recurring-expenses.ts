import { daysInMonth, pad, parseMonth } from "./periods";
import type { Dataset, Expense, ExpenseCategoryId, ExpenseScope } from "./types";
import type { ExpenseInput } from "./db/repository";

export interface RecurringExpenseSuggestion extends ExpenseInput {
  key: string;
  label: string;
}

function recurrenceKey(expense: Pick<Expense, "category" | "scope" | "truckId" | "description">) {
  const description = expense.description
    .trim()
    .toLowerCase()
    .replace(
      /\s*[-–—]?\s*(?:january|february|march|april|may|june|july|august|september|october|november|december)(?:\s+\d{4})?\s*$/,
      "",
    );
  return [
    expense.scope,
    expense.truckId ?? "business",
    expense.category,
    description,
  ].join(":");
}

function dateInMonth(month: string, sourceDate: string): string {
  const { year, monthIndex } = parseMonth(month);
  const requestedDay = Number.parseInt(sourceDate.slice(8, 10), 10) || 1;
  return `${month}-${pad(Math.min(requestedDay, daysInMonth(year, monthIndex)))}`;
}

function categoryKey(truckId: string, category: ExpenseCategoryId) {
  return `${truckId}:${category}`;
}

/**
 * The suggestions that are actually due, i.e. whose date has arrived.
 *
 * The scheduled job posts these without asking. A cost dated the 15th is not
 * money spent on the 3rd, so posting the whole month up front would put spend
 * in the ledger before it happened and make every figure that divides by it
 * wrong for a fortnight. What is not due yet stays a suggestion, and the
 * dashboard keeps offering it.
 */
export function dueRecurringExpenses(
  dataset: Dataset,
  month: string,
  today: string,
  selectedTruckId: string | null = null,
): RecurringExpenseSuggestion[] {
  return recurringExpenseSuggestions(dataset, month, selectedTruckId).filter(
    (suggestion) => suggestion.date <= today,
  );
}

export function recurringExpenseSuggestions(
  dataset: Dataset,
  month: string,
  selectedTruckId: string | null = null,
): RecurringExpenseSuggestion[] {
  const suggestions: RecurringExpenseSuggestion[] = [];
  const trucks = dataset.trucks.filter(
    (truck) => truck.active && (!selectedTruckId || truck.id === selectedTruckId),
  );

  const latestByKey = new Map<string, Expense>();
  for (const expense of dataset.expenses) {
    if (!expense.recurring || expense.date >= `${month}-01`) continue;
    if (selectedTruckId && expense.scope === "TRUCK" && expense.truckId !== selectedTruckId) {
      continue;
    }
    const key = recurrenceKey(expense);
    const current = latestByKey.get(key);
    if (!current || expense.date > current.date) latestByKey.set(key, expense);
  }

  const currentKeys = new Set(
    dataset.expenses.filter((expense) => expense.date.startsWith(month)).map(recurrenceKey),
  );
  const categoriesWithCurrentExpenses = new Set(
    dataset.expenses
      .filter(
        (expense) =>
          expense.date.startsWith(month) &&
          expense.truckId &&
          (expense.category === "TRUCK_PAYMENT" || expense.category === "INSURANCE"),
      )
      .map((expense) => categoryKey(expense.truckId!, expense.category)),
  );
  const categoriesWithRecurringTemplates = new Set(
    [...latestByKey.values()]
      .filter(
        (expense) =>
          expense.truckId &&
          (expense.category === "TRUCK_PAYMENT" || expense.category === "INSURANCE"),
      )
      .map((expense) => categoryKey(expense.truckId!, expense.category)),
  );

  for (const [key, template] of latestByKey) {
    if (currentKeys.has(key)) continue;
    suggestions.push({
      key: `repeat:${key}`,
      label: template.description,
      scope: template.scope as ExpenseScope,
      truckId: template.truckId,
      date: dateInMonth(month, template.date),
      category: template.category,
      description: template.description,
      vendor: template.vendor,
      amount: template.amount,
      loadId: null,
      recurring: true,
      receiptNumber: null,
      notes: template.notes,
    });
  }

  // Truck details are only a fallback for a category with no real ledger history.
  // A payment can be split across multiple lenders, so a truck-level estimate must
  // never overwrite or collapse the recurring expenses the owner actually entered.
  for (const truck of trucks) {
    const fixedCosts: {
      category: ExpenseCategoryId;
      amount: number | null;
      label: string;
    }[] = [
      { category: "TRUCK_PAYMENT", amount: truck.monthlyPayment, label: `${truck.name} payment` },
      { category: "INSURANCE", amount: truck.monthlyInsurance, label: `${truck.name} insurance` },
    ];

    for (const cost of fixedCosts) {
      if (!cost.amount) continue;
      const key = categoryKey(truck.id, cost.category);
      if (
        categoriesWithCurrentExpenses.has(key) ||
        categoriesWithRecurringTemplates.has(key)
      ) {
        continue;
      }
      suggestions.push({
        key: `truck:${truck.id}:${cost.category}`,
        label: cost.label,
        scope: "TRUCK",
        truckId: truck.id,
        date: `${month}-01`,
        category: cost.category,
        description: cost.label,
        vendor: null,
        amount: cost.amount,
        loadId: null,
        recurring: true,
        receiptNumber: null,
        notes: "Added from Truck details because no recurring ledger expense exists.",
      });
    }
  }

  return suggestions;
}
