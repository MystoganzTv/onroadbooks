import { sql } from "drizzle-orm";
import { boolean, foreignKey, index, numeric, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import * as enums from "./enums";
import { business } from "./businesses";
import { truck } from "./trucks";

export const driver = pgTable("Driver", {
  id: text("id").primaryKey(),
  businessId: text("businessId").notNull(),
  name: text("name").notNull(),
  reference: text("reference"),
  defaultTruckId: text("defaultTruckId"),
  payType: enums.driverPayType("payType").notNull(),
  payRate: numeric("payRate", { precision: 12, scale: 4 }).notNull(),
  isOwnerOperator: boolean("isOwnerOperator").notNull().default(false),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("createdAt", { precision: 3, mode: "date", withTimezone: false }).notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updatedAt", { precision: 3, mode: "date", withTimezone: false }).notNull().$onUpdateFn(() => new Date()),
}, (table) => [
  index("Driver_businessId_active_idx").on(table.businessId, table.active),
  index("Driver_defaultTruckId_idx").on(table.defaultTruckId),
  foreignKey({ name: "Driver_businessId_fkey", columns: [table.businessId], foreignColumns: [business.id] }).onDelete("cascade").onUpdate("cascade"),
  foreignKey({ name: "Driver_defaultTruckId_fkey", columns: [table.defaultTruckId], foreignColumns: [truck.id] }).onDelete("set null").onUpdate("cascade"),
]);
