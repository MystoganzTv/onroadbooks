import { brokerContactsOf, brokerNameKey, clearedLegacyContact, planBrokerMerge } from "../brokers";
import { recurringSeriesExpenseIds } from "../recurring-expenses";
import "server-only";
import { assertFuelExpenseSource } from "../fuel-expenses";

import {
  and,
  or,
  eq,
  ne,
  isNotNull,
  inArray,
  notInArray,
  gte,
  lte,
  lt,
  asc,
  desc,
  count as sqlCount,
} from "drizzle-orm";
import { getNeonDatabase } from "@/db";
import * as s from "@/db/schema";
import {
  oneRow,
  affectedRows,
  countRows,
  insertValues,
  updateValues,
  type DatabaseExecutor,
} from "./drizzle-queries";

import { DEFAULT_RATING_THRESHOLDS, roundMoney } from "../calculations";
import {
  allocateDriverSettlementNetPay,
  calculateDriverPay,
} from "../driver-pay";
import type {
  Business,
  Broker,
  BrokerContact,
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
import { expensePaymentRows } from "../expense-payment";
import { requireExactDebtPaymentSplit } from "../finance/debt-payment";
import { isLoadExpenseId } from "../load-expenses";
import { mirrorRefusal } from "../mirrored-expenses";
import {
  defaultGoals,
  defaultReserveAccounts,
  defaultSubscription,
} from "../defaults";
import {
  DEFAULT_PLAN,
  getPlan,
  isComplimentaryAccess,
  trialEndsOn,
} from "../plans";
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
  BrokerInput,
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
import { BusinessNotFoundError, newId } from "./repository";

/** Drizzle implementation of the existing business rules.
 * Numeric strings and ISO dates are converted only at the domain boundary.
 * The injected executor allows isolated transaction-based contract tests.
 */

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

type DecimalLike = string | number | null | undefined;

function num(value: DecimalLike): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  return Number(value);
}

