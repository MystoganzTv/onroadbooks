# ADR 0008: Split the money code into a primitive layer and a product layer

- **Status:** Accepted
- **Date:** 2026-08-29
- **Deciders:** Enrique Padrón
- **Tags:** money

## Context

`src/lib/calculations.ts` started as the home for every formula in the app, and
it was the right first move: components stopped dividing numbers themselves, so
a change to a definition propagated everywhere at once.

Then the product grew from "a ledger with totals" into a cockpit that answers
specific questions -- what does a mile cost, how much can I safely take out, was
this load worth it, which brokers pay, am I on track this month. Those answers
are not primitives. They are policy: thresholds, minimum sample sizes, what
counts as overhead, what gets excluded to avoid double-counting. Putting them in
the same file as `div()` would have produced a two-thousand-line module where a
rounding helper and a business rule about factoring fees sit side by side.

## Decision

Two layers, both pure, both server-side.

**Primitive layer -- `src/lib/calculations.ts`.** `div` (divide-by-zero safe,
returns 0 rather than Infinity or NaN), `roundMoney` (half away from zero, and
normalises `-0` so a rounded-away loss never prints as `-$0.00`), `sum`,
`pctChange`, `summarizePeriod`, `loadMetrics`, `rateLoad`, `categoryTotals`,
`brokerPerformance`, `analyzeDeadhead`, `moneyBreakdown`.

**Product layer -- `src/lib/finance/`.** One file per question, built on the
primitives: `cost-per-mile`, `owner-pay`, `settlement`, `load-score`,
`load-calculator`, `deadhead`, `brokers`, `lanes`, `goals`, `reserves`,
`maintenance-health`, `fleet`, `insights`.

Pages compose these functions and do no arithmetic of their own. Components
never divide. Every function takes rows and returns numbers -- no I/O, no
repository access, no React.

## Alternatives considered

**One file.** Already outgrown; a single module makes the boundary between "a
safe division" and "a business rule about deadhead" invisible.

**Compute in the page or the component.** The reason the app's numbers agree
across screens is that they come from the same function. This is the rule that
protects that.

**Methods on model classes.** Rows come from two different stores; keeping the
finance layer as pure functions over plain data is what makes the whole suite
run in about a second with no database.

## Consequences

- Every financial claim the product makes is a testable pure function.
  `src/lib/__tests__/finance.test.ts` covers the product layer;
  `calculations.test.ts` covers the primitives.
- Two screens showing the same figure cannot disagree, because there is only one
  implementation.
- There is a small indirection cost: a new figure means a new function rather
  than an expression in a component. That cost is the feature.
- All ratios go through `div`, so a period with no miles renders `$0.00` rather
  than `NaN`.

## Guardrails

- No component, page or route handler performs arithmetic on money or miles.
- No function in `lib/finance` reads the database, the environment or the
  clock beyond a passed-in date range.
- Subtract dollars and divide once. Subtracting four already-divided rates
  accumulates float noise that then gets multiplied back up by hundreds of miles
  -- this is exactly how `overheadCostPerMile` is computed, and why.

## Where this lives

`src/lib/calculations.ts`, `src/lib/finance/` (see its `index.ts` header for the
question-to-function map). Tests: `calculations.test.ts`, `finance.test.ts`.
