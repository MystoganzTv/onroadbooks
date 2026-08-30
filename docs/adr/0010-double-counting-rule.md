# ADR 0010: Trip costs answer per-load profitability; period totals come from the expense ledger only

- **Status:** Accepted
- **Date:** 2026-08-29
- **Deciders:** Enrique Padrón
- **Tags:** money | data

## Context

The app records the same dollar in two legitimate places. A load carries its own
fuel, tolls, dispatch fee, factoring fee and other costs, because "was this load
worth running" cannot be answered without them. The expense ledger records what
the business actually spent, because "what did the truck cost this month" cannot
be answered without that.

Add both into one period total and the operator's expenses are overstated,
sometimes badly. Add neither in the wrong place and profit is overstated. This
is the single most dangerous class of bug in the product, and it is invisible --
the number simply looks a little off.

## Decision

**Trip-level costs on a `Load` drive per-load profitability only. Period
operating expenses come from the expense ledger only.** No exceptions.

Where a trip cost is also a real expense, the link is explicit and one-way:

- A `FuelEntry` creates its FUEL ledger row through an explicit `expenseId`
  column, `expfuel_<fuelId>`.
- A `MaintenanceRecord` optionally creates a linked ledger row,
  `expmaint_<id>`.
- Deleting a load **unlinks** its expenses and fuel (`loadId` set to null); it
  never deletes them. Money that left the business does not disappear because a
  trip record was tidied up.

The same rule applies forward-looking: the load calculator's
`overheadCostPerMile` excludes fuel, tolls, dispatch and factoring precisely
because the calculator collects them as inputs (see
[ADR-0009](0009-true-cost-per-mile.md)).

## Alternatives considered

**Roll trip costs into period expenses automatically.** Then every operator who
also records the fuel receipt -- which is most of them, since receipts are how
taxes get filed -- double-pays for fuel in their own dashboard.

**Drop trip-level costs and derive per-load profit from the ledger.** Impossible
in practice: an expense is rarely attributable to a single load, and the ones
that are get attributed after the fact.

**A "counted / not counted" flag on each row.** Puts a correctness-critical
decision in the hands of whoever is entering data at a truck stop at 11pm.

## Consequences

- Per-load profit and period profit are computed from different inputs on
  purpose, and they are not expected to reconcile row by row.
- The link columns are how a fuel entry and its expense stay in step; they must
  be preserved by any store migration.
- Deleting a load leaves orphaned-but-intact expenses, which is correct and
  occasionally surprising. The UI says so.

## Guardrails

- Never sum a load's `fuelCost`, `tolls`, `dispatchFee`, `factoringFee` or
  `otherExpenses` into a period total.
- Never let a delete cascade from a load to an expense or a fuel entry.
- When adding a new record type that spends money, decide explicitly which side
  of this line it sits on and write the link column if it sits on both.

## Where this lives

`src/lib/calculations.ts` (`summarizePeriod`, `loadMetrics`),
`src/lib/finance/cost-per-mile.ts`, `src/lib/db/*-store.ts`,
`src/lib/actions/loads.ts`, `src/lib/actions/fuel.ts`,
`src/lib/actions/maintenance.ts`.
