/**
 * Seeds a PostgreSQL database with the same demo dataset the JSON store
 * boots with, so switching DATA_SOURCE=postgres gives an identical app.
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

  console.log("Clearing existing data...");
  await prisma.document.deleteMany();
  await prisma.maintenanceRecord.deleteMany();
  await prisma.fuelEntry.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.load.deleteMany();
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
          name: dataset.truck.name,
          year: dataset.truck.year,
          make: dataset.truck.make,
          model: dataset.truck.model,
          vin: dataset.truck.vin,
          purchasePrice: dataset.truck.purchasePrice,
          monthlyPayment: dataset.truck.monthlyPayment,
          monthlyInsurance: dataset.truck.monthlyInsurance,
          startingOdometer: dataset.truck.startingOdometer,
          currentOdometer: dataset.truck.currentOdometer,
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
        originCity: load.originCity,
        originState: load.originState,
        destinationCity: load.destinationCity,
        destinationState: load.destinationState,
        broker: load.broker,
        loadNumber: load.loadNumber,
        loadedMiles: load.loadedMiles,
        deadheadMiles: load.deadheadMiles,
        grossRate: load.grossRate,
        fuelCost: load.fuelCost,
        tolls: load.tolls,
        dispatchFee: load.dispatchFee,
        factoringFee: load.factoringFee,
        otherExpenses: load.otherExpenses,
        status: load.status,
        notes: load.notes,
      },
    });
    loadIdMap.set(load.id, created.id);
  }

  console.log(`Seeding ${dataset.expenses.length} expenses...`);
  await prisma.expense.createMany({
    data: dataset.expenses.map((expense) => ({
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
    })),
  });

  console.log(`Seeding ${dataset.fuelEntries.length} fuel entries...`);
  await prisma.fuelEntry.createMany({
    data: dataset.fuelEntries.map((entry) => ({
      businessId: business.id,
      truckId,
      loadId: entry.loadId ? (loadIdMap.get(entry.loadId) ?? null) : null,
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
      notes: record.notes,
    })),
  });

  console.log("Done.");
  console.log(
    "Note: document *files* are not seeded -- only the local JSON store writes " +
      "demo PDFs to disk. Upload documents through the UI when running on Postgres.",
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
