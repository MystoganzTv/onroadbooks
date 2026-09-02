import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { syncStripeSubscription } from "@/lib/billing";
import { BusinessNotFoundError } from "@/lib/db/repository";
import { operationalLog, reportOperationalError } from "@/lib/operations";
import { getStripe, stripeWebhookSecret } from "@/lib/stripe";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const startedAt = Date.now();
  const requestId = request.headers.get("x-vercel-id");
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    operationalLog("warning", "Stripe webhook rejected without signature", {
      route: "/api/stripe/webhook",
      requestId,
    });
    return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(
      await request.text(),
      signature,
      stripeWebhookSecret(),
    );
  } catch (error) {
    operationalLog("warning", "Stripe webhook signature rejected", {
      route: "/api/stripe/webhook",
      requestId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return NextResponse.json({ error: "Invalid Stripe signature." }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id;
        if (subscriptionId) {
          await syncStripeSubscription(await getStripe().subscriptions.retrieve(subscriptionId));
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await syncStripeSubscription(event.data.object);
        break;
      default:
        break;
    }
  } catch (error) {
    if (error instanceof BusinessNotFoundError) {
      operationalLog("warning", "Stripe webhook ignored for deleted business", {
        route: "/api/stripe/webhook",
        requestId,
        eventId: event.id,
        eventType: event.type,
        durationMs: Date.now() - startedAt,
      });
      return NextResponse.json({ received: true });
    }

    await reportOperationalError("Stripe webhook synchronization failed", error, {
      route: "/api/stripe/webhook",
      requestId,
      eventId: event.id,
      eventType: event.type,
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json({ error: "Could not synchronize billing." }, { status: 500 });
  }

  operationalLog("info", "Stripe webhook processed", {
    route: "/api/stripe/webhook",
    requestId,
    eventId: event.id,
    eventType: event.type,
    durationMs: Date.now() - startedAt,
  });
  return NextResponse.json({ received: true });
}
