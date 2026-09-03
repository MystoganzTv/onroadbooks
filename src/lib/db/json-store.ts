import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";

import { roundMoney } from "../calculations";
import { defaultCategoryBehavior } from "../categories";
import { dataDirectory } from "../data-directory";
import {
  defaultGoals,
  defaultReserveAccounts,
  defaultSubscription,
  migrateExpense,
  migrateLoad,
  migrateTruck,
} from "../defaults";
import { assertLoadTruckLink, primaryTruck, resolveTruckId } from "../fleet";
import { normalizeJurisdictionMiles } from "../ifta";
import {
  LOAD_EXPENSE_KEYS,
  loadExpenseField,
  loadExpenseId,
  loadExpenseKey,
  reconcileLoadExpenseLedger,
} from "../load-expenses";
import { DEFAULT_PLAN, getPlan, isComplimentaryAccess, trialEndsOn } from "../plans";
import {
  allocateDriverSettlementNetPay,
  calculateDriverPay,
  driverSettlementTotals,
} from "../driver-pay";
import { financialTreatmentForCategory } from "../finance/terminology";
import { requireExactDebtPaymentSplit } from "../finance/debt-payment";
import { expenseMirrorSource, mirrorRefusal } from "../mirrored-expenses";
import type {
  Business,
  Dataset,
  Driver,
  DriverSettlement,
  ExpenseScope,
  User,
  Document,
  Expense,
  ExpenseCategoryId,
  FinancialGoal,
  FinancialObligation,
  FinancialSettings,
  FuelEntry,
  Load,
  PaymentEvent,
  MaintenanceRecord,
  MemberRole,
  PlanId,
  ReserveAccount,
  ReserveTransaction,
  Settlement,
  SettlementHalf,
  Subscription,
  Truck,
} from "../types";
import {
  BusinessNotFoundError,
  newId,
  type AdminAccountSummary,
  type AuthStore,
  type BusinessInput,
  type DocumentInput,
  type DriverInput,
  type DriverSettlementInput,
  type DriverSettlementAdjustmentInput,
  type DebtPaymentClassificationInput,
  type ExpenseInput,
  type FinancialObligationInput,
  type FuelEntryInput,
  type GoalInput,
  type LoadInput,
  type PaymentEventInput,
  type MaintenanceInput,
  type Repository,
  type ReserveAccountInput,
  type ReserveTransactionInput,
  type SettingsInput,
  type SettlementCloseInput,
  type SubscriptionInput,
  type TruckInput,
} from "./repository";

/**
 * Local JSON store.
 *
 * Zero-setup persistence for the MVP: an empty workspace is created on first read and
 * every mutation rewrites it atomically. Writes are serialised through a
 * promise chain so concurrent server actions cannot interleave.
 *
 * This is deliberately simple -- it exists so the product can be used before
 * a Postgres instance is provisioned, not as a database.
 */

/**
 * Resolved per call rather than captured at import. The working directory
 * never moves in production, but pinning the path at module load makes the
 * store impossible to point at a scratch directory, which is exactly what
 * the behavioural tests need to do.
 */
const dataDir = () => dataDirectory();
const dataFile = () => path.join(dataDir(), "onroad-books.json");

let writeChain: Promise<unknown> = Promise.resolve();

function serialise<T>(task: () => Promise<T>): Promise<T> {
  const next = writeChain.then(task, task);
  writeChain = next.catch(() => undefined);
  return next;
}

async function readDataset(): Promise<Dataset> {
  let raw: string;
  try {
    raw = await fs.readFile(dataFile(), "utf8");
  } catch (error) {
    // Only a genuinely absent file may be seeded. Any other read failure
    // (permissions, a busy disk) must surface rather than be papered over.
    if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") throw error;
    return seedFresh();
  }

  try {
    const parsed = JSON.parse(raw) as Dataset;
    const hasTruck =
      Array.isArray((parsed as unknown as { trucks?: unknown[] }).trucks) ||
      Boolean((parsed as unknown as { truck?: unknown }).truck);
    if (!parsed?.business || !hasTruck || !Array.isArray(parsed.loads)) {
      throw new Error("Missing required top-level records");
    }
    return migrate(parsed);
  } catch (error) {
    // The file exists but is unusable. Seeding over it would destroy a real
    // ledger, so it is set aside intact and the failure is surfaced.
    const quarantine = `${dataFile()}.corrupt-${Date.now()}`;
    await fs.rename(dataFile(), quarantine).catch(() => undefined);
    throw new Error(
      `data/onroad-books.json could not be read (${(error as Error).message}). ` +
        `The file has been moved to ${quarantine} and left untouched. ` +
        `Restore it or delete it to start with an empty workspace.`,
    );
  }
}

/** First boot: create a private, empty workspace. */
async function seedFresh(): Promise<Dataset> {
  const now = new Date().toISOString();
  const businessId = newId("business");
  const truckId = newId("truck");
  const dataset: Dataset = {
    users: [],
    business: {
      id: businessId,
      name: "My Trucking Business",
      currency: "USD",
      createdAt: now,
    },
    settings: {
      id: newId("settings"),
      businessId,
      taxReservePct: 20,
      maintenanceReservePct: 5,
      categoryBehavior: defaultCategoryBehavior(),
      ratingGreatPerMile: 2,
      ratingGoodPerMile: 1.5,
      ratingMarginalPerMile: 1,
      deadheadWarnPct: 20,
      maintenanceWarnMiles: 2000,
      maintenanceWarnDays: 30,
      iftaTaxRates: {},
      fleetOverheadAllocation: "UNALLOCATED",
      updatedAt: now,
    },
    goals: defaultGoals(businessId, now),
    subscription: defaultSubscription(businessId, now),
    trucks: [{
      id: truckId,
      businessId,
      name: "Truck 1",
      acquiredOn: null,
      soldOn: null,
      year: null,
      make: null,
      model: null,
      vin: null,
      purchasePrice: null,
      monthlyPayment: null,
      monthlyInsurance: null,
      financingConfirmedNone: null,
      operatingCostExemptions: {},
      axleCount: null,
      registeredGrossWeightLbs: null,
      operatesInMultipleIftaJurisdictions: null,
      iftaReportingEnabled: null,
      startingOdometer: 0,
      currentOdometer: 0,
      active: true,
      createdAt: now,
    }],
    loads: [],
    expenses: [],
    financialObligations: [],
    paymentEvents: [],
    fuelEntries: [],
    documents: [],
    maintenanceRecords: [],
    reserveAccounts: defaultReserveAccounts(businessId, now),
    reserveTransactions: [],
    settlements: [],
    drivers: [],
    driverSettlements: [],
  };
  await persist(dataset);
  return dataset;
}

/**
 * Brings a file written by an older build up to the current shape.
 * Fields added later default rather than crash, so an existing local ledger
 * survives an app upgrade.
 */
function migrate(dataset: Dataset): Dataset {
  dataset.users ??= [];
  dataset.users = dataset.users.map((user) => ({
    ...user,
    role: user.role ?? "OWNER",
    invitedAt: user.invitedAt ?? null,
    joinedAt: user.joinedAt ?? user.createdAt,
  }));

  // A ledger written before the fleet existed carries `truck`, not `trucks`.
  // The one unit becomes the fleet's first member and every expense it ever
  // carried keeps belonging to it, which is what makes every previously
  // reported figure come out identical afterwards.
  const legacy = (dataset as unknown as { truck?: Truck }).truck;
  if (!Array.isArray(dataset.trucks)) {
    dataset.trucks = legacy ? [legacy] : [];
  }
  delete (dataset as unknown as { truck?: Truck }).truck;
  dataset.trucks = dataset.trucks.map(migrateTruck);

  dataset.loads ??= [];
  dataset.expenses ??= [];
  dataset.financialObligations ??= [];
  dataset.financialObligations = dataset.financialObligations.map((obligation) => ({
    ...obligation,
    startingBalance: obligation.startingBalance ?? null,
    aprPercent: obligation.aprPercent ?? null,
    paymentDueDay: obligation.paymentDueDay ?? null,
  }));
  dataset.paymentEvents ??= [];
  dataset.fuelEntries ??= [];
  dataset.documents ??= [];
  dataset.maintenanceRecords ??= [];
  dataset.reserveTransactions ??= [];
  dataset.settlements ??= [];
  dataset.drivers ??= [];
  dataset.driverSettlements ??= [];
  for (const settlement of dataset.driverSettlements) {
    settlement.adjustments ??= [];
  }

  const businessId = dataset.business?.id ?? "";
  dataset.goals ??= defaultGoals(businessId);
  dataset.goals.expectedMonthlyMiles ??= 0;
  dataset.subscription ??= defaultSubscription(businessId);
  dataset.subscription.providerCustomerId ??= null;
  dataset.subscription.providerSubscriptionId ??= null;
  dataset.subscription.currentPeriodEnd ??=
    dataset.subscription.status === "TRIALING"
      ? trialEndsOn(dataset.subscription.startedAt)
      : null;
  // The plan a ledger was written with may no longer be a plan we sell. The
  // catalogue decides what it becomes -- Individual, the old single-truck
  // plan, keeps the cockpit it was sold and becomes OnRoad Pro.
  dataset.subscription.plan = getPlan(dataset.subscription.plan).id;
  if (!Array.isArray(dataset.reserveAccounts) || dataset.reserveAccounts.length === 0) {
    dataset.reserveAccounts = defaultReserveAccounts(businessId);
  }
  for (const account of dataset.reserveAccounts) {
    account.contributionPct ??= null;
    account.targetBalance ??= null;
    account.active ??= true;
    account.sortOrder ??= 0;
  }
  for (const settlement of dataset.settlements) {
    settlement.snapshot ??= null;
    settlement.closedAt ??= null;
    settlement.notes ??= null;
  }
  for (const txn of dataset.reserveTransactions) {
    txn.settlementId ??= null;
  }

  dataset.settings = {
    ...dataset.settings,
    categoryBehavior: dataset.settings?.categoryBehavior ?? defaultCategoryBehavior(),
    ratingGreatPerMile: dataset.settings?.ratingGreatPerMile ?? 2,
    ratingGoodPerMile: dataset.settings?.ratingGoodPerMile ?? 1.5,
    ratingMarginalPerMile: dataset.settings?.ratingMarginalPerMile ?? 1,
    deadheadWarnPct: dataset.settings?.deadheadWarnPct ?? 20,
    maintenanceWarnMiles: dataset.settings?.maintenanceWarnMiles ?? 2000,
    maintenanceWarnDays: dataset.settings?.maintenanceWarnDays ?? 30,
    iftaTaxRates: dataset.settings?.iftaTaxRates ?? {},
    fleetOverheadAllocation:
      dataset.settings?.fleetOverheadAllocation === "FLEET_MILES"
        ? "FLEET_MILES"
        : "UNALLOCATED",
  };

  for (const load of dataset.loads) {
    migrateLoad(load);
    load.dispatchFee ??= 0;
    load.factoringFee ??= 0;
    load.fuelCost ??= 0;
    load.tolls ??= 0;
    load.otherExpenses ??= 0;
    load.driverId ??= null;
    load.driverPay ??= 0;
    load.jurisdictionMiles = normalizeJurisdictionMiles(load.jurisdictionMiles);
    load.invoiceNumber ??= null;
    load.invoiceDate ??= null;
    load.invoiceDueDate ??= null;
    load.invoicePaidDate ??= null;
    load.billToName ??= null;
    load.billToEmail ??= null;
    load.billToAddress ??= null;
    load.invoiceNotes ??= null;
  }
  const fallbackTruckId = dataset.trucks[0]?.id ?? "";
  for (const expense of dataset.expenses) {
    expense.receiptNumber ??= null;
    migrateExpense(expense, fallbackTruckId);
  }
  for (const record of dataset.maintenanceRecords) {
    record.expenseId ??= null;
  }
  for (const entry of dataset.fuelEntries) {
    entry.expenseId ??= fuelExpenseId(entry.id);
    entry.jurisdiction ??= null;
  }
  reconcileLoadExpenseLedger(dataset);

  return dataset;
}

