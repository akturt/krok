---
schema: 1
id: knowledge-index
type: guide
kind: index
status: active
date: 2026-07-08
owners: [underboss-team]

entity_refs: [agentic-layer]
tags: [knowledge, index, reference]
priority: P1
---

# Knowledge Layer

Knowledge used by Roles. Loaded into context by **short-id** from the Role FM:

```yaml
knowledge: [architecture-principles, report-formats]
```

Underboss resolves the path: `knowledge/<short-id>.md`. This allows restructuring `knowledge/` without rewriting Roles.

## Contained

| Short-id | File | Description |
|----------|------|-------------|
| `architecture-principles` | `architecture-principles.md` | 14 principles + 3 meta-patterns of analysis |
| `evidence-model` | `evidence-model.md` | Trust Hierarchy (7 levels) + 4 evidence classes |
| `audit-principles` | `audit-principles.md` | 5-stage validation + verdict system + confidence model |
| `report-formats` | `report-formats.md` | Output formats of the 4 reviewers |
| `capabilities` | `capabilities.md` | Capability Catalog — capability contract |

## How Roles use it

- **architecture-reviewer** → `architecture-principles`, `report-formats`
- **documentation-reviewer** → `report-formats`
- **reality-auditor** → `evidence-model`, `report-formats`
- **adversary-checker** → `audit-principles`, `report-formats`

## Rules

1. Knowledge is **not executed** — it is loaded into context as reference material.
2. Roles **do not duplicate** knowledge content inline — they reference it by short-id.
3. SOP steps **do not read** knowledge directly — that is the Role's responsibility when executing the step.
4. New knowledge files are added via PR with `type: guide, kind: index`.
