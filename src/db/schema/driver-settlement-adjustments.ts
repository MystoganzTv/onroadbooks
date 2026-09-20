import { sql } from "drizzle-orm";
import { check, foreignKey, index, numeric, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import * as enums from "./enums";
import { driverSettlement } from "./driver-settlements";

export const driverSettlementAdjustment = pgTable("DriverSettlementAdjustment", {
  id: text("id").primaryKey(),
  settlementId: text("settlementId").notNull(),
  type: enums.driverSettlementAdjustmentType("type").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  reason: text("reason").notNull(),
  createdAt: timestamp("createdAt", { precision: 3, mode: "date", withTimezone: false }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("DriverSettlementAdjustment_settlementId_createdAt_idx").on(table.settlementId, table.createdAt),
  foreignKey({ name: "DriverSettlementAdjustment_settlementId_fkey", columns: [table.settlementId], foreignColumns: [driverSettlement.id] }).onDelete("cascade").onUpdate("cascade"),
  check("DriverSettlementAdjustment_amount_positive", sql`${table.amount} > 0`),
  check("DriverSettlementAdjustment_reason_present", sql`char_length(trim(${table.reason})) >= 2`),
]);
