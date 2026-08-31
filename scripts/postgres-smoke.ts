/**
 * Postgres smoke check.
 *
 * The behavioural suite runs against the JSON store, and `store-contract`
 * only compares the two classes' method NAMES. Between those two facts sits
 * everything the Prisma store does differently: foreign keys, transactions,
 * generated ids, and a JSON column for the settlement snapshot. This script
 * exercises that seam against a real database.
 *
 *   DATABASE_URL=... npm run db:push && npm run db:seed
 *   DATABASE_URL=... npm run smoke:postgres
 *
 * It asserts the rules that cannot be proven without a server:
 *   - the built-in reserve buckets are rows, not objects invented on read;
 *   - closing a settlement stores the snapshot AND posts its contributions;
 *   - reopening removes exactly those contributions and nothing else;
 *   - a fuel purchase keeps its ledger row linked across a delete.
 */

import assert from "node:assert/strict";

import { PrismaClient } from "../src/generated/prisma";
import { PrismaRepository } from "../src/lib/db/prisma-store";
import { buildSettlementSnapshot, settlementBounds } from "../src/lib/finance/settlement";
import { roundMoney, summarizePeriod } from "../src/lib/calculations";
import { calculateFleetSummary } from "../src/lib/finance/fleet";
import { resolvePeriod } from "../src/lib/periods";

const prisma = new PrismaClient();
let passed = 0;
const ok = (name: string) => {
  passed += 1;
  console.log(`  ok  ${name}`);
};

