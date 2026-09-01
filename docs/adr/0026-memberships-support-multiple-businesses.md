# ADR 0026: Move access from users to business memberships

- **Status:** Proposed
- **Date:** 2026-09-01
- **Deciders:** Enrique Padrón
- **Tags:** data | access | product

## Context

An invited Bookkeeper currently belongs to exactly one `Business` because the
`User` row carries one `businessId` and email is globally unique. That is enough
for a carrier's internal collaborators, but it prevents an accountant from using
one identity across several client companies.

Driver records are operational entities, not identities. They must not become
members implicitly, and there is no Driver role until a dedicated portal can
scope a driver to only their own loads, documents and statements.

## Decision

At the multi-company phase, introduce a `Membership` relation between `User`
and `Business`. Role, invitation state, join state and business-specific access
belong on the membership. A user may then hold a Bookkeeper membership in more
than one business and select the active company explicitly.

Until that migration ships, every invitation remains tied to one company. The
product must say so and must not imply that a bookkeeping firm already has a
multi-client workspace.

## Alternatives considered

**Duplicate one user per company.** Rejected because email uniqueness, Supabase
identity ownership and session revocation become ambiguous.

**Make Driver another member role now.** Rejected because the current app has no
row-level portal boundary for a driver's own records.

## Consequences

The future session must identify both a user and an active membership. Switching
companies changes `businessId` through a server-validated membership lookup,
never through an arbitrary client-supplied id. Invitations and removals revoke
one membership without deleting access to unrelated businesses.

The current schema remains unchanged while this ADR is Proposed.

## Guardrails

- Never infer app access from a `Driver` row.
- Never trust a client-supplied business id without checking membership.
- Never delete a shared Supabase identity when removing only one membership.
- Keep Owner-only planning permissions scoped per business.
- Preserve existing single-company users during the migration.

## Where this lives

Future implementation will replace `User.businessId` and the single-business
lookups behind `src/lib/db/repository.ts`, `src/lib/db/json-store.ts` and
`src/lib/db/prisma-store.ts` with a membership-aware access layer and tests
covering company switching, invitation acceptance and revocation.
