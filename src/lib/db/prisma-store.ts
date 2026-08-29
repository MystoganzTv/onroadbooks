import "server-only";

import { roundMoney } from "../calculations";
import type {
  Business,
  Dataset,
  Document,
  DocumentType,
  Expense,
  ExpenseCategoryId,
  FinancialSettings,
  FuelEntry,
  Load,
  MaintenanceBasis,
  MaintenanceRecord,
  MaintenanceType,
  PaymentStatus,
  Truck,
} from "../types";
import { defaultCategoryBehavior } from "../categories";
import type {
  BusinessInput,
  DocumentInput,
  ExpenseInput,
  FuelEntryInput,
  LoadInput,
  MaintenanceInput,
  Repository,
  SettingsInput,
  TruckInput,
} from "./repository";

/**
 * Prisma + PostgreSQL implementation.
 *
 * Activated by setting DATA_SOURCE=postgres (see .env.example). The client
 * is imported dynamically so that a project running on the JSON store never
 * has to have a generated Prisma client at runtime.
 *
 * Prisma Decimal columns are converted to plain numbers at the boundary and
 * @db.Date columns to "YYYY-MM-DD" strings, so the rest of the application
 * sees exactly the same shapes as the JSON store.
 */

type PrismaClientType = InstanceType<typeof import("@/generated/prisma").PrismaClient>;

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClientType };

async function getClient(): Promise<PrismaClientType> {
  if (globalForPrisma.prisma) return globalForPrisma.prisma;
  const { PrismaClient } = await import("@/generated/prisma");
  const client = new PrismaClient();
  if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = client;
  return client;
}

type DecimalLike = { toNumber(): number } | number | null | undefined;

function num(value: DecimalLike): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  return value.toNumber();
}

/** Reads a Decimal setting, falling back only when the column is absent. */
function settingNumber(value: DecimalLike, fallback: number): number {
  if (value === null || value === undefined) return fallback;
  const n = typeof value === "number" ? value : value.toNumber();
  return Number.isFinite(n) ? n : fallback;
}

function numOrNull(value: DecimalLike): number | null {
  if (value === null || value === undefined) return null;
  return typeof value === "number" ? value : value.toNumber();
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function toDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}


/** Deterministic id linking a fuel entry to its mirrored ledger expense. */
function fuelExpenseId(fuelEntryId: string): string {
  return `expfuel_${fuelEntryId}`;
}

function fuelDescription(gallons: number, pricePerGallon: number): string {
  return `Fuel - ${gallons.toFixed(1)} gal @ ${pricePerGallon.toFixed(3)}/gal`;
}

/** Ledger category a logged service books under. */
function maintenanceExpenseCategory(type: MaintenanceType): ExpenseCategoryId {
  switch (type) {
    case "TIRES":
    case "BRAKES":
    case "TRANSMISSION":
    case "BATTERY":
      return "REPAIRS";
    case "REGISTRATION":
      return "REGISTRATION";
    case "INSURANCE":
      return "INSURANCE";
    case "DOT_INSPECTION":
    case "STATE_INSPECTION":
      return "PERMITS";
    default:
      return "MAINTENANCE";
  }
}

function prettyMaintenance(type: string): string {
  return type
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
}

export class PrismaRepository implements Repository {
  private async business(client: PrismaClientType) {
    // Prefer an active truck but fall back to any truck: deactivating the
    // only truck must not take the whole app down.
    const existing = await client.business.findFirst({
      include: {
        settings: true,
        trucks: { orderBy: [{ active: "desc" }, { createdAt: "asc" }], take: 1 },
      },
    });
    if (existing && existing.trucks.length > 0) return existing;
    if (existing) {
      const truck = await client.truck.create({
        data: { businessId: existing.id, name: "Truck 1" },
      });
      return { ...existing, trucks: [truck] };
    }

    // First boot against an empty database: create the minimum viable shell
    // so the UI has a business, settings row and truck to attach data to.
    return client.business.create({
      data: {
        name: "My Trucking Business",
        currency: "USD",
        settings: { create: { categoryBehavior: defaultCategoryBehavior() } },
        trucks: { create: { name: "Truck 1" } },
      },
      include: {
        settings: true,
        trucks: { orderBy: [{ active: "desc" }, { createdAt: "asc" }], take: 1 },
      },
    });
  }

