import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { createHmac } from "node:crypto";
test.describe.configure({ mode: "serial" });

test("Drizzle serves protected routes, signup/login, ledger writes and tenant isolation", async ({
  page,
  browser,
}) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/setup");
  await page.getByLabel("Your name").fill("Database Owner");
  await page.getByLabel("Email").fill("database-owner@example.test");
  await page.getByLabel("Password").fill("Database-test-password-2026");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page).toHaveURL(/\/welcome$/);
  await page.getByLabel("Business name").fill("Database Browser Trucking");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Keep Truck 1 for now" }).click();
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.getByRole("button", { name: /Open the dashboard/ }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20_000 });
  await page.goto("/expenses?month=2026-08&period=month");
  await page
    .getByRole("button", { name: /^Add expense$/i })
    .first()
    .click();
  await page.locator("#expense-date").fill("2026-08-31");
  await page.locator("#expense-amount").fill("125.50");
  await page.locator("#expense-description").fill("Database-only parking");
  await page
    .getByRole("button", { name: "Add expense", exact: true })
    .last()
    .click();
  await expect(page.getByRole("dialog", { name: "Add expense" })).toBeHidden();
  await expect(page.getByText("Database-only parking").first()).toBeVisible();
  for (const route of ["/dashboard", "/loads", "/truck", "/settings"]) {
    const response = await page.goto(route);
    expect(response?.status()).toBe(200);
  }
  const client = new Client({
    connectionString: process.env.NEON_DATABASE_URL,
  });
  await client.connect();
  try {
    const { rows } = await client.query(
      'SELECT e.amount::text, u.email FROM "Expense" e JOIN "User" u ON u."businessId"=e."businessId" WHERE e.description=$1',
      ["Database-only parking"],
    );
    expect(rows).toEqual([
      { amount: "125.50", email: "database-owner@example.test" },
    ]);
  } finally {
    await client.end();
  }
  const secondContext = await browser.newContext();
  try {
    const other = await secondContext.newPage();
    await other.goto("/setup");
    await other.getByLabel("Your name").fill("Other Owner");
    await other.getByLabel("Email").fill("database-other@example.test");
    await other.getByLabel("Password").fill("Database-test-password-2026");
    await other
      .getByRole("button", { name: "Create account", exact: true })
      .click();
    await expect(other).toHaveURL(/\/welcome$/);
    await other.goto("/expenses?month=2026-08&period=month");
    await expect(other.getByText("Database-only parking")).toHaveCount(0);
  } finally {
    await secondContext.close();
  }
  await page.context().clearCookies();
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Email").fill("database-owner@example.test");
  await page.getByLabel("Password").fill("Database-test-password-2026");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 });
  await page.goto("/expenses?month=2026-08&period=month");
  await expect(page.getByText("Database-only parking").first()).toBeVisible();
});

