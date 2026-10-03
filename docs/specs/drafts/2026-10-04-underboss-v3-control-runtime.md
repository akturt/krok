---
schema: 1
id: spec-underboss-v3-control-runtime
type: spec
status: draft
date: 2026-10-04
owners: [underboss-team]

entity_refs: []
tags: [underboss, runtime, control-plane, decisions, execution, observation, escalation, workspace]
priority: P0
---

# Underboss v3 — Engineering Control Runtime

## Status

Draft. This document is an implementation specification for the next evolution of Underboss.

The objective is to extend the existing Underboss Runtime into an Engineering Control Runtime. The implementation must preserve the existing Runtime Core, Documentation Module, Registry SSOT, Runtime API, SOP model, Reality Engine, agent roles, boundaries, and documentation lifecycle unless a concrete incompatibility is demonstrated.

This specification is intentionally implementation-oriented. It defines the target operating model, canonical entities, state transitions, storage model, CLI/API surface, agent contract, and acceptance criteria. It does not require a web UI in the first implementation.

---

# 1. Problem

Underboss already provides project documentation, architecture decisions, specifications, SOPs, agent roles, validation, and reality reconstruction. Its current workflow model is primarily concerned with defining and validating engineering processes. SOPs describe execution DAGs but intentionally do not persist runtime progress and do not provide an execution engine.

The missing layer is operational state.

The owner works across multiple repositories and physical environments:

- Windows host with Claude Code and OpenCode.
- Ubuntu VirtualBox workspaces for projects that require native Linux tooling, Docker, networking, and infrastructure operations.
- Multiple repositories distributed across different physical paths.
- Different production deployment targets per project.
- Different coding agents depending on the task.

The physical workspace layout is intentionally not standardized. Underboss therefore must model project/workspace location as metadata and must never make a fixed filesystem layout a semantic requirement.

The system must reduce the owner's cognitive load by answering one primary question:

> Where does human attention need to be spent now?

The system must allow a human decision to become an autonomous execution unit, let agents execute within explicit authority boundaries, continuously observe execution, and escalate only when a human decision is genuinely required.

---

# 2. Architectural Thesis

Underboss remains a single system. No second project-management/control system is introduced.

The target model is:

```
Knowledge
    |
Decisions
    |
Execution Units
    |
Agent Execution
    |
Verification
    |
Observation
    |
Human Attention / Escalation
    |
Decision
```

The existing Underboss capabilities remain foundational:

```
Knowledge
  Architecture
  ADR
  Specs
  Audits
  Principles

Workflow Definition
  SOP / DAG

Reality
  Reality Engine

Agent Layer
  Claude Code
  OpenCode
```

The new capability is:

```
Operational State / Control Plane
```

The Control Plane is a projection of canonical operational state. It is not a separate source of truth.

---

# 3. Design Principles

## 3.1 One system

Do not introduce a second task/project management product for Underboss itself.

GitHub, Vibe Kanban, Claude Code, OpenCode, and other execution systems are downstream tools or execution surfaces. Underboss remains the logical control plane.

## 3.2 Decisions are higher-level than tasks

A task is an execution atom.

A Decision is a human-approved change in project direction, behavior, architecture, scope, or operating policy.

The owner should normally interact with Decisions and Attention, not with a large list of implementation tasks.

## 3.3 Execution Unit is the autonomous boundary

An Execution Unit represents a bounded piece of work that an agent is authorized to carry through to a verified result.

It is not a task list. Agent-generated subtasks remain implementation details.

## 3.4 Approval and readiness are different states

An approved specification or decision is not automatically executable.

The system must distinguish:

- designed;
- approved;
- ready;
- executing;
- verifying;
- completed;
- blocked.

READY means the execution contract is sufficiently complete for autonomous execution.

## 3.5 Observation is operational state

Observation is machine-readable operational evidence, not merely a human report.

Human-facing reports may be generated from observations.

## 3.6 Escalation is a boundary crossing

Agents should operate autonomously inside their declared authority.

