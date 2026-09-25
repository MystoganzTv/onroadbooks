> Production uses Neon, Auth.js and R2 as of September 20, 2026. The former Supabase project is paused. See [cutover evidence](migrations/phase-10-supabase-retirement.md).

# Production operations

## Health and uptime

`GET /api/health` is public so an external monitor can reach it when sessions,
the database, authentication, or object storage are unhealthy. It is never cached.

- `200` and `status: "ok"`: the selected database and private object storage respond, and billing/authentication configuration is present. This is a readiness probe, not an end-to-end OAuth or email-delivery certification.
- `503` and `status: "degraded"`: at least one required dependency failed or
  production fell back to JSON/local-disk persistence.
- The response names the failed component but does not expose credentials,
  connection strings, database contents, or provider error messages.

Failures write structured JSON to Vercel Runtime Logs. Use the deployment and
request identifiers in those records to correlate an incident.

## Unhandled errors

`src/instrumentation.ts` implements Next's `onRequestError`, which fires for
page renders, route handlers and server actions alike — the whole server
surface. Before this, a customer-facing failure surfaced only when the customer
complained.

Every failure is logged as structured JSON to Vercel Runtime Logs. To be told
about it, set two variables in Vercel Production:

- `RESEND_API_KEY` — a key from the same Resend account that already sends this
  app's auth mail, on a domain already verified there.
- `OPERATIONS_ALERT_EMAIL` — where alerts land. Comma-separate for more than one.

Email is the default on purpose: it is the inbox the owner already reads, and
nobody should have to adopt a chat app to find out their app broke.
`OPERATIONS_ALERT_WEBHOOK_URL` remains supported for a Slack or Discord channel
and is used only when no alert email is configured.

Three rules make the channel worth keeping:

- **The route pattern is reported, never the URL.** `/loads/[id]` says what
  broke without putting a customer's record id into a chat room.
- **`redirect()` and `notFound()` are not failures.** They travel as thrown
  errors, and paging someone because a signed-out visitor was sent to `/login`
  is how an alert channel loses its meaning.
- **One alert, then a count.** A broken route fails on every request. The first
  occurrence alerts; the rest are logged and suppressed for ten minutes, after
  which the next alert carries how many happened in between. Failures are
  grouped by route plus a normalized message, so the same error with different
  record ids is one problem rather than a hundred.

The suppression state lives in the server instance, and serverless instances
come and go, so de-duplication is per instance rather than global. That still
removes the case that matters — one instance failing in a loop — and it is the
honest limit of doing this without a shared store. If alert volume ever becomes
a problem across instances, that is the moment to reach for a hosted error
tracker, not before.

## Stripe webhook failures

Every accepted Stripe event produces a structured completion record with its
event ID, event type, request ID, and duration. Synchronization failures return
`500` so Stripe retries them and also produce an error-level record.

Set `OPERATIONS_ALERT_WEBHOOK_URL` in Vercel Production to deliver the same
failure immediately to a Slack- or Discord-compatible incoming webhook. Alert
delivery has a ten-second timeout and cannot replace the original error.
Invalid signatures are logged as warnings but are not alerted to avoid turning
internet noise into an alert storm.

The platform Admin page includes a production operations check. It retrieves
the configured Solo, Pro and Fleet prices from Stripe, verifies that all three
are active recurring prices in the same live/test mode as the secret key, and
sends a real delivery-test message through the configured operations alert
channel. Run it after changing Stripe or Resend configuration and confirm that
the message arrives. Stripe events from the opposite mode are acknowledged and
logged without being synchronized; this prevents a test event from making a
live endpoint retry indefinitely.

## What CI costs, and why it runs the way it does

The repository is public, so Actions minutes are not billed. CI is still kept
lean, because a slow or noisy suite gets ignored — and for nine pushes in a row
it was red on stale tests while every push mailed a failure.

`.github/workflows/ci.yml` — every push to main and every pull request:

- **verify**: types, lint and the unit/money tests.
- **browser**: the whole Playwright suite against a production build of the
  commit (`E2E_PRODUCTION_SERVER=1` makes the web server `next start`). The
  build is the one Vercel runs, so it is not repeated as a separate step.
  Locally, `npm run test:e2e` still uses `next dev`.

`.github/workflows/database.yml` — the Prisma/Postgres store and the
Neon/Drizzle/Auth.js/R2 suite. On push it runs only when database, auth,
storage, script or lockfile paths change (on push and on pull requests), on
demand, and nightly at 09:17 UTC.

Trimmed without costing safety: main and pull requests only; commits that only
touch `mobile/`, `docs/` or Markdown start nothing in either workflow; a newer
push cancels the run it replaces; Chromium is cached.

If minutes ever become metered (a private repository gets 2,000/month on the
free plan), the next cut is the browser suite on push, back to pull requests
and the nightly run. Never the fast gates.

## Database migrations and production deployment

`prisma/schema.prisma` and `prisma/migrations/` are one change. Never deploy a
schema edit without its migration, and never use `prisma db push` against a
shared or production database.

The PostgreSQL CI job starts from an empty database and runs, in order:

1. `npm run db:migrate:deploy`;
2. `npm run db:harden`;
3. `npm run db:migrate:verify`; and
4. the seed and real-Postgres smoke suite.

