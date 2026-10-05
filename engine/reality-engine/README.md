---
schema: 1
id: reality-engine
type: guide
kind: index
status: active
date: 2026-07-08
owners: [krok-team]

entity_refs: [agentic-layer]
tags: [engine, reality-engine, collectors, analyzers, reporters]
priority: P1
---

# Reality Engine

Standalone engine for project state reconstruction and drift detection. The SOP `sops/reality-audit.yaml` uses this engine but is not the engine itself.

## Architecture

```
reality-engine/
├── collectors/          # Data collection scripts
│   ├── architecture-inventory.sh
│   ├── entity-inventory.sh
│   ├── module-inventory.sh
│   └── dependency-graph.sh
├── analyzers/           # Analysis scripts
│   ├── documentation-drift.sh
│   ├── adr-drift.sh
│   └── spec-drift.sh
└── reporters/           # Report generation
    └── reality-report.sh
```

## Usage

The engine is invoked by SOP steps, not directly by users:

```yaml
# In sops/reality-audit.yaml
engine: reality-engine
steps:
  - id: 1
    name: Architecture Inventory
    engine_step: collectors/architecture-inventory.sh
  - id: 2
    name: Entity Inventory
    engine_step: collectors/entity-inventory.sh
  # ...
```

## Collectors

| Script | Purpose | Output |
|--------|---------|--------|
| `architecture-inventory.sh` | Extract actual architecture from codebase | architecture-inventory.json |
| `entity-inventory.sh` | Map domain entities to code artifacts | entity-inventory.json |
| `module-inventory.sh` | Inventory modules and their dependencies | module-inventory.json |
| `dependency-graph.sh` | Build dependency graph from code | dependency-graph.json |

## Analyzers

| Script | Purpose | Input | Output |
|--------|---------|-------|--------|
| `documentation-drift.sh` | Compare docs against actual state | architecture-inventory.json | drift-report.json |
| `adr-drift.sh` | Check ADR compliance with reality | architecture-inventory.json, adrs/ | adr-drift.json |
| `spec-drift.sh` | Check spec compliance with reality | architecture-inventory.json, specs/ | spec-drift.json |

## Reporters

| Script | Purpose | Input | Output |
|--------|---------|-------|--------|
| `reality-report.sh` | Generate comprehensive state report | all analyzer outputs | reality-report.md |

## Integration

The engine is designed to be invoked by the Reality Auditor agent through SOPs. It is not a standalone tool — it requires context from the project's Krok installation (knowledge, contracts, boundaries).

See `sops/reality-audit.yaml` for the orchestration SOP.