  async getDataset(): Promise<Dataset> {
    const client = await getClient();
    const business = await this.business(client);
    const truckRow = business.trucks[0];

    const [loadRows, expenseRows, fuelRows, documentRows, maintenanceRows] = await Promise.all([
      // Tie-break on id so same-day rows have a defined order, matching the
      // JSON store rather than whatever Postgres happens to return.
      client.load.findMany({
        where: { businessId: business.id },
        orderBy: [{ date: "desc" }, { id: "desc" }],
      }),
      client.expense.findMany({
        where: { businessId: business.id },
        orderBy: [{ date: "desc" }, { id: "desc" }],
      }),
      client.fuelEntry.findMany({
        where: { businessId: business.id },
        orderBy: [{ date: "desc" }, { id: "desc" }],
      }),
      client.document.findMany({
        where: { businessId: business.id },
        orderBy: { uploadedAt: "asc" },
      }),
      client.maintenanceRecord.findMany({
        where: { businessId: business.id },
        orderBy: [{ serviceDate: "desc" }, { id: "desc" }],
      }),
    ]);

    const settings: FinancialSettings = {
      id: business.settings?.id ?? "settings",
      businessId: business.id,
      // `??` on the column, not `||` on the number: a legitimate 0 (no tax
      // reserve, warn only when overdue) must survive a round trip.
      taxReservePct: settingNumber(business.settings?.taxReservePct, 20),
      maintenanceReservePct: settingNumber(business.settings?.maintenanceReservePct, 5),
      ratingGreatPerMile: settingNumber(business.settings?.ratingGreatPerMile, 2),
      ratingGoodPerMile: settingNumber(business.settings?.ratingGoodPerMile, 1.5),
      ratingMarginalPerMile: settingNumber(business.settings?.ratingMarginalPerMile, 1),
      deadheadWarnPct: settingNumber(business.settings?.deadheadWarnPct, 20),
      maintenanceWarnMiles: business.settings?.maintenanceWarnMiles ?? 2000,
      maintenanceWarnDays: business.settings?.maintenanceWarnDays ?? 30,
      categoryBehavior: {
        ...defaultCategoryBehavior(),
        ...((business.settings?.categoryBehavior as Record<
          string,
          "FIXED" | "VARIABLE"
        > | null) ?? {}),
      },
      updatedAt: (business.settings?.updatedAt ?? new Date()).toISOString(),
    };

    const truck: Truck = {
      id: truckRow.id,
      businessId: business.id,
      name: truckRow.name,
      year: truckRow.year,
      make: truckRow.make,
      model: truckRow.model,
      vin: truckRow.vin,
      purchasePrice: numOrNull(truckRow.purchasePrice),
      monthlyPayment: numOrNull(truckRow.monthlyPayment),
      monthlyInsurance: numOrNull(truckRow.monthlyInsurance),
      startingOdometer: truckRow.startingOdometer,
      currentOdometer: truckRow.currentOdometer,
      active: truckRow.active,
      createdAt: truckRow.createdAt.toISOString(),
    };

    return {
      business: {
        id: business.id,
        name: business.name,
        currency: business.currency,
        createdAt: business.createdAt.toISOString(),
      } satisfies Business,
      settings,
      truck,
      loads: loadRows.map(
        (row): Load => ({
          id: row.id,
          businessId: row.businessId,
          truckId: row.truckId,
          date: isoDate(row.date),
          originCity: row.originCity,
          originState: row.originState,
          destinationCity: row.destinationCity,
          destinationState: row.destinationState,
          broker: row.broker,
          loadNumber: row.loadNumber,
          loadedMiles: row.loadedMiles,
          deadheadMiles: row.deadheadMiles,
          grossRate: num(row.grossRate),
          fuelCost: num(row.fuelCost),
          tolls: num(row.tolls),
          dispatchFee: num(row.dispatchFee),
          factoringFee: num(row.factoringFee),
          otherExpenses: num(row.otherExpenses),
          status: row.status as PaymentStatus,
          notes: row.notes,
          createdAt: row.createdAt.toISOString(),
        }),
      ),
      expenses: expenseRows.map(
        (row): Expense => ({
          id: row.id,
          businessId: row.businessId,
          truckId: row.truckId,
          loadId: row.loadId,
          date: isoDate(row.date),
          category: row.category as ExpenseCategoryId,
          description: row.description,
          vendor: row.vendor,
          amount: num(row.amount),
          recurring: row.recurring,
          receiptNumber: row.receiptNumber,
          notes: row.notes,
          createdAt: row.createdAt.toISOString(),
        }),
      ),
      fuelEntries: fuelRows.map(
        (row): FuelEntry => ({
          id: row.id,
          businessId: row.businessId,
          truckId: row.truckId,
          loadId: row.loadId,
          date: isoDate(row.date),
          gallons: num(row.gallons),
          pricePerGallon: num(row.pricePerGallon),
          totalCost: num(row.totalCost),
          odometer: row.odometer,
          location: row.location,
          notes: row.notes,
          createdAt: row.createdAt.toISOString(),
        }),
      ),
      documents: documentRows.map(
        (row): Document => ({
          id: row.id,
          businessId: row.businessId,
          loadId: row.loadId,
          expenseId: row.expenseId,
          truckId: row.truckId,
          maintenanceId: row.maintenanceId,
          type: row.type as DocumentType,
          label: row.label,
          fileName: row.fileName,
          contentType: row.contentType,
          sizeBytes: row.sizeBytes,
          storageKey: row.storageKey,
          uploadedAt: row.uploadedAt.toISOString(),
        }),
      ),
      maintenanceRecords: maintenanceRows.map(
        (row): MaintenanceRecord => ({
          id: row.id,
          businessId: row.businessId,
          truckId: row.truckId,
          type: row.type as MaintenanceType,
          basis: row.basis as MaintenanceBasis,
          serviceDate: isoDate(row.serviceDate),
          odometer: row.odometer,
          cost: num(row.cost),
          vendor: row.vendor,
          nextServiceDate: row.nextServiceDate ? isoDate(row.nextServiceDate) : null,
          nextServiceOdometer: row.nextServiceOdometer,
          expenseId: row.expenseId,
          notes: row.notes,
          createdAt: row.createdAt.toISOString(),
        }),
      ),
    };
  }

