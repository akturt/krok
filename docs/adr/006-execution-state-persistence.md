---
schema: 1
id: adr-006-execution-state-persistence
type: adr
status: accepted
date: 2026-10-04
owners: [underboss-team]

entity_refs: [lifecycle-spec]
tags: [adr, execution, storage, context, records]
supersedes: []
depends_on: [adr-004-spec-lifecycle, adr-005-v3-baseline-architecture]
priority: P0
---

# ADR-006: Execution State Persistence in `.context/execution/`

## Context

Underboss had no instance-level state: SOPs are descriptive, and nothing recorded which unit of work was in progress, what was verified, or which human decision was awaited. v3 adds the Execution Unit (a bounded instance of carrying an approved Spec scope to a verified result) and the Execution Record (an immutable journal entry). Their storage must not be mistaken for authoritative knowledge, must work in any git checkout, and must not require a service or a database.

## Decision

1. Execution state lives in `.context/execution/<id>/`, separate from authoritative knowledge in `docs/`.
2. `unit.yml` holds the current state of the unit. `records/<seq>-<utc>-<type>.yml` holds immutable history; a written record is never modified.
3. State is stored as plain files in a restricted YAML subset with deterministic serialization. There is no event sourcing: `unit.yml` is authoritative for current state and records are history, kept consistent by a validator.
4. Escalation is stored as two record types, `escalation-opened` and `escalation-resolved`; its status is `open | resolved`.
5. The directory is registered in the Registry (context scope extended to directories), generated as a non-pristine class by the boundaries generator, and validated by a registered execution validator.
6. The control layer reading and writing this state is zero-dependency Node under `core/control/`.

## Consequences

- Execution state is visible in git, diffable and reviewable; it cannot silently become a source of truth over Specs and ADRs.
- The Registry context scope, the boundaries generator and the validator set each gain a small extension.
- Concurrent writers to one unit are not coordinated beyond what git provides.

## Related

- ADR-004 (spec lifecycle)
- ADR-005 (v3 baseline)
- Spec: docs/specs/approved/2026-10-04-underboss-v3-control-plane.md
