---
schema: 1
id: audit-semantic-reconciliation-v3-minimal-model
type: audit
status: completed
date: 2026-10-04
owners: [underboss-team]

scope: "Canonical semantic model of Underboss: existing model reconstructed from the repository, minimal conceptual model derived from it, v3 reconciled against it, owner decisions applied"
trigger: "Owner accepted the second reconciliation pass and fixed the open decisions (Decision as a human act, spec lifecycle without review, approved-spec immutability, escalation vocabulary, storage, complete removal of 'runtime', no backward compatibility)"

entity_refs: [schema-v1, agentic-layer]
touches: [docs]
docs: [docs/specs/drafts/2026-10-04-underboss-v3-control-plane.md, docs/audits/2026-10-04-semantic-reconciliation-v3.md, playbook/playbook-v2.md]
refs: []
depends_on: [audit-semantic-reconciliation-v3, adr-003-runtime-architecture-v2]
tags: [audit, terminology, semantics, v3, runtime, decision, adr, spec-lifecycle, review-removal, backlog, storage, no-compat]
priority: P0
---

# Audit: Canonical Semantic Model of Underboss

> Scope: existing model, minimal model, v3 reconciliation, owner decisions.
> Trigger: owner decisions after the second reconciliation pass.

This document rewrites the second-pass audit with the owner's decisions applied. It is the canonical statement of the model; `docs/specs/drafts/2026-10-04-underboss-v3-control-plane.md` is the change contract derived from it. Pass 1 (`2026-10-04-semantic-reconciliation-v3`) is the earlier exploratory record.

Rules applied: existing Underboss semantics first, v3 second; every concept must be needed by the actual model or it is removed; **no backward compatibility, no fallback, no alias, no legacy mode.** A one-time migration is not compatibility.

---

## 1. Canonical vocabulary

| Term | Existing meaning | Canonical meaning | Evidence | v3 action |
|---|---|---|---|---|
| ADR | one architectural decision + rationale; `proposed → accepted → deprecated \| superseded`; body immutable once `accepted` | unchanged; no `Status` section in the body | `playbook-v2.md` §3.2; principles 4, 6 | reference only |
| Spec | change contract; lifecycle by path | unchanged; gains `## Acceptance criteria` with `AC-NNN` ids | `documentation/templates/spec.md` | execution input when `approved` |
| Decision | no stored entity; three informal uses (ADR, `.context/decisions.yml` in the playbook only, inline `D-xx` tables) | **a human act, never a stored artifact** | §2 | removed as entity, kind, status, source, READY check, file |
| Architecture, Invariant | topology / domain / `INV-NNN` | unchanged | `docs/architecture/`, invariants template | constraints reference `INV-NNN` |
| Entity | (a) `entity_ref`: stable id of a named concept; (b) DDD Entity/Subject in the ontological audit | **(a)**; (b) stays inside the ontological-audit vocabulary | Entity Refs Workflow; `entity-inventory.sh` | used only as `entity_refs` |
| Capability | skill contract of an agent role | unchanged | `knowledge/capabilities.md`; `validate-runtime.sh:161-250` | **never** a generic word |
| Boundary | path ownership class (`pristine / editable / generated / secret`); also "responsibility boundary" (review criterion) | path ownership class; the other use is always qualified | `.context/boundaries.yml`; consumer contract | "boundary crossing" → **escalation trigger** |
| BC | not an Underboss concept (one phrase in the ontological-auditor source table) | **not an Underboss concept** | repository search | not introduced |
| SOP | declarative workflow; "not execution"; `gate: manual` | unchanged; `role: human` alias removed | `sops/README.md`; `planner.mjs` | bound to an Execution Unit by name + version |
| Reality / Reality Engine | project-state reconstruction and drift | unchanged | `engine/reality-engine/README.md` | sole source of actual state |
| Evidence | confirmation with class `OBSERVED / EVIDENCED / INFERRED / CLAIMED` and a 7-level trust hierarchy | unchanged | `knowledge/evidence-model.md` | records reuse it; no new model |
| Observation | atomic fact about a domain Subject (ontological audit) | unchanged: a domain fact | `ontological-auditor.md` Phase 4 | **not** used for the execution journal |
| Execution Record | none | immutable journal entry of one Execution Unit; facts inside are Evidence-classified | no per-execution journal exists | new, justified |
| Execution Unit | none | one bounded instance of carrying an approved Spec scope to a verified result | no instance-level state exists (`sops/README.md`: "Not execution — description") | new, the only new abstraction |
| Escalation | no entity; existing rules "pristine → STOP, ask human", `gate: manual`, "CLAIMED + OBSERVED → human review" | a concept expressed as two record types; status `open \| resolved` | §4.4 | kept without a separate entity |
| Context | `.context/` = agent entry metadata | Agent Entry Metadata; Execution Context is a computed projection | `agent-entry.md` | never stored |
| Project / Repository | `.context/project.yml` (`name`, `repository`) | logical concepts; `project.yml` is the single identity source | project-yml generator | no new entity or registry |
| Workspace | none | **not an entity**: execution-scoped environment metadata, resolved into the Execution Context and recorded as `OBSERVED` evidence | project.yml forbids absolute paths and OS values | no global entity |
| Backlog | template with `Active / In Progress / Done`, freeform ideas | `active.md` = open actionable work; `archive.md` = everything else | `documentation/templates/backlog.md` | new v3 convention |

