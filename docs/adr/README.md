# Architecture Decision Records

Why OnRoad Books is built the way it is. Each file records one decision: the
forces behind it, what was rejected, what follows from it, and the guardrails a
future change must not break.

The format is in [0000-template.md](0000-template.md); the practice itself is
[ADR-0001](0001-record-architecture-decisions.md). Accepted ADRs are immutable
-- a decision that changes gets a new record that supersedes the old one.

> ADRs 0002-0020 are retroactive. They document decisions already made and
> shipped, dated when the decision was taken rather than when it was written
> down.

## Index

### Foundations

| # | Decision | Status |
|---|---|---|
| [0001](0001-record-architecture-decisions.md) | Record architecture decisions in the repository | Accepted |
| [0002](0002-nextjs-app-router-server-first.md) | Next.js App Router, server-first, TypeScript and Tailwind | Accepted |

### Data and access

| # | Decision | Status |
|---|---|---|
| [0003](0003-repository-interface-json-default.md) | Every read and write behind a `Repository`, JSON by default | Accepted |
| [0004](0004-document-storage-adapter.md) | Uploaded documents through a storage adapter, never public | Accepted |
| [0005](0005-dependency-free-auth.md) | Hand-rolled auth on `node:crypto` with a signed cookie session | Accepted |
| [0006](0006-business-scoped-repository.md) | `businessId` from the session, asserted on every access | Accepted |
| [0018](0018-server-actions-validated-with-zod.md) | Server actions validated with zod, returning a typed result | Accepted |
| [0023](0023-backups-are-ours-encrypted-and-verified.md) | Back the ledger up ourselves — encrypted, verified, off the platform | Accepted |

### The money

| # | Decision | Status |
|---|---|---|
| [0007](0007-single-period-resolver.md) | One period resolver; never prorate a fact | Accepted |
| [0008](0008-two-calculation-layers.md) | A primitive layer and a product layer | Accepted |
| [0009](0009-true-cost-per-mile.md) | Cost per mile from what happened, trailing basis for planning | Accepted |
| [0010](0010-double-counting-rule.md) | Trip costs vs the expense ledger | Accepted |
| [0011](0011-settlement-snapshots.md) | Freeze a settlement into a server-built snapshot | Accepted |
| [0012](0012-reserves-as-signed-ledger.md) | Reserves as a signed ledger, each rate stored once | Accepted |
| [0016](0016-fleet-contribution-model.md) | Contribution per truck, overhead subtracted once | Accepted |

### What the product claims

| # | Decision | Status |
|---|---|---|
| [0013](0013-rating-and-score-are-separate.md) | Load rating and load score stay two judgements | Accepted |
| [0014](0014-refuse-to-rank-thin-data.md) | Refuse to rank on thin data; lanes are directional | Accepted |
| [0015](0015-deterministic-insights.md) | Deterministic insights, never a language model | Accepted |
| [0017](0017-plans-in-code.md) | Plan catalogue in code, limits enforced server-side | Accepted |
| [0022](0022-price-by-depth-not-by-taxes.md) | Price by depth — ledger, cockpit, fleet — and sell nothing that is not built | Accepted |

### Craft

| # | Decision | Status |
|---|---|---|
| [0019](0019-colour-carries-financial-meaning.md) | Green and red mean money; the landing page has its own palette | Accepted |
| [0020](0020-tests-on-node-test-and-ci.md) | `node:test` with no framework, four CI gates | Accepted |
| [0021](0021-exercise-the-postgres-store-in-ci.md) | Exercise the Postgres store in CI against a real database | Accepted |

## Writing a new one

1. Copy `0000-template.md` to the next free number with a short kebab-case slug.
2. Fill in Context before Decision. If the Context does not make the decision
   feel necessary, the decision may not be.
3. Write the Alternatives honestly -- the cost that killed each one, not a
   preference.
4. Add a row to the table above in the same commit.
