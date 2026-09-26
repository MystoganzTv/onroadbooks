import {
  index,
  integer,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { user } from "./users";

// Separate from the 20 migrated business tables; never exposed to a Data API.
export const authSchema = pgSchema("onroad_auth");
export const authIdentity = authSchema.table(
  "Identity",
  {
    id: text("id").primaryKey(),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade", onUpdate: "cascade" }),
    provider: text("provider").notNull(),
    subject: text("subject").notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("Identity_provider_subject_key").on(
      table.provider,
      table.subject,
    ),
    uniqueIndex("Identity_user_provider_key").on(table.userId, table.provider),
  ],
);
export const authInvitation = authSchema.table(
  "Invitation",
  {
    tokenHash: text("tokenHash").primaryKey(),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade", onUpdate: "cascade" }),
    expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("Invitation_user_key").on(table.userId),
    index("Invitation_expiry_idx").on(table.expiresAt),
  ],
);

export const passwordReset = authSchema.table("PasswordReset", {
  tokenHash: text("tokenHash").primaryKey(),
  userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade", onUpdate: "cascade" }),
  authVersion: integer("authVersion").notNull(),
  expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
}, (table) => [uniqueIndex("PasswordReset_user_key").on(table.userId), index("PasswordReset_expiry_idx").on(table.expiresAt)]);

export const authRateLimit = authSchema.table("RateLimit", {
  key: text("key").primaryKey(),
  attempts: integer("attempts").notNull(),
  resetAt: timestamp("resetAt", { withTimezone: true }).notNull(),
}, (table) => [index("RateLimit_expiry_idx").on(table.resetAt)]);