---

## 2. ADR / Spec / Decision

```
ADR        = Why
Spec       = What + How + Scope + Acceptance
Execution  = Do it
Record     = What happened
Escalation = A human must decide or act
Reality    = What actually exists
SOP        = How a class of work is performed
```

**ADR** fixes one architectural decision and its rationale. It has the right to exist when topology, data model, invariants, the security model or an external dependency change ("ADR Before Code"). `proposed` = fully written, awaiting acceptance (there is no draft ADR); `accepted` = in force, body immutable, `date` = acceptance date; `deprecated` = obsolete, no replacement; `superseded` = replaced by an ADR carrying `supersedes`. It stays unchanged forever after implementation.

**Spec** fixes what is changed, within what scope, how, and how it is accepted. It ends in history (`implemented` or `superseded`).

`accepted` and `approved` stay distinct: they are different acts with different consumers. `accepted` freezes an architectural decision; `approved` authorizes a change contract for execution.

**Decision test.** Is there a human intent that no existing artifact can express?

| Candidate | Where it already lives |
|---|---|
| architectural choice | ADR |
| product, UX or scope choice | Spec (Goal, Scope) |
| authorization to start | moving the Spec to `approved/` |
| resolution of an Escalation | ADR, new Spec, or a resolution inside an Execution Record |
| operational parameters | fields of the Execution Unit |

None remains. **Verdict: Decision is a human act.** Removed: Decision entity, kind, status, "source decision", the READY check on it, and `.context/decisions.yml` (it duplicates `docs/adr/` frontmatter and is implemented nowhere). There is no Approval entity: approval is the path move.

Acceptance criteria belong to the Spec (a Spec cannot become `approved` without `AC-NNN` criteria); an Execution Unit references them and never copies them.

---

## 3. Capability / Boundary / Entity / BC

```
Entity      named concept referenced through entity_refs
Capability  agent-role skill contract (knowledge/capabilities.md)
Boundary    path ownership class
BC          not an Underboss concept
```

Existing relations: document → Entity (`entity_refs`, `touches`); Role → Capability (one-way, frontmatter `capabilities:`); SOP step → Role / Capability; agent → Boundary (`.context/boundaries.yml` read before any edit); Invariant → component. Nothing connects the four to each other and v3 does not invent a relation.

Rules for all new text: "capability" is never a synonym for a feature; "boundary" never means a limit of agent authority (that is an **escalation trigger**); "entity" appears only as `entity_refs`; Bounded Context is not introduced.

---

## 4. Execution model

### 4.1 Stored kinds

Two: **Execution Unit** and **Execution Record**. Removed from the earlier draft: Decision, Approval, Project, Repository, Workspace as entities, a separate Escalation entity, a scanner/finding/candidate subsystem parallel to the Reality Engine, Vibe Kanban, web UI, deployment targets.

### 4.2 Execution Unit and storage

```
.context/execution/<id>/unit.yml            current operational state
.context/execution/<id>/records/<seq>-<utc>-<type>.yml   immutable history
```

