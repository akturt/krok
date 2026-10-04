---
schema: 1
id: audit-semantic-reconciliation-v3
type: audit
status: completed
date: 2026-10-04
owners: [underboss-team]

scope: "Terminology and semantic archaeology of the existing Underboss model (v2.0.0) against the v3 control-runtime draft specification"
trigger: "Review of docs/specs/drafts/2026-10-04-underboss-v3-control-runtime.md revealed drifting terminology (Decision/ADR, Boundary, Observation, 'runtime') and gaps between the draft and the actual repository"

entity_refs: [schema-v1, agentic-layer]
touches: [docs]
docs: [docs/specs/drafts/2026-10-04-underboss-v3-control-runtime.md, playbook/playbook-v2.md]
refs: []
depends_on: [adr-003-runtime-architecture-v2]
tags: [audit, terminology, semantics, v3, runtime, decision, adr, spec-lifecycle, backlog]
priority: P0
---

# Audit: Semantic Reconciliation — Underboss v2 model vs v3 draft

> Scope: existing terminology, Decision/ADR/Spec, spec lifecycle, Entity/Capability/Boundary/BC, Execution Unit/Observation/Escalation, READY/context semantics, backlog, frontmatter/storage, inventory of the word "runtime".
> Trigger: v3 draft review; owner request to settle the semantic model before editing the spec.

Rule applied: **existing Underboss semantics first, v3 second.** No spec edits were made. Proposals below are proposals, not decisions; open decisions are listed in section 12.

Correction to the preceding spec review: a spec with `entity_refs: []` passes the JSON schema; `validate-frontmatter.sh` only emits a warning (check 6, always warn). The "min 1 ref for spec/audit" rule lives in the playbook and schema description, not in a hard check.

## 1. Existing authoritative terminology

| Term | Current meaning / where defined | Consumers | Conflict with v3 |
|---|---|---|---|
| **Decision** | No first-class entity. Three uses: (a) ADR; (b) `.context/decisions.yml`, an ADR index for agents, described only in playbook §1.3 (absent from registry, generators and this repo); (c) inline `D-xx` decision tables inside specs. | none in code | v3 adds a fourth meaning and a new record type |
| **ADR** | `type: adr`; `proposed → accepted → deprecated/superseded`; answers "Why"; body immutable after accepted (principle 6); `date` = acceptance date; `proposed` = fully written. Specs link via `implements` / `depends_on`. | validators, `review-adr`, `adr-drift.sh` | v3 Decision duplicates its role |
| **Spec** | `type: spec`; lifecycle derived from path (Path-Status Contract). Template: Goal / Scope Included+Excluded / Open questions. | validators, `spec-drift.sh`, `review-spec` | see section 3 |
| **Architecture** | `type: architecture`: topology, domain, invariants. `docs/architecture/README.md`, `invariants.md` (`INV-NNN`). | `architecture-reviewer`, collectors | consistent |
| **Entity** | Stable kebab-case ID of a domain entity of the **consumer project** (`entity_refs`, 1–10), catalogued in `docs/architecture`. Also DDD sense (Subject/Entity/Value Object) in `ontological-auditor`. | `validate-entity-refs`, `entity-inventory.sh` | v3 barely uses it; risk only via "entities" in recovery |
| **Capability** | Skill contract of an agent role: description/consumes/produces in `knowledge/capabilities.md`; Role→Capability reference is one-way (D-CP). | planner, `validate-runtime.sh` | v3 uses the word informally |
| **Boundary** | Three meanings: (1) file ownership pristine/editable/generated/secret (`.context/boundaries.yml`, `contracts/consumer/boundaries.yaml`); (2) module responsibility boundaries (`review-responsibility-boundaries`); (3) v3 "boundary crossing" as escalation reason. | agent-entry, reviewers | **triple collision** |
| **Invariant** | `INV-NNN` in `docs/architecture/invariants.md`; violation = architecture breakage. | reviewers, Reality | consistent |
| **SOP** | Declarative DAG, not execution; `gate: manual` for humans; `planner.mjs`. | planner | consistent |
| **Reality / Reality Engine** | State reconstruction and drift detection: collectors, analyzers, reporter, `REALITY-REPORT.md`; Evidence Model with 7 trust levels. | `reality-auditor`, agent-entry | consistent |
| **Context** | `.context/` = agent entry metadata (project.yml, boundaries.yml, agent-entry.md). README tagline also says "engineering context". | bootstrap | mild collision with Execution Context |
| **Observation** | Only in `ontological-auditor`: "Observation Contract" (which facts a Subject accumulates); also evidence class `OBSERVED`. | audit | **collision with v3 Observation** |
| **Escalation** | Once, in `incident.yaml`, as an inbound trigger. De facto rules exist: "pristine → STOP, ask human", `gate: manual`, "CLAIMED+OBSERVED → flag for human review". | — | new entity in v3, but sources exist |
| **Execution Unit, Workspace** | 0 mentions outside the v3 draft. | — | fully new |
| **Repository / Project** | `.context/project.yml`: `project.name`, `project.repository: <URL>`, `directories`; generator `project-yml`; required in registry. | bootstrap | **v3 Project duplicates project.yml** |
| **BC (Bounded Context)** | Not defined. One mention: the phrase "bounded contexts" in the source table of `ontological-auditor`. No machine-readable concept. | — | not used in the v3 draft; do not introduce |

