---
schema: 1
id: agents-readme
type: guide
kind: index
status: active
date: 2026-07-08
updated: 2026-11-10
owners: [krok-team]

entity_refs: [agentic-layer]
touches: []
docs: [../README.md, ../INSTALL.md, ../playbook/playbook-v2.md]
refs: []
depends_on: []
tags: [agents, roles, index, v1.9, capabilities, knowledge]
priority: P1
---

# agents/ — Repository of AI agent roles

Krok contains 8 roles (the opencode platform also has the Ontological Auditor), each a ready-to-use prompt configuration for a specific platform (Claude Code, opencode).

## Roles

| Role | Purpose | Capabilities | Platforms |
|------|---------|--------------|-----------|
| **Architecture Reviewer** | Reviews architectural changes against real project state | `review-spec`, `review-adr`, `review-domain-model`, `review-security-model` | claude-code, opencode |
| **Documentation Reviewer** | Validates Schema v1 compliance, entity_refs, path-status contract | `validate-frontmatter`, `validate-entity-refs` | claude-code, opencode |
| **Reality Auditor** | Reconstructs current project state from code, config, docs (read-only) | `state-reconstruction`, `drift-analysis`, `architecture-extraction`, `attribution-analysis` | claude-code, opencode |
| **Adversary Checker** | Validates architectural claims against evidence, assigns verdicts + confidence | `claim-validation`, `assumption-analysis` | claude-code, opencode |
| **Forensic Auditor** | End-to-end forensic audit of one layer/section — single self-contained executor (replaces the phantom-subagent forensic-orchestrator) | `forensic-layer-audit`, `state-reconstruction`, `drift-analysis`, `architecture-extraction`, `manifest-design`, `target-model-design`, `claim-validation` | claude-code, opencode |
| **Frontend Contract Auditor** | Independent read-only check of UI changes against the contracts the project itself declares (components, string catalog, navigation, accessibility, naming). Born in a consumer project, generalized for Krok | `review-frontend-contracts` | claude-code, opencode |
| **Ontological Auditor** | End-to-end ontological audit of a subject domain (concepts, Subject Test, DDD classification, Observation Contract, Freeze Gate) | `ontological-audit`, `subject-classification`, `ddd-classification`, `observation-contract`, `hypothesis-validation`, `freeze-gate` | opencode |
| **Pipeline Archaeologist** | Reconstructs the runtime reality of a multi-hop data pipeline through 3 progressive layers (Execution/Structural/Content Topology) before any coverage matrix is built — single self-contained executor. Proposed from real-world use on Kordon's FSA ingestion pipeline (2026-08-03/04) | `pipeline-topology-audit`, `state-reconstruction`, `drift-analysis`, `architecture-extraction` | claude-code, opencode |

## Capabilities

Each role declares `capabilities:` in frontmatter (unidirectional Role→Capability). The **Capability Catalog** (`knowledge/capabilities.md`) contains the full contract per capability (description, consumes, produces) — without `provided by:` (D-CP).

| Capability | Consumes | Produces |
|------------|----------|----------|
| `review-spec` | spec, reality-report | architecture-findings |
| `review-adr` | adr | architecture-findings |
| `review-domain-model` | domain-model, reality-report | architecture-findings |
| `review-security-model` | security-model, reality-report | architecture-findings |
| `validate-frontmatter` | changed-files | documentation-report |
| `validate-entity-refs` | changed-files | documentation-report |
| `state-reconstruction` | subject-document | reality-report |
| `drift-analysis` | reality-report | reality-report |
| `architecture-extraction` | reality-report | reality-report |
| `attribution-analysis` | signal-inventory, control-objects-matrix | attribution-analysis |
| `claim-validation` | architecture-findings | validated-findings |
| `assumption-analysis` | architecture-findings | validated-findings |
| `forensic-layer-audit` | subject-layer (parameterized scope) | forensic-report, manifest-skeleton, migration-sketch, invariant-test-skeletons, terminology-inventory |
| `manifest-design` | drift-inventory, target-model | manifest-skeleton |
| `target-model-design` | drift-inventory, reality-report | target-model, invariants |
| `pipeline-topology-audit` | subject-pipeline (parameterized scope) | execution-topology-report, structural-topology-report, content-topology-report, coverage-matrix |
| `review-frontend-contracts` | changed-files, project-contracts | frontend-findings |

Full contracts: `knowledge/capabilities.md`

## Knowledge Refs

Each role declares `knowledge:` in frontmatter as **short-id list** (D-KR):

```yaml
knowledge: [architecture-principles, report-formats]
```

Krok resolves `knowledge/<short-id>.md`. Roles never hardcode knowledge paths — they reference by short-id.

