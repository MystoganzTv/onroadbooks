/**
 * Domain types for OnRoad Books.
 *
 * These mirror the Prisma models 1:1 so the JSON store and the Postgres
 * store are interchangeable behind the repository interface.
 * Money is stored as a plain number of dollars (2dp) -- the MVP does not
 * need integer-cents precision, but every read/write funnels through
 * `roundMoney` in calculations.ts so rounding stays consistent.
 */

export type PaymentStatus = "PENDING" | "INVOICED" | "PAID";

export type ExpenseBehavior = "FIXED" | "VARIABLE";

export type ExpenseCategoryId =
  | "FUEL"
  | "TOLLS"
  | "INSURANCE"
  | "TRUCK_PAYMENT"
  | "MAINTENANCE"
  | "REPAIRS"
  | "PARKING"
  | "DISPATCH"
  | "FACTORING"
  | "ELD"
  | "PERMITS"
  | "REGISTRATION"
  | "OFFICE"
  | "PHONE"
  | "ACCOUNTING"
  | "OTHER";

export interface Business {
  id: string;
  name: string;
  currency: string;
  createdAt: string;
}

export interface FinancialSettings {
  id: string;
  businessId: string;
  /** Percent of operating profit reserved for taxes, e.g. 20 = 20%. */
  taxReservePct: number;
  /** Percent of gross revenue reserved for maintenance, e.g. 5 = 5%. */
  maintenanceReservePct: number;
  /** Per-category fixed/variable classification overrides. */
  categoryBehavior: Record<string, ExpenseBehavior>;
  /** Profit-per-total-mile floor for a GREAT load. */
  ratingGreatPerMile: number;
  /** Profit-per-total-mile floor for a GOOD load. */
  ratingGoodPerMile: number;
  /** Profit-per-total-mile floor for a MARGINAL load; below this is BAD. */
  ratingMarginalPerMile: number;
  /** Deadhead share of total miles that triggers a warning, e.g. 20 = 20%. */
  deadheadWarnPct: number;
  /** Miles of remaining service life that flag maintenance as due soon. */
  maintenanceWarnMiles: number;
  /** Days of remaining service life that flag maintenance as due soon. */
  maintenanceWarnDays: number;
  updatedAt: string;
}

export interface Truck {
  id: string;
  businessId: string;
  name: string;
  year: number | null;
  make: string | null;
  model: string | null;
  vin: string | null;
  purchasePrice: number | null;
  monthlyPayment: number | null;
  monthlyInsurance: number | null;
  startingOdometer: number;
  currentOdometer: number;
  active: boolean;
  createdAt: string;
}

export interface Load {
  id: string;
  businessId: string;
  truckId: string;
  /** ISO date, day precision: "2026-08-14". */
  date: string;
  originCity: string;
  originState: string;
  destinationCity: string;
  destinationState: string;
  broker: string | null;
  loadNumber: string | null;
  loadedMiles: number;
  deadheadMiles: number;
  grossRate: number;
  /** Fuel attributed directly to this trip (not the Fuel ledger). */
  fuelCost: number;
  tolls: number;
  /** Dispatch commission on this load. */
  dispatchFee: number;
  /** Factoring fee on this load's invoice. */
  factoringFee: number;
  otherExpenses: number;
  status: PaymentStatus;
  notes: string | null;
  createdAt: string;
}

export interface Expense {
  id: string;
  businessId: string;
  truckId: string | null;
  loadId: string | null;
  date: string;
  category: ExpenseCategoryId;
  description: string;
  vendor: string | null;
  amount: number;
  recurring: boolean;
  receiptNumber: string | null;
  notes: string | null;
  createdAt: string;
}

export interface FuelEntry {
  id: string;
  businessId: string;
  truckId: string;
  loadId: string | null;
  date: string;
  gallons: number;
  pricePerGallon: number;
  totalCost: number;
  odometer: number | null;
  location: string | null;
  notes: string | null;
  createdAt: string;
}

/* ---- Documents ------------------------------------------------------ */

/** What a document is, independent of what it hangs off. */
export type DocumentType =
  | "RATE_CONFIRMATION"
  | "BOL"
  | "POD"
  | "INVOICE"
  | "RECEIPT"
  | "REGISTRATION"
  | "INSURANCE"
  | "TITLE"
  | "INSPECTION"
  | "OTHER";

/** Which record a document is filed against. Exactly one id is set. */
export type DocumentOwner = "LOAD" | "EXPENSE" | "TRUCK" | "MAINTENANCE";

