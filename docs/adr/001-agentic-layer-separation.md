---
schema: 1
id: adr-001-agentic-layer-separation
type: adr
status: superseded
date: 2026-07-08
updated: 2026-07-08
owners: [underboss-team]

entity_refs: [agentic-layer]
tags: [adr, agentic, layers, knowledge, roles, capabilities, artifacts, v1.1]
implements: [agentic-layer]
depends_on: []
supersedes: []
priority: P0
---

# ADR-001: Agentic Layer Separation

## Status

**Accepted** — 2026-07-08

## Context

Runtime v1.0 stored everything in monolithic agent prompts: role identity, knowledge, protocol, and output format in single 300-600 line files. This caused:
- 14 architectural principles, 5-stage validation, 7-stage forensic protocol baked into specific prompts — unreusable
- `forensic-orchestrator.md` was a workflow engine (DAG, retries, validators), not an agent
- Duplication across roles (same principles copied into each prompt)
- Blocked scaling to new models (Gemini/GPT/Kimi/Qwen) — each needed full copy

## Decision

Introduce **5 first-class entities** — Knowledge / Role / Capability / SOP / Artifact — replacing the former "role-everything" model:

| Entity | What it is | Where it lives |
|--------|-----------|----------------|
| **Knowledge** | What the agent knows (principles, protocols, formats) | `knowledge/` (5 files, loaded by short-id) |
| **Role** | Who the agent is (identity, permissions, refusal protocol) | `agents/{platform}/` (slim, ~100 lines each) |
| **Capability** | What the agent can do (review-spec, state-reconstruction, etc.) | Declared in Role FM `capabilities:`, catalog in `knowledge/capabilities.md` |
| **SOP** | When to use whom (DAG orchestration) | `sops/*.yaml` (declarative, with artifact contracts) |
| **Artifact** | What travels between steps (data flow) | Named in `consumes:`/`produces:` fields |

Key decisions:
- **No output templates** — merged into `knowledge/report-formats.md`
- **Capability Catalog** in `knowledge/capabilities.md` (not `agents/README.md`) — single source of truth
- **No `provided by:`** in catalog — unidirectional Role→Capability, declared in Role FM
- **`gate: manual`** instead of `role: human` — human is not a Runtime role
- **planner stays DAG-printer** — no executor (avoids small-Airflow syndrome)
- **`agents/` not renamed to `roles/`** — avoids breaking v1.0 contracts

## Consequences

### Positive
- Knowledge reusable across all roles (DRY)
- New roles only need slim identity + knowledge refs (faster to create)
- SOPs decoupled from specific roles (can swap reality-auditor → another model)
- Artifacts make data flow explicit (reviewable, testable)
- Capability-only SOP steps enable future agent resolution (v1.2)

### Negative
- Slightly more files to navigate (6 knowledge + 8 roles vs 4 roles)
- Planner needs capability resolution logic (~15 lines)
- Two-repo model (D-BR) changes bootstrap paths for v1.0 consumers

### Risks mitigated
- Knowledge drift (principles out of sync with code) → single source in `knowledge/`
- Role explosion (new role = full copy) → slim roles with shared knowledge
- SOP rigidity (hardcoded role names) → capability abstraction layer
