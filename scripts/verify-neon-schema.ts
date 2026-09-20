import "dotenv/config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { Client } from "pg";

import { resolveNeonMigrationUrl } from "../src/db/connection-url";
import { schemaCatalog } from "./lib/schema-catalog";

async function main() {
  const url = new URL(resolveNeonMigrationUrl(process.env));
  assert.ok(url.hostname.endsWith(".neon.tech"), "Use the isolated Neon destination.");
  assert.ok(!url.hostname.includes("-pooler"), "Schema verification requires a direct URL.");
  const client = new Client({ connectionString: url.toString(), connectionTimeoutMillis: 10_000 });
  const suffix = randomUUID().replaceAll("-", "");
  const reference = `verify_prisma_${suffix}`;
  const candidate = `verify_drizzle_${suffix}`;
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout = '30s'");
    // Only transaction-local schemas are created. ROLLBACK removes both even on failure.
    for (const schema of [reference, candidate]) {
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET LOCAL search_path TO "${schema}"`);
      const statements = schema === reference
        ? readdirSync("prisma/migrations").sort()
          .map((folder) => `prisma/migrations/${folder}/migration.sql`)
          .filter(existsSync).map((file) => readFileSync(file, "utf8")
            .replace('CREATE SCHEMA IF NOT EXISTS "public";', ""))
        : readdirSync("drizzle").filter((file) => file.endsWith(".sql")).sort()
          .map((file) => readFileSync(`drizzle/${file}`, "utf8")
            .replaceAll('"public".', `"${schema}".`)
            .replaceAll('"onroad_auth"', `"${schema}_auth"`));
      assert.ok(statements.length > 0, "Migration SQL is required.");
      for (const statement of statements) await client.query(statement);
    }
    await client.query("SET LOCAL search_path TO pg_catalog");
    const expected = await schemaCatalog(client, reference);
    // The deployed source appended these labels historically; enum order is
    // semantically significant. Preserve the audited source order explicitly.
    const sourceOrder: Record<string, string[]> = JSON.parse(readFileSync("docs/migrations/source-enum-order.json", "utf8"));
    for (const [name, values] of Object.entries(sourceOrder)) {
      assert.deepEqual(expected.enums.filter((row) => row.name === name).map((row) => row.value).sort(), [...values].sort());
      expected.enums = expected.enums.filter((row) => row.name !== name).concat(values.map((value, index) => ({ name, value, position: index + 1 })));
    }
    expected.enums.sort((a, b) => String(a.name).localeCompare(String(b.name)) || Number(a.position) - Number(b.position));
    const actual = await schemaCatalog(client, candidate);
    assert.deepEqual(actual, expected, "Drizzle must preserve the versioned schema with the audited source enum order.");
    const counts = {
      tables: new Set(actual.columns.map((row) => row.table_name)).size,
      columns: actual.columns.length,
      enums: new Set(actual.enums.map((row) => row.name)).size,
      foreignKeys: actual.constraints.filter((row) => row.type === "f").length,
      checks: actual.constraints.filter((row) => row.type === "c").length,
      indexesIncludingPrimaryKeys: actual.indexes.length,
    };
    assert.equal(counts.tables, 20);
    assert.equal(counts.enums, 22);
    assert.equal(counts.foreignKeys, 42);
    assert.equal(counts.checks, 3);
    console.log("Catalog parity passed (versioned schema plus audited source enum order):", counts);
    if (process.argv.includes("--deployed")) {
      assert.deepEqual(await schemaCatalog(client, "public"), expected,
        "Deployed Neon schema must match the versioned baseline.");
      console.log("Deployed Neon public schema matches the source-aligned baseline.");
    }
  } finally {
    try { await client.query("ROLLBACK"); } finally { await client.end(); }
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Schema verification failed.");
  process.exitCode = 1;
});