async function smokeThreeTruckLedger() {
  const temporary = await prisma.business.create({
    data: { name: `Three-truck smoke ${Date.now()}`, currency: "USD" },
  });
  const repository = new PrismaRepository(temporary.id);

  try {
    // Reading a brand-new workspace materialises its first truck. Add two more
    // so every assertion below exercises the real Fleet ambiguity.
    const initial = await repository.getDataset();
    const first = await repository.updateTruck({
      name: "Unit 101",
      acquiredOn: "2026-08-01",
      year: 2022,
      make: "Freightliner",
      model: "Cascadia",
      vin: null,
      purchasePrice: null,
      monthlyPayment: 1200,
      monthlyInsurance: 500,
      startingOdometer: 100_000,
      currentOdometer: 100_000,
    }, initial.trucks[0].id);
    const second = await repository.createTruck({
      name: "Unit 102",
      acquiredOn: "2026-08-01",
      year: 2021,
      make: "Volvo",
      model: "VNL",
      vin: null,
      purchasePrice: null,
      monthlyPayment: 1100,
      monthlyInsurance: 450,
      startingOdometer: 200_000,
      currentOdometer: 200_000,
    });
    const third = await repository.createTruck({
      name: "Unit 103",
      acquiredOn: "2026-08-01",
      year: 2020,
      make: "International",
      model: "LT",
      vin: null,
      purchasePrice: null,
      monthlyPayment: 1000,
      monthlyInsurance: 425,
      startingOdometer: 300_000,
      currentOdometer: 300_000,
    });

    const loadInput = (truckId: string, loadNumber: string, grossRate: number) => ({
      truckId,
      date: "2026-08-20",
      deliveryDate: "2026-08-21",
      originCity: "Dallas",
      originState: "TX",
      destinationCity: "Atlanta",
      destinationState: "GA",
      broker: "Fleet Smoke Broker",
      loadNumber,
      equipmentType: "DRY_VAN" as const,
      loadCapacity: "FULL" as const,
      equipmentLengthFt: 53,
      weightLbs: 35_000,
      commodity: "General freight",
      loadedMiles: 700,
      deadheadMiles: 50,
      grossRate,
      fuelCost: truckId === first.id ? 400 : 0,
      tolls: truckId === first.id ? 50 : 0,
      dispatchFee: 0,
      factoringFee: 0,
      otherExpenses: truckId === third.id ? 100 : 0,
      costsPosted: true,
      status: "PAID" as const,
      notes: null,
    });

    await assert.rejects(
      () => repository.createLoad({ ...loadInput(first.id, "MISSING-UNIT", 1000), truckId: null }),
      /Choose which truck/,
      "a Fleet write cannot fall through to the first sorted truck",
    );

    const load101 = await repository.createLoad(loadInput(first.id, "UNIT-101", 2500));
    const load102 = await repository.createLoad(loadInput(second.id, "UNIT-102", 3200));
    const load103 = await repository.createLoad(loadInput(third.id, "UNIT-103", 1800));

    await assert.rejects(
      () => repository.createExpense({
        truckId: third.id,
        date: "2026-08-20",
        category: "TOLLS",
        description: "Wrong unit",
        amount: 25,
        loadId: load101.id,
        recurring: false,
      }),
      /another truck/,
    );
    await assert.rejects(
      () => repository.createFuelEntry({
        truckId: third.id,
        date: "2026-08-20",
        gallons: 10,
        pricePerGallon: 4,
        totalCost: 40,
        loadId: load101.id,
      }),
      /another truck/,
    );

    await repository.createExpense({
      truckId: first.id,
      date: "2026-08-20",
      category: "PARKING",
      description: "Unit 101 parking",
      amount: 25,
      loadId: load101.id,
      recurring: false,
    });
    await repository.createFuelEntry({
      truckId: second.id,
      date: "2026-08-20",
      gallons: 125,
      pricePerGallon: 4,
      totalCost: 500,
      odometer: 200_750,
      location: "Fleet Smoke Stop",
      loadId: load102.id,
    });
    await repository.createExpense({
      truckId: third.id,
      date: "2026-08-20",
      category: "TOLLS",
      description: "Unit 103 tolls",
      amount: 200,
      loadId: load103.id,
      recurring: false,
    });
    await repository.createMaintenance({
      truckId: first.id,
      type: "OIL_CHANGE",
      basis: "BOTH",
      serviceDate: "2026-08-22",
      odometer: 100_750,
      cost: 300,
      vendor: "Fleet Smoke Shop",
      nextServiceDate: "2026-11-22",
      nextServiceOdometer: 110_750,
      recordAsExpense: true,
    });
    await repository.createExpense({
      scope: "BUSINESS",
      date: "2026-08-22",
      category: "OFFICE",
      description: "Fleet office overhead",
      amount: 600,
      recurring: true,
    });

    await assert.rejects(
      () => repository.updateLoad(load101.id, loadInput(third.id, "UNIT-101", 2500)),
      /linked costs on another truck/,
      "a load with manually linked costs cannot be moved behind the ledger's back",
    );

    for (const [index, truck] of [first, second, third].entries()) {
      const document = await repository.createDocument({
        type: "INSURANCE",
        label: `${truck.name} insurance`,
        fileName: `insurance-${index + 1}.pdf`,
        contentType: "application/pdf",
        sizeBytes: 100,
        storageKey: `smoke/${temporary.id}/${truck.id}/insurance.pdf`,
        truckId: truck.id,
      });
      assert.equal(document.truckId, truck.id);
    }

    const dataset = await repository.getDataset();
    assert.equal(dataset.trucks.length, 3);
    assert.deepEqual(
      dataset.loads.map((load) => load.truckId).sort(),
      [first.id, second.id, third.id].sort(),
      "each of the three units owns exactly its load",
    );
    for (const expense of dataset.expenses.filter((row) => row.loadId)) {
      const load = dataset.loads.find((row) => row.id === expense.loadId);
      assert.equal(expense.truckId, load?.truckId, `${expense.description} follows its load's unit`);
    }
    for (const entry of dataset.fuelEntries) {
      const load = dataset.loads.find((row) => row.id === entry.loadId);
      assert.equal(entry.truckId, load?.truckId, "fuel and its load stay on the same unit");
      assert.equal(
        dataset.expenses.find((row) => row.id === entry.expenseId)?.truckId,
        entry.truckId,
        "fuel and its expense mirror stay on the same unit",
      );
    }
    for (const service of dataset.maintenanceRecords) {
      assert.equal(
        dataset.expenses.find((row) => row.id === service.expenseId)?.truckId,
        service.truckId,
        "service and its expense mirror stay on the same unit",
      );
    }

    const period = resolvePeriod("2026-08", "full");
    const fleet = calculateFleetSummary(
      dataset.trucks,
      dataset.loads,
      dataset.expenses,
      period,
      dataset.settings,
    );
    const overall = summarizePeriod(dataset.loads, dataset.expenses, period, dataset.settings);
    assert.equal(fleet.units.filter((unit) => unit.loadCount === 1).length, 3);
    assert.equal(fleet.revenue, overall.grossRevenue);
    assert.equal(fleet.directCosts + fleet.overhead, overall.operatingExpenses);
    assert.equal(fleet.operatingProfit, overall.netProfit);
    assert.equal(fleet.contribution - fleet.overhead, fleet.operatingProfit);
    ok("three trucks keep their loads, costs, fuel, maintenance and documents isolated");
    ok("three unit P&Ls reconcile exactly to the fleet P&L");
  } finally {
    await prisma.business.delete({ where: { id: temporary.id } });
  }
}

