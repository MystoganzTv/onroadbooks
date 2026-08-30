# ADR 0022: Price by depth — ledger, cockpit, fleet — and sell nothing that is not built

- **Status:** Accepted
- **Date:** 2026-08-30
- **Deciders:** Enrique Padrón
- **Tags:** product | money

## Context

[ADR-0017](0017-plans-in-code.md) put a two-tier catalogue in code: Individual
at $29 for one truck, Fleet at $49 for five, with the truck limit as the only
thing a plan gated. That worked while the product was a single-truck ledger.
It stopped working for two reasons.

**The market prices this differently.** Rigbooks sells everything, IFTA
included, for $19 flat. TruckLogics charges $39.95 for an owner-operator and
$79.95 for a small fleet. A single $29 tier sits in the dead space between the
cheap ledger and the real tool, and looks expensive against the first and thin
against the second.

**A draft pricing page had been written around taxes** — IFTA mileage by state,
driver settlements and pay, multi-user access. None of those exist. Two of them
are large builds, and the third contradicts the auth model
([ADR-0005](0005-dependency-free-auth.md)), which is single-owner by design.
Selling them would have put the first refund request inside the first month.

And IFTA specifically fights the positioning. A two-axle box truck at or below
26,000 lb is generally not a qualified motor vehicle, so IFTA does not apply to
the operator this product is for — the non-CDL 26-footer. Advertising it says
"this is for semis" to the wrong audience while promising the right audience
something they do not need.

## Decision

Three tiers, priced where the market already is, split by **how deep the
product goes** rather than by how much of the same thing you get:

| | | | |
|---|---|---|---|
| **Solo Starter** | $19 | 1 truck | The book: what happened |
| **Owner-Operator** | $39 | 1 truck | The cockpit: what to do next |
| **Small Fleet** | $89 | 8 trucks | The units: which truck pays |

Two capabilities carry the split — `cockpit` and `fleet` — and both are
enforced server-side:

- pages check `planAllows(subscription, capability)` and render `PlanGate`
  instead of the tool;
- writes go through `repositoryWith(capability)` in `lib/actions/guards.ts`,
  which throws the refusal the action's own `catch` already surfaces.

Solo Starter and Owner-Operator both cover one truck, so the truck limit no
longer says which plan is bigger. `rank` does, and upgrade versus downgrade is
decided against it.

**On taxes, three separate things, three separate answers:**

1. **Tax and maintenance reserves — keep.** Already built, already the most
   emotionally direct thing in the product ("how much of this is mine?"). It
   is what Owner-Operator is for.
2. **A year-end packet for the accountant — build it, do not sell it yet.**
   The pieces exist as separate exports; bundling them is cheap and the
   perceived value is high. It goes on the page when it ships, not before.
3. **Computing anybody's tax liability — never.** It varies by state and by
   entity, and it is advice. The line the product holds is: your accountant
   files; we hand them the file.

**IFTA is not on the roadmap** until the product decides to serve CDL
owner-operators rather than box trucks. It is a positioning decision, not a
feature request.

Anyone on the old **Individual** plan maps to **Owner-Operator**, not to Solo
Starter: they were sold the cockpit and they keep it. The mapping lives in
`LEGACY_PLAN_IDS` and is applied on read by `getPlan`, plus in the JSON store's
`migrate()` so an existing local ledger is rewritten once.

## Alternatives considered

**Keep two tiers and just move the prices.** Leaves the same dead space, and
gives the $19 buyer nothing to grow into.

**Split on volume — loads per month, trucks, storage.** Punishes the operator
for running more, which is the opposite of what the product is for.

**Ship the tax and IFTA tier anyway and build it during the trial.** The
fastest possible way to turn the first fifty customers into the first fifty
refunds, in a category where trust is the whole product.

**Gate by hiding navigation.** Presentation is not enforcement; anyone who can
send a request can post to the action. Same rule as the truck limit.

## Consequences

- Solo Starter is a real product on its own — a ledger with true cost per mile
  — rather than a crippled version of the paid one. That matters against a $19
  competitor that gives everything away.
- The dashboard now renders differently on Solo: the ledger sections stay, the
  Available Cash tile becomes Cost / Mile, and the decision panels are replaced
  by one panel that says where they live.
- Every cockpit write costs one extra dataset read for the gate. These are
  low-frequency writes and the trade is worth the guarantee.
- Small Fleet at $89 carries an honest early-access note: everything listed
  works today, and a second sign-in does not exist yet.
- The catalogue is now the only place a price or a plan name is written. The
  landing page renders `getPlan(id).name` and `.priceMonthly`; only the
  localized prose lives in `lib/marketing/copy.ts`.

## Guardrails

- Never list a feature on a plan that is not shipped. An early-access note that
  names what is missing is the most a plan may promise.
- Never render a price or a plan name from anything but `lib/plans.ts`.
- Every capability-gated write goes through `repositoryWith`. A page check
  alone is not the gate.
- Each tier must be the one below plus something: a capability that appears on
  a cheaper plan and vanishes on a dearer one makes an upgrade a downgrade, and
  `plans.test.ts` asserts it cannot happen.
- Dropping a tier never touches a row. Downgrade is refused only when the
  trucks would not fit.

## Where this lives

`src/lib/plans.ts`, `src/lib/actions/guards.ts`,
`src/components/shared/plan-gate.tsx`, `src/lib/marketing/copy.ts`,
`src/components/marketing/landing-page.tsx`, the gated pages under
`src/app/(app)`. Tests: `plans.test.ts`.
