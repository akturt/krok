#!/bin/bash
# core/lib/state.sh — Installation state detection
#
# Reads filesystem to determine state. Uses registry for version.
# Requires: core/lib/registry.sh

# detect_state → outputs "state version"
#   State: fresh | installed | partial | broken
#   Version: from registry, or "none" if no registry
detect_state() {
  local state="fresh"
  local version="none"

  if registry_exists; then
    state="installed"
    version=$(registry_version)

    # Verify core directories of the Documentation Module
    local control_dir
    control_dir=$(dirname "$(dirname "$CONTROL_REGISTRY")")
    for dir in bootstrap documentation agents knowledge sops; do
      if [ ! -d "$control_dir/$dir" ]; then
        state="partial"
        break
      fi
    done
  elif [ -d "$TARGET/docs/.control" ]; then
    # Mount exists but has no registry
    state="partial"
    version="none"
  fi

  echo "$state $version"
}

# state_message <state> <version> — user-facing message
state_message() {
  local state="$1" version="$2"
  case "$state" in
    broken)
      echo "  ⚠ Installation integrity compromised. Re-bootstrapping."
      ;;
    partial)
      echo "  ⚠ Some components missing. Re-bootstrapping."
      ;;
    installed)
      echo "  → v${version} already installed. Running idempotent re-bootstrap."
      ;;
  esac
}
