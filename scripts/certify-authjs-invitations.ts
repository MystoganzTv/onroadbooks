import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { open, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { config } from "dotenv";
import { Client } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { pgBinary } from "./lib/postgres";

// Explicit, one-off live email certification. Never runs in the test suite.
// Stop any other Next dev server in this checkout before running it.
async function freePort() {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return address.port;
}

async function main() {
  const args = process.argv.slice(2);
  const recipient = args[args.indexOf("--to") + 1];
  const reportPath = args[args.indexOf("--report") + 1];
  assert.ok(
    args.includes("--send-one-live-email"),
    "Explicit live-send flag required.",
  );
  assert.ok(
    args.includes("--to") && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipient),
  );
  assert.ok(args.includes("--report") && path.isAbsolute(reportPath));
  // Refuse reuse: a failure after sending must not accidentally send again.
  await (await open(reportPath, "wx", 0o600)).close();
  const report: Record<string, unknown> = {
    startedAt: new Date().toISOString(),
    sent: false,
  };
  const saveReport = () =>
    writeFile(reportPath, JSON.stringify(report, null, 2), { mode: 0o600 });
  config({ path: ".env.local", quiet: true });
  config({ quiet: true });
  assert.match(process.env.RESEND_API_KEY ?? "", /^re_[A-Za-z0-9_-]{20,}$/);
  assert.ok(
    !process.env.CI && !process.env.VERCEL,
    "Local certification only.",
  );
  const directory = await mkdtemp("/tmp/orb-live-invite-");
  const cluster = path.join(directory, "postgres");
  const pgPort = await freePort();
  const appPort = await freePort();
  const origin = `http://127.0.0.1:${appPort}`;
  const databaseUrl = `postgresql://postgres@127.0.0.1:${pgPort}/onroadbooks_contract_drizzle`;
  Object.assign(process.env, {
    NODE_ENV: "development",
    DATA_SOURCE: "neon",
    AUTH_PROVIDER: "authjs",
    NEON_DATABASE_URL: databaseUrl,
    NEON_DIRECT_URL: databaseUrl,
    DATABASE_URL: databaseUrl,
    DIRECT_URL: databaseUrl,
    AUTH_URL: origin,
    NEXT_PUBLIC_APP_URL: origin,
    AUTH_SECRET: randomBytes(48).toString("base64url"),
    AUTH_GOOGLE_ID: "",
    AUTH_GOOGLE_SECRET: "",
    NEXT_PUBLIC_GOOGLE_CLIENT_ID: "",
    AUTH_EMAIL_FROM: "OnRoad Books <no-reply@onroadbooks.com>",
    DOCUMENT_STORAGE: "local",
    ONROAD_DISPOSABLE_DATABASE: "1",
    SUPABASE_URL: "http://127.0.0.1:1",
    SUPABASE_SECRET_KEY: "disabled",
    STRIPE_SECRET_KEY: "",
    ANTHROPIC_API_KEY: "",
  });
  const run = (name: string, args: string[]) => {
    assert.equal(
      spawnSync(pgBinary(name), args, { stdio: "pipe" }).status,
      0,
      `${name} failed`,
    );
  };
  let started = false;
  let app: ChildProcess | undefined;
  const client = new Client({ connectionString: databaseUrl });
  const originalFetch = globalThis.fetch;
  try {
    run("initdb", [
      "-D",
      cluster,
      "-A",
      "trust",
      "-U",
      "postgres",
      "--no-locale",
      "--encoding=UTF8",
    ]);
    run("pg_ctl", [
      "-D",
      cluster,
      "-l",
      path.join(directory, "postgres.log"),
      "-o",
      `-h 127.0.0.1 -p ${pgPort} -k ${directory}`,
      "start",
      "-w",
    ]);
    started = true;
    run("createdb", [
      "-h",
      "127.0.0.1",
      "-p",
      String(pgPort),
      "-U",
      "postgres",
      "onroadbooks_contract_drizzle",
    ]);
    await client.connect();
    await migrate(drizzle(client), { migrationsFolder: "drizzle" });
    const { getAuthStore } = await import("../src/lib/db");
    const { inviteAuthUser } = await import("../src/lib/auth/provider-admin");
    const { verifyPassword } = await import("../src/lib/auth/session");
    const store = getAuthStore();
    const owner = await store.createOwner({
      email: "certification-owner@example.test",
      passwordHash: "certification$disabled",
    });
    const member = await store.createMember({
      businessId: owner.businessId,
      email: recipient,
      name: "Invitation certification",
      role: "VIEWER",
    });
    const log = await open(path.join(directory, "next.log"), "w", 0o600);
    app = spawn(
      process.execPath,
      [
        "node_modules/next/dist/bin/next",
        "dev",
        "--hostname",
        "127.0.0.1",
        "--port",
        String(appPort),
      ],
      {
        // The app cannot send any additional mail; only this harness has the key.
        env: { ...process.env, RESEND_API_KEY: "", NODE_OPTIONS: "" },
        stdio: ["ignore", log.fd, log.fd],
      },
    );
    await log.close();
    let ready = false;
    for (let attempt = 0; attempt < 90; attempt++) {
      try {
        ready = (
          await originalFetch(`${origin}/invite/accept`, {
            signal: AbortSignal.timeout(5_000),
          })
        ).ok;
      } catch {
        /* Server is starting. */
      }
      if (ready || app.exitCode !== null) break;
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    assert.ok(
      ready,
      "Isolated application failed to start; no email was sent.",
    );
    let token = "";
    let sendAttempts = 0;
    globalThis.fetch = async (input, init) => {
      assert.equal(input, "https://api.resend.com/emails");
      assert.equal(++sendAttempts, 1, "Only one live email is allowed.");
      const payload = JSON.parse(String(init?.body));
      assert.deepEqual(payload.to, [recipient]);
      const link = String(payload.text)
        .split("\n")
        .find((line) => line.startsWith(`${origin}/invite/accept#`));
      assert.ok(link, "Invitation link must target the disposable local app.");
      token =
        new URLSearchParams(new URL(link).hash.slice(1)).get("token") ?? "";
      assert.match(token, /^[A-Za-z0-9_-]{43}$/);
      report.sendAttempted = true;
      await saveReport();
      const result = await originalFetch(input, init);
      report.sendStatus = result.status;
      if (result.ok) {
        report.emailId = (await result.clone().json()).id;
        report.sent = true;
      }
      await saveReport();
      return result;
    };
    await inviteAuthUser(recipient, `${origin}/invite/accept`);
    globalThis.fetch = originalFetch;
    const password = randomBytes(24).toString("base64url");
    const post = (route: string, body: object, requestOrigin = origin) =>
      originalFetch(`${origin}${route}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: requestOrigin },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
        redirect: "manual",
      });
    assert.equal(
      (
        await post(
          "/api/auth/invite/accept",
          { token, password },
          "https://untrusted.example",
        )
      ).status,
      403,
    );
    const accepted = await post("/api/auth/invite/accept", { token, password });
    assert.equal(accepted.status, 200, "Invitation acceptance failed.");
    const cookie = accepted.headers
      .getSetCookie()
      .find((value) => value.startsWith("authjs.session-token="));
    assert.ok(cookie, "Auth.js session cookie is required.");
    assert.ok(
      cookie.includes("HttpOnly"),
      "Auth.js must issue an HttpOnly session.",
    );
    const dashboard = await originalFetch(`${origin}/dashboard`, {
      headers: { Cookie: cookie.split(";")[0] },
      redirect: "manual",
      signal: AbortSignal.timeout(60_000),
    });
    assert.equal(dashboard.status, 200, "Authenticated dashboard failed.");
    await dashboard.body?.cancel();
    const joined = await store.findUserById(member.id);
    assert.equal(joined?.businessId, owner.businessId);
    assert.equal(joined?.role, "VIEWER");
    assert.ok(joined?.joinedAt);
    assert.ok(await verifyPassword(password, joined.passwordHash));
    assert.equal(
      (await post("/api/auth/invite/accept", { token, password })).status,
      401,
    );
    assert.equal(
      (await post("/api/auth/login", { email: recipient, password })).status,
      200,
    );
    assert.equal(
      (
        await post("/api/auth/login", {
          email: recipient,
          password: "incorrect-password",
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await client.query(
          'SELECT count(*)::int AS n FROM onroad_auth."Invitation"',
        )
      ).rows[0].n,
      0,
    );
    Object.assign(report, {
      passed: true,
      checks: [
        "real email accepted",
        "cross-origin refused",
        "invitation accepted",
        "HttpOnly Auth.js session",
        "dashboard authenticated",
        "workspace and VIEWER role preserved",
        "password hashed",
        "replay refused",
        "password login",
        "wrong password refused",
        "token consumed",
      ],
    });
    console.log("Auth.js live invitation certification passed.");
  } finally {
    globalThis.fetch = originalFetch;
    if (app && app.exitCode === null) {
      const stopped = new Promise<void>((resolve) =>
        app!.once("exit", () => resolve()),
      );
      app.kill("SIGTERM");
      await stopped;
    }
    const { closeNeonDatabase } = await import("../src/db");
    await closeNeonDatabase();
    await client.end();
    if (started) run("pg_ctl", ["-D", cluster, "stop", "-m", "fast", "-w"]);
    await rm(directory, { recursive: true, force: true });
    report.disposableDatabaseRemoved = true;
    await saveReport();
    console.log(`Non-secret certification report: ${reportPath}`);
  }
}
main().catch((error) => {
  console.error(
    "Invitation certification failed:",
    error instanceof Error ? error.message : "unknown error",
  );
  process.exitCode = 1;
});
