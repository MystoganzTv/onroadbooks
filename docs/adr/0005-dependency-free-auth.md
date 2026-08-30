# ADR 0005: Hand-roll email and password auth on node:crypto with a signed cookie session

- **Status:** Accepted
- **Date:** 2026-08-29
- **Deciders:** Enrique Padrón
- **Tags:** ops | data

## Context

OnRoad Books is a single-owner product. One person signs in, sees their own
business, and stays signed in on the phone they carry. There are no teams, no
social logins, no SSO, no email verification flow, no password reset by mail
(there is no mail). What the app needs is: prove who you are, remember it for a
month, and make sure a request can only reach its own rows.

Every auth library available would have brought a provider model, an adapter for
the database, a session table, and configuration -- all of which collide with
[ADR-0003](0003-repository-interface-json-default.md), where the database might
be a JSON file.

## Decision

Authentication is implemented directly on `node:crypto`, with no auth
dependency:

- **Passwords:** scrypt with a per-user random salt; verification through
  `timingSafeEqual`.
- **Sessions:** a self-describing payload (`userId`, `businessId`, `email`,
  `exp`) signed with HMAC-SHA256 and set as an HTTP-only cookie for 30 days.
  There is no server-side session store, so the same code runs unchanged on the
  JSON store and on Postgres.
- **Signing key:** `AUTH_SECRET` from the environment, and it is **ignored
  unless it is at least 32 characters**. With no usable value, a random key is
  generated once into `data/.auth-secret` (mode 0600). There is no hardcoded
  default anywhere in the codebase.
- **Gate:** `middleware.ts` allows `/` (matched exactly), `/login`, `/setup`,
  `/api/auth/*` and static assets outside `/api/`; everything else requires a
  session cookie. Pages redirect, API routes return 401.
- **The middleware only checks that a cookie is present.** The signature and
  expiry are verified server-side by `getSession()` on each page and route,
  where the secret lives. The middleware exists so an unauthenticated request
  never reaches a page render.

## Alternatives considered

**NextAuth / Auth.js.** Wants an adapter over a real database and a session or
account model; the JSON store would have needed a bespoke adapter, which is more
custom auth code than this decision involves, wrapped in someone else's
abstraction.

**Supabase Auth.** Ties sign-in to the very infrastructure the app is designed
to boot without, and pulls a second user identity into a schema that already has
one.

**Verifying the session inside the middleware.** Not possible: the edge runtime
has no `node:crypto`, and moving the secret to the edge to make it possible
would put the signing key in more places, not fewer.

## Consequences

- No auth dependency to track, upgrade or be breached by.
- Rolling `AUTH_SECRET` logs everyone out. For a single-owner product that is
  the correct trade.
- Adding multi-user, invitations or password reset is real work, not
  configuration. Accepted: the product does not have those users.
- `src/lib/auth/constants.ts` exists **solely** because the middleware runs on
  the edge and must not pull in `node:crypto` or `node:fs`.

## Guardrails

- Cookie name and max age live in `auth/constants.ts`. Never in `session.ts`,
  and never inlined in the middleware.
- `session.ts` is marked `server-only` and must stay that way.
- `/`, `/login` and `/setup` need `export const dynamic = "force-dynamic"`.
- Never ship a fallback secret. The "generate into `data/.auth-secret`" path is
  the fallback.

## Where this lives

`src/lib/auth/constants.ts`, `src/lib/auth/session.ts`, `src/lib/auth/index.ts`,
`src/middleware.ts`, `src/app/login`, `src/app/setup`, `src/app/api/auth`.