export interface Document {
  id: string;
  businessId: string;
  loadId: string | null;
  expenseId: string | null;
  truckId: string | null;
  maintenanceId: string | null;
  type: DocumentType;
  /** Human label; defaults to the original file name. */
  label: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  /**
   * Opaque key resolved by the storage adapter. Local storage treats it as a
   * path under data/uploads; Supabase Storage would treat it as an object key.
   */
  storageKey: string;
  uploadedAt: string;
}

/* ---- Maintenance ----------------------------------------------------- */

export type MaintenanceType =
  | "OIL_CHANGE"
  | "OIL_FILTER"
  | "FUEL_FILTER"
  | "TIRES"
  | "BRAKES"
  | "TRANSMISSION"
  | "COOLANT"
  | "BATTERY"
  | "DOT_INSPECTION"
  | "STATE_INSPECTION"
  | "REGISTRATION"
  | "INSURANCE"
  | "OTHER";

/** What the next service is measured against. */
export type MaintenanceBasis = "DATE" | "MILEAGE" | "BOTH";

export interface MaintenanceRecord {
  id: string;
  businessId: string;
  truckId: string;
  type: MaintenanceType;
  basis: MaintenanceBasis;
  serviceDate: string;
  odometer: number | null;
  cost: number;
  vendor: string | null;
  nextServiceDate: string | null;
  nextServiceOdometer: number | null;
  /**
   * Set when this service was also written to the expense ledger, so the
   * money is counted once and the two records stay linked.
   */
  expenseId: string | null;
  notes: string | null;
  createdAt: string;
}

export type DueStatus = "OK" | "DUE_SOON" | "OVERDUE" | "UNSCHEDULED";

export interface MaintenanceDue {
  record: MaintenanceRecord;
  type: MaintenanceType;
  label: string;
  status: DueStatus;
  /** Negative once overdue. Null when this item is not mileage based. */
  milesRemaining: number | null;
  /** Negative once overdue. Null when this item is not date based. */
  daysRemaining: number | null;
  /**
   * Remaining service life as a multiple of the warning threshold, so miles
   * and days are comparable. Below 1 is "due soon", below 0 is overdue.
   */
  urgency: number;
  /** "Due in 1,250 miles", "Renews in 42 days", "Overdue by 3 days". */
  summary: string;
}

/* ---- Load profitability --------------------------------------------- */

export type ProfitabilityRating = "GREAT" | "GOOD" | "MARGINAL" | "BAD";

/** Aggregate root loaded once per request and reused by every calculation. */
export interface Dataset {
  business: Business;
  settings: FinancialSettings;
  truck: Truck;
  loads: Load[];
  expenses: Expense[];
  fuelEntries: FuelEntry[];
  documents: Document[];
  maintenanceRecords: MaintenanceRecord[];
}

/* ---- Derived / computed shapes ------------------------------------- */

export interface LoadMetrics {
  totalMiles: number;
  revenuePerLoadedMile: number;
  revenuePerTotalMile: number;
  /** fuel + tolls + dispatch + factoring + other */
  tripExpenses: number;
  tripProfit: number;
  /** Trip profit divided by TOTAL miles -- deadhead included, always. */
  profitPerMile: number;
  profitMargin: number;
  deadheadPct: number;
  rating: ProfitabilityRating;
}

export type LoadWithMetrics = Load & { metrics: LoadMetrics };

export interface PeriodSummary {
  grossRevenue: number;
  operatingExpenses: number;
  netProfit: number;
  netMargin: number;
  totalMiles: number;
  loadedMiles: number;
  deadheadMiles: number;
  deadheadPct: number;
  revenuePerMile: number;
  costPerMile: number;
  profitPerMile: number;
  loadCount: number;
  paidRevenue: number;
  outstandingRevenue: number;
  fixedExpenses: number;
  variableExpenses: number;
  fuelExpense: number;
  maintenanceExpense: number;
  /** Gross revenue divided by LOADED miles -- the undiluted rate. */
  revenuePerLoadedMile: number;
  variableCostPerMile: number;
}

export interface MoneyBreakdown {
  grossRevenue: number;
  operatingExpenses: number;
  operatingProfit: number;
  taxReserve: number;
  taxReservePct: number;
  maintenanceReserve: number;
  maintenanceReservePct: number;
  availableCash: number;
}

export interface CategoryTotal {
  category: ExpenseCategoryId;
  label: string;
  behavior: ExpenseBehavior;
  amount: number;
  share: number;
  count: number;
}

export interface Insight {
  id: string;
  tone: "positive" | "negative" | "neutral" | "warning";
  text: string;
}
