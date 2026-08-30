# ADR 0012: Model reserves as a signed transaction ledger, with each rate stored once

- **Status:** Accepted
- **Date:** 2026-08-29
- **Deciders:** Enrique Padrón
- **Tags:** money | data

## Context

The product tells an owner-operator how much of their profit is already spoken
for: tax, maintenance, and whatever else they decide to set aside. These are
**virtual buckets, not bank accounts** -- nothing here moves real money. Their
job is to answer "am I actually putting enough aside", which requires that a
balance is trustworthy and that its history explains it.

There are two built-in buckets (TAX and MAINTENANCE) whose rates live on the
Settings page, plus any number the owner adds. The obvious modelling shortcut --
give every bucket a rate column and a balance column -- creates two
opportunities for the same fact to be stored twice and drift.

## Decision

**A balance is always a running sum of signed transactions.** Never a stored
column. Contributions are positive, withdrawals negative, adjustments either
way, and the sign is decided **once, in the store, when the row is written**.

**Each rate is stored exactly once.** The built-in buckets read
`settings.taxReservePct` and `settings.maintenanceReservePct`; a custom bucket
carries its own `contributionPct`. On a built-in bucket, `contributionPct` being
null means "inherit from Settings" -- it is not a missing value.
`resolveReserveRules()` is the single reader that merges the two, so no other
module needs to know the difference.

Contributions post when a settlement is **closed** (see
[ADR-0011](0011-settlement-snapshots.md)), which ties every automatic bucket
movement to a period the owner actually reviewed. Manual contributions,
withdrawals and corrections are always available on top.

"Safe to pay yourself" is what remains after the resolved reserve rules are
applied to operating profit. It is a planning figure -- not a bank balance, and
not tax advice.

## Alternatives considered

**Store a balance column.** Fast to read and guaranteed to drift from its own
history the first time a write fails halfway. A financial figure that cannot be
re-derived from its transactions is not auditable.

**Duplicate the rate onto every bucket.** Two sources of truth for one number,
and a Settings change that mysteriously does not apply.

**Post contributions continuously as loads are entered.** Buckets would move on
data entry rather than on review, and reopening a period would have nothing
coherent to reverse.

## Consequences

- Any balance can be explained by listing its rows, which is what the reserves
  screen does.
- Reopening a settlement removes exactly its own contributions and leaves manual
  movements intact.
- Reserve rates are historical only in the sense that posted contributions are
  frozen in a snapshot; changing a rate does not rewrite past contributions,
  because past contributions are transactions.

## Guardrails

- Do not add a duplicate rate column to `ReserveAccount`.
- Do not add a cached balance column.
- `resolveReserveRules()` stays the only reader that merges settings-level and
  bucket-level rates.
- Null `contributionPct` on a built-in bucket means inherit. Do not "fix" it by
  backfilling the settings value.

## Where this lives

`src/lib/finance/reserves.ts`, `src/lib/finance/owner-pay.ts`,
`src/lib/actions/reserves.ts`, `src/components/reserves/`.
Tests: `finance.test.ts`.
