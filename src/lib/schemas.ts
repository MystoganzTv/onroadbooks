import { z } from "zod";
import { isIftaJurisdiction } from "./ifta";

import { CATEGORY_IDS } from "./categories";
import { DOCUMENT_TYPE_IDS } from "./documents";
import { MAINTENANCE_TYPE_IDS } from "./maintenance";
import { ASSIGNABLE_ROLES } from "./roles";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date");

const money = z
  .number({ invalid_type_error: "Enter a number" })
  .min(0, "Cannot be negative")
  .max(1_000_000, "That looks too large");

/** A generated load expense may be set to zero to remove it from the ledger. */
export const loadExpenseAmountSchema = money;

const miles = z
  .number({ invalid_type_error: "Enter a number" })
  .min(0, "Cannot be negative")
  .max(100_000, "That looks too large");

const iftaJurisdiction = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .refine(isIftaJurisdiction, "Choose an IFTA jurisdiction");

export const jurisdictionMileageSchema = z.object({
  jurisdiction: iftaJurisdiction,
  totalMiles: miles,
  nonTaxableMiles: miles,
});

export const jurisdictionMilesSchema = z.array(jurisdictionMileageSchema).max(60);

export const memberInviteSchema = z.object({
  email: z.string().trim().email("Enter a valid email address").max(254),
  name: z.string().trim().max(120).optional().nullable(),
  role: z.enum(ASSIGNABLE_ROLES),
});

export const memberRoleSchema = z.object({
  userId: z.string().trim().min(1),
  role: z.enum(ASSIGNABLE_ROLES),
});

/** TRUCK charges a unit; BUSINESS is fleet overhead and carries no truck. */
export const expenseScopeValues = ["TRUCK", "BUSINESS"] as const;

export const loadSchema = z
  .object({
    truckId: z.string().trim().optional().nullable(),
    driverId: z.string().trim().optional().nullable(),
    date: isoDate,
    deliveryDate: isoDate.optional().nullable(),
    endingOdometer: z
      .number({ invalid_type_error: "Enter a number" })
      .int("Use a whole-number odometer reading")
      .min(0, "Cannot be negative")
      .max(5_000_000, "That odometer reading looks too large")
      .optional()
      .nullable(),
    originCity: z.string().trim().min(1, "Origin city is required").max(80),
    originState: z
      .string()
      .trim()
      .length(2, "Use a 2-letter state")
      .regex(/^[A-Za-z]{2}$/, "Use a 2-letter state"),
    destinationCity: z.string().trim().min(1, "Destination city is required").max(80),
    destinationState: z
      .string()
      .trim()
      .length(2, "Use a 2-letter state")
      .regex(/^[A-Za-z]{2}$/, "Use a 2-letter state"),
    broker: z.string().trim().max(120).optional().nullable(),
    loadNumber: z.string().trim().max(60).optional().nullable(),
    equipmentType: z
      .enum(["BOX_TRUCK", "DRY_VAN", "REEFER", "FLATBED", "POWER_ONLY", "SPRINTER_VAN", "OTHER"])
      .optional()
      .nullable(),
    loadCapacity: z.enum(["FULL", "PARTIAL"]).optional().nullable(),
    equipmentLengthFt: z
      .number({ invalid_type_error: "Enter a number" })
      .int("Use a whole number")
      .min(1, "Must be at least 1 ft")
      .max(100, "Use 100 ft or fewer")
      .optional()
      .nullable(),
    weightLbs: z
      .number({ invalid_type_error: "Enter a number" })
      .int("Use whole pounds")
      .min(1, "Must be at least 1 lb")
      .max(200_000, "That weight looks too large")
      .optional()
      .nullable(),
    commodity: z.string().trim().max(120).optional().nullable(),
    loadedMiles: miles.min(1, "Loaded miles must be greater than 0"),
    deadheadMiles: miles,
    grossRate: money.min(0.01, "Gross rate is required"),
    fuelCost: money,
    tolls: money,
    dispatchFee: money,
    factoringFee: money,
    otherExpenses: money,
    costsPosted: z.boolean().optional(),
    status: z.enum(["PENDING", "INVOICED", "PAID"]),
    jurisdictionMiles: jurisdictionMilesSchema.optional(),
    notes: z.string().trim().max(2000).optional().nullable(),
  })
  .refine((value) => !value.deliveryDate || value.deliveryDate >= value.date, {
    message: "Delivery cannot be before pickup",
    path: ["deliveryDate"],
  })
  .refine(
    (value) =>
      value.fuelCost +
        value.tolls +
        value.dispatchFee +
        value.factoringFee +
        value.otherExpenses <=
      value.grossRate * 3,
    {
      message: "Direct Trip Costs look far higher than the Gross Rate -- check the numbers",
      path: ["fuelCost"],
    },
  )
  .refine(
    (value) =>
      (value.jurisdictionMiles ?? []).every(
        (row) => row.nonTaxableMiles <= row.totalMiles,
      ),
    {
      message: "Non-taxable miles cannot exceed total jurisdiction miles",
      path: ["jurisdictionMiles"],
    },
  )
  .refine(
    (value) =>
      (value.jurisdictionMiles ?? []).reduce((total, row) => total + row.totalMiles, 0) <=
      value.loadedMiles + value.deadheadMiles,
    {
      message: "Jurisdiction miles cannot exceed total trip miles",
      path: ["jurisdictionMiles"],
    },
  );

