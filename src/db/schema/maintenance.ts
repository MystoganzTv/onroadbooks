import { sql } from "drizzle-orm";
import { date, foreignKey, index, integer, numeric, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import * as enums from "./enums";
import { business } from "./businesses";
import { expense } from "./expenses";
import { truck } from "./trucks";

export const maintenanceRecord = pgTable("MaintenanceRecord", {
  id: text("id").primaryKey(),
  businessId: text("businessId").notNull(),
  truckId: text("truckId").notNull(),
  type: enums.maintenanceType("type").notNull(),
  basis: enums.maintenanceBasis("basis").notNull().default("BOTH"),
  serviceDate: date("serviceDate", { mode: "string" }).notNull(),
  odometer: integer("odometer"),
  cost: numeric("cost", { precision: 12, scale: 2 }).notNull().default(sql`0`),
  vendor: text("vendor"),
  nextServiceDate: date("nextServiceDate", { mode: "string" }),
  nextServiceOdometer: integer("nextServiceOdometer"),
  expenseId: text("expenseId"),
  notes: text("notes"),
  createdAt: timestamp("createdAt", { precision: 3, mode: "date", withTimezone: false }).notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updatedAt", { precision: 3, mode: "date", withTimezone: false }).notNull().$onUpdateFn(() => new Date()),
}, (table) => [
  uniqueIndex("MaintenanceRecord_expenseId_key").on(table.expenseId),
  index("MaintenanceRecord_businessId_serviceDate_idx").on(table.businessId, table.serviceDate),
  index("MaintenanceRecord_truckId_type_idx").on(table.truckId, table.type),
  foreignKey({ name: "MaintenanceRecord_businessId_fkey", columns: [table.businessId], foreignColumns: [business.id] }).onDelete("cascade").onUpdate("cascade"),
  foreignKey({ name: "MaintenanceRecord_truckId_fkey", columns: [table.truckId], foreignColumns: [truck.id] }).onDelete("cascade").onUpdate("cascade"),
  foreignKey({ name: "MaintenanceRecord_expenseId_fkey", columns: [table.expenseId], foreignColumns: [expense.id] }).onDelete("set null").onUpdate("cascade"),
]);
