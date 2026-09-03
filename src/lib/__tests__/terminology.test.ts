import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  FINANCIAL_MODEL_VERSION,
  FINANCIAL_TERMS,
  financialModelVersionOf,
} from "../finance/terminology";

describe("canonical financial terminology", () => {
  it("defines every public financial term and its basis", () => {
    const expected = [
      "bookedRevenue",
      "collectedRevenue",
      "accountsReceivable",
      "directTripCosts",
      "contributionProfit",
      "operatingExpenses",
      "operatingProfit",
      "interestExpense",
      "principalPayment",
      "debtService",
      "cashAfterDebtService",
      "reserveContributions",
      "safeToPayYourself",
      "actualCostPerMile",
      "normalizedCostPerMile",
      "directCostBreakEven",
      "operatingBreakEven",
      "cashBreakEven",
      "expectedMonthlyMiles",
      "fixedObligationCoverage",
    ];

    assert.deepEqual(Object.keys(FINANCIAL_TERMS), expected);
    for (const term of Object.values(FINANCIAL_TERMS)) {
      assert.ok(term.label.length > 0);
      assert.ok(term.definition.length > 0);
      assert.ok(term.basis.length > 0);
    }
  });

  it("treats unversioned stored calculations as legacy without rewriting them", () => {
    assert.equal(financialModelVersionOf(null), 1);
    assert.equal(financialModelVersionOf({}), 1);
    assert.equal(financialModelVersionOf({ calculationVersion: FINANCIAL_MODEL_VERSION }), 3);
  });
});
