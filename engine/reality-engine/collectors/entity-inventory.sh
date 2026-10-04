#!/bin/bash
# engine/reality-engine/collectors/entity-inventory.sh
#
# Real entity inventory: collects domain entities referenced across the
# documentation (entity_refs / depends_on) and resolves them to artifacts.
#
# Usage:
#   bash engine/reality-engine/collectors/entity-inventory.sh [project-root]
#
# Output: entity-inventory.json (stdout)

set -eu

PROJECT_ROOT="${1:-.}"
[ -d "$PROJECT_ROOT" ] || { echo "ERROR: project root '$PROJECT_ROOT' not found" >&2; exit 1; }
PROJECT_ROOT="$(cd "$PROJECT_ROOT" && pwd)"

# shellcheck disable=SC1090
source "$(dirname "${BASH_SOURCE[0]}")/../lib/frontmatter.sh"

TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# --- gather all referenced entities ---
declare -A ref_count=()
while IFS= read -r f; do
  for ref in $(collect_field "$f" "entity_refs"; collect_field "$f" "depends_on"); do
    [ -z "$ref" ] && continue
    ref_count["$ref"]=$(( ${ref_count["$ref"]:-0} + 1 ))
  done
done < <(find "$PROJECT_ROOT" -type f -name "*.md" \
            -not -path "*/.git/*" -not -path "*/node_modules/*" -not -path "*/.control/*" | sort)

# --- resolve each entity to a real artifact ---
entities_json=""
first=1
unresolved=0
for e in $(printf '%s\n' "${!ref_count[@]}" | sort); do
  hit=""
  # 1) direct file match
  hit=$(find "$PROJECT_ROOT" -type f \( -name "${e}.md" -o -name "${e}.yaml" -o -name "${e}.yml" \) 2>/dev/null | head -1)
  # 2) match by frontmatter id (e.g. ADRs, specs)
  if [ -z "$hit" ]; then
    hit=$(grep -rl "^id:[[:space:]]*${e}\\([[:space:]]\\|\\$\\)" "$PROJECT_ROOT/docs" 2>/dev/null | head -1)
  fi
  kind="unknown"
  if [ -n "$hit" ]; then
    case "$hit" in
      *adr*)            kind="adr" ;;
      *specs*)          kind="spec" ;;
      *architecture*|*concept*) kind="concept" ;;
      *)                kind="doc" ;;
    esac
  else
    unresolved=$((unresolved + 1))
  fi
  entry=$(printf '    {"id": "%s", "references": %s, "resolved": %s, "kind": "%s"}' \
           "$e" "${ref_count[$e]}" "$([ -n "$hit" ] && echo true || echo false)" "$kind")
  if [ "$first" -eq 1 ]; then first=0; else entry=",$entry"; fi
  entities_json="$entities_json$entry"
done

cat <<EOF
{
  "timestamp": "$TS",
  "project_root": "$PROJECT_ROOT",
  "entity_count": ${#ref_count[@]},
  "unresolved_count": $unresolved,
  "entities": [
$entities_json
  ],
  "status": "ok"
}
EOF
