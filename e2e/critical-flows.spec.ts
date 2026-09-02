import { promises as fs } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

const dataDir = path.join(process.cwd(), ".e2e-data");
const dataFile = path.join(dataDir, "onroad-books.json");
const ownerEmail = "owner.e2e@example.com";
const password = "E2e-password-2026";

const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

type JsonDataset = {
  business: { id: string };
  subscription: {
    plan: string;
    status: string;
    currentPeriodEnd: string | null;
    providerCustomerId: string | null;
    providerSubscriptionId: string | null;
  };
  users: Array<{
    id: string;
    businessId: string;
    email: string;
    name: string | null;
    passwordHash: string;
    role: string;
    invitedAt: string | null;
    joinedAt: string | null;
    createdAt: string;
  }>;
};

async function readDataset(): Promise<JsonDataset> {
  return JSON.parse(await fs.readFile(dataFile, "utf8")) as JsonDataset;
}

async function writeDataset(dataset: JsonDataset): Promise<void> {
  const temporary = `${dataFile}.e2e.tmp`;
  await fs.writeFile(temporary, JSON.stringify(dataset, null, 2), "utf8");
  await fs.rename(temporary, dataFile);
}

async function mutateDataset(change: (dataset: JsonDataset) => void): Promise<void> {
  const dataset = await readDataset();
  change(dataset);
  await writeDataset(dataset);
}

async function login(page: Page, email = ownerEmail): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function addLoad(
  page: Page,
  {
    origin,
    destination,
    loadNumber,
    assignDriver = false,
    attachDocument = false,
  }: {
    origin: string;
    destination: string;
    loadNumber: string;
    assignDriver?: boolean;
    attachDocument?: boolean;
  },
): Promise<void> {
  await page.goto("/loads?month=2026-08&period=month");
  await page.getByRole("button", { name: /^Add load$/i }).first().click();
  const dialog = page.getByRole("dialog", { name: "Add load" });
  await expect(dialog).toBeVisible();

  if (assignDriver) {
    await page.locator("#load-driver").click();
    await page.getByRole("option", { name: "Jordan Miles" }).click();
  }

  await page.locator("#load-date").fill("2026-08-31");
  await page.locator("#load-origin-city").fill(origin);
  await page.locator("#load-origin-state").fill("VA");
  await page.locator("#load-destination-city").fill(destination);
  await page.locator("#load-destination-state").fill("MD");
  await page.locator("#load-loaded").fill("120");
  await page.locator("#load-deadhead").fill("20");
  await page.locator("#load-rate").fill("700");
  await page.locator("#load-number").fill(loadNumber);
  await page.locator("#load-fuel").fill("80");

  if (attachDocument) {
    await page.locator("#load-form input[type=file]").setInputFiles({
      name: "rate-confirmation.png",
      mimeType: "image/png",
      buffer: onePixelPng,
    });
    await expect(page.getByText("rate-confirmation.png")).toBeVisible();
  }

  await page.getByRole("button", { name: "Add load", exact: true }).last().click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(origin).first()).toBeVisible();
}

