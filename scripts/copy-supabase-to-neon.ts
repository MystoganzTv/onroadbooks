import { config } from "dotenv";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";
import { databaseUrl } from "./lib/postgres";
import { copyData, manifest, prepareCopy } from "./lib/data-copy";

config({ path: ".env.local" });
config();

async function main() {
  const args = process.argv.slice(2);
  assert.ok(args.every((arg) => ["--check", "--dry-run", "--apply", "--reconcile"].includes(arg)) && args.length <= 1,
    "Use --check (default), --dry-run, --apply or --reconcile.");
  const mode = args[0] ?? "--check";
  const sourceUrl = new URL(databaseUrl(process.env.DIRECT_URL ?? ""));
  const targetUrl = new URL(process.env.NEON_DIRECT_URL ?? "");
  if (process.env.MIGRATION_SOURCE_CA_CERT) sourceUrl.searchParams.set("sslrootcert", process.env.MIGRATION_SOURCE_CA_CERT);
  const project = "uznuvzeghgwygpxjhqdz";
  assert.ok(sourceUrl.hostname === `db.${project}.supabase.co` ||
    (sourceUrl.hostname.endsWith(".pooler.supabase.com") && decodeURIComponent(sourceUrl.username) === `postgres.${project}` && sourceUrl.port === "5432"),
  "Source must be the OnRoadBooks Supabase direct/session endpoint.");
  assert.equal(targetUrl.hostname, "ep-polished-night-awxqexhq.c-12.us-east-1.aws.neon.tech",
    "Destination must be the isolated OnRoadBooks Neon Development endpoint.");
  assert.equal(targetUrl.pathname, "/neondb");
  if (mode === "--apply") {
    assert.ok(process.env.MIGRATION_BACKUP_FILE, "A verified encrypted backup is required before --apply.");
    // Verify the existing archive without creating/pruning any backups.
    const verified = spawnSync(process.execPath, ["--import", "tsx", "scripts/backup-database.ts", "--verify", process.env.MIGRATION_BACKUP_FILE!], { stdio: "pipe" });
    assert.equal(verified.status, 0, "Backup verification failed. Check BACKUP_PASSPHRASE and MIGRATION_BACKUP_FILE.");
  }
  const reportDirectory = path.resolve(process.env.MIGRATION_REPORT_DIR ?? "");
  assert.ok(process.env.MIGRATION_REPORT_DIR && !reportDirectory.startsWith(path.resolve(".") + path.sep) && reportDirectory !== path.resolve("."),
    "Set MIGRATION_REPORT_DIR outside the repository; manifests include business identifiers.");
  await mkdir(reportDirectory, { recursive: true, mode: 0o700 });
  const file = path.join(reportDirectory, `copy-${Date.now()}-${mode.slice(2)}.json`);
  // Refuse insecure TLS modes. Supabase's certificate must be trusted explicitly
  // through MIGRATION_SOURCE_CA_CERT (or NODE_EXTRA_CA_CERTS).
  for (const url of [sourceUrl, targetUrl]) {
    url.searchParams.set("sslmode", "verify-full");
  }
  const source = new Client({ connectionString: sourceUrl.toString(), connectionTimeoutMillis: 15_000 });
  const target = new Client({ connectionString: targetUrl.toString(), connectionTimeoutMillis: 15_000 });
  let phase = "connecting";
  try {
    await source.connect(); await target.connect();
    await source.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await target.query(["--check", "--reconcile"].includes(mode) ? "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY" : "BEGIN ISOLATION LEVEL SERIALIZABLE");
    phase = "catalog validation";
    const plan = await prepareCopy(source, target);
    phase = "copy and reconciliation";
    const startedAt = new Date().toISOString();
    const data = ["--check", "--reconcile"].includes(mode) ? await manifest(source, plan, "source") : await copyData(source, target, plan);
    if (mode === "--reconcile") assert.deepEqual(await manifest(target, plan, "target"), data, "Committed Neon data differs from the current source snapshot.");
    const report = { sourceProject: project, targetHost: targetUrl.hostname, startedAt, mode, committed: false, tables: data };
    await writeFile(file, JSON.stringify(report, null, 2) + "\n", { mode: 0o600, flag: "wx" });
    phase = "commit";
    if (mode === "--apply") {
      await target.query("COMMIT");
      // If this write fails, inspect the destination: commit already succeeded.
      await writeFile(file, JSON.stringify({ ...report, committed: true }, null, 2) + "\n", { mode: 0o600 });
    } else await target.query("ROLLBACK");
    await source.query("ROLLBACK");
    console.log(JSON.stringify({ mode, tables: Object.keys(data).length, rows: Object.values(data).reduce((sum, value) => sum + value.rows, 0), committed: mode === "--apply", report: file }));
  } catch (error) {
    await Promise.allSettled([source.query("ROLLBACK"), target.query("ROLLBACK")]);
    // Never print driver errors/SQL details that may contain credentials or row data.
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "validation";
    throw new Error(`Migration stopped during ${phase} (${code}). No automatic retries. Inspect the destination if commit was attempted.`);
  } finally { await Promise.allSettled([source.end(), target.end()]); }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Migration failed.");
  process.exitCode = 1;
});
