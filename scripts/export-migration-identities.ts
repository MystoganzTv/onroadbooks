import { config } from "dotenv";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";
import { encrypt, decrypt } from "./lib/backup-crypto";
import { databaseUrl } from "./lib/postgres";
config({ path: ".env.local" }); config();

async function main() {
  const url = new URL(databaseUrl(process.env.DIRECT_URL ?? ""));
  assert.ok(url.hostname === "db.uznuvzeghgwygpxjhqdz.supabase.co" ||
    (url.hostname.endsWith(".pooler.supabase.com") && decodeURIComponent(url.username) === "postgres.uznuvzeghgwygpxjhqdz" && url.port === "5432"));
  url.searchParams.set("sslmode", "verify-full");
  if (process.env.MIGRATION_SOURCE_CA_CERT) url.searchParams.set("sslrootcert", process.env.MIGRATION_SOURCE_CA_CERT);
  const secret = process.env.BACKUP_PASSPHRASE ?? "";
  assert.ok(secret.length >= 12, "BACKUP_PASSPHRASE is required.");
  const directory = path.resolve(process.env.MIGRATION_REPORT_DIR ?? "");
  assert.ok(process.env.MIGRATION_REPORT_DIR && directory !== process.cwd() && !directory.startsWith(process.cwd() + path.sep), "Use a private directory outside the repository.");
  const client = new Client({ connectionString: url.toString(), connectionTimeoutMillis: 15_000 });
  try {
    await client.connect();
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    // No provider tokens or Supabase sessions. This is an inventory for phase 6,
    // not permission to link accounts based on an unverified email.
    const { rows } = await client.query(`SELECT u.id::text AS supabase_user_id, u.email,
      u.email_confirmed_at::text, i.provider, i.provider_id,
      a.id AS application_user_id, a."businessId" AS business_id
      FROM auth.users u LEFT JOIN auth.identities i ON i.user_id=u.id
      LEFT JOIN public."User" a ON lower(a.email)=lower(u.email)
      ORDER BY u.id, i.provider, i.provider_id`);
    const plaintext = Buffer.from(JSON.stringify({ version: 1, source: "uznuvzeghgwygpxjhqdz", exportedAt: new Date().toISOString(), identities: rows }));
    const encrypted = await encrypt(plaintext, secret);
    assert.ok((await decrypt(encrypted, secret)).equals(plaintext));
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const file = path.join(directory, `identities-${Date.now()}.json.enc`);
    await writeFile(file, encrypted, { mode: 0o600, flag: "wx" });
    console.log(JSON.stringify({ file, identities: rows.length, matchedApplicationUsers: rows.filter((row) => row.application_user_id).length, verifiedEmails: rows.filter((row) => row.email_confirmed_at).length }));
  } finally { try { await client.query("ROLLBACK"); } finally { await client.end(); } }
}
main().catch(() => { console.error("Identity export failed; no identity data printed."); process.exitCode = 1; });
