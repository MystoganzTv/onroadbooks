import assert from "node:assert/strict";
import path from "node:path";
import { defineConfig } from "@playwright/test";
const url = new URL(process.env.NEON_DATABASE_URL ?? "http://invalid");
assert.equal(
  process.env.ONROAD_DISPOSABLE_DATABASE,
  "1",
  "Use npm run test:browser:database",
);
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.pathname, "/onroadbooks_contract_drizzle");
const baseURL = "http://127.0.0.1:4174";
export default defineConfig({
  testDir: "./e2e",
  testMatch: "database-backend.spec.ts",
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  use: { baseURL, trace: "retain-on-failure", screenshot: "only-on-failure" },
  webServer: [
    ...(process.env.ONROAD_DISPOSABLE_STORAGE === "1"
      ? [
          {
            command: "node --import tsx scripts/s3-test-server.ts",
            url: "http://127.0.0.1:4575/ready",
            reuseExistingServer: false,
          },
        ]
      : []),
    {
      command: "npm run dev -- --hostname 127.0.0.1 --port 4174",
      url: baseURL,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...process.env,
        DATA_SOURCE: "neon",
        AUTH_PROVIDER: "authjs",
        AUTH_URL: baseURL,
        AUTH_GOOGLE_ID: "",
        AUTH_GOOGLE_SECRET: "",
        RESEND_API_KEY: "",
        DOCUMENT_STORAGE:
          process.env.ONROAD_DISPOSABLE_STORAGE === "1" ? "r2" : "local",
        R2_ACCOUNT_ID: "a".repeat(32),
        R2_ACCESS_KEY_ID: "fixture-access",
        R2_SECRET_ACCESS_KEY: "fixture-secret",
        R2_BUCKET_NAME: "documents",
        ONROAD_DATA_DIR: path.join(process.cwd(), ".e2e-data"),
        AUTH_SECRET: "database-e2e-only-secret-longer-than-32-characters",
        NEXT_PUBLIC_APP_URL: baseURL,
        STRIPE_SECRET_KEY: "sk_test_disposable_onroadbooks",
        STRIPE_WEBHOOK_SECRET: "whsec_disposable_onroadbooks",
        CRON_SECRET: "cron-disposable-onroadbooks",
        ANTHROPIC_API_KEY: "",
      },
    },
  ],
});