async function persist(dataset: Dataset): Promise<void> {
  await fs.mkdir(dataDir(), { recursive: true });
  const tmp = `${dataFile()}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(dataset, null, 2), "utf8");
  await fs.rename(tmp, dataFile());
}

const byDateDesc = <T extends { date: string; id: string }>(a: T, b: T) =>
  b.date.localeCompare(a.date) || b.id.localeCompare(a.id);

async function mutate<T>(
  fn: (dataset: Dataset) => T | Promise<T>,
  businessId?: string,
): Promise<T> {
  return serialise(async () => {
    const dataset = await readDataset();
    if (businessId && dataset.business.id !== businessId) {
      throw new BusinessNotFoundError();
    }
    const result = await fn(dataset);
    dataset.loads.sort(byDateDesc);
    dataset.expenses.sort(byDateDesc);
    dataset.fuelEntries.sort(byDateDesc);
    dataset.maintenanceRecords.sort(
      (a, b) => b.serviceDate.localeCompare(a.serviceDate) || b.id.localeCompare(a.id),
    );
    dataset.documents.sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt));
    dataset.reserveTransactions.sort(byDateDesc);
    dataset.reserveAccounts.sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
    dataset.trucks.sort(
      (a, b) =>
        Number(b.active) - Number(a.active) ||
        a.name.localeCompare(b.name) ||
        a.id.localeCompare(b.id),
    );
    dataset.settlements.sort(
      (a, b) => b.periodStart.localeCompare(a.periodStart) || b.id.localeCompare(a.id),
    );
    dataset.drivers.sort(
      (a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name),
    );
    dataset.driverSettlements.sort(
      (a, b) => b.periodStart.localeCompare(a.periodStart) || b.id.localeCompare(a.id),
    );
    await persist(dataset);
    return result;
  });
}

function loadFromInput(
  input: LoadInput,
  dataset: Dataset,
  id: string,
  createdAt: string,
  existing?: Load,
): Load {
  const driverId = input.driverId?.trim() || null;
  if (driverId && !dataset.drivers.some((driver) => driver.id === driverId)) {
    throw new Error("That driver does not belong to this workspace.");
  }
  return {
    id,
    businessId: dataset.business.id,
    truckId: resolveTruckId(dataset.trucks, input.truckId),
    driverId,
    date: input.date,
    deliveryDate: input.deliveryDate || null,
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
    driverPay: 0,
    costsPosted: input.costsPosted ?? true,
    status: input.status,
    jurisdictionMiles: normalizeJurisdictionMiles(
      input.jurisdictionMiles === undefined ? existing?.jurisdictionMiles : input.jurisdictionMiles,
    ),
    invoiceNumber:
      input.invoiceNumber === undefined ? (existing?.invoiceNumber ?? null) : input.invoiceNumber?.trim() || null,
    invoiceDate: input.invoiceDate === undefined ? (existing?.invoiceDate ?? null) : input.invoiceDate || null,
    invoiceDueDate:
      input.invoiceDueDate === undefined ? (existing?.invoiceDueDate ?? null) : input.invoiceDueDate || null,
    invoicePaidDate:
      input.invoicePaidDate === undefined ? (existing?.invoicePaidDate ?? null) : input.invoicePaidDate || null,
    billToName:
      input.billToName === undefined ? (existing?.billToName ?? null) : input.billToName?.trim() || null,
    billToEmail:
      input.billToEmail === undefined ? (existing?.billToEmail ?? null) : input.billToEmail?.trim() || null,
    billToAddress:
      input.billToAddress === undefined ? (existing?.billToAddress ?? null) : input.billToAddress?.trim() || null,
    invoiceNotes:
      input.invoiceNotes === undefined ? (existing?.invoiceNotes ?? null) : input.invoiceNotes?.trim() || null,
    notes: input.notes?.trim() || null,
    createdAt,
  };
}

function expenseFromInput(
  input: ExpenseInput,
  dataset: Dataset,
  id: string,
  createdAt: string,
  existing?: Expense,
): Expense {
  // Overhead belongs to the business, so it deliberately carries no truck.
  const scope: ExpenseScope = input.scope ?? "TRUCK";
  const truckId = scope === "BUSINESS" ? null : resolveTruckId(dataset.trucks, input.truckId);
  assertLoadTruckLink(dataset.loads, input.loadId, truckId, scope);
  return {
    id,
    businessId: dataset.business.id,
    truckId,
    scope,
    loadId: input.loadId || null,
    date: input.date,
    category: input.category,
    description: input.description.trim(),
    vendor: input.vendor?.trim() || null,
    amount: roundMoney(input.amount),
    // Keep a treatment that was set deliberately (a debt payment split
    // writes one), but only while the category still matches it. Changing the
    // category and keeping the old treatment is how a row ends up counted as
    // operating spend under a debt category -- and it made this store disagree
    // with Postgres on the same edit.
    financialTreatment:
      input.financialTreatment ??
      (existing && existing.category === input.category
        ? existing.financialTreatment
        : null) ??
      financialTreatmentForCategory(input.category),
    obligationId:
      input.obligationId === undefined ? (existing?.obligationId ?? null) : input.obligationId,
    splitGroupId:
      input.splitGroupId === undefined ? (existing?.splitGroupId ?? null) : input.splitGroupId,
    recurring: input.recurring,
    receiptNumber: input.receiptNumber?.trim() || null,
    notes: input.notes?.trim() || null,
    createdAt,
  };
}

function financialObligationFromInput(
  input: FinancialObligationInput,
  dataset: Dataset,
): FinancialObligation {
  const truckId = input.truckId?.trim() || null;
  if (truckId && !dataset.trucks.some((truck) => truck.id === truckId)) {
    throw new Error("That truck does not belong to this workspace.");
  }
  return {
    id: newId("obligation"),
    businessId: dataset.business.id,
    truckId,
    name: input.name.trim(),
    kind: input.kind,
    counterparty: input.counterparty?.trim() || null,
    startedOn: input.startedOn || null,
    endedOn: input.endedOn || null,
    startingBalance:
      input.startingBalance == null ? null : roundMoney(input.startingBalance),
    aprPercent: input.aprPercent ?? null,
    paymentDueDay: input.paymentDueDay ?? null,
    expectedMonthlyPayment:
      input.expectedMonthlyPayment == null ? null : roundMoney(input.expectedMonthlyPayment),
    active: input.active ?? true,
    createdAt: new Date().toISOString(),
  };
}

function fuelFromInput(
  input: FuelEntryInput,
  dataset: Dataset,
  id: string,
  createdAt: string,
): FuelEntry {
  const truckId = resolveTruckId(dataset.trucks, input.truckId);
  assertLoadTruckLink(dataset.loads, input.loadId, truckId);
  return {
    id,
    businessId: dataset.business.id,
    truckId,
    loadId: input.loadId || null,
    date: input.date,
    gallons: Math.round(input.gallons * 1000) / 1000,
    pricePerGallon: Math.round(input.pricePerGallon * 1000) / 1000,
    totalCost: roundMoney(input.totalCost),
    odometer: input.odometer ?? null,
    location: input.location?.trim() || null,
    jurisdiction: input.jurisdiction?.trim().toUpperCase() || null,
    // The mirror is addressed by an explicit column, not by reconstructing a
    // string, so the two records can never drift apart.
    expenseId: fuelExpenseId(id),
    notes: input.notes?.trim() || null,
    createdAt,
  };
}

/** An odometer only ever moves forward, and only on the unit that recorded it. */
function bumpOdometer(dataset: Dataset, truckId: string, odometer: number | null): void {
  if (!odometer) return;
  const truck = dataset.trucks.find((t) => t.id === truckId);
  if (truck && odometer > truck.currentOdometer) truck.currentOdometer = odometer;
}

/** Deterministic id of the ledger row a fuel entry mirrors into. */
export function fuelExpenseId(fuelEntryId: string): string {
  return `expfuel_${fuelEntryId}`;
}

/** Fuel purchases are also operating expenses -- keep the ledger in sync. */
function syncFuelExpense(dataset: Dataset, entry: FuelEntry): void {
  const expenseId = entry.expenseId ?? fuelExpenseId(entry.id);
  const description = `Fuel - ${entry.gallons.toFixed(1)} gal @ ${entry.pricePerGallon.toFixed(3)}/gal`;
  const existing = dataset.expenses.find((e) => e.id === expenseId);

  if (existing) {
    existing.truckId = entry.truckId;
    existing.scope = "TRUCK";
    existing.date = entry.date;
    existing.amount = entry.totalCost;
    existing.description = description;
    existing.vendor = entry.location;
    existing.loadId = entry.loadId;
    return;
  }

  dataset.expenses.push({
    id: expenseId,
    businessId: dataset.business.id,
    truckId: entry.truckId,
    scope: "TRUCK",
    loadId: entry.loadId,
    date: entry.date,
    category: "FUEL",
    description,
    vendor: entry.location,
    amount: entry.totalCost,
    recurring: false,
    receiptNumber: null,
    notes: null,
    createdAt: entry.createdAt,
  });
}

/**
 * Load costs and the expense ledger are one accounting fact. Deterministic
 * ids make this an idempotent mirror: editing a load updates the same rows,
 * setting a cost to zero removes it, and detailed Fuel entries take priority
 * over the load's fuel amount so the same purchase is never counted twice.
 */
function syncLoadExpenses(dataset: Dataset, load: Load): void {
  reconcileLoadExpenseLedger({
    business: dataset.business,
    loads: [load],
    expenses: dataset.expenses,
    fuelEntries: dataset.fuelEntries,
  });
}

/**
 * Moving a load may move its generated rows, but never somebody's manually
 * linked expense or fill-up. Those records must be reassigned explicitly so
 * the owner sees the accounting consequence.
 */
function assertLoadCanMove(dataset: Dataset, loadId: string, targetTruckId: string): void {
  const generated = new Set(LOAD_EXPENSE_KEYS.map((key) => loadExpenseId(loadId, key)));
  const linkedExpense = dataset.expenses.some(
    (expense) =>
      expense.loadId === loadId &&
      !generated.has(expense.id) &&
      (expense.scope === "BUSINESS" || expense.truckId !== targetTruckId),
  );
  const linkedFuel = dataset.fuelEntries.some(
    (entry) => entry.loadId === loadId && entry.truckId !== targetTruckId,
  );
  if (linkedExpense || linkedFuel) {
    throw new Error(
      "This load has linked costs on another truck. Reassign or unlink them before moving the load.",
    );
  }
}


/** Maps a maintenance type onto the ledger category it should book under. */
const MAINTENANCE_EXPENSE_CATEGORY: Record<string, ExpenseCategoryId> = {
  TIRES: "REPAIRS",
  BRAKES: "REPAIRS",
  TRANSMISSION: "REPAIRS",
  BATTERY: "REPAIRS",
  REGISTRATION: "REGISTRATION",
  INSURANCE: "INSURANCE",
  DOT_INSPECTION: "PERMITS",
  STATE_INSPECTION: "PERMITS",
};

function maintenanceFromInput(
  input: MaintenanceInput,
  dataset: Dataset,
  id: string,
  createdAt: string,
  expenseId: string | null,
): MaintenanceRecord {
  return {
    id,
    businessId: dataset.business.id,
    truckId: resolveTruckId(dataset.trucks, input.truckId),
    type: input.type,
    basis: input.basis,
    serviceDate: input.serviceDate,
    odometer: input.odometer ?? null,
    cost: roundMoney(input.cost),
    vendor: input.vendor?.trim() || null,
    nextServiceDate: input.basis === "MILEAGE" ? null : (input.nextServiceDate ?? null),
    nextServiceOdometer: input.basis === "DATE" ? null : (input.nextServiceOdometer ?? null),
    expenseId,
    notes: input.notes?.trim() || null,
    createdAt,
  };
}

/** The ledger row that mirrors a logged service, so money is counted once. */
function ledgerExpenseFor(
  record: MaintenanceRecord,
  dataset: Dataset,
  existingId?: string,
): Expense {
  return {
    id: existingId ?? `expmaint_${record.id}`,
    businessId: dataset.business.id,
    truckId: record.truckId,
    scope: "TRUCK",
    loadId: null,
    date: record.serviceDate,
    category: MAINTENANCE_EXPENSE_CATEGORY[record.type] ?? "MAINTENANCE",
    description: `${maintenanceLabelFor(record.type)}${record.vendor ? ` - ${record.vendor}` : ""}`,
    vendor: record.vendor,
    amount: record.cost,
    recurring: false,
    receiptNumber: null,
    notes: "Logged from the maintenance service record.",
    createdAt: record.createdAt,
  };
}

function maintenanceLabelFor(type: string): string {
  return type
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
}

/**
 * The inclusive bounds of a half-month settlement. Kept here (and not derived
 * at read time) so a closed settlement always reports the window it covered.
 */
export function settlementBounds(month: string, half: SettlementHalf): {
  periodStart: string;
  periodEnd: string;
} {
  const [year, monthPart] = month.split("-").map((part) => Number.parseInt(part, 10));
  const lastDay = new Date(Date.UTC(year, monthPart, 0)).getUTCDate();
  return half === "FIRST"
    ? { periodStart: `${month}-01`, periodEnd: `${month}-15` }
    : { periodStart: `${month}-16`, periodEnd: `${month}-${String(lastDay).padStart(2, "0")}` };
}

function newSettlement(businessId: string, month: string, half: SettlementHalf): Settlement {
  const bounds = settlementBounds(month, half);
  return {
    id: `stl_${month}_${half === "FIRST" ? "a" : "b"}`,
    businessId,
    month,
    half,
    periodStart: bounds.periodStart,
    periodEnd: bounds.periodEnd,
    status: "OPEN",
    closedAt: null,
    snapshot: null,
    notes: null,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Account lookups, which cannot be business-scoped: they are what determines
 * the business a request belongs to.
 */
export class JsonAuthStore implements AuthStore {
  async listAccounts(): Promise<AdminAccountSummary[]> {
    const dataset = await serialise(readDataset);
    const activityDates = [
      ...dataset.loads.map((row) => row.createdAt),
      ...dataset.expenses.map((row) => row.createdAt),
      ...dataset.fuelEntries.map((row) => row.createdAt),
      ...dataset.documents.map((row) => row.uploadedAt),
      ...dataset.maintenanceRecords.map((row) => row.createdAt),
      ...dataset.reserveTransactions.map((row) => row.createdAt),
      ...dataset.settlements.map((row) => row.createdAt),
    ];
    const validActivityTimes = activityDates
      .map((value) => Date.parse(value))
      .filter((value) => Number.isFinite(value));
    const lastActivityAt = validActivityTimes.length > 0
      ? new Date(Math.max(...validActivityTimes)).toISOString()
      : null;
    const hasProviderSubscription = Boolean(
      dataset.subscription.providerSubscriptionId && dataset.subscription.status !== "CANCELED",
    );
    const accessSource = hasProviderSubscription
      ? "stripe" as const
      : dataset.subscription.status === "TRIALING"
        ? "trial" as const
        : isComplimentaryAccess(dataset.subscription)
          ? "complimentary" as const
          : "inactive" as const;

    return dataset.users.filter((user) => user.role === "OWNER").map((user) => ({
      userId: user.id,
      businessId: user.businessId,
      email: user.email,
      name: user.name,
      businessName: dataset.business.name,
      createdAt: user.createdAt,
      plan: getPlan(dataset.subscription.plan).id,
      subscriptionStatus: dataset.subscription.status,
      currentPeriodEnd: dataset.subscription.currentPeriodEnd,
      hasProviderSubscription,
      accessSource,
      lastActivityAt,
      counts: {
        trucks: dataset.trucks.length,
        activeTrucks: dataset.trucks.filter((truck) => truck.active).length,
        loads: dataset.loads.length,
        expenses: dataset.expenses.length,
        fuelEntries: dataset.fuelEntries.length,
        documents: dataset.documents.length,
        maintenance: dataset.maintenanceRecords.length,
        reserveTransactions: dataset.reserveTransactions.length,
        settlements: dataset.settlements.length,
      },
    }));
  }

  async countUsers(): Promise<number> {
    const dataset = await serialise(readDataset);
    return dataset.users.length;
  }

  async findUserByEmail(email: string): Promise<User | null> {
    const dataset = await serialise(readDataset);
    const normalized = email.trim().toLowerCase();
    return dataset.users.find((u) => u.email.toLowerCase() === normalized) ?? null;
  }

  async findUserById(id: string): Promise<User | null> {
    const dataset = await serialise(readDataset);
    return dataset.users.find((user) => user.id === id) ?? null;
  }

  async listMembers(businessId: string): Promise<User[]> {
    const dataset = await serialise(readDataset);
    return dataset.users
      .filter((user) => user.businessId === businessId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async createMember(input: {
    businessId: string;
    email: string;
    name?: string | null;
    role: Exclude<MemberRole, "OWNER">;
  }): Promise<User> {
    return mutate((dataset) => {
      const email = input.email.trim().toLowerCase();
      if (dataset.business.id !== input.businessId) throw new Error("This workspace no longer exists.");
      if (dataset.users.some((user) => user.email.toLowerCase() === email)) {
        throw new Error("That email already belongs to an OnRoad Books account.");
      }
      const now = new Date().toISOString();
      const user: User = {
        id: newId("user"),
        businessId: input.businessId,
        email,
        name: input.name?.trim() || null,
        passwordHash: "invite$supabase",
        role: input.role,
        invitedAt: now,
        joinedAt: null,
        createdAt: now,
      };
      dataset.users.push(user);
      return user;
    }, input.businessId);
  }

  async updateMemberRole(
    userId: string,
    businessId: string,
    role: Exclude<MemberRole, "OWNER">,
  ): Promise<User> {
    return mutate((dataset) => {
      const user = dataset.users.find((candidate) => candidate.id === userId && candidate.businessId === businessId);
      if (!user) throw new Error("That team member was not found.");
      if (user.role === "OWNER") throw new Error("The owner role cannot be changed here.");
      user.role = role;
      return user;
    }, businessId);
  }

  async markMemberJoined(userId: string, businessId: string): Promise<User> {
    return mutate((dataset) => {
      const user = dataset.users.find((candidate) => candidate.id === userId && candidate.businessId === businessId);
      if (!user) throw new Error("That invitation no longer exists.");
      user.joinedAt ??= new Date().toISOString();
      return user;
    }, businessId);
  }

  async removeMember(userId: string, businessId: string): Promise<{ email: string }> {
    return mutate((dataset) => {
      const user = dataset.users.find((candidate) => candidate.id === userId && candidate.businessId === businessId);
      if (!user) throw new Error("That team member was not found.");
      if (user.role === "OWNER") throw new Error("The workspace owner cannot be removed.");
      dataset.users = dataset.users.filter((candidate) => candidate.id !== userId);
      return { email: user.email };
    }, businessId);
  }

  async createOwner(input: {
    email: string;
    name?: string | null;
    passwordHash: string;
    businessName?: string;
    plan?: PlanId;
  }): Promise<User> {
    return mutate((dataset) => {
      const email = input.email.trim().toLowerCase();
      const trialStartedAt = new Date().toISOString();
      if (dataset.users.some((u) => u.email.toLowerCase() === email)) {
        throw new Error("That email already has an account.");
      }
      if (input.businessName) dataset.business.name = input.businessName.trim();
      dataset.subscription = {
        ...dataset.subscription,
        plan: input.plan ?? DEFAULT_PLAN,
        status: "TRIALING",
        currentPeriodEnd: trialEndsOn(trialStartedAt),
        startedAt: trialStartedAt,
        updatedAt: trialStartedAt,
      };

      const user: User = {
        id: newId("user"),
        businessId: dataset.business.id,
        email,
        name: input.name?.trim() || null,
        passwordHash: input.passwordHash,
        role: "OWNER",
        invitedAt: null,
        joinedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };
      dataset.users.push(user);
      return user;
    });
  }

  async resetBusinessData(userId: string, businessId: string): Promise<string[]> {
    return mutate((dataset) => {
      const owner = dataset.users.find(
        (user) => user.id === userId && user.businessId === businessId,
      );
      if (!owner) throw new Error("This account no longer exists.");
      if (owner.role !== "OWNER") throw new Error("Only the workspace owner can reset this account.");

      const now = new Date().toISOString();
      const storageKeys = dataset.documents.map((document) => document.storageKey);
      dataset.loads = [];
      dataset.expenses = [];
      dataset.financialObligations = [];
      dataset.paymentEvents = [];
      dataset.fuelEntries = [];
      dataset.documents = [];
      dataset.maintenanceRecords = [];
      dataset.reserveTransactions = [];
      dataset.settlements = [];
      dataset.drivers = [];
      dataset.driverSettlements = [];
      dataset.trucks = [
        {
          id: newId("truck"),
          businessId,
          name: "Truck 1",
          year: null,
          make: null,
          model: null,
          vin: null,
          purchasePrice: null,
          monthlyPayment: null,
          monthlyInsurance: null,
          financingConfirmedNone: null,
          operatingCostExemptions: {},
          axleCount: null,
          registeredGrossWeightLbs: null,
          operatesInMultipleIftaJurisdictions: null,
          iftaReportingEnabled: null,
          startingOdometer: 0,
          currentOdometer: 0,
          active: true,
          acquiredOn: null,
          soldOn: null,
          createdAt: now,
        },
      ];
      dataset.settings = {
        id: newId("settings"),
        businessId,
        taxReservePct: 20,
        maintenanceReservePct: 5,
        categoryBehavior: defaultCategoryBehavior(),
        ratingGreatPerMile: 2,
        ratingGoodPerMile: 1.5,
        ratingMarginalPerMile: 1,
        deadheadWarnPct: 20,
        maintenanceWarnMiles: 2000,
        maintenanceWarnDays: 30,
        iftaTaxRates: {},
        fleetOverheadAllocation: "UNALLOCATED",
        updatedAt: now,
      };
      dataset.goals = defaultGoals(businessId, now);
      dataset.reserveAccounts = defaultReserveAccounts(businessId, now).map((account) => ({
        ...account,
        id: newId("reserve"),
      }));
      return storageKeys;
    }, businessId);
  }

  async deleteAccount(
    userId: string,
    businessId: string,
  ): Promise<{ email: string; storageKeys: string[] }> {
    return mutate((dataset) => {
      const owner = dataset.users.find(
        (user) => user.id === userId && user.businessId === businessId,
      );
      if (!owner) throw new Error("This account no longer exists.");
      if (owner.role !== "OWNER") throw new Error("Only the workspace owner can delete this account.");

      const storageKeys = dataset.documents.map((document) => document.storageKey);
      dataset.users = dataset.users.filter((user) => user.businessId !== businessId);
      return { email: owner.email, storageKeys };
    }, businessId);
  }
}

export class JsonRepository implements Repository {
  /**
   * Every instance is bound to one business. The file holds a single
   * business today, but the check is real: a session for another business
   * cannot read or write these rows.
   */
  constructor(private readonly businessId: string) {}

  private assertScope(dataset: Dataset): Dataset {
    if (dataset.business.id !== this.businessId) {
      throw new BusinessNotFoundError();
    }
    return dataset;
  }

  async getDataset(): Promise<Dataset> {
    return this.assertScope(await serialise(readDataset));
  }

  async createLoad(input: LoadInput): Promise<Load> {
    return mutate((dataset) => {
      const load = loadFromInput(input, dataset, newId("load"), new Date().toISOString());
      dataset.loads.push(load);
      syncLoadExpenses(dataset, load);
      bumpOdometer(dataset, load.truckId, load.endingOdometer);
      return load;
    }, this.businessId);
  }

  async updateLoad(id: string, input: LoadInput): Promise<Load> {
    return mutate((dataset) => {
      const index = dataset.loads.findIndex((l) => l.id === id);
      if (index === -1) throw new Error(`Load ${id} not found`);
      const updated = loadFromInput(
        input,
        dataset,
        id,
        dataset.loads[index].createdAt,
        dataset.loads[index],
      );
      updated.driverPay = dataset.loads[index].driverPay;
      const frozenLine = dataset.driverSettlements
        .flatMap((settlement) => settlement.lines)
        .find((line) => line.loadId === id);
      if (
        frozenLine &&
        (updated.truckId !== dataset.loads[index].truckId ||
          updated.driverId !== dataset.loads[index].driverId)
      ) {
        throw new Error(
          "This load is already on a driver settlement. Delete the draft before changing its driver or truck.",
        );
      }
      if (updated.truckId !== dataset.loads[index].truckId) {
        assertLoadCanMove(dataset, id, updated.truckId);
      }
      dataset.loads[index] = updated;
      syncLoadExpenses(dataset, updated);
      bumpOdometer(dataset, updated.truckId, updated.endingOdometer);
      return updated;
    }, this.businessId);
  }

  async updateLoadJurisdictionMiles(
    id: string,
    mileage: Load["jurisdictionMiles"],
  ): Promise<Load> {
    return mutate((dataset) => {
      const load = dataset.loads.find((row) => row.id === id);
      if (!load) throw new Error(`Load ${id} not found`);
      const normalized = normalizeJurisdictionMiles(mileage);
      const assigned = normalized.reduce((total, row) => total + row.totalMiles, 0);
      if (assigned > load.loadedMiles + load.deadheadMiles) {
        throw new Error("Jurisdiction miles cannot exceed total trip miles.");
      }
      load.jurisdictionMiles = normalized;
      return load;
    }, this.businessId);
  }

  async updateLoadExpense(id: string, amount: number): Promise<Load> {
    return mutate((dataset) => {
      const expense = dataset.expenses.find((row) => row.id === id);
      if (!expense?.loadId) {
        throw new Error("That expense is not generated by a load.");
      }
      const key = loadExpenseKey(id, expense.loadId);
      const load = dataset.loads.find((row) => row.id === expense.loadId);
      if (!key || !load) {
        throw new Error("The load that owns this expense could not be found.");
      }

      load[loadExpenseField(key)] = roundMoney(amount);
      syncLoadExpenses(dataset, load);
      return load;
    }, this.businessId);
  }

  async deleteLoad(id: string): Promise<void> {
    await mutate((dataset) => {
      if (dataset.paymentEvents.some((event) => event.loadId === id)) {
        throw new Error("A load with recorded customer payments cannot be deleted.");
      }
      if (
        dataset.driverSettlements.some((settlement) =>
          settlement.lines.some((line) => line.loadId === id),
        )
      ) {
        throw new Error(
          "This load is already on a driver settlement. Delete the draft first; paid statements cannot be changed.",
        );
      }
      const generatedIds = LOAD_EXPENSE_KEYS.map((key) => loadExpenseId(id, key));
      dataset.loads = dataset.loads.filter((l) => l.id !== id);
      dataset.expenses = dataset.expenses
        .filter((expense) => !generatedIds.includes(expense.id))
        .map((expense) => (expense.loadId === id ? { ...expense, loadId: null } : expense));
      dataset.fuelEntries = dataset.fuelEntries.map((f) =>
        f.loadId === id ? { ...f, loadId: null } : f,
      );
      dataset.documents = dataset.documents.filter((d) => d.loadId !== id);
      dataset.documents = dataset.documents.filter(
        (document) => !document.expenseId || !generatedIds.includes(document.expenseId),
      );
    }, this.businessId);
  }

  async createDriver(input: DriverInput): Promise<Driver> {
    return mutate((dataset) => {
      const defaultTruckId = input.defaultTruckId?.trim() || null;
      if (defaultTruckId && !dataset.trucks.some((truck) => truck.id === defaultTruckId)) {
        throw new Error("That default truck does not belong to this workspace.");
      }
      const driver: Driver = {
        id: newId("driver"),
        businessId: dataset.business.id,
        name: input.name.trim(),
        reference: input.reference?.trim() || null,
        defaultTruckId,
        payType: input.payType,
        payRate: roundMoney(input.payRate),
        active: true,
        createdAt: new Date().toISOString(),
      };
      dataset.drivers.push(driver);
      return driver;
    }, this.businessId);
  }

  async updateDriver(id: string, input: DriverInput): Promise<Driver> {
    return mutate((dataset) => {
      const index = dataset.drivers.findIndex((driver) => driver.id === id);
      if (index < 0) throw new Error("That driver does not belong to this workspace.");
      const defaultTruckId = input.defaultTruckId?.trim() || null;
      if (defaultTruckId && !dataset.trucks.some((truck) => truck.id === defaultTruckId)) {
        throw new Error("That default truck does not belong to this workspace.");
      }
      const driver: Driver = {
        ...dataset.drivers[index],
        name: input.name.trim(),
        reference: input.reference?.trim() || null,
        defaultTruckId,
        payType: input.payType,
        payRate: roundMoney(input.payRate),
      };
      dataset.drivers[index] = driver;
      return driver;
    }, this.businessId);
  }

  async setDriverActive(id: string, active: boolean): Promise<Driver> {
    return mutate((dataset) => {
      const driver = dataset.drivers.find((row) => row.id === id);
      if (!driver) throw new Error("That driver does not belong to this workspace.");
      driver.active = active;
      return driver;
    }, this.businessId);
  }

  async createDriverSettlement(input: DriverSettlementInput): Promise<DriverSettlement> {
    return mutate((dataset) => {
      const driver = dataset.drivers.find((row) => row.id === input.driverId);
      if (!driver) throw new Error("That driver does not belong to this workspace.");
      const attachedLoadIds = new Set(
        dataset.driverSettlements.flatMap((settlement) =>
          settlement.lines.map((line) => line.loadId),
        ),
      );
      const loads = dataset.loads.filter(
        (load) =>
          load.driverId === driver.id &&
          load.date >= input.periodStart &&
          load.date <= input.periodEnd &&
          !attachedLoadIds.has(load.id),
      );
      if (loads.length === 0) {
        throw new Error("No unsettled loads are assigned to that driver in this period.");
      }
      const createdAt = new Date().toISOString();
      const settlementId = newId("dstl");
      const settlement: DriverSettlement = {
        id: settlementId,
        businessId: dataset.business.id,
        driverId: driver.id,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        status: "DRAFT",
        paidOn: null,
        notes: input.notes?.trim() || null,
        adjustments: [],
        lines: loads.map((load) => ({
          id: newId("dline"),
          settlementId,
          loadId: load.id,
          truckId: load.truckId,
          grossRevenue: load.grossRate,
          loadedMiles: load.loadedMiles,
          totalMiles: load.loadedMiles + load.deadheadMiles,
          payType: driver.payType,
          payRate: driver.payRate,
          payAmount: calculateDriverPay(driver.payType, driver.payRate, load),
          expenseId: null,
          createdAt,
        })),
        createdAt,
      };
      dataset.driverSettlements.push(settlement);
      return settlement;
    }, this.businessId);
  }

  async addDriverSettlementAdjustment(
    settlementId: string,
    input: DriverSettlementAdjustmentInput,
  ) {
    return mutate((dataset) => {
      if (!Number.isFinite(input.amount) || input.amount <= 0) {
        throw new Error("Adjustment amount must be greater than zero.");
      }
      if (input.reason.trim().length < 2) throw new Error("Explain this adjustment.");
      const settlement = dataset.driverSettlements.find((row) => row.id === settlementId);
      if (!settlement) throw new Error("That driver settlement does not belong to this workspace.");
      if (settlement.status !== "DRAFT") throw new Error("Paid statements cannot be changed.");
      const adjustment = {
        id: newId("dadj"),
        settlementId,
        type: input.type,
        amount: roundMoney(input.amount),
        reason: input.reason.trim(),
        createdAt: new Date().toISOString(),
      };
      const preview = { ...settlement, adjustments: [...settlement.adjustments, adjustment] };
      if (driverSettlementTotals(preview).netPay < 0) {
        throw new Error("This adjustment would make net pay negative.");
      }
      settlement.adjustments.push(adjustment);
      return adjustment;
    }, this.businessId);
  }

  async deleteDriverSettlementAdjustment(settlementId: string, adjustmentId: string): Promise<void> {
    await mutate((dataset) => {
      const settlement = dataset.driverSettlements.find((row) => row.id === settlementId);
      if (!settlement) throw new Error("That driver settlement does not belong to this workspace.");
      if (settlement.status !== "DRAFT") throw new Error("Paid statements cannot be changed.");
      if (!settlement.adjustments.some((row) => row.id === adjustmentId)) {
        throw new Error("That adjustment does not belong to this statement.");
      }
      settlement.adjustments = settlement.adjustments.filter((row) => row.id !== adjustmentId);
    }, this.businessId);
  }

  async payDriverSettlement(id: string, paidOn: string): Promise<DriverSettlement> {
    return mutate((dataset) => {
      const settlement = dataset.driverSettlements.find((row) => row.id === id);
      if (!settlement) throw new Error("That driver settlement does not belong to this workspace.");
      if (settlement.status === "PAID") throw new Error("That driver settlement is already paid.");
      const driver = dataset.drivers.find((row) => row.id === settlement.driverId);
      if (!driver) throw new Error("The driver on this settlement no longer exists.");
      const allocations = allocateDriverSettlementNetPay(settlement);

      for (const line of settlement.lines) {
        const load = dataset.loads.find((row) => row.id === line.loadId);
        if (!load || load.truckId !== line.truckId || load.driverId !== settlement.driverId) {
          throw new Error("A load on this draft no longer matches its driver and truck.");
        }
        const expenseId = `expdriver_${line.id}`;
        const allocatedPay = allocations.get(line.id) ?? 0;
        if (allocatedPay > 0 && !dataset.expenses.some((expense) => expense.id === expenseId)) {
          dataset.expenses.push({
            id: expenseId,
            businessId: dataset.business.id,
            truckId: line.truckId,
            scope: "TRUCK",
            loadId: line.loadId,
            date: paidOn,
            category: "DRIVER_PAY",
            description: `Driver pay · ${driver.name}`,
            vendor: driver.name,
            amount: allocatedPay,
            recurring: false,
            receiptNumber: null,
            notes: `Posted automatically from driver settlement ${settlement.id}.`,
            createdAt: new Date().toISOString(),
          });
        }
        line.expenseId = allocatedPay > 0 ? expenseId : null;
        load.driverPay = allocatedPay;
      }
      settlement.status = "PAID";
      settlement.paidOn = paidOn;
      return settlement;
    }, this.businessId);
  }

  async deleteDriverSettlement(id: string): Promise<void> {
    await mutate((dataset) => {
      const settlement = dataset.driverSettlements.find((row) => row.id === id);
      if (!settlement) throw new Error("That driver settlement does not belong to this workspace.");
      if (settlement.status === "PAID") {
        throw new Error("Paid driver settlements are permanent accounting records.");
      }
      dataset.driverSettlements = dataset.driverSettlements.filter((row) => row.id !== id);
    }, this.businessId);
  }

  async createExpense(input: ExpenseInput): Promise<Expense> {
    return mutate((dataset) => {
      const expense = expenseFromInput(input, dataset, newId("exp"), new Date().toISOString());
      dataset.expenses.push(expense);
      return expense;
    }, this.businessId);
  }

  async updateExpense(id: string, input: ExpenseInput): Promise<Expense> {
    return mutate((dataset) => {
      if (dataset.driverSettlements.some((settlement) => settlement.lines.some((line) => line.expenseId === id))) {
        throw new Error("Driver Pay expenses are controlled by their paid statement and cannot be edited.");
      }
      const mirror = expenseMirrorSource(dataset, id);
      if (mirror) throw new Error(mirrorRefusal(mirror));
      const index = dataset.expenses.findIndex((e) => e.id === id);
      if (index === -1) throw new Error(`Expense ${id} not found`);
      if (dataset.expenses[index].splitGroupId) {
        throw new Error("Use the loan payment editor to keep principal and interest balanced.");
      }
      const updated = expenseFromInput(
        input,
        dataset,
        id,
        dataset.expenses[index].createdAt,
        dataset.expenses[index],
      );
      dataset.expenses[index] = updated;
      return updated;
    }, this.businessId);
  }

  async deleteExpense(id: string): Promise<void> {
    await mutate((dataset) => {
      const expense = dataset.expenses.find((row) => row.id === id);
      if (!expense) throw new Error(`Expense ${id} not found`);
      const targetIds = new Set(
        expense.splitGroupId
          ? dataset.expenses
              .filter((row) => row.splitGroupId === expense.splitGroupId)
              .map((row) => row.id)
          : [id],
      );
      if (dataset.driverSettlements.some((settlement) => settlement.lines.some((line) => targetIds.has(line.expenseId ?? "")))) {
        throw new Error("Driver Pay expenses are controlled by their paid statement and cannot be deleted.");
      }
      // A service record's row is an optional link and may be deleted here
      // (the pointer is cleared below). Fuel and load rows are not optional.
      for (const targetId of targetIds) {
        const mirror = expenseMirrorSource(dataset, targetId);
        if (mirror && mirror !== "SERVICE") throw new Error(mirrorRefusal(mirror));
      }
      dataset.expenses = dataset.expenses.filter((row) => !targetIds.has(row.id));
      dataset.documents = dataset.documents.filter((document) => !targetIds.has(document.expenseId ?? ""));
      for (const record of dataset.maintenanceRecords) {
        if (targetIds.has(record.expenseId ?? "")) record.expenseId = null;
      }
    }, this.businessId);
  }

  async createFinancialObligation(
    input: FinancialObligationInput,
  ): Promise<FinancialObligation> {
    return mutate((dataset) => {
      const obligation = financialObligationFromInput(input, dataset);
      dataset.financialObligations.push(obligation);
      if (obligation.active && obligation.truckId) {
        const truck = dataset.trucks.find((candidate) => candidate.id === obligation.truckId);
        if (truck) truck.financingConfirmedNone = null;
      }
      return obligation;
    }, this.businessId);
  }

  async updateFinancialObligation(
    id: string,
    input: FinancialObligationInput,
  ): Promise<FinancialObligation> {
    return mutate((dataset) => {
      const obligation = dataset.financialObligations.find((row) => row.id === id);
      if (!obligation) throw new Error("That obligation does not belong to this workspace.");
      if (
        input.kind !== obligation.kind
        && dataset.expenses.some((expense) => expense.obligationId === obligation.id)
      ) {
        throw new Error("The financing type cannot change after payments have been linked.");
      }
      const truckId = input.truckId?.trim() || null;
      if (truckId && !dataset.trucks.some((truck) => truck.id === truckId)) {
        throw new Error("That truck does not belong to this workspace.");
      }
      obligation.truckId = truckId;
      obligation.name = input.name.trim();
      obligation.kind = input.kind;
      obligation.counterparty = input.counterparty?.trim() || null;
      obligation.startedOn = input.startedOn ?? null;
      obligation.endedOn = input.endedOn ?? null;
      obligation.startingBalance = input.startingBalance == null
        ? null
        : roundMoney(input.startingBalance);
      obligation.aprPercent = input.aprPercent ?? null;
      obligation.paymentDueDay = input.paymentDueDay ?? null;
      obligation.expectedMonthlyPayment = input.expectedMonthlyPayment ?? null;
      obligation.active = input.active ?? true;
      if (obligation.active && truckId) {
        const truck = dataset.trucks.find((candidate) => candidate.id === truckId);
        if (truck) truck.financingConfirmedNone = null;
      }
      return obligation;
    }, this.businessId);
  }

  async classifyDebtPayment(
    id: string,
    input: DebtPaymentClassificationInput,
  ): Promise<Expense[]> {
    return mutate((dataset) => {
      const expense = dataset.expenses.find((row) => row.id === id);
      if (!expense) throw new Error("That payment does not belong to this workspace.");
      const editingSplit = Boolean(
        expense.splitGroupId &&
        ["PRINCIPAL_PAYMENT", "INTEREST_EXPENSE"].includes(expense.category),
      );
      if (expense.category !== "TRUCK_PAYMENT" && !editingSplit) {
        throw new Error("Only unallocated truck payments can be classified here.");
      }
      if (editingSplit && input.treatment !== "LOAN_SPLIT") {
        throw new Error("An existing loan split can only be updated as principal and interest.");
      }

      let obligationId = input.obligationId?.trim() || null;
      if (input.newObligation) {
        const obligation = financialObligationFromInput(input.newObligation, dataset);
        dataset.financialObligations.push(obligation);
        if (obligation.active && obligation.truckId) {
          const truck = dataset.trucks.find((candidate) => candidate.id === obligation.truckId);
          if (truck) truck.financingConfirmedNone = null;
        }
        obligationId = obligation.id;
      }
      const obligation = obligationId
        ? dataset.financialObligations.find((row) => row.id === obligationId)
        : null;
      if (obligationId && !obligation) {
        throw new Error("That obligation does not belong to this workspace.");
      }
      if (input.obligationUpdate) {
        if (!obligation) throw new Error("Choose an existing obligation before updating it.");
        const truckId = input.obligationUpdate.truckId?.trim() || null;
        if (truckId && !dataset.trucks.some((truck) => truck.id === truckId)) {
          throw new Error("That truck does not belong to this workspace.");
        }
        obligation.name = input.obligationUpdate.name.trim();
        obligation.truckId = truckId;
        if (input.obligationUpdate.startingBalance !== undefined) {
          obligation.startingBalance = input.obligationUpdate.startingBalance == null
            ? null
            : roundMoney(input.obligationUpdate.startingBalance);
        }
        if (input.obligationUpdate.aprPercent !== undefined) {
          obligation.aprPercent = input.obligationUpdate.aprPercent;
        }
        if (input.obligationUpdate.paymentDueDay !== undefined) {
          obligation.paymentDueDay = input.obligationUpdate.paymentDueDay;
        }
        obligation.expectedMonthlyPayment = input.obligationUpdate.expectedMonthlyPayment ?? null;
        obligation.active = input.obligationUpdate.active;
        if (obligation.active && truckId) {
          const truck = dataset.trucks.find((candidate) => candidate.id === truckId);
          if (truck) truck.financingConfirmedNone = null;
        }
      }
      const normalizedNotes = input.notes === undefined
        ? undefined
        : input.notes?.trim() || null;

      if (input.treatment === "DEBT_UNALLOCATED") {
        expense.financialTreatment = "DEBT_UNALLOCATED";
        expense.obligationId = obligationId;
        if (normalizedNotes !== undefined) expense.notes = normalizedNotes;
        return [expense];
      }

      if (input.treatment === "OPERATING_LEASE") {
        if (obligation && obligation.kind !== "OPERATING_LEASE") {
          throw new Error("Choose an operating-lease obligation for this treatment.");
        }
        expense.category = "OPERATING_LEASE";
        expense.financialTreatment = "OPERATING";
        expense.obligationId = obligationId;
        if (normalizedNotes !== undefined) expense.notes = normalizedNotes;
        return [expense];
      }

      if (obligation && obligation.kind !== "LOAN") {
        throw new Error("Choose a loan obligation before recording principal and interest.");
      }
      const existingRows = editingSplit
        ? dataset.expenses.filter((row) => row.splitGroupId === expense.splitGroupId)
        : [expense];
      const currentPaymentAmount = roundMoney(
        existingRows.reduce((total, row) => total + row.amount, 0),
      );
      const paymentAmount = editingSplit && input.paymentAmount !== undefined
        ? roundMoney(input.paymentAmount)
        : currentPaymentAmount;
      const { principal, interest } = requireExactDebtPaymentSplit(
        paymentAmount,
        input.principalAmount ?? 0,
        input.interestAmount ?? 0,
      );

      if (editingSplit) {
        const splitGroupId = expense.splitGroupId!;
        const principalRow = existingRows.find((row) => row.financialTreatment === "PRINCIPAL");
        const baseRow = principalRow ?? existingRows[0];
        const currentDescription = (principalRow?.description ?? baseRow.description)
          .replace(/ · interest$/u, "");
        const baseDescription = input.description?.trim() || currentDescription;
        const resolvedDate = input.date ?? baseRow.date;
        const resolvedVendor = input.vendor === undefined
          ? baseRow.vendor
          : input.vendor?.trim() || null;
        const resolvedRecurring = input.recurring ?? baseRow.recurring;
        const resolvedNotes = normalizedNotes === undefined ? baseRow.notes : normalizedNotes;
        const kept: Expense[] = [];

        if (principal > 0) {
          baseRow.category = "PRINCIPAL_PAYMENT";
          baseRow.financialTreatment = "PRINCIPAL";
          baseRow.amount = principal;
          baseRow.obligationId = obligationId;
          baseRow.description = baseDescription;
          baseRow.date = resolvedDate;
          baseRow.vendor = resolvedVendor;
          baseRow.recurring = resolvedRecurring;
          baseRow.notes = resolvedNotes;
          kept.push(baseRow);

          if (interest > 0) {
            const existingInterest = existingRows.find(
              (row) => row.id !== baseRow.id && row.financialTreatment === "INTEREST",
            );
            if (existingInterest) {
              existingInterest.category = "INTEREST_EXPENSE";
              existingInterest.financialTreatment = "INTEREST";
              existingInterest.amount = interest;
              existingInterest.obligationId = obligationId;
              existingInterest.description = `${baseDescription} · interest`;
              existingInterest.date = resolvedDate;
              existingInterest.vendor = resolvedVendor;
              existingInterest.recurring = resolvedRecurring;
              existingInterest.notes = resolvedNotes;
              kept.push(existingInterest);
            } else {
              const interestRow: Expense = {
                ...baseRow,
                id: newId("exp"),
                category: "INTEREST_EXPENSE",
                financialTreatment: "INTEREST",
                amount: interest,
                description: `${baseDescription} · interest`,
                receiptNumber: null,
                createdAt: new Date().toISOString(),
              };
              dataset.expenses.push(interestRow);
              kept.push(interestRow);
            }
          }
        } else {
          baseRow.category = "INTEREST_EXPENSE";
          baseRow.financialTreatment = "INTEREST";
          baseRow.amount = interest;
          baseRow.obligationId = obligationId;
          baseRow.description = `${baseDescription} · interest`;
          baseRow.date = resolvedDate;
          baseRow.vendor = resolvedVendor;
          baseRow.recurring = resolvedRecurring;
          baseRow.notes = resolvedNotes;
          kept.push(baseRow);
        }

        const keptIds = new Set(kept.map((row) => row.id));
        dataset.expenses = dataset.expenses.filter(
          (row) => row.splitGroupId !== splitGroupId || keptIds.has(row.id),
        );
        return kept;
      }

      const splitGroupId = newId("split");
      const resolvedNotes = normalizedNotes === undefined ? expense.notes : normalizedNotes;
      if (principal <= 0) {
        expense.category = "INTEREST_EXPENSE";
        expense.financialTreatment = "INTEREST";
        expense.amount = interest;
        expense.obligationId = obligationId;
        expense.splitGroupId = splitGroupId;
        expense.notes = resolvedNotes;
        return [expense];
      }
      expense.category = "PRINCIPAL_PAYMENT";
      expense.financialTreatment = "PRINCIPAL";
      expense.amount = principal;
      expense.obligationId = obligationId;
      expense.splitGroupId = splitGroupId;
      expense.notes = resolvedNotes;

      const rows = [expense];
      if (interest > 0) {
        const interestRow: Expense = {
          ...expense,
          id: newId("exp"),
          category: "INTEREST_EXPENSE",
          financialTreatment: "INTEREST",
          amount: interest,
          description: `${expense.description} · interest`,
          receiptNumber: null,
          createdAt: new Date().toISOString(),
        };
        dataset.expenses.push(interestRow);
        rows.push(interestRow);
      }
      return rows;
    }, this.businessId);
  }

  async createPaymentEvent(input: PaymentEventInput): Promise<PaymentEvent> {
    return mutate((dataset) => {
      const load = dataset.loads.find((row) => row.id === input.loadId);
      if (!load?.invoiceNumber) throw new Error("Issue the invoice before recording a payment.");
      const existingEvents = dataset.paymentEvents.filter((event) => event.loadId === load.id);
      const recorded =
        existingEvents.length === 0 && load.status === "PAID"
          ? load.grossRate
          : existingEvents.reduce((total, event) => total + event.amount, 0);
      const remaining = roundMoney(load.grossRate - recorded);
      if (input.amount > remaining) throw new Error("Payment cannot exceed the invoice balance.");
      const event: PaymentEvent = {
        id: newId("payment"),
        businessId: dataset.business.id,
        loadId: load.id,
        date: input.date,
        amount: roundMoney(input.amount),
        method: input.method?.trim() || null,
        reference: input.reference?.trim() || null,
        notes: input.notes?.trim() || null,
        createdAt: new Date().toISOString(),
      };
      dataset.paymentEvents.push(event);
      const fullyPaid = roundMoney(recorded + event.amount) >= load.grossRate;
      load.status = fullyPaid ? "PAID" : "INVOICED";
      load.invoicePaidDate = fullyPaid ? event.date : null;
      return event;
    }, this.businessId);
  }

  /* ---- Maintenance --------------------------------------------------- */

  async createMaintenance(input: MaintenanceInput): Promise<MaintenanceRecord> {
    return mutate((dataset) => {
      const id = newId("maint");
      const record = maintenanceFromInput(input, dataset, id, new Date().toISOString(), null);

      if (input.recordAsExpense && input.cost > 0) {
        const expense = ledgerExpenseFor(record, dataset);
        dataset.expenses.push(expense);
        record.expenseId = expense.id;
      }
      bumpOdometer(dataset, record.truckId, record.odometer);

      dataset.maintenanceRecords.push(record);
      return record;
    }, this.businessId);
  }

  async updateMaintenance(id: string, input: MaintenanceInput): Promise<MaintenanceRecord> {
    return mutate((dataset) => {
      const index = dataset.maintenanceRecords.findIndex((m) => m.id === id);
      if (index === -1) throw new Error(`Maintenance record ${id} not found`);
      const previous = dataset.maintenanceRecords[index];
      const record = maintenanceFromInput(
        input,
        dataset,
        id,
        previous.createdAt,
        previous.expenseId,
      );

      const linked = record.expenseId
        ? dataset.expenses.find((e) => e.id === record.expenseId)
        : undefined;

      if (input.recordAsExpense && input.cost > 0) {
        if (linked) {
          // Only the fields the service record owns are refreshed: anything
          // the user added on the Expenses page (receipt number, their own
          // note, a load link) is theirs to keep.
          const refreshed = ledgerExpenseFor(record, dataset, linked.id);
          linked.date = refreshed.date;
          linked.category = refreshed.category;
          linked.description = refreshed.description;
          linked.vendor = refreshed.vendor;
          linked.amount = refreshed.amount;
        } else {
          const expense = ledgerExpenseFor(record, dataset);
          dataset.expenses.push(expense);
          record.expenseId = expense.id;
        }
      } else if (linked) {
        dataset.expenses = dataset.expenses.filter((e) => e.id !== linked.id);
        dataset.documents = dataset.documents.filter((d) => d.expenseId !== linked.id);
        record.expenseId = null;
      }

      dataset.maintenanceRecords[index] = record;
      return record;
    }, this.businessId);
  }

  async deleteMaintenance(id: string): Promise<void> {
    await mutate((dataset) => {
      const record = dataset.maintenanceRecords.find((m) => m.id === id);
      if (record?.expenseId) {
        const expenseId = record.expenseId;
        dataset.expenses = dataset.expenses.filter((e) => e.id !== expenseId);
        dataset.documents = dataset.documents.filter((d) => d.expenseId !== expenseId);
      }
      dataset.maintenanceRecords = dataset.maintenanceRecords.filter((m) => m.id !== id);
      dataset.documents = dataset.documents.filter((d) => d.maintenanceId !== id);
    }, this.businessId);
  }

  /* ---- Documents ----------------------------------------------------- */

  async createDocument(input: DocumentInput): Promise<Document> {
    return mutate((dataset) => {
      const targets = [input.loadId, input.expenseId, input.truckId, input.maintenanceId]
        .filter((id): id is string => Boolean(id?.trim()));
      if (targets.length !== 1) {
        throw new Error("A document must belong to exactly one record.");
      }
      const targetOwned = input.loadId
        ? dataset.loads.some((row) => row.id === input.loadId)
        : input.expenseId
          ? dataset.expenses.some((row) => row.id === input.expenseId)
          : input.truckId
            ? dataset.trucks.some((row) => row.id === input.truckId)
            : dataset.maintenanceRecords.some((row) => row.id === input.maintenanceId);
      if (!targetOwned) {
        throw new Error("That document target does not belong to this workspace.");
      }
      const document: Document = {
        id: newId("doc"),
        businessId: dataset.business.id,
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
        uploadedAt: new Date().toISOString(),
      };
      dataset.documents.push(document);
      return document;
    }, this.businessId);
  }

  async deleteDocument(id: string): Promise<string | null> {
    return mutate((dataset) => {
      const document = dataset.documents.find((d) => d.id === id);
      if (!document) return null;
      dataset.documents = dataset.documents.filter((d) => d.id !== id);
      return document.storageKey;
    }, this.businessId);
  }

  async createFuelEntry(input: FuelEntryInput): Promise<FuelEntry> {
    return mutate((dataset) => {
      const entry = fuelFromInput(input, dataset, newId("fuel"), new Date().toISOString());
      dataset.fuelEntries.push(entry);
      syncFuelExpense(dataset, entry);
      const load = entry.loadId ? dataset.loads.find((item) => item.id === entry.loadId) : null;
      if (load) syncLoadExpenses(dataset, load);
      bumpOdometer(dataset, entry.truckId, entry.odometer);
      return entry;
    }, this.businessId);
  }

  async updateFuelEntry(id: string, input: FuelEntryInput): Promise<FuelEntry> {
    return mutate((dataset) => {
      const index = dataset.fuelEntries.findIndex((f) => f.id === id);
      if (index === -1) throw new Error(`Fuel entry ${id} not found`);
      const previousLoadId = dataset.fuelEntries[index].loadId;
      const updated = fuelFromInput(input, dataset, id, dataset.fuelEntries[index].createdAt);
      dataset.fuelEntries[index] = updated;
      syncFuelExpense(dataset, updated);
      for (const loadId of new Set([previousLoadId, updated.loadId].filter(Boolean))) {
        const load = dataset.loads.find((item) => item.id === loadId);
        if (load) syncLoadExpenses(dataset, load);
      }
      bumpOdometer(dataset, updated.truckId, updated.odometer);
      return updated;
    }, this.businessId);
  }

  async deleteFuelEntry(id: string): Promise<void> {
    await mutate((dataset) => {
      const entry = dataset.fuelEntries.find((f) => f.id === id);
      const expenseId = entry?.expenseId ?? fuelExpenseId(id);
      dataset.fuelEntries = dataset.fuelEntries.filter((f) => f.id !== id);
      dataset.expenses = dataset.expenses.filter((e) => e.id !== expenseId);
      dataset.documents = dataset.documents.filter((d) => d.expenseId !== expenseId);
      const load = entry?.loadId ? dataset.loads.find((item) => item.id === entry.loadId) : null;
      if (load) syncLoadExpenses(dataset, load);
    }, this.businessId);
  }

  async updateSettings(input: SettingsInput): Promise<FinancialSettings> {
    return mutate((dataset) => {
      dataset.settings = {
        ...dataset.settings,
        taxReservePct: input.taxReservePct,
        maintenanceReservePct: input.maintenanceReservePct,
        categoryBehavior: input.categoryBehavior ?? dataset.settings.categoryBehavior,
        ratingGreatPerMile: input.ratingGreatPerMile,
        ratingGoodPerMile: input.ratingGoodPerMile,
        ratingMarginalPerMile: input.ratingMarginalPerMile,
        deadheadWarnPct: input.deadheadWarnPct,
        maintenanceWarnMiles: input.maintenanceWarnMiles,
        maintenanceWarnDays: input.maintenanceWarnDays,
        iftaTaxRates: input.iftaTaxRates ?? dataset.settings.iftaTaxRates,
        fleetOverheadAllocation:
          input.fleetOverheadAllocation ?? dataset.settings.fleetOverheadAllocation ?? "UNALLOCATED",
        updatedAt: new Date().toISOString(),
      };
      return dataset.settings;
    }, this.businessId);
  }

  async updateBusiness(input: BusinessInput): Promise<Business> {
    return mutate((dataset) => {
      dataset.business = { ...dataset.business, name: input.name, currency: input.currency };
      return dataset.business;
    }, this.businessId);
  }

  async createTruck(input: TruckInput): Promise<Truck> {
    return mutate((dataset) => {
      // The plan limit is checked in the action, against the trucks that
      // actually exist. The store's job is only to refuse a duplicate name,
      // because two units called "Truck 1" make every report ambiguous.
      const name = input.name.trim();
      if (dataset.trucks.some((t) => t.active && t.name.toLowerCase() === name.toLowerCase())) {
        throw new Error(`You already have a truck called ${name}.`);
      }

      const truck: Truck = {
        id: newId("truck"),
        businessId: dataset.business.id,
        name,
        acquiredOn: input.acquiredOn ?? null,
        soldOn: null,
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
        registeredGrossWeightLbs: input.registeredGrossWeightLbs ?? null,
        operatesInMultipleIftaJurisdictions:
          input.operatesInMultipleIftaJurisdictions ?? null,
        iftaReportingEnabled: input.iftaReportingEnabled ?? null,
        startingOdometer: input.startingOdometer,
        currentOdometer: input.currentOdometer,
        active: true,
        createdAt: new Date().toISOString(),
      };
      dataset.trucks.push(truck);
      return truck;
    }, this.businessId);
  }

  async updateTruck(input: TruckInput, id?: string): Promise<Truck> {
    return mutate((dataset) => {
      const target = id
        ? dataset.trucks.find((t) => t.id === id)
        : primaryTruck(dataset.trucks);
      if (!target) throw new Error(`Truck ${id ?? "(primary)"} not found`);

      Object.assign(target, {
        name: input.name.trim(),
        acquiredOn: input.acquiredOn ?? target.acquiredOn,
        year: input.year ?? null,
        make: input.make ?? null,
        model: input.model ?? null,
        vin: input.vin ?? null,
        purchasePrice: input.purchasePrice ?? null,
        monthlyPayment: input.monthlyPayment ?? null,
        monthlyInsurance: input.monthlyInsurance ?? null,
        axleCount: input.axleCount === undefined ? target.axleCount ?? null : input.axleCount,
        registeredGrossWeightLbs:
          input.registeredGrossWeightLbs === undefined
            ? target.registeredGrossWeightLbs ?? null
            : input.registeredGrossWeightLbs,
        operatesInMultipleIftaJurisdictions:
          input.operatesInMultipleIftaJurisdictions === undefined
            ? target.operatesInMultipleIftaJurisdictions ?? null
            : input.operatesInMultipleIftaJurisdictions,
        iftaReportingEnabled:
          input.iftaReportingEnabled === undefined
            ? target.iftaReportingEnabled ?? null
            : input.iftaReportingEnabled,
        startingOdometer: input.startingOdometer,
        currentOdometer: input.currentOdometer,
      });
      if ((target.monthlyPayment ?? 0) > 0) target.financingConfirmedNone = null;
      return target;
    }, this.businessId);
  }

  async setTruckFinancingConfirmedNone(
    id: string,
    value: boolean | null,
  ): Promise<Truck> {
    return mutate((dataset) => {
      const target = dataset.trucks.find((truck) => truck.id === id);
      if (!target) throw new Error(`Truck ${id} not found`);
      target.financingConfirmedNone = value;
      return target;
    }, this.businessId);
  }

  async setTruckOperatingCostExemptions(
    id: string,
    exemptions: NonNullable<Truck["operatingCostExemptions"]>,
  ): Promise<Truck> {
    return mutate((dataset) => {
      const target = dataset.trucks.find((truck) => truck.id === id);
      if (!target) throw new Error(`Truck ${id} not found`);
      target.operatingCostExemptions = { ...exemptions };
      return target;
    }, this.businessId);
  }

  /**
   * Retiring a unit deletes nothing.
   *
   * Its loads, expenses, fuel and service history stay exactly where they are
   * and keep appearing in every past report. All that changes is that it stops
   * being something you can book new work against -- and that it no longer
   * counts against the plan's limit.
   */
  async archiveTruck(id: string, soldOn?: string | null): Promise<Truck> {
    return mutate((dataset) => {
      const target = dataset.trucks.find((t) => t.id === id);
      if (!target) throw new Error(`Truck ${id} not found`);
      if (dataset.trucks.filter((t) => t.active).length <= 1) {
        throw new Error("This is your only active truck. Add another one before retiring it.");
      }
      target.active = false;
      target.soldOn = soldOn ?? null;
      return target;
    }, this.businessId);
  }

  async restoreTruck(id: string): Promise<Truck> {
    return mutate((dataset) => {
      const target = dataset.trucks.find((t) => t.id === id);
      if (!target) throw new Error(`Truck ${id} not found`);
      target.active = true;
      target.soldOn = null;
      return target;
    }, this.businessId);
  }

  /* ---- Goals --------------------------------------------------------- */

  async updateSubscription(input: SubscriptionInput): Promise<Subscription> {
    return mutate((dataset) => {
      dataset.subscription = {
        ...dataset.subscription,
        plan: input.plan,
        status: input.status ?? dataset.subscription.status,
        currentPeriodEnd:
          input.currentPeriodEnd === undefined
            ? dataset.subscription.currentPeriodEnd
            : input.currentPeriodEnd,
        providerCustomerId:
          input.providerCustomerId === undefined
            ? dataset.subscription.providerCustomerId
            : input.providerCustomerId,
        providerSubscriptionId:
          input.providerSubscriptionId === undefined
            ? dataset.subscription.providerSubscriptionId
            : input.providerSubscriptionId,
        updatedAt: new Date().toISOString(),
      };
      return dataset.subscription;
    }, this.businessId);
  }

  async updateGoals(input: GoalInput): Promise<FinancialGoal> {
    return mutate((dataset) => {
      dataset.goals = {
        ...dataset.goals,
        monthlyRevenueTarget: roundMoney(input.monthlyRevenueTarget),
        monthlyProfitTarget: roundMoney(input.monthlyProfitTarget),
        targetProfitPerMile: input.targetProfitPerMile,
        maxDeadheadPct: input.maxDeadheadPct,
        targetLoads: input.targetLoads ?? null,
        workingDaysPerWeek: input.workingDaysPerWeek,
        expectedMonthlyMiles:
          input.expectedMonthlyMiles ?? dataset.goals.expectedMonthlyMiles ?? 0,
        updatedAt: new Date().toISOString(),
      };
      return dataset.goals;
    }, this.businessId);
  }

  /* ---- Reserve buckets ------------------------------------------------ */

  async createReserveAccount(input: ReserveAccountInput): Promise<ReserveAccount> {
    return mutate((dataset) => {
      const account: ReserveAccount = {
        id: newId("res"),
        businessId: dataset.business.id,
        kind: input.kind,
        name: input.name.trim(),
        basis: input.basis,
        contributionPct: input.contributionPct ?? null,
        targetBalance: input.targetBalance ?? null,
        active: input.active ?? true,
        sortOrder: dataset.reserveAccounts.length,
        createdAt: new Date().toISOString(),
      };
      dataset.reserveAccounts.push(account);
      return account;
    }, this.businessId);
  }

  async updateReserveAccount(id: string, input: ReserveAccountInput): Promise<ReserveAccount> {
    return mutate((dataset) => {
      const index = dataset.reserveAccounts.findIndex((a) => a.id === id);
      if (index === -1) throw new Error(`Reserve account ${id} not found`);
      const previous = dataset.reserveAccounts[index];
      const updated: ReserveAccount = {
        ...previous,
        name: input.name.trim(),
        basis: input.basis,
        // Built-in buckets keep their rate in Settings; a null here is not a
        // missing value, it is "inherit the Settings percentage".
        contributionPct:
          previous.kind === "TAX" || previous.kind === "MAINTENANCE"
            ? null
            : (input.contributionPct ?? null),
        targetBalance: input.targetBalance ?? null,
        active: input.active ?? previous.active,
      };
      dataset.reserveAccounts[index] = updated;
      return updated;
    }, this.businessId);
  }

  async deleteReserveAccount(id: string): Promise<void> {
    await mutate((dataset) => {
      const account = dataset.reserveAccounts.find((a) => a.id === id);
      if (!account) return;
      if (account.kind === "TAX" || account.kind === "MAINTENANCE") {
        throw new Error("The tax and maintenance buckets cannot be deleted.");
      }
      dataset.reserveAccounts = dataset.reserveAccounts.filter((a) => a.id !== id);
      dataset.reserveTransactions = dataset.reserveTransactions.filter(
        (t) => t.accountId !== id,
      );
    }, this.businessId);
  }

  async createReserveTransaction(input: ReserveTransactionInput): Promise<ReserveTransaction> {
    return mutate((dataset) => {
      if (!dataset.reserveAccounts.some((a) => a.id === input.accountId)) {
        throw new Error("That reserve bucket no longer exists.");
      }
      const magnitude = Math.abs(roundMoney(input.amount));
      // The sign is decided here, once, so a balance is always a plain sum.
      const signed =
        input.type === "WITHDRAWAL"
          ? -magnitude
          : input.type === "ADJUSTMENT" && input.negative
            ? -magnitude
            : magnitude;

      const txn: ReserveTransaction = {
        id: newId("rtx"),
        businessId: dataset.business.id,
        accountId: input.accountId,
        date: input.date,
        type: input.type,
        amount: signed,
        description: input.description.trim(),
        settlementId: null,
        createdAt: new Date().toISOString(),
      };
      dataset.reserveTransactions.push(txn);
      return txn;
    }, this.businessId);
  }

  async deleteReserveTransaction(id: string): Promise<void> {
    await mutate((dataset) => {
      const txn = dataset.reserveTransactions.find((t) => t.id === id);
      if (txn?.settlementId) {
        throw new Error(
          "That contribution was posted by a closed settlement. Reopen the settlement to remove it.",
        );
      }
      dataset.reserveTransactions = dataset.reserveTransactions.filter((t) => t.id !== id);
    }, this.businessId);
  }

  /* ---- Settlements ---------------------------------------------------- */

  async ensureSettlement(month: string, half: SettlementHalf): Promise<Settlement> {
    return mutate((dataset) => {
      const existing = dataset.settlements.find((s) => s.month === month && s.half === half);
      if (existing) return existing;
      const settlement = newSettlement(dataset.business.id, month, half);
      dataset.settlements.push(settlement);
      return settlement;
    }, this.businessId);
  }

  async closeSettlement(id: string, input: SettlementCloseInput): Promise<Settlement> {
    return mutate((dataset) => {
      const index = dataset.settlements.findIndex((s) => s.id === id);
      if (index === -1) throw new Error(`Settlement ${id} not found`);
      const settlement = dataset.settlements[index];
      if (settlement.status === "CLOSED") {
        throw new Error("That settlement is already closed.");
      }

      const closedAt = new Date().toISOString();
      const updated: Settlement = {
        ...settlement,
        status: "CLOSED",
        closedAt,
        // The snapshot is frozen here and never recomputed: this is what the
        // owner settled on, whatever the settings say later.
        snapshot: input.snapshot,
        notes: input.notes?.trim() || settlement.notes,
      };
      dataset.settlements[index] = updated;

      for (const contribution of input.contributions) {
        const amount = roundMoney(contribution.amount);
        if (amount <= 0) continue;
        if (!dataset.reserveAccounts.some((a) => a.id === contribution.accountId)) continue;
        dataset.reserveTransactions.push({
          id: newId("rtx"),
          businessId: dataset.business.id,
          accountId: contribution.accountId,
          date: updated.periodEnd,
          type: "CONTRIBUTION",
          amount,
          description: contribution.description,
          settlementId: updated.id,
          createdAt: closedAt,
        });
      }

      return updated;
    }, this.businessId);
  }

  async reopenSettlement(id: string): Promise<Settlement> {
    return mutate((dataset) => {
      const index = dataset.settlements.findIndex((s) => s.id === id);
      if (index === -1) throw new Error(`Settlement ${id} not found`);
      const updated: Settlement = {
        ...dataset.settlements[index],
        status: "OPEN",
        closedAt: null,
        snapshot: null,
      };
      dataset.settlements[index] = updated;
      // Reopening removes exactly the rows the close posted; anything the
      // owner entered by hand in the same bucket is untouched.
      dataset.reserveTransactions = dataset.reserveTransactions.filter(
        (t) => t.settlementId !== id,
      );
      return updated;
    }, this.businessId);
  }

  async updateSettlementNotes(id: string, notes: string | null): Promise<Settlement> {
    return mutate((dataset) => {
      const index = dataset.settlements.findIndex((s) => s.id === id);
      if (index === -1) throw new Error(`Settlement ${id} not found`);
      const updated = { ...dataset.settlements[index], notes: notes?.trim() || null };
      dataset.settlements[index] = updated;
      return updated;
    }, this.businessId);
  }
}
