import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";

import { roundMoney } from "../calculations";
import { defaultCategoryBehavior } from "../categories";
import { defaultGoals, defaultReserveAccounts } from "../defaults";
import { buildSeedDataset, DEMO_DOCUMENTS } from "../seed/seed-data";
import { buildStorageKey, getDocumentStorage } from "../storage";
import type {
  Business,
  Dataset,
  User,
  Document,
  Expense,
  ExpenseCategoryId,
  FinancialGoal,
  FinancialSettings,
  FuelEntry,
  Load,
  MaintenanceRecord,
  ReserveAccount,
  ReserveTransaction,
  Settlement,
  SettlementHalf,
  Truck,
} from "../types";
import {
  newId,
  type AuthStore,
  type BusinessInput,
  type DocumentInput,
  type ExpenseInput,
  type FuelEntryInput,
  type GoalInput,
  type LoadInput,
  type MaintenanceInput,
  type Repository,
  type ReserveAccountInput,
  type ReserveTransactionInput,
  type SettingsInput,
  type SettlementCloseInput,
  type TruckInput,
} from "./repository";

/**
 * Local JSON store.
 *
 * Zero-setup persistence for the MVP: the file is seeded on first read and
 * every mutation rewrites it atomically. Writes are serialised through a
 * promise chain so concurrent server actions cannot interleave.
 *
 * This is deliberately simple -- it exists so the product can be used and
 * demoed before a Postgres instance is provisioned, not as a database.
 */

/**
 * Resolved per call rather than captured at import. The working directory
 * never moves in production, but pinning the path at module load makes the
 * store impossible to point at a scratch directory, which is exactly what
 * the behavioural tests need to do.
 */
const dataDir = () => path.join(process.cwd(), "data");
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
    if (!parsed?.business || !parsed?.truck || !Array.isArray(parsed.loads)) {
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
        `Restore it or delete it to start from seed data.`,
    );
  }
}

/** First boot: write the demo dataset and materialise its demo documents. */
async function seedFresh(): Promise<Dataset> {
  const seeded = buildSeedDataset();
  await persist(seeded);
  await materializeDemoDocuments(seeded);
  await persist(seeded);
  return seeded;
}

/**
 * Brings a file written by an older build up to the current shape.
 * Fields added later default rather than crash, so an existing local ledger
 * survives an app upgrade.
 */
function migrate(dataset: Dataset): Dataset {
  dataset.users ??= [];
  dataset.loads ??= [];
  dataset.expenses ??= [];
  dataset.fuelEntries ??= [];
  dataset.documents ??= [];
  dataset.maintenanceRecords ??= [];
  dataset.reserveTransactions ??= [];
  dataset.settlements ??= [];

  const businessId = dataset.business?.id ?? "";
  dataset.goals ??= defaultGoals(businessId);
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
  };

  for (const load of dataset.loads) {
    load.dispatchFee ??= 0;
    load.factoringFee ??= 0;
    load.fuelCost ??= 0;
    load.tolls ??= 0;
    load.otherExpenses ??= 0;
  }
  for (const expense of dataset.expenses) {
    expense.receiptNumber ??= null;
  }
  for (const record of dataset.maintenanceRecords) {
    record.expenseId ??= null;
  }
  for (const entry of dataset.fuelEntries) {
    entry.expenseId ??= fuelExpenseId(entry.id);
  }

  return dataset;
}

/**
 * The demo dataset ships with a couple of real (tiny, generated) PDFs so the
 * attachment flow can be seen working before anyone uploads anything.
 */
async function materializeDemoDocuments(dataset: Dataset): Promise<void> {
  const storage = getDocumentStorage();

  for (const demo of DEMO_DOCUMENTS) {
    const exists =
      demo.owner === "LOAD"
        ? dataset.loads.some((l) => l.id === demo.targetId)
        : demo.owner === "EXPENSE"
          ? dataset.expenses.some((e) => e.id === demo.targetId)
          : true;
    if (!exists) continue;

    const bytes = demoPdf(demo.title, demo.body);
    const key = buildStorageKey(demo.owner, demo.targetId, demo.fileName);
    try {
      await storage.put(key, bytes, "application/pdf");
    } catch {
      continue;
    }

    dataset.documents.push({
      id: newId("doc"),
      businessId: dataset.business.id,
      loadId: demo.owner === "LOAD" ? demo.targetId : null,
      expenseId: demo.owner === "EXPENSE" ? demo.targetId : null,
      truckId: demo.owner === "TRUCK" ? dataset.truck.id : null,
      maintenanceId: demo.owner === "MAINTENANCE" ? demo.targetId : null,
      type: demo.type,
      label: demo.title
        .toLowerCase()
        .replace(/(^|\s)\w/g, (c) => c.toUpperCase()),
      fileName: demo.fileName,
      contentType: "application/pdf",
      sizeBytes: bytes.byteLength,
      storageKey: key,
      uploadedAt: new Date().toISOString(),
    });
  }
}

/** A minimal, valid single-page PDF. Enough to open in any viewer. */
function demoPdf(title: string, lines: string[]): Buffer {
  const escape = (text: string) => text.replace(/([()\\])/g, "\\$1");
  const content = [
    "BT /F1 18 Tf 60 720 Td (" + escape(title) + ") Tj ET",
    ...lines.map(
      (line, i) => `BT /F1 11 Tf 60 ${685 - i * 20} Td (${escape(line)}) Tj ET`,
    ),
    "BT /F1 8 Tf 60 80 Td (Generated demo document - OnRoad Books) Tj ET",
  ].join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${offset.toString().padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

  return Buffer.from(pdf, "latin1");
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
      throw new Error("This session does not have access to that business.");
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
    dataset.settlements.sort(
      (a, b) => b.periodStart.localeCompare(a.periodStart) || b.id.localeCompare(a.id),
    );
    await persist(dataset);
    return result;
  });
}

