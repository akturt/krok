---
schema: 1
id: adr-004-spec-lifecycle
type: adr
status: accepted
date: 2026-10-04
owners: [underboss-team]

entity_refs: [lifecycle-spec]
tags: [adr, spec, lifecycle, acceptance-criteria, api]
supersedes: []
depends_on: []
priority: P0
---

# ADR-004: Spec Lifecycle Without `review`

## Context

The Spec lifecycle was `draft → review → approved → implemented | superseded`. In practice `review` is not a place where a Spec rests: review is something people do, and approval is the human act that ends it. A separate status and directory added a promotion step, a validator branch and a documentation term for no distinct state. Specs also carried no stable, referable acceptance criteria, so nothing downstream could point at "what done means". The `api` document type described a lifecycle in the playbook that no tool implemented.

## Decision

1. A Spec has exactly these statuses: `draft`, `approved`, `implemented`, `superseded`. Transitions: `draft → approved → implemented`, and `approved | implemented → superseded`. `review` does not exist as a status, directory, enum value, validator branch, SOP step or documentation term.
2. Path equals status: a Spec lives in `docs/specs/<status>/`. A mismatch is an error, not a warning.
3. Approval is a human act. It is never performed automatically, including by migration.
4. The semantic body of an `approved`, `implemented` or `superseded` Spec is immutable; a change of scope is a new or superseding Spec.
5. Every Spec that reaches `approved` has Acceptance criteria with stable ids `AC-NNN`. Other artifacts reference criteria by id and never restate them.
6. The `api` document type has exactly two statuses, `active` and `deprecated`; the unimplemented API lifecycle directories are removed.
7. Decision is a human act, not an artifact. A recorded architectural decision is an ADR; there is no separate Decision entity or file.

## Consequences

- One promotion step instead of two; the SOPs `new-feature` and `new-service` gain a single human gate "promote draft → approved".
- Validators become simpler: no `review` branch, path-status is enforced.
- Existing `review/` Specs in consumers are moved to `drafts/` once by the migration; they must be approved again by a human.
- Specs gain a mandatory section, which raises the cost of writing a Spec slightly and makes completion verifiable.

## Related

- ADR-005 (baseline architecture and terminology)
- Spec: docs/specs/approved/2026-10-04-underboss-v3-control-plane.md
