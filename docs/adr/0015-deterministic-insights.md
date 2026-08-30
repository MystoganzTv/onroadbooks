# ADR 0015: Generate insights from deterministic rules, never from a language model

- **Status:** Accepted
- **Date:** 2026-08-29
- **Deciders:** Enrique Padrón
- **Tags:** product | money

## Context

The cockpit tells the operator what changed: deadhead is up, this broker is
paying below your average, at this pace you finish the month short of your
target. The obvious way to build that in 2026 is to hand the ledger to a
language model and let it write the paragraph.

For this product that is the wrong tool. The insight sits directly beneath the
numbers that produced it, and its entire value is that the operator can check
it. A sentence that cannot be reproduced by hand from the ledger is a liability
in a financial app -- and one confident, wrong sentence about someone's income
costs more trust than ten correct ones earn.

## Decision

Insights are **deterministic rules over the numbers already on screen**. No
model, no generated prose, nothing that cannot be reproduced by hand from the
ledger.

Two hard rules:

1. **Never fabricate.** Every rule states the data it needs and produces
   nothing when that data is not there. A comparison needs a previous period
   with loads in it; a broker claim needs a broker with more than one load; a
   coverage ratio needs a priced service.
2. **Never editorialise.** An insight states what happened and, where it is
   arithmetic, what it would take to change it. It does not offer encouragement
   and it does not scold.

Insights carry a priority, so the dashboard shows the most useful few rather
than whatever the evaluation order happened to produce.

## Alternatives considered

**LLM-generated commentary.** Non-reproducible, unverifiable, non-deterministic
across renders, and impossible to unit test. It would also make the app's
correctness depend on a network call at page render.

**Show every rule that fires.** The dashboard becomes a wall of text and the one
that mattered is buried. Hence the priority.

**Thresholds tuned per user by heuristics.** Unexplainable to the user, and
"why did this warning appear" stops having an answer.

## Consequences

- Every insight is unit-testable and is tested.
- The insight set grows by writing a rule, which is slower than prompting and
  produces something that can be trusted for years.
- An empty insight list is a valid, expected state -- early in a month, or with
  a thin history. The UI treats it as normal rather than as an error.

## Guardrails

- No insight text may contain a number that is not derived in the same function
  from the same rows.
- A rule with insufficient data returns nothing. It never softens the claim to
  fit what data there is.
- If a model is ever introduced for prose, it must not compute, choose or alter
  a figure, and the underlying rule must remain the source.

## Where this lives

`src/lib/finance/insights.ts`, `src/components/cockpit/`.
Tests: `finance.test.ts`.