Escalation occurs when execution reaches a product, semantic, architectural, security, invariant, public-contract, or scope boundary that requires human judgment.

## 3.7 Physical layout is metadata

The same project may exist:

- on Windows;
- inside VirtualBox Ubuntu;
- on native Linux;
- on a remote machine;
- in another workspace path.

Underboss must identify the logical repository/project independently from its physical workspace.

## 3.8 Existing architecture remains authoritative

Do not replace Registry SSOT, Runtime API, Documentation Module, SOPs, Reality Engine, boundaries, or existing artifact lifecycle with parallel mechanisms.

Extend them.

---

# 4. Canonical Domain Model

The first implementation must introduce the following logical entities.

## 4.1 Project

Project is the top-level logical unit.

Minimum fields:

```yaml
id:
name:
repository:
workspaces:
deployment_targets:
status:
```

A Project is not tied to one local path.

## 4.2 Repository

Repository identifies source control identity.

Minimum fields:

```yaml
provider: github
owner:
name:
default_branch:
```

Repository identity must be canonical and stable.

## 4.3 Workspace

Workspace describes one physical working environment for a repository.

Minimum fields:

```yaml
id:
project:
repository:
host:
os:
path:
tools:
deployment_targets:
```

Example:

```yaml
id: kordon-linux
project: kordon
repository: akturt/kordon
host: virtualbox
os: ubuntu
path: /home/dev/kordon
tools:
  - claude-code
  - opencode
deployment_targets:
  - kordon-prod
```

The path is metadata. It must not be embedded into documentation references or entity identity.

## 4.4 Decision

Decision is the canonical human-level choice that establishes direction or authority.

Minimum fields:

```yaml
id:
project:
title:
kind:
status:
objective:
inputs:
outputs:
human_owner:
approved_at:
constraints:
```

Allowed initial `kind` values:

- product
- ux
- architecture
- technical
- operational
- scope

Decision status must support at least:

- proposed
- approved
- rejected
- superseded

ADR remains the specialized architectural decision artifact. Do not replace ADRs with generic Decision objects.

A Decision may reference an ADR, specification, audit, prototype, or other authoritative artifact.

## 4.5 Execution Unit

Execution Unit is the canonical autonomous work object.

Minimum fields:

```yaml
id:
project:
source_decisions:
status:
repository:
workspace:
inputs:
constraints:
acceptance:
execution_policy:
created_at:
started_at:
completed_at:
```

Example:

```yaml
id: execution-042
project: naprolom

source_decisions:
  - decision-042

status: ready

repository:
  owner: akturt
  name: naprolom

workspace:
  id: naprolom-linux

inputs:
  specifications:
    - docs/specs/approved/...
  architecture:
    - docs/architecture/...
  adr:
    - docs/adr/...

constraints:
  invariants:
    - INV-017
    - INV-021

acceptance:
  - ...
  - ...

execution_policy:
  autonomy: autonomous
  escalate_on:
    - product-behavior-change
    - domain-semantics
    - architecture-boundary
    - security
    - public-contract
    - invariant
    - scope
```

## 4.6 Observation

Observation is an immutable machine-readable snapshot/event associated with an Execution Unit.

Minimum fields:

```yaml
id:
execution:
timestamp:
state:
progress:
changes:
verification:
decision_required:
escalation:
next:
```

Observation should capture evidence sufficient for the Control Plane to determine current state without replaying an entire agent conversation.

Observation records should be append-only.

## 4.7 Escalation

Escalation represents a blocked execution requiring human attention.

Minimum fields:

```yaml
id:
execution:
status:
kind:
question:
reason:
impact:
affected_artifacts:
requested_decision:
created_at:
resolved_at:
resolution:
```

Initial escalation kinds:

- product-decision
- domain-semantics
- architecture-boundary
- security
- public-contract
- invariant
- scope
- external-dependency

An escalation must contain a concrete question whenever possible.

---

# 5. Execution State Machine

The initial state machine is:

