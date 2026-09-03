/**
 * Storage contract.
 *
 * Two implementations satisfy it: a local JSON store (zero-setup local
 * development) and a Prisma + PostgreSQL store (production).
 * Application code only ever talks to this interface, so switching the
 * backing database is an environment change, not a refactor.
 */

import type {
  Business,
  User,
  Dataset,
  Driver,
  DriverPayType,
  DriverSettlement,
  DriverSettlementAdjustment,
  DriverSettlementAdjustmentType,
  FinancialGoal,
  ReserveAccount,
  ReserveBasis,
  ReserveKind,
  ReserveTransaction,
  ReserveTransactionType,
  PlanId,
  Settlement,
  SettlementHalf,
  SettlementSnapshot,
  Subscription,
  Document,
  DocumentType,
  Expense,
  ExpenseCategoryId,
  ExpenseScope,
  FinancialSettings,
  FinancialTreatment,
  FinancialObligation,
  FinancialObligationKind,
  PaymentEvent,
  FuelEntry,
  Load,
  LoadCapacity,
  EquipmentType,
  MaintenanceBasis,
  MaintenanceRecord,
  MaintenanceType,
  MemberRole,
  PaymentStatus,
  OperatingCostExemptions,
  Truck,
} from "../types";

/**
 * The requested workspace no longer exists in the configured data store.
 *
 * Keeping this as a distinct error lets trusted integrations acknowledge
 * events for deleted workspaces without swallowing transient database errors.
 */
export class BusinessNotFoundError extends Error {
  constructor() {
    super("This session does not have access to that business.");
    this.name = "BusinessNotFoundError";
  }
}

export interface LoadInput {
  /** Which unit ran it. Optional only while the workspace has one active truck. */
  truckId?: string | null;
  /** Optional driver assigned to this trip. */
  driverId?: string | null;
  /** Pickup date. */
  date: string;
  deliveryDate?: string | null;
  endingOdometer?: number | null;
  originCity: string;
  originState: string;
  destinationCity: string;
  destinationState: string;
  broker?: string | null;
  loadNumber?: string | null;
  equipmentType?: EquipmentType | null;
  loadCapacity?: LoadCapacity | null;
  equipmentLengthFt?: number | null;
  weightLbs?: number | null;
  commodity?: string | null;
  loadedMiles: number;
  deadheadMiles: number;
  grossRate: number;
  fuelCost: number;
  tolls: number;
  dispatchFee: number;
  factoringFee: number;
  otherExpenses: number;
  costsPosted?: boolean;
  status: PaymentStatus;
  jurisdictionMiles?: Load["jurisdictionMiles"];
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
  invoiceDueDate?: string | null;
  invoicePaidDate?: string | null;
  billToName?: string | null;
  billToEmail?: string | null;
  billToAddress?: string | null;
  invoiceNotes?: string | null;
  notes?: string | null;
}

export interface ExpenseInput {
  /**
   * TRUCK charges the cost to a unit; BUSINESS is fleet overhead and forces
   * truckId to null. A TRUCK expense may omit the id only while the workspace
   * has one active truck; a fleet must name the unit explicitly.
   */
  scope?: ExpenseScope;
  truckId?: string | null;
  date: string;
  category: ExpenseCategoryId;
  description: string;
  vendor?: string | null;
  amount: number;
  loadId?: string | null;
  recurring: boolean;
  receiptNumber?: string | null;
  notes?: string | null;
  financialTreatment?: FinancialTreatment;
  obligationId?: string | null;
  splitGroupId?: string | null;
}

export interface FinancialObligationInput {
  truckId?: string | null;
  name: string;
  kind: FinancialObligationKind;
  counterparty?: string | null;
  startedOn?: string | null;
  endedOn?: string | null;
  expectedMonthlyPayment?: number | null;
  active?: boolean;
}

export interface DebtPaymentClassificationInput {
  obligationId?: string | null;
  newObligation?: FinancialObligationInput;
  treatment: "OPERATING_LEASE" | "LOAN_SPLIT" | "DEBT_UNALLOCATED";
  principalAmount?: number;
  interestAmount?: number;
}

export interface PaymentEventInput {
  loadId: string;
  date: string;
  amount: number;
  method?: string | null;
  reference?: string | null;
  notes?: string | null;
}

export interface FuelEntryInput {
  truckId?: string | null;
  date: string;
  gallons: number;
  pricePerGallon: number;
  totalCost: number;
  odometer?: number | null;
  location?: string | null;
  jurisdiction?: string | null;
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
  iftaTaxRates?: Record<string, number>;
  fleetOverheadAllocation?: "UNALLOCATED" | "FLEET_MILES";
}

