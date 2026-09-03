import "server-only";

type LogLevel = "info" | "warning" | "error";
type LogContext = Record<string, string | number | boolean | null | undefined>;

const ALERT_DELIVERY_TIMEOUT_MS = 10_000;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function operationalLog(level: LogLevel, message: string, context: LogContext = {}): void {
  const entry = JSON.stringify({
    level,
    message,
    service: "onroadbooks",
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
    deployment: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12),
    timestamp: new Date().toISOString(),
    ...context,
  });

  if (level === "error") console.error(entry);
  else if (level === "warning") console.warn(entry);
  else console.log(entry);
}

/**
 * Sends the alert by email through Resend — the account that already sends
 * this app's auth mail, with `onroadbooks.com` already verified on it. No new
 * vendor, no chat app to adopt, and it lands in the inbox he actually reads.
 *
 * Returns "unconfigured" when there is nothing set up, so the caller can fall
 * back to the webhook rather than treating silence as a delivery.
 */
async function sendAlertEmail(
  subject: string,
  body: string,
): Promise<"sent" | "failed" | "unconfigured"> {
  const key = process.env.RESEND_API_KEY?.trim();
  const to = process.env.OPERATIONS_ALERT_EMAIL?.trim();
  if (!key || !to) return "unconfigured";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ALERT_DELIVERY_TIMEOUT_MS);
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.OPERATIONS_ALERT_FROM?.trim() || "OnRoad Books <no-reply@onroadbooks.com>",
        to: to.split(",").map((address) => address.trim()).filter(Boolean),
        subject: `OnRoad Books: ${subject}`,
        text: body,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      operationalLog("error", "Operations alert email failed", {
        alertStatus: response.status,
        originalMessage: subject,
      });
      return "failed";
    }
    return "sent";
  } catch (error) {
    operationalLog("error", "Operations alert email failed", {
      alertError: errorMessage(error),
      originalMessage: subject,
    });
    return "failed";
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Logs every operational failure and, when configured, sends a compact alert —
 * by email through Resend, or to a Slack/Discord-compatible webhook. Alert delivery is best effort: a
 * broken notification channel must never replace the original application
 * error or make Stripe retry for a second reason.
 */
export async function reportOperationalError(
  message: string,
  error: unknown,
  context: LogContext = {},
): Promise<{ delivered: boolean }> {
  const detail = errorMessage(error);
  operationalLog("error", message, { ...context, error: detail });

  const summary = [
    `OnRoad Books: ${message}`,
    context.route ? `Route: ${context.route}` : null,
    context.eventType ? `Event: ${context.eventType}` : null,
    context.eventId ? `ID: ${context.eventId}` : null,
    `Error: ${detail}`,
  ].filter(Boolean).join("\n");

  // Email first: it is where he already is. The webhook stays supported for
  // anyone who wants a chat channel, but nobody should have to adopt Discord
  // to find out their app broke.
  return deliverOperationalAlert(message, summary);
}

async function deliverOperationalAlert(
  subject: string,
  summary: string,
): Promise<{ delivered: boolean }> {
  const email = await sendAlertEmail(subject, summary);
  if (email !== "unconfigured") return { delivered: email === "sent" };

  const url = process.env.OPERATIONS_ALERT_WEBHOOK_URL?.trim();
  if (!url) return { delivered: false };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ALERT_DELIVERY_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: summary, content: summary }),
      signal: controller.signal,
    });
    if (!response.ok) {
      operationalLog("error", "Operations alert delivery failed", {
        alertStatus: response.status,
        originalMessage: subject,
      });
      return { delivered: false };
    }
    return { delivered: true };
  } catch (alertError) {
    operationalLog("error", "Operations alert delivery failed", {
      alertError: errorMessage(alertError),
      originalMessage: subject,
    });
    return { delivered: false };
  } finally {
    clearTimeout(timeout);
  }
}

/** Platform-admin smoke check for the real notification channel. */
export async function sendOperationalTestAlert(
  requestedBy: string,
): Promise<{ delivered: boolean }> {
  const subject = "Operations alert delivery test";
  const summary = [
    `OnRoad Books: ${subject}`,
    "This is an intentional production smoke test. No customer request failed.",
    `Requested by: ${requestedBy}`,
    `Time: ${new Date().toISOString()}`,
  ].join("\n");
  const result = await deliverOperationalAlert(subject, summary);
  operationalLog(result.delivered ? "info" : "error", subject, {
    route: "/admin",
    delivered: result.delivered,
  });
  return result;
}

