import { sql } from "drizzle-orm";
import { boolean, foreignKey, index, integer, numeric, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import * as enums from "./enums";
import { business } from "./businesses";

export const reserveAccount = pgTable("ReserveAccount", {
  id: text("id").primaryKey(),
  businessId: text("businessId").notNull(),
  kind: enums.reserveKind("kind").notNull(),
  name: text("name").notNull(),
  basis: enums.reserveBasis("basis").notNull().default("GROSS_REVENUE"),
  contributionPct: numeric("contributionPct", { precision: 5, scale: 2 }),
  targetBalance: numeric("targetBalance", { precision: 12, scale: 2 }),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sortOrder").notNull().default(0),
  createdAt: timestamp("createdAt", { precision: 3, mode: "date", withTimezone: false }).notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updatedAt", { precision: 3, mode: "date", withTimezone: false }).notNull().$onUpdateFn(() => new Date()),
}, (table) => [
  index("ReserveAccount_businessId_idx").on(table.businessId),
  foreignKey({ name: "ReserveAccount_businessId_fkey", columns: [table.businessId], foreignColumns: [business.id] }).onDelete("cascade").onUpdate("cascade"),
]);
