import { sql } from "drizzle-orm";
import { foreignKey, integer, numeric, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { business } from "./businesses";

export const financialGoal = pgTable("FinancialGoal", {
  id: text("id").primaryKey(),
  businessId: text("businessId").notNull(),
  monthlyRevenueTarget: numeric("monthlyRevenueTarget", { precision: 12, scale: 2 }).notNull().default(sql`0`),
  monthlyProfitTarget: numeric("monthlyProfitTarget", { precision: 12, scale: 2 }).notNull().default(sql`0`),
  targetProfitPerMile: numeric("targetProfitPerMile", { precision: 8, scale: 2 }).notNull().default(sql`1.5`),
  maxDeadheadPct: numeric("maxDeadheadPct", { precision: 5, scale: 2 }).notNull().default(sql`15`),
  targetLoads: integer("targetLoads"),
  workingDaysPerWeek: integer("workingDaysPerWeek").notNull().default(6),
  expectedMonthlyMiles: integer("expectedMonthlyMiles").notNull().default(0),
  createdAt: timestamp("createdAt", { precision: 3, mode: "date", withTimezone: false }).notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updatedAt", { precision: 3, mode: "date", withTimezone: false }).notNull().$onUpdateFn(() => new Date()),
}, (table) => [
  uniqueIndex("FinancialGoal_businessId_key").on(table.businessId),
  foreignKey({ name: "FinancialGoal_businessId_fkey", columns: [table.businessId], foreignColumns: [business.id] }).onDelete("cascade").onUpdate("cascade"),
]);
