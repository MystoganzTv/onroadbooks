import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { mobileExpenseRows } from "../finance/mobile-expense-ledger";
import type { Expense, FinancialObligation } from "../types";

function expense(overrides: Partial<Expense> & Pick<Expense, "id" | "category" | "amount">): Expense {
  return {
    businessId: "business-1",
    truckId: "truck-1",
    scope: "TRUCK",
    loadId: null,
    date: "2026-09-01",
    description: "BIZON payment",
    vendor: "Amex",
    recurring: true,
    receiptNumber: null,
    notes: "Autopay",
    createdAt: "2026-09-01T12:00:00.000Z",
    ...overrides,
  };
}

const amex: FinancialObligation = {
  id: "obligation-amex",
  businessId: "business-1",
  truckId: "truck-1",
  name: "Amex",
  kind: "LOAN",
  counterparty: "American Express",
  startedOn: null,
  endedOn: null,
  startingBalance: 10_000,
  aprPercent: 0,
  paymentDueDay: 1,
  expectedMonthlyPayment: 513,
  active: true,
  createdAt: "2026-09-01T12:00:00.000Z",
};

describe("mobile expense ledger", () => {
  it("returns principal and interest as one atomic payment", () => {
    const rows = mobileExpenseRows(
      [
        expense({
          id: "principal",
          category: "PRINCIPAL_PAYMENT",
          financialTreatment: "PRINCIPAL",
          obligationId: amex.id,
          splitGroupId: "split-1",
          amount: 500,
        }),
        expense({
          id: "interest",
          category: "INTEREST_EXPENSE",
          financialTreatment: "INTEREST",
          obligationId: amex.id,
          splitGroupId: "split-1",
          description: "BIZON payment · interest",
          amount: 13,
        }),
      ],
      [amex],
      (category) => category,
    );

    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0], {
      id: "principal",
      date: "2026-09-01",
      category: "PRINCIPAL_PAYMENT",
      categoryLabel: "Amex",
      description: "BIZON payment",
      vendor: "Amex",
      amount: 513,
      editor: "DEBT_PAYMENT",
      principalAmount: 500,
      interestAmount: 13,
    });
  });

  it("keeps a zero-interest payment atomic when only its principal row exists", () => {
    const rows = mobileExpenseRows(
      [
        expense({
          id: "principal-only",
          category: "PRINCIPAL_PAYMENT",
          financialTreatment: "PRINCIPAL",
          obligationId: amex.id,
          splitGroupId: "split-2",
          amount: 513,
        }),
      ],
      [amex],
      (category) => category,
    );

    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.editor, "DEBT_PAYMENT");
    assert.equal(rows[0]?.amount, 513);
    assert.equal(rows[0]?.principalAmount, 513);
    assert.equal(rows[0]?.interestAmount, 0);
  });

  it("leaves an ordinary expense in the generic editor", () => {
    const rows = mobileExpenseRows(
      [expense({ id: "fuel", category: "FUEL", description: "Pilot", amount: 205.12 })],
      [],
      () => "Fuel",
    );

    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.editor, "EXPENSE");
    assert.equal(rows[0]?.categoryLabel, "Fuel");
  });
});
