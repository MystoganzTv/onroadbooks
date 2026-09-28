import "dotenv/config";
import assert from "node:assert/strict";
import { Client } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { verifyDrizzleDeployment } from "./lib/verify-drizzle-deployment";

// Run only on a disposable child branch. Reuse the inherited role credential;
// do not print or overwrite the existing production connection string.
async function main() {
  const source = new URL(process.env.NEON_DIRECT_URL!);
  const host = process.env.ONROAD_MIGRATION_TEST_HOST ?? "";
  assert.equal(process.env.ONROAD_DISPOSABLE_NEON_BRANCH, "1");
  assert.ok(host.endsWith(".neon.tech") && !host.includes("-pooler") && host !== source.hostname);
  source.hostname = host;
  const client = new Client({ connectionString: source.toString(), connectionTimeoutMillis: 15000 });
  await client.connect();
  try {
    const tables = (await client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name`)).rows.map(row => row.table_name as string);
    const counts = async () => Promise.all(tables.map(async name => (await client.query(`SELECT count(*)::text AS count FROM "${name.replaceAll('"', '""')}"`)).rows[0].count));
    const before = await counts();
    await migrate(drizzle(client), { migrationsFolder: "drizzle" });
    assert.deepEqual(await counts(), before, "Migration must preserve every existing row");
    await verifyDrizzleDeployment(client);
    const columns = await client.query(`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('AppleBillingAccount','ApplePurchase')`);
    assert.equal(columns.rowCount, 7);
    console.log(JSON.stringify({ migrated: true, schemaVerified: true, existingTablesPreserved: tables.length, branchHost: host }));
  } finally { await client.end(); }
}
main().catch(() => { console.error("Isolated Apple billing migration verification failed; credentials withheld."); process.exitCode = 1; });
