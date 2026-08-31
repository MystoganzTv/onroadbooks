# ADR 0003: Put every read and write behind a Repository interface, with JSON as the default store

- **Status:** Accepted
- **Date:** 2026-08-29
- **Deciders:** Enrique Padrón
- **Tags:** data

## Context

Two requirements pulled in opposite directions.

The app had to **boot with zero setup**: clone, `npm install`, `npm run dev`,
and there is a private, empty workspace ready for real records. No Postgres, no
connection string, no migration step -- for local development, CI, and anyone
evaluating the product.

It also had to be **production-ready on a real database**, specifically Supabase
Postgres, without a rewrite. Financial data belongs in a relational store with
constraints and backups.

## Decision

All data access goes through the `Repository` interface in
`src/lib/db/repository.ts`. Two implementations satisfy it:

| `DATA_SOURCE` | Implementation | Backing store |
|---|---|---|
| `json` (default) | `JsonRepository` | `data/onroad-books.json`, seeded on first read |
| `postgres` | `PrismaRepository` | Prisma against `DATABASE_URL` |

Selection happens in one place, `getRepository()` in `src/lib/db/index.ts`.
Anything other than `postgres` -- including a half-configured environment with
`DATA_SOURCE=postgres` and no valid `DATABASE_URL` -- falls back to JSON, so the
app boots instead of crashing on a missing connection string.
`PrismaRepository` imports `@prisma/client` lazily, so the JSON path never
touches it.

The JSON store is the **reference implementation**: it is what the behavioural
tests exercise and what CI runs.

## Alternatives considered

**Postgres only, with Docker for local development.** Kills the zero-setup
promise and makes CI slower and flakier for no gain -- the app's correctness
questions are arithmetic, not query planning.

**SQLite locally, Postgres in production.** Two SQL dialects through one ORM,
which is where subtle differences hide, and still a file to migrate.

**Call Prisma directly and swap later.** "Later" never arrives cheaply; Prisma
calls spread into pages and components and the swap becomes a refactor of the
whole app rather than an environment variable.

## Consequences

- Switching backends is an environment change, not a code change.
- Every capability must be implemented twice. That is the price, and it is paid
  deliberately: `store-contract.test.ts` compares the two classes' prototype
  method names so the Postgres store cannot silently fall behind.
- The JSON store needs a `migrate()` step, because a local ledger written by an
  older build must survive an upgrade. It defaults fields added later rather
  than discarding the file. Verified against a real pre-cockpit ledger: it gains
  goals and the two built-in reserve buckets and loses nothing.
- Prisma's client is generated to `src/generated/prisma` (a custom `output` in
  `schema.prisma`) rather than `node_modules`, so it survives a clean install
  path and is imported as `@/generated/prisma`. `postinstall` runs
  `prisma generate`, and `.env` must always carry `DATABASE_URL` and
  `DIRECT_URL` even if they are placeholders. `.eslintrc.json` must ignore
  `src/generated/**` or `next build` lints the generated client.

## Guardrails

- Never import Prisma, or `fs`, from a page, component or action. Call
  `getRepository(businessId)`.
- TypeScript `private` does not hide a method at runtime. A new private helper
  on either repository class breaks the parity test -- put shared helpers at
  module level instead of widening the test's allowlist.
- Both stores resolve their paths **per call** (`dataDir()`, `dataFile()`,
  `uploadDir()`), never in a module-level constant. Capturing `process.cwd()` at
  import makes the store impossible to point at a scratch directory, which the
  behavioural tests must do.
- Extend `migrate()` whenever the schema grows.

## Where this lives

`src/lib/db/repository.ts`, `src/lib/db/index.ts`, `src/lib/db/json-store.ts`,
`src/lib/db/prisma-store.ts`, `prisma/schema.prisma`.
Tests: `store-contract.test.ts`, `store-behaviour.test.ts`,
`fleet-migration.test.ts`.
