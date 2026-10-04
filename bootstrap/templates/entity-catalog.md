---
schema: 1
id: entity-catalog
type: architecture
status: active
date: 2026-07-09
owners: [TODO-team-name]

entity_refs: []
tags: [entity-catalog, domain-model, architecture]
priority: P1
---

# Entity Catalog

> **Consumer must complete this catalog.** Underboss cannot know your domain entities.
> Bootstrap auto-generates sections from project structure. Fill in the details.

## Core Entities

<!-- Domain objects: User, Order, Product, etc. -->
<!-- Format: - **Name**: description (code: path, docs: path) -->

## Services

<!-- Application services, workers, daemons -->
<!-- Format: - **ServiceName**: description (code: path) -->

## External Systems

<!-- Third-party APIs, databases, message queues -->
<!-- Format: - **SystemName**: description (integration: path) -->

## Data

<!-- Data models, schemas, migrations -->
<!-- Format: - **SchemaName**: description (location: path) -->

## Infrastructure Components

<!-- Internal infrastructure: configs, deploy scripts, CI -->
<!-- Format: - **ComponentName**: description (location: path) -->

## Entity Relationships

<!-- Format: - EntityA RELATIONSHIP EntityB (cardinality) -->

## Invariants

<!-- Format: - INV-1: invariant description -->

---

**Status:** sections pre-filled — add your domain entities before using `entity_refs` in specs/audits.
