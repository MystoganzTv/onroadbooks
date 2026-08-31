/**
 * ONE-TIME MIGRATION: local JSON ledger -> Postgres (Supabase).
 *
 * Every row keeps its original id. That is not cosmetic:
 *   - a FuelEntry points at its mirror expense by id (`expfuel_<fuelId>`),
 *   - a Document's storageKey embeds the load/expense id it is filed against,
 *   - and keeping ids identical is what lets the verification step compare the
 *     two backends row by row instead of hoping the totals happen to agree.
 *
 * The dataset is read through JsonRepository, so it arrives exactly as the app
 * renders it today -- migrations applied, `costsPosted` false on legacy loads,
 * and therefore no trip costs mirrored into the ledger retroactively.
 *
 * Reading never writes: readDataset() only persists when it has to seed a file
 * that does not exist.
 */

import { Prisma, PrismaClient } from "../src/generated/prisma";
import { JsonRepository } from "../src/lib/db/json-store";

const BUSINESS_ID = process.env.IMPORT_BUSINESS_ID?.trim() || "biz_boxtruck";

const prisma = new PrismaClient();

/** A day-precision column: anchored at UTC midnight, never shifted by a zone. */
function day(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function stamp(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

async function main() {
  const dataset = await new JsonRepository(BUSINESS_ID).getDataset();
  const {
    business,
    settings,
    goals,
    subscription,
    trucks,
    loads,
    expenses,
    fuelEntries,
    maintenanceRecords,
    documents,
    reserveAccounts,
    reserveTransactions,
    settlements,
    drivers,
    driverSettlements,
    users,
  } = dataset;

  const posted = loads.filter((l) => l.costsPosted).length;
  console.log(`Leyendo ledger local: ${business.name}`);
  console.log(
    `  ${loads.length} loads (${posted} con costos posteados), ${expenses.length} gastos, ` +
      `${fuelEntries.length} cargas de fuel, ${maintenanceRecords.length} servicios, ` +
      `${documents.length} documentos, ${users.length} usuarios`,
  );
  const mirrored = expenses.filter((e) => e.id.startsWith("expload_")).length;
  if (mirrored > 0) {
    throw new Error(
      `Se generaron ${mirrored} filas expload_: el ledger se duplicaría en la nube. Abortado.`,
    );
  }

  const existingBusinesses = await prisma.business.count();
  if (existingBusinesses > 0 && process.env.ALLOW_DESTRUCTIVE_IMPORT !== "REPLACE_ALL") {
    throw new Error(
      `El destino contiene ${existingBusinesses} negocio(s). `
      + "La importación se negó a borrar datos; use ALLOW_DESTRUCTIVE_IMPORT=REPLACE_ALL solo para una restauración deliberada.",
    );
  }

  if (existingBusinesses > 0) {
    // Children before parents. This path is intentionally hard to enable: a
    // normal migration targets an empty schema and must never erase production.
    console.log("Limpiando destino autorizado…");
    await prisma.document.deleteMany();
    await prisma.reserveTransaction.deleteMany();
    await prisma.settlement.deleteMany();
    await prisma.driverSettlementLine.deleteMany();
    await prisma.driverSettlement.deleteMany();
    await prisma.maintenanceRecord.deleteMany();
    await prisma.fuelEntry.deleteMany();
    await prisma.expense.deleteMany();
    await prisma.load.deleteMany();
    await prisma.driver.deleteMany();
    await prisma.reserveAccount.deleteMany();
    await prisma.financialGoal.deleteMany();
    await prisma.subscription.deleteMany();
    await prisma.financialSettings.deleteMany();
    await prisma.truck.deleteMany();
    await prisma.user.deleteMany();
    await prisma.business.deleteMany();
  }

  console.log("Negocio, ajustes, metas y suscripción…");
  await prisma.business.create({
    data: {
      id: business.id,
      name: business.name,
      currency: business.currency,
      createdAt: stamp(business.createdAt),
    },
  });

  await prisma.financialSettings.create({
    data: {
      id: settings.id,
      businessId: business.id,
      taxReservePct: settings.taxReservePct,
      maintenanceReservePct: settings.maintenanceReservePct,
      categoryBehavior: settings.categoryBehavior,
      ratingGreatPerMile: settings.ratingGreatPerMile,
      ratingGoodPerMile: settings.ratingGoodPerMile,
      ratingMarginalPerMile: settings.ratingMarginalPerMile,
      deadheadWarnPct: settings.deadheadWarnPct,
      maintenanceWarnMiles: settings.maintenanceWarnMiles,
      maintenanceWarnDays: settings.maintenanceWarnDays,
    },
  });

  await prisma.financialGoal.create({
    data: {
      id: goals.id,
      businessId: business.id,
      monthlyRevenueTarget: goals.monthlyRevenueTarget,
      monthlyProfitTarget: goals.monthlyProfitTarget,
      targetProfitPerMile: goals.targetProfitPerMile,
      maxDeadheadPct: goals.maxDeadheadPct,
      targetLoads: goals.targetLoads,
      workingDaysPerWeek: goals.workingDaysPerWeek,
    },
  });

  await prisma.subscription.create({
    data: {
      id: subscription.id,
      businessId: business.id,
      plan: subscription.plan,
      status: subscription.status,
      currentPeriodEnd: subscription.currentPeriodEnd
        ? day(subscription.currentPeriodEnd)
        : null,
      providerCustomerId: subscription.providerCustomerId,
      providerSubscriptionId: subscription.providerSubscriptionId,
      startedAt: stamp(subscription.startedAt),
    },
  });

  // The password hashes come across verbatim, so the session cookie already in
  // the browser keeps working and the existing password still logs in.
  console.log(`${users.length} usuarios…`);
  for (const user of users) {
    await prisma.user.create({
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
        passwordHash: user.passwordHash,
        role: user.role,
        invitedAt: stamp(user.invitedAt),
        joinedAt: user.joinedAt ? stamp(user.joinedAt) : null,
        businessId: user.businessId,
        createdAt: stamp(user.createdAt),
      },
    });
  }

  console.log(`${trucks.length} camión(es)…`);
  for (const truck of trucks) {
    await prisma.truck.create({
      data: {
        id: truck.id,
        businessId: business.id,
        name: truck.name,
        acquiredOn: truck.acquiredOn ? day(truck.acquiredOn) : null,
        soldOn: truck.soldOn ? day(truck.soldOn) : null,
        year: truck.year,
        make: truck.make,
        model: truck.model,
        vin: truck.vin,
        purchasePrice: truck.purchasePrice,
        monthlyPayment: truck.monthlyPayment,
        monthlyInsurance: truck.monthlyInsurance,
        startingOdometer: truck.startingOdometer,
        currentOdometer: truck.currentOdometer,
        active: truck.active,
        createdAt: stamp(truck.createdAt),
      },
    });
  }

  console.log(`${drivers.length} chofer(es)…`);
  for (const driver of drivers) {
    await prisma.driver.create({
      data: {
        id: driver.id,
        businessId: business.id,
        name: driver.name,
        reference: driver.reference,
        defaultTruckId: driver.defaultTruckId,
        payType: driver.payType,
        payRate: driver.payRate,
        active: driver.active,
        createdAt: stamp(driver.createdAt),
      },
    });
  }

  console.log(`${loads.length} loads…`);
  for (const load of loads) {
    await prisma.load.create({
      data: {
        id: load.id,
        businessId: business.id,
        truckId: load.truckId,
        driverId: load.driverId,
        date: day(load.date),
        deliveryDate: load.deliveryDate ? day(load.deliveryDate) : null,
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
        driverPay: load.driverPay,
        // Carried across as-is. False on this ledger's historical loads, which
        // is the whole reason the numbers do not move.
        costsPosted: load.costsPosted,
        status: load.status,
        notes: load.notes,
        createdAt: stamp(load.createdAt),
      },
    });
  }

  console.log(`${expenses.length} gastos…`);
  for (const expense of expenses) {
    await prisma.expense.create({
      data: {
        id: expense.id,
        businessId: business.id,
        truckId: expense.truckId,
        loadId: expense.loadId,
        date: day(expense.date),
        scope: expense.scope,
        category: expense.category,
        description: expense.description,
        vendor: expense.vendor,
        amount: expense.amount,
        recurring: expense.recurring,
        receiptNumber: expense.receiptNumber,
        notes: expense.notes,
        createdAt: stamp(expense.createdAt),
      },
    });
  }

  console.log(`${fuelEntries.length} cargas de combustible…`);
  for (const entry of fuelEntries) {
    await prisma.fuelEntry.create({
      data: {
        id: entry.id,
        businessId: business.id,
        truckId: entry.truckId,
        loadId: entry.loadId,
        date: day(entry.date),
        gallons: entry.gallons,
        pricePerGallon: entry.pricePerGallon,
        totalCost: entry.totalCost,
        odometer: entry.odometer,
        location: entry.location,
        // The mirror link the app relies on to count a purchase once.
        expenseId: entry.expenseId,
        notes: entry.notes,
        createdAt: stamp(entry.createdAt),
      },
    });
  }

  console.log(`${maintenanceRecords.length} servicios…`);
  for (const record of maintenanceRecords) {
    await prisma.maintenanceRecord.create({
      data: {
        id: record.id,
        businessId: business.id,
        truckId: record.truckId,
        type: record.type,
        basis: record.basis,
        serviceDate: day(record.serviceDate),
        odometer: record.odometer,
        cost: record.cost,
        vendor: record.vendor,
        nextServiceDate: record.nextServiceDate ? day(record.nextServiceDate) : null,
        nextServiceOdometer: record.nextServiceOdometer,
        expenseId: record.expenseId,
        notes: record.notes,
        createdAt: stamp(record.createdAt),
      },
    });
  }

  console.log(`${driverSettlements.length} liquidación(es) de chofer…`);
  for (const settlement of driverSettlements) {
    await prisma.driverSettlement.create({
      data: {
        id: settlement.id,
        businessId: business.id,
        driverId: settlement.driverId,
        periodStart: day(settlement.periodStart),
        periodEnd: day(settlement.periodEnd),
        status: settlement.status,
        paidOn: settlement.paidOn ? day(settlement.paidOn) : null,
        notes: settlement.notes,
        createdAt: stamp(settlement.createdAt),
        lines: {
          create: settlement.lines.map((line) => ({
            id: line.id,
            loadId: line.loadId,
            truckId: line.truckId,
            grossRevenue: line.grossRevenue,
            loadedMiles: line.loadedMiles,
            totalMiles: line.totalMiles,
            payType: line.payType,
            payRate: line.payRate,
            payAmount: line.payAmount,
            expenseId: line.expenseId,
            createdAt: stamp(line.createdAt),
          })),
        },
      },
    });
  }

  console.log(`${reserveAccounts.length} buckets de reserva…`);
  for (const account of reserveAccounts) {
    await prisma.reserveAccount.create({
      data: {
        id: account.id,
        businessId: business.id,
        kind: account.kind,
        name: account.name,
        basis: account.basis,
        contributionPct: account.contributionPct,
        targetBalance: account.targetBalance,
        active: account.active,
        sortOrder: account.sortOrder,
        createdAt: stamp(account.createdAt),
      },
    });
  }

  console.log(`${settlements.length} settlements…`);
  for (const settlement of settlements) {
    await prisma.settlement.create({
      data: {
        id: settlement.id,
        businessId: business.id,
        month: settlement.month,
        half: settlement.half,
        periodStart: day(settlement.periodStart),
        periodEnd: day(settlement.periodEnd),
        status: settlement.status,
        closedAt: stamp(settlement.closedAt),
        // Ids are preserved, so the bucket ids inside a frozen snapshot still
        // resolve here -- no remapping needed, unlike the reference seed.
        snapshot: settlement.snapshot
          ? (settlement.snapshot as unknown as Prisma.InputJsonValue)
          : undefined,
        notes: settlement.notes,
        createdAt: stamp(settlement.createdAt),
      },
    });
  }

  console.log(`${reserveTransactions.length} movimientos de reserva…`);
  for (const movement of reserveTransactions) {
    await prisma.reserveTransaction.create({
      data: {
        id: movement.id,
        businessId: business.id,
        accountId: movement.accountId,
        date: day(movement.date),
        type: movement.type,
        amount: movement.amount,
        description: movement.description,
        settlementId: movement.settlementId,
        createdAt: stamp(movement.createdAt),
      },
    });
  }

  // Rows only. The files themselves are uploaded to Supabase Storage by the
  // next step, under these same storageKeys.
  console.log(`${documents.length} documentos (metadatos)…`);
  for (const document of documents) {
    await prisma.document.create({
      data: {
        id: document.id,
        businessId: business.id,
        loadId: document.loadId,
        expenseId: document.expenseId,
        truckId: document.truckId,
        maintenanceId: document.maintenanceId,
        type: document.type,
        label: document.label,
        fileName: document.fileName,
        contentType: document.contentType,
        sizeBytes: document.sizeBytes,
        storageKey: document.storageKey,
        uploadedAt: stamp(document.uploadedAt),
      },
    });
  }

  const counts = {
    negocios: await prisma.business.count(),
    usuarios: await prisma.user.count(),
    camiones: await prisma.truck.count(),
    loads: await prisma.load.count(),
    gastos: await prisma.expense.count(),
    fuel: await prisma.fuelEntry.count(),
    servicios: await prisma.maintenanceRecord.count(),
    choferes: await prisma.driver.count(),
    liquidacionesChofer: await prisma.driverSettlement.count(),
    lineasLiquidacion: await prisma.driverSettlementLine.count(),
    documentos: await prisma.document.count(),
    buckets: await prisma.reserveAccount.count(),
    settlements: await prisma.settlement.count(),
    movimientos: await prisma.reserveTransaction.count(),
  };
  console.log("\nFilas en Supabase:", counts);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
