import { sql } from "drizzle-orm";
import { date, foreignKey, index, numeric, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { business } from "./businesses";
import { load } from "./loads";

export const paymentEvent = pgTable("PaymentEvent", {
  id: text("id").primaryKey(),
  businessId: text("businessId").notNull(),
  loadId: text("loadId").notNull(),
  date: date("date", { mode: "string" }).notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  method: text("method"),
  reference: text("reference"),
  notes: text("notes"),
  createdAt: timestamp("createdAt", { precision: 3, mode: "date", withTimezone: false }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("PaymentEvent_businessId_date_idx").on(table.businessId, table.date),
  index("PaymentEvent_loadId_date_idx").on(table.loadId, table.date),
  foreignKey({ name: "PaymentEvent_businessId_fkey", columns: [table.businessId], foreignColumns: [business.id] }).onDelete("cascade").onUpdate("cascade"),
  foreignKey({ name: "PaymentEvent_loadId_fkey", columns: [table.loadId], foreignColumns: [load.id] }).onDelete("restrict").onUpdate("cascade"),
]);
