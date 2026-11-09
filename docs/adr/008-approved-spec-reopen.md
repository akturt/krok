---
schema: 1
id: adr-008-approved-spec-reopen
type: adr
status: proposed
date: 2026-11-10
owners: [krok-team]

entity_refs: [lifecycle-spec]
tags: [adr, spec, lifecycle, approved, reopen, immutability]
supersedes: []
depends_on: [adr-004-spec-lifecycle]
priority: P1
---

# ADR-008: An Approved Spec Can Be Edited; It Is Reopened as a Draft

## Context

ADR-004 decision 4 says the semantic body of an `approved`, `implemented` or `superseded` Spec is immutable. The implementation of that decision is a hard gate: with `BASE_REF` set (the Krok workflow does it on a pull request), `validate-lifecycle` reports an ERROR for any body change of an approved Spec, and `approved → draft` is not a legal transition. A consumer therefore had no legal way to correct a Spec between approval and implementation.

A real case: a consumer promoted a Spec to `approved` without `## Acceptance criteria`; the owner allowed the Spec to be corrected. The only way was to edit the approved body in place, which the gate reports as an error, so the rule was either bypassed or the Spec was superseded by a copy of itself.

The owner decided (2026-10-26) that an approved Spec may be edited, that while it is being edited it is a `draft`, and that this is a prescription, not a gate.

## Decision

This ADR weakens ADR-004 decision 4 for `approved` Specs. ADR-004 itself is accepted and is not edited.

1. An `approved` Spec may be edited. While the edits are not agreed, it is a `draft`: `git mv` to `docs/specs/drafts/` and `status: draft`. After the edits are agreed it goes `draft → approved` again; approval stays a human act (ADR-004 decision 3) and the Acceptance criteria requirement (ADR-004 decision 5) is unchanged.
2. `approved → draft` is a legal transition. `implemented → draft` and `superseded → draft` are not.
3. The body of an `implemented` or a `superseded` Spec stays immutable: they are history, and a change of scope is a new or superseding Spec. The `## Result` section of a Spec is still excluded from the comparison.
4. For an `approved` Spec the immutability is a prescription. `validate-lifecycle` reports a WARNING, not an ERROR, when the body of a Spec that stays `approved` changed against `BASE_REF`; the text names the correct path (reopen as a draft). A move `approved → draft` is silent. Warnings do not change the exit code; in GitHub Actions they are also printed as `::warning::`.
5. The body of an `accepted` or `superseded` ADR stays immutable and a change is an ERROR, as before.
6. A change of scope is still better expressed as a new or superseding Spec; the tool does not force it.

## Consequences

- The reopen cycle in one pull request (`approved` on the base, edited, `approved` again at the head) still produces one WARNING at the head: the validator compares the base with the head and sees only the two `approved` states. The warning is expected and does not block the merge.
- Execution Units (no change of semantics): `ready` and `start` re-read the Spec and refuse with `Spec '<id>' is not approved (directory 'drafts', status 'draft')`; a Unit in `READY` becomes stale and `start` returns it to `DESIGN`. `verify` and `complete` do not re-read the path status of the Spec: a Unit that is already `EXECUTING` or `VERIFYING` keeps going and can reach `DONE` while its Spec is a draft. To stop work on a Spec whose scope is being changed, open an Escalation of kind `scope`. This behaviour is fixed by tests and is not changed here; whether `complete` should require an approved Spec is left to a later decision.
- A consumer that wants the old hard gate can keep it in its own CI (grep the validator output for `WARNING`); Krok does not ship a strict option.
- `agents/*/documentation-reviewer.md` keeps flagging a direct edit of `docs/specs/approved/*.md` and now names the correct path.

## Related

- ADR-004 (spec lifecycle), decisions 3, 4 and 5
- ADR-007 (spec track)
