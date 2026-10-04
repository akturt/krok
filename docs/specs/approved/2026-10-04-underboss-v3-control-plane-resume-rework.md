---
schema: 1
id: spec-underboss-v3-control-plane-resume-rework
type: spec
status: approved
date: 2026-10-04
owners: [underboss-team]

entity_refs: [lifecycle-spec, sop-dag, reality-engine]
touches: [core]
code: []
docs: []
depends_on: [adr-005-v3-baseline-architecture, adr-006-execution-state-persistence]
implements: []
supersedes: [spec-underboss-v3-control-plane]
tags: [underboss, control-plane, cli, execution-unit, v3]
priority: P0
---

# Spec: Underboss v3 — Control Plane CLI: resume and rework

## Goal

Give the Control Plane CLI the two operations that carry out the approved Execution Unit transitions `BLOCKED → EXECUTING` and `VERIFYING → EXECUTING`, so that an execution that was stopped or failed verification can continue.

## Context

The Spec `spec-underboss-v3-control-plane` defines these two transitions in §4.3 but lists no CLI command for them in §8. A unit that opens an Escalation therefore becomes `BLOCKED` and cannot continue through the CLI, and a unit whose verification failed cannot return to work. `execution start` is defined as `READY → EXECUTING` and is not changed.

This Spec supersedes `spec-underboss-v3-control-plane` as the contract of the Control Plane. **Everything in the superseded Spec stays normative, unchanged, except §8, which is amended exactly as stated below.** Nothing else is reopened: no entity, state, transition, record type, Escalation kind or storage rule is added or changed.

## Scope

### Included

- the public CLI commands `execution resume <id>` and `execution rework <id>`;
- the prerequisites and failure semantics of both;
- the Core operation `rework`, as a thin wrapper over the existing transition and persistence model (`resume` already exists in Core).

### Excluded

- `redesign`, and any CLI command for `BLOCKED → DESIGN`;
- a `decision` command, a `continue` command, any alias of `start`, `--force`;
- any change to the state machine, the Execution Record types, the Escalation vocabulary, READY, the fingerprint or the autonomy policy;
- `backlog` commands.

## Technical approach

### §8 amendment

The command table of §8 of the superseded Spec gains two lines:

```
underboss execution resume <id>           BLOCKED → EXECUTING; all Escalations resolved, fresh revalidation
underboss execution rework <id>           VERIFYING → EXECUTING; verification failed
```

`execution start <id>` remains `READY → EXECUTING`. `resume` and `rework` are not aliases of `start` and of each other.

### resume

- Allowed only in `BLOCKED`.
- Prerequisite 1: every Escalation of the unit is `resolved`. If one is open, `resume` is refused, no record is written, the unit stays `BLOCKED`, and the findings name the open Escalations.
- Prerequisite 2: a fresh validation (the checks of §4.4, as for `start`) passes. It is recorded as a `validation` record with purpose `resume`.
- On success: a `transition` record `BLOCKED → EXECUTING`, then `unit.yml` is updated.
- On a failed revalidation: the validation record is written, the unit stays `BLOCKED`, the findings are returned. The unit does not move to `DESIGN`; leaving `BLOCKED` for `DESIGN` is not a CLI operation.

### rework

- Allowed only in `VERIFYING`.
- Prerequisite: verification has failed, that is, since the unit last entered `VERIFYING` at least one verification record has result `fail`, or the latest validation record with purpose `verify` or `complete` has result `fail`. Otherwise `rework` is refused and nothing is written.
- On success: a `transition` record `VERIFYING → EXECUTING`, then `unit.yml` is updated. It is the ordinary rework loop of §4.3, not an Escalation, and it never changes the Spec or the unit definition.

### CLI

Both commands are adapters over the Core SDK and contain no rules. Both require `--actor`. `resume` accepts `--agent-platform` like `start`. Output is human-readable by default and a deterministic projection with `--json`. Exit codes are unchanged: `0` success; `1` the operation was refused or revalidation failed; `2` usage error; `3` project or root error.

## Affected files (predicted)

- `core/control/ready.mjs`, `core/control/index.mjs`: `rework`.
- `core/control/cli/commands.mjs`, `core/control/cli/render.mjs`: the two commands.
- `core/control/tests/`: tests of both commands, of the refusals and of the end-to-end escalation path through the CLI.

## Open questions

None.

## Acceptance criteria

- **AC-001** `underboss execution resume <id>` moves a `BLOCKED` unit to `EXECUTING` only when every Escalation is resolved and a fresh validation passes; it writes a `validation` record with purpose `resume` and a `transition` record.
- **AC-002** With an open Escalation `resume` is refused (exit 1) without writing a record; with a failed revalidation it writes the validation record, returns the findings (exit 1) and the unit stays `BLOCKED`.
- **AC-003** `underboss execution rework <id>` moves a `VERIFYING` unit to `EXECUTING` only after a failed verification, writing one `transition` record; in any other state, or without a failed verification, it is refused (exit 1) and writes nothing.
- **AC-004** `execution start` is unchanged: it accepts only `READY`. `resume` and `rework` are not accepted on other states and are not aliases.
- **AC-005** The CLI has no `redesign`, `decision` or `continue` command and no `--force`; `BLOCKED → DESIGN` is not a CLI operation.
- **AC-006** The two commands contain no state-machine or validation logic: they call the Core SDK, and the Core unit and consistency checks pass after every path.
