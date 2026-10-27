import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Meta signs every webhook POST with HMAC-SHA256 of the RAW body, keyed with
 * the app secret, in `X-Hub-Signature-256: sha256=<hex>`. The body must be
 * verified exactly as received -- re-serialising parsed JSON changes bytes
 * and breaks the signature, so the route reads `request.text()` first.
 */
export function verifyMetaSignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header || !appSecret) return false;
  const match = header.match(/^sha256=([0-9a-f]{64})$/i);
  if (!match) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest();
  const received = Buffer.from(match[1], "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function signForTest(rawBody: string, appSecret: string): string {
  return `sha256=${createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex")}`;
}

/** GET handshake: echo hub.challenge only when the verify token matches. */
export function verifySubscription(params: URLSearchParams, verifyToken: string): string | null {
  if (!verifyToken) return null;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token") ?? "";
  const challenge = params.get("hub.challenge");
  if (mode !== "subscribe" || !challenge) return null;
  const a = Buffer.from(token);
  const b = Buffer.from(verifyToken);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return challenge;
}