```
DESIGN
  |
APPROVED
  |
READY
  |
EXECUTING
  |
VERIFYING
  |
DONE

EXECUTING --> BLOCKED
VERIFYING --> BLOCKED
BLOCKED --> EXECUTING
BLOCKED --> READY
APPROVED --> REJECTED
APPROVED --> SUPERSEDED
```

The implementation must validate transitions.

Definitions:

### DESIGN

Execution contract is being prepared. Human and/or agents may refine inputs.

### APPROVED

The source decision/specification is approved, but execution prerequisites may still be incomplete.

### READY

Machine-checkable readiness gate passed.

### EXECUTING

An agent is actively performing the Execution Unit.

### VERIFYING

Implementation work is complete enough for verification and reality checks.

### BLOCKED

Execution cannot safely continue without external resolution or human decision.

### DONE

Acceptance criteria and required verification have passed.

No Execution Unit may become DONE merely because an agent claims completion.

---

# 6. READY Gate

READY is a machine-checkable contract.

At minimum the readiness evaluator must verify:

```
source decision exists                         ✓
source decision is approved                   ✓
required specification exists                 ✓
required architecture context exists          ✓
required ADR references resolve               ✓
acceptance criteria exist                     ✓
non-goals / scope boundary exists             ✓
execution policy exists                       ✓
repository target resolves                    ✓
workspace resolves                            ✓
agent execution entry exists                  ✓
required constraints resolve                  ✓
```

The exact checks must be represented declaratively where practical.

A failed READY check must produce actionable findings rather than a generic failure.

Example:

```
NOT READY

✗ workspace "naprolom-linux" does not resolve
✗ acceptance criteria missing
✓ source decision approved
✓ specification found
```

---

# 7. Autonomy Policy

Execution policy is part of the Execution Unit.

Default autonomous categories:

- implementation;
- refactoring;
- test creation;
- test repair;
- internal naming;
- local structure;
- implementation-level dependency changes;
- routine documentation updates required by implementation.

Default escalation categories:

- product behavior;
- domain semantics;
- architecture boundary;
- security;
- public API/contract;
- invariant violation or risk;
- scope expansion;
- irreversible external action;
- unresolved external dependency.

The implementation must make the policy explicit and inspectable.

Agents must not silently expand scope when an escalation condition is reached.

---

# 8. SOP Integration

Existing SOPs remain workflow definitions.

They must not be replaced by Execution Units.

The extension is:

```
SOP
  = how a class of work is performed

Execution Unit
  = one concrete instance of work being performed
```

The current SOP planner remains valid.

The new operational state layer must be able to associate an Execution Unit with:

- SOP name;
- SOP version;
- current step;
- produced artifacts;
- consumed artifacts;
- pending gates;
- execution observations.

The implementation must not turn SOP YAML into mutable runtime state.

Runtime progress belongs to operational state.

---

# 9. Reality Engine Integration

Reality Engine remains the source for reconstructing actual project state.

The Control Plane must consume reality evidence where needed.

At minimum:

- READY evaluation may require Reality Engine checks.
- VERIFYING must be able to invoke relevant reality checks.
- DONE must be blocked when required reality checks fail.
- Observations should reference reality-check results where applicable.
- Drift detected during execution should be able to create or update an escalation.

Do not duplicate Reality Engine inventory logic inside the Control Plane.

---

# 10. Documentation Integration

The new entities must follow the existing Underboss documentation conventions.

Do not create an unrelated storage format merely because YAML is convenient.

The implementation must first determine the canonical location and lifecycle for:

- Decisions;
- Execution Units;
- Observations;
- Escalations;
- Project/workspace metadata.

If the current documentation layout has a suitable canonical area, extend it.

If a new directory is required, register it in `runtime/registry.yaml`, update generators/validators/contracts as necessary, and document the decision through an ADR.

Do not hardcode the new paths in multiple tools.

Registry remains SSOT for runtime structure.

---

# 11. Control Plane

The Control Plane is a read-oriented projection over canonical operational state.

It must answer:

