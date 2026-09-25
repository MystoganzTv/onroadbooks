import { promises as fs } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { buildSeedDataset } from "../src/lib/seed/seed-data";
import type { Dataset } from "../src/lib/types";

const dataDir = path.join(process.cwd(), ".e2e-data");
const dataFile = path.join(dataDir, "onroad-books.json");

test("truck purchases stay separate from estimated trip fuel", async ({ page }) => {
  test.setTimeout(120_000);
  await fs.rm(dataDir, { recursive: true, force: true });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/setup");
  await page.getByLabel("Your name").fill("Fuel Test Owner");
  await page.getByLabel("Email").fill("fuel-purchases@example.test");
  await page.getByLabel("Password").fill("Fuel-test-password-2026");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page).toHaveURL(/\/welcome$/);
  await page.getByLabel("Business name").fill("Fuel Purchases Test");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Keep Truck 1 for now" }).click();
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.getByRole("button", { name: /Open the dashboard/ }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20_000 });
  await expect(page.locator("main")).not.toBeEmpty();
  await expect(page.locator("[data-nextjs-dialog]")).toHaveCount(0);

  const dataset = JSON.parse(await fs.readFile(dataFile, "utf8")) as Dataset;
  const seed = buildSeedDataset();
  const truckId = dataset.trucks[0].id;
  const businessId = dataset.business.id;
  const load = { ...seed.loads[0], id: "fuel-estimate-trip", businessId, truckId,
    date: "2026-09-21", deliveryDate: "2026-09-22", fuelCost: 180, tolls: 0, dispatchFee: 0, factoringFee: 0,
    otherExpenses: 0, driverPay: 0, driverId: null, costsPosted: true };
  dataset.trucks[0].iftaReportingEnabled = false;
  dataset.loads = [load];
  dataset.expenses = [];
  dataset.fuelEntries = [];
  await fs.writeFile(dataFile, JSON.stringify(dataset));
  await page.context().addCookies([{ name: "onroad-view-mode", value: "detailed", url: "http://127.0.0.1:4173" }]);
  await page.goto("/fuel?month=2026-09&period=month");
  await expect(page.getByText("Fuel purchases", { exact: true })).toBeVisible();
  await expect(page.getByText("MPG", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("columnheader", { name: "Segment MPG" })).toHaveCount(0);
  await page.getByRole("button", { name: "Add fuel", exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Link to load", { exact: true })).toHaveCount(0);
  await expect(dialog.locator("#fuel-jurisdiction")).toHaveCount(0);
  await dialog.locator("#fuel-date").fill("2026-09-22");
  await dialog.locator("#fuel-gallons").fill("41.107");
  await dialog.locator("#fuel-total").fill("277.43");
  await dialog.locator("#fuel-odometer").fill("270000");
  await dialog.locator("#fuel-station").fill("Fuel Test Station");
  await expect(dialog.locator("#fuel-price")).toHaveAttribute("placeholder", "6.749");
  await expect(dialog.getByText("Auto", { exact: true })).toHaveCount(0);
  const colors = await dialog.locator("#fuel-price").evaluate((input) => ({
    text: getComputedStyle(input).color,
    computed: getComputedStyle(input, "::placeholder").color,
  }));
  expect(colors.computed).toBe(colors.text);
  await page.screenshot({ path: "/tmp/onroad-fuel-purchase-form.png", fullPage: true });
  await dialog.getByRole("button", { name: "Add fuel", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("row").filter({ hasText: "Fuel Test Station" })).toBeVisible();
  await page.screenshot({ path: "/tmp/onroad-fuel-purchases.png", fullPage: true });

  const saved = JSON.parse(await fs.readFile(dataFile, "utf8")) as Dataset;
  const purchase = saved.fuelEntries.find((entry) => entry.station === "Fuel Test Station")!;
  expect(purchase.loadId).toBeNull();
  expect(purchase.truckId).toBe(truckId);
  const mirror = saved.expenses.find((entry) => entry.id === purchase.expenseId)!;
  expect(mirror.loadId).toBeNull();
  expect(mirror.amount).toBe(277.43);
  expect(saved.expenses.filter((entry) => entry.category === "FUEL")).toHaveLength(1);
  expect(saved.loads.find((entry) => entry.id === load.id)?.fuelCost).toBe(180);

  await page.goto(`/loads/${load.id}`);
  await expect(page.getByText(/^Estimated fuel/)).toBeVisible();
  await expect(page.getByText("Linked fuel", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "IFTA", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const edit = page.getByRole("dialog", { name: "Edit load" });
  await expect(edit.getByText("Direct trip costs", { exact: true })).toHaveCount(0);
  await expect(edit.getByText("Documents", { exact: true })).toHaveCount(0);
  await expect(edit.getByText("IFTA jurisdiction miles", { exact: true })).toHaveCount(0);
  await edit.locator("#load-notes").fill("Edited without duplicate cost fields");
  await edit.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(edit).toBeHidden();
  const afterEdit = JSON.parse(await fs.readFile(dataFile, "utf8")) as Dataset;
  expect(afterEdit.loads.find((row) => row.id === load.id)?.fuelCost).toBe(180);

  // An expense is no longer tied to a load: a toll bill cannot be split per
  // trip, so it stays a truck cost and the trip breakdown does not move.
  await page.goto("/expenses?month=2026-09&period=month");
  await page.getByRole("button", { name: "Add expense", exact: true }).first().click();
  const expenseDialog = page.getByRole("dialog");
  await expenseDialog.locator("#expense-category").click();
  await page.getByRole("option", { name: "Tolls", exact: true }).click();
  await expenseDialog.locator("#expense-amount").fill("35");
  await expenseDialog.locator("#expense-description").fill("Trip bridge toll");
  await expect(expenseDialog.locator("#expense-load")).toHaveCount(0);
  await expect(expenseDialog.getByText("Link to load", { exact: true })).toHaveCount(0);
  await expenseDialog.getByRole("button", { name: "Add expense", exact: true }).click();
  await expect(expenseDialog).toBeHidden();
  const withToll = JSON.parse(await fs.readFile(dataFile, "utf8")) as Dataset;
  expect(withToll.expenses.find((row) => row.description === "Trip bridge toll")?.loadId).toBeNull();
  await page.goto(`/loads/${load.id}`);
  await expect(page.getByText("Trip bridge toll", { exact: true })).toHaveCount(0);
  const breakdown = page.locator("div.rounded-lg").filter({ has: page.getByRole("heading", { name: "Trip cost breakdown", exact: true }) });
  await expect(breakdown).toContainText("$180.00");
  await page.screenshot({ path: "/tmp/onroad-load-expenses.png", fullPage: true });

  // Explicitly enabling reporting reveals its fields and navigation again.
  const enabled = JSON.parse(await fs.readFile(dataFile, "utf8")) as Dataset;
  enabled.trucks[0].iftaReportingEnabled = true;
  await fs.writeFile(dataFile, JSON.stringify(enabled));
  await page.goto(`/loads/${load.id}`);
  await expect(page.getByRole("link", { name: "IFTA", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByRole("dialog").getByText("IFTA jurisdiction miles", { exact: true }).first()).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
  await page.goto("/fuel?month=2026-09&period=month");
  await page.getByRole("button", { name: "Simple", exact: true }).click();
  await expect(page.getByRole("button", { name: "Edit fuel entry" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete fuel entry" })).toBeVisible();
  await page.goto("/calculator");
  await expect(page.getByLabel("Reference MPG", { exact: true })).toHaveValue("");
  await page.getByLabel("Reference MPG", { exact: true }).fill("8");
  await expect(page.getByLabel("Reference MPG", { exact: true })).toHaveValue("8");
  expect(errors).toEqual([]);
});
