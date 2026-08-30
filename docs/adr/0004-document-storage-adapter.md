# ADR 0004: Serve uploaded documents through a storage adapter, never as public files

- **Status:** Accepted
- **Date:** 2026-08-29
- **Deciders:** Enrique Padrón
- **Tags:** data | ops

## Context

The app stores receipts, rate confirmations, BOLs, insurance and registration
documents. Locally they are files on disk; in production they belong in object
storage (Supabase Storage). They are also, without exception, private business
records -- a receipt URL that works without a session is a data leak.

## Decision

File bytes go through the `DocumentStorage` contract in
`src/lib/storage/contract.ts` (`put` / `get` / `remove`), selected by
environment in `src/lib/storage/index.ts`: local disk for the MVP, Supabase
Storage in production. The contract lives in its own module so implementations
can import it without a cycle through the selector.

Documents are **never** written under `public/`. They are read back through an
authenticated route under `/api`, which is why the middleware's static-asset
exemption deliberately does not apply to paths beginning `/api/`.

Metadata (type, name, linkage to a load or a maintenance record) is a row like
any other and goes through the repository; only the bytes go through this
adapter.

## Alternatives considered

**Write uploads into `public/`.** Simplest, and it makes every receipt in the
business world-readable to anyone who can guess a filename.

**Store bytes in the database.** Bloats the row store, complicates backups, and
buys nothing the adapter does not already give.

**Go straight to Supabase Storage.** Reintroduces the setup requirement
[ADR-0003](0003-repository-interface-json-default.md) works to avoid.

## Consequences

- Uploads work with zero configuration and move to object storage by
  environment.
- Serving a file costs a route handler and a session check rather than a static
  file read. For a single-operator app this is irrelevant, and it is the point.
- The upload directory is resolved per call, for the same reason repository
  paths are.

## Guardrails

- Nothing writes user-uploaded bytes to `public/`.
- The `isPublicAsset` exemption in the middleware must keep its
  `!pathname.startsWith("/api/")` condition. Removing it makes every uploaded
  receipt public, because receipt URLs contain a file extension.

## Where this lives

`src/lib/storage/contract.ts`, `src/lib/storage/index.ts`,
`src/lib/storage/supabase.ts`, `src/lib/documents.ts`, `src/middleware.ts`.
