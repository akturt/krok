#!/bin/bash
# bootstrap/generators/agent-entry.sh — Generate .context/agent-entry.md
#
# API: generate TARGET REGISTRY
#
# Writes the agent entry protocol on first run. Idempotent: an existing non-empty
# file is never touched (the bootstrap creates it empty before the generators run).

generate() {
  local target_dir="$1" registry="$2"

  mkdir -p "${target_dir}/.context"

  local out="${target_dir}/.context/agent-entry.md"
  if [ -s "$out" ]; then
    echo "  → .context/agent-entry.md already exists, skipping."
    return
  fi

  cat > "$out" <<'ENTRY'
# Agent Entry Point

This project uses **Krok** (docs/.control).

## Your first action

```bash
bash docs/.control/core/bin/krok status
```

Then act on open Escalations and stale executions it lists. To install or update Krok itself, follow `docs/.control/INSTALL.md`.

## Where to look

| Area | Purpose |
|------|---------|
| `docs/` | Project documentation (authoritative output) |
| `docs/.control/` | Krok git submodule: do not edit directly |
| `.context/` | Project identity, boundaries, execution state |
| `CLAUDE.md` | Rules for agents in this repository |

## Boundaries

Read `.context/boundaries.yml` before writing anything. Paths are relative to the repository root.

## Do not

- Edit files inside `docs/.control/` by hand: update through the submodule.
- Commit secrets (`.env`, `*.key`, `*.pem`, `secrets/`).
- Write to paths listed under `pristine` in `.context/boundaries.yml`.
ENTRY
  echo "  → .context/agent-entry.md created."
}
