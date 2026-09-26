import "server-only";

import {
  isEmptyExtraction,
  isScannableType,
  MAX_SCAN_BYTES,
  missingRequiredFields,
  normalizeExtraction,
  rateConExtractionSchema,
  RATE_CON_TOOL_NAME,
  RATE_CON_TOOL_SCHEMA,
  type RateConReading,
} from "./schema";

/**
 * READING A RATE CONFIRMATION
 * ===========================
 *
 * One request, one document, one forced tool call. The model never sees the
 * ledger, never gets told what a "good" rate looks like, and cannot write
 * anything: it reads a PDF the owner just handed it and returns the fields
 * that are printed on it. Everything after that is deterministic
 * (`./schema.ts`), and the owner confirms it in the ordinary load form.
 *
 * Deliberately NOT here:
 *   - storage. The file reaches this module as bytes and is gone when the
 *     request ends. It is filed as a document only if the load gets saved.
 *   - retries. A failed read costs the owner ten seconds and one click; a
 *     silent retry costs them a second charge and the same wrong answer.
 *
 * The feature turns itself off when ANTHROPIC_API_KEY is unset, so a fork,
 * a preview deploy or a local checkout runs the whole app without a key --
 * the button simply is not offered.
 */

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";

/** Fast, cheap, and reads scanned freight paperwork well. Override per deploy. */
const DEFAULT_MODEL = "claude-sonnet-5";

/** A rate con is one to four pages; anything past this is not one. */
const MAX_TOKENS = 1024;

const TIMEOUT_MS = 55_000;

const PDF_TYPE = "application/pdf";

const PROMPT = `You are reading a freight rate confirmation for the CARRIER who hauled the load.

Fill in the record_rate_confirmation tool from what is printed on this document.

Rules:
- Copy what the document says. Never infer, estimate or complete a value from general knowledge.
- If a field is not on the document, return null for it. A null is a correct answer.
- grossRate is the TOTAL the carrier is paid: line haul plus fuel surcharge plus every listed accessorial. If the document shows a single total rate, use that. Never return the line haul alone when a total is printed, and never add up amounts that are already included in a stated total.
- loadedMiles only when the document prints a mileage. Do not compute the distance between the two cities.
- Use the FIRST pickup and the LAST delivery when the load has multiple stops.
- broker is the party paying the carrier, not the carrier and not a factoring company.
- brokerContact is the person at that broker who booked the load (the carrier sales rep or agent), name only.
- Dates as YYYY-MM-DD. If a date has no year on the document, return null rather than guessing one.`;

export type RateConScan =
  | { ok: true; reading: RateConReading }
  | { ok: false; error: string };

/**
 * Whether this deployment can scan at all.
 *
 * Called by the page, so the button is never rendered against a key that is
 * not there. The route checks it again -- a hidden button is presentation,
 * not a rule.
 */
export function isRateConScanConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function documentBlock(contentType: string, data: string) {
  return contentType === PDF_TYPE
    ? { type: "document", source: { type: "base64", media_type: PDF_TYPE, data } }
    : { type: "image", source: { type: "base64", media_type: contentType, data } };
}

export async function extractRateCon(
  bytes: Buffer,
  contentType: string,
): Promise<RateConScan> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, error: "Rate confirmation scanning is not set up on this deployment." };
  if (!isScannableType(contentType)) {
    return { ok: false, error: "Scanning works on a PDF or a photo (PNG, JPEG or WebP)." };
  }
  if (bytes.byteLength > MAX_SCAN_BYTES) {
    return { ok: false, error: "That file is too large to scan. Try a smaller PDF or photo." };
  }

  let payload: unknown;
  try {
    const reply = await fetch(API_URL, {
      method: "POST",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": API_VERSION,
      },
      body: JSON.stringify({
        model: process.env.RATE_CON_MODEL || DEFAULT_MODEL,
        max_tokens: MAX_TOKENS,
        temperature: 0,
        tools: [
          {
            name: RATE_CON_TOOL_NAME,
            description: "Record the fields printed on a freight rate confirmation.",
            input_schema: RATE_CON_TOOL_SCHEMA,
          },
        ],
        // Forced: the reply is the record or it is nothing. There is no
        // conversation to have with a PDF.
        tool_choice: { type: "tool", name: RATE_CON_TOOL_NAME },
        messages: [
          {
            role: "user",
            content: [
              documentBlock(contentType, bytes.toString("base64")),
              { type: "text", text: PROMPT },
            ],
          },
        ],
      }),
    });

    if (!reply.ok) {
      // The provider's message may quote the document. It stays in our logs.
      console.error("rate-con extract failed", reply.status, await reply.text().catch(() => ""));
      return { ok: false, error: "The rate confirmation could not be read right now. Try again in a moment." };
    }
    payload = await reply.json();
  } catch (error) {
    console.error("rate-con extract errored", error);
    return { ok: false, error: "The rate confirmation could not be read right now. Try again in a moment." };
  }

  const input = toolInput(payload);
  if (!input) {
    return { ok: false, error: "We could not find a rate confirmation in that file. Check the file and try again." };
  }

  const parsed = rateConExtractionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "We could not find a rate confirmation in that file. Check the file and try again." };
  }

  const fields = normalizeExtraction(parsed.data);
  if (isEmptyExtraction(fields)) {
    return { ok: false, error: "We could not find a rate confirmation in that file. Check the file and try again." };
  }

  return { ok: true, reading: { fields, missing: missingRequiredFields(fields) } };
}

function toolInput(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") return null;
  const content = (payload as { content?: unknown }).content;
  if (!Array.isArray(content)) return null;
  for (const block of content) {
    if (
      block
      && typeof block === "object"
      && (block as { type?: unknown }).type === "tool_use"
      && (block as { name?: unknown }).name === RATE_CON_TOOL_NAME
    ) {
      return (block as { input?: unknown }).input ?? null;
    }
  }
  return null;
}
