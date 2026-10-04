---
schema: 1
id: architecture-study-layered-decomposition
type: audit
status: completed
date: 2026-07-09
owners: [underboss]
entity_refs: [core, registry, installation-state-machine, capabilities]
---

# Architecture Study: Layered Decomposition of Underboss v1.3

## Status: REJECTED

This study evaluates whether Runtime v1.3 should be decomposed into a layered architecture (Runtime Core → Profile Loader → Knowledge Profile → Documentation Profile).

**Verdict: The decomposition is NOT justified.**

The proposed layers create abstraction that does not reduce complexity, introduces indirection that does not simplify coupling, and assumes a Knowledge/Documentation separation that does not exist in the codebase.

---

## 1. Current Architecture

### 1.1 What Exists (76 files, 11 directories)

```
underboss/
├── runtime/              # Infrastructure: registry, state machine, contracts (5 files)
├── bootstrap/            # Infrastructure: installer, loader, templates (5 files)
├── engine/               # Domain: validators, schemas, templates, reality-engine (13 files)
├── knowledge/            # Domain: agent prompt materials (6 files)
├── agents/               # Domain: role definitions × 2 platforms (9 files)
├── sops/                 # Domain: orchestration protocols (12 files)
├── playbook/             # Domain: human-facing guides (3 files)
├── docs/                 # Dogfood: this project's own docs (5 files)
├── .github/workflows/    # Infrastructure: CI guard (1 file)
└── README.md, INSTALL.md
```

### 1.2 Actual Dependency Graph

```
                    ┌─────────────┐
                    │   runtime/  │ (registry, state-machine, contracts)
                    └──────┬──────┘
                           │ read by
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────────┐
        │bootstrap/│ │  engine/ │ │    CI.yml    │
        │          │ │validators│ │              │
        └──────────┘ └──────────┘ └──────────────┘
              │            │
              │            │ reference
              ▼            ▼
        ┌──────────────────────────┐
        │        agents/           │
        │  (read knowledge/ by     │
        │   short-id in FM)        │
        └──────────┬───────────────┘
                   │ orchestrated by
                   ▼
        ┌──────────────────────────┐
        │         sops/            │
        │  (reference agents,      │
        │   capabilities, engine)  │
        └──────────────────────────┘
```

### 1.3 Key Architectural Boundaries

| Boundary | What It Separates | Enforced By |
|----------|-------------------|-------------|
| Submodule isolation | Consumer repo ≠ Runtime repo | git submodule, boundaries.yaml |
| Consumer exposure | Only `docs/` is editable by consumer | project-layout.yaml, CI |
| Agent↔Knowledge | Knowledge consumed only via short-id refs | FM `knowledge:` field |
| Validator↔Domain | Validators read contracts, not prose | validate-runtime.sh |
| Bootstrap↔Domain | Bootstrap creates structure, not content | bootstrap.sh scope |

---

## 2. Evaluating the Proposal

### 2.1 The Proposal

```
Runtime Core
        │
        ▼
Profile Loader
        │
        ├── Documentation Profile
        ├── Knowledge Profile
        └── Future Profiles
```

Runtime Core: bootstrap, registry, state machine, contracts, validation, project detection, stack detection, lifecycle.

Knowledge Profile: entities, notes, research, findings, references, decisions.

Documentation Profile: extends Knowledge with architecture, ADR, specifications, audits, runbooks, API docs.

### 2.2 The Fundamental Problem: Knowledge ≠ Generic Layer

The proposal assumes a layering:

```
Knowledge (generic) → Documentation (extends Knowledge)
```

This does not match the codebase.

**What `knowledge/` actually contains:**

| File | Purpose | Consumed By |
|------|---------|-------------|
| `architecture-principles.md` | 14 principles for architecture review | architecture-reviewer agent |
| `evidence-model.md` | Trust hierarchy + evidence classification | reality-auditor agent |
| `audit-principles.md` | 5-stage validation protocol | adversary-checker agent |
| `report-formats.md` | 4 report format specifications | all agents |
| `capabilities.md` | 12 capability contracts (input/output) | SOP orchestrator, agents |

These are **not** generic knowledge. They are **documentation-about-documentation** — procedural materials for agents that review, audit, and produce documentation. They are documentation domain materials, not a generic knowledge layer.

