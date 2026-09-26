# ADR 0028: Three load perspectives, and rating floors on the contribution scale

- **Status:** Partly superseded by [ADR-0031](0031-owner-operator-product.md) (driver pay is no longer a load cost; one view; new floors)
- **Date:** 2026-09-25
- **Deciders:** Enrique Padrón
- **Tags:** money | product
- **Amends:** [ADR-0013](0013-rating-and-score-are-separate.md) (score
  calibration), [ADR-0025](0025-canonical-financial-terminology.md) (load
  profitability lens)

## Context

The load screen answered three questions with one set of numbers:

1. **Business** — was the load profitable after paying the driver?
2. **Driver** — what did the driver earn for it?
3. **Owner-operator** — what did the owner receive, when the owner drove?

When the owner drives, the driver's pay is the owner's pay. Shown only as a
cost, a $1,000 load that paid the owner $330 for driving and contributed
$261.89 looked like a $261.89 load to the person who received $591.89. Shown
as profit, it would claim labour as margin. Neither is honest on its own.

The rating made it worse. The floors — GREAT $2.00, GOOD $1.50, MARGINAL $1.00
per total mile, and the score's full marks at $2.50/mi and 60 % margin — date
from the first commit, when "profit per mile" did not include driver pay
(drivers did not exist yet). They sit on the gross-rate scale. Once driver pay
became a trip cost they judged contribution after the driver against numbers
no box-truck load reaches: the $1,000 / 537 mi example grosses $1.86/mi, so it
could not rate GREAT even if it cost nothing, and a 33 % driver alone puts a
60 % margin out of reach. Every hired-driver load rated BAD.

The load calculator rated without driver pay at all, so the same load was
GREAT in the calculator and BAD on its own page.

## Decision

**One data model, three views.** `src/lib/finance/load-perspectives.ts` builds
`LoadProfitability` from the load's existing `tripExpenseLines` and the same
trailing allocation basis the page already used. Nothing is recomputed from a
second source.

- **Business** (default): Gross Revenue − Direct Trip Costs − Driver
  Compensation = Contribution Profit; − Allocated Operating Costs = Estimated
  Net Business Profit. Driver pay is always a cost here, owner or not: this is
  the view that answers "would this load work with a hired driver?". Debt
  service is shown beside it and never subtracted.
- **Driver**: Driver Compensation, pay per total and per loaded mile, pay per
  hour once hours exist (they are not recorded yet, and the screen says so).
- **Owner-Operator**: only when the assigned driver is explicitly marked as
  the owner. Owner Economic Benefit = Driver Compensation + Business
  Contribution, shown as its two parts with the sentence that it is not net
  business profit, and the net business profit beneath it.

**Owner status is stored, never inferred:** `Driver.isOwnerOperator`
(boolean, default false; migrations `drizzle/0011`, prisma
`20260926010000`). No name matching.

**The rating stays Contribution Profit per total mile** (ADR-0013, ADR-0025
unchanged in that respect). Only the calibration moves to the metric it
judges:

| | Before | Now |
|---|---|---|
| GREAT floor | $2.00/mi | $1.00/mi |
| GOOD floor | $1.50/mi | $0.60/mi |
| MARGINAL floor | $1.00/mi | $0.30/mi |
| Score: full marks per mile | $2.50 (1.25 × GREAT) | $1.25 (unchanged rule) |
| Score: full marks margin | 60 % | 40 % |

The floors remain the owner's settings. The migration moves only businesses
still on the exact old factory values (2 / 1.5 / 1); anyone who set their own
keeps them. The bundled demo fixture keeps its explicit old floors, because its
loads carry no driver pay.

**The calculator pays the driver** — a driver-pay input (percent of gross or
flat), seeded from the truck's default driver's terms, included in the
evaluation and in the target-rate solver (a percent of gross joins dispatch and
factoring in `f`).

## Alternatives considered

**One combined score for all three views.** A load can be good for the driver
and poor for the business; one number hides exactly that.

**Treat owner-driver pay as profit.** Makes owner-driven loads look better
than the same load with a hired driver, which is the comparison the owner
most needs.

**Keep the old floors and exclude driver pay from the rating.** Restores the
original metric but brings back the question the business view exists to
answer; and the calculator/page mismatch stays.

**Derive floors from the truck's allocated cost per mile.** More precise, but
it moves the owner's own thresholds behind their back every time an expense
lands. Kept as a possible later refinement.

## Consequences

- Existing loads need nothing: every figure is derived on read; no historical
  record is rewritten. Historical scores change with the new calibration,
  which the weights constants were exported for (ADR-0013).
- A load with no driver pay shows a warning in the Business view: labour is
  missing, so it overstates what the load earns with a paid driver.
- "Direct Trip Costs" now always means trip costs *without* driver pay. The
  older trip-cost waterfall and the loads-list total, which include driver pay,
  are relabelled "Trip costs + driver"; the numbers did not change. The rating
  badge reads "contribution / mile" instead of "profit / mile".
- Estimated Net Business Profit is shown as "—" until the trailing cost basis
  is sufficient (`hasSufficientOperatingCostBasis`), so it never repeats
  Contribution Profit with a $0.00 allocation.
- The iOS calculator computes locally with the same model: a "Pago al chofer"
  % / $ field seeded from `driverPayMode` / `driverPayValue`, subtracted before
  contribution and included in the target-rate fee share.

## Guardrails

- Driver Compensation is never labelled or summed as profit.
- Owner Economic Benefit is never shown as a single unexplained number.
- Per-mile profit always divides by total miles; loaded RPM is a market rate.
- Owner-Operator appears only for a driver explicitly marked as the owner.

## Where this lives

`src/lib/finance/load-perspectives.ts`, `src/components/loads/load-profitability-card.tsx`,
`src/lib/calculations.ts` (`DEFAULT_RATING_THRESHOLDS`),
`src/lib/finance/load-score.ts`, `src/lib/finance/load-calculator.ts`.
Tests: `load-perspectives.test.ts`.
