# ADR 0030: Estimate a load's fuel from the truck's reference MPG

- **Status:** Accepted
- **Date:** 2026-09-26
- **Deciders:** Enrique Padrón
- **Tags:** money | product
- **Amends:** the load fuel estimate in `load-estimates.ts` (introduced with
  expected driver pay)

## Context

Fuel purchases belong to the truck, not the trip, so a load's fuel is
estimated until its receipts are in. The estimate was the ledger's fuel
dollars divided by the truck's load miles over 90 days. It invents nothing,
but it is noisy early and opaque:

- With a few days of history, a full tank bought today pays for miles not yet
  driven. A box truck doing 8.5 MPG at $6.40/gal ($0.75/mi) showed $0.85/mi,
  so a 308-mile load estimated $261 instead of about $232.
- The load could only say "308 mi × $0.85/mi". The owner had no way to see
  why, or to correct it.
- The calculator asked for MPG every time and never remembered it, so the
  calculator and the load priced the same trip two different ways.

This has to work for every owner-operator, not one truck: a sprinter, a box
truck and a tractor differ, and nothing may be guessed from a fleet average.

## Decision

- **Truck.referenceMpg** — optional, per truck, entered by the owner (truck
  form and onboarding). Null until entered; never prefilled.
- **One rate rule** (`src/lib/fuel-estimate.ts`, `truckFuelBasis` in
  `load-estimates.ts`), used by every load view, the web calculator and the
  mobile calculator API:
  1. **MPG**: total miles ÷ reference MPG × this truck's price — its latest
     fill-up within 30 days, else its gallon-weighted average over 90 days.
  2. **LEDGER**: the previous measured $/mi, when there is no MPG or no price.
  3. **Nothing**: the load says the estimate is unavailable rather than $0.
- **Show the arithmetic**: "308 mi ÷ 8.5 MPG × $6.40/gal" on the load; the
  truck shows its fuel $/mi and where it came from.
- **Measured vs reference**: once the ledger has 2,000+ miles and differs from
  the reference by more than 10 %, the truck says so, with the MPG the ledger
  implies. A gap usually means the MPG is optimistic or the truck drives
  miles no load records (bobtail, unlogged deadhead); the app never changes
  the MPG itself.
- Total miles always include deadhead. A fuel amount recorded on the load
  still wins over any estimate.

## Alternatives

**Keep the ledger rate only.** Honest in the long run, wrong and unexplained
in the first weeks, which is when a new customer judges the app.

**Industry-default MPG by equipment type.** Would give new customers a number
immediately, but it is somebody else's truck — exactly the guess the app
refuses to make. A placeholder ("8.5") shows the format without being used.

**A public diesel price (EIA weekly, by region) when there are no
purchases.** Useful for brand-new accounts; deferred because it needs an
outside service. It would slot in as a third price source, labelled.

## Consequences

- Existing loads need nothing: estimates are computed on read. Trucks without
  an MPG keep the ledger rate, so nothing changes until an owner enters one.
- Migration `0013_truck-reference-mpg` / `20260926030000_truck_reference_mpg`
  adds a nullable `numeric(5,2)` column. No backfill.
- The iOS calculator seeds its MPG field from the API's `mpg`, which is now
  the truck's reference MPG, with no app change.

## Where this lives

`src/lib/fuel-estimate.ts`, `src/lib/load-estimates.ts`,
`src/components/loads/trip-waterfall.tsx`, `src/components/truck/*`,
`src/app/(app)/calculator/page.tsx`, `src/app/api/mobile/calculator/route.ts`.
Tests: `fuel-estimate.test.ts`, `load-estimates.test.ts`,
`store-behaviour.test.ts` ("truck reference MPG").
