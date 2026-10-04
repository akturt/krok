---
schema: 1
id: adr-003-runtime-architecture-v2
type: adr
status: superseded
date: 2026-07-09
owners: [underboss-team]

entity_refs: [agentic-layer, adr-002-runtime-v1.2-operating-platform]
tags: [adr, runtime, v1.6, runtime-api, registry, bootstrap-engine, architecture]
depends_on: [adr-002-runtime-v1.2-operating-platform]
priority: P0
---

# ADR-003: Runtime Architecture v2 — Core, Module, API, Registry SSOT, Bootstrap Engine

## Status

Accepted (2026-07-09)

## Context

ADR-002 ("From Templates to Operating Platform") introduced the Registry as SSOT, the
state machine, the contract split, and the Reality Engine as a standalone module. v1.5 then
decomposed the monolith `bootstrap.sh` (637 lines) into `bootstrap/lib/` and
`bootstrap/generators/`, and split Runtime into **Runtime Core** and **Documentation Module**.
The decomposition worked, but three structural gaps remained that made the Runtime hard to
extend and reason about:

1. **Bootstrap was still the smartest thing in the repo.** `bootstrap.sh`, `install.sh`, and
   `validate-runtime.sh` each independently re-sourced `bootstrap/lib/*` and re-implemented the
   same detection/parsing. There was no stable surface for other tools to build on.
2. **Runtime was a loose bag of scripts, not a system.** Logic lived under
   `bootstrap/lib/` (`registry.sh`, `detect-state.sh`, `detect-stack.sh`, `verify.sh`). Nothing
   stopped tools from grepping the registry with `sed`/`head`, and there was no SDK contract for
   a Portal / CLI / TUI / test harness / plugin to depend on.
3. **Versions and paths were still coupled.** `bootstrap.ps1` re-implemented stub-writing
   business logic; `install.sh` parsed the registry with text tools; a single version number was
   expected to describe Runtime, Bootstrap, and the schema at once.

The question this ADR answers: *why do `runtime/lib/`, `documentation/`, and
`engine/reality-engine/` exist, and what is the contract between them?* Six months from now the
layout must be explicable without archaeology.

## Decision

Adopt five architectural rules that finalize the Runtime v2 topology.

### 1. Two-layer topology: Runtime Core + Documentation Module

Runtime ships as a Git Submodule mounted at `docs/.runtime/underboss`. It has two layers:

- **Runtime Core** (infrastructure): `runtime/`, `bootstrap/`, `engine/`
  — registry, state machine, contracts, reality engine, bootstrap.
- **Documentation Module** (authored content): `documentation/`, `knowledge/`, `agents/`,
  `sops/`, `playbook/`.

The consumer repository root stays clean: only `docs/` is added. This is the D-BR decision from
v1.1, now finalized as the only supported layout.

### 2. Runtime API as an internal SDK (`runtime/lib/`)

All Runtime logic moves into `runtime/lib/` as a cohesive internal SDK, one concern per module:

- `yaml.sh` — minimal YAML reader (no external deps).
- `registry.sh` — SSOT reader; the only way to read structure and versions.
- `state.sh` — install-state + version detection against the state machine.
- `detectors.sh` — detector plugin runner (iterates `bootstrap/detectors/`).
- `generators.sh` — generator plugin runner (iterates `bootstrap/generators/`).
- `components.sh` — component verification.
- `api.sh` — **unified entrypoint** that sources all modules and derives `RUNTIME_ROOT`.

Every tool (`bootstrap`, `install`, `validate-runtime`) does exactly one thing:
`source "${RUNTIME_ROOT}/runtime/lib/api.sh"`. This turns Runtime from "a set of shell scripts"
into "a system" with a stable surface, which is the prerequisite for Portal, CLI, TUI, tests,
and plugins.

### 3. Registry as SSOT — an API, not just data

`runtime/registry.yaml` is both the data source and the contract. It declares:

- `directories:` — every docs/ and .context/ path bootstrap creates.
- `generators:` / `detectors:` — plugin manifests consumed by `generators.sh` / `detectors.sh`.
- `entrypoints:` — `bootstrap`, `install` command locations.
- `runtime:` / `bootstrap:` / `schema:` / `contracts:` — independent version fields.

No tool hardcodes a path or greps the registry. The public functions
(`yaml_get`, `registry_version`, `registry_list_directories`, `registry_entrypoint`,
`registry_exists`) are the only supported read path.

### 4. Bootstrap Engine as a thin orchestrator

`bootstrap.sh` (~102 lines) is a pure coordinator:

```
source api.sh
  → detect_state          (fresh | partial | legacy | broken)
  → detect_all            (run detectors from registry)
  → run_all_generators    (run generators from registry)
  → components_verify
```

In **NORMAL** mode (registry present) it contains zero business logic and zero hardcoded paths —
all structure comes from `registry_list_directories`. In **DEGRADED** mode (`registry.yaml`
absent) it falls back to a built-in layout and prints an explicit warning, so bootstrap never
silently produces a wrong tree.

`bootstrap.ps1` is intentionally kept a **dumb adapter**: it reads the registry and mirrors the
structure, but it is NOT rewritten to call the generators. PowerShell is an adapter, not the
Runtime; keeping it simple is preferred over premature abstraction.

`install.sh` is rewritten to use the Runtime API (`registry_version`, `registry_entrypoint`)
instead of `grep`/`sed`/`head`.

### 5. Decoupled versioning

Runtime, Bootstrap Engine, Registry Schema, and Contract Schema version independently:

- `runtime.version` = `1.6`
- `bootstrap.engine_version` = `2.0`
- `schema.version` = `1`
- `contracts.version` = `1`

Each can evolve without forcing the others, which makes migrations explicit and local.

## Consequences

### Positive

- All tools share one API surface — no drift between `bootstrap`, `install`, and `validate`.
- Adding a generator or detector is one file + one registry entry; the orchestrator is never
  edited.
- Runtime is now extensible: Portal / CLI / TUI / tests / plugins become feasible because there
  is a stable `api.sh` to depend on.
- `DEGRADED` mode makes bootstrap robust when the registry is missing.
- Versioning is decoupled; migrations are explicit and local.

### Negative

- More files; `api.sh` is a new indirection layer every tool must source.
- Runtime Core and Documentation Module are separate, so cross-references must use relative
  paths (e.g. `../../runtime/registry.yaml`).

### Neutral

- `bootstrap.ps1` remains a larger adapter by design — this is accepted, not a defect.
- Dynamic registry-driven plugin loading is deliberately deferred until real generators exist
  (e.g. MkDocs, Portal, OpenAPI, ADR generators).
- The Reality Engine described in ADR-002 is still implemented as stubs; promoting it to a real
  engine (architecture inventory → dependency graph → entity inventory → drift analyzer →
  reality report) is tracked separately as the next phase of work, not part of this ADR.

## References

- ADR-002: Runtime v1.2 — From Templates to Operating Platform (Registry SSOT, state machine,
  contract split, Reality Engine standalone).
- `runtime/registry.yaml` — the SSOT this ADR formalizes.
- `runtime/lib/api.sh` — the unified Runtime API entrypoint.
- `bootstrap/bootstrap.sh` — the thin orchestrator this ADR describes.
