import "server-only";

import type { Prisma } from "@/generated/prisma";

import { roundMoney } from "../calculations";
import {
  allocateDriverSettlementNetPay,
  calculateDriverPay,
} from "../driver-pay";
import type {
  Business,
  User,
  Dataset,
  Driver,
  DriverSettlement,
  Document,
  DocumentType,
  Expense,
  ExpenseCategoryId,
  EquipmentType,
  FinancialSettings,
  FinancialObligation,
  FuelEntry,
  Load,
  PaymentEvent,
  LoadCapacity,
  MaintenanceBasis,
  MaintenanceRecord,
  MaintenanceType,
  MemberRole,
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
import { financialTreatmentForCategory } from "../finance/terminology";
import { requireExactDebtPaymentSplit } from "../finance/debt-payment";
import { defaultGoals, defaultReserveAccounts, defaultSubscription } from "../defaults";
import { DEFAULT_PLAN, getPlan, isComplimentaryAccess, trialEndsOn } from "../plans";
import {
  LOAD_EXPENSE_KEYS,
  loadExpenseDescription,
  loadExpenseField,
  loadExpenseId,
  loadExpenseKey,
  loadExpenseSpecs,
  reconcileLoadExpenseLedger,
} from "../load-expenses";
import { resolveTruckId } from "../fleet";
import { normalizeJurisdictionMiles } from "../ifta";
import type {
  AdminAccountSummary,
  AuthStore,
  BusinessInput,
  DocumentInput,
  DriverInput,
  DriverSettlementInput,
  DriverSettlementAdjustmentInput,
  DebtPaymentClassificationInput,
  ExpenseInput,
  FinancialObligationInput,
  FuelEntryInput,
  LoadInput,
  PaymentEventInput,
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
import { newId } from "./repository";

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

function domainUser(row: {
  id: string;
  businessId: string | null;
  email: string;
  name: string | null;
  passwordHash: string;
  role: MemberRole;
  invitedAt: Date | null;
  joinedAt: Date | null;
  createdAt: Date;
}): User | null {
  if (!row.businessId || !row.passwordHash) return null;
  return {
    id: row.id,
    businessId: row.businessId,
    email: row.email,
    name: row.name,
    passwordHash: row.passwordHash,
    role: row.role,
    invitedAt: row.invitedAt?.toISOString() ?? null,
    joinedAt: row.joinedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClientType };
let prismaClient = globalForPrisma.prisma;

async function getClient(): Promise<PrismaClientType> {
  if (prismaClient) return prismaClient;
  const { PrismaClient } = await import("@/generated/prisma");
  const client = new PrismaClient();
  prismaClient = client;
  if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = client;
  return client;
}

/** Lightweight readiness probe used by the public health endpoint. */
export async function checkPostgresConnection(): Promise<void> {
  const client = await getClient();
  await client.$queryRawUnsafe("select 1");
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

interface LoadLedgerSource {
  id: string;
  truckId: string;
  date: Date;
  loadNumber: string | null;
  originState: string;
  destinationState: string;
  fuelCost: DecimalLike;
  tolls: DecimalLike;
  dispatchFee: DecimalLike;
  factoringFee: DecimalLike;
  otherExpenses: DecimalLike;
  costsPosted: boolean;
}

/** Keep generated load-cost ledger rows complete, current, and idempotent. */
async function syncPrismaLoadExpenses(
  tx: Prisma.TransactionClient,
  businessId: string,
  load: LoadLedgerSource,
): Promise<void> {
  const detailedFuel = await tx.fuelEntry.count({ where: { loadId: load.id, businessId } });
  const specs = loadExpenseSpecs({
    fuelCost: num(load.fuelCost),
    tolls: num(load.tolls),
    dispatchFee: num(load.dispatchFee),
    factoringFee: num(load.factoringFee),
    otherExpenses: num(load.otherExpenses),
  });

  for (const spec of specs) {
    const id = loadExpenseId(load.id, spec.key);
    const shouldPost = spec.amount > 0 && !(spec.key === "fuel" && detailedFuel > 0);

    if (!shouldPost) {
      await tx.expense.deleteMany({ where: { id, businessId } });
      continue;
    }

    const values = {
      businessId,
      truckId: load.truckId,
      scope: "TRUCK" as const,
      loadId: load.id,
      date: load.date,
      category: spec.category,
      description: loadExpenseDescription(load, spec.label),
      vendor: null,
      amount: spec.amount,
      recurring: false,
      receiptNumber: null,
      notes: "Posted automatically from the load. Edit the load to change this amount.",
    };
    await tx.expense.upsert({ where: { id }, create: { id, ...values }, update: values });
  }
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

/** A submitted relationship may only point at a row in this workspace. */
async function ownedLoadId(
  client: PrismaClientType,
  businessId: string,
  requested: string | null | undefined,
  truckId: string | null,
  scope: "TRUCK" | "BUSINESS" = "TRUCK",
): Promise<string | null> {
  const id = requested?.trim();
  if (!id) return null;
  const load = await client.load.findFirst({ where: { id, businessId }, select: { truckId: true } });
  if (!load) throw new Error("That load does not belong to this workspace.");
  if (scope === "BUSINESS") throw new Error("Business overhead cannot be linked to a load.");
  if (!truckId || load.truckId !== truckId) {
    throw new Error("The linked load belongs to another truck.");
  }
  return id;
}

async function ownedDriverId(
  client: PrismaClientType | Prisma.TransactionClient,
  businessId: string,
  requested: string | null | undefined,
): Promise<string | null> {
  const id = requested?.trim();
  if (!id) return null;
  const count = await client.driver.count({ where: { id, businessId } });
  if (count !== 1) throw new Error("That driver does not belong to this workspace.");
  return id;
}

async function assertDocumentTargets(
  client: PrismaClientType,
  business: { id: string; trucks: { id: string }[] },
  input: DocumentInput,
): Promise<void> {
  const targets = [input.loadId, input.expenseId, input.truckId, input.maintenanceId]
    .filter((id): id is string => Boolean(id?.trim()));
  if (targets.length !== 1) {
    throw new Error("A document must belong to exactly one record.");
  }
  const checks = await Promise.all([
    input.loadId
      ? client.load.count({ where: { id: input.loadId, businessId: business.id } })
      : Promise.resolve(1),
    input.expenseId
      ? client.expense.count({ where: { id: input.expenseId, businessId: business.id } })
      : Promise.resolve(1),
    input.maintenanceId
      ? client.maintenanceRecord.count({
          where: { id: input.maintenanceId, businessId: business.id },
        })
      : Promise.resolve(1),
  ]);
  const truckOwned = !input.truckId || business.trucks.some((truck) => truck.id === input.truckId);
  if (checks.some((count) => count !== 1) || !truckOwned) {
    throw new Error("That document target does not belong to this workspace.");
  }
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
  async listAccounts(): Promise<AdminAccountSummary[]> {
    const client = await getClient();
    const rows = await client.user.findMany({
      where: { businessId: { not: null }, role: "OWNER" },
      orderBy: { createdAt: "desc" },
      include: {
        business: {
          include: {
            subscription: true,
            trucks: { select: { active: true } },
            loads: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
            expenses: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
            fuelEntries: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
            documents: { orderBy: { uploadedAt: "desc" }, take: 1, select: { uploadedAt: true } },
            maintenance: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
            reserveTransactions: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
            settlements: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
            _count: {
              select: {
                trucks: true,
                loads: true,
                expenses: true,
                fuelEntries: true,
                documents: true,
                maintenance: true,
                reserveTransactions: true,
                settlements: true,
              },
            },
          },
        },
      },
    });

    return rows.flatMap((row) => {
      if (!row.business || !row.businessId) return [];
      const subscription = row.business.subscription;
      const activityDates = [
        row.business.loads[0]?.createdAt,
        row.business.expenses[0]?.createdAt,
        row.business.fuelEntries[0]?.createdAt,
        row.business.documents[0]?.uploadedAt,
        row.business.maintenance[0]?.createdAt,
        row.business.reserveTransactions[0]?.createdAt,
        row.business.settlements[0]?.createdAt,
      ].filter((value): value is Date => Boolean(value));
      const lastActivityAt = activityDates.length > 0
        ? new Date(Math.max(...activityDates.map((value) => value.getTime()))).toISOString()
        : null;
      const subscriptionStatus = subscription?.status ?? "TRIALING";
      const hasProviderSubscription = Boolean(
        subscription?.providerSubscriptionId && subscriptionStatus !== "CANCELED",
      );
      return [{
        userId: row.id,
        businessId: row.businessId,
        email: row.email,
        name: row.name,
        businessName: row.business.name,
        createdAt: row.createdAt.toISOString(),
        plan: getPlan(subscription?.plan).id,
        subscriptionStatus,
        currentPeriodEnd: subscription?.currentPeriodEnd
          ? isoDate(subscription.currentPeriodEnd)
          : subscription?.status === "TRIALING"
            ? trialEndsOn(subscription.startedAt.toISOString())
            : null,
        hasProviderSubscription,
        accessSource: hasProviderSubscription
          ? "stripe"
          : subscriptionStatus === "TRIALING"
            ? "trial"
            : isComplimentaryAccess({
                status: subscriptionStatus,
                providerSubscriptionId: subscription?.providerSubscriptionId ?? null,
                currentPeriodEnd: subscription?.currentPeriodEnd
                  ? isoDate(subscription.currentPeriodEnd)
                  : null,
              })
              ? "complimentary"
              : "inactive",
        lastActivityAt,
        counts: {
          trucks: row.business._count.trucks,
          activeTrucks: row.business.trucks.filter((truck) => truck.active).length,
          loads: row.business._count.loads,
          expenses: row.business._count.expenses,
          fuelEntries: row.business._count.fuelEntries,
          documents: row.business._count.documents,
          maintenance: row.business._count.maintenance,
          reserveTransactions: row.business._count.reserveTransactions,
          settlements: row.business._count.settlements,
        },
      }];
    });
  }

  async countUsers(): Promise<number> {
    const client = await getClient();
    return client.user.count();
  }

  async findUserByEmail(email: string): Promise<User | null> {
    const client = await getClient();
    const row = await client.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    return row ? domainUser(row) : null;
  }

  async findUserById(id: string): Promise<User | null> {
    const client = await getClient();
    const row = await client.user.findUnique({ where: { id } });
    return row ? domainUser(row) : null;
  }

  async listMembers(businessId: string): Promise<User[]> {
    const client = await getClient();
    const rows = await client.user.findMany({
      where: { businessId },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    });
    return rows.flatMap((row) => {
      const user = domainUser(row);
      return user ? [user] : [];
    });
  }

  async createMember(input: {
    businessId: string;
    email: string;
    name?: string | null;
    role: Exclude<MemberRole, "OWNER">;
  }): Promise<User> {
    const client = await getClient();
    const email = input.email.trim().toLowerCase();
    const business = await client.business.findUnique({ where: { id: input.businessId }, select: { id: true } });
    if (!business) throw new Error("This workspace no longer exists.");
    if (await client.user.findUnique({ where: { email } })) {
      throw new Error("That email already belongs to an OnRoad Books account.");
    }
    const now = new Date();
    const row = await client.user.create({
      data: {
        businessId: input.businessId,
        email,
        name: input.name?.trim() || null,
        passwordHash: "invite$supabase",
        role: input.role,
        invitedAt: now,
        joinedAt: null,
      },
    });
    const user = domainUser(row);
    if (!user) throw new Error("The member could not be created.");
    return user;
  }

  async updateMemberRole(
    userId: string,
    businessId: string,
    role: Exclude<MemberRole, "OWNER">,
  ): Promise<User> {
    const client = await getClient();
    const existing = await client.user.findFirst({ where: { id: userId, businessId } });
    if (!existing) throw new Error("That team member was not found.");
    if (existing.role === "OWNER") throw new Error("The owner role cannot be changed here.");
    const row = await client.user.update({ where: { id: userId }, data: { role } });
    const user = domainUser(row);
    if (!user) throw new Error("The member could not be updated.");
    return user;
  }

  async markMemberJoined(userId: string, businessId: string): Promise<User> {
    const client = await getClient();
    const existing = await client.user.findFirst({ where: { id: userId, businessId } });
    if (!existing) throw new Error("That invitation no longer exists.");
    const row = existing.joinedAt
      ? existing
      : await client.user.update({ where: { id: userId }, data: { joinedAt: new Date() } });
    const user = domainUser(row);
    if (!user) throw new Error("The member could not be activated.");
    return user;
  }

  async removeMember(userId: string, businessId: string): Promise<{ email: string }> {
    const client = await getClient();
    const existing = await client.user.findFirst({ where: { id: userId, businessId } });
    if (!existing) throw new Error("That team member was not found.");
    if (existing.role === "OWNER") throw new Error("The workspace owner cannot be removed.");
    await client.user.delete({ where: { id: userId } });
    return { email: existing.email };
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
    const trialStartedAt = new Date();

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
          subscription: {
            create: {
              plan: input.plan ?? DEFAULT_PLAN,
              status: "TRIALING",
              startedAt: trialStartedAt,
              currentPeriodEnd: toDate(trialEndsOn(trialStartedAt.toISOString())),
            },
          },
        },
      });

      const row = await tx.user.create({
        data: {
          email,
          name: input.name?.trim() || null,
          passwordHash: input.passwordHash,
          businessId: business.id,
          role: "OWNER",
          joinedAt: trialStartedAt,
        },
      });

      const user = domainUser(row);
      if (!user) throw new Error("The owner account could not be created.");
      return user;
    });
  }

  async resetBusinessData(userId: string, businessId: string): Promise<string[]> {
    const client = await getClient();

    return client.$transaction(async (tx) => {
      const owner = await tx.user.findFirst({ where: { id: userId, businessId } });
      if (!owner) throw new Error("This account no longer exists.");
      if (owner.role !== "OWNER") throw new Error("Only the workspace owner can reset this account.");

      const documents = await tx.document.findMany({
        where: { businessId },
        select: { storageKey: true },
      });

      await tx.document.deleteMany({ where: { businessId } });
      await tx.fuelEntry.deleteMany({ where: { businessId } });
      await tx.maintenanceRecord.deleteMany({ where: { businessId } });
      await tx.driverSettlement.deleteMany({ where: { businessId } });
      await tx.paymentEvent.deleteMany({ where: { businessId } });
      await tx.expense.deleteMany({ where: { businessId } });
      await tx.load.deleteMany({ where: { businessId } });
      await tx.financialObligation.deleteMany({ where: { businessId } });
      await tx.driver.deleteMany({ where: { businessId } });
      await tx.truck.deleteMany({ where: { businessId } });
      await tx.reserveTransaction.deleteMany({ where: { businessId } });
      await tx.settlement.deleteMany({ where: { businessId } });
      await tx.reserveAccount.deleteMany({ where: { businessId } });
      await tx.financialGoal.deleteMany({ where: { businessId } });
      await tx.financialSettings.deleteMany({ where: { businessId } });

      await tx.truck.create({ data: { businessId, name: "Truck 1" } });
      await tx.financialSettings.create({
        data: { businessId, categoryBehavior: defaultCategoryBehavior() },
      });
      const goals = defaultGoals(businessId, new Date().toISOString());
      await tx.financialGoal.create({
        data: {
          businessId,
          monthlyRevenueTarget: goals.monthlyRevenueTarget,
          monthlyProfitTarget: goals.monthlyProfitTarget,
          targetProfitPerMile: goals.targetProfitPerMile,
          maxDeadheadPct: goals.maxDeadheadPct,
          targetLoads: goals.targetLoads,
          workingDaysPerWeek: goals.workingDaysPerWeek,
          expectedMonthlyMiles: goals.expectedMonthlyMiles ?? 0,
        },
      });
      for (const account of defaultReserveAccounts(businessId, new Date().toISOString())) {
        await tx.reserveAccount.create({
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

      return documents.map((document) => document.storageKey);
    });
  }

  async deleteAccount(
    userId: string,
    businessId: string,
  ): Promise<{ email: string; storageKeys: string[] }> {
    const client = await getClient();

    return client.$transaction(async (tx) => {
      const owner = await tx.user.findFirst({ where: { id: userId, businessId } });
      if (!owner) throw new Error("This account no longer exists.");
      if (owner.role !== "OWNER") throw new Error("Only the workspace owner can delete this account.");

      const documents = await tx.document.findMany({
        where: { businessId },
        select: { storageKey: true },
      });

      // There is one immutable owner. Deleting that owner's account means
      // deleting the workspace, not leaving members attached to ownerless books.
      await tx.user.deleteMany({ where: { businessId } });
      await tx.business.delete({ where: { id: businessId } });

      return {
        email: owner.email,
        storageKeys: documents.map((document) => document.storageKey),
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
  business: { trucks: { id: string; active: boolean }[] },
  requested: string | null | undefined,
): string {
  return resolveTruckId(business.trucks, requested);
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
      driverRows,
      driverSettlementRows,
      obligationRows,
      paymentEventRows,
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
      client.driver.findMany({
        where: { businessId: business.id },
        orderBy: [{ active: "desc" }, { name: "asc" }, { id: "asc" }],
      }),
      client.driverSettlement.findMany({
        where: { businessId: business.id },
        include: {
          lines: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
          adjustments: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
        },
        orderBy: [{ periodStart: "desc" }, { id: "desc" }],
      }),
      client.financialObligation.findMany({
        where: { businessId: business.id },
        orderBy: [{ active: "desc" }, { name: "asc" }, { id: "asc" }],
      }),
      client.paymentEvent.findMany({
        where: { businessId: business.id },
        orderBy: [{ date: "desc" }, { id: "desc" }],
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
          // Production can still contain the legacy INDIVIDUAL enum value.
          // Decode it through the catalogue so the rest of the application
          // only ever sees a current PlanId (INDIVIDUAL maps to OWNER).
          plan: getPlan(subscriptionRow.plan).id,
          status: subscriptionRow.status,
          currentPeriodEnd: subscriptionRow.currentPeriodEnd
            ? isoDate(subscriptionRow.currentPeriodEnd)
            : subscriptionRow.status === "TRIALING"
              ? trialEndsOn(subscriptionRow.startedAt.toISOString())
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
          expectedMonthlyMiles: goalRow.expectedMonthlyMiles,
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
      iftaTaxRates:
        (business.settings?.iftaTaxRates as Record<string, number> | null) ?? {},
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
      axleCount: row.axleCount,
      registeredGrossWeightLbs: row.registeredGrossWeightLbs,
      operatesInMultipleIftaJurisdictions: row.operatesInMultipleIftaJurisdictions,
      iftaReportingEnabled: row.iftaReportingEnabled,
      startingOdometer: row.startingOdometer,
      currentOdometer: row.currentOdometer,
      active: row.active,
      createdAt: row.createdAt.toISOString(),
    }));

    const dataset: Dataset = {
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
      financialObligations: obligationRows.map(
        (row): FinancialObligation => ({
          id: row.id,
          businessId: row.businessId,
          truckId: row.truckId,
          name: row.name,
          kind: row.kind,
          counterparty: row.counterparty,
          startedOn: row.startedOn ? isoDate(row.startedOn) : null,
          endedOn: row.endedOn ? isoDate(row.endedOn) : null,
          expectedMonthlyPayment: numOrNull(row.expectedMonthlyPayment),
          active: row.active,
          createdAt: row.createdAt.toISOString(),
        }),
      ),
      paymentEvents: paymentEventRows.map(
        (row): PaymentEvent => ({
          id: row.id,
          businessId: row.businessId,
          loadId: row.loadId,
          date: isoDate(row.date),
          amount: num(row.amount),
          method: row.method,
          reference: row.reference,
          notes: row.notes,
          createdAt: row.createdAt.toISOString(),
        }),
      ),
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
      drivers: driverRows.map(
        (row): Driver => ({
          id: row.id,
          businessId: row.businessId,
          name: row.name,
          reference: row.reference,
          defaultTruckId: row.defaultTruckId,
          payType: row.payType,
          payRate: num(row.payRate),
          active: row.active,
          createdAt: row.createdAt.toISOString(),
        }),
      ),
      driverSettlements: driverSettlementRows.map(
        (row): DriverSettlement => ({
          id: row.id,
          businessId: row.businessId,
          driverId: row.driverId,
          periodStart: isoDate(row.periodStart),
          periodEnd: isoDate(row.periodEnd),
          status: row.status,
          paidOn: row.paidOn ? isoDate(row.paidOn) : null,
          notes: row.notes,
          createdAt: row.createdAt.toISOString(),
          adjustments: row.adjustments.map((adjustment) => ({
            id: adjustment.id,
            settlementId: adjustment.settlementId,
            type: adjustment.type,
            amount: num(adjustment.amount),
            reason: adjustment.reason,
            createdAt: adjustment.createdAt.toISOString(),
          })),
          lines: row.lines.map((line) => ({
            id: line.id,
            settlementId: line.settlementId,
            loadId: line.loadId,
            truckId: line.truckId,
            grossRevenue: num(line.grossRevenue),
            loadedMiles: line.loadedMiles,
            totalMiles: line.totalMiles,
            payType: line.payType,
            payRate: num(line.payRate),
            payAmount: num(line.payAmount),
            expenseId: line.expenseId,
            createdAt: line.createdAt.toISOString(),
          })),
        }),
      ),
      loads: loadRows.map(
        (row): Load => ({
          id: row.id,
          businessId: row.businessId,
          truckId: row.truckId,
          driverId: row.driverId,
          date: isoDate(row.date),
          deliveryDate: row.deliveryDate ? isoDate(row.deliveryDate) : null,
          endingOdometer: row.endingOdometer,
          originCity: row.originCity,
          originState: row.originState,
          destinationCity: row.destinationCity,
          destinationState: row.destinationState,
          broker: row.broker,
          loadNumber: row.loadNumber,
          equipmentType: row.equipmentType as EquipmentType | null,
          loadCapacity: row.loadCapacity as LoadCapacity | null,
          equipmentLengthFt: row.equipmentLengthFt,
          weightLbs: row.weightLbs,
          commodity: row.commodity,
          loadedMiles: row.loadedMiles,
          deadheadMiles: row.deadheadMiles,
          grossRate: num(row.grossRate),
          fuelCost: num(row.fuelCost),
          tolls: num(row.tolls),
          dispatchFee: num(row.dispatchFee),
          factoringFee: num(row.factoringFee),
          otherExpenses: num(row.otherExpenses),
          driverPay: num(row.driverPay),
          costsPosted: row.costsPosted,
          status: row.status as PaymentStatus,
          jurisdictionMiles: normalizeJurisdictionMiles(row.jurisdictionMiles),
          invoiceNumber: row.invoiceNumber,
          invoiceDate: row.invoiceDate ? isoDate(row.invoiceDate) : null,
          invoiceDueDate: row.invoiceDueDate ? isoDate(row.invoiceDueDate) : null,
          invoicePaidDate: row.invoicePaidDate ? isoDate(row.invoicePaidDate) : null,
          billToName: row.billToName,
          billToEmail: row.billToEmail,
          billToAddress: row.billToAddress,
          invoiceNotes: row.invoiceNotes,
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
          financialTreatment:
            row.financialTreatment ?? financialTreatmentForCategory(row.category),
          obligationId: row.obligationId,
          splitGroupId: row.splitGroupId,
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
          jurisdiction: row.jurisdiction,
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
    reconcileLoadExpenseLedger(dataset);
    return dataset;
  }

  private loadData(input: LoadInput) {
    return {
      date: toDate(input.date),
      deliveryDate: input.deliveryDate ? toDate(input.deliveryDate) : null,
      endingOdometer: input.endingOdometer ?? null,
      originCity: input.originCity.trim(),
      originState: input.originState.trim().toUpperCase(),
      destinationCity: input.destinationCity.trim(),
      destinationState: input.destinationState.trim().toUpperCase(),
      broker: input.broker?.trim() || null,
      loadNumber: input.loadNumber?.trim() || null,
      equipmentType: input.equipmentType ?? null,
      loadCapacity: input.loadCapacity ?? null,
      equipmentLengthFt: input.equipmentLengthFt ?? null,
      weightLbs: input.weightLbs ?? null,
      commodity: input.commodity?.trim() || null,
      loadedMiles: Math.round(input.loadedMiles),
      deadheadMiles: Math.round(input.deadheadMiles),
      grossRate: roundMoney(input.grossRate),
      fuelCost: roundMoney(input.fuelCost),
      tolls: roundMoney(input.tolls),
      dispatchFee: roundMoney(input.dispatchFee),
      factoringFee: roundMoney(input.factoringFee),
      otherExpenses: roundMoney(input.otherExpenses),
      costsPosted: input.costsPosted ?? true,
      status: input.status,
      ...(input.jurisdictionMiles === undefined
        ? {}
        : {
            jurisdictionMiles: normalizeJurisdictionMiles(
              input.jurisdictionMiles,
            ) as unknown as Prisma.InputJsonValue,
          }),
      ...(input.invoiceNumber === undefined
        ? {}
        : { invoiceNumber: input.invoiceNumber?.trim() || null }),
      ...(input.invoiceDate === undefined
        ? {}
        : { invoiceDate: input.invoiceDate ? toDate(input.invoiceDate) : null }),
      ...(input.invoiceDueDate === undefined
        ? {}
        : { invoiceDueDate: input.invoiceDueDate ? toDate(input.invoiceDueDate) : null }),
      ...(input.invoicePaidDate === undefined
        ? {}
        : { invoicePaidDate: input.invoicePaidDate ? toDate(input.invoicePaidDate) : null }),
      ...(input.billToName === undefined
        ? {}
        : { billToName: input.billToName?.trim() || null }),
      ...(input.billToEmail === undefined
        ? {}
        : { billToEmail: input.billToEmail?.trim() || null }),
      ...(input.billToAddress === undefined
        ? {}
        : { billToAddress: input.billToAddress?.trim() || null }),
      ...(input.invoiceNotes === undefined
        ? {}
        : { invoiceNotes: input.invoiceNotes?.trim() || null }),
      notes: input.notes?.trim() || null,
    };
  }

  async createLoad(input: LoadInput): Promise<Load> {
    const client = await getClient();
    const business = await this.business(client);
    // Match by id, never by position: the list is ordered by date, so a load
    // dated in the past is not dataset.loads[0], and returning the wrong id
    // would file the caller's attachments against someone else's load.
    const truckId = truckIdFor(business, input.truckId);
    const row = await client.$transaction(async (tx) => {
      const driverId = await ownedDriverId(tx, business.id, input.driverId);
      const created = await tx.load.create({
        data: { ...this.loadData(input), businessId: business.id, truckId, driverId },
      });
      await syncPrismaLoadExpenses(tx, business.id, created);
      if (created.endingOdometer) {
        await tx.truck.updateMany({
          where: { id: truckId, businessId: business.id, currentOdometer: { lt: created.endingOdometer } },
          data: { currentOdometer: created.endingOdometer },
        });
      }
      return created;
    });
    const dataset = await this.getDataset();
    return dataset.loads.find((l) => l.id === row.id)!;
  }

  async updateLoad(id: string, input: LoadInput): Promise<Load> {
    const client = await getClient();
    const business = await this.business(client);
    const truckId = truckIdFor(business, input.truckId);
    await client.$transaction(async (tx) => {
      const driverId = await ownedDriverId(tx, business.id, input.driverId);
      const existing = await tx.load.findFirst({ where: { id, businessId: business.id } });
      if (!existing) throw new Error("That load does not belong to this workspace.");
      const payments = await tx.paymentEvent.count({ where: { loadId: id } });
      if (payments > 0) {
        throw new Error("A load with recorded customer payments cannot be deleted.");
      }
      if (existing.truckId !== truckId || existing.driverId !== driverId) {
        const frozen = await tx.driverSettlementLine.count({ where: { loadId: id } });
        if (frozen > 0) {
          throw new Error(
            "This load is already on a driver settlement. Delete the draft before changing its driver or truck.",
          );
        }
      }
      if (existing.truckId !== truckId) {
        const generatedIds = LOAD_EXPENSE_KEYS.map((key) => loadExpenseId(id, key));
        const [linkedExpenses, linkedFuel] = await Promise.all([
          tx.expense.count({
            where: {
              businessId: business.id,
              loadId: id,
              id: { notIn: generatedIds },
              OR: [{ scope: "BUSINESS" }, { truckId: { not: truckId } }],
            },
          }),
          tx.fuelEntry.count({
            where: { businessId: business.id, loadId: id, truckId: { not: truckId } },
          }),
        ]);
        if (linkedExpenses > 0 || linkedFuel > 0) {
          throw new Error(
            "This load has linked costs on another truck. Reassign or unlink them before moving the load.",
          );
        }
      }
      const row = await tx.load.update({
        where: { id },
        data: { ...this.loadData(input), truckId, driverId },
      });
      await syncPrismaLoadExpenses(tx, business.id, row);
      if (row.endingOdometer) {
        await tx.truck.updateMany({
          where: { id: truckId, businessId: business.id, currentOdometer: { lt: row.endingOdometer } },
          data: { currentOdometer: row.endingOdometer },
        });
      }
    });
    const dataset = await this.getDataset();
    return dataset.loads.find((l) => l.id === id)!;
  }

  async updateLoadJurisdictionMiles(
    id: string,
    mileage: Load["jurisdictionMiles"],
  ): Promise<Load> {
    const client = await getClient();
    const business = await this.business(client);
    await client.$transaction(async (tx) => {
      const existing = await tx.load.findFirst({ where: { id, businessId: business.id } });
      if (!existing) throw new Error("That load does not belong to this workspace.");

      const normalized = normalizeJurisdictionMiles(mileage);
      const assigned = normalized.reduce((total, row) => total + row.totalMiles, 0);
      if (assigned > existing.loadedMiles + existing.deadheadMiles) {
        throw new Error("Jurisdiction miles cannot exceed total trip miles.");
      }
      await tx.load.update({
        where: { id: existing.id },
        data: { jurisdictionMiles: normalized as unknown as Prisma.InputJsonValue },
      });
    });

    const dataset = await this.getDataset();
    return dataset.loads.find((load) => load.id === id)!;
  }

  async updateLoadExpense(id: string, amount: number): Promise<Load> {
    const client = await getClient();
    const business = await this.business(client);
    const loadId = await client.$transaction(async (tx) => {
      const expense = await tx.expense.findFirst({
        where: { id, businessId: business.id },
        select: { loadId: true },
      });
      if (!expense?.loadId) {
        throw new Error("That expense is not generated by a load.");
      }

      const key = loadExpenseKey(id, expense.loadId);
      if (!key) {
        throw new Error("That expense is not generated by a load.");
      }
      const existing = await tx.load.findFirst({
        where: { id: expense.loadId, businessId: business.id },
      });
      if (!existing) {
        throw new Error("The load that owns this expense could not be found.");
      }

      const row = await tx.load.update({
        where: { id: existing.id },
        data: { [loadExpenseField(key)]: roundMoney(amount) },
      });
      await syncPrismaLoadExpenses(tx, business.id, row);
      return row.id;
    });

    const dataset = await this.getDataset();
    return dataset.loads.find((load) => load.id === loadId)!;
  }

  async deleteLoad(id: string): Promise<void> {
    const client = await getClient();
    const business = await this.business(client);
    await client.$transaction(async (tx) => {
      const existing = await tx.load.findFirst({ where: { id, businessId: business.id } });
      if (!existing) throw new Error("That load does not belong to this workspace.");
      const frozen = await tx.driverSettlementLine.count({ where: { loadId: id } });
      if (frozen > 0) {
        throw new Error(
          "This load is already on a driver settlement. Delete the draft first; paid statements cannot be changed.",
        );
      }
      await tx.expense.deleteMany({
        where: {
          businessId: business.id,
          id: { in: LOAD_EXPENSE_KEYS.map((key) => loadExpenseId(id, key)) },
        },
      });
      await tx.load.delete({ where: { id } });
    });
  }

  async createDriver(input: DriverInput): Promise<Driver> {
    const client = await getClient();
    const business = await this.business(client);
    const defaultTruckId = input.defaultTruckId
      ? truckIdFor(business, input.defaultTruckId)
      : null;
    const row = await client.driver.create({
      data: {
        businessId: business.id,
        name: input.name.trim(),
        reference: input.reference?.trim() || null,
        defaultTruckId,
        payType: input.payType,
        payRate: input.payRate,
      },
    });
    const dataset = await this.getDataset();
    return dataset.drivers.find((driver) => driver.id === row.id)!;
  }

  async updateDriver(id: string, input: DriverInput): Promise<Driver> {
    const client = await getClient();
    const business = await this.business(client);
    const defaultTruckId = input.defaultTruckId
      ? truckIdFor(business, input.defaultTruckId)
      : null;
    const updated = await client.driver.updateMany({
      where: { id, businessId: business.id },
      data: {
        name: input.name.trim(),
        reference: input.reference?.trim() || null,
        defaultTruckId,
        payType: input.payType,
        payRate: input.payRate,
      },
    });
    if (updated.count !== 1) throw new Error("That driver does not belong to this workspace.");
    const dataset = await this.getDataset();
    return dataset.drivers.find((driver) => driver.id === id)!;
  }

  async setDriverActive(id: string, active: boolean): Promise<Driver> {
    const client = await getClient();
    const business = await this.business(client);
    const updated = await client.driver.updateMany({
      where: { id, businessId: business.id },
      data: { active },
    });
    if (updated.count !== 1) throw new Error("That driver does not belong to this workspace.");
    const dataset = await this.getDataset();
    return dataset.drivers.find((driver) => driver.id === id)!;
  }

  async createDriverSettlement(input: DriverSettlementInput): Promise<DriverSettlement> {
    const client = await getClient();
    const business = await this.business(client);
    const row = await client.$transaction(async (tx) => {
      const driver = await tx.driver.findFirst({
        where: { id: input.driverId, businessId: business.id },
      });
      if (!driver) throw new Error("That driver does not belong to this workspace.");
      const loads = await tx.load.findMany({
        where: {
          businessId: business.id,
          driverId: driver.id,
          date: { gte: toDate(input.periodStart), lte: toDate(input.periodEnd) },
          driverSettlementLine: { is: null },
        },
        orderBy: [{ date: "asc" }, { id: "asc" }],
      });
      if (loads.length === 0) {
        throw new Error("No unsettled loads are assigned to that driver in this period.");
      }
      return tx.driverSettlement.create({
        data: {
          businessId: business.id,
          driverId: driver.id,
          periodStart: toDate(input.periodStart),
          periodEnd: toDate(input.periodEnd),
          notes: input.notes?.trim() || null,
          lines: {
            create: loads.map((load) => ({
              loadId: load.id,
              truckId: load.truckId,
              grossRevenue: load.grossRate,
              loadedMiles: load.loadedMiles,
              totalMiles: load.loadedMiles + load.deadheadMiles,
              payType: driver.payType,
              payRate: driver.payRate,
              payAmount: calculateDriverPay(driver.payType, num(driver.payRate), {
                grossRate: num(load.grossRate),
                loadedMiles: load.loadedMiles,
                deadheadMiles: load.deadheadMiles,
              }),
            })),
          },
        },
      });
    });
    const dataset = await this.getDataset();
    return dataset.driverSettlements.find((settlement) => settlement.id === row.id)!;
  }

  async addDriverSettlementAdjustment(
    settlementId: string,
    input: DriverSettlementAdjustmentInput,
  ) {
    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      throw new Error("Adjustment amount must be greater than zero.");
    }
    if (input.reason.trim().length < 2) throw new Error("Explain this adjustment.");
    const client = await getClient();
    const business = await this.business(client);
    const settlement = await client.driverSettlement.findFirst({
      where: { id: settlementId, businessId: business.id },
      include: { lines: true, adjustments: true },
    });
    if (!settlement) throw new Error("That driver settlement does not belong to this workspace.");
    if (settlement.status !== "DRAFT") throw new Error("Paid statements cannot be changed.");
    const basePay = settlement.lines.reduce((sum, line) => sum + num(line.payAmount), 0);
    const signedExisting = settlement.adjustments.reduce((sum, row) =>
      sum + (row.type === "DEDUCTION" || row.type === "ADVANCE" ? -num(row.amount) : num(row.amount)), 0);
    const signedNew = input.type === "DEDUCTION" || input.type === "ADVANCE" ? -input.amount : input.amount;
    if (roundMoney(basePay + signedExisting + signedNew) < 0) {
      throw new Error("This adjustment would make net pay negative.");
    }
    const row = await client.driverSettlementAdjustment.create({
      data: {
        settlementId,
        type: input.type,
        amount: input.amount,
        reason: input.reason.trim(),
      },
    });
    return {
      id: row.id,
      settlementId: row.settlementId,
      type: row.type,
      amount: num(row.amount),
      reason: row.reason,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async deleteDriverSettlementAdjustment(settlementId: string, adjustmentId: string): Promise<void> {
    const client = await getClient();
    const business = await this.business(client);
    const settlement = await client.driverSettlement.findFirst({
      where: { id: settlementId, businessId: business.id },
    });
    if (!settlement) throw new Error("That driver settlement does not belong to this workspace.");
    if (settlement.status !== "DRAFT") throw new Error("Paid statements cannot be changed.");
    const deleted = await client.driverSettlementAdjustment.deleteMany({
      where: { id: adjustmentId, settlementId },
    });
    if (deleted.count !== 1) throw new Error("That adjustment does not belong to this statement.");
  }

  async payDriverSettlement(id: string, paidOn: string): Promise<DriverSettlement> {
    const client = await getClient();
    const business = await this.business(client);
    await client.$transaction(async (tx) => {
      const settlement = await tx.driverSettlement.findFirst({
        where: { id, businessId: business.id },
        include: { driver: true, lines: { include: { load: true } }, adjustments: true },
      });
      if (!settlement) {
        throw new Error("That driver settlement does not belong to this workspace.");
      }
      if (settlement.status === "PAID") throw new Error("That driver settlement is already paid.");
      const domainSettlement: DriverSettlement = {
        id: settlement.id,
        businessId: settlement.businessId,
        driverId: settlement.driverId,
        periodStart: isoDate(settlement.periodStart),
        periodEnd: isoDate(settlement.periodEnd),
        status: settlement.status,
        paidOn: settlement.paidOn ? isoDate(settlement.paidOn) : null,
        notes: settlement.notes,
        createdAt: settlement.createdAt.toISOString(),
        adjustments: settlement.adjustments.map((row) => ({
          id: row.id,
          settlementId: row.settlementId,
          type: row.type,
          amount: num(row.amount),
          reason: row.reason,
          createdAt: row.createdAt.toISOString(),
        })),
        lines: settlement.lines.map((line) => ({
          id: line.id,
          settlementId: line.settlementId,
          loadId: line.loadId,
          truckId: line.truckId,
          grossRevenue: num(line.grossRevenue),
          loadedMiles: line.loadedMiles,
          totalMiles: line.totalMiles,
          payType: line.payType,
          payRate: num(line.payRate),
          payAmount: num(line.payAmount),
          expenseId: line.expenseId,
          createdAt: line.createdAt.toISOString(),
        })),
      };
      const allocations = allocateDriverSettlementNetPay(domainSettlement);

      for (const line of settlement.lines) {
        if (
          line.load.truckId !== line.truckId ||
          line.load.driverId !== settlement.driverId
        ) {
          throw new Error("A load on this draft no longer matches its driver and truck.");
        }
        const expenseId = `expdriver_${line.id}`;
        const allocatedPay = allocations.get(line.id) ?? 0;
        if (allocatedPay > 0) {
          await tx.expense.upsert({
            where: { id: expenseId },
            create: {
              id: expenseId,
              businessId: business.id,
              truckId: line.truckId,
              scope: "TRUCK",
              loadId: line.loadId,
              date: toDate(paidOn),
              category: "DRIVER_PAY",
              description: `Driver pay · ${settlement.driver.name}`,
              vendor: settlement.driver.name,
              amount: allocatedPay,
              recurring: false,
              notes: `Net pay allocated from driver settlement ${settlement.id}.`,
            },
            update: {},
          });
        }
        await tx.driverSettlementLine.update({
          where: { id: line.id },
          data: { expenseId: allocatedPay > 0 ? expenseId : null },
        });
        await tx.load.update({
          where: { id: line.loadId },
          data: { driverPay: allocatedPay },
        });
      }
      await tx.driverSettlement.update({
        where: { id: settlement.id },
        data: { status: "PAID", paidOn: toDate(paidOn) },
      });
    });
    const dataset = await this.getDataset();
    return dataset.driverSettlements.find((settlement) => settlement.id === id)!;
  }

  async deleteDriverSettlement(id: string): Promise<void> {
    const client = await getClient();
    const business = await this.business(client);
    const settlement = await client.driverSettlement.findFirst({
      where: { id, businessId: business.id },
    });
    if (!settlement) throw new Error("That driver settlement does not belong to this workspace.");
    if (settlement.status === "PAID") {
      throw new Error("Paid driver settlements are permanent accounting records.");
    }
    await client.driverSettlement.delete({ where: { id } });
  }

  private expenseData(input: ExpenseInput) {
    return {
      date: toDate(input.date),
      category: input.category,
      description: input.description.trim(),
      vendor: input.vendor?.trim() || null,
      amount: roundMoney(input.amount),
      financialTreatment:
        input.financialTreatment ?? financialTreatmentForCategory(input.category),
      obligationId: input.obligationId,
      splitGroupId: input.splitGroupId,
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
    const truckId = scope === "BUSINESS" ? null : truckIdFor(business, input.truckId);
    const loadId = await ownedLoadId(client, business.id, input.loadId, truckId, scope);
    const row = await client.expense.create({
      data: {
        ...this.expenseData(input),
        loadId,
        businessId: business.id,
        scope,
        truckId,
      },
    });
    const dataset = await this.getDataset();
    return dataset.expenses.find((e) => e.id === row.id)!;
  }

  async updateExpense(id: string, input: ExpenseInput): Promise<Expense> {
    const client = await getClient();
    const business = await this.business(client);
    if (await client.driverSettlementLine.count({ where: { expenseId: id, settlement: { businessId: business.id } } })) {
      throw new Error("Driver Pay expenses are controlled by their paid statement and cannot be edited.");
    }
    const scope = input.scope ?? "TRUCK";
    const truckId = scope === "BUSINESS" ? null : truckIdFor(business, input.truckId);
    const loadId = await ownedLoadId(client, business.id, input.loadId, truckId, scope);
    const updated = await client.expense.updateMany({
      where: { id, businessId: business.id },
      data: {
        ...this.expenseData(input),
        loadId,
        scope,
        truckId,
      },
    });
    if (updated.count !== 1) throw new Error("That expense does not belong to this workspace.");
    const dataset = await this.getDataset();
    return dataset.expenses.find((e) => e.id === id)!;
  }

  async deleteExpense(id: string): Promise<void> {
    const client = await getClient();
    const business = await this.business(client);
    if (await client.driverSettlementLine.count({ where: { expenseId: id, settlement: { businessId: business.id } } })) {
      throw new Error("Driver Pay expenses are controlled by their paid statement and cannot be deleted.");
    }
    const deleted = await client.expense.deleteMany({ where: { id, businessId: business.id } });
    if (deleted.count !== 1) throw new Error("That expense does not belong to this workspace.");
  }

  async createFinancialObligation(
    input: FinancialObligationInput,
  ): Promise<FinancialObligation> {
    const client = await getClient();
    const business = await this.business(client);
    const truckId = input.truckId?.trim() || null;
    if (truckId && !business.trucks.some((truck) => truck.id === truckId)) {
      throw new Error("That truck does not belong to this workspace.");
    }
    const row = await client.financialObligation.create({
      data: {
        businessId: business.id,
        truckId,
        name: input.name.trim(),
        kind: input.kind,
        counterparty: input.counterparty?.trim() || null,
        startedOn: input.startedOn ? toDate(input.startedOn) : null,
        endedOn: input.endedOn ? toDate(input.endedOn) : null,
        expectedMonthlyPayment: input.expectedMonthlyPayment ?? null,
        active: input.active ?? true,
      },
    });
    return (await this.getDataset()).financialObligations.find((item) => item.id === row.id)!;
  }

  async classifyDebtPayment(
    id: string,
    input: DebtPaymentClassificationInput,
  ): Promise<Expense[]> {
    const client = await getClient();
    const business = await this.business(client);
    const affectedIds = await client.$transaction(async (tx) => {
      const expense = await tx.expense.findFirst({ where: { id, businessId: business.id } });
      if (!expense) throw new Error("That payment does not belong to this workspace.");
      if (expense.category !== "TRUCK_PAYMENT") {
        throw new Error("Only unallocated truck payments can be classified here.");
      }

      let obligationId = input.obligationId?.trim() || null;
      if (input.newObligation) {
        const truckId = input.newObligation.truckId?.trim() || null;
        if (truckId && !business.trucks.some((truck) => truck.id === truckId)) {
          throw new Error("That truck does not belong to this workspace.");
        }
        const obligation = await tx.financialObligation.create({
          data: {
            businessId: business.id,
            truckId,
            name: input.newObligation.name.trim(),
            kind: input.newObligation.kind,
            counterparty: input.newObligation.counterparty?.trim() || null,
            startedOn: input.newObligation.startedOn
              ? toDate(input.newObligation.startedOn)
              : null,
            endedOn: input.newObligation.endedOn ? toDate(input.newObligation.endedOn) : null,
            expectedMonthlyPayment: input.newObligation.expectedMonthlyPayment ?? null,
            active: input.newObligation.active ?? true,
          },
        });
        obligationId = obligation.id;
      }
      const obligation = obligationId
        ? await tx.financialObligation.findFirst({
            where: { id: obligationId, businessId: business.id },
          })
        : null;
      if (obligationId && !obligation) {
        throw new Error("That obligation does not belong to this workspace.");
      }

      if (input.treatment === "DEBT_UNALLOCATED") {
        await tx.expense.update({
          where: { id },
          data: { financialTreatment: "DEBT_UNALLOCATED", obligationId },
        });
        return [id];
      }
      if (input.treatment === "OPERATING_LEASE") {
        if (obligation && obligation.kind !== "OPERATING_LEASE") {
          throw new Error("Choose an operating-lease obligation for this treatment.");
        }
        await tx.expense.update({
          where: { id },
          data: {
            category: "OPERATING_LEASE",
            financialTreatment: "OPERATING",
            obligationId,
          },
        });
        return [id];
      }
      if (obligation && obligation.kind !== "LOAN") {
        throw new Error("Choose a loan obligation before recording principal and interest.");
      }
      const { principal, interest } = requireExactDebtPaymentSplit(
        num(expense.amount),
        input.principalAmount ?? 0,
        input.interestAmount ?? 0,
      );
      const splitGroupId = newId("split");
      if (principal <= 0) {
        await tx.expense.update({
          where: { id },
          data: {
            category: "INTEREST_EXPENSE",
            financialTreatment: "INTEREST",
            amount: interest,
            obligationId,
            splitGroupId,
          },
        });
        return [id];
      }
      await tx.expense.update({
        where: { id },
        data: {
          category: "PRINCIPAL_PAYMENT",
          financialTreatment: "PRINCIPAL",
          amount: principal,
          obligationId,
          splitGroupId,
        },
      });
      if (interest <= 0) return [id];
      const interestRow = await tx.expense.create({
        data: {
          businessId: business.id,
          truckId: expense.truckId,
          scope: expense.scope,
          loadId: expense.loadId,
          date: expense.date,
          category: "INTEREST_EXPENSE",
          financialTreatment: "INTEREST",
          obligationId,
          splitGroupId,
          description: `${expense.description} · interest`,
          vendor: expense.vendor,
          amount: interest,
          recurring: expense.recurring,
          notes: expense.notes,
        },
      });
      return [id, interestRow.id];
    }, { isolationLevel: "Serializable" });
    const dataset = await this.getDataset();
    return dataset.expenses.filter((expense) => affectedIds.includes(expense.id));
  }

  async createPaymentEvent(input: PaymentEventInput): Promise<PaymentEvent> {
    const client = await getClient();
    const business = await this.business(client);
    const row = await client.$transaction(async (tx) => {
      const load = await tx.load.findFirst({ where: { id: input.loadId, businessId: business.id } });
      if (!load?.invoiceNumber) throw new Error("Issue the invoice before recording a payment.");
      const events = await tx.paymentEvent.findMany({ where: { loadId: load.id } });
      const recorded = events.length === 0 && load.status === "PAID"
        ? num(load.grossRate)
        : events.reduce((total, event) => total + num(event.amount), 0);
      const remaining = roundMoney(num(load.grossRate) - recorded);
      if (input.amount > remaining) throw new Error("Payment cannot exceed the invoice balance.");
      const event = await tx.paymentEvent.create({
        data: {
          businessId: business.id,
          loadId: load.id,
          date: toDate(input.date),
          amount: roundMoney(input.amount),
          method: input.method?.trim() || null,
          reference: input.reference?.trim() || null,
          notes: input.notes?.trim() || null,
        },
      });
      const fullyPaid = roundMoney(recorded + input.amount) >= num(load.grossRate);
      await tx.load.update({
        where: { id: load.id },
        data: {
          status: fullyPaid ? "PAID" : "INVOICED",
          invoicePaidDate: fullyPaid ? toDate(input.date) : null,
        },
      });
      return event;
    }, { isolationLevel: "Serializable" });
    return (await this.getDataset()).paymentEvents.find((event) => event.id === row.id)!;
  }

  private fuelData(input: FuelEntryInput) {
    return {
      date: toDate(input.date),
      gallons: input.gallons,
      pricePerGallon: input.pricePerGallon,
      totalCost: roundMoney(input.totalCost),
      odometer: input.odometer ?? null,
      location: input.location?.trim() || null,
      jurisdiction: input.jurisdiction?.trim().toUpperCase() || null,
      loadId: input.loadId || null,
      notes: input.notes?.trim() || null,
    };
  }

  async createFuelEntry(input: FuelEntryInput): Promise<FuelEntry> {
    const client = await getClient();
    const business = await this.business(client);
    const truckId = truckIdFor(business, input.truckId);
    const data = {
      ...this.fuelData(input),
      loadId: await ownedLoadId(client, business.id, input.loadId, truckId),
    };

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
      if (data.loadId) {
        const load = await tx.load.findFirst({
          where: { id: data.loadId, businessId: business.id },
        });
        if (load) await syncPrismaLoadExpenses(tx, business.id, load);
      }
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
    const truckId = truckIdFor(business, input.truckId);
    const data = {
      ...this.fuelData(input),
      loadId: await ownedLoadId(client, business.id, input.loadId, truckId),
    };

    await client.$transaction(async (tx) => {
      const existing = await tx.fuelEntry.findFirst({ where: { id, businessId: business.id } });
      if (!existing) throw new Error("That fuel entry does not belong to this workspace.");
      await tx.fuelEntry.updateMany({
        where: { id, businessId: business.id },
        data: { ...data, truckId },
      });

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
        await tx.expense.updateMany({
          where: { id: existing.expenseId, businessId: business.id },
          data: mirror,
        });
      } else {
        const created = await tx.expense.create({
          data: {
            ...mirror,
            businessId: business.id,
            category: "FUEL",
            recurring: false,
          },
        });
        await tx.fuelEntry.updateMany({
          where: { id, businessId: business.id },
          data: { expenseId: created.id },
        });
      }
      if (data.odometer) {
        await tx.truck.updateMany({
          where: { id: truckId, businessId: business.id, currentOdometer: { lt: data.odometer } },
          data: { currentOdometer: data.odometer },
        });
      }
      for (const loadId of new Set([existing.loadId, data.loadId].filter(Boolean))) {
        const load = await tx.load.findFirst({ where: { id: loadId!, businessId: business.id } });
        if (load) await syncPrismaLoadExpenses(tx, business.id, load);
      }
    });

    const dataset = await this.getDataset();
    return dataset.fuelEntries.find((f) => f.id === id)!;
  }

  async deleteFuelEntry(id: string): Promise<void> {
    const client = await getClient();
    const business = await this.business(client);
    await client.$transaction(async (tx) => {
      const existing = await tx.fuelEntry.findFirst({ where: { id, businessId: business.id } });
      if (!existing) throw new Error("That fuel entry does not belong to this workspace.");
      await tx.fuelEntry.deleteMany({ where: { id, businessId: business.id } });
      // Without this the spend stays in operating expenses forever with no
      // fill-up left to trace it back to.
      if (existing?.expenseId) {
        await tx.expense.deleteMany({
          where: { id: existing.expenseId, businessId: business.id },
        });
      }
      if (existing.loadId) {
        const load = await tx.load.findFirst({
          where: { id: existing.loadId, businessId: business.id },
        });
        if (load) await syncPrismaLoadExpenses(tx, business.id, load);
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
      const existing = await tx.maintenanceRecord.findFirst({
        where: { id, businessId: business.id },
      });
      if (!existing) throw new Error("That service record does not belong to this workspace.");
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
          await tx.expense.updateMany({
            where: { id: expenseId, businessId: business.id },
            data: payload,
          });
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
        await tx.expense.deleteMany({ where: { id: expenseId, businessId: business.id } });
        expenseId = null;
      }

      await tx.maintenanceRecord.updateMany({
        where: { id, businessId: business.id },
        data: { ...data, expenseId },
      });
    });

    return (await this.getDataset()).maintenanceRecords.find((m) => m.id === id)!;
  }

  async deleteMaintenance(id: string): Promise<void> {
    const client = await getClient();
    const business = await this.business(client);
    // One transaction: a half-applied delete would leave an orphaned ledger
    // row that is invisible in the UI but still counted in every total.
    await client.$transaction(async (tx) => {
      const existing = await tx.maintenanceRecord.findFirst({
        where: { id, businessId: business.id },
      });
      if (!existing) throw new Error("That service record does not belong to this workspace.");
      await tx.maintenanceRecord.deleteMany({ where: { id, businessId: business.id } });
      if (existing?.expenseId) {
        await tx.expense.deleteMany({
          where: { id: existing.expenseId, businessId: business.id },
        });
      }
    });
  }

  /* ---- Documents ----------------------------------------------------- */

  async createDocument(input: DocumentInput): Promise<Document> {
    const client = await getClient();
    const business = await this.business(client);
    await assertDocumentTargets(client, business, input);
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
    const business = await this.business(client);
    const existing = await client.document.findFirst({
      where: { id, businessId: business.id },
    });
    if (!existing) return null;
    await client.document.deleteMany({ where: { id, businessId: business.id } });
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
        iftaTaxRates: (input.iftaTaxRates ?? {}) as Prisma.InputJsonValue,
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
        ...(input.iftaTaxRates
          ? { iftaTaxRates: input.iftaTaxRates as Prisma.InputJsonValue }
          : {}),
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
        axleCount: input.axleCount ?? null,
        registeredGrossWeightLbs: input.registeredGrossWeightLbs ?? null,
        operatesInMultipleIftaJurisdictions:
          input.operatesInMultipleIftaJurisdictions ?? null,
        iftaReportingEnabled: input.iftaReportingEnabled ?? null,
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
    if (!business.trucks.some((truck) => truck.id === targetId)) {
      throw new Error("That truck does not belong to this workspace.");
    }

    await client.truck.updateMany({
      where: { id: targetId, businessId: business.id },
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
        ...(input.axleCount === undefined ? {} : { axleCount: input.axleCount }),
        ...(input.registeredGrossWeightLbs === undefined
          ? {}
          : { registeredGrossWeightLbs: input.registeredGrossWeightLbs }),
        ...(input.operatesInMultipleIftaJurisdictions === undefined
          ? {}
          : {
              operatesInMultipleIftaJurisdictions:
                input.operatesInMultipleIftaJurisdictions,
            }),
        ...(input.iftaReportingEnabled === undefined
          ? {}
          : { iftaReportingEnabled: input.iftaReportingEnabled }),
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
    if (!business.trucks.some((truck) => truck.id === id)) {
      throw new Error("That truck does not belong to this workspace.");
    }
    const active = await client.truck.count({ where: { businessId: business.id, active: true } });
    if (active <= 1) {
      throw new Error("This is your only active truck. Add another one before retiring it.");
    }
    await client.truck.updateMany({
      where: { id, businessId: business.id },
      data: { active: false, soldOn: soldOn ? toDate(soldOn) : null },
    });
    return requireTruck(await this.getDataset(), id);
  }

  async restoreTruck(id: string): Promise<Truck> {
    const client = await getClient();
    const business = await this.business(client);
    if (!business.trucks.some((truck) => truck.id === id)) {
      throw new Error("That truck does not belong to this workspace.");
    }
    await client.truck.updateMany({
      where: { id, businessId: business.id },
      data: { active: true, soldOn: null },
    });
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
      ...(input.providerCustomerId === undefined
        ? {}
        : { providerCustomerId: input.providerCustomerId }),
      ...(input.providerSubscriptionId === undefined
        ? {}
        : { providerSubscriptionId: input.providerSubscriptionId }),
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
      expectedMonthlyMiles: input.expectedMonthlyMiles ?? 0,
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
