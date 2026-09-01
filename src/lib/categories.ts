import type { ExpenseBehavior, ExpenseCategoryId } from "./types";

export interface CategoryDefinition {
  id: ExpenseCategoryId;
  label: string;
  /** Default classification -- overridable per business in Settings. */
  defaultBehavior: ExpenseBehavior;
  /** Chart colour token (CSS variable driven, theme aware). */
  color: string;
}

export const EXPENSE_CATEGORIES: CategoryDefinition[] = [
  { id: "FUEL", label: "Fuel", defaultBehavior: "VARIABLE", color: "#f59e0b" },
  { id: "TOLLS", label: "Tolls", defaultBehavior: "VARIABLE", color: "#fbbf24" },
  { id: "INSURANCE", label: "Insurance", defaultBehavior: "FIXED", color: "#3b82f6" },
  {
    id: "TRUCK_PAYMENT",
    label: "Truck Payment (Unallocated)",
    defaultBehavior: "FIXED",
    color: "#6366f1",
  },
  {
    id: "INTEREST_EXPENSE",
    label: "Interest Expense",
    defaultBehavior: "FIXED",
    color: "#7c3aed",
  },
  {
    id: "PRINCIPAL_PAYMENT",
    label: "Principal Payment",
    defaultBehavior: "FIXED",
    color: "#4f46e5",
  },
  { id: "MAINTENANCE", label: "Maintenance", defaultBehavior: "VARIABLE", color: "#14b8a6" },
  { id: "REPAIRS", label: "Repairs", defaultBehavior: "VARIABLE", color: "#ef4444" },
  { id: "PARKING", label: "Parking", defaultBehavior: "FIXED", color: "#8b5cf6" },
  { id: "DISPATCH", label: "Dispatch", defaultBehavior: "VARIABLE", color: "#ec4899" },
  { id: "FACTORING", label: "Factoring", defaultBehavior: "VARIABLE", color: "#f43f5e" },
  { id: "ELD", label: "ELD", defaultBehavior: "FIXED", color: "#0ea5e9" },
  { id: "PERMITS", label: "Permits", defaultBehavior: "FIXED", color: "#22c55e" },
  { id: "REGISTRATION", label: "Registration", defaultBehavior: "FIXED", color: "#84cc16" },
  { id: "OFFICE", label: "Office", defaultBehavior: "FIXED", color: "#a855f7" },
  { id: "PHONE", label: "Phone", defaultBehavior: "FIXED", color: "#06b6d4" },
  { id: "ACCOUNTING", label: "Accounting", defaultBehavior: "FIXED", color: "#64748b" },
  { id: "DRIVER_PAY", label: "Driver Pay", defaultBehavior: "VARIABLE", color: "#10b981" },
  { id: "OTHER", label: "Other", defaultBehavior: "VARIABLE", color: "#94a3b8" },
];

const BY_ID = new Map(EXPENSE_CATEGORIES.map((c) => [c.id, c]));

export const CATEGORY_IDS = EXPENSE_CATEGORIES.map((c) => c.id);

export function getCategory(id: string): CategoryDefinition {
  return BY_ID.get(id as ExpenseCategoryId) ?? BY_ID.get("OTHER")!;
}

export function categoryLabel(id: string): string {
  return getCategory(id).label;
}

export function categoryColor(id: string): string {
  return getCategory(id).color;
}

export function defaultCategoryBehavior(): Record<string, ExpenseBehavior> {
  return Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c.id, c.defaultBehavior]));
}

export function behaviorOf(
  id: string,
  overrides: Record<string, ExpenseBehavior> | undefined,
): ExpenseBehavior {
  return overrides?.[id] ?? getCategory(id).defaultBehavior;
}

export const PAYMENT_STATUSES = [
  { id: "PENDING", label: "Pending" },
  { id: "INVOICED", label: "Invoiced" },
  { id: "PAID", label: "Paid" },
] as const;

export function statusLabel(id: string): string {
  return PAYMENT_STATUSES.find((s) => s.id === id)?.label ?? id;
}
