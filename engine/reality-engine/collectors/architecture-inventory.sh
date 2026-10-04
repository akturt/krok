#!/bin/bash
# engine/reality-engine/collectors/architecture-inventory.sh
#
# Real architecture inventory of a project (read-only investigation).
# Detects stack via the Core SDK (detect_all) and inventories the
# actual directory tree + file types.
#
# Usage:
#   bash engine/reality-engine/collectors/architecture-inventory.sh [project-root]
#
# Output: architecture-inventory.json (stdout)

set -eu

PROJECT_ROOT="${1:-.}"
[ -d "$PROJECT_ROOT" ] || { echo "ERROR: project root '$PROJECT_ROOT' not found" >&2; exit 1; }
PROJECT_ROOT="$(cd "$PROJECT_ROOT" && pwd)"

# --- Core SDK (stack detection + expected structure) ---
CONTROL_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
if [ -f "${CONTROL_ROOT}/core/lib/api.sh" ]; then
  # shellcheck disable=SC1090
  source "${CONTROL_ROOT}/core/lib/api.sh"
fi

TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# --- stack detection ---
BACKEND="" DATABASE="" INFRASTRUCTURE="" PROJECT_NAME=""
if declare -f detect_all >/dev/null 2>&1; then
  detect_all "$PROJECT_ROOT"
fi

# --- directory inventory (top 2 levels, exclude VCS, deps and the Underboss mount) ---
EXCLUDE_GLOB=("${PROJECT_ROOT}/.git" "${PROJECT_ROOT}/node_modules" "${PROJECT_ROOT}/.control")
dirs_json=""
first=1
while IFS= read -r dir; do
  rel="${dir#$PROJECT_ROOT}"
  [ -z "$rel" ] && rel="/"
  cnt=$(find "$dir" -maxdepth 1 -type f 2>/dev/null | wc -l | tr -d ' ')
  entry=$(printf '    {"path": "%s", "files": %s}' "$rel" "$cnt")
  if [ "$first" -eq 1 ]; then first=0; else entry=",$entry"; fi
  dirs_json="$dirs_json$entry"
done < <(find "$PROJECT_ROOT" -maxdepth 2 -type d \
            -not -path "*/.git/*" -not -path "*/node_modules/*" -not -path "*/.control/*" | sort)

# --- file extensions ---
declare -A ext_count
while IFS= read -r f; do
  base="$(basename "$f")"
  if [[ "$base" == *.* ]]; then ext="${base##*.}"; else ext="(none)"; fi
  ext_count["$ext"]=$(( ${ext_count["$ext"]:-0} + 1 ))
done < <(find "$PROJECT_ROOT" -type f \
            -not -path "*/.git/*" -not -path "*/node_modules/*" -not -path "*/.control/*")
ext_json=""
first=1
for e in $(printf '%s\n' "${!ext_count[@]}" | sort); do
  entry=$(printf '      "%s": %s' "$e" "${ext_count[$e]}")
  if [ "$first" -eq 1 ]; then first=0; else entry=",$entry"; fi
  ext_json="$ext_json$entry"
done

total=$(find "$PROJECT_ROOT" -type f \
          -not -path "*/.git/*" -not -path "*/node_modules/*" -not -path "*/.control/*" \
          | wc -l | tr -d ' ')

cat <<EOF
{
  "timestamp": "$TS",
  "project_root": "$PROJECT_ROOT",
  "project_name": "${PROJECT_NAME:-$(basename "$PROJECT_ROOT")}",
  "stack": {
    "backend": "${BACKEND:-unknown}",
    "database": "${DATABASE:-unknown}",
    "infrastructure": "${INFRASTRUCTURE:-unknown}"
  },
  "directories": [
$dirs_json
  ],
  "files_by_extension": {
$ext_json
  },
  "total_files": $total,
  "status": "ok"
}
EOF
