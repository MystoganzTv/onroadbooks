# ADR 0020: Test the money on node:test with no framework, and gate every push on four checks

- **Status:** Accepted
- **Date:** 2026-08-29
- **Deciders:** Enrique Padrón
- **Tags:** ops

## Context

The correctness that matters in this product is arithmetic and rules, not
rendering: cost per mile, safe-to-pay, settlement close and reopen, score
components, lane minimums, fleet reconciliation, period boundaries, store
parity. All of it is pure functions over plain data (see
[ADR-0008](0008-two-calculation-layers.md)), which is the easiest possible thing
to test -- provided the test setup does not become a project of its own.

## Decision

**`npm test` runs the built-in Node test runner** over the pure layers:

```
node --conditions=react-server --import tsx --test "src/lib/__tests__/*.test.ts"
```

No Jest, no Vitest, no transform config, no mocking framework. 196 tests today,
covering the primitives, the finance layer, periods, exports, maintenance,
plans, the fleet migration, and both stores (behaviour against JSON, prototype
parity against Prisma).

**CI runs four gates on every push and every pull request** -- types, lint,
tests, build -- with `DATA_SOURCE=json`, `DOCUMENT_STORAGE=local` and a fixed
throwaway `AUTH_SECRET`. CI never talks to Postgres: the JSON store is the
reference implementation.

## Alternatives considered

**Jest or Vitest.** Real value for component testing and mocking, neither of
which this suite needs, in exchange for configuration that has to be maintained
against Next, TypeScript and ESM.

**A component or E2E suite in CI.** Browser-level verification is done
deliberately and by hand at milestones (a real Playwright pass on a production
build, including hydration, dialogs, server actions and a 390px overflow check).
Keeping it out of CI keeps the gate fast and non-flaky; the trade is that a UI
regression is caught by a person, not by the pipeline.

**Snapshot tests of the numbers.** They pass until someone updates the snapshot.
The reference fixture's expected figures are asserted as explicit values instead.

## Consequences

- The suite runs in about a second with no database and no browser.
- `--conditions=react-server` is **required**, or the `server-only` marker
  throws at import.
- The project is CJS, so tsx transpiles tests to CJS and **top-level `await` is a
  build error**. Load modules in a `before()` hook.
- `npm ci` runs `postinstall`, which regenerates the Prisma client into
  `src/generated` -- that directory is not in the repository, and
  `.eslintrc.json` must ignore it or `next build` lints the generated client.
- Regenerating the Prisma client locally needs delete permission on the folder;
  without it `prisma generate` fails with `EPERM: unlink .../edge.d.ts`.

## Guardrails

- New rules in `lib/finance` ship with tests. That is what makes the numbers
  defensible.
- Do not add a private method to either repository class -- TypeScript `private`
  does not hide it at runtime and the parity test compares prototype method
  names. Put shared helpers at module level.
- The fixture figures are assertions, not decoration. If August 2026 stops showing
  revenue $9,795 / expenses $6,143.90 / net $3,651.10 / CPM $1.84 / safe to pay
  $2,235.23, either the seed or the maths moved -- find out which.

## Where this lives

`package.json` (`test`, `typecheck`, `lint`), `src/lib/__tests__/`,
`.github/workflows/ci.yml`, `.eslintrc.json`.