## 2. Decision / ADR / Spec reconciliation

The existing chain is already `ADR (why) → approved spec (what + authorization) → implementation`. The "authorize work" decision is made by a human moving the spec to `approved/`. A v3 `Decision` must therefore justify itself by something this chain does not cover.

Not covered: **a human decision made during execution** (the resolution of an escalation). It may become an ADR, a spec amendment, or a purely operational choice with no document.

- **A. Decision as a separate stored entity.** Needs a new record kind (an ADR does not fit: architectural "why", immutable) and a strict scope: only decisions with no ADR/spec.
- **B. Decision as an act, not an entity.** Execution Unit source = approved spec (+ ADRs). Escalation resolution links to an ADR, a spec, or a supersede. No new type.

Recommendation: **B** (no place in the repo for A without a new document type). Owner's decision.

`approved` vs `accepted`: an objective difference exists. `accepted` triggers ADR immutability (fact in force); `approved` is authorization to implement. Do not unify automatically. Under B the question disappears.

## 3. Spec lifecycle reconciliation

`review` is referenced in: schema (`frontmatter.schema.json:107,114`), regex in `validate-frontmatter.sh:79` and `migrate-legacy.mjs:210`, directory creation in `bootstrap.sh/.ps1`, registry, `boundaries.yaml`, both `documentation-reviewer` agents, agentic-layer spec SOP trigger, playbook §4.2, principle 5, generated CLAUDE.md / architecture README, INSTALL.

Not present: any code requiring a pass through `review`; any transition validation (only path = status is checked, and a mismatch is a warning); a `docs/specs/review/` directory in this repo; the CI rule "PR with code but no approved spec fails" claimed by the playbook (not found in `ci-workflow.sh`).

Hypothesis confirmed: `draft → approved → implemented` and `approved → superseded` are already valid for the tooling.

Minimal change: do **not** remove `review` (breaks schema and consumers); mark it optional in playbook §4.2 and principle 5; do not mention it in v3; no new statuses or directories.

Semantics to record: `draft` = working, not authoritative; `approved/` = authoritative execution input; `implemented/` = implementation complete, historical record; `superseded/` = replaced.

Gaps: the playbook already uses the word "ready" ("approved = ready for implementation") — v3 READY must be explicitly distinguished. Whether `implemented → superseded` is allowed is undefined.

## 4. Entity / Capability / Boundary / BC reconciliation

```
Entity      = domain concept of the consumer project (ID in docs/architecture)
Capability  = agent role skill (contract in knowledge/capabilities.md)
Boundary    = path ownership class (.context/boundaries.yml)
BC          = not defined
```

No relations between these four exist in the repo apart from `entity_refs` / `touches` on documents. Proposal: do not introduce BC; keep "Boundary" for file ownership only; use "escalation trigger" for the v3 concept; avoid "capability" as an informal word in v3.

## 5. Execution Unit / Observation / Escalation reconciliation

- **Observation → rename** (term taken by "Observation Contract" and `OBSERVED`). Proposal: **Execution Record** (append-only).
- **One escalation vocabulary**, derived from what exists (pristine/secret, `INV-NNN`, "ADR before code", spec Excluded scope, `gate: manual`, CLAIMED+OBSERVED rule). Proposal:
  `protected-path`, `invariant`, `architecture`, `public-contract`, `domain-semantics`, `product-behavior`, `scope`, `security`, `external-dependency`, `irreversible-action`, `evidence-conflict`.
  The same values must serve `Escalation.kind`, `execution_policy.escalate_on`, READY failure, the attention queue and examples.
