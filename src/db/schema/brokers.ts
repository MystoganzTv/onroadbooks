import { sql } from "drizzle-orm";
import { foreignKey, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { business } from "./businesses";

export const broker = pgTable("Broker", {
  id: text("id").primaryKey(),
  businessId: text("businessId").notNull(),
  name: text("name").notNull(),
  nameKey: text("nameKey").notNull(),
  contactName: text("contactName"),
  phone: text("phone"),
  email: text("email"),
  mcNumber: text("mcNumber"),
  address: text("address"),
  notes: text("notes"),
  createdAt: timestamp("createdAt", { precision: 3, mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updatedAt", { precision: 3, mode: "date" }).notNull().$onUpdateFn(() => new Date()),
}, (table) => [
  uniqueIndex("Broker_businessId_nameKey_key").on(table.businessId, table.nameKey),
  foreignKey({ name: "Broker_businessId_fkey", columns: [table.businessId], foreignColumns: [business.id] }).onDelete("cascade").onUpdate("cascade"),
]);
