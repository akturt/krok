---
schema: 1
id: spec-underboss-v3-control-plane
type: spec
status: superseded
date: 2026-10-04
owners: [underboss-team]

entity_refs: [lifecycle-spec, sop-dag, reality-engine]
touches: [core, bootstrap, documentation, engine, sops, agents, knowledge, playbook]
code: []
docs: [docs/audits/2026-10-04-semantic-reconciliation-v3-minimal-model.md]
depends_on: []
implements: []
supersedes: []
tags: [underboss, control-plane, execution-unit, spec-lifecycle, escalation, backlog, vocabulary, v3]
priority: P0
---

# Spec: Underboss v3 — Control Plane

## Goal

Make Underboss semantically simpler while adding the one concept it lacks: **an Execution Unit with operational state**. Everything else in v3 is the removal of ambiguity: one vocabulary, one spec lifecycle, one escalation vocabulary, no compatibility layers, no word "runtime" in the Operational Model.

Success criterion: after v3 the model has fewer terms, fewer states and fewer mechanisms than v2 plus exactly two new stored kinds (Execution Unit, Execution Record).

## Context

Facts established by repository archaeology (see `docs/audits/2026-10-04-semantic-reconciliation-v3-minimal-model.md`):

- Knowledge is already modeled: ADR (why), Spec (what/how), Architecture and invariants, Reality Engine (what exists), SOP (how a class of work is done).
- **No instance-level state exists.** A SOP describes work and "is not execution"; the planner prints a DAG; the reality report is a project-level snapshot. Nothing records that a particular piece of approved work is being carried out, by whom, in which state, or why it stopped.
- The word "runtime" names a dozen unrelated things (product, layer, directory, SDK, registry, installation states, ownership, environment variable, entity id).
- The spec lifecycle contains a stage (`review`) that no code requires and no consumer uses; the `api` lifecycle is documented but not implemented.
- Several mechanisms exist only as compatibility or fallback (degraded bootstrap mode, legacy-layout detection, version matrix, SOP role alias, warn-only validation).

Owner policy: **minimal closed model; no backward compatibility, no fallback, no alias, no legacy mode.** A concept, term, status or mechanism that the model does not need is deleted.

## Scope

### Included

1. The canonical model and vocabulary (§1, §2).
2. Knowledge-document rules: ADR vs Spec, Spec lifecycle without `review`, immutability of approved Specs, Acceptance criteria in Spec (§3).
3. Execution Unit, its state machine, READY as a validation snapshot, Execution Context, Execution Environment, autonomy policy (§4).
4. Execution Record (§5) and Escalation with one closed vocabulary (§6).
5. Storage under `.context/execution/` (§7) and the Control Plane projections and CLI (§8).
6. Agent contract (§9), backlog lifecycle (§10), SOP and Reality integration (§11), Project/Repository identity (§12).
7. Removal of the former "runtime" vocabulary and of every compatibility/fallback mechanism (§13, §14).
8. One-time migration of existing consumers (§14).

### Excluded

- A second project-management product; integration with external task systems; a web UI.
- A database, or any service.
- Cross-repository aggregation. `underboss attention` works per repository.
- Deployment orchestration; deployment targets as metadata.
- Automatic product or architecture decisions.
- A `Decision` stored artifact; a Bounded Context concept; a new Evidence model; a scanner/finding/candidate subsystem parallel to the Reality Engine.
- Compatibility of any kind with v2 layouts, keys, statuses or aliases.

## Technical approach

### 1. The model

```
AUTHORITATIVE KNOWLEDGE
  Architecture · ADR · Spec · Principles · Audits
        │  approved Spec
        ▼
EXECUTION UNIT ── Context Resolution
        │            ├─ authoritative knowledge
        │            ├─ Reality
        │            ├─ constraints (INV-NNN)
        │            ├─ Execution Environment
        │            └─ autonomy policy
        ▼
     READY ─▶ EXECUTING ─▶ VERIFYING ─▶ DONE
                 │             │
                 └──▶ BLOCKED ◀┘ ── resolution → revalidation

Execution Records = immutable operational history
Escalations       = human intervention records
Backlog           = active.md / archive.md
```

One line per concept:

| Concept | Meaning |
|---|---|
| ADR | Why |
| Spec | What + How + Scope + Acceptance |
| Execution Unit | Do it |
| Execution Record | What happened |
| Escalation | A human must decide or act |
| Reality | What actually exists |
| SOP | How a class of work is performed |

### 2. Canonical vocabulary

