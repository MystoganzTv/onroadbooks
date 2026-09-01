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

export type MemberRole = "OWNER" | "ADMIN" | "BOOKKEEPER" | "DISPATCHER" | "VIEWER";

export type ExpenseCategoryId =
  | "FUEL"
  | "TOLLS"
  | "INSURANCE"
  | "TRUCK_PAYMENT"
  | "INTEREST_EXPENSE"
  | "PRINCIPAL_PAYMENT"
  | "OPERATING_LEASE"
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
  | "DRIVER_PAY"
  | "OTHER";

export type DriverPayType =
  | "PERCENT_GROSS"
  | "PER_LOADED_MILE"
  | "PER_TOTAL_MILE"
  | "FLAT_PER_LOAD";

export type DriverSettlementStatus = "DRAFT" | "PAID";

/** Explicit financial meaning of an expense row, independent of its UI label. */
export type FinancialTreatment =
  | "OPERATING"
  | "INTEREST"
  | "PRINCIPAL"
  | "DEBT_UNALLOCATED";

export type FinancialObligationKind = "LOAN" | "OPERATING_LEASE" | "UNKNOWN";

export interface User {
  id: string;
  businessId: string;
  email: string;
  name: string | null;
  /** scrypt$<salt>$<hash>. Never leaves the server. */
  passwordHash: string;
  role: MemberRole;
  invitedAt: string | null;
  joinedAt: string | null;
  createdAt: string;
}

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
  /** Percent of Booked Revenue reserved for maintenance, e.g. 5 = 5%. */
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
  /** Quarterly IFTA rates keyed as `YYYY-QN:ST`, in dollars per gallon. */
  iftaTaxRates: Record<string, number>;
  updatedAt: string;
}

export interface Truck {
  id: string;
  businessId: string;
  name: string;
  /** When the unit joined the fleet. Null when it predates the record. */
  acquiredOn: string | null;
  /**
   * When it left. A sold truck keeps every load and expense it ever carried --
   * its history still belongs in past reports -- but it stops appearing as a
   * unit you can book work against.
   */
  soldOn: string | null;
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
  driverId: string | null;
  /** Pickup date, ISO day precision: "2026-08-14". */
  date: string;
  /** Delivery date when known. */
  deliveryDate: string | null;
  /** Actual dashboard reading at the end of the trip, when recorded. */
  endingOdometer: number | null;
  originCity: string;
  originState: string;
  destinationCity: string;
  destinationState: string;
  broker: string | null;
  loadNumber: string | null;
  equipmentType: EquipmentType | null;
  loadCapacity: LoadCapacity | null;
  equipmentLengthFt: number | null;
  weightLbs: number | null;
  commodity: string | null;
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
  /** Driver pay frozen and posted when the linked statement is paid. */
  driverPay: number;
  /** Whether trip costs are mirrored into the operating-expense ledger. */
  costsPosted: boolean;
  status: PaymentStatus;
  /** Actual IFTA miles entered for each jurisdiction on this trip. */
  jurisdictionMiles: JurisdictionMileage[];
  /** One freight invoice per load; null until the load is invoiced. */
  invoiceNumber: string | null;
  invoiceDate: string | null;
  invoiceDueDate: string | null;
  invoicePaidDate: string | null;
  billToName: string | null;
  billToEmail: string | null;
  billToAddress: string | null;
  invoiceNotes: string | null;
  notes: string | null;
  createdAt: string;
}

export interface JurisdictionMileage {
  /** Two-letter US or Canadian IFTA jurisdiction code. */
  jurisdiction: string;
  totalMiles: number;
  nonTaxableMiles: number;
}

export type EquipmentType =
  | "BOX_TRUCK"
  | "DRY_VAN"
  | "REEFER"
  | "FLATBED"
  | "POWER_ONLY"
  | "SPRINTER_VAN"
  | "OTHER";

export type LoadCapacity = "FULL" | "PARTIAL";

