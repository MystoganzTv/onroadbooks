import { sql } from "drizzle-orm";
import { check, foreignKey, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { business } from "./businesses";

export const financialSettings = pgTable("FinancialSettings", {
  id: text("id").primaryKey(),
  businessId: text("businessId").notNull(),
  taxReservePct: numeric("taxReservePct", { precision: 5, scale: 2 }).notNull().default(sql`20`),
  maintenanceReservePct: numeric("maintenanceReservePct", { precision: 5, scale: 2 }).notNull().default(sql`5`),
  categoryBehavior: jsonb("categoryBehavior").notNull().default(sql`'{}'::jsonb`),
  fleetOverheadAllocation: text("fleetOverheadAllocation").notNull().default("UNALLOCATED"),
  ratingGreatPerMile: numeric("ratingGreatPerMile", { precision: 8, scale: 2 }).notNull().default(sql`2`),
  ratingGoodPerMile: numeric("ratingGoodPerMile", { precision: 8, scale: 2 }).notNull().default(sql`1.5`),
  ratingMarginalPerMile: numeric("ratingMarginalPerMile", { precision: 8, scale: 2 }).notNull().default(sql`1`),
  deadheadWarnPct: numeric("deadheadWarnPct", { precision: 5, scale: 2 }).notNull().default(sql`20`),
  maintenanceWarnMiles: integer("maintenanceWarnMiles").notNull().default(2000),
  maintenanceWarnDays: integer("maintenanceWarnDays").notNull().default(30),
  iftaTaxRates: jsonb("iftaTaxRates").notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("createdAt", { precision: 3, mode: "date", withTimezone: false }).notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updatedAt", { precision: 3, mode: "date", withTimezone: false }).notNull().$onUpdateFn(() => new Date()),
}, (table) => [
  uniqueIndex("FinancialSettings_businessId_key").on(table.businessId),
  foreignKey({ name: "FinancialSettings_businessId_fkey", columns: [table.businessId], foreignColumns: [business.id] }).onDelete("cascade").onUpdate("cascade"),
  check("FinancialSettings_fleetOverheadAllocation_check", sql`${table.fleetOverheadAllocation} IN ('UNALLOCATED', 'FLEET_MILES')`),
]);
