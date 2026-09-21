import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { dueRecurringExpenses, recurringExpenseSuggestions, optedInRecurringNotes } from "../recurring-expenses";
import { buildSeedDataset } from "../seed/seed-data";

describe("recurring expense suggestions", () => {
  it("repeats prior expenses explicitly marked as monthly templates", () => {
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

  it("never creates expenses from truck estimates or ordinary one-time entries", () => {
    const dataset = buildSeedDataset();
    dataset.expenses = [];
    assert.ok(dataset.trucks[0].monthlyPayment! > 0);
    assert.deepEqual(recurringExpenseSuggestions(dataset, "2026-09"), []);
    const ordinary = { ...buildSeedDataset().expenses[0], recurring: false };
    dataset.expenses.push(ordinary);
    assert.deepEqual(recurringExpenseSuggestions(dataset, "2026-09"), []);
  });

  it("does not perpetuate old automatic truck templates without an explicit opt-in", () => {
    const dataset = buildSeedDataset();
    const expense = { ...dataset.expenses[0], date: "2026-08-01", recurring: true,
      notes: "Added from Truck details because no recurring ledger expense exists. Posted automatically on 2026-08-01." };
    dataset.expenses = [expense];
    assert.deepEqual(recurringExpenseSuggestions(dataset, "2026-09"), []);
    expense.notes = optedInRecurringNotes(expense.notes);
    assert.equal(recurringExpenseSuggestions(dataset, "2026-09").length, 1);
    assert.equal(optedInRecurringNotes("Keep my own notes"), "Keep my own notes");
  });

  it("uses the chosen monthly day, keeps the original day after February, and stops when switched off", () => {
    const dataset = buildSeedDataset();
    const original = { ...dataset.expenses[0], id: "monthly", date: "2026-01-31", recurring: true, amount: 123, notes: null };
    dataset.expenses = [original];
    assert.deepEqual(dueRecurringExpenses(dataset, "2026-02", "2026-02-27"), []);
    const february = dueRecurringExpenses(dataset, "2026-02", "2026-02-28");
    assert.equal(february.length, 1);
    assert.equal(february[0].date, "2026-02-28");
    dataset.expenses.push({ ...original, id: "february", date: february[0].date, amount: 150 });
    assert.equal(dueRecurringExpenses(dataset, "2026-02", "2026-02-28").length, 0);
    const march = recurringExpenseSuggestions(dataset, "2026-03");
    assert.equal(march[0].date, "2026-03-31");
    assert.equal(march[0].amount, 150);
    dataset.expenses[1].recurring = false;
    assert.deepEqual(recurringExpenseSuggestions(dataset, "2026-03"), []);
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

describe("dueRecurringExpenses", () => {
  // What the nightly job is allowed to post without being asked. A cost dated
  // the 15th is not money spent on the 3rd: posting it early would put spend
  // in the ledger before it happened and skew every figure that divides by it
  // for the rest of the fortnight.
  it("posts only what the date has reached", () => {
    const dataset = buildSeedDataset();
    const truck = dataset.trucks[0];
    const all = recurringExpenseSuggestions(dataset, "2026-09", truck.id);
    const early = dueRecurringExpenses(dataset, "2026-09", "2026-09-01", truck.id);
    const wholeMonth = dueRecurringExpenses(dataset, "2026-09", "2026-09-30", truck.id);

    assert.ok(early.length < all.length, "mid-month costs must not post on the 1st");
    assert.equal(wholeMonth.length, all.length);
    assert.ok(early.every((item) => item.date <= "2026-09-01"));
  });

  it("posts nothing before the month starts", () => {
    const dataset = buildSeedDataset();
    assert.equal(dueRecurringExpenses(dataset, "2026-09", "2026-08-31").length, 0);
  });

  it("stops offering a cost once it is in the books", () => {
    const dataset = buildSeedDataset();
    const truck = dataset.trucks[0];
    const before = dueRecurringExpenses(dataset, "2026-09", "2026-09-30", truck.id);
    assert.ok(before.some((item) => item.category === "TRUCK_PAYMENT"));

    // Simulate the job having posted it, then run again: a second pass on the
    // same day must add nothing.
    dataset.expenses.push({
      ...dataset.expenses.find((expense) => expense.category === "TRUCK_PAYMENT")!,
      id: "posted_by_job",
      date: "2026-09-01",
      truckId: truck.id,
    });
    const after = dueRecurringExpenses(dataset, "2026-09", "2026-09-30", truck.id);
    assert.equal(after.some((item) => item.category === "TRUCK_PAYMENT"), false);
    assert.equal(after.length, before.length - 1);
  });
});