1. What projects exist?
2. What is active in each project?
3. Which Execution Units are executing?
4. Which are READY?
5. Which are blocked?
6. Which require human attention?
7. Which are waiting on external dependencies?
8. What changed since the last observation?
9. What decisions are available for the human?
10. Which work is progressing autonomously?

The first implementation should prioritize CLI output over a web UI.

---

# 12. CLI Surface

The initial CLI should expose at least:

```
underboss status
underboss attention
underboss project <id>
underboss decision list
underboss decision show <id>
underboss execution list
underboss execution show <id>
underboss execution ready <id>
underboss execution start <id>
underboss execution observe <id>
underboss execution verify <id>
underboss execution complete <id>
underboss escalation list
underboss escalation show <id>
underboss escalation resolve <id>
```

The exact command implementation may follow the existing Runtime API conventions.

The CLI is a projection/control interface, not a second storage system.

---

# 13. Human Attention Queue

The primary human-facing derived view is:

```
HUMAN ATTENTION REQUIRED
```

An item enters the queue when:

- an Execution Unit is blocked on human judgment;
- a Decision requires approval;
- a READY gate cannot be satisfied by autonomous work;
- an invariant/security/public-contract boundary is reached;
- an external dependency requires an owner action.

The queue should provide enough information to make the decision without reading the entire execution history.

At minimum:

```
project
execution
reason
question
impact
affected artifacts
recommended action
```

The Control Plane should also expose:

```
READY FOR AUTONOMOUS EXECUTION
EXECUTING AUTONOMOUSLY
WAITING EXTERNAL
BLOCKED
DONE
```

The key derived metric is human attention demand, not task count.

---

# 14. Workspace and Environment Model

The implementation must support multiple workspaces for one project.

Example:

```
Project: kordon

  Repository: akturt/kordon

  Workspaces:
    kordon-linux
      host: virtualbox
      os: ubuntu
      path: /home/dev/kordon
      agents: claude-code, opencode

    kordon-windows
      host: windows
      os: windows
      path: C:/Projects/kordon
      agents: claude-code
```

A workspace may declare deployment targets.

Deployment target metadata is descriptive in this phase. Actual deployment orchestration is out of scope unless already supported by existing Underboss mechanisms.

---

# 15. Agent Contract

Claude Code and OpenCode remain interchangeable execution providers where capability permits.

The agent entry protocol must be extended so that an agent entering an Execution Unit can discover:

1. project identity;
2. repository identity;
3. workspace identity;
4. Execution Unit;
5. source Decisions;
6. authoritative specifications;
7. relevant architecture;
8. constraints/invariants;
9. acceptance criteria;
10. autonomy policy;
11. current Observation;
12. open Escalations.

The agent must return structured operational evidence sufficient to create an Observation.

A conversational transcript is not the canonical execution state.

---

# 16. Observation Lifecycle

Observation creation should occur at meaningful lifecycle boundaries:

- execution start;
- significant progress;
- verification start;
- verification result;
- block/escalation;
- completion.

Do not require an observation for every shell command or every agent message.

Observations should be append-only and should reference the Execution Unit.

The latest valid observation is the current operational snapshot unless a stronger derived state exists.

---

# 17. Escalation Lifecycle

```
OPEN
  |
ACKNOWLEDGED
  |
RESOLVED
```

Resolution must record the resulting human Decision or explicit action.

Where an escalation changes architecture, product behavior, scope, or another authoritative artifact, the resolution must link to the resulting Decision/ADR/spec.

An escalation must never be silently discarded.

---

# 18. Vibe Kanban and External Execution Tools

Vibe Kanban, GitHub Issues, agent-native task lists, and similar tools are not authoritative sources for Decisions or project state.

They may be used as execution surfaces.

The conceptual relationship is:

```
Underboss Control Plane
        |
        +-- Decision
        +-- Execution Unit
        +-- Attention
        |
        +-- execution adapter
               |
               +-- Claude Code
               +-- OpenCode
               +-- Vibe Kanban
               +-- other executor
```

Integration with Vibe Kanban is explicitly deferred unless the existing implementation demonstrates a concrete need.

Do not make Vibe Kanban a required dependency of the first implementation.

