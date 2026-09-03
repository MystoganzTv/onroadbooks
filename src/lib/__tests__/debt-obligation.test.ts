import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  nextScheduledPaymentDate,
  summarizeDebtBalance,
} from "@/lib/finance/debt-obligation";
import type { Expense, FinancialObligation } from "@/lib/types";

function obligation(overrides: Partial<FinancialObligation> = {}): FinancialObligation {
  return {
    id: "debt-1",
    businessId: "business-1",
    truckId: "truck-1",
    name: "Truck note",
    kind: "LOAN",
    counterparty: "Bank",
    startedOn: "2026-01-01",
    endedOn: null,
    startingBalance: 25_000,
    aprPercent: 8.25,
    paymentDueDay: 15,
    expectedMonthlyPayment: 1_200,
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function expense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: "expense-1",
    businessId: "business-1",
    truckId: "truck-1",
    scope: "TRUCK",
    loadId: null,
    date: "2026-09-01",
    category: "PRINCIPAL_PAYMENT",
    description: "Truck payment",
    vendor: "Bank",
    amount: 950,
    financialTreatment: "PRINCIPAL",
    obligationId: "debt-1",
    splitGroupId: "payment-1",
    recurring: true,
    receiptNumber: null,
    notes: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("debt obligation planning", () => {
  it("reduces the starting balance only by recorded principal through today", () => {
    const summary = summarizeDebtBalance(obligation(), [
      expense(),
      expense({ id: "interest", category: "INTEREST_EXPENSE", financialTreatment: "INTEREST", amount: 250 }),
      expense({ id: "other-debt", obligationId: "debt-2", amount: 5_000 }),
      expense({ id: "future", date: "2026-10-01", amount: 900 }),
    ], "2026-09-03");

    assert.deepEqual(summary, {
      startingBalance: 25_000,
      principalPaid: 950,
      currentBalance: 24_050,
    });
  });

  it("preserves an unknown balance instead of presenting zero", () => {
    assert.deepEqual(summarizeDebtBalance(obligation({ startingBalance: null }), []), {
      startingBalance: null,
      principalPaid: 0,
      currentBalance: null,
    });
  });

  it("keeps a legitimate zero balance and never reports a negative balance", () => {
    assert.equal(summarizeDebtBalance(obligation({ startingBalance: 0 }), []).currentBalance, 0);
    assert.equal(
      summarizeDebtBalance(obligation({ startingBalance: 500 }), [expense({ amount: 600 })]).currentBalance,
      0,
    );
  });

  it("uses the contractual due day and advances after a payment this month", () => {
    assert.equal(nextScheduledPaymentDate(15, "2026-09-03"), "2026-09-15");
    assert.equal(
      nextScheduledPaymentDate(15, "2026-09-03", ["2026-09-01"]),
      "2026-10-15",
    );
    assert.equal(nextScheduledPaymentDate(1, "2026-09-03"), "2026-10-01");
  });

  it("clamps day 31 to the final day of short months", () => {
    assert.equal(nextScheduledPaymentDate(31, "2027-02-01"), "2027-02-28");
    assert.equal(nextScheduledPaymentDate(31, "2028-02-01"), "2028-02-29");
  });
});
