import { sql } from "drizzle-orm";
import { foreignKey, index, integer, numeric, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import * as enums from "./enums";
import { driverSettlement } from "./driver-settlements";
import { expense } from "./expenses";
import { load } from "./loads";
import { truck } from "./trucks";

export const driverSettlementLine = pgTable("DriverSettlementLine", {
  id: text("id").primaryKey(),
  settlementId: text("settlementId").notNull(),
  loadId: text("loadId").notNull(),
  truckId: text("truckId").notNull(),
  grossRevenue: numeric("grossRevenue", { precision: 12, scale: 2 }).notNull(),
  loadedMiles: integer("loadedMiles").notNull(),
  totalMiles: integer("totalMiles").notNull(),
  payType: enums.driverPayType("payType").notNull(),
  payRate: numeric("payRate", { precision: 12, scale: 4 }).notNull(),
  payAmount: numeric("payAmount", { precision: 12, scale: 2 }).notNull(),
  expenseId: text("expenseId"),
  createdAt: timestamp("createdAt", { precision: 3, mode: "date", withTimezone: false }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("DriverSettlementLine_loadId_key").on(table.loadId),
  uniqueIndex("DriverSettlementLine_expenseId_key").on(table.expenseId),
  index("DriverSettlementLine_settlementId_idx").on(table.settlementId),
  index("DriverSettlementLine_truckId_idx").on(table.truckId),
  foreignKey({ name: "DriverSettlementLine_settlementId_fkey", columns: [table.settlementId], foreignColumns: [driverSettlement.id] }).onDelete("cascade").onUpdate("cascade"),
  foreignKey({ name: "DriverSettlementLine_loadId_fkey", columns: [table.loadId], foreignColumns: [load.id] }).onDelete("restrict").onUpdate("cascade"),
  foreignKey({ name: "DriverSettlementLine_truckId_fkey", columns: [table.truckId], foreignColumns: [truck.id] }).onDelete("restrict").onUpdate("cascade"),
  foreignKey({ name: "DriverSettlementLine_expenseId_fkey", columns: [table.expenseId], foreignColumns: [expense.id] }).onDelete("set null").onUpdate("cascade"),
]);
