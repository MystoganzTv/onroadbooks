# ADR 0007: Resolve every date range in one place, and never prorate a fact

- **Status:** Accepted
- **Date:** 2026-08-29
- **Deciders:** Enrique Padrón
- **Tags:** money | product

## Context

Owner-operators do not think in calendar months. They think in the two windows
they settle on -- the 1st to the 15th and the 16th to the end -- plus today,
this week, the quarter and the year so far. Every screen in the app has to agree
on what those words mean: the dashboard, the loads table, reports, exports, the
settlement page.

The tempting shortcut, when a half-month total is needed, is to take the month
and halve it. It is also the single fastest way to make the app lie: if the
truck note posts on the 1st, the first half of the month really did carry it and
the second half really did not.

## Decision

`src/lib/periods.ts` is the **only** place a date range is decided. It resolves
eight keys -- `today`, `week`, `first`, `second`, `full`, `quarter`, `ytd`,
`custom` -- into an inclusive pair of calendar dates, and everything filters
through it.

- The period is **URL state**: `?month=&period=&from=&to=`. It is shareable,
  survives a refresh, and needs no client store.
- Every total is **recomputed from the rows whose actual dates fall in the
  range**. Nothing is ever divided out of a larger total.
- `previousPeriod()` gives each period its own comparison window, so a
  half-month compares against the previous half-month rather than against half
  of something.
- `PeriodControls` sends the browser's date as `from` for `today` and `week`, so
  a server in another timezone cannot shift the day out from under the driver.

## Alternatives considered

**Let each screen compute its own range.** Guarantees that two screens
eventually disagree about what "16-End" means, and the user finds out by
noticing two different numbers for the same thing.

**Prorate monthly totals into shorter windows.** Cheap, smooth, and invents a
number that never happened. Rejected outright; see
[ADR-0009](0009-true-cost-per-mile.md).

**Keep period state in a client store or a cookie.** Not linkable, not
back-button-able, and invisible to the server that has to do the filtering.

## Consequences

- Two adjacent half-months sum exactly to the full month, and this is asserted:
  Aug 1-15 plus Aug 16-31 equals Full Month for revenue, expenses, miles and net
  profit, to the cent.
- Short windows are legitimately lumpy. A half-month containing the insurance
  payment shows a higher cost per mile, and that is the truth the app is for.
  Forward-looking tools that need a stable rate use a trailing basis instead
  (see [ADR-0009](0009-true-cost-per-mile.md)).
- Pages that need "today" outside the `today`/`week` periods must use
  `period.key === "today" ? period.start : todayISO()`.
- Goals are the one thing that *is* prorated, deliberately and with a label --
  see [ADR-0009](0009-true-cost-per-mile.md) and `src/lib/finance/goals.ts`.
  Intentions can be spread; facts cannot.

## Guardrails

- No module other than `periods.ts` constructs a period range.
- No total is ever produced by multiplying or dividing another total by a
  fraction of a window.
- Period pill accessible names differ by breakpoint (the desktop label is
  "1 - 15", not "1-15"); UI tests must account for it.

## Where this lives

`src/lib/periods.ts`, `src/lib/period-params.ts`,
`src/components/dashboard/period-controls.tsx`. Tests: `periods.test.ts`.
