import { roundMoney } from "./calculations";
import { daysInMonth, pad, parseMonth, shiftMonth } from "./periods";
import type { Dataset, Expense, ExpenseScope } from "./types";
import type { ExpenseInput } from "./db/repository";

export interface RecurringExpenseSuggestion extends ExpenseInput {
  key: string;
  label: string;
}

const LEGACY_TRUCK_TEMPLATE_NOTE = "Added from Truck details because no recurring ledger expense exists.";

/** Old truck estimates were auto-enrolled; only user-selected recurrence continues. */
export function isMonthlyRecurringExpense(expense: Pick<Expense, "recurring" | "notes">): boolean {
  return expense.recurring && !expense.notes?.startsWith(LEGACY_TRUCK_TEMPLATE_NOTE);
}

/** Explicitly enabling recurrence replaces only the old automatic-enrollment marker. */
export function optedInRecurringNotes(notes: string): string {
  return notes.startsWith(LEGACY_TRUCK_TEMPLATE_NOTE)
    ? notes.slice(LEGACY_TRUCK_TEMPLATE_NOTE.length).trim()
    : notes;
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

/** A split repeats as one payment, with a new group created by the repository. */
function recurringPayments(expenses: Expense[]): (Expense & Pick<ExpenseInput, "loanSplit">)[] {
  const groups = new Map<string, Expense[]>();
  for (const expense of expenses) {
    if (expense.splitGroupId) {
      const rows = groups.get(expense.splitGroupId) ?? [];
      rows.push(expense);
      groups.set(expense.splitGroupId, rows);
    }
  }
  const seen = new Set<string>();
  return expenses.flatMap((expense) => {
    if (!expense.splitGroupId) return [expense];
    if (seen.has(expense.splitGroupId)) return [];
    seen.add(expense.splitGroupId);
    const rows = groups.get(expense.splitGroupId)!;
    const base = rows.find((row) => row.financialTreatment === "PRINCIPAL") ?? rows[0];
    return [{
      ...base,
      category: "TRUCK_PAYMENT" as const,
      financialTreatment: "DEBT_UNALLOCATED" as const,
      description: base.description.replace(/ · interest$/u, ""),
      amount: roundMoney(rows.reduce((total, row) => total + row.amount, 0)),
      recurring: rows.every(isMonthlyRecurringExpense),
      loanSplit: {
        principalAmount: roundMoney(rows.filter((row) => row.financialTreatment === "PRINCIPAL").reduce((total, row) => total + row.amount, 0)),
        interestAmount: roundMoney(rows.filter((row) => row.financialTreatment === "INTEREST").reduce((total, row) => total + row.amount, 0)),
      },
    }];
  });
}

function dateInMonth(month: string, sourceDate: string): string {
  const { year, monthIndex } = parseMonth(month);
  const requestedDay = Number.parseInt(sourceDate.slice(8, 10), 10) || 1;
  return `${month}-${pad(Math.min(requestedDay, daysInMonth(year, monthIndex)))}`;
}

/**
 * The suggestions that are actually due, i.e. whose date has arrived.
 *
 * The scheduled job posts these without asking. A cost dated the 15th is not
 * money spent on the 3rd, so posting the whole month up front would put spend
 * in the ledger before it happened and make every figure that divides by it
 * wrong for a fortnight. What is not due yet stays a suggestion, and the
 * scheduled job waits until that date.
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
  // Keep the latest explicit choice, including switching recurrence off.
  // Looking only at recurring=true resurrected an older monthly template.
  const payments = recurringPayments(dataset.expenses);
  const history = payments
    .filter((expense) => expense.date < `${month}-01`)
    .filter((expense) => !selectedTruckId || expense.scope !== "TRUCK" || expense.truckId === selectedTruckId)
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  const latestByKey = new Map<string, Expense & Pick<ExpenseInput, "loanSplit">>();
  const anchorByKey = new Map<string, string>();
  for (const expense of history) {
    const key = recurrenceKey(expense);
    latestByKey.set(key, expense);
    if (!isMonthlyRecurringExpense(expense)) {
      anchorByKey.delete(key);
    } else if (!anchorByKey.has(key)) {
      // January 31 → February 28 → March 31, without drifting to the 28th.
      anchorByKey.set(key, expense.date);
    }
  }

  const currentKeys = new Set(
    payments.filter((expense) => expense.date.startsWith(month)).map(recurrenceKey),
  );
  for (const [key, template] of latestByKey) {
    if (!isMonthlyRecurringExpense(template) || currentKeys.has(key)) continue;
    suggestions.push({
      key: `repeat:${key}`,
      label: template.description,
      scope: template.scope as ExpenseScope,
      truckId: template.truckId,
      date: dateInMonth(month, anchorByKey.get(key) ?? template.date),
      category: template.category,
      description: template.description,
      vendor: template.vendor,
      amount: template.amount,
      loadId: null,
      recurring: true,
      receiptNumber: null,
      notes: template.notes,
      loanSplit: template.loanSplit,
      obligationId: template.obligationId,
      financialTreatment: template.financialTreatment,
    });
  }

  return suggestions;
}

/** Stop every occurrence in the same series, including both parts of a loan payment. */
export function recurringSeriesExpenseIds(
  expenses: (Pick<Expense, "id" | "scope" | "truckId" | "description" | "splitGroupId"> & { category: string; financialTreatment?: string | null })[],
  id: string,
): string[] {
  const source = expenses.find((expense) => expense.id === id);
  if (!source) throw new Error("That expense does not belong to this workspace.");
  const bases = new Map<string, typeof source>();
  for (const row of expenses) {
    if (row.splitGroupId && (!bases.has(row.splitGroupId) || row.financialTreatment === "PRINCIPAL")) bases.set(row.splitGroupId, row);
  }
  const keyFor = (expense: typeof source) => {
    const base = expense.splitGroupId ? bases.get(expense.splitGroupId)! : expense;
    return recurrenceKey({ ...base,
      category: (base.splitGroupId ? "TRUCK_PAYMENT" : base.category) as Expense["category"],
      description: base.splitGroupId ? base.description.replace(/ · interest$/u, "") : base.description,
    });
  };
  const key = keyFor(source);
  return expenses.filter((expense) => keyFor(expense) === key).map((expense) => expense.id);
}

export interface ActiveRecurringExpense {
  id: string;
  description: string;
  amount: number;
  truckId: string | null;
  nextDate: string;
}

/** Independent of the selected reporting period: these are the schedules still enabled. */
export function activeRecurringExpenses(expenses: Expense[], today: string): ActiveRecurringExpense[] {
  const payments = recurringPayments(expenses).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  const latest = new Map<string, typeof payments[number]>();
  const anchors = new Map<string, string>();
  for (const payment of payments) {
    const key = recurrenceKey(payment);
    latest.set(key, payment);
    if (!isMonthlyRecurringExpense(payment)) anchors.delete(key);
    else if (!anchors.has(key)) anchors.set(key, payment.date);
  }
  return [...latest.entries()].filter(([, row]) => isMonthlyRecurringExpense(row)).map(([key, row]) => {
    const nextMonth = shiftMonth(row.date.slice(0, 7), 1);
    const month = nextMonth > today.slice(0, 7) ? nextMonth : today.slice(0, 7);
    return { id: row.id, description: row.description, amount: row.amount, truckId: row.truckId,
      nextDate: dateInMonth(month, anchors.get(key) ?? row.date) };
  }).sort((a, b) => a.nextDate.localeCompare(b.nextDate) || a.description.localeCompare(b.description));
}
