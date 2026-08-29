import { z } from "zod";

import { CATEGORY_IDS } from "./categories";
import { DOCUMENT_TYPE_IDS } from "./documents";
import { MAINTENANCE_TYPE_IDS } from "./maintenance";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date");

const money = z
  .number({ invalid_type_error: "Enter a number" })
  .min(0, "Cannot be negative")
  .max(1_000_000, "That looks too large");

const miles = z
  .number({ invalid_type_error: "Enter a number" })
  .min(0, "Cannot be negative")
  .max(100_000, "That looks too large");

export const loadSchema = z
  .object({
    date: isoDate,
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
    loadedMiles: miles.min(1, "Loaded miles must be greater than 0"),
    deadheadMiles: miles,
    grossRate: money.min(0.01, "Gross rate is required"),
    fuelCost: money,
    tolls: money,
    dispatchFee: money,
    factoringFee: money,
    otherExpenses: money,
    status: z.enum(["PENDING", "INVOICED", "PAID"]),
    notes: z.string().trim().max(2000).optional().nullable(),
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
      message: "Trip expenses look far higher than the rate -- check the numbers",
      path: ["fuelCost"],
    },
  );

export const expenseSchema = z.object({
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

export const documentMetaSchema = z.object({
  type: z.enum(DOCUMENT_TYPE_IDS as [string, ...string[]]),
  label: z.string().trim().max(120).optional().nullable(),
  owner: z.enum(["LOAD", "EXPENSE", "TRUCK", "MAINTENANCE"]),
  entityId: z.string().trim().min(1),
});

export const truckSchema = z.object({
  name: z.string().trim().min(1, "Truck name is required").max(80),
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

export type LoadFormValues = z.infer<typeof loadSchema>;
export type ExpenseFormValues = z.infer<typeof expenseSchema>;
export type FuelFormValues = z.infer<typeof fuelSchema>;
export type SettingsFormValues = z.infer<typeof settingsSchema>;
export type MaintenanceFormValues = z.infer<typeof maintenanceSchema>;
export type TruckFormValues = z.infer<typeof truckSchema>;
