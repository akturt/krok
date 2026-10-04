---
schema: 1
id: knowledge-architecture-principles
type: guide
kind: index
status: active
date: 2026-07-08
owners: [underboss-team]

entity_refs: [agentic-layer]
tags: [knowledge, architecture, principles, review]
priority: P1
---

# Architecture Principles

15 principles of architectural analysis + 3 meta-patterns. Used by `architecture-reviewer` during review.

## Basic Principles (7)

1. **Single Source of Truth** — every architectural fact has exactly one place of storage. Duplication = drift risk.
2. **Explicit Dependencies** — dependencies between modules are declared explicitly (imports, APIs, events), not implicitly via shared state.
3. **Invariants Over Implementation** — critical system invariants are fixed in `docs/architecture/README.md` and verified on every review. Implementation may change; invariants do not.
4. **ADR Before Code** — an architectural decision is recorded as an ADR (`docs/adr/`) before merging the code that implements it.
5. **Path-Status Contract** — a document's lifecycle position (draft/approved/implemented) is determined by its directory + `status:` FM. Mismatch = error.
6. **Immutability After Acceptance** — the body of an ADR with `status: accepted` is immutable. Only FM transitions (`status:` change) are allowed. Violation = REJECT.
7. **Entity Refs Integrity** — `entity_refs` in spec/audit point to actually existing `id:` values in `docs/architecture/`. Broken ref = error.

## Operational Principles (8)

8. **Schema v1 Compliance** — every `.md` in `docs/` must have Schema v1 frontmatter with 6 mandatory fields. CI checks this automatically.
9. **Template-First Creation** — new documents are created via `cp documentation/templates/<type>.md`, not "from scratch". The template guarantees canonical structure.
10. **Append-Only Audits** — the body of an audit with `status: completed` is immutable. A new audit of the same object = a new file with a new date.
11. **Separation of Concerns** — Role = identity (who I am), Knowledge = knowledge (what I know), SOP = process (when I apply it), Capability = skill (what I can do). Do not mix them.
12. **DRY Knowledge** — shared knowledge lives in `knowledge/`, not duplicated inline in Roles. Roles reference it by short-id.
13. **Artifact Contracts** — the DAG is connected via artifacts (`consumes:`/`produces:`), not via implicit depends_on. Data flow ≠ control flow.
14. **Gate: Manual** — human steps in SOP are marked with `gate: manual`, not `role: human`. Human is not an agent role.
15. **No Compatibility Layers** — a superseded mechanism is deleted, not aliased. No fallback, no dual-read, no dual-write, no legacy mode, no deprecated-but-supported path. A one-time migration script is not compatibility; after it runs, the old form is unsupported.

## Meta-Patterns (3)

### Stratification by Time
Architectural decisions have different change horizons: topology (months), data model (weeks), implementation (days). Review must account for the change horizon when assessing impact.

### Semantic Density
Critical invariants must be "dense" — one sentence, unambiguous interpretation, verifiable fact. Vague invariants = invalid invariants.

### Asymptotic Complexity of Changes
Every architectural decision increases the cognitive complexity of the system. During review, assess: does the change weaken or strengthen the overall architecture? The more components affected, the stricter the review.
