import type { ExpenseCategoryId, FinancialTreatment } from "../types";

/**
 * CANONICAL FINANCIAL TERMINOLOGY
 * ===============================
 *
 * This file is the authoritative financial vocabulary for OnRoad Books.
 * Calculations, UI copy, mobile responses and exports import these terms or
 * implement the bases stated here. Do not redefine a financial term in a
 * component. When a definition changes, bump FINANCIAL_MODEL_VERSION and
 * preserve any closed snapshot written by an earlier version.
 */

export const FINANCIAL_MODEL_VERSION = 3 as const;
export const LEGACY_FINANCIAL_MODEL_VERSION = 1 as const;

/** Financing rows excluded from Operating Expenses and reported below it. */
export const INTEREST_EXPENSE_CATEGORY = "INTEREST_EXPENSE" as const;
export const PRINCIPAL_PAYMENT_CATEGORY = "PRINCIPAL_PAYMENT" as const;
export const UNALLOCATED_DEBT_SERVICE_CATEGORY = "TRUCK_PAYMENT" as const;

export function financialTreatmentForCategory(category: string): FinancialTreatment {
  if (category === INTEREST_EXPENSE_CATEGORY) return "INTEREST";
  if (category === PRINCIPAL_PAYMENT_CATEGORY) return "PRINCIPAL";
  if (category === UNALLOCATED_DEBT_SERVICE_CATEGORY) return "DEBT_UNALLOCATED";
  return "OPERATING";
}

/** Treatment metadata is authoritative once present; category is the legacy fallback. */
export function financialTreatmentOf(expense: {
  category: ExpenseCategoryId | string;
  financialTreatment?: FinancialTreatment | null;
}): FinancialTreatment {
  return expense.financialTreatment ?? financialTreatmentForCategory(expense.category);
}

export function isInterestExpenseCategory(category: string): boolean {
  return category === INTEREST_EXPENSE_CATEGORY;
}

export function isPrincipalPaymentCategory(category: string): boolean {
  return category === PRINCIPAL_PAYMENT_CATEGORY;
}

export function isUnallocatedDebtServiceCategory(category: string): boolean {
  return category === UNALLOCATED_DEBT_SERVICE_CATEGORY;
}

export function isDebtServiceCategory(category: string): boolean {
  return (
    isInterestExpenseCategory(category) ||
    isPrincipalPaymentCategory(category) ||
    isUnallocatedDebtServiceCategory(category)
  );
}

export function isOperatingExpenseCategory(category: string): boolean {
  return !isDebtServiceCategory(category);
}

export function isOperatingExpense(expense: {
  category: ExpenseCategoryId | string;
  financialTreatment?: FinancialTreatment | null;
}): boolean {
  return financialTreatmentOf(expense) === "OPERATING";
}

export function isDebtServiceExpense(expense: {
  category: ExpenseCategoryId | string;
  financialTreatment?: FinancialTreatment | null;
}): boolean {
  return financialTreatmentOf(expense) !== "OPERATING";
}

