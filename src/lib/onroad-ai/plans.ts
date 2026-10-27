/**
 * PLANS AND QUOTAS
 * ================
 *
 * Two plans, FREE and PRO. What each allows per day is configuration, not
 * code: the operator sets the numbers (and the price, in Stripe) without a
 * deploy of new logic.
 *
 * While billing is OFF (no Stripe price for OnRoad AI configured) every
 * driver gets the BETA limits -- the same generous defaults Phase 1 shipped
 * with -- so turning billing on is a deliberate step, never a side effect.
 *
 * A PRO subscription that is past_due keeps PRO limits until Stripe gives
 * up and cancels it: drivers should not lose the tool mid-load over a card
 * retry. Canceled, unpaid or incomplete means FREE.
 */

import { DEFAULT_LIMITS } from "./router-limits";
import type { Billing, PlanId } from "./store/types";

export interface PlanLimits {
  messagesPerDay: number;
  aiCallsPerDay: number;
  transcriptionsPerDay: number;
  maxAlerts: number;
}

export interface PlanConfig {
  billingEnabled: boolean;
  free: PlanLimits;
  pro: PlanLimits;
  beta: PlanLimits;
}

export const BETA_LIMITS: PlanLimits = {
  messagesPerDay: DEFAULT_LIMITS.messagesPerDay,
  aiCallsPerDay: DEFAULT_LIMITS.aiCallsPerDay,
  transcriptionsPerDay: DEFAULT_LIMITS.transcriptionsPerDay,
  maxAlerts: 3,
};

export const DEFAULT_PLAN_CONFIG: PlanConfig = {
  billingEnabled: false,
  free: { messagesPerDay: 40, aiCallsPerDay: 5, transcriptionsPerDay: 3, maxAlerts: 1 },
  pro: { messagesPerDay: 400, aiCallsPerDay: 120, transcriptionsPerDay: 60, maxAlerts: 5 },
  beta: BETA_LIMITS,
};

const PRO_STATUSES = new Set(["active", "trialing", "past_due"]);

export function effectivePlan(billing: Billing): PlanId {
  return billing.plan === "PRO" && billing.status !== null && PRO_STATUSES.has(billing.status) ? "PRO" : "FREE";
}

export function limitsFor(config: PlanConfig, billing: Billing): PlanLimits {
  if (!config.billingEnabled) return config.beta;
  return effectivePlan(billing) === "PRO" ? config.pro : config.free;
}

function readLimits(env: Record<string, string | undefined>, prefix: string, fallback: PlanLimits): PlanLimits {
  const value = (key: string, base: number) => {
    const raw = env[`${prefix}_${key}`]?.trim();
    if (!raw) return base;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : base;
  };
  return {
    messagesPerDay: value("MESSAGES_PER_DAY", fallback.messagesPerDay),
    aiCallsPerDay: value("AI_CALLS_PER_DAY", fallback.aiCallsPerDay),
    transcriptionsPerDay: value("TRANSCRIPTIONS_PER_DAY", fallback.transcriptionsPerDay),
    maxAlerts: value("MAX_ALERTS", fallback.maxAlerts),
  };
}

export function planConfigFromEnv(env: Record<string, string | undefined> = process.env): PlanConfig {
  return {
    billingEnabled: Boolean(env.STRIPE_SECRET_KEY?.trim() && env.STRIPE_PRICE_ONROAD_AI_MONTHLY?.trim()),
    free: readLimits(env, "ONROAD_AI_FREE", DEFAULT_PLAN_CONFIG.free),
    pro: readLimits(env, "ONROAD_AI_PRO", DEFAULT_PLAN_CONFIG.pro),
    // ONROAD_AI_MESSAGES_PER_DAY etc. -- the Phase 1 variables keep working.
    beta: readLimits(env, "ONROAD_AI", BETA_LIMITS),
  };
}

/** The checkout and portal links, behind a port so the router stays testable. */
export interface BillingPort {
  checkoutUrl(user: { id: string; waId: string; billing: Billing }): Promise<string | null>;
  portalUrl(user: { id: string; billing: Billing }): Promise<string | null>;
}
