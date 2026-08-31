import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { buildHealthReport } from "../operational-health";

const originalEnvironment = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnvironment)) delete process.env[key];
  }
  Object.assign(process.env, originalEnvironment);
});

function configureIntegrations() {
  process.env.STRIPE_SECRET_KEY = "sk_test_health";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_health";
  process.env.STRIPE_PRICE_SOLO_MONTHLY = "price_solo";
  process.env.STRIPE_PRICE_PRO_MONTHLY = "price_pro";
  process.env.STRIPE_PRICE_FLEET_MONTHLY = "price_fleet";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_health";
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = "google-health.apps.example.com";
}

describe("operational health", () => {
  it("allows local JSON and disk storage while dependencies are configured", async () => {
    delete process.env.VERCEL_ENV;
    process.env.DATA_SOURCE = "json";
    process.env.DOCUMENT_STORAGE = "local";
    configureIntegrations();

    const report = await buildHealthReport();

    assert.equal(report.status, "ok");
    assert.equal(report.checks.database.status, "ok");
    assert.equal(report.checks.storage.status, "ok");
  });

  it("fails readiness when production falls back to local persistence", async () => {
    process.env.VERCEL_ENV = "production";
    process.env.DATA_SOURCE = "json";
    process.env.DOCUMENT_STORAGE = "local";
    configureIntegrations();

    const report = await buildHealthReport();

    assert.equal(report.status, "degraded");
    assert.equal(report.checks.database.status, "error");
    assert.equal(report.checks.storage.status, "error");
  });
});
