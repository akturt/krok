---
schema: 1
id: adr-005-v3-baseline-architecture
type: adr
status: accepted
date: 2026-10-04
owners: [underboss-team]

entity_refs: [agentic-layer]
tags: [adr, architecture, terminology, core, registry, no-compatibility]
supersedes: [adr-001-agentic-layer-separation, adr-002-runtime-v1.2-operating-platform, adr-003-runtime-architecture-v2]
depends_on: []
priority: P0
---

# ADR-005: v3 Baseline Architecture and Terminology

## Context

ADR-001, ADR-002 and ADR-003 established the architecture that still stands: the separation of the agentic layer, the Registry as single source of truth, the installation state machine, the contract split and the Reality Engine. Accepted ADR bodies are immutable, so the terminology of those ADRs cannot be corrected in place, and a single set of terms for the whole system needs one current ADR that states it.

Over time the platform also accumulated compatibility mechanisms: a degraded bootstrap mode, legacy-layout detection, a version compatibility matrix, a `role: human` alias, warn-only validation and legacy enum values. None is required by the architecture.

## Decision

The architecture of ADR-001, ADR-002 and ADR-003 is retained and restated here in a single vocabulary. Those ADRs are superseded and become historical records.

1. **Core** is the product's own machinery: Registry, Installation State Machine, contracts, Core SDK, bootstrap, Reality Engine. The **Documentation Module** provides templates, validators, knowledge, agents, SOPs and playbook. The **Control Plane** is the execution-control layer added in v3.
2. The **Registry** is the single source of truth for structure and vocabulary lists; paths are resolved through it.
3. The **Installation State Machine** has four states: `fresh`, `installed`, `partial`, `broken`.
4. The five agentic layers (Knowledge, Role, Capability, SOP, Artifact) and `gate: manual` for human steps are unchanged.
5. The integration namespace is functional, not product-bearing: `docs/.control/`, `CONTROL_ROOT`, `CONTROL_REGISTRY`, registry key `control:`. The `underboss` CLI keeps its name; a product rename is a separate change.
6. One vocabulary is used by code, Registry, contracts, validators, generators, CLI, Core SDK and active documentation: Core, Core SDK, Registry, Installation State Machine, Control Plane, Orchestrator, Agent Entry Metadata. The full list of names is in the v3 Spec §13.2.
7. **No compatibility layers** (architecture principle 15). Every compatibility and fallback mechanism listed in the v3 Spec §14 is deleted. A one-time migration script is not compatibility.

## Consequences

- A single atomic change set renames paths, variables, keys, entity refs and the validator; no alias is kept, so consumers migrate once and only from the immediately previous version.
- ADR-001, ADR-002 and ADR-003 keep their bodies and leave the Operational Model; their `status` becomes `superseded`.
- A missing Registry or an old layout is an explicit error, not a degraded mode.

## Related

- ADR-004 (spec lifecycle)
- ADR-006 (execution state persistence)
- Spec: docs/specs/approved/2026-10-04-underboss-v3-control-plane.md
