import { config } from "dotenv";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";
import { decrypt } from "./lib/backup-crypto";
import { manifest, prepareCopy } from "./lib/data-copy";
import { pgBinary } from "./lib/postgres";
config({ path: ".env.local" });
config();

async function main() {
  assert.ok(
    process.env.MIGRATION_BACKUP_FILE &&
      process.env.MIGRATION_MANIFEST_FILE &&
      process.env.BACKUP_PASSPHRASE,
    "MIGRATION_BACKUP_FILE, MIGRATION_MANIFEST_FILE and BACKUP_PASSPHRASE are required.",
  );
  const expected = JSON.parse(
    await readFile(process.env.MIGRATION_MANIFEST_FILE!, "utf8"),
  );
  assert.equal(expected.sourceProject, "uznuvzeghgwygpxjhqdz");
  assert.equal(Object.keys(expected.tables).length, 20);
  const plaintext = await decrypt(
    await readFile(process.env.MIGRATION_BACKUP_FILE!),
    process.env.BACKUP_PASSPHRASE!,
  );
  const directory = await mkdtemp("/tmp/orb-restore-");
  const cluster = path.join(directory, "postgres");
  const dump = path.join(directory, "backup.dump");
  const pgCtl = pgBinary("pg_ctl");
  let started = false;
  const run = (binary: string, args: string[]) => {
    const result = spawnSync(binary, args, { stdio: "pipe" });
    assert.equal(
      result.status,
      0,
      `Local ${path.basename(binary)} failed (details withheld to protect backup data).`,
    );
  };
  try {
    await writeFile(dump, plaintext, { mode: 0o600 });
    run(pgBinary("initdb"), [
      "-D",
      cluster,
      "-A",
      "trust",
      "-U",
      "postgres",
      "--no-locale",
      "--encoding=UTF8",
    ]);
    // Only a Unix socket inside a private 0700 temporary directory; no TCP listener.
    run(pgCtl, [
      "-D",
      cluster,
      "-l",
      path.join(directory, "postgres.log"),
      "-o",
      `-c listen_addresses='' -k ${directory}`,
      "start",
      "-w",
    ]);
    started = true;
    run(pgBinary("pg_restore"), [
      "--host",
      directory,
      "--username",
      "postgres",
      "--dbname",
      "postgres",
      "--clean",
      "--if-exists",
      "--exit-on-error",
      "--no-owner",
      "--no-privileges",
      dump,
    ]);
    const client = new Client({
      host: directory,
      user: "postgres",
      database: "postgres",
    });
    await client.connect();
    try {
      await client.query("BEGIN READ ONLY");
      const plan = await prepareCopy(client, client);
      assert.deepEqual(
        await manifest(client, plan, "source"),
        expected.tables,
        "Restored encrypted backup must match the source snapshot exactly.",
      );
      if (process.argv.includes("--auth")) {
        assert.ok(
          process.env.MIGRATION_IDENTITIES_FILE,
          "MIGRATION_IDENTITIES_FILE is required to verify Auth.js identity restoration.",
        );
        const identities = JSON.parse(
          (
            await decrypt(
              await readFile(process.env.MIGRATION_IDENTITIES_FILE!),
              process.env.BACKUP_PASSPHRASE!,
            )
          ).toString("utf8"),
        );
        assert.equal(identities.source, expected.sourceProject);
        const restored = await client.query(
          'SELECT "userId", provider, subject FROM onroad_auth."Identity" ORDER BY subject',
        );
        const links = identities.identities
          .map(
            (identity: {
              application_user_id: string;
              provider: string;
              provider_id: string;
            }) => ({
              userId: identity.application_user_id,
              provider: identity.provider,
              subject: identity.provider_id,
            }),
          )
          .sort((a: { subject: string }, b: { subject: string }) =>
            a.subject.localeCompare(b.subject),
          );
        // Do not include assertion values in errors: these are private identity identifiers.
        assert.ok(
          JSON.stringify(restored.rows) === JSON.stringify(links),
          "Restored Google identity links do not match the encrypted inventory.",
        );
        assert.equal(
          (await client.query('SELECT count(*) FROM onroad_auth."Invitation"'))
            .rows[0].count,
          "0",
          "Expected no outstanding invitations in the migration snapshot.",
        );
        assert.equal(
          (
            await client.query(
              "SELECT count(*) FROM drizzle.__drizzle_migrations",
            )
          ).rows[0].count,
          "3",
          "Expected all three applied Drizzle migrations.",
        );
      }
      await client.query("ROLLBACK");
    } finally {
      await client.end();
    }
    console.log(
      `Encrypted backup fully restored into disposable local PostgreSQL: all 20 table manifests match${process.argv.includes("--auth") ? ", Google identity links, invitation table and migration journal verified" : ""}.`,
    );
  } finally {
    if (started) {
      const stopped = spawnSync(
        pgCtl,
        ["-D", cluster, "stop", "-m", "fast", "-w"],
        { stdio: "pipe" },
      );
      if (stopped.status !== 0)
        throw new Error(
          `Temporary PostgreSQL could not stop; private files retained at ${directory}.`,
        );
    }
    await rm(directory, { recursive: true, force: true });
  }
}
main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Backup restore failed.",
  );
  process.exitCode = 1;
});
