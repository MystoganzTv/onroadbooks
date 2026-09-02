import type { FinancialTermKey } from "./terminology";

export type MoneyAnswerId =
  | "earned"
  | "businessProfit"
  | "collected"
  | "stillWaiting"
  | "spent"
  | "debtPayments"
  | "setAside"
  | "available";

export type MoneyValue =
  | { state: "KNOWN"; amount: number }
  | { state: "UNKNOWN"; amount: null; reason: string };

export interface MoneyAnswer {
  id: MoneyAnswerId;
  /** The owner question this number answers. */
  question: string;
  /** Plain-language label used in the default interface. */
  label: string;
  /** Accounting term revealed only in Financial Details. */
  canonicalTerm: FinancialTermKey;
  value: MoneyValue;
  explanation: string;
  tone: "info" | "positive" | "negative" | "warning" | "neutral";
}

export interface OwnerMoneyFacts {
  bookedRevenue: number | null;
  operatingProfit: number | null;
  collectedRevenue: number | null;
  accountsReceivable: number | null;
  unallocatedCollectedRevenue: number | null;
  operatingExpenses: number | null;
  debtService: number | null;
  /** Canonical cash after operating expenses and debt, before reserves. */
  cashAfterDebtService?: number | null;
  reserveTotal: number | null;
  safeToPay: number | null;
  loadCount?: number;
  totalMiles?: number;
  netMargin?: number | null;
}

export interface OwnerMoneyPresentation {
  answers: Record<MoneyAnswerId, MoneyAnswer>;
  /** A withdrawal cannot be negative; the raw negative stays visible as a gap. */
  availableToYou: MoneyValue;
  cashFundingGap: MoneyValue;
}

function known(amount: number): MoneyValue {
  return { state: "KNOWN", amount };
}

function unknown(reason: string): MoneyValue {
  return { state: "UNKNOWN", amount: null, reason };
}

function money(value: number | null, reason: string): MoneyValue {
  return value === null || !Number.isFinite(value) ? unknown(reason) : known(value);
}

function amountOf(value: MoneyValue): number | null {
  return value.state === "KNOWN" ? value.amount : null;
}

/**
 * Converts canonical financial outputs into the questions an owner asks.
 * This is presentation arithmetic only: it never changes profit, cash, debt,
 * reserves, or any stored financial result.
 */