---

# 19. Web UI

A web Control Center is not part of the first implementation.

The architecture must keep the Control Plane UI-agnostic so that a future CLI, TUI, web Portal, or other interface can consume the same Runtime API.

This follows the existing Underboss architectural intent that Runtime API provides a stable surface for future CLI/TUI/Portal/plugins.

---

# 20. Storage and Persistence

The implementation must first inspect the existing Underboss storage model and select the smallest mechanism compatible with current architecture.

Requirements:

- human-readable;
- Git-friendly;
- deterministic;
- inspectable without a database;
- append-only for observations;
- stable IDs;
- no absolute-path dependency for project identity;
- compatible with repository-local operation.

Do not introduce PostgreSQL, Redis, SQLite, or another service merely to implement this feature.

If a structured file-based model is sufficient, use it.

If a database becomes demonstrably necessary, stop and create an ADR before introducing it.

---

# 21. Compatibility

Existing projects using Underboss v2 must continue to bootstrap.

The following must remain valid:

- existing Runtime Registry;
- existing Runtime API;
- existing documentation layout;
- existing SOPs;
- existing agent entry protocol;
- existing boundaries;
- existing Reality Engine;
- existing validation;
- existing submodule installation model.

Migration must be explicit and idempotent.

No consumer project should be forced to adopt the complete Control Plane merely because it upgrades the Runtime.

---

# 22. Implementation Phases

## Phase 0 — Repository archaeology

Before changing code, inspect:

- Runtime Registry;
- Runtime API;
- state machine;
- contracts;
- documentation validators;
- generators;
- SOP planner;
- agent entry protocol;
- Reality Engine;
- existing project/workspace metadata.

Produce a short implementation note identifying the actual extension points.

Do not modify architecture based on assumptions.

## Phase 1 — Canonical schemas

Implement schemas/contracts for:

- Project;
- Repository;
- Workspace;
- Decision;
- Execution Unit;
- Observation;
- Escalation.

Add validators.

Add fixtures covering valid and invalid states.

## Phase 2 — Operational state engine

Implement:

- state transition validation;
- READY gate;
- autonomy policy validation;
- Observation persistence;
- Escalation lifecycle.

Keep this layer independent from a UI.

## Phase 3 — Runtime API

Expose stable functions through the existing Runtime API.

Do not create an independent API implementation parallel to `runtime/lib/api.sh`.

The API should provide read/write operations for the new operational state model.

## Phase 4 — CLI

Implement the minimum CLI surface defined in this specification.

Prioritize:

```
status
attention
decision
execution
escalation
```

Output must be deterministic and human-readable.

## Phase 5 — Agent integration

Extend agent entry instructions and execution contracts.

An agent must be able to:

- resolve its Execution Unit;
- read authoritative inputs;
- know its autonomy boundary;
- emit an Observation;
- create an Escalation when required;
- leave the project in a verifiable state.

## Phase 6 — Reality integration

Connect READY/VERIFYING/DONE with the existing Reality Engine.

Do not duplicate inventory or drift logic.

## Phase 7 — Documentation and migration

Update:

- architecture documentation;
- ADR if required;
- Runtime Registry;
- contracts;
- validators;
- templates;
- agent entry documentation;
- README/usage documentation.

Add migration support for existing consumers.

## Phase 8 — Operational validation

Test the model against at least three materially different workspace configurations:

1. Windows local workspace.
2. Ubuntu VirtualBox workspace.
3. Multiple workspaces for one logical repository.

Use realistic project examples where possible.

---

# 23. Explicit Non-Goals

The first implementation must NOT:

- build a second project-management application;
- replace ADRs;
- replace SOPs;
- replace Reality Engine;
- require a database service;
- require a web UI;
- require Vibe Kanban;
- normalize all physical project directories;
- turn every agent subtask into a first-class human task;
- automatically make product/architecture decisions;
- silently expand execution scope;
- introduce a deployment orchestrator;
- require a single operating system;
- require a single coding agent.

---

# 24. Acceptance Criteria

