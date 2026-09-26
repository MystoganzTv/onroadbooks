# ADR 0029: A broker is a company; the people there are contacts

- **Status:** Accepted
- **Date:** 2026-09-26
- **Deciders:** Enrique Padrón
- **Tags:** data | product

## Context

A broker profile held one contact: `contactName`, `phone`, `phoneExtension`,
`email`. Owners book with several agents at the same broker (TQL has a main
line and a direct extension per agent), so they created one profile per
person ("Christopher Sanchez", "Branden", ...). Those profiles then showed as
separate brokers, split the broker's load history and scorecard, and could
not be fixed: renaming "Christopher Sanchez" to "TQL" failed with "A broker
with that name already exists", and there was no way to delete a profile.

## Decision

- **Broker = the company**: name, main phone, email, MC, address, notes.
- **Contacts = the people** under it, each with name, phone, extension, email
  and notes, stored as `Broker.contacts` (JSONB, default `[]`).
- **Merge instead of dead-ending.** Saving a profile under a name another
  profile uses offers "Merge X into Y". The source's people become the
  target's contacts (a source with no contacts was itself a person and
  becomes one, keeping its phone, extension and email); matching names merge
  and only fill blanks; notes from both are kept; the source's loads are
  renamed to the target and, when they have no contact of their own, take the
  source's one person; the source profile is removed. `planBrokerMerge` in
  `src/lib/brokers.ts` is the single rule; all three stores apply it.
- **Delete removes the profile only.** Loads keep the broker name they were
  booked under — that is history — and the confirmation says so.
- **Migration 0012** (Drizzle `0012_broker-contacts`, Prisma
  `20260926020000_broker_contacts`) adds the column and copies each profile's
  legacy contact into it, then clears `contactName`, `phoneExtension` and
  `email` on those rows so the person is not read twice. `phone` stays as the
  company line. Profiles without a legacy contact name keep their email as the
  company email. The JSON store makes the same move on read.

## Alternatives

**A `BrokerContact` table.** Relationally cleaner, but it needs a new table,
foreign keys and cascade rules in two ORMs plus the account-deletion and
export paths, for a list that is a handful of people per broker and is always
read with its broker. JSONB keeps one row per broker and one write per edit.
Revisit if contacts ever need to be queried across brokers.

**Allow duplicate broker names.** Removes the error but keeps the split
history and scorecard that made the profiles wrong in the first place.

**Keep one contact and add "other contacts" as notes.** Loses the extension
and email as data; the load form cannot suggest names from notes.

## Consequences

- Load `brokerContact` stays free text, suggested from the broker's contacts
  and from past loads, so historical loads need no change.
- The iOS app does not read brokers; nothing on mobile changes.
- Legacy `contactName` / `phoneExtension` / `email` columns remain (nullable)
  for old rows and clients; nothing new writes a person into them.

## Where this lives

`src/lib/brokers.ts` (`brokerContactsOf`, `mergeContacts`, `planBrokerMerge`,
`clearedLegacyContact`), `src/lib/actions/brokers.ts`,
`src/components/brokers/*`, the three stores. Tests: `brokers.test.ts`,
`store-behaviour.test.ts` ("broker contacts, merge and delete"), the broker
flow in `e2e/critical-flows.spec.ts`.