| Term | Canonical meaning | Not to be used as |
|---|---|---|
| Underboss | the product | — |
| Core | the infrastructure layer: Registry, Installation State Machine, contracts, Core SDK, bootstrap, Reality Engine | — |
| Documentation Module | the content layer: templates, validators, knowledge, agents, SOPs, playbook | — |
| Core SDK | the internal programmatic interface of the Core | "API" for end users |
| Registry | single source of truth for Underboss's own structure and vocabulary lists | — |
| Installation State Machine | states of an Underboss installation: `fresh`, `installed`, `partial`, `broken` | the Execution Unit lifecycle |
| Control Plane | the read-oriented projection and CLI over execution state, escalations and backlog | a store of its own |
| Orchestrator | whoever walks a SOP: a human or a script | "role" |
| Agent Entry Metadata | the content of `.context/` that tells an agent where to start | "context" in the sense of Execution Context |
| ADR | one architectural decision and its rationale | a spec |
| Spec | an approved or draft change contract | an ADR |
| Decision | a **human act**; never a stored artifact | an entity, a file, a status |
| Entity | a named concept referenced through `entity_refs` | an Execution Unit, a DDD aggregate |
| Capability | the skill contract of an agent role (`knowledge/capabilities.md`) | a generic word for a feature or ability |
| Boundary | a path ownership class: `pristine`, `editable`, `generated`, `secret` | a limit of agent authority |
| Escalation trigger | the reason a human is required (§6) | "boundary" |
| Observation | a domain fact about a Subject (ontological audit) | an execution journal entry |
| Evidence | confirmation of a fact with class `OBSERVED`, `EVIDENCED`, `INFERRED`, `CLAIMED` | — |
| Execution Record | an immutable journal entry of one Execution Unit | an Observation |
| Bounded Context | **not an Underboss concept** | anything in v3 |

### 3. Knowledge documents

#### 3.1 ADR

An ADR answers "why did we choose this architecture". It holds one architectural decision and its rationale. Lifecycle: `proposed → accepted → deprecated | superseded`. `accepted` means the decision is in force and the body is immutable. A decision that must be remembered long term is an ADR. The body of an ADR contains no `Status` section: status lives only in frontmatter.

#### 3.2 Spec

A Spec answers "what are we changing, within what scope, and how". It is a change contract with the sections Goal, Context, Scope (Included / Excluded), Technical approach, Affected files, Open questions, **Acceptance criteria**, and after implementation `Result`.

`accepted` (ADR) and `approved` (Spec) are different acts: an accepted ADR means the architectural decision is in force; an approved Spec means the change contract is authorized for execution.

#### 3.3 Spec lifecycle

```
docs/specs/drafts/       status: draft
docs/specs/approved/     status: approved
docs/specs/implemented/  status: implemented
docs/specs/superseded/   status: superseded

draft       → approved
approved    → implemented
approved    → superseded
implemented → superseded
```

- `draft`: working, not authoritative; it stays in `drafts/` while it is being assessed by humans or agents. An abandoned draft is deleted.
- `approved`: an authoritative execution input. A Spec stays `approved` while any of its scope is unexecuted.
- `implemented`: the whole scope is realized; the Spec is a historical record with a filled `Result`. It is never an execution input and is never reopened.
- `superseded`: replaced by another Spec that carries `supersedes: [id]`.
- There are no other statuses and no other directories. The status `review` and the directory `docs/specs/review/` do not exist in v3.
- Path and `status` must match; a mismatch is an **error**.
- Promotion is `git mv` plus a frontmatter `status` change in the same commit.

#### 3.4 Approved Specs are immutable

After a Spec becomes `approved` its semantic body is not edited. To change its meaning: write a new draft Spec B, approve B (B `supersedes: [A]`), move A to `superseded/`. No amendment mechanism exists. Frontmatter metadata may change under the existing frontmatter rules. If the source Spec of an Execution Unit is superseded, the unit is `CANCELLED` and the work continues as a new unit on the new Spec.

#### 3.5 Acceptance criteria

Every Spec has `## Acceptance criteria`: a list of criteria, each with a stable id `AC-NNN`. A Spec cannot be moved to `approved/` without at least one. An Execution Unit references the criteria it realizes (`all`, or a list of ids); it never copies their text.

#### 3.6 Decision

A decision is a human act. It produces one of: an ADR (long-lived architectural choice), a new Spec (changed contract), or, when it arises during an Escalation and needs no durable document, a resolution inside an Execution Record. There is no Decision file, schema, lifecycle, registry or `.context/decisions.yml`, and no Approval entity (approval is moving a Spec to `approved/`).

#### 3.7 API documents

`type: api` keeps the base fields and `status: active | deprecated`, like `runbook` and `guide`. The draft/approved/implemented/superseded lifecycle and the `docs/api/{drafts,…}/` directories were never implemented and are removed from the canonical model.

### 4. Execution Unit

#### 4.1 Definition

An Execution Unit is **one bounded instance of carrying an approved Spec scope to a verified result.** It binds an approved Spec (and optionally a subset of its acceptance criteria) to a SOP and an autonomy policy, and carries its own lifecycle. It is the only new abstraction in v3.

#### 4.2 Definition file

`.context/execution/<execution-id>/unit.yml`:

```yaml
id: execution-042
spec: <spec id>                 # frontmatter id, never a path
scope: all                      # or [AC-001, AC-003]
sop:
  name: new-feature
  version: 1
constraints: [INV-017, INV-021]
autonomy:
  escalate_on: [protected-path, invariant, architecture, security,
                public-contract, domain-semantics, scope, manual-gate, context-gap]
state: DESIGN
validated_at:                   # set by a successful validation
fingerprint:                    # set by a successful validation
created_at: 2026-10-04T12:00:00Z
started_at:
completed_at:
```

`unit.yml` holds the **current operational state**. It carries no acceptance text, no environment and no decision list. Execution ids are stable and never reused.

#### 4.3 States