async function main() {
  const business = await prisma.business.findFirst({ orderBy: { createdAt: "asc" } });
  assert.ok(business, "No business found. Run `npm run db:seed` first.");
  const repository = new PrismaRepository(business.id);

  // --- the dataset reads, and the buckets are real rows --------------------
  const dataset = await repository.getDataset();
  assert.ok(dataset.loads.length > 0, "the seeded loads are readable");
  ok(`dataset reads (${dataset.loads.length} loads, ${dataset.expenses.length} expenses)`);

  const storedAccounts = await prisma.reserveAccount.findMany({
    where: { businessId: business.id },
  });
  for (const account of dataset.reserveAccounts) {
    assert.ok(
      storedAccounts.some((row) => row.id === account.id),
      `reserve bucket ${account.name} is a row in the database, not an object invented on read`,
    );
  }
  ok(`every reserve bucket handed out exists in the database (${storedAccounts.length})`);

  // --- close and reopen ----------------------------------------------------
  const settlementLoad = dataset.loads.find((load) => load.grossRate > 0);
  assert.ok(settlementLoad, "the dataset has a revenue-producing load for settlement checks");
  const month = settlementLoad.date.slice(0, 7);
  const half = Number(settlementLoad.date.slice(8, 10)) <= 15
    ? "FIRST" as const
    : "SECOND" as const;
  const existing = await repository.ensureSettlement(month, half);
  if (existing.status === "CLOSED") await repository.reopenSettlement(existing.id);

  const beforeMovements = await prisma.reserveTransaction.count({
    where: { businessId: business.id },
  });

  const range = settlementBounds(month, half);
  const snapshot = buildSettlementSnapshot(
    dataset.loads,
    dataset.expenses,
    range,
    dataset.settings,
    dataset.reserveAccounts,
  );
  const contributions = snapshot.reserves
    .filter((reserve) => reserve.amount > 0)
    .map((reserve) => ({
      accountId: reserve.accountId,
      amount: reserve.amount,
      description: `${reserve.pct}% - smoke check`,
    }));
  assert.ok(contributions.length > 0, "the period produces at least one contribution to post");

  const settlement = await repository.ensureSettlement(month, half);
  const closed = await repository.closeSettlement(settlement.id, {
    snapshot,
    contributions,
    notes: null,
  });
  assert.equal(closed.status, "CLOSED", "the settlement reports closed");
  assert.ok(closed.snapshot, "the snapshot is stored, not recomputed");
  assert.equal(
    roundMoney(closed.snapshot!.safeToPay),
    roundMoney(snapshot.safeToPay),
    "the stored snapshot is the one that was built",
  );
  ok(`closing ${month} ${half} freezes a snapshot`);

  const posted = await prisma.reserveTransaction.findMany({
    where: { settlementId: settlement.id },
  });
  assert.equal(
    posted.length,
    contributions.length,
    "every contribution the snapshot implies is posted, and each is tagged with the settlement",
  );
  ok(`the close posts ${posted.length} tagged contributions`);

  await repository.reopenSettlement(settlement.id);
  const reopened = await prisma.settlement.findUniqueOrThrow({ where: { id: settlement.id } });
  assert.equal(reopened.status, "OPEN", "reopening returns the settlement to open");
  assert.equal(reopened.snapshot, null, "reopening clears the snapshot");
  assert.equal(
    await prisma.reserveTransaction.count({ where: { businessId: business.id } }),
    beforeMovements,
    "reopening removes exactly what the close wrote, and nothing else",
  );
  ok("reopening reverses the close to the row");

  // --- a fuel purchase is counted once, and stays linked -------------------
  const fuel = await repository.createFuelEntry({
    date: "2026-08-20",
    gallons: 40,
    pricePerGallon: 3.9,
    totalCost: 156,
    odometer: 999_000,
    location: "Smoke Check, VA",
  });
  const linked = await prisma.fuelEntry.findUniqueOrThrow({ where: { id: fuel.id } });
  assert.ok(linked.expenseId, "a fuel purchase writes its ledger row and links it");
  const ledgerRow = await prisma.expense.findUniqueOrThrow({ where: { id: linked.expenseId! } });
  assert.equal(Number(ledgerRow.amount), 156, "the ledger row carries the cost");
  ok("a fuel purchase writes exactly one linked ledger row");

  await repository.deleteFuelEntry(fuel.id);
  assert.equal(
    await prisma.expense.findUnique({ where: { id: linked.expenseId! } }),
    null,
    "deleting the fuel purchase takes its ledger row with it",
  );
  ok("deleting the fuel purchase removes its ledger row");

  // --- complete three-truck accounting -----------------------------------
  await smokeThreeTruckLedger();

  // --- scoping -------------------------------------------------------------
  const stranger = new PrismaRepository("not-this-business");
  await assert.rejects(() => stranger.getDataset(), "another business's session cannot read");
  ok("a repository bound to another business cannot read these rows");

  console.log(`\n${passed} checks passed against Postgres.`);
}

main()
  .catch((error) => {
    console.error("\nSMOKE CHECK FAILED\n", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