export const invoiceSchema = z
  .object({
    invoiceNumber: z.string().trim().min(1, "Invoice number is required").max(40),
    invoiceDate: isoDate,
    invoiceDueDate: isoDate,
    billToName: z.string().trim().min(1, "Customer name is required").max(160),
    billToEmail: z.string().trim().email("Enter a valid email").max(254).optional().nullable().or(z.literal("")),
    billToAddress: z.string().trim().max(500).optional().nullable(),
    invoiceNotes: z.string().trim().max(2000).optional().nullable(),
  })
  .refine((value) => value.invoiceDueDate >= value.invoiceDate, {
    message: "Due date cannot be before the invoice date",
    path: ["invoiceDueDate"],
  });

export const paymentEventSchema = z.object({
  loadId: z.string().trim().min(1),
  date: isoDate,
  amount: money.min(0.01, "Payment amount is required"),
  method: z.string().trim().max(60).optional().nullable(),
  reference: z.string().trim().max(120).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
});

const financialObligationSchema = z
  .object({
    truckId: z.string().trim().optional().nullable(),
    name: z.string().trim().min(1, "Name the obligation").max(120),
    kind: z.enum(["LOAN", "OPERATING_LEASE", "UNKNOWN"]),
    counterparty: z.string().trim().max(120).optional().nullable(),
    startedOn: isoDate.optional().nullable(),
    endedOn: isoDate.optional().nullable(),
    expectedMonthlyPayment: money.optional().nullable(),
    active: z.boolean().optional(),
  })
  .refine((value) => !value.endedOn || !value.startedOn || value.endedOn >= value.startedOn, {
    message: "End date cannot be before start date",
    path: ["endedOn"],
  });

export const debtPaymentClassificationSchema = z
  .object({
    obligationId: z.string().trim().optional().nullable(),
    newObligation: financialObligationSchema.optional(),
    treatment: z.enum(["OPERATING_LEASE", "LOAN_SPLIT", "DEBT_UNALLOCATED"]),
    principalAmount: money.optional(),
    interestAmount: money.optional(),
  })
  .refine((value) => !(value.obligationId && value.newObligation), {
    message: "Choose an existing obligation or create a new one, not both",
    path: ["obligationId"],
  });

export const iftaRatesSchema = z.object({
  quarter: z.string().regex(/^\d{4}-Q[1-4]$/, "Use a quarter such as 2026-Q3"),
  rates: z.record(
    z.string().regex(/^[A-Za-z]{2}$/),
    z.number().min(0, "Rate cannot be negative").max(5, "Rate looks too high"),
  ).refine(
    (rates) => Object.keys(rates).every(isIftaJurisdiction),
    "Choose valid IFTA jurisdictions",
  ),
});

