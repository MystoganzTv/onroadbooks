import { sql } from "drizzle-orm";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const business = pgTable("Business", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  currency: text("currency").notNull().default("USD"),
  createdAt: timestamp("createdAt", { precision: 3, mode: "date", withTimezone: false }).notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updatedAt", { precision: 3, mode: "date", withTimezone: false }).notNull().$onUpdateFn(() => new Date()),
});
