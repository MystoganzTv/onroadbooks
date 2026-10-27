import { sql } from "drizzle-orm";
import { bigint, boolean, check, date, foreignKey, index, integer, jsonb, numeric, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * OnRoad AI -- the WhatsApp freight assistant (ADR 0033).
 *
 * Deliberately NOT linked to Business / User: a WhatsApp driver is not an
 * OnRoad Books workspace member, and nothing here can reach a ledger.
 * Every driver-owned row hangs off AssistantUser with ON DELETE CASCADE, so
 * "delete my data" is one statement and leaves nothing behind except
 * AssistantInboundEvent rows, which the store deletes by waId in the same
 * transaction.
 */

const created = () => timestamp("createdAt", { precision: 3, mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`);
const updated = () => timestamp("updatedAt", { precision: 3, mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`).$onUpdateFn(() => new Date());

export const assistantUser = pgTable("AssistantUser", {
  id: text("id").primaryKey(),
  /** WhatsApp id (E.164 digits, no +). The only identifier we hold. */
  waId: text("waId").notNull(),
  displayName: text("displayName"),
  profile: jsonb("profile").notNull().default(sql`'{}'::jsonb`),
  conversation: jsonb("conversation").notNull().default(sql`'{}'::jsonb`),
  lastInboundAt: timestamp("lastInboundAt", { precision: 3, mode: "date" }),
  /** Explicit opt-in to proactive load alerts (the first alert the driver creates). */
  alertsOptInAt: timestamp("alertsOptInAt", { precision: 3, mode: "date" }),
  /** STOP. Once set, no alert is sent until the driver opts in again. */
  alertsOptOutAt: timestamp("alertsOptOutAt", { precision: 3, mode: "date" }),
  /** FREE or PRO. Limits per plan live in env (onroad-ai/plans.ts), not here. */
  plan: text("plan").notNull().default("FREE"),
  /** Stripe's subscription status, verbatim (active, past_due, canceled...). */
  planStatus: text("planStatus"),
  planCurrentPeriodEnd: timestamp("planCurrentPeriodEnd", { precision: 3, mode: "date" }),
  /** Recurring amount at the time of the last sync, for revenue reporting only. */
  planAmountCents: integer("planAmountCents"),
  stripeCustomerId: text("stripeCustomerId"),
  stripeSubscriptionId: text("stripeSubscriptionId"),
  /** Abuse control: a blocked number gets no replies and costs nothing. */
  blockedAt: timestamp("blockedAt", { precision: 3, mode: "date" }),
  blockedReason: text("blockedReason"),
  createdAt: created(),
  updatedAt: updated(),
}, (table) => [
  uniqueIndex("AssistantUser_waId_key").on(table.waId),
  uniqueIndex("AssistantUser_stripeSubscriptionId_key").on(table.stripeSubscriptionId),
  index("AssistantUser_stripeCustomerId_idx").on(table.stripeCustomerId),
  index("AssistantUser_createdAt_idx").on(table.createdAt),
  check("AssistantUser_plan_check", sql`${table.plan} IN ('FREE', 'PRO')`),
]);

export const assistantInboundEvent = pgTable("AssistantInboundEvent", {
  id: text("id").primaryKey(),
  /** Meta's wamid. Unique: a redelivered webhook inserts nothing. */
  waMessageId: text("waMessageId").notNull(),
  waId: text("waId").notNull(),
  phoneNumberId: text("phoneNumberId").notNull(),
  messageType: text("messageType").notNull(),
  /** Normalised message without media bytes; nulled by retention. */
  payload: jsonb("payload"),
  status: text("status").notNull().default("RECEIVED"),
  attempts: integer("attempts").notNull().default(0),
  error: text("error"),
  sentAt: timestamp("sentAt", { precision: 3, mode: "date" }).notNull(),
  receivedAt: timestamp("receivedAt", { precision: 3, mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: updated(),
}, (table) => [
  uniqueIndex("AssistantInboundEvent_waMessageId_key").on(table.waMessageId),
  index("AssistantInboundEvent_waId_status_idx").on(table.waId, table.status, table.sentAt),
  index("AssistantInboundEvent_status_receivedAt_idx").on(table.status, table.receivedAt),
  check("AssistantInboundEvent_status_check", sql`${table.status} IN ('RECEIVED', 'PROCESSING', 'DONE', 'FAILED', 'DEAD')`),
]);

/** One row per sender while a worker drains their messages in order. */
export const assistantProcessingLease = pgTable("AssistantProcessingLease", {
  waId: text("waId").primaryKey(),
  holder: text("holder").notNull(),
  leaseUntil: timestamp("leaseUntil", { precision: 3, mode: "date" }).notNull(),
});

export const assistantLoad = pgTable("AssistantLoad", {
  id: text("id").primaryKey(),
  userId: text("userId").notNull(),
  status: text("status").notNull().default("ANALYZED"),
  facts: jsonb("facts").notNull(),
  lane: text("lane"),
  grossRate: numeric("grossRate", { precision: 12, scale: 2 }),
  totalMiles: numeric("totalMiles", { precision: 10, scale: 1 }).notNull(),
  contribution: numeric("contribution", { precision: 12, scale: 2 }),
  contributionPerMile: numeric("contributionPerMile", { precision: 10, scale: 4 }),
  rating: text("rating"),
  score: integer("score"),
  decision: text("decision"),
  offers: jsonb("offers").notNull().default(sql`'[]'::jsonb`),
  createdAt: created(),
  updatedAt: updated(),
}, (table) => [
  index("AssistantLoad_userId_createdAt_idx").on(table.userId, table.createdAt),
  foreignKey({ name: "AssistantLoad_userId_fkey", columns: [table.userId], foreignColumns: [assistantUser.id] }).onDelete("cascade").onUpdate("cascade"),
  check("AssistantLoad_status_check", sql`${table.status} IN ('ANALYZED', 'SAVED')`),
]);

/** Delivery tracking. The message body is never stored -- only its length. */
export const assistantOutboundMessage = pgTable("AssistantOutboundMessage", {
  id: text("id").primaryKey(),
  userId: text("userId").notNull(),
  waMessageId: text("waMessageId"),
  kind: text("kind").notNull(),
  status: text("status").notNull(),
  errorCode: integer("errorCode"),
  errorTitle: text("errorTitle"),
  length: integer("length").notNull().default(0),
  createdAt: created(),
  updatedAt: updated(),
}, (table) => [
  uniqueIndex("AssistantOutboundMessage_waMessageId_key").on(table.waMessageId),
  index("AssistantOutboundMessage_userId_createdAt_idx").on(table.userId, table.createdAt),
  foreignKey({ name: "AssistantOutboundMessage_userId_fkey", columns: [table.userId], foreignColumns: [assistantUser.id] }).onDelete("cascade").onUpdate("cascade"),
  check("AssistantOutboundMessage_status_check", sql`${table.status} IN ('SENT', 'DELIVERED', 'READ', 'FAILED', 'WINDOW_CLOSED')`),
]);

/** Daily counters per driver: quotas and cost reporting. */
export const assistantUsage = pgTable("AssistantUsage", {
  userId: text("userId").notNull(),
  day: date("day", { mode: "string" }).notNull(),
  messagesIn: integer("messagesIn").notNull().default(0),
  messagesOut: integer("messagesOut").notNull().default(0),
  aiCalls: integer("aiCalls").notNull().default(0),
  aiInputTokens: integer("aiInputTokens").notNull().default(0),
  aiOutputTokens: integer("aiOutputTokens").notNull().default(0),
  transcriptions: integer("transcriptions").notNull().default(0),
  audioSeconds: integer("audioSeconds").notNull().default(0),
  costMicros: bigint("costMicros", { mode: "number" }).notNull().default(0),
  /** The total above, split by where it went. */
  aiCostMicros: bigint("aiCostMicros", { mode: "number" }).notNull().default(0),
  transcribeCostMicros: bigint("transcribeCostMicros", { mode: "number" }).notNull().default(0),
  whatsappCostMicros: bigint("whatsappCostMicros", { mode: "number" }).notNull().default(0),
}, (table) => [
  primaryKey({ name: "AssistantUsage_pkey", columns: [table.userId, table.day] }),
  foreignKey({ name: "AssistantUsage_userId_fkey", columns: [table.userId], foreignColumns: [assistantUser.id] }).onDelete("cascade").onUpdate("cascade"),
]);

/** A driver's saved alert: what to look for on an AUTHORIZED load board. */
export const assistantAlert = pgTable("AssistantAlert", {
  id: text("id").primaryKey(),
  userId: text("userId").notNull(),
  criteria: jsonb("criteria").notNull(),
  active: boolean("active").notNull().default(true),
  lastCheckedAt: timestamp("lastCheckedAt", { precision: 3, mode: "date" }),
  createdAt: created(),
  updatedAt: updated(),
}, (table) => [
  index("AssistantAlert_active_lastCheckedAt_idx").on(table.active, table.lastCheckedAt),
  index("AssistantAlert_userId_idx").on(table.userId),
  foreignKey({ name: "AssistantAlert_userId_fkey", columns: [table.userId], foreignColumns: [assistantUser.id] }).onDelete("cascade").onUpdate("cascade"),
]);

/** One row per load already sent for an alert: the deduplication key, and the daily cap's count. */
export const assistantAlertMatch = pgTable("AssistantAlertMatch", {
  id: text("id").primaryKey(),
  alertId: text("alertId").notNull(),
  userId: text("userId").notNull(),
  providerId: text("providerId").notNull(),
  providerLoadId: text("providerLoadId").notNull(),
  sentAt: timestamp("sentAt", { precision: 3, mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("AssistantAlertMatch_alert_load_key").on(table.alertId, table.providerId, table.providerLoadId),
  index("AssistantAlertMatch_userId_sentAt_idx").on(table.userId, table.sentAt),
  foreignKey({ name: "AssistantAlertMatch_alertId_fkey", columns: [table.alertId], foreignColumns: [assistantAlert.id] }).onDelete("cascade").onUpdate("cascade"),
  foreignKey({ name: "AssistantAlertMatch_userId_fkey", columns: [table.userId], foreignColumns: [assistantUser.id] }).onDelete("cascade").onUpdate("cascade"),
]);
