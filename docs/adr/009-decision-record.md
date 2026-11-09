---
schema: 1
id: adr-009-decision-record
type: adr
status: proposed
date: 2026-11-10
owners: [krok-team]

entity_refs: [decision-record, lifecycle-adr]
tags: [adr, decision, owner, documents, schema]
supersedes: []
depends_on: [adr-004-spec-lifecycle]
priority: P1
---

# ADR-009: Decision-Record — an Owner Decision About the Work of a Project Is a Document

## Context

ADR-004 decision 7 says: "Decision is a human act, not an artifact. A recorded architectural decision is an ADR; there is no separate Decision entity or file." That was written against a `decisions.yml` store that duplicated ADRs and Escalation resolutions.

A consumer (TPO, for the ChaosControl "Owner Decision" context) now has a different need: the owner's decisions about the *work* of a project are not architecture. They are a priority for a backlog item, a comment (a note or an instruction to the agent), an initiative. Each has to be kept as a durable, reviewable fact in the project repository, created by a program from a strict template, never typed by hand, never rewritten. Nothing in Krok fits:

- an ADR is for architectural decisions and its status model (`proposed → accepted`) does not fit;
- the backlog accepts only checkboxes in two files, and rewriting a table row to change a priority rewrites history and conflicts on every unrelated change;
- an Execution Unit and its Escalation live inside a Unit; a decision about a backlog item has no Unit.

Using `type: adr` or an unknown `type: decision` passes the validators today but breaks the documented schema (Schema v1 has a closed type list).

## Decision

1. Schema v1 has a document type `decision` (a *decision-record*). It is the form for an owner decision about the work of a project. An architectural decision remains an ADR. The decision itself stays a human act (ADR-004 decision 7 is narrowed, not reversed): the record is the durable trace of the act, written after it.
2. One decision, one file, in `docs/decisions/<id>.md`. The id starts with `dec-` and is kebab-case.
3. Frontmatter uses only fields Schema v1 already knows, plus the per-type extension:
   - `kind` (required): `priority`, `note`, `instruction` or `initiative`;
   - `priority` (required when `kind: priority`): `P0`–`P3`, an existing field;
   - `status`: `recorded` or `superseded`;
   - `depends_on`: the target of the decision (free text, not checked for existence); `supersedes`: the records this one replaces; `refs`, `tags`.
   Values are single-line and lists are inline (`[a, b]`), so that the line readers of the validators can read them without a YAML parser.
4. The body is the owner's exact words and never changes after creation. A decision is *superseded by adding a newer record* that lists it in `supersedes`; the older file need not be edited, and may be updated to `status: superseded`. The current record of a target is the one that no other record supersedes. The history is the chain.
5. `validate-lifecycle` checks decision-records: the body of a `recorded` or `superseded` record is unchanged against `BASE_REF` (an error); `recorded → superseded` is the only transition; every `supersedes` names an existing record, not itself, without a cycle; a `superseded` record is named by another record. A successor with a different `depends_on` than the record it supersedes is a warning.
6. `validate-frontmatter` checks `kind`, `status`, the `dec-` id, `priority` for `kind: priority`, inline lists and the location in `decisions/`.
7. `validate-vocabulary` does not scan `docs/decisions/`: the owner's text is kept verbatim, whatever words it contains.
8. A Spec may name decision-records in `depends_on` or `implements`. The READY fingerprint of an Execution Unit includes the *effective state* of each such record (`recorded`, `superseded`, `superseded-by:<id>`, `missing`), so a newer decision makes a READY Unit stale. A Spec that names no decision-record keeps its fingerprint unchanged.
9. Not changed: the backlog (no new files in `docs/backlog/`), Execution Units, Escalations and their vocabulary.

## Consequences

- Backward compatible. No existing document changes. A project without `docs/decisions/` is not affected; a `docs/decisions/` that holds files of other types is not checked. The directory is optional and listed in the Registry like the others.
- Creating a decision is a pure addition of one path, so a program can commit it without reading or rewriting any other file, and a conflict can only occur on the same `supersedes` target.
- Existence of the `depends_on` target is not checked: Krok does not know the consumer's entities. A consumer that needs it adds its own check.
- The sum of decisions is not folded into the backlog. A reader that looks only at `docs/backlog/active.md` sees the original priority; the program that serves the decision to the agent is the consumer's concern.
- Free-text bodies are not scanned by the vocabulary check, so a record may legitimately contain words the vocabulary forbids elsewhere.

## Related

- ADR-004 (spec lifecycle), decision 7
- ADR-008 (an approved Spec can be edited)
