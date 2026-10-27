import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { copyFor } from "@/lib/onroad-ai/copy";
import { effectivePlan } from "@/lib/onroad-ai/plans";
import { createBotDeps, whatsappSettings } from "@/lib/onroad-ai/config";
import { isOnroadAiObject, onroadAiWebhookSecret, syncOnroadAiSubscription } from "@/lib/onroad-ai/stripe-billing";
import { isWithinServiceWindow } from "@/lib/onroad-ai/whatsapp/client";
import { operationalLog, reportOperationalError } from "@/lib/operations";
import { getStripe, stripeSecretLivemode } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stripe events for OnRoad AI subscriptions only. Configure it in Stripe as
 * its OWN endpoint (https://onroadbooks.com/api/whatsapp/stripe) with its own
 * signing secret in STRIPE_ONROAD_AI_WEBHOOK_SECRET, subscribed to:
 *   checkout.session.completed
 *   customer.subscription.created / updated / deleted
 *
 * Events for OnRoad Books workspaces are acknowledged and ignored here, and
 * the OnRoad Books endpoint ignores ours (metadata.product = "onroad-ai").
 */
export async function POST(request: Request) {
  const secret = onroadAiWebhookSecret();
  const settings = whatsappSettings();
  if (!secret || !settings) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(await request.text(), signature, secret);
  } catch {
    operationalLog("warning", "OnRoad AI Stripe webhook signature rejected", { route: "/api/whatsapp/stripe" });
    return NextResponse.json({ error: "Invalid Stripe signature." }, { status: 400 });
  }
  const livemode = stripeSecretLivemode();
  if (livemode !== null && event.livemode !== livemode) return NextResponse.json({ received: true });

  let subscriptionId: string | null = null;
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    if (!isOnroadAiObject(session)) return NextResponse.json({ received: true });
    subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null;
  } else if (event.type.startsWith("customer.subscription.")) {
    const subscription = event.data.object as Stripe.Subscription;
    if (!isOnroadAiObject(subscription)) return NextResponse.json({ received: true });
    subscriptionId = subscription.id;
  }
  if (!subscriptionId) return NextResponse.json({ received: true });

  try {
    const deps = createBotDeps(settings);
    const outcome = await syncOnroadAiSubscription(deps.store, subscriptionId);
    if (outcome.kind === "UPDATED") {
      const was = effectivePlan(outcome.before);
      const now = effectivePlan(outcome.after);
      // Tell the driver once, only on a real change, and only inside the 24-hour window.
      if (was !== now && isWithinServiceWindow(outcome.user.lastInboundAt, new Date())) {
        const copy = copyFor(outcome.user.profile.locale);
        await deps.whatsapp.sendText(outcome.user.waId, now === "PRO" ? copy.proActivated : copy.proEnded);
      }
    } else {
      operationalLog("info", "OnRoad AI Stripe event ignored", { route: "/api/whatsapp/stripe", eventType: event.type, reason: outcome.reason });
    }
    return NextResponse.json({ received: true });
  } catch (error) {
    await reportOperationalError("OnRoad AI Stripe webhook failed", error, { route: "/api/whatsapp/stripe", eventId: event.id, eventType: event.type });
    // 500 so Stripe retries; the sync re-reads Stripe, so a retry is safe.
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }
}
