import { promises as fs } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

/**
 * Scanning a rate confirmation, end to end, with the model's answer stubbed.
 *
 * What the model reads is its own problem and cannot be asserted in CI. What
 * this test owns is everything around it, and that is where the risk lives:
 * the values have to reach the ordinary load form, the owner has to be told
 * what the document did NOT say, and the file has to end up filed against the
 * load it produced -- as a rate confirmation, not as "other".
 */

const dataDir = path.join(process.cwd(), ".e2e-data");
const dataFile = path.join(dataDir, "onroad-books.json");

// Never parsed by anything: the route is intercepted in the browser.
const ratePdf = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");

const READING = {
  fields: {
    broker: "Coyote Logistics",
    loadNumber: "18827411",
    date: "2026-09-04",
    deliveryDate: "2026-09-06",
    originCity: "Laredo",
    originState: "TX",
    destinationCity: "Austell",
    destinationState: "GA",
    // The document priced the load but never printed a mileage -- the common
    // case, and the one the owner has to be warned about.
    loadedMiles: null,
    grossRate: 4000,
    equipmentType: "DRY_VAN",
    equipmentLengthFt: 53,
    weightLbs: 42000,
    commodity: "Auto parts",
  },
  missing: ["loadedMiles"],
};

test("a scanned rate confirmation fills the load form and is filed with the load", async ({ page }) => {
  await fs.rm(dataDir, { recursive: true, force: true });

  await page.goto("/setup");
  await page.getByLabel("Your name").fill("Scan Test Owner");
  await page.getByLabel("Email").fill("scan.e2e@example.com");
  await page.getByLabel("Password").fill("E2e-password-2026");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.getByLabel("Business name").fill("Scan Test LLC");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Keep Truck 1 for now" }).click();
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.getByRole("button", { name: /Open the dashboard/ }).click();

  await page.route("**/api/rate-con/scan", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(READING),
    });
  });

  await page.goto("/loads?month=2026-09&period=month");
  await page.getByRole("button", { name: "Scan rate con" }).click();

  const scan = page.getByRole("dialog", { name: "Scan a rate confirmation" });
  await expect(scan).toBeVisible();
  await scan.locator('input[type="file"]').setInputFiles({
    name: "ratecon.pdf",
    mimeType: "application/pdf",
    buffer: ratePdf,
  });

  await expect(scan.getByText("Coyote Logistics")).toBeVisible();
  await expect(scan.getByText("Laredo, TX → Austell, GA")).toBeVisible();
  await expect(scan.getByText("$4,000.00")).toBeVisible();
  await expect(scan.getByText("Not on this document")).toBeVisible();
  await expect(scan.getByText("Loaded miles", { exact: true })).toBeVisible();

  await scan.getByRole("button", { name: "Review and save" }).click();
  await expect(scan).toBeHidden();

  const form = page.getByRole("dialog", { name: "Add load" });
  await expect(form).toBeVisible();
  await expect(page.locator("#load-broker")).toHaveValue("Coyote Logistics");
  await expect(page.locator("#load-number")).toHaveValue("18827411");
  await expect(page.locator("#load-date")).toHaveValue("2026-09-04");
  await expect(page.locator("#load-delivery-date")).toHaveValue("2026-09-06");
  await expect(page.locator("#load-origin-city")).toHaveValue("Laredo");
  await expect(page.locator("#load-origin-state")).toHaveValue("TX");
  await expect(page.locator("#load-destination-city")).toHaveValue("Austell");
  await expect(page.locator("#load-destination-state")).toHaveValue("GA");
  await expect(page.locator("#load-rate")).toHaveValue("4000");
  await expect(page.locator("#load-weight")).toHaveValue("42000");
  await expect(page.locator("#load-length")).toHaveValue("53");
  await expect(page.locator("#load-commodity")).toHaveValue("Auto parts");
  // Never invented: the document did not print a mileage, so the box is empty.
  await expect(page.locator("#load-loaded")).toHaveValue("");
  // The scanned file rides along, ready to be filed once the load exists.
  await expect(form.getByText("ratecon.pdf")).toBeVisible();

  await page.locator("#load-loaded").fill("1404");
  await page.getByRole("button", { name: "Add load", exact: true }).last().click();
  // The first save in a cold dev server also loads the location database.
  await expect(form).toBeHidden({ timeout: 30_000 });
  await expect(page.getByText("Laredo").first()).toBeVisible();

  const dataset = JSON.parse(await fs.readFile(dataFile, "utf8")) as {
    loads: {
      broker: string | null;
      loadNumber: string | null;
      originCity: string;
      originState: string;
      destinationCity: string;
      destinationState: string;
      grossRate: number;
      loadedMiles: number;
    }[];
    documents?: { type: string; fileName: string; loadId: string | null }[];
  };
  expect(dataset.loads).toHaveLength(1);
  expect(dataset.loads[0].broker).toBe("Coyote Logistics");
  expect(dataset.loads[0].originCity).toBe("Laredo");
  expect(dataset.loads[0].originState).toBe("TX");
  expect(dataset.loads[0].destinationCity).toBe("Austell");
  expect(dataset.loads[0].destinationState).toBe("GA");
  expect(dataset.loads[0].loadNumber).toBe("18827411");
  expect(dataset.loads[0].grossRate).toBe(4000);
  expect(dataset.loads[0].loadedMiles).toBe(1404);
  expect(dataset.documents).toHaveLength(1);
  expect(dataset.documents?.[0].type).toBe("RATE_CONFIRMATION");
  expect(dataset.documents?.[0].fileName).toBe("ratecon.pdf");
});
