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

  registry_exists || { echo "detect_all: registry not found" >&2; return 1; }
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

  PROJECT_NAME="${PROJECT_NAME:-$(basename "$target_dir")}"
}
