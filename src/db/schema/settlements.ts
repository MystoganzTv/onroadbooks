import { sql } from "drizzle-orm";
import { date, foreignKey, index, jsonb, pgTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import * as enums from "./enums";
import { business } from "./businesses";

export const settlement = pgTable("Settlement", {
  id: text("id").primaryKey(),
  businessId: text("businessId").notNull(),
  month: varchar("month", { length: 7 }).notNull(),
  half: enums.settlementHalf("half").notNull(),
  periodStart: date("periodStart", { mode: "string" }).notNull(),
  periodEnd: date("periodEnd", { mode: "string" }).notNull(),
  status: enums.settlementStatus("status").notNull().default("OPEN"),
  closedAt: timestamp("closedAt", { precision: 3, mode: "date", withTimezone: false }),
  snapshot: jsonb("snapshot"),
  notes: text("notes"),
  createdAt: timestamp("createdAt", { precision: 3, mode: "date", withTimezone: false }).notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updatedAt", { precision: 3, mode: "date", withTimezone: false }).notNull().$onUpdateFn(() => new Date()),
}, (table) => [
  index("Settlement_businessId_periodStart_idx").on(table.businessId, table.periodStart),
  uniqueIndex("Settlement_businessId_month_half_key").on(table.businessId, table.month, table.half),
  foreignKey({ name: "Settlement_businessId_fkey", columns: [table.businessId], foreignColumns: [business.id] }).onDelete("cascade").onUpdate("cascade"),
]);