test.describe.serial("critical browser flows", () => {
  test.beforeAll(async () => {
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  test("public pages, protected redirect, owner signup and onboarding", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body")).toContainText("OnRoad Books");

    const health = await page.request.get("/api/health");
    expect([200, 503]).toContain(health.status());
    await expect(health.json()).resolves.toMatchObject({
      checks: { application: { status: "ok" } },
    });

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login$/);

    await page.goto("/setup");
    await page.getByLabel("Your name").fill("Test Owner");
    await page.getByLabel("Email").fill(ownerEmail);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Create account", exact: true }).click();

    await expect(page).toHaveURL(/\/welcome$/);
    await page.getByLabel("Business name").fill("E2E Trucking LLC");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Keep Truck 1 for now" }).click();
    await page.getByRole("button", { name: "Skip for now" }).click();
    await expect(page.getByRole("heading", { name: "E2E Trucking LLC is set up" })).toBeVisible();
    await page.getByRole("button", { name: /Open the dashboard/ }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { name: "Business Overview" })).toBeVisible();

    await page.goto("/truck");
    await expect(page.getByText("Setup incomplete").first()).toBeVisible();
    await expect(page.getByText("No operating history yet")).toBeVisible();
  });

  test("owner records a load, uploads its document and records an expense", async ({ page }) => {
    await login(page);
    await addLoad(page, {
      origin: "Alexandria",
      destination: "Baltimore",
      loadNumber: "E2E-LOAD-1",
      attachDocument: true,
    });

    const datasetAfterLoad = await readDataset() as JsonDataset & { documents?: unknown[] };
    expect(datasetAfterLoad.documents).toHaveLength(1);

    await page.goto("/expenses?month=2026-08&period=month");
    await page.getByRole("button", { name: /^Add expense$/i }).first().click();
    const expenseDialog = page.getByRole("dialog", { name: "Add expense" });
    await page.locator("#expense-date").fill("2026-08-31");
    await page.locator("#expense-amount").fill("125.50");
    await page.locator("#expense-description").fill("E2E parking and permits");
    await page.getByRole("button", { name: "Add expense", exact: true }).last().click();
    await expect(expenseDialog).toBeHidden();
    await expect(page.getByText("E2E parking and permits").first()).toBeVisible();

    await page.goto("/dashboard?month=2026-08&period=month");
    await expect(page.getByRole("heading", { name: "Business overview" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Where is my money?" })).toBeVisible();

    await page.goto("/truck");
    await page.getByRole("button", { name: "Update truck" }).click();
    await page.locator("#truck-axles").fill("2");
    await page.locator("#truck-registered-weight").fill("33000");
    await page.locator("#truck-ifta-jurisdictions").click();
    await page.getByRole("option", { name: "Two or more IFTA jurisdictions" }).click();
    await page.locator("#truck-ifta-reporting").click();
    await page.getByRole("option", { name: "Include this truck in IFTA filings" }).click();
    await page.getByRole("button", { name: "Save truck" }).click();
    await expect(page.getByText("IFTA tracking recommended")).toBeVisible();

    await page.goto("/plans");
    await expect(page.getByText(/Online billing is being configured/).first()).toBeVisible();
  });

  test("owner issues a freight invoice and reviews an incomplete IFTA quarter", async ({ page }) => {
    await login(page);
    await page.goto("/invoices");
    const row = page.getByRole("row").filter({ hasText: "E2E-LOAD-1" });
    await row.getByRole("button", { name: "Invoice", exact: true }).click();
    await page.getByLabel("Customer").fill("E2E Broker LLC");
    await page.getByRole("button", { name: "Save invoice", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(row).toContainText("INV-2026-");

    const downloadPromise = page.waitForEvent("download");
    await row.getByTitle("Download PDF").click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^inv-2026-.*\.pdf$/);

    await page.goto("/ifta?quarter=2026-Q3");
    await expect(page.getByRole("heading", { name: "Trucks in this filing" })).toBeVisible();
    await expect(page.getByText("1 included", { exact: true })).toBeVisible();
    await expect(page.getByText("Filing is incomplete")).toBeVisible();
    await expect(page.getByText(/not assigned to a jurisdiction/)).toBeVisible();

    const xlsx = await page.request.get("/api/export/loads?month=2026-08&period=full&format=xlsx");
    expect(xlsx.status()).toBe(200);
    expect(xlsx.headers()["content-type"]).toContain("spreadsheetml");
    expect((await xlsx.body()).subarray(0, 2).toString()).toBe("PK");
  });

  test("Fleet owner adds a driver, assigns a load and posts a frozen statement", async ({ page }) => {
    await mutateDataset((dataset) => {
      dataset.subscription.plan = "FLEET";
      dataset.subscription.status = "ACTIVE";
      dataset.subscription.currentPeriodEnd = null;
      dataset.subscription.providerCustomerId = null;
      dataset.subscription.providerSubscriptionId = null;
    });

    await login(page);
    await page.goto("/drivers");
    await page.getByRole("button", { name: "Add driver", exact: true }).first().click();
    await page.locator("#driver-name").fill("Jordan Miles");
    await page.locator("#driver-reference").fill("DRV-E2E");
    await page.getByRole("button", { name: "Add driver", exact: true }).last().click();
    await expect(page.getByText("Jordan Miles").first()).toBeVisible();

    await addLoad(page, {
      origin: "Richmond",
      destination: "Frederick",
      loadNumber: "E2E-LOAD-2",
      assignDriver: true,
    });

    await page.goto("/drivers");
    const driverHref = await page.getByRole("link", { name: "Jordan Miles", exact: true }).getAttribute("href");
    await page.goto(`${driverHref}?month=2026-08&period=full`);
    await expect(page.getByRole("heading", { name: "Jordan Miles" })).toBeVisible();
    await expect(page.getByText("Period performance")).toBeVisible();
    await expect(page.getByText("Loads ready for payroll")).toBeVisible();

    await page.goto("/driver-settlements");
    await page.getByRole("button", { name: "Prepare statement" }).first().click();
    await page.locator("#statement-start").fill("2026-08-01");
    await page.locator("#statement-end").fill("2026-08-31");
    await page.getByRole("button", { name: "Prepare draft" }).click();
    await expect(page).toHaveURL(/\/driver-settlements\/[^/]+$/);
    await expect(page.getByText("Draft", { exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: "Add adjustment" }).click();
    await page.locator("#adjustment-amount").fill("35");
    await page.locator("#adjustment-reason").fill("Detention at receiver");
    await page.getByRole("button", { name: "Add to draft" }).click();
    await expect(page.getByText("Detention at receiver")).toBeVisible();
    await expect(page.getByText("Gross pay → adjustments → net pay")).toBeVisible();

    // Back controls follow the path the owner actually took. They must not
    // guess a fixed destination and discard list/detail context.
    const statementUrl = page.url();
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await expect(page).toHaveURL(/\/driver-settlements$/);
    await page.getByRole("link", { name: "View", exact: true }).click();
    await expect(page).toHaveURL(statementUrl);
    await page.getByRole("link", { name: /Richmond, VA → Frederick, MD/ }).click();
    await expect(page).toHaveURL(/\/loads\/[^/]+$/);
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await expect(page).toHaveURL(statementUrl);

    await page.getByRole("button", { name: "Mark paid" }).click();
    await page.getByRole("button", { name: "Post payment" }).click();
    await expect(page.getByText(/^Paid /).first()).toBeVisible();
  });

  test("role boundaries are visible and enforced in the browser", async ({ page }) => {
    await mutateDataset((dataset) => {
      const owner = dataset.users.find((user) => user.email === ownerEmail);
      if (!owner) throw new Error("E2E owner was not created.");
      const now = new Date().toISOString();
      for (const [role, email] of [
        ["VIEWER", "viewer.e2e@example.com"],
        ["BOOKKEEPER", "bookkeeper.e2e@example.com"],
        ["DISPATCHER", "dispatcher.e2e@example.com"],
        ["ADMIN", "admin.e2e@example.com"],
      ] as const) {
        if (dataset.users.some((user) => user.email === email)) continue;
        dataset.users.push({
          id: `user_${role.toLowerCase()}_e2e`,
          businessId: dataset.business.id,
          email,
          name: `${role[0]}${role.slice(1).toLowerCase()} Test`,
          passwordHash: owner.passwordHash,
          role,
          invitedAt: now,
          joinedAt: now,
          createdAt: now,
        });
      }
    });

    await login(page, "viewer.e2e@example.com");
    await expect(page.getByText("Viewer access", { exact: true }).last()).toBeVisible();
    await page.goto("/expenses?month=2026-08&period=month");
    await page.getByRole("button", { name: /^Add expense$/i }).first().click();
    await page.locator("#expense-date").fill("2026-08-31");
    await page.locator("#expense-amount").fill("10");
    await page.locator("#expense-description").fill("Viewer must not create this");
    await page.getByRole("button", { name: "Add expense", exact: true }).last().click();
    await expect(page.getByText("Viewer (legacy) access does not allow that change.")).toBeVisible();

    await page.context().clearCookies();
    await login(page, "bookkeeper.e2e@example.com");
    await page.goto("/drivers");
    await expect(page.getByRole("button", { name: "Add driver", exact: true })).toHaveCount(0);
    await page.goto("/team");
    await expect(page).toHaveURL(/\/settings#access-roles$/);
    await expect(page.getByRole("heading", { name: "Access & Roles" })).toBeVisible();
    await expect(page.getByText("Only the workspace owner can invite people or change roles.")).toBeVisible();
    await expect(page.getByText("Owner financial settings")).toBeVisible();
    await page.goto("/reserves");
    await expect(page.getByText("Reserve balances, rules and movements are available only to the workspace owner.")).toBeVisible();
    await page.goto("/settlements");
    await expect(page.getByText(/Owner Settlement close\/reopen controls are available only/)).toBeVisible();
    await page.goto("/driver-settlements");
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.context().clearCookies();
    await login(page, "dispatcher.e2e@example.com");
    await page.goto("/drivers");
    await expect(page.getByRole("button", { name: "Add driver", exact: true }).first()).toBeVisible();

    await page.context().clearCookies();
    await login(page, "admin.e2e@example.com");
    await page.goto("/team");
    await expect(page).toHaveURL(/\/settings#access-roles$/);
    await expect(page.getByText("Only the workspace owner can invite people or change roles.")).toBeVisible();
  });

  test("authenticated shell remains usable at a phone viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page);
    await expect(page.getByRole("button", { name: "Open navigation" })).toBeVisible();
    await page.getByRole("button", { name: "Open navigation" }).click();
    await expect(page.getByRole("dialog", { name: "Navigation" })).toBeVisible();
    await page.getByRole("link", { name: "Loads", exact: true }).click();
    await expect(page).toHaveURL(/\/loads$/);
    await expect(page.getByRole("heading", { name: "Loads" })).toBeVisible();
  });

  test("owner financial cockpit answers questions and keeps details progressive", async ({ page }) => {
    await login(page);
    await page.goto("/dashboard?month=2026-08&period=month");
    await expect(page.getByRole("heading", { name: "Financial performance" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Your cash" })).toBeVisible();
    await expect(page.getByText("You earned", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Your business made", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Collected", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Business cash out", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Available to you", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("When cash is available", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Where is my money?" })).toBeVisible();
    await expect(page.getByText("Financial details", { exact: true }).first()).toBeVisible();

    await page.goto("/settlements?month=2026-08&half=SECOND");
    await expect(page.getByRole("heading", { name: "Owner Settlements" })).toBeVisible();
    await expect(page.getByText("Half-month payday", { exact: true })).toBeVisible();
    await expect(page.getByText("Available to pay yourself", { exact: true })).toBeVisible();
    await expect(page.getByText(/Financial details · model v/)).toBeVisible();
  });
});
