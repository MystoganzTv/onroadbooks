# ADR 0023: Back the ledger up ourselves — encrypted, verified, off the platform

- **Status:** Accepted
- **Date:** 2026-09-01
- **Deciders:** Enrique Padrón
- **Tags:** data | operations

## Context

The production database is a Supabase project on the free plan. Its backups
page says it plainly: *"Free Plan does not include project backups."* No daily
snapshot, no point-in-time recovery, no retention — on the database that holds
this business's books and, from launch, every customer's books.

This is not theoretical. A four-month ledger was already lost once on
2026-08-31 and was never recovered, because there was nothing to recover it
from. The go-live check called this the highest-risk item of the whole launch
and it stayed open while features shipped on top of it.

The repository already had `npm run certify:backup-restore`, which dumps
production, restores it into a throwaway local cluster, compares checksums for
all 17 tables and then **deletes the dump**. That is a drill: it proves a
restore is possible. It is not a backup, because nothing survives it.

Two constraints shaped the answer. The GitHub repository is public, so CI
artifacts are world-readable and cannot hold customer financial data under any
encryption story worth defending. And the dump is exactly the material a
breach wants: every load, every rate, every bank-adjacent figure for every
customer, in one file.

## Decision

`npm run backup` (`scripts/backup-database.ts`) produces a backup we keep, and
refuses to call a run successful until it has read that backup back.

- **Dump.** `pg_dump --format=custom --schema=public --no-owner
  --no-privileges`, through the same PostgreSQL 17 tooling the restore drill
  already required. Shared helpers moved to `scripts/lib/postgres.ts` so the
  table list exists once: a model added to `prisma/schema.prisma` and not to
  `APPLICATION_TABLES` is a table that can go missing from a backup silently.
- **Encrypt.** AES-256-GCM, key from scrypt (N=32768, r=8, p=1) over
  `BACKUP_PASSPHRASE` with a per-file random salt. Envelope:
  `ORBK1 | salt | iv | ciphertext | tag`. GCM authenticates, so a truncated or
  altered file fails loudly instead of restoring half a ledger. The plaintext
  dump lives only in a temporary directory that is removed in a `finally`.
- **Verify, every run.** Decrypt what was just written, list the archive with
  `pg_restore --list`, and assert every application table is present. An
  unverified backup is a rumour, and the first honest test of one is usually
  the day it is needed.
- **Keep.** `BACKUP_DIR`, default `~/OnRoadBooksBackups`, mode 0700, files
  0600. The script refuses a destination inside the repository. Pruning is by
  age (`BACKUP_KEEP_DAYS`, default 30) but never takes the count below seven,
  so a laptop that was off for two months does not prune itself empty.
- **Schedule.** A launchd agent at 03:15 (`scripts/launchd/`), reading the
  passphrase from the login keychain rather than from the plist, so a copy of
  the file is not a copy of the key.

## Alternatives considered

**Buy Supabase Pro (~$25/mo) and stop here.** This is still the right thing to
do and this ADR does not argue against it — PITR is the only thing that
recovers the five minutes before an accident, and a managed backup does not
depend on a laptop being awake. It was not chosen *instead* because a paid plan
is a decision with a bill attached and the gap was open *now*; the two are
complementary, and this script keeps its value as the off-platform copy the
day the platform itself is the problem.

**Nightly GitHub Actions job uploading an artifact.** Free, always runs, no
laptop. Rejected on one fact: the repository is public, so artifacts are
public. Encryption would be the only thing standing between a passphrase
mistake and every customer's books on the open internet. That is not a risk to
take for a scheduling convenience.

**Write the dump into Supabase Storage.** The backup would then share a failure
domain, an account and a billing status with the thing it is backing up. A
backup that dies with the database is not a backup.

**Keep only the existing restore drill.** It proves recovery is possible from a
database that still exists. It has nothing to say about a database that does
not.

**Plaintext dumps in a folder.** Fastest to write, and turns a stolen laptop
into a customer-data breach.

## Consequences

- Data loss is now bounded to one day rather than to everything, for the
  application database.
- The backup is only as durable as the machine it lands on. The folder is a
  local directory on purpose so it can be pointed at an external disk or a
  synced folder; that choice is the operator's, and it should be made.
- Losing `BACKUP_PASSPHRASE` makes every existing backup unreadable. It is the
  one secret with no recovery path, and it must not live only on the machine
  that holds the backups.
- Supabase Auth identities and Storage objects are still outside this. A full
  disaster-recovery exercise needs their provider export procedures too.
- `certify:backup-restore` remains the deeper check — it restores and compares
  row checksums — and is still the drill to run before a migration.

## Guardrails

- A new model in `prisma/schema.prisma` is added to `APPLICATION_TABLES` in the
  same commit, or the next backup quietly ships without it.
- Never write a backup, or a decrypted dump, anywhere inside the repository.
- Never put a database dump in CI artifacts, in Supabase Storage, or anywhere
  else that shares an account with production.
- A decrypted dump is deleted the moment the restore finishes.
- Verify the oldest file you keep, not only the newest — retention that quietly
  rotted is the failure this is meant to prevent.

## Where this lives

`scripts/backup-database.ts`, `scripts/lib/postgres.ts`,
`scripts/launchd/com.onroadbooks.backup.plist`, the `backup` script in
`package.json`, and the "Database backups" section of `docs/operations.md`.
