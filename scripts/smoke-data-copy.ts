import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { Client } from "pg";
import { copyData, manifest, prepareCopy, quoteIdentifier as q } from "./lib/data-copy";

async function main() {
  const url = new URL(process.env.NEON_DIRECT_URL ?? "");
  url.searchParams.set("sslmode", "verify-full");
  assert.ok(url.hostname.endsWith(".neon.tech") && !url.hostname.includes("-pooler"));
  const client = new Client({ connectionString: url.toString(), connectionTimeoutMillis: 15_000 });
  const suffix = randomUUID().replaceAll("-", "");
  const source = `copy_source_${suffix}`;
  const target = `copy_target_${suffix}`;
  await client.connect();
  try {
    await client.query("BEGIN");
    for (const schema of [source, target]) {
      await client.query(`CREATE SCHEMA ${q(schema)}`);
      await client.query(`SET LOCAL search_path TO ${q(schema)}`);
      for (const file of readdirSync("drizzle").filter((file) => file.endsWith(".sql")).sort()) {
        await client.query(readFileSync(`drizzle/${file}`, "utf8").replaceAll('"public".', `${q(schema)}.`));
      }
    }
    await client.query(`SET LOCAL search_path TO ${q(source)}`);
    await client.query(`INSERT INTO "Business" (id,name,"updatedAt") VALUES ('business','Private fixture','2001-02-03 04:05:06.789')`);
    await client.query(`INSERT INTO "User" (id,email,"passwordHash","businessId",role,"updatedAt") VALUES ('user','fixture@example.test','scrypt:preserve','business','VIEWER','2001-02-03 04:05:06.789')`);
    await client.query(`INSERT INTO "Truck" (id,"businessId",name,"acquiredOn","operatingCostExemptions","updatedAt") VALUES ('truck','business','Truck','2020-02-29','{"large":9007199254740993}','2001-02-03')`);
    await client.query(`INSERT INTO "Driver" (id,"businessId",name,"payType","payRate","updatedAt") VALUES ('driver','business','Driver','PER_TOTAL_MILE',0.1234,'2001-02-03')`);
    await client.query(`INSERT INTO "Load" (id,"businessId","truckId",date,"originCity","originState","destinationCity","destinationState","loadedMiles","grossRate","updatedAt") SELECT 'load-'||i,'business','truck','2020-02-29','A','FL','B','GA',5,9999999999.99,'2001-02-03' FROM generate_series(1,205) i`);
    await client.query(`INSERT INTO "Settlement" (id,"businessId",month,half,"periodStart","periodEnd",snapshot,"updatedAt") VALUES ('sql-null','business','2020-02','FIRST','2020-02-01','2020-02-15',NULL,'2001-02-03'),('json-null','business','2020-02','SECOND','2020-02-16','2020-02-29','null','2001-02-03')`);
    const plan = await prepareCopy(client, client, source, target);
    await client.query("SAVEPOINT first_copy");
    const result = await copyData(client, client, plan);
    assert.equal(result.Load.rows, 205);
    assert.equal(result.Load.numericSums.grossRate, "2049999999997.95");
    assert.equal(result.Driver.numericSums.payRate, "0.1234");
    assert.equal(result.Load.businessCounts[0].count, "205");
    assert.deepEqual(await manifest(client, plan, "source"), result);
    const nulls = await client.query(`SELECT id, snapshot IS NULL AS sql_null FROM ${q(target)}."Settlement" ORDER BY id`);
    assert.deepEqual(nulls.rows, [{id:"json-null",sql_null:false},{id:"sql-null",sql_null:true}]);
    const json = await client.query(`SELECT "operatingCostExemptions"::text AS value FROM ${q(target)}."Truck"`);
    assert.ok(json.rows[0].value.includes("9007199254740993"));
    const dates = await client.query(`SELECT "updatedAt"::text AS timestamp FROM ${q(target)}."Business"`);
    assert.equal(dates.rows[0].timestamp, "2001-02-03 04:05:06.789");
    await assert.rejects(copyData(client, client, plan), /not empty/);
    await client.query("ROLLBACK TO SAVEPOINT first_copy");
    assert.equal((await client.query(`SELECT count(*)::text AS count FROM ${q(target)}."Load"`)).rows[0].count, "0");
    // A late target constraint failure must leave no partial data after rollback.
    await client.query(`ALTER TABLE ${q(target)}."Load" ADD CONSTRAINT injected_failure CHECK ("grossRate" < 1)`);
    await client.query("SAVEPOINT failing_copy");
    await assert.rejects(copyData(client, client, plan), (error: unknown) => Boolean(error && typeof error === "object" && "code" in error && error.code === "23514"));
    await client.query("ROLLBACK TO SAVEPOINT failing_copy");
    assert.equal((await client.query(`SELECT count(*)::text AS count FROM ${q(target)}."Business"`)).rows[0].count, "0");
    await assert.rejects(prepareCopy(client, client, source, target), /Source schema differs/);
    console.log("Copy smoke passed: 211 rows, multiple batches, exact decimals/JSON/nulls/dates, tenancy counts, nonempty refusal, rollback on failure and schema drift.");
  } finally { try { await client.query("ROLLBACK"); } finally { await client.end(); } }
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Copy smoke failed"); process.exitCode = 1; });
