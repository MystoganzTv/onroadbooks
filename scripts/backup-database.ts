import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { config as loadEnv } from "dotenv";

import { encrypt, decrypt } from "./lib/backup-crypto";
import { APPLICATION_TABLES, databaseUrl, pgBinary, run } from "./lib/postgres";

// A scheduled backup gets no shell of its own, and only the Prisma CLI reads
// `.env` for us. Load it here, `.env.local` first so it wins the same way
// Next.js resolves it, and run from the repository root.
loadEnv({ path: ".env.local" });
loadEnv();

/**
 * Nightly logical backup of the production ledger, encrypted at rest.
 *
 * Independent logical archives protect the ledger during provider migration.
 * DATA_SOURCE=neon selects NEON_DIRECT_URL and includes the private Auth.js
 * tables and Drizzle migration journal. Legacy backups retain their format.
 *
 * The dump is real customer financial data, so it never touches disk in the
 * clear for longer than the seconds it takes to encrypt it, the destination is
 * refused if it sits inside the repository, and every backup is read back
 * before the run is called a success -- an unverified backup is a rumour.
 *
 *   npm run backup                          # create, verify and prune
 *   npm run backup -- --verify <file>       # re-check an old backup
 *   npm run backup -- --decrypt <file> --out ledger.dump
 *
 * Environment, read from the shell or from `.env.local` / `.env`:
 * NEON_DIRECT_URL (Neon), DIRECT_URL or DATABASE_URL (legacy), and
 * BACKUP_PASSPHRASE -- lose the passphrase and
 * the backups are gone with it, so keep it where the laptop is not.
 * Optional: BACKUP_DIR (default ~/OnRoadBooksBackups), BACKUP_KEEP_DAYS (30),
 * PG_BIN (client binaries with a major version >= the source server).
 */

/** Never prune below seven verified archives. */
const ALWAYS_KEEP = 7;
const FILE_PATTERN = /^onroadbooks-\d{8}T\d{6}Z\.dump\.enc$/;

function passphrase(): string {
  const value = process.env.BACKUP_PASSPHRASE ?? "";
  if (value.length < 12) {
    throw new Error(
      "BACKUP_PASSPHRASE must be set and at least 12 characters.",
    );
  }
  return value;
}

function stamp(now: Date): string {
  return now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "Z");
}

/**
 * Decrypt into a temporary file and have `pg_restore` read its table of
 * contents. This proves the archive parses and that every application table
 * made it in -- a dump that silently skipped a table restores without error
 * and loses the data anyway.
 */