- **Three axes to separate:** reason (kind); Execution Unit state (DESIGN or BLOCKED); status of the human decision (open/acknowledged/resolved + link to result).
- **Project conflict.** The existing model is repository-local (`docs/`, `.context/` inside the consumer repo; `.context/project.yml` already holds `name` and `repository`). v3 asks "what projects exist", multiple workspaces and cross-repository status — no place for that exists today. Open: extend `project.yml`, and where a cross-repository aggregate lives.

## 6. READY / Context Sufficiency semantics

Precedent: the Reality report is a timestamped snapshot that is regenerated. READY fits the same pattern.

Proposal (not auto-selected): **READY = context was sufficient at the last validation point.** It stores `validated_at` and an input fingerprint (spec id/status/path, workspace HEAD, reality-report timestamp). `start` always revalidates.

```
DESIGN → READY            (gate passed)
READY  → DESIGN           (revalidation failed; Escalation if a human is needed)
READY  → EXECUTING        (only after successful revalidation)
EXECUTING/VERIFYING → BLOCKED
BLOCKED → EXECUTING       (resolution + revalidation)
BLOCKED → READY           only after revalidation; otherwise → DESIGN
```

- DESIGN: not yet ready to run. A failed gate does **not** make the unit BLOCKED; it stays DESIGN with an open Escalation.
- BLOCKED: only for work that has already started.
- Escalation: a reason requiring a human; not a unit state.

Gap: no terminal state for a cancelled/obsolete Execution Unit (source superseded, work no longer needed). Backlog lifecycle has CANCELLED/SUPERSEDED; Execution Unit does not.

### Authority and contradiction

An ordering exists but is the wrong one: the Evidence Model ranks reliability of evidence about the *current state*, where docs (level 4) rank below direct observation of code (level 2). A normative "what should be true" hierarchy is only implicit (ADRs immutable, invariants "do not change", source priority in `ontological-auditor`).

| Pair | Nature | Deterministic? | Outcome |
|---|---|---|---|
| authoritative vs reality | **drift**; already detected by `adr/spec/documentation-drift.sh` | yes | human decides |
| authoritative vs authoritative | artifact contradiction | structural only (broken refs, superseded) | semantic: human |
| authoritative vs recovered | authoritative wins as requirement; recovered stays a candidate | no | recovered never overwrites authoritative |
| recovered vs recovered | not a contradiction; low confidence | no | insufficient → escalation |

Deterministic part: references resolve, status = path, no references to superseded, `entity_refs` exist, invariants found. Semantic contradiction cannot be formally defined at this stage and goes to a human.

## 7. Backlog lifecycle gap

