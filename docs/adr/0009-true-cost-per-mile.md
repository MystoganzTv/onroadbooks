# ADR 0009: Compute cost per mile from what actually happened, and use a trailing basis for forward-looking tools

- **Status:** Accepted
- **Date:** 2026-08-29
- **Deciders:** Enrique Padrón
- **Tags:** money | product

## Context

Cost per mile is the number an owner-operator runs their business on. It decides
whether a load is worth taking, what rate to quote, and whether the truck is
paying for itself. If it is wrong, everything downstream is wrong in the same
direction and the app is worse than a notebook.

Two pressures push it away from the truth. The first is prorating: a half-month
view "should" show half the truck note, so the number looks smooth. The second
is averaging: a load calculator "should" use a tidy figure rather than a period
that happened to contain the annual insurance bill.

## Decision

**One definition, applied everywhere:**

```
true cost per mile = every operating expense dated inside the window
                     -------------------------------------------------
                     every mile driven inside the window (loaded + deadhead)
```

Four consequences are deliberate, not accidental:

1. **Nothing is prorated.** A 1-15 settlement is not "half the month's costs".
   The half that carried the truck note really was dearer, and the app shows
   that rather than inventing an average.
2. **Expenses come from the expense ledger only.** Trip-level costs recorded on
   a load feed per-load profitability and never enter a period total (see
   [ADR-0010](0010-double-counting-rule.md)).
3. **Deadhead miles are in the denominator.** A mile is a mile; the empty ones
   still burn fuel and still wear the truck.
4. **Fixed versus variable is the owner's own classification**, taken from
   `FinancialSettings.categoryBehavior`, because an operator who leases parking
   monthly should be able to say so.

**For anything forward-looking, use `trailingCostBasis`:** a rolling 90-day
window, falling back to all history below 500 miles. The load calculator, the
target-rate tool and deadhead costing all use it, because a single annual bill
inside the selected period must not change the answer to "what should I quote".

**`overheadCostPerMile`** is the trailing true cost per mile with FUEL, TOLLS,
DISPATCH and FACTORING removed, because the calculator asks for those four
explicitly. Charging them twice is the classic way a load calculator flatters a
bad load. The four are subtracted **as dollars**, then divided once.

**Prorating a target is fine; prorating an expense is not.** Goals are stored as
monthly targets and compared against a share of the target scaled by working
days, always labelled as pro-rated. Rates and ceilings -- profit per mile,
maximum deadhead percentage -- never scale with window length. Facts are never
prorated; intentions are.

## Alternatives considered

**Prorate monthly fixed costs across the window.** Produces a stable, pretty,
fictional number. The whole product promise is that the figures are the
operator's real ones.

**Exclude deadhead from the denominator.** Makes cost per mile look better and
makes the deadhead problem invisible -- which is the problem the app is meant to
surface.

**Use the selected period for the load calculator.** Then the answer to "should
I take this load" depends on which pill the user last clicked. Rejected; hence
the trailing basis.

**Subtract four already-divided per-mile rates from the total rate.** Simpler to
read, and it accumulates floating-point noise that gets multiplied back up by
several hundred miles.

## Consequences

- Short windows are lumpy, and the UI must explain that rather than smooth it.
- Two figures coexist on purpose: the **period** cost per mile (what happened)
  and the **trailing** cost per mile (what to plan with). They will differ, and
  each is labelled for what it is.
- Changing the 90-day window changes quoted rates across the app. It was chosen
  deliberately on 2026-08-29 as long enough to absorb a maintenance event and
  short enough to track a fuel-price change.
- The demo dataset pins the expected numbers: at `?month=2026-08&period=full`,
  revenue $9,795, expenses $6,143.90, net $3,651.10, true cost per mile $1.84,
  safe to pay $2,235.23. A different number after a change means the seed or the
  maths moved.

## Guardrails

- Never divide a monthly total by a fraction of a window.
- Never add fuel, tolls, dispatch or factoring to a calculation that already
  takes them as inputs.
- Deadhead cost is priced at the cost per mile **rounded to cents**, because the
  card prints "883 mi x $1.84" beside the total and an owner who checks the
  multiplication must find that it ties.
- Read the header of `cost-per-mile.ts` before changing anything in it.

## Where this lives

`src/lib/finance/cost-per-mile.ts`, `src/lib/finance/load-calculator.ts`,
`src/lib/finance/deadhead.ts`, `src/lib/finance/goals.ts`.
Tests: `finance.test.ts`.