| Role | Knowledge refs |
|------|---------------|
| architecture-reviewer | `architecture-principles`, `report-formats` |
| documentation-reviewer | `report-formats` |
| reality-auditor | `evidence-model`, `report-formats` |
| adversary-checker | `audit-principles`, `report-formats` |
| forensic-auditor | `evidence-model`, `audit-principles`, `report-formats` |
| pipeline-archaeologist | `evidence-model`, `audit-principles`, `report-formats` |
| frontend-contract-auditor | `report-formats` |

## Layout

```
agents/
├── README.md          ← this file
├── claude-code/       ← Claude Code configs
│   ├── architecture-reviewer.md
│   ├── documentation-reviewer.md
│   ├── reality-auditor.md
│   ├── adversary-checker.md
│   ├── forensic-auditor.md
│   ├── frontend-contract-auditor.md
│   └── pipeline-archaeologist.md
└── opencode/          ← opencode configs
    ├── architecture-reviewer.md
    ├── documentation-reviewer.md
    ├── reality-auditor.md
    ├── adversary-checker.md
    ├── forensic-auditor.md
    ├── frontend-contract-auditor.md
    ├── ontological-auditor.md
    └── pipeline-archaeologist.md
```

## Registration

Claude Code registers a sub-agent from a file in `.claude/agents/` by two frontmatter fields: **`name`** (equal to the file name without `.md`) and **`description`** (what the agent does and when to call it; this is the field the delegation decision reads). `tools:` is optional; without it the agent inherits every tool, including Edit and Write. Without `name` and `description` the file is a document, not an agent: `Agent(subagent_type: "<role>")` answers `Agent type '<role>' not found`.

- Claude Code reads the agent files when a **session starts**. After copying or changing a role, start a new session; a running session does not pick it up.
- The file must start with `---` as its first bytes. A BOM before it hides the frontmatter.
- `validate-integrity.sh` checks all of this for `agents/claude-code/*.md` (name equals the file name, non-empty description, no BOM) and checks that every agent file is listed in `core/registry.yaml` `components.agents` and the other way round.
- opencode registers by the file name and reads `description`, `mode` and `permission` from the frontmatter.

Tool restrictions of the roles: `reality-auditor`, `architecture-reviewer` and `frontend-contract-auditor` are read-only (`tools: Read, Grep, Glob, Bash`); `adversary-checker` validates claims without commands (`tools: Read, Grep, Glob, WebFetch`). `documentation-reviewer` (opt-in rewrite protocol), `forensic-auditor` and `pipeline-archaeologist` (write their audit reports) have no `tools:` and keep every tool.

## Installing into a consumer

Role files are ready-to-use agent descriptors. Copy them from the submodule into your platform's configuration directory:

- **Claude Code**: `cp docs/.control/agents/claude-code/<role>.md .claude/agents/<role>.md`
- **opencode**: `cp docs/.control/agents/opencode/<role>.md .opencode/agents/<role>.md`

Copy the bytes unchanged: use `cp` or `Copy-Item`. Do **not** pipe a role through PowerShell `Out-File`, `Set-Content` or `>` in Windows PowerShell 5.1: they write a UTF-8 BOM and the agent stops registering. Then start a new session and check that `<role>` appears among the available agent types. After raising the submodule, copy the changed roles again; the copy in `.claude/agents/` does not update itself. Krok has no install command for agents; the copy is a manual step.

Or use the Krok section that bootstrap puts into `CLAUDE.md` (see `INSTALL.md`).

## Contributing a project-born agent

An agent created in a project and useful beyond it is moved into Krok, so that every project and every AI agent can use it. Procedure, one PR in `krok`:

1. **Generalize**: remove names of the project, its documents and invariants. Replace project rules with "apply the rules the project declares in its own documents".
2. **Registration fields**: `name` (= file name), `description`, and `tools:` if the role must not write.
3. **Krok fields**: `schema: 1`, `id: agent-claude-code-<role>`, `type: prompt`, `status: active`, `date`, `owners: [krok-team]`, `entity_refs: [agentic-layer]`, `capabilities`, `knowledge`, `tags`.
4. **Capability**: add a section to `knowledge/capabilities.md` (Description, Consumes, Produces) unless it exists.
5. **Registry**: add the role to `core/registry.yaml` `components.agents`.
6. **Mirror**: the opencode file with the same content and the opencode descriptor (`description`, `mode: subagent`, `permission`).
7. **Table and layout** in this file; run `validate-integrity.sh` and the tests.
8. In the project, replace the local copy with the one from Krok after the submodule is raised.

## Usage via SOP

Roles are invoked **by name** from declarative SOPs (`../sops/*.yaml`). Each YAML references a role via `role: <name>` or `capability: <name>` + `role: <name>`. The planner prints a DAG listing roles and artifacts.

Human steps are marked with `gate: manual` (D-HG). A human is not an agent role.

## Extending

For custom roles (e.g., `tf-reviewer.md`), create them in your consumer repo under `.claude/agents/` or `.opencode/agents/`. Once a role becomes generally useful, propose it to `krok` via a PR.
