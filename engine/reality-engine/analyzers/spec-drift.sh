#!/bin/bash
# engine/reality-engine/analyzers/spec-drift.sh
#
# Real spec drift: checks that each spec's frontmatter status matches the
# directory it lives in (docs/specs/<status>/), and flags documentation that
# still references a superseded spec.
#
# Usage:
#   bash engine/reality-engine/analyzers/spec-drift.sh [project-root] [architecture-inventory.json]
#
# Output: spec-drift.json (stdout)

set -eu

PROJECT_ROOT="${1:-.}"
[ -d "$PROJECT_ROOT" ] || { echo "ERROR: project root '$PROJECT_ROOT' not found" >&2; exit 1; }
PROJECT_ROOT="$(cd "$PROJECT_ROOT" && pwd)"

# shellcheck disable=SC1090
source "$(dirname "${BASH_SOURCE[0]}")/../lib/frontmatter.sh"

TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# --- known specs: id -> status, and their directory ---
declare -A spec_status=()
declare -A spec_dir=()
while IFS= read -r f; do
  sdir=$(basename "$(dirname "$f")")
  sid=$(get_field "$f" "id")
  sstat=$(get_field "$f" "status")
  [ -n "$sid" ] && spec_status["$sid"]="$sstat"
  [ -n "$sid" ] && spec_dir["$sid"]="$sdir"
done < <(find "$PROJECT_ROOT/docs/specs" -type f \( -name "*.md" -o -name "*.yaml" \) 2>/dev/null | sort)

drift_json=""
first=1
add_drift() {
  if [ "$first" -eq 1 ]; then first=0; else drift_json="$drift_json,"; fi
  drift_json="$drift_json$1"
}

# --- status vs directory mismatch ---
for sid in "${!spec_status[@]}"; do
  st="${spec_status[$sid]}"
  dr="${spec_dir[$sid]}"
  # the directory `drafts` holds status `draft`; every other directory equals its status
  [ "$dr" = "drafts" ] && dr="draft"
  if [ "$st" != "$dr" ]; then
    add_drift "$(printf '    {"type": "status_dir_mismatch", "spec": "%s", "dir": "%s", "status": "%s"}' "$sid" "$dr" "$st")"
  fi
done

# --- docs referencing a superseded spec ---
while IFS= read -r f; do
  rel="${f#$PROJECT_ROOT/}"
  for ref in $(collect_field "$f" "depends_on"); do
    [ -z "${spec_status[$ref]:-}" ] && continue
    if [ "${spec_status[$ref]}" = "superseded" ]; then
      add_drift "$(printf '    {"type": "references_superseded_spec", "from": "%s", "spec": "%s"}' "$rel" "$ref")"
    fi
  done
done < <(find "$PROJECT_ROOT" -type f -name "*.md" \
            -not -path "*/.git/*" -not -path "*/node_modules/*" -not -path "*/.control/*" | sort)

cat <<EOF
{
  "timestamp": "$TS",
  "project_root": "$PROJECT_ROOT",
  "spec_count": ${#spec_status[@]},
  "spec_drift_items": [
$drift_json
  ],
  "status": "ok"
}
EOF