`.context/` is the existing home of machine-readable YAML for agents; `docs/` is authoritative human knowledge and its frontmatter `type` enum is closed, so execution state does not belong there. One consistency rule: the Core SDK writes the record first, then updates `unit.yml`; the validator fails on disagreement between `unit.yml.state` and the latest `transition` record, on a modified record, and on `seq` gaps. Format: a restricted YAML subset with one shared zero-dependency reader/writer in Node (extracted from the ad-hoc parser in `planner.mjs`), fixed key order for determinism.

### 4.3 Observation, Evidence, Execution Record

| Concept | Meaning |
|---|---|
| Observation | a domain fact about a Subject (consumer domain) |
| Evidence | confirmation of a fact with class and trust level (existing) |
| Execution Record | the journal of what happened in one execution (new) |

Three different things. A record contains facts and each carries existing Evidence classes; it references commit SHAs rather than copying diffs, because git is the existing change journal. No new Evidence model.

### 4.4 Escalation

A concept expressed as two record types, `escalation-opened` and `escalation-resolved`; status `open | resolved` (`acknowledged` removed, nothing derives from it). The attention projection is the set of open escalations.

One closed vocabulary, nine kinds, each checked against an existing mechanism:

| Kind | Existing mechanism |
|---|---|
| `protected-path` | `.context/boundaries.yml`; "pristine → STOP, ask human" |
| `invariant` | `INV-NNN` |
| `architecture` | "ADR Before Code"; architecture-reviewer triggers |
| `security` | `review-security-model`; secrets class |
| `public-contract` | `type: api`; contract anti-pattern review |
| `domain-semantics` | ontological audit; entity refs |
| `scope` | Spec `Scope` and `Open questions` |
| `manual-gate` | SOP `gate: manual` (explicit human gate only) |
| `context-gap` | Evidence Model; drift analyzers |

Not reintroduced: `product-behavior`, `external-dependency`, `irreversible-action` (no distinct existing mechanism; a human step is expressed by a SOP gate). Three axes are never mixed: `Escalation.kind`, `Escalation.status`, Execution Unit state. `DESIGN` plus an open Escalation is valid and is not `BLOCKED`.

### 4.5 States and READY

`DESIGN, READY, EXECUTING, VERIFYING, BLOCKED, DONE, CANCELLED`; `DONE` and `CANCELLED` terminal. `BLOCKED` means only that started execution cannot continue. `CANCELLED` is needed for the same reason `active.md` needs an exit: otherwise units rot in `DESIGN` or `BLOCKED`.

Transitions are exactly those of the owner's list plus **`VERIFYING → EXECUTING`** (accepted by the owner); `VERIFYING → DESIGN` does not exist. Without it a failed verification would force `BLOCKED`, which would make `BLOCKED` mean "rework needed" and break its definition.

Autonomy: `escalate_on` is a trigger, not an allowlist or denylist; default is all nine kinds; if an affected area has no explicit permission for autonomous decision the agent escalates, and autonomy is extended only by an explicit statement in an `approved` Spec.

`READY` is a validation snapshot (`validated_at`, `fingerprint`), never a permanent flag. `start` always revalidates (`READY → DESIGN` on failure). Inputs that decide validity: the Spec file and its path-status, referenced ADR statuses, referenced invariant text, `.context/boundaries.yml`, the unit definition including autonomy policy, and Reality drift matching the Spec. A plain HEAD advance does not invalidate; the environment is checked at start, not part of READY. Projections show `READY (stale)` when the recomputed fingerprint differs.

### 4.6 Context and authority

Normative sources (approved Specs, accepted ADRs, Architecture, invariants) say what should hold; Reality says what exists, with Evidence class. Normative vs Reality disagreement is drift (existing analyzers) and needs a human. Structural contradictions between normative sources are deterministic; semantic ones are not and go to a human. Inference never overrides a normative source. An authority-sensitive fact supported only by `INFERRED` or `CLAIMED` evidence is insufficient (`context-gap`).

### 4.7 Project, Repository, Environment

`.context/project.yml` is the identity source. Execution Environment (checkout, HEAD, host, OS, path, tools, agent platform) is discovered at validation and start, is part of the resolved Execution Context, and is recorded as `OBSERVED` evidence; it is never stored in `project.yml`. Cross-repository aggregation is out of scope.

---

## 5. Spec lifecycle

```
draft → approved → implemented
        approved → superseded
                   implemented → superseded
```

