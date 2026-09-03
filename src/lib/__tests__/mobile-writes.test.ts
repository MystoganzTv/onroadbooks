import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { roleCan } from "../roles";
import {
  debtPaymentClassificationSchema,
  driverSchema,
  expenseSchema,
  fuelSchema,
  invoiceSchema,
  loadSchema,
  memberInviteSchema,
  memberRoleSchema,
  paymentEventSchema,
  reserveTransactionSchema,
  settlementRefSchema,
  truckSchema,
} from "../schemas";

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

/** From `DebtPaymentEditDTO`; the route fixes treatment and obligation id. */
const debtPaymentEditFromPhone = {
  date: "2026-09-01",
  description: "BIZON payment",
  vendor: "American Express",
  paymentAmount: 513,
  principalAmount: 513,
  interestAmount: 0,
  recurring: true,
  notes: "Automatic bank payment",
};

const fuelFromPhone = {
  date: "2026-09-01",
  gallons: 92.4,
  pricePerGallon: 4.465,
  totalCost: 412.6,
  odometer: 268_412,
  location: "Pilot #442, Joplin, MO",
  jurisdiction: "MO",
};

/** From `IssueInvoiceDTO`. `intent` is routing, not a schema field. */
const invoiceFromPhone = {
  invoiceNumber: "INV-2026-0043",
  invoiceDate: "2026-09-01",
  invoiceDueDate: "2026-10-01",
  billToName: "Werner Logistics",
};

