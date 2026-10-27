import "server-only";

/**
 * IN-APP WEB CHAT
 * ===============
 *
 * The same OnRoad AI bot -- router, onboarding, calculator, history,
 * alerts -- reached from a chat bubble inside OnRoad Books instead of from
 * WhatsApp. The only thing swapped is the channel: `CaptureClient` collects
 * the replies the router would have sent to Meta and hands them back to the
 * browser in the HTTP response.
 *
 * Who sees it: platform admins, and only while ONROAD_AI_WEBCHAT=true. It is
 * a testing window into the bot, not yet a product surface.
 *
 * Identity: the signed-in OnRoad Books user, as `web-<userId>`. A web-chat
 * profile is its own AssistantUser, separate from any WhatsApp number and
 * from the OnRoad Books ledger.
 *
 * Cost: replies cost nothing to deliver here, so they are counted at $0;
 * AI reads of screenshots and PDFs are still counted at their real price.
 */

import { randomUUID } from "node:crypto";

import { isPlatformAdminEmail, platformAdminEmails } from "@/lib/platform-admin";

import { buildDeps } from "./config";
import { handleInbound } from "./router";
import type { Button, MediaResult, SendResult, WhatsAppClient } from "./whatsapp/client";
import type { InboundMessage } from "./whatsapp/payload";

export const WEBCHAT_MAX_FILE_BYTES = 4 * 1024 * 1024;
export const WEBCHAT_FILE_TYPES = ["image/png", "image/jpeg", "image/webp", "application/pdf"];

export interface WebChatReply {
  text: string;
  buttons: Button[];
}

export function webChatEnabledFor(email: string | null | undefined, env: Record<string, string | undefined> = process.env): boolean {
  if (env.ONROAD_AI_WEBCHAT !== "true" || !email) return false;
  return isPlatformAdminEmail(email, platformAdminEmails(env.PLATFORM_ADMIN_EMAILS));
}

export function webChatId(userId: string): string {
  return `web-${userId}`;
}

/** A WhatsApp client that delivers into an array. */
export class CaptureClient implements WhatsAppClient {
  readonly replies: WebChatReply[] = [];
  private readonly media = new Map<string, { bytes: Buffer; mimeType: string }>();
  private n = 0;

  attach(bytes: Buffer, mimeType: string): string {
    const id = `webmedia.${randomUUID()}`;
    this.media.set(id, { bytes, mimeType });
    return id;
  }

  private ok(): SendResult {
    return { ok: true, messageId: `web.out.${randomUUID()}.${++this.n}` };
  }

  async sendText(_to: string, body: string): Promise<SendResult> {
    this.replies.push({ text: body, buttons: [] });
    return this.ok();
  }

  async sendButtons(_to: string, body: string, buttons: Button[]): Promise<SendResult> {
    this.replies.push({ text: body, buttons });
    return this.ok();
  }

  async sendTemplate(): Promise<SendResult> {
    // Templates exist for WhatsApp's 24-hour rule; the web chat has none.
    return this.ok();
  }

  async markRead(): Promise<void> {}

  async downloadMedia(mediaId: string, maxBytes: number): Promise<MediaResult> {
    const file = this.media.get(mediaId);
    if (!file) return { ok: false, reason: "NOT_FOUND" };
    if (file.bytes.byteLength > maxBytes) return { ok: false, reason: "TOO_LARGE" };
    return { ok: true, bytes: file.bytes, mimeType: file.mimeType };
  }
}

export interface WebChatInput {
  userId: string;
  displayName: string | null;
  text: string | null;
  replyId: string | null;
  file: { bytes: Buffer; mimeType: string; name: string | null } | null;
}

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function runWebChat(input: WebChatInput): Promise<WebChatReply[]> {
  const capture = new CaptureClient();
  const base = buildDeps(capture);
  // No country gate or new-number cap: the person is already a signed-in admin.
  const deps = { ...base, access: undefined, limits: { ...base.limits, whatsappCostPerMessageUsd: 0 } };
  const waId = webChatId(input.userId);

  const now = Math.floor(Date.now() / 1000);
  let message: InboundMessage = {
    id: `web.in.${randomUUID()}`,
    from: waId,
    phoneNumberId: "webchat",
    profileName: input.displayName,
    timestamp: now,
    kind: "text",
    text: input.text,
    media: null,
    replyId: input.replyId,
    rawType: "text",
  };
  if (input.replyId) message = { ...message, kind: "interactive", rawType: "interactive" };
  if (input.file) {
    const id = capture.attach(input.file.bytes, input.file.mimeType);
    const isPdf = input.file.mimeType === "application/pdf";
    message = {
      ...message,
      kind: isPdf ? "document" : "image",
      rawType: isPdf ? "document" : "image",
      media: { id, mimeType: input.file.mimeType, filename: input.file.name, voice: false },
    };
  }

  // One message at a time per person, same lease the WhatsApp worker uses.
  const holder = randomUUID();
  const deadline = Date.now() + 8_000;
  while (!(await deps.store.acquireLease(waId, holder, 60_000))) {
    if (Date.now() > deadline) throw new Error("The assistant is still answering your previous message.");
    await pause(400);
  }
  try {
    await handleInbound(deps, message);
  } finally {
    await deps.store.releaseLease(waId, holder);
  }
  return capture.replies;
}
