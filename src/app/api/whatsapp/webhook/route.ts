import { after, NextResponse } from "next/server";

import { createBotDeps, whatsappSettings } from "@/lib/onroad-ai/config";
import { drainSender, recordWebhook, sweepPending } from "@/lib/onroad-ai/processor";
import { parseWebhook } from "@/lib/onroad-ai/whatsapp/payload";
import { verifyMetaSignature, verifySubscription } from "@/lib/onroad-ai/whatsapp/signature";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Room for an AI read of a screenshot after the 200 has gone back to Meta.
export const maxDuration = 60;

/** A webhook batch is a few KB; anything this size is not from Meta. */
const MAX_BODY_BYTES = 1_000_000;
const noStore = { "Cache-Control": "no-store" };

/**
 * Meta's subscription handshake. Echoes hub.challenge only when
 * hub.verify_token matches WHATSAPP_VERIFY_TOKEN.
 */
export async function GET(request: Request) {
  const settings = whatsappSettings();
  if (!settings) return new NextResponse("Not found", { status: 404, headers: noStore });
  const challenge = verifySubscription(new URL(request.url).searchParams, settings.verifyToken);
  if (!challenge) return new NextResponse("Forbidden", { status: 403, headers: noStore });
  return new NextResponse(challenge, { status: 200, headers: { ...noStore, "Content-Type": "text/plain" } });
}

/**
 * Inbound messages and delivery statuses.
 *
 * 1. verify X-Hub-Signature-256 over the RAW body (401 otherwise)
 * 2. record each message once (unique wamid) and apply statuses
 * 3. answer 200 immediately
 * 4. after the response: reply to each sender, then retry leftovers
 *
 * Off (404) unless ONROAD_AI_ENABLED=true and WhatsApp is fully configured.
 */
export async function POST(request: Request) {
  const settings = whatsappSettings();
  if (!settings) return new NextResponse("Not found", { status: 404, headers: noStore });

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) return new NextResponse("Payload too large", { status: 413, headers: noStore });
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return new NextResponse("Payload too large", { status: 413, headers: noStore });
  if (!verifyMetaSignature(raw, request.headers.get("x-hub-signature-256"), settings.appSecret)) {
    return new NextResponse("Invalid signature", { status: 401, headers: noStore });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new NextResponse("Bad request", { status: 400, headers: noStore });
  }
  const batch = parseWebhook(body);
  // Signed but not something we handle (another product's field): acknowledge so Meta stops retrying.
  if (!batch) return NextResponse.json({ ok: true }, { headers: noStore });

  const deps = createBotDeps(settings);
  // If this throws (database down) Meta gets a 500 and redelivers later --
  // exactly what we want, and the unique wamid makes the redelivery safe.
  const recorded = await recordWebhook(deps.store, batch, settings.phoneNumberId);

  after(async () => {
    for (const sender of recorded.senders) {
      try {
        await drainSender(deps, sender);
      } catch (error) {
        console.error("[onroad-ai] drain failed", error instanceof Error ? error.name : "unknown");
      }
    }
    try {
      await sweepPending(deps, 5);
    } catch (error) {
      console.error("[onroad-ai] sweep failed", error instanceof Error ? error.name : "unknown");
    }
  });

  return NextResponse.json({ ok: true }, { headers: noStore });
}
