# ADR 0033: OnRoad AI lives in this app and prices loads with this app's calculator

- **Status:** Accepted
- **Date:** 2026-10-27
- **Deciders:** Enrique Padrón
- **Tags:** product | money | ops | security

## Context

OnRoad AI is a WhatsApp assistant for ANY registered truck driver: send a load
(text, screenshot, rate con, voice note), get the contribution, score,
classification, operational-minimum verdict and an ASK / TARGET / WALK AWAY.

The load calculator already answers every financial question it needs
(`finance/load-calculator.ts`, `finance/load-score.ts`, `rateLoad`), and
ADR 0032 settled how a quote is judged. A second calculator in a second
service would drift; the first time the bot and the Loads page disagree on a
load by $40, both lose the driver's trust.

Meta has billed every delivered service reply after 1,000 free per number per
month since 2026-10-01, so the number of messages per answer is now a cost.

## Decision

1. **Same repo, same Next.js app, same deploy.** The bot is `src/lib/onroad-ai/`
   plus `/api/whatsapp/*`. It imports the calculator directly; there is no
   copied formula and no shared package to version. `onroad-ai-parity.test.ts`
   runs the calculator page's exact composition next to `analyzeLoad` and
   requires deep equality.
2. **The model transcribes, TypeScript decides.** A forced tool call returns
   nullable fields; deterministic code cleans them; `analyzeLoad` computes
   everything; TAKE / NEGOTIATE / PASS is a fixed rule order (blocking
   equipment, BAD rating, operational minimum, MARGINAL, cautions).
   Shorthand ("Chicago IL Miami FL 1400 miles $2800 120 DH") and every
   settings command never reach a model at all.
3. **Separate tenants.** `Assistant*` tables, keyed by WhatsApp id, with no
   link to `Business` or `User`. Every store method that touches a driver's
   data takes that driver's id. "Delete my data" is a hard delete.
4. **The event table is the queue.** The webhook verifies the signature,
   records each message once (unique wamid) and returns 200; `after()` drains
   each sender in order under a lease. Failures retry on the next message, an
   opportunistic sweep, or the daily `/api/whatsapp/maintenance` cron.
5. **One bubble per answer**, except the broker message (sent separately so
   it forwards cleanly).
6. **No unauthorized freight data.** Live search runs only through a provider
   with an authorized API. DAT's adapter has no endpoints until they are
   written from DAT's own documentation and DAT confirms commercial use in
   writing. A labelled mock board exists for development and refuses
   production.

## Alternatives considered

**A separate Node service with an extracted `@onroad/calculator` package.**
Rejected for now: it buys independent scaling we do not need, and costs a
package boundary, a second deploy, second secrets and a refactor of every
importer of `finance/` -- for the same functions. If the bot ever needs its
own runtime, the pure modules (`analyze`, `format`, `quick-parse`, `settings`)
already import nothing from Next.

**OpenAI for everything.** The repo already holds an Anthropic key for
rate-con scanning, and its PDF/image reading is proven on real rate cons.
Only speech-to-text uses OpenAI, because the Messages API does not take
audio. Both sit behind interfaces (`ai/provider.ts`).

**A queue service (SQS, QStash, Inngest).** Rejected: a new vendor and bill
for a volume a Postgres table with a unique index and a lease handles.

**Let the model write the reply.** Rejected outright: a reply the model
writes can carry an injected instruction from a screenshot, or a number the
engine did not produce.

## Consequences

- Production migrations run on deploy, so merging this creates the
  `Assistant*` tables in Neon even while `ONROAD_AI_ENABLED` is false.
- Alerts follow the same rule as search: authorized providers only, so in
  production they cannot be created until a load board is connected. The
  opt-in is the driver creating an alert; STOP is recorded and final until
  the driver opts in again.
  Nothing else changes until the flag and the Meta secrets are set.
- These tables are not in `scripts/lib/postgres.ts` `APPLICATION_TABLES`
  (that list drives the Supabase-era copy and RLS certification). The
  nightly `pg_dump` still includes them; add them to the list only when the
  backup verifier should insist on them.
- The calculator page still composes its offer comparison inline. If that
  composition changes, `onroad-ai-parity.test.ts` fails until `negotiate()`
  matches it -- which is the point.