| State | Meaning |
|---|---|
| `DESIGN` | not runnable: the definition is incomplete or the last validation failed. An open Escalation may exist here; this does **not** make the unit `BLOCKED`. |
| `READY` | the result of one validation point: at `validated_at`, against `fingerprint`, context was sufficient. Not a permanent flag. |
| `EXECUTING` | an agent is carrying the unit out. Entered only after a fresh revalidation at start. |
| `VERIFYING` | the agent claims completion; acceptance and Reality checks run. |
| `BLOCKED` | execution **has started** and cannot continue. Nothing else is `BLOCKED`. |
| `DONE` | terminal: required verification passed. |
| `CANCELLED` | terminal: the work is no longer wanted or its source Spec was superseded. |

```
DESIGN    → READY
READY     → DESIGN        revalidation failed, or the definition was edited
READY     → EXECUTING     only after a successful fresh revalidation
EXECUTING → VERIFYING
VERIFYING → DONE
VERIFYING → EXECUTING     verification failed and the agent can continue
EXECUTING → BLOCKED
VERIFYING → BLOCKED
BLOCKED   → EXECUTING     resolution recorded + revalidation passed
BLOCKED   → DESIGN        context is no longer valid
any non-terminal → CANCELLED
```

Opening an Escalation moves `EXECUTING | VERIFYING` to `BLOCKED` and `READY` to `DESIGN`; `DESIGN` stays `DESIGN`. There is no `VERIFYING → DESIGN`: changing the Spec or the unit definition after a failed verification goes through Escalation → `BLOCKED` → `DESIGN`. `VERIFYING → EXECUTING` is the ordinary rework loop and is not an escalation. Every transition is rejected unless listed above. `DONE` is never accepted on an agent's textual claim: each criterion in `scope` needs a verification record whose evidence is `OBSERVED` or `EVIDENCED`, and the relevant Reality checks must pass.

#### 4.4 READY is a validation snapshot

`READY` records that validation passed at `validated_at` against `fingerprint`. It is never trusted later without recomputation.

Validation checks, each deterministic:

1. the source Spec exists and is in `approved/`;
2. every ADR in the Spec's `implements` / `depends_on` is `accepted`;
3. every id in `scope` exists in the Spec's Acceptance criteria; the Spec has `Scope → Excluded`;
4. every id in `constraints` exists in `docs/architecture/invariants.md`;
5. the SOP name and version resolve in the Registry;
6. the autonomy policy is valid (§4.8);
7. the Execution Environment resolves (§4.7);
8. the Reality Engine reports no drift matching the Spec's `touches` / `entity_refs`;
9. Context Sufficiency passes (§4.6).

The fingerprint is a hash over: the Spec file and its path-status; the status of each referenced ADR; the text of each referenced invariant; `.context/boundaries.yml`; the unit definition (excluding `state`, `validated_at`, `fingerprint`); and the set of drift items matching the Spec. Effects:

| Change | Effect |
|---|---|
| Spec edited, moved out of `approved/`, or superseded | `READY → DESIGN` (superseded: `CANCELLED`) |
| a referenced ADR is no longer `accepted` | `READY → DESIGN` |
| a referenced invariant changes | `READY → DESIGN` |
| `.context/boundaries.yml` changes | `READY → DESIGN` |
| the unit definition or autonomy policy is edited | `READY → DESIGN` |
| new Reality drift matching the Spec | revalidation fails |
| repository HEAD advances | no effect by itself; only changes under the Spec's affected paths count; the base commit is recorded in the validation record |
| the host, OS, path or tools change | no effect on READY; checked at start (§4.7) |

`start` always performs a fresh validation. If it fails: `READY → DESIGN`, a validation record is written and, if a human is required, an Escalation is opened. Projections recompute the fingerprint on read and show `READY (stale)` when it differs; "stale" is a computed display flag, never a stored state.

#### 4.5 Execution Context

Execution Context is the **resolved view** an agent needs for one unit: authoritative knowledge (Spec, ADRs, Architecture, invariants), Reality evidence, constraints, Execution Environment, acceptance criteria in scope, autonomy policy, and the latest records and open Escalations. It is recomputed on demand and never stored as a source of truth. Authority and provenance stay explicit: inferred material is never presented as authoritative.

#### 4.6 Context Sufficiency and authority

Authority order for deciding what is true:

| Source | Role |
|---|---|
| approved Specs, accepted ADRs, Architecture, invariants | normative: what should hold |
| Reality Engine output | descriptive: what exists, with Evidence class and trust level |
| inferences and claims | never override normative sources |

Rules:

- normative vs Reality disagreement is **drift**, already detected by the Reality Engine analyzers; it fails validation and requires a human (`context-gap`);
- normative vs normative: structural contradictions (unresolved references, superseded references, status/path mismatch) are deterministic; semantic contradictions are not and go to a human;
- an authority-sensitive fact supported only by `INFERRED` or `CLAIMED` evidence is insufficient;
- missing context is first reconstructed with the existing Reality Engine and `reality-auditor`; whatever remains insufficient or contradictory becomes a `context-gap` Escalation. No scanner, finding or candidate model is added.

#### 4.7 Execution Environment

Execution Environment is **execution-scoped metadata discovered by the Core SDK**, not a global entity: repository checkout (root and HEAD), host, OS, path, available tools, agent platform. Validation requires that the checkout matches the repository identity in `.context/project.yml` and that the platform required by the SOP steps is available. The environment is part of the resolved Execution Context and is recorded as `OBSERVED` evidence in the validation and start records. It is never written to `.context/project.yml`.

#### 4.8 Autonomy policy

