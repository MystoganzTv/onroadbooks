import { sql } from "drizzle-orm";
import { date, foreignKey, index, integer, numeric, pgTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { business } from "./businesses";
import { expense } from "./expenses";
import { load } from "./loads";
import { truck } from "./trucks";

export const fuelEntry = pgTable("FuelEntry", {
  id: text("id").primaryKey(),
  businessId: text("businessId").notNull(),
  truckId: text("truckId").notNull(),
  loadId: text("loadId"),
  date: date("date", { mode: "string" }).notNull(),
  gallons: numeric("gallons", { precision: 10, scale: 3 }).notNull(),
  pricePerGallon: numeric("pricePerGallon", { precision: 10, scale: 3 }).notNull(),
  totalCost: numeric("totalCost", { precision: 12, scale: 2 }).notNull(),
  odometer: integer("odometer"),
  location: text("location"),
  jurisdiction: varchar("jurisdiction", { length: 2 }),
  expenseId: text("expenseId"),
  notes: text("notes"),
  createdAt: timestamp("createdAt", { precision: 3, mode: "date", withTimezone: false }).notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updatedAt", { precision: 3, mode: "date", withTimezone: false }).notNull().$onUpdateFn(() => new Date()),
}, (table) => [
  uniqueIndex("FuelEntry_expenseId_key").on(table.expenseId),
  index("FuelEntry_businessId_date_idx").on(table.businessId, table.date),
  index("FuelEntry_truckId_odometer_idx").on(table.truckId, table.odometer),
  foreignKey({ name: "FuelEntry_businessId_fkey", columns: [table.businessId], foreignColumns: [business.id] }).onDelete("cascade").onUpdate("cascade"),
  foreignKey({ name: "FuelEntry_truckId_fkey", columns: [table.truckId], foreignColumns: [truck.id] }).onDelete("cascade").onUpdate("cascade"),
  foreignKey({ name: "FuelEntry_loadId_fkey", columns: [table.loadId], foreignColumns: [load.id] }).onDelete("set null").onUpdate("cascade"),
  foreignKey({ name: "FuelEntry_expenseId_fkey", columns: [table.expenseId], foreignColumns: [expense.id] }).onDelete("set null").onUpdate("cascade"),
]);
