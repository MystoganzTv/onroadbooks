/**
 * WHATSAPP CLOUD API CLIENT
 * =========================
 *
 * The only module that talks to graph.facebook.com. The router depends on
 * the `WhatsAppClient` interface, so tests and the local simulator swap in
 * a recorder and nothing else changes.
 *
 * Retries: transient failures only (HTTP 429/5xx, network, Meta throughput
 * code 130429), at most 3 attempts with exponential backoff, honouring
 * Retry-After. A permanent error (bad token, recipient outside the 24-hour
 * window, invalid number) is returned at once -- retrying it only burns
 * quota and can get a number flagged.
 *
 * The access token is a header value and never appears in a log line or an
 * error message this module produces.
 */

export interface Button {
  id: string;
  /** WhatsApp limit: 20 characters. */
  title: string;
}

export type SendResult =
  | { ok: true; messageId: string }
  | {
      ok: false;
      code: number | null;
      title: string;
      retryable: boolean;
      /** 131047: more than 24 hours since the user last wrote -- a template is required. */
      windowClosed: boolean;
    };

export type MediaResult =
  | { ok: true; bytes: Buffer; mimeType: string }
  | { ok: false; reason: "TOO_LARGE" | "NOT_FOUND" | "ERROR" };

export interface WhatsAppClient {
  sendText(to: string, body: string): Promise<SendResult>;
  sendButtons(to: string, body: string, buttons: Button[]): Promise<SendResult>;
  /**
   * An APPROVED message template -- the only thing WhatsApp delivers outside
   * the 24-hour window. Body parameters fill {{1}}, {{2}}... in order.
   */
  sendTemplate(to: string, name: string, languageCode: string, bodyParams: string[]): Promise<SendResult>;
  markRead(messageId: string): Promise<void>;
  downloadMedia(mediaId: string, maxBytes: number): Promise<MediaResult>;
}

export interface CloudApiConfig {
  accessToken: string;
  phoneNumberId: string;
  graphVersion: string;
  fetchImpl?: typeof fetch;
  /** Injected so tests do not wait on real backoff. */
  sleep?: (ms: number) => Promise<void>;
}