`autonomy.escalate_on` lists the Escalation kinds that stop the agent. `escalate_on` is a **trigger**, not an allowlist or a denylist: it names the situations in which the agent must stop. Default: all nine. The governing principle: **if an affected area has no explicit permission for autonomous decision, the agent escalates; absence of a prohibition is not permission.** Autonomy is extended only by an explicit statement in the `approved` Spec, naming the kind it covers; a kind is removed from `escalate_on` only on that basis. Editing the field is a definition change (`READY → DESIGN`). The agent never expands scope silently.

### 5. Execution Record

An Execution Record is an immutable, append-only journal entry belonging to one Execution Unit. Records add only what git does not hold: state transitions, validation and verification results, escalations, environment, outcome. Commit history stays in git; records reference commit SHAs and never copy diffs.

Types: `transition`, `validation`, `verification`, `escalation-opened`, `escalation-resolved`.

Common fields: `seq`, `at` (UTC), `type`, `actor` (human or agent identity), plus a type-specific payload. Every fact carries `evidence: { class, source }` using the existing classes `OBSERVED`, `EVIDENCED`, `INFERRED`, `CLAIMED`. No other evidence vocabulary is introduced.

### 6. Escalation

An Escalation is a concept expressed as two Execution Record types. `escalation-opened` carries `id` (`<execution-id>:<seq>`), `kind`, `question`, `impact`, `affected_artifacts`. `escalation-resolved` carries the `id`, the `resolution`, and links to an ADR or Spec when the resolution produced one. Status has two values: `open`, `resolved`.

One closed vocabulary, defined once in the Registry and used identically by `Escalation.kind`, `autonomy.escalate_on`, validation failure classification, the attention projection, CLI/API, tests and examples:

| Kind | Trigger | Existing mechanism |
|---|---|---|
| `protected-path` | the work needs a write to a `pristine` or `secret` path | `.context/boundaries.yml`; "pristine → STOP, ask human" |
| `invariant` | an `INV-NNN` is violated or at risk | invariants document |
| `architecture` | topology, data model, or a new external dependency changes | "ADR Before Code"; architecture-reviewer triggers |
| `security` | authentication, authorization, secrets handling or the security model is touched | `review-security-model` capability |
| `public-contract` | a public API or contract changes | `type: api`; contract anti-pattern review |
| `domain-semantics` | the meaning of a domain concept is ambiguous or conflicting | ontological audit; entity refs |
| `scope` | the work is not authorized by the approved Spec (outside `Included`, inside `Excluded`, or an open question) | Spec `Scope` and `Open questions` |
| `manual-gate` | a SOP step with `gate: manual` is reached | SOP `gate: manual` |
| `context-gap` | execution context is insufficient or contradictory | Evidence Model; drift analyzers |

Three independent axes, never mixed:

| Axis | Values |
|---|---|
| `Escalation.kind` | the nine above |
| `Escalation.status` | `open`, `resolved` |
| Execution Unit state | `DESIGN … CANCELLED` (§4.3) |

`DESIGN` plus an open Escalation is valid and is not `BLOCKED`. Resolution never changes the unit state by itself: the unit moves only through an explicit revalidation. An Escalation is never discarded; if its resolution changes a contract, a new Spec supersedes the old one (§3.4).

### 7. Storage

```
.context/execution/<execution-id>/unit.yml       current operational state
.context/execution/<execution-id>/records/       immutable history
    <seq>-<utc>-<type>.yml                       one file per record
```

- **Why `.context/`:** it is the existing home of machine-readable YAML for agents (project.yml, boundaries.yml). **Why not `docs/` or the frontmatter `type` enum:** `docs/` is authoritative human knowledge and the `type` enum validates human documents with path-status; execution state is machine-written, high-frequency and unreviewed.
- Files are YAML in a restricted subset (block mappings, block sequences, scalars; no anchors, no flow style, no multiline scalars), written with a fixed key order, so output is deterministic. One shared zero-dependency reader/writer implements the subset; the existing ad-hoc parser in `sops/planner.mjs` is extracted and extended into it, not duplicated.
- **Consistency rule:** a state change is performed only by the Core SDK: it writes the record first, then updates `unit.yml`. The validator fails if `unit.yml.state` disagrees with the latest `transition` record, if a record file was modified after creation, or if `seq` has gaps.
- Records are committed to git; git is the version store. There is no database and no service.
- Registry changes: the `context` directory scope supports directory entries; `.context/execution/` is registered; a validator for it is registered; the escalation vocabulary is registered (§6).
- `.context/boundaries.yml` classifies `.context/execution/` as `editable` (writes go through the Core SDK). The boundaries generator is corrected so that generated output matches the consumer boundaries contract: only the vendored Underboss directory is `pristine`; `docs/`, `src/`, `tests/`, `.context/execution/` are `editable`; build outputs are `generated`; `.env`, keys and secrets are `secret`.

### 8. Control Plane

The Control Plane is a read-oriented projection over `.context/execution/`, `docs/backlog/` and Reality output. It stores nothing. CLI (`underboss`), output deterministic and human-readable:

