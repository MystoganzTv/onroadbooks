import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  selectActionableFinancialProblems,
  selectOwnerMoneyPresentation,
} from "../finance/presentation";

describe("owner financial presentation", () => {
  it("answers owner questions without changing the canonical values", () => {
    const view = selectOwnerMoneyPresentation({
      bookedRevenue: 5_200,
      operatingProfit: 2_818.31,
      collectedRevenue: 1_200,
      accountsReceivable: 0,
      unallocatedCollectedRevenue: 4_000,
      operatingExpenses: 2_381.69,
      debtService: 1_514,
      cashAfterDebtService: -2_695.69,
      reserveTotal: 823.66,
      safeToPay: -3_519.35,
      loadCount: 3,
      totalMiles: 1_430,
      netMargin: 54.2,
    });

    assert.deepEqual(view.answers.earned.value, { state: "KNOWN", amount: 5_200 });
    assert.deepEqual(view.answers.businessProfit.value, { state: "KNOWN", amount: 2_818.31 });
    assert.deepEqual(view.answers.collected.value, { state: "KNOWN", amount: 1_200 });
    assert.deepEqual(view.answers.stillWaiting.value, { state: "KNOWN", amount: 4_000 });
    assert.equal(view.answers.spent.label, "Business expenses");
    assert.equal(view.answers.debtPayments.label, "Debt & financing payments");
    assert.deepEqual(view.availableToYou, { state: "KNOWN", amount: 0 });
    assert.deepEqual(view.cashFundingGap, { state: "KNOWN", amount: 2_695.69 });
  });

  it("preserves unknown financial states instead of presenting zero", () => {
    const view = selectOwnerMoneyPresentation({
      bookedRevenue: 100,
      operatingProfit: 50,
      collectedRevenue: null,
      accountsReceivable: null,
      unallocatedCollectedRevenue: null,
      operatingExpenses: 50,
      debtService: null,
      cashAfterDebtService: null,
      reserveTotal: null,
      safeToPay: null,
    });

    assert.equal(view.answers.collected.value.state, "UNKNOWN");
    assert.equal(view.answers.stillWaiting.value.state, "UNKNOWN");
    assert.equal(view.answers.debtPayments.value.state, "UNKNOWN");
    assert.equal(view.availableToYou.state, "UNKNOWN");
    assert.equal(view.cashFundingGap.state, "UNKNOWN");
  });

  it("never turns a positive safe-to-pay amount into a funding gap", () => {
    const view = selectOwnerMoneyPresentation({
      bookedRevenue: 1_000,
      operatingProfit: 500,
      collectedRevenue: 1_000,
      accountsReceivable: 0,
      unallocatedCollectedRevenue: 0,
      operatingExpenses: 500,
      debtService: 100,
      cashAfterDebtService: 400,
      reserveTotal: 100,
      safeToPay: 300,
    });

    assert.deepEqual(view.availableToYou, { state: "KNOWN", amount: 300 });
    assert.deepEqual(view.cashFundingGap, { state: "KNOWN", amount: 0 });
  });

  it("does not present recommended reserves as cash missing today", () => {
    const view = selectOwnerMoneyPresentation({
      bookedRevenue: 1_000,
      operatingProfit: 500,
      collectedRevenue: 600,
      accountsReceivable: 400,
      unallocatedCollectedRevenue: 0,
      operatingExpenses: 400,
      debtService: 100,
      cashAfterDebtService: 100,
      reserveTotal: 250,
      safeToPay: -150,
    });

    assert.deepEqual(view.availableToYou, { state: "KNOWN", amount: 0 });
    assert.deepEqual(view.cashFundingGap, { state: "KNOWN", amount: 0 });
    assert.deepEqual(view.answers.setAside.value, { state: "KNOWN", amount: 250 });
  });
});

describe("actionable financial problems", () => {
  it("always includes what happened, why it matters, and a next action", () => {
    const problems = selectActionableFinancialProblems({
      unallocatedCollectedRevenue: 4_000,
      missingPaymentDateCount: 2,
      unallocatedDebtService: 1_514,
      estimatedFuelWithoutDetails: 475.69,
      missingBrokerCustomerCount: 2,
      missingInvoiceCount: 1,
      missingIftaRecordCount: 3,
      reserveFundingGap: 600,
    });

    assert.equal(problems.length, 7);
    assert.equal(problems[0]?.count, 2);
    assert.match(problems[0]?.what ?? "", /2 paid loads/);
    for (const problem of problems) {
      assert.ok(problem.headline.length > 0);
      assert.ok(problem.what.length > 0);
      assert.ok(problem.why.length > 0);
      assert.ok(problem.action.label.length > 0);
      assert.ok(problem.action.href.startsWith("/"));
    }
  });

  it("does not create dead warnings for resolved states", () => {
    assert.deepEqual(selectActionableFinancialProblems({}), []);
  });
});