async function verify(
  file: string,
  secret: string,
  requireAuth = false,
): Promise<number> {
  const blob = await readFile(file);
  const plaintext = await decrypt(blob, secret);
  const workDir = await mkdtemp(path.join(tmpdir(), "onroadbooks-verify-"));
  try {
    const dumpPath = path.join(workDir, "backup.dump");
    await writeFile(dumpPath, plaintext, { mode: 0o600 });
    const listing = spawnSync(pgBinary("pg_restore"), ["--list", dumpPath], {
      encoding: "utf8",
    });
    if (listing.status !== 0) {
      throw new Error(
        `backup is not a readable archive\n${listing.stderr ?? ""}`,
      );
    }
    const missing = APPLICATION_TABLES.filter(
      (table) =>
        !new RegExp(`TABLE DATA public "?${table}"?\\s`).test(
          listing.stdout ?? "",
        ),
    );
    if (missing.length > 0) {
      throw new Error(`backup is missing tables: ${missing.join(", ")}`);
    }
    const containsAuth = /SCHEMA - onroad_auth\s/.test(listing.stdout ?? "");
    if (requireAuth || containsAuth) {
      for (const table of ["Identity", "Invitation"]) {
        if (
          !new RegExp(`TABLE DATA onroad_auth "?${table}"?\\s`).test(
            listing.stdout ?? "",
          )
        ) {
          throw new Error(`backup is missing auth table: ${table}`);
        }
      }
    }
    if (
      (requireAuth || containsAuth) &&
      !/TABLE DATA drizzle __drizzle_migrations\s/.test(listing.stdout ?? "")
    )
      throw new Error("backup is missing the Drizzle migration journal");
    return APPLICATION_TABLES.length + (containsAuth ? 2 : 0);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

/** Age-based, newest-first, and never below ALWAYS_KEEP. */
async function prune(directory: string, keepDays: number): Promise<number> {
  const names = (await readdir(directory))
    .filter((name) => FILE_PATTERN.test(name))
    .sort()
    .reverse();
  const cutoff = Date.now() - keepDays * 24 * 60 * 60 * 1000;
  let pruned = 0;
  for (const name of names.slice(ALWAYS_KEEP)) {
    const file = path.join(directory, name);
    if ((await stat(file)).mtimeMs < cutoff) {
      await rm(file, { force: true });
      pruned += 1;
    }
  }
  return pruned;
}

async function destination(): Promise<string> {
  const directory = path.resolve(
    process.env.BACKUP_DIR?.trim() ||
      path.join(homedir(), "OnRoadBooksBackups"),
  );
  const repository = path.resolve(process.cwd());
  if (
    directory === repository ||
    directory.startsWith(`${repository}${path.sep}`)
  ) {
    throw new Error(
      "Refusing to write backups inside the repository -- set BACKUP_DIR elsewhere.",
    );
  }
  await mkdir(directory, { recursive: true, mode: 0o700 });
  return directory;
}

async function create(): Promise<void> {
  const neon = process.env.DATA_SOURCE === "neon";
  const configuredUrl = neon
    ? process.env.NEON_DIRECT_URL
    : process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!configuredUrl?.startsWith("postgres")) {
    throw new Error(
      neon
        ? "NEON_DIRECT_URL is required for a Neon backup"
        : "DIRECT_URL or DATABASE_URL is required",
    );
  }
  const secret = passphrase();
  const directory = await destination();
  const keepDays = Number(process.env.BACKUP_KEEP_DAYS ?? 30);

  const workDir = await mkdtemp(path.join(tmpdir(), "onroadbooks-backup-"));
  const file = path.join(
    directory,
    `onroadbooks-${stamp(new Date())}.dump.enc`,
  );
  try {
    const dumpPath = path.join(workDir, "ledger.dump");
    run(
      pgBinary("pg_dump", neon ? 18 : 17),
      [
        "--dbname",
        databaseUrl(configuredUrl),
        "--format=custom",
        "--file",
        dumpPath,
        "--schema=public",
        ...(neon ? ["--schema=onroad_auth", "--schema=drizzle"] : []),
        "--no-owner",
        "--no-privileges",
      ],
      "logical backup",
    );
    await writeFile(file, await encrypt(await readFile(dumpPath), secret), {
      mode: 0o600,
    });
  } finally {
    // The plaintext dump dies with the temporary directory, success or not.
    await rm(workDir, { recursive: true, force: true });
  }

  const tables = await verify(file, secret, neon);
  const pruned = await prune(directory, keepDays);
  const retained = (await readdir(directory)).filter((name) =>
    FILE_PATTERN.test(name),
  ).length;

  console.log("Database backup:", {
    file: path.basename(file),
    bytes: (await stat(file)).size,
    tables,
    verified: "decrypted and read back with pg_restore",
    directory,
    retained,
    pruned,
  });
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const flag = (name: string) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };

  const toVerify = flag("--verify");
  if (toVerify) {
    const tables = await verify(path.resolve(toVerify), passphrase());
    console.log("Backup verified:", { file: path.basename(toVerify), tables });
    return;
  }

  const toDecrypt = flag("--decrypt");
  if (toDecrypt) {
    const out = flag("--out");
    if (!out)
      throw new Error("--decrypt requires --out <path for the plaintext dump>");
    const plaintext = await decrypt(
      await readFile(path.resolve(toDecrypt)),
      passphrase(),
    );
    await writeFile(path.resolve(out), plaintext, { mode: 0o600 });
    console.log("Backup decrypted:", {
      out: path.resolve(out),
      restore: `pg_restore --dbname <target> --no-owner --no-privileges ${out}`,
      warning:
        "plaintext production data -- delete it once the restore is done",
    });
    return;
  }

  await create();
}

main().catch((error) => {
  console.error(
    "Database backup failed:",
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
});
