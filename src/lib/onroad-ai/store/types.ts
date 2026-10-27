/**
 * ASSISTANT STORE
 * ===============
 *
 * Everything the WhatsApp assistant persists, behind one interface with two
 * implementations: `DrizzleAssistantStore` (Neon, production) and
 * `MemoryAssistantStore` (tests and the local simulator).
 *
 * TENANT ISOLATION is a property of this interface, not a convention: every
 * method that reads or writes a driver's data takes that driver's `userId`
 * and the implementation filters on it. There is no "list all loads" or
 * "get load by id" without the owner, so a bug in the router cannot hand
 * one driver another's profile, history or conversation.
 *
 * These tables are separate from OnRoad Books businesses. A WhatsApp driver
 * is not a workspace member and gets no access to any ledger.
 */

import type { LoadFacts } from "../load-facts";
import type { CriticalField } from "../load-facts";
import type { DriverProfile } from "../profile";

export type OnboardingStep = "TRUCK" | "MPG" | "FUEL" | "MIN_RPM" | "FEES";

export interface ConversationState {
  /** Null once onboarding is finished. */
  onboardingStep: OnboardingStep | null;
  /** The load being completed before it can be priced. */
  draft: LoadFacts | null;
  /** The question the bot just asked, so a bare "120" lands in the right field. */
  awaiting: CriticalField | null;
  /** Whether the driver wants a verdict on an offer, or only "what to ask". */
  wantsOffer: boolean;
  /** The last analysed load (history row id). */
  currentLoadId: string | null;
  /** Several loads read off one screenshot, waiting for "which one?". */
  candidates: LoadFacts[] | null;
  pendingDelete: boolean;
  /** Typed shortcuts 1/2/3 are live only right after an analysis. */
  shortcutsLive: boolean;
  /** Recent inbound timestamps (ms) for the burst limiter. */
  recent: number[];
}

export function emptyConversation(): ConversationState {
  return {
    onboardingStep: "TRUCK",
    draft: null,
    awaiting: null,
    wantsOffer: true,
    currentLoadId: null,
    candidates: null,
    pendingDelete: false,
    shortcutsLive: false,
    recent: [],
  };
}

export interface AssistantUser {
  id: string;
  waId: string;
  displayName: string | null;
  profile: DriverProfile;
  conversation: ConversationState;
  lastInboundAt: Date | null;
  alertsOptInAt: Date | null;
  alertsOptOutAt: Date | null;
  billing: Billing;
  blockedAt: Date | null;
  blockedReason: string | null;
  createdAt: Date;
}

export type PlanId = "FREE" | "PRO";

export interface Billing {
  plan: PlanId;
  status: string | null;
  currentPeriodEnd: Date | null;
  amountCents: number | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
}

export function freeBilling(): Billing {
  return { plan: "FREE", status: null, currentPeriodEnd: null, amountCents: null, stripeCustomerId: null, stripeSubscriptionId: null };
}

/** One row of the operator's driver list. The phone number is masked by the caller. */
export interface AdminUserRow {
  id: string;
  waId: string;
  displayName: string | null;
  plan: PlanId;
  planStatus: string | null;
  onboarded: boolean;
  createdAt: Date;
  lastInboundAt: Date | null;
  blockedAt: Date | null;
  blockedReason: string | null;
  loads: number;
  costMicros30d: number;
  messagesIn30d: number;
}

export interface UsageDay {
  day: string;
  activeUsers: number;
  messagesIn: number;
  messagesOut: number;
  aiCalls: number;
  transcriptions: number;
  costMicros: number;
  aiCostMicros: number;
  transcribeCostMicros: number;
  whatsappCostMicros: number;
}

export interface OperationalCounts {
  deadEvents: number;
  failedEvents: number;
  pendingEvents: number;
  outboundSent: number;
  outboundFailed: number;
  newUsers: number;
}

export interface BillingSummary {
  proActive: number;
  proPastDue: number;
  /** Sum of active PRO recurring amounts, cents per period (monthly prices assumed). */
  mrrCents: number;
}