export function selectOwnerMoneyPresentation(facts: OwnerMoneyFacts): OwnerMoneyPresentation {
  const waiting =
    facts.accountsReceivable === null || facts.unallocatedCollectedRevenue === null
      ? unknown("Payment status is incomplete for this period.")
      : known(facts.accountsReceivable + facts.unallocatedCollectedRevenue);
  const rawSafeToPay = money(
    facts.safeToPay,
    "Owner availability is unknown until collections, debt payments, and reserves are known.",
  );
  const rawAvailable = amountOf(rawSafeToPay);
  const availableToYou = rawAvailable === null ? rawSafeToPay : known(Math.max(rawAvailable, 0));
  const cashAfterDebtService = facts.cashAfterDebtService !== undefined
    ? money(
        facts.cashAfterDebtService,
        "Cash position is unknown until collections, business spending, and debt payments are known.",
      )
    : facts.collectedRevenue === null ||
        facts.operatingExpenses === null ||
        facts.debtService === null
      ? unknown(
          "Cash position is unknown until collections, business spending, and debt payments are known.",
        )
      : known(facts.collectedRevenue - facts.operatingExpenses - facts.debtService);
  const rawCashAfterDebt = amountOf(cashAfterDebtService);
  // A cash gap answers whether today's recorded cash covers today's cash out.
  // Recommended reserves are a separate future allocation, not cash missing now.
  const cashFundingGap = rawCashAfterDebt === null
    ? cashAfterDebtService
    : known(Math.max(-rawCashAfterDebt, 0));

  const answers: Record<MoneyAnswerId, MoneyAnswer> = {
    earned: {
      id: "earned",
      question: "How much did I earn?",
      label: "You earned",
      canonicalTerm: "bookedRevenue",
      value: money(facts.bookedRevenue, "Earned revenue is not available for this period."),
      explanation: `${facts.loadCount ?? 0} ${(facts.loadCount ?? 0) === 1 ? "load" : "loads"} · ${Math.round(facts.totalMiles ?? 0).toLocaleString()} miles`,
      tone: "info",
    },
    businessProfit: {
      id: "businessProfit",
      question: "How much did the business make?",
      label: "Your business made",
      canonicalTerm: "operatingProfit",
      value: money(facts.operatingProfit, "Business profit is not available for this period."),
      explanation:
        facts.netMargin === null || facts.netMargin === undefined
          ? "After operating costs"
          : `After operating costs · ${facts.netMargin.toFixed(1)}% margin`,
      tone: (facts.operatingProfit ?? 0) >= 0 ? "positive" : "negative",
    },
    collected: {
      id: "collected",
      question: "How much did I collect?",
      label: "You collected",
      canonicalTerm: "collectedRevenue",
      value: money(facts.collectedRevenue, "Cash collections are not known for this period."),
      explanation: "Cash with a recorded payment date",
      tone: "info",
    },
    stillWaiting: {
      id: "stillWaiting",
      question: "How much is still owed or waiting for a payment date?",
      label: "Still waiting",
      canonicalTerm: "accountsReceivable",
      value: waiting,
      explanation: "Customer balances plus paid loads that still need a payment date",
      tone: amountOf(waiting) === 0 ? "neutral" : "warning",
    },
    spent: {
      id: "spent",
      question: "How much did I spend running the business?",
      label: "Business expenses",
      canonicalTerm: "operatingExpenses",
      value: money(facts.operatingExpenses, "Business spending is not known for this period."),
      explanation: "Operating costs only; debt and financing are shown separately",
      tone: "negative",
    },
    debtPayments: {
      id: "debtPayments",
      question: "How much went to debt and financing?",
      label: "Debt & financing payments",
      canonicalTerm: "debtService",
      value: money(facts.debtService, "Debt and financing payments are not known for this period."),
      explanation: "Interest, principal, and any payment still needing a split",
      tone: "negative",
    },
    setAside: {
      id: "setAside",
      question: "How much should I set aside?",
      label: "Set aside",
      canonicalTerm: "reserveContributions",
      value: money(facts.reserveTotal, "Reserve targets are not known for this period."),
      explanation: "Your configured tax, maintenance, and other reserve targets",
      tone: "warning",
    },
    available: {
      id: "available",
      question: "How much can I take?",
      label: "Available to you",
      canonicalTerm: "safeToPayYourself",
      value: availableToYou,
      explanation:
        amountOf(cashFundingGap) && amountOf(cashFundingGap)! > 0
          ? "Recorded collections do not yet cover current cash obligations"
          : "After business expenses, debt and financing payments, and recommended set-asides",
      tone: amountOf(availableToYou) && amountOf(availableToYou)! > 0 ? "positive" : "neutral",
    },
  };

  return { answers, availableToYou, cashFundingGap };
}

export type ActionableProblemId =
  | "payment-dates"
  | "unclassified-debt"
  | "missing-fuel-details"
  | "missing-broker-customer"
  | "missing-invoice"
  | "missing-ifta-records"
  | "reserve-funding-gap";

export interface ActionableProblem {
  id: ActionableProblemId;
  amount: number | null;
  count: number | null;
  headline: string;
  what: string;
  why: string;
  action: { label: string; href: string };
  severity: "warning" | "critical";
}

export interface ActionableProblemInputs {
  unallocatedCollectedRevenue?: number;
  missingPaymentDateCount?: number;
  unallocatedDebtService?: number;
  estimatedFuelWithoutDetails?: number;
  missingBrokerCustomerCount?: number;
  missingInvoiceCount?: number;
  missingIftaRecordCount?: number;
  reserveFundingGap?: number;
}

