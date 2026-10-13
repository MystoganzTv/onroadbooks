# ADR 0032: Judge a quote on real RPM, with the owner's floor as a separate gate

- **Status:** Accepted
- **Date:** 2026-10-13
- **Deciders:** Enrique Padrón
- **Tags:** money | product | ui

## Context

The owner evaluates a box-truck load by its gross per TOTAL mile, deadhead
included, against a personal floor ($1.80/total mi for his 26 ft truck). The
calculator led with loaded-mile numbers and called the MARGINAL contribution
threshold "Minimum threshold" ($2,882.61 / $1.65 per loaded mi on his test
load), which read as if a $1.75/total-mi offer satisfied his minimum. There was
no deadhead-after-delivery input and no maintenance view.

A reported "tolls are not deducted" bug was the Tolls box showing a grey
placeholder `38` while empty: the math was right, the input invited the
misreading, and $0 cost lines were hidden.

## Decision

- Two RPMs, always both: **Loaded RPM** = gross / loaded miles (the broker's
  number) and **Real RPM** = gross / total miles, where total = loaded +
  deadhead to pickup + deadhead after delivery. Decisions use Real RPM.
- The ladder is Gross -> Direct trip costs (fuel, tolls, dispatch, factoring,
  other) -> Contribution -> **Maintenance allocation** ($/total mi, default
  $0.20) -> Contribution after maintenance. Maintenance is its own layer,
  never a direct trip cost. Monthly business expenses stay reference-only.
- The **operational minimum** (default $1.80 gross per total mile) is a GATE
  evaluated beside the rating, not an input to it. The GREAT/GOOD/MARGINAL/BAD
  rating and the 0-100 score are unchanged. The UI shows both verdicts.
- The old "Minimum threshold" is renamed **Profitability floor**. Thresholds
  print per total mile first, per loaded mile second.
- Counteroffer: aim at the next profitability tier not reached, raised to the
  operational minimum whenever the offer misses it; +3% (at least $25), round
  up to $25. Also show "do not settle below" = max(operational minimum,
  profitability floor).

## Alternatives considered

**Fold the RPM floor into the rating** (BAD when below $1.80). The same load
would be BAD in the calculator and MARGINAL on the Loads page once saved,
brokers and lanes would re-rate, and the screen could no longer say WHICH rule
failed. Rejected.

**Store the floor and maintenance rate in Settings now.** Needs a schema
migration on the production database and a settings form for two numbers the
owner has not yet asked to vary. Deferred: both come from
`calculatorDefaults()`, so moving them to Settings is a one-place change.

## Consequences

- Defaults ($1.80, $0.20) suit a straight box truck; every customer sees them
  until they edit the inputs, and edits are not remembered between visits.
- The native iOS calculator (`mobile/.../LoadCalculator.swift`) has its own
  arithmetic and does not have these layers yet.
- A load saved from the calculator carries both deadhead legs in its single
  `deadheadMiles` so its RPM matches the quote; if the after-delivery leg is
  also the next load's deadhead to pickup, it would be counted twice.

## Guardrails

- The UI must never imply a load meets the floor when gross < total miles x
  floor. Compare dollars, and never print a rounded-up RPM equal to the floor
  beside "below" (`realRpmForDisplay`).
- A suggested counteroffer is never below the operational minimum nor below
  the current offer.
- Maintenance never changes direct trip costs, contribution, rating or score.
- Every direct cost line is listed, even at $0; no example-value placeholders
  on money inputs.

## Where this lives

`src/lib/finance/load-calculator.ts`, `src/lib/finance/calculator-defaults.ts`,
`src/components/calculator/calculator-panel.tsx`; held by
`src/lib/__tests__/load-calculator-floor.test.ts` and the calculator flows in
`e2e/critical-flows.spec.ts`.
