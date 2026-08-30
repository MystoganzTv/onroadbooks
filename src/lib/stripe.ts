import "server-only";

import Stripe from "stripe";

import type { PlanId } from "@/lib/types";

let stripeClient: Stripe | null = null;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

/** Lazily constructed so builds and non-billing pages do not need a live key. */
export function getStripe(): Stripe {
  if (!stripeClient) {
    stripeClient = new Stripe(required("STRIPE_SECRET_KEY"), {
      apiVersion: "2026-02-25.clover",
      typescript: true,
    });
  }
  return stripeClient;
}

const PRICE_ENV: Record<PlanId, string> = {
  SOLO: "STRIPE_PRICE_SOLO_MONTHLY",
  OWNER: "STRIPE_PRICE_PRO_MONTHLY",
  FLEET: "STRIPE_PRICE_FLEET_MONTHLY",
};

export function stripePriceId(plan: PlanId): string {
  return required(PRICE_ENV[plan]);
}

export function planForStripePrice(priceId: string): PlanId | null {
  for (const [plan, envName] of Object.entries(PRICE_ENV) as [PlanId, string][]) {
    if (process.env[envName]?.trim() === priceId) return plan;
  }
  return null;
}

export function stripeWebhookSecret(): string {
  return required("STRIPE_WEBHOOK_SECRET");
}

export function stripeBillingConfigured(): boolean {
  return [
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    ...Object.values(PRICE_ENV),
  ].every((name) => Boolean(process.env[name]?.trim()));
}

export function applicationUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");

  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (production) return `https://${production.replace(/\/$/, "")}`;

  return "http://localhost:3000";
}
