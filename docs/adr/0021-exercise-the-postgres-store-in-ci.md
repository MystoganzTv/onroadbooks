# ADR 0021: Exercise the Postgres store in CI against a real database

- **Status:** Accepted
- **Date:** 2026-08-30
- **Deciders:** Enrique Padrón
- **Tags:** ops | data

## Context

[ADR-0003](0003-repository-interface-json-default.md) buys zero-setup
development by keeping two implementations of one interface, and pays for it by
having to implement every capability twice. The guard against drift was
`store-contract.test.ts`, which compares the two classes' **prototype method
names**, plus [ADR-0020](0020-tests-on-node-test-and-ci.md), whose 196 tests all
run against the JSON store.

On 2026-08-30 the Postgres path was driven end to end for the first time, in a
browser, against a real database. Two defects had been sitting in it:

1. **Closing a settlement failed.** `getDataset()` synthesised the two built-in
   reserve buckets in memory when the table was empty, so the UI showed buckets
   with ids (`res_tax`, `res_maintenance`) that existed nowhere in the database.
   The close then wrote a `ReserveTransaction` against one, hit the foreign key,
   and rolled back the whole transaction: the settlement stayed OPEN with no
   snapshot and no contributions. The JSON store never had the problem, because
   its `migrate()` persists the buckets on first read -- exactly what the Prisma
   comment claimed to do and did not.
2. **The Postgres seed was two releases behind.** It never wrote reserve
   buckets, settlements, reserve movements, goals or a subscription, and it
   dropped the `expenseId` link that ties a fuel purchase to its ledger row. The
   same fixture showed Safe to Pay of $2,431.13 on Postgres and $2,235.23 on JSON
   -- the missing emergency bucket, to the cent.

Neither is visible to a test suite that only runs against JSON, and neither is
visible to a parity test that compares method names.

## Decision

CI gains a second job, `postgres`, running against a `postgres:16` service:
`npm ci`, `prisma db push`, `npm run db:seed`, then `npm run smoke:postgres`.

`scripts/postgres-smoke.ts` asserts the rules that cannot be proven without a
server:

- every reserve bucket handed to the caller is a row in the database, not an
  object invented on read;
- closing a settlement stores the snapshot **and** posts its contributions,
  each tagged with the settlement;
- reopening removes exactly what the close wrote and nothing else;
- a fuel purchase writes exactly one linked ledger row, and deleting it takes
  that row with it;
- a repository bound to another business cannot read these rows.

The JSON store remains the reference implementation and the default; this job
proves the other implementation keeps the same promises.

## Alternatives considered

**Run the whole behavioural suite against both stores.** The right destination,
and much more work: those tests are written around a scratch directory and a
file. The smoke script covers the failures that actually occurred, today.

**Trust the method-name parity test.** It is what let both defects ship. It
stays -- it catches a missing method cheaply -- but it was never evidence that
the two stores behave alike.

**Test Postgres by hand before each release.** That is what happened here; it
took a browser, a database and an afternoon, and it is not repeatable.

## Consequences

- CI now needs a database service, and the pipeline is slower by roughly the
  time it takes to start Postgres and seed 200 rows.
- The Postgres seed is now part of what CI proves, so it cannot silently fall
  behind the JSON one again.
- The smoke script is not a substitute for the behavioural suite. When a rule
  gets its own JSON test, consider whether it also belongs here.

## Guardrails

- A new invariant that depends on foreign keys, transactions or generated ids
  belongs in the smoke script, not only in the JSON suite.
- Never hand the application a record the database has not stored. If a default
  has to be materialised, write it.
- Keep `prisma/seed.ts` building from `buildSeedDataset()`, remapping ids --
  including the bucket ids **inside** a stored settlement snapshot.

## Where this lives

`.github/workflows/ci.yml` (job `postgres`), `scripts/postgres-smoke.ts`,
`prisma/seed.ts`, `src/lib/db/prisma-store.ts`.
