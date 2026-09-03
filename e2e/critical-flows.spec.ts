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

type CalculatorFixtureDataset = JsonDataset & {
  settings: { fleetOverheadAllocation?: "UNALLOCATED" | "FLEET_MILES" };
  trucks: Array<{
    id: string;
    name: string;
    operatingCostExemptions?: Record<string, true>;
  }>;
  loads: Array<{
    id: string;
    truckId: string;
    loadedMiles: number;
    [key: string]: unknown;
  }>;
  expenses: Array<{
    id: string;
    truckId: string | null;
    scope: string;
    date: string;
    category: string;
    description: string;
    amount: number;
    [key: string]: unknown;
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
    // The E2E server runs in development mode, where the first dashboard
    // request may include an on-demand compile. Keep that cost from turning a
    // working redirect into a five-second flake.
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 });
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

  test("owner manages a loan payment as one editable and deletable transaction", async ({ page }) => {
    const datasetBeforeTest = await readDataset();
    await login(page);
    await page.goto("/expenses?month=2026-09&period=month");

    await page.getByRole("button", { name: /^Add expense$/i }).first().click();
    const expenseDialog = page.getByRole("dialog", { name: "Add expense" });
    await page.locator("#expense-date").fill("2026-09-01");
    await page.locator("#expense-amount").fill("513");
    await page.locator("#expense-category").click();
    await page.getByRole("option", { name: "Truck Payment (Unallocated)" }).click();
    await expect(expenseDialog.getByLabel("Receipt number")).toHaveCount(0);
    await expect(expenseDialog.locator('input[type="file"]')).toHaveCount(0);
    await expect(expenseDialog.getByLabel("Notes")).toBeVisible();
    await page.locator("#expense-description").fill("AMEX payment");
    await page.locator("#expense-vendor").fill("Amex");
    await expenseDialog.getByLabel("Notes").fill("ACH payment from operating account");
    await page.getByRole("button", { name: "Add expense", exact: true }).last().click();
    await expect(expenseDialog).toBeHidden();

    await page.getByRole("button", { name: "Review", exact: true }).last().click();
    const classifyDialog = page.getByRole("dialog", { name: "Classify $513.00 payment" });
    await expect(classifyDialog.getByLabel("Loan principal")).toHaveValue("513");
    await expect(classifyDialog.getByLabel("Loan interest")).toHaveValue("0");
    await expect(classifyDialog.getByLabel("Notes")).toHaveValue("ACH payment from operating account");
    await classifyDialog.getByLabel("Starting principal balance").fill("10000");
    await classifyDialog.getByLabel("APR").fill("12");
    await classifyDialog.getByLabel("Payment due day").fill("5");
    await classifyDialog.getByRole("button", { name: "Confirm classification" }).click();
    await expect(classifyDialog).toBeHidden();

    const originalPaymentRow = page.getByRole("row").filter({
      has: page.getByText("AMEX payment", { exact: true }),
    });
    await expect(originalPaymentRow).toContainText("Loan payment");
    await expect(originalPaymentRow).toContainText("$513.00");
    await originalPaymentRow.getByRole("button", { name: "Edit principal and interest" }).click();

    const editDialog = page.getByRole("dialog", { name: "Edit $513.00 loan payment" });
    await expect(editDialog.getByLabel("Total payment")).toHaveValue("513");
    await expect(editDialog.getByLabel("Date")).toHaveValue("2026-09-01");
    await expect(editDialog.getByLabel("Description")).toHaveValue("AMEX payment");
    await expect(editDialog.getByLabel("Bank or lender")).toHaveValue("Amex");
    await expect(editDialog.getByLabel("Loan principal")).toHaveValue("513");
    await expect(editDialog.getByLabel("Loan interest")).toHaveValue("0");
    await expect(editDialog.getByLabel("Starting principal balance")).toHaveValue("10000");
    await expect(editDialog.getByLabel("APR")).toHaveValue("12");
    await expect(editDialog.getByLabel("Payment due day")).toHaveValue("5");
    await editDialog.getByLabel("Loan interest").fill("25");
    await editDialog.getByLabel("Total payment").fill("525");
    await expect(editDialog.getByLabel("Loan principal")).toHaveValue("500");
    await editDialog.getByLabel("Date").fill("2026-09-02");
    await editDialog.getByLabel("Description").fill("AMEX September payment");
    await editDialog.getByLabel("Bank or lender").fill("American Express");
    await editDialog.getByRole("switch", { name: "Recurring expense" }).check();
    await editDialog.getByLabel("Obligation name").fill("Amex Business Card");
    await editDialog.getByLabel("Expected monthly payment").fill("525");
    await editDialog.getByRole("switch", { name: "Active financing" }).uncheck();
    await editDialog.getByLabel("Notes").fill("September Amex autopay");
    await editDialog.getByRole("button", { name: "Save payment split" }).click();
    await expect(editDialog).toBeHidden();

    const paymentRow = page.getByRole("row").filter({
      has: page.getByText("AMEX September payment", { exact: true }),
    });
    await expect(paymentRow).toContainText("Loan payment");
    await expect(paymentRow).toContainText("$525.00");
    await paymentRow.getByRole("button", { name: "Show principal and interest breakdown" }).click();
    const principalDetail = page.getByRole("row").filter({ hasText: "Loan principal" });
    const interestDetail = page.getByRole("row").filter({ hasText: "Loan interest" });
    await expect(principalDetail).toContainText("$500.00");
    await expect(interestDetail).toContainText("$25.00");

    await paymentRow.getByRole("button", { name: "Edit principal and interest" }).click();
    const updatedDialog = page.getByRole("dialog", { name: "Edit $525.00 loan payment" });
    await expect(updatedDialog.getByLabel("Total payment")).toHaveValue("525");
    await expect(updatedDialog.getByLabel("Date")).toHaveValue("2026-09-02");
    await expect(updatedDialog.getByLabel("Description")).toHaveValue("AMEX September payment");
    await expect(updatedDialog.getByLabel("Bank or lender")).toHaveValue("American Express");
    await expect(updatedDialog.getByLabel("Loan principal")).toHaveValue("500");
    await expect(updatedDialog.getByLabel("Loan interest")).toHaveValue("25");
    await expect(updatedDialog.getByLabel("Obligation name")).toHaveValue("Amex Business Card");
    await expect(updatedDialog.getByLabel("Expected monthly payment")).toHaveValue("525");
    await expect(updatedDialog.getByRole("switch", { name: "Active financing" })).not.toBeChecked();
    await expect(updatedDialog.getByLabel("Notes")).toHaveValue("September Amex autopay");
    await updatedDialog.getByRole("button", { name: "Cancel" }).click();

    await page.goto("/financing");
    const financing = page.locator("article").filter({ hasText: "Amex Business Card" });
    await expect(financing).toContainText("$10,000.00");
    await expect(financing).toContainText("$9,500.00");
    await expect(financing).toContainText("12%");
    await expect(financing).toContainText("$500.00 principal recorded");

    await page.goto("/expenses?month=2026-09&period=month");

    await paymentRow.getByRole("button", { name: "Delete complete loan payment" }).click();
    const deleteDialog = page.getByRole("dialog", { name: "Delete this payment?" });
    await expect(deleteDialog.getByText("The complete principal and interest breakdown")).toBeVisible();
    await deleteDialog.getByRole("button", { name: "Delete payment", exact: true }).click();
    await expect(page.getByText("AMEX September payment", { exact: true })).toHaveCount(0);

    const datasetAfterDelete = await readDataset() as CalculatorFixtureDataset & {
      financialObligations: Array<{ name: string; active: boolean }>;
    };
    expect(datasetAfterDelete.expenses.some((expense) => expense.description.startsWith("AMEX"))).toBe(false);
    expect(datasetAfterDelete.financialObligations.some(
      (obligation) => obligation.name === "Amex Business Card" && !obligation.active,
    )).toBe(true);

    await writeDataset(datasetBeforeTest);
  });

  test("owner manages financing independently from a payment", async ({ page }) => {
    const datasetBeforeTest = await readDataset() as CalculatorFixtureDataset;
    const truckName = datasetBeforeTest.trucks[0]?.name;
    expect(truckName).toBeTruthy();
    await login(page);
    await page.goto("/financing");

    await expect(page.getByRole("heading", { name: "Financing obligations" })).toBeVisible();
    await page.getByRole("button", { name: "Add financing" }).first().click();
    const createDialog = page.getByRole("dialog", { name: "Add financing" });
    await createDialog.getByLabel("Obligation name").fill("AMEX equipment note");
    await createDialog.getByLabel("Bank or lender").fill("American Express");
    await createDialog.getByLabel("Starting principal balance").fill("15000");
    await createDialog.getByLabel("APR").fill("8.25");
    await createDialog.getByLabel("Payment due day").fill("15");
    await createDialog.getByLabel("Expected monthly payment").fill("513");
    await createDialog.getByLabel("Associated truck").click();
    await page.getByRole("option", { name: truckName!, exact: true }).click();
    await createDialog.getByLabel("Start date").fill("2026-01-01");
    await createDialog.getByRole("button", { name: "Create financing" }).click();
    await expect(createDialog).toBeHidden();

    const obligation = page.locator("article").filter({ hasText: "AMEX equipment note" });
    await expect(obligation).toContainText("Active");
    await expect(obligation).toContainText("$513.00");
    await expect(obligation).toContainText("$15,000.00");
    await expect(obligation).toContainText("8.25%");
    await expect(obligation).toContainText("Next scheduled payment");
    await expect(obligation).toContainText("due day 15");
    await expect(obligation).toContainText(truckName!);
    await obligation.getByRole("button", { name: "Edit financing: AMEX equipment note" }).click();

    const editDialog = page.getByRole("dialog", { name: "Edit financing" });
    await editDialog.getByLabel("Obligation name").fill("AMEX equipment financing");
    await expect(editDialog.getByLabel("Starting principal balance")).toHaveValue("15000");
    await expect(editDialog.getByLabel("APR")).toHaveValue("8.25");
    await expect(editDialog.getByLabel("Payment due day")).toHaveValue("15");
    await editDialog.getByLabel("Starting principal balance").fill("14000");
    await editDialog.getByLabel("APR").fill("7.5");
    await editDialog.getByLabel("Payment due day").fill("20");
    await editDialog.getByLabel("Expected monthly payment").fill("525");
    await editDialog.getByLabel("Closed date").fill("2026-09-02");
    await editDialog.getByRole("switch", { name: "Active financing" }).uncheck();
    await editDialog.getByRole("button", { name: "Save changes" }).click();
    await expect(editDialog).toBeHidden();

    const closedObligation = page.locator("article").filter({ hasText: "AMEX equipment financing" });
    await expect(closedObligation).toContainText("Closed");
    await expect(closedObligation).toContainText("$525.00");
    const datasetAfterEdit = await readDataset() as CalculatorFixtureDataset & {
      financialObligations: Array<{
        name: string;
        counterparty: string | null;
        startingBalance: number | null;
        aprPercent: number | null;
        paymentDueDay: number | null;
        expectedMonthlyPayment: number | null;
        active: boolean;
        endedOn: string | null;
      }>;
    };
    expect(datasetAfterEdit.financialObligations.some((item) =>
      item.name === "AMEX equipment financing"
      && item.counterparty === "American Express"
      && item.startingBalance === 14000
      && item.aprPercent === 7.5
      && item.paymentDueDay === 20
      && item.expectedMonthlyPayment === 525
      && item.active === false
      && item.endedOn === "2026-09-02"
    )).toBe(true);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/financing");
    await expect(page.getByRole("heading", { name: "Financing obligations" })).toBeVisible();
    await expect.poll(() => page.evaluate(() =>
      document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
    )).toBe(true);

    await writeDataset(datasetBeforeTest);
  });

  test("load calculator compares an existing offer and never counters downward", async ({ page }) => {
    await login(page);
    await page.goto("/calculator");

    const offerContext = page.getByRole("button", { name: "I have a broker offer" });
    const noOfferContext = page.getByRole("button", { name: "No offer / Call for rate" });
    await expect(offerContext).toHaveAttribute("aria-pressed", "true");
    await page.locator("#calc-gross").fill("1100");
    await page.locator("#calc-loaded").fill("275");
    await page.locator("#calc-deadhead").fill("42");
    await page.locator("#calc-fuel").fill("5.50");
    await page.locator("#calc-mpg").fill("8.5");
    await page.locator("#calc-tolls").fill("50");
    await page.locator("#calc-factoring").fill("3");

    await page.getByRole("tab", { name: "What should I ask?" }).click();
    await expect(page.getByRole("heading", { name: "Current offer vs thresholds" })).toBeVisible();
    await expect(page.getByText("$183.38")).toBeVisible();
    await expect(page.getByText(/already meets or exceeds your Great profitability threshold/)).toBeVisible();
    await expect(page.getByText("Suggested counteroffer")).toHaveCount(0);

    await noOfferContext.click();
    await expect(noOfferContext).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#calc-gross")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "What to quote" })).toBeVisible();
    await expect(page.getByText("Direct cost break-even")).toBeVisible();
    await expect(page.getByText("True operating break-even")).toBeVisible();
    await expect(page.getByText("Suggested opening quote")).toBeVisible();
    await expect(page.getByText("$950")).toBeVisible();

    const noFinancing = page.getByRole("checkbox", { name: "This truck has no financing" });
    await expect(noFinancing).toBeVisible();
    await noFinancing.check();
    await expect(page.getByText("Financing status saved for this truck.")).toBeVisible();
    await expect(page.getByText("$0.00 · confirmed", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Required operating-cost groups are still unknown").first(),
    ).toBeVisible();

    // Switching contexts does not erase the broker's offer. It only decides
    // whether that value participates in the result.
    await offerContext.click();
    await expect(page.locator("#calc-gross")).toHaveValue("1100");
    await page.getByRole("tab", { name: "Should I take it?" }).click();
    await page.locator("#calc-gross").fill("");
    await expect(page.getByText("Enter a broker offer greater than $0 to evaluate this load.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Estimated result" })).toHaveCount(0);
    await page.getByRole("tab", { name: "What should I ask?" }).click();
    await expect(page.getByText("Enter a broker offer greater than $0 to evaluate this load.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "What to quote" })).toHaveCount(0);

    await page.reload();
    await expect(
      page.getByRole("checkbox", { name: "This truck has no financing" }),
    ).toBeChecked();
  });

  test("load calculator renders all offer bands, exact boundaries and decimal counters", async ({ page }) => {
    await login(page);
    await page.goto("/calculator");

    const gross = page.locator("#calc-gross");
    await page.locator("#calc-loaded").fill("275");
    await page.locator("#calc-deadhead").fill("42");
    await page.locator("#calc-fuel").fill("5.50");
    await page.locator("#calc-mpg").fill("8.5");
    await page.locator("#calc-tolls").fill("50");
    await page.locator("#calc-factoring").fill("3");
    await gross.fill("1100");
    await page.getByRole("tab", { name: "What should I ask?" }).click();

    const assertBand = async (
      offer: string,
      rating: string,
      counter: string | null,
    ) => {
      await gross.fill(offer);
      const currentOfferBlock = page.getByText("Current broker offer").locator("..");
      await expect(currentOfferBlock).toContainText(`$${offer}`);
      await expect(page.getByText(rating, { exact: true })).toBeVisible();
      const announcement = page.getByTestId("offer-announcement");
      await expect(announcement).toHaveAttribute("aria-live", "polite");
      await expect(announcement).toHaveAttribute("aria-atomic", "true");
      if (counter === null) {
        await expect(page.getByText("Suggested counteroffer", { exact: true })).toHaveCount(0);
        await expect(announcement).toHaveText(`${rating}. No counteroffer recommended.`);
      } else {
        const counterBlock = page
          .getByText("Suggested counteroffer", { exact: true })
          .locator("../..");
        await expect(counterBlock).toContainText(counter);
        await expect(announcement).toHaveText(`${rating}. Suggested counteroffer ${counter}.`);
      }
    };

    // Threshold comparisons are inclusive: equality belongs to the higher
    // band. Decimal offers retain cents while counters round up to $25.
    await assertBand("916.62", "Great load", null);
    await assertBand("850.25", "Good load", "$950");
    await assertBand("753.22", "Good load", "$950");
    await assertBand("650.50", "Marginal load", "$800");
    await assertBand("589.81", "Marginal load", "$800");
    await assertBand("589.80", "Below minimum", "$800");
    await assertBand("500.25", "Below minimum", "$800");
  });

  test("load calculator is keyboard operable and announces changing decisions", async ({ page }) => {
    await login(page);
    await page.goto("/calculator");

    const offerContext = page.getByRole("button", { name: "I have a broker offer" });
    const noOfferContext = page.getByRole("button", { name: "No offer / Call for rate" });
    await offerContext.focus();
    await page.keyboard.press("Tab");
    await expect(noOfferContext).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(noOfferContext).toHaveAttribute("aria-pressed", "true");

    const keyboardOrder = [
      page.locator("#calc-target-ppm"),
      page.locator("#calc-loaded"),
      page.locator("#calc-deadhead"),
      page.locator("#calc-fuel"),
      page.locator("#calc-mpg"),
      page.locator("#calc-tolls"),
      page.locator("#calc-other"),
      page.locator("#calc-dispatch"),
      page.getByRole("group", { name: "Dispatch fee unit" }).getByRole("button", { name: "%" }),
      page.getByRole("group", { name: "Dispatch fee unit" }).getByRole("button", { name: "$" }),
      page.locator("#calc-factoring"),
      page.getByRole("group", { name: "Factoring fee unit" }).getByRole("button", { name: "%" }),
      page.getByRole("group", { name: "Factoring fee unit" }).getByRole("button", { name: "$" }),
      page.getByRole("checkbox", { name: "This truck has no financing" }),
    ];
    for (const control of keyboardOrder) {
      await page.keyboard.press("Tab");
      await expect(control).toBeFocused();
    }
    const wasConfirmed = await keyboardOrder.at(-1)!.isChecked();
    await page.keyboard.press("Space");
    if (wasConfirmed) await expect(keyboardOrder.at(-1)!).not.toBeChecked();
    else await expect(keyboardOrder.at(-1)!).toBeChecked();
    await expect(page.getByText("Financing status saved for this truck.")).toBeVisible();

    // Radix tabs expose their arrow-key behavior as well as ordinary Tab
    // order, so the two calculator questions do not require a pointer.
    const evaluateTab = page.getByRole("tab", { name: "Should I take it?" });
    const targetTab = page.getByRole("tab", { name: "What should I ask?" });
    await evaluateTab.focus();
    await page.keyboard.press("ArrowRight");
    await expect(targetTab).toHaveAttribute("aria-selected", "true");

    await offerContext.focus();
    await page.keyboard.press("Enter");
    await page.locator("#calc-gross").fill("850.25");
    await page.locator("#calc-loaded").fill("275");
    await page.locator("#calc-deadhead").fill("42");
    await page.locator("#calc-fuel").fill("5.50");
    await page.locator("#calc-mpg").fill("8.5");
    await page.locator("#calc-tolls").fill("50");
    await page.locator("#calc-factoring").fill("3");
    await targetTab.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("offer-announcement")).toHaveText(
      "Good load. Suggested counteroffer $950.",
    );
    await page.locator("#calc-gross").fill("1100");
    await expect(page.getByTestId("offer-announcement")).toHaveText(
      "Great load. No counteroffer recommended.",
    );
  });

  test("load calculator threshold cards fit phone, tablet and desktop in Spanish", async ({ page }, testInfo) => {
    await login(page);
    await page.context().addCookies([{
      name: "onroadbooks.locale",
      value: "es",
      url: "http://127.0.0.1:4173",
    }]);

    for (const viewport of [
      { name: "phone", width: 390, height: 844 },
      { name: "tablet", width: 768, height: 1024 },
      { name: "desktop", width: 1440, height: 900 },
    ]) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/calculator");
      await page.locator("#calc-gross").fill("500.25");
      await page.locator("#calc-loaded").fill("275");
      await page.locator("#calc-deadhead").fill("42");
      await page.locator("#calc-fuel").fill("5.50");
      await page.locator("#calc-mpg").fill("8.5");
      await page.locator("#calc-tolls").fill("50");
      await page.locator("#calc-factoring").fill("3");
      await page.getByRole("tab", { name: "¿Cuánto debo pedir?" }).click();

      await expect(page.getByText("Por debajo del mínimo", { exact: true })).toBeVisible();
      await expect(page.getByText(/Está por debajo de tu umbral mínimo.*Contraoferta hacia/)).toBeVisible();
      await expect(page.getByText(/Agrega 3% de margen para negociar/)).toBeVisible();
      expect(await page.evaluate(() => (
        document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
      ))).toBe(true);

      for (const label of ["Umbral mínimo", "Umbral bueno", "Umbral excelente"]) {
        const box = await page.getByText(label, { exact: true }).locator("../..").boundingBox();
        expect(box, `${label} should render at ${viewport.name}`).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
      }

      await testInfo.attach(`calculator-es-${viewport.name}`, {
        body: await page.screenshot({ fullPage: true }),
        contentType: "image/png",
      });
    }
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

  test("Fleet calculator keeps truck history and financing confirmation scoped", async ({ page }) => {
    await login(page);
    await page.goto("/truck");
    await page.getByRole("button", { name: "Add truck", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Add a truck" });
    await dialog.locator("#new-truck-name").fill("Unit 202");
    await dialog.locator("#new-truck-odo").fill("200000");
    await dialog.getByRole("button", { name: "Add truck", exact: true }).click();
    await expect(dialog).toBeHidden();

    // Give Truck 1 a trustworthy unit sample plus one shared Fleet cost. The
    // shared row must make true/cash break-even unavailable instead of being
    // silently ignored or arbitrarily assigned to this truck.
    const fixture = await readDataset() as CalculatorFixtureDataset;
    const primary = fixture.trucks.find((truck) => truck.name === "Truck 1");
    const primaryLoad = fixture.loads.find((load) => load.truckId === primary?.id);
    const expenseTemplate = fixture.expenses.find((expense) => expense.truckId === primary?.id);
    if (!primary || !primaryLoad || !expenseTemplate) {
      throw new Error("Calculator Fleet fixture is incomplete.");
    }
    const originalLoadedMiles = primaryLoad.loadedMiles;
    const originalCostExemptions = primary.operatingCostExemptions;
    primaryLoad.loadedMiles = 600;
    fixture.expenses.push({
      ...expenseTemplate,
      id: "expense_shared_calculator_e2e",
      truckId: null,
      scope: "BUSINESS",
      date: "2026-09-02",
      category: "OTHER",
      description: "Shared Fleet office cost",
      amount: 125,
      financialTreatment: "OPERATING",
    });
    await writeDataset(fixture);

    try {
      await page.goto("/calculator");
      const truckScope = page.getByRole("group", { name: "Truck" });
      await expect(truckScope.getByRole("link", { name: "Truck 1", exact: true })).toHaveAttribute(
        "aria-current",
        "true",
      );
      await expect(page.getByTestId("shared-overhead-warning")).toBeVisible();

      // Only an explicit owner choice may turn shared Fleet costs into a
      // per-truck rate. Persist the miles policy, then verify Calculator uses
      // it and explains the allocation instead of keeping break-even hidden.
      await page.goto("/settings?section=business");
      await page.getByRole("radio", { name: "Allocate by Fleet miles" }).check();
      await page.getByRole("button", { name: "Save settings" }).click();
      await expect(page.getByText("Settings saved")).toBeVisible();
      await page.goto("/calculator");
      await expect(page.getByTestId("shared-overhead-warning")).toHaveCount(0);
      await expect(page.getByTestId("shared-overhead-allocation")).toBeVisible();
      await expect(page.getByTestId("cost-profile-warning")).toBeVisible();

      // Ledger evidence marks a group Recorded automatically. The owner can
      // only resolve the remaining groups by explicitly saying they do not
      // apply; missing entries never become zero by default.
      for (const label of [
        "Insurance",
        "Maintenance & repairs",
        "Permits & registration",
        "Recurring services & administration",
      ]) {
        const exemption = page.getByRole("checkbox", {
          name: `${label}: This cost group does not apply to this truck`,
        });
        if (await exemption.count()) {
          await exemption.check();
          await expect(page.getByText("Operating-cost profile saved for this truck.").last()).toBeVisible();
        }
      }
      await expect(page.getByTestId("cost-profile-warning")).toHaveCount(0);

      await truckScope.getByRole("link", { name: "Unit 202", exact: true }).click();
      await expect(page).toHaveURL(/\/calculator\?truck=/);
      await expect(truckScope.getByRole("link", { name: "Unit 202", exact: true })).toHaveAttribute(
        "aria-current",
        "true",
      );
      await expect(page.getByTestId("shared-overhead-warning")).toHaveCount(0);

      const secondTruckConfirmation = page.getByRole("checkbox", {
        name: "This truck has no financing",
      });
      await expect(secondTruckConfirmation).not.toBeChecked();
      await secondTruckConfirmation.check();
      await expect(page.getByText("Financing status saved for this truck.")).toBeVisible();
      await page.reload();
      await expect(
        page.getByRole("checkbox", { name: "This truck has no financing" }),
      ).toBeChecked();

      await page.getByRole("group", { name: "Truck" })
        .getByRole("link", { name: "Truck 1", exact: true })
        .click();
      await expect(page).toHaveURL(/\/calculator\?truck=/);
      await expect(page.getByTestId("shared-overhead-warning")).toHaveCount(0);
      await expect(page.getByTestId("shared-overhead-allocation")).toBeVisible();
      await expect(
        page.getByRole("checkbox", { name: "This truck has no financing" }),
      ).not.toBeChecked();
    } finally {
      const cleanup = await readDataset() as CalculatorFixtureDataset;
      const loadToRestore = cleanup.loads.find((load) => load.id === primaryLoad.id);
      if (loadToRestore) loadToRestore.loadedMiles = originalLoadedMiles;
      cleanup.expenses = cleanup.expenses.filter(
        (expense) => expense.id !== "expense_shared_calculator_e2e",
      );
      cleanup.settings.fleetOverheadAllocation = "UNALLOCATED";
      const primaryToRestore = cleanup.trucks.find((truck) => truck.id === primary.id);
      if (primaryToRestore) primaryToRestore.operatingCostExemptions = originalCostExemptions ?? {};
      await writeDataset(cleanup);
    }
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
    await expect(page).toHaveURL(/\/settings\?section=access$/);
    await expect(page.getByRole("heading", { name: "Access & Roles" })).toBeVisible();
    await expect(page.getByText("Only the workspace owner can invite people or change roles.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Role boundaries" })).toBeVisible();
    await expect(page.getByText(/always remain with the Owner/)).toBeVisible();
    await page.goto("/settings?section=business");
    await expect(page.getByRole("heading", { name: "Owner financial settings", exact: true })).toBeVisible();
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
    await expect(page).toHaveURL(/\/settings\?section=access$/);
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
    await expect(page.getByText("Business expenses", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Available to you", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("When cash is available", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Where is my money?" })).toBeVisible();
    await expect(page.getByText("Financial details", { exact: true }).first()).toBeVisible();

    const planning = page.getByTestId("monthly-planning");
    await expect(planning.getByText("Unavailable", { exact: true })).toHaveCount(2);
    await expect(planning.getByText("— Configure expected miles", { exact: true })).toHaveCount(2);
    await expect(
      planning.locator('[aria-label="Operating break-even: Unavailable — Configure expected miles"]'),
    ).toBeVisible();
    await expect(
      planning.locator('[aria-label="Cash break-even: Unavailable — Configure expected miles"]'),
    ).toBeVisible();

    await page.goto("/settlements?month=2026-08&half=SECOND");
    await expect(page.getByRole("heading", { name: "Owner Settlements" })).toBeVisible();
    await expect(page.getByText("Half-month payday", { exact: true })).toBeVisible();
    await expect(page.getByText("Available to you", { exact: true })).toBeVisible();
    await expect(page.getByText(/Financial details · model v/)).toBeVisible();
  });
});
