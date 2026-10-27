/**
 * Neon / Drizzle implementation of the AssistantStore.
 *
 * Every driver-scoped query carries `userId` in its WHERE clause -- see the
 * isolation note in ./types.ts. Concurrency-sensitive steps (claiming an
 * event, taking a sender's lease) are single conditional statements, so two
 * serverless invocations can never both win.
 */

import { randomUUID } from "node:crypto";

import { and, desc, eq, gte, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type * as schema from "@/db/schema";
import {
  assistantAlert,
  assistantAlertMatch,
  assistantInboundEvent,
  assistantLoad,
  assistantOutboundMessage,
  assistantProcessingLease,
  assistantUsage,
  assistantUser,
} from "@/db/schema/onroad-ai";

import { loadFactsSchema } from "../load-facts";
import { parseProfile } from "../profile";
import {
  emptyConversation,
  type AdminUserRow,
  type BillingSummary,
  type OperationalCounts,
  type PlanId,
  type UsageDay,
  type AdminStats,
  type AlertCriteria,
  type AssistantAlertRecord,
  type AssistantLoadRecord,
  type AssistantStore,
  type AssistantUser,
  type ConversationState,
  type InboundEventRecord,
  type NewLoadRecord,
  type OutboundStatus,
  type UsageDelta,
  type UsageRow,
} from "./types";

type Database = NodePgDatabase<typeof schema>;
type UserRow = typeof assistantUser.$inferSelect;
type LoadRow = typeof assistantLoad.$inferSelect;
type EventRow = typeof assistantInboundEvent.$inferSelect;

const STALE_PROCESSING_MS = 5 * 60_000;

/**
 * Timestamps are `timestamp without time zone` holding UTC wall time -- what
 * Drizzle writes for a JS Date. Every value this store compares is therefore
 * written from JS too, never from CURRENT_TIMESTAMP, which is the SESSION's
 * local time (UTC on Neon, but not on a developer's laptop).
 */
const utc = (date: Date) => sql`${date.toISOString().replace("Z", "")}::timestamp`;

function conversationOf(raw: unknown): ConversationState {
  const base = emptyConversation();
  if (!raw || typeof raw !== "object") return base;
  const value = raw as Partial<ConversationState>;
  const draft = value.draft ? loadFactsSchema.safeParse(value.draft) : null;
  const candidates = Array.isArray(value.candidates)
    ? value.candidates.map((item) => loadFactsSchema.safeParse(item)).filter((item) => item.success).map((item) => item.data)
    : null;
  return {
    onboardingStep: "onboardingStep" in value ? (value.onboardingStep ?? null) : base.onboardingStep,
    draft: draft?.success ? draft.data : null,
    awaiting: value.awaiting ?? null,
    wantsOffer: value.wantsOffer ?? true,
    currentLoadId: value.currentLoadId ?? null,
    candidates: candidates && candidates.length ? candidates : null,
    pendingDelete: value.pendingDelete === true,
    shortcutsLive: value.shortcutsLive === true,
    recent: Array.isArray(value.recent) ? value.recent.filter((item) => typeof item === "number").slice(-20) : [],
  };
}

function toUser(row: UserRow): AssistantUser {
  return {
    id: row.id,
    waId: row.waId,
    displayName: row.displayName,
    profile: parseProfile(row.profile),
    conversation: conversationOf(row.conversation),
    lastInboundAt: row.lastInboundAt,
    alertsOptInAt: row.alertsOptInAt,
    alertsOptOutAt: row.alertsOptOutAt,
    billing: {
      plan: (row.plan === "PRO" ? "PRO" : "FREE") as PlanId,
      status: row.planStatus,
      currentPeriodEnd: row.planCurrentPeriodEnd,
      amountCents: row.planAmountCents,
      stripeCustomerId: row.stripeCustomerId,
      stripeSubscriptionId: row.stripeSubscriptionId,
    },
    blockedAt: row.blockedAt,
    blockedReason: row.blockedReason,
    createdAt: row.createdAt,
  };
}

function criteriaOf(raw: unknown): AlertCriteria {
  const value = (raw && typeof raw === "object" ? raw : {}) as Partial<AlertCriteria>;
  const num = (item: unknown) => (typeof item === "number" && Number.isFinite(item) ? item : null);
  const str = (item: unknown) => (typeof item === "string" && item ? item : null);
  return {
    near: value.near && typeof value.near === "object" ? { city: str(value.near.city), state: str(value.near.state) } : null,
    radiusMiles: num(value.radiusMiles),
    towardState: str(value.towardState),
    minRatePerTotalMile: num(value.minRatePerTotalMile),
  };
}

function toAlert(row: typeof assistantAlert.$inferSelect): AssistantAlertRecord {
  return { id: row.id, userId: row.userId, criteria: criteriaOf(row.criteria), active: row.active, lastCheckedAt: row.lastCheckedAt, createdAt: row.createdAt };
}

const numberOrNull = (value: string | null) => (value === null ? null : Number(value));

function toLoad(row: LoadRow): AssistantLoadRecord {
  const facts = loadFactsSchema.safeParse(row.facts);
  return {
    id: row.id,
    userId: row.userId,
    status: row.status as AssistantLoadRecord["status"],
    facts: facts.success ? facts.data : loadFactsSchema.parse({}),
    lane: row.lane,
    grossRate: numberOrNull(row.grossRate),
    totalMiles: Number(row.totalMiles),
    contribution: numberOrNull(row.contribution),
    contributionPerMile: numberOrNull(row.contributionPerMile),
    rating: row.rating,
    score: row.score,
    decision: row.decision,
    offers: Array.isArray(row.offers) ? (row.offers as unknown[]).filter((item): item is number => typeof item === "number") : [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toEvent(row: EventRow): InboundEventRecord {
  return {
    id: row.id,
    waMessageId: row.waMessageId,
    waId: row.waId,
    phoneNumberId: row.phoneNumberId,
    messageType: row.messageType,
    payload: row.payload,
    status: row.status as InboundEventRecord["status"],
    attempts: row.attempts,
    error: row.error,
    sentAt: row.sentAt,
    receivedAt: row.receivedAt,
  };
}

const money = (value: number | null | undefined) => (value === null || value === undefined ? null : value.toFixed(2));

function loadValues(record: Partial<NewLoadRecord>) {
  const values: Partial<typeof assistantLoad.$inferInsert> = {};
  if (record.status !== undefined) values.status = record.status;
  if (record.facts !== undefined) values.facts = record.facts;
  if (record.lane !== undefined) values.lane = record.lane;
  if (record.grossRate !== undefined) values.grossRate = money(record.grossRate);
  if (record.totalMiles !== undefined) values.totalMiles = record.totalMiles.toFixed(1);
  if (record.contribution !== undefined) values.contribution = money(record.contribution);
  if (record.contributionPerMile !== undefined) values.contributionPerMile = record.contributionPerMile === null ? null : record.contributionPerMile.toFixed(4);
  if (record.rating !== undefined) values.rating = record.rating;
  if (record.score !== undefined) values.score = record.score;
  if (record.decision !== undefined) values.decision = record.decision;
  if (record.offers !== undefined) values.offers = record.offers;
  return values;
}

export class DrizzleAssistantStore implements AssistantStore {
  constructor(private readonly db: Database) {}

  async recordInboundEvent(event: Omit<InboundEventRecord, "id" | "status" | "attempts" | "error" | "receivedAt">) {
    const inserted = await this.db
      .insert(assistantInboundEvent)
      .values({
        id: `evt_${randomUUID()}`,
        waMessageId: event.waMessageId,
        waId: event.waId,
        phoneNumberId: event.phoneNumberId,
        messageType: event.messageType,
        payload: event.payload as object,
        sentAt: event.sentAt,
        receivedAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoNothing({ target: assistantInboundEvent.waMessageId })
      .returning({ id: assistantInboundEvent.id });
    return { inserted: inserted.length > 0 };
  }

  async claimNextEvent(waId: string, maxAttempts: number) {
    const stale = new Date(Date.now() - STALE_PROCESSING_MS);
    const result = await this.db.execute<EventRow>(sql`
      UPDATE "AssistantInboundEvent" SET "status" = 'PROCESSING', "attempts" = "attempts" + 1, "updatedAt" = ${utc(new Date())}
      WHERE "id" = (
        SELECT "id" FROM "AssistantInboundEvent"
        WHERE "waId" = ${waId} AND "attempts" < ${maxAttempts}
          AND ("status" IN ('RECEIVED', 'FAILED') OR ("status" = 'PROCESSING' AND "updatedAt" < ${utc(stale)}))
        ORDER BY "sentAt" ASC, "receivedAt" ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *`);
    const row = result.rows[0];
    return row ? toEvent(row) : null;
  }

  async completeEvent(id: string) {
    await this.db.update(assistantInboundEvent).set({ status: "DONE", error: null }).where(eq(assistantInboundEvent.id, id));
  }

  async failEvent(id: string, error: string, dead: boolean) {
    await this.db
      .update(assistantInboundEvent)
      .set({ status: dead ? "DEAD" : "FAILED", error: error.slice(0, 500) })
      .where(eq(assistantInboundEvent.id, id));
  }

  async sendersWithPendingEvents(olderThan: Date, maxAttempts: number, limit: number) {
    const rows = await this.db
      .selectDistinct({ waId: assistantInboundEvent.waId })
      .from(assistantInboundEvent)
      .where(
        and(
          lt(assistantInboundEvent.receivedAt, olderThan),
          lt(assistantInboundEvent.attempts, maxAttempts),
          or(
            inArray(assistantInboundEvent.status, ["RECEIVED", "FAILED"]),
            and(eq(assistantInboundEvent.status, "PROCESSING"), lt(assistantInboundEvent.updatedAt, olderThan)),
          ),
        ),
      )
      .limit(limit);
    return rows.map((row) => row.waId);
  }

  async acquireLease(waId: string, holder: string, ttlMs: number) {
    const until = new Date(Date.now() + ttlMs);
    const result = await this.db.execute<{ holder: string }>(sql`
      INSERT INTO "AssistantProcessingLease" ("waId", "holder", "leaseUntil") VALUES (${waId}, ${holder}, ${utc(until)})
      ON CONFLICT ("waId") DO UPDATE SET "holder" = EXCLUDED."holder", "leaseUntil" = EXCLUDED."leaseUntil"
      WHERE "AssistantProcessingLease"."leaseUntil" < ${utc(new Date())} OR "AssistantProcessingLease"."holder" = EXCLUDED."holder"
      RETURNING "holder"`);
    return result.rows[0]?.holder === holder;
  }

  async releaseLease(waId: string, holder: string) {
    await this.db
      .delete(assistantProcessingLease)
      .where(and(eq(assistantProcessingLease.waId, waId), eq(assistantProcessingLease.holder, holder)));
  }

  async findUserByWaId(waId: string) {
    const [row] = await this.db.select().from(assistantUser).where(eq(assistantUser.waId, waId)).limit(1);
    return row ? toUser(row) : null;
  }

  async createUser(input: Parameters<AssistantStore["createUser"]>[0]) {
    await this.db
      .insert(assistantUser)
      .values({ id: `wau_${randomUUID()}`, waId: input.waId, displayName: input.displayName, profile: input.profile, conversation: input.conversation, createdAt: new Date(), updatedAt: new Date() })
      .onConflictDoNothing({ target: assistantUser.waId });
    const user = await this.findUserByWaId(input.waId);
    if (!user) throw new Error("Assistant user could not be created.");
    return user;
  }

  async updateUser(userId: string, patch: Parameters<AssistantStore["updateUser"]>[1]) {
    const values: Partial<typeof assistantUser.$inferInsert> = {};
    if (patch.profile) values.profile = patch.profile;
    if (patch.conversation) values.conversation = patch.conversation;
    if (patch.lastInboundAt) values.lastInboundAt = patch.lastInboundAt;
    if (patch.displayName !== undefined) values.displayName = patch.displayName;
    if (patch.alertsOptInAt !== undefined) values.alertsOptInAt = patch.alertsOptInAt;
    if (patch.alertsOptOutAt !== undefined) values.alertsOptOutAt = patch.alertsOptOutAt;
    if (patch.billing) {
      values.plan = patch.billing.plan;
      values.planStatus = patch.billing.status;
      values.planCurrentPeriodEnd = patch.billing.currentPeriodEnd;
      values.planAmountCents = patch.billing.amountCents;
      values.stripeCustomerId = patch.billing.stripeCustomerId;
      values.stripeSubscriptionId = patch.billing.stripeSubscriptionId;
    }
    if (patch.blockedAt !== undefined) values.blockedAt = patch.blockedAt;
    if (patch.blockedReason !== undefined) values.blockedReason = patch.blockedReason;
    if (!Object.keys(values).length) return;
    await this.db.update(assistantUser).set(values).where(eq(assistantUser.id, userId));
  }

  async findUserByStripeSubscription(subscriptionId: string) {
    const [row] = await this.db.select().from(assistantUser).where(eq(assistantUser.stripeSubscriptionId, subscriptionId)).limit(1);
    return row ? toUser(row) : null;
  }

  async findUserByStripeCustomer(customerId: string) {
    const [row] = await this.db.select().from(assistantUser).where(eq(assistantUser.stripeCustomerId, customerId)).limit(1);
    return row ? toUser(row) : null;
  }

  async listUsersForAdmin(options: { limit: number; since30d: Date; day30: string }): Promise<AdminUserRow[]> {
    const loads = sql<number>`(SELECT count(*)::int FROM "AssistantLoad" l WHERE l."userId" = ${assistantUser.id})`;
    const cost = sql<number>`(SELECT coalesce(sum(u."costMicros"), 0)::bigint FROM "AssistantUsage" u WHERE u."userId" = ${assistantUser.id} AND u."day" >= ${options.day30}::date)`;
    const messages = sql<number>`(SELECT coalesce(sum(u."messagesIn"), 0)::int FROM "AssistantUsage" u WHERE u."userId" = ${assistantUser.id} AND u."day" >= ${options.day30}::date)`;
    const rows = await this.db
      .select({ user: assistantUser, loads, cost, messages })
      .from(assistantUser)
      .orderBy(sql`${assistantUser.lastInboundAt} DESC NULLS LAST`)
      .limit(Math.min(Math.max(options.limit, 1), 500));
    return rows.map(({ user, loads: count, cost: micros, messages: inbound }) => ({
      id: user.id,
      waId: user.waId,
      displayName: user.displayName,
      plan: (user.plan === "PRO" ? "PRO" : "FREE") as PlanId,
      planStatus: user.planStatus,
      onboarded: (user.conversation as { onboardingStep?: unknown } | null)?.onboardingStep === null,
      createdAt: user.createdAt,
      lastInboundAt: user.lastInboundAt,
      blockedAt: user.blockedAt,
      blockedReason: user.blockedReason,
      loads: Number(count),
      costMicros30d: Number(micros),
      messagesIn30d: Number(inbound),
    }));
  }

  async usageSeries(fromDay: string, toDay: string): Promise<UsageDay[]> {
    const rows = await this.db
      .select({
        day: assistantUsage.day,
        activeUsers: sql<number>`count(*) FILTER (WHERE ${assistantUsage.messagesIn} > 0)::int`,
        messagesIn: sql<number>`sum(${assistantUsage.messagesIn})::int`,
        messagesOut: sql<number>`sum(${assistantUsage.messagesOut})::int`,
        aiCalls: sql<number>`sum(${assistantUsage.aiCalls})::int`,
        transcriptions: sql<number>`sum(${assistantUsage.transcriptions})::int`,
        costMicros: sql<number>`sum(${assistantUsage.costMicros})::bigint`,
        aiCostMicros: sql<number>`sum(${assistantUsage.aiCostMicros})::bigint`,
        transcribeCostMicros: sql<number>`sum(${assistantUsage.transcribeCostMicros})::bigint`,
        whatsappCostMicros: sql<number>`sum(${assistantUsage.whatsappCostMicros})::bigint`,
      })
      .from(assistantUsage)
      .where(and(gte(assistantUsage.day, fromDay), sql`${assistantUsage.day} <= ${toDay}::date`))
      .groupBy(assistantUsage.day)
      .orderBy(assistantUsage.day);
    return rows.map((row) => ({
      day: String(row.day),
      activeUsers: Number(row.activeUsers),
      messagesIn: Number(row.messagesIn),
      messagesOut: Number(row.messagesOut),
      aiCalls: Number(row.aiCalls),
      transcriptions: Number(row.transcriptions),
      costMicros: Number(row.costMicros),
      aiCostMicros: Number(row.aiCostMicros),
      transcribeCostMicros: Number(row.transcribeCostMicros),
      whatsappCostMicros: Number(row.whatsappCostMicros),
    }));
  }

  async operationalCounts(since: Date): Promise<OperationalCounts> {
    const count = async (query: Promise<{ value: number }[]>) => Number((await query)[0]?.value ?? 0);
    const n = sql<number>`count(*)::int`;
    const recentEvents = gte(assistantInboundEvent.receivedAt, since);
    return {
      deadEvents: await count(this.db.select({ value: n }).from(assistantInboundEvent).where(and(recentEvents, eq(assistantInboundEvent.status, "DEAD")))),
      failedEvents: await count(this.db.select({ value: n }).from(assistantInboundEvent).where(and(recentEvents, eq(assistantInboundEvent.status, "FAILED")))),
      pendingEvents: await count(this.db.select({ value: n }).from(assistantInboundEvent).where(inArray(assistantInboundEvent.status, ["RECEIVED", "PROCESSING"]))),
      outboundSent: await count(
        this.db.select({ value: n }).from(assistantOutboundMessage).where(and(gte(assistantOutboundMessage.createdAt, since), inArray(assistantOutboundMessage.status, ["SENT", "DELIVERED", "READ"]))),
      ),
      outboundFailed: await count(
        this.db.select({ value: n }).from(assistantOutboundMessage).where(and(gte(assistantOutboundMessage.createdAt, since), eq(assistantOutboundMessage.status, "FAILED"))),
      ),
      newUsers: await count(this.db.select({ value: n }).from(assistantUser).where(gte(assistantUser.createdAt, since))),
    };
  }

  async billingSummary(): Promise<BillingSummary> {
    const [row] = await this.db
      .select({
        proActive: sql<number>`count(*) FILTER (WHERE ${assistantUser.planStatus} IN ('active', 'trialing'))::int`,
        proPastDue: sql<number>`count(*) FILTER (WHERE ${assistantUser.planStatus} = 'past_due')::int`,
        mrrCents: sql<number>`coalesce(sum(${assistantUser.planAmountCents}) FILTER (WHERE ${assistantUser.planStatus} = 'active'), 0)::int`,
      })
      .from(assistantUser)
      .where(eq(assistantUser.plan, "PRO"));
    return { proActive: Number(row?.proActive ?? 0), proPastDue: Number(row?.proPastDue ?? 0), mrrCents: Number(row?.mrrCents ?? 0) };
  }

  async getUserById(userId: string) {
    const [row] = await this.db.select().from(assistantUser).where(eq(assistantUser.id, userId)).limit(1);
    return row ? toUser(row) : null;
  }

  async createAlert(userId: string, criteria: AlertCriteria) {
    const [row] = await this.db.insert(assistantAlert).values({ id: `waa_${randomUUID()}`, userId, criteria, createdAt: new Date(), updatedAt: new Date() }).returning();
    return toAlert(row);
  }

  async listAlerts(userId: string, options: { activeOnly: boolean }) {
    const rows = await this.db
      .select()
      .from(assistantAlert)
      .where(options.activeOnly ? and(eq(assistantAlert.userId, userId), eq(assistantAlert.active, true)) : eq(assistantAlert.userId, userId))
      .orderBy(assistantAlert.createdAt)
      .limit(50);
    return rows.map(toAlert);
  }

  async deactivateAlert(userId: string, alertId: string) {
    const rows = await this.db
      .update(assistantAlert)
      .set({ active: false })
      .where(and(eq(assistantAlert.id, alertId), eq(assistantAlert.userId, userId), eq(assistantAlert.active, true)))
      .returning({ id: assistantAlert.id });
    return rows.length > 0;
  }

  async deactivateAllAlerts(userId: string) {
    const rows = await this.db
      .update(assistantAlert)
      .set({ active: false })
      .where(and(eq(assistantAlert.userId, userId), eq(assistantAlert.active, true)))
      .returning({ id: assistantAlert.id });
    return rows.length;
  }

  async listDueAlerts(checkedBefore: Date, limit: number) {
    const rows = await this.db
      .select()
      .from(assistantAlert)
      .where(and(eq(assistantAlert.active, true), or(isNull(assistantAlert.lastCheckedAt), lt(assistantAlert.lastCheckedAt, checkedBefore))))
      .orderBy(sql`${assistantAlert.lastCheckedAt} ASC NULLS FIRST`)
      .limit(limit);
    return rows.map(toAlert);
  }

  async markAlertChecked(alertId: string, at: Date) {
    await this.db.update(assistantAlert).set({ lastCheckedAt: at }).where(eq(assistantAlert.id, alertId));
  }

  async recordAlertMatch(userId: string, alertId: string, providerId: string, providerLoadId: string) {
    const rows = await this.db
      .insert(assistantAlertMatch)
      .values({ id: `wam_${randomUUID()}`, userId, alertId, providerId, providerLoadId, sentAt: new Date() })
      .onConflictDoNothing()
      .returning({ id: assistantAlertMatch.id });
    return { inserted: rows.length > 0 };
  }

  async hasAlertMatch(alertId: string, providerId: string, providerLoadId: string) {
    const rows = await this.db
      .select({ id: assistantAlertMatch.id })
      .from(assistantAlertMatch)
      .where(and(eq(assistantAlertMatch.alertId, alertId), eq(assistantAlertMatch.providerId, providerId), eq(assistantAlertMatch.providerLoadId, providerLoadId)))
      .limit(1);
    return rows.length > 0;
  }

  async countAlertMatchesSince(userId: string, since: Date) {
    const [row] = await this.db
      .select({ value: sql<number>`count(*)::int` })
      .from(assistantAlertMatch)
      .where(and(eq(assistantAlertMatch.userId, userId), gte(assistantAlertMatch.sentAt, since)));
    return Number(row?.value ?? 0);
  }

  async deleteUser(userId: string, options: { keepEvents?: boolean } = {}) {
    await this.db.transaction(async (tx) => {
      const [row] = await tx.select({ waId: assistantUser.waId }).from(assistantUser).where(eq(assistantUser.id, userId)).limit(1);
      if (!row) return;
      if (!options.keepEvents) await tx.delete(assistantInboundEvent).where(eq(assistantInboundEvent.waId, row.waId));
      await tx.delete(assistantProcessingLease).where(eq(assistantProcessingLease.waId, row.waId));
      // Loads, outbound log and usage cascade.
      await tx.delete(assistantUser).where(eq(assistantUser.id, userId));
    });
  }

  async createLoad(userId: string, record: NewLoadRecord) {
    const [row] = await this.db
      .insert(assistantLoad)
      .values({ id: `wal_${randomUUID()}`, ...loadValues(record), userId, facts: record.facts, totalMiles: record.totalMiles.toFixed(1), createdAt: new Date(), updatedAt: new Date() })
      .returning();
    return toLoad(row);
  }

  async updateLoad(userId: string, loadId: string, patch: Partial<NewLoadRecord>) {
    const values = loadValues(patch);
    if (!Object.keys(values).length) return this.getLoad(userId, loadId);
    const [row] = await this.db
      .update(assistantLoad)
      .set(values)
      .where(and(eq(assistantLoad.id, loadId), eq(assistantLoad.userId, userId)))
      .returning();
    return row ? toLoad(row) : null;
  }

  async getLoad(userId: string, loadId: string) {
    const [row] = await this.db
      .select()
      .from(assistantLoad)
      .where(and(eq(assistantLoad.id, loadId), eq(assistantLoad.userId, userId)))
      .limit(1);
    return row ? toLoad(row) : null;
  }

  async listLoads(userId: string, options: { status?: AssistantLoadRecord["status"]; limit: number }) {
    const rows = await this.db
      .select()
      .from(assistantLoad)
      .where(options.status ? and(eq(assistantLoad.userId, userId), eq(assistantLoad.status, options.status)) : eq(assistantLoad.userId, userId))
      .orderBy(desc(assistantLoad.createdAt))
      .limit(Math.min(Math.max(options.limit, 1), 50));
    return rows.map(toLoad);
  }

  async recordOutbound(userId: string, input: Parameters<AssistantStore["recordOutbound"]>[1]) {
    await this.db
      .insert(assistantOutboundMessage)
      .values({ id: `wao_${randomUUID()}`, userId, ...input, createdAt: new Date(), updatedAt: new Date() })
      .onConflictDoNothing();
  }

  async updateOutboundStatus(waMessageId: string, status: OutboundStatus, errorCode: number | null, errorTitle: string | null) {
    // Statuses can arrive out of order (read before delivered); never move backwards.
    const rank = sql`CASE "status" WHEN 'SENT' THEN 1 WHEN 'DELIVERED' THEN 2 WHEN 'READ' THEN 3 ELSE 4 END`;
    const next = { SENT: 1, DELIVERED: 2, READ: 3, FAILED: 4, WINDOW_CLOSED: 4 }[status];
    await this.db
      .update(assistantOutboundMessage)
      .set({ status, errorCode, errorTitle })
      .where(and(eq(assistantOutboundMessage.waMessageId, waMessageId), sql`${rank} < ${next}`));
  }

  async addUsage(userId: string, day: string, delta: UsageDelta) {
    const v = (key: keyof UsageDelta) => Math.round(delta[key] ?? 0);
    await this.db
      .insert(assistantUsage)
      .values({
        userId,
        day,
        messagesIn: v("messagesIn"),
        messagesOut: v("messagesOut"),
        aiCalls: v("aiCalls"),
        aiInputTokens: v("aiInputTokens"),
        aiOutputTokens: v("aiOutputTokens"),
        transcriptions: v("transcriptions"),
        audioSeconds: v("audioSeconds"),
        costMicros: v("costMicros"),
        aiCostMicros: v("aiCostMicros"),
        transcribeCostMicros: v("transcribeCostMicros"),
        whatsappCostMicros: v("whatsappCostMicros"),
      })
      .onConflictDoUpdate({
        target: [assistantUsage.userId, assistantUsage.day],
        set: {
          messagesIn: sql`${assistantUsage.messagesIn} + ${v("messagesIn")}`,
          messagesOut: sql`${assistantUsage.messagesOut} + ${v("messagesOut")}`,
          aiCalls: sql`${assistantUsage.aiCalls} + ${v("aiCalls")}`,
          aiInputTokens: sql`${assistantUsage.aiInputTokens} + ${v("aiInputTokens")}`,
          aiOutputTokens: sql`${assistantUsage.aiOutputTokens} + ${v("aiOutputTokens")}`,
          transcriptions: sql`${assistantUsage.transcriptions} + ${v("transcriptions")}`,
          audioSeconds: sql`${assistantUsage.audioSeconds} + ${v("audioSeconds")}`,
          costMicros: sql`${assistantUsage.costMicros} + ${v("costMicros")}`,
          aiCostMicros: sql`${assistantUsage.aiCostMicros} + ${v("aiCostMicros")}`,
          transcribeCostMicros: sql`${assistantUsage.transcribeCostMicros} + ${v("transcribeCostMicros")}`,
          whatsappCostMicros: sql`${assistantUsage.whatsappCostMicros} + ${v("whatsappCostMicros")}`,
        },
      });
  }

  async getUsage(userId: string, day: string): Promise<UsageRow> {
    const [row] = await this.db
      .select()
      .from(assistantUsage)
      .where(and(eq(assistantUsage.userId, userId), eq(assistantUsage.day, day)))
      .limit(1);
    return (
      row ?? {
        userId,
        day,
        messagesIn: 0,
        messagesOut: 0,
        aiCalls: 0,
        aiInputTokens: 0,
        aiOutputTokens: 0,
        transcriptions: 0,
        audioSeconds: 0,
        costMicros: 0,
        aiCostMicros: 0,
        transcribeCostMicros: 0,
        whatsappCostMicros: 0,
      }
    );
  }

  async purgeEventPayloads(olderThan: Date) {
    const rows = await this.db
      .update(assistantInboundEvent)
      .set({ payload: null })
      .where(and(lt(assistantInboundEvent.receivedAt, olderThan), isNotNull(assistantInboundEvent.payload)))
      .returning({ id: assistantInboundEvent.id });
    return rows.length;
  }

  async adminStats(day: string): Promise<AdminStats> {
    const count = async (query: Promise<{ value: number }[]>) => Number((await query)[0]?.value ?? 0);
    const users = await count(this.db.select({ value: sql<number>`count(*)::int` }).from(assistantUser));
    const activeAlerts = await count(this.db.select({ value: sql<number>`count(*)::int` }).from(assistantAlert).where(eq(assistantAlert.active, true)));
    const onboardedUsers = await count(
      this.db.select({ value: sql<number>`count(*)::int` }).from(assistantUser).where(sql`${assistantUser.conversation}->>'onboardingStep' IS NULL`),
    );
    const loads = await count(this.db.select({ value: sql<number>`count(*)::int` }).from(assistantLoad));
    const savedLoads = await count(this.db.select({ value: sql<number>`count(*)::int` }).from(assistantLoad).where(eq(assistantLoad.status, "SAVED")));
    const tally = (rows: { key: string; value: number }[]) => Object.fromEntries(rows.map((row) => [row.key, Number(row.value)]));
    const events = await this.db
      .select({ key: assistantInboundEvent.status, value: sql<number>`count(*)::int` })
      .from(assistantInboundEvent)
      .groupBy(assistantInboundEvent.status);
    const outbound = await this.db
      .select({ key: assistantOutboundMessage.status, value: sql<number>`count(*)::int` })
      .from(assistantOutboundMessage)
      .groupBy(assistantOutboundMessage.status);
    const [usage] = await this.db
      .select({
        messagesIn: sql<number>`coalesce(sum(${assistantUsage.messagesIn}), 0)::int`,
        messagesOut: sql<number>`coalesce(sum(${assistantUsage.messagesOut}), 0)::int`,
        aiCalls: sql<number>`coalesce(sum(${assistantUsage.aiCalls}), 0)::int`,
        aiInputTokens: sql<number>`coalesce(sum(${assistantUsage.aiInputTokens}), 0)::int`,
        aiOutputTokens: sql<number>`coalesce(sum(${assistantUsage.aiOutputTokens}), 0)::int`,
        transcriptions: sql<number>`coalesce(sum(${assistantUsage.transcriptions}), 0)::int`,
        audioSeconds: sql<number>`coalesce(sum(${assistantUsage.audioSeconds}), 0)::int`,
        costMicros: sql<number>`coalesce(sum(${assistantUsage.costMicros}), 0)::bigint`,
        aiCostMicros: sql<number>`coalesce(sum(${assistantUsage.aiCostMicros}), 0)::bigint`,
        transcribeCostMicros: sql<number>`coalesce(sum(${assistantUsage.transcribeCostMicros}), 0)::bigint`,
        whatsappCostMicros: sql<number>`coalesce(sum(${assistantUsage.whatsappCostMicros}), 0)::bigint`,
      })
      .from(assistantUsage)
      .where(eq(assistantUsage.day, day));
    return {
      users,
      activeAlerts,
      onboardedUsers,
      loads,
      savedLoads,
      eventsByStatus: tally(events),
      outboundByStatus: tally(outbound),
      usageToday: { day, ...Object.fromEntries(Object.entries(usage ?? {}).map(([key, value]) => [key, Number(value)])) } as AdminStats["usageToday"],
    };
  }
}