```
underboss status                          states, stale READY, open escalations, active backlog size
underboss attention                       open Escalations only
underboss execution list | show <id>
underboss execution create <spec-id> [--scope AC-001,AC-003] [--sop <name>]
underboss execution ready <id>            validate; DESIGN → READY or findings
underboss execution start <id>            fresh revalidation; READY → EXECUTING
underboss execution verify <id>           EXECUTING → VERIFYING; runs acceptance and Reality checks
underboss execution complete <id>         VERIFYING → DONE only with evidence
underboss execution cancel <id>
underboss execution record <id> ...       append a record
underboss escalation list | show <id> | open <id> | resolve <id>
underboss backlog status | archive
```

`attention` shows only open Escalations: execution, kind, question, impact, affected artifacts, age. It never becomes a task list. There is no `decision` command.

### 9. Agent contract

An agent entering an Execution Unit receives the resolved Execution Context: project and repository identity, the unit, the source Spec and its scoped Acceptance criteria, ADRs and invariants, Execution Environment, autonomy policy, the latest records, open Escalations. It must: stay inside `autonomy`; stop and open an Escalation at a trigger; emit records through the Core SDK; leave the unit in a verifiable state. A conversation transcript is never execution state. Claude Code and OpenCode remain interchangeable executors.

### 10. Backlog

```
docs/backlog/active.md     all open actionable work
docs/backlog/archive.md    everything no longer actionable
```

- Items are checkbox lines: `[ ]` open; `[x]` completed; `[-]` closed without completion (cancelled, superseded, deferred or dropped, with the reason in the text).
- `active.md` contains only `[ ]` items (sections `Open` and `In progress`). `archive.md` contains no `[ ]` items. Both are `type: backlog`, `status: active`.
- `underboss backlog archive` moves every non-open item to `archive.md`; it is idempotent. No third file.
- This is a **new v3 convention**, not an existing one. The template `documentation/templates/backlog.md` (`Active / In Progress / Done`) is replaced by two templates; bootstrap creates both files; a validator enforces the rules; existing backlogs are migrated once (§14).

### 11. SOP and Reality integration

SOPs stay descriptive YAML and never hold progress. An Execution Unit references a SOP by name and version; step progress lives in records. Human steps are `gate: manual` only. The Reality Engine stays the only source for reconstructing actual state: validation, verification and drift handling consume its output and never duplicate its inventory logic.

### 12. Project and Repository identity

`.context/project.yml` is the single identity source (`name`, `repository`). Project and Repository are logical concepts of the Control Plane with no registry or entity of their own. There is no Workspace entity and no cross-repository aggregate.

### 13. Vocabulary removal

#### 13.1 Target vocabulary

`Underboss`, `Core`, `Core SDK`, `Registry`, `Installation State Machine`, `Control Plane`, `Orchestrator`, `Agent Entry Metadata`.

#### 13.2 Renames (one atomic change set; no alias, no dual-read, no dual-write)

| Former | Target |
|---|---|
| directory `runtime/` | `core/` |
| `runtime/state-machine.yaml` | `core/installation-state-machine.yaml` |
| `runtime/contracts/runtime/` | `core/contracts/product/` |
| `docs/.runtime/underboss/` (consumer mount) | `docs/.control/` |
| `RUNTIME_ROOT`, `RUNTIME_REGISTRY` and local variables of the same family | `CONTROL_ROOT`, `CONTROL_REGISTRY`, … |
| registry key `runtime:` | `control:` |
| `validate-runtime.sh` (and its Registry entry) | `validate-integrity.sh` |
| "Runtime API" | Core SDK |
| "Runtime Registry" | Registry |
| "Runtime state machine" | Installation State Machine |
| "Runtime Core" | Core |
| "runtime role" in SOP text | orchestrator |
| `.context/` described as "runtime context" | Agent Entry Metadata |
| entity ref `runtime-agentic-layer` | `agentic-layer` |
| entity refs `runtime`, `registry`, `state-machine` | `core`, `registry`, `installation-state-machine` |
| README tagline "Documentation Runtime" | "Engineering control plane for projects built with AI coding agents" |
| this spec's former title and id "control-runtime" | `control-plane` (done) |

Physical names are functional, not product-bearing: the integration namespace (`docs/.control/`, `CONTROL_*`, the registry key) does not repeat the product name, so a later product rename does not touch it. The `underboss` CLI keeps its name; renaming the product is a separate, later change and out of scope.

The hardcoded entity-id list in the integrity validator is removed; entity refs resolve against the entity catalog (`docs/architecture/`, from `bootstrap/templates/entity-catalog.md`).

#### 13.3 Scopes and lexical policy

Three independent scopes; none is a filesystem allowlist. A file belongs to a scope by what it is, not by where it sits.

