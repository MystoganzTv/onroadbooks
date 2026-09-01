# Production operations

## Health and uptime

`GET /api/health` is public so an external monitor can reach it when sessions,
the database, or Supabase are unhealthy. It is never cached.

- `200` and `status: "ok"`: application configuration, PostgreSQL, Supabase
  Storage, Stripe Billing, and Supabase Auth are ready.
- `503` and `status: "degraded"`: at least one required dependency failed or
  production fell back to JSON/local-disk persistence.
- The response names the failed component but does not expose credentials,
  connection strings, database contents, or provider error messages.

Failures write structured JSON to Vercel Runtime Logs. Use the deployment and
request identifiers in those records to correlate an incident.

## Stripe webhook failures

Every accepted Stripe event produces a structured completion record with its
event ID, event type, request ID, and duration. Synchronization failures return
`500` so Stripe retries them and also produce an error-level record.

Set `OPERATIONS_ALERT_WEBHOOK_URL` in Vercel Production to deliver the same
failure immediately to a Slack- or Discord-compatible incoming webhook. Alert
delivery has a three-second timeout and cannot replace the original error.
Invalid signatures are logged as warnings but are not alerted to avoid turning
internet noise into an alert storm.

## Database backups

Supabase's free plan includes no daily backup and no point-in-time recovery, so
the ledger is backed up by us, on a schedule, or it is not backed up at all:

```bash
npm run backup
```

Each run dumps the production `public` schema, encrypts it with AES-256-GCM
under a scrypt key derived from `BACKUP_PASSPHRASE`, writes
`onroadbooks-<UTC timestamp>.dump.enc` into `BACKUP_DIR` (default
`~/OnRoadBooksBackups`, and never inside this repository), then decrypts what
it just wrote and reads its table of contents back with `pg_restore` to prove
all 17 application tables are in it. A run that cannot prove that fails.

Old files are pruned past `BACKUP_KEEP_DAYS` (default 30), except that the
seven newest always survive -- a machine left off for two months must not
prune itself down to nothing.

Nightly on macOS: `scripts/launchd/com.onroadbooks.backup.plist`. It reads the
passphrase from the login keychain rather than from a file; install
instructions are in the comment at the top.

To restore, decrypt first and then use ordinary PostgreSQL tooling:

```bash
npm run backup -- --decrypt ~/OnRoadBooksBackups/onroadbooks-<stamp>.dump.enc --out /tmp/ledger.dump
pg_restore --dbname "$TARGET" --no-owner --no-privileges /tmp/ledger.dump
rm /tmp/ledger.dump
```

`npm run backup -- --verify <file>` re-checks an existing backup without
producing a new one; run it on the oldest file you keep, not just the newest.

Two limits worth saying out loud. This recovers last night, not the last five
minutes -- only Supabase Pro's PITR does that. And it covers the application
database only: Supabase Auth identities and Storage objects have their own
provider export procedures and are not in this file.

## Backup restoration drill

Run:

```bash
npm run certify:backup-restore
```

The drill uses PostgreSQL 17 client tools to:

1. create a logical, read-only dump of the production `public` schema;
2. initialize a disposable PostgreSQL cluster on localhost;
3. restore the dump with stop-on-error semantics;
4. compare row counts and checksums for all 17 application tables;
5. confirm RLS survived the restore; and
6. stop the temporary server and securely remove the dump and data directory.

The script never prints rows, credentials, or provider identifiers. The dump
does contain production data while the drill runs, so execute it only on an
approved encrypted workstation and never keep or commit its temporary files.

This certifies application database recovery. Supabase Auth identities and
Storage object bytes use separate provider recovery/export procedures and must
be included in a full disaster-recovery exercise.

## Incident response

1. Confirm `/api/health` and identify the failing component.
2. Inspect Vercel Runtime Errors and filter logs by route and request ID.
3. For Stripe, find the event ID in Workbench and retry only after the cause is
   fixed; event handling is idempotent through subscription synchronization.
4. For Supabase, inspect the matching service log (`postgres`, `auth`, or
   `storage`) and rerun the failed operation after remediation.
5. Record detection time, customer impact, resolution, and the prevention
   added before closing the incident.
