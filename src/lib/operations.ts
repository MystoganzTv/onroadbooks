import "server-only";

type LogLevel = "info" | "warning" | "error";
type LogContext = Record<string, string | number | boolean | null | undefined>;

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
 * Logs every operational failure and, when configured, sends a compact alert
 * to a Slack/Discord-compatible webhook. Alert delivery is best effort: a
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

  const url = process.env.OPERATIONS_ALERT_WEBHOOK_URL?.trim();
  if (!url) return { delivered: false };

  const summary = [
    `OnRoad Books: ${message}`,
    context.route ? `Route: ${context.route}` : null,
    context.eventType ? `Event: ${context.eventType}` : null,
    context.eventId ? `ID: ${context.eventId}` : null,
    `Error: ${detail}`,
  ].filter(Boolean).join("\n");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3_000);
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
        originalMessage: message,
      });
      return { delivered: false };
    }
    return { delivered: true };
  } catch (alertError) {
    operationalLog("error", "Operations alert delivery failed", {
      alertError: errorMessage(alertError),
      originalMessage: message,
    });
    return { delivered: false };
  } finally {
    clearTimeout(timeout);
  }
}
