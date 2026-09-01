/**
 * Seeds a PostgreSQL database with the deterministic reference fixture used
 * by tests and local development.
 *
 *   npm run db:push && npm run db:seed
 */

import { PrismaClient } from "../src/generated/prisma";
import { buildSeedDataset } from "../src/lib/seed/seed-data";

const prisma = new PrismaClient();

function toDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

async function main() {
  const dataset = buildSeedDataset();
  const primary = dataset.trucks[0];

  console.log("Clearing existing data...");
  // Children before parents, and the tables added after the first release
  // before the ones they point at: a reserve transaction references both an
  // account and a settlement.
  await prisma.document.deleteMany();
  await prisma.reserveTransaction.deleteMany();
  await prisma.settlement.deleteMany();
  await prisma.driverSettlement.deleteMany();
  await prisma.reserveAccount.deleteMany();
  await prisma.financialGoal.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.maintenanceRecord.deleteMany();
  await prisma.fuelEntry.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.load.deleteMany();
  await prisma.driver.deleteMany();
  await prisma.financialSettings.deleteMany();
  await prisma.truck.deleteMany();
  await prisma.user.deleteMany();
  await prisma.business.deleteMany();

  console.log(`Seeding business "${dataset.business.name}"...`);
  const business = await prisma.business.create({
    data: {
      name: dataset.business.name,
      currency: dataset.business.currency,
      settings: {
        create: {
          taxReservePct: dataset.settings.taxReservePct,
          maintenanceReservePct: dataset.settings.maintenanceReservePct,
          categoryBehavior: dataset.settings.categoryBehavior,
          ratingGreatPerMile: dataset.settings.ratingGreatPerMile,
          ratingGoodPerMile: dataset.settings.ratingGoodPerMile,
          ratingMarginalPerMile: dataset.settings.ratingMarginalPerMile,
          deadheadWarnPct: dataset.settings.deadheadWarnPct,
          maintenanceWarnMiles: dataset.settings.maintenanceWarnMiles,
          maintenanceWarnDays: dataset.settings.maintenanceWarnDays,
        },
      },
      trucks: {
        create: {
          name: primary.name,
          year: primary.year,
          make: primary.make,
          model: primary.model,
          vin: primary.vin,
          purchasePrice: primary.purchasePrice,
          monthlyPayment: primary.monthlyPayment,
          monthlyInsurance: primary.monthlyInsurance,
          startingOdometer: primary.startingOdometer,
          currentOdometer: primary.currentOdometer,
        },
      },
    },
    include: { trucks: true },
  });

  const truckId = business.trucks[0].id;

  console.log(`Seeding ${dataset.loads.length} loads...`);
  const loadIdMap = new Map<string, string>();
  for (const load of dataset.loads) {
    const created = await prisma.load.create({
      data: {
        businessId: business.id,
        truckId,
        date: toDate(load.date),
        deliveryDate: load.deliveryDate ? toDate(load.deliveryDate) : null,
        endingOdometer: load.endingOdometer,
        originCity: load.originCity,
        originState: load.originState,
        destinationCity: load.destinationCity,
        destinationState: load.destinationState,
        broker: load.broker,
        loadNumber: load.loadNumber,
        equipmentType: load.equipmentType,
        loadCapacity: load.loadCapacity,
        equipmentLengthFt: load.equipmentLengthFt,
        weightLbs: load.weightLbs,
        commodity: load.commodity,
        loadedMiles: load.loadedMiles,
        deadheadMiles: load.deadheadMiles,
        grossRate: load.grossRate,
        fuelCost: load.fuelCost,
        tolls: load.tolls,
        dispatchFee: load.dispatchFee,
        factoringFee: load.factoringFee,
        otherExpenses: load.otherExpenses,
        costsPosted: load.costsPosted,
        status: load.status,
        notes: load.notes,
      },
    });
    loadIdMap.set(load.id, created.id);
  }

  // Created one at a time rather than with createMany, because the ledger row
  // a fuel purchase or a service writes has to be linked back by id -- that
  // link is what keeps real money counted exactly once.
  console.log(`Seeding ${dataset.expenses.length} expenses...`);
  const expenseIdMap = new Map<string, string>();
  for (const expense of dataset.expenses) {
    const created = await prisma.expense.create({
      data: {
        businessId: business.id,
        truckId,
        loadId: expense.loadId ? (loadIdMap.get(expense.loadId) ?? null) : null,
        date: toDate(expense.date),
        category: expense.category,
        description: expense.description,
        vendor: expense.vendor,
        amount: expense.amount,
        recurring: expense.recurring,
        receiptNumber: expense.receiptNumber,
        notes: expense.notes,
      },
    });
    expenseIdMap.set(expense.id, created.id);
  }

  console.log(`Seeding ${dataset.fuelEntries.length} fuel entries...`);
  await prisma.fuelEntry.createMany({
    data: dataset.fuelEntries.map((entry) => ({
      businessId: business.id,
      truckId,
      loadId: entry.loadId ? (loadIdMap.get(entry.loadId) ?? null) : null,
      expenseId: entry.expenseId ? (expenseIdMap.get(entry.expenseId) ?? null) : null,
      date: toDate(entry.date),
      gallons: entry.gallons,
      pricePerGallon: entry.pricePerGallon,
      totalCost: entry.totalCost,
      odometer: entry.odometer,
      location: entry.location,
      notes: entry.notes,
    })),
  });

  console.log(`Seeding ${dataset.maintenanceRecords.length} maintenance records...`);
  await prisma.maintenanceRecord.createMany({
    data: dataset.maintenanceRecords.map((record) => ({
      businessId: business.id,
      truckId,
      type: record.type,
      basis: record.basis,
      serviceDate: toDate(record.serviceDate),
      odometer: record.odometer,
      cost: record.cost,
      vendor: record.vendor,
      nextServiceDate: record.nextServiceDate ? toDate(record.nextServiceDate) : null,
      nextServiceOdometer: record.nextServiceOdometer,
      expenseId: record.expenseId ? (expenseIdMap.get(record.expenseId) ?? null) : null,
      notes: record.notes,
    })),
  });

  // --- the cockpit's own records -------------------------------------------
  // Goals, buckets, settlement history and the reserve movements those closes
  // posted. Without these the Postgres fixture differs from the reference: no emergency
  // bucket means a different Safe to Pay, and no history means the settlement
  // page opens empty.

  console.log("Seeding goals and subscription...");
  await prisma.financialGoal.create({
    data: {
      businessId: business.id,
      monthlyRevenueTarget: dataset.goals.monthlyRevenueTarget,
      monthlyProfitTarget: dataset.goals.monthlyProfitTarget,
      targetProfitPerMile: dataset.goals.targetProfitPerMile,
      maxDeadheadPct: dataset.goals.maxDeadheadPct,
      targetLoads: dataset.goals.targetLoads,
      workingDaysPerWeek: dataset.goals.workingDaysPerWeek,
      expectedMonthlyMiles: dataset.goals.expectedMonthlyMiles ?? 0,
    },
  });

  await prisma.subscription.create({
    data: {
      businessId: business.id,
      plan: dataset.subscription.plan,
      status: dataset.subscription.status,
      currentPeriodEnd: dataset.subscription.currentPeriodEnd
        ? toDate(dataset.subscription.currentPeriodEnd)
        : null,
    },
  });

  console.log(`Seeding ${dataset.reserveAccounts.length} reserve buckets...`);
  const accountIdMap = new Map<string, string>();
  for (const account of dataset.reserveAccounts) {
    const created = await prisma.reserveAccount.create({
      data: {
        businessId: business.id,
        kind: account.kind,
        name: account.name,
        basis: account.basis,
        // Null on the two built-ins on purpose: their rate lives in
        // FinancialSettings, so a reserve percentage is stored once.
        contributionPct: account.contributionPct,
        targetBalance: account.targetBalance,
        active: account.active,
        sortOrder: account.sortOrder,
      },
    });
    accountIdMap.set(account.id, created.id);
  }

  console.log(`Seeding ${dataset.settlements.length} settlements...`);
  const settlementIdMap = new Map<string, string>();
  for (const settlement of dataset.settlements) {
    // The snapshot is stored verbatim, so the bucket ids inside it have to be
    // rewritten to this database's ids or a reopened settlement would point at
    // buckets that never existed here.
    const snapshot = settlement.snapshot
      ? {
          ...settlement.snapshot,
          reserves: settlement.snapshot.reserves.map((line) => ({
            ...line,
            accountId: accountIdMap.get(line.accountId) ?? line.accountId,
          })),
        }
      : null;

    const created = await prisma.settlement.create({
      data: {
        businessId: business.id,
        month: settlement.month,
        half: settlement.half,
        periodStart: toDate(settlement.periodStart),
        periodEnd: toDate(settlement.periodEnd),
        status: settlement.status,
        closedAt: settlement.closedAt ? new Date(settlement.closedAt) : null,
        snapshot: snapshot ?? undefined,
        notes: settlement.notes,
      },
    });
    settlementIdMap.set(settlement.id, created.id);
  }

  console.log(`Seeding ${dataset.reserveTransactions.length} reserve movements...`);
  await prisma.reserveTransaction.createMany({
    data: dataset.reserveTransactions.map((movement) => ({
      businessId: business.id,
      accountId: accountIdMap.get(movement.accountId) ?? movement.accountId,
      date: toDate(movement.date),
      type: movement.type,
      amount: movement.amount,
      description: movement.description,
      settlementId: movement.settlementId
        ? (settlementIdMap.get(movement.settlementId) ?? null)
        : null,
    })),
  });

  console.log("Done.");
  console.log(
    "Note: document *files* are not seeded -- only the local JSON store writes " +
      "sample PDFs to disk. Upload documents through the UI when running on Postgres.",
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
