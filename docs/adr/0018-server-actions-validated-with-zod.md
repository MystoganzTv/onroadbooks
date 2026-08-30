# ADR 0018: Mutate through server actions that validate with zod and return a typed result

- **Status:** Accepted
- **Date:** 2026-08-29
- **Deciders:** Enrique Padrón
- **Tags:** ops | data

## Context

Every write in the app comes from a form filled in on a phone, often one-handed,
often at night: a load, an expense, a fuel entry, a maintenance record, goals,
reserve buckets, settlements, trucks, settings. Two things have to be true of
each. The data must be valid before it reaches the store -- a negative mileage
or a 1e9 rate quietly poisons every average downstream. And the person entering
it must be told which field is wrong, in place, without losing what they typed.

Validating only in the browser is not validation. Validating only in the store
produces error messages written for a developer.

## Decision

Mutations are **server actions** in `src/lib/actions/`, one file per domain.
Each action follows the same shape:

1. `safeParse` the input against a schema from `src/lib/schemas.ts` (zod);
2. on failure, return `{ ok: false, error, fieldErrors }`, where `fieldErrors`
   maps the first issue per field via `fieldErrorsFrom`;
3. otherwise `requireSession()`, take the businessId from the session, and write
   through `getRepository(businessId)`;
4. `revalidatePath` and return `{ ok: true }`, or return a readable message on
   failure.

The `ActionResult` union is the only contract between actions and forms:
`{ ok: true; id? } | { ok: false; error; fieldErrors? }`. Actions do not throw
at the UI, and they do not redirect on failure.

Schemas are **shared with the client** via `react-hook-form` and
`@hookform/resolvers`, so the same rules give instant feedback in the browser and
the authoritative answer on the server.

Route handlers under `src/app/api` remain only for auth and for serving private
documents.

## Alternatives considered

**REST endpoints per resource.** More moving parts, hand-written fetch calls,
and no type continuity between the form and the handler.

**Trust client validation.** The browser is not a trust boundary; the store
would be defended by hope.

**Throw and catch at a boundary.** Turns an expected, routine event -- a
mis-typed field -- into an exception, and loses per-field messages on the way
up.

## Consequences

- Every write is validated exactly once on the server, with the same rules the
  form used.
- Bounds are stated in one place (`money` maxes at 1,000,000, `miles` at
  100,000, dates must be `YYYY-MM-DD`), so absurd values cannot reach the
  finance layer and silently distort an average.
- Forms are dumb: submit, receive an `ActionResult`, paint field errors.
- Adding a field means touching a schema, an action and a form -- deliberate
  friction on the path that writes to the ledger.

## Guardrails

- No action writes before `safeParse` succeeds.
- No action takes a businessId, or any id used for scoping, from its input.
- Error strings are written for the operator, not for a log.
- Validation rules live in `schemas.ts`; do not re-check bounds inside a store.

## Where this lives

`src/lib/actions/`, `src/lib/actions/types.ts`, `src/lib/schemas.ts`,
`src/lib/form.ts`, `src/components/**/forms`.
