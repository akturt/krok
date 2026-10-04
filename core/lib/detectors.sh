#!/bin/bash
# core/lib/detectors.sh — Detector plugin API
#
# Contract: each detector is a .sh file with detect() function.
# detect() must output exactly: "backend|database|infrastructure"
# Any field may be empty: "|db|infra" or "backend||infra"
# Exit code 0 = success (even if nothing detected)
# The detector is sourced in a subshell — cannot modify caller variables directly.
#
# Usage:
#   result=$(run_detector <target_dir> <detector_path>)
#   IFS='|' read -r backend database infrastructure <<< "$result"

run_detector() {
  local target_dir="$1" detector_path="$2"
  [ -f "$detector_path" ] || return 1

  # Run in subshell with TARGET set
  (
    TARGET="$target_dir"
    source "$detector_path"
    detect
  )
}

# detect_all <target_dir> — run all registered detectors, merge results
# Sets: BACKEND, DATABASE, INFRASTRUCTURE, PROJECT_NAME
detect_all() {
  local target_dir="$1"
  BACKEND="" DATABASE="" INFRASTRUCTURE="" PROJECT_NAME=""

  if registry_exists; then
    while IFS= read -r name; do
      [ -z "$name" ] && continue
      local dpath
      dpath=$(registry_get_detector_path "$name")
      [ -z "$dpath" ] && continue

      local full_path="${CONTROL_ROOT}/${dpath}"
      [ -f "$full_path" ] || continue

      local result
      result=$(run_detector "$target_dir" "$full_path") || continue

      local b d i
      IFS='|' read -r b d i <<< "$result"

      [ -n "$b" ] && BACKEND="$b"
      [ -n "$d" ] && DATABASE="$d"
      [ -n "$i" ] && INFRASTRUCTURE="$i"
    done < <(registry_list_detectors)
  fi

  # Fallback: simple lockfile scan
  if [ -z "$BACKEND" ]; then
    if [ -f "$target_dir/package.json" ]; then
      BACKEND="Node.js"
      PROJECT_NAME=$(grep -o '"name"[[:space:]]*:[[:space:]]*"[^"]*"' "$target_dir/package.json" 2>/dev/null | head -1 | sed 's/.*: *"//; s/".*//')
    elif [ -f "$target_dir/pyproject.toml" ] || [ -f "$target_dir/requirements.txt" ]; then
      BACKEND="Python"
    elif [ -f "$target_dir/go.mod" ]; then
      BACKEND="Go"
    elif [ -f "$target_dir/Cargo.toml" ]; then
      BACKEND="Rust"
    elif [ -f "$target_dir/composer.json" ]; then
      BACKEND="PHP"
    fi
  fi

  PROJECT_NAME="${PROJECT_NAME:-$(basename "$target_dir")}"
}