const PERMANENT_CODES = new Set([100, 190, 131008, 131009, 131021, 131026, 131047, 131051, 132000, 132001, 133010]);
const TRANSIENT_CODES = new Set([1, 2, 4, 80007, 130429, 131000, 131016, 131056]);
const MAX_ATTEMPTS = 3;

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class CloudApiClient implements WhatsAppClient {
  private readonly base: string;
  constructor(private readonly config: CloudApiConfig) {
    this.base = `https://graph.facebook.com/${config.graphVersion}`;
  }

  private get fetch() {
    return this.config.fetchImpl ?? fetch;
  }

  private headers(json = true): HeadersInit {
    return json
      ? { authorization: `Bearer ${this.config.accessToken}`, "content-type": "application/json" }
      : { authorization: `Bearer ${this.config.accessToken}` };
  }

  private async post(payload: Record<string, unknown>): Promise<SendResult> {
    const sleep = this.config.sleep ?? defaultSleep;
    let last: SendResult = { ok: false, code: null, title: "not sent", retryable: true, windowClosed: false };
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      let retryAfterMs = 0;
      try {
        const reply = await this.fetch(`${this.base}/${this.config.phoneNumberId}/messages`, {
          method: "POST",
          headers: this.headers(),
          body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", ...payload }),
          signal: AbortSignal.timeout(15_000),
        });
        const body = (await reply.json().catch(() => ({}))) as {
          messages?: { id?: string }[];
          error?: { code?: number; error_subcode?: number; message?: string; error_data?: { details?: string } };
        };
        if (reply.ok && body.messages?.[0]?.id) return { ok: true, messageId: body.messages[0].id };
        const code = body.error?.code ?? null;
        const transient = reply.status === 429 || reply.status >= 500 || (code !== null && TRANSIENT_CODES.has(code));
        const permanent = code !== null && PERMANENT_CODES.has(code);
        last = {
          ok: false,
          code,
          title: (body.error?.message ?? `HTTP ${reply.status}`).slice(0, 200),
          retryable: transient && !permanent,
          windowClosed: code === 131047,
        };
        const header = Number(reply.headers.get("retry-after"));
        if (Number.isFinite(header) && header > 0) retryAfterMs = Math.min(header * 1000, 5_000);
        if (!last.retryable) return last;
      } catch (error) {
        last = { ok: false, code: null, title: error instanceof Error ? error.name : "network error", retryable: true, windowClosed: false };
      }
      if (attempt < MAX_ATTEMPTS) await sleep(retryAfterMs || 400 * 2 ** (attempt - 1));
    }
    return last;
  }

  sendText(to: string, body: string): Promise<SendResult> {
    return this.post({ to, type: "text", text: { preview_url: false, body } });
  }

  sendTemplate(to: string, name: string, languageCode: string, bodyParams: string[]): Promise<SendResult> {
    return this.post({
      to,
      type: "template",
      template: {
        name,
        language: { code: languageCode },
        components: bodyParams.length
          ? [{ type: "body", parameters: bodyParams.map((text) => ({ type: "text", text: text.slice(0, 1_000) })) }]
          : [],
      },
    });
  }

  sendButtons(to: string, body: string, buttons: Button[]): Promise<SendResult> {
    return this.post({
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: body },
        action: {
          buttons: buttons.slice(0, 3).map((button) => ({ type: "reply", reply: { id: button.id.slice(0, 256), title: button.title.slice(0, 20) } })),
        },
      },
    });
  }

  async markRead(messageId: string): Promise<void> {
    try {
      await this.fetch(`${this.base}/${this.config.phoneNumberId}/messages`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ messaging_product: "whatsapp", status: "read", message_id: messageId }),
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      // A missing blue tick is not worth failing a reply over.
    }
  }

  /**
   * Two steps: GET /{media-id} for a short-lived URL, then GET that URL with
   * the same bearer token. Size is checked on the declared length AND while
   * reading, because the header can lie.
   */
  async downloadMedia(mediaId: string, maxBytes: number): Promise<MediaResult> {
    try {
      const meta = await this.fetch(`${this.base}/${encodeURIComponent(mediaId)}`, {
        headers: this.headers(false),
        signal: AbortSignal.timeout(10_000),
      });
      if (!meta.ok) return { ok: false, reason: meta.status === 404 ? "NOT_FOUND" : "ERROR" };
      const info = (await meta.json()) as { url?: string; mime_type?: string; file_size?: number };
      if (!info.url) return { ok: false, reason: "NOT_FOUND" };
      if (typeof info.file_size === "number" && info.file_size > maxBytes) return { ok: false, reason: "TOO_LARGE" };
      const file = await this.fetch(info.url, { headers: this.headers(false), signal: AbortSignal.timeout(20_000) });
      if (!file.ok || !file.body) return { ok: false, reason: "ERROR" };
      const chunks: Uint8Array[] = [];
      let size = 0;
      const reader = file.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) {
          await reader.cancel();
          return { ok: false, reason: "TOO_LARGE" };
        }
        chunks.push(value);
      }
      return { ok: true, bytes: Buffer.concat(chunks), mimeType: (info.mime_type ?? file.headers.get("content-type") ?? "").split(";")[0] };
    } catch {
      return { ok: false, reason: "ERROR" };
    }
  }
}

/** 24-hour customer service window: free-form messages only inside it. */
export const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

export function isWithinServiceWindow(lastInboundAt: Date | null, now: Date = new Date()): boolean {
  if (!lastInboundAt) return false;
  return now.getTime() - lastInboundAt.getTime() < SERVICE_WINDOW_MS;
}
