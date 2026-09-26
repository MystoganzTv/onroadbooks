# ADR 0031: An owner-operator product

- **Status:** Accepted
- **Date:** 2026-09-26
- **Deciders:** Enrique Padrón
- **Tags:** product | money
- **Supersedes:** the Driver and Owner-Operator views and the driver-pay
  calibration of [ADR-0028](0028-load-profitability-perspectives.md); the
  startup-investment period (`startup-costs.ts`)

## Context

OnRoad Books had grown three audiences at once: an owner-operator, a fleet
with hired drivers, and a business still setting up. Each added its own
numbers to the same screens -- driver pay as a load cost, Business / Driver /
Owner-Operator views of one load, a "startup investment" held out of profit,
several units and a Fleet plan. For the customer the product is sold to -- one
owner who drives one truck -- most of it was noise, and some of it moved the
numbers he reads every day.

## Decision

- **Drivers stay, out of the money.** A load still records who ran it, and the
  Drivers page shows what each driver earned from their pay terms, on every
  plan. Driver pay is never a load cost: it is not a trip-cost line, not
  estimated from the terms, not in either calculator, and a `DRIVER_PAY`
  expense linked to a load is not added to it. The load has one profitability
  ladder (`lib/finance/load-perspectives.ts`): Gross Revenue - Direct Trip
  Costs = Contribution Profit, then Allocated Operating Costs = Estimated Net
  Business Profit, debt service beside it.
- **Rating floors for that ladder:** $1.25 / $0.90 / $0.60 contribution per
  total mile, full margin marks at 60 %. Migration 0014 moves settings still
  on the previous defaults ($1 / $0.60 / $0.30); custom floors are kept. The
  $1,000 / 537 mi example ($591.89, $1.10/mi, 59 %) now rates GOOD.
- **Fleet hidden, not deleted.** `FLEET_VISIBLE = false` in `lib/product.ts`
  hides the Fleet page and nav item, the Fleet plan tile, the multi-truck
  account block on the truck page, fleet overhead allocation in Settings, and
  Driver Pay statements (their routes redirect to /truck and /drivers). The iOS
  More menu drops Fleet and Driver Pay. Team invites still follow the plan, so
  an accountant invited under a complimentary Fleet grant keeps access.
- **No startup period.** `startup-costs.ts` is removed: every expense counts
  in operating results from the date it carries, including spending before
  the first load.

## Consequences

- Load profit for an owner who pays a hired driver is overstated by that pay;
  the product no longer models that case. Driver earnings remain visible on
  the Drivers page.
- Owners with expenses before their first load see them in profit and cost
  per mile again (Expenses, Reports and exports always carried them).
- Existing Driver Pay statements, and the ledger rows paid ones posted, are
  kept; nothing creates new ones while the page is hidden.
- `Driver.isOwnerOperator` (migration 0011) is no longer read or edited; the
  column stays.
- The Fleet e2e test is skipped while `FLEET_VISIBLE` is false.
