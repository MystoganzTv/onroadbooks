import { sql } from "drizzle-orm";
import { foreignKey, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import * as enums from "./enums";
import { business } from "./businesses";

export const subscription = pgTable("Subscription", {
  id: text("id").primaryKey(),
  businessId: text("businessId").notNull(),
  plan: enums.planId("plan").notNull().default("OWNER"),
  status: enums.subscriptionStatus("status").notNull().default("TRIALING"),
  currentPeriodEnd: timestamp("currentPeriodEnd", { precision: 3, mode: "date", withTimezone: false }),
  providerCustomerId: text("providerCustomerId"),
  providerSubscriptionId: text("providerSubscriptionId"),
  startedAt: timestamp("startedAt", { precision: 3, mode: "date", withTimezone: false }).notNull().default(sql`CURRENT_TIMESTAMP`),
  createdAt: timestamp("createdAt", { precision: 3, mode: "date", withTimezone: false }).notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updatedAt", { precision: 3, mode: "date", withTimezone: false }).notNull().$onUpdateFn(() => new Date()),
}, (table) => [
  uniqueIndex("Subscription_businessId_key").on(table.businessId),
  uniqueIndex("Subscription_providerSubscriptionId_key").on(table.providerSubscriptionId),
  foreignKey({ name: "Subscription_businessId_fkey", columns: [table.businessId], foreignColumns: [business.id] }).onDelete("cascade").onUpdate("cascade"),
]);
