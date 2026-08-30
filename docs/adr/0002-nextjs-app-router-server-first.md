# ADR 0002: Build on Next.js App Router, server-first, with TypeScript and Tailwind

- **Status:** Accepted
- **Date:** 2026-08-29
- **Deciders:** Enrique Padrón
- **Tags:** product | ops

## Context

OnRoad Books is a financial cockpit for an owner-operator: a handful of dense,
number-heavy screens, each of which reads a lot of rows and writes a few. It is
used on a phone in a truck stop as often as on a laptop. There is one developer.
The two things that would sink it are a slow, chatty client that recomputes
money in the browser, and an infrastructure surface too large for one person to
keep correct.

## Decision

The app is a single Next.js 15 App Router application in TypeScript, styled with
Tailwind 3 and Radix primitives, deployed as one unit.

- **Server components by default.** Pages read through the repository, compose
  the `lib/finance` functions and hand finished numbers to the client. Client
  components exist for interaction -- forms, dialogs, charts, the period picker.
- **No separate API layer for the app's own screens.** Mutations are server
  actions (see [ADR-0018](0018-server-actions-validated-with-zod.md)); route
  handlers under `src/app/api` exist only for auth and for serving uploaded
  documents, which must stay behind the session.
- **No client-side data fetching library and no client store.** The URL is the
  state: `?month=&period=&from=&to=` (see
  [ADR-0007](0007-single-period-resolver.md)).
- Presentation tokens are CSS variables consumed through Tailwind, so theming
  and the print stylesheet are one system.

## Alternatives considered

**A separate SPA plus a REST/GraphQL API.** Two deployables, two auth stories,
and every money formula available to be reimplemented on the client -- exactly
the failure mode [ADR-0008](0008-two-calculation-layers.md) exists to prevent.
For a single-developer product with server-rendered dashboards, the cost buys
nothing.

**Pages Router.** Server components and streaming are what make dense pages
cheap here.

**A component library with its own opinions (MUI, Chakra).** The product needed
a specific financial-instrument look; unstyled Radix primitives plus Tailwind
tokens got there with less fighting.

## Consequences

- Numbers are computed once, on the server, in Node -- where the tests run.
- Because pages render on the server, anything reading "today" or a cookie must
  opt out of static rendering. `/`, `/login` and `/setup` carry
  `export const dynamic = "force-dynamic"`.
- The middleware runs on the edge runtime, which cannot import `node:crypto` or
  `node:fs`. That constraint is why auth constants live in their own module
  (see [ADR-0005](0005-dependency-free-auth.md)).
- One `.next` build directory per running server. Two processes sharing one
  build directory produce bare "Internal Server Error" responses from `/api/*`
  while pages still render, because the BUILD_ID moved underneath the running
  process.

## Guardrails

- A component never divides two numbers. If a screen needs a derived figure,
  the function belongs in `src/lib/finance`.
- Never import Prisma, `fs` or `node:crypto` from a component or from the
  middleware.
- `src/app/api` is for auth and private file serving. New product mutations are
  server actions.

## Where this lives

`src/app`, `src/components`, `src/middleware.ts`, `tailwind.config.ts`.
