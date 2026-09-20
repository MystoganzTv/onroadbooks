import { sql } from "drizzle-orm";
import { foreignKey, index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import * as enums from "./enums";
import { business } from "./businesses";
import { expense } from "./expenses";
import { load } from "./loads";
import { maintenanceRecord } from "./maintenance";
import { truck } from "./trucks";

export const document = pgTable("Document", {
  id: text("id").primaryKey(),
  businessId: text("businessId").notNull(),
  loadId: text("loadId"),
  expenseId: text("expenseId"),
  truckId: text("truckId"),
  maintenanceId: text("maintenanceId"),
  type: enums.documentType("type").notNull().default("OTHER"),
  label: text("label").notNull(),
  fileName: text("fileName").notNull(),
  contentType: text("contentType").notNull(),
  sizeBytes: integer("sizeBytes").notNull(),
  storageKey: text("storageKey").notNull(),
  uploadedAt: timestamp("uploadedAt", { precision: 3, mode: "date", withTimezone: false }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("Document_storageKey_key").on(table.storageKey),
  index("Document_businessId_idx").on(table.businessId),
  index("Document_loadId_idx").on(table.loadId),
  index("Document_expenseId_idx").on(table.expenseId),
  index("Document_truckId_idx").on(table.truckId),
  index("Document_maintenanceId_idx").on(table.maintenanceId),
  foreignKey({ name: "Document_businessId_fkey", columns: [table.businessId], foreignColumns: [business.id] }).onDelete("cascade").onUpdate("cascade"),
  foreignKey({ name: "Document_loadId_fkey", columns: [table.loadId], foreignColumns: [load.id] }).onDelete("cascade").onUpdate("cascade"),
  foreignKey({ name: "Document_expenseId_fkey", columns: [table.expenseId], foreignColumns: [expense.id] }).onDelete("cascade").onUpdate("cascade"),
  foreignKey({ name: "Document_truckId_fkey", columns: [table.truckId], foreignColumns: [truck.id] }).onDelete("cascade").onUpdate("cascade"),
  foreignKey({ name: "Document_maintenanceId_fkey", columns: [table.maintenanceId], foreignColumns: [maintenanceRecord.id] }).onDelete("cascade").onUpdate("cascade"),
]);