- Facts: `bootstrap.sh` creates an empty `docs/backlog/`; registry and `boundaries.yaml` say only "backlog items"; no backlog-specific validator found.
- Deeper semantic conflict: template and README describe backlog as "TODO, wishlist, ideas, open questions" (Active / In Progress / Done → Issue #N). v3 redefines `active.md` as "only currently actionable open work". Where ideas go is undefined.
- `archive.md` must carry `status` from `active|deprecated`; `deprecated` fits an archive file poorly.
- The reported recurring failure (agents do not remove completed items) concerns consumer projects; this repo has no backlog, so it could not be verified here.
- The spec must say "v3 introduces and enforces the active/archive lifecycle", not that it exists. Template change, format migration, fate of `Done`, and a validator belong in Phase 0 and Phase 7.

## 8. Frontmatter / storage model gap

The schema is closed (`additionalProperties: false`, closed `type` enum). Split by properties:
- Human-authored and authoritative → documents (ADR, spec). No new types needed.
- Mutable machine state and append-only journals (Execution Unit, Execution Record, Escalation) → **not documents**; do not extend the `type` enum.

The only existing home for machine-readable YAML outside `docs/` is `.context/` (project.yml, boundaries.yml, the planned decisions.yml). However `.context/` is described as a "local snapshot" and the registry knows three required files there. A new registry-declared location plus an ADR is needed. Placement is the owner's decision.

## 9. Inventory of "runtime"

82 files, 1055 mentions, **16 distinct meanings**:

1. Product name and tagline ("Documentation Runtime"), `runtime:` key in registry.
2. Shipped product: submodule `docs/.runtime/underboss`.
3. Runtime Core: infrastructure layer (`runtime/`, `bootstrap/`, `engine/`).
4. `runtime/` directory: registry + state-machine + contracts + lib.
5. "Runtime API": `runtime/lib/api.sh`, an internal bash SDK (ADR-003 itself calls it "internal SDK").
6. "Runtime Registry": `runtime/registry.yaml`, SSOT of the product's own structure.
7. "Runtime state machine": actually the **installation** state machine (fresh/installed/partial/legacy/broken).
8. `contracts/runtime/`: contracts about the product itself.
9. `docs/.runtime/`: `owner: runtime` in boundaries.
10. `validate-runtime.sh`: product integrity check.
11. "Runtime role" in SOP ("Human is not a Runtime role"): in fact the orchestrator.
12. `.context/ # runtime context`.
13. `RUNTIME_ROOT` (13 files).
14. Entity ref `runtime-agentic-layer` (26 files, stable ID).
15. `runtime-ownership` in `forensic-audit.yaml`: **domain** meaning (who owns behavior in a consumer system). Do not touch.
16. v3: "Engineering Control Runtime", draft filename and id.

Internal contradiction: ADR-002 lists an `updated` state; `state-machine.yaml` has none.

Constraint from the project's own rules: accepted ADR-002/003 and approved specs have immutable bodies. The word can only be retired by a **new ADR** superseding them; in historical documents `runtime` remains as legacy.

## 10. Proposed canonical vocabulary

Proposals only. The v3 spec title/id rename is safe: nothing else references the draft.

## 11. Terms to remove / rename (CURRENT → CANONICAL → ACTION)

| Current | Canonical (proposal) | Action |
|---|---|---|
| Underboss Runtime v2 | Underboss v2 | rename in new texts |
| "Documentation Runtime" (README tagline) | owner's choice (marketing) | decide wording |
| Runtime Core | Core | rename in new texts |
| Documentation Module | unchanged | keep |
| Runtime API (`api.sh`) | **Core SDK** | rename |
| Runtime Registry | **Registry** (as in ADR-003 "Registry as SSOT") | rename; file is a legacy path |
| runtime state machine | **Installation state machine** | rename; file is a legacy path |
| `contracts/runtime/` | core contracts (vs consumer contracts) | legacy path, new term |
| `validate-runtime.sh` | integrity validator | legacy path (consumers' CI) |
| "Runtime role" | **orchestrator** | rename |
| `.context/ # runtime context` | agent entry metadata | fix caption |
| registry key `runtime:` | `underboss:` | separate migration |
| `RUNTIME_ROOT` | `UNDERBOSS_ROOT` | separate migration |
| `docs/.runtime/` | installed Underboss (submodule) | legacy path |
| `runtime-agentic-layer` | `agentic-layer` | per ID rule: new ref + deprecate old, 26 files |
| `runtime-ownership` (SOP) | — | **do not touch** (domain term) |
| v3 title/id "control-runtime" | **Control Plane** (already used in spec §2, §12) | rename the draft |
| ADR-002/003 | — | keep; supersede with a new ADR |
| Observation (v3) | **Execution Record** | rename |
| Boundary (v3 "crossing") | **escalation trigger** | rename |
| Decision (v3) | see section 2, option B | owner's decision |

Renaming legacy paths breaks submodule paths, boundaries and consumers' CI; keep the path and record it as legacy terminology.

## 12. Remaining unresolved decisions

1. **Decision:** option A or B (B recommended).
2. **Project:** extend `.context/project.yml` or introduce a new entity; where the cross-repository aggregate lives.
3. **Storage** of Execution Unit / Execution Record / Escalation: new registry directory or `.context/`; ADR required.
4. **Backlog:** where ideas go; template and `archive.md` status.
5. **Spec lifecycle:** confirm "review optional, not removed"; whether `implemented → superseded` is allowed.
6. **Terminal state** for Execution Unit (cancelled/obsolete).
7. **Escalation vocabulary:** accept the proposed list or amend it.
8. **Scope of the `runtime` rename:** new code and texts only, or also migrate the registry key, `RUNTIME_ROOT` and `docs/.runtime/`; a new ADR is required.
9. **README tagline** "Documentation Runtime".
10. **`.context/decisions.yml`:** described in the playbook but implemented nowhere — remove from the playbook or implement.
