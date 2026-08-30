import "server-only";

import { roundMoney } from "../calculations";
import type {
  Business,
  User,
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
  FinancialGoal,
  ReserveAccount,
  ReserveTransaction,
  PlanId,
  Settlement,
  SettlementHalf,
  SettlementSnapshot,
  Subscription,
  Truck,
} from "../types";
import { defaultCategoryBehavior } from "../categories";
import { defaultGoals, defaultReserveAccounts, defaultSubscription } from "../defaults";
import { DEMO_EMAIL } from "../auth/constants";
import type {
  AuthStore,
  BusinessInput,
  DocumentInput,
  ExpenseInput,
  FuelEntryInput,
  LoadInput,
  MaintenanceInput,
  Repository,
  GoalInput,
  ReserveAccountInput,
  ReserveTransactionInput,
  SettingsInput,
  SettlementCloseInput,
  SubscriptionInput,
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

/**
 * Materialises the two built-in buckets the first time one is needed, so an
 * existing database gains them without a data migration script.
 */
async function ensureReserveAccounts(
  client: PrismaClientType,
  businessId: string,
): Promise<void> {
  const count = await client.reserveAccount.count({ where: { businessId } });
  if (count > 0) return;
  for (const account of defaultReserveAccounts(businessId)) {
    await client.reserveAccount.create({
      data: {
        businessId,
        kind: account.kind,
        name: account.name,
        basis: account.basis,
        contributionPct: account.contributionPct,
        targetBalance: account.targetBalance,
        active: account.active,
        sortOrder: account.sortOrder,
      },
    });
  }
}

function requireTruck(dataset: Dataset, id: string): Truck {
  const truck = dataset.trucks.find((t) => t.id === id);
  if (!truck) throw new Error(`Truck ${id} not found`);
  return truck;
}

function requireSettlement(dataset: Dataset, id: string): Settlement {
  const settlement = dataset.settlements.find((s) => s.id === id);
  if (!settlement) throw new Error(`Settlement ${id} not found`);
  return settlement;
}

/** Account lookups, unscoped by definition. */
export class PrismaAuthStore implements AuthStore {
  async countUsers(): Promise<number> {
    const client = await getClient();
    return client.user.count();
  }

  async findUserByEmail(email: string): Promise<User | null> {
    const client = await getClient();
    const row = await client.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!row || !row.businessId || !row.passwordHash) return null;
    return {
      id: row.id,
      businessId: row.businessId,
      email: row.email,
      name: row.name,
      passwordHash: row.passwordHash,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async ensureDemoUser(): Promise<User> {
    const client = await getClient();
    const existing = await client.user.findUnique({ where: { email: DEMO_EMAIL } });
    if (existing?.businessId) {
      return {
        id: existing.id,
        businessId: existing.businessId,
        email: existing.email,
        name: existing.name,
        passwordHash: existing.passwordHash,
        createdAt: existing.createdAt.toISOString(),
      };
    }

    // The seeded business is the oldest ledger with real loads. New accounts
    // start empty, so they cannot be mistaken for the demo even after years.
    const business =
      (await client.business.findFirst({
        where: { loads: { some: {} } },
        orderBy: { createdAt: "asc" },
      })) ?? (await client.business.findFirst({ orderBy: { createdAt: "asc" } }));

    if (!business) throw new Error("The demo dataset has not been seeded yet.");

    const row = await client.user.upsert({
      where: { email: DEMO_EMAIL },
      update: {
        name: "OnRoad Books Demo",
        businessId: business.id,
        passwordHash: "demo$disabled",
      },
      create: {
        email: DEMO_EMAIL,
        name: "OnRoad Books Demo",
        // This is intentionally not a valid scrypt hash, so password login
        // can never authenticate the public account.
        passwordHash: "demo$disabled",
        businessId: business.id,
      },
    });

    return {
      id: row.id,
      businessId: business.id,
      email: row.email,
      name: row.name,
      passwordHash: row.passwordHash,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async createOwner(input: {
    email: string;
    name?: string | null;
    passwordHash: string;
    businessName?: string;
    plan?: PlanId;
  }): Promise<User> {
    const client = await getClient();
    const email = input.email.trim().toLowerCase();

    return client.$transaction(async (tx) => {
      if (await tx.user.findUnique({ where: { email } })) {
        throw new Error("That email already has an account.");
      }

      const business = await tx.business.create({
        data: {
          name: input.businessName?.trim() || "My Trucking Business",
          currency: "USD",
          settings: { create: { categoryBehavior: defaultCategoryBehavior() } },
          trucks: { create: { name: "Truck 1" } },
          subscription: { create: { plan: input.plan ?? "INDIVIDUAL" } },
        },
      });

      const row = await tx.user.create({
        data: {
          email,
          name: input.name?.trim() || null,
          passwordHash: input.passwordHash,
          businessId: business.id,
        },
      });

      return {
        id: row.id,
        businessId: business.id,
        email: row.email,
        name: row.name,
        passwordHash: input.passwordHash,
        createdAt: row.createdAt.toISOString(),
      };
    });
  }
}

/**
 * Which unit a row belongs to.
 *
 * The id is checked against this business's own trucks before it is used, so
 * a forged id cannot file a load under someone else's unit, and it falls back
 * to the primary truck -- what a single-truck business means by "the truck".
 * The JSON store resolves it exactly the same way; the two must never
 * disagree about where a row landed.
 */
function truckIdFor(
  business: { trucks: { id: string }[] },
  requested: string | null | undefined,
): string {
  const wanted = requested?.trim();
  if (wanted && business.trucks.some((t) => t.id === wanted)) return wanted;
  return business.trucks[0].id;
}

export class PrismaRepository implements Repository {
  /** Bound to one business; every query filters on it. */
  constructor(private readonly businessId: string) {}

  private async business(client: PrismaClientType) {
    // Prefer an active truck but fall back to any truck: deactivating the
    // only truck must not take the whole app down.
    const existing = await client.business.findUnique({
      where: { id: this.businessId },
      include: {
        settings: true,
        trucks: { orderBy: [{ active: "desc" }, { name: "asc" }, { id: "asc" }] },
      },
    });
    if (existing && existing.trucks.length > 0) return existing;
    if (existing) {
      const truck = await client.truck.create({
        data: { businessId: existing.id, name: "Truck 1" },
      });
      return { ...existing, trucks: [truck] };
    }

    // The session names a business that does not exist. That is not a state
    // to recover from silently -- it means a stale or forged cookie.
    throw new Error("This session does not have access to that business.");
  }

  async getDataset(): Promise<Dataset> {
    const client = await getClient();
    const business = await this.business(client);

    const [
      loadRows,
      expenseRows,
      fuelRows,
      documentRows,
      maintenanceRows,
      goalRow,
      subscriptionRow,
      storedReserveAccountRows,
      reserveTransactionRows,
      settlementRows,
    ] = await Promise.all([
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
      client.financialGoal.findUnique({ where: { businessId: business.id } }),
      client.subscription.findUnique({ where: { businessId: business.id } }),
      client.reserveAccount.findMany({
        where: { businessId: business.id },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      }),
      client.reserveTransaction.findMany({
        where: { businessId: business.id },
        orderBy: [{ date: "desc" }, { id: "desc" }],
      }),
      client.settlement.findMany({
        where: { businessId: business.id },
        orderBy: [{ periodStart: "desc" }, { id: "desc" }],
      }),
    ]);

    // The two built-in buckets are created on first read rather than in a
    // migration, so an existing database gains them without a data script.
    // They are WRITTEN, not synthesised: a bucket the caller can see but the
    // database has never heard of cannot be referenced by a reserve
    // transaction, and closing a settlement against one fails on the foreign
    // key -- taking the whole close down with it.
    let reserveAccountRows = storedReserveAccountRows;
    if (reserveAccountRows.length === 0) {
      await ensureReserveAccounts(client, business.id);
      reserveAccountRows = await client.reserveAccount.findMany({
        where: { businessId: business.id },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      });
    }

    const reserveAccounts: ReserveAccount[] = reserveAccountRows.map((row) => ({
      id: row.id,
      businessId: row.businessId,
      kind: row.kind,
      name: row.name,
      basis: row.basis,
      contributionPct: numOrNull(row.contributionPct),
      targetBalance: numOrNull(row.targetBalance),
      active: row.active,
      sortOrder: row.sortOrder,
      createdAt: row.createdAt.toISOString(),
    }));

    const subscription: Subscription = subscriptionRow
      ? {
          id: subscriptionRow.id,
          businessId: subscriptionRow.businessId,
          plan: subscriptionRow.plan,
          status: subscriptionRow.status,
          currentPeriodEnd: subscriptionRow.currentPeriodEnd
            ? isoDate(subscriptionRow.currentPeriodEnd)
            : null,
          providerCustomerId: subscriptionRow.providerCustomerId,
          providerSubscriptionId: subscriptionRow.providerSubscriptionId,
          startedAt: subscriptionRow.startedAt.toISOString(),
          updatedAt: subscriptionRow.updatedAt.toISOString(),
        }
      : defaultSubscription(business.id);

    const goals: FinancialGoal = goalRow
      ? {
          id: goalRow.id,
          businessId: goalRow.businessId,
          monthlyRevenueTarget: num(goalRow.monthlyRevenueTarget),
          monthlyProfitTarget: num(goalRow.monthlyProfitTarget),
          targetProfitPerMile: num(goalRow.targetProfitPerMile),
          maxDeadheadPct: num(goalRow.maxDeadheadPct),
          targetLoads: goalRow.targetLoads,
          workingDaysPerWeek: goalRow.workingDaysPerWeek,
          updatedAt: goalRow.updatedAt.toISOString(),
        }
      : defaultGoals(business.id);

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

    const trucks: Truck[] = business.trucks.map((row) => ({
      id: row.id,
      businessId: business.id,
      name: row.name,
      acquiredOn: row.acquiredOn ? isoDate(row.acquiredOn) : null,
      soldOn: row.soldOn ? isoDate(row.soldOn) : null,
      year: row.year,
      make: row.make,
      model: row.model,
      vin: row.vin,
      purchasePrice: numOrNull(row.purchasePrice),
      monthlyPayment: numOrNull(row.monthlyPayment),
      monthlyInsurance: numOrNull(row.monthlyInsurance),
      startingOdometer: row.startingOdometer,
      currentOdometer: row.currentOdometer,
      active: row.active,
      createdAt: row.createdAt.toISOString(),
    }));

    return {
      users: [],
      business: {
        id: business.id,
        name: business.name,
        currency: business.currency,
        createdAt: business.createdAt.toISOString(),
      } satisfies Business,
      settings,
      goals,
      subscription,
      trucks,
      reserveAccounts,
      reserveTransactions: reserveTransactionRows.map(
        (row): ReserveTransaction => ({
          id: row.id,
          businessId: row.businessId,
          accountId: row.accountId,
          date: isoDate(row.date),
          type: row.type,
          amount: num(row.amount),
          description: row.description,
          settlementId: row.settlementId,
          createdAt: row.createdAt.toISOString(),
        }),
      ),
      settlements: settlementRows.map(
        (row): Settlement => ({
          id: row.id,
          businessId: row.businessId,
          month: row.month,
          half: row.half,
          periodStart: isoDate(row.periodStart),
          periodEnd: isoDate(row.periodEnd),
          status: row.status,
          closedAt: row.closedAt ? row.closedAt.toISOString() : null,
          snapshot: (row.snapshot as SettlementSnapshot | null) ?? null,
          notes: row.notes,
          createdAt: row.createdAt.toISOString(),
        }),
      ),
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
          scope: row.scope,
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
          expenseId: row.expenseId,
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
        truckId: truckIdFor(business, input.truckId),
      },
    });
    const dataset = await this.getDataset();
    return dataset.loads.find((l) => l.id === row.id)!;
  }

  async updateLoad(id: string, input: LoadInput): Promise<Load> {
    const client = await getClient();
    const business = await this.business(client);
    await client.load.update({
      where: { id },
      data: { ...this.loadData(input), truckId: truckIdFor(business, input.truckId) },
    });
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
    const scope = input.scope ?? "TRUCK";
    const row = await client.expense.create({
      data: {
        ...this.expenseData(input),
        businessId: business.id,
        scope,
        truckId: scope === "BUSINESS" ? null : truckIdFor(business, input.truckId),
      },
    });
    const dataset = await this.getDataset();
    return dataset.expenses.find((e) => e.id === row.id)!;
  }

  async updateExpense(id: string, input: ExpenseInput): Promise<Expense> {
    const client = await getClient();
    const business = await this.business(client);
    const scope = input.scope ?? "TRUCK";
    await client.expense.update({
      where: { id },
      data: {
        ...this.expenseData(input),
        scope,
        truckId: scope === "BUSINESS" ? null : truckIdFor(business, input.truckId),
      },
    });
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
    const truckId = truckIdFor(business, input.truckId);
    const data = this.fuelData(input);

    const row = await client.$transaction(async (tx) => {
      const created = await tx.fuelEntry.create({
        data: { ...data, businessId: business.id, truckId },
      });
      // Mirror the purchase into the expense ledger so operating expenses
      // stay complete without the user entering fuel twice. The id is
      // derived from the entry so update and delete can find it again --
      // matching the JSON store exactly.
      const mirror = await tx.expense.create({
        data: {
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
      await tx.fuelEntry.update({ where: { id: created.id }, data: { expenseId: mirror.id } });
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
    const truckId = truckIdFor(business, input.truckId);

    await client.$transaction(async (tx) => {
      const existing = await tx.fuelEntry.findUniqueOrThrow({ where: { id } });
      await tx.fuelEntry.update({ where: { id }, data: { ...data, truckId } });

      // Keep the ledger row in step, or the Fuel page and the Expenses page
      // permanently disagree about the same money.
      const mirror = {
        loadId: data.loadId,
        date: data.date,
        truckId,
        description: fuelDescription(input.gallons, input.pricePerGallon),
        vendor: data.location,
        amount: data.totalCost,
      };

      if (existing.expenseId) {
        await tx.expense.update({ where: { id: existing.expenseId }, data: mirror });
      } else {
        const created = await tx.expense.create({
          data: {
            ...mirror,
            businessId: business.id,
            category: "FUEL",
            recurring: false,
          },
        });
        await tx.fuelEntry.update({ where: { id }, data: { expenseId: created.id } });
      }
    });

    const dataset = await this.getDataset();
    return dataset.fuelEntries.find((f) => f.id === id)!;
  }

  async deleteFuelEntry(id: string): Promise<void> {
    const client = await getClient();
    await client.$transaction(async (tx) => {
      const existing = await tx.fuelEntry.findUnique({ where: { id } });
      await tx.fuelEntry.delete({ where: { id } });
      // Without this the spend stays in operating expenses forever with no
      // fill-up left to trace it back to.
      if (existing?.expenseId) {
        await tx.expense.deleteMany({ where: { id: existing.expenseId } });
      }
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
    const truckId = truckIdFor(business, input.truckId);
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

  async createTruck(input: TruckInput): Promise<Truck> {
    const client = await getClient();
    const business = await this.business(client);

    const name = input.name.trim();
    const clash = await client.truck.findFirst({
      where: { businessId: business.id, active: true, name },
    });
    if (clash) throw new Error(`You already have a truck called ${name}.`);

    const row = await client.truck.create({
      data: {
        businessId: business.id,
        name,
        acquiredOn: input.acquiredOn ? toDate(input.acquiredOn) : null,
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
    return requireTruck(await this.getDataset(), row.id);
  }

  async updateTruck(input: TruckInput, id?: string): Promise<Truck> {
    const client = await getClient();
    const business = await this.business(client);
    const targetId = id ?? business.trucks[0].id;

    await client.truck.update({
      where: { id: targetId },
      data: {
        name: input.name.trim(),
        ...(input.acquiredOn === undefined
          ? {}
          : { acquiredOn: input.acquiredOn ? toDate(input.acquiredOn) : null }),
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
    return requireTruck(await this.getDataset(), targetId);
  }

  /** Retires a unit. Deletes nothing -- its history stays in past reports. */
  async archiveTruck(id: string, soldOn?: string | null): Promise<Truck> {
    const client = await getClient();
    const business = await this.business(client);
    const active = await client.truck.count({ where: { businessId: business.id, active: true } });
    if (active <= 1) {
      throw new Error("This is your only active truck. Add another one before retiring it.");
    }
    await client.truck.update({
      where: { id },
      data: { active: false, soldOn: soldOn ? toDate(soldOn) : null },
    });
    return requireTruck(await this.getDataset(), id);
  }

  async restoreTruck(id: string): Promise<Truck> {
    const client = await getClient();
    await client.truck.update({ where: { id }, data: { active: true, soldOn: null } });
    return requireTruck(await this.getDataset(), id);
  }

  /* ---- Goals --------------------------------------------------------- */

  async updateSubscription(input: SubscriptionInput): Promise<Subscription> {
    const client = await getClient();
    const business = await this.business(client);
    const data = {
      plan: input.plan,
      ...(input.status ? { status: input.status } : {}),
      ...(input.currentPeriodEnd === undefined
        ? {}
        : { currentPeriodEnd: input.currentPeriodEnd ? toDate(input.currentPeriodEnd) : null }),
    };
    await client.subscription.upsert({
      where: { businessId: business.id },
      create: { businessId: business.id, ...data },
      update: data,
    });
    return (await this.getDataset()).subscription;
  }

  async updateGoals(input: GoalInput): Promise<FinancialGoal> {
    const client = await getClient();
    const business = await this.business(client);
    const data = {
      monthlyRevenueTarget: roundMoney(input.monthlyRevenueTarget),
      monthlyProfitTarget: roundMoney(input.monthlyProfitTarget),
      targetProfitPerMile: input.targetProfitPerMile,
      maxDeadheadPct: input.maxDeadheadPct,
      targetLoads: input.targetLoads ?? null,
      workingDaysPerWeek: input.workingDaysPerWeek,
    };
    await client.financialGoal.upsert({
      where: { businessId: business.id },
      create: { businessId: business.id, ...data },
      update: data,
    });
    return (await this.getDataset()).goals;
  }

  /* ---- Reserve buckets ------------------------------------------------ */

  async createReserveAccount(input: ReserveAccountInput): Promise<ReserveAccount> {
    const client = await getClient();
    const business = await this.business(client);
    await ensureReserveAccounts(client, business.id);
    const count = await client.reserveAccount.count({ where: { businessId: business.id } });
    const row = await client.reserveAccount.create({
      data: {
        businessId: business.id,
        kind: input.kind,
        name: input.name.trim(),
        basis: input.basis,
        contributionPct: input.contributionPct ?? null,
        targetBalance: input.targetBalance ?? null,
        active: input.active ?? true,
        sortOrder: count,
      },
    });
    const created = (await this.getDataset()).reserveAccounts.find((a) => a.id === row.id);
    if (!created) throw new Error("Reserve bucket could not be read back after creation.");
    return created;
  }

  async updateReserveAccount(id: string, input: ReserveAccountInput): Promise<ReserveAccount> {
    const client = await getClient();
    const business = await this.business(client);
    const existing = await client.reserveAccount.findFirst({
      where: { id, businessId: business.id },
    });
    if (!existing) throw new Error(`Reserve account ${id} not found`);

    await client.reserveAccount.update({
      where: { id },
      data: {
        name: input.name.trim(),
        basis: input.basis,
        contributionPct:
          existing.kind === "TAX" || existing.kind === "MAINTENANCE"
            ? null
            : (input.contributionPct ?? null),
        targetBalance: input.targetBalance ?? null,
        active: input.active ?? existing.active,
      },
    });
    const updated = (await this.getDataset()).reserveAccounts.find((a) => a.id === id);
    if (!updated) throw new Error(`Reserve account ${id} not found`);
    return updated;
  }

  async deleteReserveAccount(id: string): Promise<void> {
    const client = await getClient();
    const business = await this.business(client);
    const existing = await client.reserveAccount.findFirst({
      where: { id, businessId: business.id },
    });
    if (!existing) return;
    if (existing.kind === "TAX" || existing.kind === "MAINTENANCE") {
      throw new Error("The tax and maintenance buckets cannot be deleted.");
    }
    await client.reserveAccount.delete({ where: { id } });
  }

  async createReserveTransaction(input: ReserveTransactionInput): Promise<ReserveTransaction> {
    const client = await getClient();
    const business = await this.business(client);
    const account = await client.reserveAccount.findFirst({
      where: { id: input.accountId, businessId: business.id },
    });
    if (!account) throw new Error("That reserve bucket no longer exists.");

    const magnitude = Math.abs(roundMoney(input.amount));
    const signed =
      input.type === "WITHDRAWAL"
        ? -magnitude
        : input.type === "ADJUSTMENT" && input.negative
          ? -magnitude
          : magnitude;

    const row = await client.reserveTransaction.create({
      data: {
        businessId: business.id,
        accountId: input.accountId,
        date: toDate(input.date),
        type: input.type,
        amount: signed,
        description: input.description.trim(),
      },
    });

    return {
      id: row.id,
      businessId: row.businessId,
      accountId: row.accountId,
      date: isoDate(row.date),
      type: row.type,
      amount: num(row.amount),
      description: row.description,
      settlementId: row.settlementId,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async deleteReserveTransaction(id: string): Promise<void> {
    const client = await getClient();
    const business = await this.business(client);
    const row = await client.reserveTransaction.findFirst({
      where: { id, businessId: business.id },
    });
    if (!row) return;
    if (row.settlementId) {
      throw new Error(
        "That contribution was posted by a closed settlement. Reopen the settlement to remove it.",
      );
    }
    await client.reserveTransaction.delete({ where: { id } });
  }

  /* ---- Settlements ---------------------------------------------------- */

  async ensureSettlement(month: string, half: SettlementHalf): Promise<Settlement> {
    const client = await getClient();
    const business = await this.business(client);
    const [year, monthPart] = month.split("-").map((part) => Number.parseInt(part, 10));
    const lastDay = new Date(Date.UTC(year, monthPart, 0)).getUTCDate();
    const periodStart = half === "FIRST" ? `${month}-01` : `${month}-16`;
    const periodEnd =
      half === "FIRST" ? `${month}-15` : `${month}-${String(lastDay).padStart(2, "0")}`;

    const row = await client.settlement.upsert({
      where: { businessId_month_half: { businessId: business.id, month, half } },
      create: {
        businessId: business.id,
        month,
        half,
        periodStart: toDate(periodStart),
        periodEnd: toDate(periodEnd),
        status: "OPEN",
      },
      update: {},
    });
    return requireSettlement(await this.getDataset(), row.id);
  }

  async closeSettlement(id: string, input: SettlementCloseInput): Promise<Settlement> {
    const client = await getClient();
    const business = await this.business(client);
    const existing = await client.settlement.findFirst({ where: { id, businessId: business.id } });
    if (!existing) throw new Error(`Settlement ${id} not found`);
    if (existing.status === "CLOSED") throw new Error("That settlement is already closed.");

    await client.$transaction(async (tx) => {
      await tx.settlement.update({
        where: { id },
        data: {
          status: "CLOSED",
          closedAt: new Date(),
          // Frozen on purpose: a closed settlement is a statement of what the
          // owner settled on, not a live query.
          snapshot: input.snapshot as unknown as object,
          notes: input.notes?.trim() || existing.notes,
        },
      });
      // Same guard the JSON store applies: a contribution naming a bucket that
      // is no longer there is skipped, never allowed to fail the close.
      const accountIds = new Set(
        (
          await tx.reserveAccount.findMany({
            where: { businessId: business.id },
            select: { id: true },
          })
        ).map((row) => row.id),
      );

      for (const contribution of input.contributions) {
        const amount = roundMoney(contribution.amount);
        if (amount <= 0) continue;
        if (!accountIds.has(contribution.accountId)) continue;
        await tx.reserveTransaction.create({
          data: {
            businessId: business.id,
            accountId: contribution.accountId,
            date: existing.periodEnd,
            type: "CONTRIBUTION",
            amount,
            description: contribution.description,
            settlementId: id,
          },
        });
      }
    });

    return requireSettlement(await this.getDataset(), id);
  }

  async reopenSettlement(id: string): Promise<Settlement> {
    const client = await getClient();
    const business = await this.business(client);
    const existing = await client.settlement.findFirst({ where: { id, businessId: business.id } });
    if (!existing) throw new Error(`Settlement ${id} not found`);

    // Clearing a nullable Json column needs Prisma's DbNull sentinel, and the
    // client is only ever imported lazily on this path.
    const { Prisma } = await import("@/generated/prisma");

    await client.$transaction(async (tx) => {
      await tx.reserveTransaction.deleteMany({ where: { settlementId: id } });
      await tx.settlement.update({
        where: { id },
        data: { status: "OPEN", closedAt: null, snapshot: Prisma.DbNull },
      });
    });

    return requireSettlement(await this.getDataset(), id);
  }

  async updateSettlementNotes(id: string, notes: string | null): Promise<Settlement> {
    const client = await getClient();
    const business = await this.business(client);
    const existing = await client.settlement.findFirst({ where: { id, businessId: business.id } });
    if (!existing) throw new Error(`Settlement ${id} not found`);
    await client.settlement.update({ where: { id }, data: { notes: notes?.trim() || null } });
    return requireSettlement(await this.getDataset(), id);
  }
}