That proves the committed migration history can recreate the declared schema.
Vercel uses `scripts/vercel-build.mjs`. Preview builds compile without touching
production. A Production build uses exactly one migration system. The legacy `postgres` mode runs Prisma migrations, database hardening and Prisma schema verification. `DATA_SOURCE=neon` requires matching Neon runtime/direct endpoints, applies Drizzle migrations and runs `db:drizzle:verify` against both business and private auth schemas plus migration hashes. Only then does `next build` run. Preview/local builds apply no migrations automatically.

Production schema changes must remain backward-compatible with the currently
running deployment. Use expand/contract changes: add nullable columns/tables
first, deploy code that can read both shapes, backfill if needed, and remove old
schema only in a later release. A failed build can leave an additive migration
applied even though the new code was not promoted; expand/contract makes that
safe.

## Nightly backup in the cloud

`.github/workflows/backup.yml` runs the same `scripts/backup-database.ts` the
Mac runs, so there is one backup format and one implementation.

**The encrypted dump is never kept as a workflow artifact.** The repository is
public and artifacts are world-readable; an encrypted ledger on the open
internet is a countdown, not a backup. Actions *secrets* stay secret in a public
repository, so the job runs fine — it just needs somewhere private to put the
file, and that is the owner's inbox, through the Resend account this app already
uses for auth mail and error alerts. No bucket and no new vendor.

**Never add `upload-artifact` to that workflow while the repository is public.**

Repository secrets: `DATABASE_URL` for the legacy backend, `BACKUP_PASSPHRASE`, `RESEND_API_KEY` and `BACKUP_EMAIL`. `NEON_DIRECT_URL` and the repository variable `DATA_SOURCE=neon` were configured during the production cutover on September 20, 2026; the main-branch backup run passed without sending email. Missing Neon credentials fail the backup; there is no fallback to the legacy database. The job installs PostgreSQL 18 clients, compatible with both the old PostgreSQL 17 source and Neon 18. Do not rotate the backup passphrase during this transition.

`scripts/lib/backup-email.ts` refuses to send anything past 38 MB rather than
mailing half a ledger. The day that throws is the day nightly backups need
object storage, and a loud failure is the only honest way to learn it.

## The year-end packet

`GET /api/export/year-end?year=2026` (browser session) and
`GET /api/mobile/year-end?year=2026` (bearer token) return one XLSX: a Summary
sheet plus every report for the calendar year, built by `buildYearEndPacket`.

It is one file on purpose — "send this to my accountant" should be one
attachment — and it is assembled from the six report tables that already exist,
so it is a new arrangement of the same numbers rather than a second opinion
about the year. `year-end.test.ts` asserts the Summary agrees with
`summarizePeriod` to the cent; if that ever breaks, the accountant is reading
figures the app does not show.

The packet computes no tax liability and says so on the cover. That line is
ADR-0022's, and it is permanent: tax varies by state and by entity, and it is
advice. The accountant files; we hand them the file.

## Database backups

The independent encrypted logical backup runs against the selected backend:

```bash
npm run backup
```

Each run dumps `public`; Neon also includes `onroad_auth` and `drizzle`. It encrypts the archive with AES-256-GCM
under a scrypt key derived from `BACKUP_PASSPHRASE`, writes
`onroadbooks-<UTC timestamp>.dump.enc` into `BACKUP_DIR` (default
`~/OnRoadBooksBackups`, and never inside this repository), then decrypts what
it just wrote and reads its table of contents back with `pg_restore` to prove
all 20 business tables are in it. Neon archives must also contain Identity, Invitation and the Drizzle migration journal. A run that cannot prove that fails.

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

This logical archive recovers its snapshot, not later writes. Any provider point-in-time recovery is a separate capability. Neon archives include the new Auth.js identity links and invitation hashes; legacy Supabase Auth identities and object bytes (Supabase or R2) require separate export/backup. On macOS, configure PostgreSQL 18 tools through a persistent `PG_BIN` before scheduling Neon backups; temporary verification tools under `/tmp` are not a permanent installation.

## Backup restoration drill

Run:

```bash
npm run certify:backup-restore
```

The drill uses PostgreSQL 17 client tools to:

1. create a logical, read-only dump of the production `public` schema;
2. initialize a disposable PostgreSQL cluster on localhost;
3. restore the dump with stop-on-error semantics;
4. compare row counts and checksums for all 20 application tables;
5. confirm RLS survived the restore; and
6. stop the temporary server and securely remove the dump and data directory.

The script never prints rows, credentials, or provider identifiers. The dump
does contain production data while the drill runs, so execute it only on an
approved encrypted workstation and never keep or commit its temporary files.

This legacy drill certifies the public application schema. For full Neon recovery,
use `verify:migration-backup -- --auth` with the encrypted Neon archive to check
Auth.js identities, invitations and the Drizzle journal too. R2 object bytes need
a separate backup; the database stores their metadata, not their contents.

## Incident response

1. Confirm `/api/health` and identify the failing component.
2. Inspect Vercel Runtime Errors and filter logs by route and request ID.
3. For Stripe, find the event ID in Workbench and retry only after the cause is
   fixed; event handling is idempotent through subscription synchronization.
4. For database failures inspect Neon, for auth failures inspect Vercel Auth.js
   logs, and for document failures inspect R2 and the Next.js upload routes.
   Rerun the failed operation after remediation.
5. Record detection time, customer impact, resolution, and the prevention
   added before closing the incident.
