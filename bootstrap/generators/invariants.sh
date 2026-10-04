#!/bin/bash
# bootstrap/generators/invariants.sh — Auto-generate docs/architecture/invariants.md
#
# API: generate TARGET REGISTRY
#
# Copies the invariants template into the consumer's architecture catalog on
# first run. Idempotent: skips if the file already exists.

generate() {
  local target_dir="$1" registry="$2"

  mkdir -p "${target_dir}/docs/architecture"

  local out="${target_dir}/docs/architecture/invariants.md"
  if [ -f "$out" ]; then
    echo "  → docs/architecture/invariants.md already exists, skipping."
    return
  fi

  local template="${CONTROL_ROOT}/documentation/templates/invariants.md"
  if [ -f "$template" ]; then
    cp "$template" "$out"
    echo "  → docs/architecture/invariants.md created."
  else
    echo "  ⚠ invariants template not found at $template"
  fi
}
