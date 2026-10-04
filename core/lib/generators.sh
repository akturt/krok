#!/bin/bash
# core/lib/generators.sh — Generator plugin API
#
# Contract: each generator is a .sh file with generate() function.
# generate() must accept exactly 2 arguments:
#   $1 = TARGET (project root directory)
#   $2 = REGISTRY (path to registry.yaml)
#
# generate() should:
#   - Create output directories as needed
#   - Skip if output already exists (idempotent)
#   - Print "  → <path> created." on success
#   - Print "  → <path> already exists, skipping." if skipped
#   - Return 0 on success
#
# The generator is sourced in a subshell — cannot modify caller variables.

run_generator() {
  local target_dir="$1" generator_path="$2"
  [ -f "$generator_path" ] || return 1

  (
    source "$generator_path"
    generate "$target_dir" "$CONTROL_REGISTRY"
  )
}

# run_all_generators <target_dir> — run all registered generators in order
run_all_generators() {
  local target_dir="$1"

  if registry_exists; then
    while IFS= read -r name; do
      [ -z "$name" ] && continue
      local gpath
      gpath=$(registry_get_generator_path "$name")
      [ -z "$gpath" ] && continue

      local full_path="${CONTROL_ROOT}/${gpath}"
      [ -f "$full_path" ] || { echo "  ⚠ Generator '$name' not found at $gpath"; continue; }

      run_generator "$target_dir" "$full_path" || echo "  ⚠ Generator '$name' failed"
    done < <(registry_list_generators)
  fi
}
