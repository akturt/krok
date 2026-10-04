#!/bin/bash
set -euo pipefail
trap 'echo "Error on line $LINENO" >&2' ERR

# bootstrap.sh — Underboss bootstrap orchestrator
# Uses Core SDK (core/lib/) for all identity fields — no hardcoded names.
# v3.0.0

CONTROL_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target) TARGET="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done
TARGET="${TARGET:-$CONTROL_ROOT}"

source "${CONTROL_ROOT}/core/lib/api.sh"

if ! registry_exists; then
  echo "ERROR: registry not found: ${CONTROL_ROOT}/core/registry.yaml" >&2
  exit 1
fi

read -r STATE VERSION <<< "$(detect_state)"

CONTROL_NAME=$(registry_name)
CONTROL_VERSION=$(registry_version)
CONTROL_CODENAME=$(registry_codename)
BOOTSTRAP_VERSION=$(registry_bootstrap_version)

BANNER="$CONTROL_NAME"
[ -n "$CONTROL_CODENAME" ] && BANNER="$BANNER ($CONTROL_CODENAME)"
BANNER="$BANNER $CONTROL_VERSION"

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║ ${BANNER}║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "Target: ${TARGET}"
echo "Version: ${VERSION:-$CONTROL_VERSION}"
echo "Bootstrap Engine: $BOOTSTRAP_VERSION"
echo ""

state_message "$STATE" "$VERSION"

echo " → Creating directories from registry..."
while IFS= read -r dir; do
  [ -z "$dir" ] && continue
  mkdir -p "$TARGET/docs/$dir"
done < <(registry_list_directories "docs")

while IFS= read -r file; do
  [ -z "$file" ] && continue
  mkdir -p "$TARGET/.context"
  [ -f "$TARGET/.context/$file" ] || touch "$TARGET/.context/$file"
done < <(registry_list_directories "context")

detect_all "$TARGET"

echo ""
echo "=== Generating from registry ==="
run_all_generators "$TARGET"

echo ""
echo "=== Registry ==="
echo " Agents: $(registry_list_agents | wc -l | tr -d ' ') roles"
echo " Contracts: $(registry_list_contracts product | wc -l | tr -d ' ') product + $(registry_list_contracts consumer | wc -l | tr -d ' ') consumer"
echo " Generators: $(registry_list_generators | wc -l | tr -d ' ')"
echo " Detectors: $(registry_list_detectors | wc -l | tr -d ' ')"
echo " Schemas: documentation/schemas/frontmatter.schema.json"

echo ""
echo "=== Checking components ==="
components_verify || true
