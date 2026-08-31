import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { reportOperationalError } from "../operations";

const originalAlertUrl = process.env.OPERATIONS_ALERT_WEBHOOK_URL;
const originalFetch = globalThis.fetch;
const originalConsoleError = console.error;

afterEach(() => {
  if (originalAlertUrl === undefined) delete process.env.OPERATIONS_ALERT_WEBHOOK_URL;
  else process.env.OPERATIONS_ALERT_WEBHOOK_URL = originalAlertUrl;
  globalThis.fetch = originalFetch;
  console.error = originalConsoleError;
});

describe("operational alerts", () => {
  it("always logs but never needs a notification destination", async () => {
    delete process.env.OPERATIONS_ALERT_WEBHOOK_URL;
    const logs: string[] = [];
    console.error = (line) => logs.push(String(line));

    const result = await reportOperationalError("Webhook failed", new Error("database down"), {
      route: "/api/stripe/webhook",
    });

    assert.deepEqual(result, { delivered: false });
    assert.equal(logs.length, 1);
    assert.match(logs[0], /Webhook failed/);
    assert.match(logs[0], /database down/);
  });

  it("sends a compact Slack and Discord compatible payload when configured", async () => {
    process.env.OPERATIONS_ALERT_WEBHOOK_URL = "https://alerts.example.test/hook";
    console.error = () => undefined;
    let body = "";
    globalThis.fetch = async (_input, init) => {
      body = String(init?.body ?? "");
      return new Response(null, { status: 204 });
    };

    const result = await reportOperationalError("Webhook failed", new Error("database down"), {
      eventType: "customer.subscription.updated",
      eventId: "evt_test",
    });

    assert.deepEqual(result, { delivered: true });
    const payload = JSON.parse(body) as { text: string; content: string };
    assert.equal(payload.text, payload.content);
    assert.match(payload.text, /customer\.subscription\.updated/);
    assert.match(payload.text, /evt_test/);
  });
});
