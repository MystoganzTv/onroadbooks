# ADR 0019: Reserve green and red for financial performance, and give the landing page its own palette

- **Status:** Accepted
- **Date:** 2026-08-29
- **Deciders:** Enrique Padrón
- **Tags:** ui | product

## Context

A financial cockpit is mostly numbers, and colour is the fastest thing the eye
reads. That makes it a channel with a fixed budget: if green means "good" in one
place, "selected" in another and "this is the first row" in a third, it stops
meaning anything, and the one number that genuinely needed attention is lost in
the noise.

The specific failure that prompted this: the dashboard's broker panel and the
lanes table were painting rating badges on a *relative* ranking. "Weakest lane
$2.24/mi" is not a bad lane -- it is the least strong of several good ones. A
column of five GREAT chips is a wall of green that says less than the rates
already printed beside it.

## Decision

**Palette:** dark navy, deep blue, bright blue and white, with a small amount of
amber. Colours are CSS variables consumed through Tailwind tokens
(`surface`, `sidebar`, `pos`, `neg`, `warn`, `info`), never hex values in a
component.

**Green (`pos`) is only for positive financial performance. Red (`neg`) is only
for negative or critical.** Neither is used for emphasis, branding, selection,
category identity or decoration, and neither is overused.

**A relative ranking is not performance.** The weakest lane and the weakest
broker in a list are not painted red. Rating badges were removed from the
dashboard broker panel and the lanes table for exactly this reason; they remain
on the full broker scorecard, where the judgement is the point.

**The public landing page runs its own fixed dark palette** -- the `mkt.*`
tokens in `tailwind.config.ts`. It is a sales page with one look, and it must
not change when a visitor's system flips to light. **Nothing inside the product
may use the `mkt` tokens, and the landing page does not use the app's theme
tokens.**

## Alternatives considered

**Colour every rating everywhere.** Consistent in the shallow sense, and it
turns the dashboard into a traffic light where nothing is urgent because
everything is coloured.

**A third "relative" colour for rankings.** Adds a channel the user has to
learn, to express something the numbers already say.

**Let the landing page inherit the app theme.** Then the marketing page renders
light for half of its visitors, and the design falls apart.

## Consequences

- Anywhere a colour appears, it is answering "is this money good or bad", which
  makes the few red cells on a dashboard worth looking at.
- Some tables are plainer than they could be. That is the intended outcome.
- Two palettes coexist in one Tailwind config, which needs the comment that is
  there and the discipline not to cross the line.
- Themeing and the print stylesheet stay possible because colour lives in
  variables, not components.

## Guardrails

- No hard-coded hex in a product component. Use the tokens.
- No `pos`/`neg` colour on a relative ranking, a category, a brand element or a
  selection state.
- `mkt.*` tokens appear only under `src/components/marketing` and the landing
  route.

## Where this lives

`tailwind.config.ts`, `src/app/globals.css`, `src/components/ui/`,
`src/components/cockpit/`, `src/components/marketing/`.
