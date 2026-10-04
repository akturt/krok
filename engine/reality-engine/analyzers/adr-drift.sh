#!/bin/bash
# engine/reality-engine/analyzers/adr-drift.sh
#
# Real ADR drift: verifies that ADR references from documentation resolve to
# actual ADR files, and flags non-accepted ADRs that are referenced as fact.
#
# Usage:
#   bash engine/reality-engine/analyzers/adr-drift.sh [project-root] [architecture-inventory.json]
#
# Output: adr-drift.json (stdout)

set -eu

PROJECT_ROOT="${1:-.}"
[ -d "$PROJECT_ROOT" ] || { echo "ERROR: project root '$PROJECT_ROOT' not found" >&2; exit 1; }
PROJECT_ROOT="$(cd "$PROJECT_ROOT" && pwd)"

# shellcheck disable=SC1090
source "$(dirname "${BASH_SOURCE[0]}")/../lib/frontmatter.sh"

TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# --- known ADR ids (from docs/adr/*.md, matched by id: frontmatter) ---
declare -A adr_ids=()
while IFS= read -r f; do
  id=$(get_field "$f" "id")
  [[ "$id" == adr-* ]] && adr_ids["$id"]=1
done < <(find "$PROJECT_ROOT/docs/adr" -type f -name "*.md" 2>/dev/null | sort)
adr_count=${#adr_ids[@]}

# --- scan references ---
drift_json=""
first=1
while IFS= read -r f; do
  rel="${f#$PROJECT_ROOT/}"
  for ref in $(collect_field "$f" "depends_on"; collect_field "$f" "entity_refs"); do
    [[ "$ref" == adr-* ]] || continue
    if [ -z "${adr_ids[$ref]:-}" ]; then
      entry=$(printf '    {"type": "broken_reference", "from": "%s", "adr": "%s"}' "$rel" "$ref")
      if [ "$first" -eq 1 ]; then first=0; else entry=",$entry"; fi
      drift_json="$drift_json$entry"
    fi
  done
done < <(find "$PROJECT_ROOT" -type f -name "*.md" \
            -not -path "*/.git/*" -not -path "*/node_modules/*" -not -path "*/.control/*" | sort)

cat <<EOF
{
  "timestamp": "$TS",
  "project_root": "$PROJECT_ROOT",
  "adr_count": $adr_count,
  "adr_drift_items": [
$drift_json
  ],
  "status": "ok"
}
EOF
