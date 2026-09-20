import { sql } from "drizzle-orm";
import { boolean, date, foreignKey, index, numeric, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import * as enums from "./enums";
import { business } from "./businesses";
import { financialObligation } from "./obligations";
import { load } from "./loads";
import { truck } from "./trucks";

export const expense = pgTable("Expense", {
  id: text("id").primaryKey(),
  businessId: text("businessId").notNull(),
  truckId: text("truckId"),
  loadId: text("loadId"),
  date: date("date", { mode: "string" }).notNull(),
  scope: enums.expenseScope("scope").notNull().default("TRUCK"),
  category: enums.expenseCategory("category").notNull(),
  description: text("description").notNull(),
  vendor: text("vendor"),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  financialTreatment: enums.financialTreatment("financialTreatment"),
  obligationId: text("obligationId"),
  splitGroupId: text("splitGroupId"),
  recurring: boolean("recurring").notNull().default(false),
  receiptNumber: text("receiptNumber"),
  notes: text("notes"),
  createdAt: timestamp("createdAt", { precision: 3, mode: "date", withTimezone: false }).notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updatedAt", { precision: 3, mode: "date", withTimezone: false }).notNull().$onUpdateFn(() => new Date()),
}, (table) => [
  index("Expense_businessId_date_idx").on(table.businessId, table.date),
  index("Expense_category_idx").on(table.category),
  index("Expense_loadId_idx").on(table.loadId),
  index("Expense_truckId_date_idx").on(table.truckId, table.date),
  index("Expense_obligationId_idx").on(table.obligationId),
  foreignKey({ name: "Expense_businessId_fkey", columns: [table.businessId], foreignColumns: [business.id] }).onDelete("cascade").onUpdate("cascade"),
  foreignKey({ name: "Expense_truckId_fkey", columns: [table.truckId], foreignColumns: [truck.id] }).onDelete("set null").onUpdate("cascade"),
  foreignKey({ name: "Expense_loadId_fkey", columns: [table.loadId], foreignColumns: [load.id] }).onDelete("set null").onUpdate("cascade"),
  foreignKey({ name: "Expense_obligationId_fkey", columns: [table.obligationId], foreignColumns: [financialObligation.id] }).onDelete("set null").onUpdate("cascade"),
]);