  private loadData(input: LoadInput) {
    return {
      date: toDate(input.date),
      originCity: input.originCity.trim(),
      originState: input.originState.trim().toUpperCase(),
      destinationCity: input.destinationCity.trim(),
      destinationState: input.destinationState.trim().toUpperCase(),
      broker: input.broker?.trim() || null,
      loadNumber: input.loadNumber?.trim() || null,
      loadedMiles: Math.round(input.loadedMiles),
      deadheadMiles: Math.round(input.deadheadMiles),
      grossRate: roundMoney(input.grossRate),
      fuelCost: roundMoney(input.fuelCost),
      tolls: roundMoney(input.tolls),
      dispatchFee: roundMoney(input.dispatchFee),
      factoringFee: roundMoney(input.factoringFee),
      otherExpenses: roundMoney(input.otherExpenses),
      status: input.status,
      notes: input.notes?.trim() || null,
    };
  }

  async createLoad(input: LoadInput): Promise<Load> {
    const client = await getClient();
    const business = await this.business(client);
    // Match by id, never by position: the list is ordered by date, so a load
    // dated in the past is not dataset.loads[0], and returning the wrong id
    // would file the caller's attachments against someone else's load.
    const row = await client.load.create({
      data: {
        ...this.loadData(input),
        businessId: business.id,
        truckId: business.trucks[0].id,
      },
    });
    const dataset = await this.getDataset();
    return dataset.loads.find((l) => l.id === row.id)!;
  }

