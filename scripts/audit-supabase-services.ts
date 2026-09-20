import { config } from "dotenv";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";
import { databaseUrl } from "./lib/postgres";
config({ path: ".env.local" });
config();
async function main() {
  const url = new URL(databaseUrl(process.env.DIRECT_URL ?? ""));
  const project = "uznuvzeghgwygpxjhqdz";
  assert.ok(
    url.hostname === `db.${project}.supabase.co` ||
      (url.hostname.endsWith(".pooler.supabase.com") &&
        decodeURIComponent(url.username) === `postgres.${project}` &&
        url.port === "5432"),
  );
  url.searchParams.set("sslmode", "verify-full");
  if (process.env.MIGRATION_SOURCE_CA_CERT)
    url.searchParams.set("sslrootcert", process.env.MIGRATION_SOURCE_CA_CERT);
  const directory = path.resolve(process.env.MIGRATION_REPORT_DIR ?? "");
  assert.ok(
    process.env.MIGRATION_REPORT_DIR &&
      directory !== path.resolve(".") &&
      !directory.startsWith(path.resolve(".") + path.sep),
  );
  const client = new Client({
    connectionString: url.toString(),
    connectionTimeoutMillis: 15_000,
  });
  try {
    await client.connect();
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const queries = {
      schemas:
        "SELECT nspname FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname <> 'information_schema' ORDER BY nspname",
      routines:
        "SELECT n.nspname AS schema, p.proname, p.prokind, p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid=p.oid AND d.classid='pg_proc'::regclass AND d.deptype='e') ORDER BY p.proname",
      triggers:
        "SELECT n.nspname AS schema, c.relname AS table_name, t.tgname FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND n.nspname IN ('public','auth') ORDER BY n.nspname,c.relname,t.tgname",
      publicationTables:
        "SELECT pubname, schemaname, tablename FROM pg_publication_tables WHERE schemaname='public' ORDER BY pubname,tablename",
      policies:
        "SELECT schemaname,tablename,policyname,roles,cmd FROM pg_policies WHERE schemaname IN ('public','storage') ORDER BY schemaname,tablename,policyname",
      extensions:
        "SELECT extname,extversion FROM pg_extension ORDER BY extname",
      views:
        "SELECT table_schema,table_name FROM information_schema.views WHERE table_schema='public' ORDER BY table_name",
    };
    const report: Record<string, unknown> = {
      sourceProject: project,
      createdAt: new Date().toISOString(),
    };
    for (const [key, sql] of Object.entries(queries))
      report[key] = (await client.query(sql)).rows;
    const hasCron = (report.extensions as { extname: string }[]).some(
      (row) => row.extname === "pg_cron",
    );
    report.cronJobs = hasCron
      ? (
          await client.query(
            "SELECT jobid,schedule,active FROM cron.job ORDER BY jobid",
          )
        ).rows
      : [];
    await client.query("ROLLBACK");
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const file = path.join(directory, `services-${Date.now()}-audit.json`);
    await writeFile(file, JSON.stringify(report, null, 2) + "\n", {
      mode: 0o600,
      flag: "wx",
    });
    console.log(
      JSON.stringify({
        routines: (report.routines as unknown[]).length,
        triggers: (report.triggers as unknown[]).length,
        publicationTables: (report.publicationTables as unknown[]).length,
        policies: (report.policies as unknown[]).length,
        views: (report.views as unknown[]).length,
        cronJobs: (report.cronJobs as unknown[]).length,
        report: file,
      }),
    );
  } finally {
    await client.end();
  }
}
main().catch(() => {
  console.error("Supabase service inventory failed; private details withheld.");
  process.exitCode = 1;
});
