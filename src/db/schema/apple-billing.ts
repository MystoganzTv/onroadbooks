import { foreignKey, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { business } from "./businesses";

// Random account tokens never reveal a user's email or internal workspace ID to Apple.
export const appleBillingAccount = pgTable("AppleBillingAccount", {
  businessId: text("businessId").primaryKey(),
  appAccountToken: uuid("appAccountToken").notNull(),
}, table => [
  uniqueIndex("AppleBillingAccount_token_key").on(table.appAccountToken),
  foreignKey({ name: "AppleBillingAccount_businessId_fkey", columns: [table.businessId], foreignColumns: [business.id] }).onDelete("cascade").onUpdate("cascade"),
]);

// Keep claims after expiration/provider changes so a restore cannot move a purchase.
export const applePurchase = pgTable("ApplePurchase", {
  id: text("id").primaryKey(), // environment + original transaction ID
  businessId: text("businessId").notNull(),
  transactionId: text("transactionId").notNull(),
  productId: text("productId").notNull(),
  checkedAt: timestamp("checkedAt", { precision: 3, mode: "date", withTimezone: false }).notNull(),
}, table => [
  foreignKey({ name: "ApplePurchase_businessId_fkey", columns: [table.businessId], foreignColumns: [business.id] }).onDelete("cascade").onUpdate("cascade"),
]);