  async updateLoad(id: string, input: LoadInput): Promise<Load> {
    const client = await getClient();
    await client.load.update({ where: { id }, data: this.loadData(input) });
    const dataset = await this.getDataset();
    return dataset.loads.find((l) => l.id === id)!;
  }

  async deleteLoad(id: string): Promise<void> {
    const client = await getClient();
    await client.load.delete({ where: { id } });
  }

  private expenseData(input: ExpenseInput) {
    return {
      date: toDate(input.date),
      category: input.category,
      description: input.description.trim(),
      vendor: input.vendor?.trim() || null,
      amount: roundMoney(input.amount),
      loadId: input.loadId || null,
      recurring: input.recurring,
      receiptNumber: input.receiptNumber?.trim() || null,
      notes: input.notes?.trim() || null,
    };
  }

  async createExpense(input: ExpenseInput): Promise<Expense> {
    const client = await getClient();
    const business = await this.business(client);
    const row = await client.expense.create({
      data: {
        ...this.expenseData(input),
        businessId: business.id,
        truckId: business.trucks[0].id,
      },
    });
    const dataset = await this.getDataset();
    return dataset.expenses.find((e) => e.id === row.id)!;
  }

  async updateExpense(id: string, input: ExpenseInput): Promise<Expense> {
    const client = await getClient();
    await client.expense.update({ where: { id }, data: this.expenseData(input) });
    const dataset = await this.getDataset();
    return dataset.expenses.find((e) => e.id === id)!;
  }

  async deleteExpense(id: string): Promise<void> {
    const client = await getClient();
    await client.expense.delete({ where: { id } });
  }

  private fuelData(input: FuelEntryInput) {
    return {
      date: toDate(input.date),
      gallons: input.gallons,
      pricePerGallon: input.pricePerGallon,
      totalCost: roundMoney(input.totalCost),
      odometer: input.odometer ?? null,
      location: input.location?.trim() || null,
      loadId: input.loadId || null,
      notes: input.notes?.trim() || null,
    };
  }

  async createFuelEntry(input: FuelEntryInput): Promise<FuelEntry> {
    const client = await getClient();
    const business = await this.business(client);
    const truckId = business.trucks[0].id;
    const data = this.fuelData(input);

    const row = await client.$transaction(async (tx) => {
      const created = await tx.fuelEntry.create({
        data: { ...data, businessId: business.id, truckId },
      });
      // Mirror the purchase into the expense ledger so operating expenses
      // stay complete without the user entering fuel twice. The id is
      // derived from the entry so update and delete can find it again --
      // matching the JSON store exactly.
      await tx.expense.create({
        data: {
          id: fuelExpenseId(created.id),
          businessId: business.id,
          truckId,
          loadId: data.loadId,
          date: data.date,
          category: "FUEL",
          description: fuelDescription(input.gallons, input.pricePerGallon),
          vendor: data.location,
          amount: data.totalCost,
          recurring: false,
        },
      });
      if (data.odometer) {
        await tx.truck.updateMany({
          where: { id: truckId, currentOdometer: { lt: data.odometer } },
          data: { currentOdometer: data.odometer },
        });
      }
      return created;
    });

    const dataset = await this.getDataset();
    return dataset.fuelEntries.find((f) => f.id === row.id)!;
  }

  async updateFuelEntry(id: string, input: FuelEntryInput): Promise<FuelEntry> {
    const client = await getClient();
    const business = await this.business(client);
    const data = this.fuelData(input);

    await client.$transaction(async (tx) => {
      await tx.fuelEntry.update({ where: { id }, data });
      // Keep the ledger row in step, or the Fuel page and the Expenses page
      // permanently disagree about the same money.
      const mirror = {
        loadId: data.loadId,
        date: data.date,
        description: fuelDescription(input.gallons, input.pricePerGallon),
        vendor: data.location,
        amount: data.totalCost,
      };
      await tx.expense.upsert({
        where: { id: fuelExpenseId(id) },
        update: mirror,
        create: {
          ...mirror,
          id: fuelExpenseId(id),
          businessId: business.id,
          truckId: business.trucks[0].id,
          category: "FUEL",
          recurring: false,
        },
      });
    });

    const dataset = await this.getDataset();
    return dataset.fuelEntries.find((f) => f.id === id)!;
  }