/**
 * What an expense belongs to.
 *
 * TRUCK is a cost a specific unit caused: its fuel, its note, its tyres.
 * BUSINESS is overhead the fleet carries between them: the phone, the
 * accountant, the dispatch software.
 *
 * This is the distinction that makes per-unit numbers honest. Charging
 * overhead to trucks invents a cost per unit; leaving it out entirely makes
 * every truck look profitable while the business loses money. So a unit
 * reports CONTRIBUTION -- its own revenue less its own costs -- and the
 * overhead is subtracted once, at the fleet level.
 */
export type ExpenseScope = "TRUCK" | "BUSINESS";

export interface Expense {
  id: string;
  businessId: string;
  /** Null exactly when scope is BUSINESS. */
  truckId: string | null;
  scope: ExpenseScope;
  loadId: string | null;
  date: string;
  category: ExpenseCategoryId;
  description: string;
  vendor: string | null;
  amount: number;
  financialTreatment?: FinancialTreatment;
  /** Financing agreement this row belongs to, when explicitly classified. */
  obligationId?: string | null;
  /** Links the principal and interest rows created from one reviewed payment. */
  splitGroupId?: string | null;
  recurring: boolean;
  receiptNumber: string | null;
  notes: string | null;
  /** Set only for a ledger row created by a paid driver statement. */
  driverSettlementLineId?: string | null;
  createdAt: string;
}

/** A loan, operating lease, or deliberately unknown financing agreement. */
export interface FinancialObligation {
  id: string;
  businessId: string;
  truckId: string | null;
  name: string;
  kind: FinancialObligationKind;
  counterparty: string | null;
  startedOn: string | null;
  endedOn: string | null;
  expectedMonthlyPayment: number | null;
  active: boolean;
  createdAt: string;
}

/** One actual customer cash receipt. Multiple events allow partial payments. */
export interface PaymentEvent {
  id: string;
  businessId: string;
  loadId: string;
  date: string;
  amount: number;
  method: string | null;
  reference: string | null;
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
  /** Jurisdiction where the tax-paid fuel was purchased. */
  jurisdiction: string | null;
  /**
   * The ledger expense this fill-up writes. An explicit link, not a naming
   * convention, so the two can never drift apart.
   */
  expenseId: string | null;
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
  users: User[];
  settings: FinancialSettings;
  goals: FinancialGoal;
  trucks: Truck[];
  loads: Load[];
  expenses: Expense[];
  financialObligations: FinancialObligation[];
  paymentEvents: PaymentEvent[];
  fuelEntries: FuelEntry[];
  documents: Document[];
  maintenanceRecords: MaintenanceRecord[];
  reserveAccounts: ReserveAccount[];
  reserveTransactions: ReserveTransaction[];
  settlements: Settlement[];
  drivers: Driver[];
  driverSettlements: DriverSettlement[];
  subscription: Subscription;
}

/* ---- Derived / computed shapes ------------------------------------- */

export interface LoadMetrics {
  totalMiles: number;
  revenuePerLoadedMile: number;
  revenuePerTotalMile: number;
  /** fuel + tolls + dispatch + factoring + other + paid driver settlement */
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
  calculationVersion: number;
  /** Performance-basis revenue, independent of payment status. */
  bookedRevenue: number;
  /** Cash-basis revenue, assigned by the recorded payment date. */
  collectedRevenue: number;
  /** Booked revenue in this period that remains unpaid. */
  accountsReceivable: number;
  /** Paid loads that have no payment date and therefore are not guessed into cash. */
  unallocatedCollectedRevenue: number;
  interestExpense: number;
  principalPayment: number;
  /** Historical truck-payment rows whose interest/principal split is unknown. */
  unallocatedDebtService: number;
  debtService: number;
  operatingProfit: number;
  cashAfterDebtService: number;
  /** @deprecated Use bookedRevenue. */
  grossRevenue: number;
  operatingExpenses: number;
  /** @deprecated Use operatingProfit. Kept as a read-compatible alias. */
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
  /** @deprecated Use collectedRevenue. */
  paidRevenue: number;
  /** @deprecated Use accountsReceivable. */
  outstandingRevenue: number;
  fixedExpenses: number;
  variableExpenses: number;
  fuelExpense: number;
  maintenanceExpense: number;
  /** Gross revenue divided by LOADED miles -- the undiluted rate. */
  revenuePerLoadedMile: number;
  variableCostPerMile: number;
}

