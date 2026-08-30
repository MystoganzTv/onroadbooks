# ADR 0011: Freeze a settlement into a server-built snapshot when it closes

- **Status:** Accepted
- **Date:** 2026-08-29
- **Deciders:** Enrique Padrón
- **Tags:** money | data

## Context

Everything else in the app is derived: totals are recomputed from rows every
time a page renders, which is what keeps two screens from disagreeing (see
[ADR-0008](0008-two-calculation-layers.md)). That property is exactly wrong for
a settlement.

An owner-operator reviews the business twice a month, decides what they can take
out, and pays themselves. Six weeks later they change a reserve percentage, or
back-date a receipt they found in the truck. If the settlement recomputes, the
number they were paid on has silently changed, and the record of what they
actually did is gone.

## Decision

A settlement covers a half-month window -- 1st to 15th, 16th to end -- and has
two states.

**OPEN** recomputes live. Add a load and the settlement moves.

**CLOSED** renders a frozen `snapshot`. Closing:

1. builds the snapshot **server-side** in `closeSettlementAction`, from rows
   read through the repository -- never from anything the browser sent;
2. posts the reserve contributions for the period, each tagged with the
   settlement id.

**Reopening** clears the snapshot and deletes exactly the transactions that the
close wrote. Manual movements -- a withdrawal to pay for a brake job -- are
untouched.

If the rows underneath a closed settlement later change, the app shows a
**drift notice**. It never silently recomputes, and it never silently hides the
difference either.

This is the **only** place in the app where a calculated value is stored.

## Alternatives considered

**Always recompute.** The value the owner paid themselves on becomes
unreproducible. Rejected.

**Store the snapshot but hide drift.** Comfortable and dishonest: the operator
has no way to notice that a closed period no longer matches its own ledger.

**Build the snapshot in the browser and post it.** Makes the most
correctness-critical value in the product client-supplied. Never.

**Lock the underlying rows once closed.** Real life back-dates receipts. Locking
would push the correction outside the app.

## Consequences

- A closed settlement is an auditable record: the figures, the reserve
  contributions it posted, and the date it was closed.
- Close and reopen are exactly reversible. Verified end to end in a browser:
  close posts +$687.02, reopen returns to the cent.
- Drift has to be surfaced in the UI and understood by the user -- a small
  ongoing explanation cost, accepted as the price of honesty.
- Snapshot shape is now part of the stored schema; adding a field means teaching
  `migrate()` about it (see
  [ADR-0003](0003-repository-interface-json-default.md)).

## Guardrails

- Never compute a snapshot anywhere but in the server action.
- Reopening deletes only transactions tagged with that settlement id.
- Half-month cost per mile uses the miles and expenses that actually fell in the
  half. Monthly totals are never halved (see
  [ADR-0007](0007-single-period-resolver.md)).
- Do not add a second place where a derived value is persisted without
  superseding this ADR.

## Where this lives

`src/lib/finance/settlement.ts`, `src/lib/actions/settlements.ts`,
`src/components/settlements/`. Tests: `finance.test.ts`.
