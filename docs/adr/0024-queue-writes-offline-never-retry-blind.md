# ADR 0024: Hold writes when there is no signal, and never retry a blind one

- **Status:** Accepted
- **Date:** 2026-09-01
- **Deciders:** Enrique Padrón
- **Tags:** data | craft

## Context

The iOS app can record a load, an expense, a fill-up and an invoice. Every one
of those was a live HTTP POST that failed if the phone had no service — and a
26-foot box truck spends hours at a time with no service. The moment that
matters most for this product is a driver standing at a fuel island with a
receipt in one hand, and that is exactly the moment the request fails.

Losing the entry is not a small bug. The whole promise is that the books are
accurate; a receipt that vanished because of a dead bar is a hole in the ledger
that nobody will notice until a month is closed.

Retrying is the obvious fix and the dangerous one. A failed request comes in
two very different shapes:

1. **It never left the phone.** No route to the host, no data allowed, DNS
   never resolved. The server has no idea this write exists.
2. **It left, and then the connection died.** The server may have created the
   row and answered into a socket that no longer existed.

They are indistinguishable if you only look at "the request failed". Retrying
the second shape turns a $412 fill-up into $824, in a ledger whose entire value
is being right to the cent. There is no idempotency key on these endpoints and
adding one would mean widening the store contract and the `Load`, `Expense` and
`FuelEntry` models — a schema change to the money tables to solve a transport
problem.

## Decision

A write is only ever sent again by itself when we know the server never saw it.

- **Ask before sending, not after failing.** `NetworkMonitor` (an `NWPathMonitor`
  behind a lock-guarded flag readable off the main actor) is consulted *before*
  the POST. With no path, the write goes straight to the queue and is never
  attempted — so the common case produces no ambiguity at all.
- **`WriteQueue` stores the raw request** — path plus JSON body plus a summary
  written for the owner — not a domain object. Every write endpoint the app has,
  and every one it gains, is queueable without this file learning about loads or
  fuel. It persists to Application Support with `.completeFileProtection`,
  because a queue that dies with the process is not a queue: the phone gets
  pocketed and the app gets killed long before the truck finds a bar.
- **`TransportFailure.neverSent` is the whole judgement.** `notConnectedToInternet`,
  `cannotConnectToHost`, `cannotFindHost`, `dnsLookupFailed`, `dataNotAllowed`
  and friends are safe: queue and retry silently. Everything else — a timeout, a
  connection lost mid-flight — is marked **attention** and never moves on its
  own.
- **The ambiguous ones ask the owner**, in the owner's words: "may already be
  saved — check before retrying", with Retry and Discard. The app cannot know;
  the person can go look.
- **A 4xx is not a transport problem.** An expired trial or a validation refusal
  is the ledger saying no, and it will say no again — so it stops retrying and
  shows the server's sentence rather than spinning.
- **Flush on the two moments that matter**: the path monitor reporting a route
  again, and the app returning to the foreground.

The forms did not change. A queued write returns a local id and the sheet
closes, because to the driver it *is* saved; a strip above the tab bar carries
the truth ("3 registros guardados, sin señal") and taps through to the list.

## Alternatives considered

**Retry everything with backoff.** One line of code, and the failure mode is
duplicated money in a bookkeeping product. Not a trade worth making at any
frequency.

**Idempotency keys.** The correct general answer. It needs a column on three
money tables, a store-contract change across both the JSON and Prisma stores,
and a migration on a production database with no PITR. Worth doing if the
ambiguous case ever proves common; the queue is designed so that adding a key
later only shrinks the "attention" bucket rather than changing the shape.

**Deduplicate server-side on a natural key** (same date, amount, category
within a few minutes). No schema change — and it silently collapses two real
fill-ups of the same amount at the same stop, which happens. A guess that can
delete a real expense is worse than a question.

**Just show an error and let the driver retype it later.** What the app did
until now. In practice the entry never comes back, because the moment it was
easy to record has passed.

## Consequences

- Entries survive with no signal, an app kill, and a reboot.
- A small class of writes needs a human decision. That is a real cost and it is
  deliberate: it is where the app stops pretending to know something it does
  not.
- The queue replays through the same `APIClient` a live write uses, so a route's
  auth, refusals and response shape cannot drift between the two paths.
- Demo mode has no queue and starts no path monitor.

## Guardrails

- Never retry a write that was not classified `neverSent`. If a new `URLError`
  case is added to that list, be able to say why the server cannot have seen it.
- Never add an "auto-retry" toggle for the attention bucket.
- A new write endpoint gets a `summary` written for the owner — the queue is a
  screen a driver reads, not a log.
- If idempotency keys ever land, the ambiguous bucket should shrink to nothing;
  it must not become a place where writes quietly pile up.

## Where this lives

`mobile/Sources/OnRoadBooks/Data/APIClient.swift`, `NetworkMonitor.swift`,
`WriteQueue.swift`, the `post` path in `APIRepository.swift`, and
`Features/Pending/PendingWritesView.swift`.
