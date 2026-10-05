---
schema: 1
id: entity-catalog
type: architecture
status: active
date: 2026-10-04
owners: [krok-team]

entity_refs: []
tags: [entity-catalog, concepts, architecture]
priority: P1
---

# Entity Catalog

Concept entities of Krok itself. `entity_refs` resolve against this catalog, the `id:` fields of documents and the Registry components. An entity is listed as `- **<id>**: description`.

## Concept Entities

- **agentic-layer**: separation of Knowledge, Role, Capability, SOP and Artifact (ADR-005)
- **agent-role-separation**: a Role is identity, not knowledge or process
- **sop-dag**: a SOP is a DAG of steps connected through artifacts and `gate: manual`
- **schema-v1**: Canonical Schema v1 frontmatter for every document under `docs/`
- **canonical-frontmatter**: the mandatory frontmatter fields and per-type extensions
- **lifecycle-spec**: Spec lifecycle `draft → approved → implemented | superseded` (ADR-004)
- **lifecycle-adr**: ADR lifecycle `proposed → accepted → deprecated | superseded`; accepted bodies are immutable
- **capabilities**: the catalog of skills a Role may declare (`knowledge/capabilities.md`)
- **core**: the product's own machinery: Registry, Installation State Machine, contracts, Core SDK, bootstrap, Reality Engine
- **registry**: the single source of truth for structure and vocabulary lists (`core/registry.yaml`)
- **installation-state-machine**: `fresh`, `installed`, `partial`, `broken` (`core/installation-state-machine.yaml`)
- **reality-engine**: collectors, analyzers and reporters that compare documentation with the repository
