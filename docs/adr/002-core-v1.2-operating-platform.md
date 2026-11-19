---
schema: 1
id: adr-002-core-v1.2-operating-platform
type: adr
status: superseded
date: 2026-07-08
owners: [underboss-team]

entity_refs: [agentic-layer]
tags: [adr, core, v1.2, registry, state-machine, contracts, reality-engine]
depends_on: [adr-001-agentic-layer-separation]
priority: P0
---

# ADR-002: Core v1.2 — From Templates to Operating Platform

## Status

Accepted (2026-07-08)

## Context

Core v1.1 introduced the agentic layer separation (Knowledge/Role/Capability/SOP/Artifact). During real-world deployment on kordon.space (first consumer), architectural gaps were identified:

1. **No single source of truth.** Component lists (agents, knowledge, SOPs, templates) were duplicated across README, agents/README, sops/README, and bootstrap.sh. Adding a new component required updating 4+ files.
2. **Heuristic state detection.** Bootstrap used filesystem heuristics to determine installation state instead of explicit state machine.
3. **Mixed contract levels.** Core contracts (installation, migration) and consumer contracts (boundaries, project-layout) were not separated.
4. **SOP = implementation.** The reality-audit SOP was both the engine and the orchestration — no separation of concerns.
5. **No self-validation.** CI validated frontmatter but not the Core's own dependency graph.
6. **No versioning.** Core had no version field, no compatibility matrix, no migration paths.

## Decision

Introduce **6 architectural changes** to transform Core from documentation infrastructure to operating platform:

### 1. Registry as Primary Object

Create `core/registry.yaml` — single source of truth for all Core components. Every other component references the Registry, not the other way around. Dependency flow: Registry → Roles → Contracts → Validators → Bootstrap.

### 2. State Machine

Create `core/installation-state-machine.yaml` describing installation states (fresh, installed, updated, partial, legacy, broken) and transitions. Bootstrap reads this and determines state explicitly.

### 3. Contract Split

Split contracts into two levels:
- `core/contracts/product/` — installation, migration, validation, state-machine (what Core knows about itself)
- `core/contracts/consumer/` — boundaries, project-layout (what Core expects from consumer)

### 4. Reality Engine as Standalone

Extract `engine/reality-engine/` as standalone engine with collectors, analyzers, and reporters. The SOP `sops/reality-audit.yaml` uses this engine but is not the engine itself. Multiple SOPs can reuse the engine.

### 5. Self-Validation

Create `engine/validators/validate-integrity.sh` — checks Core's own integrity as complete dependency graph: Role→Capability, Capability→Knowledge, Knowledge exists, Registry consistency, Contract consistency, Bootstrap consistency, Workflow consistency, Template conformance, Internal links, Engine components.

### 6. Versioning and Compatibility Matrix

Registry declares version compatibility explicitly (schema version, consumer versions, bootstrap versions). On upgrade, bootstrap checks compatibility before proceeding.

## Consequences

### Positive
- Registry as SSOT eliminates duplicated component lists
- Bootstrap becomes universal loader (add component = update registry)
- Contracts split clarifies what Core owns vs what Consumer owns
- Reality Engine is reusable (multiple SOPs can use it)
- Self-validation catches entire dependency graph degradation
- Compatibility matrix prevents silent breakage on upgrades
- Versioning on every section simplifies future migrations

### Negative
- More files in Core (registry, split contracts, engine directory)
- Bootstrap slightly more complex (registry-driven instead of hardcoded)
- Need to maintain registry in sync with actual behavior

### Neutral
- Entity_ref errors from self-validation indicate missing entity documents (not bugs)
- Reality Engine scripts are stubs pending implementation
- Compatibility matrix is forward-looking (v1.2 → v1.3 migration paths not yet defined)
