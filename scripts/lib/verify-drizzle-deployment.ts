import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Client } from "pg";
import { schemaCatalog } from "./schema-catalog";

/** Compare the installed schema and migration hashes to SQL under version control. All temporary DDL rolls back. */
export async function verifyDrizzleDeployment(client: Client) {
  const journal = JSON.parse(
    await readFile("drizzle/meta/_journal.json", "utf8"),
  ) as { entries: Array<{ tag: string; when: number }> };
  const reference = `verify_deploy_${randomUUID().replaceAll("-", "")}`;
  const auth = `${reference}_auth`;
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL statement_timeout = '30s'");
    await client.query(`CREATE SCHEMA "${reference}"`);
    await client.query(`SET LOCAL search_path TO "${reference}"`);
    const expectedHistory = [];
    for (const entry of journal.entries) {
      assert.match(entry.tag, /^[a-z0-9_-]+$/);
      const sql = await readFile(`drizzle/${entry.tag}.sql`, "utf8");
      expectedHistory.push({
        hash: createHash("sha256").update(sql).digest("hex"),
        created_at: String(entry.when),
      });
      await client.query(
        sql
          .replaceAll('"public".', `"${reference}".`)
          .replaceAll('"onroad_auth"', `"${auth}"`),
      );
    }
    await client.query("SET LOCAL search_path TO pg_catalog");
    const normalize = (value: unknown) =>
      JSON.stringify(value)
        .replaceAll(`${reference}.`, "public.")
        .replaceAll(`\\"${reference}\\".`, "public.");
    for (const [target, expected] of [
      ["public", reference],
      ["onroad_auth", auth],
    ]) {
      assert.ok(
        normalize(await schemaCatalog(client, target)) ===
          normalize(await schemaCatalog(client, expected)),
        `Deployed ${target} schema differs from versioned migrations.`,
      );
    }
    const history = (
      await client.query(
        "SELECT hash, created_at::text FROM drizzle.__drizzle_migrations ORDER BY created_at",
      )
    ).rows;
    assert.ok(
      JSON.stringify(history) === JSON.stringify(expectedHistory),
      "Drizzle migration history differs from versioned SQL.",
    );
    // PUBLIC must not be able to use the private authentication namespace.
    const acl = await client.query(
      "SELECT 1 FROM pg_namespace n CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a WHERE n.nspname='onroad_auth' AND a.grantee=0",
    );
    assert.equal(
      acl.rowCount,
      0,
      "Private authentication schema grants access to PUBLIC.",
    );
    return {
      businessTables: 20,
      authTables: 4,
      migrations: journal.entries.length,
    };
  } finally {
    await client.query("ROLLBACK");
  }
}
