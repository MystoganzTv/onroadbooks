/**
 * WEBHOOK -> QUEUE -> WORKER
 * ==========================
 *
 * Meta wants a fast 200 and retries for up to 7 days when it does not get
 * one, so the webhook only RECORDS: each message becomes an
 * AssistantInboundEvent row (unique on its wamid -- a redelivery inserts
 * nothing), and the reply is produced after the response is sent.
 *
 * The event table is the queue. A worker drains one SENDER at a time under
 * a short lease, oldest message first, so a driver who sends "Chicago IL
 * Miami FL 1400 mi $2800" and then "120 DH" gets them handled in order, and
 * two serverless invocations never answer the same driver at once.
 *
 * Failures are retried (attempts < MAX_ATTEMPTS) by the next webhook for
 * that driver, by the opportunistic sweep, or by the daily maintenance cron.
 * After the last attempt the event is DEAD, the driver gets a short "try
 * again" message, and the row stays for the operations API to inspect.
 */

import { randomUUID } from "node:crypto";

import { copyFor } from "./copy";
import { handleInbound, type BotDeps } from "./router";
import type { AssistantStore, OutboundStatus } from "./store/types";
import { isWithinServiceWindow } from "./whatsapp/client";
import type { InboundMessage, StatusUpdate } from "./whatsapp/payload";

export const MAX_ATTEMPTS = 4;
const LEASE_MS = 90_000;
const MAX_EVENTS_PER_DRAIN = 25;

const OUTBOUND_STATUS: Record<string, OutboundStatus> = {
  sent: "SENT",
  delivered: "DELIVERED",
  read: "READ",
  failed: "FAILED",
};

/** Store what arrived. Returns the senders that have new work. */
export async function recordWebhook(
  store: AssistantStore,
  batch: { messages: InboundMessage[]; statuses: StatusUpdate[] },
  phoneNumberId: string,
): Promise<{ senders: string[]; duplicates: number; ignored: number }> {
  const senders = new Set<string>();
  let duplicates = 0;
  let ignored = 0;
  for (const message of batch.messages) {
    // Only messages sent to OUR number. A shared Meta app can carry others.
    if (phoneNumberId && message.phoneNumberId && message.phoneNumberId !== phoneNumberId) {
      ignored += 1;
      continue;
    }
    const { inserted } = await store.recordInboundEvent({
      waMessageId: message.id,
      waId: message.from,
      phoneNumberId: message.phoneNumberId,
      messageType: message.kind,
      payload: message,
      sentAt: new Date(message.timestamp * 1000),
    });
    if (inserted) senders.add(message.from);
    else duplicates += 1;
  }
  for (const status of batch.statuses) {
    const mapped = OUTBOUND_STATUS[status.status];
    if (mapped) await store.updateOutboundStatus(status.messageId, mapped, status.errorCode, status.errorTitle);
  }
  return { senders: [...senders], duplicates, ignored };
}

function asMessage(payload: unknown): InboundMessage | null {
  if (!payload || typeof payload !== "object") return null;
  const value = payload as Partial<InboundMessage>;
  if (typeof value.id !== "string" || typeof value.from !== "string" || typeof value.kind !== "string" || typeof value.timestamp !== "number") return null;
  return {
    id: value.id,
    from: value.from,
    phoneNumberId: typeof value.phoneNumberId === "string" ? value.phoneNumberId : "",
    profileName: typeof value.profileName === "string" ? value.profileName : null,
    timestamp: value.timestamp,
    kind: value.kind,
    text: typeof value.text === "string" ? value.text : null,
    media: value.media && typeof value.media === "object" && typeof value.media.id === "string" ? value.media : null,
    replyId: typeof value.replyId === "string" ? value.replyId : null,
    rawType: typeof value.rawType === "string" ? value.rawType : value.kind,
  };
}

/** Error text safe to store: a class name and code, never message content. */
function safeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`.replace(/\d{7,}/g, "[n]").slice(0, 300);
  return "unknown error";
}

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * If another worker holds this driver's lease, wait briefly and try again:
 * it may finish its last event just before ours was recorded, and without a
 * second look our message would sit until the sweep.
 */
export async function drainSender(deps: BotDeps, waId: string, options: { waitForLeaseMs?: number } = {}): Promise<{ processed: number; failed: number }> {
  const holder = randomUUID();
  const deadline = Date.now() + (options.waitForLeaseMs ?? 6_000);
  while (!(await deps.store.acquireLease(waId, holder, LEASE_MS))) {
    if (Date.now() >= deadline) return { processed: 0, failed: 0 };
    await pause(750);
  }
  let processed = 0;
  let failed = 0;
  try {
    for (let index = 0; index < MAX_EVENTS_PER_DRAIN; index += 1) {
      const event = await deps.store.claimNextEvent(waId, MAX_ATTEMPTS);
      if (!event) break;
      const message = asMessage(event.payload);
      if (!message) {
        await deps.store.failEvent(event.id, "payload missing or expired", true);
        continue;
      }
      try {
        await handleInbound(deps, message);
        await deps.store.completeEvent(event.id);
        processed += 1;
      } catch (error) {
        failed += 1;
        const dead = event.attempts >= MAX_ATTEMPTS;
        await deps.store.failEvent(event.id, safeError(error), dead);
        console.error("[onroad-ai] event failed", { attempt: event.attempts, dead, error: safeError(error) });
        if (dead) await apologize(deps, message);
        // Stop here: later messages from this driver depend on this one.
        break;
      }
    }
  } finally {
    await deps.store.releaseLease(waId, holder);
  }
  return { processed, failed };
}

async function apologize(deps: BotDeps, message: InboundMessage) {
  try {
    if (!isWithinServiceWindow(new Date(message.timestamp * 1000), deps.now())) return;
    const user = await deps.store.findUserByWaId(message.from);
    await deps.whatsapp.sendText(message.from, copyFor(user?.profile.locale ?? "en").error);
  } catch {
    // Already failing; nothing more to do.
  }
}

/** Retry anything left behind. Called opportunistically and by the daily cron. */
export async function sweepPending(deps: BotDeps, limit = 20): Promise<{ senders: number; processed: number; failed: number }> {
  const olderThan = new Date(deps.now().getTime() - 60_000);
  const senders = await deps.store.sendersWithPendingEvents(olderThan, MAX_ATTEMPTS, limit);
  let processed = 0;
  let failed = 0;
  for (const waId of senders) {
    const result = await drainSender(deps, waId);
    processed += result.processed;
    failed += result.failed;
  }
  return { senders: senders.length, processed, failed };
}
