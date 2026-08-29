/**
 * Storage contract.
 *
 * Two implementations satisfy it: a local JSON store (zero-setup demo /
 * local development) and a Prisma + PostgreSQL store (production).
 * Application code only ever talks to this interface, so switching the
 * backing database is an environment change, not a refactor.
 */

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

export interface LoadInput {
  date: string;
  originCity: string;
  originState: string;
  destinationCity: string;
  destinationState: string;
  broker?: string | null;
  loadNumber?: string | null;
  loadedMiles: number;
  deadheadMiles: number;
  grossRate: number;
  fuelCost: number;
  tolls: number;
  dispatchFee: number;
  factoringFee: number;
  otherExpenses: number;
  status: PaymentStatus;
  notes?: string | null;
}

export interface ExpenseInput {
  date: string;
  category: ExpenseCategoryId;
  description: string;
  vendor?: string | null;
  amount: number;
  loadId?: string | null;
  recurring: boolean;
  receiptNumber?: string | null;
  notes?: string | null;
}

export interface FuelEntryInput {
  date: string;
  gallons: number;
  pricePerGallon: number;
  totalCost: number;
  odometer?: number | null;
  location?: string | null;
  loadId?: string | null;
  notes?: string | null;
}

export interface SettingsInput {
  taxReservePct: number;
  maintenanceReservePct: number;
  categoryBehavior?: Record<string, "FIXED" | "VARIABLE">;
  ratingGreatPerMile: number;
  ratingGoodPerMile: number;
  ratingMarginalPerMile: number;
  deadheadWarnPct: number;
  maintenanceWarnMiles: number;
  maintenanceWarnDays: number;
}

export interface MaintenanceInput {
  type: MaintenanceType;
  basis: MaintenanceBasis;
  serviceDate: string;
  odometer?: number | null;
  cost: number;
  vendor?: string | null;
  nextServiceDate?: string | null;
  nextServiceOdometer?: number | null;
  notes?: string | null;
  /** Also write the cost to the expense ledger so period totals stay whole. */
  recordAsExpense?: boolean;
}

export interface DocumentInput {
  type: DocumentType;
  label: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  storageKey: string;
  loadId?: string | null;
  expenseId?: string | null;
  truckId?: string | null;
  maintenanceId?: string | null;
}

export interface BusinessInput {
  name: string;
  currency: string;
}

export interface TruckInput {
  name: string;
  year?: number | null;
  make?: string | null;
  model?: string | null;
  vin?: string | null;
  purchasePrice?: number | null;
  monthlyPayment?: number | null;
  monthlyInsurance?: number | null;
  startingOdometer: number;
  currentOdometer: number;
}

export interface Repository {
  /** Everything the app needs for a request, in one read. */
  getDataset(): Promise<Dataset>;

  createLoad(input: LoadInput): Promise<Load>;
  updateLoad(id: string, input: LoadInput): Promise<Load>;
  deleteLoad(id: string): Promise<void>;

  createExpense(input: ExpenseInput): Promise<Expense>;
  updateExpense(id: string, input: ExpenseInput): Promise<Expense>;
  deleteExpense(id: string): Promise<void>;

  createFuelEntry(input: FuelEntryInput): Promise<FuelEntry>;
  updateFuelEntry(id: string, input: FuelEntryInput): Promise<FuelEntry>;
  deleteFuelEntry(id: string): Promise<void>;

  createMaintenance(input: MaintenanceInput): Promise<MaintenanceRecord>;
  updateMaintenance(id: string, input: MaintenanceInput): Promise<MaintenanceRecord>;
  deleteMaintenance(id: string): Promise<void>;

  createDocument(input: DocumentInput): Promise<Document>;
  /** Returns the storage key of the removed document so the file can be purged. */
  deleteDocument(id: string): Promise<string | null>;

  updateSettings(input: SettingsInput): Promise<FinancialSettings>;
  updateBusiness(input: BusinessInput): Promise<Business>;
  updateTruck(input: TruckInput): Promise<Truck>;
}

export function newId(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}${random}`;
}
