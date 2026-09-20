import { sql } from "drizzle-orm";
import { date, foreignKey, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import * as enums from "./enums";
import { business } from "./businesses";
import { driver } from "./drivers";

export const driverSettlement = pgTable("DriverSettlement", {
  id: text("id").primaryKey(),
  businessId: text("businessId").notNull(),
  driverId: text("driverId").notNull(),
  periodStart: date("periodStart", { mode: "string" }).notNull(),
  periodEnd: date("periodEnd", { mode: "string" }).notNull(),
  status: enums.driverSettlementStatus("status").notNull().default("DRAFT"),
  paidOn: date("paidOn", { mode: "string" }),
  notes: text("notes"),
  createdAt: timestamp("createdAt", { precision: 3, mode: "date", withTimezone: false }).notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updatedAt", { precision: 3, mode: "date", withTimezone: false }).notNull().$onUpdateFn(() => new Date()),
}, (table) => [
  index("DriverSettlement_businessId_periodStart_idx").on(table.businessId, table.periodStart),
  index("DriverSettlement_driverId_periodStart_idx").on(table.driverId, table.periodStart),
  foreignKey({ name: "DriverSettlement_businessId_fkey", columns: [table.businessId], foreignColumns: [business.id] }).onDelete("cascade").onUpdate("cascade"),
  foreignKey({ name: "DriverSettlement_driverId_fkey", columns: [table.driverId], foreignColumns: [driver.id] }).onDelete("restrict").onUpdate("cascade"),
]);