/** Reads a Decimal setting, falling back only when the column is absent. */
function settingNumber(value: DecimalLike, fallback: number): number {
  if (value === null || value === undefined) return fallback;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function numOrNull(value: DecimalLike): number | null {
  if (value === null || value === undefined) return null;
  return typeof value === "number" ? value : Number(value);
}

function isoDate(value: string | Date): string {
  return typeof value === "string" ? value : value.toISOString().slice(0, 10);
}

function toDate(value: string): string {
  return value;
}

function fuelDescription(gallons: number, pricePerGallon: number): string {
  return `Fuel - ${gallons.toFixed(1)} gal @ ${pricePerGallon.toFixed(3)}/gal`;
}

interface LoadLedgerSource {
  id: string;
  truckId: string;
  date: string;
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
async function syncDrizzleLoadExpenses(
  tx: DatabaseExecutor,
  businessId: string,
  load: LoadLedgerSource,
): Promise<void> {
  const specs = loadExpenseSpecs({
    fuelCost: num(load.fuelCost),
    tolls: num(load.tolls),
    dispatchFee: num(load.dispatchFee),
    factoringFee: num(load.factoringFee),
    otherExpenses: num(load.otherExpenses),
  });

  for (const spec of specs) {
    const id = loadExpenseId(load.id, spec.key);
    const shouldPost =
      load.costsPosted &&
      spec.amount > 0 &&
      spec.key !== "fuel";

    if (!shouldPost) {
      await affectedRows(
        tx
          .delete(s.expense)
          .where(
            and(eq(s.expense.id, id), eq(s.expense.businessId, businessId)),
          )
          .returning(),
      );
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
      notes:
        "Posted automatically from the load. Edit this amount in Expenses.",
    };
    await oneRow(
      tx
        .insert(s.expense)
        .values(insertValues(s.expense, { id, ...values }))
        .onConflictDoUpdate({
          target: s.expense.id,
          set: updateValues(s.expense, values),
        })
        .returning(),
    );
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
  client: DatabaseExecutor,
  businessId: string,
  requested: string | null | undefined,
  truckId: string | null,
  scope: "TRUCK" | "BUSINESS" = "TRUCK",
): Promise<string | null> {
  const id = requested?.trim();
  if (!id) return null;
  const load = await client.query.load.findFirst({
    where: and(eq(s.load.id, id), eq(s.load.businessId, businessId)),
    columns: { truckId: true },
  });
  if (!load) throw new Error("That load does not belong to this workspace.");
  if (scope === "BUSINESS")
    throw new Error("Business overhead cannot be linked to a load.");
  if (!truckId || load.truckId !== truckId) {
    throw new Error("The linked load belongs to another truck.");
  }
  return id;
}

async function ownedDriverId(
  client: DatabaseExecutor,
  businessId: string,
  requested: string | null | undefined,
): Promise<string | null> {
  const id = requested?.trim();
  if (!id) return null;
  const count = await countRows(
    client
      .select({ value: sqlCount() })
      .from(s.driver)
      .where(and(eq(s.driver.id, id), eq(s.driver.businessId, businessId))),
  );
  if (count !== 1)
    throw new Error("That driver does not belong to this workspace.");
  return id;
}

async function assertDocumentTargets(
  client: DatabaseExecutor,
  business: { id: string; trucks: { id: string }[] },
  input: DocumentInput,
): Promise<void> {
  const targets = [
    input.loadId,
    input.expenseId,
    input.truckId,
    input.maintenanceId,
  ].filter((id): id is string => Boolean(id?.trim()));
  if (targets.length !== 1) {
    throw new Error("A document must belong to exactly one record.");
  }
  const checks = await Promise.all([
    input.loadId
      ? countRows(
          client
            .select({ value: sqlCount() })
            .from(s.load)
            .where(
              and(
                eq(s.load.id, input.loadId),
                eq(s.load.businessId, business.id),
              ),
            ),
        )
      : Promise.resolve(1),
    input.expenseId
      ? countRows(
          client
            .select({ value: sqlCount() })
            .from(s.expense)
            .where(
              and(
                eq(s.expense.id, input.expenseId),
                eq(s.expense.businessId, business.id),
              ),
            ),
        )
      : Promise.resolve(1),
    input.maintenanceId
      ? countRows(
          client
            .select({ value: sqlCount() })
            .from(s.maintenanceRecord)
            .where(
              and(
                eq(s.maintenanceRecord.id, input.maintenanceId),
                eq(s.maintenanceRecord.businessId, business.id),
              ),
            ),
        )
      : Promise.resolve(1),
  ]);
  const truckOwned =
    !input.truckId ||
    business.trucks.some((truck) => truck.id === input.truckId);
  if (checks.some((count) => count !== 1) || !truckOwned) {
    throw new Error("That document target does not belong to this workspace.");
  }
}

/**
 * Materialises the two built-in buckets the first time one is needed, so an
 * existing database gains them without a data migration script.
 */
async function ensureReserveAccounts(
  client: DatabaseExecutor,
  businessId: string,
): Promise<void> {
  const count = await countRows(
    client
      .select({ value: sqlCount() })
      .from(s.reserveAccount)
      .where(eq(s.reserveAccount.businessId, businessId)),
  );
  if (count > 0) return;
  for (const account of defaultReserveAccounts(businessId)) {
    await oneRow(
      client
        .insert(s.reserveAccount)
        .values(
          insertValues(s.reserveAccount, {
            businessId,
            kind: account.kind,
            name: account.name,
            basis: account.basis,
            contributionPct: account.contributionPct,
            targetBalance: account.targetBalance,
            active: account.active,
            sortOrder: account.sortOrder,
          }),
        )
        .returning(),
    );
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
export class DrizzleAuthStore implements AuthStore {
  constructor(
    private readonly clientProvider: () => Promise<DatabaseExecutor> = async () =>
      getNeonDatabase(),
  ) {}
  async listAccounts(): Promise<AdminAccountSummary[]> {
    const client = await this.clientProvider();
    const rows = await client.query.user.findMany({
      where: and(isNotNull(s.user.businessId), eq(s.user.role, "OWNER")),
      orderBy: [desc(s.user.createdAt)],
      with: {
        business: {
          with: {
            subscription: true,
            trucks: { columns: { active: true } },
            loads: {
              orderBy: [desc(s.load.createdAt)],
              limit: 1,
              columns: { createdAt: true },
            },
            expenses: {
              orderBy: [desc(s.expense.createdAt)],
              limit: 1,
              columns: { createdAt: true },
            },
            fuelEntries: {
              orderBy: [desc(s.fuelEntry.createdAt)],
              limit: 1,
              columns: { createdAt: true },
            },
            documents: {
              orderBy: [desc(s.document.uploadedAt)],
              limit: 1,
              columns: { uploadedAt: true },
            },
            maintenance: {
              orderBy: [desc(s.maintenanceRecord.createdAt)],
              limit: 1,
              columns: { createdAt: true },
            },
            reserveTransactions: {
              orderBy: [desc(s.reserveTransaction.createdAt)],
              limit: 1,
              columns: { createdAt: true },
            },
            settlements: {
              orderBy: [desc(s.settlement.createdAt)],
              limit: 1,
              columns: { createdAt: true },
            },
          },
        },
      },
    });

    const totals = await Promise.all([
      client
        .select({ businessId: s.truck.businessId, value: sqlCount() })
        .from(s.truck)
        .groupBy(s.truck.businessId),
      client
        .select({ businessId: s.load.businessId, value: sqlCount() })
        .from(s.load)
        .groupBy(s.load.businessId),
      client
        .select({ businessId: s.expense.businessId, value: sqlCount() })
        .from(s.expense)
        .groupBy(s.expense.businessId),
      client
        .select({ businessId: s.fuelEntry.businessId, value: sqlCount() })
        .from(s.fuelEntry)
        .groupBy(s.fuelEntry.businessId),
      client
        .select({ businessId: s.document.businessId, value: sqlCount() })
        .from(s.document)
        .groupBy(s.document.businessId),
      client
        .select({
          businessId: s.maintenanceRecord.businessId,
          value: sqlCount(),
        })
        .from(s.maintenanceRecord)
        .groupBy(s.maintenanceRecord.businessId),
      client
        .select({
          businessId: s.reserveTransaction.businessId,
          value: sqlCount(),
        })
        .from(s.reserveTransaction)
        .groupBy(s.reserveTransaction.businessId),
      client
        .select({ businessId: s.settlement.businessId, value: sqlCount() })
        .from(s.settlement)
        .groupBy(s.settlement.businessId),
    ]);

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
      const lastActivityAt =
        activityDates.length > 0
          ? new Date(
              Math.max(...activityDates.map((value) => value.getTime())),
            ).toISOString()
          : null;
      const subscriptionStatus = subscription?.status ?? "TRIALING";
      const hasProviderSubscription = Boolean(
        subscription?.providerSubscriptionId &&
          subscriptionStatus !== "CANCELED",
      );
      return [
        {
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
                    providerSubscriptionId:
                      subscription?.providerSubscriptionId ?? null,
                    currentPeriodEnd: subscription?.currentPeriodEnd
                      ? isoDate(subscription.currentPeriodEnd)
                      : null,
                  })
                ? "complimentary"
                : "inactive",
          lastActivityAt,
          counts: {
            trucks:
              totals[0].find((total) => total.businessId === row.businessId)
                ?.value ?? 0,
            activeTrucks: row.business.trucks.filter((truck) => truck.active)
              .length,
            loads:
              totals[1].find((total) => total.businessId === row.businessId)
                ?.value ?? 0,
            expenses:
              totals[2].find((total) => total.businessId === row.businessId)
                ?.value ?? 0,
            fuelEntries:
              totals[3].find((total) => total.businessId === row.businessId)
                ?.value ?? 0,
            documents:
              totals[4].find((total) => total.businessId === row.businessId)
                ?.value ?? 0,
            maintenance:
              totals[5].find((total) => total.businessId === row.businessId)
                ?.value ?? 0,
            reserveTransactions:
              totals[6].find((total) => total.businessId === row.businessId)
                ?.value ?? 0,
            settlements:
              totals[7].find((total) => total.businessId === row.businessId)
                ?.value ?? 0,
          },
        },
      ];
    });
  }

  async countUsers(): Promise<number> {
    const client = await this.clientProvider();
    return countRows(client.select({ value: sqlCount() }).from(s.user));
  }

  async findUserByEmail(email: string): Promise<User | null> {
    const client = await this.clientProvider();
    const row = await client.query.user.findFirst({
      where: eq(s.user.email, email.trim().toLowerCase()),
    });
    return row ? domainUser(row) : null;
  }

  async findUserById(id: string): Promise<User | null> {
    const client = await this.clientProvider();
    const row = await client.query.user.findFirst({ where: eq(s.user.id, id) });
    return row ? domainUser(row) : null;
  }

  async listMembers(businessId: string): Promise<User[]> {
    const client = await this.clientProvider();
    const rows = await client.query.user.findMany({
      where: eq(s.user.businessId, businessId),
      orderBy: [asc(s.user.role), asc(s.user.createdAt)],
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
    const client = await this.clientProvider();
    const email = input.email.trim().toLowerCase();
    const business = await client.query.business.findFirst({
      where: eq(s.business.id, input.businessId),
      columns: { id: true },
    });
    if (!business) throw new Error("This workspace no longer exists.");
    if (await client.query.user.findFirst({ where: eq(s.user.email, email) })) {
      throw new Error("That email already belongs to an OnRoad Books account.");
    }
    const now = new Date();
    const row = await oneRow(
      client
        .insert(s.user)
        .values(
          insertValues(s.user, {
            businessId: input.businessId,
            email,
            name: input.name?.trim() || null,
            passwordHash: "invite$pending",
            role: input.role,
            invitedAt: now,
            joinedAt: null,
          }),
        )
        .returning(),
    );
    const user = domainUser(row);
    if (!user) throw new Error("The member could not be created.");
    return user;
  }

  async updateMemberRole(
    userId: string,
    businessId: string,
    role: Exclude<MemberRole, "OWNER">,
  ): Promise<User> {
    const client = await this.clientProvider();
    const existing = await client.query.user.findFirst({
      where: and(eq(s.user.id, userId), eq(s.user.businessId, businessId)),
    });
    if (!existing) throw new Error("That team member was not found.");
    if (existing.role === "OWNER")
      throw new Error("The owner role cannot be changed here.");
    const row = await oneRow(
      client
        .update(s.user)
        .set(updateValues(s.user, { role }))
        .where(eq(s.user.id, userId))
        .returning(),
    );
    const user = domainUser(row);
    if (!user) throw new Error("The member could not be updated.");
    return user;
  }

  async markMemberJoined(userId: string, businessId: string): Promise<User> {
    const client = await this.clientProvider();
    const existing = await client.query.user.findFirst({
      where: and(eq(s.user.id, userId), eq(s.user.businessId, businessId)),
    });
    if (!existing) throw new Error("That invitation no longer exists.");
    const row = existing.joinedAt
      ? existing
      : await oneRow(
          client
            .update(s.user)
            .set(updateValues(s.user, { joinedAt: new Date() }))
            .where(eq(s.user.id, userId))
            .returning(),
        );
    const user = domainUser(row);
    if (!user) throw new Error("The member could not be activated.");
    return user;
  }

  async removeMember(
    userId: string,
    businessId: string,
  ): Promise<{ email: string }> {
    const client = await this.clientProvider();
    const existing = await client.query.user.findFirst({
      where: and(eq(s.user.id, userId), eq(s.user.businessId, businessId)),
    });
    if (!existing) throw new Error("That team member was not found.");
    if (existing.role === "OWNER")
      throw new Error("The workspace owner cannot be removed.");
    await oneRow(
      client.delete(s.user).where(eq(s.user.id, userId)).returning(),
    );
    return { email: existing.email };
  }

  async createOwner(input: {
    email: string;
    name?: string | null;
    passwordHash: string;
    businessName?: string;
    plan?: PlanId;
  }): Promise<User> {
    const client = await this.clientProvider();
    const email = input.email.trim().toLowerCase();
    const trialStartedAt = new Date();

    return client.transaction(async (tx) => {
      if (await tx.query.user.findFirst({ where: eq(s.user.email, email) })) {
        throw new Error("That email already has an account.");
      }

      const business = await oneRow(
        tx
          .insert(s.business)
          .values(
            insertValues(s.business, {
              name: input.businessName?.trim() || "My Trucking Business",
              currency: "USD",
            }),
          )
          .returning(),
      );
      await tx.insert(s.financialSettings).values(
        insertValues(s.financialSettings, {
          businessId: business.id,
          categoryBehavior: defaultCategoryBehavior(),
        }),
      );
      await tx
        .insert(s.truck)
        .values(
          insertValues(s.truck, { businessId: business.id, name: "Truck 1" }),
        );
      await tx.insert(s.subscription).values(
        insertValues(s.subscription, {
          businessId: business.id,
          plan: input.plan ?? DEFAULT_PLAN,
          status: "TRIALING",
          startedAt: trialStartedAt,
          currentPeriodEnd: new Date(
            trialEndsOn(trialStartedAt.toISOString()) + "T00:00:00.000Z",
          ),
        }),
      );

      const row = await oneRow(
        tx
          .insert(s.user)
          .values(
            insertValues(s.user, {
              email,
              name: input.name?.trim() || null,
              passwordHash: input.passwordHash,
              businessId: business.id,
              role: "OWNER",
              joinedAt: trialStartedAt,
            }),
          )
          .returning(),
      );

      const user = domainUser(row);
      if (!user) throw new Error("The owner account could not be created.");
      return user;
    });
  }

  async resetBusinessData(
    userId: string,
    businessId: string,
  ): Promise<string[]> {
    const client = await this.clientProvider();

    return client.transaction(async (tx) => {
      const owner = await tx.query.user.findFirst({
        where: and(eq(s.user.id, userId), eq(s.user.businessId, businessId)),
      });
      if (!owner) throw new Error("This account no longer exists.");
      if (owner.role !== "OWNER")
        throw new Error("Only the workspace owner can reset this account.");

      const documents = await tx.query.document.findMany({
        where: eq(s.document.businessId, businessId),
        columns: { storageKey: true },
      });

      await tx.delete(s.broker).where(eq(s.broker.businessId, businessId));
      await affectedRows(
        tx
          .delete(s.document)
          .where(eq(s.document.businessId, businessId))
          .returning(),
      );
      await affectedRows(
        tx
          .delete(s.fuelEntry)
          .where(eq(s.fuelEntry.businessId, businessId))
          .returning(),
      );
      await affectedRows(
        tx
          .delete(s.maintenanceRecord)
          .where(eq(s.maintenanceRecord.businessId, businessId))
          .returning(),
      );
      await affectedRows(
        tx
          .delete(s.driverSettlement)
          .where(eq(s.driverSettlement.businessId, businessId))
          .returning(),
      );
      await affectedRows(
        tx
          .delete(s.paymentEvent)
          .where(eq(s.paymentEvent.businessId, businessId))
          .returning(),
      );
      await affectedRows(
        tx
          .delete(s.expense)
          .where(eq(s.expense.businessId, businessId))
          .returning(),
      );
      await affectedRows(
        tx.delete(s.load).where(eq(s.load.businessId, businessId)).returning(),
      );
      await affectedRows(
        tx
          .delete(s.financialObligation)
          .where(eq(s.financialObligation.businessId, businessId))
          .returning(),
      );
      await affectedRows(
        tx
          .delete(s.driver)
          .where(eq(s.driver.businessId, businessId))
          .returning(),
      );
      await affectedRows(
        tx
          .delete(s.truck)
          .where(eq(s.truck.businessId, businessId))
          .returning(),
      );
      await affectedRows(
        tx
          .delete(s.reserveTransaction)
          .where(eq(s.reserveTransaction.businessId, businessId))
          .returning(),
      );
      await affectedRows(
        tx
          .delete(s.settlement)
          .where(eq(s.settlement.businessId, businessId))
          .returning(),
      );
      await affectedRows(
        tx
          .delete(s.reserveAccount)
          .where(eq(s.reserveAccount.businessId, businessId))
          .returning(),
      );
      await affectedRows(
        tx
          .delete(s.financialGoal)
          .where(eq(s.financialGoal.businessId, businessId))
          .returning(),
      );
      await affectedRows(
        tx
          .delete(s.financialSettings)
          .where(eq(s.financialSettings.businessId, businessId))
          .returning(),
      );

      await oneRow(
        tx
          .insert(s.truck)
          .values(insertValues(s.truck, { businessId, name: "Truck 1" }))
          .returning(),
      );
      await oneRow(
        tx
          .insert(s.financialSettings)
          .values(
            insertValues(s.financialSettings, {
              businessId,
              categoryBehavior: defaultCategoryBehavior(),
            }),
          )
          .returning(),
      );
      const goals = defaultGoals(businessId, new Date().toISOString());
      await oneRow(
        tx
          .insert(s.financialGoal)
          .values(
            insertValues(s.financialGoal, {
              businessId,
              monthlyRevenueTarget: goals.monthlyRevenueTarget,
              monthlyProfitTarget: goals.monthlyProfitTarget,
              targetProfitPerMile: goals.targetProfitPerMile,
              maxDeadheadPct: goals.maxDeadheadPct,
              targetLoads: goals.targetLoads,
              workingDaysPerWeek: goals.workingDaysPerWeek,
              expectedMonthlyMiles: goals.expectedMonthlyMiles ?? 0,
            }),
          )
          .returning(),
      );
      for (const account of defaultReserveAccounts(
        businessId,
        new Date().toISOString(),
      )) {
        await oneRow(
          tx
            .insert(s.reserveAccount)
            .values(
              insertValues(s.reserveAccount, {
                businessId,
                kind: account.kind,
                name: account.name,
                basis: account.basis,
                contributionPct: account.contributionPct,
                targetBalance: account.targetBalance,
                active: account.active,
                sortOrder: account.sortOrder,
              }),
            )
            .returning(),
        );
      }

      return documents.map((document) => document.storageKey);
    });
  }

  async deleteAccount(
    userId: string,
    businessId: string,
  ): Promise<{ email: string; storageKeys: string[] }> {
    const client = await this.clientProvider();

    return client.transaction(async (tx) => {
      const owner = await tx.query.user.findFirst({
        where: and(eq(s.user.id, userId), eq(s.user.businessId, businessId)),
      });
      if (!owner) throw new Error("This account no longer exists.");
      if (owner.role !== "OWNER")
        throw new Error("Only the workspace owner can delete this account.");

      const documents = await tx.query.document.findMany({
        where: eq(s.document.businessId, businessId),
        columns: { storageKey: true },
      });

      // There is one immutable owner. Deleting that owner's account means
      // deleting the workspace, not leaving members attached to ownerless books.
      await affectedRows(
        tx.delete(s.user).where(eq(s.user.businessId, businessId)).returning(),
      );
      await oneRow(
        tx.delete(s.business).where(eq(s.business.id, businessId)).returning(),
      );

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

export class DrizzleRepository implements Repository {
  /** Bound to one business; every query filters on it. */
  constructor(
    private readonly businessId: string,
    private readonly clientProvider: () => Promise<DatabaseExecutor> = async () =>
      getNeonDatabase(),
  ) {}

  private async business(client: DatabaseExecutor) {
    // Prefer an active truck but fall back to any truck: deactivating the
    // only truck must not take the whole app down.
    const existing = await client.query.business.findFirst({
      where: eq(s.business.id, this.businessId),
      with: {
        settings: true,
        trucks: {
          orderBy: [desc(s.truck.active), asc(s.truck.name), asc(s.truck.id)],
        },
      },
    });
    if (existing && existing.trucks.length > 0) return existing;
    if (existing) {
      const truck = await oneRow(
        client
          .insert(s.truck)
          .values(
            insertValues(s.truck, { businessId: existing.id, name: "Truck 1" }),
          )
          .returning(),
      );
      return { ...existing, trucks: [truck] };
    }

    // The session names a business that does not exist. That is not a state
    // to recover from silently -- it means a stale or forged cookie.
    throw new BusinessNotFoundError();
  }

  async getDataset(): Promise<Dataset> {
    const client = await this.clientProvider();
    const business = await this.business(client);

    const [
      brokerRows,
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
      client.query.broker.findMany({ where: eq(s.broker.businessId, business.id), orderBy: [asc(s.broker.name)] }),
      // Tie-break on id so same-day rows have a defined order, matching the
      // JSON store rather than whatever Postgres happens to return.
      client.query.load.findMany({
        where: eq(s.load.businessId, business.id),
        orderBy: [desc(s.load.date), desc(s.load.id)],
      }),
      client.query.expense.findMany({
        where: eq(s.expense.businessId, business.id),
        orderBy: [desc(s.expense.date), desc(s.expense.id)],
      }),
      client.query.fuelEntry.findMany({
        where: eq(s.fuelEntry.businessId, business.id),
        orderBy: [desc(s.fuelEntry.date), desc(s.fuelEntry.id)],
      }),
      client.query.document.findMany({
        where: eq(s.document.businessId, business.id),
        orderBy: [asc(s.document.uploadedAt)],
      }),
      client.query.maintenanceRecord.findMany({
        where: eq(s.maintenanceRecord.businessId, business.id),
        orderBy: [
          desc(s.maintenanceRecord.serviceDate),
          desc(s.maintenanceRecord.id),
        ],
      }),
      client.query.financialGoal.findFirst({
        where: eq(s.financialGoal.businessId, business.id),
      }),
      client.query.subscription.findFirst({
        where: eq(s.subscription.businessId, business.id),
      }),
      client.query.reserveAccount.findMany({
        where: eq(s.reserveAccount.businessId, business.id),
        orderBy: [asc(s.reserveAccount.sortOrder), asc(s.reserveAccount.id)],
      }),
      client.query.reserveTransaction.findMany({
        where: eq(s.reserveTransaction.businessId, business.id),
        orderBy: [
          desc(s.reserveTransaction.date),
          desc(s.reserveTransaction.id),
        ],
      }),
      client.query.settlement.findMany({
        where: eq(s.settlement.businessId, business.id),
        orderBy: [desc(s.settlement.periodStart), desc(s.settlement.id)],
      }),
      client.query.driver.findMany({
        where: eq(s.driver.businessId, business.id),
        orderBy: [desc(s.driver.active), asc(s.driver.name), asc(s.driver.id)],
      }),
      client.query.driverSettlement.findMany({
        where: eq(s.driverSettlement.businessId, business.id),
        with: {
          lines: {
            orderBy: [
              asc(s.driverSettlementLine.createdAt),
              asc(s.driverSettlementLine.id),
            ],
          },
          adjustments: {
            orderBy: [
              asc(s.driverSettlementAdjustment.createdAt),
              asc(s.driverSettlementAdjustment.id),
            ],
          },
        },
        orderBy: [
          desc(s.driverSettlement.periodStart),
          desc(s.driverSettlement.id),
        ],
      }),
      client.query.financialObligation.findMany({
        where: eq(s.financialObligation.businessId, business.id),
        orderBy: [
          desc(s.financialObligation.active),
          asc(s.financialObligation.name),
          asc(s.financialObligation.id),
        ],
      }),
      client.query.paymentEvent.findMany({
        where: eq(s.paymentEvent.businessId, business.id),
        orderBy: [desc(s.paymentEvent.date), desc(s.paymentEvent.id)],
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
      reserveAccountRows = await client.query.reserveAccount.findMany({
        where: eq(s.reserveAccount.businessId, business.id),
        orderBy: [asc(s.reserveAccount.sortOrder), asc(s.reserveAccount.id)],
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
      maintenanceReservePct: settingNumber(
        business.settings?.maintenanceReservePct,
        5,
      ),
      ratingGreatPerMile: settingNumber(
        business.settings?.ratingGreatPerMile,
        DEFAULT_RATING_THRESHOLDS.great,
      ),
      ratingGoodPerMile: settingNumber(
        business.settings?.ratingGoodPerMile,
        DEFAULT_RATING_THRESHOLDS.good,
      ),
      ratingMarginalPerMile: settingNumber(
        business.settings?.ratingMarginalPerMile,
        DEFAULT_RATING_THRESHOLDS.marginal,
      ),
      deadheadWarnPct: settingNumber(business.settings?.deadheadWarnPct, 20),
      maintenanceWarnMiles: business.settings?.maintenanceWarnMiles ?? 2000,
      maintenanceWarnDays: business.settings?.maintenanceWarnDays ?? 30,
      iftaTaxRates:
        (business.settings?.iftaTaxRates as Record<string, number> | null) ??
        {},
      fleetOverheadAllocation:
        business.settings?.fleetOverheadAllocation === "FLEET_MILES"
          ? "FLEET_MILES"
          : "UNALLOCATED",
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
      financingConfirmedNone: row.financingConfirmedNone,
      operatingCostExemptions:
        (row.operatingCostExemptions as
          | Truck["operatingCostExemptions"]
          | null) ?? {},
      axleCount: row.axleCount,
      referenceMpg: numOrNull(row.referenceMpg),
      registeredGrossWeightLbs: row.registeredGrossWeightLbs,
      operatesInMultipleIftaJurisdictions:
        row.operatesInMultipleIftaJurisdictions,
      iftaReportingEnabled: row.iftaReportingEnabled,
      startingOdometer: row.startingOdometer,
      currentOdometer: row.currentOdometer,
      active: row.active,
      createdAt: row.createdAt.toISOString(),
    }));

    const dataset: Dataset = {
      brokers: brokerRows.map((row) => ({ ...row, contacts: brokerContactsOf(row), createdAt: row.createdAt.toISOString() })),
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
          startingBalance: numOrNull(row.startingBalance),
          aprPercent: numOrNull(row.aprPercent),
          paymentDueDay: row.paymentDueDay,
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
          isOwnerOperator: row.isOwnerOperator,
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
          brokerContact: row.brokerContact,
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
          invoiceDueDate: row.invoiceDueDate
            ? isoDate(row.invoiceDueDate)
            : null,
          invoicePaidDate: row.invoicePaidDate
            ? isoDate(row.invoicePaidDate)
            : null,
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
            row.financialTreatment ??
            financialTreatmentForCategory(row.category),
          obligationId: row.obligationId,
          splitGroupId: row.splitGroupId,
          behavior: row.behavior,
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
          station: row.station,
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
          nextServiceDate: row.nextServiceDate
            ? isoDate(row.nextServiceDate)
            : null,
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
      brokerContact: input.brokerContact?.trim() || null,
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
            ),
          }),
      ...(input.invoiceNumber === undefined
        ? {}
        : { invoiceNumber: input.invoiceNumber?.trim() || null }),
      ...(input.invoiceDate === undefined
        ? {}
        : {
            invoiceDate: input.invoiceDate ? toDate(input.invoiceDate) : null,
          }),
      ...(input.invoiceDueDate === undefined
        ? {}
        : {
            invoiceDueDate: input.invoiceDueDate
              ? toDate(input.invoiceDueDate)
              : null,
          }),
      ...(input.invoicePaidDate === undefined
        ? {}
        : {
            invoicePaidDate: input.invoicePaidDate
              ? toDate(input.invoicePaidDate)
              : null,
          }),
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
    const client = await this.clientProvider();
    const business = await this.business(client);
    // Match by id, never by position: the list is ordered by date, so a load
    // dated in the past is not dataset.loads[0], and returning the wrong id
    // would file the caller's attachments against someone else's load.
    const truckId = truckIdFor(business, input.truckId);
    const row = await client.transaction(async (tx) => {
      const driverId = await ownedDriverId(tx, business.id, input.driverId);
      const created = await oneRow(
        tx
          .insert(s.load)
          .values(
            insertValues(s.load, {
              ...this.loadData(input),
              businessId: business.id,
              truckId,
              driverId,
            }),
          )
          .returning(),
      );
      await syncDrizzleLoadExpenses(tx, business.id, created);
      if (created.endingOdometer) {
        await affectedRows(
          tx
            .update(s.truck)
            .set(
              updateValues(s.truck, {
                currentOdometer: created.endingOdometer,
              }),
            )
            .where(
              and(
                eq(s.truck.id, truckId),
                eq(s.truck.businessId, business.id),
                lt(s.truck.currentOdometer, created.endingOdometer),
              ),
            )
            .returning(),
        );
      }
      return created;
    });
    const dataset = await this.getDataset();
    return dataset.loads.find((l) => l.id === row.id)!;
  }

  async updateLoad(id: string, input: LoadInput): Promise<Load> {
    const client = await this.clientProvider();
    const business = await this.business(client);
    const truckId = truckIdFor(business, input.truckId);
    await client.transaction(async (tx) => {
      const driverId = await ownedDriverId(tx, business.id, input.driverId);
      const existing = await tx.query.load.findFirst({
        where: and(eq(s.load.id, id), eq(s.load.businessId, business.id)),
      });
      if (!existing)
        throw new Error("That load does not belong to this workspace.");
      const payments = await countRows(
        tx
          .select({ value: sqlCount() })
          .from(s.paymentEvent)
          .where(eq(s.paymentEvent.loadId, id)),
      );
      if (payments > 0) {
        throw new Error(
          "A load with recorded customer payments cannot be deleted.",
        );
      }
      if (existing.truckId !== truckId || existing.driverId !== driverId) {
        const frozen = await countRows(
          tx
            .select({ value: sqlCount() })
            .from(s.driverSettlementLine)
            .where(eq(s.driverSettlementLine.loadId, id)),
        );
        if (frozen > 0) {
          throw new Error(
            "This load is already on a driver settlement. Delete the draft before changing its driver or truck.",
          );
        }
      }
      if (existing.truckId !== truckId) {
        const generatedIds = LOAD_EXPENSE_KEYS.map((key) =>
          loadExpenseId(id, key),
        );
        const linkedExpenses = await countRows(
          tx.select({ value: sqlCount() }).from(s.expense).where(and(
            eq(s.expense.businessId, business.id),
            eq(s.expense.loadId, id),
            ne(s.expense.category, "FUEL"),
            notInArray(s.expense.id, generatedIds),
            or(eq(s.expense.scope, "BUSINESS"), ne(s.expense.truckId, truckId)),
          )),
        );
        if (linkedExpenses > 0) {
          throw new Error(
            "This load has linked costs on another truck. Reassign or unlink them before moving the load.",
          );
        }
      }
      const row = await oneRow(
        tx
          .update(s.load)
          .set(
            updateValues(s.load, {
              ...this.loadData(input),
              truckId,
              driverId,
            }),
          )
          .where(eq(s.load.id, id))
          .returning(),
      );
      await syncDrizzleLoadExpenses(tx, business.id, row);
      if (row.endingOdometer) {
        await affectedRows(
          tx
            .update(s.truck)
            .set(updateValues(s.truck, { currentOdometer: row.endingOdometer }))
            .where(
              and(
                eq(s.truck.id, truckId),
                eq(s.truck.businessId, business.id),
                lt(s.truck.currentOdometer, row.endingOdometer),
              ),
            )
            .returning(),
        );
      }
    });
    const dataset = await this.getDataset();
    return dataset.loads.find((l) => l.id === id)!;
  }

  async updateLoadJurisdictionMiles(
    id: string,
    mileage: Load["jurisdictionMiles"],
  ): Promise<Load> {
    const client = await this.clientProvider();
    const business = await this.business(client);
    await client.transaction(async (tx) => {
      const existing = await tx.query.load.findFirst({
        where: and(eq(s.load.id, id), eq(s.load.businessId, business.id)),
      });
      if (!existing)
        throw new Error("That load does not belong to this workspace.");

      const normalized = normalizeJurisdictionMiles(mileage);
      const assigned = normalized.reduce(
        (total, row) => total + row.totalMiles,
        0,
      );
      if (assigned > existing.loadedMiles + existing.deadheadMiles) {
        throw new Error("Jurisdiction miles cannot exceed total trip miles.");
      }
      await oneRow(
        tx
          .update(s.load)
          .set(updateValues(s.load, { jurisdictionMiles: normalized }))
          .where(eq(s.load.id, existing.id))
          .returning(),
      );
    });

    const dataset = await this.getDataset();
    return dataset.loads.find((load) => load.id === id)!;
  }

  async updateLoadExpense(id: string, amount: number): Promise<Load> {
    const client = await this.clientProvider();
    const business = await this.business(client);
    const loadId = await client.transaction(async (tx) => {
      const expense = await tx.query.expense.findFirst({
        where: and(eq(s.expense.id, id), eq(s.expense.businessId, business.id)),
        columns: { loadId: true },
      });
      if (!expense?.loadId) {
        throw new Error("That expense is not generated by a load.");
      }

      const key = loadExpenseKey(id, expense.loadId);
      if (!key) {
        throw new Error("That expense is not generated by a load.");
      }
      const existing = await tx.query.load.findFirst({
        where: and(
          eq(s.load.id, expense.loadId),
          eq(s.load.businessId, business.id),
        ),
      });
      if (!existing) {
        throw new Error("The load that owns this expense could not be found.");
      }

      const row = await oneRow(
        tx
          .update(s.load)
          .set(
            updateValues(s.load, {
              [loadExpenseField(key)]: roundMoney(amount),
            }),
          )
          .where(eq(s.load.id, existing.id))
          .returning(),
      );
      await syncDrizzleLoadExpenses(tx, business.id, row);
      return row.id;
    });

    const dataset = await this.getDataset();
    return dataset.loads.find((load) => load.id === loadId)!;
  }

  async deleteLoad(id: string): Promise<void> {
    const client = await this.clientProvider();
    const business = await this.business(client);
    await client.transaction(async (tx) => {
      const existing = await tx.query.load.findFirst({
        where: and(eq(s.load.id, id), eq(s.load.businessId, business.id)),
      });
      if (!existing)
        throw new Error("That load does not belong to this workspace.");
      const frozen = await countRows(
        tx
          .select({ value: sqlCount() })
          .from(s.driverSettlementLine)
          .where(eq(s.driverSettlementLine.loadId, id)),
      );
      if (frozen > 0) {
        throw new Error(
          "This load is already on a driver settlement. Delete the draft first; paid statements cannot be changed.",
        );
      }
      await affectedRows(
        tx
          .delete(s.expense)
          .where(
            and(
              eq(s.expense.businessId, business.id),
              inArray(
                s.expense.id,
                LOAD_EXPENSE_KEYS.map((key) => loadExpenseId(id, key)),
              ),
            ),
          )
          .returning(),
      );
      await oneRow(tx.delete(s.load).where(eq(s.load.id, id)).returning());
    });
  }

  async saveBroker(id: string | null, input: BrokerInput): Promise<Broker> {
    const client = await this.clientProvider();
    const business = await this.business(client);
    const row = await client.transaction(async (tx) => {
      const existing = id ? await tx.query.broker.findFirst({ where: and(eq(s.broker.id, id), eq(s.broker.businessId, business.id)) }) : null;
      if (id && !existing) throw new Error("That broker does not belong to this workspace.");
      const nameKey = brokerNameKey(input.name);
      const duplicate = await tx.query.broker.findFirst({ where: and(eq(s.broker.businessId, business.id), eq(s.broker.nameKey, nameKey)) });
      if (duplicate && duplicate.id !== id) throw new Error("A broker with that name already exists.");
      const data = { ...input, name: input.name.trim(), nameKey };
      if (!existing) return oneRow(tx.insert(s.broker).values(insertValues(s.broker, { ...data, businessId: business.id })).returning());
      const loads = await tx.query.load.findMany({ where: eq(s.load.businessId, business.id), columns: { id: true, broker: true } });
      const linked = loads.filter((load) => brokerNameKey(load.broker ?? "") === existing.nameKey).map((load) => load.id);
      if (linked.length) await tx.update(s.load).set(updateValues(s.load, { broker: data.name })).where(and(eq(s.load.businessId, business.id), inArray(s.load.id, linked)));
      return oneRow(tx.update(s.broker).set(updateValues(s.broker, data)).where(and(eq(s.broker.id, existing.id), eq(s.broker.businessId, business.id))).returning());
    });
    return { ...row, contacts: brokerContactsOf(row), createdAt: row.createdAt.toISOString() };
  }

  async saveBrokerContacts(brokerId: string, contacts: BrokerContact[]): Promise<Broker> {
    const client = await this.clientProvider();
    const business = await this.business(client);
    const existing = await client.query.broker.findFirst({ where: and(eq(s.broker.id, brokerId), eq(s.broker.businessId, business.id)) });
    if (!existing) throw new Error("That broker does not belong to this workspace.");
    const row = await oneRow(client.update(s.broker)
      .set(updateValues(s.broker, { contacts, ...clearedLegacyContact(existing) }))
      .where(and(eq(s.broker.id, existing.id), eq(s.broker.businessId, business.id)))
      .returning());
    return { ...row, contacts: brokerContactsOf(row), createdAt: row.createdAt.toISOString() };
  }

  async mergeBroker(sourceId: string, targetId: string): Promise<Broker> {
    if (sourceId === targetId) throw new Error("Choose a different broker to merge into.");
    const client = await this.clientProvider();
    const business = await this.business(client);
    const row = await client.transaction(async (tx) => {
      const scope = (id: string) => and(eq(s.broker.id, id), eq(s.broker.businessId, business.id));
      const [source, target] = await Promise.all([
        tx.query.broker.findFirst({ where: scope(sourceId) }),
        tx.query.broker.findFirst({ where: scope(targetId) }),
      ]);
      if (!source || !target) throw new Error("That broker does not belong to this workspace.");
      const plan = planBrokerMerge(source, target);
      const loads = await tx.query.load.findMany({ where: eq(s.load.businessId, business.id), columns: { id: true, broker: true, brokerContact: true } });
      const moved = loads.filter((load) => brokerNameKey(load.broker ?? "") === source.nameKey);
      if (moved.length) {
        await tx.update(s.load).set(updateValues(s.load, { broker: target.name }))
          .where(and(eq(s.load.businessId, business.id), inArray(s.load.id, moved.map((load) => load.id))));
        const withoutContact = moved.filter((load) => !load.brokerContact?.trim()).map((load) => load.id);
        if (plan.loadContact && withoutContact.length) {
          await tx.update(s.load).set(updateValues(s.load, { brokerContact: plan.loadContact }))
            .where(and(eq(s.load.businessId, business.id), inArray(s.load.id, withoutContact)));
        }
      }
      await tx.delete(s.broker).where(scope(source.id));
      return oneRow(tx.update(s.broker)
        .set(updateValues(s.broker, { ...plan.target, ...clearedLegacyContact(target) }))
        .where(scope(target.id)).returning());
    });
    return { ...row, contacts: brokerContactsOf(row), createdAt: row.createdAt.toISOString() };
  }

  async deleteBroker(id: string): Promise<void> {
    const client = await this.clientProvider();
    const business = await this.business(client);
    const rows = await client.delete(s.broker)
      .where(and(eq(s.broker.id, id), eq(s.broker.businessId, business.id)))
      .returning({ id: s.broker.id });
    if (!rows.length) throw new Error("That broker does not belong to this workspace.");
  }

  async createDriver(input: DriverInput): Promise<Driver> {
    const client = await this.clientProvider();
    const business = await this.business(client);
    const defaultTruckId = input.defaultTruckId
      ? truckIdFor(business, input.defaultTruckId)
      : null;
    const row = await oneRow(
      client
        .insert(s.driver)
        .values(
          insertValues(s.driver, {
            businessId: business.id,
            name: input.name.trim(),
            reference: input.reference?.trim() || null,
            defaultTruckId,
            payType: input.payType,
            payRate: input.payRate,
            isOwnerOperator: input.isOwnerOperator ?? false,
          }),
        )
        .returning(),
    );
    const dataset = await this.getDataset();
    return dataset.drivers.find((driver) => driver.id === row.id)!;
  }

  async updateDriver(id: string, input: DriverInput): Promise<Driver> {
    const client = await this.clientProvider();
    const business = await this.business(client);
    const defaultTruckId = input.defaultTruckId
      ? truckIdFor(business, input.defaultTruckId)
      : null;
    const updated = await affectedRows(
      client
        .update(s.driver)
        .set(
          updateValues(s.driver, {
            name: input.name.trim(),
            reference: input.reference?.trim() || null,
            defaultTruckId,
            payType: input.payType,
            payRate: input.payRate,
            ...(input.isOwnerOperator === undefined ? {} : { isOwnerOperator: input.isOwnerOperator }),
          }),
        )
        .where(and(eq(s.driver.id, id), eq(s.driver.businessId, business.id)))
        .returning(),
    );
    if (updated.count !== 1)
      throw new Error("That driver does not belong to this workspace.");
    const dataset = await this.getDataset();
    return dataset.drivers.find((driver) => driver.id === id)!;
  }

  async setDriverActive(id: string, active: boolean): Promise<Driver> {
    const client = await this.clientProvider();
    const business = await this.business(client);
    const updated = await affectedRows(
      client
        .update(s.driver)
        .set(updateValues(s.driver, { active }))
        .where(and(eq(s.driver.id, id), eq(s.driver.businessId, business.id)))
        .returning(),
    );
    if (updated.count !== 1)
      throw new Error("That driver does not belong to this workspace.");
    const dataset = await this.getDataset();
    return dataset.drivers.find((driver) => driver.id === id)!;
  }

  async createDriverSettlement(
    input: DriverSettlementInput,
  ): Promise<DriverSettlement> {
    const client = await this.clientProvider();
    const business = await this.business(client);
    const row = await client.transaction(async (tx) => {
      const driver = await tx.query.driver.findFirst({
        where: and(
          eq(s.driver.id, input.driverId),
          eq(s.driver.businessId, business.id),
        ),
      });
      if (!driver)
        throw new Error("That driver does not belong to this workspace.");
      const loads = await tx.query.load.findMany({
        where: and(
          eq(s.load.businessId, business.id),
          eq(s.load.driverId, driver.id),
          gte(s.load.date, toDate(input.periodStart)),
          lte(s.load.date, toDate(input.periodEnd)),
          notInArray(
            s.load.id,
            tx
              .select({ id: s.driverSettlementLine.loadId })
              .from(s.driverSettlementLine),
          ),
        ),
        orderBy: [asc(s.load.date), asc(s.load.id)],
      });
      if (loads.length === 0) {
        throw new Error(
          "No unsettled loads are assigned to that driver in this period.",
        );
      }
      const settlement = await oneRow(
        tx
          .insert(s.driverSettlement)
          .values(
            insertValues(s.driverSettlement, {
              businessId: business.id,
              driverId: driver.id,
              periodStart: toDate(input.periodStart),
              periodEnd: toDate(input.periodEnd),
              notes: input.notes?.trim() || null,
            }),
          )
          .returning(),
      );
      await tx.insert(s.driverSettlementLine).values(
        loads.map((load) =>
          insertValues(s.driverSettlementLine, {
            settlementId: settlement.id,
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
          }),
        ),
      );
      return settlement;
    });
    const dataset = await this.getDataset();
    return dataset.driverSettlements.find(
      (settlement) => settlement.id === row.id,
    )!;
  }

  async addDriverSettlementAdjustment(
    settlementId: string,
    input: DriverSettlementAdjustmentInput,
  ) {
    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      throw new Error("Adjustment amount must be greater than zero.");
    }
    if (input.reason.trim().length < 2)
      throw new Error("Explain this adjustment.");
    const client = await this.clientProvider();
    const business = await this.business(client);
    const settlement = await client.query.driverSettlement.findFirst({
      where: and(
        eq(s.driverSettlement.id, settlementId),
        eq(s.driverSettlement.businessId, business.id),
      ),
      with: { lines: true, adjustments: true },
    });
    if (!settlement)
      throw new Error(
        "That driver settlement does not belong to this workspace.",
      );
    if (settlement.status !== "DRAFT")
      throw new Error("Paid statements cannot be changed.");
    const basePay = settlement.lines.reduce(
      (sum, line) => sum + num(line.payAmount),
      0,
    );
    const signedExisting = settlement.adjustments.reduce(
      (sum, row) =>
        sum +
        (row.type === "DEDUCTION" || row.type === "ADVANCE"
          ? -num(row.amount)
          : num(row.amount)),
      0,
    );
    const signedNew =
      input.type === "DEDUCTION" || input.type === "ADVANCE"
        ? -input.amount
        : input.amount;
    if (roundMoney(basePay + signedExisting + signedNew) < 0) {
      throw new Error("This adjustment would make net pay negative.");
    }
    const row = await oneRow(
      client
        .insert(s.driverSettlementAdjustment)
        .values(
          insertValues(s.driverSettlementAdjustment, {
            settlementId,
            type: input.type,
            amount: input.amount,
            reason: input.reason.trim(),
          }),
        )
        .returning(),
    );
    return {
      id: row.id,
      settlementId: row.settlementId,
      type: row.type,
      amount: num(row.amount),
      reason: row.reason,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async deleteDriverSettlementAdjustment(
    settlementId: string,
    adjustmentId: string,
  ): Promise<void> {
    const client = await this.clientProvider();
    const business = await this.business(client);
    const settlement = await client.query.driverSettlement.findFirst({
      where: and(
        eq(s.driverSettlement.id, settlementId),
        eq(s.driverSettlement.businessId, business.id),
      ),
    });
    if (!settlement)
      throw new Error(
        "That driver settlement does not belong to this workspace.",
      );
    if (settlement.status !== "DRAFT")
      throw new Error("Paid statements cannot be changed.");
    const deleted = await affectedRows(
      client
        .delete(s.driverSettlementAdjustment)
        .where(
          and(
            eq(s.driverSettlementAdjustment.id, adjustmentId),
            eq(s.driverSettlementAdjustment.settlementId, settlementId),
          ),
        )
        .returning(),
    );
    if (deleted.count !== 1)
      throw new Error("That adjustment does not belong to this statement.");
  }

  async payDriverSettlement(
    id: string,
    paidOn: string,
  ): Promise<DriverSettlement> {
    const client = await this.clientProvider();
    const business = await this.business(client);
    await client.transaction(async (tx) => {
      const settlement = await tx.query.driverSettlement.findFirst({
        where: and(
          eq(s.driverSettlement.id, id),
          eq(s.driverSettlement.businessId, business.id),
        ),
        with: {
          driver: true,
          lines: { with: { load: true } },
          adjustments: true,
        },
      });
      if (!settlement) {
        throw new Error(
          "That driver settlement does not belong to this workspace.",
        );
      }
      if (settlement.status === "PAID")
        throw new Error("That driver settlement is already paid.");
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
          throw new Error(
            "A load on this draft no longer matches its driver and truck.",
          );
        }
        const expenseId = `expdriver_${line.id}`;
        const allocatedPay = allocations.get(line.id) ?? 0;
        if (allocatedPay > 0) {
          await tx
            .insert(s.expense)
            .values(
              insertValues(s.expense, {
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
              }),
            )
            .onConflictDoNothing({ target: s.expense.id });
        }
        await oneRow(
          tx
            .update(s.driverSettlementLine)
            .set(
              updateValues(s.driverSettlementLine, {
                expenseId: allocatedPay > 0 ? expenseId : null,
              }),
            )
            .where(eq(s.driverSettlementLine.id, line.id))
            .returning(),
        );
        await oneRow(
          tx
            .update(s.load)
            .set(updateValues(s.load, { driverPay: allocatedPay }))
            .where(eq(s.load.id, line.loadId))
            .returning(),
        );
      }
      await oneRow(
        tx
          .update(s.driverSettlement)
          .set(
            updateValues(s.driverSettlement, {
              status: "PAID",
              paidOn: toDate(paidOn),
            }),
          )
          .where(eq(s.driverSettlement.id, settlement.id))
          .returning(),
      );
    });
    const dataset = await this.getDataset();
    return dataset.driverSettlements.find(
      (settlement) => settlement.id === id,
    )!;
  }

  async deleteDriverSettlement(id: string): Promise<void> {
    const client = await this.clientProvider();
    const business = await this.business(client);
    const settlement = await client.query.driverSettlement.findFirst({
      where: and(
        eq(s.driverSettlement.id, id),
        eq(s.driverSettlement.businessId, business.id),
      ),
    });
    if (!settlement)
      throw new Error(
        "That driver settlement does not belong to this workspace.",
      );
    if (settlement.status === "PAID") {
      throw new Error(
        "Paid driver settlements are permanent accounting records.",
      );
    }
    await oneRow(
      client
        .delete(s.driverSettlement)
        .where(eq(s.driverSettlement.id, id))
        .returning(),
    );
  }

  private expenseData(input: ExpenseInput) {
    return {
      date: toDate(input.date),
      category: input.category,
      description: input.description.trim(),
      vendor: input.vendor?.trim() || null,
      amount: roundMoney(input.amount),
      financialTreatment:
        input.financialTreatment ??
        financialTreatmentForCategory(input.category),
      obligationId: input.obligationId,
      splitGroupId: input.splitGroupId,
      loadId: input.category === "FUEL" ? null : input.loadId || null,
      behavior: input.behavior,
      recurring: input.recurring,
      receiptNumber: input.receiptNumber?.trim() || null,
      notes: input.notes?.trim() || null,
    };
  }

  async createExpense(input: ExpenseInput): Promise<Expense> {
    const client = await this.clientProvider();
    const business = await this.business(client);
    const scope = input.scope ?? "TRUCK";
    const truckId =
      scope === "BUSINESS" ? null : truckIdFor(business, input.truckId);
    const loadId = await ownedLoadId(
      client,
      business.id,
      input.category === "FUEL" ? null : input.loadId,
      truckId,
      scope,
    );
    const inputs = expensePaymentRows(input, newId("split"));
    const rows = await client.insert(s.expense).values(inputs.map((part) =>
      insertValues(s.expense, {
        ...this.expenseData(part), loadId, businessId: business.id, scope, truckId,
      }),
    )).returning();
    const row = rows[0];
    const dataset = await this.getDataset();
    return dataset.expenses.find((e) => e.id === row.id)!;
  }

  async updateExpense(id: string, input: ExpenseInput): Promise<Expense> {
    const client = await this.clientProvider();
    const business = await this.business(client);
    if (
      await countRows(
        client
          .select({ value: sqlCount() })
          .from(s.driverSettlementLine)
          .where(
            and(
              eq(s.driverSettlementLine.expenseId, id),
              inArray(
                s.driverSettlementLine.settlementId,
                client
                  .select({ id: s.driverSettlement.id })
                  .from(s.driverSettlement)
                  .where(eq(s.driverSettlement.businessId, business.id)),
              ),
            ),
          ),
      )
    ) {
      throw new Error(
        "Driver Pay expenses are controlled by their paid statement and cannot be edited.",
      );
    }
    if (isLoadExpenseId(id)) throw new Error(mirrorRefusal("LOAD"));
    if (
      await countRows(
        client
          .select({ value: sqlCount() })
          .from(s.fuelEntry)
          .where(
            and(
              eq(s.fuelEntry.expenseId, id),
              eq(s.fuelEntry.businessId, business.id),
            ),
          ),
      )
    ) {
      throw new Error(mirrorRefusal("FUEL"));
    }
    if (
      await countRows(
        client
          .select({ value: sqlCount() })
          .from(s.maintenanceRecord)
          .where(
            and(
              eq(s.maintenanceRecord.expenseId, id),
              eq(s.maintenanceRecord.businessId, business.id),
            ),
          ),
      )
    ) {
      throw new Error(mirrorRefusal("SERVICE"));
    }
    // A treatment set deliberately (a debt payment split writes one) survives
    // an edit only while the category still matches it -- the JSON store does
    // the same, and the two used to disagree on exactly this edit.
    const previous = await client.query.expense.findFirst({
      where: and(eq(s.expense.id, id), eq(s.expense.businessId, business.id)),
      columns: { category: true, financialTreatment: true, splitGroupId: true, obligationId: true },
    });
    if (previous?.splitGroupId) {
      throw new Error(
        "Use the loan payment editor to keep principal and interest balanced.",
      );
    }
    const preservedTreatment =
      previous && previous.category === input.category
        ? previous.financialTreatment
        : null;
    const scope = input.scope ?? "TRUCK";
    const truckId =
      scope === "BUSINESS" ? null : truckIdFor(business, input.truckId);
    const loadId = await ownedLoadId(
      client,
      business.id,
      input.category === "FUEL" ? null : input.loadId,
      truckId,
      scope,
    );
    const inputs = expensePaymentRows({ ...input, obligationId: input.obligationId === undefined ? previous?.obligationId : input.obligationId }, newId("split"));
    await client.transaction(async (tx) => {
      const updated = await affectedRows(tx.update(s.expense).set(updateValues(s.expense, {
        ...this.expenseData(inputs[0]),
        financialTreatment: inputs[0].financialTreatment ?? preservedTreatment ?? financialTreatmentForCategory(input.category),
        loadId, scope, truckId,
      })).where(and(eq(s.expense.id, id), eq(s.expense.businessId, business.id))).returning());
      if (updated.count !== 1) throw new Error("That expense does not belong to this workspace.");
      for (const part of inputs.slice(1)) {
        await tx.insert(s.expense).values(insertValues(s.expense, {
          ...this.expenseData(part), loadId, businessId: business.id, scope, truckId,
        }));
      }
    });
    const dataset = await this.getDataset();
    return dataset.expenses.find((e) => e.id === id)!;
  }

  async stopRecurringExpense(id: string): Promise<void> {
    const client = await this.clientProvider();
    const business = await this.business(client);
    await client.transaction(async (tx) => {
      const rows = await tx.query.expense.findMany({ where: eq(s.expense.businessId, business.id) });
      const ids = recurringSeriesExpenseIds(rows, id);
      await tx.update(s.expense).set({ recurring: false }).where(and(eq(s.expense.businessId, business.id), inArray(s.expense.id, ids)));
    }, { isolationLevel: "serializable" });
  }

  async deleteExpense(id: string): Promise<void> {
    const client = await this.clientProvider();
    const business = await this.business(client);
    await client.transaction(
      async (tx) => {
        const expense = await tx.query.expense.findFirst({
          where: and(
            eq(s.expense.id, id),
            eq(s.expense.businessId, business.id),
          ),
          columns: { id: true, splitGroupId: true },
        });
        if (!expense)
          throw new Error("That expense does not belong to this workspace.");
        const targetRows = expense.splitGroupId
          ? await tx.query.expense.findMany({
              where: and(
                eq(s.expense.businessId, business.id),
                eq(s.expense.splitGroupId, expense.splitGroupId!),
              ),
              columns: { id: true },
            })
          : [expense];
        const targetIds = targetRows.map((row) => row.id);
        if (
          await countRows(
            tx
              .select({ value: sqlCount() })
              .from(s.driverSettlementLine)
              .where(
                and(
                  inArray(s.driverSettlementLine.expenseId, targetIds),
                  inArray(
                    s.driverSettlementLine.settlementId,
                    tx
                      .select({ id: s.driverSettlement.id })
                      .from(s.driverSettlement)
                      .where(eq(s.driverSettlement.businessId, business.id)),
                  ),
                ),
              ),
          )
        ) {
          throw new Error(
            "Driver Pay expenses are controlled by their paid statement and cannot be deleted.",
          );
        }
        // A service record's row is an optional link and may be deleted here --
        // `MaintenanceRecord.expenseId` is `onDelete: SetNull`, so the pointer
        // clears itself. Fuel and load rows are not optional.
        if (targetIds.some(isLoadExpenseId))
          throw new Error(mirrorRefusal("LOAD"));
        if (
          await countRows(
            tx
              .select({ value: sqlCount() })
              .from(s.fuelEntry)
              .where(
                and(
                  inArray(s.fuelEntry.expenseId, targetIds),
                  eq(s.fuelEntry.businessId, business.id),
                ),
              ),
          )
        ) {
          throw new Error(mirrorRefusal("FUEL"));
        }
        const deleted = await affectedRows(
          tx
            .delete(s.expense)
            .where(
              and(
                inArray(s.expense.id, targetIds),
                eq(s.expense.businessId, business.id),
              ),
            )
            .returning(),
        );
        if (deleted.count !== targetIds.length) {
          throw new Error("The complete payment could not be deleted.");
        }
      },
      { isolationLevel: "serializable" },
    );
  }

  async createFinancialObligation(
    input: FinancialObligationInput,
  ): Promise<FinancialObligation> {
    const client = await this.clientProvider();
    const business = await this.business(client);
    const truckId = input.truckId?.trim() || null;
    if (truckId && !business.trucks.some((truck) => truck.id === truckId)) {
      throw new Error("That truck does not belong to this workspace.");
    }
    const active = input.active ?? true;
    const row = await client.transaction(async (tx) => {
      const created = await oneRow(
        tx
          .insert(s.financialObligation)
          .values(
            insertValues(s.financialObligation, {
              businessId: business.id,
              truckId,
              name: input.name.trim(),
              kind: input.kind,
              counterparty: input.counterparty?.trim() || null,
              startedOn: input.startedOn ? toDate(input.startedOn) : null,
              endedOn: input.endedOn ? toDate(input.endedOn) : null,
              startingBalance: input.startingBalance ?? null,
              aprPercent: input.aprPercent ?? null,
              paymentDueDay: input.paymentDueDay ?? null,
              expectedMonthlyPayment: input.expectedMonthlyPayment ?? null,
              active,
            }),
          )
          .returning(),
      );
      if (active && truckId) {
        await affectedRows(
          tx
            .update(s.truck)
            .set(updateValues(s.truck, { financingConfirmedNone: null }))
            .where(
              and(eq(s.truck.id, truckId), eq(s.truck.businessId, business.id)),
            )
            .returning(),
        );
      }
      return created;
    });
    return (await this.getDataset()).financialObligations.find(
      (item) => item.id === row.id,
    )!;
  }

  async updateFinancialObligation(
    id: string,
    input: FinancialObligationInput,
  ): Promise<FinancialObligation> {
    const client = await this.clientProvider();
    const business = await this.business(client);
    const truckId = input.truckId?.trim() || null;
    if (truckId && !business.trucks.some((truck) => truck.id === truckId)) {
      throw new Error("That truck does not belong to this workspace.");
    }
    const active = input.active ?? true;
    await client.transaction(
      async (tx) => {
        const obligation = await tx.query.financialObligation.findFirst({
          where: and(
            eq(s.financialObligation.id, id),
            eq(s.financialObligation.businessId, business.id),
          ),
          columns: { id: true, kind: true },
        });
        if (!obligation)
          throw new Error("That obligation does not belong to this workspace.");
        if (
          input.kind !== obligation.kind &&
          (await countRows(
            tx
              .select({ value: sqlCount() })
              .from(s.expense)
              .where(
                and(
                  eq(s.expense.businessId, business.id),
                  eq(s.expense.obligationId, obligation.id),
                ),
              ),
          )) > 0
        ) {
          throw new Error(
            "The financing type cannot change after payments have been linked.",
          );
        }
        await oneRow(
          tx
            .update(s.financialObligation)
            .set(
              updateValues(s.financialObligation, {
                truckId,
                name: input.name.trim(),
                kind: input.kind,
                counterparty: input.counterparty?.trim() || null,
                startedOn: input.startedOn ? toDate(input.startedOn) : null,
                endedOn: input.endedOn ? toDate(input.endedOn) : null,
                startingBalance: input.startingBalance ?? null,
                aprPercent: input.aprPercent ?? null,
                paymentDueDay: input.paymentDueDay ?? null,
                expectedMonthlyPayment: input.expectedMonthlyPayment ?? null,
                active,
              }),
            )
            .where(eq(s.financialObligation.id, obligation.id))
            .returning(),
        );
        if (active && truckId) {
          await affectedRows(
            tx
              .update(s.truck)
              .set(updateValues(s.truck, { financingConfirmedNone: null }))
              .where(
                and(
                  eq(s.truck.id, truckId),
                  eq(s.truck.businessId, business.id),
                ),
              )
              .returning(),
          );
        }
      },
      { isolationLevel: "serializable" },
    );
    return (await this.getDataset()).financialObligations.find(
      (item) => item.id === id,
    )!;
  }

  async deleteFinancialObligation(id: string): Promise<void> {
    const client = await this.clientProvider();
    const business = await this.business(client);
    // The foreign key uses SET NULL, so every recorded payment survives.
    const deleted = await client.delete(s.financialObligation).where(and(
      eq(s.financialObligation.id, id), eq(s.financialObligation.businessId, business.id),
    )).returning({ id: s.financialObligation.id });
    if (deleted.length !== 1) throw new Error("That obligation does not belong to this workspace.");
  }

  async classifyDebtPayment(
    id: string,
    input: DebtPaymentClassificationInput,
  ): Promise<Expense[]> {
    const client = await this.clientProvider();
    const business = await this.business(client);
    const affectedIds = await client.transaction(
      async (tx) => {
        const expense = await tx.query.expense.findFirst({
          where: and(
            eq(s.expense.id, id),
            eq(s.expense.businessId, business.id),
          ),
        });
        if (!expense)
          throw new Error("That payment does not belong to this workspace.");
        const editingSplit = Boolean(
          expense.splitGroupId &&
            ["PRINCIPAL_PAYMENT", "INTEREST_EXPENSE"].includes(
              expense.category,
            ),
        );
        if (expense.category !== "TRUCK_PAYMENT" && !editingSplit) {
          throw new Error(
            "Only unallocated truck payments can be classified here.",
          );
        }
        if (editingSplit && input.treatment !== "LOAN_SPLIT") {
          throw new Error(
            "An existing loan split can only be updated as principal and interest.",
          );
        }

        let obligationId = input.obligationId?.trim() || null;
        if (input.newObligation) {
          const truckId = input.newObligation.truckId?.trim() || null;
          if (
            truckId &&
            !business.trucks.some((truck) => truck.id === truckId)
          ) {
            throw new Error("That truck does not belong to this workspace.");
          }
          const obligation = await oneRow(
            tx
              .insert(s.financialObligation)
              .values(
                insertValues(s.financialObligation, {
                  businessId: business.id,
                  truckId,
                  name: input.newObligation.name.trim(),
                  kind: input.newObligation.kind,
                  counterparty:
                    input.newObligation.counterparty?.trim() || null,
                  startedOn: input.newObligation.startedOn
                    ? toDate(input.newObligation.startedOn)
                    : null,
                  endedOn: input.newObligation.endedOn
                    ? toDate(input.newObligation.endedOn)
                    : null,
                  startingBalance: input.newObligation.startingBalance ?? null,
                  aprPercent: input.newObligation.aprPercent ?? null,
                  paymentDueDay: input.newObligation.paymentDueDay ?? null,
                  expectedMonthlyPayment:
                    input.newObligation.expectedMonthlyPayment ?? null,
                  active: input.newObligation.active ?? true,
                }),
              )
              .returning(),
          );
          if ((input.newObligation.active ?? true) && truckId) {
            await affectedRows(
              tx
                .update(s.truck)
                .set(updateValues(s.truck, { financingConfirmedNone: null }))
                .where(
                  and(
                    eq(s.truck.id, truckId),
                    eq(s.truck.businessId, business.id),
                  ),
                )
                .returning(),
            );
          }
          obligationId = obligation.id;
        }
        const obligation = obligationId
          ? await tx.query.financialObligation.findFirst({
              where: and(
                eq(s.financialObligation.id, obligationId),
                eq(s.financialObligation.businessId, business.id),
              ),
            })
          : null;
        if (obligationId && !obligation) {
          throw new Error("That obligation does not belong to this workspace.");
        }
        if (input.obligationUpdate) {
          if (!obligation)
            throw new Error(
              "Choose an existing obligation before updating it.",
            );
          const truckId = input.obligationUpdate.truckId?.trim() || null;
          if (
            truckId &&
            !business.trucks.some((truck) => truck.id === truckId)
          ) {
            throw new Error("That truck does not belong to this workspace.");
          }
          await oneRow(
            tx
              .update(s.financialObligation)
              .set(
                updateValues(s.financialObligation, {
                  name: input.obligationUpdate.name.trim(),
                  truckId,
                  startingBalance: input.obligationUpdate.startingBalance,
                  aprPercent: input.obligationUpdate.aprPercent,
                  paymentDueDay: input.obligationUpdate.paymentDueDay,
                  expectedMonthlyPayment:
                    input.obligationUpdate.expectedMonthlyPayment ?? null,
                  active: input.obligationUpdate.active,
                }),
              )
              .where(eq(s.financialObligation.id, obligation.id))
              .returning(),
          );
          if (input.obligationUpdate.active && truckId) {
            await affectedRows(
              tx
                .update(s.truck)
                .set(updateValues(s.truck, { financingConfirmedNone: null }))
                .where(
                  and(
                    eq(s.truck.id, truckId),
                    eq(s.truck.businessId, business.id),
                  ),
                )
                .returning(),
            );
          }
        }
        const normalizedNotes =
          input.notes === undefined ? undefined : input.notes?.trim() || null;

        if (input.treatment === "DEBT_UNALLOCATED") {
          await oneRow(
            tx
              .update(s.expense)
              .set(
                updateValues(s.expense, {
                  financialTreatment: "DEBT_UNALLOCATED",
                  obligationId,
                  ...(normalizedNotes !== undefined
                    ? { notes: normalizedNotes }
                    : {}),
                }),
              )
              .where(eq(s.expense.id, id))
              .returning(),
          );
          return [id];
        }
        if (input.treatment === "OPERATING_LEASE") {
          if (obligation && obligation.kind !== "OPERATING_LEASE") {
            throw new Error(
              "Choose an operating-lease obligation for this treatment.",
            );
          }
          await oneRow(
            tx
              .update(s.expense)
              .set(
                updateValues(s.expense, {
                  category: "OPERATING_LEASE",
                  financialTreatment: "OPERATING",
                  obligationId,
                  ...(normalizedNotes !== undefined
                    ? { notes: normalizedNotes }
                    : {}),
                }),
              )
              .where(eq(s.expense.id, id))
              .returning(),
          );
          return [id];
        }
        if (obligation && obligation.kind !== "LOAN") {
          throw new Error(
            "Choose a loan obligation before recording principal and interest.",
          );
        }
        const existingRows = editingSplit
          ? await tx.query.expense.findMany({
              where: and(
                eq(s.expense.businessId, business.id),
                eq(s.expense.splitGroupId, expense.splitGroupId!),
              ),
            })
          : [expense];
        const currentPaymentAmount = roundMoney(
          existingRows.reduce((total, row) => total + num(row.amount), 0),
        );
        const paymentAmount =
          editingSplit && input.paymentAmount !== undefined
            ? roundMoney(input.paymentAmount)
            : currentPaymentAmount;
        const { principal, interest } = requireExactDebtPaymentSplit(
          paymentAmount,
          input.principalAmount ?? 0,
          input.interestAmount ?? 0,
        );

        if (editingSplit) {
          const splitGroupId = expense.splitGroupId!;
          const principalRow = existingRows.find(
            (row) => row.financialTreatment === "PRINCIPAL",
          );
          const baseRow = principalRow ?? existingRows[0];
          const currentDescription = (
            principalRow?.description ?? baseRow.description
          ).replace(/ · interest$/u, "");
          const baseDescription =
            input.description?.trim() || currentDescription;
          const resolvedDate = input.date ? toDate(input.date) : baseRow.date;
          const resolvedVendor =
            input.vendor === undefined
              ? baseRow.vendor
              : input.vendor?.trim() || null;
          const resolvedRecurring = input.recurring ?? baseRow.recurring;
          const resolvedNotes =
            normalizedNotes === undefined ? baseRow.notes : normalizedNotes;
          const keptIds: string[] = [];

          if (principal > 0) {
            await oneRow(
              tx
                .update(s.expense)
                .set(
                  updateValues(s.expense, {
                    category: "PRINCIPAL_PAYMENT",
                    financialTreatment: "PRINCIPAL",
                    amount: principal,
                    obligationId,
                    description: baseDescription,
                    date: resolvedDate,
                    vendor: resolvedVendor,
                    recurring: resolvedRecurring,
                    notes: resolvedNotes,
                  }),
                )
                .where(eq(s.expense.id, baseRow.id))
                .returning(),
            );
            keptIds.push(baseRow.id);

            if (interest > 0) {
              const existingInterest = existingRows.find(
                (row) =>
                  row.id !== baseRow.id &&
                  row.financialTreatment === "INTEREST",
              );
              if (existingInterest) {
                await oneRow(
                  tx
                    .update(s.expense)
                    .set(
                      updateValues(s.expense, {
                        category: "INTEREST_EXPENSE",
                        financialTreatment: "INTEREST",
                        amount: interest,
                        obligationId,
                        description: `${baseDescription} · interest`,
                        date: resolvedDate,
                        vendor: resolvedVendor,
                        recurring: resolvedRecurring,
                        notes: resolvedNotes,
                      }),
                    )
                    .where(eq(s.expense.id, existingInterest.id))
                    .returning(),
                );
                keptIds.push(existingInterest.id);
              } else {
                const interestRow = await oneRow(
                  tx
                    .insert(s.expense)
                    .values(
                      insertValues(s.expense, {
                        businessId: business.id,
                        truckId: baseRow.truckId,
                        scope: baseRow.scope,
                        loadId: baseRow.loadId,
                        date: resolvedDate,
                        category: "INTEREST_EXPENSE",
                        financialTreatment: "INTEREST",
                        obligationId,
                        splitGroupId,
                        description: `${baseDescription} · interest`,
                        vendor: resolvedVendor,
                        amount: interest,
                        recurring: resolvedRecurring,
                        notes: resolvedNotes,
                      }),
                    )
                    .returning(),
                );
                keptIds.push(interestRow.id);
              }
            }
          } else {
            await oneRow(
              tx
                .update(s.expense)
                .set(
                  updateValues(s.expense, {
                    category: "INTEREST_EXPENSE",
                    financialTreatment: "INTEREST",
                    amount: interest,
                    obligationId,
                    description: `${baseDescription} · interest`,
                    date: resolvedDate,
                    vendor: resolvedVendor,
                    recurring: resolvedRecurring,
                    notes: resolvedNotes,
                  }),
                )
                .where(eq(s.expense.id, baseRow.id))
                .returning(),
            );
            keptIds.push(baseRow.id);
          }

          await affectedRows(
            tx
              .delete(s.expense)
              .where(
                and(
                  eq(s.expense.businessId, business.id),
                  eq(s.expense.splitGroupId, splitGroupId),
                  notInArray(s.expense.id, keptIds),
                ),
              )
              .returning(),
          );
          return keptIds;
        }

        const splitGroupId = newId("split");
        const resolvedNotes =
          normalizedNotes === undefined ? expense.notes : normalizedNotes;
        if (principal <= 0) {
          await oneRow(
            tx
              .update(s.expense)
              .set(
                updateValues(s.expense, {
                  category: "INTEREST_EXPENSE",
                  financialTreatment: "INTEREST",
                  amount: interest,
                  obligationId,
                  splitGroupId,
                  notes: resolvedNotes,
                }),
              )
              .where(eq(s.expense.id, id))
              .returning(),
          );
          return [id];
        }
        await oneRow(
          tx
            .update(s.expense)
            .set(
              updateValues(s.expense, {
                category: "PRINCIPAL_PAYMENT",
                financialTreatment: "PRINCIPAL",
                amount: principal,
                obligationId,
                splitGroupId,
                notes: resolvedNotes,
              }),
            )
            .where(eq(s.expense.id, id))
            .returning(),
        );
        if (interest <= 0) return [id];
        const interestRow = await oneRow(
          tx
            .insert(s.expense)
            .values(
              insertValues(s.expense, {
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
                notes: resolvedNotes,
              }),
            )
            .returning(),
        );
        return [id, interestRow.id];
      },
      { isolationLevel: "serializable" },
    );
    const dataset = await this.getDataset();
    return dataset.expenses.filter((expense) =>
      affectedIds.includes(expense.id),
    );
  }

  async createPaymentEvent(input: PaymentEventInput): Promise<PaymentEvent> {
    const client = await this.clientProvider();
    const business = await this.business(client);
    const row = await client.transaction(
      async (tx) => {
        const load = await tx.query.load.findFirst({
          where: and(
            eq(s.load.id, input.loadId),
            eq(s.load.businessId, business.id),
          ),
        });
        if (!load?.invoiceNumber)
          throw new Error("Issue the invoice before recording a payment.");
        const events = await tx.query.paymentEvent.findMany({
          where: eq(s.paymentEvent.loadId, load.id),
        });
        const recorded =
          events.length === 0 && load.status === "PAID"
            ? num(load.grossRate)
            : events.reduce((total, event) => total + num(event.amount), 0);
        const remaining = roundMoney(num(load.grossRate) - recorded);
        if (input.amount > remaining)
          throw new Error("Payment cannot exceed the invoice balance.");
        const event = await oneRow(
          tx
            .insert(s.paymentEvent)
            .values(
              insertValues(s.paymentEvent, {
                businessId: business.id,
                loadId: load.id,
                date: toDate(input.date),
                amount: roundMoney(input.amount),
                method: input.method?.trim() || null,
                reference: input.reference?.trim() || null,
                notes: input.notes?.trim() || null,
              }),
            )
            .returning(),
        );
        const fullyPaid =
          roundMoney(recorded + input.amount) >= num(load.grossRate);
        await oneRow(
          tx
            .update(s.load)
            .set(
              updateValues(s.load, {
                status: fullyPaid ? "PAID" : "INVOICED",
                invoicePaidDate: fullyPaid ? toDate(input.date) : null,
              }),
            )
            .where(eq(s.load.id, load.id))
            .returning(),
        );
        return event;
      },
      { isolationLevel: "serializable" },
    );
    return (await this.getDataset()).paymentEvents.find(
      (event) => event.id === row.id,
    )!;
  }

  private fuelData(input: FuelEntryInput) {
    return {
      date: toDate(input.date),
      gallons: input.gallons,
      pricePerGallon: input.pricePerGallon,
      station: input.station?.trim() || null,
      totalCost: roundMoney(input.totalCost),
      odometer: input.odometer ?? null,
      location: input.location?.trim() || null,
      jurisdiction: input.jurisdiction?.trim().toUpperCase() || null,
      loadId: null,
      notes: input.notes?.trim() || null,
    };
  }

  async createFuelEntry(input: FuelEntryInput): Promise<FuelEntry> {
    const client = await this.clientProvider();
    const business = await this.business(client);
    const truckId = truckIdFor(business, input.truckId);
    const data = this.fuelData(input);

    const row = await client.transaction(async (tx) => {
      if (input.sourceExpenseId) {
        const [source] = await tx.select().from(s.expense)
          .where(and(eq(s.expense.id, input.sourceExpenseId), eq(s.expense.businessId, business.id)))
          .for("update");
        const [fuelLink, serviceLink, driverLink] = await Promise.all([
          tx.query.fuelEntry.findFirst({ where: eq(s.fuelEntry.expenseId, input.sourceExpenseId) }),
          tx.query.maintenanceRecord.findFirst({ where: eq(s.maintenanceRecord.expenseId, input.sourceExpenseId) }),
          tx.query.driverSettlementLine.findFirst({ where: eq(s.driverSettlementLine.expenseId, input.sourceExpenseId) }),
        ]);
        assertFuelExpenseSource(source, Boolean(fuelLink || serviceLink || driverLink));
      }
      const created = await oneRow(
        tx
          .insert(s.fuelEntry)
          .values(
            insertValues(s.fuelEntry, {
              ...data,
              businessId: business.id,
              truckId,
            }),
          )
          .returning(),
      );
      // Complete an existing purchase in place; never write a second expense.
      const mirrorData = {
        truckId, scope: "TRUCK" as const, loadId: data.loadId, date: data.date,
        category: "FUEL" as const, financialTreatment: "OPERATING" as const,
        description: fuelDescription(input.gallons, input.pricePerGallon),
        vendor: data.station || data.location, amount: data.totalCost, recurring: false,
      };
      const mirror = input.sourceExpenseId
        ? await oneRow(tx.update(s.expense).set(updateValues(s.expense, mirrorData))
            .where(and(eq(s.expense.id, input.sourceExpenseId), eq(s.expense.businessId, business.id))).returning())
        : await oneRow(tx.insert(s.expense).values(insertValues(s.expense, { ...mirrorData, businessId: business.id })).returning());
      await oneRow(
        tx
          .update(s.fuelEntry)
          .set(updateValues(s.fuelEntry, { expenseId: mirror.id }))
          .where(eq(s.fuelEntry.id, created.id))
          .returning(),
      );

      if (data.odometer) {
        await affectedRows(
          tx
            .update(s.truck)
            .set(updateValues(s.truck, { currentOdometer: data.odometer }))
            .where(
              and(
                eq(s.truck.id, truckId),
                lt(s.truck.currentOdometer, data.odometer),
              ),
            )
            .returning(),
        );
      }
      return created;
    });

    const dataset = await this.getDataset();
    return dataset.fuelEntries.find((f) => f.id === row.id)!;
  }

  async updateFuelEntry(id: string, input: FuelEntryInput): Promise<FuelEntry> {
    const client = await this.clientProvider();
    const business = await this.business(client);
    const truckId = truckIdFor(business, input.truckId);
    const data = this.fuelData(input);

    await client.transaction(async (tx) => {
      const existing = await tx.query.fuelEntry.findFirst({
        where: and(
          eq(s.fuelEntry.id, id),
          eq(s.fuelEntry.businessId, business.id),
        ),
      });
      if (!existing)
        throw new Error("That fuel entry does not belong to this workspace.");
      await affectedRows(
        tx
          .update(s.fuelEntry)
          .set(updateValues(s.fuelEntry, { ...data, truckId }))
          .where(
            and(
              eq(s.fuelEntry.id, id),
              eq(s.fuelEntry.businessId, business.id),
            ),
          )
          .returning(),
      );

      // Keep the ledger row in step, or the Fuel page and the Expenses page
      // permanently disagree about the same money.
      const mirror = {
        loadId: data.loadId,
        date: data.date,
        truckId,
        description: fuelDescription(input.gallons, input.pricePerGallon),
        vendor: data.station || data.location,
        amount: data.totalCost,
      };

      if (existing.expenseId) {
        await affectedRows(
          tx
            .update(s.expense)
            .set(updateValues(s.expense, mirror))
            .where(
              and(
                eq(s.expense.id, existing.expenseId),
                eq(s.expense.businessId, business.id),
              ),
            )
            .returning(),
        );
      } else {
        const created = await oneRow(
          tx
            .insert(s.expense)
            .values(
              insertValues(s.expense, {
                ...mirror,
                businessId: business.id,
                category: "FUEL",
                recurring: false,
              }),
            )
            .returning(),
        );
        await affectedRows(
          tx
            .update(s.fuelEntry)
            .set(updateValues(s.fuelEntry, { expenseId: created.id }))
            .where(
              and(
                eq(s.fuelEntry.id, id),
                eq(s.fuelEntry.businessId, business.id),
              ),
            )
            .returning(),
        );
      }
      if (data.odometer) {
        await affectedRows(
          tx
            .update(s.truck)
            .set(updateValues(s.truck, { currentOdometer: data.odometer }))
            .where(
              and(
                eq(s.truck.id, truckId),
                eq(s.truck.businessId, business.id),
                lt(s.truck.currentOdometer, data.odometer),
              ),
            )
            .returning(),
        );
      }
      for (const loadId of new Set(
        [existing.loadId, data.loadId].filter(Boolean),
      )) {
        const load = await tx.query.load.findFirst({
          where: and(
            eq(s.load.id, loadId!),
            eq(s.load.businessId, business.id),
          ),
        });
        if (load) await syncDrizzleLoadExpenses(tx, business.id, load);
      }
    });

    const dataset = await this.getDataset();
    return dataset.fuelEntries.find((f) => f.id === id)!;
  }

  async deleteFuelEntry(id: string): Promise<void> {
    const client = await this.clientProvider();
    const business = await this.business(client);
    await client.transaction(async (tx) => {
      const existing = await tx.query.fuelEntry.findFirst({
        where: and(
          eq(s.fuelEntry.id, id),
          eq(s.fuelEntry.businessId, business.id),
        ),
      });
      if (!existing)
        throw new Error("That fuel entry does not belong to this workspace.");
      await affectedRows(
        tx
          .delete(s.fuelEntry)
          .where(
            and(
              eq(s.fuelEntry.id, id),
              eq(s.fuelEntry.businessId, business.id),
            ),
          )
          .returning(),
      );
      // Without this the spend stays in operating expenses forever with no
      // fill-up left to trace it back to.
      if (existing?.expenseId) {
        await affectedRows(
          tx
            .delete(s.expense)
            .where(
              and(
                eq(s.expense.id, existing.expenseId),
                eq(s.expense.businessId, business.id),
              ),
            )
            .returning(),
        );
      }
      if (existing.loadId) {
        const load = await tx.query.load.findFirst({
          where: and(
            eq(s.load.id, existing.loadId),
            eq(s.load.businessId, business.id),
          ),
        });
        if (load) await syncDrizzleLoadExpenses(tx, business.id, load);
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
        input.basis !== "MILEAGE" && input.nextServiceDate
          ? toDate(input.nextServiceDate)
          : null,
      nextServiceOdometer:
        input.basis !== "DATE" ? (input.nextServiceOdometer ?? null) : null,
      notes: input.notes?.trim() || null,
    };
  }

  async createMaintenance(input: MaintenanceInput): Promise<MaintenanceRecord> {
    const client = await this.clientProvider();
    const business = await this.business(client);
    const truckId = truckIdFor(business, input.truckId);
    const data = this.maintenanceData(input);

    const row = await client.transaction(async (tx) => {
      let expenseId: string | null = null;

      if (input.recordAsExpense && input.cost > 0) {
        const expense = await oneRow(
          tx
            .insert(s.expense)
            .values(
              insertValues(s.expense, {
                businessId: business.id,
                truckId,
                date: data.serviceDate,
                category: maintenanceExpenseCategory(input.type),
                description: `${prettyMaintenance(input.type)}${data.vendor ? ` - ${data.vendor}` : ""}`,
                vendor: data.vendor,
                amount: data.cost,
                recurring: false,
                notes: "Logged from the maintenance service record.",
              }),
            )
            .returning(),
        );
        expenseId = expense.id;
      }

      if (data.odometer) {
        await affectedRows(
          tx
            .update(s.truck)
            .set(updateValues(s.truck, { currentOdometer: data.odometer }))
            .where(
              and(
                eq(s.truck.id, truckId),
                lt(s.truck.currentOdometer, data.odometer),
              ),
            )
            .returning(),
        );
      }

      return oneRow(
        tx
          .insert(s.maintenanceRecord)
          .values(
            insertValues(s.maintenanceRecord, {
              ...data,
              businessId: business.id,
              truckId,
              expenseId,
            }),
          )
          .returning(),
      );
    });

    return (await this.getDataset()).maintenanceRecords.find(
      (m) => m.id === row.id,
    )!;
  }

  async updateMaintenance(
    id: string,
    input: MaintenanceInput,
  ): Promise<MaintenanceRecord> {
    const client = await this.clientProvider();
    const business = await this.business(client);
    const data = this.maintenanceData(input);

    await client.transaction(async (tx) => {
      const existing = await tx.query.maintenanceRecord.findFirst({
        where: and(
          eq(s.maintenanceRecord.id, id),
          eq(s.maintenanceRecord.businessId, business.id),
        ),
      });
      if (!existing)
        throw new Error(
          "That service record does not belong to this workspace.",
        );
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
          await affectedRows(
            tx
              .update(s.expense)
              .set(updateValues(s.expense, payload))
              .where(
                and(
                  eq(s.expense.id, expenseId),
                  eq(s.expense.businessId, business.id),
                ),
              )
              .returning(),
          );
        } else {
          const created = await oneRow(
            tx
              .insert(s.expense)
              .values(
                insertValues(s.expense, {
                  ...payload,
                  businessId: business.id,
                  truckId: existing.truckId,
                  recurring: false,
                  notes: "Logged from the maintenance service record.",
                }),
              )
              .returning(),
          );
          expenseId = created.id;
        }
      } else if (expenseId) {
        await affectedRows(
          tx
            .delete(s.expense)
            .where(
              and(
                eq(s.expense.id, expenseId),
                eq(s.expense.businessId, business.id),
              ),
            )
            .returning(),
        );
        expenseId = null;
      }

      await affectedRows(
        tx
          .update(s.maintenanceRecord)
          .set(updateValues(s.maintenanceRecord, { ...data, expenseId }))
          .where(
            and(
              eq(s.maintenanceRecord.id, id),
              eq(s.maintenanceRecord.businessId, business.id),
            ),
          )
          .returning(),
      );
    });

    return (await this.getDataset()).maintenanceRecords.find(
      (m) => m.id === id,
    )!;
  }

  async deleteMaintenance(id: string): Promise<void> {
    const client = await this.clientProvider();
    const business = await this.business(client);
    // One transaction: a half-applied delete would leave an orphaned ledger
    // row that is invisible in the UI but still counted in every total.
    await client.transaction(async (tx) => {
      const existing = await tx.query.maintenanceRecord.findFirst({
        where: and(
          eq(s.maintenanceRecord.id, id),
          eq(s.maintenanceRecord.businessId, business.id),
        ),
      });
      if (!existing)
        throw new Error(
          "That service record does not belong to this workspace.",
        );
      await affectedRows(
        tx
          .delete(s.maintenanceRecord)
          .where(
            and(
              eq(s.maintenanceRecord.id, id),
              eq(s.maintenanceRecord.businessId, business.id),
            ),
          )
          .returning(),
      );
      if (existing?.expenseId) {
        await affectedRows(
          tx
            .delete(s.expense)
            .where(
              and(
                eq(s.expense.id, existing.expenseId),
                eq(s.expense.businessId, business.id),
              ),
            )
            .returning(),
        );
      }
    });
  }

  /* ---- Documents ----------------------------------------------------- */

  async createDocument(input: DocumentInput): Promise<Document> {
    const client = await this.clientProvider();
    const business = await this.business(client);
    await assertDocumentTargets(client, business, input);
    const row = await oneRow(
      client
        .insert(s.document)
        .values(
          insertValues(s.document, {
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
          }),
        )
        .returning(),
    );
    return (await this.getDataset()).documents.find((d) => d.id === row.id)!;
  }

  async deleteDocument(id: string): Promise<string | null> {
    const client = await this.clientProvider();
    const business = await this.business(client);
    const existing = await client.query.document.findFirst({
      where: and(eq(s.document.id, id), eq(s.document.businessId, business.id)),
    });
    if (!existing) return null;
    await affectedRows(
      client
        .delete(s.document)
        .where(
          and(eq(s.document.id, id), eq(s.document.businessId, business.id)),
        )
        .returning(),
    );
    return existing.storageKey;
  }

  async updateSettings(input: SettingsInput): Promise<FinancialSettings> {
    const client = await this.clientProvider();
    const business = await this.business(client);
    await oneRow(
      client
        .insert(s.financialSettings)
        .values(
          insertValues(s.financialSettings, {
            businessId: business.id,
            taxReservePct: input.taxReservePct,
            maintenanceReservePct: input.maintenanceReservePct,
            categoryBehavior:
              input.categoryBehavior ?? defaultCategoryBehavior(),
            ratingGreatPerMile: input.ratingGreatPerMile,
            ratingGoodPerMile: input.ratingGoodPerMile,
            ratingMarginalPerMile: input.ratingMarginalPerMile,
            deadheadWarnPct: input.deadheadWarnPct,
            maintenanceWarnMiles: Math.round(input.maintenanceWarnMiles),
            maintenanceWarnDays: Math.round(input.maintenanceWarnDays),
            iftaTaxRates: input.iftaTaxRates ?? {},
            fleetOverheadAllocation:
              input.fleetOverheadAllocation ?? "UNALLOCATED",
          }),
        )
        .onConflictDoUpdate({
          target: s.financialSettings.businessId,
          set: updateValues(s.financialSettings, {
            taxReservePct: input.taxReservePct,
            maintenanceReservePct: input.maintenanceReservePct,
            ...(input.categoryBehavior
              ? { categoryBehavior: input.categoryBehavior }
              : {}),
            ratingGreatPerMile: input.ratingGreatPerMile,
            ratingGoodPerMile: input.ratingGoodPerMile,
            ratingMarginalPerMile: input.ratingMarginalPerMile,
            deadheadWarnPct: input.deadheadWarnPct,
            maintenanceWarnMiles: Math.round(input.maintenanceWarnMiles),
            maintenanceWarnDays: Math.round(input.maintenanceWarnDays),
            ...(input.iftaTaxRates ? { iftaTaxRates: input.iftaTaxRates } : {}),
            ...(input.fleetOverheadAllocation
              ? { fleetOverheadAllocation: input.fleetOverheadAllocation }
              : {}),
          }),
        })
        .returning(),
    );
    return (await this.getDataset()).settings;
  }

  async updateBusiness(input: BusinessInput): Promise<Business> {
    const client = await this.clientProvider();
    const business = await this.business(client);
    await oneRow(
      client
        .update(s.business)
        .set(
          updateValues(s.business, {
            name: input.name,
            currency: input.currency,
          }),
        )
        .where(eq(s.business.id, business.id))
        .returning(),
    );
    return (await this.getDataset()).business;
  }

  async createTruck(input: TruckInput): Promise<Truck> {
    const client = await this.clientProvider();
    const business = await this.business(client);

    const name = input.name.trim();
    const clash = await client.query.truck.findFirst({
      where: and(
        eq(s.truck.businessId, business.id),
        eq(s.truck.active, true),
        eq(s.truck.name, name),
      ),
    });
    if (clash) throw new Error(`You already have a truck called ${name}.`);

    const row = await oneRow(
      client
        .insert(s.truck)
        .values(
          insertValues(s.truck, {
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
            financingConfirmedNone: null,
            operatingCostExemptions: {},
            axleCount: input.axleCount ?? null,
            referenceMpg: input.referenceMpg ?? null,
            registeredGrossWeightLbs: input.registeredGrossWeightLbs ?? null,
            operatesInMultipleIftaJurisdictions:
              input.operatesInMultipleIftaJurisdictions ?? null,
            iftaReportingEnabled: input.iftaReportingEnabled ?? null,
            startingOdometer: input.startingOdometer,
            currentOdometer: input.currentOdometer,
          }),
        )
        .returning(),
    );
    return requireTruck(await this.getDataset(), row.id);
  }

  async updateTruck(input: TruckInput, id?: string): Promise<Truck> {
    const client = await this.clientProvider();
    const business = await this.business(client);
    const targetId = id ?? business.trucks[0].id;
    if (!business.trucks.some((truck) => truck.id === targetId)) {
      throw new Error("That truck does not belong to this workspace.");
    }

    await affectedRows(
      client
        .update(s.truck)
        .set(
          updateValues(s.truck, {
            name: input.name.trim(),
            ...(input.acquiredOn === undefined
              ? {}
              : {
                  acquiredOn: input.acquiredOn
                    ? toDate(input.acquiredOn)
                    : null,
                }),
            year: input.year ?? null,
            make: input.make ?? null,
            model: input.model ?? null,
            vin: input.vin ?? null,
            purchasePrice: input.purchasePrice ?? null,
            monthlyPayment: input.monthlyPayment ?? null,
            monthlyInsurance: input.monthlyInsurance ?? null,
            ...((input.monthlyPayment ?? 0) > 0
              ? { financingConfirmedNone: null }
              : {}),
            ...(input.axleCount === undefined
              ? {}
              : { axleCount: input.axleCount }),
            ...(input.referenceMpg === undefined
              ? {}
              : { referenceMpg: input.referenceMpg }),
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
          }),
        )
        .where(
          and(eq(s.truck.id, targetId), eq(s.truck.businessId, business.id)),
        )
        .returning(),
    );
    return requireTruck(await this.getDataset(), targetId);
  }

  async setTruckFinancingConfirmedNone(
    id: string,
    value: boolean | null,
  ): Promise<Truck> {
    const client = await this.clientProvider();
    const business = await this.business(client);
    if (!business.trucks.some((truck) => truck.id === id)) {
      throw new Error("That truck does not belong to this workspace.");
    }
    await affectedRows(
      client
        .update(s.truck)
        .set(updateValues(s.truck, { financingConfirmedNone: value }))
        .where(and(eq(s.truck.id, id), eq(s.truck.businessId, business.id)))
        .returning(),
    );
    return requireTruck(await this.getDataset(), id);
  }

  async setTruckOperatingCostExemptions(
    id: string,
    exemptions: NonNullable<Truck["operatingCostExemptions"]>,
  ): Promise<Truck> {
    const client = await this.clientProvider();
    const business = await this.business(client);
    if (!business.trucks.some((truck) => truck.id === id)) {
      throw new Error("That truck does not belong to this workspace.");
    }
    await affectedRows(
      client
        .update(s.truck)
        .set(updateValues(s.truck, { operatingCostExemptions: exemptions }))
        .where(and(eq(s.truck.id, id), eq(s.truck.businessId, business.id)))
        .returning(),
    );
    return requireTruck(await this.getDataset(), id);
  }

  /** Retires a unit. Deletes nothing -- its history stays in past reports. */
  async archiveTruck(id: string, soldOn?: string | null): Promise<Truck> {
    const client = await this.clientProvider();
    const business = await this.business(client);
    if (!business.trucks.some((truck) => truck.id === id)) {
      throw new Error("That truck does not belong to this workspace.");
    }
    const active = await countRows(
      client
        .select({ value: sqlCount() })
        .from(s.truck)
        .where(
          and(eq(s.truck.businessId, business.id), eq(s.truck.active, true)),
        ),
    );
    if (active <= 1) {
      throw new Error(
        "This is your only active truck. Add another one before retiring it.",
      );
    }
    await affectedRows(
      client
        .update(s.truck)
        .set(
          updateValues(s.truck, {
            active: false,
            soldOn: soldOn ? toDate(soldOn) : null,
          }),
        )
        .where(and(eq(s.truck.id, id), eq(s.truck.businessId, business.id)))
        .returning(),
    );
    return requireTruck(await this.getDataset(), id);
  }

  async restoreTruck(id: string): Promise<Truck> {
    const client = await this.clientProvider();
    const business = await this.business(client);
    if (!business.trucks.some((truck) => truck.id === id)) {
      throw new Error("That truck does not belong to this workspace.");
    }
    await affectedRows(
      client
        .update(s.truck)
        .set(updateValues(s.truck, { active: true, soldOn: null }))
        .where(and(eq(s.truck.id, id), eq(s.truck.businessId, business.id)))
        .returning(),
    );
    return requireTruck(await this.getDataset(), id);
  }

  /* ---- Goals --------------------------------------------------------- */

  async updateSubscription(input: SubscriptionInput): Promise<Subscription> {
    const client = await this.clientProvider();
    const business = await this.business(client);
    const data = {
      plan: input.plan,
      ...(input.status ? { status: input.status } : {}),
      ...(input.currentPeriodEnd === undefined
        ? {}
        : {
            currentPeriodEnd: input.currentPeriodEnd
              ? new Date(input.currentPeriodEnd + "T00:00:00.000Z")
              : null,
          }),
      ...(input.providerCustomerId === undefined
        ? {}
        : { providerCustomerId: input.providerCustomerId }),
      ...(input.providerSubscriptionId === undefined
        ? {}
        : { providerSubscriptionId: input.providerSubscriptionId }),
    };
    await oneRow(
      client
        .insert(s.subscription)
        .values(
          insertValues(s.subscription, { businessId: business.id, ...data }),
        )
        .onConflictDoUpdate({
          target: s.subscription.businessId,
          set: updateValues(s.subscription, data),
        })
        .returning(),
    );
    return (await this.getDataset()).subscription;
  }

  async updateGoals(input: GoalInput): Promise<FinancialGoal> {
    const client = await this.clientProvider();
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
    await oneRow(
      client
        .insert(s.financialGoal)
        .values(
          insertValues(s.financialGoal, { businessId: business.id, ...data }),
        )
        .onConflictDoUpdate({
          target: s.financialGoal.businessId,
          set: updateValues(s.financialGoal, data),
        })
        .returning(),
    );
    return (await this.getDataset()).goals;
  }

  /* ---- Reserve buckets ------------------------------------------------ */

  async createReserveAccount(
    input: ReserveAccountInput,
  ): Promise<ReserveAccount> {
    const client = await this.clientProvider();
    const business = await this.business(client);
    await ensureReserveAccounts(client, business.id);
    const count = await countRows(
      client
        .select({ value: sqlCount() })
        .from(s.reserveAccount)
        .where(eq(s.reserveAccount.businessId, business.id)),
    );
    const row = await oneRow(
      client
        .insert(s.reserveAccount)
        .values(
          insertValues(s.reserveAccount, {
            businessId: business.id,
            kind: input.kind,
            name: input.name.trim(),
            basis: input.basis,
            contributionPct: input.contributionPct ?? null,
            targetBalance: input.targetBalance ?? null,
            active: input.active ?? true,
            sortOrder: count,
          }),
        )
        .returning(),
    );
    const created = (await this.getDataset()).reserveAccounts.find(
      (a) => a.id === row.id,
    );
    if (!created)
      throw new Error("Reserve bucket could not be read back after creation.");
    return created;
  }

  async updateReserveAccount(
    id: string,
    input: ReserveAccountInput,
  ): Promise<ReserveAccount> {
    const client = await this.clientProvider();
    const business = await this.business(client);
    const existing = await client.query.reserveAccount.findFirst({
      where: and(
        eq(s.reserveAccount.id, id),
        eq(s.reserveAccount.businessId, business.id),
      ),
    });
    if (!existing) throw new Error(`Reserve account ${id} not found`);

    await oneRow(
      client
        .update(s.reserveAccount)
        .set(
          updateValues(s.reserveAccount, {
            name: input.name.trim(),
            basis: input.basis,
            contributionPct:
              existing.kind === "TAX" || existing.kind === "MAINTENANCE"
                ? null
                : (input.contributionPct ?? null),
            targetBalance: input.targetBalance ?? null,
            active: input.active ?? existing.active,
          }),
        )
        .where(eq(s.reserveAccount.id, id))
        .returning(),
    );
    const updated = (await this.getDataset()).reserveAccounts.find(
      (a) => a.id === id,
    );
    if (!updated) throw new Error(`Reserve account ${id} not found`);
    return updated;
  }

  async deleteReserveAccount(id: string): Promise<void> {
    const client = await this.clientProvider();
    const business = await this.business(client);
    const existing = await client.query.reserveAccount.findFirst({
      where: and(
        eq(s.reserveAccount.id, id),
        eq(s.reserveAccount.businessId, business.id),
      ),
    });
    if (!existing) return;
    if (existing.kind === "TAX" || existing.kind === "MAINTENANCE") {
      throw new Error("The tax and maintenance buckets cannot be deleted.");
    }
    await oneRow(
      client
        .delete(s.reserveAccount)
        .where(eq(s.reserveAccount.id, id))
        .returning(),
    );
  }

  async createReserveTransaction(
    input: ReserveTransactionInput,
  ): Promise<ReserveTransaction> {
    const client = await this.clientProvider();
    const business = await this.business(client);
    const account = await client.query.reserveAccount.findFirst({
      where: and(
        eq(s.reserveAccount.id, input.accountId),
        eq(s.reserveAccount.businessId, business.id),
      ),
    });
    if (!account) throw new Error("That reserve bucket no longer exists.");

    const magnitude = Math.abs(roundMoney(input.amount));
    const signed =
      input.type === "WITHDRAWAL"
        ? -magnitude
        : input.type === "ADJUSTMENT" && input.negative
          ? -magnitude
          : magnitude;

    const row = await oneRow(
      client
        .insert(s.reserveTransaction)
        .values(
          insertValues(s.reserveTransaction, {
            businessId: business.id,
            accountId: input.accountId,
            date: toDate(input.date),
            type: input.type,
            amount: signed,
            description: input.description.trim(),
          }),
        )
        .returning(),
    );

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
    const client = await this.clientProvider();
    const business = await this.business(client);
    const row = await client.query.reserveTransaction.findFirst({
      where: and(
        eq(s.reserveTransaction.id, id),
        eq(s.reserveTransaction.businessId, business.id),
      ),
    });
    if (!row) return;
    if (row.settlementId) {
      throw new Error(
        "That contribution was posted by a closed settlement. Reopen the settlement to remove it.",
      );
    }
    await oneRow(
      client
        .delete(s.reserveTransaction)
        .where(eq(s.reserveTransaction.id, id))
        .returning(),
    );
  }

  /* ---- Settlements ---------------------------------------------------- */

  async ensureSettlement(
    month: string,
    half: SettlementHalf,
  ): Promise<Settlement> {
    const client = await this.clientProvider();
    const business = await this.business(client);
    const [year, monthPart] = month
      .split("-")
      .map((part) => Number.parseInt(part, 10));
    const lastDay = new Date(Date.UTC(year, monthPart, 0)).getUTCDate();
    const periodStart = half === "FIRST" ? `${month}-01` : `${month}-16`;
    const periodEnd =
      half === "FIRST"
        ? `${month}-15`
        : `${month}-${String(lastDay).padStart(2, "0")}`;

    const inserted = await client
      .insert(s.settlement)
      .values(
        insertValues(s.settlement, {
          businessId: business.id,
          month,
          half,
          periodStart: toDate(periodStart),
          periodEnd: toDate(periodEnd),
          status: "OPEN",
        }),
      )
      .onConflictDoNothing({
        target: [
          s.settlement.businessId,
          s.settlement.month,
          s.settlement.half,
        ],
      })
      .returning();
    const row =
      inserted[0] ??
      (await client.query.settlement.findFirst({
        where: and(
          eq(s.settlement.businessId, business.id),
          eq(s.settlement.month, month),
          eq(s.settlement.half, half),
        ),
      }));
    if (!row)
      throw new Error("The settlement changed concurrently. Please retry.");
    return requireSettlement(await this.getDataset(), row.id);
  }

  async closeSettlement(
    id: string,
    input: SettlementCloseInput,
  ): Promise<Settlement> {
    const client = await this.clientProvider();
    const business = await this.business(client);
    const existing = await client.query.settlement.findFirst({
      where: and(
        eq(s.settlement.id, id),
        eq(s.settlement.businessId, business.id),
      ),
    });
    if (!existing) throw new Error(`Settlement ${id} not found`);
    if (existing.status === "CLOSED")
      throw new Error("That settlement is already closed.");

    await client.transaction(async (tx) => {
      await oneRow(
        tx
          .update(s.settlement)
          .set(
            updateValues(s.settlement, {
              status: "CLOSED",
              closedAt: new Date(),
              // Frozen on purpose: a closed settlement is a statement of what the
              // owner settled on, not a live query.
              snapshot: input.snapshot as unknown as object,
              notes: input.notes?.trim() || existing.notes,
            }),
          )
          .where(eq(s.settlement.id, id))
          .returning(),
      );
      // Same guard the JSON store applies: a contribution naming a bucket that
      // is no longer there is skipped, never allowed to fail the close.
      const accountIds = new Set(
        (
          await tx.query.reserveAccount.findMany({
            where: eq(s.reserveAccount.businessId, business.id),
            columns: { id: true },
          })
        ).map((row) => row.id),
      );

      for (const contribution of input.contributions) {
        const amount = roundMoney(contribution.amount);
        if (amount <= 0) continue;
        if (!accountIds.has(contribution.accountId)) continue;
        await oneRow(
          tx
            .insert(s.reserveTransaction)
            .values(
              insertValues(s.reserveTransaction, {
                businessId: business.id,
                accountId: contribution.accountId,
                date: existing.periodEnd,
                type: "CONTRIBUTION",
                amount,
                description: contribution.description,
                settlementId: id,
              }),
            )
            .returning(),
        );
      }
    });

    return requireSettlement(await this.getDataset(), id);
  }

  async reopenSettlement(id: string): Promise<Settlement> {
    const client = await this.clientProvider();
    const business = await this.business(client);
    const existing = await client.query.settlement.findFirst({
      where: and(
        eq(s.settlement.id, id),
        eq(s.settlement.businessId, business.id),
      ),
    });
    if (!existing) throw new Error(`Settlement ${id} not found`);

    // Drizzle maps null to SQL NULL for the nullable JSON snapshot.

    await client.transaction(async (tx) => {
      await affectedRows(
        tx
          .delete(s.reserveTransaction)
          .where(eq(s.reserveTransaction.settlementId, id))
          .returning(),
      );
      await oneRow(
        tx
          .update(s.settlement)
          .set(
            updateValues(s.settlement, {
              status: "OPEN",
              closedAt: null,
              snapshot: null,
            }),
          )
          .where(eq(s.settlement.id, id))
          .returning(),
      );
    });

    return requireSettlement(await this.getDataset(), id);
  }

  async updateSettlementNotes(
    id: string,
    notes: string | null,
  ): Promise<Settlement> {
    const client = await this.clientProvider();
    const business = await this.business(client);
    const existing = await client.query.settlement.findFirst({
      where: and(
        eq(s.settlement.id, id),
        eq(s.settlement.businessId, business.id),
      ),
    });
    if (!existing) throw new Error(`Settlement ${id} not found`);
    await oneRow(
      client
        .update(s.settlement)
        .set(updateValues(s.settlement, { notes: notes?.trim() || null }))
        .where(eq(s.settlement.id, id))
        .returning(),
    );
    return requireSettlement(await this.getDataset(), id);
  }
}