export interface MaintenanceInput {
  truckId?: string | null;
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
  acquiredOn?: string | null;
  year?: number | null;
  make?: string | null;
  model?: string | null;
  vin?: string | null;
  purchasePrice?: number | null;
  monthlyPayment?: number | null;
  monthlyInsurance?: number | null;
  axleCount?: number | null;
  registeredGrossWeightLbs?: number | null;
  operatesInMultipleIftaJurisdictions?: boolean | null;
  iftaReportingEnabled?: boolean | null;
  startingOdometer: number;
  currentOdometer: number;
}

export interface DriverInput {
  name: string;
  reference?: string | null;
  defaultTruckId?: string | null;
  payType: DriverPayType;
  payRate: number;
}

export interface DriverSettlementInput {
  driverId: string;
  periodStart: string;
  periodEnd: string;
  notes?: string | null;
}

export interface DriverSettlementAdjustmentInput {
  type: DriverSettlementAdjustmentType;
  amount: number;
  reason: string;
}

export interface GoalInput {
  monthlyRevenueTarget: number;
  monthlyProfitTarget: number;
  targetProfitPerMile: number;
  maxDeadheadPct: number;
  targetLoads?: number | null;
  workingDaysPerWeek: number;
  expectedMonthlyMiles?: number;
}

export interface ReserveAccountInput {
  kind: ReserveKind;
  name: string;
  basis: ReserveBasis;
  /** Null keeps a built-in bucket on its Settings-owned rate. */
  contributionPct?: number | null;
  targetBalance?: number | null;
  active?: boolean;
}

export interface ReserveTransactionInput {
  accountId: string;
  date: string;
  type: ReserveTransactionType;
  /** Always positive; the store applies the sign implied by `type`. */
  amount: number;
  description: string;
  /** Adjustments may reduce a balance -- true makes the signed amount negative. */
  negative?: boolean;
}

export interface SettlementCloseInput {
  snapshot: SettlementSnapshot;
  /** Contributions to post when the settlement closes. */
  contributions: { accountId: string; amount: number; description: string }[];
  notes?: string | null;
}

export interface SubscriptionInput {
  plan: PlanId;
  /** Omitted leaves the current status untouched. */
  status?: Subscription["status"];
  currentPeriodEnd?: string | null;
  providerCustomerId?: string | null;
  providerSubscriptionId?: string | null;
}

export interface Repository {
  /** Everything the app needs for a request, in one read. */
  getDataset(): Promise<Dataset>;

  createLoad(input: LoadInput): Promise<Load>;
  updateLoad(id: string, input: LoadInput): Promise<Load>;
  /** Updates only the IFTA mileage allocation, preserving the operational load. */
  updateLoadJurisdictionMiles(id: string, mileage: Load["jurisdictionMiles"]): Promise<Load>;
  /** Updates the load field that owns a generated trip-cost ledger row. */
  updateLoadExpense(id: string, amount: number): Promise<Load>;
  deleteLoad(id: string): Promise<void>;

  createDriver(input: DriverInput): Promise<Driver>;
  updateDriver(id: string, input: DriverInput): Promise<Driver>;
  setDriverActive(id: string, active: boolean): Promise<Driver>;

  /** Freezes every still-unsettled assigned load inside the selected period. */
  createDriverSettlement(input: DriverSettlementInput): Promise<DriverSettlement>;
  /** Draft-only additions and reductions. Paid statements stay immutable. */
  addDriverSettlementAdjustment(
    settlementId: string,
    input: DriverSettlementAdjustmentInput,
  ): Promise<DriverSettlementAdjustment>;
  deleteDriverSettlementAdjustment(settlementId: string, adjustmentId: string): Promise<void>;
  /** Posts one Driver Pay expense per frozen line on the selected cash date. */
  payDriverSettlement(id: string, paidOn: string): Promise<DriverSettlement>;
  /** Only drafts can be deleted; paid statements are immutable. */
  deleteDriverSettlement(id: string): Promise<void>;

  createExpense(input: ExpenseInput): Promise<Expense>;
  updateExpense(id: string, input: ExpenseInput): Promise<Expense>;
  deleteExpense(id: string): Promise<void>;