`review` is removed completely. Archaeology: no code requires it; validators check path = status and no transition at all; `docs/specs/review/` does not exist here; no consumer uses it. After migration the product does not know the word; a legacy `review/` directory is a one-time migration input mapped to `draft` (approval is a human act, never automatic).

| Question | Answer |
|---|---|
| `implemented` is historical? | yes |
| `implemented` is an execution input? | no; READY requires `approved/` |
| meaning of `approved` for execution | authoritative and not fully realized; a Spec stays `approved` while any scope is unexecuted |
| `implemented` becomes input again? | never; follow-up work is a new Spec that supersedes it |
| `implemented → superseded` | allowed |
| editing an `approved` body | not allowed; a new Spec supersedes it; frontmatter metadata is separate |
| abandoned `draft` | deleted |
| `api` documents | `active \| deprecated`; the documented lifecycle was never implemented and is removed |

Document lifecycle (a property of a file) and READY (a property of an Execution Unit) are different axes.

Files that carry `review` as lifecycle (19): `INSTALL.md`, both `documentation-reviewer.md`, `bootstrap.ps1`, `bootstrap.sh`, `generators/architecture-readme.sh`, `generators/claude-md.sh`, the schema, `validate-frontmatter.sh`, `migrate-legacy.mjs`, `architecture-principles.md`, `install-remote-prompt.md`, `playbook-v2.md`, `boundaries.yaml`, `registry.yaml`, `architecture-review.yaml`, `new-feature.yaml`, `new-service.yaml`, and the approved agentic-layer spec (historical after it moves to `implemented/`). Also `documentation-drift.sh` (status whitelist) and `docs/architecture/README.md` (generated text).

---

## 6. Removal of `runtime`

82 files and 1055 mentions in the repository before this audit (counts below are heuristic). Meanings found: product name, shipped product, infrastructure layer, directory, internal SDK, structure registry, installation state machine, product contracts, vendored mount path, integrity validator, SOP executor, `.context` caption, environment variable, entity id, consumer-domain term, historical text.

| Category | ≈ tokens |
|---|---|
| historical records (ADR-001/002/003, approved specs) | 249 |
| path `docs/.runtime/underboss` | 225 |
| documentation terminology | 221 |
| environment and shell variables | 124 |
| path `runtime/`, `contracts/runtime/` | 86 |
| script, file and id names | 35 |
| legacy-layout path `.context/runtime` | 33 |
| entity ref `runtime-agentic-layer` | 21 (26 files) |
| consumer-domain terms (untouched) | 7 |

Target vocabulary: `Underboss, Core, Core SDK, Registry, Installation State Machine, Control Plane, Orchestrator, Agent Entry Metadata`. Renames are in the spec §13.2; they are one atomic change set with no alias and no dual-read.

**Scopes (spec §13.3).** Three independent scopes, defined by what a file is and not by its directory: the **Operational Model** (the system in force after migration, including this model's Spec while draft or approved), the **Historical / Reconciliation Record** (audits, `implemented` and `superseded` Specs, `deprecated` and `superseded` ADRs, git history) and the **Migration Contract** (the one-time v2 → v3 transition, which may name the old system as the source state). The Operational Model knows nothing of the old system. The lexical policy is checked per class: the former vocabulary is forbidden in code, Registry, contracts, validators, generators, CLI/API and active operational documentation; allowed only as migration or historical vocabulary elsewhere. Accepted ADR bodies are immutable and ADR-001/002/003 contain the old words, so ADR-005 supersedes them and they become historical records. Never a violation: ordinary English "run time" and consumer-domain terms (`runtime-ownership-report`, the pipeline-archaeologist's runtime reality of a pipeline).

Compatibility and fallback mechanisms found and deleted (spec §14): degraded bootstrap mode; legacy-layout detection and migration; version compatibility matrix; `role: human` alias; `WARN_ONLY` and warn-only checks; tolerant status whitelist; `legacy` `kind` values (nothing produces them). `migrate-legacy.mjs` stays: it onboards foreign documentation.

---

## 7. Real contradictions found and their disposition