/**
 * One problem contract for every surface. Each result includes what happened,
 * why it matters, and the next action; callers never render a dead warning.
 */
export function selectActionableFinancialProblems(
  input: ActionableProblemInputs,
): ActionableProblem[] {
  const problems: ActionableProblem[] = [];

  if ((input.unallocatedCollectedRevenue ?? 0) > 0) {
    const count = input.missingPaymentDateCount ?? 0;
    problems.push({
      id: "payment-dates",
      amount: input.unallocatedCollectedRevenue!,
      count: count > 0 ? count : null,
      headline: "Waiting to be recorded",
      what: count > 0
        ? `Add payment dates for ${count} paid ${count === 1 ? "load" : "loads"}.`
        : "These loads are marked Paid, but OnRoad does not know when the cash arrived.",
      why: "OnRoad needs the payment dates before it can include this money in your cash.",
      action: { label: "Fix now", href: "/invoices?needs=payment-date" },
      severity: "warning",
    });
  }
  if ((input.unallocatedDebtService ?? 0) > 0) {
    problems.push({
      id: "unclassified-debt",
      amount: input.unallocatedDebtService!,
      count: null,
      headline: "Debt & financing payments need a split",
      what: "Some financing payments are not classified between interest and principal.",
      why: "The total cash out is known, but reports cannot explain financing cost versus balance reduction.",
      action: { label: "Classify debt payments", href: "/expenses?review=debt" },
      severity: "warning",
    });
  }
  if ((input.estimatedFuelWithoutDetails ?? 0) > 0) {
    problems.push({
      id: "missing-fuel-details",
      amount: input.estimatedFuelWithoutDetails!,
      count: null,
      headline: "Fuel details are incomplete",
      what: "Fuel cost is coming from load estimates instead of actual fill-ups.",
      why: "MPG, average price per gallon, actual gallons, and IFTA fuel data remain unknown.",
      action: { label: "Add a fill-up", href: "/fuel?intent=add" },
      severity: "warning",
    });
  }
  if ((input.missingBrokerCustomerCount ?? 0) > 0) {
    problems.push({
      id: "missing-broker-customer",
      amount: null,
      count: input.missingBrokerCustomerCount!,
      headline: "Loads need a broker or customer",
      what: "Some loads do not identify who owes the money.",
      why: "Collections and customer performance cannot be followed reliably without a payer.",
      action: { label: "Complete load customers", href: "/loads?needs=customer" },
      severity: "warning",
    });
  }
  if ((input.missingInvoiceCount ?? 0) > 0) {
    problems.push({
      id: "missing-invoice",
      amount: null,
      count: input.missingInvoiceCount!,
      headline: "Delivered loads need invoices",
      what: "Some completed loads have not been invoiced.",
      why: "A customer cannot pay an invoice that has not been issued.",
      action: { label: "Create invoices", href: "/invoices?needs=invoice" },
      severity: "warning",
    });
  }
  if ((input.missingIftaRecordCount ?? 0) > 0) {
    problems.push({
      id: "missing-ifta-records",
      amount: null,
      count: input.missingIftaRecordCount!,
      headline: "IFTA mileage needs attention",
      what: "Some trips do not have the jurisdiction mileage needed for IFTA.",
      why: "Quarterly fuel-tax mileage will remain incomplete until those trips are reviewed.",
      action: { label: "Complete IFTA mileage", href: "/ifta?needs=mileage" },
      severity: "warning",
    });
  }
  if ((input.reserveFundingGap ?? 0) > 0) {
    problems.push({
      id: "reserve-funding-gap",
      amount: input.reserveFundingGap!,
      count: null,
      headline: "Reserve funding is behind target",
      what: "Your reserve balances are below the targets configured for the business.",
      why: "Less money is protected for tax, maintenance, or emergencies than the plan calls for.",
      action: { label: "Fund reserves", href: "/reserves" },
      severity: "critical",
    });
  }

  return problems;
}
