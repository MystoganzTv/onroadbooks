import { sql } from "drizzle-orm";
import { date, foreignKey, index, numeric, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import * as enums from "./enums";
import { business } from "./businesses";
import { reserveAccount } from "./reserve-accounts";
import { settlement } from "./settlements";

export const reserveTransaction = pgTable("ReserveTransaction", {
  id: text("id").primaryKey(),
  businessId: text("businessId").notNull(),
  accountId: text("accountId").notNull(),
  date: date("date", { mode: "string" }).notNull(),
  type: enums.reserveTransactionType("type").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  description: text("description").notNull(),
  settlementId: text("settlementId"),
  createdAt: timestamp("createdAt", { precision: 3, mode: "date", withTimezone: false }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("ReserveTransaction_businessId_date_idx").on(table.businessId, table.date),
  index("ReserveTransaction_accountId_idx").on(table.accountId),
  index("ReserveTransaction_settlementId_idx").on(table.settlementId),
  foreignKey({ name: "ReserveTransaction_businessId_fkey", columns: [table.businessId], foreignColumns: [business.id] }).onDelete("cascade").onUpdate("cascade"),
  foreignKey({ name: "ReserveTransaction_accountId_fkey", columns: [table.accountId], foreignColumns: [reserveAccount.id] }).onDelete("cascade").onUpdate("cascade"),
  foreignKey({ name: "ReserveTransaction_settlementId_fkey", columns: [table.settlementId], foreignColumns: [settlement.id] }).onDelete("set null").onUpdate("cascade"),
]);
