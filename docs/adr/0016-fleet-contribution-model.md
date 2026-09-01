# ADR 0016: Measure a truck by its contribution and subtract overhead once, at the fleet level

- **Status:** Accepted
- **Date:** 2026-08-29
- **Deciders:** Enrique Padrón
- **Tags:** money | product

## Context

The app began as a one-truck cockpit, where "did I make money" has a single
answer. A business with a second truck asks two questions that sound like one
and are not:

- **Per unit:** does *this* truck pay for itself? Decides keep, sell, replace.
- **Fleet:** does the *business* make money? Decides what can be taken out.

They differ by overhead -- the phone bill, the accountant, insurance on the
business rather than on a unit -- and how overhead is handled is the whole
design. Both naive answers are wrong. Impute a share of overhead to each truck
and the per-unit number becomes an opinion about how to divide rather than a
fact about what happened. Leave overhead out entirely and every truck looks
profitable while the business loses money.

## Decision

```
revenue - the unit's own costs   = CONTRIBUTION      (per truck)
sum of contributions - overhead  = OPERATING PROFIT  (fleet)
```

- A unit is **never** charged a share of the phone bill. Its costs are its own.
- Overhead is subtracted **once, visibly, at the bottom**.
- Expenses carry a scope: `TRUCK` charges a unit, `BUSINESS` is fleet overhead
  and carries no truck.
- `overheadPerMile` exists because quoting work does need a fully loaded number.
  It is reported **separately and labelled as allocated**, never folded into a
  unit's own figures.

The reconciliation this guarantees, and which the tests assert:

```
sum(contributions) - overhead === booked revenue - operating expenses
                                              === summarizePeriod().operatingProfit
```

A fleet view that did not tie back to the single number on the dashboard would
be worse than no fleet view.

## Alternatives considered

**Allocate overhead per truck by miles or by revenue.** Every allocation basis
gives a different answer, none of them a fact, and a keep-or-sell decision then
rests on the choice of divisor.

**Per-truck profit and loss with no fleet roll-up.** Nothing ties to the
dashboard, and the operator has two sets of books.

**A separate fleet application.** Same data, same formulas; a second app would
be a second place for the numbers to diverge.

## Consequences

- The single-truck case is unchanged: one contribution, minus overhead, equals
  operating profit. Debt service remains a separate cash burden.
- Existing single-truck data migrates by attaching rows to a primary truck --
  covered by `fleet-migration.test.ts`.
- The number of trucks is what the plan gates (see
  [ADR-0017](0017-plans-in-code.md)).
- The word "profit" must be used carefully in the UI: a truck has a
  contribution, the business has a profit.

## Guardrails

- Never impute overhead into a unit's own figures.
- Keep the reconciliation assertion in the test suite. If it ever fails, the
  fleet view is wrong, not the dashboard.
- A new expense type must declare its scope; defaulting silently to `TRUCK`
  quietly reintroduces imputed overhead.

## Where this lives

`src/lib/finance/fleet.ts`, `src/lib/fleet.ts`, `src/lib/actions/trucks.ts`,
`src/components/fleet/`. Tests: `finance.test.ts`, `fleet-migration.test.ts`.
