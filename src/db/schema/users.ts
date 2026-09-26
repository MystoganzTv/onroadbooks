import { sql } from "drizzle-orm";
import { foreignKey, index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import * as enums from "./enums";
import { business } from "./businesses";

export const user = pgTable("User", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  name: text("name"),
  passwordHash: text("passwordHash").notNull(),
  authVersion: integer("authVersion").notNull().default(0),
  role: enums.memberRole("role").notNull().default("OWNER"),
  invitedAt: timestamp("invitedAt", { precision: 3, mode: "date", withTimezone: false }),
  joinedAt: timestamp("joinedAt", { precision: 3, mode: "date", withTimezone: false }).default(sql`CURRENT_TIMESTAMP`),
  businessId: text("businessId"),
  createdAt: timestamp("createdAt", { precision: 3, mode: "date", withTimezone: false }).notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updatedAt", { precision: 3, mode: "date", withTimezone: false }).notNull().$onUpdateFn(() => new Date()),
}, (table) => [
  uniqueIndex("User_email_key").on(table.email),
  index("User_businessId_idx").on(table.businessId),
  foreignKey({ name: "User_businessId_fkey", columns: [table.businessId], foreignColumns: [business.id] }).onDelete("set null").onUpdate("cascade"),
]);