- **Operational Model**: the system in force after migration: code, Registry, contracts, validators, generators, bootstrap, CLI and Core SDK, active documentation, configuration, current schemas and templates, current SOPs, current architecture and principles, and this Spec while it is `draft` or `approved`. It knows nothing of the old system.
- **Historical / Reconciliation Record**: material describing a past state: audits, `implemented` and `superseded` Specs, `deprecated` and `superseded` ADRs, historical analysis, git history.
- **Migration Contract**: material describing the one-time v2 → v3 transition (this Spec's §13.2 and §14, the migration script and its fixtures and tests). It may name the old system, but only as the source state being migrated.

A Migration Contract may know the old system; the Operational Model may not.

Lexical policy, checked **per class, not as one global search**:

| Class | Former vocabulary (`runtime`, old paths, variables, statuses, entity refs) |
|---|---|
| code, Registry, contracts, validators, generators, CLI/API | forbidden |
| active operational documentation (README, INSTALL, playbook, knowledge, SOPs, agents, templates, active ADRs, architecture) | forbidden |
| this Spec | allowed only where it describes the migration or reconciliation |
| migration documentation, script, fixtures | allowed only as source-state vocabulary |
| audits, `implemented` and `superseded` artifacts, `deprecated` and `superseded` ADRs | allowed (historical) |
| git history | allowed |

Never a violation: ordinary English "at run time" and consumer-domain terms (`runtime-ownership-report`, the pipeline-archaeologist's "runtime reality of a pipeline"). Forbidden identifiers in operational classes: `docs/.runtime`, `RUNTIME_ROOT`, `RUNTIME_REGISTRY`, `runtime-agentic-layer`, `specs/review`, `status: review`. The final inventory is run for each class separately and reports each class's result; an operational-class survivor that is not a listed exception is a defect.

#### 13.4 Other deletions in the same change set

- the `review` status, directory and every reference (schema, validator, analyzers, registry, boundaries, bootstrap, generators, SOPs, agent instructions, playbook, INSTALL, documentation, examples); `new-feature` and `new-service` merge their two promotion steps into one human gate "promote draft → approved"; `architecture-review` triggers on `drafts/` only;
- the `api` lifecycle statuses and directories (§3.7);
- the `legacy` values of the `kind` enums (`runbook`, `guide`); nothing produces them;
- compatibility and fallback mechanisms (§14);
- `.context/decisions.yml` from the playbook;
- the body `## Status` section of the ADR template;
- the Decision, Project, Repository, Workspace, Observation-as-journal and review-lifecycle elements of the previous v3 draft.

### 14. No compatibility, and migration

Policy: **no backward compatibility, no fallback, no alias, no legacy mode.** Product code never branches on "old exists" or "new missing"; there is no dual-read and no dual-write; there are no deprecated-but-supported paths. A superseded mechanism is deleted. Git history may contain the old words; that is not compatibility.

Mechanisms deleted:

1. degraded bootstrap mode and its built-in fallback layout (`bootstrap.sh`; hardcoded directory list in `bootstrap.ps1`): a missing Registry is an error;
2. legacy-layout detection and migration (`.context/runtime/`, state `legacy`, the legacy-layout contract, install handling): the Installation State Machine is `fresh`, `installed`, `partial`, `broken`;
3. the version compatibility matrix and its reader;
4. the `role: human` alias in the planner: SOPs use `gate: manual`;
5. `WARN_ONLY` mode, and every check that only warns (path-status, empty `entity_refs`, legacy fields): all are errors;
6. the tolerant status whitelist in the documentation-drift analyzer: statuses come from the schema;
7. the `legacy` `kind` values.

`engine/scripts/migrate-legacy.mjs` stays: it onboards foreign brownfield documentation and is a product feature.

**One-time migration is not compatibility.** A migration script converts a consumer repository from v2.0.0 once; afterwards old paths, keys, statuses, layouts and aliases are unsupported. It supports only the immediately previous version. Rules:

| Input | One-time result |
|---|---|
| submodule at `docs/.runtime/underboss` | moved to `docs/.control`; generated files regenerated by bootstrap |
| `docs/specs/review/*` | moved to `drafts/` with `status: draft` (approval is a human act, never automatic) |
| `type: api` with an old lifecycle status | `draft`, `review`, `approved`, `implemented` → `active`; `superseded` → `deprecated`; old `docs/api/` subdirectories removed |
| `entity_refs` / `implements` / `depends_on` naming `runtime-agentic-layer` and the other renamed ids | rewritten to the new ids, repository-wide, atomically |
| existing backlog | open items → `active.md`; `Done` and non-actionable items → `archive.md` |
| `.context/boundaries.yml` | regenerated from the corrected generator |
| specs in `approved/` whose scope is already realized | moved to `implemented/` by the owner's explicit list |

The script is idempotent, writes nothing outside the listed transformations, and is removed from the product once the owner's consumers are migrated.

For this repository: the two delivered approved specs (`2026-07-08-agentic-layer`, `2026-07-08-runtime-v1.2`) move to `implemented/`; `2026-07-09-architecture-study-layered-decomposition`, whose body states `REJECTED` and which is a study rather than a change contract, becomes `type: audit` in `docs/audits/`. ADR-001, ADR-002 and ADR-003 become `superseded` by ADR-005.

### 15. Required ADRs

Only decisions that change architecture get an ADR. Each is accepted **before** the change it governs is implemented.

| ADR | Decision | Supersedes | Governs |
|---|---|---|---|
| ADR-004 | Spec lifecycle `draft → approved → implemented \| superseded`; `review` removed; approved Specs immutable; Acceptance criteria in Spec; `api` lifecycle removed | — | §3, §13.4 |
| ADR-005 | Underboss architecture baseline in the new vocabulary: Core, Documentation Module, Core SDK, Registry SSOT, Installation State Machine, `docs/.control/`, the five agentic layers, `gate: manual`; and the removal of compatibility and fallback mechanisms | ADR-001, ADR-002, ADR-003 | §2, §13, §14 |
| ADR-006 | Execution state lives in `.context/execution/`, separate from authoritative knowledge; `unit.yml` holds state, records hold history | — | §4, §5, §7 |

Not an ADR: the escalation vocabulary, the CLI surface and the backlog lifecycle (they are specified here and live in the Registry and templates). The no-compatibility rule is added to `knowledge/architecture-principles.md` as principle 15 ("No Compatibility Layers": a superseded mechanism is deleted, not aliased) and cited by ADR-005.

### 16. Implementation language and placement

- The control layer is **zero-dependency Node** (`node:test` for tests; no `package.json` dependencies), under `core/control/`, extending the precedent of `planner.mjs` and `migrate-legacy.mjs`.
- Bash remains for thin system and bootstrap wrappers. The `underboss` entrypoint is a thin wrapper registered in the Registry.
- No operational state engine is built on `yaml.sh`.

### 17. Phases

| Phase | Content | Exit gate |
|---|---|---|
| 0 | ADR-004, ADR-005, ADR-006 written and accepted by the owner; principle 15 added; this Spec approved | ADRs `accepted`; Spec in `approved/` |
| 1 | One atomic change set: review and api-lifecycle removal, `legacy` kinds removal, deletion of the seven compatibility mechanisms, all renames of §13.2, entity-ref rewrite, supersede ADR-001..003, move of historical specs, boundaries and project generators corrected, backlog templates and validator, Spec template Acceptance criteria, lifecycle and vocabulary validators | integrity validator passes; final inventory (§13.3) clean; tests pass |
| 2 | Control core in Node: YAML subset module, unit and record schemas and validator, state machine, READY validation and fingerprint, Execution Context resolution, Escalation records | state-machine and validation tests pass |
| 3 | `underboss` CLI and projections; Registry entries; `.context/execution/` scaffolding | CLI tests pass; `attention` shows only open Escalations |
| 4 | Agent contract: agent entry metadata and role instructions; SOP binding | one scripted Execution Unit runs end to end |
| 5 | v2 → v3 migration script; operational validation on three fixture repositories: a Windows-style checkout, an Ubuntu-style checkout, two checkouts of one repository | migration idempotent; all three fixtures pass |
| 6 | completion report | all Acceptance criteria verified |

Implementation rule for every phase: extend an existing mechanism before creating one; the Registry stays the SSOT for structure and vocabulary lists; paths are resolved through the Registry, not hardcoded; if an architectural decision is needed that no ADR covers, stop and write the ADR.

## Affected files (predicted)

**Moved or renamed.** `runtime/**` → `core/**` (14 files: `registry.yaml`, `state-machine.yaml` → `installation-state-machine.yaml`, `lib/{api,components,detectors,generators,registry,state,yaml}.sh`, `contracts/consumer/{boundaries,project-layout}.yaml`, `contracts/runtime/{installation,migration,validation}.yaml` → `contracts/product/`); `documentation/validation/validate-runtime.sh` → `validate-integrity.sh`.

**Edited for vocabulary** (the former "runtime" words, paths, variables, entity refs):
- Agent entry and generated: `.context/{agent-entry.md,boundaries.yml,project.yml}`, `.github/workflows/docs-validate.yml`, `docs/architecture/README.md`.
- Top level: `README.md`, `README_RU.md`, `INSTALL.md`.
- `bootstrap/`: `bootstrap.sh`, `bootstrap.ps1`, `install.sh`, `DEPLOY-PROMPT.md`, `README.md`, `generators/{architecture-readme,boundaries,ci-workflow,claude-md,invariants,project-yml}.sh`, `templates/entity-catalog.md`.
- `documentation/`: `validation/validate-frontmatter.sh`, `schemas/frontmatter.schema.json`.
- `engine/`: `reality-engine/README.md`, `analyzers/{adr-drift,documentation-drift,spec-drift}.sh`, `collectors/{architecture-inventory,dependency-graph,entity-inventory,module-inventory}.sh`, `reporters/reality-report.sh`, `scripts/migrate-legacy.mjs`.
- `agents/`: `README.md` and all 13 role files in `claude-code/` (6) and `opencode/` (7); every role carries `entity_refs: [runtime-agentic-layer]`.
- `knowledge/`: `README.md`, `architecture-principles.md`, `audit-principles.md`, `capabilities.md`, `evidence-model.md`, `report-formats.md`.
- `sops/`: `README.md`, `audit.yaml`, `forensic-audit.yaml`, `forensic-layer-audit.yaml`, `incident.yaml`, `pipeline-topology-audit.yaml`, `planner.mjs`.
- `playbook/`: `playbook-v2.md`, `install-remote-prompt.md`, `migrate-legacy.md`.

**Edited for the spec lifecycle** (beyond the above): `documentation/validation/validate-frontmatter.sh`, `documentation/schemas/frontmatter.schema.json`, `engine/reality-engine/analyzers/{documentation-drift,spec-drift}.sh` (also fixes `draft` vs `drafts`), `engine/scripts/migrate-legacy.mjs`, `bootstrap/bootstrap.{sh,ps1}`, `bootstrap/generators/{architecture-readme,claude-md}.sh`, `core/registry.yaml`, `core/contracts/consumer/boundaries.yaml`, `sops/{architecture-review,new-feature,new-service}.yaml`, `agents/{claude-code,opencode}/documentation-reviewer.md`, `knowledge/architecture-principles.md`, `playbook/playbook-v2.md`, `playbook/install-remote-prompt.md`, `INSTALL.md`, `documentation/templates/spec.md` (Acceptance criteria), `documentation/templates/adr.md` (no `Status` section).

**Historical, status changed, body untouched.** `docs/adr/001-…`, `002-…`, `003-…` → `superseded`; `docs/specs/approved/2026-07-08-agentic-layer.md` and `2026-07-08-runtime-v1.2.md` → `docs/specs/implemented/`; `2026-07-09-architecture-study-layered-decomposition.md` → `docs/audits/` as `type: audit`.

**New.** `docs/adr/004-…`, `005-…`, `006-…`; `core/control/` (YAML subset module, state machine, validation, fingerprint, context resolution, records, CLI, tests); `core/bin/underboss`; `core/migrate/v2-to-v3.mjs`; `documentation/templates/backlog-{active,archive}.md` (replacing `backlog.md`); `documentation/validation/{validate-lifecycle,validate-backlog,validate-execution}` ; fixtures for tests.

## Open questions

Technical details only; none blocks approval.

- Exact grammar of the YAML subset (settled by the shared module and its tests).
- Whether the `reality:` block of `.context/project.yml` has any writer; if none, remove it in Phase 1.
- Exact hashing and canonicalization used for the READY fingerprint.

## Acceptance criteria

- **AC-001** The final inventory (§13.3) finds no former "runtime" vocabulary in the operational classes (§13.3), and no forbidden identifier there.
- **AC-002** `review` does not exist as a status, directory, enum value, validator branch, SOP step or documentation term in the Operational Model; `docs/specs/review/` is not created by bootstrap.
- **AC-003** The spec validator enforces path = status as an error and rejects transitions outside §3.3; approved, implemented and superseded Spec bodies and accepted ADR bodies are verified unchanged against the base ref.
- **AC-004** A Spec cannot enter `approved/` without Acceptance criteria that have `AC-NNN` ids; an Execution Unit never contains criteria text.
- **AC-005** No Decision, Project, Repository or Workspace artifact exists; `.context/decisions.yml` is gone from the playbook.
- **AC-006** Execution Unit transitions follow §4.3 exactly; every other transition is rejected; `BLOCKED` is reachable only from `EXECUTING` and `VERIFYING`; `DESIGN` plus an open Escalation is accepted.
- **AC-007** `start` always revalidates; a unit whose fingerprint differs is displayed `READY (stale)` and fails `start` with `READY → DESIGN`.
- **AC-008** `DONE` is rejected unless each criterion in scope has a verification record with `OBSERVED` or `EVIDENCED` evidence and the Reality checks pass.
- **AC-009** The nine Escalation kinds are defined once in the Registry and consumed by every other component; no other list of kinds exists.
- **AC-010** `unit.yml` and the records are consistent under the validator (§7); modifying a written record is detected; serialization is deterministic.
- **AC-011** `underboss attention` shows only open Escalations.
- **AC-012** The backlog validator passes on the new templates, fails on a completed item in `active.md` and on an open item in `archive.md`; `backlog archive` is idempotent.
- **AC-013** No compatibility or fallback mechanism of §14 remains; bootstrap on a missing Registry or an old layout fails with an explicit error and contains no code that names the old layout.
- **AC-014** The v2 → v3 migration is idempotent, performs only the listed transformations, and passes on the three fixture repositories.
- **AC-015** The control layer has no third-party dependencies and its tests run with `node --test`.
- **AC-016** The Execution Environment is resolved and recorded as `OBSERVED` evidence for the Windows-style, Ubuntu-style and two-checkout fixtures, and never written to `.context/project.yml`.

## Required tests and validators

New or changed validators: lifecycle (path-status, transitions, immutability, Acceptance criteria), backlog, execution state (unit/records consistency, record immutability), vocabulary (forbidden identifiers), integrity (renamed; Registry-driven entity resolution, no hardcoded ids), frontmatter (no warn-only path, no `review`, no `legacy` kinds, `api` statuses).

Tests (`node --test` with fixtures): YAML subset round trip and determinism; unit and record schemas (valid and invalid); state transitions (every legal and a table of illegal ones); READY validation success and each failing check; fingerprint sensitivity per input of §4.4 and insensitivity to a plain HEAD advance; Execution Context resolution; Context Sufficiency (sufficient, insufficient, contradictory); inferred evidence never overriding normative sources; Escalation open and resolve with the three-axis separation; `DESIGN` plus an open Escalation; `DONE` rejection on missing evidence; attention filtering; Registry vocabulary single-source; backlog archive idempotence; migration idempotence and every migration rule; the three environment fixtures; bootstrap failure on a missing Registry and on an old layout.

## Implementation instructions

You are implementing this Spec inside `akturt/underboss`. The repository is authoritative. This Spec is approved only when it sits in `docs/specs/approved/`; until then nothing here is an execution input.

- Follow §17 in order; do not start a phase before the previous exit gate passes.
- Do not add an entity, term, status or mechanism that this Spec does not name. Do not add compatibility, fallback, alias or "for the future" code.
- Registry is the SSOT for structure and vocabulary lists; do not hardcode paths it can resolve.
- Report in the completion report: files changed; ADRs added; states and transitions implemented; CLI commands; validators and tests; migration behavior; final inventory result; known limitations. Distinguish implemented, verified, deferred, blocked. Do not report a feature complete because its files exist.
- When this Spec is implemented it moves to `implemented/` with a filled `Result`, and becomes a historical record, outside the Operational Model.