**The proposed "Knowledge Profile" contents (entities, notes, research, findings, references, decisions) do not exist anywhere in the codebase.** There is no `knowledge/entities.md`, no `knowledge/research/`, no `knowledge/findings/`. The proposal describes a system that does not exist.

### 2.3 What Actually Happens at Runtime

1. **Agent roles** (in `agents/`) reference `knowledge/` by short-id in their frontmatter
2. **SOPs** (in `sops/`) orchestrate agents in sequence
3. **Bootstrap** (in `bootstrap/`) creates the consumer's `docs/` directory structure
4. **Validators** (in `engine/`) check frontmatter and runtime consistency
5. **Templates** (in `engine/`) are copied by bootstrap to seed `docs/`

The flow is: bootstrap creates → agents produce → SOPs orchestrate → validators check.

There is no intermediate "Knowledge Profile" that sits between infrastructure and documentation. Knowledge is consumed directly by agents. Documentation is produced directly by agents. They are peers, not layers.

### 2.4 What Would Actually Move

If we forced the decomposition:

**Runtime Core** (would keep):
- `runtime/` — registry, state machine, contracts ✓
- `bootstrap/` — bootstrap.sh, install.sh ✓ (but bootstrap.sh already references engine/templates/)
- `engine/validators/` — but these validate documentation-specific frontmatter, not generic core
- `engine/schemas/` — but this is canonical frontmatter schema, documentation-specific
- CI workflow ✓

**Knowledge Profile** (would create):
- `knowledge/` — but these are agent prompt materials, not a "profile"
- No entities, notes, research, findings, references, decisions exist

**Documentation Profile** (would create):
- `engine/templates/` — but these are already in engine/
- `docs/` — but this is dogfood, not a "profile"
- `playbook/` — but this is human-facing guides, not a "profile"

The decomposition requires moving files into artificial groupings that do not reflect how they are actually used.

---

## 3. What the Decomposition Would Actually Cost

### 3.1 Indirection Without Simplification

Currently, bootstrap.sh knows about:
- `runtime/registry.yaml` (reads it)
- `engine/templates/*.md` (copies them)
- `engine/validators/validate-*.sh` (references in CI)
- `bootstrap/templates/entity-catalog.md` (copies it)

With a Profile Loader, bootstrap.sh would need to:
- Know about the Profile Loader API
- Discover templates through the loader
- Resolve which profile owns which template
- Handle profile-specific bootstrap logic

**Current: 4 direct references. Proposed: 4+ indirect references through a loader.** Net complexity increases.

### 3.2 Validator Changes

Currently, `validate-runtime.sh` checks the entire dependency graph in one pass: registry, agents, knowledge, capabilities, contracts, SOPs, templates, engine components.

With profiles, validators would need to:
- Know which profile owns which component
- Validate inter-profile dependencies separately
- Route validation through the Profile Loader
- Handle profile-specific contract schemas

**Current: 1 validator, 14 checks, 1 pass. Proposed: 3+ validators, 14+ checks, multiple passes.** Net complexity increases.

### 3.3 Agent Changes

Currently, agents reference knowledge by short-id:
```yaml
knowledge: [architecture-principles, report-formats]
```

The runtime resolves `knowledge: architecture-principles` → `knowledge/architecture-principles.md`.

With profiles, agents would need to:
- Know which profile owns each knowledge file
- Reference through the Profile Loader
- Handle profile-specific resolution

**Current: short-id → file. Proposed: short-id → profile → loader → file.** Net complexity increases.

### 3.4 SOP Changes

Currently, SOPs reference agents by role, capabilities by name, engine steps by script path.

With profiles, SOPs would need to:
- Know which profile owns each capability
- Route through the Profile Loader for capability resolution
- Handle profile-specific step execution

**Current: direct references. Proposed: mediated references.** Net complexity increases.

---

## 4. What Actually Reduces Complexity

### 4.1 The Real Architectural Boundary

The actual clean separation in the codebase is:

```
Infrastructure                    Domain
─────────────────                 ──────────────
runtime/                          engine/
bootstrap/                        knowledge/
CI workflow                       agents/
                                  sops/
                                  playbook/
```