/** What an alert looks for. Searched only on an authorized provider. */
export interface AlertCriteria {
  near: { city: string | null; state: string | null } | null;
  radiusMiles: number | null;
  towardState: string | null;
  minRatePerTotalMile: number | null;
}

export interface AssistantAlertRecord {
  id: string;
  userId: string;
  criteria: AlertCriteria;
  active: boolean;
  lastCheckedAt: Date | null;
  createdAt: Date;
}

export type LoadStatus = "ANALYZED" | "SAVED";

/** A priced load, with the headline numbers denormalised for history lists. */
export interface AssistantLoadRecord {
  id: string;
  userId: string;
  status: LoadStatus;
  facts: LoadFacts;
  lane: string | null;
  grossRate: number | null;
  totalMiles: number;
  contribution: number | null;
  contributionPerMile: number | null;
  rating: string | null;
  score: number | null;
  decision: string | null;
  /** Every offer seen for this load, oldest first. */
  offers: number[];
  createdAt: Date;
  updatedAt: Date;
}

export type NewLoadRecord = Omit<AssistantLoadRecord, "id" | "createdAt" | "updatedAt">;

export type EventStatus = "RECEIVED" | "PROCESSING" | "DONE" | "FAILED" | "DEAD";

export interface InboundEventRecord {
  id: string;
  waMessageId: string;
  waId: string;
  phoneNumberId: string;
  messageType: string;
  /** Normalised message (no media bytes). Cleared by retention. */
  payload: unknown;
  status: EventStatus;
  attempts: number;
  error: string | null;
  sentAt: Date;
  receivedAt: Date;
}

export type OutboundStatus = "SENT" | "DELIVERED" | "READ" | "FAILED" | "WINDOW_CLOSED";

export interface UsageDelta {
  messagesIn?: number;
  messagesOut?: number;
  aiCalls?: number;
  aiInputTokens?: number;
  aiOutputTokens?: number;
  transcriptions?: number;
  audioSeconds?: number;
  /** Micro-dollars, so it adds up exactly. The total; the three below split it. */
  costMicros?: number;
  aiCostMicros?: number;
  transcribeCostMicros?: number;
  whatsappCostMicros?: number;
}

export interface UsageRow {
  userId: string;
  day: string;
  messagesIn: number;
  messagesOut: number;
  aiCalls: number;
  aiInputTokens: number;
  aiOutputTokens: number;
  transcriptions: number;
  audioSeconds: number;
  costMicros: number;
  aiCostMicros: number;
  transcribeCostMicros: number;
  whatsappCostMicros: number;
}

export interface AdminStats {
  users: number;
  activeAlerts: number;
  onboardedUsers: number;
  loads: number;
  savedLoads: number;
  eventsByStatus: Record<string, number>;
  outboundByStatus: Record<string, number>;
  usageToday: Omit<UsageRow, "userId" | "day"> & { day: string };
}

export interface AssistantStore {
  /* -- inbound events (idempotency) -------------------------------------- */
  /** Inserts once per wamid. `inserted: false` means a duplicate delivery. */
  recordInboundEvent(event: Omit<InboundEventRecord, "id" | "status" | "attempts" | "error" | "receivedAt">): Promise<{ inserted: boolean }>;
  /** Oldest pending event for this sender, claimed atomically, or null. */
  claimNextEvent(waId: string, maxAttempts: number): Promise<InboundEventRecord | null>;
  completeEvent(id: string): Promise<void>;
  failEvent(id: string, error: string, dead: boolean): Promise<void>;
  /** Senders with work left over (a crashed run, a lost lease). */
  sendersWithPendingEvents(olderThan: Date, maxAttempts: number, limit: number): Promise<string[]>;

  /* -- per-sender processing lease --------------------------------------- */
  acquireLease(waId: string, holder: string, ttlMs: number): Promise<boolean>;
  releaseLease(waId: string, holder: string): Promise<void>;

