import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { reportOperationalError, sendOperationalTestAlert } from "../operations";

const originalAlertUrl = process.env.OPERATIONS_ALERT_WEBHOOK_URL;
const originalResendKey = process.env.RESEND_API_KEY;
const originalAlertEmail = process.env.OPERATIONS_ALERT_EMAIL;
const originalFetch = globalThis.fetch;
const originalConsoleError = console.error;
const originalConsoleLog = console.log;

afterEach(() => {
  if (originalAlertUrl === undefined) delete process.env.OPERATIONS_ALERT_WEBHOOK_URL;
  else process.env.OPERATIONS_ALERT_WEBHOOK_URL = originalAlertUrl;
  if (originalResendKey === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = originalResendKey;
  if (originalAlertEmail === undefined) delete process.env.OPERATIONS_ALERT_EMAIL;
  else process.env.OPERATIONS_ALERT_EMAIL = originalAlertEmail;
  globalThis.fetch = originalFetch;
  console.error = originalConsoleError;
  console.log = originalConsoleLog;
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

  it("sends an intentional delivery test through the configured email channel", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.OPERATIONS_ALERT_EMAIL = "operator@example.test";
    delete process.env.OPERATIONS_ALERT_WEBHOOK_URL;
    console.log = () => undefined;
    let requestUrl = "";
    let body = "";
    globalThis.fetch = async (input, init) => {
      requestUrl = String(input);
      body = String(init?.body ?? "");
      return Response.json({ id: "email_test" });
    };

    const result = await sendOperationalTestAlert("admin@example.test");

    assert.deepEqual(result, { delivered: true });
    assert.equal(requestUrl, "https://api.resend.com/emails");
    const payload = JSON.parse(body) as { subject: string; text: string; to: string[] };
    assert.equal(payload.subject, "OnRoad Books: Operations alert delivery test");
    assert.deepEqual(payload.to, ["operator@example.test"]);
    assert.match(payload.text, /intentional production smoke test/i);
    assert.match(payload.text, /admin@example\.test/);
  });
});