  async deleteFuelEntry(id: string): Promise<void> {
    const client = await getClient();
    await client.$transaction(async (tx) => {
      await tx.fuelEntry.delete({ where: { id } });
      // Without this the spend stays in operating expenses forever with no
      // fill-up left to trace it back to.
      await tx.expense.deleteMany({ where: { id: fuelExpenseId(id) } });
    });
  }

  /* ---- Maintenance --------------------------------------------------- */

  private maintenanceData(input: MaintenanceInput) {
    return {
      type: input.type,
      basis: input.basis,
      serviceDate: toDate(input.serviceDate),
      odometer: input.odometer ?? null,
      cost: roundMoney(input.cost),
      vendor: input.vendor?.trim() || null,
      nextServiceDate:
        input.basis !== "MILEAGE" && input.nextServiceDate ? toDate(input.nextServiceDate) : null,
      nextServiceOdometer: input.basis !== "DATE" ? (input.nextServiceOdometer ?? null) : null,
      notes: input.notes?.trim() || null,
    };
  }

  async createMaintenance(input: MaintenanceInput): Promise<MaintenanceRecord> {
    const client = await getClient();
    const business = await this.business(client);
    const truckId = business.trucks[0].id;
    const data = this.maintenanceData(input);

    const row = await client.$transaction(async (tx) => {
      let expenseId: string | null = null;

      if (input.recordAsExpense && input.cost > 0) {
        const expense = await tx.expense.create({
          data: {
            businessId: business.id,
            truckId,
            date: data.serviceDate,
            category: maintenanceExpenseCategory(input.type),
            description: `${prettyMaintenance(input.type)}${data.vendor ? ` - ${data.vendor}` : ""}`,
            vendor: data.vendor,
            amount: data.cost,
            recurring: false,
            notes: "Logged from the maintenance service record.",
          },
        });
        expenseId = expense.id;
      }

      if (data.odometer) {
        await tx.truck.updateMany({
          where: { id: truckId, currentOdometer: { lt: data.odometer } },
          data: { currentOdometer: data.odometer },
        });
      }

      return tx.maintenanceRecord.create({
        data: { ...data, businessId: business.id, truckId, expenseId },
      });
    });

    return (await this.getDataset()).maintenanceRecords.find((m) => m.id === row.id)!;
  }

  async updateMaintenance(id: string, input: MaintenanceInput): Promise<MaintenanceRecord> {
    const client = await getClient();
    const business = await this.business(client);
    const data = this.maintenanceData(input);

    await client.$transaction(async (tx) => {
      const existing = await tx.maintenanceRecord.findUniqueOrThrow({ where: { id } });
      let expenseId = existing.expenseId;

      if (input.recordAsExpense && input.cost > 0) {
        const payload = {
          date: data.serviceDate,
          category: maintenanceExpenseCategory(input.type),
          description: `${prettyMaintenance(input.type)}${data.vendor ? ` - ${data.vendor}` : ""}`,
          vendor: data.vendor,
          amount: data.cost,
        };
        if (expenseId) {
          await tx.expense.update({ where: { id: expenseId }, data: payload });
        } else {
          const created = await tx.expense.create({
            data: {
              ...payload,
              businessId: business.id,
              truckId: existing.truckId,
              recurring: false,
              notes: "Logged from the maintenance service record.",
            },
          });
          expenseId = created.id;
        }
      } else if (expenseId) {
        await tx.expense.delete({ where: { id: expenseId } });
        expenseId = null;
      }

      await tx.maintenanceRecord.update({ where: { id }, data: { ...data, expenseId } });
    });

    return (await this.getDataset()).maintenanceRecords.find((m) => m.id === id)!;
  }

