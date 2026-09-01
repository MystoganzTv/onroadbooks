import { createCipheriv, createDecipheriv, randomBytes, scrypt } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { promisify } from "node:util";

import { config as loadEnv } from "dotenv";

import { APPLICATION_TABLES, databaseUrl, pgBinary, run } from "./lib/postgres";

// A scheduled backup gets no shell of its own, and only the Prisma CLI reads
// `.env` for us. Load it here, `.env.local` first so it wins the same way
// Next.js resolves it, and run from the repository root.
loadEnv({ path: ".env.local" });
loadEnv();

/**
 * Nightly logical backup of the production ledger, encrypted at rest.
 *
 * The Supabase project is on the free plan, which includes no daily backup and
 * no point-in-time recovery -- the books of every customer sit on a database
 * with nothing behind it, and a ledger has already been lost once. This script
 * is the floor under that, not a replacement for it: it recovers yesterday's
 * state, never the last five minutes. Supabase Pro is still what buys PITR.
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
 * DIRECT_URL or DATABASE_URL, and BACKUP_PASSPHRASE -- lose the passphrase and
 * the backups are gone with it, so keep it where the laptop is not.
 * Optional: BACKUP_DIR (default ~/OnRoadBooksBackups), BACKUP_KEEP_DAYS (30).
 */

const MAGIC = Buffer.from("ORBK1");
const SALT_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
/** scrypt at these parameters costs ~100ms and 32MB -- cheap once a night,
 *  expensive a few billion times for anyone holding a stolen file. */
const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
/** Age alone must never empty the folder: a laptop left off for two months
 *  would otherwise prune its way to nothing on the next run. */
const ALWAYS_KEEP = 7;
const FILE_PATTERN = /^onroadbooks-\d{8}T\d{6}Z\.dump\.enc$/;

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: typeof SCRYPT,
) => Promise<Buffer>;

function passphrase(): string {
  const value = process.env.BACKUP_PASSPHRASE ?? "";
  if (value.length < 12) {
    throw new Error("BACKUP_PASSPHRASE must be set and at least 12 characters.");
  }
  return value;
}

function stamp(now: Date): string {
  return now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
}

async function encrypt(plaintext: Buffer, secret: string): Promise<Buffer> {
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const key = await scryptAsync(secret, salt, 32, SCRYPT);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([MAGIC, salt, iv, body, cipher.getAuthTag()]);
}

/** Throws if the file was truncated, corrupted or encrypted with another
 *  passphrase -- GCM authenticates, so a silent half-restore is impossible. */
async function decrypt(blob: Buffer, secret: string): Promise<Buffer> {
  const header = MAGIC.length + SALT_BYTES + IV_BYTES;
  if (blob.length <= header + TAG_BYTES || !blob.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error("Not an OnRoad Books backup file.");
  }
  const salt = blob.subarray(MAGIC.length, MAGIC.length + SALT_BYTES);
  const iv = blob.subarray(MAGIC.length + SALT_BYTES, header);
  const body = blob.subarray(header, blob.length - TAG_BYTES);
  const key = await scryptAsync(secret, salt, 32, SCRYPT);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(blob.subarray(blob.length - TAG_BYTES));
  return Buffer.concat([decipher.update(body), decipher.final()]);
}

/**
 * Decrypt into a temporary file and have `pg_restore` read its table of
 * contents. This proves the archive parses and that every application table
 * made it in -- a dump that silently skipped a table restores without error
 * and loses the data anyway.
 */
async function verify(file: string, secret: string): Promise<number> {
  const blob = await readFile(file);
  const plaintext = await decrypt(blob, secret);
  const workDir = await mkdtemp(path.join(tmpdir(), "onroadbooks-verify-"));
  try {
    const dumpPath = path.join(workDir, "backup.dump");
    await writeFile(dumpPath, plaintext, { mode: 0o600 });
    const listing = spawnSync(pgBinary("pg_restore"), ["--list", dumpPath], { encoding: "utf8" });
    if (listing.status !== 0) {
      throw new Error(`backup is not a readable archive\n${listing.stderr ?? ""}`);
    }
    const missing = APPLICATION_TABLES.filter(
      (table) => !new RegExp(`TABLE DATA public "?${table}"?\\s`).test(listing.stdout ?? ""),
    );
    if (missing.length > 0) {
      throw new Error(`backup is missing tables: ${missing.join(", ")}`);
    }
    return APPLICATION_TABLES.length;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

/** Age-based, newest-first, and never below ALWAYS_KEEP. */
async function prune(directory: string, keepDays: number): Promise<number> {
  const names = (await readdir(directory)).filter((name) => FILE_PATTERN.test(name)).sort().reverse();
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
  const directory = path.resolve(process.env.BACKUP_DIR?.trim() || path.join(homedir(), "OnRoadBooksBackups"));
  const repository = path.resolve(process.cwd());
  if (directory === repository || directory.startsWith(`${repository}${path.sep}`)) {
    throw new Error("Refusing to write backups inside the repository -- set BACKUP_DIR elsewhere.");
  }
  await mkdir(directory, { recursive: true, mode: 0o700 });
  return directory;
}

async function create(): Promise<void> {
  const configuredUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!configuredUrl?.startsWith("postgres")) {
    throw new Error("DIRECT_URL or DATABASE_URL is required");
  }
  const secret = passphrase();
  const directory = await destination();
  const keepDays = Number(process.env.BACKUP_KEEP_DAYS ?? 30);

  const workDir = await mkdtemp(path.join(tmpdir(), "onroadbooks-backup-"));
  const file = path.join(directory, `onroadbooks-${stamp(new Date())}.dump.enc`);
  try {
    const dumpPath = path.join(workDir, "ledger.dump");
    run(
      pgBinary("pg_dump"),
      [
        "--dbname", databaseUrl(configuredUrl),
        "--format=custom",
        "--file", dumpPath,
        "--schema=public",
        "--no-owner",
        "--no-privileges",
      ],
      "logical backup",
    );
    await writeFile(file, await encrypt(await readFile(dumpPath), secret), { mode: 0o600 });
  } finally {
    // The plaintext dump dies with the temporary directory, success or not.
    await rm(workDir, { recursive: true, force: true });
  }

  const tables = await verify(file, secret);
  const pruned = await prune(directory, keepDays);
  const retained = (await readdir(directory)).filter((name) => FILE_PATTERN.test(name)).length;

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
    if (!out) throw new Error("--decrypt requires --out <path for the plaintext dump>");
    const plaintext = await decrypt(await readFile(path.resolve(toDecrypt)), passphrase());
    await writeFile(path.resolve(out), plaintext, { mode: 0o600 });
    console.log("Backup decrypted:", {
      out: path.resolve(out),
      restore: `pg_restore --dbname <target> --no-owner --no-privileges ${out}`,
      warning: "plaintext production data -- delete it once the restore is done",
    });
    return;
  }

  await create();
}

main().catch((error) => {
  console.error("Database backup failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