test("Auth.js cookies, logout, password errors, mobile handoff and deleted-user revocation", async ({
  page,
}) => {
  const bad = await page.request.post("/api/auth/login", {
    data: { email: "database-owner@example.test", password: "wrong" },
  });
  expect(bad.status()).toBe(401);
  const cross = await page.request.post("/api/auth/login", {
    headers: { Origin: "https://attacker.example" },
    data: {
      email: "database-owner@example.test",
      password: "Database-test-password-2026",
    },
  });
  expect(cross.status()).toBe(403);
  const login = await page.request.post("/api/auth/login", {
    data: {
      email: "database-owner@example.test",
      password: "Database-test-password-2026",
    },
  });
  expect(login.status()).toBe(200);
  const cookies = await page.context().cookies();
  expect(
    cookies.some(
      (cookie) => cookie.name === "authjs.session-token" && cookie.httpOnly,
    ),
  ).toBe(true);
  expect(cookies.some((cookie) => cookie.name === "onroad_books_session")).toBe(
    false,
  );
  const session = await (await page.request.get("/api/auth/session")).json();
  expect(session.user.email).toBe("database-owner@example.test");
  expect(session.user.passwordHash).toBeUndefined();
  const { randomBytes, createHash } = await import("node:crypto");
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const handoff = await page.request.get(
    `/api/auth/mobile-handoff?state=${randomBytes(24).toString("base64url")}&challenge=${challenge}`,
    { maxRedirects: 0 },
  );
  expect(handoff.status()).toBe(302);
  const code = new URL(handoff.headers().location).searchParams.get("code");
  const wrong = await page.request.post("/api/mobile/auth/exchange", {
    data: { code, verifier: "wrong-verifier" },
  });
  expect(wrong.status()).toBe(401);
  const exchange = await page.request.post("/api/mobile/auth/exchange", {
    data: { code, verifier },
  });
  expect(exchange.status()).toBe(200);
  const { token } = await exchange.json();
  expect(
    (
      await page.request.get("/api/mobile/dashboard", {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).status(),
  ).toBe(200);
  expect((await page.request.post("/api/auth/logout")).status()).toBe(200);
  expect(await (await page.request.get("/api/auth/session")).json()).toBeNull();
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
  // Restore an otherwise-valid cookie to prove database revocation is enforced.
  await page.context().addCookies(cookies);
  const client = new Client({
    connectionString: process.env.NEON_DATABASE_URL,
  });
  await client.connect();
  try {
    await client.query('DELETE FROM "User" WHERE email=$1', [
      "database-owner@example.test",
    ]);
  } finally {
    await client.end();
  }
  expect(await (await page.request.get("/api/auth/session")).json()).toBeNull();
  expect(
    (
      await page.request.get("/api/mobile/dashboard", {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).status(),
  ).toBe(401);
});

test("invitation sets a password, starts Auth.js and cannot be replayed", async ({
  page,
}) => {
  const { randomBytes, createHash, randomUUID } = await import("node:crypto");
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  const id = randomUUID();
  const client = new Client({
    connectionString: process.env.NEON_DATABASE_URL,
  });
  await client.connect();
  try {
    const owner = (
      await client.query('SELECT "businessId" FROM "User" WHERE email=$1', [
        "database-other@example.test",
      ])
    ).rows[0];
    await client.query(
      'INSERT INTO "User" (id,email,"passwordHash","businessId",role,"invitedAt","updatedAt","joinedAt") VALUES ($1,$2,$3,$4,$5,now(),now(),NULL)',
      [
        id,
        "invited-browser@example.test",
        "invite$pending",
        owner.businessId,
        "VIEWER",
      ],
    );
    await client.query(
      'INSERT INTO onroad_auth."Invitation" ("tokenHash","userId","expiresAt") VALUES ($1,$2,now()+interval \'1 hour\')',
      [hash, id],
    );
    const bad = await page.request.post("/api/auth/invite/accept", {
      headers: { Origin: "https://attacker.example" },
      data: { token, password: "Invitation-password-2026" },
    });
    expect(bad.status()).toBe(403);
    await page.goto(`/invite/accept#token=${token}`);
    await page
      .getByLabel("Password", { exact: true })
      .fill("Invitation-password-2026");
    expect(page.url()).not.toContain(token);
    await page
      .getByRole("button", { name: "Accept invitation", exact: true })
      .click();
    await expect(page).toHaveURL(/\/dashboard\?team=joined$/, {
      timeout: 15_000,
    });
    const row = (
      await client.query(
        'SELECT role,"joinedAt","passwordHash" FROM "User" WHERE id=$1',
        [id],
      )
    ).rows[0];
    expect(row.role).toBe("VIEWER");
    expect(row.joinedAt).toBeTruthy();
    expect(row.passwordHash).toMatch(/^scrypt\$/);
    const replay = await page.request.post("/api/auth/invite/accept", {
      data: { token, password: "Another-password-2026" },
    });
    expect(replay.status()).toBe(401);
    await page.request.post("/api/auth/logout");
    expect(
      (
        await page.request.post("/api/auth/login", {
          data: {
            email: "invited-browser@example.test",
            password: "Invitation-password-2026",
          },
        })
      ).status(),
    ).toBe(200);
    const denied = await page.request.post("/api/mobile/login", {
      data: {
        email: "invited-browser@example.test",
        password: "Another-password-2026",
      },
    });
    expect(denied.status()).toBe(401);
  } finally {
    await client.end();
  }
});

test("R2 server uploads preserve 10 MB, enforce ownership/roles and serve private downloads", async ({
  page,
  browser,
}) => {
  test.skip(
    process.env.ONROAD_DISPOSABLE_STORAGE !== "1",
    "Run npm run test:browser:storage",
  );
  const email = "storage-owner@example.test";
  const password = "Storage-test-password-2026";
  expect(
    (
      await page.request.post("/api/auth/setup", {
        data: { email, password, name: "Storage Owner" },
      })
    ).status(),
  ).toBe(201);
  const db = new Client({ connectionString: process.env.NEON_DATABASE_URL });
  await db.connect();
  try {
    const owner = (
      await db.query('SELECT * FROM "User" WHERE email=$1', [email])
    ).rows[0];
    const truck = (
      await db.query('SELECT id FROM "Truck" WHERE "businessId"=$1 LIMIT 1', [
        owner.businessId,
      ])
    ).rows[0];
    const bytes = Buffer.alloc(10 * 1024 * 1024, 7);
    bytes.write("%PDF-1.7\n");
    const metadata = {
      owner: "TRUCK",
      entityId: truck.id,
      type: "OTHER",
      label: "Private large receipt",
      fileName: "large.pdf",
      contentType: "application/pdf",
      sizeBytes: bytes.length,
    };
    const prepare = await page.request.post("/api/documents/upload/prepare", {
      data: metadata,
    });
    expect(prepare.status()).toBe(200);
    const plan = await prepare.json();
    expect(plan.strategy).toBe("chunked");
    expect(JSON.stringify(plan)).not.toContain("fixture-secret");
    expect(JSON.stringify(plan)).not.toContain("cloudflarestorage");
    const headers = {
      "X-Document-Upload-Ticket": plan.ticket,
      "X-Document-Part": "0",
      "Content-Type": "application/octet-stream",
    };
    expect(
      (
        await page.request.put("/api/documents/upload/part", {
          headers: { ...headers, Origin: "https://attacker.example" },
          data: bytes.subarray(0, plan.chunkBytes),
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await page.request.put("/api/documents/upload/part", {
          headers: { ...headers, "X-Document-Part": "5" },
          data: Buffer.from("invalid"),
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await page.request.put("/api/documents/upload/part", {
          headers,
          data: Buffer.from("too short"),
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await page.request.post("/api/documents/upload/complete", {
          data: { ticket: plan.ticket },
        })
      ).status(),
    ).toBe(500);
    const other = await browser.newContext();
    try {
      expect(
        (
          await other.request.post("/api/auth/setup", {
            data: {
              email: "storage-other@example.test",
              password,
              name: "Other Business",
            },
          })
        ).status(),
      ).toBe(201);
      expect(
        (
          await other.request.put("/api/documents/upload/part", {
            headers,
            data: bytes.subarray(0, plan.chunkBytes),
          })
        ).status(),
      ).toBe(403);
      expect(
        (
          await other.request.post("/api/documents/upload/complete", {
            data: { ticket: plan.ticket },
          })
        ).status(),
      ).toBe(403);
      for (let part = 0; part < 5; part++) {
        expect(
          (
            await page.request.put("/api/documents/upload/part", {
              headers: { ...headers, "X-Document-Part": String(part) },
              data: bytes.subarray(
                part * plan.chunkBytes,
                (part + 1) * plan.chunkBytes,
              ),
            })
          ).status(),
        ).toBe(200);
      }
      // Retrying an identical part is safe; changing it is refused.
      expect(
        (
          await page.request.put("/api/documents/upload/part", {
            headers,
            data: bytes.subarray(0, plan.chunkBytes),
          })
        ).status(),
      ).toBe(200);
      expect(
        (
          await page.request.put("/api/documents/upload/part", {
            headers,
            data: Buffer.alloc(plan.chunkBytes, 8),
          })
        ).status(),
      ).toBe(400);
      const complete = await page.request.post(
        "/api/documents/upload/complete",
        { data: { ticket: plan.ticket } },
      );
      expect(complete.status()).toBe(201);
      const document = (await complete.json()).document;
      expect(document.sizeBytes).toBe(bytes.length);
      expect(
        (
          await page.request.post("/api/documents/upload/complete", {
            data: { ticket: plan.ticket },
          })
        ).status(),
      ).toBe(200);
      expect(
        (
          await db.query(
            'SELECT count(*) FROM "Document" WHERE "storageKey"=$1',
            [document.storageKey],
          )
        ).rows[0].count,
      ).toBe("1");
      expect(
        (
          await page.request.put("/api/documents/upload/part", {
            headers,
            data: bytes.subarray(0, plan.chunkBytes),
          })
        ).status(),
      ).toBe(409);
      expect(
        (
          await other.request.get(`/api/documents/${document.id}`, {
            maxRedirects: 0,
          })
        ).status(),
      ).toBe(404);
      expect(
        (await other.request.delete(`/api/documents/${document.id}`)).status(),
      ).toBe(404);
      const download = await page.request.get(
        `/api/documents/${document.id}?download=1`,
        { maxRedirects: 0 },
      );
      expect(download.status()).toBe(307);
      const signed = new URL(download.headers().location);
      expect(signed.searchParams.get("X-Amz-Expires")).toBe("60");
      const stored = await page.request.get(signed.toString());
      expect(stored.status()).toBe(200);
      expect(await stored.body()).toEqual(bytes);
      expect(stored.headers()["content-disposition"]).toContain("attachment");
      signed.search = "";
      expect((await page.request.get(signed.toString())).status()).toBe(403);
      expect(
        (await page.request.delete(`/api/documents/${document.id}`)).status(),
      ).toBe(200);
      expect(
        (await page.request.get(download.headers().location)).status(),
      ).toBe(404);
    } finally {
      await other.close();
    }
    // The current role is re-read on every part, even after a ticket was issued.
    const revoked = await (
      await page.request.post("/api/documents/upload/prepare", {
        data: { ...metadata, sizeBytes: 10 },
      })
    ).json();
    await db.query('UPDATE "User" SET role=$1,"joinedAt"=now() WHERE id=$2', [
      "VIEWER",
      owner.id,
    ]);
    expect(
      (
        await page.request.put("/api/documents/upload/part", {
          headers: { ...headers, "X-Document-Upload-Ticket": revoked.ticket },
          data: Buffer.alloc(10),
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await page.request.post("/api/documents/upload/complete", {
          data: { ticket: revoked.ticket },
        })
      ).status(),
    ).toBe(403);
    await db.query('UPDATE "User" SET role=$1 WHERE id=$2', [
      "OWNER",
      owner.id,
    ]);
    // Exercise the actual browser uploader using a normal small attachment.
    await page.goto("/loads?month=2026-08&period=month");
    await page
      .getByRole("button", { name: /^Add load$/i })
      .first()
      .click();
    for (const [id, value] of Object.entries({
      "load-date": "2026-08-31",
      "load-origin-city": "Alexandria",
      "load-origin-state": "VA",
      "load-destination-city": "Baltimore",
      "load-destination-state": "MD",
      "load-loaded": "120",
      "load-deadhead": "20",
      "load-rate": "700",
      "load-number": "R2-UI-1",
      "load-fuel": "80",
    }))
      await page.locator(`#${id}`).fill(value);
    await page.locator("#load-form input[type=file]").setInputFiles({
      name: "r2-receipt.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64",
      ),
    });
    await expect(page.getByText("r2-receipt.png")).toBeVisible();
    const uploaded = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/documents/upload/complete") &&
        response.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "Add load", exact: true })
      .last()
      .click();
    expect((await uploaded).status()).toBe(201);
    await expect(page.getByRole("dialog", { name: "Add load" })).toBeHidden();
    const documents = await db.query(
      'SELECT "fileName","contentType" FROM "Document" WHERE "businessId"=$1',
      [owner.businessId],
    );
    expect(documents.rows).toEqual([
      { fileName: "r2-receipt.png", contentType: "image/png" },
    ]);
  } finally {
    await db.end();
  }
});

test("cron and verified Stripe events use Drizzle, isolate workspaces and tolerate retries", async ({
  page,
}) => {
  const email = "services-owner@example.test";
  expect(
    (
      await page.request.post("/api/auth/setup", {
        data: {
          email,
          password: "Services-test-password-2026",
          name: "Services Owner",
        },
      })
    ).status(),
  ).toBe(201);
  const db = new Client({ connectionString: process.env.NEON_DATABASE_URL });
  await db.connect();
  try {
    const owner = (
      await db.query('SELECT "businessId" FROM "User" WHERE email=$1', [email])
    ).rows[0];
    await db.query(
      'UPDATE "Truck" SET "monthlyInsurance"=123.45 WHERE "businessId"=$1',
      [owner.businessId],
    );
    expect(
      (await page.request.get("/api/cron/monthly-expenses")).status(),
    ).toBe(401);
    const cron = () =>
      page.request.get("/api/cron/monthly-expenses", {
        headers: { Authorization: "Bearer cron-disposable-onroadbooks" },
      });
    const first = await cron();
    expect(first.status()).toBe(200);
    expect((await first.json()).failures).toEqual([]);
    const second = await cron();
    expect(second.status()).toBe(200);
    expect((await second.json()).expensesPosted).toBe(0);
    const expenses = (
      await db.query(
        'SELECT amount::text FROM "Expense" WHERE "businessId"=$1 AND category=$2',
        [owner.businessId, "INSURANCE"],
      )
    ).rows;
    expect(expenses).toEqual([{ amount: "123.45" }]);
    const others = async () =>
      (
        await db.query(
          'SELECT id,plan,status,"providerCustomerId","providerSubscriptionId" FROM "Subscription" WHERE "businessId"<>$1 ORDER BY id',
          [owner.businessId],
        )
      ).rows;
    const before = await others();
    const subscription = {
      id: "sub_fixture_services",
      object: "subscription",
      customer: "cus_fixture_services",
      status: "active",
      metadata: { onRoadBusinessId: owner.businessId, onRoadPlan: "OWNER" },
      items: {
        data: [
          { price: { id: "price_fixture" }, current_period_end: 1893456000 },
        ],
      },
    };
    const event = {
      id: "evt_fixture_services",
      object: "event",
      type: "customer.subscription.updated",
      livemode: false,
      data: { object: subscription },
    };
    const deliver = async (payload: object, valid = true) => {
      const body = JSON.stringify(payload);
      const timestamp = Math.floor(Date.now() / 1000);
      const digest = createHmac(
        "sha256",
        valid ? "whsec_disposable_onroadbooks" : "wrong-signature",
      )
        .update(`${timestamp}.${body}`)
        .digest("hex");
      return page.request.post("/api/stripe/webhook", {
        headers: {
          "Content-Type": "application/json",
          "stripe-signature": `t=${timestamp},v1=${digest}`,
        },
        data: body,
      });
    };
    expect((await deliver(event, false)).status()).toBe(400);
    expect((await deliver(event)).status()).toBe(200);
    expect((await deliver(event)).status()).toBe(200);
    const rows = (
      await db.query(
        'SELECT plan,status,"providerCustomerId","providerSubscriptionId" FROM "Subscription" WHERE "businessId"=$1',
        [owner.businessId],
      )
    ).rows;
    expect(rows).toEqual([
      {
        plan: "OWNER",
        status: "ACTIVE",
        providerCustomerId: "cus_fixture_services",
        providerSubscriptionId: "sub_fixture_services",
      },
    ]);
    expect(await others()).toEqual(before);
    expect(
      (
        await deliver({
          ...event,
          livemode: true,
          data: { object: { ...subscription, status: "canceled" } },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await db.query(
          'SELECT status FROM "Subscription" WHERE "businessId"=$1',
          [owner.businessId],
        )
      ).rows[0].status,
    ).toBe("ACTIVE");
    expect(
      (
        await deliver({
          ...event,
          data: {
            object: {
              ...subscription,
              metadata: {
                ...subscription.metadata,
                onRoadBusinessId: "deleted-workspace-fixture",
              },
            },
          },
        })
      ).status(),
    ).toBe(200);
  } finally {
    await db.end();
  }
});


test("Expenses and Fuel share one purchase and completing legacy details never doubles the charge", async ({ page }) => {
  await page.goto("/setup");
  await page.getByLabel("Your name").fill("Fuel Test Owner");
  await page.getByLabel("Email").fill("fuel-owner@example.test");
  await page.getByLabel("Password").fill("Database-test-password-2026");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.getByLabel("Business name").fill("Fuel Browser Trucking");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Keep Truck 1 for now" }).click();
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.getByRole("button", { name: /Open the dashboard/ }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto("/expenses?month=2026-09&period=month");
  await page.getByRole("button", { name: "Add expense", exact: true }).first().click();
  await page.locator("#expense-date").fill("2026-09-17");
  await page.locator("#expense-amount").fill("311.07");
  await page.locator("#expense-category").click();
  await page.getByRole("option", { name: "Fuel", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator("#fuel-total")).toHaveValue("311.07");
  await expect(dialog.locator("#fuel-date")).toHaveValue("2026-09-17");
  await dialog.locator("#fuel-gallons").fill("48");
  await expect(dialog.locator("#fuel-price")).toHaveAttribute("placeholder", "6.481");
  await dialog.locator("#fuel-station").fill("Pilot");
  await dialog.locator("#fuel-location").fill("Richmond Hill, GA");
  await dialog.getByRole("button", { name: "Add fuel", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("row").filter({ hasText: "Fuel - 48.0 gal @ 6.481/gal" })).toHaveCount(1);
  await page.goto("/fuel?month=2026-09&period=month");
  await expect(page.getByRole("row").filter({ hasText: "Pilot" })).toHaveCount(1);
  await expect(page.getByText("Fuel - 48.0 gal @ 6.481/gal", { exact: true })).toBeVisible();

  const client = new Client({ connectionString: process.env.NEON_DATABASE_URL });
  await client.connect();
  try {
    const { rows: [owner] } = await client.query('SELECT "businessId" FROM "User" WHERE email=$1', ["fuel-owner@example.test"]);
    const { rows: [truck] } = await client.query('SELECT id FROM "Truck" WHERE "businessId"=$1', [owner.businessId]);
    const totals = async () => (await client.query('SELECT count(*)::int AS count, sum(amount)::text AS total FROM "Expense" WHERE "businessId"=$1 AND category=\'FUEL\'', [owner.businessId])).rows[0];
    expect(await totals()).toEqual({ count: 1, total: "311.07" });
    await client.query(`INSERT INTO "Expense" (id,"businessId","truckId",scope,date,category,description,amount,recurring,"updatedAt") VALUES ('legacy-fuel-browser',$1,$2,'TRUCK','2026-09-18','FUEL','Legacy fuel receipt',300,false,NOW())`, [owner.businessId, truck.id]);
    await page.reload();
    const legacy = page.getByRole("row").filter({ hasText: "Legacy fuel receipt" });
    await legacy.getByRole("button", { name: "Complete fuel details" }).click();
    await expect(dialog.locator("#fuel-total")).toHaveValue("300");
    await dialog.locator("#fuel-gallons").fill("48");
    await dialog.locator("#fuel-station").fill("Love’s");
    await dialog.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("Fuel expenses awaiting details")).toHaveCount(0);
    expect(await totals()).toEqual({ count: 2, total: "611.07" });
    const { rows: [completed] } = await client.query('SELECT "expenseId" FROM "FuelEntry" WHERE station=$1 AND "businessId"=$2', ["Love’s", owner.businessId]);
    expect(completed.expenseId).toBe("legacy-fuel-browser");

    const completedRow = page.getByRole("row").filter({ hasText: "Love’s" });
    await completedRow.getByRole("button", { name: "Edit fuel entry" }).click();
    await expect(dialog.locator("#fuel-price")).toHaveValue("6.25");
    await dialog.locator("#fuel-total").fill("305");
    await dialog.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(dialog).toBeHidden();
    expect(await totals()).toEqual({ count: 2, total: "616.07" });
    await page.screenshot({ path: "/tmp/onroad-fuel-shared-form.png", fullPage: true });
    await page.goto("/expenses?month=2026-09&period=month");
    await expect(page.getByRole("row").filter({ hasText: "Fuel - 48.0 gal @ 6.250/gal" })).toHaveCount(1);
  } finally {
    await client.end();
  }
});
