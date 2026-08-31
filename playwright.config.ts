import path from "node:path";
import { defineConfig } from "@playwright/test";

const baseURL = "http://127.0.0.1:4173";
const isolatedData = path.join(process.cwd(), ".e2e-data");

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 4173",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      DATA_SOURCE: "json",
      DOCUMENT_STORAGE: "local",
      ONROAD_DATA_DIR: isolatedData,
      AUTH_SECRET: "e2e-only-session-secret-longer-than-32-characters",
      NEXT_PUBLIC_APP_URL: baseURL,
      NEXT_PUBLIC_GOOGLE_CLIENT_ID: "",
      STRIPE_SECRET_KEY: "",
      STRIPE_WEBHOOK_SECRET: "",
      STRIPE_PRICE_SOLO_MONTHLY: "",
      STRIPE_PRICE_PRO_MONTHLY: "",
      STRIPE_PRICE_FLEET_MONTHLY: "",
      SUPABASE_URL: "http://127.0.0.1:1",
      SUPABASE_SECRET_KEY: "e2e-disabled",
    },
  },
});
