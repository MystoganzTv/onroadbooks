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
