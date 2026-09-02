/**
 * Behavioural contract for the storage layer, exercised against the JSON
 * store.
 *
 * These are the rules the Postgres store also has to keep, and they are the
 * ones that quietly break money: a fuel purchase must appear in the ledger
 * exactly once, a service record's ledger row must disappear with it, a
 * deleted load must not take its expenses down with it, and a session must
 * never be able to read another business's rows.
 *
 * The store reads `process.cwd()` when it is first imported, so the working
 * directory is moved to a scratch folder BEFORE the dynamic import below.
 * Nothing here touches the real data/ directory.
 *
 * Run with --conditions=react-server so the `server-only` marker resolves to
 * its empty build instead of throwing (see the `test` script).
 */

import assert from "node:assert/strict";
import {
  mkdtempSync,
  existsSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

import { buildSeedDataset, FIXTURE_BUSINESS } from "../seed/seed-data";
import { hasFleetAccess } from "../plans";
import type {
  ExpenseInput,
  FuelEntryInput,
  LoadInput,
  MaintenanceInput,
} from "../db/repository";
import { loadExpenseId } from "../load-expenses";

const SANDBOX = mkdtempSync(path.join(tmpdir(), "onroad-books-store-"));
const ORIGINAL_CWD = process.cwd();
const DATA_FILE = path.join(SANDBOX, "data", "onroad-books.json");
const BUSINESS = FIXTURE_BUSINESS.id;

type StoreModule = typeof import("../db/json-store");

let store: StoreModule;
let repo: InstanceType<StoreModule["JsonRepository"]>;
let auth: InstanceType<StoreModule["JsonAuthStore"]>;
let fuelExpenseId: StoreModule["fuelExpenseId"];

before(async () => {
  // The store captures its data path from the working directory the first
  // time it is loaded, so the move happens before the import -- otherwise
  // these tests would write to the real ledger.
  process.chdir(SANDBOX);
  mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  writeFileSync(DATA_FILE, JSON.stringify(buildSeedDataset(), null, 2), "utf8");
  store = await import("../db/json-store");
  fuelExpenseId = store.fuelExpenseId;
  repo = new store.JsonRepository(BUSINESS);
  auth = new store.JsonAuthStore();
});

after(() => {
  process.chdir(ORIGINAL_CWD);
});

const fuel = (over: Partial<FuelEntryInput> = {}): FuelEntryInput => ({
  date: "2026-08-14",
  gallons: 50,
  pricePerGallon: 3.6,
  totalCost: 180,
  odometer: null,
  location: "Pilot - Carlisle, PA",
  loadId: null,
  notes: null,
  ...over,
});

const service = (over: Partial<MaintenanceInput> = {}): MaintenanceInput => ({
  type: "OIL_CHANGE",
  basis: "BOTH",
  serviceDate: "2026-08-10",
  odometer: 100_000,
  cost: 320,
  vendor: "Fleet Service Co",
  nextServiceDate: "2026-11-10",
  nextServiceOdometer: 110_000,
  notes: null,
  recordAsExpense: true,
  ...over,
});

const expense = (over: Partial<ExpenseInput> = {}): ExpenseInput => ({
  date: "2026-08-12",
  category: "TOLLS",
  description: "NJ Turnpike",
  vendor: null,
  amount: 42.5,
  loadId: null,
  recurring: false,
  receiptNumber: null,
  notes: null,
  ...over,
});

const loadInput = (over: Partial<LoadInput> = {}): LoadInput => ({
  date: "2026-08-20",
  deliveryDate: "2026-08-21",
  originCity: "Dallas",
  originState: "TX",
  destinationCity: "Atlanta",
  destinationState: "GA",
  broker: "Acme",
  loadNumber: "THREE-TRUCK-1",
  equipmentType: "DRY_VAN",
  loadCapacity: "FULL",
  equipmentLengthFt: 53,
  weightLbs: 35_000,
  commodity: "General freight",
  loadedMiles: 784,
  deadheadMiles: 20,
  grossRate: 2400,
  fuelCost: 0,
  tolls: 0,
  dispatchFee: 0,
  factoringFee: 0,
  otherExpenses: 0,
  status: "PENDING",
  notes: null,
  ...over,
});

describe("reference fixture", () => {
  it("loads a usable ledger", async () => {
    const dataset = await repo.getDataset();
    assert.equal(dataset.business.id, BUSINESS);
    assert.ok(dataset.loads.length >= 15, "seed should ship a working month of loads");
    assert.ok(dataset.fuelEntries.length >= 8);
    assert.ok(dataset.maintenanceRecords.length > 0);
    assert.ok(existsSync(DATA_FILE), "the seeded dataset is persisted, not held in memory");
  });

  it("mirrors every seeded fuel purchase into the ledger exactly once", async () => {
    const { fuelEntries, expenses } = await repo.getDataset();
    for (const entry of fuelEntries) {
      const mirrored = expenses.filter((e) => e.id === fuelExpenseId(entry.id));
      assert.equal(mirrored.length, 1, `fuel ${entry.id} should have one ledger row`);
      assert.equal(mirrored[0].category, "FUEL");
      assert.equal(mirrored[0].amount, entry.totalCost);
    }
  });
});

describe("business scoping", () => {
  let intruder: InstanceType<StoreModule["JsonRepository"]>;
  before(() => {
    intruder = new store.JsonRepository("biz_someone_else");
  });

  it("refuses to read another business's dataset", async () => {
    await assert.rejects(() => intruder.getDataset(), /does not have access/);
  });

  it("refuses to write to another business's dataset", async () => {
    await assert.rejects(() => intruder.createExpense(expense()), /does not have access/);
    await assert.rejects(() => intruder.createFuelEntry(fuel()), /does not have access/);
    await assert.rejects(() => intruder.deleteLoad("load_aug_01"), /does not have access/);
  });

  it("leaves the ledger untouched after a rejected write", async () => {
    const before = await repo.getDataset();
    await assert.rejects(() => intruder.createExpense(expense({ amount: 999_999 })));
    const after = await repo.getDataset();
    assert.equal(after.expenses.length, before.expenses.length);
  });
});

describe("fuel <-> expense mirror", () => {
  it("creates, updates and removes the ledger row with the entry", async () => {
    const entry = await repo.createFuelEntry(fuel({ totalCost: 180, gallons: 50 }));
    assert.equal(entry.expenseId, fuelExpenseId(entry.id));

    let expenses = (await repo.getDataset()).expenses;
    const created = expenses.find((e) => e.id === entry.expenseId);
    assert.ok(created, "creating fuel must book the expense");
    assert.equal(created.amount, 180);
    assert.equal(created.category, "FUEL");

    await repo.updateFuelEntry(entry.id, fuel({ totalCost: 210, gallons: 55, date: "2026-08-15" }));
    expenses = (await repo.getDataset()).expenses;
    const mirrored = expenses.filter((e) => e.id === entry.expenseId);
    assert.equal(mirrored.length, 1, "an edit must not leave a second ledger row behind");
    assert.equal(mirrored[0].amount, 210);
    assert.equal(mirrored[0].date, "2026-08-15");

    await repo.deleteFuelEntry(entry.id);
    const after = await repo.getDataset();
    assert.equal(after.fuelEntries.some((f) => f.id === entry.id), false);
    assert.equal(
      after.expenses.some((e) => e.id === entry.expenseId),
      false,
      "deleting fuel must not orphan its ledger row",
    );
  });

  it("refuses to edit or delete the mirrored row from the Expenses page", async () => {
    // Deleting it here used to succeed: the diesel left the books while the
    // fuel entry that paid for it stayed on the Fuel page, unchanged. The
    // guard is server-side because hiding the button is only a suggestion.
    const entry = await repo.createFuelEntry(fuel({ totalCost: 180, gallons: 50 }));
    const mirrorId = entry.expenseId!;

    await assert.rejects(() => repo.deleteExpense(mirrorId), /comes from a fuel entry/);
    await assert.rejects(
      () => repo.updateExpense(mirrorId, expense({ category: "FUEL", description: "hand edit", amount: 1 })),
      /comes from a fuel entry/,
    );

    const dataset = await repo.getDataset();
    const still = dataset.expenses.find((e) => e.id === mirrorId);
    assert.equal(still?.amount, 180, "the ledger row must survive the refusal untouched");

    await repo.deleteFuelEntry(entry.id);
  });

  it("advances the odometer but never rolls it back", async () => {
    const start = (await repo.getDataset()).trucks[0].currentOdometer;

    const forward = await repo.createFuelEntry(fuel({ odometer: start + 500 }));
    assert.equal((await repo.getDataset()).trucks[0].currentOdometer, start + 500);

    const backward = await repo.createFuelEntry(fuel({ odometer: start - 5_000 }));
    assert.equal(
      (await repo.getDataset()).trucks[0].currentOdometer,
      start + 500,
      "a mistyped older reading must not reset the truck",
    );

    await repo.deleteFuelEntry(forward.id);
    await repo.deleteFuelEntry(backward.id);
  });

  it("keeps the load link in step with the entry", async () => {
    const loadId = (await repo.getDataset()).loads[0].id;
    const entry = await repo.createFuelEntry(fuel({ loadId }));
    const linked = (await repo.getDataset()).expenses.find((e) => e.id === entry.expenseId);
    assert.equal(linked?.loadId, loadId);

    await repo.updateFuelEntry(entry.id, fuel({ loadId: null }));
    const unlinked = (await repo.getDataset()).expenses.find((e) => e.id === entry.expenseId);
    assert.equal(unlinked?.loadId, null);

    await repo.deleteFuelEntry(entry.id);
  });
});

describe("maintenance <-> expense mirror", () => {
  it("books the cost once and withdraws it when the toggle is turned off", async () => {
    const record = await repo.createMaintenance(service({ cost: 320 }));
    assert.ok(record.expenseId, "recordAsExpense must produce a ledger row");

    let dataset = await repo.getDataset();
    const booked = dataset.expenses.filter((e) => e.id === record.expenseId);
    assert.equal(booked.length, 1);
    assert.equal(booked[0].amount, 320);
    assert.equal(booked[0].category, "MAINTENANCE");

    const updated = await repo.updateMaintenance(record.id, service({ cost: 380 }));
    dataset = await repo.getDataset();
    assert.equal(
      dataset.expenses.filter((e) => e.id === updated.expenseId).length,
      1,
      "editing must update the ledger row, not add another",
    );
    assert.equal(dataset.expenses.find((e) => e.id === updated.expenseId)?.amount, 380);

    const detached = await repo.updateMaintenance(
      record.id,
      service({ cost: 380, recordAsExpense: false }),
    );
    dataset = await repo.getDataset();
    assert.equal(detached.expenseId, null);
    assert.equal(dataset.expenses.some((e) => e.id === record.expenseId), false);

    await repo.deleteMaintenance(record.id);
  });

  it("does not book a zero-cost service", async () => {
    const record = await repo.createMaintenance(service({ cost: 0 }));
    assert.equal(record.expenseId, null);
    const dataset = await repo.getDataset();
    assert.equal(dataset.expenses.some((e) => e.id === `expmaint_${record.id}`), false);
    await repo.deleteMaintenance(record.id);
  });

  it("removes the ledger row when the service record is deleted", async () => {
    const record = await repo.createMaintenance(service());
    const expenseId = record.expenseId!;
    await repo.deleteMaintenance(record.id);
    const dataset = await repo.getDataset();
    assert.equal(dataset.maintenanceRecords.some((m) => m.id === record.id), false);
    assert.equal(dataset.expenses.some((e) => e.id === expenseId), false);
  });

  it("clears the pointer when the ledger row is deleted from the Expenses page", async () => {
    const record = await repo.createMaintenance(service());
    await repo.deleteExpense(record.expenseId!);
    const dataset = await repo.getDataset();
    const reread = dataset.maintenanceRecords.find((m) => m.id === record.id);
    assert.equal(reread?.expenseId, null, "a dangling expenseId would re-delete a stranger's row");
    await repo.deleteMaintenance(record.id);
  });

  it("keeps a service reading from lowering the odometer", async () => {
    const start = (await repo.getDataset()).trucks[0].currentOdometer;
    const record = await repo.createMaintenance(service({ odometer: start - 10_000 }));
    assert.equal((await repo.getDataset()).trucks[0].currentOdometer, start);
    await repo.deleteMaintenance(record.id);
  });
});

describe("load costs <-> expense mirror", () => {
  it("posts each trip cost once, updates it, and advances only from a real odometer", async () => {
    const start = (await repo.getDataset()).trucks[0].currentOdometer;
    const load = await repo.createLoad({
      date: "2026-08-29",
      endingOdometer: start + 700,
      originCity: "Dallas",
      originState: "TX",
      destinationCity: "Atlanta",
      destinationState: "GA",
      broker: "Test Broker",
      loadNumber: "SYNC-1",
      loadedMiles: 620,
      deadheadMiles: 80,
      grossRate: 2400,
      fuelCost: 300,
      tolls: 45,
      dispatchFee: 120,
      factoringFee: 60,
      otherExpenses: 25,
      // Omitted on purpose: a load the app creates posts its costs by default.
      status: "PENDING",
      notes: null,
    });

    let dataset = await repo.getDataset();
    assert.equal(dataset.trucks[0].currentOdometer, start + 700);
    assert.equal(dataset.expenses.find((e) => e.id === loadExpenseId(load.id, "fuel"))?.amount, 300);
    assert.equal(dataset.expenses.find((e) => e.id === loadExpenseId(load.id, "tolls"))?.amount, 45);
    assert.equal(
      dataset.expenses
        .filter((expense) => expense.loadId === load.id)
        .reduce((total, expense) => total + expense.amount, 0),
      550,
      "all trip costs must reach the same-day operating ledger even from an old false flag",
    );
    assert.equal(
      dataset.expenses.filter((expense) => expense.loadId === load.id).every((expense) => expense.date === load.date),
      true,
      "Today must see load costs on the pickup date",
    );

    const updated = await repo.updateLoad(load.id, { ...load, fuelCost: 325, tolls: 0 });
    dataset = await repo.getDataset();
    assert.equal(
      dataset.expenses.filter((e) => e.id === loadExpenseId(load.id, "fuel")).length,
      1,
    );
    assert.equal(dataset.expenses.find((e) => e.id === loadExpenseId(load.id, "fuel"))?.amount, 325);
    assert.equal(dataset.expenses.some((e) => e.id === loadExpenseId(load.id, "tolls")), false);

    await repo.deleteLoad(updated.id);
    dataset = await repo.getDataset();
    assert.equal(dataset.expenses.some((e) => e.id.startsWith(`expload_${load.id}_`)), false);
  });

  it("edits a generated expense at its load source", async () => {
    const load = await repo.createLoad({
      date: "2026-08-30",
      originCity: "Richmond",
      originState: "VA",
      destinationCity: "Atlanta",
      destinationState: "GA",
      loadedMiles: 530,
      deadheadMiles: 20,
      grossRate: 1800,
      fuelCost: 0,
      tolls: 40,
      dispatchFee: 0,
      factoringFee: 0,
      otherExpenses: 0,
      status: "PENDING",
    });
    const expenseId = loadExpenseId(load.id, "tolls");

    await repo.updateLoadExpense(expenseId, 72.5);
    let dataset = await repo.getDataset();
    assert.equal(dataset.loads.find((row) => row.id === load.id)?.tolls, 72.5);
    assert.equal(dataset.expenses.find((row) => row.id === expenseId)?.amount, 72.5);

    await repo.updateLoadExpense(expenseId, 0);
    dataset = await repo.getDataset();
    assert.equal(dataset.loads.find((row) => row.id === load.id)?.tolls, 0);
    assert.equal(dataset.expenses.some((row) => row.id === expenseId), false);
  });

  it("keeps a separate fuel estimate visible for every load", async () => {
    const first = await repo.createLoad({
      date: "2026-09-01",
      originCity: "Austell",
      originState: "GA",
      destinationCity: "New Orleans",
      destinationState: "LA",
      loadedMiles: 430,
      deadheadMiles: 20,
      grossRate: 1500,
      fuelCost: 80,
      tolls: 0,
      dispatchFee: 0,
      factoringFee: 0,
      otherExpenses: 0,
      status: "PENDING",
    });
    const second = await repo.createLoad({
      date: "2026-09-01",
      originCity: "Richmond",
      originState: "VA",
      destinationCity: "Atlanta",
      destinationState: "GA",
      loadedMiles: 420,
      deadheadMiles: 50,
      grossRate: 1400,
      fuelCost: 295.69,
      tolls: 0,
      dispatchFee: 0,
      factoringFee: 0,
      otherExpenses: 0,
      status: "PENDING",
    });

    const dataset = await repo.getDataset();
    const estimates = [first, second].map((load) =>
      dataset.expenses.find((expense) => expense.id === loadExpenseId(load.id, "fuel")),
    );
    assert.deepEqual(
      estimates.map((expense) => expense?.amount),
      [80, 295.69],
    );
  });

  it("honours an explicit costsPosted:false so history is never posted retroactively", async () => {
    const load = await repo.createLoad({
      date: "2026-08-28",
      originCity: "A",
      originState: "VA",
      destinationCity: "B",
      destinationState: "MD",
      loadedMiles: 200,
      deadheadMiles: 0,
      grossRate: 900,
      fuelCost: 150,
      tolls: 20,
      dispatchFee: 45,
      factoringFee: 22,
      otherExpenses: 0,
      costsPosted: false,
      status: "PAID",
    });

    const dataset = await repo.getDataset();
    assert.deepEqual(
      dataset.expenses.filter((e) => e.id.startsWith(`expload_${load.id}_`)),
      [],
      "a load imported as not-posted keeps its costs as per-load detail",
    );
    assert.equal(dataset.loads.find((l) => l.id === load.id)?.costsPosted, false);
    await repo.deleteLoad(load.id);
  });

  it("lets linked detailed Fuel replace the load fuel row without double counting", async () => {
    const load = await repo.createLoad({
      date: "2026-08-30",
      originCity: "A",
      originState: "VA",
      destinationCity: "B",
      destinationState: "MD",
      loadedMiles: 100,
      deadheadMiles: 0,
      grossRate: 500,
      fuelCost: 180,
      tolls: 0,
      dispatchFee: 0,
      factoringFee: 0,
      otherExpenses: 0,
      costsPosted: true,
      status: "PENDING",
    });
    assert.ok((await repo.getDataset()).expenses.some((e) => e.id === loadExpenseId(load.id, "fuel")));

    const entry = await repo.createFuelEntry(fuel({ loadId: load.id, totalCost: 190 }));
    let dataset = await repo.getDataset();
    assert.equal(dataset.expenses.some((e) => e.id === loadExpenseId(load.id, "fuel")), false);
    assert.equal(dataset.expenses.filter((e) => e.category === "FUEL" && e.loadId === load.id).length, 1);

    await repo.deleteFuelEntry(entry.id);
    dataset = await repo.getDataset();
    assert.equal(dataset.expenses.find((e) => e.id === loadExpenseId(load.id, "fuel"))?.amount, 180);
    await repo.deleteLoad(load.id);
  });
});

describe("load IFTA mileage", () => {
  it("updates only the jurisdiction allocation and rejects more than the trip total", async () => {
    const load = await repo.createLoad(
      loadInput({
        originCity: "Austell",
        originState: "GA",
        destinationCity: "New Orleans",
        destinationState: "LA",
        loadedMiles: 477,
        deadheadMiles: 17,
        grossRate: 1500,
      }),
    );

    const updated = await repo.updateLoadJurisdictionMiles(load.id, [
      { jurisdiction: "GA", totalMiles: 90, nonTaxableMiles: 0 },
      { jurisdiction: "AL", totalMiles: 210, nonTaxableMiles: 0 },
      { jurisdiction: "MS", totalMiles: 170, nonTaxableMiles: 0 },
      { jurisdiction: "LA", totalMiles: 24, nonTaxableMiles: 0 },
    ]);
    assert.equal(updated.grossRate, 1500);
    assert.equal(
      updated.jurisdictionMiles.reduce((total, row) => total + row.totalMiles, 0),
      494,
    );

    await assert.rejects(
      () =>
        repo.updateLoadJurisdictionMiles(load.id, [
          { jurisdiction: "GA", totalMiles: 495, nonTaxableMiles: 0 },
        ]),
      /cannot exceed total trip miles/i,
    );
  });
});

describe("deleting a load", () => {
  it("unlinks its costs instead of deleting them", async () => {
    const load = await repo.createLoad({
      date: "2026-08-20",
      originCity: "Richmond",
      originState: "va",
      destinationCity: "Baltimore",
      destinationState: "md",
      broker: "  Test Broker  ",
      loadNumber: null,
      loadedMiles: 150.4,
      deadheadMiles: 20.6,
      grossRate: 600,
      fuelCost: 0,
      tolls: 0,
      dispatchFee: 0,
      factoringFee: 0,
      otherExpenses: 0,
      status: "PENDING",
      notes: null,
    });
    assert.equal(load.originState, "VA", "state codes are normalised on write");
    assert.equal(load.broker, "Test Broker");
    assert.equal(load.loadedMiles, 150, "miles are whole numbers");

    const attached = await repo.createExpense(expense({ loadId: load.id, amount: 30 }));
    const fuelled = await repo.createFuelEntry(fuel({ loadId: load.id }));

    await repo.deleteLoad(load.id);
    const dataset = await repo.getDataset();

    assert.equal(dataset.loads.some((l) => l.id === load.id), false);
    const keptExpense = dataset.expenses.find((e) => e.id === attached.id);
    assert.ok(keptExpense, "money spent is still money spent");
    assert.equal(keptExpense.loadId, null);
    const keptFuel = dataset.fuelEntries.find((f) => f.id === fuelled.id);
    assert.ok(keptFuel);
    assert.equal(keptFuel.loadId, null);

    await repo.deleteExpense(attached.id);
    await repo.deleteFuelEntry(fuelled.id);
  });
});

describe("settings", () => {
  it("stores zero as zero rather than falling back to a default", async () => {
    const before = (await repo.getDataset()).settings;
    await repo.updateSettings({
      taxReservePct: 0,
      maintenanceReservePct: 0,
      ratingGreatPerMile: 0,
      ratingGoodPerMile: 0,
      ratingMarginalPerMile: 0,
      deadheadWarnPct: 0,
      maintenanceWarnMiles: 0,
      maintenanceWarnDays: 0,
    });
    const saved = (await repo.getDataset()).settings;
    assert.equal(saved.taxReservePct, 0);
    assert.equal(saved.maintenanceReservePct, 0);
    assert.equal(saved.deadheadWarnPct, 0);
    assert.equal(saved.maintenanceWarnMiles, 0);
    assert.equal(saved.ratingGreatPerMile, 0);
    assert.ok(saved.categoryBehavior, "an unchanged field is not wiped");

    await repo.updateSettings({
      taxReservePct: before.taxReservePct,
      maintenanceReservePct: before.maintenanceReservePct,
      ratingGreatPerMile: before.ratingGreatPerMile,
      ratingGoodPerMile: before.ratingGoodPerMile,
      ratingMarginalPerMile: before.ratingMarginalPerMile,
      deadheadWarnPct: before.deadheadWarnPct,
      maintenanceWarnMiles: before.maintenanceWarnMiles,
      maintenanceWarnDays: before.maintenanceWarnDays,
    });
  });
});

describe("accounts", () => {
  it("creates one owner and refuses a duplicate email", async () => {
    assert.equal(await auth.countUsers(), 0);

    const owner = await auth.createOwner({
      email: "  Owner@Example.COM ",
      name: " Enrique ",
      passwordHash: "scrypt$salt$hash",
      businessName: "Padron Freight LLC",
    });
    assert.equal(owner.email, "owner@example.com", "emails are normalised");
    assert.equal(owner.name, "Enrique");
    assert.equal(owner.businessId, BUSINESS, "the owner joins the existing business");
    assert.equal(await auth.countUsers(), 1);
    assert.equal((await repo.getDataset()).business.name, "Padron Freight LLC");

    await assert.rejects(
      () =>
        auth.createOwner({
          email: "OWNER@example.com",
          passwordHash: "scrypt$salt$hash",
        }),
      /already has an account/,
    );
    assert.equal(await auth.countUsers(), 1);
  });

  it("looks up an account regardless of how the email was typed", async () => {
    assert.ok(await auth.findUserByEmail("OWNER@EXAMPLE.COM"));
    assert.ok(await auth.findUserByEmail(" owner@example.com "));
    assert.equal(await auth.findUserByEmail("nobody@example.com"), null);
  });

  it("keeps members in one workspace and protects the owner role", async () => {
    const member = await auth.createMember({
      businessId: BUSINESS,
      email: " Books@Example.com ",
      name: "Pat Books",
      role: "BOOKKEEPER",
    });
    assert.equal(member.email, "books@example.com");
    assert.equal(member.role, "BOOKKEEPER");
    assert.equal(member.joinedAt, null);
    assert.ok(member.invitedAt);
    assert.equal((await auth.listMembers(BUSINESS)).length, 2);

    const active = await auth.markMemberJoined(member.id, BUSINESS);
    assert.ok(active.joinedAt);
    const admin = await auth.updateMemberRole(member.id, BUSINESS, "ADMIN");
    assert.equal(admin.role, "ADMIN");

    const owner = await auth.findUserByEmail("owner@example.com");
    assert.ok(owner);
    await assert.rejects(
      () => auth.updateMemberRole(owner.id, BUSINESS, "VIEWER"),
      /owner role cannot be changed/i,
    );
    await assert.rejects(
      () => auth.removeMember(owner.id, BUSINESS),
      /owner cannot be removed/i,
    );

    assert.deepEqual(await auth.removeMember(member.id, BUSINESS), { email: member.email });
    assert.equal(await auth.findUserById(member.id), null);
  });

  it("builds the protected admin account index without exposing credentials", async () => {
    const accounts = await auth.listAccounts();
    assert.equal(accounts.length, 1);
    assert.equal(accounts[0].email, "owner@example.com");
    assert.equal(accounts[0].businessName, "Padron Freight LLC");
    assert.equal(accounts[0].counts.trucks, 1);
    assert.equal(accounts[0].counts.activeTrucks, 1);
    assert.ok(accounts[0].counts.loads > 0);
    assert.ok(accounts[0].counts.fuelEntries > 0);
    assert.ok(accounts[0].counts.maintenance > 0);
    assert.ok(accounts[0].counts.reserveTransactions > 0);
    assert.ok(accounts[0].counts.settlements > 0);
    assert.ok(accounts[0].lastActivityAt, "product activity is summarized without returning records");
    assert.equal(accounts[0].subscriptionStatus, "TRIALING");
    assert.equal(accounts[0].accessSource, "trial");
    assert.equal("providerSubscriptionId" in accounts[0], false, "provider ids never reach the index");
    assert.equal("passwordHash" in accounts[0], false, "password material never reaches the index");
  });

  it("surfaces an Admin Fleet grant as complimentary Fleet access", async () => {
    const original = (await repo.getDataset()).subscription;
    try {
      const granted = await repo.updateSubscription({
        plan: "FLEET",
        status: "ACTIVE",
        currentPeriodEnd: null,
        providerCustomerId: original.providerCustomerId,
        providerSubscriptionId: null,
      });
      assert.equal(hasFleetAccess(granted), true);

      const account = (await auth.listAccounts()).find((candidate) => candidate.businessId === BUSINESS);
      assert.ok(account);
      assert.equal(account.plan, "FLEET");
      assert.equal(account.subscriptionStatus, "ACTIVE");
      assert.equal(account.accessSource, "complimentary");
      assert.equal(account.hasProviderSubscription, false);
    } finally {
      await repo.updateSubscription({
        plan: original.plan,
        status: original.status,
        currentPeriodEnd: original.currentPeriodEnd,
        providerCustomerId: original.providerCustomerId,
        providerSubscriptionId: original.providerSubscriptionId,
      });
    }
  });

  it("resets only ledger data, then invalidates the owner when the account is deleted", async () => {
    const original = readFileSync(DATA_FILE, "utf8");
    try {
      const owner = await auth.findUserByEmail("owner@example.com");
      assert.ok(owner);
      assert.deepEqual(await auth.findUserById(owner.id), owner);

      const before = await repo.getDataset();
      const keys = await auth.resetBusinessData(owner.id, owner.businessId);
      const reset = await repo.getDataset();

      assert.equal(keys.length, before.documents.length);
      assert.equal(reset.loads.length, 0);
      assert.equal(reset.expenses.length, 0);
      assert.equal(reset.documents.length, 0);
      assert.equal(reset.trucks.length, 1);
      assert.equal(reset.subscription.plan, before.subscription.plan, "the plan is preserved");
      assert.equal(reset.business.name, before.business.name, "the business identity is preserved");
      assert.ok(await auth.findUserById(owner.id), "reset keeps the login active");

      const deleted = await auth.deleteAccount(owner.id, owner.businessId);
      assert.equal(deleted.email, owner.email);
      assert.equal(await auth.findUserById(owner.id), null);
    } finally {
      writeFileSync(DATA_FILE, original, "utf8");
    }
  });

});

/**
 * A ledger written by an older build must open, not crash -- and must not be
 * silently replaced by seed data.
 */
describe("upgrading an older ledger", () => {
  const legacyDir = mkdtempSync(path.join(tmpdir(), "onroad-books-legacy-"));

  before(() => {
    mkdirSync(path.join(legacyDir, "data"), { recursive: true });
    writeFileSync(
      path.join(legacyDir, "data", "onroad-books.json"),
      JSON.stringify({
        business: { id: BUSINESS, name: "Old Co", currency: "USD", createdAt: "2025-01-01" },
        settings: { id: "fin_001", businessId: BUSINESS, taxReservePct: 20, maintenanceReservePct: 5 },
        truck: { id: "truck_001", businessId: BUSINESS, name: "Truck", startingOdometer: 0, currentOdometer: 1000 },
        loads: [
          {
            id: "load_old", businessId: BUSINESS, truckId: "truck_001", date: "2026-08-01",
            originCity: "A", originState: "VA", destinationCity: "B", destinationState: "MD",
            loadedMiles: 100, deadheadMiles: 0, grossRate: 500, status: "PAID", createdAt: "2026-08-01",
          },
        ],
        expenses: [],
        fuelEntries: [
          {
            id: "fuel_old", businessId: BUSINESS, truckId: "truck_001", date: "2026-08-01",
            gallons: 40, pricePerGallon: 3.5, totalCost: 140, createdAt: "2026-08-01",
          },
        ],
      }),
      "utf8",
    );
  });

  it("fills in fields added after the file was written", async () => {
    process.chdir(legacyDir);
    const legacy = new store.JsonRepository(BUSINESS);
    const dataset = await legacy.getDataset();
    process.chdir(SANDBOX);

    assert.equal(dataset.business.name, "Old Co", "the real ledger is kept, not reseeded");
    assert.equal(dataset.loads[0].dispatchFee, 0);
    assert.equal(dataset.loads[0].factoringFee, 0);
    assert.equal(dataset.loads[0].otherExpenses, 0);
    assert.equal(dataset.loads[0].deliveryDate, null);
    assert.equal(dataset.loads[0].endingOdometer, null);
    assert.equal(dataset.loads[0].equipmentType, null);
    assert.equal(dataset.loads[0].loadCapacity, null);
    assert.equal(dataset.loads[0].equipmentLengthFt, null);
    assert.equal(dataset.loads[0].weightLbs, null);
    assert.equal(dataset.loads[0].commodity, null);
    // The load kept its trip costs as per-load detail, exactly as the build
    // that wrote the file did. Posting them now would add spend to a month
    // the owner already closed.
    assert.equal(dataset.loads[0].costsPosted, false);
    assert.deepEqual(
      dataset.expenses.filter((e) => e.id.startsWith("expload_")),
      [],
      "an older ledger never gains mirrored trip costs on upgrade",
    );
    assert.equal(dataset.settings.ratingGreatPerMile, 2);
    assert.equal(dataset.settings.deadheadWarnPct, 20);
    assert.equal(dataset.settings.maintenanceWarnMiles, 2000);
    assert.ok(dataset.settings.categoryBehavior);
    assert.equal(dataset.trucks[0].axleCount, null);
    assert.equal(dataset.trucks[0].registeredGrossWeightLbs, null);
    assert.equal(
      dataset.trucks[0].operatesInMultipleIftaJurisdictions,
      null,
      "an older truck keeps an unknown IFTA profile instead of being classified silently",
    );
    assert.deepEqual(dataset.documents, []);
    assert.deepEqual(dataset.maintenanceRecords, []);
    assert.deepEqual(dataset.users, []);
    assert.equal(
      dataset.fuelEntries[0].expenseId,
      fuelExpenseId("fuel_old"),
      "older fuel rows are adopted into the explicit mirror",
    );
  });
});

describe("an unreadable ledger", () => {
  const brokenDir = mkdtempSync(path.join(tmpdir(), "onroad-books-broken-"));

  before(() => {
    mkdirSync(path.join(brokenDir, "data"), { recursive: true });
    writeFileSync(path.join(brokenDir, "data", "onroad-books.json"), "{ not json at all", "utf8");
  });

  it("is set aside rather than overwritten with fixture data", async () => {
    process.chdir(brokenDir);
    const broken = new store.JsonRepository(BUSINESS);
    await assert.rejects(() => broken.getDataset(), /could not be read/);
    const files = readdirSync(path.join(brokenDir, "data"));
    process.chdir(SANDBOX);

    assert.ok(
      files.some((f) => f.startsWith("onroad-books.json.corrupt-")),
      "the user's file must survive so it can be repaired",
    );
    assert.equal(
      files.includes("onroad-books.json"),
      false,
      "nothing is written back in its place without the user asking",
    );
  });
});

/**
 * Routing a row to a unit.
 *
 * These are the rules the fleet views rest on. If a load, a fill-up or a
 * service lands on the wrong truck, every per-unit figure in the app is
 * quietly wrong while every total still balances -- which is the worst kind
 * of wrong, because nothing looks broken.
 */
describe("which truck a row belongs to", () => {
  it("bills an expense to the truck it names", async () => {
    const before = await repo.getDataset();
    const second = await repo.createTruck({
      name: "Unit 102",
      acquiredOn: null,
      year: null,
      make: null,
      model: null,
      vin: null,
      purchasePrice: null,
      monthlyPayment: null,
      monthlyInsurance: null,
      startingOdometer: 10_000,
      currentOdometer: 10_000,
    });
    assert.notEqual(second.id, before.trucks[0].id);

    const charged = await repo.createExpense(expense({ truckId: second.id }));
    assert.equal(charged.truckId, second.id);
    assert.equal(charged.scope, "TRUCK");
  });

  it("requires an explicit unit once more than one truck is active", async () => {
    await assert.rejects(
      () => repo.createLoad(loadInput()),
      /Choose which truck/,
    );
    await assert.rejects(
      () => repo.createExpense(expense({ description: "No truck named" })),
      /Choose which truck/,
    );
    await assert.rejects(
      () => repo.createFuelEntry(fuel()),
      /Choose which truck/,
    );
    await assert.rejects(
      () => repo.createMaintenance(service()),
      /Choose which truck/,
    );
  });

  it("keeps business overhead off every truck", async () => {
    const overhead = await repo.createExpense(
      expense({ scope: "BUSINESS", category: "OTHER", description: "Phone plan", amount: 95 }),
    );
    assert.equal(overhead.scope, "BUSINESS");
    assert.equal(overhead.truckId, null, "overhead belongs to the business, not to a unit");
  });

  it("moves an expense between units without leaving a copy behind", async () => {
    const { trucks } = await repo.getDataset();
    const [first, second] = trucks;
    const created = await repo.createExpense(expense({ truckId: first.id, amount: 10 }));
    const moved = await repo.updateExpense(created.id, expense({ truckId: second.id, amount: 10 }));

    assert.equal(moved.truckId, second.id);
    const { expenses } = await repo.getDataset();
    assert.equal(expenses.filter((e) => e.id === created.id).length, 1);
  });

  it("books a load and its miles against the truck that ran it", async () => {
    const { trucks } = await repo.getDataset();
    const second = trucks[1];
    const load = await repo.createLoad({
      truckId: second.id,
      date: "2026-08-18",
      deliveryDate: "2026-08-19",
      originCity: "Reno",
      originState: "NV",
      destinationCity: "Boise",
      destinationState: "ID",
      broker: null,
      loadNumber: null,
      equipmentType: "BOX_TRUCK",
      loadCapacity: "FULL",
      equipmentLengthFt: 26,
      weightLbs: 8000,
      commodity: "General freight",
      loadedMiles: 420,
      deadheadMiles: 30,
      grossRate: 1200,
      fuelCost: 0,
      tolls: 0,
      dispatchFee: 0,
      factoringFee: 0,
      otherExpenses: 0,
      status: "PENDING",
      notes: null,
    });
    assert.equal(load.truckId, second.id);
    assert.equal(load.deliveryDate, "2026-08-19");
    assert.equal(load.equipmentType, "BOX_TRUCK");
    assert.equal(load.loadCapacity, "FULL");
    assert.equal(load.equipmentLengthFt, 26);
    assert.equal(load.weightLbs, 8000);
    assert.equal(load.commodity, "General freight");
  });

  it("moves a fill-up's odometer and its ledger row to the same truck", async () => {
    const { trucks } = await repo.getDataset();
    const second = trucks[1];
    const entry = await repo.createFuelEntry(fuel({ truckId: second.id, odometer: 12_500 }));

    assert.equal(entry.truckId, second.id);

    const after = await repo.getDataset();
    const mirror = after.expenses.find((e) => e.id === fuelExpenseId(entry.id));
    assert.equal(mirror?.truckId, second.id, "the ledger row follows the fill-up");
    assert.equal(
      after.trucks.find((t) => t.id === second.id)!.currentOdometer,
      12_500,
      "the reading advances the odometer it was taken from",
    );
    assert.notEqual(
      after.trucks.find((t) => t.id === trucks[0].id)!.currentOdometer,
      12_500,
      "and leaves the other truck's odometer alone",
    );
  });

  it("logs a service, and its ledger row, against the truck it names", async () => {
    const { trucks } = await repo.getDataset();
    const second = trucks[1];
    const record = await repo.createMaintenance(service({ truckId: second.id, odometer: 13_000 }));

    assert.equal(record.truckId, second.id);
    const { expenses } = await repo.getDataset();
    assert.equal(expenses.find((e) => e.id === record.expenseId)?.truckId, second.id);
  });

  it("refuses cross-truck links in a three-truck ledger", async () => {
    const before = await repo.getDataset();
    const second = before.trucks[1];
    const third = await repo.createTruck({
      name: "Unit 103",
      acquiredOn: null,
      year: null,
      make: null,
      model: null,
      vin: null,
      purchasePrice: null,
      monthlyPayment: null,
      monthlyInsurance: null,
      startingOdometer: 20_000,
      currentOdometer: 20_000,
    });
    const load = await repo.createLoad(loadInput({ truckId: second.id }));

    await assert.rejects(
      () => repo.createExpense(expense({ truckId: third.id, loadId: load.id })),
      /another truck/,
    );
    await assert.rejects(
      () => repo.createFuelEntry(fuel({ truckId: third.id, loadId: load.id })),
      /another truck/,
    );
    await assert.rejects(
      () => repo.createExpense(expense({ scope: "BUSINESS", loadId: load.id })),
      /overhead cannot be linked/,
    );

    await repo.createExpense(expense({ truckId: second.id, loadId: load.id }));
    await assert.rejects(
      () => repo.updateLoad(load.id, loadInput({ truckId: third.id })),
      /linked costs on another truck/,
    );
  });

  it("files truck documents against any of the three owned units, and no other target", async () => {
    const { trucks } = await repo.getDataset();
    assert.equal(trucks.length, 3);

    for (const [index, truck] of trucks.entries()) {
      const document = await repo.createDocument({
        type: "INSURANCE",
        label: `${truck.name} insurance`,
        fileName: `insurance-${index + 1}.pdf`,
        contentType: "application/pdf",
        sizeBytes: 100 + index,
        storageKey: `tests/fleet/${truck.id}/insurance-${index + 1}.pdf`,
        truckId: truck.id,
      });
      assert.equal(document.truckId, truck.id);
    }

    await assert.rejects(
      () => repo.createDocument({
        type: "OTHER",
        label: "Orphan",
        fileName: "orphan.pdf",
        contentType: "application/pdf",
        sizeBytes: 10,
        storageKey: "tests/fleet/orphan.pdf",
      }),
      /exactly one record/,
    );
    await assert.rejects(
      () => repo.createDocument({
        type: "OTHER",
        label: "Foreign truck",
        fileName: "foreign.pdf",
        contentType: "application/pdf",
        sizeBytes: 10,
        storageKey: "tests/fleet/foreign.pdf",
        truckId: "truck_from_another_business",
      }),
      /does not belong to this workspace/,
    );
  });
});

describe("drivers and driver statements", () => {
  it("freezes assigned loads, prevents double settlement, and posts pay to the right load and truck", async () => {
    const dataset = await repo.getDataset();
    const truck = dataset.trucks[0];
    const driver = await repo.createDriver({
      name: "Jordan Miles",
      reference: "DRV-101",
      defaultTruckId: truck.id,
      payType: "PERCENT_GROSS",
      payRate: 30,
    });
    const load = await repo.createLoad(loadInput({
      truckId: truck.id,
      driverId: driver.id,
      date: "2026-09-02",
      grossRate: 1000,
      loadedMiles: 400,
      deadheadMiles: 20,
      loadNumber: "PAY-001",
    }));

    const statement = await repo.createDriverSettlement({
      driverId: driver.id,
      periodStart: "2026-09-01",
      periodEnd: "2026-09-07",
      notes: "Week 1",
    });
    assert.equal(statement.lines.length, 1);
    assert.equal(statement.lines[0].payAmount, 300);
    assert.equal(statement.lines[0].truckId, truck.id);

    const accessorial = await repo.addDriverSettlementAdjustment(statement.id, {
      type: "ACCESSORIAL_PAY",
      amount: 50,
      reason: "Detention at receiver",
    });
    const advance = await repo.addDriverSettlementAdjustment(statement.id, {
      type: "ADVANCE",
      amount: 20,
      reason: "Fuel advance",
    });
    await repo.deleteDriverSettlementAdjustment(statement.id, advance.id);
    await assert.rejects(
      () => repo.addDriverSettlementAdjustment(statement.id, {
        type: "DEDUCTION",
        amount: 1000,
        reason: "Invalid over-deduction",
      }),
      /net pay negative/,
    );

    await assert.rejects(
      () => repo.createDriverSettlement({
        driverId: driver.id,
        periodStart: "2026-09-01",
        periodEnd: "2026-09-07",
      }),
      /No unsettled loads/,
    );
    await assert.rejects(
      () => repo.updateLoad(load.id, loadInput({ truckId: truck.id, driverId: null })),
      /already on a driver settlement/,
    );

    const paid = await repo.payDriverSettlement(statement.id, "2026-09-08");
    assert.equal(paid.status, "PAID");
    assert.equal(paid.paidOn, "2026-09-08");
    const after = await repo.getDataset();
    const line = after.driverSettlements.find((row) => row.id === statement.id)!.lines[0];
    const booked = after.expenses.find((row) => row.id === line.expenseId);
    assert.equal(booked?.category, "DRIVER_PAY");
    assert.equal(booked?.amount, 350);
    assert.equal(booked?.truckId, truck.id);
    assert.equal(booked?.loadId, load.id);
    assert.equal(after.loads.find((row) => row.id === load.id)?.driverPay, 350);

    await assert.rejects(() => repo.deleteExpense(booked!.id), /cannot be deleted/);
    await assert.rejects(
      () => repo.deleteDriverSettlementAdjustment(statement.id, accessorial.id),
      /Paid statements cannot be changed/,
    );
    await assert.rejects(() => repo.deleteLoad(load.id), /paid statements cannot be changed/);
    await assert.rejects(() => repo.deleteDriverSettlement(statement.id), /permanent accounting/);
  });

  it("lets an unpaid draft be deleted so its loads can be prepared again", async () => {
    const dataset = await repo.getDataset();
    const driver = dataset.drivers[0];
    const load = await repo.createLoad(loadInput({
      truckId: dataset.trucks[0].id,
      driverId: driver.id,
      date: "2026-09-09",
      loadNumber: "PAY-002",
    }));
    const draft = await repo.createDriverSettlement({
      driverId: driver.id,
      periodStart: "2026-09-09",
      periodEnd: "2026-09-09",
    });
    await repo.deleteDriverSettlement(draft.id);
    const replacement = await repo.createDriverSettlement({
      driverId: driver.id,
      periodStart: "2026-09-09",
      periodEnd: "2026-09-09",
    });
    assert.equal(replacement.lines[0].loadId, load.id);
  });
});

describe("financial review and customer cash events", () => {
  it("splits a reviewed loan payment without changing its total", async () => {
    const dataset = await repo.getDataset();
    const original = await repo.createExpense(expense({
      truckId: dataset.trucks[0].id,
      category: "TRUCK_PAYMENT",
      description: "Truck note",
      amount: 1200,
    }));
    assert.equal(original.financialTreatment, "DEBT_UNALLOCATED");

    const rows = await repo.classifyDebtPayment(original.id, {
      treatment: "LOAN_SPLIT",
      principalAmount: 950,
      interestAmount: 250,
      newObligation: {
        truckId: dataset.trucks[0].id,
        name: "Unit loan",
        kind: "LOAN",
        expectedMonthlyPayment: 1200,
      },
    });
    assert.equal(rows.reduce((total, row) => total + row.amount, 0), 1200);
    assert.deepEqual(
      rows.map((row) => row.financialTreatment).sort(),
      ["INTEREST", "PRINCIPAL"],
    );
    assert.ok(rows.every((row) => row.obligationId && row.splitGroupId));
  });

  it("rejects loan splits that are over or under the original payment", async () => {
    const dataset = await repo.getDataset();
    const over = await repo.createExpense(expense({
      truckId: dataset.trucks[0].id,
      category: "TRUCK_PAYMENT",
      description: "Over split",
      amount: 1_137.85,
    }));
    await assert.rejects(
      repo.classifyDebtPayment(over.id, {
        treatment: "LOAN_SPLIT",
        principalAmount: 800,
        interestAmount: 400,
      }),
      /\$62\.15 over the \$1137\.85 payment/,
    );

    const under = await repo.createExpense(expense({
      truckId: dataset.trucks[0].id,
      category: "TRUCK_PAYMENT",
      description: "Under split",
      amount: 1_137.85,
    }));
    await assert.rejects(
      repo.classifyDebtPayment(under.id, {
        treatment: "LOAN_SPLIT",
        principalAmount: 800,
        interestAmount: 200,
      }),
      /\$137\.85 short of the \$1137\.85 payment/,
    );

    const after = await repo.getDataset();
    assert.equal(after.expenses.find((row) => row.id === over.id)?.category, "TRUCK_PAYMENT");
    assert.equal(after.expenses.find((row) => row.id === under.id)?.category, "TRUCK_PAYMENT");
  });

  it("treats an explicitly reviewed operating lease as operating cost", async () => {
    const dataset = await repo.getDataset();
    const original = await repo.createExpense(expense({
      truckId: dataset.trucks[0].id,
      category: "TRUCK_PAYMENT",
      description: "Lease payment",
      amount: 900,
    }));
    const [classified] = await repo.classifyDebtPayment(original.id, {
      treatment: "OPERATING_LEASE",
      newObligation: {
        truckId: dataset.trucks[0].id,
        name: "Operating lease",
        kind: "OPERATING_LEASE",
        expectedMonthlyPayment: 900,
      },
    });
    assert.equal(classified.category, "OPERATING_LEASE");
    assert.equal(classified.financialTreatment, "OPERATING");
    assert.equal(classified.amount, 900);
  });

  it("records partial customer payments and closes the invoice only at zero balance", async () => {
    const dataset = await repo.getDataset();
    const load = await repo.createLoad(loadInput({
      truckId: dataset.trucks[0].id,
      grossRate: 2500,
      status: "INVOICED",
      invoiceNumber: "INV-PARTIAL-1",
      invoiceDate: "2026-09-01",
      invoiceDueDate: "2026-10-01",
    }));
    await repo.createPaymentEvent({ loadId: load.id, date: "2026-09-10", amount: 900 });
    let after = await repo.getDataset();
    assert.equal(after.loads.find((row) => row.id === load.id)?.status, "INVOICED");
    assert.equal(after.loads.find((row) => row.id === load.id)?.invoicePaidDate, null);

    await repo.createPaymentEvent({ loadId: load.id, date: "2026-09-18", amount: 1600 });
    after = await repo.getDataset();
    assert.equal(after.loads.find((row) => row.id === load.id)?.status, "PAID");
    assert.equal(after.loads.find((row) => row.id === load.id)?.invoicePaidDate, "2026-09-18");
    assert.equal(
      after.paymentEvents.filter((event) => event.loadId === load.id).reduce((total, event) => total + event.amount, 0),
      2500,
    );
  });
});

describe("expense financial treatment", () => {
  it("re-derives the treatment when the category changes", async () => {
    // A stale treatment is how a row ends up counted as operating spend under
    // a debt category -- and it made this store disagree with Postgres on the
    // same edit, to the tune of the whole amount.
    const truckId = (await repo.getDataset()).trucks[0].id;
    const base = expense({ truckId, category: "FUEL", amount: 1_000, description: "treatment probe" });

    const created = await repo.createExpense(base);
    assert.equal(created.financialTreatment, "OPERATING");

    const moved = await repo.updateExpense(created.id, { ...base, category: "INTEREST_EXPENSE" });
    assert.equal(
      moved.financialTreatment,
      "INTEREST",
      "a debt category must not keep an operating treatment",
    );

    const edited = await repo.updateExpense(created.id, {
      ...base,
      category: "INTEREST_EXPENSE",
      description: "treatment probe, edited",
    });
    assert.equal(edited.financialTreatment, "INTEREST", "an ordinary edit must not reclassify");

    await repo.deleteExpense(created.id);
  });
});
