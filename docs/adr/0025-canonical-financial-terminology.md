# ADR 0025: One vocabulary and two financial lenses

- **Status:** Accepted
- **Date:** 2026-09-01
- **Deciders:** Enrique Padrón
- **Tags:** money | data | product

## Decision

This decision supersedes the cost definition and reference figures in
[ADR-0009](0009-true-cost-per-mile.md), the debt-inclusive fleet reconciliation
in [ADR-0016](0016-fleet-contribution-model.md), and any prior product wording
that equated cash after financing with profit. Their remaining decisions still
stand.

The authoritative definitions and calculation bases live in
`src/lib/finance/terminology.ts`. Dashboard, Loads, Expenses, Reports, Owner
Settlements, mobile APIs and exports must use those definitions. This ADR
records the architecture; it intentionally does not duplicate the definitions.

The model has two lenses that must never be collapsed into a number called
"net profit":

1. Performance starts with Booked Revenue and ends at Operating Profit.
2. Cash safety starts with Collected Revenue, subtracts cash operating costs,
   Debt Service and Reserve Contributions, and ends at Safe to Pay Yourself.

Accounts Receivable affects performance but never increases cash available.
A paid load without a historical payment date remains paid, but is not silently
assigned to a collection period.

Version 3 records customer cash as `PaymentEvent` rows. This permits partial
payments: each receipt increases Collected Revenue on its own date, while only
the unpaid balance remains in Accounts Receivable. A legacy paid invoice with
no events keeps its historical meaning; no migration invents receipt rows.

Load quality is classified from Contribution Profit per total mile. Allocated
operating costs may produce an Estimated Fully Loaded Operating Profit, and
Debt Service may be shown as a separate cash burden, but neither financing nor
its allocation can rewrite the load's GREAT / GOOD / MARGINAL / BAD rating.

## Versioning and history

`FINANCIAL_MODEL_VERSION` identifies the active calculation contract. New
closed settlement snapshots and financial exports carry that version. A stored
snapshot with no metadata is version 1. Closed snapshots are rendered exactly
as stored and are never backfilled or recomputed automatically.

Historical `TRUCK_PAYMENT` rows remain unallocated debt payments. New explicit
Interest Expense and Principal Payment categories may be used going forward;
no migration guesses a historical split.

Financial treatment is stored separately from the display category. Human
review may associate a payment with a `FinancialObligation`, explicitly choose
loan, operating lease, or unknown, and split a loan payment into principal and
interest. The split is atomic and must equal the original payment exactly.

Planning uses user-entered Expected Monthly Miles and the normalized trailing
operating cost per mile. Active expected monthly obligations are added only to
Cash Break-Even and fixed-obligation coverage; they never affect Operating
Break-Even or load quality.

## Guardrails

- Do not use unpaid revenue in Safe to Pay Yourself.
- Do not call cash after debt payments "Net Profit".
- Do not include debt service in load classification.
- Do not move a historical payment into a cash period without a recorded date.
- Do not mutate a closed settlement snapshot when the model version changes.