export const expenseSchema = z.object({
  scope: z.enum(expenseScopeValues).optional(),
  truckId: z.string().trim().optional().nullable(),
  date: isoDate,
  category: z.enum(CATEGORY_IDS as [string, ...string[]]),
  description: z.string().trim().min(1, "Description is required").max(200),
  vendor: z.string().trim().max(120).optional().nullable(),
  amount: money.min(0.01, "Amount is required"),
  loadId: z.string().trim().optional().nullable(),
  recurring: z.boolean(),
  receiptNumber: z.string().trim().max(80).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export const fuelSchema = z.object({
  truckId: z.string().trim().optional().nullable(),
  date: isoDate,
  gallons: z
    .number({ invalid_type_error: "Enter a number" })
    .min(0.1, "Gallons is required")
    .max(500, "That looks too large"),
  pricePerGallon: z
    .number({ invalid_type_error: "Enter a number" })
    .min(0.01, "Price per gallon is required")
    .max(50, "That looks too large"),
  totalCost: money.min(0.01, "Total cost is required"),
  odometer: z
    .number({ invalid_type_error: "Enter a number" })
    .min(0)
    .max(5_000_000)
    .optional()
    .nullable(),
  location: z.string().trim().max(120).optional().nullable(),
  jurisdiction: iftaJurisdiction.optional().nullable(),
  loadId: z.string().trim().optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export const settingsSchema = z.object({
  businessName: z.string().trim().min(1, "Business name is required").max(120),
  currency: z.string().trim().length(3),
  taxReservePct: z
    .number({ invalid_type_error: "Enter a number" })
    .min(0, "Cannot be negative")
    .max(100, "Cannot exceed 100%"),
  maintenanceReservePct: z
    .number({ invalid_type_error: "Enter a number" })
    .min(0, "Cannot be negative")
    .max(100, "Cannot exceed 100%"),
  // Keys bounded to real categories: this map is persisted and re-read on
  // every request, so an unbounded record would grow the file forever.
  categoryBehavior: z
    .record(z.enum(CATEGORY_IDS as [string, ...string[]]), z.enum(["FIXED", "VARIABLE"]))
    .optional(),
  ratingGreatPerMile: z
    .number({ invalid_type_error: "Enter a number" })
    .min(0, "Cannot be negative")
    .max(100, "That looks too large"),
  ratingGoodPerMile: z
    .number({ invalid_type_error: "Enter a number" })
    .min(0, "Cannot be negative")
    .max(100, "That looks too large"),
  ratingMarginalPerMile: z
    .number({ invalid_type_error: "Enter a number" })
    .min(0, "Cannot be negative")
    .max(100, "That looks too large"),
  deadheadWarnPct: z
    .number({ invalid_type_error: "Enter a number" })
    .min(0, "Cannot be negative")
    .max(100, "Cannot exceed 100%"),
  maintenanceWarnMiles: z
    .number({ invalid_type_error: "Enter a number" })
    .int()
    .min(0, "Cannot be negative")
    .max(100000, "That looks too large"),
  maintenanceWarnDays: z
    .number({ invalid_type_error: "Enter a number" })
    .int()
    .min(0, "Cannot be negative")
    .max(365, "Use 365 days or fewer"),
})
  .refine((v) => v.ratingGreatPerMile > v.ratingGoodPerMile, {
    message: "Great must be above Good",
    path: ["ratingGreatPerMile"],
  })
  .refine((v) => v.ratingGoodPerMile > v.ratingMarginalPerMile, {
    message: "Good must be above Marginal",
    path: ["ratingGoodPerMile"],
  });

export const maintenanceSchema = z
  .object({
    truckId: z.string().trim().optional().nullable(),
    type: z.enum(MAINTENANCE_TYPE_IDS as [string, ...string[]]),
    basis: z.enum(["DATE", "MILEAGE", "BOTH"]),
    serviceDate: isoDate,
    odometer: z
      .number({ invalid_type_error: "Enter a number" })
      .min(0)
      .max(5_000_000)
      .optional()
      .nullable(),
    cost: money,
    vendor: z.string().trim().max(120).optional().nullable(),
    nextServiceDate: isoDate.optional().nullable(),
    nextServiceOdometer: z
      .number({ invalid_type_error: "Enter a number" })
      .min(0)
      .max(5_000_000)
      .optional()
      .nullable(),
    notes: z.string().trim().max(2000).optional().nullable(),
    recordAsExpense: z.boolean().optional(),
  })
  .refine((v) => v.basis === "MILEAGE" || !!v.nextServiceDate, {
    message: "A next service date is required for date-based items",
    path: ["nextServiceDate"],
  })
  .refine((v) => v.basis === "DATE" || v.nextServiceOdometer != null, {
    message: "A next service odometer is required for mileage-based items",
    path: ["nextServiceOdometer"],
  })
  .refine(
    (v) =>
      v.basis === "DATE" ||
      v.odometer == null ||
      v.nextServiceOdometer == null ||
      v.nextServiceOdometer > v.odometer,
    {
      message: "Next service must be ahead of the service odometer",
      path: ["nextServiceOdometer"],
    },
  );

export const truckArchiveSchema = z.object({
  id: z.string().trim().min(1),
  soldOn: isoDate.optional().nullable(),
});

export const documentMetaSchema = z.object({
  type: z.enum(DOCUMENT_TYPE_IDS as [string, ...string[]]),
  label: z.string().trim().max(120).optional().nullable(),
  owner: z.enum(["LOAD", "EXPENSE", "TRUCK", "MAINTENANCE"]),
  entityId: z.string().trim().min(1),
});

export const truckSchema = z.object({
  name: z.string().trim().min(1, "Truck name is required").max(80),
  acquiredOn: isoDate.optional().nullable(),
  year: z.number().int().min(1950).max(2100).optional().nullable(),
  make: z.string().trim().max(60).optional().nullable(),
  model: z.string().trim().max(80).optional().nullable(),
  vin: z.string().trim().max(24).optional().nullable(),
  purchasePrice: money.optional().nullable(),
  monthlyPayment: money.optional().nullable(),
  monthlyInsurance: money.optional().nullable(),
  startingOdometer: z.number().int().min(0).max(5_000_000),
  currentOdometer: z.number().int().min(0).max(5_000_000),
});

export const driverSchema = z
  .object({
    name: z.string().trim().min(1, "Driver name is required").max(120),
    reference: z.string().trim().max(40).optional().nullable(),
    defaultTruckId: z.string().trim().optional().nullable(),
    payType: z.enum([
      "PERCENT_GROSS",
      "PER_LOADED_MILE",
      "PER_TOTAL_MILE",
      "FLAT_PER_LOAD",
    ]),
    payRate: z
      .number({ invalid_type_error: "Enter a pay rate" })
      .min(0.01, "Pay rate must be greater than zero")
      .max(100_000, "That pay rate looks too large"),
  })
  .refine((value) => value.payType !== "PERCENT_GROSS" || value.payRate <= 100, {
    message: "Percent of gross cannot exceed 100%",
    path: ["payRate"],
  });

export const driverSettlementSchema = z
  .object({
    driverId: z.string().trim().min(1, "Choose a driver"),
    periodStart: isoDate,
    periodEnd: isoDate,
    notes: z.string().trim().max(2000).optional().nullable(),
  })
  .refine((value) => value.periodEnd >= value.periodStart, {
    message: "End date cannot be before start date",
    path: ["periodEnd"],
  });

export const driverSettlementPaymentSchema = z.object({
  id: z.string().trim().min(1),
  paidOn: isoDate,
});

/* ---- Goals ----------------------------------------------------------- */

export const goalSchema = z.object({
  monthlyRevenueTarget: money,
  monthlyProfitTarget: money,
  targetProfitPerMile: z.number().min(0).max(100),
  maxDeadheadPct: z.number().min(0).max(100),
  targetLoads: z.number().int().min(0).max(1000).optional().nullable(),
  workingDaysPerWeek: z.number().int().min(1, "At least one day").max(7),
  expectedMonthlyMiles: z.number().int().min(0).max(100_000),
});

/* ---- Reserve buckets -------------------------------------------------- */

export const reserveAccountSchema = z.object({
  kind: z.enum(["TAX", "MAINTENANCE", "EMERGENCY", "CUSTOM"]),
  name: z.string().trim().min(1, "Give the bucket a name").max(60),
  basis: z.enum(["OPERATING_PROFIT", "GROSS_REVENUE"]),
  contributionPct: z.number().min(0).max(100).optional().nullable(),
  targetBalance: money.optional().nullable(),
  active: z.boolean().optional(),
});

export const reserveTransactionSchema = z.object({
  accountId: z.string().trim().min(1, "Pick a bucket"),
  date: isoDate,
  type: z.enum(["CONTRIBUTION", "WITHDRAWAL", "ADJUSTMENT"]),
  amount: z.number().min(0.01, "Enter an amount").max(1_000_000),
  description: z.string().trim().min(1, "Say what this is for").max(200),
  negative: z.boolean().optional(),
});

/* ---- Settlements ------------------------------------------------------ */

export const settlementRefSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, "Expected YYYY-MM"),
  half: z.enum(["FIRST", "SECOND"]),
});

export const settlementNotesSchema = z.object({
  id: z.string().trim().min(1),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export type LoadFormValues = z.infer<typeof loadSchema>;
export type InvoiceFormValues = z.infer<typeof invoiceSchema>;
export type GoalFormValues = z.infer<typeof goalSchema>;
export type ReserveAccountFormValues = z.infer<typeof reserveAccountSchema>;
export type ReserveTransactionFormValues = z.infer<typeof reserveTransactionSchema>;
export type ExpenseFormValues = z.infer<typeof expenseSchema>;
export type FuelFormValues = z.infer<typeof fuelSchema>;
export type SettingsFormValues = z.infer<typeof settingsSchema>;
export type MaintenanceFormValues = z.infer<typeof maintenanceSchema>;
export type TruckFormValues = z.infer<typeof truckSchema>;
export type DriverFormValues = z.infer<typeof driverSchema>;
export type DriverSettlementFormValues = z.infer<typeof driverSettlementSchema>;

export const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(200),
  password: z.string().min(1, "Password is required").max(200),
});

export const setupSchema = z.object({
  // Business identity is confirmed in the shared post-auth onboarding flow so
  // email and Google signups follow the same path and neither has to invent it.
  businessName: z.string().trim().min(1, "Business name is required").max(120).optional(),
  name: z.string().trim().max(120).optional().nullable(),
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(200),
  // 10 characters with no composition rules: length is what actually helps,
  // and arbitrary symbol requirements push people toward weaker patterns.
  password: z.string().min(10, "Use at least 10 characters").max(200),
  plan: z.enum(["SOLO", "OWNER", "FLEET"]).optional(),
});

export const planChangeSchema = z.object({
  plan: z.enum(["SOLO", "OWNER", "FLEET"]),
});
