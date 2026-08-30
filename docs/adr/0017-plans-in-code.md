# ADR 0017: Keep the plan catalogue in code and enforce its limits server-side

- **Status:** Accepted
- **Date:** 2026-08-29
- **Deciders:** Enrique Padrón
- **Tags:** product | ops

## Context

OnRoad Books sells two plans: Individual at $29/month for one truck, and Fleet
at $49/month for up to five. Prices, limits and feature lists appear in three
places -- the landing page, the `/setup` flow and the in-app upgrade screen --
and they must agree in all three. There is no payment provider wired up yet;
there will be.

## Decision

**The catalogue lives in code**, in `src/lib/plans.ts`: id, name, monthly price,
truck limit, tagline and feature list. A price is a product decision that ships
with a release, not a row someone can edit into an inconsistent state.

**The database holds only which plan a business is on, and the state of its
subscription.**

**The truck limit is the only thing a plan gates today**, and it is enforced
server-side in the action that would create a truck -- never by hiding a button.
This is the same rule the rest of the app follows: the businessId comes from the
signed session and never from the browser (see
[ADR-0006](0006-business-scoped-repository.md)).

**No payment provider is referenced anywhere.** `Subscription` carries empty
provider reference fields so that adding Stripe later is a field being filled in
rather than a model being reshaped.

## Alternatives considered

**A plans table in the database.** Lets prices drift per environment, allows a
half-edited plan to exist in production, and makes "what did this cost in
August" a question about mutable rows.

**Gate features by hiding UI.** Anyone who can send a request can create a sixth
truck. Client-side gating is presentation, never enforcement.

**Integrate billing now.** The product is not selling yet; a payment integration
built before the first customer is a maintenance burden with no revenue behind
it. The seam is what matters, and the seam exists.

## Consequences

- Changing a price is a code change with a diff and a release, which is correct
  for a number that appears in a marketing page.
- Existing customers on a grandfathered price will need explicit handling when
  that day comes -- most likely a price recorded on the subscription. That will
  supersede part of this ADR.
- The landing page, `/setup` and the upgrade screen all read the same constant,
  so they cannot disagree.

## Guardrails

- Never render a price or a limit from anything but `PLANS`.
- Every plan-gated capability is checked in the server action that performs it.
- Do not add fields to `Subscription` that assume a specific payment provider's
  model.

## Where this lives

`src/lib/plans.ts`, `src/lib/actions/subscription.ts`,
`src/lib/actions/trucks.ts`, `src/lib/marketing/`, `src/app/setup`.
Tests: `plans.test.ts`.