/* ---- Unhandled request failures --------------------------------------- */

/**
 * Alerting on every occurrence is how a pager gets muted.
 *
 * A route that starts failing fails on every request, so the first job of an
 * alert channel is to say "this is broken" once and then stay quiet while it
 * stays broken -- with a count, which is the part that says how bad it is.
 *
 * State is per server instance and serverless instances come and go, so this
 * de-duplicates within one instance rather than globally. That still removes
 * the case that matters (one instance failing in a loop) and it is the honest
 * limit of doing this without a shared store.
 */
const ALERT_WINDOW_MS = 10 * 60 * 1000;
const MAX_TRACKED_FAILURES = 200;

interface FailureRecord {
  count: number;
  firstSeen: number;
  lastAlerted: number;
}

const failures = new Map<string, FailureRecord>();

/**
 * Groups the same failure together across requests: ids, uuids and bare
 * numbers vary per request and would otherwise make every occurrence look
 * like a brand new problem.
 */
export function failureFingerprint(route: string, message: string): string {
  const normalized = message
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<id>")
    .replace(/\b[0-9a-z]{16,}\b/gi, "<id>")
    .replace(/\d+/g, "<n>")
    .trim()
    .slice(0, 200);
  return `${route}|${normalized}`;
}

export interface AlertDecision {
  /** Send an alert for this occurrence. */
  alert: boolean;
  /** How many times this failure has happened since the last alert, this one included. */
  occurrences: number;
}

export function shouldAlert(fingerprint: string, now = Date.now()): AlertDecision {
  const record = failures.get(fingerprint);

  if (!record) {
    if (failures.size >= MAX_TRACKED_FAILURES) {
      // Evict the oldest rather than growing without limit: a failure that
      // sprays unique messages must not become a memory leak on top of
      // whatever else it is doing.
      const oldest = [...failures.entries()].sort((a, b) => a[1].firstSeen - b[1].firstSeen)[0];
      if (oldest) failures.delete(oldest[0]);
    }
    failures.set(fingerprint, { count: 1, firstSeen: now, lastAlerted: now });
    return { alert: true, occurrences: 1 };
  }

  record.count += 1;
  if (now - record.lastAlerted >= ALERT_WINDOW_MS) {
    const occurrences = record.count;
    record.count = 0;
    record.lastAlerted = now;
    return { alert: true, occurrences };
  }
  return { alert: false, occurrences: record.count };
}

/** Test seam. Never called by the application. */
export function resetFailureTracking(): void {
  failures.clear();
}

/**
 * Next's redirect() and notFound() travel as thrown errors. They are control
 * flow, not failures, and paging someone because a signed-out visitor was sent
 * to /login is exactly how an alert channel loses its meaning.
 */
export function isControlFlowError(error: unknown): boolean {
  const digest = (error as { digest?: unknown })?.digest;
  if (typeof digest !== "string") return false;
  return digest.startsWith("NEXT_REDIRECT") || digest === "NEXT_NOT_FOUND" || digest === "NEXT_HTTP_ERROR_FALLBACK;404";
}

export interface RequestFailure {
  /** The route pattern, never the concrete URL: a path can carry ids. */
  route: string;
  method?: string;
  routerKind?: string;
  routeType?: string;
}

/**
 * Every unhandled server error in the app, from one place. Wired up in
 * `src/instrumentation.ts` through Next's `onRequestError` hook, which sees
 * page renders, route handlers and server actions alike.
 */
export async function reportRequestError(
  error: unknown,
  failure: RequestFailure,
  now = Date.now(),
): Promise<{ reported: boolean; alerted: boolean }> {
  if (isControlFlowError(error)) return { reported: false, alerted: false };

  const message = errorMessage(error);
  const decision = shouldAlert(failureFingerprint(failure.route, message), now);

  if (!decision.alert) {
    // Still logged, so the count in Vercel's logs stays truthful even while
    // the alert channel is deliberately quiet.
    operationalLog("error", "Unhandled request failure (alert suppressed)", {
      ...failure,
      error: message,
      occurrences: decision.occurrences,
    });
    return { reported: true, alerted: false };
  }

  const headline =
    decision.occurrences > 1
      ? `Unhandled failure on ${failure.route} (${decision.occurrences} times since the last alert)`
      : `Unhandled failure on ${failure.route}`;

  const { delivered } = await reportOperationalError(headline, error, {
    ...failure,
    occurrences: decision.occurrences,
  });
  return { reported: true, alerted: delivered };
}