The implementation is accepted only when all of the following are true.

## Domain model

A project can have:

- one repository;
- multiple workspaces;
- multiple deployment target references;
- multiple Decisions;
- multiple Execution Units.

## Decision → Execution

A human-approved Decision can produce an Execution Unit.

The Execution Unit can be evaluated for READY without manually inspecting arbitrary agent conversation.

## READY

A READY gate produces deterministic pass/fail output and actionable findings.

## Autonomous execution

An Execution Unit can enter EXECUTING with an explicit autonomy policy.

## Observation

An execution can produce append-only Observations.

The latest observation can be rendered through the Control Plane.

## Escalation

An agent can stop execution at a declared authority boundary and create an actionable Escalation.

The human can resolve the escalation and associate the resolution with a Decision where appropriate.

## Human attention

`underboss attention` shows only items requiring human action or explicit decision.

It must not become a generic task list.

## Reality

Verification can consume existing Reality Engine output.

DONE cannot be asserted solely from an agent's textual claim.

## Workspace

A logical project remains stable when its physical workspace changes.

Absolute filesystem paths must not define Project, Repository, Decision, or Execution identity.

## Compatibility

Existing Underboss v2 consumer projects continue to bootstrap and validate.

## Architecture

Registry remains SSOT for runtime structure.

The new feature is integrated through the existing Runtime API.

No parallel hidden configuration system is introduced.

---

# 25. Required Tests

At minimum add tests for:

- valid/invalid entity schemas;
- Decision lifecycle;
- Execution state transitions;
- illegal state transitions;
- READY gate success;
- READY gate failure;
- autonomy policy evaluation;
- Observation append semantics;
- Escalation lifecycle;
- Decision → Execution relationship;
- Project → Repository → Workspace resolution;
- multiple workspaces;
- Windows-style path metadata;
- Linux-style path metadata;
- missing workspace;
- unresolved artifact references;
- Reality Engine verification failure;
- Control Plane attention filtering;
- backward-compatible Runtime bootstrap.

---

# 26. Agent Implementation Instructions

You are implementing this specification inside the existing `akturt/underboss` repository.

Treat the repository itself as authoritative.

Before implementation:

1. Read the current README.
2. Read the Runtime Registry.
3. Read the Runtime API.
4. Read the Runtime state machine.
5. Read the consumer/runtime contracts.
6. Read the SOP planner and representative SOPs.
7. Read the agent entry protocol.
8. Read Reality Engine collectors/analyzers/reporters.
9. Read existing documentation validators and generators.
10. Inspect recent ADRs and specs.

Then produce a concise archaeology report identifying the exact extension points.

Do not start coding before resolving where each new artifact belongs.

Implementation rules:

- Extend existing mechanisms before creating new ones.
- Registry is SSOT for runtime structure.
- Runtime API is the stable programmatic interface.
- SOP remains workflow definition.
- Reality Engine remains reality reconstruction.
- Documentation remains authoritative for human-readable project knowledge.
- Operational state is separate from immutable architectural knowledge.
- Do not duplicate existing logic.
- Do not hardcode paths that Registry or project metadata can resolve.
- Preserve idempotent bootstrap/migration behavior.
- Keep the first implementation CLI-first and UI-agnostic.
- Keep the implementation dependency-light.
- Prefer deterministic file-based persistence.
- Add tests before declaring the state model complete.
- Update documentation and contracts as part of the same change.
- If an architectural decision is required, create/update an ADR instead of silently changing the architecture.

When a requirement is ambiguous, prefer the smallest implementation that preserves the model in this specification and existing Underboss architecture.

Do not invent additional product-management features.

---

# 27. Completion Report

At completion, report:

1. files changed;
2. new entities and schemas;
3. state machine implemented;
4. Runtime API additions;
5. CLI commands;
6. validators/tests;
7. migration behavior;
8. compatibility results;
9. known limitations;
10. explicit list of decisions that still require human approval.

The completion report must distinguish:

- implemented;
- verified;
- deferred;
- blocked.

Do not report a feature as complete merely because its files were created.