describe("what the iOS app posts", () => {
  it("is accepted by the same schema the web form uses", () => {
    assert.equal(loadSchema.safeParse(loadFromPhone).success, true);
    assert.equal(expenseSchema.safeParse(expenseFromPhone).success, true);
    assert.equal(fuelSchema.safeParse(fuelFromPhone).success, true);
    assert.equal(invoiceSchema.safeParse(invoiceFromPhone).success, true);
    // The route reads `intent` off the body; the schema must not choke on it.
    assert.equal(invoiceSchema.safeParse({ ...invoiceFromPhone, intent: "issue" }).success, true);
  });

  it("refuses an invoice that would be due before it was issued", () => {
    assert.equal(
      invoiceSchema.safeParse({ ...invoiceFromPhone, invoiceDueDate: "2026-08-01" }).success,
      false,
    );
    assert.equal(invoiceSchema.safeParse({ ...invoiceFromPhone, billToName: "" }).success, false);
  });

  it("accepts a fill-up with nothing but the pump numbers", () => {
    const { odometer: _o, location: _l, jurisdiction: _j, ...pumpOnly } = fuelFromPhone;
    assert.equal(fuelSchema.safeParse(pumpOnly).success, true);
  });

  it("refuses a fill-up that would make MPG meaningless or the cost wrong", () => {
    assert.equal(fuelSchema.safeParse({ ...fuelFromPhone, gallons: 0 }).success, false);
    assert.equal(fuelSchema.safeParse({ ...fuelFromPhone, pricePerGallon: 0 }).success, false);
    assert.equal(fuelSchema.safeParse({ ...fuelFromPhone, totalCost: 0 }).success, false);
    // The app lets a driver type any two letters; the jurisdiction list decides.
    assert.equal(fuelSchema.safeParse({ ...fuelFromPhone, jurisdiction: "ZZ" }).success, false);
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

describe("what the protected iOS financing editor posts", () => {
  it("accepts the full zero-interest payment contract", () => {
    assert.equal(
      debtPaymentClassificationSchema.safeParse({
        ...debtPaymentEditFromPhone,
        treatment: "LOAN_SPLIT",
        obligationId: "obligation-amex",
      }).success,
      true,
    );
  });

  it("does not make a negative split valid", () => {
    assert.equal(
      debtPaymentClassificationSchema.safeParse({
        ...debtPaymentEditFromPhone,
        treatment: "LOAN_SPLIT",
        obligationId: "obligation-amex",
        interestAmount: -1,
      }).success,
      false,
    );
  });
});

describe("what the iOS app posts to /api/mobile/team", () => {
  /** From `InviteMemberDTO` / `UpdateMemberRoleDTO` in `APIRepository.swift`. */
  const inviteFromPhone = { email: "contadora@example.com", name: "Ana Ruiz", role: "BOOKKEEPER" };

  it("is accepted by the same schema the web invite form uses", () => {
    assert.equal(memberInviteSchema.safeParse(inviteFromPhone).success, true);
    assert.equal(memberInviteSchema.safeParse({ ...inviteFromPhone, name: undefined }).success, true);
    assert.equal(
      memberRoleSchema.safeParse({ userId: "user_1", role: "DISPATCHER" }).success,
      true,
    );
  });

  it("refuses OWNER and the legacy VIEWER as an assignable role -- ASSIGNABLE_ROLES has neither", () => {
    assert.equal(memberInviteSchema.safeParse({ ...inviteFromPhone, role: "OWNER" }).success, false);
    assert.equal(memberInviteSchema.safeParse({ ...inviteFromPhone, role: "VIEWER" }).success, false);
    assert.equal(memberRoleSchema.safeParse({ userId: "user_1", role: "OWNER" }).success, false);
  });

  it("refuses a bad email the same way the web form would", () => {
    assert.equal(memberInviteSchema.safeParse({ ...inviteFromPhone, email: "not-an-email" }).success, false);
  });

  it("keeps everyone but the owner out of Access & Roles", () => {
    assert.equal(roleCan("OWNER", "manage_team"), true);
    assert.equal(roleCan("ADMIN", "manage_team"), false);
    assert.equal(roleCan("BOOKKEEPER", "manage_team"), false);
    assert.equal(roleCan("DISPATCHER", "manage_team"), false);
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

  it("lets everyone who touches a truck record fuel, and a viewer still not", () => {
    assert.equal(roleCan("BOOKKEEPER", "manage_fuel"), true);
    assert.equal(roleCan("DISPATCHER", "manage_fuel"), true);
    assert.equal(roleCan("VIEWER", "manage_fuel"), false);
  });
});

describe("what the iOS app PATCHes to /api/mobile/truck for the IFTA filing decision", () => {
  /**
   * The route loads the truck's existing fields and merges in only
   * `iftaReportingEnabled` before validating -- this is that merged shape,
   * the same one `updateTruckByIdAction` would receive from the web form.
   */
  const mergedFromPhone = {
    name: "Freightliner 12",
    acquiredOn: null,
    year: 2019,
    make: "Freightliner",
    model: "Cascadia",
    vin: null,
    purchasePrice: null,
    monthlyPayment: null,
    monthlyInsurance: null,
    axleCount: null,
    registeredGrossWeightLbs: null,
    operatesInMultipleIftaJurisdictions: null,
    iftaReportingEnabled: true,
    startingOdometer: 100000,
    currentOdometer: 210500,
  };

  it("is accepted by the same truckSchema the web truck form uses, for true, false, and null", () => {
    assert.equal(truckSchema.safeParse(mergedFromPhone).success, true);
    assert.equal(
      truckSchema.safeParse({ ...mergedFromPhone, iftaReportingEnabled: false }).success,
      true,
    );
    assert.equal(
      truckSchema.safeParse({ ...mergedFromPhone, iftaReportingEnabled: null }).success,
      true,
    );
  });

  it("still refuses what the web form would refuse -- this isn't a looser truck editor", () => {
    assert.equal(truckSchema.safeParse({ ...mergedFromPhone, name: "" }).success, false);
    assert.equal(
      truckSchema.safeParse({ ...mergedFromPhone, currentOdometer: -1 }).success,
      false,
    );
  });

  it("gates on manage_fleet, same as createTruckAction/updateTruckByIdAction", () => {
    assert.equal(roleCan("OWNER", "manage_fleet"), true);
    assert.equal(roleCan("VIEWER", "manage_fleet"), false);
  });
});

describe("what the iOS app now posts to edit, collect and close", () => {
  /**
   * The phone stopped being append-only. Every one of these goes through the
   * SAME schema and the SAME repository call as the web, so a refusal a
   * browser would give is a refusal a truck stop gets.
   */

  it("edits a load with the whole load, because updateLoad is a replace not a patch", () => {
    // From `NewLoadDTO`, reused verbatim by the edit path in APIRepository.
    assert.equal(loadSchema.safeParse(loadFromPhone).success, true);
    // A partial body is refused: sending only the corrected rate would blank
    // the route, the miles and the trip costs.
    assert.equal(loadSchema.safeParse({ grossRate: 1900 }).success, false);
  });

  it("edits an expense and a fill-up with their own full schemas", () => {
    assert.equal(expenseSchema.safeParse(expenseFromPhone).success, true);
    assert.equal(fuelSchema.safeParse(fuelFromPhone).success, true);
  });

  /** From `RecordPaymentDTO`. `loadId` is supplied by the route, from the path. */
  it("records a payment the same way the web invoice dialog does", () => {
    const payment = { loadId: "load_1", date: "2026-09-02", amount: 1850 };
    assert.equal(paymentEventSchema.safeParse(payment).success, true);
    assert.equal(
      paymentEventSchema.safeParse({ ...payment, method: "ACH", reference: "88213" }).success,
      true,
    );
    // Zero is not a payment, and a mistyped date is not a date.
    assert.equal(paymentEventSchema.safeParse({ ...payment, amount: 0 }).success, false);
    assert.equal(paymentEventSchema.safeParse({ ...payment, date: "09/02/2026" }).success, false);
  });

  /** From `SettlementStatusDTO`. `status` is routing; the ref is the schema. */
  it("closes and reopens a half-month by month and half", () => {
    assert.equal(settlementRefSchema.safeParse({ month: "2026-08", half: "FIRST" }).success, true);
    assert.equal(settlementRefSchema.safeParse({ month: "2026-08", half: "SECOND" }).success, true);
    assert.equal(settlementRefSchema.safeParse({ month: "2026-8", half: "FIRST" }).success, false);
    assert.equal(settlementRefSchema.safeParse({ month: "2026-08", half: "THIRD" }).success, false);
  });

  /** From `ReserveMovementDTO`. */
  it("moves money in a reserve bucket only with a reason and an amount", () => {
    const movement = {
      accountId: "reserve_tax",
      date: "2026-09-02",
      type: "WITHDRAWAL",
      amount: 500,
      description: "Quarterly estimate",
    };
    assert.equal(reserveTransactionSchema.safeParse(movement).success, true);
    assert.equal(reserveTransactionSchema.safeParse({ ...movement, amount: 0 }).success, false);
    assert.equal(reserveTransactionSchema.safeParse({ ...movement, description: "" }).success, false);
    assert.equal(reserveTransactionSchema.safeParse({ ...movement, type: "TRANSFER" }).success, false);
  });

  /** From `NewDriverDTO`. A driver is an operational record, never a sign-in. */
  it("creates a driver with pay terms and nothing that could become a login", () => {
    const driver = { name: "Luis Ramos", payType: "PER_LOADED_MILE", payRate: 0.62, active: true };
    const parsed = driverSchema.safeParse(driver);
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal("email" in parsed.data, false, "a driver record has no email to invite");
      assert.equal("password" in parsed.data, false);
    }
    assert.equal(driverSchema.safeParse({ ...driver, name: "" }).success, false);
    // Only the four pay types the settlement maths knows how to allocate.
    assert.equal(driverSchema.safeParse({ ...driver, payType: "SALARY" }).success, false);
    assert.equal(driverSchema.safeParse({ ...driver, payRate: 0 }).success, false);
  });
});
