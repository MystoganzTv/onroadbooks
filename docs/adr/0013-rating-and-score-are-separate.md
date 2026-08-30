# ADR 0013: Keep the load rating and the load score as two separate judgements

- **Status:** Accepted
- **Date:** 2026-08-29
- **Deciders:** Enrique Padrón
- **Tags:** money | product

## Context

"Was this load worth running" has two honest answers at different resolutions.

The first is a verdict against the operator's own floor: they have decided what
profit per mile makes a load GREAT, GOOD, MARGINAL or BAD, and a load either
clears it or does not. The second is nuance -- two loads can both clear the
floor while one of them ran 40% empty and the other did not.

Collapsing these into one number is the obvious simplification, and it breaks
both. Band the score and the operator's own threshold stops deciding anything.
Drop the score and the app has no way to say "this cleared your floor, but
look at the deadhead".

## Decision

Two figures, computed independently, shown together.

**The rating** stays `rateLoad()`: profit per **total** mile against the
owner's configured thresholds. GREAT / GOOD / MARGINAL / BAD. This is the
verdict.

**The score** is a separate 0-100 number, additive and deterministic:

| Component | Points | Full marks at |
|---|---|---|
| Profit per mile | 50 | 1.25x the GREAT floor |
| Profit margin | 30 | 60% margin |
| Deadhead | 20 | 0%; nothing at 2x the warn level |

Every component is displayed with the number that produced it, so "why did this
load score 87?" is answered on the screen rather than in the source.

**The score never overrules the rating.** The classification is not the score
banded.

## Alternatives considered

**One banded score.** Replaces the operator's own economics with the app's
weighting. The thresholds are theirs; the app does not get to overrule them.

**Rating only.** Loses the deadhead and margin signal that turns "it was fine"
into "it was fine despite a 40% empty run".

**An opaque or model-derived score.** Unreproducible, unarguable, and untestable
-- everything this product is not (see
[ADR-0015](0015-deterministic-insights.md)).

## Consequences

- Two numbers on a load card need an explanation, and the UI carries one.
- Changing a weight changes every historical score. The weights are exported
  constants (`SCORE_WEIGHTS`, `FULL_MARGIN_PCT`, `PPM_FULL_MARKS_MULTIPLE`) so a
  change is a visible, reviewable diff rather than a magic number in a
  component.
- The demo data is seeded to span all four bands with a score spread of 44-95,
  so both axes are visibly doing work.

## Guardrails

- Never derive the rating from the score, or vice versa.
- Every score component keeps its input on screen next to its points.
- Rating thresholds come from the owner's settings, never from a constant.

## Where this lives

`src/lib/calculations.ts` (`rateLoad`), `src/lib/finance/load-score.ts`,
`src/components/loads/`. Tests: `finance.test.ts`.
