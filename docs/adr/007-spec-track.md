---
schema: 1
id: adr-007-spec-track
type: adr
status: accepted
date: 2026-10-19
owners: [krok-team]

entity_refs: [lifecycle-spec]
tags: [adr, spec, lifecycle, track, documentation]
supersedes: []
depends_on: [adr-004-spec-lifecycle]
priority: P1
---

# ADR-007: Spec Track — a Spec Can Deliver Documents, Not Only Code

## Context

ADR-004 fixes the Spec lifecycle `draft → approved → implemented`. Nothing in Krok verifies that code exists for an `implemented` Spec, but the term reads as "shipped". Some Specs deliver no code: an owner-authored decision contract drives decisions, terminology, invariants and entity-catalog entries into the other documents. Such a Spec had no honest end state. `implemented/` claimed code that was never written; staying in `approved/` overloaded "ready to build" with "fully executed".

## Decision

1. A Spec has an optional frontmatter field `track`: `code` (default), `docs` or `mixed`. An absent field means `code`; no existing Spec changes.
2. The lifecycle is the same for every track. Nothing is added to ADR-004: statuses, directories, transitions, Acceptance criteria and immutability are unchanged.
3. A `docs` or `mixed` Spec in `approved/` or `implemented/` names the documents it drives in `docs:` (non-empty). A `docs` Spec has no `code:`.
4. For `docs` and `mixed`, `implemented` means *propagated*: every path in `docs:` is an existing file and references the Spec id. Paths resolve against the repository root, then against the Spec's directory. `validate-lifecycle` checks this mechanically.
5. For `code` and `mixed`, "code exists" stays a human judgment recorded in `## Result`; Krok does not check it, as before.

## Consequences

- A docs-only decision Spec moves to `implemented/` once its documents carry its id, instead of resting in `approved/` with a status note in `## Result`.
- Propagation is checked only at `implemented/`. The check proves a reference exists, not that the content matches the Spec; that remains review.
- A Spec that lists a document which cannot reference an id (a file outside Markdown conventions) must put the id in a comment or mention it in the text.

## Related

- ADR-004 (spec lifecycle)
