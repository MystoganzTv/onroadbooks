import { sql } from "drizzle-orm";
import { boolean, date, foreignKey, index, integer, jsonb, numeric, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { business } from "./businesses";

export const truck = pgTable("Truck", {
  id: text("id").primaryKey(),
  businessId: text("businessId").notNull(),
  name: text("name").notNull(),
  year: integer("year"),
  make: text("make"),
  model: text("model"),
  vin: text("vin"),
  purchasePrice: numeric("purchasePrice", { precision: 12, scale: 2 }),
  monthlyPayment: numeric("monthlyPayment", { precision: 12, scale: 2 }),
  monthlyInsurance: numeric("monthlyInsurance", { precision: 12, scale: 2 }),
  financingConfirmedNone: boolean("financingConfirmedNone"),
  operatingCostExemptions: jsonb("operatingCostExemptions").notNull().default(sql`'{}'::jsonb`),
  /** Owner-entered miles per gallon; null until set. ADR 0030. */
  referenceMpg: numeric("referenceMpg", { precision: 5, scale: 2 }),
  axleCount: integer("axleCount"),
  registeredGrossWeightLbs: integer("registeredGrossWeightLbs"),
  operatesInMultipleIftaJurisdictions: boolean("operatesInMultipleIftaJurisdictions"),
  iftaReportingEnabled: boolean("iftaReportingEnabled"),
  startingOdometer: integer("startingOdometer").notNull().default(0),
  currentOdometer: integer("currentOdometer").notNull().default(0),
  active: boolean("active").notNull().default(true),
  acquiredOn: date("acquiredOn", { mode: "string" }),
  soldOn: date("soldOn", { mode: "string" }),
  createdAt: timestamp("createdAt", { precision: 3, mode: "date", withTimezone: false }).notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updatedAt", { precision: 3, mode: "date", withTimezone: false }).notNull().$onUpdateFn(() => new Date()),
}, (table) => [
  index("Truck_businessId_idx").on(table.businessId),
  foreignKey({ name: "Truck_businessId_fkey", columns: [table.businessId], foreignColumns: [business.id] }).onDelete("cascade").onUpdate("cascade"),
]);
