import { sql } from "drizzle-orm";
import { boolean, date, foreignKey, index, integer, numeric, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import * as enums from "./enums";
import { business } from "./businesses";
import { truck } from "./trucks";

export const financialObligation = pgTable("FinancialObligation", {
  id: text("id").primaryKey(),
  businessId: text("businessId").notNull(),
  truckId: text("truckId"),
  name: text("name").notNull(),
  kind: enums.financialObligationKind("kind").notNull(),
  counterparty: text("counterparty"),
  startedOn: date("startedOn", { mode: "string" }),
  endedOn: date("endedOn", { mode: "string" }),
  startingBalance: numeric("startingBalance", { precision: 12, scale: 2 }),
  aprPercent: numeric("aprPercent", { precision: 5, scale: 2 }),
  paymentDueDay: integer("paymentDueDay"),
  expectedMonthlyPayment: numeric("expectedMonthlyPayment", { precision: 12, scale: 2 }),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("createdAt", { precision: 3, mode: "date", withTimezone: false }).notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updatedAt", { precision: 3, mode: "date", withTimezone: false }).notNull().$onUpdateFn(() => new Date()),
}, (table) => [
  index("FinancialObligation_businessId_active_idx").on(table.businessId, table.active),
  index("FinancialObligation_truckId_idx").on(table.truckId),
  foreignKey({ name: "FinancialObligation_businessId_fkey", columns: [table.businessId], foreignColumns: [business.id] }).onDelete("cascade").onUpdate("cascade"),
  foreignKey({ name: "FinancialObligation_truckId_fkey", columns: [table.truckId], foreignColumns: [truck.id] }).onDelete("set null").onUpdate("cascade"),
]);
