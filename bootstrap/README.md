---
schema: 1
id: bootstrap-readme
type: guide
status: active
date: 2026-07-09
owners: [underboss-team]
entity_refs: [core, registry]
---

# Bootstrap — Underboss

## Overview

Bootstrap installs and configures the Underboss into a consumer project. As of v1.6, the bootstrap is a thin orchestrator that drives the **Core SDK** (`core/lib/`) — it contains no business logic and no hardcoded paths. All structure and behaviour is read from `core/registry.yaml`.

## Architecture (v1.6)

```
bootstrap/
  bootstrap.sh          ← orchestrator (~100 lines): sources api.sh, runs generators/detectors
  bootstrap.ps1         ← Windows PowerShell frontend (reads registry.yaml, same structure)
  install.sh            ← one-liner installer (curl | bash); uses Core SDK, no grep
  DEPLOY-PROMPT.md      ← agent deploy prompt
  generators/           ← standalone generator scripts (one file per artifact)
    architecture-readme.sh
    boundaries.sh
    project-yml.sh
    claude-md.sh
    ci-workflow.sh
  detectors/            ← stack detector plugins (one file per stack)
    node.sh, python.sh, go.sh, rust.sh, php.sh, docker.sh

core/
  lib/                  ← Core SDK (internal SDK)
    api.sh              ← unified entrypoint: sources all modules below
    yaml.sh             ← minimal YAML reader
    registry.sh         ← SSOT reader (all paths from registry.yaml)
    state.sh            ← install-state + version detection
    detectors.sh        ← detector plugin runner
    generators.sh       ← generator plugin runner
    components.sh        ← component verification
```

Any tool inside Underboss (`bootstrap`, `install`, `validate-integrity`, future `migrate`) sources `core/lib/api.sh` and therefore works identically:

```
bootstrap      → api.sh → registry → components
install        → api.sh → registry → bootstrap
validators     → api.sh → registry
```

## How It Works

1. **Parse arguments** — `--target <path>` (defaults to the Underboss root)
2. **Source Core SDK** — `source core/lib/api.sh`
3. **Detect state** — `detect_state` reads filesystem → fresh/installed/partial/broken
4. **Require the Registry** — a missing `core/registry.yaml` is an error; there is no degraded mode
5. **Create docs/ + .context/** — directory lists come from `registry_list_directories` (registry `directories:` section)
6. **Detect stack** — `detect_all` iterates detectors from registry, merges results
7. **Run generators** — `run_all_generators` iterates generators from registry
8. **Verify** — `components_verify` checks expected components exist

All paths are read from `core/registry.yaml` — the orchestrator knows nothing about structure.

## Versions

Versions are decoupled (per Core SDK design):

- **Underboss** — `control.version` in registry.yaml
- **Bootstrap Engine** — `bootstrap.engine_version` in registry.yaml
- **Registry Schema** / **Contract Schema** — `schema.version` / `contracts.version`

`bootstrap.sh` prints both Underboss and Bootstrap Engine versions in its header.

## Adding a New Stack Detector

Create `bootstrap/detectors/<name>.sh`:

```bash
#!/bin/bash
detect() {
  local backend="" database="" infrastructure=""
  [ -f "$TARGET/your-lockfile" ] && backend="YourStack"
  echo "$backend|$database|$infrastructure"
}
```

Register in `core/registry.yaml` under `detectors:`.

## Adding a New Generator

Create `bootstrap/generators/<name>.sh` with a `generate()` function (signature `generate <target_dir> <registry>`). Register in `core/registry.yaml` under `generators:`. The orchestrator auto-runs it via `run_all_generators`.

## Related

- [Registry](../core/registry.yaml) — single source of truth
- [Installation State Machine](../core/installation-state-machine.yaml) — installation states
- [Installation Contract](../core/contracts/product/installation.yaml) — what bootstrap does