export const FINANCIAL_TERMS = {
  bookedRevenue: {
    label: "Booked Revenue",
    definition:
      "Revenue earned from loads assigned to the reporting period, whether or not the customer has paid. OnRoad Books currently assigns a load to its operational date so historical periods do not move when an invoice is paid.",
    basis: "Gross rates for loads whose load date is inside the performance period.",
  },
  collectedRevenue: {
    label: "Collected Revenue",
    definition:
      "Cash received from customers. A paid status without a recorded payment date remains paid operationally but is not guessed into a cash period.",
    basis: "Payment-event amounts dated inside the cash period; legacy fully-paid invoices use their recorded invoice-paid date only when no payment events exist.",
  },
  accountsReceivable: {
    label: "Accounts Receivable",
    definition:
      "Booked revenue that has not been collected. It affects performance but is not cash available to spend.",
    basis: "For loads in the performance period: Gross Rate minus all recorded payment events, floored at zero; legacy PAID invoices without events remain fully paid.",
  },
  directTripCosts: {
    label: "Direct Trip Costs",
    definition:
      "Costs caused by one load: fuel, tolls, dispatch, factoring, other trip costs and driver pay.",
    basis: "The load's own cost fields, with linked actual fuel replacing its estimate.",
  },
  contributionProfit: {
    label: "Contribution Profit",
    definition:
      "The amount a load or truck contributes after the costs it directly caused, before allocated operating costs and all debt service.",
    basis: "Booked revenue minus direct trip or directly attributable truck costs.",
  },
  operatingExpenses: {
    label: "Operating Expenses",
    definition:
      "Costs of running the business. Interest, principal, reserve transfers and owner withdrawals are reported separately.",
    basis: "Expense-ledger rows other than interest expense, principal payment and unallocated debt payment.",
  },
  operatingProfit: {
    label: "Operating Profit",
    definition:
      "Business performance before financing, reserves and owner pay.",
    basis: "Booked Revenue minus Operating Expenses.",
  },
  interestExpense: {
    label: "Interest Expense",
    definition:
      "The financing cost portion of debt payments. It is an expense, but is shown below Operating Profit so financing never changes load quality.",
    basis: "Expense-ledger rows categorized as Interest Expense.",
  },
  principalPayment: {
    label: "Principal Payment",
    definition:
      "The portion of a debt payment that reduces the loan balance. It uses cash but is not an operating expense.",
    basis: "Expense-ledger rows categorized as Principal Payment.",
  },
  debtService: {
    label: "Debt Service",
    definition:
      "Cash paid toward financing: interest plus principal plus any legacy truck payment whose split has not been recorded.",
    basis: "Interest Expense plus Principal Payment plus unallocated Truck Payment rows.",
  },
  cashAfterDebtService: {
    label: "Cash After Debt Service",
    definition:
      "Cash collected in the period less cash operating expenses and all debt service paid in the period.",
    basis: "Collected Revenue minus Operating Expenses minus Debt Service.",
  },
  reserveContributions: {
    label: "Reserve Contributions",
    definition:
      "Amounts designated for tax, maintenance or other configured reserve buckets. They are planning allocations, not operating expenses or bank balances.",
    basis: "Each active reserve rule applied to its configured Booked Revenue or Operating Profit base.",
  },
  safeToPayYourself: {
    label: "Safe to Pay Yourself",
    definition:
      "The conservative owner-pay ceiling after cash operating costs, debt service and planned reserve contributions. Unpaid invoices can never increase it.",
    basis: "Cash After Debt Service minus Reserve Contributions.",
  },
  actualCostPerMile: {
    label: "Actual Cost Per Mile",
    definition:
      "Actual operating costs recorded in a reporting window divided by all loaded and deadhead miles driven in that window.",
    basis: "Operating Expenses divided by total miles; no prorating and no debt principal.",
  },
  normalizedCostPerMile: {
    label: "Normalized Cost Per Mile",
    definition:
      "A stable planning cost per mile based on recent actual operating history rather than one short reporting window.",
    basis: "Trailing 90-day Actual Cost Per Mile, falling back to all history below the minimum mileage sample.",
  },
  directCostBreakEven: {
    label: "Direct Cost Break-Even",
    definition:
      "The rate at which a proposed load covers only the costs caused directly by that trip.",
    basis: "Fuel, tolls, dispatch, factoring and other direct trip costs.",
  },
  operatingBreakEven: {
    label: "Operating Break-Even",
    definition:
      "The rate at which a proposed load covers its direct trip costs and allocated operating costs, before debt service.",
    basis: "Direct Trip Costs plus Allocated Operating Costs.",
  },
  cashBreakEven: {
    label: "Cash Break-Even",
    definition:
      "The rate at which a proposed load covers Operating Break-Even plus its separately allocated debt-service burden.",
    basis: "Operating Break-Even plus Allocated Debt Service.",
  },
  expectedMonthlyMiles: {
    label: "Expected Monthly Miles",
    definition:
      "The owner's planning estimate of loaded plus deadhead miles in a normal month. It does not rewrite actual history.",
    basis: "User-entered monthly planning assumption.",
  },
  fixedObligationCoverage: {
    label: "Fixed-Obligation Coverage",
    definition:
      "How many times planned operating cash before financing covers active monthly financing obligations.",
    basis: "Expected monthly Booked Revenue minus normalized monthly Operating Costs, divided by active expected monthly obligation payments.",
  },
} as const;

export type FinancialTermKey = keyof typeof FINANCIAL_TERMS;

/** Missing metadata means the frozen value predates versioned calculations. */
export function financialModelVersionOf(value: { calculationVersion?: number } | null): number {
  return value?.calculationVersion ?? LEGACY_FINANCIAL_MODEL_VERSION;
}
