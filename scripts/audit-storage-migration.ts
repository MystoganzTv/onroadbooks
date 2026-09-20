import { config } from "dotenv";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";
import { databaseUrl } from "./lib/postgres";
config({ path: ".env.local" });
config();
async function main() {
  const source = new URL(databaseUrl(process.env.DIRECT_URL ?? ""));
  const project = "uznuvzeghgwygpxjhqdz";
  assert.ok(
    source.hostname === `db.${project}.supabase.co` ||
      (source.hostname.endsWith(".pooler.supabase.com") &&
        decodeURIComponent(source.username) === `postgres.${project}` &&
        source.port === "5432"),
  );
  source.searchParams.set("sslmode", "verify-full");
  if (process.env.MIGRATION_SOURCE_CA_CERT)
    source.searchParams.set(
      "sslrootcert",
      process.env.MIGRATION_SOURCE_CA_CERT,
    );
  const directory = path.resolve(process.env.MIGRATION_REPORT_DIR ?? "");
  const repo = path.resolve(".");
  assert.ok(
    process.env.MIGRATION_REPORT_DIR &&
      directory !== repo &&
      !directory.startsWith(repo + path.sep),
  );
  const client = new Client({
    connectionString: source.toString(),
    connectionTimeoutMillis: 15_000,
  });
  try {
    await client.connect();
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const buckets = (
      await client.query(
        "SELECT id, public, file_size_limit, allowed_mime_types FROM storage.buckets ORDER BY id",
      )
    ).rows;
    const objects = (
      await client.query(
        "SELECT bucket_id, name, metadata FROM storage.objects ORDER BY bucket_id,name",
      )
    ).rows;
    const documents = (
      await client.query(
        'SELECT id,"businessId","storageKey","sizeBytes","contentType" FROM public."Document" ORDER BY id',
      )
    ).rows;
    const bucket = process.env.SUPABASE_STORAGE_BUCKET || "documents";
    const missing = documents
      .filter(
        (document) =>
          !objects.some(
            (object) =>
              object.bucket_id === bucket &&
              object.name === document.storageKey,
          ),
      )
      .map((document) => document.id);
    await client.query("ROLLBACK");
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const report = path.join(directory, `storage-${Date.now()}-audit.json`);
    await writeFile(
      report,
      JSON.stringify(
        {
          sourceProject: project,
          createdAt: new Date().toISOString(),
          buckets,
          objects,
          documents,
          missingDocumentIds: missing,
        },
        null,
        2,
      ) + "\n",
      { mode: 0o600, flag: "wx" },
    );
    console.log(
      JSON.stringify({
        buckets: buckets.length,
        publicBuckets: buckets.filter((bucket) => bucket.public).length,
        objects: objects.length,
        documents: documents.length,
        missingDocuments: missing.length,
        report,
      }),
    );
    assert.equal(
      missing.length,
      0,
      "Some documents have no corresponding storage object; do not cut over.",
    );
  } finally {
    await client.end();
  }
}
main().catch(() => {
  console.error(
    "Storage inventory failed; no private metadata or credentials printed.",
  );
  process.exitCode = 1;
});
