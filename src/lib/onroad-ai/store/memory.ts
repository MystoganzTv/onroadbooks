/**
 * In-memory AssistantStore. Same contract as the Drizzle store; used by the
 * tests and by `scripts/onroad-ai-simulate.ts`. Not for production: it lives
 * in one process and forgets everything on restart.
 */

import { randomUUID } from "node:crypto";

import {
  freeBilling,
  type AdminUserRow,
  type BillingSummary,
  type OperationalCounts,
  type UsageDay,
} from "./types";
import type {
  AdminStats,
  AlertCriteria,
  AssistantAlertRecord,
  AssistantLoadRecord,
  AssistantStore,
  AssistantUser,
  InboundEventRecord,
  NewLoadRecord,
  OutboundStatus,
  UsageDelta,
  UsageRow,
} from "./types";

interface OutboundRow {
  createdAt: Date;
  userId: string;
  waMessageId: string | null;
  kind: string;
  status: OutboundStatus;
  errorCode: number | null;
  errorTitle: string | null;
}

const clone = <T>(value: T): T => structuredClone(value);

export class MemoryAssistantStore implements AssistantStore {
  readonly users = new Map<string, AssistantUser>();
  readonly events = new Map<string, InboundEventRecord & { updatedAt: Date }>();
  readonly loads = new Map<string, AssistantLoadRecord>();
  readonly outbound: OutboundRow[] = [];
  readonly usage = new Map<string, UsageRow>();
  readonly leases = new Map<string, { holder: string; until: number }>();
  readonly alerts = new Map<string, AssistantAlertRecord>();
  readonly alertMatches: { userId: string; alertId: string; providerId: string; providerLoadId: string; sentAt: Date }[] = [];

  async recordInboundEvent(event: Omit<InboundEventRecord, "id" | "status" | "attempts" | "error" | "receivedAt">) {
    for (const existing of this.events.values()) {
      if (existing.waMessageId === event.waMessageId) return { inserted: false };
    }
    const id = `evt_${randomUUID()}`;
    const now = new Date();
    this.events.set(id, { ...clone(event), id, status: "RECEIVED", attempts: 0, error: null, receivedAt: now, updatedAt: now });
    return { inserted: true };
  }

