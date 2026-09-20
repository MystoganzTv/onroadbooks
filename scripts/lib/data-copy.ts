import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { Client } from "pg";
import { APPLICATION_TABLES } from "./postgres";
import { schemaCatalog } from "./schema-catalog";

const tables = [...APPLICATION_TABLES].sort();
export const quoteIdentifier = (name: string) => `"${name.replaceAll('"', '""')}"`;
const relation = (schema: string, table: string) => `${quoteIdentifier(schema)}.${quoteIdentifier(table)}`;

type Column = { name: string; type: string };
type Catalog = Awaited<ReturnType<typeof schemaCatalog>>;
export type TableManifest = {
  rows: number;
  sha256: string;
  businessCounts: { business_id: string | null; count: string }[];
  numericSums: Record<string, string | null>;
};

export function applicationCatalog(catalog: Catalog): Catalog {
  const result = Object.fromEntries(Object.entries(catalog).map(([key, rows]) => [key,
    rows.filter((row) => row.table_name !== "_prisma_migrations"),
  ]));
  assert.deepEqual([...new Set(result.columns.map((row) => row.table_name))].sort(), tables,
    "The source and destination must contain exactly the 20 application tables.");
  return result;
}

export function dependencyOrder(names: string[], edges: { child: string; parent: string }[]): string[] {
  const remaining = new Set(names);
  const ordered: string[] = [];
  while (remaining.size) {
    const ready = [...remaining].filter((name) => !edges.some((edge) => edge.child === name && remaining.has(edge.parent))).sort();
    assert.ok(ready.length, "Cyclic foreign keys require a reviewed copy strategy.");
    for (const name of ready) { ordered.push(name); remaining.delete(name); }
  }
  return ordered;
}

export async function prepareCopy(source: Client, target: Client, sourceSchema = "public", targetSchema = "public") {
  // Independent schema names also let the smoke test use only disposable fixtures.
  for (const client of [source, target]) {
    await client.query("SET LOCAL search_path TO pg_catalog");
    await client.query("SET LOCAL timezone TO 'UTC'");
    await client.query("SET LOCAL datestyle TO 'ISO, YMD'");
    await client.query("SET LOCAL row_security TO off");
    await client.query("SET LOCAL statement_timeout = '60s'");
    await client.query("SET LOCAL lock_timeout = '10s'");
  }
  // Hold table definitions stable through the snapshot/copy.
  await source.query(`LOCK TABLE ${tables.map((name) => relation(sourceSchema, name)).join(", ")} IN ACCESS SHARE MODE`);
  const expected = applicationCatalog(await schemaCatalog(source, sourceSchema));
  const actual = applicationCatalog(await schemaCatalog(target, targetSchema));
  assert.deepEqual(actual, expected, "Source schema differs from Neon; stop before copying data.");
  for (const [client, schema] of [[source, sourceSchema], [target, targetSchema]] as const) {
    const { rows } = await client.query(`SELECT c.relname FROM pg_trigger t
      JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname=$1 AND NOT t.tgisinternal AND t.tgenabled <> 'D'`, [schema]);
    assert.equal(rows.length, 0, "Application triggers require review before copying.");
  }
  const { rows: edges } = await source.query<{ child: string; parent: string }>(`SELECT c.relname AS child, p.relname AS parent
    FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid
    JOIN pg_class p ON p.oid=con.confrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname=$1 AND con.contype='f'`, [sourceSchema]);
  const columns = Object.fromEntries(tables.map((table) => [table,
    expected.columns.filter((row) => row.table_name === table).map((row) => ({ name: String(row.name), type: String(row.type) })),
  ]));
  return { order: dependencyOrder(tables, edges), columns, sourceSchema, targetSchema };
}

export type CopyPlan = Awaited<ReturnType<typeof prepareCopy>>;

