import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { Client } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { verifyDrizzleDeployment } from "./lib/verify-drizzle-deployment";
import { pgBinary } from "./lib/postgres";

async function main() {
  const listener = createServer();
  await new Promise<void>((resolve, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", resolve);
  });
  const address = listener.address();
  assert.ok(address && typeof address !== "string");
  const port = address.port;
  await new Promise<void>((resolve, reject) =>
    listener.close((error) => (error ? reject(error) : resolve())),
  );
  const directory = await mkdtemp("/tmp/orb-contract-");
  const cluster = path.join(directory, "postgres");
  const pgCtl = pgBinary("pg_ctl");
  let started = false;
  const run = (binary: string, args: string[]) => {
    const result = spawnSync(binary, args, { stdio: "pipe" });
    assert.equal(result.status, 0, `${path.basename(binary)} failed`);
  };
  try {
    run(pgBinary("initdb"), [
      "-D",
      cluster,
      "-A",
      "trust",
      "-U",
      "postgres",
      "--no-locale",
      "--encoding=UTF8",
    ]);
    run(pgCtl, [
      "-D",
      cluster,
      "-l",
      path.join(directory, "postgres.log"),
      "-o",
      `-h 127.0.0.1 -p ${port} -k ${directory}`,
      "start",
      "-w",
    ]);
    started = true;
    const browser = process.argv.includes("--browser");
    for (const backend of browser ? ["drizzle"] : ["prisma", "drizzle"]) {
      const database = `onroadbooks_contract_${backend}`;
      run(pgBinary("createdb"), [
        "--host",
        "127.0.0.1",
        "--port",
        String(port),
        "--username",
        "postgres",
        database,
      ]);
      const url = `postgresql://postgres@127.0.0.1:${port}/${database}`;
      const client = new Client({ connectionString: url });
      await client.connect();
      try {
        await migrate(drizzle(client), { migrationsFolder: "drizzle" });
        await verifyDrizzleDeployment(client);
        if (backend === "drizzle") {
          await client.query(
            'ALTER TABLE public."Document" ADD COLUMN "verificationOnly" text',
          );
          try {
            await assert.rejects(
              verifyDrizzleDeployment(client),
              /schema differs/,
            );
          } finally {
            await client.query(
              'ALTER TABLE public."Document" DROP COLUMN "verificationOnly"',
            );
          }
          const [first] = (
            await client.query(
              "SELECT id,hash FROM drizzle.__drizzle_migrations ORDER BY id LIMIT 1",
            )
          ).rows;
          await client.query(
            "UPDATE drizzle.__drizzle_migrations SET hash=$1 WHERE id=$2",
            ["tampered", first.id],
          );
          try {
            await assert.rejects(
              verifyDrizzleDeployment(client),
              /history differs/,
            );
          } finally {
            await client.query(
              "UPDATE drizzle.__drizzle_migrations SET hash=$1 WHERE id=$2",
              [first.hash, first.id],
            );
          }
        }
      } finally {
        await client.end();
      }
      console.log(
        `Running shared behavioural contract against ${backend} (disposable local PostgreSQL)`,
      );
      const child = spawn(
        process.execPath,
        browser
          ? [
              "node_modules/@playwright/test/cli.js",
              "test",
              "--config=playwright.database.config.ts",
            ]
          : [
              "--conditions=react-server",
              "--import",
              "tsx",
              "--test",
              "src/lib/__tests__/store-behaviour.test.ts",
            ],
        {
          stdio: "inherit",
          env: {
            ...process.env,
            DATABASE_URL: url,
            DIRECT_URL: url,
            NEON_DATABASE_URL: url,
            ONROAD_TEST_BACKEND: backend,
            ONROAD_DISPOSABLE_DATABASE: "1",
            PLAYWRIGHT_BROWSERS_PATH: "0",
          },
        },
      );
      const code = await new Promise<number | null>((resolve, reject) => {
        child.once("error", reject);
        child.once("exit", resolve);
      });
      assert.equal(code, 0, `${backend} contract failed`);
    }
  } finally {
    if (started) {
      const result = spawnSync(
        pgCtl,
        ["-D", cluster, "stop", "-m", "fast", "-w"],
        { stdio: "pipe" },
      );
      if (result.status !== 0)
        throw new Error(`Could not stop temporary database at ${directory}`);
    }
    await rm(directory, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