/** Canonical all-in period answer used by financial surfaces. */
export interface FinancialSummary extends PeriodSummary {
  reserves: Array<{
    accountId: string;
    name: string;
    kind: ReserveKind;
    basis: ReserveBasis;
    pct: number;
    amount: number;
  }>;
  reserveTotal: number;
  safeToPayYourself: number;
  safeToPay: number;
  takeHomeRate: number;
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

/* ---- Goals ----------------------------------------------------------- */

/**
 * What the owner is aiming at. One record per business, edited in Settings.
 * Targets are monthly; every other window is derived from them rather than
 * stored, so changing a target never rewrites history.
 */
export interface FinancialGoal {
  id: string;
  businessId: string;
  /** Gross revenue the owner wants to book in a calendar month. */
  monthlyRevenueTarget: number;
  /** Operating profit (booked revenue - operating expenses) wanted in a calendar month. */
  monthlyProfitTarget: number;
  /** Profit per total mile the owner is trying to hold. */
  targetProfitPerMile: number;
  /** Deadhead share of total miles the owner does not want to exceed. */
  maxDeadheadPct: number;
  /** Optional load count target. Null when the owner does not track it. */
  targetLoads: number | null;
  /**
   * Days a week the truck is expected to run. Drives the daily profit target
   * and the month-end projection -- a projection that assumed seven driving
   * days would overstate every month.
   */
  workingDaysPerWeek: number;
  /** Expected loaded + deadhead miles in a normal month. */
  expectedMonthlyMiles?: number;
  updatedAt: string;
}

/* ---- Reserve buckets -------------------------------------------------- */

export type ReserveKind = "TAX" | "MAINTENANCE" | "EMERGENCY" | "CUSTOM";

/** What a reserve percentage is charged against. */
export type ReserveBasis = "OPERATING_PROFIT" | "GROSS_REVENUE";

/**
 * A virtual bucket. These are planning ledgers, not bank accounts: nothing
 * here moves real money.
 */
export interface ReserveAccount {
  id: string;
  businessId: string;
  kind: ReserveKind;
  name: string;
  basis: ReserveBasis;
  /**
   * Contribution rate as a percent.
   *
   * Null for the built-in TAX and MAINTENANCE buckets: their rates live in
   * FinancialSettings (taxReservePct / maintenanceReservePct) and are edited
   * on the Settings page, so a reserve rate is stored in exactly one place.
   * `resolveReserveRules()` is the single reader that merges the two.
   */
  contributionPct: number | null;
  /** Optional balance the owner is building toward. */
  targetBalance: number | null;
  active: boolean;
  sortOrder: number;
  createdAt: string;
}

export type ReserveTransactionType = "CONTRIBUTION" | "WITHDRAWAL" | "ADJUSTMENT";

/**
 * A movement in a bucket. `amount` is always signed: contributions positive,
 * withdrawals negative, adjustments either way. Balances are a running sum,
 * never a stored column.
 */
export interface ReserveTransaction {
  id: string;
  businessId: string;
  accountId: string;
  date: string;
  type: ReserveTransactionType;
  amount: number;
  description: string;
  /** Set when the row was posted automatically by closing a settlement. */
  settlementId: string | null;
  createdAt: string;
}

export interface ReserveBalance {
  account: ReserveAccount;
  balance: number;
  contributions: number;
  withdrawals: number;
  /** Movements inside the period being viewed. */
  periodContributions: number;
  periodWithdrawals: number;
  transactions: ReserveTransaction[];
  /** Progress toward `targetBalance`, or null when no target is set. */
  targetProgress: number | null;
}

/* ---- Settlements ------------------------------------------------------ */

/** Which half of the month a settlement covers. */
export type SettlementHalf = "FIRST" | "SECOND";

export type SettlementStatus = "OPEN" | "CLOSED";

/**
 * The numbers a settlement is closed on.
 *
 * This is the ONE place the app deliberately stores calculated values. A
 * settlement the owner has closed is a statement of what they were paid on;
 * changing a reserve percentage next month must not rewrite it.
 */
export interface SettlementSnapshot {
  /** Missing on historical snapshots, which are read as calculation version 1. */
  calculationVersion?: number;
  bookedRevenue?: number;
  collectedRevenue?: number;
  accountsReceivable?: number;
  unallocatedCollectedRevenue?: number;
  interestExpense?: number;
  principalPayment?: number;
  unallocatedDebtService?: number;
  debtService?: number;
  cashAfterDebtService?: number;
  grossRevenue: number;
  operatingExpenses: number;
  operatingProfit: number;
  reserves: { accountId: string; name: string; kind: ReserveKind; pct: number; basis: ReserveBasis; amount: number }[];
  reserveTotal: number;
  safeToPay: number;
  loadCount: number;
  totalMiles: number;
  loadedMiles: number;
  deadheadMiles: number;
  deadheadPct: number;
  fixedCostPerMile: number;
  variableCostPerMile: number;
  trueCostPerMile: number;
  revenuePerMile: number;
  profitPerMile: number;
}

export interface Settlement {
  id: string;
  businessId: string;
  /** Anchor month, "2026-08". */
  month: string;
  half: SettlementHalf;
  /** Inclusive ISO bounds, stored so a closed settlement never re-derives. */
  periodStart: string;
  periodEnd: string;
  status: SettlementStatus;
  closedAt: string | null;
  /** Populated on close, null while open. */
  snapshot: SettlementSnapshot | null;
  notes: string | null;
  createdAt: string;
}

/* ---- Drivers and driver pay ----------------------------------------- */

export interface Driver {
  id: string;
  businessId: string;
  name: string;
  /** Internal employee/contractor code only; never SSN or bank data. */
  reference: string | null;
  /** Entry default only. Each load keeps the unit it actually ran. */
  defaultTruckId: string | null;
  payType: DriverPayType;
  payRate: number;
  active: boolean;
  createdAt: string;
}

export interface DriverSettlementLine {
  id: string;
  settlementId: string;
  loadId: string;
  truckId: string;
  grossRevenue: number;
  loadedMiles: number;
  totalMiles: number;
  payType: DriverPayType;
  payRate: number;
  payAmount: number;
  expenseId: string | null;
  createdAt: string;
}

export interface DriverSettlement {
  id: string;
  businessId: string;
  driverId: string;
  periodStart: string;
  periodEnd: string;
  status: DriverSettlementStatus;
  paidOn: string | null;
  notes: string | null;
  lines: DriverSettlementLine[];
  createdAt: string;
}

/* ---- Plans and subscription ------------------------------------------- */

export type PlanId = "SOLO" | "OWNER" | "FLEET";

export type SubscriptionStatus = "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED";

/**
 * Which plan a business is on, and whether it is paid up.
 *
 * The prices and the truck limits are NOT here -- they live in lib/plans.ts,
 * because a price is a product decision that ships with a release. What is
 * stored is the choice and the state.
 *
 * The provider fields are deliberately present and empty. There is no payment
 * integration yet; when one arrives it fills these in rather than reshaping
 * the model.
 */
export interface Subscription {
  id: string;
  businessId: string;
  plan: PlanId;
  status: SubscriptionStatus;
  /** End of the trial or the paid period, ISO date. Null while unbilled. */
  currentPeriodEnd: string | null;
  providerCustomerId: string | null;
  providerSubscriptionId: string | null;
  startedAt: string;
  updatedAt: string;
}