  async claimNextEvent(waId: string, maxAttempts: number) {
    const stale = Date.now() - 5 * 60_000;
    const next = [...this.events.values()]
      .filter(
        (event) =>
          event.waId === waId &&
          event.attempts < maxAttempts &&
          (event.status === "RECEIVED" || event.status === "FAILED" || (event.status === "PROCESSING" && event.updatedAt.getTime() < stale)),
      )
      .sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime() || a.receivedAt.getTime() - b.receivedAt.getTime())[0];
    if (!next) return null;
    next.status = "PROCESSING";
    next.attempts += 1;
    next.updatedAt = new Date();
    return clone(next);
  }

  async completeEvent(id: string) {
    const event = this.events.get(id);
    if (event) Object.assign(event, { status: "DONE", error: null, updatedAt: new Date() });
  }

  async failEvent(id: string, error: string, dead: boolean) {
    const event = this.events.get(id);
    if (event) Object.assign(event, { status: dead ? "DEAD" : "FAILED", error: error.slice(0, 500), updatedAt: new Date() });
  }

  async sendersWithPendingEvents(olderThan: Date, maxAttempts: number, limit: number) {
    const senders = new Set<string>();
    for (const event of this.events.values()) {
      if (event.attempts >= maxAttempts || event.receivedAt >= olderThan) continue;
      if (event.status === "RECEIVED" || event.status === "FAILED" || (event.status === "PROCESSING" && event.updatedAt < olderThan)) senders.add(event.waId);
    }
    return [...senders].slice(0, limit);
  }

  async acquireLease(waId: string, holder: string, ttlMs: number) {
    const current = this.leases.get(waId);
    if (current && current.until > Date.now() && current.holder !== holder) return false;
    this.leases.set(waId, { holder, until: Date.now() + ttlMs });
    return true;
  }

  async releaseLease(waId: string, holder: string) {
    if (this.leases.get(waId)?.holder === holder) this.leases.delete(waId);
  }

  async findUserByWaId(waId: string) {
    for (const user of this.users.values()) if (user.waId === waId) return clone(user);
    return null;
  }

  async createUser(input: Parameters<AssistantStore["createUser"]>[0]) {
    const existing = await this.findUserByWaId(input.waId);
    if (existing) return existing;
    const user: AssistantUser = { id: `wau_${randomUUID()}`, ...clone(input), lastInboundAt: null, alertsOptInAt: null, alertsOptOutAt: null, billing: freeBilling(), blockedAt: null, blockedReason: null, createdAt: new Date() };
    this.users.set(user.id, user);
    return clone(user);
  }

  async updateUser(userId: string, patch: Parameters<AssistantStore["updateUser"]>[1]) {
    const user = this.users.get(userId);
    if (!user) return;
    if (patch.profile) user.profile = clone(patch.profile);
    if (patch.conversation) user.conversation = clone(patch.conversation);
    if (patch.lastInboundAt) user.lastInboundAt = patch.lastInboundAt;
    if (patch.displayName !== undefined) user.displayName = patch.displayName;
    if (patch.alertsOptInAt !== undefined) user.alertsOptInAt = patch.alertsOptInAt;
    if (patch.alertsOptOutAt !== undefined) user.alertsOptOutAt = patch.alertsOptOutAt;
    if (patch.billing) user.billing = clone(patch.billing);
    if (patch.blockedAt !== undefined) user.blockedAt = patch.blockedAt;
    if (patch.blockedReason !== undefined) user.blockedReason = patch.blockedReason;
  }

  async findUserByStripeSubscription(subscriptionId: string) {
    for (const user of this.users.values()) if (user.billing.stripeSubscriptionId === subscriptionId) return clone(user);
    return null;
  }

  async findUserByStripeCustomer(customerId: string) {
    for (const user of this.users.values()) if (user.billing.stripeCustomerId === customerId) return clone(user);
    return null;
  }

  async listUsersForAdmin(options: { limit: number; since30d: Date; day30: string }): Promise<AdminUserRow[]> {
    return [...this.users.values()]
      .sort((a, b) => (b.lastInboundAt?.getTime() ?? 0) - (a.lastInboundAt?.getTime() ?? 0))
      .slice(0, options.limit)
      .map((user) => {
        const usage = [...this.usage.values()].filter((row) => row.userId === user.id && row.day >= options.day30);
        return {
          id: user.id,
          waId: user.waId,
          displayName: user.displayName,
          plan: user.billing.plan,
          planStatus: user.billing.status,
          onboarded: user.conversation.onboardingStep === null,
          createdAt: user.createdAt,
          lastInboundAt: user.lastInboundAt,
          blockedAt: user.blockedAt,
          blockedReason: user.blockedReason,
          loads: [...this.loads.values()].filter((load) => load.userId === user.id).length,
          costMicros30d: usage.reduce((sum, row) => sum + row.costMicros, 0),
          messagesIn30d: usage.reduce((sum, row) => sum + row.messagesIn, 0),
        };
      });
  }

  async usageSeries(fromDay: string, toDay: string): Promise<UsageDay[]> {
    const days = new Map<string, UsageDay>();
    for (const row of this.usage.values()) {
      if (row.day < fromDay || row.day > toDay) continue;
      const day = days.get(row.day) ?? { day: row.day, activeUsers: 0, messagesIn: 0, messagesOut: 0, aiCalls: 0, transcriptions: 0, costMicros: 0, aiCostMicros: 0, transcribeCostMicros: 0, whatsappCostMicros: 0 };
      day.activeUsers += row.messagesIn > 0 ? 1 : 0;
      for (const key of ["messagesIn", "messagesOut", "aiCalls", "transcriptions", "costMicros", "aiCostMicros", "transcribeCostMicros", "whatsappCostMicros"] as const) day[key] += row[key];
      days.set(row.day, day);
    }
    return [...days.values()].sort((a, b) => a.day.localeCompare(b.day));
  }

  async operationalCounts(since: Date): Promise<OperationalCounts> {
    const events = [...this.events.values()].filter((event) => event.receivedAt >= since);
    return {
      deadEvents: events.filter((event) => event.status === "DEAD").length,
      failedEvents: events.filter((event) => event.status === "FAILED").length,
      pendingEvents: [...this.events.values()].filter((event) => event.status === "RECEIVED" || event.status === "PROCESSING").length,
      outboundSent: this.outbound.filter((row) => row.status !== "FAILED" && row.status !== "WINDOW_CLOSED" && row.createdAt >= since).length,
      outboundFailed: this.outbound.filter((row) => row.status === "FAILED" && row.createdAt >= since).length,
      newUsers: [...this.users.values()].filter((user) => user.createdAt >= since).length,
    };
  }

  async billingSummary(): Promise<BillingSummary> {
    const pro = [...this.users.values()].filter((user) => user.billing.plan === "PRO");
    return {
      proActive: pro.filter((user) => user.billing.status === "active" || user.billing.status === "trialing").length,
      proPastDue: pro.filter((user) => user.billing.status === "past_due").length,
      mrrCents: pro.filter((user) => user.billing.status === "active").reduce((sum, user) => sum + (user.billing.amountCents ?? 0), 0),
    };
  }

  async getUserById(userId: string) {
    const user = this.users.get(userId);
    return user ? clone(user) : null;
  }

  async createAlert(userId: string, criteria: AlertCriteria) {
    const alert: AssistantAlertRecord = { id: `waa_${randomUUID()}`, userId, criteria: clone(criteria), active: true, lastCheckedAt: null, createdAt: new Date() };
    this.alerts.set(alert.id, alert);
    return clone(alert);
  }

  async listAlerts(userId: string, options: { activeOnly: boolean }) {
    return [...this.alerts.values()]
      .filter((alert) => alert.userId === userId && (!options.activeOnly || alert.active))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map(clone);
  }

  async deactivateAlert(userId: string, alertId: string) {
    const alert = this.alerts.get(alertId);
    if (!alert || alert.userId !== userId || !alert.active) return false;
    alert.active = false;
    return true;
  }

  async deactivateAllAlerts(userId: string) {
    let count = 0;
    for (const alert of this.alerts.values()) {
      if (alert.userId === userId && alert.active) {
        alert.active = false;
        count += 1;
      }
    }
    return count;
  }

  async listDueAlerts(checkedBefore: Date, limit: number) {
    return [...this.alerts.values()]
      .filter((alert) => alert.active && (!alert.lastCheckedAt || alert.lastCheckedAt < checkedBefore))
      .sort((a, b) => (a.lastCheckedAt?.getTime() ?? 0) - (b.lastCheckedAt?.getTime() ?? 0))
      .slice(0, limit)
      .map(clone);
  }

  async markAlertChecked(alertId: string, at: Date) {
    const alert = this.alerts.get(alertId);
    if (alert) alert.lastCheckedAt = at;
  }

  async recordAlertMatch(userId: string, alertId: string, providerId: string, providerLoadId: string) {
    if (await this.hasAlertMatch(alertId, providerId, providerLoadId)) return { inserted: false };
    this.alertMatches.push({ userId, alertId, providerId, providerLoadId, sentAt: new Date() });
    return { inserted: true };
  }

  async hasAlertMatch(alertId: string, providerId: string, providerLoadId: string) {
    return this.alertMatches.some((row) => row.alertId === alertId && row.providerId === providerId && row.providerLoadId === providerLoadId);
  }

  async countAlertMatchesSince(userId: string, since: Date) {
    return this.alertMatches.filter((row) => row.userId === userId && row.sentAt >= since).length;
  }

  async deleteUser(userId: string, options: { keepEvents?: boolean } = {}) {
    const user = this.users.get(userId);
    if (!user) return;
    this.users.delete(userId);
    for (const [id, load] of this.loads) if (load.userId === userId) this.loads.delete(id);
    for (const [key, row] of this.usage) if (row.userId === userId) this.usage.delete(key);
    for (let index = this.outbound.length - 1; index >= 0; index -= 1) if (this.outbound[index].userId === userId) this.outbound.splice(index, 1);
    for (const [id, alert] of this.alerts) if (alert.userId === userId) this.alerts.delete(id);
    for (let index = this.alertMatches.length - 1; index >= 0; index -= 1) if (this.alertMatches[index].userId === userId) this.alertMatches.splice(index, 1);
    if (!options.keepEvents) for (const [id, event] of this.events) if (event.waId === user.waId) this.events.delete(id);
  }

  async createLoad(userId: string, record: NewLoadRecord) {
    const now = new Date();
    const load: AssistantLoadRecord = { ...clone(record), userId, id: `wal_${randomUUID()}`, createdAt: now, updatedAt: now };
    this.loads.set(load.id, load);
    return clone(load);
  }

  async updateLoad(userId: string, loadId: string, patch: Partial<NewLoadRecord>) {
    const load = this.loads.get(loadId);
    if (!load || load.userId !== userId) return null;
    const { userId: _ignored, ...safe } = patch;
    Object.assign(load, clone(safe), { updatedAt: new Date() });
    return clone(load);
  }

  async getLoad(userId: string, loadId: string) {
    const load = this.loads.get(loadId);
    return load && load.userId === userId ? clone(load) : null;
  }

  async listLoads(userId: string, options: { status?: AssistantLoadRecord["status"]; limit: number }) {
    return [...this.loads.values()]
      .filter((load) => load.userId === userId && (!options.status || load.status === options.status))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, options.limit)
      .map(clone);
  }

  async recordOutbound(userId: string, input: Parameters<AssistantStore["recordOutbound"]>[1]) {
    this.outbound.push({ createdAt: new Date(), userId, waMessageId: input.waMessageId, kind: input.kind, status: input.status, errorCode: input.errorCode, errorTitle: input.errorTitle });
  }

  async updateOutboundStatus(waMessageId: string, status: OutboundStatus, errorCode: number | null, errorTitle: string | null) {
    const rank: Record<OutboundStatus, number> = { SENT: 1, DELIVERED: 2, READ: 3, FAILED: 4, WINDOW_CLOSED: 4 };
    const row = this.outbound.find((item) => item.waMessageId === waMessageId);
    if (row && rank[row.status] < rank[status]) Object.assign(row, { status, errorCode, errorTitle });
  }

  private usageKey(userId: string, day: string) {
    return `${userId}:${day}`;
  }

  async addUsage(userId: string, day: string, delta: UsageDelta) {
    const row = await this.getUsage(userId, day);
    for (const [key, value] of Object.entries(delta)) {
      (row as unknown as Record<string, number>)[key] += Math.round(value ?? 0);
    }
    this.usage.set(this.usageKey(userId, day), row);
  }

  async getUsage(userId: string, day: string): Promise<UsageRow> {
    return clone(
      this.usage.get(this.usageKey(userId, day)) ?? {
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
      },
    );
  }

  async purgeEventPayloads(olderThan: Date) {
    let count = 0;
    for (const event of this.events.values()) {
      if (event.receivedAt < olderThan && event.payload !== null) {
        event.payload = null;
        count += 1;
      }
    }
    return count;
  }

  async adminStats(day: string): Promise<AdminStats> {
    const tally = (values: string[]) => values.reduce<Record<string, number>>((acc, value) => ({ ...acc, [value]: (acc[value] ?? 0) + 1 }), {});
    const today = [...this.usage.values()].filter((row) => row.day === day);
    const sum = (key: keyof UsageRow) => today.reduce((total, row) => total + Number(row[key]), 0);
    return {
      users: this.users.size,
      activeAlerts: [...this.alerts.values()].filter((alert) => alert.active).length,
      onboardedUsers: [...this.users.values()].filter((user) => user.conversation.onboardingStep === null).length,
      loads: this.loads.size,
      savedLoads: [...this.loads.values()].filter((load) => load.status === "SAVED").length,
      eventsByStatus: tally([...this.events.values()].map((event) => event.status)),
      outboundByStatus: tally(this.outbound.map((row) => row.status)),
      usageToday: {
        day,
        messagesIn: sum("messagesIn"),
        messagesOut: sum("messagesOut"),
        aiCalls: sum("aiCalls"),
        aiInputTokens: sum("aiInputTokens"),
        aiOutputTokens: sum("aiOutputTokens"),
        transcriptions: sum("transcriptions"),
        audioSeconds: sum("audioSeconds"),
        costMicros: sum("costMicros"),
        aiCostMicros: sum("aiCostMicros"),
        transcribeCostMicros: sum("transcribeCostMicros"),
        whatsappCostMicros: sum("whatsappCostMicros"),
      },
    };
  }
}