| # | Contradiction | Disposition |
|---|---|---|
| 1 | ADR template has a body `Status` section, but status transitions are frontmatter-only and bodies are immutable | section removed from the template |
| 2 | playbook requires every approved Spec to link an ADR; 0 of 3 approved Specs do; unchecked | rule kept only if enforced by the lifecycle validator, otherwise deleted from the playbook (implementation decides, spec §3) |
| 3 | playbook claims CI enforcement of path-status and of "no code without an approved Spec"; only a warning exists for the first, nothing for the second | path-status becomes an error; the second claim is deleted (READY replaces it) |
| 4 | `spec-drift.sh` compares `draft` with directory `drafts` (false positive for every draft) and checks only `depends_on` for superseded references | fixed in Phase 1 |
| 5 | all 3 approved Specs describe delivered or rejected work; one is a rejected study stored as an `approved` spec | two move to `implemented/`; the study becomes an audit |
| 6 | `api` lifecycle documented but never implemented | removed |
| 7 | generated `boundaries.yml` marks `/` and `/docs/` as `pristine`, uses `secrets` for `secret`, lacks `editable` | generator corrected (spec §7) |
| 8 | `project.yml` generated shape differs from the playbook; mixes metadata with a `reality:` state block | playbook aligned; block removed if no writer exists |
| 9 | entity resolution: documented against `docs/architecture/`; implemented as a 12-id hardcoded list plus any `id:` | hardcoded list removed; resolves against the entity catalog |
| 10 | ADR-002 lists an `updated` installation state that the state machine file lacks | resolved by ADR-005 (states: `fresh, installed, partial, broken`) |
| 11 | submodule mount name inconsistent (`bootstrap.ps1` and `migrate-legacy.mjs` use `naprolom-docs`) | moot after `docs/.control/` |
| 12 | encoding defects (arrows in `docs/architecture/README.md`, mixed-script comment in `project.yml`) | fixed with the generated files |

---

## 8. Owner decisions applied

| Former item | Resolution |
|---|---|
| Decision A or B | B: a human act, no artifact |
| Unit granularity | one Execution Unit per Spec scope; an optional subset of `AC-NNN` |
| State storage | `unit.yml` holds state; records hold history; consistency validator (not event sourcing) |
| Escalation list | nine kinds, `security` kept |
| `CANCELLED` | accepted |
| Approved-spec amendments | none; supersede |
| Data migration, `api` | two specs to `implemented/`, study to audit; `api` lifecycle removed |
| Names | `core/`, `core/contracts/product/`, `docs/.control/`, `CONTROL_ROOT`, `CONTROL_REGISTRY`, registry key `control:`, `validate-integrity.sh`; README tagline fixed in the spec |
| Implementation language | zero-dependency Node; bash only for thin wrappers |
| Scope of no-compat | all seven mechanisms |
| Cross-repository roll-up | out of scope |
| Order | rename before the control layer (spec §17) |

---

## 9. Concept diff: v2 → v3

| Area | v2 | v3 |
|---|---|---|
| Spec lifecycle | `draft, review, approved, implemented, superseded` | `draft, approved, implemented, superseded`; approved bodies immutable; Acceptance criteria required |
| `api` documents | five-state lifecycle documented, not implemented | `active \| deprecated` |
| Instance-level state | none | Execution Unit (7 states) with Execution Records |
| Human decisions during work | informal | Escalation records (9 kinds, 2 statuses) resolved into ADR, Spec or a record |
| Decision | informal, three meanings | a human act |
| Operational storage | none (only `project.yml` carrying a `reality:` block) | `.context/execution/` |
| Backlog | one freeform file | `active.md` and `archive.md` with a validator |
| Boundary | three meanings | path ownership only; "escalation trigger" for the rest |
| Vocabulary | "runtime" with sixteen meanings | Core, Core SDK, Registry, Installation State Machine, Control Plane, Orchestrator, Agent Entry Metadata |
| Layout | `runtime/`, `docs/.runtime/underboss/` | `core/`, `docs/.control/` |
| Installation states | `fresh, installed, partial, legacy, broken` | `fresh, installed, partial, broken` |
| Compatibility | matrix, degraded mode, alias, warn-only | none; one-time migration only |
| ADR set | ADR-001, ADR-002, ADR-003 | ADR-004 (lifecycle), ADR-005 (baseline, supersedes 001–003), ADR-006 (execution state) |

Net effect: removed — one Spec status, the `api` lifecycle, one installation state, seven compatibility mechanisms, one escalation status, the Decision, Project, Repository and Workspace entities, three informal meanings of "decision"; added — Execution Unit, Execution Record, `.context/execution/`, the backlog split.
