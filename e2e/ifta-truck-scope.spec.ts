import { promises as fs } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

const dataDir = path.join(process.cwd(), ".e2e-data");

test("IFTA scope is decided and reported truck by truck", async ({ page }) => {
  await fs.rm(dataDir, { recursive: true, force: true });

  await page.goto("/setup");
  await page.getByLabel("Your name").fill("IFTA Test Owner");
  await page.getByLabel("Email").fill("ifta.e2e@example.com");
  await page.getByLabel("Password").fill("E2e-password-2026");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.getByLabel("Business name").fill("IFTA Scope Test LLC");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Keep Truck 1 for now" }).click();
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.getByRole("button", { name: /Open the dashboard/ }).click();

  await page.goto("/ifta?quarter=2026-Q3");
  await expect(page.getByRole("heading", { name: "IFTA filing scope" })).toBeVisible();
  await expect(page.getByText("Decision needed", { exact: true }).first()).toBeVisible();

  await page.goto("/truck");
  await page.getByRole("button", { name: "Update truck" }).click();
  await page.locator("#truck-axles").fill("2");
  await page.locator("#truck-registered-weight").fill("33000");
  await page.locator("#truck-ifta-jurisdictions").click();
  await page.getByRole("option", { name: "Two or more IFTA jurisdictions" }).click();
  await page.locator("#truck-ifta-reporting").click();
  await page.getByRole("option", { name: "Include this truck in IFTA filings" }).click();
  await page.getByRole("button", { name: "Save truck" }).click();
  await expect(page.getByText("Truck details saved")).toBeVisible();

  await page.goto("/ifta?quarter=2026-Q3");
  await expect(page.getByRole("heading", { name: "Trucks in this filing" })).toBeVisible();
  await expect(page.getByText("1 included", { exact: true })).toBeVisible();
  await expect(page.getByText("No IFTA mileage or fuel entries in this quarter.")).toBeVisible();

  await page.goto("/truck");
  await page.getByRole("button", { name: "Update truck" }).click();
  await page.locator("#truck-ifta-reporting").click();
  await page.getByRole("option", { name: "Do not include this truck" }).click();
  await page.getByRole("button", { name: "Save truck" }).click();
  await expect(page.getByText("Truck details saved")).toBeVisible();

  await page.goto("/ifta?quarter=2026-Q3");
  await expect(page.getByRole("heading", { name: "IFTA filing scope" })).toBeVisible();
  await expect(page.getByText("Excluded", { exact: true }).first()).toBeVisible();
});