async function summary(client: Client, schema: string, table: string, columns: Column[]) {
  const ref = relation(schema, table);
  const businessColumn = table === "Business" ? "id" : columns.some((c) => c.name === "businessId") ? "businessId" : null;
  // Settlement children inherit tenancy through DriverSettlement.
  const children = ["DriverSettlementLine", "DriverSettlementAdjustment"].includes(table);
  const scope = businessColumn ? `t.${quoteIdentifier(businessColumn)}` : children ? 's."businessId"' : "NULL::text";
  const join = children ? ` LEFT JOIN ${relation(schema, "DriverSettlement")} s ON s.id=t."settlementId"` : "";
  const businessCounts = (await client.query<{ business_id: string | null; count: string }>(
    `SELECT ${scope} AS business_id, count(*)::text AS count FROM ${ref} t${join} GROUP BY 1 ORDER BY ${scope} COLLATE "C" NULLS FIRST`,
  )).rows;
  const numeric = columns.filter((c) => c.type.startsWith("numeric"));
  const numericSums: Record<string, string | null> = numeric.length ? (await client.query(
    `SELECT ${numeric.map((c) => `sum(${quoteIdentifier(c.name)})::text AS ${quoteIdentifier(c.name)}`).join(", ")} FROM ${ref}`,
  )).rows[0] : {};
  return { businessCounts, numericSums };
}

async function scan(client: Client, schema: string, table: string, columns: Column[], onBatch?: (rows: (string | null)[][]) => Promise<void>) {
  const hash = createHash("sha256");
  let count = 0;
  // Every value is PostgreSQL text, never JS Number/Date/JSON. This preserves
  // decimals, microseconds, JSON null versus SQL NULL, and large JSON numbers.
  await client.query(`DECLARE copy_rows NO SCROLL CURSOR FOR SELECT ${columns.map((c) => `${quoteIdentifier(c.name)}::text`).join(", ")}
    FROM ${relation(schema, table)} ORDER BY "id" COLLATE "C"`);
  try {
    while (true) {
      const { rows } = await client.query<(string | null)[]>({ text: "FETCH FORWARD 200 FROM copy_rows", rowMode: "array" });
      if (!rows.length) break;
      for (const row of rows) { hash.update(JSON.stringify(row) + "\n"); count++; }
      if (onBatch) await onBatch(rows);
    }
  } finally {
    // Preserve the original SQL error when a failed insert has aborted the transaction.
    await client.query("CLOSE copy_rows").catch(() => undefined);
  }
  return { rows: count, sha256: hash.digest("hex"), ...await summary(client, schema, table, columns) };
}

export async function manifest(client: Client, plan: CopyPlan, side: "source" | "target") {
  const result: Record<string, TableManifest> = {};
  const schema = side === "source" ? plan.sourceSchema : plan.targetSchema;
  for (const table of tables) result[table] = await scan(client, schema, table, plan.columns[table]);
  return result;
}

/** Caller owns both transactions and MUST rollback on any error. Never upserts/deletes. */
export async function copyData(source: Client, target: Client, plan: CopyPlan) {
  await target.query(`LOCK TABLE ${tables.map((name) => relation(plan.targetSchema, name)).join(", ")} IN SHARE ROW EXCLUSIVE MODE`);
  for (const table of tables) {
    const result = await target.query(`SELECT 1 FROM ${relation(plan.targetSchema, table)} LIMIT 1`);
    assert.equal(result.rowCount, 0, `Destination table ${table} is not empty. Refusing to overwrite.`);
  }
  const expected: Record<string, TableManifest> = {};
  for (const table of plan.order) {
    const columns = plan.columns[table];
    expected[table] = await scan(source, plan.sourceSchema, table, columns, async (rows) => {
      const placeholders = rows.map((row, i) => `(${row.map((_, j) => `$${i * columns.length + j + 1}`).join(", ")})`);
      await target.query(`INSERT INTO ${relation(plan.targetSchema, table)} (${columns.map((c) => quoteIdentifier(c.name)).join(", ")}) VALUES ${placeholders.join(", ")}`, rows.flat());
    });
  }
  const actual = await manifest(target, plan, "target");
  assert.deepEqual(actual, expected, "Reconciliation failed; rollback is mandatory.");
  return actual;
}