  /* -- users -------------------------------------------------------------- */
  findUserByWaId(waId: string): Promise<AssistantUser | null>;
  createUser(input: { waId: string; displayName: string | null; profile: DriverProfile; conversation: ConversationState }): Promise<AssistantUser>;
  updateUser(
    userId: string,
    patch: {
      profile?: DriverProfile;
      conversation?: ConversationState;
      lastInboundAt?: Date;
      displayName?: string | null;
      alertsOptInAt?: Date | null;
      alertsOptOutAt?: Date | null;
      billing?: Billing;
      blockedAt?: Date | null;
      blockedReason?: string | null;
    },
  ): Promise<void>;
  findUserByStripeSubscription(subscriptionId: string): Promise<AssistantUser | null>;
  findUserByStripeCustomer(customerId: string): Promise<AssistantUser | null>;
  /** For system jobs (the alert runner) that start from an alert, not a message. */
  getUserById(userId: string): Promise<AssistantUser | null>;
  /**
   * Hard delete: profile, loads, usage, outbound log, inbound events.
   * `keepEvents` is only for rolling back a first contact whose welcome
   * failed to send, so the queued message can be retried.
   */
  deleteUser(userId: string, options?: { keepEvents?: boolean }): Promise<void>;

  /* -- load history ------------------------------------------------------- */
  createLoad(userId: string, record: NewLoadRecord): Promise<AssistantLoadRecord>;
  updateLoad(userId: string, loadId: string, patch: Partial<NewLoadRecord>): Promise<AssistantLoadRecord | null>;
  getLoad(userId: string, loadId: string): Promise<AssistantLoadRecord | null>;
  listLoads(userId: string, options: { status?: LoadStatus; limit: number }): Promise<AssistantLoadRecord[]>;

  /* -- alerts ------------------------------------------------------------- */
  createAlert(userId: string, criteria: AlertCriteria): Promise<AssistantAlertRecord>;
  listAlerts(userId: string, options: { activeOnly: boolean }): Promise<AssistantAlertRecord[]>;
  deactivateAlert(userId: string, alertId: string): Promise<boolean>;
  deactivateAllAlerts(userId: string): Promise<number>;
  /** Active alerts not checked since `checkedBefore`, oldest check first. */
  listDueAlerts(checkedBefore: Date, limit: number): Promise<AssistantAlertRecord[]>;
  markAlertChecked(alertId: string, at: Date): Promise<void>;
  /** Inserts once per (alert, provider, load). `inserted: false` = already sent. */
  recordAlertMatch(userId: string, alertId: string, providerId: string, providerLoadId: string): Promise<{ inserted: boolean }>;
  hasAlertMatch(alertId: string, providerId: string, providerLoadId: string): Promise<boolean>;
  countAlertMatchesSince(userId: string, since: Date): Promise<number>;

  /* -- outbound + usage --------------------------------------------------- */
  recordOutbound(userId: string, input: { waMessageId: string | null; kind: "TEXT" | "INTERACTIVE"; status: OutboundStatus; errorCode: number | null; errorTitle: string | null; length: number }): Promise<void>;
  /** Applies a delivery status webhook. Unknown ids are ignored. */
  updateOutboundStatus(waMessageId: string, status: OutboundStatus, errorCode: number | null, errorTitle: string | null): Promise<void>;
  addUsage(userId: string, day: string, delta: UsageDelta): Promise<void>;
  getUsage(userId: string, day: string): Promise<UsageRow>;

  /* -- operator reporting (aggregates; no message content) ---------------- */
  listUsersForAdmin(options: { limit: number; since30d: Date; day30: string }): Promise<AdminUserRow[]>;
  usageSeries(fromDay: string, toDay: string): Promise<UsageDay[]>;
  operationalCounts(since: Date): Promise<OperationalCounts>;
  billingSummary(): Promise<BillingSummary>;

  /* -- operations --------------------------------------------------------- */
  /** Drops message payloads older than the cutoff (the row and its status stay). */
  purgeEventPayloads(olderThan: Date): Promise<number>;
  adminStats(day: string): Promise<AdminStats>;
}