  createFinancialObligation(input: FinancialObligationInput): Promise<FinancialObligation>;
  classifyDebtPayment(id: string, input: DebtPaymentClassificationInput): Promise<Expense[]>;
  createPaymentEvent(input: PaymentEventInput): Promise<PaymentEvent>;

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
  updateGoals(input: GoalInput): Promise<FinancialGoal>;
  updateSubscription(input: SubscriptionInput): Promise<Subscription>;

  createReserveAccount(input: ReserveAccountInput): Promise<ReserveAccount>;
  updateReserveAccount(id: string, input: ReserveAccountInput): Promise<ReserveAccount>;
  deleteReserveAccount(id: string): Promise<void>;

  createReserveTransaction(input: ReserveTransactionInput): Promise<ReserveTransaction>;
  deleteReserveTransaction(id: string): Promise<void>;

  /** Creates the OPEN settlement for a half-month if it does not exist yet. */
  ensureSettlement(month: string, half: SettlementHalf): Promise<Settlement>;
  /** Freezes the snapshot and posts the reserve contributions it implies. */
  closeSettlement(id: string, input: SettlementCloseInput): Promise<Settlement>;
  /** Clears the snapshot and removes the contributions the close posted. */
  reopenSettlement(id: string): Promise<Settlement>;
  updateSettlementNotes(id: string, notes: string | null): Promise<Settlement>;
  updateBusiness(input: BusinessInput): Promise<Business>;

  createTruck(input: TruckInput): Promise<Truck>;
  /** Omitting the id updates the primary truck, which is what a single-truck business means. */
  updateTruck(input: TruckInput, id?: string): Promise<Truck>;
  /** Stores the owner's explicit no-financing answer; null means not confirmed. */
  setTruckFinancingConfirmedNone(id: string, value: boolean | null): Promise<Truck>;
  /** Stores only explicit not-applicable cost groups; recorded evidence stays ledger-derived. */
  setTruckOperatingCostExemptions(
    id: string,
    exemptions: OperatingCostExemptions,
  ): Promise<Truck>;
  /**
   * Retires a unit without deleting anything. Its loads, expenses and service
   * history stay exactly where they are and keep appearing in past reports.
   */
  archiveTruck(id: string, soldOn?: string | null): Promise<Truck>;
  restoreTruck(id: string): Promise<Truck>;
}

/**
 * Account operations, which by definition cannot be scoped to a business --
 * they are what establishes which business the caller belongs to.
 */
export interface AuthStore {
  countUsers(): Promise<number>;
  findUserByEmail(email: string): Promise<User | null>;
  findUserById(id: string): Promise<User | null>;
  listMembers(businessId: string): Promise<User[]>;
  createMember(input: {
    businessId: string;
    email: string;
    name?: string | null;
    role: Exclude<MemberRole, "OWNER">;
  }): Promise<User>;
  updateMemberRole(
    userId: string,
    businessId: string,
    role: Exclude<MemberRole, "OWNER">,
  ): Promise<User>;
  markMemberJoined(userId: string, businessId: string): Promise<User>;
  removeMember(userId: string, businessId: string): Promise<{ email: string }>;
  /**
   * Creates an owner with a private business workspace.
   */
  createOwner(input: {
    email: string;
    name?: string | null;
    passwordHash: string;
    businessName?: string;
    /** Chosen during onboarding. Defaults to Individual. */
    plan?: PlanId;
  }): Promise<User>;
  /** Removes ledger data but preserves the owner, business and subscription. */
  resetBusinessData(userId: string, businessId: string): Promise<string[]>;
  /** Removes the owner and, when they are the last owner, their whole business. */
  deleteAccount(userId: string, businessId: string): Promise<{ email: string; storageKeys: string[] }>;
  /** Server-only account index used by the protected operator console. */
  listAccounts(): Promise<AdminAccountSummary[]>;
}

export interface AdminAccountSummary {
  userId: string;
  businessId: string;
  email: string;
  name: string | null;
  businessName: string;
  createdAt: string;
  plan: PlanId;
  subscriptionStatus: Subscription["status"];
  currentPeriodEnd: string | null;
  hasProviderSubscription: boolean;
  /** Inferred server-side; no provider identifiers are exposed to the client. */
  accessSource: "stripe" | "complimentary" | "trial" | "inactive";
  /** Most recent record creation across product modules, never a financial value. */
  lastActivityAt: string | null;
  counts: {
    trucks: number;
    activeTrucks: number;
    loads: number;
    expenses: number;
    fuelEntries: number;
    documents: number;
    maintenance: number;
    reserveTransactions: number;
    settlements: number;
  };
}

export function newId(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}${random}`;
}
