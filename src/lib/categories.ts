import type { AppLocale } from "./i18n";
import type { ExpenseBehavior, ExpenseCategoryId } from "./types";

export interface CategoryDefinition {
  id: ExpenseCategoryId;
  label: string;
  labelEs: string;
  /** Default classification -- overridable per business in Settings. */
  defaultBehavior: ExpenseBehavior;
  /** Chart colour token (CSS variable driven, theme aware). */
  color: string;
}

export const EXPENSE_CATEGORIES: CategoryDefinition[] = [
  { id: "FUEL", label: "Fuel", labelEs: "Combustible", defaultBehavior: "VARIABLE", color: "#f59e0b" },
  { id: "TOLLS", label: "Tolls", labelEs: "Peajes", defaultBehavior: "VARIABLE", color: "#fbbf24" },
  { id: "INSURANCE", label: "Insurance", labelEs: "Seguro", defaultBehavior: "FIXED", color: "#3b82f6" },
  {
    id: "TRUCK_PAYMENT",
    label: "Truck Payment (Unallocated)",
    labelEs: "Pago del camión (sin clasificar)",
    defaultBehavior: "FIXED",
    color: "#6366f1",
  },
  {
    id: "INTEREST_EXPENSE",
    label: "Loan Interest Payment",
    labelEs: "Pago de intereses del préstamo",
    defaultBehavior: "FIXED",
    color: "#7c3aed",
  },
  {
    id: "PRINCIPAL_PAYMENT",
    label: "Loan Principal Payment",
    labelEs: "Pago de principal del préstamo",
    defaultBehavior: "FIXED",
    color: "#4f46e5",
  },
  {
    id: "OPERATING_LEASE",
    label: "Operating Lease",
    labelEs: "Arrendamiento operativo",
    defaultBehavior: "FIXED",
    color: "#8b5cf6",
  },
  { id: "MAINTENANCE", label: "Maintenance", labelEs: "Mantenimiento", defaultBehavior: "VARIABLE", color: "#14b8a6" },
  { id: "REPAIRS", label: "Repairs", labelEs: "Reparaciones", defaultBehavior: "VARIABLE", color: "#ef4444" },
  { id: "PARKING", label: "Parking", labelEs: "Estacionamiento", defaultBehavior: "FIXED", color: "#8b5cf6" },
  { id: "DISPATCH", label: "Dispatch", labelEs: "Despacho", defaultBehavior: "VARIABLE", color: "#ec4899" },
  { id: "FACTORING", label: "Factoring", labelEs: "Factoraje", defaultBehavior: "VARIABLE", color: "#f43f5e" },
  { id: "ELD", label: "ELD", labelEs: "ELD", defaultBehavior: "FIXED", color: "#0ea5e9" },
  { id: "PERMITS", label: "Permits", labelEs: "Permisos", defaultBehavior: "FIXED", color: "#22c55e" },
  { id: "REGISTRATION", label: "Registration", labelEs: "Registro", defaultBehavior: "FIXED", color: "#84cc16" },
  { id: "OFFICE", label: "Office", labelEs: "Oficina", defaultBehavior: "FIXED", color: "#a855f7" },
  { id: "PHONE", label: "Phone", labelEs: "Teléfono", defaultBehavior: "FIXED", color: "#06b6d4" },
  { id: "ACCOUNTING", label: "Accounting", labelEs: "Contabilidad", defaultBehavior: "FIXED", color: "#64748b" },
  { id: "DRIVER_PAY", label: "Driver Pay", labelEs: "Pago a choferes", defaultBehavior: "VARIABLE", color: "#10b981" },
  { id: "OTHER", label: "Other", labelEs: "Otro", defaultBehavior: "VARIABLE", color: "#94a3b8" },
];

const BY_ID = new Map(EXPENSE_CATEGORIES.map((c) => [c.id, c]));

export const CATEGORY_IDS = EXPENSE_CATEGORIES.map((c) => c.id);

export function getCategory(id: string): CategoryDefinition {
  return BY_ID.get(id as ExpenseCategoryId) ?? BY_ID.get("OTHER")!;
}

export function categoryLabel(id: string, locale: AppLocale = "en"): string {
  const category = getCategory(id);
  return locale === "es" ? category.labelEs : category.label;
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
  { id: "PENDING", label: "Pending", labelEs: "Pendiente" },
  { id: "INVOICED", label: "Invoiced", labelEs: "Facturada" },
  { id: "PAID", label: "Paid", labelEs: "Pagada" },
] as const;

export function statusLabel(id: string, locale: AppLocale = "en"): string {
  const status = PAYMENT_STATUSES.find((item) => item.id === id);
  return status ? (locale === "es" ? status.labelEs : status.label) : id;
}