Infrastructure knows about Domain (bootstrap reads registry, CI runs validators).
Domain does not know about Infrastructure (agents don't import bootstrap).

This is already a clean unidirectional dependency. Adding layers on top of it does not improve anything.

### 4.2 The Real Problem: bootstrap.sh Scope

The one component that mixes concerns is `bootstrap.sh` (638 lines). It:
- Detects project state (fresh/legacy/partial/installed)
- Detects stack (Node.js/Python/Go/Rust/Laravel/Docker)
- Creates directory structure (5-layer docs/)
- Creates .context/ stubs
- Generates CLAUDE.md snippet
- Creates CI workflow
- Auto-generates boundaries.yml from .gitignore
- Auto-generates architecture/README.md
- Handles auto-upgrade v1.1→v1.2

This is a legitimate candidate for decomposition — but NOT into Knowledge/Documentation profiles. Instead:

**Option A: Extract project detection into a separate script.**
- `bootstrap/detect-project.sh` — state detection, stack detection
- `bootstrap/bootstrap.sh` — orchestration only

**Option B: Extract CLAUDE.md generation.**
- `bootstrap/generate-claude-md.sh` — template rendering
- `bootstrap/bootstrap.sh` — orchestration only

These are straightforward extractions that reduce bootstrap.sh size without adding abstraction layers.

### 4.3 The Real Problem: engine/ Naming

The `engine/` directory mixes three concerns:
- **Validation**: validators, schemas
- **Templates**: document templates (6)
- **Reality Engine**: collectors, analyzers, reporters (8 stubs)

A cleaner separation would be:

```
engine/
├── validation/          # validators, schemas
├── templates/           # document templates
└── reality-engine/      # collectors, analyzers, reporters
```

This is a directory rename, not an architectural decomposition. It makes the existing structure clearer without adding abstraction.

---

## 5. Risk Assessment

### 5.1 Risks of Decomposition

| Risk | Severity | Mitigation |
|------|----------|------------|
| Indirection increases cognitive load | High | None — this is inherent to the pattern |
| Profile Loader becomes a god object | High | None — routing logic naturally centralizes |
| Validators split across profiles | Medium | Creates inconsistency in validation |
| Agents need profile-aware resolution | Medium | Breaks simple short-id contract |
| SOPs need profile-aware routing | Medium | Breaks direct reference model |
| Migration from v1.3 is complex | High | Requires consumer-side changes |
| Backward compatibility breaks | High | Submodule consumers would need updates |
| CI workflow needs profile-aware validation | Medium | Increases CI complexity |

### 5.2 Risks of NOT Decomposing

| Risk | Severity | Mitigation |
|------|----------|------------|
| bootstrap.sh grows beyond 638 lines | Low | Extract detection/generation scripts |
| engine/ naming is confusing | Low | Rename subdirectories |
| Adding new profiles (e.g., "API docs profile") requires touching Core | Low | Only if profiles actually emerge |
| Knowledge and Documentation become entangled | Low | They are already cleanly separated by consumer (agents) |

### 5.3 Risk Comparison

Decomposition introduces **8 new risks** (4 High, 4 Medium) to solve **2 low-severity risks** that have simpler solutions.

---

## 6. What to Do Instead

### 6.1 Immediate: Clarify engine/ Structure

Rename subdirectories to reflect actual concerns:

```
engine/
├── validation/
│   ├── validators/
│   ├── schemas/
│   └── contracts/       # move runtime/contracts/ here? No — contracts are infrastructure
├── templates/
└── reality-engine/
```

This is cosmetic but reduces confusion.

### 6.2 Medium-Term: Extract bootstrap.sh Helpers

Split bootstrap.sh into focused scripts:

```
bootstrap/
├── bootstrap.sh           # orchestration (reduced to ~200 lines)
├── detect-state.sh        # state detection logic
├── detect-stack.sh        # stack detection logic
├── generate-claude-md.sh  # CLAUDE.md template rendering
├── generate-boundaries.sh # boundaries.yml from .gitignore
├── bootstrap.ps1          # Windows mirror
├── install.sh             # one-liner installer
├── DEPLOY-PROMPT.md       # agent prompt
└── templates/
    └── entity-catalog.md
```

### 6.3 If Profiles Actually Emerge

If a genuine second profile appears (e.g., "API Documentation Profile" with OpenAPI specs, Swagger, gRPC definitions), THEN consider decomposition. But the decomposition should be:

```
runtime/
├── core/              # registry, state-machine, contracts
├── profiles/
│   └── documentation/
│       ├── knowledge/     # agent prompt materials
│       ├── templates/     # document templates
│       ├── validation/    # frontmatter validators
│       └── reality-engine/
└── bootstrap/
```

Not Core → Profile Loader → Documentation → Knowledge, but Core → Profiles → Documentation (which contains Knowledge).

---

## 7. Decision

**REJECT the layered decomposition.**

Rationale:
1. Knowledge is not a generic layer — it is documentation-about-documentation
2. The proposed Knowledge Profile contents do not exist in the codebase
3. The decomposition adds indirection without reducing complexity
4. Bootstrap.sh and engine/ naming issues have simpler solutions
5. The actual architectural boundary (infrastructure/domain) is already clean

**ACCEPT targeted refactoring:**
1. Extract bootstrap.sh helpers (detect-state.sh, detect-stack.sh, etc.)
2. Clarify engine/ subdirectory structure
3. Wait for a genuine second profile before considering profile abstraction

---

## 8. Appendix: Full File Inventory

### Runtime Infrastructure (11 files)
- `runtime/registry.yaml` — SSOT, 80 lines
- `runtime/state-machine.yaml` — 6 states, 38 lines
- `runtime/contracts/runtime/installation.yaml` — bootstrap contract
- `runtime/contracts/runtime/migration.yaml` — version transitions
- `runtime/contracts/runtime/validation.yaml` — validator contracts
- `runtime/contracts/consumer/boundaries.yaml` — editable boundaries
- `runtime/contracts/consumer/project-layout.yaml` — expected layout
- `.github/workflows/docs-validate.yml` — CI guard
- `bootstrap/bootstrap.sh` — universal loader, 638 lines
- `bootstrap/bootstrap.ps1` — Windows mirror, 212 lines
- `bootstrap/install.sh` — one-liner, 71 lines

### Domain: Engine (13 files)
- `engine/validators/validate-frontmatter.sh` — 128 lines
- `engine/validators/validate-runtime.sh` — 334 lines
- `engine/schemas/frontmatter.schema.json` — 181 lines
- `engine/scripts/migrate-legacy.mjs` — 358 lines
- `engine/templates/{adr,spec,audit,architecture,runbook,backlog}.md` — 6 templates
- `engine/reality-engine/collectors/{architecture,entity,module,dependency}-inventory.sh` — 4 stubs
- `engine/reality-engine/analyzers/{documentation,adr,spec}-drift.sh` — 3 stubs
- `engine/reality-engine/reporters/reality-report.sh` — 1 stub

### Domain: Knowledge (6 files)
- `knowledge/README.md` — usage guide
- `knowledge/architecture-principles.md` — 14 principles
- `knowledge/evidence-model.md` — trust hierarchy
- `knowledge/audit-principles.md` — validation protocol
- `knowledge/report-formats.md` — 4 formats
- `knowledge/capabilities.md` — 12 capabilities

### Domain: Agents (9 files)
- `agents/README.md` — overview
- `agents/claude-code/{architecture,documentation}-reviewer.md, reality-auditor.md, adversary-checker.md`
- `agents/opencode/{same 4 roles}`

### Domain: SOPs (12 files)
- `sops/README.md` — overview
- `sops/planner.mjs` — DAG printer
- `sops/{architecture-review,forensic-audit,reality-audit,new-feature,bugfix,new-service,architecture-change,audit,release,incident}.yaml`

### Domain: Playbook (3 files)
- `playbook/playbook-v2.md` — 1162 lines
- `playbook/migrate-legacy.md` — 285 lines
- `playbook/install-remote-prompt.md` — 517 lines

### Dogfood (5 files)
- `README.md`, `INSTALL.md`
- `docs/adr/001-*.md`, `docs/adr/002-*.md`
- `docs/specs/approved/2026-07-08-agentic-layer.md`
- `docs/specs/approved/2026-07-08-runtime-v1.2.md`
- `docs/audits/2026-07-07-documentation-transformation-kordon.md`
