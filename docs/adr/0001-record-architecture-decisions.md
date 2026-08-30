# ADR 0001: Record architecture decisions in the repository

- **Status:** Accepted
- **Date:** 2026-08-29
- **Deciders:** Enrique Padrón
- **Tags:** ops

## Context

OnRoad Books carries an unusual amount of load-bearing reasoning for an app of
its size. Most of it is not about frameworks; it is about money. Why cost per
mile is never prorated, why a closed settlement freezes, why trip fuel does not
enter a period total, why a relative ranking is not painted red -- each of these
looks like an arbitrary detail from the outside and is in fact the difference
between a number an owner-operator can trust and a number that quietly lies.

That reasoning currently lives in three places: long headers at the top of the
modules that implement it, the README, and the author's head. The module headers
are excellent at saying *what the rule is*. They are the wrong place to say
*what else was on the table and why it lost* -- a rejected option does not belong
in the file that implements the chosen one.

## Decision

Architecture decisions are recorded as numbered Markdown files in `docs/adr/`,
in the format of [0000-template.md](0000-template.md).

- One decision per file. Numbers are allocated in order and never reused.
- An ADR is **immutable once accepted**. A decision that changes gets a new ADR
  that supersedes the old one; the old file stays, with its status updated and a
  link forward. The record of a wrong turn is worth as much as the record of a
  right one.
- ADRs record decisions, not documentation. How to run the app is README work.
  How a formula is computed is a module header. Why it is computed *that way*,
  and what breaks if someone changes it, is an ADR.
- ADRs 0002-0020 are retroactive: they were written from a codebase whose
  decisions had already been made and shipped. Each carries the date the
  decision was taken (2026-08-29), not the date the file was written.

## Alternatives considered

**Keep everything in module headers.** They are already good, and they stay --
this ADR does not remove a line of them. But a header is read by whoever opens
that file, which means a cross-cutting rule (the double-counting rule touches
loads, expenses, fuel, maintenance and the load calculator) has no single home,
and nobody discovers the reasoning until they are already editing the thing.

**A single ARCHITECTURE.md.** One long file grows into a document nobody
rewrites honestly; edits to it lose the history of what it used to say. Numbered
files give a decision a date, a status and a diff.

**A wiki or an external doc.** It drifts from the code within weeks, and it is
not in the pull request that changes the code.

## Consequences

- A change that contradicts an ADR is now visible as a change that contradicts
  an ADR. That is the whole point, and it will occasionally be annoying.
- There is a small standing cost: a genuinely new architectural decision needs a
  file before it needs a merge.
- Onboarding -- including future AI sessions working in this repo -- has a
  single ordered place to read the reasoning rather than reconstructing it from
  the test suite.

## Guardrails

- Never edit the body of an accepted ADR to reflect a new decision. Supersede it.
- Keep [README.md](README.md) in this folder as the index; every new ADR gets a
  line there in the same commit.

## Where this lives

`docs/adr/` -- this folder. `docs/adr/README.md` is the index.
