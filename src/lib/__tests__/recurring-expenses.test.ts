import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { recurringExpenseSuggestions } from "../recurring-expenses";
import { buildSeedDataset } from "../seed/seed-data";

describe("recurring expense suggestions", () => {
  it("reuses truck payment, insurance, and prior monthly templates", () => {
    const dataset = buildSeedDataset();
    const truck = dataset.trucks[0];
    const suggestions = recurringExpenseSuggestions(dataset, "2026-09", truck.id);

    assert.equal(
      suggestions.find((item) => item.category === "TRUCK_PAYMENT")?.amount,
      truck.monthlyPayment,
    );
    assert.equal(
      suggestions.find((item) => item.category === "INSURANCE")?.amount,
      truck.monthlyInsurance,
    );
    assert.ok(suggestions.some((item) => item.category === "PHONE"));
    assert.equal(
      suggestions.filter((item) => item.category === "TRUCK_PAYMENT").length,
      1,
      "truck details and the prior template must not create duplicate payments",
    );
  });

  it("does not suggest a monthly cost already present in the target month", () => {
    const dataset = buildSeedDataset();
    const truck = dataset.trucks[0];
    dataset.expenses.push({
      ...dataset.expenses.find((expense) => expense.category === "TRUCK_PAYMENT")!,
      id: "sep_payment",
      date: "2026-09-01",
      truckId: truck.id,
    });

    const suggestions = recurringExpenseSuggestions(dataset, "2026-09", truck.id);
    assert.equal(suggestions.some((item) => item.category === "TRUCK_PAYMENT"), false);
  });

  it("never overwrites an expense that differs from the Truck details estimate", () => {
    const dataset = buildSeedDataset();
    const truck = dataset.trucks[0];
    const payment = dataset.expenses.find(
      (expense) => expense.category === "TRUCK_PAYMENT" && expense.date.startsWith("2026-08"),
    )!;
    payment.amount = (truck.monthlyPayment ?? 0) + 65;

    const suggestions = recurringExpenseSuggestions(dataset, "2026-08", truck.id);
    const correction = suggestions.find((item) => item.category === "TRUCK_PAYMENT");

    assert.equal(correction, undefined);
    assert.equal(payment.amount, (truck.monthlyPayment ?? 0) + 65);
  });

  it("preserves multiple lenders that together make up the truck payment", () => {
    const dataset = buildSeedDataset();
    const truck = dataset.trucks[0];
    truck.monthlyPayment = 1_600;
    const original = dataset.expenses.find((expense) => expense.category === "TRUCK_PAYMENT")!;
    dataset.expenses = dataset.expenses.filter(
      (expense) => expense.category !== "TRUCK_PAYMENT",
    );
    const dealer = {
      ...original,
      id: "dealer_truck_financing",
      date: "2026-08-01",
      amount: 1_150,
      description: "Dealer financing",
      vendor: "Dealer",
      recurring: true,
    };
    dataset.expenses.push(dealer);
    dataset.expenses.push({
      ...dealer,
      id: "amex_truck_financing",
      amount: 515,
      description: "Amex personal loan - truck",
      vendor: "Amex",
    });

    const suggestions = recurringExpenseSuggestions(dataset, "2026-09", truck.id);
    const payments = suggestions
      .filter((item) => item.category === "TRUCK_PAYMENT")
      .sort((a, b) => a.amount - b.amount);

    assert.deepEqual(
      payments.map((payment) => [payment.description, payment.amount]),
      [
        ["Amex personal loan - truck", 515],
        ["Dealer financing", 1_150],
      ],
    );
  });
});
