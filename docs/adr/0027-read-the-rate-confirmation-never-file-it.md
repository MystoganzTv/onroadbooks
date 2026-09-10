# ADR 0027: Read the rate confirmation, never file it

- **Status:** Accepted
- **Date:** 2026-09-10
- **Deciders:** Enrique Padrón
- **Tags:** product | data | ops

## Context

Every number this app is good at -- contribution per mile, true cost per mile,
broker and lane scorecards, the IFTA quarter -- needs loads in the ledger, and
a load only gets there because someone typed it. A new workspace is therefore
worth nothing on the day it is created and stays worth nothing until the owner
does the most tedious job in his week twice: once for the broker, once for us.

The document those numbers come from already exists. It is a PDF the broker
emailed him, he signed it, and it states the lane, the load number, the
equipment and the total he is owed. Retyping it is not bookkeeping, it is
transcription.

ADR 0015 rules a language model out of the insights. That decision stands and
is not in tension with this one: a judgement about money must be reproducible,
and a transcription is not a judgement.

## Decision

A model may READ a document the owner hands it and return the fields printed on
it. It may not decide anything, store anything, or reach the ledger.

Concretely, one request, one document, one forced tool call, and the reply is a
PREFILL for the ordinary load form. The owner sees what was read, is told which
required fields the document did not contain, and confirms every value in the
form he already knows before pressing save. The scanned file is attached to the
load through the normal document path, and only if the load is saved.

Every correction after the model -- state names to codes, `$4,200.00` to a
number, a delivery date that lands before its pickup -- is deterministic, lives
in `src/lib/rate-con/schema.ts`, and is tested without an API key.

The feature is off unless `ANTHROPIC_API_KEY` is set. No key means no button,
no route, no spend, and an app that behaves exactly as it did before.

## Alternatives considered

**Templates per broker: OCR plus regular expressions.** Rejected because there
is no format. Coyote, Landstar, a 3PL's white-labelled portal and a phone photo
of a fax share no layout, and the maintenance falls on us forever, per broker.

**File the load automatically and let the owner correct it later.** Rejected
because a rate confirmation is a contract. A misread rate becomes revenue,
contribution per mile, a broker's grade and an IFTA return before anybody looks
at it, and "we will fix it in review" is how a wrong number gets audited.

**Let the model estimate the miles between the two cities.** Rejected because
it is the one field it could fabricate convincingly. Miles drive every rate we
report; an invented distance is worse than an empty box the owner has to fill.

**Ask the model for a verdict on the load.** Rejected outright -- that is
ADR 0015's territory, and we already compute it deterministically.

## Consequences

The fastest path into the ledger is now the broker's own paperwork, and the
document that produced the numbers stays filed with them.

We pay per scan. The cost is real, per load, and lands on us before it lands on
a plan, which makes the deferred work below a pricing question and not only an
engineering one.

Most rate confirmations do not print a mileage, so `loadedMiles` will usually
come back empty and the owner will type it. That is correct and it is annoying;
the fix is a distance lookup, not a warmer prompt.

The model's accuracy on real scanned paperwork is unmeasured. Nothing in CI can
measure it, because the assertion would be about a vendor's model and not about
this repository.

## Deliberately not done yet

Deferred on 2026-09-10 so the feature ships without a bill attached to it:

1. **A durable quota.** Today's guard is an in-memory sliding window per warm
   instance -- a speed bump against a stuck client, not a limit. A real one
   belongs on the subscription, with a migration and a counter that survives a
   cold start.
2. **A plan gate.** The scan is unlocked on every plan on purpose: it is the
   reason a new workspace fills up at all, and hiding it behind the cockpit
   would defeat the point. That also means a $19 Solo Starter customer spends
   our tokens. Decide the tier, or the quota, before this is advertised.
3. **Miles.** A distance lookup on the confirmed lane, offered as a suggestion
   the owner accepts, never written silently.
4. **A measured read.** Run the extractor against a folder of real rate cons,
   field by field, and record what it gets wrong before promising anything.
5. **The iPhone app.** `/api/mobile` has no scan endpoint, so the flow is web
   only.

Further out, and the reason this ADR exists at all: reading the inbox rather
than waiting to be handed a file. Read-only mail access plus a first-run import
of the last twelve months is what makes an empty workspace useful in five
minutes instead of five weeks. It is a bigger decision -- consent, scope,
retention -- and it gets its own ADR.

## Guardrails

- The reader never writes. No load, no document, no row, ever, from the scan.
- Never present a machine reading as a saved value. It lands in the form the
  owner already confirms in, and it is labelled as coming from the document.
- Never fill a required field the document did not contain. Name it as missing.
- Never send the ledger, or anything about the business, to the model. It sees
  one file and a prompt.
- No retries. A failed read costs one click; a silent retry costs a second
  charge and the same wrong answer.
- The feature stays absent without a key. A fork, a preview deploy and a local
  checkout all run the whole app without one.

## Where this lives

`src/lib/rate-con/schema.ts` (isomorphic: the tool schema, the normalization
and the required-field list), `src/lib/rate-con/extract.ts` (server-only: the
single request), `src/app/api/rate-con/scan/route.ts` (auth, role, write
ability, size and type, and the spend guard), and
`src/components/loads/rate-con-scan-dialog.tsx` (the two-step review that hands
off to `LoadFormDialog`). Tested in `src/lib/__tests__/rate-con.test.ts` and
`e2e/rate-con-scan.spec.ts`.
