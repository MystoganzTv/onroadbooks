/**
 * WEBHOOK PAYLOAD -> normalized events
 * ====================================
 *
 * Meta batches: one POST may carry several entries, changes, messages and
 * delivery statuses, for any of our phone numbers. This turns that into two
 * flat lists and drops everything we do not handle. Parsing is lenient
 * (unknown fields pass), but every field we READ is type-checked.
 *
 * Media is referenced by id only. The bytes are fetched later, inside the
 * processing step, and never stored.
 */

import { z } from "zod";

export type InboundKind = "text" | "image" | "document" | "audio" | "interactive" | "button" | "unsupported";

export interface InboundMessage {
  /** wamid -- globally unique, our idempotency key. */
  id: string;
  /** Sender's WhatsApp id (phone number without +). */
  from: string;
  /** The business number it was sent to. */
  phoneNumberId: string;
  profileName: string | null;
  /** Unix seconds as Meta reports it. */
  timestamp: number;
  kind: InboundKind;
  text: string | null;
  media: { id: string; mimeType: string; filename: string | null; voice: boolean } | null;
  /** Button / list reply id we set when sending. */
  replyId: string | null;
  /** Meta's original message type, for "unsupported" logging. */
  rawType: string;
}

export interface StatusUpdate {
  messageId: string;
  recipient: string;
  status: "sent" | "delivered" | "read" | "failed" | string;
  timestamp: number;
  errorCode: number | null;
  errorTitle: string | null;
  /** Pricing category Meta reports, e.g. "service". */
  pricingCategory: string | null;
  billable: boolean | null;
}

const media = z.object({ id: z.string(), mime_type: z.string().default("application/octet-stream"), caption: z.string().optional(), filename: z.string().optional(), voice: z.boolean().optional() }).passthrough();

const message = z
  .object({
    id: z.string().min(1),
    from: z.string().min(1),
    timestamp: z.union([z.string(), z.number()]).transform(Number),
    type: z.string(),
    text: z.object({ body: z.string() }).passthrough().optional(),
    image: media.optional(),
    document: media.optional(),
    audio: media.optional(),
    interactive: z
      .object({
        type: z.string(),
        button_reply: z.object({ id: z.string(), title: z.string() }).optional(),
        list_reply: z.object({ id: z.string(), title: z.string() }).optional(),
      })
      .passthrough()
      .optional(),
    button: z.object({ payload: z.string().optional(), text: z.string().optional() }).passthrough().optional(),
  })
  .passthrough();

const status = z
  .object({
    id: z.string(),
    recipient_id: z.string().default(""),
    status: z.string(),
    timestamp: z.union([z.string(), z.number()]).transform(Number),
    errors: z.array(z.object({ code: z.number().optional(), title: z.string().optional() }).passthrough()).optional(),
    pricing: z.object({ category: z.string().optional(), billable: z.boolean().optional() }).passthrough().optional(),
  })
  .passthrough();

const webhook = z
  .object({
    object: z.string(),
    entry: z
      .array(
        z
          .object({
            changes: z
              .array(
                z
                  .object({
                    field: z.string().optional(),
                    value: z
                      .object({
                        messaging_product: z.string().optional(),
                        metadata: z.object({ phone_number_id: z.string() }).passthrough().optional(),
                        contacts: z.array(z.object({ wa_id: z.string(), profile: z.object({ name: z.string().optional() }).passthrough().optional() }).passthrough()).optional(),
                        messages: z.array(z.unknown()).optional(),
                        statuses: z.array(z.unknown()).optional(),
                      })
                      .passthrough(),
                  })
                  .passthrough(),
              )
              .default([]),
          })
          .passthrough(),
      )
      .default([]),
  })
  .passthrough();

function normalizeMessage(raw: z.infer<typeof message>, phoneNumberId: string, names: Map<string, string>): InboundMessage {
  const base = {
    id: raw.id,
    from: raw.from,
    phoneNumberId,
    profileName: names.get(raw.from) ?? null,
    timestamp: Number.isFinite(raw.timestamp) ? raw.timestamp : Math.floor(Date.now() / 1000),
    rawType: raw.type,
    text: null as string | null,
    media: null as InboundMessage["media"],
    replyId: null as string | null,
  };
  switch (raw.type) {
    case "text":
      return { ...base, kind: "text", text: raw.text?.body ?? "" };
    case "image":
      return raw.image
        ? { ...base, kind: "image", text: raw.image.caption ?? null, media: { id: raw.image.id, mimeType: raw.image.mime_type, filename: null, voice: false } }
        : { ...base, kind: "unsupported" };
    case "document":
      return raw.document
        ? {
            ...base,
            kind: "document",
            text: raw.document.caption ?? null,
            media: { id: raw.document.id, mimeType: raw.document.mime_type, filename: raw.document.filename ?? null, voice: false },
          }
        : { ...base, kind: "unsupported" };
    case "audio":
      return raw.audio
        ? { ...base, kind: "audio", media: { id: raw.audio.id, mimeType: raw.audio.mime_type, filename: null, voice: raw.audio.voice ?? true } }
        : { ...base, kind: "unsupported" };
    case "interactive": {
      const reply = raw.interactive?.button_reply ?? raw.interactive?.list_reply;
      return reply ? { ...base, kind: "interactive", text: reply.title, replyId: reply.id } : { ...base, kind: "unsupported" };
    }
    case "button":
      return { ...base, kind: "button", text: raw.button?.text ?? null, replyId: raw.button?.payload ?? null };
    default:
      return { ...base, kind: "unsupported" };
  }
}

export function parseWebhook(body: unknown): { messages: InboundMessage[]; statuses: StatusUpdate[] } | null {
  const parsed = webhook.safeParse(body);
  if (!parsed.success || parsed.data.object !== "whatsapp_business_account") return null;
  const messages: InboundMessage[] = [];
  const statuses: StatusUpdate[] = [];
  for (const entry of parsed.data.entry) {
    for (const change of entry.changes) {
      const value = change.value;
      const phoneNumberId = value.metadata?.phone_number_id ?? "";
      const names = new Map((value.contacts ?? []).map((contact) => [contact.wa_id, contact.profile?.name ?? ""]));
      for (const rawMessage of value.messages ?? []) {
        const one = message.safeParse(rawMessage);
        if (one.success) messages.push(normalizeMessage(one.data, phoneNumberId, names));
      }
      for (const rawStatus of value.statuses ?? []) {
        const one = status.safeParse(rawStatus);
        if (!one.success) continue;
        const error = one.data.errors?.[0];
        statuses.push({
          messageId: one.data.id,
          recipient: one.data.recipient_id,
          status: one.data.status,
          timestamp: one.data.timestamp,
          errorCode: error?.code ?? null,
          errorTitle: error?.title ?? null,
          pricingCategory: one.data.pricing?.category ?? null,
          billable: one.data.pricing?.billable ?? null,
        });
      }
    }
  }
  return { messages, statuses };
}