  async deleteMaintenance(id: string): Promise<void> {
    const client = await getClient();
    // One transaction: a half-applied delete would leave an orphaned ledger
    // row that is invisible in the UI but still counted in every total.
    await client.$transaction(async (tx) => {
      const existing = await tx.maintenanceRecord.findUnique({ where: { id } });
      await tx.maintenanceRecord.delete({ where: { id } });
      if (existing?.expenseId) {
        await tx.expense.deleteMany({ where: { id: existing.expenseId } });
      }
    });
  }

  /* ---- Documents ----------------------------------------------------- */

  async createDocument(input: DocumentInput): Promise<Document> {
    const client = await getClient();
    const business = await this.business(client);
    const row = await client.document.create({
      data: {
        businessId: business.id,
        loadId: input.loadId ?? null,
        expenseId: input.expenseId ?? null,
        truckId: input.truckId ?? null,
        maintenanceId: input.maintenanceId ?? null,
        type: input.type,
        label: input.label.trim() || input.fileName,
        fileName: input.fileName,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
        storageKey: input.storageKey,
      },
    });
    return (await this.getDataset()).documents.find((d) => d.id === row.id)!;
  }

  async deleteDocument(id: string): Promise<string | null> {
    const client = await getClient();
    const existing = await client.document.findUnique({ where: { id } });
    if (!existing) return null;
    await client.document.delete({ where: { id } });
    return existing.storageKey;
  }

  async updateSettings(input: SettingsInput): Promise<FinancialSettings> {
    const client = await getClient();
    const business = await this.business(client);
    await client.financialSettings.upsert({
      where: { businessId: business.id },
      create: {
        businessId: business.id,
        taxReservePct: input.taxReservePct,
        maintenanceReservePct: input.maintenanceReservePct,
        categoryBehavior: input.categoryBehavior ?? defaultCategoryBehavior(),
        ratingGreatPerMile: input.ratingGreatPerMile,
        ratingGoodPerMile: input.ratingGoodPerMile,
        ratingMarginalPerMile: input.ratingMarginalPerMile,
        deadheadWarnPct: input.deadheadWarnPct,
        maintenanceWarnMiles: Math.round(input.maintenanceWarnMiles),
        maintenanceWarnDays: Math.round(input.maintenanceWarnDays),
      },
      update: {
        taxReservePct: input.taxReservePct,
        maintenanceReservePct: input.maintenanceReservePct,
        ...(input.categoryBehavior ? { categoryBehavior: input.categoryBehavior } : {}),
        ratingGreatPerMile: input.ratingGreatPerMile,
        ratingGoodPerMile: input.ratingGoodPerMile,
        ratingMarginalPerMile: input.ratingMarginalPerMile,
        deadheadWarnPct: input.deadheadWarnPct,
        maintenanceWarnMiles: Math.round(input.maintenanceWarnMiles),
        maintenanceWarnDays: Math.round(input.maintenanceWarnDays),
      },
    });
    return (await this.getDataset()).settings;
  }

  async updateBusiness(input: BusinessInput): Promise<Business> {
    const client = await getClient();
    const business = await this.business(client);
    await client.business.update({
      where: { id: business.id },
      data: { name: input.name, currency: input.currency },
    });
    return (await this.getDataset()).business;
  }

  async updateTruck(input: TruckInput): Promise<Truck> {
    const client = await getClient();
    const business = await this.business(client);
    await client.truck.update({
      where: { id: business.trucks[0].id },
      data: {
        name: input.name,
        year: input.year ?? null,
        make: input.make ?? null,
        model: input.model ?? null,
        vin: input.vin ?? null,
        purchasePrice: input.purchasePrice ?? null,
        monthlyPayment: input.monthlyPayment ?? null,
        monthlyInsurance: input.monthlyInsurance ?? null,
        startingOdometer: input.startingOdometer,
        currentOdometer: input.currentOdometer,
      },
    });
    return (await this.getDataset()).truck;
  }
}
