import { promises as fs } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { buildSeedDataset } from "../src/lib/seed/seed-data";
import { todayISO } from "../src/lib/periods";
import type { Dataset } from "../src/lib/types";

const dataDir = path.join(process.cwd(), ".e2e-data");
const dataFile = path.join(dataDir, "onroad-books.json");

test("dispatchers record contacts, attributed loads and commissions without payment tracking", async ({ page }) => {
  test.setTimeout(120_000);
  await fs.rm(dataDir, { recursive: true, force: true });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/setup");
  await page.getByLabel("Your name").fill("Dispatcher Test Owner");
  await page.getByLabel("Email").fill("dispatchers@example.test");
  await page.getByLabel("Password").fill("Dispatcher-password-2026");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page).toHaveURL(/\/welcome$/);
  await page.getByLabel("Business name").fill("Dispatcher Records Test");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Keep Truck 1 for now" }).click();
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.getByRole("button", { name: /Open the dashboard/ }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20_000 });
  await expect(page.locator("main")).not.toBeEmpty();
  await expect(page.locator("[data-nextjs-dialog]")).toHaveCount(0);

  await page.goto("/dispatchers");
  await page.getByRole("button", { name: "Add dispatcher", exact: true }).click();
  const dispatcherDialog = page.getByRole("dialog");
  await dispatcherDialog.locator("#dispatcher-name").fill("Alex Dispatch");
  await dispatcherDialog.getByLabel("Phone", { exact: true }).fill("555-0199");
  await dispatcherDialog.getByRole("button", { name: "Save dispatcher", exact: true }).click();
  await expect(dispatcherDialog).toBeHidden();
  await expect(page.getByRole("link", { name: "Alex Dispatch", exact: true })).toBeVisible();

  const dataset = JSON.parse(await fs.readFile(dataFile, "utf8")) as Dataset;
  const seed = buildSeedDataset();
  const load = { ...seed.loads[0], id: "dispatcher-trip", businessId: dataset.business.id, truckId: dataset.trucks[0].id,
    broker: "Paying Brokerage", brokerContact: "Broker Contact", date: todayISO(), deliveryDate: todayISO(), grossRate: 1000,
    dispatchFee: 60, factoringFee: 35, fuelCost: 0, tolls: 0, otherExpenses: 0, driverId: null, driverPay: 0,
    sourceKind: null, sourceName: null, loadNumber: "DISPATCH-1", status: "PENDING" as const };
  dataset.loads = [load];
  dataset.expenses = [];
  await fs.writeFile(dataFile, JSON.stringify(dataset));
  await page.goto(`/loads/${load.id}`);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const edit = page.getByRole("dialog", { name: "Edit load" });
  await edit.locator("#load-source").click();
  await page.getByRole("option", { name: "Dispatcher", exact: true }).click();
  await edit.locator("#load-source-name").fill("Alex Dispatch");
  await edit.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(edit).toBeHidden();
  await expect(page.getByText("Alex Dispatch", { exact: true })).toBeVisible();

  // A legacy mobile edit must preserve both source attribution and broker contact.
  const login = await page.request.post("/api/mobile/login", { data: { email: "dispatchers@example.test", password: "Dispatcher-password-2026" } });
  expect(login.status()).toBe(200);
  const { token } = await login.json();
  const patch = await page.request.patch(`/api/mobile/loads/${load.id}`, { headers: { Authorization: `Bearer ${token}` }, data: { notes: "Edited from an older phone" } });
  expect(patch.status()).toBe(200);
  const afterMobile = (JSON.parse(await fs.readFile(dataFile, "utf8")) as Dataset).loads[0];
  expect(afterMobile.sourceName).toBe("Alex Dispatch");
  expect(afterMobile.brokerContact).toBe("Broker Contact");
  expect(afterMobile.dispatchFee).toBe(60);

  await page.goto("/dispatchers");
  const alex = page.getByRole("row").filter({ hasText: "Alex Dispatch" });
  await expect(alex).toContainText("$60.00");
  await alex.getByRole("link", { name: "Alex Dispatch", exact: true }).click();
  await expect(page.getByRole("link", { name: "DISPATCH-1", exact: true })).toBeVisible();
  await expect(page.getByText("Total recorded fees: $60.00", { exact: true })).toBeVisible();
  await expect(page.getByText(/not an unpaid balance/)).toBeVisible();
  await page.screenshot({ path: "/tmp/onroad-dispatchers-directory.png", fullPage: true });
  await alex.getByRole("button", { name: "Edit dispatcher", exact: true }).click();
  await dispatcherDialog.locator("#dispatcher-name").fill("Alex Logistics");
  await dispatcherDialog.getByRole("button", { name: "Save dispatcher", exact: true }).click();
  await expect(dispatcherDialog).toBeHidden();
  await page.goto(`/loads/${load.id}`);
  await expect(page.getByText("Alex Logistics", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await edit.locator("#load-source").click();
  await page.getByRole("option", { name: "Myself", exact: true }).click();
  await expect(edit.locator("#load-source-name")).toHaveCount(0);
  await edit.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(edit).toBeHidden();
  const finalLoad = (JSON.parse(await fs.readFile(dataFile, "utf8")) as Dataset).loads[0];
  expect(finalLoad.sourceKind).toBe("SELF");
  expect(finalLoad.sourceName).toBeNull();
  expect(finalLoad.dispatchFee).toBe(60);
  expect(finalLoad.broker).toBe("Paying Brokerage");
  expect(errors).toEqual([]);
});
