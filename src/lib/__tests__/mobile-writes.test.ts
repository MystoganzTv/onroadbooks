import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { roleCan } from "../roles";
import { expenseSchema, loadSchema } from "../schemas";

/**
 * The iOS app posts JSON straight at `/api/mobile/loads` and
 * `/api/mobile/expenses`, which validate with the SAME schemas the web forms
 * post through. Nothing in this repository compiles the Swift, so the way that
 * contract breaks is silently: a field renamed here, or a required field the
 * phone stops sending, and the first person to find out is a driver at a fuel
 * island watching a save fail.
 *
 * These objects are transcribed from `NewLoadDTO` and `NewExpenseDTO` in
 * `mobile/Sources/OnRoadBooks/Data/APIRepository.swift`. Change one, change the
 * other.
 */
const loadFromPhone = {
  date: "2026-09-01",
  broker: "TQL",
  originCity: "Miami",
  originState: "FL",
  destinationCity: "Atlanta",
  destinationState: "GA",
  grossRate: 1850,
  loadedMiles: 662,
  deadheadMiles: 41,
  fuelCost: 0,
  tolls: 0,
  dispatchFee: 0,
  factoringFee: 0,
  otherExpenses: 0,
  status: "PENDING",
};

const expenseFromPhone = {
  date: "2026-09-01",
  category: "FUEL",
  description: "Pilot #442",
  vendor: "Pilot",
  amount: 412.6,
  recurring: false,
};

describe("what the iOS app posts", () => {
  it("is accepted by the same schema the web form uses", () => {
    assert.equal(loadSchema.safeParse(loadFromPhone).success, true);
    assert.equal(expenseSchema.safeParse(expenseFromPhone).success, true);
  });

  it("still validates with the optional fields left out", () => {
    const { broker, ...withoutBroker } = loadFromPhone;
    assert.ok(broker);
    assert.equal(loadSchema.safeParse(withoutBroker).success, true);

    const { vendor, ...withoutVendor } = expenseFromPhone;
    assert.ok(vendor);
    assert.equal(expenseSchema.safeParse(withoutVendor).success, true);
  });

  it("needs every field the phone sends as a zero -- they are required, not optional", () => {
    for (const field of ["fuelCost", "tolls", "dispatchFee", "factoringFee", "otherExpenses"]) {
      const { [field]: _dropped, ...missing } = loadFromPhone as Record<string, unknown>;
      assert.equal(loadSchema.safeParse(missing).success, false, `${field} must be sent`);
    }
    // `recurring` has no default either: an expense posted without it is refused.
    const { recurring: _r, ...withoutRecurring } = expenseFromPhone;
    assert.equal(expenseSchema.safeParse(withoutRecurring).success, false);
  });

  it("gets the same refusals a browser would", () => {
    assert.equal(loadSchema.safeParse({ ...loadFromPhone, originState: "FLA" }).success, false);
    assert.equal(loadSchema.safeParse({ ...loadFromPhone, grossRate: 0 }).success, false);
    assert.equal(loadSchema.safeParse({ ...loadFromPhone, loadedMiles: 0 }).success, false);
    assert.equal(loadSchema.safeParse({ ...loadFromPhone, date: "09/01/2026" }).success, false);
    assert.equal(expenseSchema.safeParse({ ...expenseFromPhone, amount: 0 }).success, false);
    assert.equal(expenseSchema.safeParse({ ...expenseFromPhone, description: "" }).success, false);
    assert.equal(expenseSchema.safeParse({ ...expenseFromPhone, category: "NOT_A_CATEGORY" }).success, false);
  });
});

describe("the permission each mobile write asks for", () => {
  it("lets an owner do both and a viewer neither", () => {
    assert.equal(roleCan("OWNER", "manage_loads"), true);
    assert.equal(roleCan("OWNER", "manage_expenses"), true);
    assert.equal(roleCan("VIEWER", "manage_loads"), false);
    assert.equal(roleCan("VIEWER", "manage_expenses"), false);
  });

  it("keeps a bookkeeper out of loads and a dispatcher out of expenses", () => {
    assert.equal(roleCan("BOOKKEEPER", "manage_expenses"), true);
    assert.equal(roleCan("BOOKKEEPER", "manage_loads"), false);
    assert.equal(roleCan("DISPATCHER", "manage_loads"), true);
    assert.equal(roleCan("DISPATCHER", "manage_expenses"), false);
  });
});
