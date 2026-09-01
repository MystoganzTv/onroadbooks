import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

import { Prisma, PrismaClient } from "../src/generated/prisma";

import { APPLICATION_TABLES, databaseUrl, pgBinary, run } from "./lib/postgres";

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  assert(address && typeof address !== "string");
  const port = address.port;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function fingerprint(client: PrismaClient, table: string) {
  assert.match(table, /^[A-Za-z][A-Za-z0-9]*$/);
  const [row] = await client.$queryRawUnsafe<Array<{ count: bigint; checksum: string }>>(`
    select
      count(*)::bigint as count,
      md5(coalesce(string_agg(row_to_json(t)::text, '' order by row_to_json(t)::text), '')) as checksum
    from public."${table}" t
  `);
  return { count: Number(row?.count ?? 0), checksum: row?.checksum ?? "" };
}

async function verifyRestore(sourceUrl: string, restoredUrl: string): Promise<void> {
  const source = new PrismaClient({ datasourceUrl: sourceUrl });
  const restored = new PrismaClient({ datasourceUrl: restoredUrl });
  try {
    await Promise.all([
      source.$executeRawUnsafe("set time zone 'UTC'"),
      restored.$executeRawUnsafe("set time zone 'UTC'"),
    ]);

    let rows = 0;
    for (const table of APPLICATION_TABLES) {
      const [expected, actual] = await Promise.all([
        fingerprint(source, table),
        fingerprint(restored, table),
      ]);
      assert.deepEqual(actual, expected, `${table} restored with identical rows`);
      rows += actual.count;
    }

    const rls = await restored.$queryRaw<Array<{ tables: bigint; protected: bigint }>>`
      select
        count(*)::bigint as tables,
        count(*) filter (where c.relrowsecurity)::bigint as protected
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind = 'r'
        and c.relname in (${Prisma.join(APPLICATION_TABLES)})
    `;
    assert.equal(Number(rls[0]?.tables ?? 0), APPLICATION_TABLES.length);
    assert.equal(Number(rls[0]?.protected ?? 0), APPLICATION_TABLES.length);

    console.log("Backup restore certification:", {
      tables: APPLICATION_TABLES.length,
      rows,
      checksums: "identical",
      rls: "preserved",
      destination: "disposable local PostgreSQL",
    });
  } finally {
    await Promise.allSettled([source.$disconnect(), restored.$disconnect()]);
  }
}

async function main() {
  const configuredUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!configuredUrl?.startsWith("postgres")) {
    throw new Error("DIRECT_URL or DATABASE_URL is required");
  }

  const sourceUrl = databaseUrl(configuredUrl);
  const workDir = await mkdtemp(path.join(tmpdir(), "onroadbooks-restore-cert-"));
  const clusterDir = path.join(workDir, "postgres");
  const dumpPath = path.join(workDir, "production-public.dump");
  const logPath = path.join(workDir, "postgres.log");
  const port = await freePort();
  const binaries = {
    initdb: pgBinary("initdb"),
    pgCtl: pgBinary("pg_ctl"),
    createdb: pgBinary("createdb"),
    dump: pgBinary("pg_dump"),
    restore: pgBinary("pg_restore"),
  };
  let started = false;

  try {
    run(binaries.initdb, ["-D", clusterDir, "-A", "trust", "-U", "postgres", "--no-locale", "--encoding=UTF8"], "initdb");
    run(
      binaries.pgCtl,
      ["-D", clusterDir, "-l", logPath, "-o", `-h 127.0.0.1 -p ${port}`, "start", "-w"],
      "temporary PostgreSQL start",
    );
    started = true;

    run(
      binaries.dump,
      ["--dbname", sourceUrl, "--format=custom", "--file", dumpPath, "--schema=public", "--no-owner", "--no-privileges"],
      "production logical backup",
    );
    await chmod(dumpPath, 0o600);

    run(
      binaries.createdb,
      ["--host", "127.0.0.1", "--port", String(port), "--username", "postgres", "onroadbooks_restore"],
      "restore database creation",
    );
    const restoredUrl = `postgresql://postgres@127.0.0.1:${port}/onroadbooks_restore?schema=public`;
    run(
      binaries.restore,
      ["--dbname", databaseUrl(restoredUrl), "--exit-on-error", "--no-owner", "--no-privileges", dumpPath],
      "logical backup restore",
    );
    await verifyRestore(sourceUrl, restoredUrl);
  } finally {
    if (started) {
      spawnSync(binaries.pgCtl, ["-D", clusterDir, "stop", "-m", "fast", "-w"], { stdio: "ignore" });
    }
    await rm(workDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error("Backup restore certification failed:", error);
  process.exitCode = 1;
});
