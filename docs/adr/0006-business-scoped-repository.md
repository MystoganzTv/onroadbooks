# ADR 0006: Bind the repository to a businessId taken from the session, and assert it on every access

- **Status:** Accepted
- **Date:** 2026-08-29
- **Deciders:** Enrique Padrón
- **Tags:** data | ops

## Context

Every row in the app belongs to a business: loads, expenses, fuel, maintenance,
documents, goals, reserve buckets, settlements, trucks. The classic way this
goes wrong is a query that forgets its `WHERE businessId = ?`, or a route that
takes an id from the browser and trusts it. In a financial app that is not a bug
report, it is another operator's ledger on your screen.

Enforcement by convention -- "always remember to filter" -- fails the first time
someone is in a hurry.

## Decision

`getRepository(businessId)` **requires** a businessId; it throws when one is
missing. The returned repository is bound to that business, and every read and
every write asserts the scope inside the store rather than at the call site.

The businessId comes from the signed session cookie and never from user input,
a query string, a form field or a header. `AuthStore` -- account lookup, which
is what establishes the business a request belongs to -- is the only unscoped
interface in the data layer.

## Alternatives considered

**Pass businessId as an argument to each method.** Every call site becomes a
chance to pass the wrong one, and nothing stops a route from passing an id it
read off the request.

**Row-level security in Postgres.** The right answer if Postgres were the only
store, and it is not (see
[ADR-0003](0003-repository-interface-json-default.md)); the JSON path would be
left unprotected, and the JSON path is the default.

**A request-scoped global.** Invisible coupling and a nightmare under
concurrency.

## Consequences

- A page or action that has no session cannot accidentally read data: it cannot
  even construct a repository.
- Multi-truck support ([ADR-0016](0016-fleet-contribution-model.md)) fits inside
  this without change -- a truck is scoped to the business, and truck selection
  is a filter within an already-scoped repository.
- Anything genuinely cross-business (there is nothing today beyond account
  lookup) has to be an explicit, separately reviewed interface.

## Guardrails

- `store-contract.test.ts` asserts both repository constructors take exactly one
  argument. Keep it that way.
- Never read a businessId from the request. Read it from `getSession()`.
- Plan and truck-limit checks are enforced server-side in the action, not by
  hiding a button (see [ADR-0017](0017-plans-in-code.md)).

## Where this lives

`src/lib/db/index.ts`, `src/lib/db/repository.ts`, both store implementations,
`src/lib/auth/session.ts`, `src/lib/actions/*`.