function loadFromInput(input: LoadInput, dataset: Dataset, id: string, createdAt: string): Load {
  return {
    id,
    businessId: dataset.business.id,
    truckId: dataset.truck.id,
    date: input.date,
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
    createdAt,
  };
}

function expenseFromInput(
  input: ExpenseInput,
  dataset: Dataset,
  id: string,
  createdAt: string,
): Expense {
  return {
    id,
    businessId: dataset.business.id,
    truckId: dataset.truck.id,
    loadId: input.loadId || null,
    date: input.date,
    category: input.category,
    description: input.description.trim(),
    vendor: input.vendor?.trim() || null,
    amount: roundMoney(input.amount),
    recurring: input.recurring,
    receiptNumber: input.receiptNumber?.trim() || null,
    notes: input.notes?.trim() || null,
    createdAt,
  };
}

function fuelFromInput(
  input: FuelEntryInput,
  dataset: Dataset,
  id: string,
  createdAt: string,
): FuelEntry {
  return {
    id,
    businessId: dataset.business.id,
    truckId: dataset.truck.id,
    loadId: input.loadId || null,
    date: input.date,
    gallons: Math.round(input.gallons * 1000) / 1000,
    pricePerGallon: Math.round(input.pricePerGallon * 1000) / 1000,
    totalCost: roundMoney(input.totalCost),
    odometer: input.odometer ?? null,
    location: input.location?.trim() || null,
    // The mirror is addressed by an explicit column, not by reconstructing a
    // string, so the two records can never drift apart.
    expenseId: fuelExpenseId(id),
    notes: input.notes?.trim() || null,
    createdAt,
  };
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
    truckId: dataset.truck.id,
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
    truckId: dataset.truck.id,
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
    truckId: dataset.truck.id,
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
  async countUsers(): Promise<number> {
    const dataset = await serialise(readDataset);
    return dataset.users.length;
  }

  async findUserByEmail(email: string): Promise<User | null> {
    const dataset = await serialise(readDataset);
    const normalized = email.trim().toLowerCase();
    return dataset.users.find((u) => u.email.toLowerCase() === normalized) ?? null;
  }

  async createOwner(input: {
    email: string;
    name?: string | null;
    passwordHash: string;
    businessName?: string;
  }): Promise<User> {
    return mutate((dataset) => {
      const email = input.email.trim().toLowerCase();
      if (dataset.users.some((u) => u.email.toLowerCase() === email)) {
        throw new Error("That email already has an account.");
      }
      if (input.businessName) dataset.business.name = input.businessName.trim();

      const user: User = {
        id: newId("user"),
        businessId: dataset.business.id,
        email,
        name: input.name?.trim() || null,
        passwordHash: input.passwordHash,
        createdAt: new Date().toISOString(),
      };
      dataset.users.push(user);
      return user;
    });
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
      throw new Error("This session does not have access to that business.");
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
      return load;
    }, this.businessId);
  }

  async updateLoad(id: string, input: LoadInput): Promise<Load> {
    return mutate((dataset) => {
      const index = dataset.loads.findIndex((l) => l.id === id);
      if (index === -1) throw new Error(`Load ${id} not found`);
      const updated = loadFromInput(input, dataset, id, dataset.loads[index].createdAt);
      dataset.loads[index] = updated;
      return updated;
    }, this.businessId);
  }

  async deleteLoad(id: string): Promise<void> {
    await mutate((dataset) => {
      dataset.loads = dataset.loads.filter((l) => l.id !== id);
      dataset.expenses = dataset.expenses.map((e) =>
        e.loadId === id ? { ...e, loadId: null } : e,
      );
      dataset.fuelEntries = dataset.fuelEntries.map((f) =>
        f.loadId === id ? { ...f, loadId: null } : f,
      );
      dataset.documents = dataset.documents.filter((d) => d.loadId !== id);
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
      const index = dataset.expenses.findIndex((e) => e.id === id);
      if (index === -1) throw new Error(`Expense ${id} not found`);
      const updated = expenseFromInput(input, dataset, id, dataset.expenses[index].createdAt);
      dataset.expenses[index] = updated;
      return updated;
    }, this.businessId);
  }

  async deleteExpense(id: string): Promise<void> {
    await mutate((dataset) => {
      dataset.expenses = dataset.expenses.filter((e) => e.id !== id);
      dataset.documents = dataset.documents.filter((d) => d.expenseId !== id);
      for (const record of dataset.maintenanceRecords) {
        if (record.expenseId === id) record.expenseId = null;
      }
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
      if (record.odometer && record.odometer > dataset.truck.currentOdometer) {
        dataset.truck.currentOdometer = record.odometer;
      }

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
      if (entry.odometer && entry.odometer > dataset.truck.currentOdometer) {
        dataset.truck.currentOdometer = entry.odometer;
      }
      return entry;
    }, this.businessId);
  }

  async updateFuelEntry(id: string, input: FuelEntryInput): Promise<FuelEntry> {
    return mutate((dataset) => {
      const index = dataset.fuelEntries.findIndex((f) => f.id === id);
      if (index === -1) throw new Error(`Fuel entry ${id} not found`);
      const updated = fuelFromInput(input, dataset, id, dataset.fuelEntries[index].createdAt);
      dataset.fuelEntries[index] = updated;
      syncFuelExpense(dataset, updated);
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

  async updateTruck(input: TruckInput): Promise<Truck> {
    return mutate((dataset) => {
      dataset.truck = {
        ...dataset.truck,
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
      };
      return dataset.truck;
    }, this.businessId);
  }

  /* ---- Goals --------------------------------------------------------- */

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
