# ADR 0014: Refuse to rank on thin data, and never average two directions of a lane

- **Status:** Accepted
- **Date:** 2026-08-29
- **Deciders:** Enrique Padrón
- **Tags:** money | product

## Context

A one-truck operation runs a few dozen loads a month. That is a wonderful amount
of data for totals and a terrible amount for rankings. "Your best lane is
VA to NJ" sounds authoritative and, on two loads, means nothing -- one of which
may have been a favour for a broker. An operator who reroutes their month around
an anecdote is worse off than one with no lane report at all.

Direction compounds it. VA to NJ and NJ to VA are two different businesses: one
may be the strong outbound and the other the near-empty backhaul that pays for
getting home. Averaged together they produce a lane that does not exist.

## Decision

- **Lanes are directional.** `VA>NJ` is not `NJ>VA`. They are never averaged.
- **Lanes are grouped state to state.** City and market level grouping is a
  later refinement; state pairs are what a one-truck operation has enough loads
  to say anything about.
- **A lane is not ranked below `LANE_MIN_LOADS = 3`.** Two loads is an anecdote,
  and a ranking built on anecdotes is worse than no ranking.
- **Broker performance is ordered on total trip profit but rated on profit per
  mile driven.** Two different axes, on purpose: the ordering answers "who is
  worth the most to me", the rating answers "who pays well per mile".
- An insight that needs a comparison produces nothing when the comparison is not
  available (see [ADR-0015](0015-deterministic-insights.md)).

## Alternatives considered

**Rank everything and let the user judge.** The user cannot judge -- the sample
size is not on the card, and the ranking implies confidence the data does not
support.

**Show thin lanes greyed out.** Considered; still puts an unearned ordering on
screen. The minimum is a floor, not a style.

**Group lanes by city pair.** More precise and almost always below the minimum,
so the report would be empty.

**Sort brokers by the same metric they are rated on.** Tidier, and it buries the
broker who gives steady, decent-margin volume beneath one lucky high-rate run.

## Consequences

- In the demo data, lanes only qualify at Quarter or YTD (2 of 9 in August
  alone). That is the guard working, not a bug.
- The lane and broker reports get better the longer the app is used, which is
  correct and needs saying in the UI.
- Anyone reading the code will eventually wonder why the broker sort and the
  broker rating disagree. They are two axes; do not "fix" the sort.

## Guardrails

- `LANE_MIN_LOADS` is a named exported constant. Lowering it needs a reason
  written down here, not in a commit message.
- Never merge the two directions of a lane.
- Never rank on a sample the UI does not display.

## Where this lives

`src/lib/finance/lanes.ts`, `src/lib/finance/brokers.ts`,
`src/lib/calculations.ts` (`brokerPerformance`). Tests: `finance.test.ts`.
