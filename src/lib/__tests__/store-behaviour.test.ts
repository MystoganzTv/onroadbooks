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
import { mkdtempSync, existsSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

import { DEMO_BUSINESS } from "../seed/seed-data";
import type { ExpenseInput, FuelEntryInput, MaintenanceInput } from "../db/repository";

const SANDBOX = mkdtempSync(path.join(tmpdir(), "onroad-books-store-"));
const ORIGINAL_CWD = process.cwd();
const DATA_FILE = path.join(SANDBOX, "data", "onroad-books.json");
const BUSINESS = DEMO_BUSINESS.id;

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

describe("seeding", () => {
  it("writes a usable ledger on first read", async () => {
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

  it("advances the odometer but never rolls it back", async () => {
    const start = (await repo.getDataset()).truck.currentOdometer;

    const forward = await repo.createFuelEntry(fuel({ odometer: start + 500 }));
    assert.equal((await repo.getDataset()).truck.currentOdometer, start + 500);

    const backward = await repo.createFuelEntry(fuel({ odometer: start - 5_000 }));
    assert.equal(
      (await repo.getDataset()).truck.currentOdometer,
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
    const start = (await repo.getDataset()).truck.currentOdometer;
    const record = await repo.createMaintenance(service({ odometer: start - 10_000 }));
    assert.equal((await repo.getDataset()).truck.currentOdometer, start);
    await repo.deleteMaintenance(record.id);
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
    assert.equal(dataset.settings.ratingGreatPerMile, 2);
    assert.equal(dataset.settings.deadheadWarnPct, 20);
    assert.equal(dataset.settings.maintenanceWarnMiles, 2000);
    assert.ok(dataset.settings.categoryBehavior);
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

  it("is set aside rather than overwritten with demo data", async () => {
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
