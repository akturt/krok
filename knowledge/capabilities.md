---
schema: 1
id: knowledge-capabilities
type: guide
kind: index
status: active
date: 2026-07-08
owners: [krok-team]

entity_refs: [agentic-layer]
tags: [knowledge, capabilities, catalog, contract]
priority: P1
---

# Capability Catalog

Capability contract. Contains **only the Contract** (description / consumes / produces / artifacts), **without `provided by:`** (D-CP — a one-way Role→Capability reference in the Role FM).

## review-spec
Description: Architecture review of specification documents against real project state.
Consumes: spec (artifact), reality-report (artifact)
Produces: architecture-findings (artifact)

## review-adr
Description: Review of Architecture Decision Records for lifecycle compliance and body immutability.
Consumes: adr (artifact)
Produces: architecture-findings (artifact)

## review-domain-model
Description: Review of domain model for consistency, drift, and architectural fitness.
Consumes: domain-model (artifact), reality-report (artifact)
Produces: architecture-findings (artifact)

## review-security-model
Description: Review of security model (RBAC, authn, authz) for drift and compliance.
Consumes: security-model (artifact), reality-report (artifact)
Produces: architecture-findings (artifact)

## review-responsibility-boundaries
Description: Verify responsibility boundaries — no duplication of authority, no god-object forming, each decision has exactly one owner.
Consumes: subject-document (artifact)
Produces: architecture-findings (artifact)

## review-layering
Description: Verify layered architecture — downward-only dependencies, no skip-level imports, no infrastructure leak into domain model.
Consumes: subject-document (artifact)
Produces: architecture-findings (artifact)

## review-contract-antipatterns
Description: Verify contract types for God-DTO anti-patterns — no transport/domain field mixing, no linear field growth, single producer per field.
Consumes: subject-document (artifact)
Produces: architecture-findings (artifact)

## validate-frontmatter
Description: Schema v1 frontmatter validation across all docs/**/*.md files.
Consumes: changed-files (artifact)
Produces: documentation-report (artifact)

## validate-entity-refs
Description: Entity reference integrity check — entity_refs exist in docs/architecture/.
Consumes: changed-files (artifact)
Produces: documentation-report (artifact)

## state-reconstruction
Description: Reconstruct current project state from code, config, and docs. Read-only investigation.
Consumes: subject-document (artifact)
Produces: reality-report (artifact)

## drift-analysis
Description: Compare documented state against actual code/config state to find discrepancies.
Consumes: reality-report (artifact)
Produces: reality-report (artifact)

## architecture-extraction
Description: Extract actual architecture (modules, dependencies, ownership) from codebase.
Consumes: reality-report (artifact)
Produces: reality-report (artifact)

## attribution-analysis
Description: Trace signals to their sources, determine attribution confidence.
Consumes: signal-inventory (artifact), control-objects-matrix (artifact)
Produces: attribution-analysis (artifact)

## claim-validation
Description: Validate architectural claims against evidence. Assign verdicts and confidence levels.
Consumes: architecture-findings (artifact)
Produces: validated-findings (artifact)

## assumption-analysis
Description: Identify and challenge implicit assumptions in architectural proposals.
Consumes: architecture-findings (artifact)
Produces: validated-findings (artifact)

## forensic-layer-audit
Description: End-to-end forensic audit of one layer/section/subsystem — As-Is mapping, drift/God-Object detection, To-Be target model, manifest SSOT, migration sketch, invariant tests, legacy terminology inventory, deploy runbook. Single self-contained executor, layer-agnostic.
Consumes: subject-layer (parameterized scope: project_path, layer, target_section, hint)
Produces: forensic-report (artifact), manifest-skeleton (artifact), migration-sketch (artifact), invariant-test-skeletons (artifact), terminology-inventory (artifact)

## manifest-design
Description: Author a single-source-of-truth manifest module (Python or language-appropriate) seeding the target model — reduced from the drift inventory, never a mirror of production.
Consumes: drift-inventory (artifact), target-model (artifact)
Produces: manifest-skeleton (artifact)

## target-model-design
Description: Design a normalized target model dissolving the God-Object — invariants (INV-<LAYER>-N), normalized entities with multi-level unique identity, orthogonal axes, backward-compat strategy, package roadmap.
Consumes: drift-inventory (artifact), reality-report (artifact)
Produces: target-model (artifact), invariants (artifact)

## ontological-audit
Description: Domain-agnostic ontological audit of a subject domain — concept extraction, 5-criteria Subject Test, DDD classification, Observation Contract verification, hypothesis validation, Freeze Gate recommendation. Single self-contained executor.
Consumes: subject-domain (parameterized scope: project_path, domain, target_section, hint)
Produces: ontological-audit-report (artifact), subject-manifest (artifact), observation-contract (artifact)

## subject-classification
Description: Classify domain concepts against 5-criteria Subject Test (Domain, Identity, Lifecycle, Observation, User Scenarios). Determines Subject vs non-Subject.
Consumes: concept-inventory (artifact)
Produces: subject-manifest (artifact)

## ddd-classification
Description: Classify non-Subject concepts as Value Object / Child Entity / Relationship / Historical Snapshot per DDD patterns.
Consumes: concept-inventory (artifact), subject-manifest (artifact)
Produces: ddd-classification-map (artifact)

## observation-contract
Description: Verify or design Observation Contract ensuring the Observation model can capture all facts about all Subjects in the domain.
Consumes: subject-manifest (artifact), domain-sources (artifact)
Produces: observation-contract (artifact)

## hypothesis-validation
Description: Formulate and verify key hypotheses about the domain ontology — completeness, correctness, and consistency.
Consumes: ontological-audit-report (artifact), subject-manifest (artifact)
Produces: validated-hypotheses (artifact)

## freeze-gate
Description: Determine if the domain ontology is stable enough to proceed — assess confidence, coverage, and remaining risks.
Consumes: ontological-audit-report (artifact), validated-hypotheses (artifact)
Produces: freeze-gate-decision (artifact)

## pipeline-topology-audit
Description: 3-layer progressive forensic reconstruction of a multi-hop data pipeline's runtime reality — Execution Topology (dispatch/orchestration model), Structural Topology (exhaustive node inventory with producer/consumer/ownership/orphan/bypass analysis), Content Topology (per-node payload composition using real captured data, sourcing-tiered confidence) — culminating in a per-node Coverage Matrix. Single self-contained executor, pipeline-agnostic. Exists to prevent coverage/migration plans from being built on code presence alone.
Consumes: subject-pipeline (parameterized scope: project_path, pipeline, node_hint, real_data_corpus)
Produces: execution-topology-report (artifact), structural-topology-report (artifact), content-topology-report (artifact), coverage-matrix (artifact)
